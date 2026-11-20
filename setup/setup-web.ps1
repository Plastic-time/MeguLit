# SPDX-License-Identifier: GPL-3.0-or-later
# MeguLit setup, web skin. Dot-sourced by setup-runtime.ps1 right before the window is shown.
# The download / install logic in setup-runtime.ps1 is not touched: this file only (1) tries to show the new one-take
# 3D interface in a frameless WebView2 window, (2) feeds it the real state (segments, bytes, speed, source, phase) read
# from the logic's own variables, and (3) turns its buttons into the clicks the old window would get.
# Anything wrong (no WebView2 runtime, no wrapper DLLs, no WebGL, a script error, no first frame within 10 s, a crawling frame
# rate) drops the skin and the old window appears as before, with the reason in %LOCALAPPDATA%\MeguLit\setup-ui.log.
# MEGULIT_SETUP_WEB=0 forces the old window; tests: MEGULIT_SETUP_WEB=1 (also under MEGULIT_SETUP_TEST) and
# MEGULIT_SETUP_WEB_TEST=noruntime|nodll|nogl|boom|lateboom|silent|slow to exercise the fallbacks.
$script:webActive = $false; $script:webHold = $false; $script:win = $null; $script:frame1Seen = $false; $script:webReady = $false; $script:webTimer = $null
function Web-Log([string]$m) {
  try { if ($env:MEGULIT_SETUP_UILOG) { Add-Content -Encoding UTF8 $env:MEGULIT_SETUP_UILOG ((Get-Date -Format 's') + ' ' + $m) } else { $d = Join-Path $env:LOCALAPPDATA 'MeguLit'; New-Item -ItemType Directory -Force $d | Out-Null; Add-Content -Encoding UTF8 (Join-Path $d 'setup-ui.log') ((Get-Date -Format 's') + ' ' + $m) } } catch {}
  Note 'web' @{ text = $m }
}
function UI-Done { if ($script:webActive -and (-not $testLog -or $env:MEGULIT_SETUP_WEB_HOLD -eq '1')) { $script:webHold = $true } }   # the done screen waits for the user (tests: only with MEGULIT_SETUP_WEB_HOLD=1)
function Say([string]$text) { Note 'message' @{ text = $text }; if (-not $testLog) { $owner = if ($script:webActive -and $script:win) { $script:win } else { $form }; [void][Windows.Forms.MessageBox]::Show($owner, $text, 'MeguLit') } }
function Web-Wanted {
  if ($env:MEGULIT_SETUP_WEB -eq '0') { return 'forced off (MEGULIT_SETUP_WEB=0)' }
  if ($testLog -and $env:MEGULIT_SETUP_WEB -ne '1') { return 'test mode without MEGULIT_SETUP_WEB=1' }
  if ($env:MEGULIT_SETUP_PREVIEW -or $env:MEGULIT_SETUP_THEME) { return 'preview / theme mode' }
  if (-not $webview -or $env:MEGULIT_SETUP_WEB_TEST -eq 'noruntime') { return 'WebView2 runtime not installed' }
  if ([Environment]::OSVersion.Version.Major -lt 10) { return 'Windows older than 10' }
  ''
}
function Web-Post($obj) { try { if ($script:win -and $script:win.Web.CoreWebView2) { $script:win.Web.CoreWebView2.PostWebMessageAsJson((ConvertTo-Json -Compress -Depth 6 $obj)) } } catch {} }
function Web-Writable([string]$p) {
  try { $q = [IO.Path]::GetFullPath($p); while ($q -and -not (Test-Path $q)) { $q = Split-Path $q }; if (-not $q) { return $false }
    $t = Join-Path $q ('.w-' + $PID); [IO.File]::WriteAllText($t, 'ok'); Remove-Item $t -Force; $true } catch { $false }
}
function Web-Check([string]$p) {
  $ok = $true; try { [void][IO.Path]::GetFullPath($p); if (-not [IO.Path]::IsPathRooted($p)) { $ok = $false } } catch { $ok = $false }
  if (-not $ok) { return @{ state = 'readonly'; free = 0; need = (Need-Bytes $pathBox.Text) } }
  try { $need = Need-Bytes $p } catch { return @{ state = 'readonly'; free = 0; need = (Need-Bytes $pathBox.Text) } }   # e.g. a drive letter that does not exist
  @{ state = $(if (Web-Writable $p) { 'ok' } else { 'readonly' }); free = (Drive-Free $p); need = $need }
}
function Web-Info {
  $dr = @(); foreach ($d in [IO.DriveInfo]::GetDrives()) { if ($d.DriveType -eq 'Fixed' -and $d.IsReady -and $d.AvailableFreeSpace -gt (Need-Bytes $pathBox.Text)) { $dr += @{ path = (Join-Path $d.RootDirectory.FullName 'MeguLit'); free = $d.AvailableFreeSpace } } }
  @{ defaultTarget = $pathBox.Text; drives = @($dr | Select-Object -First 3); need = (Need-Bytes $pathBox.Text) }
}
function Web-State {
  $ids = @($script:dl); $segs = @{}; $n = 0
  foreach ($id in $ids) { $segs[$id] = [int][math]::Ceiling([long]$packs.$id.size / 4MB); $n += $segs[$id] }
  $st = New-Object 'byte[]' ([math]::Max(1, $n)); $fr = New-Object 'float[]' ([math]::Max(1, $n)); $off = 0
  for ($k = 0; $k -lt $ids.Count; $k++) {
    $id = $ids[$k]; $len = $segs[$id]
    if ($k -lt $script:dlPos) { for ($i = 0; $i -lt $len; $i++) { $st[$off + $i] = 2; $fr[$off + $i] = 1 } }
    elseif ($script:fetch -and $id -eq $script:fetchId) { $b = New-Object 'byte[]' $len; $x = New-Object 'float[]' $len; try { $script:fetch.Snap($b, $x) } catch {}; for ($i = 0; $i -lt $len; $i++) { $st[$off + $i] = $b[$i]; $fr[$off + $i] = $x[$i] } }
    $off += $len
  }
  $f = $script:fetch; $got = Got-Bytes; $total = Total-Bytes
  $phase = if ($script:mode -eq 'failed') { 'failed' } elseif ($script:done) { 'done' } elseif ($script:copying -or $script:busy) { 'unpack' }
    elseif ($f) { if ([string]$f.Phase -eq 'download' -and $got -gt 0) { 'download' } else { 'probe' } }
    elseif (Downloads-Done) { if ($script:confirmed) { 'unpack' } else { 'downloaded' } } else { 'probe' }
  $o = @{ phase = $phase; n = $n; total = $total; got = $got; speed = $(if ($f) { [long]$f.TotalSpeed } else { 0 }); pack = $(if ($script:fetchId) { $script:fetchId } elseif ($ids.Count) { $ids[-1] } else { '' })
    src = $(if ($f) { [string]$f.SourceLabel() } else { '' }); srcN = 0; dir = $runtimeDir; unpack = $(if ($ids.Count) { [math]::Min(1, [math]::Max(0, ($script:dlPos - $script:ready.Count) / $ids.Count)) } else { 0 })
    st = ($st -join ''); fr = @($fr | ForEach-Object { [int][math]::Round($_ * 100) }); confirmed = [bool]$script:confirmed }
  if ($phase -eq 'failed') { $o.kind = $script:failKind }
  $o
}
function Web-Close { $script:webHold = $false; try { $form.Close() } catch {} }
function Web-Abort([string]$why) {
  if (-not $script:webActive) { return }
  Web-Log ('cold-start attempt=1 result=fallback reason="' + $why + '"')
  Web-Log ('falling back to the classic window: ' + $why)
  $script:webActive = $false; $script:webHold = $false
  try { if ($script:webTimer) { $script:webTimer.Stop() } } catch {}
  try { $script:win.AllowClose = $true; $script:win.Close(); $script:win.Dispose() } catch {}
  $script:win = $null
  try { [SetupWin]::ToolWindow($form.Handle, $false) } catch {}
  try { $wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea; $px = [int][math]::Max($wa.Left, $wa.Left + ($wa.Width - $form.Width) / 2); $py = [int][math]::Max($wa.Top, $wa.Top + ($wa.Height - $form.Height) / 2); $form.Location = New-Object Drawing.Point($px, $py); $form.Opacity = 1; $form.Activate() } catch { Web-Log ('restoring the classic window failed: ' + $_) }
}
function Web-Act($m) {
  $t = [string]$m.type; $shim = ($m.via -eq 'shim')
  try {
    switch ($t) {
      'hello' { Web-Post @{ t = 'info'; i = (Web-Info) } }
      'mark' { if ($m.what -eq 'frame1') { $script:frame1Seen = $true }
        if ($m.what -eq 'poster' -and $script:posterBox) { try { $script:win.Controls.Remove($script:posterBox); $script:posterBox.Dispose() } catch {}; $script:posterBox = $null }
        Web-Log ('cold-start mark=' + $m.what + ' ms=' + $(if ($script:shownAt) { [int]([DateTime]::Now - $script:shownAt).TotalMilliseconds } else { -1 }) + ' page=' + $m.at) }   # player.js: poster / frame1 on screen, ms since the window was shown
      'ready' { $script:webReady = $true; $script:readyMs = [int]([DateTime]::Now - $script:skinT0).TotalMilliseconds }
      'gl-attempt' { Web-Log ('cold-start attempt=' + $m.attempt + ' result=retry why="' + $m.reason + '" ms=' + $m.ms) }
      'gl-report' { Web-Log ('cold-start attempt=' + $m.attempt + ' result=' + $m.result + ' ms=' + $script:readyMs + ' renderer="' + $m.renderer + '" std=' + $m.std + ' errs=' + $m.errs + ' t_init=' + $script:tInit + ' t_nav=' + $script:tNav + ' t_create=' + $m.created + ' t_frame1=' + $m.frame1 + ' t_settle=' + $m.settleMs + ' t_page=' + $m.pageMs) }
      'fatal' { Web-Log ('page fatal: ' + $m.reason); $script:webFatalSeen = $true; Web-Abort ('page reported: ' + $m.reason) }
      'asked' { $script:askAt = $null }
      'drag' { Web-Log 'drag: system move loop starts'; $script:win.Drag(); Web-Log ('drag: loop ended at ' + $script:win.Location) }
      'minimize' { $script:win.WindowState = 'Minimized'; Web-Log ('minimized: state=' + $script:win.WindowState) }
      'close' { Web-Close }
      'checkpath' { if ($shim) { Web-Post @{ t = 'reply'; id = $m.id; r = (Web-Check ([string]$m.path)) } } }
      'browse' {
        if ($shim) {
          $d = New-Object Windows.Forms.FolderBrowserDialog; $d.Description = '选择 MeguLit 的安装位置（会在里面建 MeguLit 文件夹）'; $d.ShowNewFolderButton = $true
          if ($d.ShowDialog($script:win) -eq 'OK') { $p = $d.SelectedPath; if ((Split-Path $p -Leaf) -ne 'MeguLit' -and -not (Test-Path (Join-Path $p 'MeguLit.exe'))) { $p = Join-Path $p 'MeguLit' }; $pathBox.Text = $p }
          Web-Post @{ t = 'reply'; id = $m.id; r = @{ path = $pathBox.Text } }
        } }
      'install' {
        if ($shim) {
          # variable names here must not collide (case-insensitively) with the logic's own: $C is its colour table, read by the handlers called below
          $chk = Web-Check ([string]$m.path)
          if ($chk.state -eq 'ok') { $pathBox.Text = [string]$m.path; $deskCheck.Checked = [bool]$m.desktop; $menuCheck.Checked = [bool]$m.menu; $confirm.PerformClick(); if (-not $script:confirmed) { $chk.state = 'readonly' } }
          Web-Post @{ t = 'reply'; id = $m.id; r = $chk }
        } }
      'retry' { if ($shim -and $script:mode -eq 'failed') { $button.PerformClick() } }
      'copylog' { if ($shim) { try { $lp = Join-Path $sourceRoot 'logs\setup-download.log'; $txt = 'MeguLit setup ' + (Get-Date -Format s) + "`r`n" + $(if (Test-Path $lp) { (Get-Content -Tail 120 -Encoding UTF8 $lp) -join "`r`n" } else { '(no log yet)' }); [Windows.Forms.Clipboard]::SetText($txt) } catch {} } }
      'manual' { if ($shim) { try { Start-Process 'https://github.com/ilynthn/MeguLit/releases/latest' } catch {} } }
      'launch' { if ($shim) { Web-Close } }
    }
  } catch { Web-Log ('action ' + $t + ' failed: ' + $_); if ($m.id) { Web-Post @{ t = 'reply'; id = $m.id; r = @{ state = 'readonly'; free = 0; need = 0 } } } }
}

function Start-WebSkin {
  Boot-Mark 'web-layer-start'
  $why = Web-Wanted; if ($why) { Web-Log ('classic window: ' + $why); return }
  $t0 = [DateTime]::Now; $script:skinT0 = $t0
  try {
    $dir = Join-Path $sourceRoot 'setup\webview2'; if ($env:MEGULIT_SETUP_WEB_TEST -eq 'nodll') { $dir = Join-Path $sourceRoot 'setup\webview2-missing' }
    $ui = Join-Path $sourceRoot 'setup\ui-web'
    if (-not (Test-Path (Join-Path $dir 'Microsoft.Web.WebView2.Core.dll'))) { throw 'WebView2 wrapper DLLs are missing' }
    if (-not (Test-Path (Join-Path $ui 'index.html'))) { throw 'ui-web is missing' }
    Add-Type -Path (Join-Path $dir 'Microsoft.Web.WebView2.Core.dll'); Add-Type -Path (Join-Path $dir 'Microsoft.Web.WebView2.WinForms.dll')
    $env:PATH = (Join-Path $dir $(if ([Environment]::Is64BitProcess) { 'x64' } else { 'x86' })) + ';' + $env:PATH
    if (-not ('SetupWin' -as [type])) { Add-Type -ReferencedAssemblies System.Windows.Forms, System.Drawing -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Windows.Forms;
public class SetupWin : Form {
  [DllImport("user32.dll")] static extern bool ReleaseCapture();
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  [DllImport("dwmapi.dll")] static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref MARGINS m);
  [StructLayout(LayoutKind.Sequential)] struct MARGINS { public int l, r, t, b; }
  public bool AllowClose = false; public Action AskClose; public Control Web;
  protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.Style |= 0x00020000 | 0x00080000; return cp; } }
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  public static void ToolWindow(IntPtr h, bool on) { int ex = GetWindowLong(h, -20); SetWindowLong(h, -20, on ? (ex | 0x80) : (ex & ~0x80)); }   // keeps the hidden control surface out of Alt+Tab
  public void Drag() { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); }
  public void Dress() { int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4); MARGINS m = new MARGINS(); m.l = 1; m.r = 1; m.t = 1; m.b = 1; DwmExtendFrameIntoClientArea(Handle, ref m); }
  protected override void OnFormClosing(FormClosingEventArgs e) { if (!AllowClose && AskClose != null) { e.Cancel = true; AskClose(); } base.OnFormClosing(e); }
}
'@ }
    # per-monitor DPI awareness for the skin's window only: the old window keeps its own (system-scaled) behaviour
    $oldCtx = [IntPtr]::Zero; try { $oldCtx = [SetupWin]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch {}
    $scale = 1.0; try { $scale = [SetupWin]::GetDpiForSystem() / 96.0 } catch {}
    $wa0 = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea; $scale = [math]::Max(0.5, [math]::Min($scale, [math]::Min($wa0.Width / 1000.0, $wa0.Height / 640.0)))   # never larger than the work area (small screens)
    if ($testLog -and $env:MEGULIT_SETUP_WEB_DPI) { $scale = [double]$env:MEGULIT_SETUP_WEB_DPI / 96.0 }   # tests: emulate 125/150/200 % (with --force-device-scale-factor)
    $win = New-Object SetupWin
    $win.Text = 'MeguLit 安装'; $win.FormBorderStyle = 'None'; $win.StartPosition = 'CenterScreen'; $win.ShowInTaskbar = -not $testLog; $win.BackColor = [Drawing.Color]::FromArgb(236, 241, 249)
    $win.ClientSize = New-Object Drawing.Size([int](1000 * $scale), [int](640 * $scale)); $win.MinimumSize = $win.Size
    $ico = Join-Path $sourceRoot 'MeguLit.exe'; if (Test-Path $ico) { try { $win.Icon = [Drawing.Icon]::ExtractAssociatedIcon($ico) } catch {} }
    $web = New-Object Microsoft.Web.WebView2.WinForms.WebView2; $web.Dock = 'Fill'; $win.Controls.Add($web); $win.Web = $web
    # Native poster: the first frame of the opening clip, drawn by the window itself the moment it appears. A cold WebView2 needs ~2 s
    # (more on a loaded machine) before the page can paint anything; the poster covers that and is removed when the page shows its own.
    $script:posterBox = $null
    try { $pp = Join-Path $ui 'video\light\intro.jpg'; if (Test-Path $pp) { $ms = New-Object IO.MemoryStream (,[IO.File]::ReadAllBytes($pp)); $pb = New-Object Windows.Forms.PictureBox; $pb.Dock = 'Fill'; $pb.SizeMode = 'StretchImage'; $pb.Image = [Drawing.Image]::FromStream($ms); $win.Controls.Add($pb); $pb.BringToFront(); $script:posterBox = $pb } } catch { Web-Log ('native poster: ' + $_) }
    $props = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties; $script:webData = $(if ($env:MEGULIT_SETUP_WEBVIEW2_DATA) { $env:MEGULIT_SETUP_WEBVIEW2_DATA } elseif ($env:WEBVIEW2_USER_DATA_FOLDER) { $env:WEBVIEW2_USER_DATA_FOLDER } else { Join-Path $env:LOCALAPPDATA ('MeguLit\setup-webview2' + $PID) }); $props.UserDataFolder = $script:webData   # one folder per setup process: two setups at once do not fight over it; $web.CreationProperties = $props
    $script:win = $win; $script:webReady = $false
    $win.AskClose = { $script:askAt = [DateTime]::Now; try { $script:win.Web.CoreWebView2.ExecuteScriptAsync('window.__askClose&&window.__askClose()') | Out-Null } catch { Web-Close } }
    $web.Add_CoreWebView2InitializationCompleted({ param($s, $e)
      if (-not $e.IsSuccess) { Web-Log ('WebView2 init failed: ' + $e.InitializationException.Message); return }
      $script:tInit = [int]([DateTime]::Now - $script:skinT0).TotalMilliseconds; $cw = $script:win.Web.CoreWebView2; $cw.Settings.AreDefaultContextMenusEnabled = $false; $cw.Settings.AreDevToolsEnabled = [bool]$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS; $cw.Settings.IsStatusBarEnabled = $false; $cw.Settings.IsZoomControlEnabled = $false
      $cw.SetVirtualHostNameToFolderMapping('megulit-setup.local', (Join-Path $sourceRoot 'setup\ui-web'), [Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind]::Allow)
      $cw.add_WebMessageReceived({ param($s2, $a) try { Web-Act ($a.WebMessageAsJson | ConvertFrom-Json) } catch { Web-Log ('message error: ' + $_) } })
      $uiLang = $(if ($env:MEGULIT_SETUP_LANG -eq 'en') { 'en' } else { 'zh' })   # Chinese by default like the old window; English only on request (MEGULIT_SETUP_LANG=en). Windows' language says too little: many Chinese users run an English Windows.
      $q = 'host=2&desk=1&lang=' + $uiLang;
      if ($testLog -and $env:MEGULIT_SETUP_WEB_QUERY) { $q += '&' + $env:MEGULIT_SETUP_WEB_QUERY }   # tests: feature switches such as shadow=0&env=0&trans=0&aa=1
      if ($env:MEGULIT_SETUP_WEB_TEST) { $q += '&t=' + $env:MEGULIT_SETUP_WEB_TEST }   # was inside the comment above, so the page never saw the test switch
      $cw.add_NavigationCompleted({ if (-not $script:tNav) { $script:tNav = [int]([DateTime]::Now - $script:skinT0).TotalMilliseconds } })
      $cw.Navigate('https://megulit-setup.local/index.html?' + $q)
    })
    $win.Show(); $script:shownAt = [DateTime]::Now; Boot-Mark 'skin-window-shown'; Close-Splash; if ($script:posterBox) { $win.Refresh(); Web-Log ('cold-start mark=native-poster ms=' + [int]([DateTime]::Now - $script:shownAt).TotalMilliseconds) }; $wvEnv = $null; if ($script:wv2EnvTask) { $tw = [DateTime]::Now; while (-not $script:wv2EnvTask.IsCompleted -and ([DateTime]::Now - $tw).TotalSeconds -lt 20) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 10 }; if ($script:wv2EnvTask.Status -eq 'RanToCompletion') { $wvEnv = $script:wv2EnvTask.Result; Web-Log ('webview2 environment prewarmed, ready ' + [int]([DateTime]::Now - $tw).TotalMilliseconds + ' ms after the window') } else { Web-Log ('prewarmed environment not usable: ' + $script:wv2EnvTask.Status) } }; if ($wvEnv) { [void]$web.EnsureCoreWebView2Async($wvEnv) } else { $web.CreationProperties = $props; [void]$web.EnsureCoreWebView2Async($null) }
    # Watchdog: the page must report its first video frame within 12 s of the window (MEGULIT_SETUP_WATCHDOG_MS in tests). If it does
    # not (a hung renderer, a decoder that never delivers, a script stuck before it could report fatal), reload the page once; if the
    # reload does not bring a frame either, drop the skin for the classic window. The user never sits in front of a picture that does nothing.
    $script:wdLimit = $(if ($env:MEGULIT_SETUP_WATCHDOG_MS -match '^\d+$') { [int]$env:MEGULIT_SETUP_WATCHDOG_MS } else { 12000 }); $script:wdT0 = [DateTime]::Now; $script:wdReloads = 0
    $script:wdTimer = New-Object Windows.Forms.Timer; $script:wdTimer.Interval = 250
    $script:wdTimer.add_Tick({
      if ($script:frame1Seen -or -not $script:win) { $script:wdTimer.Stop(); return }
      if (([DateTime]::Now - $script:wdT0).TotalMilliseconds -lt $script:wdLimit) { return }
      if ($script:wdReloads -eq 0 -and $script:win.Web.CoreWebView2) {
        $script:wdReloads = 1; $script:wdT0 = [DateTime]::Now; Web-Log ('watchdog: no video frame within ' + $script:wdLimit + ' ms, reloading the page')
        try { $script:win.Web.CoreWebView2.Reload() } catch { Web-Log ('watchdog: reload failed: ' + $_) }
      } else {
        $script:wdTimer.Stop(); Web-Log ('watchdog: still no video frame after ' + $(if ($script:wdReloads) { 'a reload' } else { 'start' }) + ', using the classic window')
        $script:webFatalSeen = $true; if ($script:webActive) { Web-Abort 'watchdog: no video frame' }
      }
    })
    $script:wdTimer.Start()
    if ($oldCtx -ne [IntPtr]::Zero) { try { [void][SetupWin]::SetThreadDpiAwarenessContext($oldCtx) } catch {} }
    # wait for the first rendered frame (the page says "ready" only after WebGL and the scene came up); 10 s at most
    $deadline = $t0.AddSeconds(32)
    while (-not $script:webReady -and [DateTime]::Now -lt $deadline -and $script:win -and -not $script:webFatalSeen) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 20 }
    if (-not $script:webReady) { throw ('no confirmed scene within 32 s' + $(if ($script:webFatalSeen) { ' (page reported a problem)' } else { '' })) }
    $win.Dress()
    $script:webActive = $true
    # the old window becomes the invisible control surface: same controls, same handlers, no second taskbar button
    $form.ShowInTaskbar = $false; $form.StartPosition = 'Manual'; $form.Location = New-Object Drawing.Point(-32000, -32000); $form.Opacity = 0
    $form.add_Shown({ try { [SetupWin]::ToolWindow($form.Handle, $true) } catch {} })
    $form.add_FormClosing({ Web-Log ('classic window closing: ' + $_.CloseReason + ', hold=' + $script:webHold + ', done=' + $script:done + ' ' + ((Get-PSCallStack | ForEach-Object { $_.FunctionName + ':' + $_.ScriptLineNumber }) -join ' < ')); if ($script:webHold) { $_.Cancel = $true } })
    $form.add_FormClosed({ try { if ($script:webData -and $script:webData -like '*setup-webview2\*') { Start-Process -WindowStyle Hidden -FilePath "$env:SystemRoot\System32\cmd.exe" -ArgumentList ('/c ping -n 8 127.0.0.1 >nul & rmdir /s /q "' + $script:webData + '"') } } catch {}; try { if ($script:win) { $script:win.AllowClose = $true; $script:win.Close() } } catch {} })
    $script:webTimer = New-Object Windows.Forms.Timer; $script:webTimer.Interval = 150
    $script:webTimer.add_Tick({
      if (-not $script:webActive) { return }
      try { Web-Post @{ t = 'state'; s = (Web-State) } } catch { Web-Log ('state error: ' + $_) }
      if ($testLog -and (Test-Path ($testLog + '.restore'))) { Remove-Item ($testLog + '.restore') -Force -ErrorAction SilentlyContinue; $script:win.WindowState = 'Normal'; Web-Log ('restored: state=' + $script:win.WindowState) }
      if ($script:askAt -and ([DateTime]::Now - $script:askAt).TotalSeconds -gt 4) { $script:askAt = $null; Web-Log 'page did not answer the close request: closing'; Web-Close }
    })
    $script:webTimer.Start()
    $script:chkT = New-Object Windows.Forms.Timer; $script:chkT.Interval = 2500; $script:chkT.add_Tick({ $script:chkT.Stop(); Web-Log ('skin window enabled=' + $script:win.Enabled + ' visible=' + $script:win.Visible + ' taskbar: skin=' + $script:win.ShowInTaskbar + ' classic=' + $form.ShowInTaskbar + ' size=' + $script:win.ClientSize.Width + 'x' + $script:win.ClientSize.Height) }); $script:chkT.Start()
    Web-Log ('web skin active, first frame after ' + [int]([DateTime]::Now - $t0).TotalMilliseconds + ' ms')
  } catch {
    $script:webActive = $false
    try { if ($script:win) { $script:win.AllowClose = $true; $script:win.Close(); $script:win.Dispose() } } catch {}
    $script:win = $null
    Web-Log ('cold-start attempt=1 result=fallback reason="' + $_ + '"')
    Web-Log ('classic window (skin not available): ' + $_)
  }
}
Start-WebSkin
