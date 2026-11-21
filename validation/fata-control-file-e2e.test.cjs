process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 (engine-draw, owner's test pack v5 ファタモルガーナの館: choices empty, #choiceframe and #clearline never took effect;
   hook-diagnostics 03:38 `choice=0 clr=0` after 55 lines, %TEMP%\MeguLit\draw did not exist): HookNative read the game's pid from
   this.state (the hook's notify state, which never holds it), got 0 and never created the engine-draw transport, so the control
   file was never written. Earlier replays fed EngineDraw directly and passed. End to end here: the seed profile arrives, configure()
   brings the real pid, the control file is written at the path the KiriKiri DLL builds, and script.inc's own ctl() parser (its
   lines, run as written) reads #choiceframe and #clearline from it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {HookNative}=require('../core/hook-native.cjs'),Profiles=require('../core/profiles/index.cjs');
const root=path.join(__dirname,'..'),PID=900000+(process.pid%90000);
/* the DLL (native/krkrtext/KrkrText.cpp MakeCtlPath): GetTempPathW() + MeguLit\draw\<pid>.txt */
const dllPath=pid=>path.join(process.env.TMP||process.env.TEMP||os.tmpdir(),'MeguLit','draw',pid+'.txt');
/* script.inc st.ctl(): [].load (UTF-16 with BOM, one array item per line), then its own loop body, the TJS lines translated token by token */
function scriptIncCtl(file){
 const src=fs.readFileSync(path.join(root,'native','krkrtext','script.inc'),'utf8');
 const i=src.indexOf("var c=%['roles'=>0,'embed'=>0,'zh'=>1],m=%[];"),j=src.indexOf('continue;}',i)+'continue;}'.length;assert.ok(i>0&&j>i,'script.inc ctl parser found');
 let body=src.slice(i,j).replace("%['roles'=>0,'embed'=>0,'zh'=>1]","{roles:0,embed:0,zh:1}").replace('%[]','{}').replace(/a\.count/g,'a.length').replace(/#t==0xfeff/,'t.charCodeAt(0)==0xfeff').replace("typeof c.choiceFrames!='Object'","!Array.isArray(c.choiceFrames)").replace(/\.add\(/g,'.push(');
 const buf=fs.readFileSync(file);assert.deepEqual([...buf.subarray(0,2)],[0xff,0xfe],'UTF-16LE with BOM, as [].load reads it');
 const a=buf.subarray(2).toString('utf16le').split(/\r?\n/);
 return new Function('a',body+'}return c;')(a);
}
test('Fata end to end: seed profile -> real pid from configure -> control file at the DLL path -> script.inc reads #choiceframe and #clearline',async t=>{
 const file=dllPath(PID);t.after(()=>{try{fs.unlinkSync(file);}catch{}});try{fs.unlinkSync(file);}catch{}
 const p=Profiles.profileFor({exe:'D:/Games/Fata/fata_jp.exe',engine:'KiriKiri'});assert.equal(p.gameKey,'fata-morgana');assert.equal(p.page.reportClear,true);assert.ok(p.choice.pageFrames.length);
 const hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>1000);clearInterval(hook.timer);hook.trace=()=>{};hook.send=()=>{};
 hook.setProfile(p);assert.equal(hook.gamePid(),0);assert.equal(fs.existsSync(file),false,'no pid yet: nothing written');
 hook.configure({hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook'},{bound:true,gameProcessId:PID,gameStarted:'1',gameHwnd:'456',coverEnabled:true});
 assert.equal(hook.gamePid(),PID,'the pid comes from configure (window state / target), not this.state');
 await new Promise(r=>setTimeout(r,150));
 assert.ok(fs.existsSync(file),'control file written at '+file);
 const c=scriptIncCtl(file);
 assert.equal(c.clear,1,'#clearline read by script.inc');assert.ok(Array.isArray(c.choiceFrames)&&c.choiceFrames.some(r=>r.test('選択肢')),'#choiceframe read by script.inc');
 hook.engineDraw?.stop();
});
test('every pid read in hook-native goes through gamePid() (this.state only as its last fallback)',()=>{
 const src=fs.readFileSync(path.join(root,'core','hook-native.cjs'),'utf8');assert.equal((src.match(/this\.state\?\.gameProcessId/g)||[]).length,1,'only gamePid() reads it, as the last fallback');
});
