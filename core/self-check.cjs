// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「任何指标不过线就自动退回读模式，保证永远不出现漏句、没选项、日文没了这类坏状态」) the runtime self-check gate.
   It reads the same events MeguLit already writes to its logs (hook-events.log lines from HookNative.trace, reader-host.log
   messages), so a replay of the owner's logs is exactly what ran on his PC. Every WINDOW hook lines (default 20) it closes a
   window and scores six metrics; any metric over its threshold makes the game step down one level: hide+redraw -> read mode.

   metric        what it counts (per window)                                                         default threshold
   hideVisible   hook lines whose hide check (hookVisual stage=hidden, valid) still read Japanese       > 25 % of checked lines (>= 4 checked)
   dropRate      hook lines core gave up on (never reached the reader; redrawn lines are not drops)   > 15 % of hook lines
   repeatRate    lines the reader drew a second time (same text, >= 6 chars, within the window)        > 10 % of drawn lines
   choiceMismatch choice events where the engine/hooks had >= 2 options and the reader kept < 2         > 1 event
   positionPx    median |engine first box top - reader first glyph top| (game client px)             > max(96, 3 x glyph height), >= 5 samples
   pairRate      glyph pairing (layoutDiagnostic textEffects paired/(paired+orphan)) and, when a group  < 80 % (>= 6 counted)
                 patch delivers lines, patch lines / hook lines
   The thresholds live in the kernel layer (DEFAULTS below, mirrored as selfCheck.* in core/profiles/defaults.cjs); an engine or game
   diff may override them (profile.selfCheck). The first window of a game without a stored diff is also the calibration recording
   (core/auto-profile.cjs). Pure: no file or UI access here; services/reader.cjs owns the live session. */

const DEFAULTS=Object.freeze({window:20,minLines:8,hideVisible:.25,hideMinChecked:4,dropRate:.15,repeatRate:.1,repeatMinChars:6,choiceMismatch:1,positionPx:96,positionGlyphs:3,positionMinSamples:5,pairRate:.8,pairMinCounted:6});
const METRICS=['hideVisible','dropRate','repeatRate','choiceMismatch','positionPx','pairRate'];
const REASONS={hideVisible:'隐藏后扫描区仍能识别到日文原文',dropRate:'有台词没有画到阅读层（漏句）',repeatRate:'同一句被画了不止一次（复读）',choiceMismatch:'游戏有选项，阅读层画出的选项数对不上',positionPx:'画的日文位置和游戏原文位置偏差过大',pairRate:'游戏原文和阅读层的句子对不上（配对率低）'};

const TS=/^\d{4}-\d\d-\d\dT[\d:.]+Z\s+/;
const fold=s=>[...String(s||'').normalize('NFKC')].filter(c=>!/[\s　]/.test(c)).join('');
/* an effect frame: the game repaints one line char by char (fade/whisper), the hook gets the frames glued ("を私呼ぶを私声呼ぶ...") */
function effectFrame(text){const cs=[...fold(text)];if(cs.length<8)return false;return cs.length/new Set(cs).size>=1.6;}

/* one hook-events.log message (timestamp optional) -> a normalized event or null */
function parseTrace(line){let s=String(line||'');const ts=TS.exec(s);const at=ts?Date.parse(ts[0].trim()):NaN;if(ts)s=s.slice(ts[0].length);s=s.replace(/\r?\n$/,'');
 let m;
 if(s.startsWith('selfCheck'))return null;
 if((m=/^source chars=(\d+) sequence=(\d+)/.exec(s)))return {kind:'line',at,chars:+m[1],seq:+m[2]};
 /* 2026-11-21 (fata-effects, main b64cb137): core no longer drops a hook line it cannot find on the page, it delivers it from the hook
    text ("drawn off the page layer, delivered from the hook text": the reader redraws it, counted apart as redrawn, never a drop);
    "already read, skipped" is a line the reader showed before (no drop either). A drop is any other hook line core gave up on
    ("... hook line ... dropped", the old "drawn nowhere on the page, dropped" of logs before b64cb137 included); a menu/help page
    dropped on purpose is not one. */
 if((m=/delivered from the hook text chars=(\d+)/.exec(s)))return {kind:'redrawn',at,chars:+m[1]};
 if(/already read, skipped/.test(s))return null;
 if((m=/hook line\b.*\bdropped\b(?:.*?chars=(\d+))?/.exec(s))&&!/menu|help|not a story line/.test(s))return {kind:'drop',at,chars:+(m[1]||0)};
 if((m=/^visual (\{.*\})\s*$/.exec(s))){try{const v=JSON.parse(m[1]);if(v.type==='hookVisual'&&v.stage==='hidden'&&v.valid===true)return {kind:'hide',at,seq:+v.sequence||0,visible:v.matched===true};}catch{}return null;}
 if((m=/^choice options filtered (\d+) -> (\d+)/.exec(s)))return {kind:'choice',at,raw:+m[1],shown:+m[2]};
 if((m=/^choice aux .*? added=(\[.*?\]) text=/.exec(s))){let added=[];try{added=JSON.parse(m[1]);}catch{}return added.length?{kind:'aux',at,texts:added.map(String)}:null;}
 if((m=/^placement placed: line (\d+), (\d+) characters, first box (-?\d+),(-?\d+),(\d+),(\d+) in client (\d+)x(\d+)/.exec(s)))return {kind:'box',at,line:+m[1],x:+m[3],y:+m[4],w:+m[5],h:+m[6],cw:+m[7],ch:+m[8]};
 return null;}
/* one reader-host.log message (object or JSON line) -> a normalized event or null */
function parseReader(msg){let v=msg;if(typeof v==='string'){try{v=JSON.parse(v);}catch{return null;}}if(!v||typeof v!=='object')return null;const at=Date.parse(v.at||'');
 if(v.type==='layoutDiagnostic'&&!v.kind&&typeof v.text==='string')return {kind:'drawn',at,text:v.text,top:Number(v.firstGlyphTop),clientY:Number(v.clientY),glyph:Number(v.firstGlyphHeight)};
 if(v.type==='layoutDiagnostic'&&v.kind==='textEffects')return {kind:'pair',at,paired:+v.paired||0,orphan:+v.orphan||0};
 if(v.type==='patchLine')return {kind:'patch',at};
 return null;}

const median=a=>{if(!a.length)return 0;const s=a.slice().sort((x,y)=>x-y),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;};
function emptyWindow(n){return {n,lines:0,drops:0,redrawn:0,checked:new Map(),drawn:[],repeats:0,choices:[],positions:[],glyphs:[],pair:null,patch:0,effects:0,firstAt:NaN,lastAt:NaN};}

class SelfCheck{
 /* thresholds: DEFAULTS overridden by profile.selfCheck; onWindow(result) after each closed window; record: keep the per-line
    recording of the first window for calibration */
 constructor({thresholds={},onWindow=null,record=true}={}){this.t={...DEFAULTS};for(const [k,v] of Object.entries(thresholds||{}))if(k in DEFAULTS&&Number.isFinite(+v))this.t[k]=+v;
  this.onWindow=onWindow;this.record=record;this.windows=[];this.w=emptyWindow(1);this.recording=record?[]:null;this.lastBox=null;this.prevPair=null;this.tripped=null;}
 trace(line){const e=parseTrace(line);if(e)this.event(e);return e;}
 reader(msg){const e=parseReader(msg);if(e)this.event(e);return e;}
 event(e){const w=this.w;if(Number.isFinite(e.at)){if(!Number.isFinite(w.firstAt))w.firstAt=e.at;w.lastAt=e.at;}
  if(this.recording&&this.recording.length<4000&&this.windows.length===0)this.recording.push(e);
  switch(e.kind){
   case 'line':w.lines++;break;
   case 'drop':w.drops++;break;
   case 'redrawn':w.redrawn++;break;
   case 'hide':{const was=w.checked.get(e.seq);w.checked.set(e.seq,was===true||e.visible);break;}
   case 'choice':w.choices.push({raw:e.raw,shown:e.shown});break;
   case 'aux':for(const t of e.texts)if(effectFrame(t))w.effects++;break;
   case 'box':this.lastBox=e;break;
   case 'drawn':{const key=fold(e.text);if([...key].length>=this.t.repeatMinChars&&w.drawn.includes(key))w.repeats++;w.drawn.push(key);
    const b=this.lastBox;if(b&&e.top>=0&&e.clientY>=0&&(!Number.isFinite(e.at)||!Number.isFinite(b.at)||Math.abs(e.at-b.at)<=5000)){w.positions.push(Math.abs((e.top-e.clientY)-b.y));if(e.glyph>0)w.glyphs.push(e.glyph);}
    break;}
   case 'pair':{/* counters are cumulative per game: the window takes the difference */const p=this.prevPair||{paired:0,orphan:0};const d={paired:Math.max(0,e.paired-p.paired),orphan:Math.max(0,e.orphan-p.orphan)};
    if(e.paired<p.paired||e.orphan<p.orphan){d.paired=e.paired;d.orphan=e.orphan;}this.prevPair={paired:e.paired,orphan:e.orphan};w.pair=w.pair||{paired:0,orphan:0};w.pair.paired+=d.paired;w.pair.orphan+=d.orphan;break;}
   case 'patch':w.patch++;break;}
  if(e.kind==='line'&&w.lines>=this.t.window)return this.close();
  return null;}
 /* scores of one window: value per metric (null = not enough evidence), and which ones are over */
 score(w=this.w){const t=this.t,v={};const checked=[...w.checked.values()];
  v.hideVisible=checked.length>=t.hideMinChecked?checked.filter(Boolean).length/checked.length:null;
  v.dropRate=w.lines+w.drops>0?w.drops/(w.lines+w.drops):null;
  v.repeatRate=w.drawn.length?w.repeats/w.drawn.length:null;
  v.choiceMismatch=w.choices.filter(c=>c.raw>=2&&c.shown<2).length;
  v.positionPx=w.positions.length>=t.positionMinSamples?Math.round(median(w.positions)):null;
  const pairN=w.pair?w.pair.paired+w.pair.orphan:0;let pair=pairN>=t.pairMinCounted?w.pair.paired/pairN:null;
  if(w.patch>0&&w.lines>=t.minLines){const pr=Math.min(1,w.patch/w.lines);pair=pair==null?pr:Math.min(pair,pr);}v.pairRate=pair;
  const posLimit=Math.max(t.positionPx,t.positionGlyphs*(median(w.glyphs)||0));
  const over=[];
  if(v.hideVisible!=null&&v.hideVisible>t.hideVisible)over.push('hideVisible');
  if(v.dropRate!=null&&v.dropRate>t.dropRate)over.push('dropRate');
  if(v.repeatRate!=null&&v.repeatRate>t.repeatRate)over.push('repeatRate');
  if(v.choiceMismatch>t.choiceMismatch)over.push('choiceMismatch');
  if(v.positionPx!=null&&v.positionPx>posLimit)over.push('positionPx');
  if(v.pairRate!=null&&v.pairRate<t.pairRate)over.push('pairRate');
  for(const k of ['hideVisible','dropRate','repeatRate','pairRate'])if(v[k]!=null)v[k]=Math.round(v[k]*1000)/1000;
  return {window:w.n,lines:w.lines,drops:w.drops,redrawn:w.redrawn,checked:checked.length,drawn:w.drawn.length,choices:w.choices.length,effects:w.effects,positionLimit:posLimit,metrics:v,over,pass:over.length===0};}
 /* closes the current window (also at game end with >= minLines lines): the result goes to onWindow */
 close(final=false){const w=this.w;if(final&&w.lines<this.t.minLines)return null;const r=this.score(w);r.final=!!final;this.windows.push(r);this.w=emptyWindow(w.n+1);
  if(!r.pass&&!this.tripped)this.tripped={window:r.window,over:r.over,metrics:r.metrics,reason:reasonText(r.over)};
  try{this.onWindow?.(r,this);}catch{}return r;}
 flush(){return this.close(true);}
 summary(){const all=this.windows;return {windows:all.length,lines:all.reduce((a,r)=>a+r.lines,0),tripped:this.tripped,last:all[all.length-1]||null};}
}
function reasonText(over){return (over||[]).map(k=>REASONS[k]||k).join('；');}
/* the one trace line per window (hook-events.log) */
function traceLine(r){const m=r.metrics,f=v=>v==null?'-':v;return 'selfCheck window='+r.window+' lines='+r.lines+' hide='+f(m.hideVisible)+' drop='+f(m.dropRate)+' repeat='+f(m.repeatRate)+' choice='+m.choiceMismatch+' pos='+f(m.positionPx)+' pair='+f(m.pairRate)+(r.redrawn?' redrawn='+r.redrawn:'')+(r.pass?' pass':' over='+r.over.join(','));}
/* replay of log text (hook-events.log + reader-host.log, any order): events merged by time, between from and to (ISO, optional) */
function replay(hookEvents,readerHost,{from='',to='',thresholds}={}){const ev=[];
 for(const l of String(hookEvents||'').split(/\r?\n/)){const at=l.slice(0,24);if(!TS.test(l)||(from&&at<from)||(to&&at>=to))continue;const e=parseTrace(l);if(e)ev.push(e);}
 for(const l of String(readerHost||'').split(/\r?\n/)){if(!l.startsWith('{'))continue;let v;try{v=JSON.parse(l);}catch{continue;}const at=String(v.at||'');if((from&&at<from)||(to&&at>=to))continue;const e=parseReader(v);if(e)ev.push(e);}
 ev.sort((a,b)=>(a.at||0)-(b.at||0));const sc=new SelfCheck({thresholds});for(const e of ev)sc.event(e);sc.flush();return sc;}
module.exports={SelfCheck,DEFAULTS,METRICS,REASONS,parseTrace,parseReader,effectFrame,reasonText,traceLine,replay};
