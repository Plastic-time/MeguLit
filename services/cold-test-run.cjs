// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 闲时冷测试) one cold-test run of one game: start it on the hidden desktop (native/ColdDesk.exe), attach the
   hook exactly as a played game gets it (core/hook-native.cjs, its logs go to the run folder), drive it with the state machine
   of core/cold-test/drive.cjs, take the pictures it asks for, and end it. The recording is the run folder:
     hook-events.log    HookNative.trace lines (what core/self-check.cjs parses)
     engine-draw.log    every ToMe_CHARS record (roles, boxes)
     shot-<tag>.jpg     client-area pictures (local; services/cold-test.cjs decides what, if anything, leaves the PC)
   Runs in its own process (services/cold-test-worker.cjs) so the hook state of the game the user may play later is never touched.
   The user's input ends the run inside ColdDesk at once (it watches GetLastInputInfo); here that arrives as {type:'input'}. */
const fs=require('node:fs'),path=require('node:path'),{spawn:nodeSpawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const {Driver}=require('../core/cold-test/drive.cjs');
const {parseTrace}=require('../core/self-check.cjs');

const helperPath=root=>{for(const p of [path.join(root||'','native','ColdDesk.exe'),path.join(__dirname,'..','native','ColdDesk.exe')])if(fs.existsSync(p))return p;return '';};

/* engine-draw UI runs (button / menu / choice) in game client px, newest first, for the driver's 「はじめから」 and choice clicks */
function menuItem(raw,win){let rec=null;try{rec=require('../core/text-paths.cjs').parseChars(String(raw||''));}catch{}if(!rec||!rec.role||rec.role==='line'||!rec.box||!win)return null;
 const sx=rec.sw>0?win.w/rec.sw:1,sy=rec.sh>0?win.h/rec.sh:1;const [x,y,w,h]=rec.box;return {role:rec.role,text:String(rec.text||'').slice(0,40),x:Math.round(x*sx),y:Math.round(y*sy),w:Math.round(w*sx),h:Math.round(h*sy)};}

/* opts: {root, exe, runDir, budgetMs, profile, shotWidth}; deps for tests: {spawn, Hook, now, tick, layout} -> result */
function runOne(opts,deps={}){const {root='',exe,runDir,budgetMs=360000,profile=null,shotWidth=960}=opts;
 const spawn=deps.spawn||nodeSpawn,now=deps.now||Date.now,TICK=deps.tick||250;
 fs.mkdirSync(runDir,{recursive:true});
 /* an explicit helper (even '' = none) wins over the installed ColdDesk.exe: a test asking for no helper must never start the real one */
 const helper='helper' in deps?deps.helper:helperPath(root);
 return new Promise(resolve=>{
  const t0=now();const res={exe:path.basename(String(exe||'')),startedAt:new Date(t0).toISOString(),stopped:'',black:false,relaunched:false,exited:false,lines:0,choices:0,shots:[],end:'',window:null,pid:0,errors:[]};
  if(!helper){res.end='no-helper';return resolve(res);}
  let child;try{child=spawn(helper,['run',exe,'--seconds',String(Math.ceil(budgetMs/1000)+20)],{windowsHide:true,stdio:['pipe','pipe','ignore']});}catch(e){res.end='spawn '+String(e?.message||e).slice(0,80);return resolve(res);}
  const send=line=>{try{child.stdin.write(line+'\n');}catch{}};
  const driver=new Driver(deps.driver||{});const menu=[];let hooks=null,timer=null,done=false,started='',shotN=0;
  const finish=why=>{if(done)return;done=true;clearInterval(timer);res.end=res.end||why;try{hooks?.stop?.();}catch{}send('kill');
   const wait=setTimeout(()=>{try{child.kill();}catch{}},4000);wait.unref?.();child.once?.('exit',()=>clearTimeout(wait));
   res.endedAt=new Date(now()).toISOString();res.ms=now()-t0;try{fs.writeFileSync(path.join(runDir,'run.json'),JSON.stringify(res,null,1));}catch{}resolve(res);};
  /* the hook: same component a played game gets, its trace into the run folder; every trace line is counted here too */
  const attach=()=>{if(hooks||!res.pid||!res.window||!started)return;try{
   const Hook=deps.Hook||require('../core/hook-native.cjs').HookNative;const layout={...(deps.layout||require('../core/layout.cjs')),logs:runDir};
   Hook.traceTap=line=>{const e=parseTrace(line);if(!e)return;if(e.kind==='line')res.lines++;else if(e.kind==='choice')res.choices++;};
   hooks=new Hook(layout,()=>{});if(profile)hooks.profile=profile;
   const drawLog=hooks.drawLog?.bind(hooks);if(drawLog)hooks.drawLog=raw=>{const m=menuItem(raw,res.window);if(m){menu.unshift(m);menu.length=Math.min(menu.length,12);}return drawLog(raw);};
   hooks.configure({hookAutoStart:true,bindEnabled:true,hookProfile:'auto'},{gameProcessId:res.pid,gameHwnd:String(res.window.hwnd),processName:res.exe,gameStarted:started});}
   catch(e){res.errors.push('hook '+String(e?.message||e).slice(0,100));}};
  createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}
   switch(m.type){
    case 'started':res.pid=m.pid|0;started=String(m.started||'');break;
    case 'window':res.window={hwnd:String(m.hwnd||''),w:m.w|0,h:m.h|0};attach();break;
    case 'shot':if(m.ok&&m.path){res.shots.push(path.basename(m.path));if(m.black===true)res.black=true;else res.black=false;}break;
    case 'input':res.stopped='input';finish('input');break;
    case 'power':if(m.ac===false){res.stopped='battery';finish('battery');}break;
    case 'fullscreen':if(m.on===true){res.stopped='fullscreen';finish('fullscreen');}break;
    case 'relaunched':res.relaunched=true;finish('relaunched');break;
    case 'exited':res.exited=true;finish('exited');break;
    case 'timeout':finish('timeout');break;
    case 'ended':finish(String(m.why||'ended'));break;
    case 'error':res.errors.push(String(m.what||'')+': '+String(m.why||''));break;}});
  child.on?.('error',e=>{res.errors.push(String(e?.message||e));finish('helper-error');});
  child.on?.('exit',()=>finish('helper-exit'));
  timer=setInterval(()=>{if(done)return;try{hooks?.tick?.();}catch{}
   const t=now()-t0;const acts=driver.next({t,deadline:budgetMs,window:res.window,lines:res.lines,choices:res.choices,menu,black:res.black});
   for(const a of acts){if(a.do==='end'){finish(a.why);return;}
    if(a.do==='click')send('click '+(a.x|0)+' '+(a.y|0));else if(a.do==='key')send('key '+a.vk);else if(a.do==='keydown')send('keydown '+a.vk);else if(a.do==='keyup')send('keyup '+a.vk);
    else if(a.do==='shot'){const file=path.join(runDir,'shot-'+(++shotN)+'-'+String(a.tag).replace(/[^a-z0-9-]/gi,'')+'.jpg');send('shot '+shotWidth+' '+file);}}},TICK);
  timer.unref?.();});}

module.exports={runOne,helperPath,menuItem};
