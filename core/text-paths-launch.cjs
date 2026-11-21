// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ③ at launch (docs/text-architecture.md). services/bridge.cjs asks prepare() before it starts a
   game itself; when an engine path applies and is allowed, the start is adjusted:
     web   (NW.js / Electron shell next to the program): Chromium's remote debugging switches on a free loopback port;
     unity (Mono or IL2CPP, pack "unity-text" installed): the program in MeguLit's shadow folder, Steam's app id in the
           environment so Steam does not restart it from the real folder.
   KiriKiri and Ren'Py need nothing at launch: HookBridge loads their DLLs into the running game.
   The returned session connects after the start (connect(pid)), feeds ToMe_CHARS records to the hook reader and
   follows its replacement switch (hide) and source lines (want). Off unless the caller passes enabled (the owner's
   "MeguLit draws all text" switch), and per game off once the crash canary tripped. */
const path=require('node:path');
const {Canary}=require('./text-paths.cjs');
const W=require('./text-paths-web.cjs'),U=require('./text-paths-unity.cjs');

function unityPack(root){const dir=path.join(root,'runtime','unity-text');try{return require('node:fs').existsSync(path.join(dir,'MeguLitUnityText.dll'))?dir:null;}catch{return null;}}

async function prepare({root,exe,profile={},enabled=false,shadowRoot=null,ownerTestGrant=null,trace=()=>{}}){
 if(!exe)return null;
 /* An opaque, locally validated test grant is independent of compositor/roles. The session rechecks both the
    authority and the exact executable/effective Lua members before creating any private launch files. */
 if(ownerTestGrant){const canary=new Canary(root,exe);canary.settle();if(canary.allowed('artemis')){
  const a=await require('./artemis-session.cjs').prepare({root,exe,ownerTestGrant,shadowRoot,steamAppId:require('./steam-owned.cjs').launchAppid(exe,profile)||null,canary,trace});if(a)return a;
 }}
 if(!enabled)return null;
 const canary=new Canary(root,exe);const off=canary.settle();if(Object.keys(off||{}).length)trace('text-paths-canary',{off:Object.keys(off)});
 const steam=require('./steam-owned.cjs').launchAppid(exe,profile)||null; /* E-SteamOwned */
 const steamEnv=steam?{SteamAppId:steam,SteamGameId:steam,SteamOverlayGameId:steam}:{};
 if(W.chromiumShell(exe)&&canary.allowed('web')){
  const port=await W.freePort();const session=new W.WebTextPath({port,canary});
  return {path:'web',exe,args:W.launchArgs(port),env:steamEnv,cwd:path.dirname(exe),session,
   connect:()=>session.attach().then(ok=>{trace('text-paths-web',{attached:ok,port});return ok;})};
 }
 const pack=unityPack(root);
 const kind=pack&&U.unityGame(exe),il2cppReady=kind==='il2cpp'&&require('node:fs').existsSync(path.join(pack,'MeguLitUnityText.IL2CPP.dll'));
 if(pack&&(kind==='mono'||il2cppReady)&&!U.modded(exe)&&canary.allowed('unity')){
  const session=new U.UnityTextPath({canary});const port=await session.listen();
  let sh;try{sh=U.makeShadow({exe,shadowRoot:shadowRoot||path.join(root,'data','unity-shadow'),pack,port,steamAppId:steam});}catch(e){session.stop();trace('text-paths-unity-skipped',{error:e.message});return null;}
  trace('text-paths-unity',{shadow:sh.shadow,links:sh.links,copies:sh.copies,junctions:sh.junctions});
  return {path:'unity',exe:sh.exe,args:[],env:steamEnv,cwd:sh.shadow,session,connect:async()=>true};
 }
 return null;
}

/* Connect a prepared session to the hook reader (core/hook-native.cjs): records in, replacement switch and lines out. */
function attach(prepared,hook){if(!prepared?.session||!hook)return;const s=prepared.session;
 if(prepared.path==='artemis'){
  const current=m=>hook.textPath===s&&!hook.disposed&&!hook.stopPending&&!hook.stopError&&s.permission()&&s.owner&&m?.artemisOwner&&hook.target?.pid===s.owner.pid&&hook.target?.started===s.owner.started&&m.artemisOwner.pid===s.owner.pid&&m.artemisOwner.started===s.owner.started;
  s.onSource=m=>{if(!current(m))return false;const before=hook.state?.hookSequence||0;hook.source(m,'Artemis Lua input');
   return current(m)&&Number.isSafeInteger(hook.state?.hookSequence)&&hook.state.hookSequence>before&&hook.state.hookSourceOrigin==='artemis-lua-input'&&hook.state.hookSource===m.text.split('\x1d')[0];};
  /* Semantic input metadata is deliberately not CHARS/UI rectangles or a current-pixel visibility acknowledgement. */
  s.onSemantic=m=>{if(!current({artemisOwner:m.owner}))return;
   if(m.role==='name'){const name=require('./hook-native.cjs').speakerName(m.text);hook.speaker=name?{text:name,at:hook.now()}:null;if(name)hook.noteSpeaker?.(name);return;}
   hook.trace?.('artemis input role='+m.role+' variant='+(m.variant||'-')+' chars='+[...m.text].length);};
  s.onStatus=st=>hook.trace?.('text path artemis: '+st);hook.attachTextPath?.(s);return;
 }
 s.onSource=m=>{const {sameOwner}=require('./unity-kemco-source.cjs');
  const current=()=>prepared.path==='unity'&&hook.textPath===s&&!hook.disposed&&!hook.stopPending&&!hook.stopError&&sameOwner(hook.target,m?.unityOwner);
  if(!current())return false;const before=hook.state?.hookSequence||0;hook.source(m,'KEMCO Message');
  return current()&&Number.isSafeInteger(hook.state?.hookSequence)&&hook.state.hookSequence>before&&hook.state.hookSourceOrigin==='unity-kemco'&&hook.state.hookSource===m.text;
 };
 s.onChars=line=>hook.charRects(line);s.onStatus=st=>hook.trace?.('text path '+prepared.path+': '+st);/* engine-draw: a sentence the engine wants to draw itself asks the reader for its ruby and translation */s.onAsk=a=>{try{hook.emit?.({type:'hookDrawEmbed',...a});}catch{}};hook.attachTextPath?.(s);}

/* ③ dot font at the source (native/fontdot, docs/text-architecture.md): when ① starts the game through MeguLitLaunch
   (compositor mode), MeguLitFontDot<bit>.dll rides along in MEGULIT_LAUNCH_EXTRA and is loaded while the game is still
   suspended. Off with MEGULIT_FONTDOT_OFF=1, without the DLL, or once the crash canary saw the game die with it. The DLL
   itself serves dots only while the compositor's heartbeat says it is presenting (else the real fonts). */
function fontDot(root,exe,early,trace=()=>{}){
 /* 2026-11-21 (owner: 打点可以不要了，精度差、容易漏点) the dot font is retired: never loaded into a game. Kept as code only so an
    old install's canary record still reads; MEGULIT_FONTDOT_FORCE=1 (tests, research) is the one way in */
 if(process.env.MEGULIT_FONTDOT_FORCE!=='1')return null;
 if(!early||process.env.MEGULIT_FONTDOT_OFF==='1')return null;/* dot font = marks: only with the capture compositor (off by default since 2026-11-14) */if(process.env.MEGULIT_CAPTURE_COMPOSITOR!=='1')return null;
 const bit=/MeguLitLaunch32\.exe$/i.test(early.file)?'32':'64',dll=path.join(root,'native','MeguLitFontDot'+bit+'.dll');
 if(!require('node:fs').existsSync(dll))return null;
 const canary=new Canary(root,exe);canary.settle();
 if(!canary.allowed('fontdot')){trace('fontdot-off',{reason:canary.read().off?.fontdot?.reason||''});return null;}
 early.env={...early.env,MEGULIT_LAUNCH_EXTRA:[early.env?.MEGULIT_LAUNCH_EXTRA,dll].filter(Boolean).join(';')};
 canary.arm('fontdot');trace('fontdot',{dll:path.basename(dll)});
 return {dll,canary,
  /* the launcher exits at once, so the game's own process is watched: gone within 20 s = died with the dot font */
  watch(pid,{alive=p=>{try{process.kill(p,0);return true;}catch{return false;}},every=1000,until=21000}={}){
   const t0=Date.now();if(!Number.isInteger(Number(pid))){canary.exited('fontdot',0);return;}
   const w=setInterval(()=>{if(!alive(Number(pid))){clearInterval(w);trace('fontdot-gone',{after:Date.now()-t0});return;}
    if(Date.now()-t0>=until){clearInterval(w);canary.alive('fontdot');canary.exited('fontdot',0);}},every);w.unref?.();}};
}

/* A Steam game started directly (not through steam://), so the early launcher (glyph dots, dot font) can load before
   the game's first glyph. SteamAppId in the environment is enough for many games; some still call
   SteamAPI_RestartAppIfNecessary and Steam restarts them from the real folder without our DLLs (live: THE SHELL HD).
   steam_appid.txt next to the program stops that, but the game folder is never written, so the game is started from a
   shadow folder on the same volume (<volume>\MeguLit-Shadow\<exe>-<size>): folders as junctions, files as hard links
   only (no copies: a failed link drops the shadow and the launch stays as before). A game folder that already holds
   steam_appid.txt is started in place. Returns {exe,cwd,env,shadow} or null. */
/* base: the folder the game runs from and the shadow mirrors (default the program's own folder). 2026-11-21 BALDR SKY Steam:
   Dive1\BaldrSky.exe runs from the install root (steam_api.dll and the shared *.pac are there, Dive1\ holds only its own
   Visual.pac/Voice.pac), so base = install root and the program starts as <shadow>\Dive1\BaldrSky.exe from the shadow. */
function steamDirect({exe,appid,base=null,shadowRoot=null,trace=()=>{}}){
 const fs=require('node:fs');appid=String(appid||'');if(!/^\d+$/.test(appid)||!exe||!fs.existsSync(exe))return null;
 const env={SteamAppId:appid,SteamGameId:appid,SteamOverlayGameId:appid},dir=base?path.resolve(base):path.dirname(exe),rel=path.relative(dir,path.resolve(exe));
 if(!rel||rel.startsWith('..')||path.isAbsolute(rel))return null;
 if(fs.existsSync(path.join(dir,'steam_appid.txt'))){trace('steam-direct',{shadow:false,base:base?true:undefined});return {exe,cwd:dir,env,shadow:null};}
 const key=(base?path.basename(dir).replace(/[^A-Za-z0-9._-]/g,'_')+'-':'')+path.basename(exe).replace(/[^A-Za-z0-9._-]/g,'_')+'-'+fs.statSync(exe).size;
 const shadow=path.join(shadowRoot||path.join(path.parse(path.resolve(exe)).root,'MeguLit-Shadow'),key);
 let stats;try{stats=U.mirror(dir,shadow,{linkOnly:true,ours:new Set(['steam_appid.txt','megulit-shadow.json'])});}
 catch(e){trace('steam-direct-skipped',{error:String(e?.code||e?.message||e).slice(0,80)});
  /* links only, never a recursive delete (junctions inside) */
  try{for(const n of fs.readdirSync(shadow)){const p=path.join(shadow,n),t=fs.lstatSync(p);if(t.isSymbolicLink())fs.rmdirSync(p);else if(t.isFile())fs.unlinkSync(p);}fs.rmdirSync(shadow);}catch{}
  return null;}
 fs.writeFileSync(path.join(shadow,'steam_appid.txt'),appid);
 fs.writeFileSync(path.join(shadow,'megulit-shadow.json'),JSON.stringify({game:dir,exe:rel,steam:appid,at:Date.now(),...stats}));
 trace('steam-direct',{shadow,links:stats.links,junctions:stats.junctions,part:base?rel:undefined});
 return {exe:path.join(shadow,rel),cwd:shadow,env,shadow};
}

module.exports={prepare,attach,unityPack,fontDot,steamDirect};
