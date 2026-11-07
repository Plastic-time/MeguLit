// SPDX-License-Identifier: GPL-3.0-or-later
// Adapter to LunaHook's C ABI. See third_party/LunaHook/UPSTREAM.json.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
public static class HookBridge {
 [StructLayout(LayoutKind.Sequential)] public struct ThreadParam {public uint processId;public ulong addr,ctx,ctx2;public string Key(){return addr.ToString("x")+":"+ctx.ToString("x")+":"+ctx2.ToString("x");}}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void ProcessEvent(uint pid);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void CreateEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool embed);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void DestroyEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void OutputEvent([MarshalAs(UnmanagedType.LPWStr)]string code,[MarshalAs(UnmanagedType.LPStr)]string name,ThreadParam tp,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void InfoEvent(int type,[MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void InsertEvent(uint pid,ulong address,[MarshalAs(UnmanagedType.LPWStr)]string code);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void EmbedEvent([MarshalAs(UnmanagedType.LPWStr)]string text,ThreadParam tp);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr QueryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void GameEvent([MarshalAs(UnmanagedType.LPWStr)]string id,[MarshalAs(UnmanagedType.LPWStr)]string title,[MarshalAs(UnmanagedType.LPWStr)]string version);
 const string Host="LunaHost64.dll";
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] static extern void Luna_Start(ProcessEvent connected,ProcessEvent disconnected,CreateEvent create,DestroyEvent destroy,OutputEvent output,InfoEvent info,InsertEvent insert,EmbedEvent embed,QueryEvent query,GameEvent game);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] static extern void Luna_Settings(int delay,int codepage,int buffer,int history,[MarshalAs(UnmanagedType.I1)]bool pcHooks);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] static extern void Luna_ConnectProcess(uint pid);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] static extern bool Luna_CheckIfNeedInject(uint pid);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] static extern void Luna_DetachProcess(uint pid);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)] static extern void Luna_UseEmbed(ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool use);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl,CharSet=CharSet.Unicode)] static extern void Luna_EmbedCallback(ThreadParam tp,string text,string trans);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl,CharSet=CharSet.Unicode)] static extern void Luna_SettingsEx(uint pid,uint wait,byte charset,[MarshalAs(UnmanagedType.I1)]bool setCharset,string font,uint display,[MarshalAs(UnmanagedType.I1)]bool skip,[MarshalAs(UnmanagedType.I1)]bool clear,[MarshalAs(UnmanagedType.I1)]bool setSize,float size,[MarshalAs(UnmanagedType.I1)]bool veh,string unitydir);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr LoadLibraryEx(string path,IntPtr file,uint flags);
 [DllImport("kernel32.dll",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll")] static extern bool IsWow64Process(IntPtr process,out bool wow);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int left,top,right,bottom;}
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd,out Rect rect);
 [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd,IntPtr dc,uint flags);
 static readonly object Gate=new object(),OutputGate=new object();static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
 sealed class Candidate {public ThreadParam tp;public string name,code,sample="";public bool embed,created;}
 static readonly Dictionary<string,Candidate> Candidates=new Dictionary<string,Candidate>();static readonly List<Delegate> Keep=new List<Delegate>();
 static bool ReceivedText,ReplacementCallback,OfficialRuntime,KnownNaninovel;static string UnityFontDir="";static string NaninovelHide="size0";
 // Naninovel keeps its own copy of each line for the backlog and auto-advance; the printer only gets the line drawn
 // at zero size.
 static DateTime HideCheckedAt=DateTime.MinValue;
 static string HideNaninovel(string text){
  // Debug override: native\naninovel-hide.txt (re-read at most once a second, no reconnect needed).
  if((DateTime.UtcNow-HideCheckedAt).TotalSeconds>=1){HideCheckedAt=DateTime.UtcNow;try{string f=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"naninovel-hide.txt");if(File.Exists(f)){string v=File.ReadAllText(f).Trim();if(v!="")NaninovelHide=v;}}catch{}}
  switch(NaninovelHide){
   case "original":return text;
   case "space":return " ";
   case "mark":return "◆"+text;
   case "color":return "<color=#00000000>"+text+"</color>";
   case "voffset":return "<voffset=-100em>"+text+"</voffset>";
   case "alpha":return "<alpha=#00>"+text;
  }
  // Zero-size glyphs: Naninovel's reveal rewrites vertex colours, so colour/alpha tags stay visible, but it keeps sizes.
  return "<size=0>"+text+"</size>";}
 static DateTime LastHeartbeat=DateTime.MinValue;
 static bool KnownIsland;static ulong MagesAddress;static uint Pid;static string Selected="",ProcessStarted="",BoundProcess="";static IntPtr GameWindow;static bool Enabled,Started,ReplacementEnabled;static volatile bool Connected,Quit;static Dictionary<string,object> Resume;static int ProbePending;static WaitRenderHook WaitHook;
 static void Emit(object value){lock(OutputGate)Console.WriteLine(Json.Serialize(value));}
 /* Paths relative to the ToMe.V3 root (this exe lives in native\). */
 // Unity games draw embedded text with TextMeshPro fonts that lack Chinese. ToMe downloads LunaTranslator's TMP font
 // bundles to cache\unity-font once; when LunaHook reports a Unity engine, its loader is pointed at that folder.
 static void UseUnityFont(){string dir="";try{string root=Under("cache","unity-font","x");root=Path.GetDirectoryName(root);foreach(var f in Directory.GetFiles(root,"arialuni_sdf_u*",SearchOption.AllDirectories)){dir=Path.GetDirectoryName(f);break;}}catch{}
  if(dir==""){Diagnostic("unity font bundle missing; Chinese may not show in Unity embed");return;}
  UnityFontDir=dir;ApplySettings();Diagnostic("unity font dir "+dir);}
 // clearText makes the game blank an embedded line itself without asking ToMe; the Naninovel printer instead gets the
 // zero-size copy from OnEmbed, so it is off there.
 static void ApplySettings(){bool clear=!KnownNaninovel;Luna_SettingsEx(Pid,OfficialRuntime?1000u:0u,0,false,"",0,true,clear,false,1,false,UnityFontDir);Diagnostic("settings clearText="+clear);}
 static string Under(params string[] parts){var all=new List<string>{AppDomain.CurrentDomain.BaseDirectory,".."};all.AddRange(parts);string full=Path.GetFullPath(Path.Combine(all.ToArray()));try{Directory.CreateDirectory(Path.GetDirectoryName(full));}catch{}return full;}
 static void Diagnostic(string value){try{string file=Under("logs","hook-diagnostics.log");lock(OutputGate){if(!File.Exists(file)||new FileInfo(file).Length<1048576)File.AppendAllText(file,DateTime.UtcNow.ToString("o")+" "+value+Environment.NewLine);}}catch{}}
 static void SaveSelection(Candidate c){try{File.WriteAllText(Under("cache","hook-session.json"),Json.Serialize(new{pid=Pid,started=ProcessStarted,code=c.code,addr=c.tp.addr.ToString("x"),ctx=c.tp.ctx.ToString("x"),ctx2=c.tp.ctx2.ToString("x"),name=c.name,embeddable=c.embed}));}catch{}}
 static bool InitialReplacement(string[] args){return !(args.Length==5&&args[4]=="--read-only");}
 static bool TryIslandThread(bool known,uint pid,ulong address,string code,out ThreadParam tp){
  tp=new ThreadParam();if(!known||address!=0x503af0||String.IsNullOrEmpty(code)||!code.StartsWith("E",StringComparison.Ordinal))return false;
  tp=new ThreadParam{processId=pid,addr=address,ctx=0,ctx2=1};return true;
 }
 static void OnInsert(uint pid,ulong address,string code){Diagnostic("insert "+code);if(pid!=Pid)return;
  if((code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:")){if(!KnownNaninovel){KnownNaninovel=true;ThreadPool.QueueUserWorkItem(_=>{try{ApplySettings();}catch{}});}Emit(new{type="hookEngineFeature",framework="naninovel"});
   // The built-in printer hook is kept as is. Swapping it for an unfiltered copy at the same address (and removing
   // the String hooks) froze the game after quick ToMe restarts; 9 rapid restarts without the swap stayed responsive.
   }
    try{ThreadParam tp;string name;if(Resume!=null&&code!=null&&code.StartsWith("E")&&Convert.ToString(Resume["code"])==code&&Convert.ToString(Resume["addr"])==address.ToString("x")){tp=new ThreadParam{processId=pid,addr=address,ctx=Convert.ToUInt64(Convert.ToString(Resume["ctx"]),16),ctx2=Convert.ToUInt64(Convert.ToString(Resume["ctx2"]),16)};name=Convert.ToString(Resume["name"]);Resume=null;}
   // Upstream EmbedBGI2 sets ctx=0 and ctx2=ScenarioRole (1).
   // Pre-arm this verified dialogue role only; names (2) remain untouched.
   else if(Resume==null&&Selected==""&&TryIslandThread(KnownIsland,pid,address,code,out tp)){name="EmbedToMeCS2_DrawPreserve";Emit(new{type="hookEngineFeature",framework="cs2"});}
   else if(Resume==null&&Selected==""&&ReplacementEnabled&&MagesAddress!=0&&address==MagesAddress&&code!=null&&code.StartsWith("E")){tp=new ThreadParam{processId=Pid,addr=address,ctx=0,ctx2=0};name="EmbedMAGES_SteinsGate";}
   else if(Resume==null&&Selected==""&&ReplacementEnabled&&String.Equals(BoundProcess,"BGI",StringComparison.OrdinalIgnoreCase)&&code!=null&&code.StartsWith("EXHSXN8:20@")&&code.EndsWith(":BGI.exe",StringComparison.OrdinalIgnoreCase)){tp=new ThreadParam{processId=pid,addr=address,ctx=0,ctx2=1};name="EmbedBGI";}
   else return;lock(Gate){if(name=="EmbedToMeCS2_DrawPreserve"||name=="EmbedEuphoria474_DrawHide_TEST2")Luna_Settings(0,932,4000,4000,false);Candidates[tp.Key()]=new Candidate{tp=tp,code=code,name=name,embed=true};}Select(tp.Key());}catch{Resume=null;}
 }
 static void CaptureProbe(){try{uint owner;GetWindowThreadProcessId(GameWindow,out owner);Rect rect;if(owner!=Pid||!GetClientRect(GameWindow,out rect)||rect.right<1||rect.bottom<1||rect.right>7680||rect.bottom>4320)return;using(var image=new Bitmap(rect.right,rect.bottom,PixelFormat.Format32bppArgb)){using(var graphics=Graphics.FromImage(image)){IntPtr dc=graphics.GetHdc();try{if(!PrintWindow(GameWindow,dc,2))return;}finally{graphics.ReleaseHdc(dc);}}int top=rect.bottom*55/100;using(var crop=image.Clone(new Rectangle(0,top,rect.right,rect.bottom-top),PixelFormat.Format32bppArgb)){string folder=Under("logs","work-diagnostics","x");folder=Path.GetDirectoryName(folder);Directory.CreateDirectory(folder);crop.Save(Path.Combine(folder,"hook-game.png"),ImageFormat.Png);}}}catch(Exception e){Diagnostic("probe "+e.Message);}}
 static void Status(string message){lock(Gate){Emit(new{type="hookStatus",hookMessage=message,hookActive=Enabled&&Selected!=""&&Connected,processAttached=Connected,streamSelected=Selected!="",receivedText=ReceivedText,replacementState=!ReplacementEnabled?"disabled":ReplacementCallback?"callback-acknowledged":Enabled&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed?"clear-requested":"unverified"});}}
 static void Heartbeat(){if((DateTime.UtcNow-LastHeartbeat).TotalSeconds<2)return;LastHeartbeat=DateTime.UtcNow;lock(Gate){List();Emit(new{type="hookHeartbeat",hookActive=Enabled&&Selected!=""&&Connected,processAttached=Connected,streamSelected=Selected!="",receivedText=ReceivedText,replacementState=!ReplacementEnabled?"disabled":ReplacementCallback?"callback-acknowledged":Enabled&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed?"clear-requested":"unverified"});}}
 static void Rescan(){Candidate c=null;lock(Gate){List();if(Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].created)c=Candidates[Selected];}if(c!=null&&c.name!="EmbedToMeCS2_DrawPreserve"&&c.name!="EmbedEuphoria474_DrawHide_TEST2"){
 HistoryEvent history=s=>{lock(Gate){if(Selected==c.tp.Key()&&!ReceivedText&&!String.IsNullOrWhiteSpace(s)){ReceivedText=true;Emit(new{type="hookSource",text=s,origin="history",sourceName=c.name,sourceCode=c.code,hookActive=true});}}};Luna_QueryThreadHistory(c.tp,true,history);GC.KeepAlive(history);}}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)]delegate void HistoryEvent([MarshalAs(UnmanagedType.LPWStr)]string text);
 [DllImport(Host,CallingConvention=CallingConvention.Cdecl)]static extern void Luna_QueryThreadHistory(ThreadParam tp,[MarshalAs(UnmanagedType.I1)]bool latest,HistoryEvent callback);
 static void OnEmbed(string text,ThreadParam tp){lock(Gate){bool active=ReplacementEnabled&&Enabled&&Connected&&tp.Key()==Selected;string replacement=active?" ":text;Candidate target;if(active&&Candidates.TryGetValue(tp.Key(),out target)&&(target.code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))replacement=HideNaninovel(text);Luna_EmbedCallback(tp,text,replacement);if(active&&KnownNaninovel)Diagnostic("embed "+Json.Serialize(text.Length>300?text.Substring(0,300):text)+" -> "+Json.Serialize(replacement.Length>300?replacement.Substring(0,300):replacement));if(active){ReplacementCallback=true;ReceivedText=!String.IsNullOrWhiteSpace(text);Status("已收到内嵌原文并应答替换；画面效果待验证");}}}

 // Unity games create one stream per String call site; the selected and embeddable ones go first and the list is
 // capped so one status line stays small.
 static void List(){var result=new List<object>();var items=new List<KeyValuePair<string,Candidate>>(Candidates);items.Sort((a,b)=>((b.Key==Selected?2:0)+(b.Value.embed?1:0)).CompareTo((a.Key==Selected?2:0)+(a.Value.embed?1:0)));if(items.Count>80)items.RemoveRange(80,items.Count-80);foreach(var item in items){var c=item.Value;result.Add(new{id=item.Key,name=c.name,code=c.code,sample=c.sample,embeddable=c.embed,selected=item.Key==Selected});}Emit(new{type="hookThreads",hookThreads=result});}
 static void Deactivate(){if(WaitHook!=null)WaitHook.Disable();lock(Gate){if(Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed)Luna_UseEmbed(Candidates[Selected].tp,false);ReplacementEnabled=false;ReplacementCallback=false;}Diagnostic("replacement disabled; capture retained selected="+Selected);Status("原文清空已关闭；所选文本流仍可读取");}
 static void Select(string id){lock(Gate){Candidate c;if(!Candidates.TryGetValue(id,out c)||c.tp.processId!=Pid)throw new Exception("请选择支持内嵌的对话文本流");if(KnownIsland&&Selected==id&&Enabled){if(c.embed)Luna_UseEmbed(c.tp,ReplacementEnabled);List();Diagnostic("select retained id="+id+" replacement="+ReplacementEnabled);Status("文本流已选择；"+(ReplacementEnabled&&c.embed?"等待内嵌替换回调":"仅读取，不清空游戏原文"));return;}if(Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].embed)Luna_UseEmbed(Candidates[Selected].tp,false);Selected=id;Enabled=true;ReceivedText=false;ReplacementCallback=false;if(c.embed&&ReplacementEnabled)Luna_UseEmbed(c.tp,true);SaveSelection(c);List();Diagnostic("select id="+id+" name="+c.name+" embed="+c.embed+" replacement="+ReplacementEnabled);}Status("文本流已选择；"+(ReplacementEnabled&&Candidates[id].embed?"等待内嵌替换回调":"仅读取，不清空游戏原文"));Rescan();}
 static void OnConnect(uint pid){if(pid!=Pid)return;Connected=true;ApplySettings();lock(Gate){if(Selected!=""&&Candidates.ContainsKey(Selected)&&Enabled&&ReplacementEnabled&&Candidates[Selected].embed)Luna_UseEmbed(Candidates[Selected].tp,true);}Status("进程已附加，等待对话流与实际文本");}
 static void OnDisconnect(uint pid){if(pid!=Pid)return;Connected=false;Enabled=false;ReceivedText=false;ReplacementCallback=false;Quit=true;Status("游戏连接已断开，Hook 清空已停止");}
 static void OnCreate(string code,string name,ThreadParam tp,bool embed){if(tp.processId!=Pid)return;if((code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))name="Naninovel:RevealableText.SetTextValue";if(embed||!(code??"").Contains("@mscorlib:System:String:"))Diagnostic("thread "+name+" "+code+" embed="+embed);lock(Gate){Candidates[tp.Key()]=new Candidate{tp=tp,name=name,code=code,embed=embed,created=true};if(KnownIsland&&embed&&name=="EmbedToMeCS2_DrawPreserve"&&tp.addr==0x503af0&&tp.ctx==0&&tp.ctx2==1&&Selected=="")Select(tp.Key());if((embed&&String.Equals(name,"EmbedEuphoria474_DrawHide_TEST2",StringComparison.Ordinal))||(BoundProcess=="euphoriaHD"&&name=="YU-RIS6"&&tp.addr==0x41e3a4)){ThreadPool.QueueUserWorkItem(_=>{try{Select(tp.Key());}catch(Exception e){Diagnostic("test-select-error "+e.Message);}});}if(Selected==tp.Key()&&Enabled&&ReplacementEnabled&&embed)Luna_UseEmbed(tp,true);List();if(Resume!=null&&Convert.ToString(Resume["code"])==code&&Convert.ToString(Resume["addr"])==tp.addr.ToString("x")&&Convert.ToString(Resume["ctx"])==tp.ctx.ToString("x")&&Convert.ToString(Resume["ctx2"])==tp.ctx2.ToString("x")){Resume=null;ThreadPool.QueueUserWorkItem(_=>{try{Select(tp.Key());}catch(Exception e){Diagnostic("restore-error "+e.Message);}});}}ThreadPool.QueueUserWorkItem(_=>{try{Rescan();}catch{}});}
 static void OnDestroy(string code,string name,ThreadParam tp){if(tp.processId!=Pid)return;lock(Gate){Candidates.Remove(tp.Key());if(Selected==tp.Key()){Selected="";Enabled=false;Status("所选文本流已移除，请重新选择");}List();}}
 const string AutoSkip="^String:|name|speaker|mail|choice|select|ruby|GDI|TextOut|GlyphOutline|DrawText|Console|Clipboard|Stuff|Window|Menu";
 static readonly HookSourceFrames SourceFrames=new HookSourceFrames();
 static void OnOutput(string code,string name,ThreadParam tp,string text){if(KnownNaninovel&&!(code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))return;if(KnownNaninovel)Diagnostic("out "+tp.Key()+" "+Json.Serialize(text!=null&&text.Length>300?text.Substring(0,300):text));if(KnownNaninovel){lock(Gate){Candidate current;if(Selected!=""&&Candidates.TryGetValue(Selected,out current)&&!(current.code??"").Contains(":Naninovel.UI:RevealableText:SetTextValue:"))Select(tp.Key());}}if(name=="EmbedToMeCS2_DrawPreserve"||name=="EmbedEuphoria474_DrawHide_TEST2"){lock(Gate){foreach(string frame in SourceFrames.Feed(tp.Key(),text))OutputFrame(code,name,tp,frame);}return;}OutputFrame(code,name,tp,text);}
 static void OutputFrame(string code,string name,ThreadParam tp,string text){if(tp.processId!=Pid||String.IsNullOrWhiteSpace(text))return;text=text.Length>4000?text.Substring(0,4000):text;lock(Gate){Candidate c;if(Candidates.TryGetValue(tp.Key(),out c)){string sample=text.Length>100?text.Substring(0,100)+"…":text;if(c.sample!=sample){c.sample=sample;List();}}if(c!=null&&c.embed&&c.name=="EmbedCS2"&&c.tp.ctx2==1&&Selected!=""&&Candidates.ContainsKey(Selected)&&Candidates[Selected].name=="EmbedCS2"&&Candidates[Selected].tp.ctx2!=1){Select(tp.Key());Diagnostic("auto-upgrade CatSystem scenario role; history role is not the rendered dialogue");}if(Selected==""&&Candidates.Count==1){Candidate only;if(Candidates.TryGetValue(tp.Key(),out only)&&!System.Text.RegularExpressions.Regex.IsMatch(only.name??"","name|speaker",System.Text.RegularExpressions.RegexOptions.IgnoreCase))Select(tp.Key());}
   // Several streams (MAGES engines send each line twice): the first engine stream that carries a real Japanese line
   // is taken; name, mail, choice and plain GDI/API drawing streams are not.
   else if(Selected==""&&c!=null&&!System.Text.RegularExpressions.Regex.IsMatch(c.name??"",AutoSkip,System.Text.RegularExpressions.RegexOptions.IgnoreCase)&&text.Length<=600&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ]")&&System.Text.RegularExpressions.Regex.Matches(text,"[぀-ヿ一-鿿]").Count>=4){Select(tp.Key());Diagnostic("auto-select "+c.name+" (first dialogue stream of "+Candidates.Count+")");}if(Enabled&&tp.Key()==Selected){ReceivedText=true;Diagnostic("source id="+tp.Key()+" chars="+text.Length);Emit(new{type="hookSource",text=text,sourceName=name,sourceCode=code,hookActive=true});if(File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"enable-hook-probe.flag"))&&Interlocked.Exchange(ref ProbePending,1)==0)ThreadPool.QueueUserWorkItem(_=>{try{Thread.Sleep(250);CaptureProbe();}finally{ProbePending=0;}});}}}
 static void Input(){string line;while(!Quit&&(line=Console.ReadLine())!=null){try{var d=Json.Deserialize<Dictionary<string,object>>(line);string type=Convert.ToString(d["type"]);if(type=="rescan")Rescan();else if(type=="waitMarker"){if(WaitHook!=null)WaitHook.Update(d,Enabled&&Connected);}else if(type=="select"){ReplacementEnabled=d.ContainsKey("replace")&&Convert.ToBoolean(d["replace"]);Select(Convert.ToString(d["id"]));}else if(type=="disable")Deactivate();else if(type=="enable"){ReplacementEnabled=true;ApplySettings();if(Selected!="")Select(Selected);}else if(type=="quit"){Quit=true;break;}}catch(Exception e){Diagnostic("input-error "+e.Message);Status("Hook 设置未生效，请重新选择对话文本流");}}Quit=true;}
 static readonly string[] Exports={"Luna_Start","Luna_Settings","Luna_SettingsEx","Luna_ConnectProcess","Luna_CheckIfNeedInject","Luna_UseEmbed","Luna_EmbedCallback","Luna_DetachProcess","Luna_QueryThreadHistory"};
 static IntPtr Probe(string root){string dll=Path.Combine(root,Host);if(!File.Exists(dll))throw new Exception("缺少 LunaHost64.dll，请导入官方 LunaTranslator 的 Hook 组件");IntPtr module=LoadLibraryEx(dll,IntPtr.Zero,8);if(module==IntPtr.Zero)throw new Exception("无法加载 LunaHost64.dll（位数、依赖或版本不匹配）");foreach(string name in Exports)if(GetProcAddress(module,name)==IntPtr.Zero){FreeLibrary(module);throw new Exception("LunaHook 接口版本不兼容，缺少 "+name);}return module;}
 static bool IsSupportedIsland(string[] args){if(args.Length<4||!String.Equals(args[2],"ISLAND",StringComparison.OrdinalIgnoreCase))return false;try{using(var p=Process.GetProcessById(Int32.Parse(args[0])))using(var hash=System.Security.Cryptography.SHA256.Create())using(var stream=File.OpenRead(p.MainModule.FileName))return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","")=="474CC11D875D7BE9DF9581F3A55D64698CCF4E760C44013DF403CCED85E505F1";}catch{return false;}}
 static bool IsSupportedSteinsGate(string[] args){
  if(args.Length!=5||!String.Equals(args[2],"Game",StringComparison.OrdinalIgnoreCase))return false;
  try{uint pid;if(!UInt32.TryParse(args[0],out pid))return false;using(var process=Process.GetProcessById((int)pid)){string file=process.MainModule.FileName;
   using(var hash=System.Security.Cryptography.SHA256.Create())using(var stream=File.OpenRead(file)){bool supported=BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","")=="CBBC5DAB18EDC344D05C01D4D08819FBC0A68A78741956831752986009B69E16";if(supported)MagesAddress=(ulong)(process.MainModule.BaseAddress.ToInt64()+0x4970d);return supported;}}}catch{return false;}
 }
 static object EngineInfo(string s){
    var layout=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_CS2_LAYOUT line=(\d+) token=(\d+) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(\d+) n=(\d+) hidden=([01])(?: color=([0-9a-f]{8}))?");
    if(layout.Success)return new{type="hookTextPos",engine="cs2_screen_v2",line=Int64.Parse(layout.Groups[1].Value),token=Int64.Parse(layout.Groups[2].Value),x0=Int64.Parse(layout.Groups[3].Value),y0=Int64.Parse(layout.Groups[4].Value),x1=Int64.Parse(layout.Groups[5].Value),y1=Int64.Parse(layout.Groups[6].Value),size=Int64.Parse(layout.Groups[7].Value),count=Int64.Parse(layout.Groups[8].Value),replacementRequested=layout.Groups[9].Value=="1",color=layout.Groups[10].Success?"#"+layout.Groups[10].Value.Substring(6,2)+layout.Groups[10].Value.Substring(4,2)+layout.Groups[10].Value.Substring(2,2):null,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    var pos=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_TEXTPOS engine=(\w+) line=(-?\d+) x0=(-?\d+) y0=(-?\d+) x1=(-?\d+) y1=(-?\d+) size=(-?\d+) n=(\d+)(?: token=(\d+))?");
    if(pos.Success)return new{type="hookTextPos",engine=pos.Groups[1].Value,line=Int64.Parse(pos.Groups[2].Value),x0=Int64.Parse(pos.Groups[3].Value),y0=Int64.Parse(pos.Groups[4].Value),x1=Int64.Parse(pos.Groups[5].Value),y1=Int64.Parse(pos.Groups[6].Value),size=Int64.Parse(pos.Groups[7].Value),count=Int64.Parse(pos.Groups[8].Value),token=pos.Groups[9].Success?Int64.Parse(pos.Groups[9].Value):-1,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    // Whether the new line joins the lines already on the game's page (several lines per page) or starts a new page.
    var page=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_PAGE engine=(\w+) line=(-?\d+) same=([01])(?: token=(\d+))?");
    if(page.Success)return new{type="hookPage",engine=page.Groups[1].Value,line=Int64.Parse(page.Groups[2].Value),same=page.Groups[3].Value=="1",token=page.Groups[4].Success?Int64.Parse(page.Groups[4].Value):-1,at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()};
    var dialog=System.Text.RegularExpressions.Regex.Match(s??"",@"^ToMe_DIALOG engine=(\w+) visible=([01])$");
    if(dialog.Success)return new{type="hookDialog",engine=dialog.Groups[1].Value,visible=dialog.Groups[2].Value=="1"};return null;
 }
 static bool EngineInfoSelfTest(){
  var layout=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_CS2_LAYOUT line=3 token=11 x0=230 y0=160 x1=800 y1=190 size=28 n=30 hidden=1 color=ffffe2b0")));
  var p=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_TEXTPOS engine=cs2_screen_v1 line=2 x0=28 y0=43 x1=306 y1=74 size=28 n=20 token=4294967295")));
  var page=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_PAGE engine=cs2 line=2 same=1 token=4294967295")));
  var hide=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_DIALOG engine=cs2 visible=0")));
  var show=Json.Deserialize<Dictionary<string,object>>(Json.Serialize(EngineInfo("ToMe_DIALOG engine=cs2 visible=1")));
  return Convert.ToString(layout["engine"])=="cs2_screen_v2"&&Convert.ToString(layout["color"])=="#b0e2ff"&&Convert.ToBoolean(layout["replacementRequested"])&&Convert.ToInt64(layout["y1"])==190&&Convert.ToString(p["type"])=="hookTextPos"&&Convert.ToInt64(p["token"])==4294967295L&&Convert.ToInt64(p["x1"])==306&&Convert.ToString(page["type"])=="hookPage"&&Convert.ToBoolean(page["same"])&&!Convert.ToBoolean(hide["visible"])&&Convert.ToBoolean(show["visible"])&&EngineInfo("ToMe_TEXTPOS_DUMP engine=cs2 line=1 record=1234")==null;
 }
 public static int Main(string[] args){
  Console.OutputEncoding=new System.Text.UTF8Encoding(false);Console.InputEncoding=new System.Text.UTF8Encoding(false);
  if(args.Length==1&&args[0]=="--self-test"){if(!EngineInfoSelfTest())throw new Exception("Engine telemetry protocol mismatch");if(Marshal.SizeOf(typeof(ThreadParam))!=32||Marshal.OffsetOf(typeof(ThreadParam),"addr").ToInt32()!=8)throw new Exception("LunaHook ABI mismatch");Console.WriteLine("PASS LunaHook C ABI: ThreadParam 32 bytes, uint64 aligned at 8, cdecl callbacks; engine position/page/visibility protocol; no game attached");return 0;}
  if(args.Length==1&&args[0]=="--source-frame-self-test"){if(!HookSourceFrames.SelfTest())return 3;Console.WriteLine("PASS complete source frames, fragmented frames, repeated callbacks and intentional repetition");return 0;}
  if(args.Length==1&&args[0]=="--island-policy-self-test"){
   ThreadParam t;string code="EXHSXF@3AF0:ISLAND.exe";
   if(!TryIslandThread(true,123,0x503af0,code,out t)||t.processId!=123||t.addr!=0x503af0||t.ctx!=0||t.ctx2!=1)throw new Exception("ISLAND scenario role pre-arm mismatch");
   if(TryIslandThread(false,123,0x503af0,code,out t)||TryIslandThread(true,123,0x503af1,code,out t)||TryIslandThread(true,123,0x503af0,"HS@other",out t))throw new Exception("Unverified ISLAND stream was pre-armed");
   if(!InitialReplacement(new[]{"1","2","ISLAND","3"})||InitialReplacement(new[]{"1","2","ISLAND","3","--read-only"})||!InitialReplacement(new[]{"1","2","ISLAND","3","--official-embed"}))throw new Exception("Initial replacement mode mismatch");
   Console.WriteLine("PASS ISLAND pre-arm policy: exact adapter, scenario role, fresh process, read-only and initial replacement before injection; no game attached");return 0;
  }
  IntPtr module=IntPtr.Zero;
  try{
   string folder=AppDomain.CurrentDomain.BaseDirectory,root=Path.GetDirectoryName(Under("runtime",args.Length==4&&String.Equals(args[2],"euphoriaHD",StringComparison.OrdinalIgnoreCase)?"hook":"hook-readonly","x"));KnownIsland=IsSupportedIsland(args);if(KnownIsland&&Directory.Exists(Under("runtime","hook-island")))root=Under("runtime","hook-island");if(IsSupportedSteinsGate(args)&&Directory.Exists(Under("runtime","hook-mages")))root=Under("runtime","hook-mages");OfficialRuntime=String.Equals(Path.GetFileName(root),"hook-readonly",StringComparison.OrdinalIgnoreCase);module=Probe(root);
   if(args.Length==1&&args[0]=="--probe"){Emit(new{type="probe",available=true,exports=Exports.Length});return 0;}
   if(args.Length!=4&&!(args.Length==5&&(args[4]=="--read-only"||args[4]=="--official-embed")))throw new Exception("Expected explicitly bound game PID, window, process name and start time");ReplacementEnabled=InitialReplacement(args);Pid=UInt32.Parse(args[0]);HookTarget.Validate(Pid,args[1],args[2],args[3]);GameWindow=new IntPtr(Int64.Parse(args[1]));ProcessStarted=args[3];BoundProcess=args[2];if(KnownIsland)Emit(new{type="hookEngineFeature",framework="cs2"});WaitHook=new WaitRenderHook(Pid,args[1],BoundProcess,ProcessStarted,Emit);
   try{var saved=Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Under("cache","hook-session.json")));if(Convert.ToUInt32(saved["pid"])==Pid&&Convert.ToString(saved["started"])==ProcessStarted)Resume=saved;}catch{}
   if(KnownIsland&&Resume!=null&&(Convert.ToString(Resume["name"])!="EmbedToMeCS2_DrawPreserve"||Convert.ToString(Resume["addr"])!="503af0"||Convert.ToString(Resume["ctx"])!="0"||Convert.ToString(Resume["ctx2"])!="1"))Resume=null;
   if(MagesAddress!=0&&Resume!=null&&Convert.ToString(Resume["name"] )!="EmbedMAGES_SteinsGate")Resume=null;
   IntPtr process=OpenProcess(0x1000,false,Pid);if(process==IntPtr.Zero)throw new Exception("无法读取绑定游戏的位数");bool wow;try{if(!IsWow64Process(process,out wow))throw new Exception("无法识别游戏位数");}finally{CloseHandle(process);}string bit=Environment.Is64BitOperatingSystem&&!wow?"64":"32";
   string hook=Path.Combine(root,"LunaHook"+bit+".dll"),loader=Path.Combine(folder,"HookInjector"+bit+".exe");if(!File.Exists(hook)||!File.Exists(loader))throw new Exception("缺少当前游戏所需的 LunaHook"+bit+".dll 或注入组件");
   try{string diagnostic=Under("logs","hook-diagnostics.log");if(File.Exists(diagnostic)){string archived=Under("logs","hook-diagnostics-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff")+".log");File.Move(diagnostic,archived);}}catch{}Diagnostic("runtime "+root);
   ProcessEvent connected=OnConnect,disconnected=OnDisconnect;CreateEvent create=OnCreate;DestroyEvent destroy=OnDestroy;OutputEvent output=OnOutput;InfoEvent info=(t,s)=>{Diagnostic("info "+t+" "+s);if(t==4&&(s??"").IndexOf("unity",StringComparison.OrdinalIgnoreCase)>=0)UseUnityFont();var match=System.Text.RegularExpressions.Regex.Match(s??"",@"(?:Euphoria474_DRAW skip|ToMeSG_EMBED cleared) #(\d+)");if(match.Success)Emit(new{type="hookRender",count=Int64.Parse(match.Groups[1].Value),at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()});
    // Where the game draws the current line, in the engine's own units (ToMeTextPos.h); ToMe maps it to the screen.
    var engineInfo=EngineInfo(s);if(engineInfo!=null)Emit(engineInfo);};InsertEvent insert=OnInsert;EmbedEvent embed=OnEmbed;QueryEvent query=s=>IntPtr.Zero;GameEvent game=(i,t,v)=>{};Keep.AddRange(new Delegate[]{connected,disconnected,create,destroy,output,info,insert,embed,query,game});
   Luna_Settings(180,932,4000,4000,false);Luna_Start(connected,disconnected,create,destroy,output,info,insert,embed,query,game);Started=true;Luna_ConnectProcess(Pid);
   if(Luna_CheckIfNeedInject(Pid)){var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+hook+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};using(var child=Process.Start(start)){if(!child.WaitForExit(12000))throw new Exception("LunaHook 加载超时");if(child.ExitCode!=0)throw new Exception("LunaHook 加载失败："+child.StandardError.ReadToEnd().Trim());}}
   new Thread(Input){IsBackground=true}.Start();DateTime until=DateTime.UtcNow.AddSeconds(15);while(!Quit){if(!Connected&&DateTime.UtcNow>until)throw new Exception("LunaHook 未连接当前游戏");if(WaitHook!=null)WaitHook.Tick();Heartbeat();Thread.Sleep(40);}return 0;
  }catch(Exception e){Emit(new{type="hookError",hookActive=false,hookMessage=e.Message});return 1;}
  finally{if(WaitHook!=null)WaitHook.Dispose();if(Started){try{Deactivate();Luna_DetachProcess(Pid);}catch{}}GC.KeepAlive(Keep);/* Keep loaded native code alive until process exit: native worker callbacks may still be returning. */}
 }
}
