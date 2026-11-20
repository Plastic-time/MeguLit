# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit first-launch setup.
# The release zip ships without runtime\. This window installs all three runtime packs (base, reading, voice):
# Node, Python, hooks, JMdict, furigana dictionaries and the voice engine, into runtime\ next to MeguLit.exe,
# so a fresh PC needs nothing preinstalled except the WebView2 Runtime (built into Windows 11).
# Since 1.4.20 there is no Full / Lite choice any more: the download starts the moment the window opens, into a
# staging folder, while the user picks the install folder and shortcuts. "Install" copies MeguLit there (Use-Target)
# and unpacks each pack there as soon as both the pack and the user are ready. Closing the window keeps the staged
# files, so the next launch resumes. Only missing packs are fetched, which is also how a broken install repairs itself.
# Group report (2026-11-12): a player opened MeguLit.exe straight from the archive viewer, so it ran from
# %TEMP%\Rar$EXa..., installed onto a nearly full C: drive and left no shortcut. When the chosen folder is not
# this one, the whole MeguLit folder is copied there first, then the new copy is started (exit 3 = moved).
# Packs, URLs, SHA-256 and sizes come from setup\runtime.json. Exit 0 = runtime ready.
param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
# Boot timing (setup-ui.log, one line per step): where the time between the double click and the first window goes.
$script:bootLog = $(if ($env:MEGULIT_SETUP_UILOG) { $env:MEGULIT_SETUP_UILOG } else { Join-Path $env:LOCALAPPDATA 'MeguLit\setup-ui.log' })
$script:procStart = try { [Diagnostics.Process]::GetCurrentProcess().StartTime } catch { [DateTime]::Now }
function Boot-Mark([string]$step) { try { $n = [DateTime]::Now; [IO.Directory]::CreateDirectory((Split-Path $script:bootLog)) | Out-Null; [IO.File]::AppendAllText($script:bootLog, (Get-Date -Format 's') + ' boot step=' + $step + ' since_proc=' + [int]($n - $script:procStart).TotalMilliseconds + ' at=' + [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + "`r`n") } catch {} }
Boot-Mark 'script-start'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Boot-Mark 'winforms-loaded'
# Splash: the first frame of the installer's opening clip, on screen before any C# is compiled (each Add-Type -TypeDefinition starts csc.exe,
# seconds on a busy machine). The real window replaces it (setup-web.ps1 / the classic window's Shown). Only where the web skin is wanted.
$script:splash = $null; $script:wv2EnvTask = $null
if ($env:MEGULIT_SETUP_WEB -ne '0' -and (-not $env:MEGULIT_SETUP_TEST -or $env:MEGULIT_SETUP_WEB -eq '1') -and -not $env:MEGULIT_SETUP_PREVIEW -and -not $env:MEGULIT_SETUP_THEME -and -not $env:MEGULIT_SETUP_WEB_TEST) {
  try { $bsPath = Join-Path $Root 'setup\ui-web\video\light\intro.jpg'
    if (Test-Path $bsPath) { $bsForm = New-Object Windows.Forms.Form; $bsForm.FormBorderStyle = 'None'; $bsForm.StartPosition = 'CenterScreen'; $bsForm.ShowInTaskbar = $false; $bsForm.Text = 'MeguLit'; $bsForm.ClientSize = New-Object Drawing.Size(1000, 640); $bsForm.BackColor = [Drawing.Color]::FromArgb(236, 241, 249)
      $bsPic = New-Object Windows.Forms.PictureBox; $bsPic.Dock = 'Fill'; $bsPic.SizeMode = 'StretchImage'; $bsPic.Image = [Drawing.Image]::FromStream((New-Object IO.MemoryStream (,[IO.File]::ReadAllBytes($bsPath)))); $bsForm.Controls.Add($bsPic)
      $bsForm.Show(); $bsForm.Refresh(); $script:splash = $bsForm; Boot-Mark 'splash-shown' } } catch { Boot-Mark ('splash-failed ' + ($_ -replace '\s+', ' ')) }
  # WebView2 warms up while the rest of the setup is built: its browser process starts now, not when the skin window is created.
  try { $bsWv = Join-Path $Root 'setup\webview2'; if (Test-Path (Join-Path $bsWv 'Microsoft.Web.WebView2.Core.dll')) { Add-Type -Path (Join-Path $bsWv 'Microsoft.Web.WebView2.Core.dll'); $env:PATH = (Join-Path $bsWv $(if ([Environment]::Is64BitProcess) { 'x64' } else { 'x86' })) + ';' + $env:PATH
      $script:webData = $(if ($env:MEGULIT_SETUP_WEBVIEW2_DATA) { $env:MEGULIT_SETUP_WEBVIEW2_DATA } elseif ($env:WEBVIEW2_USER_DATA_FOLDER) { $env:WEBVIEW2_USER_DATA_FOLDER } else { Join-Path $env:LOCALAPPDATA ('MeguLit\setup-webview2' + $PID) })
      $script:wv2EnvTask = [Microsoft.Web.WebView2.Core.CoreWebView2Environment]::CreateAsync($null, $script:webData, $null); Boot-Mark 'webview2-env-started' } } catch { $script:wv2EnvTask = $null; Boot-Mark ('webview2-prewarm-failed ' + ($_ -replace '\s+', ' ')) }
}
function Close-Splash { if ($script:splash) { try { $script:splash.Close(); $script:splash.Dispose() } catch {}; $script:splash = $null; Boot-Mark 'splash-closed' } }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Windows.Forms.Application]::EnableVisualStyles()

$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'setup\runtime.json') | ConvertFrom-Json
$packs = $manifest.packs
$appSize = 40MB
function MB($n) { if ($n -ge 1GB) { '{0:N1} GB' -f ($n/1GB) } else { '{0:N0} MB' -f ($n/1MB) } }
$full = @('base','reading','voice')
function Sum($ids, $field) { $t = 0; foreach ($i in $ids) { $t += $packs.$i.$field }; $t }

# Test hooks (validation\setup-flow.test.cjs runs the real window on a hidden desktop):
#   MEGULIT_SETUP_TEST=<file>      write events as JSON lines there; no shortcuts, no registry entry, no relaunch, no message boxes
#   MEGULIT_SETUP_AUTOSTART=now|downloaded   press Install at once / once every pack is downloaded
#   MEGULIT_SETUP_TARGET=<dir>     install location to fill in;  MEGULIT_SETUP_STAGING=<dir>  staging folder to use
#   MEGULIT_SETUP_CLOSE_AT=<bytes> close the window once that many bytes are downloaded;  MEGULIT_SETUP_FREE=<bytes>  pretend free space
$testLog = $env:MEGULIT_SETUP_TEST
$clock = [Diagnostics.Stopwatch]::StartNew()
function Note($kind, $data) {
  if (-not $testLog) { return }
  $o = [ordered]@{ t = $clock.ElapsedMilliseconds; kind = $kind }; if ($data) { foreach ($k in $data.Keys) { $o[$k] = $data[$k] } }
  try { Add-Content -Encoding UTF8 $testLog (ConvertTo-Json -Compress $o) } catch {}
}
# An error inside a window event would otherwise only pop a .NET error box; in test mode it goes to the event log.
if ($testLog) { [Windows.Forms.Application]::add_ThreadException({ param($s, $e) Note 'error' @{ text = $e.Exception.ToString() } }) }
function Say([string]$text) { Note 'message' @{ text = $text }; if (-not $testLog) { [void][Windows.Forms.MessageBox]::Show($form, $text, 'MeguLit') } }

# UI hooks: no-ops here, setupsetup-ui.ps1 (MEGULIT_SETUP_THEME) answers them. The logic never reads anything back from the UI layer.
function UI-Progress($p) {}
function UI-Fail([string]$kind, [string]$message) {}
function UI-Done {}
function UI-Preview([string]$state) {}

# WebView2 Runtime is the one thing MeguLit cannot ship itself (Windows 11 has it; some Windows 10 PCs do not).
function Has-WebView2 {
  $id = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  foreach ($k in "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$id", "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$id", "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$id") {
    try { $v = (Get-ItemProperty -Path $k -Name pv -ErrorAction Stop).pv; if ($v -and $v -ne '0.0.0.0') { return $true } } catch {}
  }
  return $false
}
$webview = Has-WebView2

# Palette: dark grimoire, cream pages, crimson ribbon, a little gold.
$C = @{
  bg    = [Drawing.Color]::FromArgb(24,19,20);  card  = [Drawing.Color]::FromArgb(38,30,31)
  line  = [Drawing.Color]::FromArgb(62,48,49);  cream = [Drawing.Color]::FromArgb(243,233,220)
  muted = [Drawing.Color]::FromArgb(170,154,144); red  = [Drawing.Color]::FromArgb(200,50,60)
  gold  = [Drawing.Color]::FromArgb(217,165,74)
}
$ui = 'Microsoft YaHei UI'
# Flat buttons default to a white hover; give them grimoire colours instead.
function Style-Button($b, [bool]$primary) {
  $b.FlatStyle = 'Flat'; $b.UseVisualStyleBackColor = $false; $b.ForeColor = $C.cream; $b.Cursor = 'Hand'
  if ($primary) { $b.BackColor = $C.red; $b.FlatAppearance.BorderColor = $C.red; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(222,72,82); $b.FlatAppearance.MouseDownBackColor = [Drawing.Color]::FromArgb(168,38,48) }
  else { $b.BackColor = $C.card; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(64,40,43); $b.FlatAppearance.MouseDownBackColor = [Drawing.Color]::FromArgb(84,48,52) }
}
function Img($name) { $p = Join-Path $Root "setup\$name"; if (Test-Path $p) { try { [Drawing.Image]::FromFile($p) } catch {} } }
$logo = Img 'logo.png'

# Double-buffered panel so the hand-drawn line art does not flicker.
Boot-Mark 'compile-1-start'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
public class GrimoirePanel : System.Windows.Forms.Panel {
  public GrimoirePanel() { this.DoubleBuffered = true; this.SetStyle(System.Windows.Forms.ControlStyles.ResizeRedraw, true); }
}
'@

function Pen($color, $alpha, $w) { New-Object Drawing.Pen ([Drawing.Color]::FromArgb($alpha, $color)), $w }
function Draw-Circle($g, $cx, $cy, $r, $color, $alpha) {
  $p = Pen $color $alpha 1
  foreach ($k in 1.0, 0.9, 0.58, 0.22) { $rr = $r * $k; $g.DrawEllipse($p, [float]($cx-$rr), [float]($cy-$rr), [float](2*$rr), [float](2*$rr)) }
  foreach ($rot in 0, 180) {
    $pts = foreach ($i in 0..2) { $a = ($rot - 90 + $i*120) * [math]::PI / 180; New-Object Drawing.PointF ([float]($cx + $r*0.9*[math]::Cos($a))), ([float]($cy + $r*0.9*[math]::Sin($a))) }
    $g.DrawPolygon($p, [Drawing.PointF[]]$pts)
  }
  $p.Dispose()
}

# The setup runs inside powershell.exe, so the taskbar grouped it with PowerShell and showed PowerShell's icon.
# An own AppUserModelID gives the window its own taskbar entry with the MeguLit icon set below.
try { Add-Type -Namespace MeguLit -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string id);'; [void][MeguLit.Shell]::SetCurrentProcessExplicitAppUserModelID('app.megulit.setup') } catch {}
Boot-Mark 'compiled'
$form = New-Object Windows.Forms.Form
$form.Text = 'MeguLit'; $form.ClientSize = New-Object Drawing.Size(720,560); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.BackColor = $C.bg; $form.ForeColor = $C.cream
$exe = Join-Path $Root 'MeguLit.exe'; if (Test-Path $exe) { try { $form.Icon = [Drawing.Icon]::ExtractAssociatedIcon($exe) } catch {} }

function Label($text, $x, $y, $w, $h, $size, $bold, $color, $parent) {
  $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object Drawing.Point($x,$y); $l.Size = New-Object Drawing.Size($w,$h)
  $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
  $l.Font = New-Object Drawing.Font($ui, $size, $style); $l.ForeColor = $color; $l.BackColor = [Drawing.Color]::Transparent
  $parent.Controls.Add($l); $l
}

# ---- shared backdrop: magic circles + header art ----
$stage = New-Object GrimoirePanel; $stage.Dock = 'Fill'; $stage.BackColor = $C.bg
$stage.add_Paint({ param($s,$e)
  $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
  Draw-Circle $g 640 70 190 $C.red 46
  Draw-Circle $g 40 500 150 $C.gold 30
  if ($logo) { $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($logo, 30, 18, 212, 81) }
  $p = Pen $C.line 255 1; $g.DrawLine($p, 32, 122, 688, 122); $g.DrawLine($p, 32, 282, 688, 282); $p.Dispose()
})
$form.Controls.Add($stage)

# ---- install location + paths ----
$sourceRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$fromArchive = ($sourceRoot + '\').StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or $sourceRoot -match '\\(Rar\$|7z[A-Z0-9]|wz[A-Z0-9])'
function Default-Target {
  if (-not $fromArchive) { return $sourceRoot }
  # Opened from inside an archive: suggest the roomiest non-system fixed drive, else the per-user Programs folder.
  $sys = $env:SystemDrive.TrimEnd('\').ToUpper()
  $best = [IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady -and $_.Name.TrimEnd('\').ToUpper() -ne $sys -and $_.AvailableFreeSpace -gt 3GB } | Sort-Object AvailableFreeSpace -Descending | Select-Object -First 1
  if ($best) { return (Join-Path $best.RootDirectory.FullName 'MeguLit') }
  return (Join-Path $env:LOCALAPPDATA 'Programs\MeguLit')
}
function Drive-Of($path) { try { [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($path)).TrimEnd('\').ToUpper() } catch { '' } }
function Drive-Free($path) {
  if ($env:MEGULIT_SETUP_FREE) { return [long]$env:MEGULIT_SETUP_FREE }
  try { $q = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($path)); (New-Object IO.DriveInfo $q).AvailableFreeSpace } catch { 0 }
}
$runtimeDir = Join-Path $Root 'runtime'
# base needs Python's core library too: an interrupted install once left node.exe but no Lib\zipfile.
$markers = @{ base = @('runtime\node.exe','runtime\python\python.exe','runtime\python\Lib\zipfile\__init__.py','runtime\python\Lib\encodings\__init__.py'); reading = 'runtime\reading\sudachidict_full\resources\system.dic'; voice = 'runtime\aivis\run.exe' }
$names = @{ base = '基础组件'; reading = '注音分词词典'; voice = '语音引擎' }
# Only what is missing is fetched and installed: this is also the repair path for a half-installed runtime.
function Missing($dir) { @($full | Where-Object { $id = $_; @($markers[$id] | Where-Object { -not (Test-Path (Join-Path $dir $_)) }).Count -gt 0 }) }

# ---- staging folder ----
# The packs download before the user has picked a folder, so they go to a staging folder that survives a closed
# window (next launch resumes from there; %LOCALAPPDATA%\MeguLit\setup-staging.txt remembers which one). It sits
# inside the suggested install folder, so the common case (keep the suggestion) needs no second copy of 600 MB;
# tar reads the packs from there into the chosen folder, which works across drives just the same.
$stageName = '.megulit-download'
$pointer = Join-Path $env:LOCALAPPDATA 'MeguLit\setup-staging.txt'
function Writable($dir) {
  try { New-Item -ItemType Directory -Force $dir -ErrorAction Stop | Out-Null; $p = Join-Path $dir ('.w-' + $PID); [IO.File]::WriteAllText($p, 'ok'); Remove-Item $p -Force; $true } catch { $false }
}
function Pick-Staging($bytes) {
  if ($env:MEGULIT_SETUP_STAGING) { $d = $env:MEGULIT_SETUP_STAGING; [void](Writable $d); return $d }
  try { $old = (Get-Content -Raw -Encoding UTF8 $pointer -ErrorAction Stop).Trim(); if ($old -and (Test-Path $old) -and (Writable $old)) { return $old } } catch {}
  $pick = $null
  foreach ($d in @((Join-Path (Default-Target) $stageName), (Join-Path $env:LOCALAPPDATA "MeguLit\$stageName"))) {
    if ((Drive-Free $d) -ge $bytes + 64MB -and (Writable $d)) { $pick = $d; break }
  }
  if (-not $pick) { $pick = Join-Path $env:LOCALAPPDATA "MeguLit\$stageName"; [void](Writable $pick) }
  try { New-Item -ItemType Directory -Force (Split-Path $pointer) | Out-Null; [IO.File]::WriteAllText($pointer, $pick) } catch {}
  $pick
}
$want = Missing (Default-Target)
$stageDir = Pick-Staging (Sum $want 'size')
# Older setups (before 1.4.20) kept runtime-<id>.setup.part(.json) next to MeguLit.exe: carry them over so they resume.
foreach ($id in $full) {
  foreach ($ext in '', '.json') {
    $old = Join-Path $sourceRoot ("runtime-$id.setup.part" + $ext); $new = Join-Path $stageDir ("runtime-$id.setup.part" + $ext)
    if ((Test-Path $old) -and -not (Test-Path $new)) { try { Move-Item $old $new -ErrorAction Stop } catch {} }
  }
}

# ---- progress (top) ----
$progress = New-Object Windows.Forms.Panel; $progress.Location = New-Object Drawing.Point(0,124); $progress.Size = New-Object Drawing.Size(720,156); $progress.BackColor = [Drawing.Color]::Transparent
$stage.Controls.Add($progress)
$title = Label '正在下载运行组件…' 32 10 520 30 14 $true $C.cream $progress
$status = Label '' 32 80 656 70 9 $false $C.muted $progress
# Hand-drawn progress bar: rounded dark track, crimson-to-gold fill, a soft shimmer while unpacking.
$script:barValue = 0; $script:barBusy = $false; $script:barPhase = 0.0
$bar = New-Object GrimoirePanel; $bar.Location = New-Object Drawing.Point(32,56); $bar.Size = New-Object Drawing.Size(584,14); $bar.BackColor = [Drawing.Color]::Transparent
function Round-Rect($x, $y, $w, $h) {
  $r = [math]::Min($h, $w); $gp = New-Object Drawing.Drawing2D.GraphicsPath
  if ($w -le 0) { return $gp }
  $gp.AddArc([float]$x, [float]$y, [float]$r, [float]$h, 90, 180); $gp.AddArc([float]($x + $w - $r), [float]$y, [float]$r, [float]$h, 270, 180); $gp.CloseFigure(); $gp
}
$bar.add_Paint({ param($s,$e)
  $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'; $w = $bar.Width - 1; $h = $bar.Height - 1
  $track = Round-Rect 0 0 $w $h
  $tb = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(52,41,42)); $g.FillPath($tb, $track); $tb.Dispose()
  if ($script:barBusy) {
    $seg = [int]($w * 0.28); $x = [int](($w + $seg) * $script:barPhase) - $seg
    $g.SetClip($track)
    $rect = New-Object Drawing.Rectangle ($x, 0, [math]::Max(1,$seg), ($h + 1))
    $lg = New-Object Drawing.Drawing2D.LinearGradientBrush $rect, ([Drawing.Color]::FromArgb(0,$C.red)), ([Drawing.Color]::FromArgb(0,$C.gold)), 0.0
    $blend = New-Object Drawing.Drawing2D.ColorBlend 3
    $blend.Colors = @([Drawing.Color]::FromArgb(0,$C.red), $C.red, [Drawing.Color]::FromArgb(0,$C.gold)); $blend.Positions = @(0.0, 0.55, 1.0); $lg.InterpolationColors = $blend
    $g.FillRectangle($lg, $rect); $lg.Dispose(); $g.ResetClip()
  } elseif ($script:barValue -gt 0) {
    $fw = [math]::Max($h, [int]($w * $script:barValue / 1000))
    $fill = Round-Rect 0 0 $fw $h
    $lg = New-Object Drawing.Drawing2D.LinearGradientBrush (New-Object Drawing.Rectangle 0, 0, ($fw + 1), ($h + 1)), $C.red, $C.gold, 0.0
    $g.FillPath($lg, $fill); $lg.Dispose()
    $hl = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(60,255,255,255)); $g.FillRectangle($hl, [float]($h/2), 2, [float]([math]::Max(0,$fw - $h)), [float]([math]::Max(1,$h/4))); $hl.Dispose()
  }
  $edge = Pen $C.line 255 1; $g.DrawPath($edge, $track); $edge.Dispose()
})
$progress.Controls.Add($bar)
$percent = Label '' 620 52 68 20 9 $true $C.gold $progress; $percent.TextAlign = 'MiddleRight'
$shimmer = New-Object Windows.Forms.Timer; $shimmer.Interval = 30
$shimmer.add_Tick({ $script:barPhase = ($script:barPhase + 0.012) % 1.0; $bar.Invalidate() })
function Set-Bar([int]$value) { $script:barBusy = $false; $shimmer.Stop(); $script:barValue = [math]::Max(0, [math]::Min(1000, $value)); $percent.Text = if ($value -gt 0) { ('{0:N0}%' -f ($script:barValue / 10)) } else { '' }; $bar.Invalidate() }
function Set-Busy { $script:barBusy = $true; $percent.Text = ''; $shimmer.Start(); $bar.Invalidate() }
$button = New-Object Windows.Forms.Button; $button.Text = '取消 Cancel'; $button.FlatStyle = 'Flat'; $button.ForeColor = $C.cream
$button.Font = New-Object Drawing.Font($ui, 9, [Drawing.FontStyle]::Bold); Style-Button $button $false; $button.FlatAppearance.BorderColor = $C.red; $button.Location = New-Object Drawing.Point(568,8); $button.Size = New-Object Drawing.Size(120,32); $button.Cursor = 'Hand'
$progress.Controls.Add($button)

# ---- install location (bottom) ----
$choice = New-Object Windows.Forms.Panel; $choice.Location = New-Object Drawing.Point(0,290); $choice.Size = New-Object Drawing.Size(720,270); $choice.BackColor = [Drawing.Color]::Transparent
$stage.Controls.Add($choice)
[void](Label '装到哪里' 32 0 400 28 12 $true $C.cream $choice)
[void](Label ('运行组件（Node.js、Python、文本 Hook、注音词典、AivisSpeech 语音引擎，共约 ' + (MB (Sum $full 'size')) + '）已经在后台下载了，趁这会儿选好位置。组件都是各项目官方发布的原版文件，逐个校验 SHA-256，被改动过的不会安装') 32 30 656 36 8 $false $C.muted $choice)
[void](Label '安装位置' 32 79 70 20 9 $true $C.cream $choice)
$pathBox = New-Object Windows.Forms.TextBox; $pathBox.Location = New-Object Drawing.Point(104,76); $pathBox.Size = New-Object Drawing.Size(452,24)
$pathBox.Font = New-Object Drawing.Font($ui, 9); $pathBox.BackColor = $C.card; $pathBox.ForeColor = $C.cream; $pathBox.BorderStyle = 'FixedSingle'
$pathBox.Text = $(if ($env:MEGULIT_SETUP_TARGET) { $env:MEGULIT_SETUP_TARGET } else { Default-Target }); $choice.Controls.Add($pathBox)
$browse = New-Object Windows.Forms.Button; $browse.Text = '更改… Browse'; $browse.Location = New-Object Drawing.Point(566,75); $browse.Size = New-Object Drawing.Size(122,26)
$browse.Font = New-Object Drawing.Font($ui, 9); Style-Button $browse $false; $browse.FlatAppearance.BorderColor = $C.line; $choice.Controls.Add($browse)
function Check($text, $x, $w) {
  $cb = New-Object Windows.Forms.CheckBox; $cb.Text = $text; $cb.Checked = $true; $cb.Location = New-Object Drawing.Point($x,108); $cb.Size = New-Object Drawing.Size($w,22)
  $cb.Font = New-Object Drawing.Font($ui, 9); $cb.ForeColor = $C.cream; $cb.BackColor = [Drawing.Color]::Transparent; $cb.FlatStyle = 'Flat'; $cb.Cursor = 'Hand'
  $choice.Controls.Add($cb); $cb
}
$deskCheck = Check '在桌面创建快捷方式' 32 190
$menuCheck = Check '添加到开始菜单' 226 170
$freeLabel = Label '' 400 110 288 20 8 $false $C.muted $choice; $freeLabel.TextAlign = 'MiddleRight'
$noteText = if ($fromArchive) { '你是在压缩包里直接打开的：点「安装」后 MeguLit 会整个复制到这里再装组件，以后从快捷方式打开就行' } else { '运行组件装进安装位置下的 runtime 文件夹，不会写到别处 · 以后移动 MeguLit 文件夹，组件会跟着一起走' }
$note = Label $noteText 32 140 656 20 8 $fromArchive $(if ($fromArchive) { $C.gold } else { $C.muted }) $choice; $note.AutoEllipsis = $true
if (-not $webview) {
  $link = New-Object Windows.Forms.LinkLabel; $link.Text = '这台电脑缺少 Microsoft Edge WebView2 运行时，MeguLit 的界面需要它：点这里去微软官网下载安装'
  $link.Location = New-Object Drawing.Point(32,164); $link.Size = New-Object Drawing.Size(656,20); $link.Font = New-Object Drawing.Font($ui, 8, [Drawing.FontStyle]::Bold)
  $link.LinkColor = $C.red; $link.ActiveLinkColor = $C.gold; $link.BackColor = [Drawing.Color]::Transparent
  $link.add_LinkClicked({ Start-Process 'https://developer.microsoft.com/microsoft-edge/webview2/' })
  $choice.Controls.Add($link)
}
$confirm = New-Object Windows.Forms.Button; $confirm.Text = '安装 Install'; $confirm.Location = New-Object Drawing.Point(508,196); $confirm.Size = New-Object Drawing.Size(180,38)
$confirm.Font = New-Object Drawing.Font($ui, 11, [Drawing.FontStyle]::Bold); Style-Button $confirm $true; $choice.Controls.Add($confirm); $form.AcceptButton = $confirm

# Space the chosen drive needs: unpacked packs (+ the program when it is copied there), plus whatever still has to
# be downloaded when the staging folder is on that same drive (packs are deleted right after they are unpacked).
function Need-Bytes($path) {
  $ids = Missing $path
  $n = (Sum $ids 'unpacked')
  try { if ([IO.Path]::GetFullPath($path).TrimEnd('\') -ine $sourceRoot) { $n += $appSize } } catch {}
  if ((Drive-Of $path) -eq (Drive-Of $stageDir)) { $n += [math]::Max(0, (Sum $want 'size') - (Stage-Bytes)) }
  [long]($n * 1.1)
}
function Update-Free {
  $f = Drive-Free $pathBox.Text; $need = Need-Bytes $pathBox.Text
  $freeLabel.Text = '所在磁盘可用 ' + (MB $f) + ' · 需要约 ' + (MB $need); $freeLabel.ForeColor = $(if ($f -lt $need) { $C.red } else { $C.muted })
}
$pathBox.add_TextChanged({ Update-Free })
$browse.add_Click({
  $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = '选择 MeguLit 的安装位置（会在里面建 MeguLit 文件夹）'; $d.ShowNewFolderButton = $true
  if ($d.ShowDialog($form) -eq 'OK') {
    $picked = $d.SelectedPath
    if ((Split-Path $picked -Leaf) -ne 'MeguLit' -and -not (Test-Path (Join-Path $picked 'MeguLit.exe'))) { $picked = Join-Path $picked 'MeguLit' }
    $pathBox.Text = $picked
  }
})

$script:fetch = $null; $script:done = $false; $script:mode = ''
# ---- download source ----
# Users in mainland China often get very slow GitHub downloads. We do not look up the user's IP
# (that would send it to a third-party geo service); the system time zone / UI language is enough
# to decide the source order. Mirrors only relay the same GitHub file; SHA-256 still has to match.
$inChina = ([TimeZoneInfo]::Local.Id -eq 'China Standard Time') -or ((Get-Culture).Name -eq 'zh-CN')
# 2026-11-19: players in China sat on dl.megulit.com (Cloudflare R2, throttled there after the first MB) at 9 / 178 MB.
# 2026-11-20: setup\runtime.json "mirrors" is the one source list for both downloaders (core\download-sources.cjs reads
# the same entries for the app): url template ({url} = the GitHub URL, {tag}/{file} = its release tag and file name),
# own (only MeguLit's own release files are there), cn / world order (only the tie-break: every source is probed in
# parallel and ranked by speed), trust (first-party: used alone after a SHA-256 mismatch), max (connections at most,
# kept low for free public relays), off (listed, not used yet). A plain string is a relay (order 2, not trusted).
function Mirror-List($mirrors) {
  $l = @(foreach ($m in @($mirrors)) {
    if ($m -is [string]) { [pscustomobject]@{ url = $m; cn = 2; world = 2; trust = $false; own = $false; max = 0 } }
    elseif ($m -and $m.url -and -not $m.off) { $m }
  })
  if (-not ($l | Where-Object { $_.url -eq '{url}' })) { $l += [pscustomobject]@{ url = '{url}'; cn = 9; world = 0; trust = $true; own = $false; max = 0 } }
  $l
}
function Mirror-Host($template) { if ($template.StartsWith('{url}')) { 'github.com' } else { ([Uri]($template -replace '\{[a-z]+\}', 'x')).Host } }
function Rank-Sources($urls, [bool]$china, $mirrors) {
  $hosts = @{}; foreach ($m in (Mirror-List $mirrors)) { $h = Mirror-Host $m.url; if (-not $hosts.ContainsKey($h)) { $hosts[$h] = $m } }
  $all = @($urls)
  $rows = for ($i = 0; $i -lt $all.Count; $i++) {
    $m = $hosts[([Uri]$all[$i]).Host]
    $r = if (-not $m) { 5 } elseif ($china) { [double]$m.cn } else { [double]$m.world }
    [pscustomobject]@{ u = $all[$i]; r = $r; i = $i }
  }
  @($rows | Sort-Object r, i | ForEach-Object { $_.u } | Select-Object -Unique)
}
function Candidates($id) {
  $list = Mirror-List $manifest.mirrors
  $urls = foreach ($u in @($packs.$id.urls)) {
    $own = $u -match '^https://github\.com/ilynthn/MeguLit/releases/download/'; $seg = $u.Split('/')
    foreach ($m in $list) { if ($own -or -not $m.own) { $m.url.Replace('{url}', $u).Replace('{tag}', $seg[-2]).Replace('{file}', $seg[-1]) } }
  }
  Rank-Sources $urls $inChina $manifest.mirrors
}
# first-party hosts and per-host connection limits for MeguFetch, from the same list
function Source-Hints($mirrors) {
  $trust = @(); $limits = @()
  foreach ($m in (Mirror-List $mirrors)) { $h = Mirror-Host $m.url; if ($m.trust) { $trust += $h }; if ($m.max -gt 0) { $limits += ($h + '=' + [int]$m.max) } }
  @{ trust = [string[]]$trust; limits = [string[]]$limits }
}
# Multi-source segmented downloader (compiled on first use, runs on background threads; the window only polls it).
# The old single WebClient stayed on whichever source answered first, even at 20 KB/s, and threw the .part away on retry.
# Now: all sources are probed at once for ~3 s, the file is fetched as 4 MB Range segments over 8 connections from the
# fastest sources, a connection far below the average or silent for 15 s is dropped and its segment goes elsewhere, and
# finished segments are listed in runtime-<id>.setup.part.json so Retry or the next launch only fetches what is missing.
# A source answering 200 instead of 206 (no Range) is only used alone, for the whole file.
# validation\setup-download.test.cjs runs this class against local throttled servers.
$fetchSource = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Security.Cryptography;

public class MeguSource {
  public string Url, Live, Host, Why;
  public int Order, Active, Strikes, Max;
  public double ProbeSpeed, Speed;
  public long ProbeBytes, Bytes, Length = -1, WinBytes, Recent;
  public int Range = -1;   /* -1 unknown, 0 no (200 only), 1 yes (206) */
  public bool Dead, Trust;
  public DateTime CoolUntil;   /* cooled down after an error until then */
}

public class MeguConn {
  public MeguSource Src; public int Seg; public long Len, Got, WinGot;
  public HttpWebRequest Req; public DateTime Started, LastData; public double RecentSpeed;
  public volatile bool Killed; public string KillWhy;
  /* end game: a duplicate of the same segment from another source; Lost = the twin won, stop writing */
  public MeguConn Twin; public bool IsDup; public volatile bool Lost; public readonly object WriteLock = new object();
  /* a segment may be split into parts in the tail: Offset/Len are this part's bytes; Settled = counted once */
  public long Offset; public bool Settled;
}

/* Downloads one file from several mirrors at once: parallel speed probe, HTTP Range segments on
   several connections (fast sources take more segments), slow or stalled connections are dropped and
   their segment goes to another source, finished segments are remembered in <part>.json so a retry or
   a restart only fetches what is missing. The whole file is checked against SHA-256 at the end.
   2026-11-20 "super assembly" (same rules as core\fast-download.cjs, after aria2's multi-source HTTP):
   - connections start at Connections (at least one per usable source) and grow by 2 every other 1.5 s window while the
     line is not full (the total still rises by ScaleGain, or the speed per connection stays above ScaleKeep of what it
     was), up to MaxConnections; after a stop it tries again 10 s later
   - each source holds a share of the connections in proportion to its speed (+1), at most MaxPerSource; slower
     sources (>= 5 % of the best) are used once the fast ones are full
   - tail: nothing left to hand out, so a free connection takes the second half of the biggest running part (down to
     MinSplit); then the end game fetches the rest of the part that would finish last again from another source into
     memory, the first to finish is written and the other is cancelled; a failed part only hands back what it had not
     written yet
   - an error cools a source down (CoolMs, doubling up to CoolMaxMs) while another one carries on; dropped for good
     only on 401/403/404/410/416, an HTML page, a wrong size, or MaxStrikes errors
   - after a SHA-256 mismatch with relays involved, the second round uses the first-party sources only (TrustedHosts) */
public class MeguFetch {
  public string[] Urls; public string Part; public long Size; public string Sha;
  public int Connections = 8, MaxConnections = 16, MaxPerSource = 8, SegmentSize = 4 << 20, ProbeMs = 3000, ProbeCapMs = 4000, StallMs = 15000, SlowGraceMs = 6000;
  public int CoolMs = 5000, CoolMaxMs = 60000, MaxStrikes = 6, DupMinMs = 1000, MinSplit = 512 << 10;
  public bool EndGame = true;
  public long ProbeMaxBytes = 16L << 20;
  public double SlowRatio = 0.3, ScaleGain = 1.08, ScaleKeep = 0.8, UseFloor = 0.05, ScaleSec = 1.5;
  public string UserAgent = "MeguLit-setup";
  /* first-party hosts (setup\runtime.json "trust"); *.megulit.com and github.com always count */
  public static string[] TrustedHosts = new string[0];
  /* "host=n": at most n connections to that host (free public relays get few) */
  public static string[] HostLimits = new string[0];
  public string[] Trusted;

  public volatile string Phase = "idle";
  public string Error = "";
  public long Resumed, ProbeElapsedMs, Steals, SlowKills, StallKills, Dups, DupWins, Cooldowns;
  public int Target, MaxTarget;
  public bool Single;
  public double TotalSpeed;
  public List<MeguSource> Sources = new List<MeguSource>();

  readonly object gate = new object();
  readonly List<MeguConn> conns = new List<MeguConn>();
  readonly LinkedList<int> pending = new LinkedList<int>();
  readonly LinkedList<long[]> retry = new LinkedList<long[]>();   /* {segment, offset, length} left by a failed part */
  int[] parts;
  readonly StringBuilder log = new StringBuilder();
  readonly DateTime t0 = DateTime.UtcNow;
  bool[] done; int segCount; long doneBytes; volatile bool cancel; string failWhy;
  Thread main;

  // read-only view for the interface layer: which segments are finished / running and how far the running ones are (changes no download behaviour)
  public void Snap(byte[] st, float[] fr) {
    lock (gate) { if (done == null) return;
      for (int i = 0; i < segCount && i < st.Length; i++) { st[i] = done[i] ? (byte)2 : (byte)0; fr[i] = done[i] ? 1f : 0f; }
      foreach (MeguConn c in conns) { if (c.IsDup || c.Lost || c.Len <= 0) continue; int i = c.Seg; if (i < 0 || i >= st.Length || done[i]) continue; st[i] = 1; fr[i] = Math.Min(1f, fr[i] + (float)c.Got / (float)SegmentSize); }
    }
  }
  public string StatePath { get { return Part + ".json"; } }
  public string LogText() { lock (log) return log.ToString(); }
  void Log(string s) { lock (log) log.AppendFormat("{0,6:0.0}s {1}\r\n", (DateTime.UtcNow - t0).TotalSeconds, s); }

  public long Received {
    get { lock (gate) { long n = doneBytes; foreach (MeguConn c in conns) if (!c.IsDup && !c.Lost) n += Interlocked.Read(ref c.Got); return Math.Min(n, Size); } }
  }
  public string SourceLabel() {
    lock (gate) {
      MeguSource top = null; int busy = 0;
      foreach (MeguSource s in Sources) {
        if (s.Active == 0 && s.Recent == 0) continue;
        if (s.Active > 0) busy++;
        if (top == null || s.Recent > top.Recent || (s.Recent == top.Recent && s.Bytes > top.Bytes)) top = s;
      }
      if (top == null) return "";
      return busy > 1 ? top.Host + " 等 " + busy + " 个源" : top.Host;
    }
  }

  public void Start() {
    main = new Thread(Run); main.IsBackground = true; main.Start();
  }
  public void Cancel() {
    cancel = true;
    lock (gate) { foreach (MeguConn c in conns) Kill(c, "cancel"); Monitor.PulseAll(gate); }
  }
  public bool Wait(int ms) { return main == null || main.Join(ms); }

  void Run() {
    FileStream held = null;
    try {
      /* Two setup windows on one folder must not write the same file: the second one takes its own. */
      for (int k = 0; held == null; k++) {
        string p = k == 0 ? Part : Part + "-" + k;
        try { held = new FileStream(p + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose); Part = p; }
        catch (IOException) { if (k >= 20) throw; }
      }
      if (ServicePointManager.DefaultConnectionLimit < 64) ServicePointManager.DefaultConnectionLimit = 64;
      segCount = (int)((Size + SegmentSize - 1) / SegmentSize);
      for (int i = 0; i < Urls.Length; i++) {
        MeguSource s = new MeguSource(); s.Url = Urls[i]; s.Live = Urls[i]; s.Host = new Uri(Urls[i]).Authority; s.Order = i; s.Trust = IsTrusted(s.Url); s.Max = LimitOf(s.Url); Sources.Add(s);
      }
      for (int round = 0; round < 2; round++) {
        LoadState();
        bool complete = Resumed == Size;
        if (!complete) {
          if (round == 0) Probe();
          if (cancel) { Phase = "cancelled"; return; }
          Phase = "download";
          if (HasRangeSource()) Segmented();
          if (!cancel && failWhy == null && doneBytes < Size) WholeFile();
          if (cancel) { Phase = "cancelled"; return; }
          if (failWhy != null || doneBytes < Size) { Fail(failWhy ?? "所有下载源都失败了"); return; }
        }
        Phase = "verify";
        string hash = Hash();
        if (hash == Sha.ToUpperInvariant()) { TryDelete(StatePath); Log("sha256 ok"); Phase = "done"; return; }
        Log("sha256 mismatch " + hash + (round == 0 ? ", downloading again from scratch" : ""));
        TryDelete(StatePath); TryDelete(Part);
        if (round == 1) { Fail("文件校验失败，可能下载不完整"); return; }
        /* a relay may have served a different file: with a first-party source still there, the relays sit out */
        bool relays = false, firsts = false;
        foreach (MeguSource s in Sources) { if (!s.Trust && s.Bytes > 0) relays = true; if (s.Trust && !s.Dead) firsts = true; }
        if (relays && firsts) foreach (MeguSource s in Sources) if (!s.Trust && !s.Dead) { s.Dead = true; s.Why = "not first-party, after a hash mismatch"; Log(s.Host + " dropped: " + s.Why); }
        foreach (MeguSource s in Sources) { s.CoolUntil = DateTime.MinValue; s.Bytes = 0; }
      }
    } catch (Exception e) { if (cancel) Phase = "cancelled"; else Fail(e.Message); }
    finally { if (held != null) held.Dispose(); }
  }
  void Fail(string why) { Error = why; Log("failed: " + why); Phase = "failed"; }
  static int LimitOf(string url) {
    Uri u = new Uri(url);
    if (HostLimits != null) foreach (string l in HostLimits) { int k = l == null ? -1 : l.LastIndexOf('='); int n; if (k > 0 && (string.Equals(l.Substring(0, k), u.Host, StringComparison.OrdinalIgnoreCase) || string.Equals(l.Substring(0, k), u.Authority, StringComparison.OrdinalIgnoreCase)) && int.TryParse(l.Substring(k + 1), out n)) return n; }
    return 0;
  }
  bool IsTrusted(string url) {
    string h = new Uri(url).Host.ToLowerInvariant();
    if (h == "github.com" || h.EndsWith(".githubusercontent.com") || h == "megulit.com" || h.EndsWith(".megulit.com")) return true;
    foreach (string[] list in new string[][] { TrustedHosts, Trusted }) if (list != null) foreach (string t in list) if (t != null && (string.Equals(t, h, StringComparison.OrdinalIgnoreCase) || string.Equals(t, url, StringComparison.OrdinalIgnoreCase))) return true;
    return false;
  }

  /* ---------- resume state ---------- */
  void LoadState() {
    done = new bool[segCount]; parts = new int[segCount]; retry.Clear(); doneBytes = 0; Resumed = 0; Single = false; failWhy = null;
    try {
      if (File.Exists(StatePath) && File.Exists(Part) && new FileInfo(Part).Length == Size) {
        string j = File.ReadAllText(StatePath);
        if (Num(j, "size") == Size && Num(j, "segment") == SegmentSize && Str(j, "sha256") == Sha.ToUpperInvariant()) {
          foreach (Match m in Regex.Matches(Str(j, "done"), @"\d+")) { int k = int.Parse(m.Value); if (k < segCount && !done[k]) { done[k] = true; doneBytes += SegLen(k); } }
        }
      }
    } catch { }
    Resumed = doneBytes;
    if (doneBytes == 0) {
      for (int i = 0; ; i++) {
        try { using (FileStream f = new FileStream(Part, FileMode.Create, FileAccess.Write, FileShare.ReadWrite)) f.SetLength(Size); break; }
        catch (IOException) { if (i >= 30) throw; Thread.Sleep(500); }
      }
      TryDelete(StatePath);
    } else Log("resume: " + doneBytes + " of " + Size + " bytes already here");
    pending.Clear();
    for (int i = 0; i < segCount; i++) if (!done[i]) pending.AddLast(i);
  }
  void SaveState() {
    StringBuilder d = new StringBuilder();
    for (int i = 0; i < segCount; i++) if (done[i]) { if (d.Length > 0) d.Append(','); d.Append(i); }
    try { File.WriteAllText(StatePath, "{\"size\":" + Size + ",\"segment\":" + SegmentSize + ",\"sha256\":\"" + Sha.ToUpperInvariant() + "\",\"done\":\"" + d + "\"}"); } catch { }
  }
  static long Num(string j, string k) { Match m = Regex.Match(j, "\"" + k + "\"\\s*:\\s*(\\d+)"); return m.Success ? long.Parse(m.Groups[1].Value) : -1; }
  static string Str(string j, string k) { Match m = Regex.Match(j, "\"" + k + "\"\\s*:\\s*\"([^\"]*)\""); return m.Success ? m.Groups[1].Value : ""; }
  long SegLen(int k) { return Math.Min(Size, (long)(k + 1) * SegmentSize) - (long)k * SegmentSize; }
  static void TryDelete(string p) { try { if (File.Exists(p)) File.Delete(p); } catch { } }

  /* ---------- parallel probe ---------- */
  HttpWebRequest Make(string url) {
    HttpWebRequest r = (HttpWebRequest)WebRequest.Create(url);
    r.UserAgent = UserAgent; r.Timeout = StallMs; r.ReadWriteTimeout = StallMs; r.KeepAlive = true;
    return r;
  }
  static int StatusOf(WebException e) { HttpWebResponse r = e.Response as HttpWebResponse; return r == null ? 0 : (int)r.StatusCode; }
  static long TotalFromContentRange(string cr) { if (cr == null) return -1; Match m = Regex.Match(cr, @"/(\d+)"); return m.Success ? long.Parse(m.Groups[1].Value) : -1; }

  void Probe() {
    Phase = "probe";
    List<HttpWebRequest> reqs = new List<HttpWebRequest>();
    List<Thread> threads = new List<Thread>();
    DateTime start = DateTime.UtcNow;
    int running = Sources.Count;
    foreach (MeguSource src in Sources) {
      MeguSource s = src;
      HttpWebRequest req = Make(s.Url); req.Timeout = ProbeCapMs; req.ReadWriteTimeout = ProbeCapMs; req.AddRange(0L);
      lock (reqs) reqs.Add(req);
      Thread t = new Thread(delegate() {
        try {
          using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) {
            s.Live = res.ResponseUri.AbsoluteUri;
            if ((int)res.StatusCode == 206) { s.Range = 1; s.Length = TotalFromContentRange(res.Headers["Content-Range"]); }
            else { s.Range = 0; s.Length = res.ContentLength; }
            if ((res.ContentType ?? "").StartsWith("text/html", StringComparison.OrdinalIgnoreCase)) { s.Dead = true; s.Why = "HTML page"; return; }
            Stream st = res.GetResponseStream(); byte[] buf = new byte[65536];
            while ((DateTime.UtcNow - start).TotalMilliseconds < ProbeMs && Interlocked.Read(ref s.ProbeBytes) < ProbeMaxBytes) {
              int n = st.Read(buf, 0, buf.Length); if (n <= 0) break; Interlocked.Add(ref s.ProbeBytes, n);
            }
            double sec = Math.Max(0.05, (DateTime.UtcNow - start).TotalSeconds);
            s.ProbeSpeed = s.ProbeBytes / sec;
          }
        } catch (WebException e) {
          int code = StatusOf(e);
          if (code >= 400) { s.Dead = true; s.Why = "HTTP " + code; }
          else if (s.ProbeBytes > 0) s.ProbeSpeed = s.ProbeBytes / Math.Max(0.05, (DateTime.UtcNow - start).TotalSeconds);
          else s.Why = e.Status.ToString();
        } catch (Exception e) { if (s.ProbeBytes == 0) s.Why = e.Message; }
        finally { try { req.Abort(); } catch { } Interlocked.Decrement(ref running); }
      });
      t.IsBackground = true; threads.Add(t); t.Start();
    }
    while (running > 0 && !cancel && (DateTime.UtcNow - start).TotalMilliseconds < ProbeMs + 150) Thread.Sleep(30);
    /* A source still connecting or mid-read gets scored on what it managed so far, then its request is dropped. */
    foreach (MeguSource s in Sources) if (s.ProbeSpeed == 0 && s.ProbeBytes > 0) s.ProbeSpeed = s.ProbeBytes / Math.Max(0.05, (DateTime.UtcNow - start).TotalSeconds);
    lock (reqs) foreach (HttpWebRequest r in reqs) { try { r.Abort(); } catch { } }
    foreach (Thread t in threads) t.Join(Math.Max(0, ProbeCapMs - (int)(DateTime.UtcNow - start).TotalMilliseconds));
    ProbeElapsedMs = (long)(DateTime.UtcNow - start).TotalMilliseconds;
    foreach (MeguSource s in Sources) {
      if (!s.Dead && Size > 0 && s.Length > 0 && s.Length != Size) { s.Dead = true; s.Why = "size " + s.Length; }
      s.Speed = s.ProbeSpeed;
      Log(string.Format("probe {0}: {1:0.00} MB/s range={2}{3}", s.Host, s.ProbeSpeed / 1048576, s.Range, s.Dead ? " dead " + s.Why : (s.Why != null ? " (" + s.Why + ")" : "")));
    }
  }

  /* ---------- segmented download ---------- */
  bool HasRangeSource() { lock (gate) { foreach (MeguSource s in Sources) if (!s.Dead && s.Range != 0) return true; return false; } }
  bool Cooling(MeguSource s) { return s.CoolUntil > DateTime.UtcNow; }
  bool Usable(MeguSource s) { return !s.Dead && s.Range != 0 && !Cooling(s); }
  double BestSpeed() { double b = 0; foreach (MeguSource s in Sources) if (Usable(s) && s.Speed > b) b = s.Speed; return b; }
  /* A source's share of the connections follows its speed; one back from a cool-down gets one until it delivers. Caller holds gate. */
  int CapOf(MeguSource s) {
    if (s.Strikes > 0) return 1;
    double sum = 0; foreach (MeguSource x in Sources) if (Usable(x)) sum += Math.Max(1.0, x.Speed);
    if (sum <= 0) return 1;
    return Math.Max(1, Math.Min(s.Max > 0 ? Math.Min(s.Max, MaxPerSource) : MaxPerSource, (int)Math.Ceiling(Target * Math.Max(1.0, s.Speed) / sum) + 1));
  }
  /* Fast sources first; slower ones (>= UseFloor of the best) only once the fast ones are full. Caller holds gate. */
  MeguSource Pick(MeguSource not) {
    double best = BestSpeed();
    for (int pass = 0; pass < 2; pass++) {
      MeguSource pick = null; double score = -1;
      foreach (MeguSource s in Sources) {
        if (s == not || !Usable(s) || s.Active >= CapOf(s)) continue;
        if (s.Speed < best * (pass == 0 ? SlowRatio : UseFloor)) continue;
        double sc = s.Speed / (1 + 0.6 * s.Active);
        if (sc > score || (sc == score && pick != null && s.Order < pick.Order)) { score = sc; pick = s; }
      }
      if (pick != null) return pick;
    }
    return null;
  }
  bool OthersAlive(MeguSource me) { foreach (MeguSource s in Sources) if (s != me && !s.Dead && s.Range != 0) return true; return false; }
  bool OthersUsable(MeguSource me) { foreach (MeguSource s in Sources) if (s != me && Usable(s)) return true; return false; }
  int Busy() { int n = 0; foreach (MeguSource s in Sources) n += s.Active; return n; }
  void Kill(MeguConn c, string why) {
    if (c.Killed) return; c.KillWhy = why; c.Killed = true;
    HttpWebRequest r = c.Req; if (r != null) { try { r.Abort(); } catch { } }
  }
  /* An error: cool the source down while another one can carry on (alone it is asked again after a second); dropped after MaxStrikes. Caller holds gate. */
  void Strike(MeguSource s, string why) {
    s.Strikes++; s.Speed *= 0.5;
    bool others = OthersAlive(s);
    if (s.Strikes >= (others ? MaxStrikes : MaxStrikes * 2)) { s.Dead = true; s.Why = "too many errors (" + why + ")"; Log(s.Host + " dropped: " + s.Why); return; }
    int ms = OthersUsable(s) ? Math.Min(CoolMaxMs, CoolMs << Math.Min(10, s.Strikes - 1)) : Math.Min(1000, CoolMs);
    s.CoolUntil = DateTime.UtcNow.AddMilliseconds(ms); Cooldowns++;
    Log(string.Format("{0} cools down {1:0.0} s ({2})", s.Host, ms / 1000.0, why));
  }

  void Segmented() {
    int usable = 0; lock (gate) foreach (MeguSource s in Sources) if (!s.Dead && s.Range != 0) usable++;
    Target = Math.Max(1, Math.Min(Math.Max(Connections, usable), MaxConnections)); MaxTarget = Target;
    int workers = Math.Max(Target, MaxConnections);
    List<Thread> ts = new List<Thread>();
    for (int i = 0; i < workers; i++) { Thread t = new Thread(Worker); t.IsBackground = true; ts.Add(t); t.Start(i); }
    DateTime win = DateTime.UtcNow, growAt = DateTime.MinValue; long winDone = doneBytes; double lastScale = -1, lastPer = -1; bool skip = false;
    while (true) {
      bool alive = false; foreach (Thread t in ts) if (t.IsAlive) alive = true;
      if (!alive) break;
      Thread.Sleep(250);
      lock (gate) {
        DateTime now = DateTime.UtcNow;
        double sec = (now - win).TotalSeconds;
        if (sec >= ScaleSec) {
          long rec = doneBytes; foreach (MeguConn c in conns) if (!c.IsDup) rec += c.Got;
          TotalSpeed = Math.Max(0, rec - winDone) / sec; winDone = rec;
          foreach (MeguSource s in Sources) { s.Recent = s.WinBytes; s.WinBytes = 0; }
          foreach (MeguConn c in conns) { c.RecentSpeed = c.WinGot / Math.Max(0.25, (now - (c.Started > win ? c.Started : win)).TotalSeconds); c.WinGot = 0; }
          /* a source's speed follows its running connections too: one that slowed down mid-segment stops getting new work at once */
          foreach (MeguSource s in Sources) {
            double sum = 0; int k = 0; foreach (MeguConn c in conns) if (c.Src == s && !c.IsDup && !c.Killed && (now - c.Started).TotalSeconds >= 1) { sum += c.RecentSpeed; k++; }
            if (k > 0) s.Speed = s.Speed * 0.5 + (sum / k) * 0.5;
          }
          win = now;
          /* more connections while that still makes the whole download faster (the window right after a step only settles) */
          int live = 0; foreach (MeguConn c in conns) if (!c.IsDup) live++;
          double per = TotalSpeed / Math.Max(1, live);
          if (skip) skip = false;
          else if (now >= growAt && Target < MaxConnections && (pending.Count > 0 || retry.Count > 0 || Splittable())) {
            if (lastScale < 0 || TotalSpeed >= lastScale * ScaleGain || per >= lastPer * ScaleKeep) { lastScale = TotalSpeed; lastPer = per; Target = Math.Min(MaxConnections, Target + 2); MaxTarget = Math.Max(MaxTarget, Target); skip = true; Log(string.Format("connections {0} ({1:0.00} MB/s)", Target, TotalSpeed / 1048576)); Monitor.PulseAll(gate); }
            else { growAt = now.AddSeconds(10); lastScale = -1; Log(string.Format("connections stay {0} ({1:0.00} MB/s)", Target, TotalSpeed / 1048576)); }
          }
        }
        foreach (MeguConn c in conns) {
          if (c.Killed) continue;
          if ((now - c.LastData).TotalMilliseconds > StallMs) { StallKills++; Kill(c, "stall"); continue; }
          if (c.IsDup || HasTwin(c) || (now - c.Started).TotalMilliseconds <= SlowGraceMs || c.Len - c.Got <= 256 * 1024) continue;
          /* slow = far below the other connections to the same source, or far below a faster source that has room */
          double same = 0; int k = 0; foreach (MeguConn o in conns) if (o != c && o.Src == c.Src && !o.IsDup && !o.Killed) { same += o.RecentSpeed; k++; }
          same = k > 0 ? same / k : 0;
          double free = 0; foreach (MeguSource s in Sources) if (s != c.Src && Usable(s) && s.Active < CapOf(s) && s.Speed > free) free = s.Speed;
          /* with work still waiting, a connection far below the average one gives its slot (and its unwritten bytes) back */
          double avg = 0; int na = 0; if (pending.Count > 0 || retry.Count > 0) foreach (MeguConn o in conns) if (o != c && !o.IsDup && !o.Killed) { avg += o.RecentSpeed; na++; }
          avg = na > 0 ? avg / na : 0;
          if (c.RecentSpeed < Math.Max(Math.Max(same, free), avg) * SlowRatio) { SlowKills++; Kill(c, "slow"); }
        }
      }
    }
    lock (gate) { if (!cancel && doneBytes < Size && failWhy == null && HasRangeSource()) failWhy = "所有下载源都失败了"; }
  }

  /* An exception on a worker thread would end the whole setup process: it fails the download instead. */
  void Worker(object idObj) {
    try { WorkerLoop((int)idObj); }
    catch (Exception e) { lock (gate) { if (failWhy == null && !cancel) failWhy = "下载线程出错：" + e.Message; Log("worker crashed: " + e); Monitor.PulseAll(gate); } }
  }
  void WorkerLoop(int id) {
    while (true) {
      MeguConn c = null;
      lock (gate) {
        while (true) {
          if (cancel || failWhy != null || doneBytes >= Size) { Monitor.PulseAll(gate); return; }
          if (id >= Target) { if (Busy() == 0 && pending.Count == 0) return; Monitor.Wait(gate, 300); continue; }
          MeguSource s = Pick(null);
          if (retry.Count > 0 && s != null) {
            /* the rest of a part whose connection failed */
            long[] r = retry.First.Value; retry.RemoveFirst();
            c = new MeguConn(); c.Src = s; c.Seg = (int)r[0]; c.Offset = r[1]; c.Len = r[2]; c.Started = c.LastData = DateTime.UtcNow;
            s.Active++; conns.Add(c); break;
          }
          if (pending.Count > 0 && s != null) {
            int seg = pending.First.Value; pending.RemoveFirst();
            c = new MeguConn(); c.Src = s; c.Seg = seg; c.Offset = (long)seg * SegmentSize; c.Len = SegLen(seg); c.Started = c.LastData = DateTime.UtcNow;
            parts[seg] = 1;
            s.Active++; conns.Add(c); break;
          }
          /* tail: split the biggest running part in two, then race the slowest remainder from another source */
          if (pending.Count == 0 && retry.Count == 0 && s != null) {
            c = Split(s); if (c != null) break;
            if (EndGame) { c = Dup(); if (c != null) break; }
          }
          if (Busy() == 0 && (pending.Count > 0 || retry.Count > 0) && s == null) {
            /* every source cooling down: wait; every source gone: give up */
            if (!HasRangeSource()) return;
            bool cool = false; foreach (MeguSource x in Sources) if (!x.Dead && x.Range != 0 && Cooling(x)) cool = true;
            if (!cool) { failWhy = "所有下载源都失败了"; Monitor.PulseAll(gate); return; }
          }
          if (Busy() == 0 && pending.Count == 0 && retry.Count == 0 && doneBytes < Size) return;
          Monitor.Wait(gate, 300);
        }
      }
      Fetch(c);
    }
  }
  /* Tail (aria2 style): the running part with the most bytes left gives its second half to a free connection. Caller holds gate. */
  MeguConn Split(MeguSource s) {
    MeguConn big = null; long left = 0;
    foreach (MeguConn c in conns) {
      if (c.Killed || c.IsDup || HasTwin(c) || c.Lost || c.Seg < 0) continue;
      long l = c.Len - Interlocked.Read(ref c.Got); if (l > left) { left = l; big = c; }
    }
    if (big == null || left < 2L * MinSplit) return null;
    MeguConn d;
    lock (big.WriteLock) {
      long got = Interlocked.Read(ref big.Got), rest = big.Len - got; if (rest < 2L * MinSplit) return null;
      long keep = got + ((rest / 2 + 65535) / 65536) * 65536;
      d = new MeguConn(); d.Src = s; d.Seg = big.Seg; d.Offset = big.Offset + keep; d.Len = big.Len - keep;
      big.Len = keep;
    }
    d.Started = d.LastData = DateTime.UtcNow; parts[d.Seg]++; s.Active++; conns.Add(d); Steals++;
    return d;
  }
  /* End game: the remainder of the part that would finish last is fetched again from another source. Caller holds gate. */
  MeguConn Dup() {
    MeguConn worst = null; double worstEta = 0; DateTime now = DateTime.UtcNow;
    foreach (MeguConn c in conns) {
      if (c.Killed || c.IsDup || HasTwin(c) || c.Lost || c.Seg < 0 || (now - c.Started).TotalMilliseconds < DupMinMs) continue;
      double sp = c.RecentSpeed > 0 ? c.RecentSpeed : c.Got / Math.Max(0.05, (now - c.Started).TotalSeconds);
      double eta = (c.Len - c.Got) / Math.Max(1.0, sp);
      if (eta > worstEta) { worstEta = eta; worst = c; }
    }
    if (worst == null || worstEta * 1000 < DupMinMs) return null;
    MeguSource s = Pick(worst.Src) ?? Pick(null);
    if (s == null) return null;
    MeguConn d = new MeguConn();
    lock (worst.WriteLock) { long got = Interlocked.Read(ref worst.Got); d.Offset = worst.Offset + got; d.Len = worst.Len - got; }
    if (d.Len <= 0 || d.Len / Math.Max(1.0, s.Speed) + 0.3 > worstEta) return null;
    d.Src = s; d.Seg = worst.Seg; d.IsDup = true; d.Twin = worst; worst.Twin = d;
    d.Started = d.LastData = now; s.Active++; conns.Add(d); Dups++;
    Log(string.Format("end game: seg {0} rest also from {1} (eta {2:0.0} s on {3})", d.Seg, s.Host, worstEta, worst.Src.Host));
    return d;
  }
  bool Splittable() { foreach (MeguConn c in conns) if (!c.Killed && !c.IsDup && !c.Lost && c.Seg >= 0 && c.Len - c.Got >= 2L * MinSplit) return true; return false; }
  bool HasTwin(MeguConn c) { return c.Twin != null && conns.Contains(c.Twin); }
  /* A part is finished (written by its own connection or by the end-game copy); a segment is done when all its parts are. Caller holds gate. */
  void PartDone(MeguConn part) {
    if (part.Settled) return; part.Settled = true;
    int k = part.Seg; doneBytes += part.Len;
    if (--parts[k] == 0 && !done[k]) { done[k] = true; SaveState(); }
  }
  /* A part failed and no copy of it is still running: what it wrote counts, the rest goes back as a part of its own. Caller holds gate. */
  void PartFailed(MeguConn part) {
    if (part.Settled) return; part.Settled = true;
    int k = part.Seg; long got = Math.Min(Interlocked.Read(ref part.Got), part.Len); doneBytes += got;
    if (got < part.Len) retry.AddFirst(new long[] { k, part.Offset + got, part.Len - got });
    else if (--parts[k] == 0 && !done[k]) { done[k] = true; SaveState(); }
  }

  void Fetch(MeguConn c) {
    MeguSource s = c.Src; long start = c.Offset, reqLen = c.Len; string err = null; int code = 0; bool wrongSize = false, noRange = false, timedOut = false, won = false;
    string used = s.Live;
    try {
      HttpWebRequest req = Make(used); req.AddRange(start, start + reqLen - 1);
      lock (gate) { if (c.Killed) throw new WebException("killed"); c.Req = req; }
      using (HttpWebResponse res = (HttpWebResponse)req.GetResponse()) {
        if ((int)res.StatusCode != 206) { noRange = true; throw new WebException("no range (HTTP " + (int)res.StatusCode + ")"); }
        if ((res.ContentType ?? "").StartsWith("text/html", StringComparison.OrdinalIgnoreCase)) { wrongSize = true; throw new WebException("HTML page instead of the file"); }
        string cr = res.Headers["Content-Range"] ?? "";
        Match m = Regex.Match(cr, @"bytes\s+(\d+)-(\d+)/(\d+)");
        if (!m.Success || long.Parse(m.Groups[1].Value) != start || long.Parse(m.Groups[2].Value) != start + reqLen - 1 || long.Parse(m.Groups[3].Value) != Size) { wrongSize = true; throw new WebException("bad Content-Range " + cr); }
        s.Live = res.ResponseUri.AbsoluteUri;
        byte[] buf = new byte[65536];
        using (Stream st = res.GetResponseStream()) {
          if (c.IsDup) {
            /* end-game copy: kept in memory, written only if it wins */
            byte[] all = new byte[c.Len];
            while (c.Got < c.Len) {
              int n = st.Read(all, (int)c.Got, (int)Math.Min(65536, c.Len - c.Got)); if (n <= 0) break;
              lock (gate) { c.Got += n; c.WinGot += n; s.WinBytes += n; s.Bytes += n; c.LastData = DateTime.UtcNow; }
              if (c.Killed) break;
            }
            if (c.Got != c.Len) throw new WebException(c.Killed ? c.KillWhy : "short read");
            MeguConn o = c.Twin;
            lock (gate) { won = o != null && !o.Settled && !c.Killed; if (won) lock (o.WriteLock) { o.Lost = true; } }
            if (won) {
              lock (gate) Kill(o, "lost");
              using (FileStream f = new FileStream(Part, FileMode.Open, FileAccess.Write, FileShare.ReadWrite, 1 << 16)) { f.Seek(start, SeekOrigin.Begin); f.Write(all, 0, all.Length); f.Flush(true); }
            }
          } else {
            using (FileStream f = new FileStream(Part, FileMode.Open, FileAccess.Write, FileShare.ReadWrite, 1 << 16)) {
              f.Seek(start, SeekOrigin.Begin);
              while (true) {
                long room = c.Len - c.Got; if (room <= 0) break;
                int n = st.Read(buf, 0, (int)Math.Min(buf.Length, room)); if (n <= 0) break;
                /* a split may have shortened this part while the read was running */
                lock (c.WriteLock) { if (c.Lost) break; n = (int)Math.Min(n, c.Len - c.Got); if (n <= 0) break; f.Write(buf, 0, n); }
                lock (gate) { c.Got += n; c.WinGot += n; s.WinBytes += n; s.Bytes += n; c.LastData = DateTime.UtcNow; }
                if (c.Got >= c.Len) break;
              }
              f.Flush(true);
            }
            if (c.Got != c.Len && !c.Lost) throw new WebException("short read");
          }
        }
        /* the rest of a shortened part is not wanted */
        if (c.Len < reqLen) { try { req.Abort(); } catch { } }
      }
    } catch (WebException e) { err = e.Message; code = StatusOf(e); timedOut = e.Status == WebExceptionStatus.Timeout; }
    catch (Exception e) { err = e.Message; }
    lock (gate) {
      s.Active--; conns.Remove(c);
      MeguConn twin = c.Twin; bool twinRuns = twin != null && conns.Contains(twin) && !twin.Killed;
      double sec = Math.Max(0.05, (DateTime.UtcNow - c.Started).TotalSeconds);
      if (c.Lost) {
        /* the end-game copy won and wrote the rest of this part */
      } else if (err == null && !c.IsDup) {
        PartDone(c);
        if (twinRuns) Kill(twin, "lost race");
        s.Speed = s.Speed <= 0 ? c.Len / sec : s.Speed * 0.6 + (c.Len / sec) * 0.4; s.Range = 1;
        if (s.Strikes > 0) s.Strikes--;
      } else if (err == null && won) {
        PartDone(twin); DupWins++; Log("seg " + c.Seg + " rest won by " + s.Host);
        s.Speed = s.Speed <= 0 ? c.Len / sec : s.Speed * 0.6 + (c.Len / sec) * 0.4;
        if (s.Strikes > 0) s.Strikes--;
      } else if (err == null) {
        /* end-game copy finished second: nothing to do */
      } else {
        /* a copy that failed hands its part back only when the part's own connection is gone too (or it had stopped that one) */
        if (c.IsDup) { if (twin != null && (won || !twinRuns)) PartFailed(twin); }
        else if (!twinRuns) PartFailed(c);
        /* else: the end-game copy still runs and settles this part */
        if (c.Killed) {
          if (c.KillWhy == "slow") s.Speed = Math.Min(s.Speed, Math.Max(c.RecentSpeed, c.Got / sec));
          if (c.KillWhy == "stall") { s.Speed *= 0.4; Strike(s, "stall"); }
          if (c.KillWhy != "cancel" && c.KillWhy != "lost race" && c.KillWhy != "lost") Log("seg " + c.Seg + " " + c.KillWhy + " on " + s.Host + string.Format(" ({0:0.00} MB/s)", c.RecentSpeed / 1048576));
        } else if (timedOut) { StallKills++; s.Speed *= 0.4; Log("seg " + c.Seg + " stall on " + s.Host + " (no data for " + StallMs / 1000 + " s)"); Strike(s, "stall"); }
        else if (noRange) { s.Range = 0; Log(s.Host + ": no Range support"); }
        else if (wrongSize || code == 401 || code == 404 || code == 403 || code == 410 || code == 416) { s.Dead = true; s.Why = code > 0 ? "HTTP " + code : err; Log(s.Host + " dropped: " + s.Why); }
        else if (used != s.Url) { s.Live = s.Url; Log(s.Host + ": redirect target failed, back to " + s.Url); }
        else { Log("seg " + c.Seg + " error on " + s.Host + ": " + err); Strike(s, code > 0 ? "HTTP " + code : err); }
      }
      Monitor.PulseAll(gate);
    }
  }

  /* ---------- sources without Range: one connection, whole file ---------- */
  void WholeFile() {
    List<MeguSource> list = new List<MeguSource>();
    foreach (MeguSource s in Sources) if (!s.Dead && s.Range == 0) list.Add(s);
    list.Sort(delegate(MeguSource a, MeguSource b) { int k = b.Speed.CompareTo(a.Speed); return k != 0 ? k : a.Order.CompareTo(b.Order); });
    if (list.Count == 0) return;
    Single = true; failWhy = null;
    foreach (MeguSource s in list) {
      if (cancel) return;
      lock (gate) { doneBytes = 0; for (int i = 0; i < segCount; i++) done[i] = false; pending.Clear(); }
      TryDelete(StatePath);
      MeguConn c = new MeguConn(); c.Src = s; c.Seg = -1; c.Len = Size; c.Started = c.LastData = DateTime.UtcNow;
      lock (gate) { s.Active++; conns.Add(c); }
      string err = null; bool[] over = new bool[1];
      Thread dog = new Thread(delegate() {
        while (!c.Killed && !over[0]) {
          Thread.Sleep(250);
          lock (gate) { if ((DateTime.UtcNow - c.LastData).TotalMilliseconds > StallMs) { StallKills++; Kill(c, "stall"); } TotalSpeed = s.Speed; }
        }
      });
      dog.IsBackground = true; dog.Start();
      try {
        HttpWebRequest req = Make(s.Url);
        lock (gate) { if (c.Killed) throw new WebException("killed"); c.Req = req; }
        using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
        using (Stream st = res.GetResponseStream())
        using (FileStream f = new FileStream(Part, FileMode.Create, FileAccess.Write, FileShare.ReadWrite, 1 << 16)) {
          byte[] buf = new byte[65536];
          while (true) {
            int n = st.Read(buf, 0, buf.Length); if (n <= 0) break;
            f.Write(buf, 0, n);
            lock (gate) { c.Got += n; s.WinBytes += n; s.Bytes += n; c.LastData = DateTime.UtcNow; s.Speed = c.Got / Math.Max(0.05, (DateTime.UtcNow - c.Started).TotalSeconds); }
            if (c.Got > Size) throw new WebException("file larger than expected");
          }
        }
        if (c.Got != Size) throw new WebException("short read");
      } catch (Exception e) { err = c.Killed ? c.KillWhy : e.Message; }
      over[0] = true;
      lock (gate) { s.Active--; conns.Remove(c); if (err == null) { doneBytes = Size; for (int i = 0; i < segCount; i++) done[i] = true; } }
      if (err == null) return;
      Log("whole-file " + s.Host + " failed: " + err);
      if (cancel) return;
      s.Dead = true; s.Why = err;
    }
    failWhy = "所有下载源都失败了";
  }

  string Hash() {
    for (int i = 0; ; i++) {
      try {
        using (FileStream f = new FileStream(Part, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 20))
        using (SHA256 h = SHA256.Create()) return BitConverter.ToString(h.ComputeHash(f)).Replace("-", "");
      } catch (IOException) { if (i >= 30) throw; Thread.Sleep(500); }
    }
  }
}
'@
function Ensure-Engine {
  if (-not ('MeguFetch' -as [type])) { Add-Type -TypeDefinition $fetchSource }
  $h = Source-Hints $manifest.mirrors; [MeguFetch]::TrustedHosts = $h.trust; [MeguFetch]::HostLimits = $h.limits
}

# ---- download queue (starts with the window) ----
# dl = packs to fetch in order; ready = verified packs waiting to be unpacked; a pack is unpacked only after Install.
# A finished pack gets <part>.ok (its SHA-256), so a window closed after a pack completed does not fetch it again.
$script:dl = New-Object Collections.ArrayList; foreach ($id in $want) { [void]$script:dl.Add($id) }
$script:dlPos = 0; $script:fetchId = ''; $script:ready = New-Object Collections.ArrayList; $script:fetched = 0L
$script:confirmed = $false; $script:busy = $false; $script:copying = $false; $script:failKind = ''; $script:installLine = ''
function Part($id) { Join-Path $stageDir ("runtime-$id.setup.part") }
function Ok-Part($id) {
  $p = Part $id
  try { (Test-Path ($p + '.ok')) -and (Test-Path $p) -and (Get-Item $p).Length -eq [long]$packs.$id.size -and (Get-Content -Raw ($p + '.ok')).Trim() -eq ([string]$packs.$id.sha256).ToUpperInvariant() } catch { $false }
}
function Stage-Bytes {
  $n = 0L
  foreach ($id in $want) { $p = Part $id; if (Ok-Part $id) { $n += [long]$packs.$id.size } elseif (Test-Path ($p + '.json')) { try { $j = Get-Content -Raw ($p + '.json'); $m = [regex]::Match($j, '"done":"([^"]*)"'); $s = [long][regex]::Match($j, '"segment":(\d+)').Groups[1].Value; $n += $s * @($m.Groups[1].Value.Split(',') | Where-Object { $_ }).Count } catch {} } }
  $n
}
function Total-Bytes { $t = 0L; foreach ($id in $script:dl) { $t += [long]$packs.$id.size }; $t }
function Got-Bytes { $n = $script:fetched; if ($script:fetch) { $n += $script:fetch.Received }; $n }
function Downloads-Done { $script:dlPos -ge $script:dl.Count -and -not $script:fetch }

function Show-State {
  if ($script:mode -eq 'failed') { return }
  $title.Text = if ($script:copying) { '正在复制 MeguLit…' }
    elseif ($script:busy) { '正在安装运行组件…' }
    elseif (Downloads-Done) { if ($script:confirmed) { '正在安装运行组件…' } else { '下载好了，点「安装」就开始装' } }
    elseif ($script:confirmed) { '正在下载运行组件…（下完自动安装）' }
    else { '正在下载运行组件…' }
}

function Next-Download {
  while ($script:dlPos -lt $script:dl.Count -and (Ok-Part $script:dl[$script:dlPos])) {
    $id = $script:dl[$script:dlPos]; [void]$script:ready.Add(@{ id = $id; part = (Part $id) }); $script:fetched += [long]$packs.$id.size; $script:dlPos++
    Note 'downloaded' @{ id = $id; reused = $true }
  }
  if ($script:dlPos -ge $script:dl.Count) {
    Set-Bar 1000; $status.Text = ('运行组件都下载好了（{0}）' -f (MB (Total-Bytes))) + $script:installLine; Note 'all-downloaded' @{}
    UI-Progress @{ phase = 'waiting'; count = $script:dl.Count; total = (Total-Bytes); totalGot = (Total-Bytes) }
    Show-State; Pump; return
  }
  $id = $script:dl[$script:dlPos]; $script:fetchId = $id
  $script:mode = ''; $status.ForeColor = $C.muted; $button.Text = '取消 Cancel'; Style-Button $button $false; $button.FlatAppearance.BorderColor = $C.red
  $status.Text = ('[{0}/{1}] {2}：正在同时测速所有下载源（GitHub / 国内镜像），挑最快的几个一起下载…' -f ($script:dlPos+1), $script:dl.Count, $names[$id]); Show-State
  UI-Progress @{ phase = 'probe'; idx = $script:dlPos; count = $script:dl.Count; name = $names[$id]; got = 0; size = [long]$packs.$id.size; total = (Total-Bytes); totalGot = (Got-Bytes) }
  try { Ensure-Engine } catch { Fail 'download' ('下载组件加载失败：' + $_.Exception.Message); return }
  $f = New-Object MeguFetch
  $f.Urls = [string[]]@(Candidates $id); $f.Part = Part $id; $f.Size = [long]$packs.$id.size; $f.Sha = [string]$packs.$id.sha256
  $script:fetch = $f; $f.Start(); $poll.Start()
  Note 'download-start' @{ id = $id }
}
$poll = New-Object Windows.Forms.Timer; $poll.Interval = 200
function Fail([string]$kind, [string]$message) {
  $script:mode = 'failed'; $script:failKind = $kind; $status.ForeColor = $C.red; Set-Bar 0
  $title.Text = if ($kind -eq 'install') { '安装没完成' } else { '下载中断了' }
  $hint = if ($kind -eq 'install') { '磁盘空间不足或文件被占用时会这样，点「重试」再来一次 / Retry' } else { '检查网络后点「重试」，已下载的部分会接着用 / Check your connection and retry' }
  $status.Text = $message + "`n" + $hint; $button.Text = '重试 Retry'; Style-Button $button $true
  UI-Fail $kind $message
  Note 'failed' @{ kind = $kind; message = $message }
}
$poll.add_Tick({
  $f = $script:fetch; if (-not $f) { $poll.Stop(); return }
  $id = $script:fetchId; $head = '[{0}/{1}] ' -f ($script:dlPos+1), $script:dl.Count
  switch ($f.Phase) {
    'download' {
      $got = Got-Bytes; Set-Bar ([int][math]::Min(1000, 1000 * $got / [math]::Max(1, (Total-Bytes))))
      $speed = if ($f.TotalSpeed -gt 0) { '  ·  {0:N1} MB/s' -f ($f.TotalSpeed / 1MB) } else { '' }
      $src = $f.SourceLabel(); $from = if ($src) { '  ·  来源 ' + $src } else { '' }
      $resumed = if ($f.Resumed -gt 0) { '（接着上次）' } else { '' }
      $status.Text = $head + ('正在下载{0}{1}  {2:N0} / {3:N0} MB{4}{5}' -f $names[$id], $resumed, ($f.Received/1MB), ($f.Size/1MB), $speed, $from) + $script:installLine
      UI-Progress @{ phase = 'download'; idx = $script:dlPos; count = $script:dl.Count; name = $names[$id]; got = $f.Received; size = $f.Size; speed = $f.TotalSpeed; src = $src; resumed = ($f.Resumed -gt 0); total = (Total-Bytes); totalGot = $got }
      if ($env:MEGULIT_SETUP_CLOSE_AT -and $got -ge [long]$env:MEGULIT_SETUP_CLOSE_AT) { Note 'close' @{ got = $got }; $form.Close() }
    }
    'verify' { $status.Text = $head + ('正在校验{0}… / Verifying' -f $names[$id]) + $script:installLine; UI-Progress @{ phase = 'verify'; idx = $script:dlPos; count = $script:dl.Count; name = $names[$id]; got = $f.Size; size = $f.Size; total = (Total-Bytes); totalGot = (Got-Bytes) } }
    'done' {
      $poll.Stop(); $script:fetch = $null; Save-FetchLog $f $id
      try { [IO.File]::WriteAllText($f.Part + '.ok', ([string]$packs.$id.sha256).ToUpperInvariant()) } catch {}
      $script:fetched += [long]$packs.$id.size; [void]$script:ready.Add(@{ id = $id; part = $f.Part }); $script:dlPos++
      Note 'downloaded' @{ id = $id; resumed = $f.Resumed; confirmed = $script:confirmed }
      if ($env:MEGULIT_SETUP_CLOSE_AT -and (Got-Bytes) -ge [long]$env:MEGULIT_SETUP_CLOSE_AT) { Note 'close' @{ got = (Got-Bytes) }; $form.Close(); return }
      Next-Download; Pump
    }
    'failed' { $poll.Stop(); $script:fetch = $null; Save-FetchLog $f $id; Fail 'download' ('下载失败：' + $f.Error) }
  }
})
# Probe results and every dropped connection go to logs\setup-download.log, so a "slow download" report can be read.
function Save-FetchLog($f, $id) {
  try { $d = Join-Path $Root 'logs'; New-Item -ItemType Directory -Force $d | Out-Null; Add-Content -Encoding UTF8 (Join-Path $d 'setup-download.log') ("== " + (Get-Date -Format s) + " " + $id + " " + $f.Phase + "`r`n" + $f.LogText()) } catch {}
}

# ---- Install: copy MeguLit to the chosen folder, then unpack each pack there as soon as it is downloaded ----
# Resolve the chosen folder; copy MeguLit there when it is not this folder. Returns $false (and says why) when it cannot.
$script:moved = $false
function Use-Target {
  $raw = $pathBox.Text.Trim().Trim('"')
  try { $target = [IO.Path]::GetFullPath($raw).TrimEnd('\') } catch { $target = $null }
  if (-not $raw -or -not $target -or -not [IO.Path]::IsPathRooted($raw)) { Say '请填写完整的安装位置，例如 D:\MeguLit'; return $false }
  if ($target -ieq $sourceRoot) { return $true }
  if ($target.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { Say '安装位置不能放在当前 MeguLit 文件夹里面，换一个位置吧'; return $false }
  # The staging folder may already live in the suggested folder; it does not make that folder "taken".
  if ((Test-Path $target) -and -not (Test-Path (Join-Path $target 'MeguLit.exe')) -and @(Get-ChildItem -Force $target -ErrorAction SilentlyContinue | Where-Object { $_.Name -ne $stageName }).Count -gt 0) { $target = Join-Path $target 'MeguLit' }
  if (-not (Writable $target)) { Say ('这个位置不能写入：' + $target + "`n换一个位置吧，例如 D:\MeguLit（Program Files 需要管理员权限）"); return $false }
  $script:copying = $true; Show-State; Note 'copy-start' @{ target = $target }
  $copyArgs = @("`"$sourceRoot`"", "`"$target`"", '/E', '/R:2', '/W:1', '/NP', '/NFL', '/NDL', '/NJH', '/NJS', '/XD', "`"$sourceRoot\logs`"", "`"$sourceRoot\cache`"", "`"$stageDir`"", $stageName, 'runtime-*.unpack', '/XF', 'runtime-*.part*')
  $copy = Start-Process -FilePath "$env:SystemRoot\System32\robocopy.exe" -ArgumentList $copyArgs -WindowStyle Hidden -PassThru
  $null = $copy.Handle
  while (-not $copy.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 }
  $copy.WaitForExit(); $script:copying = $false; Show-State
  if ($copy.ExitCode -ge 8 -or -not (Test-Path (Join-Path $target 'MeguLit.exe'))) {
    Say ('复制到 ' + $target + ' 没成功（robocopy ' + $copy.ExitCode + '），检查磁盘空间后再试一次'); return $false
  }
  $script:Root = $target; $script:runtimeDir = Join-Path $target 'runtime'; $script:moved = $true
  return $true
}
function Make-Shortcuts {
  $exePath = Join-Path $Root 'MeguLit.exe'
  if (-not (Test-Path $exePath)) { return }
  $places = @(); if ($deskCheck.Checked) { $places += [Environment]::GetFolderPath('Desktop') }; if ($menuCheck.Checked) { $places += [Environment]::GetFolderPath('Programs') }
  foreach ($dir in $places) {
    if (-not $dir) { continue }
    try {
      $sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'MeguLit.lnk'))
      $sh.TargetPath = $exePath; $sh.WorkingDirectory = $Root; $sh.IconLocation = $exePath + ',0'; $sh.Description = 'MeguLit'; $sh.Save()
    } catch {}
  }
  # The uninstaller sits next to the app's Start menu entry (only when the user asked for one).
  $un = Join-Path $Root 'setup\uninstall.ps1'
  if ($menuCheck.Checked -and (Test-Path $un)) {
    try {
      $sh = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Uninstall MeguLit.lnk'))
      $sh.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
      $sh.Arguments = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$un`" -Root `"$Root`""
      $sh.WorkingDirectory = $Root; $sh.IconLocation = $exePath + ',0'; $sh.Description = 'Uninstall MeguLit / 卸载 MeguLit'; $sh.WindowStyle = 7; $sh.Save()
    } catch {}
  }
}
# Apps & features entry (HKCU, no admin). setup\uninstall.ps1 removes it again; MeguLit refreshes it after a move or update.
function Register-Uninstall {
  $un = Join-Path $Root 'setup\uninstall.ps1'; $exePath = Join-Path $Root 'MeguLit.exe'
  if (-not (Test-Path $un) -or -not (Test-Path $exePath)) { return }
  try {
    $version = ''; $about = Join-Path $Root 'web\about.js'; if (Test-Path $about) { $m = [regex]::Match((Get-Content -Raw -Encoding UTF8 $about), "VERSION='([^']+)'"); if ($m.Success) { $version = $m.Groups[1].Value } }
    $k = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MeguLit'
    New-Item -Path $k -Force | Out-Null
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $vals = @{ DisplayName = 'MeguLit'; DisplayIcon = $exePath + ',0'; DisplayVersion = $version; Publisher = 'ilynthn'; InstallLocation = $Root; URLInfoAbout = 'https://megulit.com'
      UninstallString = "`"$ps`" -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$un`" -Root `"$Root`"" }
    foreach ($n in $vals.Keys) { Set-ItemProperty -Path $k -Name $n -Value $vals[$n] }
    foreach ($n in 'NoModify','NoRepair') { New-ItemProperty -Path $k -Name $n -Value 1 -PropertyType DWord -Force | Out-Null }
  } catch {}
}
function Lock-Choice([bool]$locked) { foreach ($ctl in $pathBox, $browse, $deskCheck, $menuCheck, $confirm) { $ctl.Enabled = -not $locked } }
function Confirm-Install {
  if ($script:confirmed) { return }
  $f = Drive-Free $pathBox.Text; $need = Need-Bytes $pathBox.Text
  if ($f -lt $need) { Say ('「' + $pathBox.Text + '」所在的磁盘空间不够：需要约 ' + (MB $need) + '，只剩 ' + (MB $f) + "`n换一个空间大一点的盘吧"); return }
  Lock-Choice $true
  if (-not (Use-Target)) { Lock-Choice $false; return }
  $script:confirmed = $true; $confirm.Text = '已确认'; $note.ForeColor = $C.gold; $note.Text = '安装到 ' + $Root + '：组件下载完就自动装好，不用再点'
  Note 'confirmed' @{ root = $Root; moved = $script:moved; downloadsDone = (Downloads-Done) }
  # The chosen folder may lack packs the suggested one had (or the other way round): fetch what this folder needs.
  foreach ($id in (Missing $Root)) { if (-not $script:dl.Contains($id)) { [void]$script:dl.Add($id); $script:want += $id } }
  $wasIdle = (Downloads-Done) -and $script:mode -ne 'failed'
  Show-State
  if ($wasIdle -and $script:dlPos -lt $script:dl.Count) { Next-Download }
  Pump
}
$confirm.add_Click({ Confirm-Install })

# One stable staged file per pack so Retry or the next launch resumes it. Unpack folders get a fresh name per attempt.
$script:attempt = 0
# Remove/move with patience: retry for ~15 s while another process (antivirus, indexer, an old
# MeguLit still running) holds the file, instead of failing the whole install on the first try.
function With-Retry([scriptblock]$op) {
  for ($i = 0; ; $i++) {
    try { & $op; return }
    catch {
      if ($i -ge 30) { throw }
      $until = [DateTime]::Now.AddMilliseconds(500)
      while ([DateTime]::Now -lt $until) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 }
    }
  }
}
# Processes started from this install's own runtime folder (node / aivis from an earlier MeguLit run)
# lock the files we are about to replace. Only processes inside $runtimeDir are touched.
function Stop-RuntimeProcesses {
  $prefix = [IO.Path]::GetFullPath($runtimeDir).TrimEnd('\') + '\'
  Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try { $_.Kill(); $_.WaitForExit(3000) | Out-Null } catch {} }
}
# Unpacks every ready pack once the user has pressed Install; re-entered from the poll timer, guarded by busy.
function Pump {
  if (-not $script:confirmed -or $script:busy -or $script:copying -or $script:mode -eq 'failed') { return }
  $script:busy = $true
  try {
    while ($script:ready.Count -gt 0) {
      $r = $script:ready[0]
      if (@(Missing $Root) -contains $r.id) { if (-not (Install-Pack $r.id $r.part)) { return } }
      Remove-Staged $r.part; $script:ready.RemoveAt(0)
    }
  } finally { $script:busy = $false; $script:installLine = '' }
  if (Downloads-Done) {
    if (@(Missing $Root).Count -eq 0) { $script:done = $true; Note 'installed' @{ root = $Root }; UI-Done; $form.Close() }
    else { Fail 'install' ('安装后仍缺少：' + ((Missing $Root | ForEach-Object { $names[$_] }) -join '、')) }
  } else { Show-State }
}
function Remove-Staged($part) { foreach ($p in $part, ($part + '.json'), ($part + '.ok')) { if (Test-Path $p) { try { Remove-Item $p -Force -ErrorAction Stop } catch {} } } }
function Install-Pack([string]$id, [string]$part) {
  try {
    $script:attempt++; $unpack = Join-Path $Root ('runtime-' + $id + '-' + $script:attempt + '.unpack')
    $script:installLine = "`n" + ('正在解压{0}到 {1}… / Unpacking' -f $names[$id], $runtimeDir); Show-State
    if (-not $script:fetch) { $status.Text = $script:installLine.Trim(); Set-Busy }
    UI-Progress @{ phase = 'unpack'; count = $script:dl.Count; name = $names[$id]; dir = $runtimeDir; total = (Total-Bytes); totalGot = (Total-Bytes) }
    Note 'unpack-start' @{ id = $id }
    if (Test-Path $unpack) { With-Retry { Remove-Item $unpack -Recurse -Force -ErrorAction Stop } }
    New-Item -ItemType Directory $unpack | Out-Null
    # tar reads the staged pack in place, from whichever drive it is on, and writes into the install folder.
    $tar = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', "`"$part`"", '-C', "`"$unpack`"") -WindowStyle Hidden -PassThru
    $null = $tar.Handle  # keep the handle so ExitCode is readable after exit
    while (-not $tar.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 30 }
    $tar.WaitForExit()
    if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $unpack 'runtime'))) { throw '解压失败' }
    New-Item -ItemType Directory -Force $runtimeDir | Out-Null
    Stop-RuntimeProcesses
    Get-ChildItem (Join-Path $unpack 'runtime') | ForEach-Object {
      $src = $_.FullName; $dest = Join-Path $runtimeDir $_.Name
      if (Test-Path $dest) { With-Retry { Remove-Item $dest -Recurse -Force -ErrorAction Stop } }
      With-Retry { Move-Item $src $dest -ErrorAction Stop }
    }
    # Leftovers are harmless; never fail an install that already succeeded over a temp file.
    try { Remove-Item $unpack -Recurse -Force -ErrorAction Stop } catch {}
    Note 'unpacked' @{ id = $id }
    return $true
  } catch { Fail 'install' ('安装失败：' + $_.Exception.Message); return $false }
}

Boot-Mark 'logic-built'
$uiLayer = Join-Path $sourceRoot 'setup/setup-ui.ps1'; $themeName = 'classic'; if (Test-Path $uiLayer) { . $uiLayer }
# New interface as a skin on top of this window (falls back to this window when anything is wrong; see setup-web.ps1)
Boot-Mark 'ui-layer-loaded'
$webLayer = Join-Path $sourceRoot 'setup/setup-web.ps1'; if (Test-Path $webLayer) { try { . $webLayer } catch { try { Add-Content -Encoding UTF8 (Join-Path $env:LOCALAPPDATA 'MeguLit\setup-ui.log') ((Get-Date -Format 's') + ' web layer failed to load: ' + $_) } catch {} } }
$button.add_Click({
  if ($script:mode -eq 'failed') {
    $script:mode = ''; $status.ForeColor = $C.muted; $button.Text = '取消 Cancel'; Style-Button $button $false; $button.FlatAppearance.BorderColor = $C.red
    if ($script:failKind -eq 'download') { Next-Download } else { Show-State; Pump }
  }
  else { if ($script:fetch) { $poll.Stop(); $script:fetch.Cancel() }; $form.Close() }
})
$form.add_Shown({ Close-Splash; Boot-Mark 'classic-shown' })
$form.add_FormClosing({ if (-not $script:done -and $script:fetch) { $poll.Stop(); $script:fetch.Cancel() } })
$form.add_Shown({ Update-Free; Note 'shown' @{ stage = $stageDir; want = ($want -join ',') }; if (-not $env:MEGULIT_SETUP_PREVIEW) { Next-Download } })
if ($testLog) { $deskCheck.Checked = $false; $menuCheck.Checked = $false }
if ($env:MEGULIT_SETUP_AUTOSTART -eq 'now') { $form.add_Shown({ Confirm-Install }) }
if ($env:MEGULIT_SETUP_AUTOSTART -eq 'downloaded') {
  $auto = New-Object Windows.Forms.Timer; $auto.Interval = 200
  $auto.add_Tick({ if ((Downloads-Done) -and $script:mode -ne 'failed') { $auto.Stop(); Confirm-Install } }); $auto.Start()
}
# MEGULIT_SETUP_PREVIEW=<png prefix>: render the window to <prefix>-<state>.png for each state in MEGULIT_SETUP_PREVIEW_STATE
# (comma list; default downloading) with fake data and exit. No download starts. Used to review the layouts.
if ($env:MEGULIT_SETUP_PREVIEW) {
  $form.add_Shown({ if ($script:fetch) { $poll.Stop(); $script:fetch.Cancel(); $script:fetch = $null }
    Note 'preview' @{ s = $env:MEGULIT_SETUP_PREVIEW_STATE }; $states = if ($env:MEGULIT_SETUP_PREVIEW_STATE) { $env:MEGULIT_SETUP_PREVIEW_STATE.Split(',') } else { @('downloading') }
    foreach ($st in $states) { try {
      if ($themeName -in 'line','steps','hero') { UI-Preview $st }
      elseif ($st -like 'failed*') { Fail 'download' '下载失败：无法连接到服务器' }
      else { $title.Text = '正在下载运行组件…'; $status.Text = '[1/3] 正在下载基础组件  47 / 107 MB  ·  6.8 MB/s  ·  来源 cn-dl.megulit.com 等 3 个源'; Set-Bar 140 }
      Note 'shot' @{ st = $st }; $form.Refresh(); $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height; $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle 0,0,$form.Width,$form.Height)); $bmp.Save($env:MEGULIT_SETUP_PREVIEW + '-' + $st + '.png'); $bmp.Dispose()
    } catch { Note 'error' @{ text = $_.ToString() + ' @ ' + $_.InvocationInfo.PositionMessage } } }
    $script:done = $false; $form.Close() })
}
# With the web skin the setup window is only the invisible control surface: a modal loop would disable the skin's window (no mouse, no keys), so run a plain message loop instead.
if ($script:webActive) { [Windows.Forms.Application]::Run($form) } else { [void]$form.ShowDialog() }
if ($script:fetch) { $script:fetch.Cancel(); [void]$script:fetch.Wait(3000) }
# Staged packs stay for resuming until the install is through; only per-attempt leftovers are swept.
Get-ChildItem $Root -Filter 'runtime-*.part' -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^runtime-[a-z]+-\d+\.part$' } | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $Root -Directory -Filter 'runtime-*.unpack' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
if ($script:done -and (Test-Path (Join-Path $Root 'runtime\node.exe'))) {
  # Done: drop the staging folder (and the empty suggested folder it lived in, if the user went elsewhere) and the pointer.
  try { Remove-Item $stageDir -Recurse -Force -ErrorAction Stop } catch {}
  $parent = Split-Path $stageDir
  if ((Split-Path $stageDir -Leaf) -eq $stageName -and $parent -ine $Root -and $parent -ine $sourceRoot -and (Test-Path $parent) -and @(Get-ChildItem -Force $parent).Count -eq 0) { try { Remove-Item $parent -Force } catch {} }
  if (-not $env:MEGULIT_SETUP_STAGING) { try { Remove-Item $pointer -Force -ErrorAction SilentlyContinue } catch {} }
  if ($testLog) { Note 'exit' @{ code = $(if ($script:moved) { 3 } else { 0 }) }; exit $(if ($script:moved) { 3 } else { 0 }) }
  Make-Shortcuts
  Register-Uninstall
  # Installed somewhere else: start that copy (its own single-instance lock) and tell this exe to quit (exit 3 = not ready here).
  if ($script:moved) { Start-Process -FilePath (Join-Path $Root 'MeguLit.exe') -WorkingDirectory $Root; exit 3 }
  exit 0
} else { Note 'exit' @{ code = 1 }; exit 1 }
