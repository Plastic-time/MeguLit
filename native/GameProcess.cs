// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
class GameProcess {
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")]static extern bool ShowWindowAsync(IntPtr hwnd,int command);
 [DllImport("user32.dll")]static extern bool IsIconic(IntPtr hwnd);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
 delegate bool WindowVisitor(IntPtr hwnd,IntPtr context);
 [DllImport("user32.dll")]static extern bool EnumWindows(WindowVisitor visitor,IntPtr context);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [DllImport("user32.dll")]static extern int GetWindowTextLength(IntPtr hwnd);
 static IntPtr FindGameWindow(int pid){IntPtr result=IntPtr.Zero;EnumWindows(delegate(IntPtr hwnd,IntPtr context){uint owner;GetWindowThreadProcessId(hwnd,out owner);if(owner==(uint)pid&&GetWindowTextLength(hwnd)>0){result=hwnd;return false;}return true;},IntPtr.Zero);return result;}
 static int Main(string[] args){
  try{
   if(args.Length!=2||(args[0]!="--query"&&args[0]!="--focus"&&args[0]!="--shell-open"&&args[0]!="--patch-check"))return 2;
   string expected=Path.GetFullPath(args[1]);
   if(args[0]=="--shell-open"){
    try{
     using(var child=Process.Start(new ProcessStartInfo(expected){UseShellExecute=true,WorkingDirectory=Path.GetDirectoryName(expected)})){}
     Console.WriteLine("started");return 0;
    }catch(System.ComponentModel.Win32Exception error){
     Console.WriteLine(error.NativeErrorCode==1223?"cancelled":"failed");return 0;
    }
   }
   foreach(var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(expected)))using(process){
    try{if(!String.Equals(Path.GetFullPath(process.MainModule.FileName),expected,StringComparison.OrdinalIgnoreCase))continue;
     IntPtr hwnd=process.MainWindowHandle;if(hwnd==IntPtr.Zero&&args[0]=="--focus")hwnd=FindGameWindow(process.Id);
     if(args[0]=="--focus"&&hwnd!=IntPtr.Zero){if(IsIconic(hwnd))ShowWindowAsync(hwnd,9);else if(!IsWindowVisible(hwnd))ShowWindowAsync(hwnd,5);if(SetForegroundWindow(hwnd)){Console.WriteLine("focused");return 0;}}
     Console.WriteLine("running");return 0;
    }catch(System.ComponentModel.Win32Exception error){
     if(args[0]=="--patch-check"&&error.NativeErrorCode==5){Console.WriteLine("unknown");return 0;}
    }catch(InvalidOperationException){}
   }
   Console.WriteLine("absent");return 0;
  }catch{return 1;}
 }
}
