// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成, the local half) the live self-check of the running game. One session per bound game
   (services/reader.cjs applyGameProfile): HookNative.trace (hook-events.log) and the reader's own log entries (reader-host.log)
   feed core/self-check.cjs, with the thresholds of the game's layered profile (selfCheck.*). Every closed window is written to
   hook-events.log ("selfCheck window=...") and reader-host.log (layoutDiagnostic kind=selfCheck).
   - No stored game diff: the first window is the calibration recording; core/auto-profile.cjs picks the settings and stores them
     (data/config/auto-profiles/<gameKey>.json). The stored settings are the profile's top layer (profileFor input.auto), applied
     again through GalNative.setGameProfile, so the kernel reads them like any other layer.
   - A window over a threshold steps the game down (hide+redraw -> read mode), stored, so the next start is in read mode too.
   - 重新校准 (Alt+T, the switch-back of the read-mode block) deletes the stored diff and records again.
   Read mode goes through GalNative.textEffects(true, reason): the original stays, MeguLit shows the translation, Alt+T shows why. */
const {SelfCheck,traceLine,reasonText}=require('../core/self-check.cjs');
const auto=require('../core/auto-profile.cjs');
const Profiles=require('../core/profiles/index.cjs');

let live=null;
function version(root){try{return require('./hook-verdict.cjs').appVersion(root);}catch{return '';}}
function engineOf(s){const h=s.reader.gal?.hooks;return String(h?.pageMode?.engine||s.profile?.engine||'');}
function hookTrace(reader,line){try{reader.gal?.hooks?.trace?.(line);}catch{}}
function readMode(reader,reason){try{const g=reader.gal;if(g&&!g.textEffectsHold)g.textEffects(true,reason);}catch{}}
/* the profile with this PC's layer on top, handed to the kernel */
function applyLayer(s,settings){try{const p=Profiles.profileFor({...(s.input||{}),...(settings?{auto:settings}:{})});s.profile=p;s.reader.gal?.setGameProfile?.(p,s.input);}catch{}}

/* profile: the game's layered profile without the auto layer; input: its profileFor input. Returns the session ({stored}) */
function start(reader,exe,profile=null,input=null){stop();profile=profile||Profiles.profileFor({exe});input=input||{exe};const key=auto.keyFor({gameKey:profile.gameKey,exe});if(!key)return null;
 const stored=auto.load(reader.root,key);const s={reader,exe,key,input,profile,stored,calibrated:!!stored};
 s.check=new SelfCheck({thresholds:profile.selfCheck||{},record:!stored,onWindow:r=>windowDone(s,r)});
 live=s;
 if(stored){reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'stored',key,mode:stored.mode,source:stored.source,reason:stored.reason||''});hookTrace(reader,'selfCheck stored key='+key+' mode='+stored.mode+' source='+stored.source);
  if(stored.mode==='read')readMode(reader,stored.reason||'');}
 else hookTrace(reader,'selfCheck calibrating key='+key+' (first '+s.check.t.window+' lines)');
 return s;}
function windowDone(s,r){if(live!==s)return;const {reader}=s;
 hookTrace(reader,traceLine(r));
 reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'window',key:s.key,window:r.window,lines:r.lines,pass:r.pass,over:r.over.join(','),...Object.fromEntries(Object.entries(r.metrics).map(([k,v])=>[k,v==null?-1:v]))});
 const engine=engineOf(s),ver=version(reader.root);
 if(!s.calibrated){s.calibrated=true;let res;try{res=auto.calibrate(s.check.recording||[],{thresholds:s.check.t});}catch(e){hookTrace(reader,'selfCheck calibration failed '+String(e?.message||e).slice(0,120));return;}
  const rec=auto.record({key:s.key,engine,exe:s.exe,version:ver,source:'calibration',result:res});try{auto.store(reader.root,s.key,rec);}catch{}s.stored=rec;s.check.recording=null;
  hookTrace(reader,'selfCheck calibrated key='+s.key+' mode='+res.mode+' settings='+JSON.stringify(res.settings)+(res.reason?' reason='+res.reason:''));
  reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'calibrated',key:s.key,mode:res.mode,reason:res.reason||'',cost:res.score.cost});
  if(res.mode==='read')readMode(reader,res.reason);
  applyLayer(s,rec.settings);return;}
 if(r.pass||s.stored?.mode==='read'||reader.gal?.textEffectsHold)return;
 const trip={window:r.window,over:r.over,metrics:r.metrics,reason:reasonText(r.over)};
 const rec=auto.stepDown(s.stored,{key:s.key,engine,exe:s.exe,version:ver,trip,window:r});try{auto.store(reader.root,s.key,rec);}catch{}s.stored=rec;
 hookTrace(reader,'selfCheck step down key='+s.key+' hide -> read: '+trip.reason);
 reader.logVisibility?.({type:'layoutDiagnostic',kind:'selfCheck',what:'stepDown',key:s.key,window:r.window,over:r.over.join(','),reason:trip.reason});
 readMode(reader,trip.reason);applyLayer(s,rec.settings);}
function stop(){const s=live;live=null;if(!s)return null;try{s.check.flush();}catch{}return s;}
/* 重新校准: forget the stored diff, drop the auto layer and record the next window again */
function recalibrate(reader){const s=live;const exe=s?.exe||reader.gameExe;if(!exe)return false;const input=s?.input||{exe};const base=Profiles.profileFor(input);const key=s?.key||auto.keyFor({gameKey:base.gameKey,exe});
 auto.clear(reader.root,key);hookTrace(reader,'selfCheck recalibrate key='+key);live=null;const n=start(reader,exe,base,input);if(n)applyLayer(n,null);return true;}
const feedTrace=line=>{const s=live;if(!s)return;try{s.check.trace(line);}catch{}};
const feedReader=msg=>{const s=live;if(!s)return;try{s.check.reader(msg);}catch{}};
/* diagnostics: the running game's record + its windows, for info.json */
function diagnostic(){const s=live;if(!s)return null;return auto.diagnostic(s.stored,s.check.windows);}
module.exports={start,stop,recalibrate,feedTrace,feedReader,diagnostic,current:()=>live};
