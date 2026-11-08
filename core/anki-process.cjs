// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E215.4 (user): Anki has to be open for mining. MeguLit can find it, start it together with MeguLit, keep its window
// out of the taskbar, and close it again on exit. Only an Anki that MeguLit started is ever closed, and only through
// a normal WM_CLOSE to Anki's main window, so Anki saves its collection the normal way. Nothing is killed.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFile}=require('node:child_process');
const {Anki}=require('./anki.cjs');

function candidates(configured,env=process.env){
 const roots=[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs'),env.ProgramFiles,env['ProgramFiles(x86)'],env.ProgramW6432].filter(Boolean);
 // Anki 25.x installs the program itself under %LOCALAPPDATA%\AnkiProgramFiles\.venv (ankiw.exe has no console).
 const venv=env.LOCALAPPDATA?['ankiw.exe','anki.exe'].map(name=>path.join(env.LOCALAPPDATA,'AnkiProgramFiles','.venv','Scripts',name)):[];
 return [configured,...roots.map(folder=>path.join(folder,'Anki','anki.exe')),...venv].filter(Boolean);
}
// Cold detection (user: Anki installed outside C: was never found): when no default location has Anki, read where
// Windows says it was installed (uninstall entries and App Paths, per user and per machine), then other drives' usual
// folders. Read-only registry queries; a hit is remembered for the session.
let coldHit;
function coldCandidates(env=process.env){
 const B=String.fromCharCode(92);
 const out=[],reg=path.join(env.WINDIR||['C:','Windows'].join(B),'System32','reg.exe');
 const query=key=>{try{return require('node:child_process').execFileSync(reg,['query',key,'/s'],{encoding:'utf8',windowsHide:true,timeout:4000,maxBuffer:8<<20,stdio:['ignore','pipe','ignore']});}catch{return '';}};
 for(const root of [['HKCU','SOFTWARE'].join(B),['HKLM','SOFTWARE'].join(B),['HKLM','SOFTWARE','WOW6432Node'].join(B)]){
  for(const block of query(root+['','Microsoft','Windows','CurrentVersion','Uninstall'].join(B)).split(/\r?\n\r?\n/)){
   if(!/DisplayName\s+REG_SZ\s+Anki\b/i.test(block))continue;
   for(const m of block.matchAll(/(InstallLocation|DisplayIcon|UninstallString)\s+REG_(?:EXPAND_)?SZ\s+(.+)/gi)){let v=m[2].trim().replace(/,\d+$/,'').replace(/"/g,'');if(/\.exe$/i.test(v))v=path.dirname(v);out.push(path.join(v,'anki.exe'),path.join(v,'ankiw.exe'));}
  }
  const app=query(root+['','Microsoft','Windows','CurrentVersion','App Paths','anki.exe'].join(B)).match(/\(Default\)\s+REG_SZ\s+(.+)/i);if(app)out.push(app[1].trim().replace(/"/g,''));
 }
 for(const drive of 'CDEFGH')out.push(drive+[':','Anki','anki.exe'].join(B),drive+[':','Program Files','Anki','anki.exe'].join(B),drive+[':','Apps','Anki','anki.exe'].join(B));
 if(env.USERPROFILE)out.push(path.join(env.USERPROFILE,'scoop','apps','anki','current','anki.exe'));
 return out;
}
function find(configured,env=process.env,exists=file=>{try{return fs.statSync(file).isFile();}catch{return false;}}){
 for(const file of candidates(configured,env))if(exists(file))return file;
 if(coldHit&&exists(coldHit))return coldHit;
 for(const file of coldCandidates(env))if(exists(file))return coldHit=file;
 return '';
}
// AnkiConnect is an Anki add-on (code 2055492159). Without it MeguLit cannot add cards even when Anki is open.
function ankiConnectInstalled(env=process.env){const base=env.APPDATA&&path.join(env.APPDATA,'Anki2','addons21');if(!base)return null;try{return fs.readdirSync(base).some(name=>name==='2055492159'||/anki-?connect/i.test(name));}catch{return null;}}
// Anki's main window is a Qt window titled "Anki" or "<profile> - Anki"; the 25.x launcher runs Anki in a child
// process, so windows are matched by title and class rather than by the spawned PID.
const WINDOWS=`
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public static class MeguLitAnkiWindows{
 delegate bool Proc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")]static extern bool EnumWindows(Proc p,IntPtr l);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr h,int c);
 [DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr h,uint c);
 [DllImport("user32.dll")]static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 // E215.10: this helper is started hidden, and Windows turns a process's first ShowWindow into its STARTUPINFO
 // SW_HIDE, so "show" used to hide Anki. SetWindowPos(SWP_SHOWWINDOW) is not subject to that rule.
 [DllImport("user32.dll")]static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int ht,uint flags);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("kernel32.dll")]static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")]static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")]static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll")]static extern void SwitchToThisWindow(IntPtr h,bool alt);
 [DllImport("user32.dll")]static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);
 // Bring Anki's main window to the front (the Alt tap lets a background process take the foreground).
 public static bool Focus(){IntPtr found=IntPtr.Zero;EnumWindows((h,l)=>{if(GetWindow(h,4)!=IntPtr.Zero||!IsWindowVisible(h))return true;var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(c.ToString().StartsWith("Qt")&&(title=="Anki"||title.EndsWith(" - Anki"))){found=h;return false;}return true;},IntPtr.Zero);if(found==IntPtr.Zero)return false;SetWindowPos(found,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0040);keybd_event(0x12,0,0,UIntPtr.Zero);keybd_event(0x12,0,2,UIntPtr.Zero);if(!SetForegroundWindow(found)){uint pid;uint fg=GetWindowThreadProcessId(GetForegroundWindow(),out pid),me=GetCurrentThreadId();AttachThreadInput(me,fg,true);BringWindowToTop(found);SetForegroundWindow(found);AttachThreadInput(me,fg,false);if(GetForegroundWindow()!=found)SwitchToThisWindow(found,true);System.Threading.Thread.Sleep(150);}return GetForegroundWindow()==found;}
 public static int HidePids(int[] ids){var set=new System.Collections.Generic.HashSet<uint>();foreach(var i in ids)set.Add((uint)i);int k=0;EnumWindows((h,l)=>{if(!IsWindowVisible(h))return true;uint p;GetWindowThreadProcessId(h,out p);if(set.Contains(p)){ShowWindow(h,0);k++;}return true;},IntPtr.Zero);return k;}
 public static int Apply(string mode){if(mode=="hideall"){var pids=new System.Collections.Generic.HashSet<uint>();EnumWindows((h,l)=>{var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(c.ToString().StartsWith("Qt")&&(title=="Anki"||title.EndsWith(" - Anki"))){uint p;GetWindowThreadProcessId(h,out p);pids.Add(p);}return true;},IntPtr.Zero);int k=0;EnumWindows((h,l)=>{if(!IsWindowVisible(h))return true;uint p;GetWindowThreadProcessId(h,out p);if(pids.Contains(p)){ShowWindow(h,0);k++;}return true;},IntPtr.Zero);return k;}bool show=mode=="show",close=mode=="close";if(!show&&!close&&mode!="hide")return 0;int n=0;EnumWindows((h,l)=>{if(GetWindow(h,4)!=IntPtr.Zero)return true;if(!close&&IsWindowVisible(h)==show)return true;var t=new StringBuilder(256);GetWindowText(h,t,256);var c=new StringBuilder(128);GetClassName(h,c,128);string title=t.ToString();if(!c.ToString().StartsWith("Qt"))return true;if(title!="Anki"&&!title.EndsWith(" - Anki"))return true;if(close)PostMessage(h,0x0010,IntPtr.Zero,IntPtr.Zero);else if(show)SetWindowPos(h,IntPtr.Zero,0,0,0,0,0x0001|0x0002|0x0004|0x0010|0x0040);else ShowWindow(h,0);n++;return true;},IntPtr.Zero);return n;}
}
'@
$mode=[string]($args[0]);if($mode -like 'watch:*'){$until=[DateTime]::Now.AddMilliseconds([int]$mode.Substring(6));$ids=@();$n=0;while([DateTime]::Now -lt $until){if($n%10 -eq 0){$ids=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.Path -and $_.Path -like '*Anki*'}|ForEach-Object{$_.Id})};if($ids.Count){[void][MeguLitAnkiWindows]::HidePids([int[]]$ids)};[void][MeguLitAnkiWindows]::Apply('hideall');Start-Sleep -Milliseconds 30;$n++};0}elseif($mode -like 'keys:*'){[void][MeguLitAnkiWindows]::Apply('show');if([MeguLitAnkiWindows]::Focus()){Start-Sleep -Milliseconds 350;Add-Type -AssemblyName System.Windows.Forms;$k=$mode.Substring(5);if($k){[System.Windows.Forms.SendKeys]::SendWait($k)};1}else{0}}else{[MeguLitAnkiWindows]::Apply($mode)}`;
function windows(mode){
 return new Promise(resolve=>{execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& {'+WINDOWS+'} '+"'"+String(mode).replace(/'/g,"''")+"'"],{windowsHide:true,timeout:20000},(error,stdout)=>resolve(error?0:Number(String(stdout).trim())||0));});
}
class AnkiProcess{
 constructor({config,log=()=>{},anki=new Anki(),windowControl=windows}){this.windows=windowControl;this.config=config;this.log=log;this.anki=anki;this.started=false;this.hidden=false;}
 async online(){try{await this.anki.call(this.config(),'version');return true;}catch{return false;}}
 find(){return find(this.config().ankiPath);}
 async start({hide=false}={}){
  if(await this.online()){if(hide)await this.hide();return {running:true,started:false};}
  const exe=this.find();if(!exe)throw Error('ANKI_EXECUTABLE_MISSING');
  if(hide){this.hidden=true;this.watch(30000);}
  const child=spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:hide});child.on('error',()=>{});child.unref();
  this.started=true;this.log('[MeguLit] started Anki '+exe+(hide?' (hidden)':''));
  /* v1.1.5: a cold Anki syncs and loads add-ons before AnkiConnect answers; 45 s was often too short, so wait up to 90 s */
  for(let i=0;i<120;i++){await new Promise(resolve=>setTimeout(resolve,750));if(hide&&i%2===0)await this.hide();if(await this.online()){if(hide){await this.hide();}return {running:true,started:true};}}
  throw Error('ANKI_OFFLINE');
 }
 async hide(){const n=await this.windows('hideall');if(n)this.hidden=true;return n;}
 // E259: Anki's sync progress dialog and its 'collection synced' tooltip are separate windows of the same process
 // E265: one long-lived helper (compiled once) hides Anki's windows every ~30ms, so none is ever painted
 watch(ms){this.watcher?.kill?.();this.watcher=execFile('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','& {'+WINDOWS+'} '+"'watch:"+Math.round(ms)+"'"],{windowsHide:true,timeout:ms+15000},()=>{});}
 sweep(ms){const until=Date.now()+ms;const tick=()=>{if(Date.now()>until||!this.hidden)return;this.windows('hideall').finally(()=>setTimeout(tick,400).unref?.());};tick();}
 async show(){this.watcher?.kill?.();this.watcher=null;this.hidden=false;return this.windows('show');}
 // E215.7 (user): open Anki's own add-on manager / deck options / custom study in its native window. AnkiConnect has
 // no action for those dialogs, so Anki is shown, focused and sent its own shortcut (Ctrl+Shift+A add-ons; on a deck's
 // overview O options, C custom study). If focusing fails, Anki is still shown on that deck for a click.
 async open(target,deck=''){
  if(!await this.online())throw Error('ANKI_OFFLINE');
  const c=this.config();if(!deck&&target!=='addons')deck=c.ankiDeck;if(deck&&target!=='addons')await this.anki.call(c,'guiDeckOverview',{name:deck});else if(target==='addons')await this.anki.call(c,'guiDeckBrowser').catch(()=>{});
  const keys={addons:'^+a',options:'o',custom:'c',overview:''}[target];if(keys===undefined)throw Error('ANKI_INVALID_TARGET');
  // E215.9: a background helper may not take the foreground, so MeguLit's own window process (in front after the
  // click) focuses Anki and presses the shortcut; this only makes sure Anki's window is shown.
  this.hidden=false;await this.windows('show');return {opened:true,focused:false,shortcut:target};
 }
 async auto(){const c=this.config();if(!c.ankiAutoStart)return {skipped:true};try{return await this.start({hide:c.ankiHidden});}catch(error){this.log('[MeguLit] Anki auto start failed '+error.message);return {error:error.message};}}
 // E215.6: AnkiConnect's guiExitAnki answered but Anki kept running hidden (its timer is not kept alive), and the
 // user could not open Anki afterwards. Closing now posts WM_CLOSE to Anki's main window, the same as its close
 // button, so Anki saves and exits normally; an Anki that stays open is always shown again.
 async stop(){
  const close=this.started&&this.config().ankiAutoClose;this.started=false;
  try{
   if(!close){if(this.hidden||this.config().ankiHidden)await this.show();return {closed:false};}
   const quiet=this.hidden||this.config().ankiHidden;if(quiet)this.watch(20000);const sent=await this.windows('close');
   for(let i=0;i<40&&await this.online();i++){if(quiet)await this.windows('hideall');await new Promise(resolve=>setTimeout(resolve,400));}
   this.hidden=false;
   if(await this.online()){await this.show();this.log('[MeguLit] Anki did not close; shown again');return {closed:false};}
   this.log('[MeguLit] closed Anki started by MeguLit (windows='+sent+')');return {closed:true};
  }catch(error){this.log('[MeguLit] Anki close failed '+error.message);try{await this.show();}catch{}return {closed:false};}
 }
}
// One-click AnkiConnect (user, 2026-11-08: most "Anki will not connect" reports were a missing add-on). Downloads the
// add-on from AnkiWeb (its official channel), checks it really is the AnkiConnect package, and unpacks it into
// Anki's add-on folder under its AnkiWeb code. Anki must be closed so it does not overwrite the folder; an existing
// install is never replaced.
const ANKICONNECT_CODE='2055492159';
function ankiRunning(){try{return /^"?(anki|ankiw)\.exe"?,/im.test(require('node:child_process').execFileSync('tasklist',['/fo','csv','/nh'],{encoding:'utf8',windowsHide:true,timeout:5000}));}catch{return false;}}
async function installAnkiConnect(env=process.env){
 if(!env.APPDATA)throw Error('ANKI_ADDON_FOLDER_MISSING');
 const base=path.join(env.APPDATA,'Anki2','addons21'),target=path.join(base,ANKICONNECT_CODE);
 if(ankiConnectInstalled(env))return {installed:true,already:true};
 if(!fs.existsSync(path.join(env.APPDATA,'Anki2')))throw Error('ANKI_NEVER_STARTED');
 if(ankiRunning())throw Error('ANKI_RUNNING');
 const response=await fetch('https://ankiweb.net/shared/download/'+ANKICONNECT_CODE+'?v=2.1&p=250900',{redirect:'follow',signal:AbortSignal.timeout(60000),headers:{'User-Agent':'MeguLit'}});
 if(!response.ok)throw Error('ANKICONNECT_DOWNLOAD_FAILED: HTTP '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<4096||bytes.length>5<<20||bytes.readUInt32LE(0)!==0x04034b50)throw Error('ANKICONNECT_DOWNLOAD_FAILED: not an add-on package');
 const work=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'megulit-ankiconnect-')),zip=path.join(work,'addon.zip'),out=path.join(work,'addon');
 try{
  fs.writeFileSync(zip,bytes);
  require('node:child_process').execFileSync(path.join(env.WINDIR||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:MEGULIT_ZIP -DestinationPath $env:MEGULIT_OUT -Force'],{windowsHide:true,timeout:60000,env:{...env,MEGULIT_ZIP:zip,MEGULIT_OUT:out}});
  const init=path.join(out,'__init__.py');if(!fs.existsSync(init)||!/AnkiConnect|anki_connect|web\.WebServer|webBindAddress/i.test(fs.readFileSync(init,'utf8')+fs.readFileSync(path.join(out,'config.json'),'utf8')))throw Error('ANKICONNECT_DOWNLOAD_FAILED: unexpected package');
  fs.mkdirSync(base,{recursive:true});fs.cpSync(out,target,{recursive:true,errorOnExist:true,force:false});
  return {installed:true,path:target};
 }finally{fs.rmSync(work,{recursive:true,force:true});}
}
module.exports={AnkiProcess,find,candidates,coldCandidates,ankiConnectInstalled,installAnkiConnect,ankiRunning,windows};
