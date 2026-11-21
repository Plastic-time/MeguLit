// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成) the live self-check of the running game. One session per bound game
   (services/reader.cjs applyGameProfile): HookNative.trace (hook-events.log) and the reader's own log entries (reader-host.log)
   feed core/self-check.cjs with the thresholds of the game's layered profile (selfCheck.*). Every closed window is written to
   hook-events.log ("selfCheck window=...") and reader-host.log (layoutDiagnostic kind=selfCheck).

   Every exe has its own game diff, keyed by the SHA-256 of the program file (core/auto-profile.cjs exeKey; remembered, so a
   known exe needs no read). The profile's auto layer is, first match wins:
     1 this PC's step-down (the gate saw this exe break here: read mode, whatever anyone else says)
     2 the official diff of this exe (relay, signed by the maintainer)
     3 this PC's calibration
     4 the other players' agreed diff (relay, signed by the relay)
   This PC calibrates (records its first window) unless an official diff exists or the shared verdict is read mode. A step-down
   is reported with its reason, which puts the exe in the maintainer's repair queue, and asks the automatic probe to run (with
   the runtime sample of services/runtime-sample.cjs). Read mode goes through GalNative.textEffects(true, reason). */
const {SelfCheck,traceLine,reasonText,parseTrace,parseReader}=require('../core/self-check.cjs');
const auto=require('../core/auto-profile.cjs');
const Profiles=require('../core/profiles/index.cjs');
const feed=require('./auto-profile-feed.cjs');
const {RuntimeSample}=require('./runtime-sample.cjs');

let live=null;
function version(root){try{return require('./hook-verdict.cjs').appVersion(root);}catch{return '';}}
function engineOf(s){const h=s.reader.gal?.hooks;return String(h?.pageMode?.engine||s.profile?.engine||'');}
function hookTrace(reader,line){try{reader.gal?.hooks?.trace?.(line);}catch{}}
function readMode(reader,reason){try{const g=reader.gal;if(g&&!g.textEffectsHold)g.textEffects(true,reason);}catch{}}
/* the profile with the chosen layer on top, handed to the kernel */
/* 2026-11-21 (docs/diff-layers.md) the outside layers of this exe for profileFor, stacked, each over the one before:
   shared (the players' agreed diff) <- auto (this PC's calibration) <- official (the maintainer's diff) <- stepDown (this PC's
   gate step-down, always last so a game that broke here can always fall back). choose() still names the deciding one (reason,
   read mode, whether to calibrate). */
function inputOf(s){const st=s.stored,sh=s.shared,out={...(s.input||{})};for(const k of ['sharedGame','shared','auto','officialGame','official','officialGameRev','officialRev','sharedGameRev','sharedRev','stepDown','match','prints'])delete out[k];
 if(/^[0-9a-f]{64}$/.test(String(s.key||'')))out.exeSha256=s.key;
 /* the relay's two layers, each official or agreed (services/auto-profile-feed.cjs layer) */
 if(sh){const put=(p,field)=>{if(!p||!p.settings)return;const f=(p.source==='official'?'official':'shared')+field;out[f]=p.settings;out[f+'Rev']=p.rev|0;};put(sh.game,'Game');put(sh.version,'');if(sh.match)out.match=sh.match;}
 /* the game prints let a built-in seed (The Seed/) find its game by archive / script / VNDB / title */
 if(s.prints)out.prints=s.prints;
 if(st&&st.settings){if(st.source==='gate')out.stepDown=st.settings;else out.auto=st.settings;}return out;}
function applyLayer(s){try{const p=Profiles.profileFor(inputOf(s));s.profile=p;s.reader.gal?.setGameProfile?.(p,s.input);}catch{}}
/* which layer wins (see above) */
function choose(s){const st=s.stored,sh=s.shared;
 if(st&&st.source==='gate')return {from:'local-gate',mode:'read',settings:st.settings,reason:st.reason||''};
 if(sh&&sh.source==='official')return {from:'official',mode:sh.mode,settings:sh.settings,reason:sh.mode==='read'?'官方差分：这部游戏只显示译文':''};
 if(st)return {from:'local',mode:st.mode,settings:st.settings,reason:st.reason||''};
 if(sh)return {from:'shared',mode:sh.mode,settings:sh.settings,reason:sh.mode==='read'?'多数玩家在这部游戏上自检未过线':''};
 return null;}
function settle(s){const c=choose(s);const was=s.from;s.layer=c?.settings||null;s.from=c?.from||'';
 if(c&&c.mode==='read')readMode(s.reader,c.reason);
 /* nothing to record when the result is already decided for this exe */
 /* a candidate (the relay found it by the binary or the game, not this exe) does not stop the recording: if the gate refuses it
    the first window is this PC's calibration */
 if(!s.stored&&s.shared?.exact!==false&&(s.shared?.source==='official'||s.shared?.mode==='read')&&s.check.recording){s.check.recording=null;s.calibrated=true;}
 if(was!==s.from||c)return c;return null;}

/* profile: the game's layered profile without the auto layer; input: its profileFor input */
function start(reader,exe,profile=null,input=null,options={}){stop();profile=profile||Profiles.profileFor({exe});input=input||{exe};
 const s={reader,exe,key:'',input,profile,stored:null,shared:null,layer:null,from:'',calibrated:false,skipFeed:!!options.skipFeed,ver:version(reader.root)};
 s.check=new SelfCheck({thresholds:profile.selfCheck||{},record:true,onWindow:r=>windowDone(s,r)});
 /* the runtime sample only with the player's consent (runtime-sample.cjs enabled, default off) */
 s.sample=require('./runtime-sample.cjs').enabled(reader.root)?new RuntimeSample({exe,engine:profile.engine,app:s.ver}):null;
 live=s;
 const known=options.key||auto.exeKeySync(reader.root,exe);
 if(known)bindKey(s,known);
 else auto.exeKey(reader.root,exe).then(k=>{if(live!==s||!k)return;bindKey(s,k);applyLayer(s);}).catch(()=>{});
 return s;}
function bindKey(s,key){const {reader}=s;s.key=key;s.stored=auto.load(reader.root,key);s.calibrated=!!s.stored;if(s.stored)s.check.recording=null;
 s.shared=s.skipFeed?null:feed.layer(feed.cached(reader.root,key),key);if(s.shared&&feed.rejected(reader.root,key,s.shared))s.shared=null;
 const c=settle(s);
 reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'bound',key,layer:s.from||'none',mode:c?.mode||'',calibrating:!s.calibrated});
 hookTrace(reader,'selfCheck key='+key+' layer='+(s.from||'none')+(c?' mode='+c.mode:'')+(s.calibrated?'':' calibrating (first '+s.check.t.window+' lines)'));
 /* the relay's copy is refreshed in the background (hot update: a new diff applies at once) */
 /* the relay is asked with every fingerprint (core/game-print.cjs): exe, head, pe, main archive, Steam, VNDB, title, engine */
 if(!s.skipFeed)new Promise(res=>setImmediate(()=>{try{s.prints=require('../core/game-print.cjs').prints(s.exe,{exe:key,title:s.input?.title||'',steamAppId:s.input?.steamAppId||'',vndb:s.input?.vndb||'',engine:s.input?.engine||s.profile?.engine||''});}catch{s.prints={exe:key};}res(s.prints);}))
  .then(prints=>feed.refresh(reader.root,key,{prints})).then(v=>{if(live!==s)return;const l=feed.layer(v,key);if(!l||feed.rejected(reader.root,key,l)||JSON.stringify(l)===JSON.stringify(s.shared))return;s.shared=l;const before=s.from;settle(s);
  if(s.from!==before||s.from==='official'||s.from==='shared'){hookTrace(reader,'selfCheck fetched key='+key+' '+l.source+' match='+l.match+' mode='+l.mode+' layer='+(s.from||'none'));applyLayer(s);}}).catch(()=>{});
 /* a window that closed before the key was known */
 if(s.pending){const r=s.pending;s.pending=null;windowDone(s,r);}}

function windowDone(s,r){if(live!==s)return;const {reader}=s;
 if(!s.key){s.pending=r;return;}
 hookTrace(reader,traceLine(r));
 reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'window',key:s.key,window:r.window,lines:r.lines,pass:r.pass,over:r.over.join(','),layer:s.from||'none',...Object.fromEntries(Object.entries(r.metrics).map(([k,v])=>[k,v==null?-1:v]))});
 if(r.window===1&&s.sample){/* the fingerprints the relay matches diffs by (core/game-print.cjs); the exe hash is known, the rest is small reads */
  let prints=null;try{prints=require('../core/game-print.cjs').prints(s.exe,{exe:s.key,title:s.input?.title||'',steamAppId:s.input?.steamAppId||'',engine:engineOf(s)});}catch{}
  try{s.sample.save(reader.root,s.key,prints);}catch{}}
 const engine=engineOf(s);
 /* 2026-11-21 (owner: 非精确命中的下发差分只是候选) a diff the relay found by the binary or the game identity, not this exe: its
    first window decides. Over a threshold: this PC stops using it (remembered until the relay hands out another), falls back to its
    own calibration of this window or read mode, and reports it, so the repair queue gets this exe's version layer */
 if(r.window===1&&s.shared&&s.shared.exact===false&&!r.pass){const l=s.shared;const why='同游戏新版本：下发差分（match='+l.match+'）第一个窗口未过线：'+reasonText(r.over);
  feed.reject(reader.root,s.key,l,why);s.shared=null;hookTrace(reader,'selfCheck candidate refused key='+s.key+' match='+l.match+' over='+r.over.join(','));
  reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'candidateRefused',key:s.key,match:l.match,over:r.over.join(',')});
  const rec={...auto.stepDown(null,{key:s.key,engine,exe:s.exe,version:s.ver,trip:{window:r.window,over:r.over,metrics:r.metrics,reason:why},window:r}),reason:why};
  feed.report(reader.root,rec,{prints:s.prints}).catch(()=>{});try{require('./probe-auto.cjs').kick(reader.root);}catch{}
  settle(s);applyLayer(s);}
 if(!s.calibrated){s.calibrated=true;let res;try{res=auto.calibrate(s.check.recording||[],{thresholds:s.check.t});}catch(e){hookTrace(reader,'selfCheck calibration failed '+String(e?.message||e).slice(0,120));return;}
  const rec=auto.record({key:s.key,engine,exe:s.exe,version:s.ver,source:'calibration',result:res});try{auto.store(reader.root,s.key,rec);}catch{}s.stored=rec;s.check.recording=null;
  hookTrace(reader,'selfCheck calibrated key='+s.key+' mode='+res.mode+' settings='+JSON.stringify(rec.settings)+(res.reason?' reason='+res.reason:''));
  reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'calibrated',key:s.key,mode:res.mode,reason:res.reason||'',cost:res.score.cost});
  settle(s);applyLayer(s);feed.report(reader.root,rec,{prints:s.prints}).catch(()=>{});return;}
 if(r.pass||s.from==='local-gate'||reader.gal?.textEffectsHold)return;
 const trip={window:r.window,over:r.over,metrics:r.metrics,reason:reasonText(r.over)};
 const rec=auto.stepDown(s.stored,{key:s.key,engine,exe:s.exe,version:s.ver,trip,window:r});try{auto.store(reader.root,s.key,rec);}catch{}s.stored=rec;
 hookTrace(reader,'selfCheck step down key='+s.key+' layer='+(s.from||'none')+' -> read: '+trip.reason);
 reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'stepDown',key:s.key,window:r.window,over:r.over.join(','),reason:trip.reason,layer:s.from||'none'});
 settle(s);applyLayer(s);
 /* the repair queue: the report carries the reason; the automatic probe (with the runtime sample) is asked to run */
 feed.report(reader.root,rec,{prints:s.prints}).catch(()=>{});try{require('./probe-auto.cjs').kick(reader.root);}catch{}}

function stop(){const s=live;live=null;if(!s)return null;try{s.check.flush();}catch{}return s;}
/* 重新校准: forget this PC's diff, ignore the relay for this run, record the next window again */
function recalibrate(reader){const s=live;const exe=s?.exe||reader.gameExe;if(!exe)return false;const input=s?.input||{exe};const base=Profiles.profileFor(input);const key=s?.key||auto.exeKeySync(reader.root,exe);
 if(key)auto.clear(reader.root,key);hookTrace(reader,'selfCheck recalibrate key='+(key||'?'));live=null;const n=start(reader,exe,base,input,{skipFeed:true,key});if(n){n.layer=null;applyLayer(n);}return true;}
const speakerOf=()=>{try{return String(live?.reader?.gal?.hooks?.state?.hookSpeaker||'');}catch{return '';}};
function sampleEvent(s,e){if(!e||!s.sample||s.sample.done)return;const want=s.sample.event(e,speakerOf());if(want==='shot'){try{s.reader.gal?.sceneShot?.().then(m=>{if(m?.jpeg)s.sample.shot(m.jpeg);}).catch(()=>{});}catch{}}}
/* the sample sees each event before the check, so the line that closes the first window is in it */
const feedTrace=line=>{const s=live;if(!s)return;try{const e=parseTrace(line);if(s.sample&&!s.sample.done&&!String(line).startsWith('selfCheck'))s.sample.rawTrace(line);if(!e)return;sampleEvent(s,e);s.check.event(e);}catch{}};
const feedReader=msg=>{const s=live;if(!s)return;try{const e=parseReader(msg);if(s.sample&&!s.sample.done&&msg?.type!=='hostFrame'&&msg?.kind!=='selfCheck')s.sample.rawReader(msg);if(!e)return;sampleEvent(s,e);s.check.event(e);}catch{}};
/* diagnostics: the running game's record + its windows, for info.json */
function diagnostic(){const s=live;if(!s)return null;return auto.diagnostic(s.stored,s.check.windows);}
module.exports={start,stop,recalibrate,feedTrace,feedReader,diagnostic,current:()=>live,choose,inputOf};
