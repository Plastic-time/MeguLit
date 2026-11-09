// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const {identifierNoise}=require('./text-noise.cjs');
function cleanSource(text,name='',code=''){if(code.endsWith(':JIT:UNITY'))text=text.replace(/<br\s*\/?>/gi,'\n').replace(/<ruby[^>]*>(.*?)<\/ruby>/gis,'$1').replace(/<\/?(?:color|size|font|b|i|u|s|mark|align|line-height|cspace|mspace|indent|margin|voffset|alpha|link|style|noparse|sprite)(?:[=\s][^>]*)?>/gi,'');return text.replace(/\r\n?/g,'\n').replace(/\x05/g,/^BGI(?:\.exe)?$/i.test(name)?'\n':'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,'');}
/* A speaker name from a name stream: brackets and control marks stripped; anything that reads like a sentence is not a name. */
function speakerName(raw){const n=String(raw||'').replace(/[\x00-\x1f]/g,'').replace(/^[\s【\[「『(（]+|[\s】\]」』)）:：]+$/gu,'').trim();if(n.length%2===0&&n.length>=4&&n.slice(0,n.length/2)===n.slice(n.length/2))return speakerName(n.slice(0,n.length/2)); /* a name stream that sends the name twice (時雨時雨) */
 return n&&n.length<=16&&(/^[?？]+$/.test(n)||!/[。、！？!?…]/.test(n))?n:'';}
function scriptSource(text){
 // Script VM syntax left in a hooked string (variable references, ％Ａ/＊Ｂ commands); "50％OFF" is ordinary text (E215).
 const marker=/[【《\[][\$＄]|[%％*＊][A-ZＡ-Ｚ](?![A-Za-zＡ-Ｚａ-ｚ])|[\$＄][\p{L}_＿]/u.exec(text);
 return marker?text.slice(0,marker.index).trimEnd():text;
}
const IslandSource=require('./island-source.js');
class HookNative{
 constructor(layout,onEvent,spawnHelper=spawn,now=Date.now){this.layout=typeof layout==='string'?{native:layout,hook:path.join(layout,'hook-runtime')}:layout;this.folder=this.layout.native;this.emit=onEvent;this.spawn=spawnHelper;this.now=now;this.state={hookActive:false,hookAvailable:false,hookThreads:[],processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookMessage:'Hook 未启用'};this.islandSources=new Map();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;this.lastSource="";this.identity="";this.serial=0;this.enabled=false;this.attempt=0;this.retryAt=0;this.timer=setInterval(()=>this.tick(),1000);this.timer.unref?.();}
 trace(message){try{const file=path.join(this.layout.logs||path.join(this.folder,"..","logs"),"hook-events.log");if(fs.existsSync(file)&&fs.statSync(file).size>=1048576){fs.rmSync(file+".previous",{force:true});fs.renameSync(file,file+".previous");}fs.appendFileSync(file,new Date().toISOString()+" "+message+"\n");}catch{}}
 notify(v){if(Object.entries(v).every(([k,value])=>this.state[k]===value))return;this.state={...this.state,...v};this.emit({type:'hook',...v});}
 configure(preferences,state){this.preferences=preferences;this.windowState=state;const pid=Number(state.gameProcessId),hwnd=String(state.gameHwnd||'');this.wanted=(preferences.hookAutoStart||['hook','local'].includes(preferences.maskMode))&&preferences.bindEnabled===true&&preferences.hookProfile!=='off';this.target=Number.isSafeInteger(pid)&&pid>0&&/^\d{1,19}$/.test(hwnd)?{pid,hwnd,name:String(state.processName||''),started:String(state.gameStarted||'')}:null;
  if(!this.wanted||!this.target){this.stop(false);return;}if(this.process&&(this.pid!==pid||this.started!==this.target.started))this.stop(false);
  const enabled=preferences.hookProfile!=='read'&&!this.preflight&&state.bound===true&&state.coverEnabled!==false;const route=enabled?(preferences.hookProfile==='embed'?'embed':'custom'):'read';if(this.process&&(enabled!==this.enabled||route!==this.route)){
   // Every engine toggles hiding in place (E215): the bridge only flips its replacement switch. Detaching and
   // re-injecting the same game process on each mode change (calibration, preflight) made the overlay flicker and
   // crashed CLANNAD HD (Siglus) without an error; it also dropped the first line after calibration.
   if(true){this.trace('render mode switched in place '+this.route+' -> '+route);this.enabled=enabled;this.route=route;this.verified=false;if(enabled)this.send({type:'enable'});else this.send({type:'disable',reason:preferences.hookProfile==='read'?'reader-profile':this.preflight?'reader-preflight':state.bound!==true?'reader-unbound':'cover-disabled'});}
   else{this.trace('render mode changed; detach then reconnect');this.stop(false);this.retryAt=this.now()+2500;return;}}if(!this.process&&this.now()>=this.retryAt)this.start(this.target);this.syncMarker();this.syncEmbedMode();}
 // 'translate' while the per-work switch is on and replacement is active; 'hide' (blank for MeguLit to draw) otherwise.
 syncEmbedMode(){const want=!!(this.process&&this.enabled&&this.preferences?.embedTranslation===true);if(!this.process){this.embedModeSent=undefined;return;}if(want===this.embedModeSent)return;this.embedModeSent=want;if(!want&&this.state?.embedTranslating)this.notify({embedTranslating:false});this.trace('embed mode '+(want?'translate':'hide'));this.send({type:'embedMode',mode:want?'translate':'hide'});}
 embedReply(id,trans){if(!this.process||!Number.isSafeInteger(id))return;this.send({type:'embedReply',id,trans:String(trans||'').slice(0,4000)});if(trans&&this.embedModeSent)this.notify({embedTranslating:true});}
 tick(){if(this.process&&this.now()-this.lastHeartbeat>12000){const old=this.process;this.process=null;++this.serial;old.kill();this.retry('Hook 通信无响应');}if(!this.process&&this.wanted&&this.target&&this.now()>=this.retryAt)this.start(this.target);}
 retry(message){this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.enabled=false;this.retryAt=this.now()+Math.min(30000,1000*2**Math.min(this.attempt++,5));this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookThreads:[],hookMessage:message+'；正在自动重连'});}
 start({pid,hwnd,name,started}){if(!/^[A-Za-z0-9_\-. \u0080-\uffff]{1,100}$/.test(name)||!/^\d{10,20}$/.test(started))return;
  // Do not keep re-attaching to a game process that has exited; wait for the window bridge to bind the new one.
  if(this.spawn===spawn)try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){this.retryAt=this.now()+3000;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,hookMessage:'游戏进程已退出，等待游戏重新启动后自动绑定'});return;}}
  // A HookBridge built while ToMe ran is staged as HookBridge.updated.exe and installed here, before the bridge starts.
  const staged=path.join(this.folder,'HookBridge.updated.exe');if(fs.existsSync(staged))try{fs.copyFileSync(staged,path.join(this.folder,'HookBridge.exe'));fs.unlinkSync(staged);}catch{}
  const root=this.layout.hook,required=['LunaHost64.dll','LunaHook32.dll','LunaHook64.dll'],missing=required.filter(n=>!fs.existsSync(path.join(root,n)));if(missing.length||!fs.existsSync(path.join(this.folder,'HookBridge.exe'))){this.retryAt=this.now()+30000;this.notify({hookMessage:'Hook 组件缺失：'+missing.join('、'),hookAvailable:false});return;}
  const identity=pid+"|"+started;if(identity!==this.identity){this.lastSource="";this.lastSourceAt=0;this.preferredThread=null;this.identity=identity;this.state.hookFramework=null;}this.pid=pid;this.started=started;this.enabled=this.preferences?.hookProfile!=='read'&&!this.preflight&&this.windowState?.bound===true&&this.windowState?.coverEnabled!==false;this.route=this.enabled?(this.preferences?.hookProfile==='embed'?'embed':'custom'):'read';this.markerKey='';this.lastHeartbeat=this.now();const serial=++this.serial,child=this.process=this.spawn(path.join(this.folder,'HookBridge.exe'),[String(pid),hwnd,name,started,...(this.route==='read'?['--read-only']:this.route==='embed'?['--official-embed']:[])],{cwd:this.folder,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});if(this.enabled)this.send({type:'enable'});
  const failed=()=>{if(serial!==this.serial)return;this.process=null;++this.serial;this.retry('Hook 连接停止');};child.on('error',failed);child.on('exit',failed);
  createInterface({input:child.stdout}).on('line',line=>{if(serial!==this.serial||line.length>30000)return;let m;try{m=JSON.parse(line);}catch{return;}this.lastHeartbeat=this.now();
   if(m.type==='hookEngineFeature'&&['naninovel','cs2','siglus'].includes(m.framework)){
    if(m.framework==='siglus'&&this.enabled){this.enabled=false;this.route='read';this.verified=false;this.preferredThread=null;this.send({type:'disable',reason:'script-vm-capture-only'});}
    this.notify({hookFramework:m.framework});return;
   }
   if(m.type==='hookTextPos'||m.type==='hookPage'||m.type==='hookDialog'||m.type==='hookGameUi'){this.emit(m);if(m.type==='hookPage')this.islandPage(m);return;}
   /* Translation written back into the game: the bridge holds a dialogue line and asks for its translation. */
   if(m.type==='embedRequest'&&Number.isSafeInteger(m.id)&&typeof m.text==='string'&&m.text.length<=4000){this.emit({type:'hookEmbedRequest',id:m.id,text:m.text});return;}
   if(m.type==='hookRender'){this.notify({hookDrawCount:Number(m.count)||0,hookDrawAt:Number(m.at)||0});return;}
   if(m.type==='waitMarkerDrawn'){this.emit({type:'waitMarkerDrawn'});return;}
   if(m.type==='waitMarkerStatus'){this.notify({waitMarkerMessage:String(m.message||'').slice(0,300),waitMarkerHookActive:m.active===true});return;}
   if(m.type==='hookSource'&&typeof m.text==='string'&&m.text.length<=4000){this.source(m,name);return;}
   // v1.1.4: speaker names from a name-role stream, for every engine that reports one (user: the log showed every line as narration).
   if(m.type==='hookName'&&typeof m.text==='string'){const n=speakerName(m.text);if(n)this.speaker={text:n,at:this.now()};return;}
   if(m.type==='hookThreads'&&Array.isArray(m.hookThreads)){// Unity games create a stream per String-method call site (often 100+); keep the selected and embeddable ones
   // ahead of the cut so a late dialogue stream such as Naninovel's printer is never dropped.
   const rank=t=>(t&&t.selected===true?2:0)+(t&&t.embeddable===true?1:0);this.notify({hookAvailable:true,hookThreads:m.hookThreads.slice().sort((a,b)=>rank(b)-rank(a)).slice(0,100).filter(t=>typeof t.id==='string'&&t.id.length<100).map(t=>({id:t.id,name:String(t.name||'').slice(0,100),code:String(t.code||'').slice(0,1000),sample:String(t.sample||'').slice(0,110),selected:t.selected===true,embeddable:t.embeddable===true}))});if(this.preferredThread&&this.state.hookThreads.some(t=>t.id===this.preferredThread)){const id=this.preferredThread;this.preferredThread=null;this.select(id);}return;}
   if(['hookStatus','hookError','hookHeartbeat'].includes(m.type)){const value={};for(const k of ['processAttached','streamSelected','receivedText'])if(typeof m[k]==='boolean')value[k]=m[k];if(typeof m.replacementState==='string')value.replacementState=this.verified&&this.enabled?'user-verified':m.replacementState;if(typeof m.hookActive==='boolean')value.hookActive=m.hookActive;if(m.hookMessage)value.hookMessage=String(m.hookMessage).slice(0,400);if(m.type!=='hookError'&&(value.receivedText??this.state.receivedText)&&(value.processAttached??this.state.processAttached)&&(value.streamSelected??this.state.streamSelected))value.hookMessage='已收到真实游戏台词；'+((value.replacementState||this.state.replacementState)==='user-verified'?'原文隐藏已由用户确认':'原文替换状态请见分阶段诊断');this.notify(value);if(m.type==='hookError')this.retryAt=this.now()+1000;this.syncMarker();}
  });this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'unverified',hookSource:this.lastSource||null,hookRecovering:!!this.lastSource,hookFramework:this.state.hookFramework||null,hookMessage:'正在连接 LunaHook；等待实际文本流'});
 }
 // Japanese original for a translated build (services/original-text.cjs). Only an exact or position-confirmed match
 // replaces the captured line; anything else, or any error, keeps the captured text so the dialogue never goes missing.
 originalTextFor(text){const provider=this.originalText;if(!provider||!text)return text;try{const r=provider.resolve(text);if((r.status==='exact'||r.status==='high')&&r.japanese&&!r.alreadyJapanese){this.trace('original-text '+r.status+' '+r.method+' #'+r.indices[0]);return r.japanese;}if(r.status!=='none')this.trace('original-text kept '+r.status+' '+r.method);}catch(error){this.trace('original-text error '+(error?.message||error));}return text;}
 source(m,name){
  // The game's own ruby readings ride after the line as \x1d base \x1c reading pairs (ISLAND hook): split them off
  // before anything else sees the text, and attach them when this line is delivered (user, 2026-11-03).
  const extracted=require('./source-ruby.cjs').extractSourceRuby(m.text);let ruby=extracted.ruby;m={...m,text:extracted.text};
  // Multilingual containers keep only the Japanese track (E243); streams that deliver every line several times (or every character doubled) are learned and undone per stream (E215).
  this.repeats=this.repeats||new (require('./repeat-normalizer.cjs').RepeatNormalizer)();
  this.attempt=0;const text=this.originalTextFor(this.repeats.normalize(String(m.sourceCode||m.sourceName||name||''),require('./language-tracks.cjs').japaneseTrack(scriptSource(cleanSource(m.text,name,String(m.sourceCode||''))))).replace(/\n+$/,''));
  if(!text.trim())return;
  // v1.1.5: a line of another language track (Traditional/Simplified Chinese) inside a Japanese stream is not dialogue to read.
  {const lt=require('./language-tracks.cjs');if(lt.borrowedCode(text)){this.trace('drop borrowed-code (Chinese patch) line '+JSON.stringify(text.slice(0,40)));if(!this.japaneseStream)this.notify({hookNotice:'这句是汉化补丁的「借码」文字，不是日文原文（常见于汉化版存下的存档）。MeguLit 不会读取它；请从日文原版存的档或新游戏开始',hookNoticeAt:this.now()});return;}if(lt.foreignLine(text)&&this.japaneseStream){this.trace('drop foreign-language line '+JSON.stringify(text.slice(0,40)));return;}if(/[ぁ-ゟァ-ヺ]/u.test(text))this.japaneseStream=true;}
  // The game's own LOG/backlog (E215.2, user: hide MeguLit there and do not read it): opening it replays lines read
  // earlier, several within a second. Two or more earlier lines (other than the current one) inside one second mark the
  // LOG: those lines are neither read nor recorded and the reader hides; it returns after 1.5 s without replays or at
  // the first new line. A single repeated line (a script repeating itself) is read as usual.
  {const L=this.nativeLog||(this.nativeLog={seen:new Map(),hits:[],active:false,timer:null}),now=this.now(),key=text.replace(/\s+/g,'');
   const current=key===String(this.lastSource||'').replace(/\s+/g,''),replay=L.seen.has(key)&&(!current||L.active||!!L.held);L.hits=L.hits.filter(t=>now-t<1000);if(replay)L.hits.push(now);
   const end=()=>{if(!L.active)return;L.active=false;clearTimeout(L.timer);L.timer=null;this.trace('native log closed');this.notify({hookNativeLog:false});};
   if(L.bypass===key)L.bypass=null;
   else if(replay&&(L.active||L.hits.length>=2)){if(!L.active){L.active=true;L.held=null;this.trace('native log detected; reading paused');this.notify({hookNativeLog:true});}
    clearTimeout(L.timer);L.timer=setTimeout(end,1500);L.timer.unref?.();return;}
   // The first earlier line waits 0.4 s: a LOG sends the next one at once, a script repeating one line does not.
   else if(replay){const held=L.held={m,name};const timer=setTimeout(()=>{if(L.held!==held)return;L.held=null;L.bypass=key;this.source(m,name);},400);timer.unref?.();return;}
   if(!replay)end();L.seen.delete(key);L.seen.set(key,now);if(L.seen.size>3000)L.seen.delete(L.seen.keys().next().value);}
  // Scene/chapter keys and asset ids ("10_1", "bg_01.png", "Chapter2") from engine string streams are never dialogue.
  if(identifierNoise(text)){this.trace('drop identifier text '+JSON.stringify(text.slice(0,60)));return;}
  if(ruby.length){const map=this.sourceRuby||(this.sourceRuby=new Map());map.set(text,ruby);if(map.size>64)map.delete(map.keys().next().value);}
  if(m.sourceName==='EmbedToMeCS2_DrawPreserve'){if(m.origin==='history'&&this.state.receivedText)return;this.queueIslandSource(text,m.origin);return;}
  if(!/EmbedToMeCS2_DrawPreserve|EmbedEuphoria474_DrawHide/.test(m.sourceName||'')){this.deliverSource(text,m.origin);return;}
  const pending=this.pendingSource;
  if(pending&&text!==pending.text&&!text.startsWith(pending.text)&&!pending.text.startsWith(text))this.flushSource();
  if(this.pendingSource){if(text.length>=this.pendingSource.text.length)this.pendingSource={text,origin:m.origin};return;}
  this.pendingSource={text,origin:m.origin};const serial=this.serial;this.sourceTimer=setTimeout(()=>{if(serial===this.serial)this.flushSource();},40);this.sourceTimer.unref?.();
 }
 // A render burst can report several sentences before the host flushes their source frames.
 // Join every native line, in draw order; a later token must never overwrite an earlier unmatched line.
 islandPage(m){
  if(m.engine!=='cs2'||!Number.isSafeInteger(m.token)||m.token<0||m.token>0xffffffff||!Number.isSafeInteger(m.line)||m.line<1||(this.islandDraw&&m.line<=this.islandDraw.line))return;
  this.islandDraw={token:m.token,line:m.line,at:this.now()};this.islandDraws.push(this.islandDraw);
  if(this.islandDraws.length>64)this.islandDraws.shift();
  clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.drainIsland();
 }
 drainIsland(){
  clearTimeout(this.islandTimer);
  while(this.islandDraws.length){const draw=this.islandDraws[0],candidate=this.islandSources.get(draw.token),age=this.now()-draw.at;
   if(!candidate||this.now()-candidate.at>=5000){
    // Ordered delivery keeps a burst's earlier lines (240 ms before a later ready line moves on). The newest draw blocks
    // nothing, so its frame may be later: dropping it at 240 ms hid the original with no ToMe text (Opus 5.5, 2026-11-02).
    const limit=this.islandDraws.length===1?1500:240;
    if(age<limit){const serial=this.serial;this.islandTimer=setTimeout(()=>{if(serial===this.serial)this.drainIsland();},limit-age);this.islandTimer.unref?.();return;}
    this.trace('ISLAND missing source line='+draw.line+' token='+draw.token);this.islandDraws.shift();continue;
   }
   this.islandDraws.shift();if(draw.line<=this.islandDelivered)continue;this.islandDelivered=draw.line;
   this.deliverSource(candidate.text,candidate.origin,'cs2',draw.line);
  }
 }
 queueIslandSource(text,origin){
  const key=IslandSource.token(text);this.islandSources.set(key,{text,origin,at:this.now()});
  if(this.islandSources.size>64)this.islandSources.delete(this.islandSources.keys().next().value);
  if(this.islandDraw){this.drainIsland();return;}
  // Preserve read-only startup capture until the first native draw report is available.
  const serial=this.serial,pending=this.pendingSource;
  if(pending){pending.callbacks=(pending.callbacks||1)+1;if(text===pending.text||pending.text.startsWith(text))return;pending.text=text;pending.origin=origin;}
  else{this.pendingSource={text,origin,callbacks:1};this.sourceDeadline=setTimeout(()=>{if(serial===this.serial)this.flushSource();},240);this.sourceDeadline.unref?.();}
  clearTimeout(this.sourceTimer);this.sourceTimer=setTimeout(()=>{if(serial===this.serial)this.flushSource();},80);this.sourceTimer.unref?.();
 }
 flushSource(){clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;const pending=this.pendingSource;this.pendingSource=null;if(pending){if(pending.callbacks&&this.islandDraw){this.drainIsland();return;}if(pending.callbacks)this.trace('ISLAND source burst settled callbacks='+pending.callbacks+' chars='+pending.text.length);this.deliverSource(pending.text,pending.origin,pending.callbacks?'cs2':'');}}
 // Fast-forward / held Ctrl (E215.4, user: after skipping, every skipped line poured into MeguLit). Lines arriving less
 // than 300 ms apart are a skip burst: they are held, each replacing the last, and only the line the game stops on is
 // shown, 400 ms after the burst ends. Native page engines (ISLAND cs2, several lines per page) keep ordered delivery.
 deliverSource(text,origin,engine='',nativeLine=0){
  const now=this.now(),live=!engine&&!nativeLine&&(origin||'live')==='live',S=this.skipBurst||(this.skipBurst={last:0,held:null,timer:null,count:0});
  if(!live){this.emitSource(text,origin,engine,nativeLine);return;}
  const gap=now-S.last;S.last=now;
  if(gap>=300&&!S.held){S.count=0;this.emitSource(text,origin,engine,nativeLine);return;}
  S.count++;S.held={text,origin};clearTimeout(S.timer);
  if(S.count===1)this.trace('skip burst: holding lines until the game stops');
  const serial=this.serial;S.timer=setTimeout(()=>{const held=S.held;S.held=null;S.timer=null;if(!held||serial!==this.serial)return;this.trace('skip burst settled; skipped='+(S.count-1));S.count=0;this.emitSource(held.text,held.origin);},400);S.timer.unref?.();
 }
 /* E270 (user, ATRI: one line was often typed out twice): games re-send the shown line when the voice ends or the
    window repaints, seconds later (after a long voice) and sometimes with different line breaks. The same line (ignoring
    white space) right after itself is ignored until another line comes; very short lines such as …… keep the old
    650 ms so a script that repeats them still advances. */
 sameAsLast(text){const k=s=>String(s||'').replace(/\s+/g,''),key=k(text);if(!key||key!==k(this.lastSource))return false;return key.length>=6||this.now()-(this.lastSourceAt||0)<650;}
 emitSource(text,origin,engine='',nativeLine=0){
  if((origin==='history'&&this.state.receivedText)||(!nativeLine&&this.sameAsLast(text)&&this.state.hookActive&&this.state.receivedText&&!this.state.hookRecovering)){this.trace('source duplicate ignored chars='+text.length);return;}
  // E247 (user: a game settings screen looped its prompts into the text bar): when lines already shown in the last
  // 8 s keep coming back (two or more repeats), the stream is cycling menu/system text; drop it until an unseen line.
  if(!nativeLine&&(origin||'live')==='live'){const now=this.now(),L=this.loopGuard||(this.loopGuard={seen:[],repeats:[],looping:false});L.seen=L.seen.filter(x=>now-x.at<8000);L.repeats=L.repeats.filter(t=>now-t<8000);
   if(L.seen.some(x=>x.text===text)){L.repeats.push(now);if(L.looping||L.repeats.length>=2){if(!L.looping)this.trace('menu loop detected; repeating lines ignored');L.looping=true;return;}}
   else{if(L.looping)this.trace('menu loop ended');L.looping=false;L.repeats=[];}
   L.seen.push({text,at:now});if(L.seen.length>12)L.seen.shift();}
  const speaker=this.speaker&&this.now()-this.speaker.at<2500?this.speaker.text:'';this.speaker=null;this.lastSource=text;this.lastSourceAt=this.now();this.trace('source chars='+text.length+' sequence='+((this.state.hookSequence||0)+1));this.notify({hookActive:true,processAttached:true,streamSelected:true,hookRecovering:false,hookSource:text,hookSpeaker:speaker,hookSourceEngine:engine,hookSourceLine:nativeLine,hookSourceOrigin:origin||'live',hookSourceRuby:this.sourceRuby?.get(text)||[],hookSequence:(this.state.hookSequence||0)+1,receivedText:!!text.trim(),hookMessage:text.trim()?'已收到真实游戏台词':'收到空文本信号'});
 }
 markerTarget(v){this.waitTarget=v;this.syncMarker();}
 // The Direct3D9 wait-marker draw hook no longer runs any probing code inside the game (that once crashed a game);
 // it only patches system d3d9.dll functions whose address and bytes match a probe made in a separate process.
 syncMarker(){const v={...(this.waitTarget||{}),type:'waitMarker',active:!!this.waitTarget?.active&&this.enabled&&this.state.hookActive&&this.preferences?.hideWaitMarker===true},key=JSON.stringify(v);if(this.process&&key!==this.markerKey){this.markerKey=key;this.send(v);}}
 confirmReplacement(){if(this.enabled&&this.state.receivedText){this.verified=true;this.notify({replacementState:'user-verified'});}}
 select(id){this.verified=false;if(this.process&&typeof id==='string'&&this.state.hookThreads.some(t=>t.id===id)){this.trace('select id='+id+' replace='+this.enabled);this.send({type:'select',id,replace:this.enabled});}else{this.trace('select rejected id='+String(id));this.notify({hookMessage:'文本流尚未就绪，请重新扫描后选择'});}}
 rescan(){this.send({type:'rescan'});}
 // E246: style sampling pauses the embed replacement so the game draws one original line, then resumes it.
 suspendReplacement(on){if(!this.process||!this.enabled)return;if(on&&!this.suspended){this.suspended=true;this.trace('replacement paused for style sampling');this.send({type:'disable',reason:'style-sampling'});}else if(!on&&this.suspended){this.suspended=false;this.trace('replacement resumed after style sampling');this.send({type:'enable'});}}
 send(v){if(this.process?.stdin.writable)this.process.stdin.write(JSON.stringify(v)+'\n');}
 stop(dispose=true){this.embedModeSent=undefined;if(this.state?.embedTranslating)this.notify({embedTranslating:false});clearTimeout(this.skipBurst?.timer);this.skipBurst=null;this.islandSources.clear();this.islandDraw=null;this.islandDraws=[];this.islandDelivered=0;clearTimeout(this.islandTimer);clearTimeout(this.sourceTimer);clearTimeout(this.sourceDeadline);this.sourceDeadline=null;this.pendingSource=null;this.verified=false;this.retryAt=0;this.attempt=0;this.markerKey='';this.waitTarget=null;if(this.process){const old=this.process;this.send({type:'quit'});old.stdin.end();this.process=null;++this.serial;const timer=setTimeout(()=>{if(old.exitCode===null)old.kill();},2000);timer.unref?.();}this.enabled=false;this.notify({hookActive:false,processAttached:false,streamSelected:false,receivedText:false,replacementState:'disabled',hookSource:null,hookThreads:[],hookDrawCount:0,hookDrawAt:0});if(dispose){this.lastSource='';this.identity='';this.wanted=false;clearInterval(this.timer);}}
}
module.exports={HookNative,cleanSource,scriptSource,identifierNoise};
