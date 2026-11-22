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
 const uint CREATE_SUSPENDED=4,CREATE_UNICODE_ENVIRONMENT=0x400,CREATE_NO_WINDOW=0x08000000;const int STARTF_USESHOWWINDOW=1;const short SW_SHOWMINNOACTIVE=7;

 [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO{public uint cbSize,dwTime;}
 [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
 static volatile bool cancelled=false;
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateDesktop(string name,IntPtr dev,IntPtr mode,uint flags,uint access,IntPtr sa);
 [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr attr,string name);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int cls,IntPtr info,uint size);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr job,uint code);
 [DllImport("kernel32.dll")] static extern bool QueryInformationJobObject(IntPtr job,int cls,IntPtr info,uint size,IntPtr returned);
 [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desk);
 static IntPtr job,desk;static Process audioGuard;
 static bool StopAudio(){if(audioGuard==null)return true;try{if(audioGuard.HasExited)return audioGuard.ExitCode==0;audioGuard.StandardInput.WriteLine("stop");return audioGuard.WaitForExit(4000)&&audioGuard.ExitCode==0;}catch{try{return audioGuard.HasExited&&audioGuard.ExitCode==0;}catch{return false;}}}
 static bool EmptyJob(){IntPtr info=Marshal.AllocHGlobal(32);try{return QueryInformationJobObject(job,3,info,32,IntPtr.Zero)&&Marshal.ReadInt32(info,4)==0;}finally{Marshal.FreeHGlobal(info);}}
 static bool WaitJob(){var until=DateTime.UtcNow.AddSeconds(4);do{if(EmptyJob())return true;Thread.Sleep(20);}while(DateTime.UtcNow<until);return false;}
 public static int Main(string[] args){
  if((args.Length==3||args.Length==4)&&args[0]=="--audio-watch")return Audio.Watch(Int32.Parse(args[1]),Int32.Parse(args[2]),args.Length==4?Int64.Parse(args[3]):0);
  if(args.Length==1&&args[0]=="--audio-selftest")return Audio.Selftest();
  if(args.Length==2&&args[0]=="--unmute"){Audio.Unmute(Int32.Parse(args[1]));return 0;}
  string word="failed";PROCESS_INFORMATION pi=new PROCESS_INFORMATION();
  try{
   new Thread(()=>{try{Console.ReadLine();cancelled=true;}catch{}}){IsBackground=true}.Start();
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
   desk=CreateDesktop("MeguLitCapture",IntPtr.Zero,IntPtr.Zero,0,0x10000000,IntPtr.Zero);if(desk==IntPtr.Zero)throw new Exception("Hidden desktop unavailable");si.lpDesktop="WinSta0\\MeguLitCapture";
   job=CreateJobObject(IntPtr.Zero,null);IntPtr limits=Marshal.AllocHGlobal(144);try{for(int n=0;n<144;n++)Marshal.WriteByte(limits,n,0);Marshal.WriteInt32(limits,16,0x2000);if(job==IntPtr.Zero||!SetInformationJobObject(job,9,limits,(uint)(IntPtr.Size==8?144:112)))throw new Exception("Job setup failed");}finally{Marshal.FreeHGlobal(limits);}
   if(!CreateProcess(exe,new StringBuilder("\""+exe+"\""),IntPtr.Zero,IntPtr.Zero,false,CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|CREATE_NO_WINDOW,block.ToString(),Path.GetDirectoryName(exe),ref si,out pi))throw new Exception("Game did not start");
   if(!AssignProcessToJobObject(job,pi.hProcess))throw new Exception("Job assignment failed");
   bool wow;if(!IsWow64Process(pi.hProcess,out wow)||Environment.Is64BitOperatingSystem&&((!wow)!=(IntPtr.Size==8))){word="failed";throw new Exception("Helper bitness differs from the game");}
   audioGuard=Audio.Guard(pi.dwProcessId);ResumeThread(pi.hThread);
   var started=DateTime.UtcNow;bool loaded=false;var input=new LASTINPUTINFO();input.cbSize=(uint)Marshal.SizeOf(input);GetLastInputInfo(ref input);uint initialInput=input.dwTime;
   while(true){
    if(cancelled||(GetLastInputInfo(ref input)&&input.dwTime!=initialInput)){word="cancelled";break;}
    if(WaitForSingleObject(pi.hProcess,200)==0){
     // A Steam build that restarts itself through Steam leaves at once.
     word=(DateTime.UtcNow-started).TotalSeconds<15&&File.Exists(Path.Combine(Path.GetDirectoryName(exe),"steam_api.dll"))?"steam":"exited";break;}
    if(audioGuard!=null&&audioGuard.HasExited)throw new Exception("Audio guard stopped before cleanup");
    double age=(DateTime.UtcNow-started).TotalSeconds;
    if(!loaded&&age>=0.8){loaded=true;if(!Inject(pi.hProcess,dll)){word="failed";break;}}
    Quiet(pi.dwProcessId);
    if(File.Exists(report)){string text="";try{text=File.ReadAllText(report).Trim();}catch{}if(text.Length>0){word=text.Split(' ')[0];break;}}
    if(age>seconds){word="timeout";break;}
   }
  }catch(Exception e){Console.Error.WriteLine(e.Message);}
  finally{bool safe=StopAudio();safe=Audio.Restore()&&safe;if(pi.hProcess!=IntPtr.Zero){if(WaitForSingleObject(pi.hProcess,0)!=0)TerminateProcess(pi.hProcess,0);if(WaitForSingleObject(pi.hProcess,4000)!=0)safe=false;CloseHandle(pi.hProcess);}if(pi.hThread!=IntPtr.Zero)CloseHandle(pi.hThread);if(job!=IntPtr.Zero){if(!TerminateJobObject(job,0)||!WaitJob())safe=false;CloseHandle(job);}if(desk!=IntPtr.Zero)CloseDesktop(desk);if(!safe)word="cleanup-unconfirmed";}
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
  /* The independent guard restores even if this helper is terminated. */
 }
}
// Keep one original state per endpoint/session instance, independent of COM wrapper identity.
static class Audio {
 [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator{}
 [ComImport,Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceEnumerator{[PreserveSig] int EnumAudioEndpoints(int flow,int mask,out IMMDeviceCollection devices);[PreserveSig] int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice device);}
 [ComImport,Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDeviceCollection{[PreserveSig] int GetCount(out int n);[PreserveSig] int Item(int i,out IMMDevice d);}
 [ComImport,Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IMMDevice{[PreserveSig] int Activate(ref Guid iid,int ctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)] out object o);[PreserveSig] int OpenPropertyStore(int access,out IntPtr store);[PreserveSig] int GetId(out IntPtr id);}
 [ComImport,Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionManager2{[PreserveSig] int GetAudioSessionControl(IntPtr g,int f,out IntPtr c);[PreserveSig] int GetSimpleAudioVolume(IntPtr g,int f,out IntPtr v);[PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);}
 [ComImport,Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionEnumerator{[PreserveSig] int GetCount(out int n);[PreserveSig] int GetSession(int i,[MarshalAs(UnmanagedType.IUnknown)] out object s);}
 [ComImport,Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IAudioSessionControl2{
  [PreserveSig] int GetState(out int s);[PreserveSig] int GetDisplayName(out IntPtr n);[PreserveSig] int SetDisplayName(string n,ref Guid g);[PreserveSig] int GetIconPath(out IntPtr p);[PreserveSig] int SetIconPath(string p,ref Guid g);[PreserveSig] int GetGroupingParam(out Guid g);[PreserveSig] int SetGroupingParam(ref Guid g,ref Guid c);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);[PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);[PreserveSig] int GetSessionIdentifier(out IntPtr s);[PreserveSig] int GetSessionInstanceIdentifier(out IntPtr s);[PreserveSig] int GetProcessId(out uint pid);}
 [ComImport,Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISimpleAudioVolume{[PreserveSig] int SetMasterVolume(float v,ref Guid g);[PreserveSig] int GetMasterVolume(out float v);[PreserveSig] int SetMute(bool m,ref Guid g);[PreserveSig] int GetMute(out bool m);}
 public static Process Guard(int pid){long started;using(var game=Process.GetProcessById(pid))started=game.StartTime.ToUniversalTime().Ticks;var s=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--audio-watch "+Process.GetCurrentProcess().Id+" "+pid+" "+started);s.UseShellExecute=false;s.CreateNoWindow=true;s.RedirectStandardInput=true;return Process.Start(s);}
 public static int Watch(int parent,int pid,long expectedStarted=0){Process owner=null,game=null;try{if(parent<=0||pid<=0||expectedStarted<=0)throw new InvalidOperationException("Missing audio guard process identity");owner=Process.GetProcessById(parent);game=Process.GetProcessById(pid);var ownerHandle=owner.Handle;var gameHandle=game.Handle;if(owner.HasExited||game.HasExited||game.StartTime.ToUniversalTime().Ticks!=expectedStarted)throw new InvalidOperationException("Audio guard process identity changed");}catch{if(owner!=null)owner.Dispose();if(game!=null)game.Dispose();Console.Error.WriteLine("Audio guard process identity unavailable");return 1;}bool stop=false,ok=true;new Thread(()=>{try{Console.ReadLine();}catch{}stop=true;}){IsBackground=true}.Start();try{while(!stop&&!owner.HasExited&&!game.HasExited){Mute(pid);Thread.Sleep(150);}}catch(Exception e){Console.Error.WriteLine(e.Message);ok=false;}finally{ok=Restore()&&ok;owner.Dispose();game.Dispose();}return ok?0:1;}
 sealed class FakeState{public bool muted;}
 sealed class FakeVolume:ISimpleAudioVolume,IAudioSessionControl2{readonly FakeState state;public bool muted{get{return state.muted;}set{state.muted=value;}}public int getResult,setResult,setCalls,getCalls;public bool ignoreSet;public string instance="fake-session";public FakeVolume(bool m){state=new FakeState{muted=m};}public FakeVolume(FakeVolume alias){state=alias.state;instance=alias.instance;}public int SetMasterVolume(float v,ref Guid g){return 0;}public int GetMasterVolume(out float v){v=1;return 0;}public int SetMute(bool m,ref Guid g){setCalls++;if(setResult==0&&!ignoreSet)muted=m;return setResult;}public int GetMute(out bool m){getCalls++;m=muted;return getResult;}public int GetState(out int s){s=1;return 0;}public int GetDisplayName(out IntPtr n){n=IntPtr.Zero;return 0;}public int SetDisplayName(string n,ref Guid g){return 0;}public int GetIconPath(out IntPtr p){p=IntPtr.Zero;return 0;}public int SetIconPath(string p,ref Guid g){return 0;}public int GetGroupingParam(out Guid g){g=Guid.Empty;return 0;}public int SetGroupingParam(ref Guid g,ref Guid c){return 0;}public int RegisterAudioSessionNotification(IntPtr n){return 0;}public int UnregisterAudioSessionNotification(IntPtr n){return 0;}public int GetSessionIdentifier(out IntPtr s){s=Marshal.StringToCoTaskMemUni("shared-session");return 0;}public int GetSessionInstanceIdentifier(out IntPtr s){s=Marshal.StringToCoTaskMemUni(instance);return 0;}public int GetProcessId(out uint pid){pid=42;return 0;}}
 sealed class FakeDevice:IMMDevice{readonly FakeVolume volume;readonly string endpoint;public FakeDevice(FakeVolume v,string id="fake-endpoint"){volume=v;endpoint=id;}public int Activate(ref Guid id,int ctx,IntPtr p,out object o){o=new FakeManager(volume);return 0;}public int OpenPropertyStore(int access,out IntPtr store){store=IntPtr.Zero;return unchecked((int)0x80004001);}public int GetId(out IntPtr id){id=Marshal.StringToCoTaskMemUni(endpoint);return 0;}}
 sealed class FakeManager:IAudioSessionManager2{readonly FakeVolume volume;public FakeManager(FakeVolume v){volume=v;}public int GetAudioSessionControl(IntPtr g,int f,out IntPtr c){c=IntPtr.Zero;return 0;}public int GetSimpleAudioVolume(IntPtr g,int f,out IntPtr v){v=IntPtr.Zero;return 0;}public int GetSessionEnumerator(out IAudioSessionEnumerator e){e=new FakeSessions(volume);return 0;}}
 sealed class FakeSessions:IAudioSessionEnumerator{readonly FakeVolume volume;public FakeSessions(FakeVolume v){volume=v;}public int GetCount(out int n){n=1;return 0;}public int GetSession(int i,out object s){s=volume;return 0;}}
 public static int Selftest(){
  foreach(var t in new[]{typeof(IMMDeviceEnumerator),typeof(IMMDeviceCollection),typeof(IMMDevice),typeof(IAudioSessionManager2),typeof(IAudioSessionEnumerator),typeof(IAudioSessionControl2),typeof(ISimpleAudioVolume)})foreach(var m in t.GetMethods())if((m.GetMethodImplementationFlags()&System.Reflection.MethodImplAttributes.PreserveSig)==0)throw new Exception("COM HRESULT signature changed: "+t.Name+"."+m.Name);
  foreach(bool initial in new[]{false,true}){var v=new FakeVolume(initial);SetDevice(new FakeDevice(v),42,true);for(int i=0;i<20;i++)SetDevice(new FakeDevice(new FakeVolume(v)),42,true);if(prior.Count!=1||!Restore()||v.muted!=initial||v.setCalls!=2)return 1;}
  var failed=new FakeVolume(false){getResult=unchecked((int)0x80004005)};try{SetDevice(new FakeDevice(failed),42,true);return 2;}catch(COMException){}if(failed.setCalls!=0||failed.muted||prior.Count!=0)return 3;
  var a=new FakeVolume(false);var b=new FakeVolume(true);SetDevice(new FakeDevice(a,"endpoint-a"),42,true);SetDevice(new FakeDevice(b,"endpoint-b"),42,true);if(prior.Count!=2||!Restore()||a.muted||!b.muted)return 4;
  foreach(string failure in new[]{"set","read","mismatch"}){var v=new FakeVolume(false);SetDevice(new FakeDevice(v),42,true);v.setResult=failure=="set"?unchecked((int)0x80004005):0;v.getResult=failure=="read"?unchecked((int)0x80004005):0;v.ignoreSet=failure=="mismatch";if(Restore()||prior.Count!=1)return 5;v.setResult=v.getResult=0;v.ignoreSet=false;if(!Restore()||v.muted||prior.Count!=0)return 6;}
  var writeFailed=new FakeVolume(false){setResult=unchecked((int)0x80004005)};try{SetDevice(new FakeDevice(writeFailed),42,true);return 7;}catch(COMException){}if(prior.Count!=1)return 8;writeFailed.setResult=0;if(!Restore()||writeFailed.muted)return 9;
  if(OwnsSession(0,7,42)||!OwnsSession(0,42,42)||OwnsSession(0x0889000d,7,42))return 10;try{OwnsSession(0x0889000d,42,42);return 11;}catch(InvalidOperationException){}
  Console.WriteLine("audio restore false/true: pass; fresh wrappers retain original: pass; endpoint identities: pass; restore readback failures: pass; shared sessions never owned: pass; GetMute failure never mutates: pass");return 0;
 }
 sealed class SavedVolume{public ISimpleAudioVolume volume;public bool original;}
 static readonly System.Collections.Generic.Dictionary<string,SavedVolume> prior=new System.Collections.Generic.Dictionary<string,SavedVolume>(StringComparer.Ordinal);
 public static bool Restore(){bool ok=true;foreach(var kv in new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<string,SavedVolume>>(prior)){try{Guid g=Guid.Empty;bool actual;if(kv.Value.volume.SetMute(kv.Value.original,ref g)!=0||kv.Value.volume.GetMute(out actual)!=0||actual!=kv.Value.original){ok=false;continue;}prior.Remove(kv.Key);}catch{ok=false;}}return ok;}
 public static void Unmute(int pid){Set(pid,false);}
 public static void Mute(int pid){Set(pid,true);}
 static void Set(int pid,bool mute){
  var en=(IMMDeviceEnumerator)new MMDeviceEnumerator();IMMDeviceCollection devices;Checked(en.EnumAudioEndpoints(0,1,out devices),"audio endpoints");int count;Checked(devices.GetCount(out count),"audio endpoint count");if(count<0||count>1024)throw new InvalidOperationException("Audio endpoint count outside limit");
  for(int d=0;d<count;d++){IMMDevice dev;Checked(devices.Item(d,out dev),"audio endpoint");SetDevice(dev,pid,mute);}
 }
 static void SetDevice(IMMDevice dev,int pid,bool mute){
  IntPtr endpointPointer=IntPtr.Zero;string endpoint;try{Checked(dev.GetId(out endpointPointer),"audio endpoint identity");endpoint=Marshal.PtrToStringUni(endpointPointer);}finally{if(endpointPointer!=IntPtr.Zero)Marshal.FreeCoTaskMem(endpointPointer);}if(String.IsNullOrEmpty(endpoint))throw new InvalidOperationException("Missing audio endpoint identity");
  Guid iid=typeof(IAudioSessionManager2).GUID;object o;Checked(dev.Activate(ref iid,23,IntPtr.Zero,out o),"audio session manager");
  IAudioSessionEnumerator sessions;Checked(((IAudioSessionManager2)o).GetSessionEnumerator(out sessions),"audio sessions");int n;Checked(sessions.GetCount(out n),"audio session count");if(n<0||n>4096)throw new InvalidOperationException("Audio session count outside limit");
  for(int i=0;i<n;i++){object s;Checked(sessions.GetSession(i,out s),"audio session");uint p;var control=(IAudioSessionControl2)s;if(!OwnsSession(control.GetProcessId(out p),p,pid))continue;IntPtr instancePointer=IntPtr.Zero;string instance;try{Checked(control.GetSessionInstanceIdentifier(out instancePointer),"audio session instance");instance=Marshal.PtrToStringUni(instancePointer);}finally{if(instancePointer!=IntPtr.Zero)Marshal.FreeCoTaskMem(instancePointer);}if(String.IsNullOrEmpty(instance))throw new InvalidOperationException("Missing audio session instance");RememberAndSet(endpoint.Length+":"+endpoint+instance,(ISimpleAudioVolume)s,mute);}
 }
 static void Checked(int hr,string stage){if(hr!=0)throw new COMException("Cannot query "+stage,hr);}
 static bool OwnsSession(int hr,uint owner,int pid){if(hr==0)return owner==(uint)pid;if(hr==0x0889000d){if(owner==(uint)pid)throw new InvalidOperationException("Game audio session is shared with other processes");return false;}throw new COMException("Cannot identify audio session owner",hr);}
 static void RememberAndSet(string key,ISimpleAudioVolume v,bool mute){bool was;if(mute&&!prior.ContainsKey(key)){Checked(v.GetMute(out was),"original game mute state");prior.Add(key,new SavedVolume{volume=v,original=was});}Guid none=Guid.Empty;Checked(v.SetMute(mute,ref none),"game mute state");bool actual;Checked(v.GetMute(out actual),"changed game mute state");if(actual!=mute)throw new InvalidOperationException("Game audio mute state was not applied");}
}
