// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 只录一次：候选设置组合都拿这一份录制离线打分，不反复开游戏) the offline score of one cold-test recording.
   The recording is the run's own logs (hook-events.log, engine-draw.log, reader-host.log when there is one), parsed by the
   same parsers the live gate uses (core/self-check.cjs), so a cold score is what the gate would have said. Every candidate
   of core/auto-profile.cjs (position source, effect frames, choice filters, hide / read) is predicted over every self-check
   window of the recording (the search tools/diff-maker/search.cjs runs on a probe; it calls windows / evaluate / paramsOf
   from here), and the seed's own settings are scored too: that is the seed's mark.

   verdict:
     pass          the best hide candidate passes every window with room to spare: score, prints and diff go up, no picture
     edge          it passes, but a metric is within EDGE of its threshold: also 2-3 pictures (when the switch allows)
     fail          no hide candidate passes (read mode): also 2-3 pictures
     inconclusive  nothing to judge: the hidden desktop drew nothing (D3D full screen, owner 2026-11-21: 不算失败，留给被动
                   样本补), the hook saw too few lines, the run was stopped. Nothing is uploaded for it. */
const ap=require('../auto-profile.cjs');
const {DEFAULTS,parseTrace,parseReader}=require('../self-check.cjs');

const EDGE=.8;/* a metric at 80 % of its limit or worse is "on the edge" */
const TS=/^(\d{4}-\d\d-\d\dT[\d:.]+Z)\s+(.*)$/;

function thresholdsOf(profile){const t={...DEFAULTS};for(const [k,v] of Object.entries(profile?.selfCheck||{}))if(k in DEFAULTS&&Number.isFinite(+v))t[k]=+v;return t;}

/* the recording -> self-check events sorted by time */
function eventsOf({hookEvents='',readerHost='',engineDraw=''}={}){const ev=[];
 for(const text of [hookEvents,engineDraw])for(const raw of String(text||'').split(/\r?\n/)){if(!TS.test(raw))continue;const e=parseTrace(raw);if(e&&Number.isFinite(e.at))ev.push(e);}
 for(const raw of String(readerHost||'').split(/\r?\n/)){if(!raw.startsWith('{'))continue;const e=parseReader(raw);if(e&&Number.isFinite(e.at))ev.push(e);}
 return ev.sort((a,b)=>a.at-b.at);}

/* the events cut into self-check windows (a short tail counts only with minLines, or when it is the only one) */
function windows(events,t){const out=[];let cur=[],lines=0;
 for(const e of events){cur.push(e);if(e.kind==='line'&&++lines>=t.window){out.push(cur);cur=[];lines=0;}}
 if(cur.length&&(lines>=t.minLines||!out.length))out.push(cur);return out;}

function costOf(r,t){const m=r.metrics;let c=0;
 if(m.hideVisible!=null)c+=m.hideVisible/t.hideVisible;if(m.dropRate!=null)c+=m.dropRate/t.dropRate;if(m.repeatRate!=null)c+=m.repeatRate/t.repeatRate;
 c+=(m.choiceMismatch||0)/Math.max(1,t.choiceMismatch);if(m.positionPx!=null)c+=m.positionPx/(r.positionLimit||t.positionPx);if(m.pairRate!=null)c+=(1-m.pairRate)/(1-t.pairRate);return c;}
const worse=(k,a,b)=>a==null?b:b==null?a:k==='pairRate'?Math.min(a,b):Math.max(a,b);
/* one candidate over every window -> {pass, over, metrics (worst per metric), cost (mean), windows} */
function evaluate(events,params,t){const ws=windows(events,t).map((w,i)=>{const r=ap.predict(w,params,t);return {window:i+1,lines:r.lines,metrics:r.metrics,over:r.over,pass:r.pass,positionLimit:r.positionLimit};});
 const metrics={};for(const w of ws)for(const [k,v] of Object.entries(w.metrics))metrics[k]=k in metrics?worse(k,metrics[k],v):v;
 const over=[...new Set(ws.flatMap(w=>w.over))];
 const cost=ws.length?Math.round(ws.reduce((a,w)=>a+costOf(w,t),0)/ws.length*1000)/1000:0;
 const positionLimit=Math.min(...ws.map(w=>w.positionLimit||Infinity));
 return {pass:over.length===0,over,metrics,cost,windows:ws,positionLimit:Number.isFinite(positionLimit)?positionLimit:null};}
const changes=p=>(p.effectFrames!==null)+(p.filters!=='kernel');

/* the candidate params a diff's settings stand for */
function paramsOf(settings){const s=settings||{};const hide=s.calibrate?.hideMethod==='read'||s.hide?.textEffectsRead===true?'read':'hide';
 const anchor=s.placement?.firstLineAnchor;const positionSource=s.calibrate?.positionSource??(anchor==='glyph'?'glyph':anchor==='box'?'ocr':null);
 return {hideMethod:hide,positionSource:hide==='read'?null:positionSource,effectFrames:hide==='read'?null:(s.page?.effectFrames??null),filters:hide!=='read'&&Array.isArray(s.choice?.filters)&&s.choice.filters.length===0&&(require('../profiles/defaults.cjs').choice?.filters||[]).length>0?'none':'kernel'};}

function textBox(events){const b=events.filter(e=>e.kind==='box');if(b.length<3)return null;const x=Math.min(...b.map(e=>e.x)),y=Math.min(...b.map(e=>e.y)),r=Math.max(...b.map(e=>e.x+e.w)),bt=Math.max(...b.map(e=>e.y+e.h));return {x,y,w:r-x,h:bt-y,client:[b[0].cw,b[0].ch]};}

/* the measured settings of the winning candidate (a game diff layer: defaults.cjs keys only) */
function settingsOf(params,box){const p=params;const s={calibrate:{positionSource:p.positionSource,textBox:box,hideMethod:p.hideMethod},hide:{textEffectsRead:p.hideMethod==='read'}};
 if(p.effectFrames!==null)s.page={effectFrames:p.effectFrames};if(p.filters==='none')s.choice={filters:[]};
 if(p.positionSource==='glyph')s.placement={firstLineAnchor:'glyph'};else if(p.positionSource==='ocr')s.placement={firstLineAnchor:'box'};
 return s;}

/* how close a passing result runs to its limits: the worst metric as a share of its limit (1 = at the limit) */
function nearness(metrics,t,positionLimit){const m=metrics||{},share=[];
 if(m.hideVisible!=null)share.push(m.hideVisible/t.hideVisible);if(m.dropRate!=null)share.push(m.dropRate/t.dropRate);if(m.repeatRate!=null)share.push(m.repeatRate/t.repeatRate);
 if(m.choiceMismatch)share.push(m.choiceMismatch/Math.max(1,t.choiceMismatch));if(m.positionPx!=null)share.push(m.positionPx/(positionLimit||t.positionPx));
 if(m.pairRate!=null)share.push((1-m.pairRate)/(1-t.pairRate));return share.length?Math.round(Math.max(...share)*1000)/1000:0;}

/* recording -> {lines, thresholds, best, seed, candidates, settings, mode, near} ; seedSettings: the settings the game ran with */
function score(events,{profile=null,seedSettings=null}={}){const t=thresholdsOf(profile);const lines=events.filter(e=>e.kind==='line').length;
 const sources=events.some(e=>e.kind==='box')?['engine']:[];
 const all=ap.candidates(sources).map(p=>({params:p,...evaluate(events,p,t)}));
 const hide=all.filter(c=>c.params.hideMethod==='hide');
 const passing=hide.filter(c=>c.pass).sort((a,b)=>a.cost-b.cost||changes(a.params)-changes(b.params));
 const best=passing[0]||all.find(c=>c.params.hideMethod==='read');
 const box=textBox(events);
 let seed=null;if(seedSettings){const p=paramsOf(seedSettings);const r=evaluate(events,p,t);seed={params:p,pass:r.pass,over:r.over,metrics:r.metrics,cost:r.cost};}
 const brief=c=>({params:c.params,pass:c.pass,over:c.over,metrics:c.metrics,cost:c.cost});
 return {lines,windows:windows(events,t).length,thresholds:t,best:brief(best),seed,candidates:all.sort((a,b)=>a.cost-b.cost).slice(0,8).map(brief),
  /* what this recording could measure at all (no reader in a cold run: drawn / hide / pair metrics come only when it logged them) */
  measured:Object.entries((best.params.hideMethod==='read'?hide.slice().sort((x,y)=>x.over.length-y.over.length||x.cost-y.cost)[0]||best:best).metrics).filter(([k,v])=>v!=null&&(k!=='choiceMismatch'||events.some(e=>e.kind==='choice'))).map(([k])=>k),
  mode:best.params.hideMethod,settings:settingsOf(best.params,box),near:best.params.hideMethod==='hide'?nearness(best.metrics,t,best.positionLimit):1,
  worst:hide.slice().sort((a,b)=>a.over.length-b.over.length||a.cost-b.cost)[0]?.over||[]};}

/* run facts + score -> {verdict, why}. run: {stopped:'input'|'battery'|…|'', black, relaunched, lines} */
function verdict(result,run={},{minLines=DEFAULTS.minLines}={}){
 if(run.stopped)return {verdict:'inconclusive',why:'stopped:'+run.stopped};
 if(run.relaunched)return {verdict:'inconclusive',why:'steam-relaunch'};
 const lines=result?.lines|0;
 if(run.black&&lines<minLines)return {verdict:'inconclusive',why:'black-screen'};
 if(!lines)return {verdict:'inconclusive',why:'no-lines'};
 if(lines<minLines)return {verdict:'inconclusive',why:'few-lines'};
 if(result.mode==='read')return {verdict:'fail',why:(result.worst||[]).join(',')||'read'};
 if(result.near>=EDGE)return {verdict:'edge',why:'near '+result.near};
 return {verdict:'pass',why:''};}

/* 2026-11-21 (owner: 过线只传分数、指纹、差分，截图不出本机；没过线或边缘才附 2 到 3 张，开关关了一张都不传)
   shots: local picture files in order; -> the ones to upload (2-3, spread over the run) */
function shotsToUpload(v,shots,{shotsOn=true,shareOn=true}={}){if(!shotsOn||!shareOn)return [];if(v!=='fail'&&v!=='edge')return [];
 const list=(shots||[]).filter(Boolean);if(list.length<=3)return list.slice();
 const pick=[0,Math.floor((list.length-1)/2),list.length-1];return [...new Set(pick)].map(i=>list[i]);}

module.exports={EDGE,thresholdsOf,eventsOf,windows,evaluate,costOf,paramsOf,settingsOf,textBox,nearness,score,verdict,shotsToUpload};
