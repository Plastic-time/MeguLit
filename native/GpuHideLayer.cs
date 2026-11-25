// SPDX-License-Identifier: GPL-3.0-or-later
// Hide layer 4, the "fake GPU" (native/gpuhide, docs/hide-layers.md, owner 2026-11-14: MeguLit draws all game text).
// MeguLitGpu<bit>.dll is loaded into the bound game next to MeguLitFont<bit>.dll. It hooks the game's Direct3D 9 draws and
// GDI blits, learns which textured quads / blits are the glyphs of the dialogue line and where the text area is, and
// then leaves exactly those glyph draws out while a line is armed. No game data is ever changed: a left-out glyph is a
// draw call that is not made. The stream becomes hide-only only after the DLL reports a hit (like E578 / E667).
// C# 5 (the .NET Framework csc), compiled with HookBridge.cs (partial class).
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public static partial class HookBridge {
 static readonly object GpuGate=new object();static StreamWriter GpuCtlPipe;static bool GpuSent,GpuLoaded;static string GpuApis="";static string GpuStream="";
 /* Interface for the hide orchestrator (feat/hide-orchestrator). */
 /// <summary>APIs the layer hooked in this game ("d3d9", "gdi"); empty until the DLL reported in.</summary>
 public static string[] GpuCapabilities(){lock(GpuGate){return GpuLoaded&&GpuApis.Length>0?GpuApis.Split(','):new string[0];}}
 /// <summary>Hide the given line of the given stream from now on (60 s, renewed by every call). The DLL learns first and
 /// hides only after it found the line's glyphs; nothing is hidden when it is unsure.</summary>
 public static void GpuArm(string streamId,string line){if(HookTarget.ChineseText){GpuDisarm();return;}lock(GpuGate){GpuStream=streamId??"";GpuSent=true;}GpuSend("LINE "+System.Text.RegularExpressions.Regex.Replace(line??"",@"[\r\n  ]+"," "));}
 /// <summary>Stop hiding at once.</summary>
 public static void GpuDisarm(){
  lock(GpuGate){
   if(GpuSent||GpuLittlecheeseMode==2)GpuSend("OFF");
   GpuSent=false;
   if(GpuLittlecheeseMode==2)GpuLittlecheeseMode=1;
  }
 }
 /// <summary>Read-only: learn and report character rectangles, never hide.</summary>
 public static void GpuReadOnly(bool on){GpuSend(on?"MODE read":"MODE hide");}
 /// <summary>First hidden draw of a line: (stream, line number, glyph quads left out, characters of the line).</summary>
 public static event Action<string,int,int,int> GpuHit;
 static void GpuSend(string line){lock(GpuGate){if(GpuCtlPipe==null)return;try{GpuCtlPipe.WriteLine(line);}catch{GpuCtlPipe=null;}}}
 // The same streams the glyph hide (E667) serves: the selected stream without write-back, with replacement on or probing.
 static bool GpuWanted(){lock(Gate){Candidate c;bool blank=GlyphMode=="blank";return !HookTarget.ChineseText&&Enabled&&(ReplacementEnabled||ProbeWanted||blank)&&Selected!=""&&Candidates.TryGetValue(Selected,out c)&&(c.gdiProbe||RememberedHide(c)||blank&&GdiProbeable(c)||GlyphMode=="dot"&&GlyphAll);}} /* 2026-11-15 (沙耶の唄 with in-place drawing on: nothing was hidden): 文字显示 in place sends glyph mode blank, which means the line must vanish;
    a game whose glyphs the font layer cannot blank (rasterised once and reused) is hidden here instead, also without replacement or probe. */ /* text-arch: in ①'s dot mode (compositor) the GDI probe is never switched on, the stream is still the dialogue */
 static int GpuWantLog=-1;static string GpuPageLog="";static volatile bool GpuPageOn;
 static void GpuLine(string text){bool w=GpuWanted();if((w?1:0)!=GpuWantLog){GpuWantLog=w?1:0;string why;lock(Gate){Candidate c;Candidates.TryGetValue(Selected??"",out c);why="enabled="+Enabled+" replace="+ReplacementEnabled+" probe="+ProbeWanted+" mode="+GlyphMode+" gdiProbe="+(c!=null&&c.gdiProbe)+" embed="+(c!=null&&c.embed)+" probeable="+(c!=null&&GdiProbeable(c));}Diagnostic("gpu hide wanted="+w+" ("+why+")");}if(w){string s;lock(Gate){s=Selected;}GpuArm(s,text);}else GpuDisarm();}
 /* 2026-11-15 (user: 保存了设置的游戏从开游戏开始就绑定，第一句就替换): the glyph height and target size a run learned are kept per game
    (cache/gpu-hide/<exe hash>.txt) and handed to the DLL at connect, so the next run hides from its first line. */
 static string GpuCalibrationFile(){string exe=HookTarget.ExePath??"";if(exe=="")return "";uint h=2166136261;foreach(char ch in exe.ToLowerInvariant()){h^=ch;h*=16777619;}return Under("cache","gpu-hide",h.ToString("x8")+".txt");}
 static void GpuCalibrationSave(string v){DiskLater(()=>GpuCalibrationSaveNow(v));}
 static void GpuCalibrationSaveNow(string v){try{string f=GpuCalibrationFile();if(f!=""&&File.Exists(f)&&File.ReadAllText(f).Trim()==v+" b")return;if(f!=""&&!(File.Exists(f)&&File.ReadAllText(f).Trim()==v)){File.WriteAllText(f,v);Diagnostic("gpu hide calibration saved "+v);}}catch{}}
 static string GpuCalibrationLoad(){try{string f=GpuCalibrationFile();if(f==""||!File.Exists(f))return "";string v=File.ReadAllText(f).Trim();return System.Text.RegularExpressions.Regex.IsMatch(v,@"^[0-9.]{1,6} \d{2,5} \d{2,5}( b)?$")?v:"";}catch{return "";}}
 // This renderer can leave only the verified dialogue call's pixels out before the line is flushed.
 static bool GpuLittlecheeseReady;
 static int GpuLittlecheeseMode=-1;
 // These are the stock per-character hooks for the verified dialogue call.
 static bool LittlecheeseDialogue(Candidate c){
  if(c==null||c.tp.ctx2!=0)return false;
  string code=c.code??"";
  return c.tp.ctx==0x31221&&c.name=="littlecheese"&&code.StartsWith("HAX-8@1DA3C:",StringComparison.OrdinalIgnoreCase)||
   c.tp.ctx==0x1db20&&c.name=="Ruf"&&code.StartsWith("HA-C@17C78:",StringComparison.OrdinalIgnoreCase);
 }
 static bool GpuLittlecheeseSelected(){
  lock(Gate){
   Candidate c;
   return GpuLittlecheeseReady&&Enabled&&Candidates.TryGetValue(Selected,out c)&&LittlecheeseDialogue(c);
  }
 }
 static void SyncGpuLittlecheese(){
  lock(Gate){
   if(!GpuLittlecheeseReady)return;
   int mode=!GpuLittlecheeseSelected()?0:!ReplacementEnabled||SkipHeld||HookTarget.ChineseText?1:2;
   if(mode!=0)GlyphFontOff();
   lock(GpuGate){
    if(GpuCtlPipe==null||mode==GpuLittlecheeseMode)return;
    GpuSend("KUROKIN "+mode);
    if(GpuCtlPipe!=null)GpuLittlecheeseMode=mode;
   }
  }
 }
 static bool GpuLittlecheeseLine(string text){
  if(!GpuLittlecheeseSelected())return false;
  GlyphFontOff();
  SyncGpuLittlecheese();
  if(!SkipHeld&&!HookTarget.ChineseText)GpuLine(text);
  else GpuDisarm();
  return true;
 }
 static void GpuReport(string s){
  /* page model (GlyphQuads.h): the whole page, every line with its places; core/overlay-placement.cjs page() */
  if(s.StartsWith("ToMe_PAGE ",StringComparison.Ordinal)){if(!GpuPageOn&&s.IndexOf('\t')>0){GpuPageOn=true;Diagnostic("gpu page model on");}Emit(new{type="hookGpuPage",line=s});{string head=System.Text.RegularExpressions.Regex.Replace(s.Substring(0,Math.Min(s.Length,170)),@" t=\d+","");/* the send tick changes with every message: not part of what is worth a log line */if(GpuPageLog!=head){GpuPageLog=head;Diagnostic("gpu page "+GpuPageLog.Replace("	"," | "));}}return;}
  if(s.StartsWith("ToMe_CHARS ",StringComparison.Ordinal)){Emit(new{type="hookChars",line=s});Diagnostic("gpu chars "+(s.Length>90?s.Substring(0,90):s));return;}
  // glyph trace (GlyphTrace.h): where the GetGlyphOutline glyphs of the line were drawn; core/gpu-glyph-pos.cjs reads it
  if(s.StartsWith("ToMe_GLYPHPOS ",StringComparison.Ordinal)){Emit(new{type="hookGlyphPos",line=s});return;}
  // glyph trace colour (GlyphTrace.h LineColor): what the line's glyphs are painted with, texel tint times vertex colour
  if(s.StartsWith("ToMe_GLYPHCOL ",StringComparison.Ordinal)){var gc=System.Text.RegularExpressions.Regex.Match(s,@"^ToMe_GLYPHCOL line=(\d{1,9}) rgb=([0-9a-f]{6}) a=([0-9a-f]{2}) n=(\d{1,4}) of=(\d{1,4})$");if(gc.Success)Emit(new{type="hookGlyphColor",seq=Int64.Parse(gc.Groups[1].Value),color="#"+gc.Groups[2].Value,alpha=Convert.ToInt32(gc.Groups[3].Value,16),src="gpu",n=Int32.Parse(gc.Groups[4].Value),of=Int32.Parse(gc.Groups[5].Value)});return;}
  if(!s.StartsWith("ToMe_GPUHIDE ",StringComparison.Ordinal))return;s=s.Substring(13);Diagnostic("gpu hide "+s);
  /* page model: this engine draws a glyph for every blank; kept with the calibration so the next run knows from its first line */
  if(s=="status littlecheese dialogue"){lock(Gate){GpuLittlecheeseReady=true;}SyncGpuLittlecheese();return;}
  var blanks=System.Text.RegularExpressions.Regex.Match(s,@"^blanks gh=([0-9.]+) rt=(\d+)x(\d+)");if(blanks.Success){GpuCalibrationSave(blanks.Groups[1].Value+" "+blanks.Groups[2].Value+" "+blanks.Groups[3].Value+" b");return;}
  var ready=System.Text.RegularExpressions.Regex.Match(s,@"^ready version=(\d{1,4}) apis=([a-z0-9,]{1,64})");if(ready.Success){lock(GpuGate){GpuLoaded=GpuCanaryOff()=="";GpuApis=ready.Groups[2].Value;}Emit(new{type="hookGpuHide",state="ready",version=Int32.Parse(ready.Groups[1].Value),apis=ready.Groups[2].Value});return;}
  var learn=System.Text.RegularExpressions.Regex.Match(s,@"^learn seq=(\d+) area=(-?\d+),(-?\d+),(\d+),(\d+) atlas=(\d+)x(\d+) glyphs=(\d+) chars=(\d+)");
  if(learn.Success){var cal=System.Text.RegularExpressions.Regex.Match(s,@" gh=([0-9.]+) rt=(\d+)x(\d+)");if(cal.Success)GpuCalibrationSave(cal.Groups[1].Value+" "+cal.Groups[2].Value+" "+cal.Groups[3].Value);Emit(new{type="hookGpuHide",state="learn",line=Int32.Parse(learn.Groups[1].Value),area=new[]{Int32.Parse(learn.Groups[2].Value),Int32.Parse(learn.Groups[3].Value),Int32.Parse(learn.Groups[4].Value),Int32.Parse(learn.Groups[5].Value)},glyphs=Int32.Parse(learn.Groups[8].Value),chars=Int32.Parse(learn.Groups[9].Value)});return;}
  var hit=System.Text.RegularExpressions.Regex.Match(s,@"^hit seq=(\d+) quads=(\d+) chars=(\d+)");
  if(hit.Success){int seq=Int32.Parse(hit.Groups[1].Value),quads=Int32.Parse(hit.Groups[2].Value),chars=Int32.Parse(hit.Groups[3].Value);string stream;lock(GpuGate){stream=GpuStream;}
   bool fresh=false;lock(Gate){Candidate c;if(Selected!=""&&Selected==stream&&Candidates.TryGetValue(Selected,out c)&&c.gdiProbe&&!c.embed)fresh=true;}
   if(fresh){GdiHideHit("gpu "+s.Substring(4));Status("通用绘制层隐藏已生效：游戏原文由 MeguLit 接管显示");}
   Emit(new{type="hookGpuHide",state="hit",line=seq,quads=quads,chars=chars});var h=GpuHit;if(h!=null)try{h(stream,seq,quads,chars);}catch{}return;}
 }
 /* Crash canary (owner 2026-11-14: layer 4 must never crash a game). Per game build (data/gpu-hide/<exe>-<size>.json, the
    key of the stream memory): armed while the DLL is loaded into a running game; the bridge waits for the game to end.
    An exit by an exception in play (system NTSTATUS error codes 0xC0000000-0xC0FFFFFF: access violation, stack overflow, ...; not 0xFFFFFFFF = a forced kill;
    not one in the game's close flow) turns the layer off for that game ("off", with the reason and the bridge build); any other exit
    clears the arm. Turning it on again is the user's call (GpuCanaryReset); a record from another build is tried once more. */
 [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
 static string GpuCanaryFile(){string m=MemoryPath();if(m=="")return "";return Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(m)),"gpu-hide",Path.GetFileName(m));}
 static System.Collections.Generic.Dictionary<string,object> GpuCanaryRead(string f){try{if(f!=""&&File.Exists(f))return Json.Deserialize<System.Collections.Generic.Dictionary<string,object>>(File.ReadAllText(f));}catch{}return new System.Collections.Generic.Dictionary<string,object>();}
 static void GpuCanaryWrite(string f,System.Collections.Generic.Dictionary<string,object> d){try{if(f=="")return;Directory.CreateDirectory(Path.GetDirectoryName(f));File.WriteAllText(f+".tmp",Json.Serialize(d));if(File.Exists(f))File.Delete(f);File.Move(f+".tmp",f);}catch{}}
 /// <summary>Why the layer is off for the bound game ("" = allowed).</summary>
 public static string GpuCanaryOff(){return GpuCanaryOffFile(GpuCanaryFile());}
 /// <summary>The user turns the layer on again for the bound game.</summary>
 public static void GpuCanaryReset(){string f=GpuCanaryFile();if(f!=""&&File.Exists(f))try{File.Delete(f);}catch{}}
 /* #338 (STEINS;GATE 0, 2026-11-16): the game ended with 0xCFFFFFFF (facility 0xFFF: a status the game or Steam set, not a
    Windows exception) and the layer stayed off, so 隐藏对话 never worked again. A crash is a system exception code
    (facility below 0x100: 0xC0000005, 0xC00000FD, 0xC06D007E ...); a record turned off by any other code is ignored. */
 static bool GpuCanaryCrash(uint code){return code>=0xC0000000u&&code<=0xC0FFFFFFu;}
 /* 2026-11-19 (千恋＊万花, user test copy): the user closed the game, the close ended in 0xC000041D, and the canary turned
    layer 4 off for this game for good. Two rules, decided here only:
    - A crash code counts only for an exit in play. The crash witness (native/shared/MeguLitCrashWitness.h) writes whether the
      game still showed a window when the exception went unhandled and whether the process was already in ExitProcess; an
      exception in the close flow (no window shown, or after the exit note) leaves the layer on. Without a witness report a
      crash code still counts.
    - An off record belongs to the bridge build that wrote it (BridgeBuild, as the learned glyph records): a record from
      another build, or one written before the stamp existed, is tried once more; a crash in play under this build turns
      the layer off again with this build's stamp. GpuCanaryRetryOtherBuild = false keeps every off record. */
 const bool GpuCanaryRetryOtherBuild=true;
 static string GpuCanaryOffReason(System.Collections.Generic.Dictionary<string,object> d,string build){object v;if(!(d.TryGetValue("off",out v)&&Convert.ToBoolean(v)))return "";
  object x;if(d.TryGetValue("exit",out x)){try{if(!GpuCanaryCrash((uint)Convert.ToInt64(x)))return "";}catch{}}
  if(GpuCanaryRetryOtherBuild&&!LearnedHere(d,build))return "";
  return d.ContainsKey("reason")?Convert.ToString(d["reason"]):"off";}
 static string GpuCanaryOffFile(string f){return GpuCanaryOffReason(GpuCanaryRead(f),BridgeBuild());}
 // Arms the file for a run (false = the layer is off for this game). Pure file logic, self-tested.
 static bool GpuCanaryArmFile(string f,long pid){if(f=="")return true;var d=GpuCanaryRead(f);object v;if(GpuCanaryOffReason(d,BridgeBuild())!="")return false;if(pid>4&&d.TryGetValue("vanish",out v)&&Convert.ToInt32(v)>=QuickVanishLimit){Diagnostic("gpu hide canary: safe mode (the game vanished right after start "+v+" times); layer 4 stays out");return false;}
  if(d.TryGetValue("off",out v)&&Convert.ToBoolean(v)){string old=d.ContainsKey("reason")?Convert.ToString(d["reason"]):"off";d.Remove("off");d.Remove("reason");d["retried"]=old;
   Diagnostic("gpu hide canary: the record that turned layer 4 off is not this build's ("+old+"); trying the layer once more");}
  if(d.TryGetValue("armed",out v)&&Convert.ToBoolean(v)){/* #483 (2026-11-20, a Steam game started through Steam or picked up by its window: the bridge never sees its exit code, so a crash in play never reached the canary and the game kept crashing ~30 s in). The previous run's crash witness report decides: an unhandled exception in play turns the layer off as an exit code would; no report or the close flow keeps it on. */
   string why=GpuCanaryUnseenCrash(d);if(why!=""){d["armed"]=false;d["off"]=true;d["bridge"]=BridgeBuild();d["reason"]=why;GpuCanaryWrite(f,d);Diagnostic("gpu hide canary: "+why+"; layer 4 is off for this game from now on");return false;}
   Diagnostic("gpu hide canary: the previous run was not seen to its end (bridge stopped first); no crash report for it, keeping the layer on");}
  d["armed"]=true;d["pid"]=pid;d["at"]=DateTime.UtcNow.ToString("o");GpuCanaryWrite(f,d);return true;}
 /* the crash witness report of the previous armed run (pid in the record), read without moving it */
 static string GpuCanaryUnseenCrash(System.Collections.Generic.Dictionary<string,object> d){try{object pv;if(!d.TryGetValue("pid",out pv))return "";long pid=Convert.ToInt64(pv);if(pid<=4)return "";
  string dir=Path.Combine(Path.GetTempPath(),"MeguLit-crash");if(!Directory.Exists(dir))return "";string[] found=Directory.GetFiles(dir,"*-"+pid+".txt");if(found.Length==0)return "";
  var w=CrashWitnessRead(File.ReadAllLines(found[0]));if(w.Closing||w.At.IndexOf("UNHANDLED",StringComparison.Ordinal)<0)return "";
  return "the previous run (pid "+pid+", exit not seen) ended in an unhandled exception in play while layer 4 was loaded; witness: "+w.At;}catch{return "";}}
 // The game ended with this exit code: an exception code in play turns the layer off for the game, anything else clears the arm.
 static void GpuCanaryExitFile(string f,uint code,CrashWitnessInfo w=null){if(f=="")return;var e=GpuCanaryRead(f);e["armed"]=false;e["exit"]=(long)code;
  string at=w!=null&&w.At!=""?"; witness: "+w.At:"";
  if(GpuCanaryCrash(code)&&w!=null&&w.Closing){e["closing"]="exception 0x"+code.ToString("X8")+" in the close flow ("+w.State+")";Diagnostic("gpu hide canary: game exited with exception 0x"+code.ToString("X8")+" in its close flow ("+w.State+at+"); not a crash in play, layer 4 stays on");}
  else if(GpuCanaryCrash(code)){e["off"]=true;e["bridge"]=BridgeBuild();e.Remove("closing");e["reason"]="game exited with exception 0x"+code.ToString("X8")+" while layer 4 was loaded ("+DateTime.UtcNow.ToString("o")+")"+at;Diagnostic("gpu hide canary: "+e["reason"]+"; layer 4 is off for this game from now on");}
  GpuCanaryWrite(f,e);}
 // native/shared/MeguLitCrashWitness.h (armed by the hook DLL in every game) leaves %TEMP%\MeguLit-crash\<exe>-<pid>.txt
 // and, for an unhandled exception, a .dmp next to it (2026-11-19: 千恋＊万花 ended with 0xC000041D and nothing on the system
 // said where). After a crash exit both move to logs\crash (newest 6 dumps kept) and the fault goes to the diagnostics;
 // after a clean exit the report is deleted.
 sealed class CrashWitnessInfo{public string At="";public string State="";public bool Closing;}
 /* What the report says about the end: the fault line (UNHANDLED, else the last first-chance), the state line, and whether
    it was the close flow (the exit note came first, or no window was shown). Pure, self-tested. */
 static CrashWitnessInfo CrashWitnessRead(string[] lines){var w=new CrashWitnessInfo();string last="";bool exiting=false,seen=false;
  foreach(var l in lines){if(l.StartsWith("exit: "))exiting=true;else if(l.StartsWith("UNHANDLED ")){w.At=l;seen=true;}else if(l.StartsWith("first-chance "))last=l;
   else if(l.StartsWith(" state: ")&&seen&&w.State==""){w.State=l.Substring(8).Trim();if(w.State.IndexOf("visible windows=0",StringComparison.Ordinal)>=0||w.State.IndexOf("exiting",StringComparison.Ordinal)>=0)w.Closing=true;}}
  if(w.At=="")w.At=last;
  if(exiting){w.Closing=true;if(w.State=="")w.State="process exiting";}
  return w;}
 static readonly object CrashWitnessGate=new object();
 /* the disconnect and the canary's wait both ask when the game ends; the first one files the report, the second gets the same answer */
 static uint CrashWitnessPid;static CrashWitnessInfo CrashWitnessLast;
 static CrashWitnessInfo CrashWitnessCollect(uint pid,uint code){lock(CrashWitnessGate){if(pid!=0&&pid==CrashWitnessPid)return CrashWitnessLast;CrashWitnessPid=pid;CrashWitnessLast=CrashWitnessFile(pid,code);return CrashWitnessLast;}}
 static CrashWitnessInfo CrashWitnessFile(uint pid,uint code){{try{
  string dir=Path.Combine(Path.GetTempPath(),"MeguLit-crash");if(!Directory.Exists(dir))return null;
  foreach(var old in new DirectoryInfo(dir).GetFiles())if((DateTime.UtcNow-old.LastWriteTimeUtc).TotalDays>7)try{old.Delete();}catch{}
  string[] found=Directory.GetFiles(dir,"*-"+pid+".txt");
  if(!GpuCanaryCrash(code)){foreach(var t in found){try{File.Delete(t);File.Delete(Path.ChangeExtension(t,".dmp"));}catch{}}return null;}
  if(found.Length==0){Diagnostic("crash witness: no report for pid "+pid+" (exception 0x"+code.ToString("X8")+"; the hook DLL was not loaded or not armed)");return null;}
  string txt=found[0],dmp=Path.ChangeExtension(txt,".dmp"),dest=Under("logs","crash");Directory.CreateDirectory(dest);
  string[] lines=File.ReadAllLines(txt);var w=CrashWitnessRead(lines);
  string name=Path.GetFileNameWithoutExtension(txt)+"-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
  File.Move(txt,Path.Combine(dest,name+".txt"));if(File.Exists(dmp))File.Move(dmp,Path.Combine(dest,name+".dmp"));
  var dumps=new DirectoryInfo(dest).GetFiles("*.dmp");Array.Sort(dumps,(a,b)=>b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));for(int i=6;i<dumps.Length;i++)try{dumps[i].Delete();}catch{}
  Diagnostic("crash witness: game exited with exception 0x"+code.ToString("X8")+(w.Closing?" in its close flow":" in play")+"; report logs/crash/"+name+".txt"+(File.Exists(Path.Combine(dest,name+".dmp"))?" with a dump":""));
  if(w.At!="")Diagnostic("crash witness: "+w.At);if(w.State!="")Diagnostic("crash witness: state "+w.State);
  return w;}catch(Exception e){Diagnostic("crash witness: "+e.Message);return null;}}}
 // Returns false when the layer must not load into this game.
 static bool GpuCanaryArm(){string f=GpuCanaryFile();if(f=="")return true;
  if(!GpuCanaryArmFile(f,(long)Pid)){string why=GpuCanaryOffFile(f);Diagnostic("gpu hide off for this game (canary): "+why);Emit(new{type="hookGpuHide",state="off",reason=why});return false;}
  new Thread(()=>{IntPtr h=OpenProcess(0x00100000|0x1000,false,Pid);if(h==IntPtr.Zero)return;try{WaitForSingleObject(h,0xFFFFFFFF);uint code;if(GetExitCodeProcess(h,out code))GpuCanaryExitFile(f,code,CrashWitnessCollect(Pid,code));}finally{CloseHandle(h);}}){IsBackground=true}.Start();
  return true;}
 /// <summary>HookBridge --self-test: arm, crash, refuse, reset, clean exit, close flow, records of other builds.</summary>
 public static bool GpuCanarySelfTest(){string dir=Path.Combine(Path.GetTempPath(),"megulit-gpu-canary-"+Guid.NewGuid().ToString("N"));string f=Path.Combine(dir,"game.exe-1.json");
  try{if(!GpuCanaryArmFile(f,1)||GpuCanaryOffFile(f)!="")return false;GpuCanaryExitFile(f,0);if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,2))return false;
   GpuCanaryExitFile(f,1);if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,2))return false; /* an ordinary non-zero exit is not a crash */
   GpuCanaryExitFile(f,0xFFFFFFFFu);if(GpuCanaryOffFile(f)!="")return false; /* nor a forced kill (TerminateProcess -1) */
   if(!GpuCanaryArmFile(f,2))return false;GpuCanaryExitFile(f,0xCFFFFFFFu);if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,2))return false; /* nor a status outside the system facilities (#338) */
   /* the user closes the game and the close ends in an exception: the layer stays on (千恋＊万花, 2026-11-19) */
   var closing=CrashWitnessRead(new[]{"armed 2026-11-19T05:54:08Z pid=1 x86","UNHANDLED 0xC0000005 tid=1 t=+1ms at game.exe+0x10 (write 0x00000000)"," stack: | user32.dll+0x1"," state: visible windows=0"," dump written"});
   if(!closing.Closing||closing.At.IndexOf("game.exe+0x10",StringComparison.Ordinal)<0)return false;
   GpuCanaryExitFile(f,0xC000041Du,closing);if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,2))return false;
   var exiting=CrashWitnessRead(new[]{"armed x","exit: process exiting (ExitProcess)","first-chance 0xC0000005 tid=1 t=+9ms at game.exe+0x20 (read 0x00000000)"});
   if(!exiting.Closing||exiting.At.IndexOf("game.exe+0x20",StringComparison.Ordinal)<0)return false;
   var playing=CrashWitnessRead(new[]{"armed x","first-chance 0xC0000005 tid=1 t=+5ms at game.exe+0x30 (write 0x00000000)","UNHANDLED 0xC0000005 tid=1 t=+5ms at game.exe+0x30 (write 0x00000000)"," stack:"," state: visible windows=1"});
   if(playing.Closing||CrashWitnessRead(new[]{"armed x"}).Closing)return false;
   /* a crash in play turns the layer off, stamped with this build */
   if(!GpuCanaryArmFile(f,3))return false;GpuCanaryExitFile(f,0xC000041Du,playing);if(GpuCanaryOffFile(f).IndexOf("0xC000041D",StringComparison.Ordinal)<0||GpuCanaryArmFile(f,4))return false;
   if(Convert.ToString(GpuCanaryRead(f)["bridge"])!=BridgeBuild())return false;
   File.Delete(f);if(!GpuCanaryArmFile(f,3))return false;GpuCanaryExitFile(f,0xC0000005u);if(GpuCanaryOffFile(f).IndexOf("0xC0000005",StringComparison.Ordinal)<0||GpuCanaryArmFile(f,4))return false; /* no witness: a crash code still counts */
   /* an off record from another build, or one without the stamp (written before it existed), is tried once more; a crash
      in play under this build turns it off again */
   foreach(var other in new object[]{"0123456789abcdef0123456789abcdef",null}){var d=new System.Collections.Generic.Dictionary<string,object>{{"off",true},{"exit",3221226525L},{"reason","game exited with exception 0xC000041D while layer 4 was loaded"}};if(other!=null)d["bridge"]=other;GpuCanaryWrite(f,d);
    if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,5))return false;var after=GpuCanaryRead(f);if(after.ContainsKey("off")||!after.ContainsKey("retried"))return false;
    GpuCanaryExitFile(f,0);if(GpuCanaryOffFile(f)!=""||!GpuCanaryArmFile(f,6))return false; /* a clean run: stays on */
    GpuCanaryExitFile(f,0xC0000005u,playing);if(GpuCanaryOffFile(f)==""||GpuCanaryArmFile(f,7))return false;}
   File.Delete(f);return GpuCanaryArmFile(f,5);}catch{return false;}finally{try{Directory.Delete(dir,true);}catch{}}}
 /* Text marks (docs/text-architecture.md, "Marks"; owner 2026-11-14): the game draws its own line as a row of 「・」 and
    the capture compositor places MeguLit's text on the marks. Off unless {"type":"textMarks","on":true} arrives on stdin
    or MEGULIT_TEXT_MARKS=1 is in HookBridge's environment. Write-back streams get the marks from OnEmbed
    (EmbedTextPolicy.Mark: same count, constructs kept); per-character hooks that read the character from an argument
    (BRUNS push_back) mark it in the hook DLL while Local\MeguLitMarks-<pid> is set (MeguLitMarks.h). Every marked line is
    reported as {"type":"hookTextMarks","state":"line",...}; the first mark the hook DLL writes per line confirms a
    per-character stream (state "hit") and makes it hide-only, like the GDI hide. The crash canary (GpuCanary*) covers it. */
 static bool MarksMode; static IntPtr MarksEvent;
 [System.Runtime.InteropServices.DllImport("kernel32.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode)] static extern IntPtr CreateEventW(IntPtr sa,bool manual,bool initial,string name);
 [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern bool SetEvent(IntPtr h);
 [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern bool ResetEvent(IntPtr h);
 public static void SetMarks(bool on){
  if(on&&GpuCanaryOff()!=""){Diagnostic("text marks refused: crash canary ("+GpuCanaryOff()+")");on=false;}
  MarksMode=on;if(on){MarksSince=(long)GetTickCount64();BeatSeen=false;MarksPaused=false;}if(MarksEvent==IntPtr.Zero)MarksEvent=CreateEventW(IntPtr.Zero,true,false,"Local\\MeguLitMarks-"+Pid);
  if(MarksEvent!=IntPtr.Zero){if(on)SetEvent(MarksEvent);else ResetEvent(MarksEvent);}
  Diagnostic("text marks "+(on?"on":"off"));Emit(new{type="hookTextMarks",state=on?"on":"off",mark="middle-dot"});Probe();}
 /* Owner rule "the player never sees marks" (docs/text-architecture.md): the write-back marks only while MeguLit's capture
    compositor presents the game: heartbeat Local\MeguLitCompositorBeat-<game pid> (magic 'MGCB', version 1, presenting,
    tickMs = GetTickCount64). Before any beat a 20 s grace from SetMarks(true); after one was seen, presenting == 1 and
    the tick at most 1000 ms old. Otherwise the line gets the ordinary hide (blanks) and hookTextMarks "paused" is sent. */
 static System.IO.MemoryMappedFiles.MemoryMappedViewAccessor BeatView;static long MarksSince;static bool BeatSeen,MarksPaused;
 [System.Runtime.InteropServices.DllImport("kernel32.dll")] static extern ulong GetTickCount64();
 static bool MarksLive(){
  ulong now=GetTickCount64();bool live;
  try{if(BeatView==null)BeatView=System.IO.MemoryMappedFiles.MemoryMappedFile.OpenExisting("Local\\MeguLitCompositorBeat-"+Pid,System.IO.MemoryMappedFiles.MemoryMappedFileRights.Read).CreateViewAccessor(0,32,System.IO.MemoryMappedFiles.MemoryMappedFileAccess.Read);}catch{}
  uint magic=0,version=0,presenting=0;ulong tick=0;
  try{if(BeatView!=null){magic=BeatView.ReadUInt32(0);version=BeatView.ReadUInt32(4);presenting=BeatView.ReadUInt32(12);tick=BeatView.ReadUInt64(16);}}catch{}
  if(magic==0x4243474D&&version==1&&tick!=0)BeatSeen=true;
  if(BeatSeen)live=magic==0x4243474D&&version==1&&presenting==1&&tick!=0&&now>=tick&&now-tick<=1000;else live=now-(ulong)MarksSince<=20000;
  if(!live&&!MarksPaused){MarksPaused=true;Diagnostic("text marks paused: compositor heartbeat stale");Emit(new{type="hookTextMarks",state="paused",mark="middle-dot"});}
  else if(live&&MarksPaused){MarksPaused=false;Diagnostic("text marks live");Emit(new{type="hookTextMarks",state="live",mark="middle-dot"});}
  return live;}
 static void MarksLine(string path,string text,string marked){int n=0;foreach(char c in marked)if(c=='\u30FB'||c=='\uFF65')n++;
  Emit(new{type="hookTextMarks",state="line",path=path,text=text,marks=n,mark="middle-dot"});}
 static void MarksHit(string info){bool fresh=false;lock(Gate){Candidate c;if(Selected!=""&&Candidates.TryGetValue(Selected,out c)&&c.gdiProbe&&!c.embed)fresh=true;}
  if(fresh){GdiHideHit("marks "+info);Status("文字标记已生效：游戏把对白画成「・」，由 MeguLit 接管显示");}
  Emit(new{type="hookTextMarks",state="hit",path="char",mark="middle-dot"});}
 static void GpuHide(string bit,string loader,string[] args){try{if(Environment.GetEnvironmentVariable("MEGULIT_TEXT_MARKS")=="1")SetMarks(true); /* marks do not need layer 4 */string dll=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"MeguLitGpu"+bit+".dll");if(!File.Exists(dll)){Diagnostic("gpu hide unavailable: "+Path.GetFileName(dll)+" missing");return;}
  if(!GpuCanaryArm())return;
  new Thread(()=>{while(!Quit){try{using(var pipe=new System.IO.Pipes.NamedPipeServerStream("MeguLitGpu-"+Pid,System.IO.Pipes.PipeDirection.In,1)){pipe.WaitForConnection();using(var reader=new StreamReader(pipe,new System.Text.UTF8Encoding(false))){string line;while((line=reader.ReadLine())!=null)GpuReport(line);}}}catch(Exception e){Diagnostic("gpu pipe "+e.Message);Thread.Sleep(1000);}}}){IsBackground=true}.Start();
  new Thread(()=>{while(!Quit){try{using(var pipe=new System.IO.Pipes.NamedPipeServerStream("MeguLitGpuCtl-"+Pid,System.IO.Pipes.PipeDirection.Out,1)){pipe.WaitForConnection();var w=new StreamWriter(pipe,new System.Text.UTF8Encoding(false)){AutoFlush=true,NewLine="\n"};lock(GpuGate){GpuCtlPipe=w;GpuSent=false;GpuLittlecheeseMode=-1;}SyncGpuLittlecheese();Diagnostic("gpu hide connected");{string cal=GpuCalibrationLoad();if(cal!=""){w.WriteLine("PRESET "+cal);Diagnostic("gpu hide preset "+cal+" (saved by an earlier run)");}}while(!Quit){lock(GpuGate){if(GpuCtlPipe!=w)break;}Thread.Sleep(500);}}}catch(Exception e){lock(GpuGate){GpuCtlPipe=null;}Diagnostic("gpu control "+e.Message);Thread.Sleep(1000);}}}){IsBackground=true}.Start();
  var start=new ProcessStartInfo(loader,Pid+" "+args[1]+" \""+args[2]+"\" "+args[3]+" \""+dll+"\""){UseShellExecute=false,CreateNoWindow=true,RedirectStandardError=true};using(var child=Process.Start(start)){if(!child.WaitForExit(12000)){Diagnostic("gpu hide load timed out");return;}Diagnostic(child.ExitCode==0?"gpu hide loaded":"gpu hide failed: "+child.StandardError.ReadToEnd().Trim());}}catch(Exception e){Diagnostic("gpu hide skipped: "+e.Message);}}
}
