// SPDX-License-Identifier: GPL-3.0-or-later
// E297 cold run (user, 2026-11-11: read Hxv4 scripts when the library finds the game, not when it is first played).
// ColdCapture32/64.exe starts a KiriKiri Z game minimised and without focus, loads MeguLitScn<bit>.dll into it (MEGULIT_COLD=1
// tells the DLL to read the archives at once and report), keeps its windows minimised and its sound muted, and ends the
// game as soon as the DLL writes its report, or after the time limit. It never touches the game folder.
// Usage: ColdCapture.exe <game.exe> <MeguLitScn.dll> <report file> <seconds>
// Prints one word: done | no-exporter | no-hx | timeout | exited | steam | failed, exit code 0 only for done.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class ColdCapture {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO{public int cb;public string lpReserved,lpDesktop,lpTitle;public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags;public short wShowWindow,cbReserved2;public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION{public IntPtr hProcess,hThread;public int dwProcessId,dwThreadId;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder cmd,IntPtr pa,IntPtr ta,bool inherit,uint flags,string env,string dir,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr h,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr VirtualAllocEx(IntPtr p,IntPtr address,UIntPtr size,uint allocation,uint protect);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteProcessMemory(IntPtr p,IntPtr address,byte[] data,UIntPtr size,out UIntPtr written);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string module);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr CreateRemoteThread(IntPtr p,IntPtr attr,UIntPtr stack,IntPtr start,IntPtr parameter,uint flags,IntPtr id);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeThread(IntPtr h,out uint code);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr p,out bool wow);
 delegate bool EnumWindowsProc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc f,IntPtr l);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
 const uint CREATE_SUSPENDED=4,CREATE_UNICODE_ENVIRONMENT=0x400;const int STARTF_USESHOWWINDOW=1;const short SW_SHOWMINNOACTIVE=7;

 public static int Main(string[] args){
  string word="failed";PROCESS_INFORMATION pi=new PROCESS_INFORMATION();
  try{
   if(args.Length!=4)throw new Exception("Expected game exe, capture DLL, report file and seconds");
   string exe=Path.GetFullPath(args[0]),dll=Path.GetFullPath(args[1]),report=Path.GetFullPath(args[2]);int seconds=Math.Max(10,Math.Min(1200,Int32.Parse(args[3])));
   if(!File.Exists(exe)||!File.Exists(dll))throw new Exception("Missing game or capture DLL");
   string name=Path.GetFileName(dll);if(name!=(IntPtr.Size==8?"MeguLitScn64.dll":"MeguLitScn32.dll"))throw new Exception("Only the MeguLit scene capture DLL is loaded");
   try{File.Delete(report);}catch{}
   // The game's environment plus MEGULIT_COLD=1, as a sorted Unicode block.
   var env=new System.Collections.Generic.SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);
   foreach(System.Collections.DictionaryEntry e in Environment.GetEnvironmentVariables())env[(string)e.Key]=(string)e.Value;env["MEGULIT_COLD"]="1";
   var block=new StringBuilder();foreach(var kv in env)block.Append(kv.Key).Append('=').Append(kv.Value).Append('\0');block.Append('\0');
   var si=new STARTUPINFO();si.cb=Marshal.SizeOf(si);si.dwFlags=STARTF_USESHOWWINDOW;si.wShowWindow=SW_SHOWMINNOACTIVE;
   if(!CreateProcess(exe,new StringBuilder("\""+exe+"\""),IntPtr.Zero,IntPtr.Zero,false,CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT,block.ToString(),Path.GetDirectoryName(exe),ref si,out pi))throw new Exception("Game did not start");
   bool wow;if(!IsWow64Process(pi.hProcess,out wow)||Environment.Is64BitOperatingSystem&&((!wow)!=(IntPtr.Size==8))){word="failed";throw new Exception("Helper bitness differs from the game");}
   ResumeThread(pi.hThread);
   var started=DateTime.UtcNow;bool loaded=false;
   while(true){
    if(WaitForSingleObject(pi.hProcess,200)==0){
     // A Steam build that restarts itself through Steam leaves at once.
     word=(DateTime.UtcNow-started).TotalSeconds<15&&File.Exists(Path.Combine(Path.GetDirectoryName(exe),"steam_api.dll"))?"steam":"exited";break;}
    double age=(DateTime.UtcNow-started).TotalSeconds;
    if(!loaded&&age>=0.8){loaded=true;if(!Inject(pi.hProcess,dll)){word="failed";break;}}
    Quiet(pi.dwProcessId);
    if(File.Exists(report)){string text="";try{text=File.ReadAllText(report).Trim();}catch{}if(text.Length>0){word=text.Split(' ')[0];break;}}
    if(age>seconds){word="timeout";break;}
   }
  }catch(Exception e){Console.Error.WriteLine(e.Message);}
  finally{if(pi.hProcess!=IntPtr.Zero){if(WaitForSingleObject(pi.hProcess,0)!=0)TerminateProcess(pi.hProcess,0);CloseHandle(pi.hProcess);}if(pi.hThread!=IntPtr.Zero)CloseHandle(pi.hThread);}
  Console.WriteLine(word);return word=="done"?0:1;
 }
 static bool Inject(IntPtr process,string dll){
  IntPtr remote=IntPtr.Zero,thread=IntPtr.Zero;
  try{byte[] data=Encoding.Unicode.GetBytes(dll+"\0");remote=VirtualAllocEx(process,IntPtr.Zero,(UIntPtr)data.Length,0x3000,4);if(remote==IntPtr.Zero)return false;
   UIntPtr written;if(!WriteProcessMemory(process,remote,data,(UIntPtr)data.Length,out written))return false;
   IntPtr loader=GetProcAddress(GetModuleHandle("kernel32.dll"),"LoadLibraryW");if(loader==IntPtr.Zero)return false;
   thread=CreateRemoteThread(process,IntPtr.Zero,UIntPtr.Zero,loader,remote,0,IntPtr.Zero);if(thread==IntPtr.Zero)return false;
   if(WaitForSingleObject(thread,10000)!=0)return false;uint result;return GetExitCodeThread(thread,out result)&&result!=0;}
  finally{if(thread!=IntPtr.Zero)CloseHandle(thread);}
 }
 // Keeps the game out of the way: every visible window of it minimised without activation, its audio sessions muted.
 static DateTime lastMute=DateTime.MinValue;
 static void Quiet(int pid){
  try{EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);if(p==(uint)pid&&IsWindowVisible(h)&&!IsIconic(h))ShowWindow(h,SW_SHOWMINNOACTIVE);return true;},IntPtr.Zero);}catch{}
  if((DateTime.UtcNow-lastMute).TotalMilliseconds<700)return;lastMute=DateTime.UtcNow;
  try{Audio.Mute(pid);}catch{}
 }
}
// Core Audio: mute every audio session of one process (best effort).
static class Audio {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator{}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator{int EnumAudioEndpoints(int flow,int mask,out IntPtr devices);int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);}
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice{int Activate(ref Guid iid,int ctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)] out object o);}
 [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionManager2{int GetAudioSessionControl(IntPtr g,int f,out IntPtr c);int GetSimpleAudioVolume(IntPtr g,int f,out IntPtr v);int GetSessionEnumerator(out IAudioSessionEnumerator e);}
 [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionEnumerator{int GetCount(out int n);int GetSession(int i,[MarshalAs(UnmanagedType.IUnknown)] out object s);}
 [ComImport,Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionControl2{
  int GetState(out int s);int GetDisplayName(out IntPtr n);int SetDisplayName(string n,ref Guid g);int GetIconPath(out IntPtr p);int SetIconPath(string p,ref Guid g);int GetGroupingParam(out Guid g);int SetGroupingParam(ref Guid g,ref Guid c);
  int RegisterAudioSessionNotification(IntPtr n);int UnregisterAudioSessionNotification(IntPtr n);int GetSessionIdentifier(out IntPtr s);int GetSessionInstanceIdentifier(out IntPtr s);int GetProcessId(out uint pid);}
 [ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISimpleAudioVolume{int SetMasterVolume(float v,ref Guid g);int GetMasterVolume(out float v);int SetMute(bool m,ref Guid g);int GetMute(out bool m);}
 public static void Mute(int pid){
  var en=(IMMDeviceEnumerator)new MMDeviceEnumerator();IMMDevice dev;if(en.GetDefaultAudioEndpoint(0,1,out dev)!=0)return;
  Guid iid=typeof(IAudioSessionManager2).GUID;object o;if(dev.Activate(ref iid,23,IntPtr.Zero,out o)!=0)return;
  IAudioSessionEnumerator sessions;if(((IAudioSessionManager2)o).GetSessionEnumerator(out sessions)!=0)return;int n;sessions.GetCount(out n);
  for(int i=0;i<n;i++){object s;if(sessions.GetSession(i,out s)!=0)continue;uint p;if(((IAudioSessionControl2)s).GetProcessId(out p)==0&&p==(uint)pid){Guid none=Guid.Empty;((ISimpleAudioVolume)s).SetMute(true,ref none);}}
 }
}
