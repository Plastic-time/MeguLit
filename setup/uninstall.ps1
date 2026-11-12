# SPDX-License-Identifier: GPL-3.0-or-later
# Uninstall MeguLit (user 2026-11-12: a full-cleanup uninstaller that can keep the account data on this PC).
# Started from the Start menu shortcut, Windows "Apps & features" (HKCU Uninstall\MeguLit, written by setup) or
# MeguLit's About page. The plan comes from services\uninstall.cjs (game folders restored with the app's own undo code,
# shortcuts, registry values keyed by this install, Tauri's per-user folders, app temp files). This window:
#   1. copies itself to %TEMP%\megulit-uninstall-<pid> and runs from there, so the install folder can go;
#   2. shows the plan and the 「保留本地账户数据」 choice (default on);
#   3. stops every process started from the install folder (MeguLit, node, Python, HookBridge, GalWindowBridge, ...),
#      runs the plan with node (--leave-root), then removes the install folder itself, keeping data\ and secrets\
#      in place when asked, with a note saying what they are;
#   4. leaves a hidden cmd that retries anything still locked and deletes the temp copy.
# -DryRun prints the plan to the console and changes nothing.
param([string]$Root = '', [switch]$DryRun, [switch]$Relaunched)
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$isMeguLit = (Test-Path -LiteralPath (Join-Path $Root 'MeguLit.exe')) -or (Test-Path -LiteralPath (Join-Path $Root 'services\bridge.cjs'))

# ---- run from a temp copy so the install folder (and this script in it) can be removed ----
$self = $MyInvocation.MyCommand.Path
if (-not $DryRun -and -not $Relaunched -and $self -and ([IO.Path]::GetFullPath($self)).StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('megulit-uninstall-' + $PID)
  New-Item -ItemType Directory -Force $tmp | Out-Null
  Copy-Item -LiteralPath $self (Join-Path $tmp 'uninstall.ps1') -Force
  $logoSrc = Join-Path $Root 'setup\logo.png'; if (Test-Path -LiteralPath $logoSrc) { Copy-Item -LiteralPath $logoSrc (Join-Path $tmp 'logo.png') -Force }
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-STA','-WindowStyle','Hidden','-File',"`"$tmp\uninstall.ps1`"",'-Root',"`"$Root`"",'-Relaunched') -WindowStyle Hidden
  exit 0
}
$here = Split-Path -Parent $self

# ---- language: follows the app (data\preferences.json "language") ----
$lang = 'zh'
try { $p = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'data\preferences.json') | ConvertFrom-Json; if ($p.language -in @('zh','en','ja')) { $lang = $p.language } } catch {}
$T = @{
 zh = @{ loading='正在检查 MeguLit 在这台电脑上放过的东西（游戏文件夹、快捷方式、注册表），大约要几秒…'; title='卸载 MeguLit'; sub='会先关闭 MeguLit 和它的辅助程序（HookBridge、GalWindowBridge、语音引擎等）。请先关掉正在玩的游戏，游戏开着时它的文件没法还原'
  keep='保留本地账户数据'; keepWhat='保留：账户登录（data\config\secrets.dpapi 登录令牌）、游戏库与阅读记录（data\megulit.sqlite）、生词本、设置（data\config）、自定义封面（data\assets）、台词与场景截图，以及 secrets\。它们留在 {0}，以后把 MeguLit 装回这个文件夹就能接着用'
  noKeep='不保留：账户登录、游戏库、阅读记录、生词本和设置会全部删除，无法恢复'
  go='卸载'; cancel='取消'; done='完成'; working='正在卸载…'; closing='正在关闭 MeguLit 和辅助程序…'; restoring='正在还原游戏文件、清理快捷方式和注册表…'; removing='正在删除程序文件…'
  confirm='确定卸载 MeguLit 吗？'; confirmAll="确定卸载 MeguLit 并删除全部数据吗？`n账户登录、游戏库、阅读记录、生词本和设置都会被删除，无法恢复"
  secProgram='程序文件夹'; secRemove='删除'; secKeep='保留'; secGames='游戏文件夹（只还原 MeguLit 改过的文件，你的存档和其他文件不动）'; secNoGames='（没有 MeguLit 改过的游戏文件）'
  secShortcuts='快捷方式'; secOther='其他位置'; secRegistry='注册表（只删和这个安装路径有关的项）'; none='（无）'; items='{0} 项'
  a_patch='切回汉化补丁（撤销「切换日文原版」）'; a_jpr='把「恢复日文」改过的文件放回原样'; a_jpi='还原导入的日文脚本'; a_jpo='还原导入的日文原版文件'; a_compat='删除 MeguLit 放进去的兼容文件'; a_cfg='还原'; a_rm='删除 MeguLit 留下的'
  w_app='程序的 WebView 用户数据（{0}）'; w_temp='MeguLit 的临时文件'; r_key='「应用和功能」里的 MeguLit 卸载项'; r_val='Windows 记录的 MeguLit 程序路径'
  okKept='MeguLit 已卸载。你的数据保留在：'; okAll='MeguLit 已完全卸载'; failed='下面这些没能处理，可以手动看看：'; skippedGame='（这些文件在 MeguLit 修改后又被改过，为安全起见没有动，备份留在游戏文件夹里）'
  noNode='没找到 MeguLit 的运行组件，游戏文件夹里的改动无法自动还原（如果你用过「恢复日文」「切换日文原版」，请先装回 MeguLit 在里面撤销）'; notFound='这里不是 MeguLit 的文件夹：' }
 en = @{ loading='Checking what MeguLit placed on this PC (game folders, shortcuts, registry); this takes a few seconds…'; title='Uninstall MeguLit'; sub='MeguLit and its helpers (HookBridge, GalWindowBridge, the voice engine, ...) are closed first. Close any game you are playing: its files cannot be restored while it runs'
  keep='Keep local account data'; keepWhat='Kept: account sign-in (sign-in token data\config\secrets.dpapi), library and reading history (data\megulit.sqlite), vocabulary, settings (data\config), custom covers (data\assets), saved lines and scene shots, and secrets\. They stay in {0}; install MeguLit into this folder again to continue'
  noKeep='Not kept: account sign-in, library, reading history, vocabulary and settings are all deleted for good'
  go='Uninstall'; cancel='Cancel'; done='Done'; working='Uninstalling…'; closing='Closing MeguLit and its helpers…'; restoring='Restoring game files, removing shortcuts and registry entries…'; removing='Removing program files…'
  confirm='Uninstall MeguLit?'; confirmAll="Uninstall MeguLit and delete all data?`nAccount sign-in, library, reading history, vocabulary and settings are deleted for good"
  secProgram='Program folder'; secRemove='Remove'; secKeep='Keep'; secGames='Game folders (only files MeguLit changed are restored; saves and other files stay)'; secNoGames='(MeguLit changed no game files)'
  secShortcuts='Shortcuts'; secOther='Other places'; secRegistry='Registry (only entries about this install path)'; none='(none)'; items='{0} items'
  a_patch='Switch back to the translation patch'; a_jpr='Put back the files changed by "Restore Japanese"'; a_jpi='Restore the imported Japanese scripts'; a_jpo='Restore the imported Japanese original files'; a_compat='Remove the compatibility files MeguLit placed'; a_cfg='restore'; a_rm='Remove MeguLit leftover'
  w_app='WebView user data ({0})'; w_temp='MeguLit temporary files'; r_key='MeguLit entry in Apps & features'; r_val='MeguLit program paths recorded by Windows'
  okKept='MeguLit was uninstalled. Your data is kept in:'; okAll='MeguLit was removed completely'; failed='These could not be handled; you may want to check them:'; skippedGame='(changed again after MeguLit changed them, so they were left alone; the backup stays in the game folder)'
  noNode='MeguLit''s runtime is missing, so changes in game folders cannot be undone automatically (if you used Restore Japanese or the Japanese original switch, reinstall MeguLit and undo them there first)'; notFound='This is not a MeguLit folder: ' }
 ja = @{ loading='MeguLit がこの PC に置いたもの（ゲームフォルダー・ショートカット・レジストリ）を確認しています。数秒かかります…'; title='MeguLit をアンインストール'; sub='最初に MeguLit と補助プログラム（HookBridge、GalWindowBridge、音声エンジンなど）を終了します。ゲームを起動中なら閉じてください（起動中はファイルを戻せません）'
  keep='ローカルのアカウントデータを残す'; keepWhat='残すもの：アカウントのログイン情報（data\config\secrets.dpapi）、ライブラリと読書履歴（data\megulit.sqlite）、単語帳、設定（data\config）、カスタムカバー（data\assets）、保存したセリフとシーン画像、secrets\。{0} に残り、同じフォルダーに MeguLit を入れ直せば続きから使えます'
  noKeep='残さない：ログイン情報・ライブラリ・読書履歴・単語帳・設定はすべて削除され、元に戻せません'
  go='アンインストール'; cancel='キャンセル'; done='完了'; working='アンインストール中…'; closing='MeguLit と補助プログラムを終了しています…'; restoring='ゲームファイルの復元、ショートカットとレジストリの整理中…'; removing='プログラムファイルを削除しています…'
  confirm='MeguLit をアンインストールしますか？'; confirmAll="MeguLit をアンインストールし、すべてのデータを削除しますか？`nログイン情報・ライブラリ・読書履歴・単語帳・設定は元に戻せません"
  secProgram='プログラムフォルダー'; secRemove='削除'; secKeep='残す'; secGames='ゲームフォルダー（MeguLit が変更したファイルだけを戻します。セーブなどはそのまま）'; secNoGames='（MeguLit が変更したゲームファイルはありません）'
  secShortcuts='ショートカット'; secOther='その他の場所'; secRegistry='レジストリ（このインストール先に関する項目のみ）'; none='（なし）'; items='{0} 件'
  a_patch='翻訳パッチ版に戻す'; a_jpr='「日本語に戻す」で変えたファイルを元に戻す'; a_jpi='取り込んだ日本語スクリプトを戻す'; a_jpo='取り込んだ日本語原版ファイルを戻す'; a_compat='MeguLit が置いた互換ファイルを削除'; a_cfg='復元'; a_rm='MeguLit の残りファイルを削除'
  w_app='WebView のユーザーデータ（{0}）'; w_temp='MeguLit の一時ファイル'; r_key='「アプリと機能」の MeguLit 項目'; r_val='Windows が記録した MeguLit のパス'
  okKept='MeguLit をアンインストールしました。データの保存先：'; okAll='MeguLit を完全に削除しました'; failed='次の項目は処理できませんでした：'; skippedGame='（MeguLit の変更後にさらに変更されていたため触れていません。バックアップはゲームフォルダーに残っています）'
  noNode='MeguLit の実行コンポーネントがないため、ゲームフォルダーの変更は自動で戻せません（「日本語に戻す」などを使った場合は、MeguLit を入れ直してから元に戻してください）'; notFound='MeguLit のフォルダーではありません：' }
}
$t = $T[$lang]

# ---- plan ----
$node = Join-Path $Root 'runtime\node.exe'
$script_ = Join-Path $Root 'services\uninstall.cjs'
$hasNode = (Test-Path -LiteralPath $node) -and (Test-Path -LiteralPath $script_)
$dataCaches = @('cache','cg-cache','voice-cache','vocal-sep','diagnostics','hook-streams','update-installed.json','icon-refresh.json')
$keepNote = 'MeguLit 保留的数据 - Kept data.txt'
function Pump { if ($script:form) { [Windows.Forms.Application]::DoEvents() } }
function Run-Node([string[]]$argv) {
  $psi = New-Object Diagnostics.ProcessStartInfo $node
  $psi.Arguments = (@('--no-warnings', "`"$script_`"") + ($argv | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } })) -join ' '
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.WorkingDirectory = $Root
  $psi.EnvironmentVariables['MEGULIT_DESKTOP'] = [Environment]::GetFolderPath('Desktop')
  $psi.EnvironmentVariables['MEGULIT_PROGRAMS'] = [Environment]::GetFolderPath('Programs')
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  while (-not $p.HasExited) { Pump; Start-Sleep -Milliseconds 40 }
  $p.WaitForExit(); return $out.Result
}
function Root-Lists([bool]$keep) {
  $remove = @(); $kept = @()
  foreach ($e in @(Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue)) {
    $n = $e.Name.ToLower()
    if ($keep -and $n -eq 'data') { foreach ($d in @(Get-ChildItem -LiteralPath $e.FullName -Force -ErrorAction SilentlyContinue)) { if ($dataCaches -contains $d.Name.ToLower()) { $remove += $d.FullName } else { $kept += $d.FullName } } }
    elseif ($keep -and ($n -eq 'secrets' -or $e.Name -eq $keepNote)) { $kept += $e.FullName }
    else { $remove += $e.FullName }
  }
  @{ remove = $remove; kept = $kept }
}
# Without node (runtime never installed): shortcuts that point here, the Apps & features entry, the app-id folders.
function Fallback-Plan {
  $sc = @(); $sh = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { foreach ($n in 'MeguLit.lnk','Uninstall MeguLit.lnk') {
    $f = Join-Path $d $n; if (-not (Test-Path -LiteralPath $f)) { continue }
    try { $l = $sh.CreateShortcut($f); if (("$($l.TargetPath)|$($l.Arguments)|$($l.WorkingDirectory)").ToLower().Contains($Root.ToLower())) { $sc += $f } } catch {} } }
  $ext = @(); foreach ($b in $env:LOCALAPPDATA, $env:APPDATA) { if ($b) { $f = Join-Path $b 'app.megulit'; if (Test-Path -LiteralPath $f) { $ext += [pscustomobject]@{ path = $f; what = 'app-data' } } } }
  $reg = @(); if (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MeguLit') { $reg += [pscustomobject]@{ op = 'deleteKey'; key = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\MeguLit' } }
  [pscustomobject]@{ games = @(); shortcuts = $sc; external = $ext; registry = $reg }
}
function Get-Plan {
  if ($hasNode) { try { $j = Run-Node @('--root', $Root, '--dry-run', '--json') | ConvertFrom-Json; if (-not $j.error) { return $j } } catch {} }
  Fallback-Plan
}

if (-not $isMeguLit) {
  if ($DryRun) { Write-Output ($t.notFound + $Root); exit 1 }
  Add-Type -AssemblyName System.Windows.Forms; [void][Windows.Forms.MessageBox]::Show($t.notFound + $Root, 'MeguLit'); exit 1
}
if ($DryRun) {
  if ($hasNode) { [Console]::OutputEncoding = [Text.Encoding]::UTF8; & $node --no-warnings $script_ --root $Root --dry-run; exit $LASTEXITCODE }
  $plan = Fallback-Plan; $r = Root-Lists $true
  Write-Output "MeguLit uninstall plan for $Root (no runtime: game folders cannot be checked)"
  Write-Output 'Install folder - remove:'; $r.remove | ForEach-Object { "  - $_" }; Write-Output 'Install folder - keep:'; $r.kept | ForEach-Object { "  = $_" }
  Write-Output 'Shortcuts:'; $plan.shortcuts | ForEach-Object { "  - $_" }; Write-Output 'Other folders:'; $plan.external | ForEach-Object { "  - $($_.path)" }
  Write-Output 'Registry:'; $plan.registry | ForEach-Object { "  - $($_.key)" }
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
try { Add-Type -Namespace MeguLit -Name Shell -MemberDefinition '[DllImport("shell32.dll")] public static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string id);'; [void][MeguLit.Shell]::SetCurrentProcessExplicitAppUserModelID('app.megulit.uninstall') } catch {}
$C = @{
  bg = [Drawing.Color]::FromArgb(24,19,20); card = [Drawing.Color]::FromArgb(38,30,31); line = [Drawing.Color]::FromArgb(62,48,49)
  cream = [Drawing.Color]::FromArgb(243,233,220); muted = [Drawing.Color]::FromArgb(170,154,144); red = [Drawing.Color]::FromArgb(200,50,60); gold = [Drawing.Color]::FromArgb(217,165,74)
}
$ui = if ($lang -eq 'ja') { 'Yu Gothic UI' } else { 'Microsoft YaHei UI' }
function Style-Button($b, [bool]$primary) {
  $b.FlatStyle = 'Flat'; $b.UseVisualStyleBackColor = $false; $b.ForeColor = $C.cream; $b.Cursor = 'Hand'
  if ($primary) { $b.BackColor = $C.red; $b.FlatAppearance.BorderColor = $C.red; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(222,72,82) }
  else { $b.BackColor = $C.card; $b.FlatAppearance.BorderColor = $C.line; $b.FlatAppearance.MouseOverBackColor = [Drawing.Color]::FromArgb(64,40,43) }
}
function Label($text, $x, $y, $w, $h, $size, $bold, $color) {
  $l = New-Object Windows.Forms.Label; $l.Text = $text; $l.Location = New-Object Drawing.Point($x,$y); $l.Size = New-Object Drawing.Size($w,$h)
  $l.Font = New-Object Drawing.Font($ui, $size, $(if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular })); $l.ForeColor = $color; $l.BackColor = [Drawing.Color]::Transparent
  $script:form.Controls.Add($l); $l
}
$X = @{
 zh = @{ chipFiles='程序文件'; chipGames='要还原的游戏'; chipShortcuts='快捷方式'; chipReg='注册表项'
  cardProgram='删除程序'; cardProgramSub='{0} 里的程序、运行组件、缓存和日志'
  cardGames='还原游戏'; cardGamesSub='只把 MeguLit 改过的文件改回去，存档和其他文件不动'; more='还有 {0} 个游戏…'
  cardTraces='清理痕迹'; tr_shortcuts='快捷方式 {0} 个'; tr_entry='「应用和功能」卸载项'; tr_paths='Windows 的程序路径记录 {0} 项'; tr_webview='WebView 用户数据'; tr_temp='临时文件 {0} 项'
  keepShort='账户登录、游戏库与阅读记录、生词本、设置和自定义封面会留在 {0}，以后把 MeguLit 装回这里就能接着用'
  details='查看完整清单'; detailsTitle='完整清单'; close='关闭'
  k_cfg='账户登录与设置'; k_db='游戏库、阅读记录、生词本'; k_assets='自定义封面'; k_secrets='中继密钥'; failCard='这些没能处理'; sep='、'; okShort='MeguLit 已卸载'; keptHead='你的数据保留在这里'; openFolder='打开文件夹' }
 en = @{ chipFiles='program items'; chipGames='games to restore'; chipShortcuts='shortcuts'; chipReg='registry entries'
  cardProgram='Remove the program'; cardProgramSub='Program, runtime, caches and logs in {0}'
  cardGames='Restore games'; cardGamesSub='Only files MeguLit changed are put back; saves and other files stay'; more='{0} more…'
  cardTraces='Clean up traces'; tr_shortcuts='{0} shortcut(s)'; tr_entry='Apps & features entry'; tr_paths='{0} program path record(s)'; tr_webview='WebView user data'; tr_temp='{0} temp item(s)'
  keepShort='Sign-in, library, reading history, vocabulary, settings and custom covers stay in {0}; install MeguLit here again to continue'
  details='Show full list'; detailsTitle='Full list'; close='Close'
  k_cfg='Sign-in and settings'; k_db='Library, reading history, vocabulary'; k_assets='Custom covers'; k_secrets='Relay secrets'; failCard='Not handled'; sep=', '; okShort='MeguLit is uninstalled'; keptHead='Your data is kept here'; openFolder='Open folder' }
 ja = @{ chipFiles='プログラム項目'; chipGames='戻すゲーム'; chipShortcuts='ショートカット'; chipReg='レジストリ項目'
  cardProgram='プログラムを削除'; cardProgramSub='{0} のプログラム・実行コンポーネント・キャッシュ・ログ'
  cardGames='ゲームを元に戻す'; cardGamesSub='MeguLit が変更したファイルだけを戻します。セーブなどはそのまま'; more='ほか {0} 件…'
  cardTraces='痕跡を整理'; tr_shortcuts='ショートカット {0} 個'; tr_entry='「アプリと機能」の項目'; tr_paths='プログラムパスの記録 {0} 件'; tr_webview='WebView ユーザーデータ'; tr_temp='一時ファイル {0} 件'
  keepShort='ログイン情報・ライブラリ・読書履歴・単語帳・設定・カスタムカバーは {0} に残ります。ここに入れ直せば続きから使えます'
  details='すべての項目を表示'; detailsTitle='すべての項目'; close='閉じる'
  k_cfg='ログイン情報と設定'; k_db='ライブラリ・読書履歴・単語帳'; k_assets='カスタムカバー'; k_secrets='リレーの鍵'; failCard='処理できなかった項目'; sep='・'; okShort='アンインストールしました'; keptHead='データはここに残っています'; openFolder='フォルダーを開く' }
}
foreach ($k in $X[$lang].Keys) { $t[$k] = $X[$lang][$k] }

Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
public class SmoothPanel : System.Windows.Forms.Panel {
  public SmoothPanel() { this.DoubleBuffered = true; this.SetStyle(System.Windows.Forms.ControlStyles.ResizeRedraw | System.Windows.Forms.ControlStyles.AllPaintingInWmPaint | System.Windows.Forms.ControlStyles.OptimizedDoubleBuffer, true); }
}
'@
$form = New-Object Windows.Forms.Form; $script:form = $form
$form.Text = $t.title; $form.ClientSize = New-Object Drawing.Size(720,700); $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.MinimizeBox = $false; $form.BackColor = $C.bg; $form.ForeColor = $C.cream
$exe = Join-Path $Root 'MeguLit.exe'; if (Test-Path -LiteralPath $exe) { try { $form.Icon = [Drawing.Icon]::ExtractAssociatedIcon($exe) } catch {} }
$logoFile = @((Join-Path $here 'logo.png'), (Join-Path $Root 'setup\logo.png')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($logoFile) { $bytes = [IO.File]::ReadAllBytes($logoFile); $logo = [Drawing.Image]::FromStream((New-Object IO.MemoryStream (,$bytes))) }
$F = @{ big = New-Object Drawing.Font($ui, 18, [Drawing.FontStyle]::Bold); chip = New-Object Drawing.Font($ui, 8.5)
  head = New-Object Drawing.Font($ui, 10.5, [Drawing.FontStyle]::Bold); body = New-Object Drawing.Font($ui, 9); bodyB = New-Object Drawing.Font($ui, 9, [Drawing.FontStyle]::Bold); small = New-Object Drawing.Font($ui, 8.5) }
function Pen($color, $alpha, $w) { New-Object Drawing.Pen ([Drawing.Color]::FromArgb($alpha, $color)), $w }
function Round-Path($x, $y, $w, $h, $r) {
  $gp = New-Object Drawing.Drawing2D.GraphicsPath; $d = 2 * $r
  $gp.AddArc([float]$x, [float]$y, $d, $d, 180, 90); $gp.AddArc([float]($x + $w - $d), [float]$y, $d, $d, 270, 90)
  $gp.AddArc([float]($x + $w - $d), [float]($y + $h - $d), $d, $d, 0, 90); $gp.AddArc([float]$x, [float]($y + $h - $d), $d, $d, 90, 90); $gp.CloseFigure(); $gp
}
function Fill-Card($g, $x, $y, $w, $h, $accent, $border) {
  $gp = Round-Path $x $y $w $h 10; $b = New-Object Drawing.SolidBrush $C.card; $g.FillPath($b, $gp); $b.Dispose()
  $p = Pen $(if ($border) { $border } else { $C.line }) 255 $(if ($border) { 1.5 } else { 1 }); $g.DrawPath($p, $gp); $p.Dispose(); $gp.Dispose()
  if ($accent) { $ab = New-Object Drawing.SolidBrush $accent; $bar = Round-Path ($x + 8) ($y + 14) 3 ($h - 28) 1.5; $g.FillPath($ab, $bar); $bar.Dispose(); $ab.Dispose() }
}
$wrapFlags = [Windows.Forms.TextFormatFlags]'WordBreak, NoPrefix, Left, Top'
$lineFlags = [Windows.Forms.TextFormatFlags]'SingleLine, EndEllipsis, NoPrefix, Left, Top'
function Txt($g, $text, $font, $color, $x, $y, $w, $h, [bool]$wrap) { [Windows.Forms.TextRenderer]::DrawText($g, [string]$text, $font, (New-Object Drawing.Rectangle ([int]$x), ([int]$y), ([int]$w), ([int]$h)), $color, $(if ($wrap) { $wrapFlags } else { $lineFlags })) }
function Txt-H($text, $font, $w) { [Windows.Forms.TextRenderer]::MeasureText([string]$text, $font, (New-Object Drawing.Size ([int]$w), 2000), $wrapFlags).Height }
function Txt-W($text, $font) { [Windows.Forms.TextRenderer]::MeasureText([string]$text, $font, (New-Object Drawing.Size 2000, 40), $lineFlags).Width }

$form.add_Paint({ param($s,$e) $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'
  $p = Pen $C.red 40 1; foreach ($k in 1.0, 0.86, 0.5) { $r = 150 * $k; $g.DrawEllipse($p, [float](650 - $r), [float](40 - $r), [float](2 * $r), [float](2 * $r)) }; $p.Dispose()
  if ($logo) { $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($logo, 30, 16, 157, 60) }
  $p = Pen $C.line 255 1; $g.DrawLine($p, 32, 90, 688, 90); $p.Dispose() })
$title = Label $t.title 30 100 656 32 15 $true $C.cream
$sub = Label $t.sub 32 134 656 34 8 $false $C.muted

# ---- the plan, drawn as cards (no raw path dump; the full list is one click away) ----
$view = New-Object SmoothPanel; $view.Location = New-Object Drawing.Point(32,172); $view.Size = New-Object Drawing.Size(656,372); $view.BackColor = $C.bg; $form.Controls.Add($view)
$script:mode = 'loading'; $script:model = $null; $script:step = 0; $script:spin = 0.0
$spinner = New-Object Windows.Forms.Timer; $spinner.Interval = 40; $spinner.add_Tick({ $script:spin = ($script:spin + 0.03) % 1.0; $view.Invalidate() })
$view.add_Paint({ param($s,$e) try { Paint-View $e.Graphics } catch { if ($env:MEGULIT_UNINSTALL_DEBUG) { Add-Content -LiteralPath $env:MEGULIT_UNINSTALL_DEBUG -Value ($_.ToString() + ' @ ' + $_.InvocationInfo.ScriptLineNumber) } } })
function Paint-View($g) { $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'ClearTypeGridFit'; $W = $view.Width
  if ($script:mode -eq 'loading' -or $script:mode -eq 'working') {
    Fill-Card $g 0 0 ($W - 1) 300 $null $null
    $cx = $W / 2; $cy = 96; $p = Pen $C.line 255 4; $g.DrawEllipse($p, [float]($cx - 26), [float]($cy - 26), 52, 52); $p.Dispose()
    $p = Pen $C.red 255 4; $p.StartCap = 'Round'; $p.EndCap = 'Round'; $g.DrawArc($p, [float]($cx - 26), [float]($cy - 26), 52, 52, [float](360 * $script:spin), 90); $p.Dispose()
    if ($script:mode -eq 'loading') { Txt $g $t.loading $F.body $C.muted 60 150 ($W - 120) 60 $true }
    else {
      $steps = @($t.closing, $t.restoring, $t.removing); $y = 150
      for ($i = 0; $i -lt 3; $i++) {
        $done = $i -lt $script:step; $now = $i -eq $script:step
        $mark = if ($done) { '✓' } elseif ($now) { '●' } else { '○' }
        $col = if ($done) { $C.cream } elseif ($now) { $C.gold } else { $C.muted }
        Txt $g $mark $F.bodyB $col 150 $y 24 22 $false; Txt $g $steps[$i] $(if ($now) { $F.bodyB } else { $F.body }) $col 176 $y ($W - 230) 22 $false; $y += 30
      }
    }
    return
  }
  $m = $script:model; if (-not $m) { return }
  $y = 0
  if ($m.chips) {
    $n = $m.chips.Count; $cw = [int](($W - 1 - 8 * ($n - 1)) / $n)
    for ($i = 0; $i -lt $n; $i++) { $chip = $m.chips[$i]; $x = $i * ($cw + 8)
      Fill-Card $g $x 0 $cw 56 $null $null
      Txt $g $chip.n $F.big $(if ($chip.n -gt 0) { $chip.color } else { $C.muted }) ($x + 14) 2 ($cw - 20) 34 $false
      Txt $g $chip.label $F.chip $C.muted ($x + 15) 34 ($cw - 22) 18 $false }
    $y = 64
  }
  foreach ($card in $m.cards) {
    $iw = $W - 1 - 44; $subH = if ($card.sub) { (Txt-H $card.sub $F.small $iw) + 2 } else { 0 }
    $h = 12 + 22 + $subH + 21 * @($card.rows).Count + 8
    Fill-Card $g 0 $y ($W - 1) $h $card.accent $null
    Txt $g $card.head $F.head $C.cream 26 ($y + 10) $iw 24 $false
    if ($card.sub) { Txt $g $card.sub $F.small $C.muted 26 ($y + 34) $iw $subH $true }
    $ry = $y + 34 + $subH
    foreach ($row in @($card.rows)) {
      $b = New-Object Drawing.SolidBrush $card.accent; $g.FillEllipse($b, 28, $ry + 8, 5, 5); $b.Dispose()
      $aw = [math]::Min((Txt-W $row.a $F.bodyB), [int]($iw * 0.45))
      Txt $g $row.a $F.bodyB $C.cream 42 $ry ($aw + 4) 20 $false
      if ($row.b) { Txt $g $row.b $F.body $C.muted (52 + $aw) $ry ($iw - $aw - 30) 20 $false }
      $ry += 21
    }
    $y += $h + 8
  }
}

# ---- keep-data card ----
$keepCard = New-Object SmoothPanel; $keepCard.Location = New-Object Drawing.Point(32,552); $keepCard.Size = New-Object Drawing.Size(656,84); $keepCard.BackColor = $C.bg; $form.Controls.Add($keepCard)
$keepCard.add_Paint({ param($s,$e) $g = $e.Graphics; $g.SmoothingMode = 'AntiAlias'; Fill-Card $g 0 0 ($keepCard.Width - 1) ($keepCard.Height - 1) $null $(if ($keepBox.Checked) { $C.gold } else { $C.red }) })
$keepBox = New-Object Windows.Forms.CheckBox; $keepBox.Text = $t.keep; $keepBox.Checked = $true; $keepBox.Location = New-Object Drawing.Point(16,10); $keepBox.Size = New-Object Drawing.Size(620,26)
$keepBox.Font = New-Object Drawing.Font($ui, 10.5, [Drawing.FontStyle]::Bold); $keepBox.ForeColor = $C.gold; $keepBox.BackColor = $C.card; $keepBox.Cursor = 'Hand'; $keepCard.Controls.Add($keepBox)
$keepInfo = New-Object Windows.Forms.Label; $keepInfo.Location = New-Object Drawing.Point(35,38); $keepInfo.Size = New-Object Drawing.Size(606,40); $keepInfo.Font = $F.small; $keepInfo.BackColor = $C.card; $keepCard.Controls.Add($keepInfo)

$details = New-Object Windows.Forms.LinkLabel; $details.Text = $t.details; $details.Location = New-Object Drawing.Point(32,656); $details.Size = New-Object Drawing.Size(300,22); $details.Font = $F.small
$details.LinkColor = $C.muted; $details.ActiveLinkColor = $C.gold; $details.VisitedLinkColor = $C.muted; $details.LinkBehavior = 'HoverUnderline'; $details.BackColor = [Drawing.Color]::Transparent; $form.Controls.Add($details)
$go = New-Object Windows.Forms.Button; $go.Text = $t.go; $go.Location = New-Object Drawing.Point(436,648); $go.Size = New-Object Drawing.Size(130,38); $go.Font = New-Object Drawing.Font($ui, 10, [Drawing.FontStyle]::Bold); Style-Button $go $true; $form.Controls.Add($go)
$cancel = New-Object Windows.Forms.Button; $cancel.Text = $t.cancel; $cancel.Location = New-Object Drawing.Point(576,648); $cancel.Size = New-Object Drawing.Size(112,38); $cancel.Font = New-Object Drawing.Font($ui, 9); Style-Button $cancel $false; $form.Controls.Add($cancel)
$script:detail = ''

function Rel($p) { if ($p.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase)) { $p.Substring($Root.Length + 1) } else { $p } }
function Action-Label($a) {
  switch ($a.kind) { 'patch-swap' { $t.a_patch } 'jp-restore' { $t.a_jpr } 'jp-import' { $t.a_jpi } 'jp-import-original' { $t.a_jpo } 'compat' { $t.a_compat } default { $t.a_rm } }
}
# Full list (every path) for the "show full list" window.
function Detail-Text {
  $k = if ($lang -eq 'en') { ': ' } else { '：' }; $sc = if ($lang -eq 'en') { '; ' } else { '；' }
  $keep = $keepBox.Checked; $r = Root-Lists $keep; $L = New-Object Collections.Generic.List[string]
  $L.Add("■ $($t.secProgram)  $Root"); $L.Add("  $($t.secRemove)$k"); foreach ($p in @($r.remove)) { $L.Add('    ' + (Rel $p)) }
  if ($keep) { $L.Add("  $($t.secKeep)$k"); foreach ($p in @($r.kept)) { $L.Add('    ' + (Rel $p)) } }
  $L.Add(''); $L.Add("■ $($t.secGames)")
  if (-not $hasNode) { $L.Add('  ' + $t.noNode) } elseif (-not @($plan.games).Count) { $L.Add('  ' + $t.secNoGames) }
  foreach ($g in @($plan.games)) {
    $L.Add('  ' + $(if ($g.title) { $g.title + '  —  ' } else { '' }) + $g.dir)
    foreach ($a in @($g.actions)) {
      $s = Action-Label $a
      if ($a.kind -eq 'compat') { $s += $k + (@($a.files) -join ', ') + $(if (@($a.configs).Count) { $sc + $t.a_cfg + ' ' + (@($a.configs) -join ', ') } else { '' }) }
      elseif ($a.path) { $s += $k + (Split-Path $a.path -Leaf) }
      $L.Add('    · ' + $s)
    }
  }
  $L.Add(''); $L.Add("■ $($t.secShortcuts)"); if (@($plan.shortcuts).Count) { foreach ($f in @($plan.shortcuts)) { $L.Add('  ' + $f) } } else { $L.Add('  ' + $t.none) }
  $L.Add(''); $L.Add("■ $($t.secOther)"); if (@($plan.external).Count) { foreach ($e in @($plan.external)) { $L.Add('  ' + $e.path) } } else { $L.Add('  ' + $t.none) }
  $L.Add(''); $L.Add("■ $($t.secRegistry)"); if (@($plan.registry).Count) { foreach ($x in @($plan.registry)) { $L.Add('  ' + $x.key + $(if ($x.name) { '  →  ' + $x.name } else { '' })) } } else { $L.Add('  ' + $t.none) }
  $L -join "`r`n"
}
function Plan-Text {
  $keep = $keepBox.Checked; $r = Root-Lists $keep
  $games = @($plan.games); $sc = @($plan.shortcuts); $reg = @($plan.registry); $ext = @($plan.external)
  $chips = @(
    @{ n = $games.Count; label = $t.chipGames; color = $C.gold },
    @{ n = $sc.Count; label = $t.chipShortcuts; color = $C.cream }, @{ n = $reg.Count; label = $t.chipReg; color = $C.cream })
  $cards = @(@{ accent = $C.red; head = $t.cardProgram; sub = ($t.cardProgramSub -f $Root); rows = @() })
  $rows = @(); $max = if ($games.Count -gt 4) { 3 } else { 4 }
  foreach ($g in ($games | Select-Object -First $max)) { $rows += @{ a = $(if ($g.title) { $g.title } else { Split-Path $g.dir -Leaf }); b = ((@($g.actions) | ForEach-Object { Action-Label $_ } | Select-Object -Unique) -join $t.sep) } }
  if ($games.Count -gt $max) { $rows += @{ a = ($t.more -f ($games.Count - $max)); b = '' } }
  $gsub = if (-not $hasNode) { $t.noNode } elseif (-not $games.Count) { $t.secNoGames.Trim('（','）','(',')') } else { $t.cardGamesSub }
  $cards += @{ accent = $C.gold; head = $t.cardGames; sub = $gsub; rows = $rows }
  $parts = @()
  if ($sc.Count) { $parts += ($t.tr_shortcuts -f $sc.Count) }
  if (@($reg | Where-Object { $_.op -eq 'deleteKey' }).Count) { $parts += $t.tr_entry }
  $vals = @($reg | Where-Object { $_.op -ne 'deleteKey' }).Count; if ($vals) { $parts += ($t.tr_paths -f $vals) }
  if (@($ext | Where-Object { $_.what -ne 'temp' }).Count) { $parts += $t.tr_webview }
  $tmpN = @($ext | Where-Object { $_.what -eq 'temp' }).Count; if ($tmpN) { $parts += ($t.tr_temp -f $tmpN) }
  $cards += @{ accent = $C.muted; head = $t.cardTraces; sub = $(if ($parts.Count) { $parts -join '  ·  ' } else { $t.none.Trim('（','）','(',')') }); rows = @() }
  $script:model = @{ chips = $chips; cards = $cards }; $script:mode = 'plan'; $script:detail = Detail-Text
  $keepInfo.Text = $(if ($keep) { $t.keepShort -f $Root } else { $t.noKeep }); $keepInfo.ForeColor = $(if ($keep) { $C.muted } else { [Drawing.Color]::FromArgb(232,110,118) })
  $keepBox.ForeColor = $(if ($keep) { $C.gold } else { $C.cream })
  $view.Invalidate(); $keepCard.Invalidate()
}
function Show-Details {
  $d = New-Object Windows.Forms.Form; $d.Text = $t.detailsTitle; $d.ClientSize = New-Object Drawing.Size(680,500); $d.StartPosition = 'CenterParent'; $d.BackColor = $C.bg; $d.Icon = $form.Icon; $d.MinimizeBox = $false
  $tb = New-Object Windows.Forms.TextBox; $tb.Multiline = $true; $tb.ReadOnly = $true; $tb.ScrollBars = 'Vertical'; $tb.WordWrap = $true; $tb.BorderStyle = 'None'
  $tb.Location = New-Object Drawing.Point(20,20); $tb.Size = New-Object Drawing.Size(640,410); $tb.Anchor = 'Top,Left,Right,Bottom'; $tb.BackColor = $C.card; $tb.ForeColor = $C.cream; $tb.Font = $F.body; $tb.Text = $script:detail; $tb.SelectionStart = 0; $d.Controls.Add($tb)
  $ok = New-Object Windows.Forms.Button; $ok.Text = $t.close; $ok.Location = New-Object Drawing.Point(548,448); $ok.Size = New-Object Drawing.Size(112,34); $ok.Anchor = 'Bottom,Right'; $ok.Font = $F.body; Style-Button $ok $false; $ok.add_Click({ $d.Close() }); $d.Controls.Add($ok)
  $d.AcceptButton = $ok; [void]$d.ShowDialog($form); $d.Dispose()
}

# ---- doing it ----
function Wait-UI($ms) { $until = [DateTime]::Now.AddMilliseconds($ms); while ([DateTime]::Now -lt $until) { Pump; Start-Sleep -Milliseconds 30 } }
function Stop-MeguLit {
  $prefix = $Root + '\'
  $mine = { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID -and $_.Path -and $_.Path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) }) }
  foreach ($p in (& $mine | Where-Object { $_.ProcessName -eq 'MeguLit' })) { try { [void]$p.CloseMainWindow() } catch {} }
  Wait-UI 1500
  for ($i = 0; $i -lt 3; $i++) { $left = & $mine; if (-not $left.Count) { break }; foreach ($p in $left) { try { $p.Kill() } catch {} }; Wait-UI 800 }
}
function Remove-WithRetry($p) {
  for ($i = 0; $i -lt 6; $i++) {
    try { if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction Stop }; return $true } catch { Wait-UI 500 }
  }
  return -not (Test-Path -LiteralPath $p)
}
$script:leftovers = New-Object Collections.Generic.List[string]
function Run-Uninstall([bool]$noAsk) {
  $keep = $keepBox.Checked
  $ask = if ($keep) { $t.confirm } else { $t.confirmAll }
  if (-not $noAsk -and [Windows.Forms.MessageBox]::Show($form, $ask, $t.title, 'YesNo', $(if ($keep) { 'Question' } else { 'Warning' })) -ne 'Yes') { return }
  $go.Enabled = $false; $cancel.Enabled = $false; $keepBox.Enabled = $false; $details.Visible = $false; $title.Text = $t.working
  $script:mode = 'working'; $script:step = 0; $spinner.Start(); Pump; Stop-MeguLit
  $failed = New-Object Collections.Generic.List[string]
  $script:step = 1; Pump
  if ($hasNode) {
    $argv = @('--root', $Root, '--leave-root', '--json'); if (-not $keep) { $argv += '--no-keep-data' }
    try { $res = Run-Node $argv | ConvertFrom-Json } catch { $res = $null }
    if ($res -and $res.report) {
      foreach ($f in @($res.report.failed)) {
        if ($f.what -eq 'game') { $failed.Add('  ' + $f.path + '  [' + $f.kind + '] ' + $(if (@($f.skipped).Count) { (@($f.skipped) -join ', ') + ' ' + $t.skippedGame } else { $f.error })) }
        else { $failed.Add('  ' + $(if ($f.path) { $f.path } else { $f.key + ' ' + $f.name }) + '  ' + $f.error) }
      }
    } else { $failed.Add('  node: ' + $(if ($res.error) { $res.error } else { 'no result' })) }
  } else {
    foreach ($f in @($plan.shortcuts) + @($plan.external | ForEach-Object { $_.path })) { if (-not (Remove-WithRetry $f)) { $failed.Add('  ' + $f) } }
    foreach ($r in @($plan.registry)) { try { Remove-Item -LiteralPath ('Registry::' + $r.key) -Recurse -Force -ErrorAction Stop } catch { $failed.Add('  ' + $r.key) } }
    if ($keep) { try { [IO.File]::WriteAllText((Join-Path $Root $keepNote), "MeguLit 已卸载，这里保留了你的本地数据（data\ 与 secrets\）。把 MeguLit 装回这个文件夹就能接着用`r`nMeguLit was uninstalled. Your local data (data\ and secrets\) is kept here; install MeguLit into this folder again to continue.`r`n", (New-Object Text.UTF8Encoding $true)) } catch {} }
  }
  $script:step = 2; Pump
  $r = Root-Lists $keep
  foreach ($p in @($r.remove)) { if (-not (Remove-WithRetry $p)) { $script:leftovers.Add($p) } }
  if (-not $keep) { try { Remove-Item -LiteralPath $Root -Force -ErrorAction Stop } catch { if (Test-Path -LiteralPath $Root) { $script:leftovers.Add($Root) } } }
  # ---- result ----
  $spinner.Stop()
  $L = New-Object Collections.Generic.List[string]
  if ($keep) { $L.Add($t.okKept); $L.Add('  ' + $Root); foreach ($k in @((Root-Lists $true).kept)) { $L.Add('    ' + (Rel $k)) } } else { $L.Add($t.okAll) }
  $problems = @($failed) + @($script:leftovers | ForEach-Object { '  ' + $_ })
  if ($problems.Count) { $L.Add(''); $L.Add($t.failed); foreach ($f in $problems) { $L.Add($f) } }
  $script:detail = $L -join "`r`n"
  $rows = @()
  if ($keep) {
    $names = @{ 'config' = $t.k_cfg; 'megulit.sqlite' = $t.k_db; 'assets' = $t.k_assets; 'secrets' = $t.k_secrets }
    foreach ($k in @((Root-Lists $true).kept)) { $leaf = (Split-Path $k -Leaf).ToLower(); if ($names.ContainsKey($leaf)) { $rows += @{ a = $names[$leaf]; b = (Rel $k) } } }
  }
  $cards = @(@{ accent = $C.gold; head = $(if ($keep) { $t.keptHead } else { $t.okAll }); sub = $(if ($keep) { $Root } else { '' }); rows = $rows })
  if ($problems.Count) { $prow = @($problems | Select-Object -First 4 | ForEach-Object { @{ a = $_.Trim(); b = '' } }); $cards += @{ accent = $C.red; head = $t.failCard; sub = $t.failed; rows = $prow } }
  $script:model = @{ chips = $null; cards = $cards }; $script:mode = 'plan'
  $title.Text = $t.okShort; $sub.Text = ''
  $keepCard.Visible = $false; $view.Height = 460; $view.Invalidate(); $details.Visible = [bool]$problems.Count
  if ($keep) { $go.Text = $t.openFolder; Style-Button $go $false; $go.Font = $F.body; $go.Enabled = $true } else { $go.Visible = $false }
  $cancel.Text = $t.done; $cancel.Enabled = $true; Style-Button $cancel $true; $script:finished = $true
}

# Hidden cmd: waits for this window to close, retries what was locked, then deletes the temp copy (and itself).
function Start-Cleanup {
  if (-not $Relaunched -and -not $script:leftovers.Count) { return }
  $tmpDir = $here; $cmd = Join-Path ([IO.Path]::GetTempPath()) ('megulit-uninstall-' + $PID + '.cmd')
  $lines = @('@echo off', 'chcp 65001 >nul', 'ping -n 4 127.0.0.1 >nul')
  foreach ($p in $script:leftovers) { $lines += "if exist `"$p\*`" (rd /s /q `"$p`") else (del /f /q `"$p`")" }
  if ($script:finished -and -not $keepBox.Checked) { $lines += "rd `"$Root`" 2>nul" }
  if ($tmpDir -like '*megulit-uninstall-*') { $lines += "rd /s /q `"$tmpDir`" 2>nul" }
  $lines += '(goto) 2>nul & del /f /q "%~f0"'
  [IO.File]::WriteAllText($cmd, ($lines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding $false))
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') -ArgumentList @('/c', "`"$cmd`"") -WindowStyle Hidden
}

$go.add_Click({ if ($script:finished) { Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList "`"$Root`"" } else { Run-Uninstall } })
$cancel.add_Click({ $form.Close() })
$keepBox.add_CheckedChanged({ if ($script:plan -or -not $hasNode) { Plan-Text } })
$details.add_LinkClicked({ Show-Details })
$form.add_Shown({ $script:mode = 'loading'; $spinner.Start(); $keepBox.Enabled = $false; $go.Enabled = $false; $details.Enabled = $false; Pump; $script:plan = Get-Plan; $spinner.Stop(); Plan-Text; $go.Enabled = $true; $keepBox.Enabled = $true; $details.Enabled = $true })
$plan = $null
# MEGULIT_UNINSTALL_AUTO=keep|all (end-to-end test on a copied install): runs without the confirm box, off screen, then closes.
if ($env:MEGULIT_UNINSTALL_AUTO) { $form.StartPosition = 'Manual'; $form.Location = New-Object Drawing.Point(-20000,-20000); $form.ShowInTaskbar = $false; $form.add_Shown({ $keepBox.Checked = ($env:MEGULIT_UNINSTALL_AUTO -ne 'all'); Run-Uninstall $true; if ($env:MEGULIT_UNINSTALL_RESULT) { [IO.File]::WriteAllText($env:MEGULIT_UNINSTALL_RESULT, $script:detail, (New-Object Text.UTF8Encoding $false)) }; if ($env:MEGULIT_UNINSTALL_SHOT) { $form.Refresh(); $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height; $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle 0,0,$form.Width,$form.Height)); $bmp.Save($env:MEGULIT_UNINSTALL_SHOT) }; $form.Close() }) }
# MEGULIT_UNINSTALL_PREVIEW=<png>: render the plan page to an image and exit (layout check; changes nothing).
if ($env:MEGULIT_UNINSTALL_PREVIEW) { $form.StartPosition = 'Manual'; $form.Location = New-Object Drawing.Point(-20000,-20000); $form.ShowInTaskbar = $false; $form.add_Shown({ if ($env:MEGULIT_UNINSTALL_PREVIEW_STATE -eq 'nokeep') { $keepBox.Checked = $false }; $form.Refresh(); $bmp = New-Object Drawing.Bitmap $form.Width, $form.Height; $form.DrawToBitmap($bmp, (New-Object Drawing.Rectangle 0,0,$form.Width,$form.Height)); $bmp.Save($env:MEGULIT_UNINSTALL_PREVIEW); $form.Close() }) }
[void]$form.ShowDialog()
if (-not $env:MEGULIT_UNINSTALL_PREVIEW) { Start-Cleanup }
exit 0
