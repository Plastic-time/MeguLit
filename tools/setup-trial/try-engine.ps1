# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit setup TRIAL engine: runs the real multi-source segmented downloader (MeguFetch, taken verbatim from setup\setup-runtime.ps1)
# and the real unpack steps, and writes its state to a JSON file for the trial UI. It changes no download/install logic: the only
# addition is a read-only Snap() method that is spliced into the class text in memory, to expose per-segment progress.
# It never touches a normal MeguLit install: the target must be a trial folder (try-server.cjs refuses anything else).
param(
  [Parameter(Mandatory=$true)][string]$Root,        # the folder that holds setup\runtime.json and setup\setup-runtime.ps1
  [Parameter(Mandatory=$true)][string]$Target,      # trial install folder
  [Parameter(Mandatory=$true)][string]$State,       # state json written here
  [Parameter(Mandatory=$true)][string]$Cmd,         # command json read from here (confirm / cancel)
  [string]$Proxy = '',                              # http://127.0.0.1:port1,port2,... throttle proxy bases, '' = direct
  [string]$ManifestPath = '',
  [switch]$WaitConfirm                              # trial default: start downloading only after Install was pressed
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$script = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'setup\setup-runtime.ps1')
if (-not $ManifestPath) { $ManifestPath = Join-Path $Root 'setup\runtime.json' }
$manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath | ConvertFrom-Json
$packs = $manifest.packs
$inChina = ([TimeZoneInfo]::Local.Id -eq 'China Standard Time') -or ((Get-Culture).Name -eq 'zh-CN')
$names = @{ base = 'base'; reading = 'reading'; voice = 'voice' }
# the real source ranking and the real engine, extracted from the shipped script
$m0 = $script.IndexOf('function Mirror-List'); $m1 = $script.IndexOf('$fetchSource = @''')
Invoke-Expression $script.Substring($m0, $m1 - $m0)
$e1 = $script.IndexOf("`n'@", $m1) + 3
$engineText = $script.Substring($m1, $e1 - $m1)
Invoke-Expression $engineText
$snap = @'
  public int SegTotal { get { lock (gate) { return segCount; } } }
  public void Snap(byte[] st, float[] fr) {
    lock (gate) { if (done == null) return;
      for (int i = 0; i < segCount && i < st.Length; i++) { st[i] = done[i] ? (byte)2 : (byte)0; fr[i] = done[i] ? 1f : 0f; }
      foreach (MeguConn c in conns) { if (c.IsDup || c.Lost || c.Len <= 0) continue; int i = c.Seg; if (i < 0 || i >= st.Length || done[i]) continue; st[i] = 1; fr[i] = Math.Min(1f, fr[i] + (float)c.Got / (float)SegmentSize); }
    }
  }
'@
$fetchSource = $fetchSource.Replace('  public string StatePath {', $snap + '  public string StatePath {')
if (-not ('MeguFetch' -as [type])) { Add-Type -TypeDefinition $fetchSource }
$h = Source-Hints $manifest.mirrors; [MeguFetch]::TrustedHosts = $h.trust; [MeguFetch]::HostLimits = $h.limits

$ids = @('app','base','reading','voice') | Where-Object { $packs.$_ }
$segSize = 4MB
$segCounts = @{}; $N = 0; foreach ($id in $ids) { $segCounts[$id] = [int][math]::Ceiling([long]$packs.$id.size / $segSize); $N += $segCounts[$id] }
$total = 0L; foreach ($id in $ids) { $total += [long]$packs.$id.size }
$st = New-Object 'byte[]' $N; $fr = New-Object 'float[]' $N
$stage = Join-Path $Target '.megulit-download'; New-Item -ItemType Directory -Force $stage | Out-Null
$logPath = Join-Path (Split-Path $State) 'setup-download.log'
$script:startedAt = Get-Date
function Write-State([string]$phase, $extra) {
  $o = [ordered]@{ phase = $phase; n = $N; total = $total; time = (Get-Date).ToString('o'); target = $Target }
  $o.st = ($st -join ''); $o.fr = @($fr | ForEach-Object { [int][math]::Round($_ * 100) })
  if ($extra) { foreach ($k in $extra.Keys) { $o[$k] = $extra[$k] } }
  $tmp = $State + '.tmp'; [IO.File]::WriteAllText($tmp, (ConvertTo-Json -Compress -Depth 4 $o), (New-Object Text.UTF8Encoding $false)); Move-Item -Force $tmp $State
}
function Read-Cmd { if (Test-Path $Cmd) { try { $c = Get-Content -Raw -Encoding UTF8 $Cmd | ConvertFrom-Json; Remove-Item $Cmd -Force; return $c } catch { } } $null }
function Part($id) { Join-Path $stage ("runtime-$id.setup.part") }
function Ok-Part($id) { $p = Part $id; try { (Test-Path ($p + '.ok')) -and (Test-Path $p) -and (Get-Item $p).Length -eq [long]$packs.$id.size -and (Get-Content -Raw ($p + '.ok')).Trim() -eq ([string]$packs.$id.sha256).ToUpperInvariant() } catch { $false } }
function Via-Proxy($urls) {
  if (-not $Proxy) { return @($urls) }
  $bases = @($Proxy.Split(',') | Where-Object { $_ }); $out = @(); $i = 0
  foreach ($u in $urls) { $b = $bases[$i % $bases.Count]; $host0 = ([Uri]$u).Host; $n = $host0 -replace '^(www\.)', ''; $enc = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($u)).Replace('+','-').Replace('/','_').TrimEnd('='); $out += ("$b/t?n=$n&u=$enc"); $i++ }
  $out
}
function Source-Name($f) {
  $best = $null; foreach ($s in $f.Sources) { if ($s.Active -gt 0 -or $s.Recent -gt 0) { if (-not $best -or $s.Recent -gt $best.Recent) { $best = $s } } }
  $busy = @($f.Sources | Where-Object { $_.Active -gt 0 }).Count
  $nm = ''; if ($best) { $m = [regex]::Match($best.Url, '[?&]n=([^&]+)'); $nm = if ($m.Success) { $m.Groups[1].Value } else { $best.Host } }
  @{ name = $nm; count = $busy }
}
$confirmed = $false; $installTarget = $Target; $desktop = $true; $menu = $true; $offset = 0; $got0 = 0L
try {
  Write-State 'probe' @{ got = 0; speed = 0; pack = $ids[0]; src = ''; srcN = 0 }
  if ($WaitConfirm) { while (-not $confirmed) { $c = Read-Cmd; if ($c) { if ($c.confirm) { $confirmed = $true; $installTarget = $c.target; $desktop = [bool]$c.desktop; $menu = [bool]$c.menu } if ($c.cancel) { Write-State 'cancelled' @{}; exit 0 } } Write-State 'idle' @{ got = 0; speed = 0; pack = $ids[0]; src = ''; srcN = 0 }; Start-Sleep -Milliseconds 150 } }
  foreach ($id in $ids) {
    $len = $segCounts[$id]
    if (Ok-Part $id) { for ($i = 0; $i -lt $len; $i++) { $st[$offset + $i] = 2; $fr[$offset + $i] = 1 }; $got0 += [long]$packs.$id.size; $offset += $len; continue }
    $f = New-Object MeguFetch
    $cands = @(Candidates $id); $f.Urls = [string[]]@(Via-Proxy $cands); $f.Part = Part $id; $f.Size = [long]$packs.$id.size; $f.Sha = [string]$packs.$id.sha256
    $f.Start()
    while ($true) {
      $c = Read-Cmd; if ($c) { if ($c.confirm) { $confirmed = $true; $installTarget = $c.target; $desktop = [bool]$c.desktop; $menu = [bool]$c.menu } if ($c.cancel) { $f.Cancel(); Write-State 'cancelled' @{}; exit 0 } }
      $b = New-Object 'byte[]' $len; $x = New-Object 'float[]' $len; $f.Snap($b, $x); for ($i = 0; $i -lt $len; $i++) { $st[$offset + $i] = $b[$i]; $fr[$offset + $i] = $x[$i] }
      $sn = Source-Name $f; Write-State 'download' @{ got = ($got0 + $f.Received); speed = [long]$f.TotalSpeed; pack = $id; src = $sn.name; srcN = $sn.count; resumed = ($f.Resumed -gt 0); confirmed = $confirmed }
      $ph = [string]$f.Phase; if ($ph -eq 'done') { break } if ($ph -eq 'failed') { Add-Content -Encoding UTF8 $logPath ("== " + (Get-Date -Format s) + " $id failed`r`n" + $f.LogText()); throw ('download:' + $f.Error) }
      Start-Sleep -Milliseconds 150
    }
    Add-Content -Encoding UTF8 $logPath ("== " + (Get-Date -Format s) + " $id done`r`n" + $f.LogText())
    [IO.File]::WriteAllText(((Part $id) + '.ok'), ([string]$packs.$id.sha256).ToUpperInvariant())
    for ($i = 0; $i -lt $len; $i++) { $st[$offset + $i] = 2; $fr[$offset + $i] = 1 }
    $got0 += [long]$packs.$id.size; $offset += $len
  }
  for ($i = 0; $i -lt $N; $i++) { $st[$i] = 2; $fr[$i] = 1 }
  while (-not $confirmed) { $c = Read-Cmd; if ($c) { if ($c.confirm) { $confirmed = $true; $installTarget = $c.target; $desktop = [bool]$c.desktop; $menu = [bool]$c.menu } if ($c.cancel) { Write-State 'cancelled' @{}; exit 0 } } Write-State 'downloaded' @{ got = $total; speed = 0; pack = $ids[-1]; src = ''; srcN = 0; confirmed = $false }; Start-Sleep -Milliseconds 200 }
  # unpack: tar reads the staged pack in place and writes into the chosen folder, exactly like the real setup
  New-Item -ItemType Directory -Force $installTarget | Out-Null; Set-Content -Encoding ASCII (Join-Path $installTarget '.megulit-trial') 'trial install; safe to delete'; $runtimeDir = Join-Path $installTarget 'runtime'; New-Item -ItemType Directory -Force $runtimeDir | Out-Null
  $k = 0; foreach ($id in $ids) {
    Write-State 'unpack' @{ got = $total; speed = 0; pack = $id; unpack = ($k / $ids.Count); dir = $runtimeDir }
    $unpack = Join-Path $installTarget ('runtime-' + $id + '-1.unpack'); if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }; New-Item -ItemType Directory $unpack | Out-Null
    $tar = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', ('"' + (Part $id) + '"'), '-C', ('"' + $unpack + '"')) -WindowStyle Hidden -PassThru; $null = $tar.Handle
    while (-not $tar.HasExited) { Write-State 'unpack' @{ got = $total; speed = 0; pack = $id; unpack = (($k + 0.5) / $ids.Count); dir = $runtimeDir }; Start-Sleep -Milliseconds 200 }
    $tar.WaitForExit()
    if ($id -eq 'app') {
      # the published release zip: MeguLit\ folder with MeguLit.exe, core, web ... (no runtime, that comes from the three packs)
      $inner = Join-Path $unpack 'MeguLit'; if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $inner 'MeguLit.exe'))) { throw 'install:app unpack failed' }
      & "$env:SystemRoot\System32\robocopy.exe" $inner $installTarget /E /R:2 /W:1 /NP /NFL /NDL /NJH /NJS | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'install:app copy failed' }
      Remove-Item $unpack -Recurse -Force -ErrorAction SilentlyContinue; $k++; continue
    }
    if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $unpack 'runtime'))) { throw 'install:unpack failed' }
    Get-ChildItem (Join-Path $unpack 'runtime') | ForEach-Object { $dest = Join-Path $runtimeDir $_.Name; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $_.FullName $dest }
    Remove-Item $unpack -Recurse -Force -ErrorAction SilentlyContinue; $k++
  }
  # trial shortcuts live next to the trial folder, clearly marked, never on the real Desktop / Start menu
  if ($desktop -or $menu) { try { $sc = Join-Path (Split-Path $installTarget) '_trial-shortcuts'; New-Item -ItemType Directory -Force $sc | Out-Null; $w = New-Object -ComObject WScript.Shell; foreach ($nm in @($(if ($desktop) { 'Desktop' }), $(if ($menu) { 'StartMenu' })) | Where-Object { $_ }) { $l = $w.CreateShortcut((Join-Path $sc ("MeguLit (trial) - $nm.lnk"))); $l.TargetPath = $installTarget; $l.Description = 'MeguLit setup trial: nothing here is a real install'; $l.Save() } } catch { } }
  Get-ChildItem $stage -Filter 'runtime-*.setup.part*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue; Set-Content -Encoding ASCII (Join-Path $installTarget '.megulit-trial') 'trial install; safe to delete'
  Write-State 'done' @{ got = $total; speed = 0; pack = $ids[-1]; unpack = 1; dir = $runtimeDir }
} catch {
  $m = $_.Exception.Message; $kind = if ($m -like 'install:*') { 'install' } else { 'download' }
  Add-Content -Encoding UTF8 $logPath ("== " + (Get-Date -Format s) + " ERROR " + $_.ToString())
  Write-State 'failed' @{ kind = $kind; message = $m }
  exit 1
}
