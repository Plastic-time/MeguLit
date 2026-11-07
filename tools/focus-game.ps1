param([Parameter(Mandatory=$true)][string]$Executable)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ToMeFocus {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int cmd);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
}
'@
$taskExpected = [IO.Path]::GetFullPath($Executable)
foreach ($taskProcess in Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($taskExpected)) -ErrorAction SilentlyContinue) {
 try {
  if ($taskProcess.Path -and [string]::Equals([IO.Path]::GetFullPath($taskProcess.Path),$taskExpected,[StringComparison]::OrdinalIgnoreCase)) {
   if ($taskProcess.MainWindowHandle -eq [IntPtr]::Zero) { Write-Output 'running'; exit 0 }
   if ([ToMeFocus]::IsIconic($taskProcess.MainWindowHandle)) { [ToMeFocus]::ShowWindowAsync($taskProcess.MainWindowHandle,9) | Out-Null }
   if ([ToMeFocus]::SetForegroundWindow($taskProcess.MainWindowHandle)) { Write-Output 'focused'; exit 0 }
   Write-Output 'running'; exit 0
  }
 } catch {}
}
Write-Output 'absent'
