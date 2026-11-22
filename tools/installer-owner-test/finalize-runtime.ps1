# SPDX-License-Identifier: GPL-3.0-or-later
param([switch]$Apply, [switch]$ValidateOnly, [string]$Target = 'H:\MeguLit-Work\night-1423\installer-owner-test\installed\MeguLit')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\..\setup\setup-test-scope.ps1')

function Assert-OwnerFinalizePath($Scope, [string]$Path, [string]$Area) {
  $p = Get-SetupLocalPath $Path
  $base = Get-SetupLocalPath ([string]$Scope[$Area])
  if ($p -ine $base -and -not $p.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'OWNER_RUNTIME_FINALIZE_PATH' }
  Assert-SetupNoLink $p
  return $p
}
function Get-OwnerFinalizeHash([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  if ((Get-Item -LiteralPath $Path).Length -gt 16MB) { throw 'OWNER_RUNTIME_FINALIZE_FILE_LIMIT' }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Get-OwnerFinalizeTreeFiles([string]$Root) {
  $pending = New-Object 'Collections.Generic.Stack[string]'; $pending.Push($Root)
  while ($pending.Count) { foreach ($p in [IO.Directory]::GetFileSystemEntries($pending.Pop())) { $a = [IO.File]::GetAttributes($p); if ($a -band [IO.FileAttributes]::ReparsePoint) { throw 'OWNER_RUNTIME_FINALIZE_REPARSE' }; if ($a -band [IO.FileAttributes]::Directory) { $pending.Push($p) } else { $p } } }
}
function Write-OwnerFinalizeJson($Scope, [string]$Path, $Value) {
  $p = Assert-OwnerFinalizePath $Scope $Path 'staging'
  $tmp = $p + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  Assert-OwnerFinalizePath $Scope $tmp 'staging' | Out-Null
  [IO.File]::WriteAllText($tmp, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
  if ([IO.File]::Exists($p)) { $previous = Assert-OwnerFinalizePath $Scope ($p + '.' + [Guid]::NewGuid().ToString('N') + '.previous.json') 'staging'; [IO.File]::Replace($tmp, $p, $previous) } else { [IO.File]::Move($tmp, $p) }
}
function Copy-OwnerFinalizeBytes([string]$Source, [string]$Destination) { [IO.File]::Copy($Source, $Destination, $false) }
function Publish-OwnerFinalizeFile($Scope, [string]$Source, [string]$Target, [string]$Expected) {
  $p = Assert-OwnerFinalizePath $Scope $Target 'target'
  $tmp = $p + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
  Assert-OwnerFinalizePath $Scope $tmp 'target' | Out-Null
  Copy-OwnerFinalizeBytes $Source $tmp
  if ((Get-OwnerFinalizeHash $tmp) -ne $Expected) { throw 'OWNER_RUNTIME_FINALIZE_COPY_HASH' }
  if ([IO.File]::Exists($p)) { $previous = Assert-OwnerFinalizePath $Scope (Join-Path $Scope.staging ('replaced-' + [Guid]::NewGuid().ToString('N') + '.bak')) 'staging'; [IO.File]::Replace($tmp, $p, $previous) } else { [IO.File]::Move($tmp, $p) }
  if ((Get-OwnerFinalizeHash $p) -ne $Expected) { throw 'OWNER_RUNTIME_FINALIZE_READBACK' }
}
function Get-OwnerRuntimeOverlay($Scope) {
  $names = @('LunaTmpFontLoader.dll','MeguLitHook32.dll','MeguLitHook64.dll','MeguLitHost64.dll','components.json')
  $dir = Assert-OwnerFinalizePath $Scope (Join-Path $Scope.source 'tools\installer-owner-test\runtime-overlay') 'source'
  $manifestFile = Join-Path $dir 'manifest.json'
  Assert-OwnerFinalizePath $Scope $manifestFile 'source' | Out-Null
  if (-not [IO.File]::Exists($manifestFile)) { throw 'OWNER_RUNTIME_OVERLAY_MISSING' }
  if ((Get-Item -LiteralPath $manifestFile).Length -gt 64KB) { throw 'OWNER_RUNTIME_OVERLAY_SCHEMA' }
  $m = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($m.schemaVersion -ne 1 -or $m.candidateCommit -notmatch '^[0-9a-f]{40}$' -or @($m.files).Count -ne 5) { throw 'OWNER_RUNTIME_OVERLAY_SCHEMA' }
  $payload = Get-Content -LiteralPath (Join-Path $Scope.owner 'root-payload-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($payload.ready -isnot [bool] -or -not $payload.ready -or $payload.candidateCommit -cne $m.candidateCommit) { throw 'OWNER_RUNTIME_OVERLAY_CANDIDATE' }
  $pins = @{}; foreach ($r in $payload.files) { if ($pins.ContainsKey([string]$r.path)) { throw 'OWNER_RUNTIME_OVERLAY_PAYLOAD_DUPLICATE' }; $pins[[string]$r.path] = $r }
  $all = @(@{ path = 'tools/installer-owner-test/runtime-overlay/manifest.json'; size = (Get-Item -LiteralPath $manifestFile).Length; sha256 = (Get-OwnerFinalizeHash $manifestFile) })
  $seen = @{}; $rows = @()
  foreach ($r in $m.files) {
    $name = [string]$r.name
    if ($name -cnotin $names -or $seen.ContainsKey($name) -or ($r.size -isnot [int] -and $r.size -isnot [long]) -or [long]$r.size -lt 1 -or [long]$r.size -gt 16MB -or $r.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'OWNER_RUNTIME_OVERLAY_SCHEMA' }
    $seen[$name] = $true
    $p = Assert-OwnerFinalizePath $Scope (Join-Path $dir ('files\' + $name)) 'source'
    if (-not [IO.File]::Exists($p) -or (Get-Item -LiteralPath $p).Length -ne [long]$r.size -or (Get-OwnerFinalizeHash $p) -cne $r.sha256) { throw 'OWNER_RUNTIME_OVERLAY_SOURCE_CHANGED' }
    $relative = 'tools/installer-owner-test/runtime-overlay/files/' + $name
    $all += @{ path = $relative; size = [long]$r.size; sha256 = [string]$r.sha256 }
    $rows += @{ name = $name; source = $p; size = [long]$r.size; after = [string]$r.sha256 }
  }
  foreach ($r in $all) { $pin = $pins[$r.path]; if (-not $pin -or [long]$pin.size -ne $r.size -or $pin.sha256 -cne $r.sha256) { throw 'OWNER_RUNTIME_OVERLAY_PAYLOAD_PIN' } }
  $actual = @(Get-OwnerFinalizeTreeFiles $dir)
  if ($actual.Count -ne 6) { throw 'OWNER_RUNTIME_OVERLAY_EXTRA_FILE' }
  foreach ($p in $actual) { Assert-SetupNoLink $p }
  $components = Get-Content -LiteralPath (Join-Path $dir 'files\components.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if (@($components.files).Count -ne 4) { throw 'OWNER_RUNTIME_COMPONENTS_SCHEMA' }
  $componentNames = @{}
  foreach ($r in $components.files) { $name = [string]$r.name; $match = @($rows | Where-Object { $_.name -ceq $name }); if ($name -ceq 'components.json' -or $componentNames.ContainsKey($name) -or $match.Count -ne 1 -or $match[0].after -cne $r.sha256 -or $match[0].size -ne [long]$r.size) { throw 'OWNER_RUNTIME_COMPONENTS_PIN' }; $componentNames[$name] = $true }
  return @{ candidateCommit = $m.candidateCommit; rows = @($rows | Sort-Object @{ Expression = { $_.name -eq 'components.json' } }, name) }
}
function Invoke-OwnerRuntimeFinalizeCore($Scope, [switch]$Apply, [scriptblock]$ProcessInventory = { Get-CimInstance Win32_Process }) {
  foreach ($area in 'owner','source','staging','target') { Assert-OwnerFinalizePath $Scope $Scope[$area] $area | Out-Null }
  $overlay = Get-OwnerRuntimeOverlay $Scope
  $hook = Assert-OwnerFinalizePath $Scope (Join-Path $Scope.target 'runtime\megulithook') 'target'
  $ready = [IO.Directory]::Exists($hook)
  foreach ($r in $overlay.rows) { $p = Assert-OwnerFinalizePath $Scope (Join-Path $hook $r.name) 'target'; if ((Get-OwnerFinalizeHash $p) -cne $r.after) { $ready = $false } }
  if (-not $Apply) { return @{ ready = $ready; state = 'validated-only'; candidateCommit = $overlay.candidateCommit; written = $false; appStarted = $false } }
  if (-not [IO.File]::Exists((Join-Path $Scope.target 'MeguLit.exe')) -or -not [IO.File]::Exists((Join-Path $Scope.target 'runtime\node.exe'))) { throw 'OWNER_RUNTIME_INSTALL_INCOMPLETE' }
  foreach ($p in (& $ProcessInventory)) { if ($p.ExecutablePath -and ([string]$p.ExecutablePath).StartsWith($Scope.target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'OWNER_RUNTIME_TARGET_RUNNING' }; if (-not $p.ExecutablePath -and $p.Name -match '^(MeguLit|node)\.exe$') { throw 'OWNER_RUNTIME_PROCESS_UNKNOWN' } }
  if ([IO.Directory]::Exists($Scope.staging)) { foreach ($f in @(Get-OwnerFinalizeTreeFiles $Scope.staging) | Where-Object { [IO.Path]::GetFileName($_) -eq 'journal.json' }) { $old = Get-Content -Raw -LiteralPath $f | ConvertFrom-Json; if ($old.closed -isnot [bool] -or -not $old.closed) { throw 'OWNER_RUNTIME_FINALIZE_PENDING' } } }
  $attempt = Assert-OwnerFinalizePath $Scope (Join-Path $Scope.staging ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N'))) 'staging'
  [IO.Directory]::CreateDirectory($attempt) | Out-Null
  $journalFile = Join-Path $attempt 'journal.json'
  $journal = @{ state = 'preparing'; ready = $false; closed = $false; candidateCommit = $overlay.candidateCommit; target = $Scope.target; files = @(); appStarted = $false }
  foreach ($r in $overlay.rows) {
    $target = Assert-OwnerFinalizePath $Scope (Join-Path $hook $r.name) 'target'
    $before = Get-OwnerFinalizeHash $target
    $backup = Assert-OwnerFinalizePath $Scope (Join-Path $attempt $r.name) 'staging'
    if ($before) { [IO.File]::Copy($target, $backup, $false); if ((Get-OwnerFinalizeHash $backup) -cne $before) { throw 'OWNER_RUNTIME_BACKUP_HASH' } }
    $journal.files += @{ name = $r.name; target = $target; backup = $backup; before = $before; after = $r.after }
  }
  Write-OwnerFinalizeJson $Scope $journalFile $journal
  try {
    [IO.Directory]::CreateDirectory($hook) | Out-Null
    $journal.state = 'applying'; Write-OwnerFinalizeJson $Scope $journalFile $journal
    foreach ($r in $overlay.rows) {
      $saved = @($journal.files | Where-Object { $_.name -ceq $r.name })[0]
      if ((Get-OwnerFinalizeHash $saved.target) -cne $saved.before) { throw 'OWNER_RUNTIME_TARGET_CHANGED' }
      if ((Get-OwnerFinalizeHash $r.source) -cne $r.after) { throw 'OWNER_RUNTIME_OVERLAY_SOURCE_CHANGED' }
      Publish-OwnerFinalizeFile $Scope $r.source $saved.target $r.after
    }
    foreach ($r in $journal.files) { if ((Get-OwnerFinalizeHash $r.target) -cne $r.after) { throw 'OWNER_RUNTIME_FINALIZE_READBACK' } }
    $journal.state = 'verified'; $journal.ready = $true; $journal.closed = $true; Write-OwnerFinalizeJson $Scope $journalFile $journal
    return @{ ready = $true; state = 'verified'; candidateCommit = $overlay.candidateCommit; written = $true; journal = $journalFile; appStarted = $false }
  } catch {
    $cause = [string]$_.Exception.Message; $restored = $true
    foreach ($r in @($journal.files | Select-Object -Last 5)) {
      try {
        Assert-OwnerFinalizePath $Scope $r.target 'target' | Out-Null
        $current = Get-OwnerFinalizeHash $r.target
        if ($current -ceq $r.before) { continue }
        if ($current -cne $r.after) { throw 'OWNER_RUNTIME_UNKNOWN_TARGET_PRESERVED' }
        if ($r.before) { if ((Get-OwnerFinalizeHash $r.backup) -cne $r.before) { throw 'OWNER_RUNTIME_BACKUP_CHANGED' }; Publish-OwnerFinalizeFile $Scope $r.backup $r.target $r.before }
        else { [IO.File]::Delete($r.target) }
      } catch { $restored = $false }
    }
    $journal.state = 'failed'; $journal.ready = $false; $journal.closed = $restored; $journal.rollbackRestored = $restored; $journal.error = $cause
    Write-OwnerFinalizeJson $Scope $journalFile $journal
    throw 'OWNER_RUNTIME_FINALIZE_FAILED'
  }
}

function Invoke-OwnerRuntimeFinalize($Scope, [switch]$Apply, [scriptblock]$ProcessInventory = { Get-CimInstance Win32_Process }) {
  if (-not $Apply) { return Invoke-OwnerRuntimeFinalizeCore $Scope -ProcessInventory $ProcessInventory }
  # Reject a bad overlay or target link before even creating the owned control lock.
  $null = Get-OwnerRuntimeOverlay $Scope
  Assert-OwnerFinalizePath $Scope (Join-Path $Scope.target 'runtime\megulithook') 'target' | Out-Null
  $stage = Assert-OwnerFinalizePath $Scope $Scope.staging 'staging'
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  $lock = Assert-OwnerFinalizePath $Scope (Join-Path $stage 'finalizer.lock') 'staging'
  $held = [IO.File]::Open($lock, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try { return Invoke-OwnerRuntimeFinalizeCore $Scope -Apply -ProcessInventory $ProcessInventory } finally { $held.Dispose() }
}

if ($MyInvocation.InvocationName -ne '.') {
  try {
    $owner = 'H:\MeguLit-Work\night-1423\installer-owner-test'
    $expected = Join-Path $owner 'installed\MeguLit'
    if ((Get-SetupLocalPath $Target) -ine $expected -or ($Apply -and $ValidateOnly)) { throw 'OWNER_RUNTIME_FINALIZE_EXACT_TARGET_REQUIRED' }
    $scope = @{ owner = $owner; source = (Join-Path $owner 'source'); target = $expected; staging = (Join-Path $owner 'staging\runtime-finalize') }
    Invoke-OwnerRuntimeFinalize $scope -Apply:$Apply | ConvertTo-Json -Depth 4 -Compress
  } catch { throw ('安装后的运行组件尚未就绪：' + $_.Exception.Message) }
}
