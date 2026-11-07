# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit first-launch setup.
# The release zip ships without runtime\. This window lets the user pick:
#   Lite  = base pack only (Node, Python, hooks, JMdict). Other packs can be added later in Settings.
#   Full  = base + furigana dictionaries + voice engine, all at once.
# Everything is installed straight into this MeguLit folder (runtime\ next to MeguLit.exe), so a fresh
# PC needs nothing preinstalled except the WebView2 Runtime (built into Windows 11).
# Packs, URLs, SHA-256 and sizes come from setup\runtime.json. Exit 0 = runtime ready.
param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Windows.Forms.Application]::EnableVisualStyles()

$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'setup\runtime.json') | ConvertFrom-Json
$packs = $manifest.packs
$appSize = 40MB
function MB($n) { if ($n -ge 1GB) { '{0:N1} GB' -f ($n/1GB) } else { '{0:N0} MB' -f ($n/1MB) } }
$lite = @('base'); $full = @('base','reading','voice')
function Sum($ids, $field) { $t = 0; foreach ($i in $ids) { $t += $packs.$i.$field }; $t }

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
function Img($name) { $p = Join-Path $Root "setup\$name"; if (Test-Path $p) { [Drawing.Image]::FromFile($p) } }
$logo = Img 'logo.png'; $megumin = Img 'megumin.png'

# Double-buffered panel so the hand-drawn line art does not flicker.
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
function Draw-Book($g, $x, $y, $color) {
  $p = Pen $color 255 1.6
  $g.DrawBezier($p, $x, $y+4, $x+6, $y, $x+11, $y+1, $x+14, $y+4); $g.DrawBezier($p, $x+14, $y+4, $x+17, $y+1, $x+22, $y, $x+28, $y+4)
  $g.DrawLine($p, $x, $y+4, $x, $y+20); $g.DrawLine($p, $x+28, $y+4, $x+28, $y+20); $g.DrawLine($p, $x+14, $y+4, $x+14, $y+22)
  $g.DrawBezier($p, $x, $y+20, $x+6, $y+16, $x+11, $y+17, $x+14, $y+22); $g.DrawBezier($p, $x+14, $y+22, $x+17, $y+17, $x+22, $y+16, $x+28, $y+20)
  $p.Dispose()
}

$form = New-Object Windows.Forms.Form
$form.Text = 'MeguLit'; $form.ClientSize = New-Object Drawing.Size(720,560); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.BackColor = $C.bg; $form.ForeColor = $C.cream
$exe = Join-Path $Root 'MeguLit.exe'; if (Test-Path $exe) { $form.Icon = [Drawing.Icon]::ExtractAssociatedIcon($exe) }

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
  Draw-Circle $g 40 530 150 $C.gold 30
  if ($logo) { $g.DrawImage($logo, 30, 18, 212, 81) }
  if ($megumin) { $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($megumin, 582, 10, 112, 112) }
  $p = Pen $C.line 255 1; $g.DrawLine($p, 32, 122, 688, 122); $p.Dispose()
})
$form.Controls.Add($stage)

# ---- choice page ----
$choice = New-Object Windows.Forms.Panel; $choice.Location = New-Object Drawing.Point(0,124); $choice.Size = New-Object Drawing.Size(720,436); $choice.BackColor = [Drawing.Color]::Transparent
$stage.Controls.Add($choice)
[void](Label '翻开魔导书之前，先准备一下运行组件' 32 12 560 30 14 $true $C.cream $choice)
[void](Label 'MeguLit 需要的运行环境都会装进它自己的文件夹，电脑上不用预先安装 Node.js、Python 或其他软件' 32 44 656 20 9 $false $C.muted $choice)
$free = (Get-Item $Root).PSDrive.Free

function Option($x, $title, $sub, $items, $note, $ids, $primary) {
  $p = New-Object GrimoirePanel; $p.Location = New-Object Drawing.Point($x,76); $p.Size = New-Object Drawing.Size(316,282); $p.BackColor = $C.card
  $down = Sum $ids 'size'; $disk = (Sum $ids 'unpacked') + $appSize
  $accent = if ($primary) { $C.red } else { $C.gold }
  $p.add_Paint({ param($s,$e)
    $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
    $b = New-Object Drawing.SolidBrush $accent; $g.FillRectangle($b, 0, 0, 316, 3)
    $g.FillPolygon($b, [Drawing.Point[]]@((New-Object Drawing.Point(272,0)),(New-Object Drawing.Point(290,0)),(New-Object Drawing.Point(290,30)),(New-Object Drawing.Point(281,23)),(New-Object Drawing.Point(272,30)))); $b.Dispose()
    Draw-Book $g 20 20 $accent
    $pen = Pen $C.line 255 1; $g.DrawRectangle($pen, 0, 0, 315, 281); $g.DrawLine($pen, 20, 206, 296, 206); $pen.Dispose()
  }.GetNewClosure())
  [void](Label $title 58 16 200 30 13 $true $C.cream $p)
  [void](Label $sub 59 44 200 18 8 $false $C.muted $p)
  [void](Label '包含 / Includes' 20 70 280 18 8 $true $accent $p)
  [void](Label (($items | ForEach-Object { '·  ' + $_ }) -join "`n") 20 90 286 82 9 $false $C.cream $p)
  [void](Label $note 20 172 286 32 8 $false $C.muted $p)
  [void](Label ('下载约 ' + (MB $down)) 20 214 140 22 10 $true $C.cream $p)
  $warn = if ($free -lt $disk * 1.1) { $C.red } else { $C.muted }
  [void](Label ('占用磁盘约 ' + (MB $disk)) 160 216 140 20 9 $false $warn $p)
  $b = New-Object Windows.Forms.Button; $b.Text = '选择' + $title; $b.FlatStyle = 'Flat'; $b.Location = New-Object Drawing.Point(20,240); $b.Size = New-Object Drawing.Size(276,32)
  $b.Font = New-Object Drawing.Font($ui, 10, [Drawing.FontStyle]::Bold); $b.ForeColor = $C.cream; $b.FlatAppearance.BorderColor = $accent; $b.Cursor = 'Hand'
  $b.BackColor = if ($primary) { $C.red } else { $C.card }
  $b.Tag = $ids; $b.add_Click({ param($s) Start-Install $s.Tag })
  $p.Controls.Add($b); $choice.Controls.Add($p)
}
$baseItems = @('Node.js 运行时（程序后台服务）','Python 3（分词与注音）','文本 Hook 引擎（读取游戏文字）','JMdict 日英 / 日中离线词典')
Option 32 '精简版' 'LITE · 先用起来' $baseItems '注音分词词典第一次用时自动补装；语音引擎可以以后在「设置 → 语音 / 词典」里补装' $lite $true
Option 372 '完整版' 'FULL · 一次装齐' @('精简版的全部组件','SudachiDict / UniDic 注音分词词典','AivisSpeech 语音引擎（朗读、原声补全）') '本地翻译模型体积很大，不包含在内，需要时在设置里按需下载' $full $false

$runtimeDir = Join-Path $Root 'runtime'
[void](Label ('直接装进这个 MeguLit 文件夹，不会写到别处：' + $runtimeDir) 32 370 656 20 8 $false $C.muted $choice)
[void](Label ('所在磁盘可用 ' + (MB $free) + '   ·   以后移动 MeguLit 文件夹，组件会跟着一起走') 32 390 656 20 8 $false $C.muted $choice)
if (-not $webview) {
  $link = New-Object Windows.Forms.LinkLabel; $link.Text = '这台电脑缺少 Microsoft Edge WebView2 运行时，MeguLit 的界面需要它：点这里去微软官网下载安装'
  $link.Location = New-Object Drawing.Point(32,410); $link.Size = New-Object Drawing.Size(656,20); $link.Font = New-Object Drawing.Font($ui, 8, [Drawing.FontStyle]::Bold)
  $link.LinkColor = $C.red; $link.ActiveLinkColor = $C.gold; $link.BackColor = [Drawing.Color]::Transparent
  $link.add_LinkClicked({ Start-Process 'https://developer.microsoft.com/microsoft-edge/webview2/' })
  $choice.Controls.Add($link)
}

# ---- progress page ----
$progress = New-Object Windows.Forms.Panel; $progress.Location = New-Object Drawing.Point(0,124); $progress.Size = New-Object Drawing.Size(720,436); $progress.BackColor = [Drawing.Color]::Transparent; $progress.Visible = $false
$stage.Controls.Add($progress)
$title = Label '正在誊写魔导书…' 32 40 640 32 14 $true $C.cream $progress
$status = Label '' 32 84 656 44 9 $false $C.muted $progress
$bar = New-Object Windows.Forms.ProgressBar; $bar.Location = New-Object Drawing.Point(32,136); $bar.Size = New-Object Drawing.Size(656,12); $bar.Maximum = 1000
$progress.Controls.Add($bar)
[void](Label ('安装位置：' + $runtimeDir) 32 160 656 20 8 $false $C.muted $progress)
$button = New-Object Windows.Forms.Button; $button.Text = '取消 Cancel'; $button.FlatStyle = 'Flat'; $button.ForeColor = $C.cream
$button.FlatAppearance.BorderColor = $C.red; $button.Location = New-Object Drawing.Point(568,200); $button.Size = New-Object Drawing.Size(120,34); $button.Cursor = 'Hand'
$progress.Controls.Add($button)

$client = New-Object Net.WebClient; $client.Headers.Add('User-Agent','MeguLit-setup')
$script:queue = @(); $script:index = 0; $script:urlIndex = 0; $script:done = $false; $script:mode = ''
$names = @{ base = '基础组件'; reading = '注音分词词典'; voice = '语音引擎' }
$markers = @{ base = 'runtime\node.exe'; reading = 'runtime\reading\sudachidict_full\resources\system.dic'; voice = 'runtime\aivis\run.exe' }

function Start-Install($ids) {
  $script:queue = @($ids | Where-Object { -not (Test-Path (Join-Path $Root $markers[$_])) })
  $script:index = 0; $choice.Visible = $false; $progress.Visible = $true; Next-Pack
}
function Current { $script:queue[$script:index] }
function Part { Join-Path $Root ('runtime-' + (Current) + '.part') }
function Next-Pack {
  if ($script:index -ge $script:queue.Count) { $script:done = $true; $form.Close(); return }
  $script:urlIndex = 0; Start-Download
}
function Start-Download {
  $script:mode = 'download'; $button.Text = '取消 Cancel'; $status.ForeColor = $C.muted; $bar.Style = 'Continuous'; $bar.Value = 0
  $title.Text = '正在誊写魔导书…'
  $status.Text = ('[{0}/{1}] 正在下载{2}…' -f ($script:index+1), $script:queue.Count, $names[(Current)])
  if (Test-Path (Part)) { Remove-Item (Part) -Force }
  $client.DownloadFileAsync([Uri]@($packs.(Current).urls)[$script:urlIndex], (Part))
}
function Fail([string]$message) {
  $script:mode = 'failed'; $status.ForeColor = $C.red; $bar.Style = 'Continuous'; $bar.Value = 0
  $title.Text = '咏唱被打断了'
  $status.Text = $message + "`n检查网络后点「重试」 / Check your connection and retry"; $button.Text = '重试 Retry'
}

$client.add_DownloadProgressChanged({ param($s,$e)
  $total = [math]::Max($e.TotalBytesToReceive, $packs.(Current).size)
  $bar.Value = [int][math]::Min(1000, 1000 * $e.BytesReceived / $total)
  $status.Text = ('[{0}/{1}] 正在下载{2}  {3:N0} / {4:N0} MB' -f ($script:index+1), $script:queue.Count, $names[(Current)], ($e.BytesReceived/1MB), ($total/1MB))
})
$client.add_DownloadFileCompleted({ param($s,$e)
  if ($e.Cancelled) { return }
  if ($e.Error) {
    if ($script:urlIndex + 1 -lt @($packs.(Current).urls).Count) { $script:urlIndex++; Start-Download; return }
    $msg = if ($e.Error.InnerException) { $e.Error.InnerException.Message } else { $e.Error.Message }
    Fail ('下载失败：' + $msg); return
  }
  try {
    $part = Part; $unpack = Join-Path $Root ('runtime-' + (Current) + '.unpack')
    $status.Text = '正在校验… / Verifying'; $form.Refresh()
    if ((Get-FileHash -Algorithm SHA256 $part).Hash -ne $packs.(Current).sha256.ToUpper()) { Remove-Item $part -Force; throw '文件校验失败，可能下载不完整' }
    $status.Text = ('正在解压{0}… / Unpacking' -f $names[(Current)]); $bar.Style = 'Marquee'; $form.Refresh()
    if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
    New-Item -ItemType Directory $unpack | Out-Null
    $tar = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', "`"$part`"", '-C', "`"$unpack`"") -NoNewWindow -Wait -PassThru
    if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $unpack 'runtime'))) { throw '解压失败' }
    New-Item -ItemType Directory -Force $runtimeDir | Out-Null
    Get-ChildItem (Join-Path $unpack 'runtime') | ForEach-Object { $dest = Join-Path $runtimeDir $_.Name; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $_.FullName $dest }
    Remove-Item $unpack -Recurse -Force; Remove-Item $part -Force
    $script:index++; Next-Pack
  } catch { Fail ('安装失败：' + $_.Exception.Message) }
})

$button.add_Click({
  if ($script:mode -eq 'failed') { Start-Download }
  else { $client.CancelAsync(); $form.Close() }
})
$form.add_FormClosing({ if (-not $script:done) { $client.CancelAsync() } })
# MEGULIT_SETUP_PREVIEW=<png>: render the choice page to an image and exit (used to check the layout).
if ($env:MEGULIT_SETUP_PREVIEW) { $form.add_Shown({ $form.Refresh(); $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height; $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle 0,0,$form.Width,$form.Height)); $bmp.Save($env:MEGULIT_SETUP_PREVIEW); $form.Close() }) }
[void]$form.ShowDialog()
$client.Dispose()
Get-ChildItem $Root -Filter 'runtime-*.part' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
if ($script:done -and (Test-Path (Join-Path $Root 'runtime\node.exe'))) { exit 0 } else { exit 1 }
