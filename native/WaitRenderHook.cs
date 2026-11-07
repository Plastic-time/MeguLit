// SPDX-License-Identifier: GPL-3.0-or-later
// Direct3D9 wait-marker adapter for 32-bit games (first verified on BGI).
// D3D9Probe.exe (32-bit) creates throwaway devices in its own process and reports where DrawPrimitive, SetTexture and
// the vertex-buffer Lock/Unlock live in d3d9.dll. System DLLs share one base address across the processes of a boot,
// so the game's copies are found without running any code inside the game (an earlier probe that did run code there
// crashed a game). The game's d3d9.dll path, base and size and the exact bytes of every patched function must match
// the probe; the functions are then hotpatched with all game threads suspended, and the original bytes are put back
// on release. Only a small quad inside the confirmed marker box, drawn with the learned marker texture, is skipped.
// No game file is written and no screenshot is painted back into the game.
using System;using System.Collections;using System.Collections.Generic;using System.Diagnostics;using System.IO;using System.Runtime.InteropServices;using System.Threading;using System.Web.Script.Serialization;
public sealed class WaitRenderHook:IDisposable{
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool ReadProcessMemory(IntPtr p,IntPtr address,byte[] bytes,UIntPtr count,out UIntPtr read);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool WriteProcessMemory(IntPtr p,IntPtr address,byte[] bytes,UIntPtr count,out UIntPtr written);
 [DllImport("kernel32.dll")]static extern IntPtr VirtualAllocEx(IntPtr p,IntPtr address,UIntPtr count,uint type,uint protect);
 [DllImport("kernel32.dll")]static extern bool VirtualProtectEx(IntPtr p,IntPtr address,UIntPtr count,uint protect,out uint old);
 [DllImport("kernel32.dll")]static extern bool FlushInstructionCache(IntPtr p,IntPtr address,UIntPtr count);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")]static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Module{public uint size,id,pid,global,process;public IntPtr address;public uint length;public IntPtr handle;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)]public string name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string path;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Module32FirstW(IntPtr snapshot,ref Module module);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)]static extern bool Module32NextW(IntPtr snapshot,ref Module module);
 [StructLayout(LayoutKind.Sequential)]struct ThreadEntry{public uint size,usage,id,owner;public int basePriority,deltaPriority;public uint flags;}
 [DllImport("kernel32.dll")]static extern bool Thread32First(IntPtr snapshot,ref ThreadEntry entry);
 [DllImport("kernel32.dll")]static extern bool Thread32Next(IntPtr snapshot,ref ThreadEntry entry);
 [DllImport("kernel32.dll")]static extern IntPtr OpenThread(uint access,bool inherit,uint id);
 [DllImport("kernel32.dll")]static extern int Wow64SuspendThread(IntPtr thread);
 [DllImport("kernel32.dll")]static extern int ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")]static extern bool Wow64GetThreadContext(IntPtr thread,byte[] context);
 // Patched function: At is its entry; Original holds the 7 bytes from At-5 (padding plus the first two bytes).
 sealed class Patch{public uint At,Hook;public byte[] Original;}
 readonly object Gate=new object();readonly uint Pid;readonly string Hwnd,Name,Started;readonly Action<object> Emit;IntPtr Process;uint Remote;readonly List<Patch> Patches=new List<Patch>();bool Busy,Installed,Blocked,ViewPending;volatile bool Closed,Wanted;float X,Y,W,H,LastX=-1,LastY=-1;int ClientWidth,ClientHeight;uint LastCount;DateTime InstalledAt,LastDrawnEmit,LastStatusAt;string LastStatus="";
 public WaitRenderHook(uint pid,string hwnd,string name,string started,Action<object> emit){Pid=pid;Hwnd=hwnd;Name=name;Started=started;Emit=emit;}
 void Status(string message,bool active){if(message==LastStatus)return;LastStatus=message;Emit(new{type="waitMarkerStatus",message=message,active=active});}
 static IntPtr Ptr(uint address){return new IntPtr((long)address);}
 static uint U(byte[] b,int offset=0){return BitConverter.ToUInt32(b,offset);}
 static uint Num(object value){return (uint)Convert.ToInt64(value);}
 byte[] Read(uint address,int count){if(address<0x10000||count<1||count>2000000)return null;var bytes=new byte[count];UIntPtr read;return ReadProcessMemory(Process,Ptr(address),bytes,(UIntPtr)count,out read)&&read.ToUInt64()==(ulong)count?bytes:null;}
 void Write(uint address,byte[] bytes){UIntPtr written;if(!WriteProcessMemory(Process,Ptr(address),bytes,(UIntPtr)bytes.Length,out written)||written.ToUInt64()!=(ulong)bytes.Length)throw new Exception("无法更新等待标记 Hook");}
 public void Update(Dictionary<string,object> d,bool permitted){lock(Gate){Wanted=permitted&&d.ContainsKey("active")&&d["active"] is bool&&(bool)d["active"];if(Wanted){X=Convert.ToSingle(d["x"]);Y=Convert.ToSingle(d["y"]);W=Convert.ToSingle(d["width"]);H=Convert.ToSingle(d["height"]);ClientWidth=Convert.ToInt32(d["clientWidth"]);ClientHeight=Convert.ToInt32(d["clientHeight"]);Wanted=X>=0&&Y>=0&&W>=9&&W<=90&&H>=7&&H<=90&&ClientWidth>=100&&ClientWidth<=7680&&ClientHeight>=100&&ClientHeight<=4320;}Apply();if(!Wanted||Installed||Busy||Blocked||Closed)return;Busy=true;ThreadPool.QueueUserWorkItem(_=>Install());}}
 public void Disable(){lock(Gate){bool was=Wanted;Wanted=false;Apply();if(was)Status("等待标记绘制 Hook 已停用，恢复游戏原标记",false);}}
 // Box and centre go to the hook in render-target pixels; the viewport is recorded by the hook on the first draw.
 void Apply(){if(!Installed||Process==IntPtr.Zero)return;try{Write(Remote,BitConverter.GetBytes(0));if(!Wanted||Closed)return;
   var view=Read(Remote+80,8);int vw=view==null?0:(int)U(view),vh=view==null?0:(int)U(view,4);ViewPending=vw<100||vh<100||vw>7680||vh>4320;if(ViewPending)return;
   float sx=vw/(float)ClientWidth,sy=vh/(float)ClientHeight;var bytes=new List<byte>();foreach(float value in new[]{(X-12)*sx,(Y-12)*sy,(X+W+12)*sx,(Y+H+12)*sy})bytes.AddRange(BitConverter.GetBytes(value));Write(Remote+4,bytes.ToArray());Write(Remote+40,BitConverter.GetBytes((X+W/2)*sx));Write(Remote+44,BitConverter.GetBytes((Y+H/2)*sy));
   // A new place learns its sprite texture again.
   if(Math.Abs(X-LastX)>6||Math.Abs(Y-LastY)>6){Write(Remote+28,BitConverter.GetBytes(0));LastX=X;LastY=Y;}
   Write(Remote,BitConverter.GetBytes(1));}catch{Status("等待标记 Hook 更新失败；未生成图像遮挡",false);}}
 List<Module> Modules(){var result=new List<Module>();IntPtr snapshot=CreateToolhelp32Snapshot(0x18,Pid);if(snapshot==new IntPtr(-1))return result;try{var module=new Module{size=(uint)Marshal.SizeOf(typeof(Module))};if(Module32FirstW(snapshot,ref module))do{result.Add(module);}while(Module32NextW(snapshot,ref module));}finally{CloseHandle(snapshot);}return result;}
 static Dictionary<string,object> RunProbe(){
  string exe=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"D3D9Probe.exe");if(!File.Exists(exe))throw new Exception("缺少 D3D9Probe.exe");
  var info=new ProcessStartInfo(exe){UseShellExecute=false,RedirectStandardOutput=true,CreateNoWindow=true};using(var p=System.Diagnostics.Process.Start(info)){string text=p.StandardOutput.ReadToEnd();if(!p.WaitForExit(10000)){try{p.Kill();}catch{}throw new Exception("D3D9 接口探测超时");}
   var result=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(text);if(result==null||!(result["ok"] is bool)||!(bool)result["ok"])throw new Exception("D3D9 接口探测失败："+(result!=null&&result.ContainsKey("error")?result["error"]:"无输出"));return result;}
 }
 static IEnumerable<Dictionary<string,object>> Slots(Dictionary<string,object> probe,string key){foreach(object item in (ArrayList)probe[key])yield return (Dictionary<string,object>)((Dictionary<string,object>)item)["slots"];}
 static byte[] Hex(string hex){var b=new byte[hex.Length/2];for(int i=0;i<b.Length;i++)b[i]=Convert.ToByte(hex.Substring(i*2,2),16);return b;}
 // Accepts only two entry shapes, both behind five bytes of int3/nop padding: the hotpatch "mov edi,edi" and the
 // SEH-prolog "push imm8; mov eax,imm32". Returns the address that continues the original function.
 uint Entry(uint at,byte[] expected,List<byte> code,uint codeBase){
  var actual=Read(at-5,10);if(actual==null)throw new Exception("无法读取游戏绘制函数");for(int i=0;i<10;i++)if(actual[i]!=expected[i])throw new Exception("游戏内的 Direct3D9 函数与系统版本不一致，未启用绘制 Hook");
  for(int i=0;i<5;i++)if(actual[i]!=0xcc&&actual[i]!=0x90)throw new Exception("Direct3D9 函数前没有可用的补丁空间");
  if(actual[5]==0x8b&&actual[6]==0xff)return at+2;
  if(actual[5]==0x6a&&actual[7]==0xb8){uint tramp=codeBase+(uint)code.Count;code.AddRange(new byte[]{0x6a,actual[6],0xe9});code.AddRange(BitConverter.GetBytes((at+2)-(tramp+7)));return tramp;}
  throw new Exception("Direct3D9 函数入口格式未适配");
 }
 // Runs action with every game thread suspended and none of them about to execute a byte that is being replaced.
 void Suspended(Action action){
  for(int attempt=0;attempt<50;attempt++){var threads=new List<IntPtr>();bool clear=true;IntPtr snapshot=CreateToolhelp32Snapshot(0x4,0);if(snapshot==new IntPtr(-1))throw new Exception("无法暂停游戏线程");
   try{var entry=new ThreadEntry{size=(uint)Marshal.SizeOf(typeof(ThreadEntry))};if(Thread32First(snapshot,ref entry))do{if(entry.owner!=Pid)continue;IntPtr t=OpenThread(0x004a,false,entry.id);if(t==IntPtr.Zero)continue;if(Wow64SuspendThread(t)==-1){CloseHandle(t);continue;}threads.Add(t);
      var context=new byte[716];BitConverter.GetBytes(0x00010001).CopyTo(context,0);if(Wow64GetThreadContext(t,context)){uint eip=U(context,184);foreach(var p in Patches)if(eip>=p.At-5&&eip<p.At+2)clear=false;}else clear=false;
     }while(Thread32Next(snapshot,ref entry));
    if(clear){action();return;}
   }finally{CloseHandle(snapshot);foreach(var t in threads){ResumeThread(t);CloseHandle(t);}}
   Thread.Sleep(3);
  }
  throw new Exception("游戏线程一直停在绘制函数入口，未修改");
 }
 void Overwrite(uint at,byte[] bytes){uint old;if(!VirtualProtectEx(Process,Ptr(at),(UIntPtr)bytes.Length,0x40,out old))throw new Exception("无法修改绘制函数保护属性");try{Write(at,bytes);}finally{uint ignored;VirtualProtectEx(Process,Ptr(at),(UIntPtr)bytes.Length,old,out ignored);FlushInstructionCache(Process,Ptr(at),(UIntPtr)bytes.Length);}}
 void Install(){try{
  HookTarget.Validate(Pid,Hwnd,Name,Started);var probe=RunProbe();
  Process=OpenProcess(0x43a,false,Pid);if(Process==IntPtr.Zero)throw new Exception("无法连接游戏绘制层");
  var d3d=Modules().Find(m=>String.Equals(m.name,"d3d9.dll",StringComparison.OrdinalIgnoreCase));if(d3d.path==null)throw new Exception("游戏没有使用 Direct3D9");
  // Seen from this 64-bit process the game's copy lives in SysWOW64; the 32-bit probe sees the same file as System32.
  Func<string,string> system=p=>Path.GetFullPath(p).ToLowerInvariant().Replace("\\syswow64\\","\\system32\\");
  if((uint)d3d.address.ToInt64()!=Num(probe["base"])||d3d.length!=Num(probe["size"])||system(d3d.path)!=system((string)probe["path"]))throw new Exception("游戏使用的 d3d9.dll 不是系统版本（可能带自己的图形补丁） game="+d3d.path+"@"+((uint)d3d.address.ToInt64()).ToString("x")+" probe="+probe["path"]+"@"+Num(probe["base"]).ToString("x"));
  // Every device class must agree on the device functions; each vertex-buffer class adds its own Lock and Unlock.
  var targets=new Dictionary<string,KeyValuePair<uint,byte[]>>();Action<string,object> take=(key,slot)=>{var pair=(ArrayList)slot;var value=new KeyValuePair<uint,byte[]>(Num(pair[0]),Hex((string)pair[1]));KeyValuePair<uint,byte[]> seen;if(targets.TryGetValue(key,out seen)&&seen.Key!=value.Key)throw new Exception("Direct3D9 设备类型的绘制函数不一致");targets[key]=value;};
  foreach(var s in Slots(probe,"devices")){take("texture",s["65"]);take("draw",s["81"]);}
  int classes=0;foreach(var s in Slots(probe,"buffers")){take("lock"+classes,s["11"]);take("unlock"+classes,s["12"]);classes++;}
  if(classes==0)throw new Exception("没有可用的顶点缓冲类型");
  // A previous ToMe that ended without releasing leaves its own jump (E9 …, EB F9) with the rest of the function
  // untouched: put the probe's original bytes back before checking. Its old code page stays allocated, unused.
  foreach(var t in targets){var actual=Read(t.Value.Key-5,10);var e=t.Value.Value;if(actual!=null&&actual[0]==0xe9&&actual[5]==0xeb&&actual[6]==0xf9&&actual[7]==e[7]&&actual[8]==e[8]&&actual[9]==e[9]&&!Patches.Exists(p=>p.At==t.Value.Key)){var original=new byte[7];Array.Copy(e,original,7);Patches.Add(new Patch{At=t.Value.Key,Original=original});}}
  if(Patches.Count>0){Suspended(()=>{foreach(var p in Patches)Overwrite(p.At-5,p.Original);});Patches.Clear();Status("已清除上次遗留的绘制 Hook",false);}
  IntPtr allocation=VirtualAllocEx(Process,IntPtr.Zero,(UIntPtr)8192,0x3000,4);if(allocation==IntPtr.Zero||allocation.ToInt64()>UInt32.MaxValue)throw new Exception("无法准备等待标记 Hook");Remote=(uint)allocation.ToInt64();uint code=Remote+4096;
  var native=new List<byte>();Func<byte[],uint> add=bytes=>{uint address=code+(uint)native.Count;native.AddRange(bytes);return address;};
  var hooks=new Dictionary<string,uint>();var entries=new Dictionary<string,uint>();foreach(var t in targets)entries[t.Key]=Entry(t.Value.Key,t.Value.Value,native,code);
  hooks["texture"]=add(BuildTexture(0,Remote,entries["texture"]));uint decline=add(new byte[]{0xb8,1,0,0,0,0xc2,20,0}),predicate=add(BuildDraw(0,Remote,decline));hooks["draw"]=add(BuildBufferedDraw(Remote,predicate,entries["draw"]));
  for(int i=0;i<classes;i++){if(!hooks.ContainsKey("lock"+i))hooks["lock"+i]=add(BuildBufferLock(Remote,entries["lock"+i]));hooks["unlock"+i]=add(BuildBufferUnlock(Remote,entries["unlock"+i]));}
  if(native.Count>4096)throw new Exception("绘制 Hook 超出代码页");Write(code,native.ToArray());uint protection;if(!VirtualProtectEx(Process,Ptr(code),(UIntPtr)4096,0x20,out protection))throw new Exception("无法启用绘制 Hook 代码");FlushInstructionCache(Process,Ptr(code),(UIntPtr)native.Count);
  lock(Gate){if(Closed||!Wanted)return;var done=new HashSet<uint>();foreach(var t in targets){if(!done.Add(t.Value.Key))continue;var original=Read(t.Value.Key-5,7);if(original==null)throw new Exception("无法读取游戏绘制函数");Patches.Add(new Patch{At=t.Value.Key,Hook=hooks[t.Key],Original=original});}
   // Long jump into the padding first, then the two-byte short jump back onto it at the entry.
   Suspended(()=>{foreach(var p in Patches){var jump=new byte[]{0xe9,0,0,0,0,0xeb,0xf9};BitConverter.GetBytes(p.Hook-p.At).CopyTo(jump,1);Overwrite(p.At-5,jump);}});
   Installed=true;InstalledAt=DateTime.UtcNow;Apply();Status("Direct3D9 绘制 Hook 已连接（"+Patches.Count+" 个函数），等待实际绘制验证",false);}
 }catch(Exception e){lock(Gate){Blocked=true;Restore();Status(e.Message+"；改用画面遮挡",false);}}finally{lock(Gate){Busy=false;}}}
 void Restore(){if(Process==IntPtr.Zero||Patches.Count==0)return;try{Write(Remote,BitConverter.GetBytes(0));Suspended(()=>{foreach(var p in Patches)Overwrite(p.At-5,p.Original);});Patches.Clear();}catch{}Installed=false;}
 // Every 40 ms: report marker draws the hook skipped (the page shows the moved copy only while the game draws it).
 public void Tick(){lock(Gate){if(!Installed||Closed)return;
  if(ViewPending&&Wanted)Apply();
  var count=Read(Remote+32,4);if(count==null)return;uint value=U(count);
  if(value!=LastCount){LastCount=value;if((DateTime.UtcNow-LastDrawnEmit).TotalMilliseconds>=80){LastDrawnEmit=DateTime.UtcNow;Emit(new{type="waitMarkerDrawn"});}Status("等待标记已由绘制 Hook 隐藏（不生成遮挡色块）",true);}
  else if(Wanted&&!ViewPending&&LastStatus.StartsWith("Direct3D9")&&(DateTime.UtcNow-InstalledAt).TotalSeconds>6&&LastStatusAt==DateTime.MinValue){LastStatusAt=DateTime.UtcNow;/* once: a game that composes its own frames never matches */var diag=Read(Remote+100,36);var view=Read(Remote+80,8);Emit(new{type="waitMarkerStatus",message="绘制 Hook 已连接但还没拦到标记 view="+(view==null?"?":U(view)+"x"+U(view,4))+(diag==null?"":" qlocks="+U(diag,4)+" locks="+U(diag,8)+" lastLock="+U(diag,16)+"@"+U(diag,12)+" draws="+U(diag,20)+" lastDraw=t"+U(diag,24)+",s"+U(diag,28)+",n"+U(diag,32)),active=false});}
 }}
 public void Dispose(){lock(Gate){Closed=true;Wanted=false;Restore();/* The hook code page is never freed: a game thread may still be inside it. */if(Process!=IntPtr.Zero&&!Busy){CloseHandle(Process);Process=IntPtr.Zero;}}}

 sealed class Code{public List<byte>B=new List<byte>();readonly Dictionary<string,int>Labels=new Dictionary<string,int>();readonly List<KeyValuePair<int,string>>Fix=new List<KeyValuePair<int,string>>();public void A(params byte[] b){B.AddRange(b);}public void D(uint v){B.AddRange(BitConverter.GetBytes(v));}public void L(string n){Labels[n]=B.Count;}public void J(byte condition,string label){A(0x0f,condition);Fix.Add(new KeyValuePair<int,string>(B.Count,label));D(0);}public byte[] Done(){foreach(var f in Fix){byte[] d=BitConverter.GetBytes(Labels[f.Value]-f.Key-4);for(int i=0;i<4;i++)B[f.Key+i]=d[i];}return B.ToArray();}}
 // Shared data page (Remote): 0 enabled, 4..16 box, 20 current stage-0 texture, 24 learned texture, 28 learned flag,
 // 32 skipped draws, 40/44 centre, 52 locked pointer, 56 snapshot ready, 60 lock offset, 68 viewport taken,
 // 72 viewport (80 width, 84 height), 100 lock size, 104 qualifying locks, 1792 vertex snapshot.
 public static byte[] BuildTexture(uint at,uint data,uint original){var c=new Code();c.A(0x60,0xbf);c.D(data);c.A(0x83,0x7c,0x24,0x28,0x00);c.J(0x85,"forward");c.A(0x8b,0x44,0x24,0x2c,0x89,0x47,0x14);c.L("forward");c.A(0x61,0xb8);c.D(original);c.A(0xff,0xe0);return c.Done();}
 public static byte[] BuildDraw(uint at,uint data,uint original){var c=new Code();c.A(0x60,0xbf);c.D(data);c.A(0x80,0x3f,0);c.J(0x84,"forward");c.A(0x83,0x7c,0x24,0x2c,2);c.J(0x85,"forward");c.A(0x8b,0x44,0x24,0x28,0x83,0xf8,4);c.J(0x82,"forward");c.A(0x83,0xf8,6);c.J(0x87,"forward");c.A(0xb9,4,0,0,0,0x83,0xf8,4);c.J(0x85,"vertices");c.A(0xb9,6,0,0,0);c.L("vertices");c.A(0x8b,0x74,0x24,0x30,0x8b,0x5c,0x24,0x34,0x83,0xfb,20);c.J(0x82,"forward");c.A(0x83,0xfb,64);c.J(0x87,"forward");c.A(0x85,0xf6);c.J(0x84,"forward");
  // Four/six transformed vertices: x,y,z,rhw,(diffuse),uv. XMM0..3 bbox.
  c.A(0xf3,0x0f,0x10,0x06,0x0f,0x28,0xc8,0xf3,0x0f,0x10,0x56,4,0x0f,0x28,0xda,0x49);c.L("loop");c.A(0x03,0xf3,0xf3,0x0f,0x10,0x26,0xf3,0x0f,0x10,0x6e,4,0xf3,0x0f,0x5d,0xc4,0xf3,0x0f,0x5f,0xcc,0xf3,0x0f,0x5d,0xd5,0xf3,0x0f,0x5f,0xdd,0x49);c.J(0x85,"loop");
  // Entire quad must lie in the identified small sprite bounds and cover its center.
  c.A(0x0f,0x2f,0x47,4);c.J(0x82,"forward");c.A(0x0f,0x2f,0x4f,12);c.J(0x8a,"forward");c.J(0x87,"forward");c.A(0x0f,0x2f,0x57,8);c.J(0x82,"forward");c.A(0x0f,0x2f,0x5f,16);c.J(0x8a,"forward");c.J(0x87,"forward");c.A(0x0f,0x2f,0x47,40);c.J(0x87,"forward");c.A(0x0f,0x2f,0x4f,40);c.J(0x82,"forward");c.A(0x0f,0x2f,0x57,44);c.J(0x87,"forward");c.A(0x0f,0x2f,0x5f,44);c.J(0x82,"forward");
  c.A(0x8b,0x47,20,0x83,0x7f,28,0);c.J(0x84,"learn");c.A(0x3b,0x47,24);c.J(0x85,"forward");c.J(0x84,"skip");c.L("learn");c.A(0x89,0x47,24,0xc7,0x47,28,1,0,0,0);c.L("skip");c.A(0xff,0x47,32,0x61,0x33,0xc0,0xc2,20,0);c.L("forward");c.A(0x61,0xb8);c.D(original);c.A(0xff,0xe0);return c.Done();
 }
 // BGI draws sprites from a four-vertex, 28-byte stride buffer, not DrawPrimitiveUP. Lock remembers the mapped pointer
 // of a 112-byte buffer only (asked size, or the whole buffer checked through GetDesc); Unlock snapshots it.
 public static byte[] BuildBufferLock(uint data,uint original){var c=new Code();c.A(0x55,0x8b,0xec,0x83,0xec,0x18);
  // Diagnostics: all locks (108), last asked size (112) and offset (116).
  c.A(0xff,0x05);c.D(data+108);c.A(0x8b,0x45,16,0xa3);c.D(data+112);c.A(0x8b,0x45,12,0xa3);c.D(data+116);c.A(0xc7,0x05);c.D(data+52);c.D(0);c.A(0xc7,0x05);c.D(data+56);c.D(0);
  c.A(0xff,0x75,24,0xff,0x75,20,0xff,0x75,16,0xff,0x75,12,0xff,0x75,8,0xb8);c.D(original);c.A(0xff,0xd0,0x85,0xc0);c.J(0x85,"done");
  c.A(0x83,0x7d,12,0);c.J(0x85,"done");c.A(0x8b,0x4d,16,0x83,0xf9,112);c.J(0x84,"record");c.A(0x85,0xc9);c.J(0x85,"done");
  c.A(0x8d,0x55,0xe8,0x52,0x8b,0x4d,8,0x51,0x8b,0x01,0xff,0x50,52,0x85,0xc0);c.J(0x85,"fail");c.A(0x83,0x7d,0xf8,112);c.J(0x85,"fail");c.A(0x81,0x7d,0xfc);c.D(0x144);c.J(0x85,"fail");
  c.L("record");c.A(0xff,0x05);c.D(data+104);c.A(0x8b,0x55,20,0x8b,0x12,0x89,0x15);c.D(data+52);c.A(0xc7,0x05);c.D(data+60);c.D(0);c.A(0xc7,0x05);c.D(data+100);c.D(112);
  c.L("fail");c.A(0x33,0xc0);c.L("done");c.A(0x8b,0xe5,0x5d,0xc2,20,0);return c.Done();}
 public static byte[] BuildBufferUnlock(uint data,uint original){var c=new Code();c.A(0x60,0xbf);c.D(data);c.A(0xc7,0x47,56,0,0,0,0,0x8b,0x77,52,0x85,0xf6);c.J(0x84,"forward");c.A(0x83,0x7f,60,0);c.J(0x85,"forward");c.A(0x8b,0x47,100,0x85,0xc0);c.J(0x84,"copy");c.A(0x83,0xf8,112);c.J(0x82,"forward");c.L("copy");c.A(0x57,0x81,0xc7,0,7,0,0,0xb9,28,0,0,0,0xfc,0xf3,0xa5,0x5f,0xc7,0x47,56,1,0,0,0);c.L("forward");c.A(0xc7,0x47,52,0,0,0,0,0x61,0xb8);c.D(original);c.A(0xff,0xe0);return c.Done();}
 // DrawPrimitive(strip, 0, 2) of a snapshotted quad goes through the shared predicate. The first draw also records
 // the viewport through the device's own GetViewport.
 public static byte[] BuildBufferedDraw(uint data,uint predicate,uint original){var c=new Code();c.A(0x55,0x8b,0xec);
  c.A(0x83,0x3d);c.D(data+68);c.A(0);c.J(0x85,"view");c.A(0xc7,0x05);c.D(data+68);c.D(1);c.A(0x68);c.D(data+72);c.A(0x8b,0x4d,8,0x51,0x8b,0x01,0xff,0x90,0xc0,0,0,0);c.L("view");
  // Diagnostics: all DrawPrimitive calls (120), last type (124), start (128) and count (132).
  c.A(0xff,0x05);c.D(data+120);c.A(0x8b,0x45,12,0xa3);c.D(data+124);c.A(0x8b,0x45,16,0xa3);c.D(data+128);c.A(0x8b,0x45,20,0xa3);c.D(data+132);
  c.A(0x83,0x7d,12,5);c.J(0x85,"forward");c.A(0x83,0x7d,16,0);c.J(0x85,"forward");c.A(0x83,0x7d,20,2);c.J(0x85,"forward");c.A(0xb8);c.D(data);c.A(0x83,0x78,56,1);c.J(0x85,"forward");c.A(0x6a,28,0x68);c.D(data+1792);c.A(0xff,0x75,20,0xff,0x75,12,0xff,0x75,8,0xb8);c.D(predicate);c.A(0xff,0xd0,0x85,0xc0);c.J(0x85,"forward");c.A(0x8b,0xe5,0x5d,0xc2,16,0);c.L("forward");c.A(0x8b,0xe5,0x5d,0xb8);c.D(original);c.A(0xff,0xe0);return c.Done();}
}
