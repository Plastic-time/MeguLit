﻿# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit first-launch setup.
# The release zip ships without runtime\. This window lets the user pick:
#   Lite  = base pack only (Node, Python, hooks, JMdict). Other packs can be added later in Settings.
#   Full  = base + furigana dictionaries + voice engine, all at once.
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

$bg = [Drawing.Color]::FromArgb(31,26,27); $card = [Drawing.Color]::FromArgb(42,34,35)
$cream = [Drawing.Color]::FromArgb(243,233,220); $muted = [Drawing.Color]::FromArgb(168,153,143); $red = [Drawing.Color]::FromArgb(200,50,60)
$ui = 'Microsoft YaHei UI'

$form = New-Object Windows.Forms.Form
$form.Text = 'MeguLit'; $form.ClientSize = New-Object Drawing.Size(600,360); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.BackColor = $bg; $form.ForeColor = $cream
$exe = Join-Path $Root 'MeguLit.exe'; if (Test-Path $exe) { $form.Icon = [Drawing.Icon]::ExtractAssociatedIcon($exe) }

function Label($text, $x, $y, $w, $h, $size, $bold, $color) {
  $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object Drawing.Point($x,$y); $l.Size = New-Object Drawing.Size($w,$h)
  $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
  $l.Font = New-Object Drawing.Font($ui, $size, $style); $l.ForeColor = $color; $l.BackColor = [Drawing.Color]::Transparent; $l
}

# ---- choice page ----
$choice = New-Object Windows.Forms.Panel; $choice.Dock = 'Fill'
$choice.Controls.Add((Label '欢迎使用 MeguLit' 28 22 540 32 15 $true $cream))
$choice.Controls.Add((Label '第一次启动需要下载运行组件，选一种安装方式 / Choose how to install the runtime' 28 58 550 22 9 $false $muted))
$drive = (Get-Item $Root).PSDrive; $free = $drive.Free

function Option($x, $title, $desc, $ids, $primary) {
  $p = New-Object Windows.Forms.Panel; $p.Location = New-Object Drawing.Point($x,96); $p.Size = New-Object Drawing.Size(262,236); $p.BackColor = $card
  $down = Sum $ids 'size'; $disk = (Sum $ids 'unpacked') + $appSize
  $p.Controls.Add((Label $title 18 16 230 28 13 $true $cream))
  $p.Controls.Add((Label $desc 18 50 230 76 9 $false $muted))
  $p.Controls.Add((Label ('下载约 ' + (MB $down)) 18 132 230 22 10 $true $cream))
  $warn = if ($free -lt $disk * 1.1) { $red } else { $muted }
  $p.Controls.Add((Label ('需预留磁盘约 ' + (MB $disk)) 18 156 230 22 9 $false $warn))
  $b = New-Object Windows.Forms.Button; $b.Text = '选择 ' + $title.Split(' ')[0]; $b.FlatStyle = 'Flat'; $b.Location = New-Object Drawing.Point(18,188); $b.Size = New-Object Drawing.Size(226,34)
  $b.Font = New-Object Drawing.Font($ui, 10, [Drawing.FontStyle]::Bold); $b.ForeColor = $cream; $b.FlatAppearance.BorderColor = $red
  if ($primary) { $b.BackColor = $red }
  $b.Tag = $ids; $b.add_Click({ param($s) Start-Install $s.Tag })
  $p.Controls.Add($b); $p
}
$choice.Controls.Add((Option 28 '精简版 Lite' "可以使用基本功能：阅读层、翻译、查词。注音分词词典和语音引擎暂不下载，以后可以在「设置 → 语音 / 词典」里补装完整版" $lite $true))
$choice.Controls.Add((Option 310 '完整版 Full' "一次性下载全部组件：基础组件、注音分词词典、AivisSpeech 语音引擎。本地翻译模型仍在设置里按需下载" $full $false))
$choice.Controls.Add((Label ('安装位置：' + $Root + '    可用空间 ' + (MB $free)) 28 336 550 20 8 $false $muted))

# ---- progress page ----
$progress = New-Object Windows.Forms.Panel; $progress.Dock = 'Fill'; $progress.Visible = $false
$title = Label '正在准备运行组件 / Preparing runtime' 28 40 540 30 13 $true $cream
$status = Label '' 28 88 540 44 9 $false $muted
$bar = New-Object Windows.Forms.ProgressBar; $bar.Location = New-Object Drawing.Point(28,140); $bar.Size = New-Object Drawing.Size(544,14); $bar.Maximum = 1000
$button = New-Object Windows.Forms.Button; $button.Text = '取消 Cancel'; $button.FlatStyle = 'Flat'; $button.ForeColor = $cream
$button.FlatAppearance.BorderColor = $red; $button.Location = New-Object Drawing.Point(452,180); $button.Size = New-Object Drawing.Size(120,34)
$progress.Controls.AddRange(@($title,$status,$bar,$button))
$form.Controls.AddRange(@($choice,$progress))

$client = New-Object Net.WebClient; $client.Headers.Add('User-Agent','MeguLit-setup')
$script:queue = @(); $script:index = 0; $script:urlIndex = 0; $script:done = $false; $script:mode = ''
$names = @{ base = '基础组件'; reading = '注音分词词典'; voice = '语音引擎' }

function Start-Install($ids) {
  $script:queue = @($ids | Where-Object { -not (Test-Path (Join-Path $Root (@{base='runtime\node.exe';reading='runtime\reading\sudachidict_full\resources\system.dic';voice='runtime\aivis\run.exe'}[$_]))) })
  $script:index = 0; $choice.Visible = $false; $progress.Visible = $true; Next-Pack
}
function Current { $script:queue[$script:index] }
function Part { Join-Path $Root ('runtime-' + (Current) + '.part') }
function Next-Pack {
  if ($script:index -ge $script:queue.Count) { $script:done = $true; $form.Close(); return }
  $script:urlIndex = 0; Start-Download
}
function Start-Download {
  $script:mode = 'download'; $button.Text = '取消 Cancel'; $status.ForeColor = $muted; $bar.Style = 'Continuous'; $bar.Value = 0
  $status.Text = ('[{0}/{1}] 正在下载{2}…' -f ($script:index+1), $script:queue.Count, $names[(Current)])
  if (Test-Path (Part)) { Remove-Item (Part) -Force }
  $client.DownloadFileAsync([Uri]@($packs.(Current).urls)[$script:urlIndex], (Part))
}
function Fail([string]$message) {
  $script:mode = 'failed'; $status.ForeColor = $red; $bar.Style = 'Continuous'; $bar.Value = 0
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
    $part = Part; $stage = Join-Path $Root ('runtime-' + (Current) + '.unpack')
    $status.Text = '正在校验… / Verifying'; $form.Refresh()
    if ((Get-FileHash -Algorithm SHA256 $part).Hash -ne $packs.(Current).sha256.ToUpper()) { Remove-Item $part -Force; throw '文件校验失败，可能下载不完整' }
    $status.Text = ('正在解压{0}… / Unpacking' -f $names[(Current)]); $bar.Style = 'Marquee'; $form.Refresh()
    if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
    New-Item -ItemType Directory $stage | Out-Null
    $tar = Start-Process -FilePath "$env:SystemRoot\System32\tar.exe" -ArgumentList @('-xf', "`"$part`"", '-C', "`"$stage`"") -NoNewWindow -Wait -PassThru
    if ($tar.ExitCode -ne 0 -or -not (Test-Path (Join-Path $stage 'runtime'))) { throw '解压失败' }
    $target = Join-Path $Root 'runtime'; New-Item -ItemType Directory -Force $target | Out-Null
    Get-ChildItem (Join-Path $stage 'runtime') | ForEach-Object { $dest = Join-Path $target $_.Name; if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }; Move-Item $_.FullName $dest }
    Remove-Item $stage -Recurse -Force; Remove-Item $part -Force
    $script:index++; Next-Pack
  } catch { Fail ('安装失败：' + $_.Exception.Message) }
})

$button.add_Click({
  if ($script:mode -eq 'failed') { Start-Download }
  else { $client.CancelAsync(); $form.Close() }
})
$form.add_FormClosing({ if (-not $script:done) { $client.CancelAsync() } })
[void]$form.ShowDialog()
$client.Dispose()
Get-ChildItem $Root -Filter 'runtime-*.part' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
if ($script:done -and (Test-Path (Join-Path $Root 'runtime\node.exe'))) { exit 0 } else { exit 1 }
