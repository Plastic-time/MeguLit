# SPDX-License-Identifier: GPL-3.0-or-later
# Frameless window host for the setup trial: a borderless WinForms form that carries a WebView2 control. No system title bar, no
# system buttons. The page draws its own frame; this host only supplies: drag (page asks), minimize, close, rounded corners + shadow
# (Windows 11 DWM), taskbar icon, Alt+F4 (goes through the page's "still downloading" confirm).
# The managed WebView2 wrappers (Core + WinForms + WebView2Loader.dll) are loaded from -DllDir (trial tooling, not part of the shipped installer).
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$DllDir,
  [Parameter(Mandatory=$true)][string]$UserData,
  [string]$Icon = '',
  [string]$Log = '',
  [string]$Title = 'MeguLit 安装 (trial)'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -Path (Join-Path $DllDir 'Microsoft.Web.WebView2.Core.dll'); Add-Type -Path (Join-Path $DllDir 'Microsoft.Web.WebView2.WinForms.dll')
$env:PATH = (Join-Path $DllDir 'x64') + ';' + $DllDir + ';' + $env:PATH
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Windows.Forms;
public class TrialWin : Form {
  [DllImport("user32.dll")] public static extern bool ReleaseCapture();
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  public string Probe() { int st = GetWindowLong(Handle, -16); return "style=0x" + st.ToString("X8") + " caption=" + ((st & 0x00C00000) != 0) + " thickframe=" + ((st & 0x00040000) != 0) + " iconic=" + IsIconic(Handle) + " rect=" + Bounds.Width + "x" + Bounds.Height + " client=" + ClientSize.Width + "x" + ClientSize.Height; }
  public void Pos(int x, int y) { Location = new System.Drawing.Point(x, y); }
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  [DllImport("dwmapi.dll")] public static extern int DwmExtendFrameIntoClientArea(IntPtr h, ref MARGINS m);
  [StructLayout(LayoutKind.Sequential)] public struct MARGINS { public int l, r, t, b; }
  public bool AllowClose = false; public Action AskClose;
  protected override CreateParams CreateParams { get { CreateParams cp = base.CreateParams; cp.Style |= 0x00020000 | 0x00080000; /* MINIMIZEBOX | SYSMENU: taskbar minimize and Alt+F4 work without a frame */ return cp; } }
  public void Drag() { ReleaseCapture(); SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); }
  public void Dress() { int round = 2; DwmSetWindowAttribute(Handle, 33, ref round, 4); MARGINS m = new MARGINS(); m.l = 1; m.r = 1; m.t = 1; m.b = 1; DwmExtendFrameIntoClientArea(Handle, ref m); }
  protected override void OnFormClosing(FormClosingEventArgs e) { if (!AllowClose && AskClose != null) { e.Cancel = true; AskClose(); } base.OnFormClosing(e); }
}
'@ -ReferencedAssemblies System.Windows.Forms, System.Drawing
[void][TrialWin]::SetProcessDPIAware()
function Note($t) { if ($Log) { try { Add-Content -Encoding UTF8 $Log ((Get-Date -Format 'HH:mm:ss.fff') + ' ' + $t) } catch {} } }
$scale = [Math]::Max(1.0, [Windows.Forms.Screen]::PrimaryScreen.Bounds.Width / [Windows.Forms.SystemInformation]::PrimaryMonitorSize.Width)
try { $g = [Drawing.Graphics]::FromHwnd([IntPtr]::Zero); $scale = $g.DpiX / 96.0; $g.Dispose() } catch {}
$form = New-Object TrialWin
$form.Text = $Title; $form.FormBorderStyle = 'None'; $form.StartPosition = 'CenterScreen'; $form.ShowInTaskbar = $true; $form.BackColor = [Drawing.Color]::FromArgb(236, 241, 249)
$form.ClientSize = New-Object Drawing.Size([int](1000 * $scale), [int](640 * $scale)); $form.MinimumSize = $form.Size
if ($Icon -and (Test-Path $Icon)) { try { $bmp = New-Object Drawing.Bitmap $Icon; $form.Icon = [Drawing.Icon]::FromHandle($bmp.GetHicon()) } catch {} }
$web = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$web.Dock = 'Fill'; $form.Controls.Add($web)
$props = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties; $props.UserDataFolder = $UserData; $web.CreationProperties = $props
$form.AskClose = { try { $web.CoreWebView2.ExecuteScriptAsync('window.__askClose&&window.__askClose()') | Out-Null } catch { $form.AllowClose = $true; $form.Close() } }
$form.Add_Shown({ $form.Dress(); Note ('shown ' + $form.Probe()) })
$web.Add_CoreWebView2InitializationCompleted({
  param($s, $e)
  if (-not $e.IsSuccess) { Note ('webview2 init failed: ' + $e.InitializationException.Message); $form.AllowClose = $true; $form.Close(); return }
  $c = $web.CoreWebView2; $c.Settings.AreDefaultContextMenusEnabled = $false; $c.Settings.AreDevToolsEnabled = $false; $c.Settings.IsStatusBarEnabled = $false; $c.Settings.IsZoomControlEnabled = $false
  $c.add_WebMessageReceived({
    param($s2, $a)
    try {
      $m = $a.WebMessageAsJson | ConvertFrom-Json; Note ('msg ' + $m.type)
      switch ($m.type) {
        'drag' { $form.Drag(); Note ('after drag ' + $form.Location) }
        'minimize' { $form.WindowState = 'Minimized'; Note ('minimized ' + $form.Probe()) }
        'close' { $form.AllowClose = $true; $form.Close() }
      }
    } catch { Note ('msg error ' + $_) }
  })
  $c.Navigate($Url); Note 'navigate'
})
# test hook: a file next to the log restores a minimized window (there is no taskbar to click on the hidden test desktop)
if ($Log) { $tm = New-Object Windows.Forms.Timer; $tm.Interval = 400; $flag = $Log + '.restore'; $tm.Add_Tick({ if (Test-Path $flag) { Remove-Item $flag -Force; $form.WindowState = 'Normal'; Note ('restored ' + $form.Probe()) } }); $tm.Start() }
$web.EnsureCoreWebView2Async($null) | Out-Null
[Windows.Forms.Application]::Run($form)
Note 'exited'
