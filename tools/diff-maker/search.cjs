// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: offline search over the tunable keys of a game diff, scored with the self-check metrics.
   The prediction of one candidate is core/auto-profile.cjs predict() (what the kernel does with that key, applied to the
   recorded events) and the metrics are core/self-check.cjs; here they run over every self-check window of the whole replay
   (WINDOW hook lines each), not only the first, and a candidate passes only when every window passes.

   Tunable keys and their candidates:
     calibrate.positionSource  sources the replay measured ('engine' when engine first boxes exist)
     calibrate.textBox         union of the engine's first boxes (derived)
     page.effectFrames         null | true
     choice.filters            kernel | []
     calibrate.hideMethod      'hide' | 'read' (hide.textEffectsRead follows)
     role.map                  an identity no engine rule names gets the role its texts have in the script (proposal)
   The best passing hide candidate wins (lowest cost, then fewest changed keys); none passing -> read mode. */
const ap=require('../../core/auto-profile.cjs');
const {DEFAULTS}=require('../../core/self-check.cjs');
const Role=require('../../core/draw-role.cjs');
const Scripts=require('./scripts.cjs');
const {fold}=require('./samples.cjs');

function thresholdsOf(profile){const t={...DEFAULTS};for(const [k,v] of Object.entries(profile?.selfCheck||{}))if(k in DEFAULTS&&Number.isFinite(+v))t[k]=+v;return t;}

/* the replay's events cut into self-check windows (a short tail counts only when it has minLines, or when it is the only one) */
function windows(events,t){const out=[];let cur=[],lines=0;
 for(const e of events){cur.push(e);if(e.kind==='line'&&++lines>=t.window){out.push(cur);cur=[];lines=0;}}
 if(cur.length&&(lines>=t.minLines||!out.length))out.push(cur);return out;}

const worse=(k,a,b)=>a==null?b:b==null?a:k==='pairRate'?Math.min(a,b):Math.max(a,b);
/* one candidate over every window -> {pass, over, metrics (worst per metric), cost (mean), windows:[...]} */
function evaluate(events,params,t){const ws=windows(events,t).map((w,i)=>{const r=ap.predict(w,params,t);return {window:i+1,lines:r.lines,metrics:r.metrics,over:r.over,pass:r.pass,positionLimit:r.positionLimit};});
 const metrics={};for(const w of ws)for(const [k,v] of Object.entries(w.metrics))metrics[k]=k in metrics?worse(k,metrics[k],v):v;
 const over=[...new Set(ws.flatMap(w=>w.over))];
 const cost=ws.length?Math.round(ws.reduce((a,w)=>a+costOf(w,t),0)/ws.length*1000)/1000:0;
 return {pass:over.length===0,over,metrics,cost,windows:ws};}
function costOf(r,t){const m=r.metrics;let c=0;
 if(m.hideVisible!=null)c+=m.hideVisible/t.hideVisible;if(m.dropRate!=null)c+=m.dropRate/t.dropRate;if(m.repeatRate!=null)c+=m.repeatRate/t.repeatRate;
 c+=(m.choiceMismatch||0)/Math.max(1,t.choiceMismatch);if(m.positionPx!=null)c+=m.positionPx/(r.positionLimit||t.positionPx);if(m.pairRate!=null)c+=(1-m.pairRate)/(1-t.pairRate);return c;}
const changes=p=>(p.effectFrames!==null)+(p.filters!=='kernel');

function textBox(events){const b=events.filter(e=>e.kind==='box');if(b.length<3)return null;const x=Math.min(...b.map(e=>e.x)),y=Math.min(...b.map(e=>e.y)),r=Math.max(...b.map(e=>e.x+e.w)),bt=Math.max(...b.map(e=>e.y+e.h));return {x,y,w:r-x,h:bt-y,client:[b[0].cw,b[0].ch]};}

/* candidate params a diff's settings stand for (the fixture replays a diff with these) */
function paramsOf(settings){const s=settings||{};const hide=s.calibrate?.hideMethod==='read'||s.hide?.textEffectsRead===true?'read':'hide';
 const anchor=s.placement?.firstLineAnchor;const positionSource=s.calibrate?.positionSource??(anchor==='glyph'?'glyph':anchor==='box'?'ocr':null);
 return {hideMethod:hide,positionSource:hide==='read'?null:positionSource,effectFrames:hide==='read'?null:(s.page?.effectFrames??null),filters:hide!=='read'&&Array.isArray(s.choice?.filters)&&s.choice.filters.length===0?'none':'kernel'};}

/* every draw identity of the replay with its role under the profile, its counts and where its texts sit in the script */
function roles(draws,profile,ix){const by=new Map();
 for(const d of draws){const label=Role.label(d.id);let r=by.get(label);if(!r){const c=Role.classify(profile,d.id);r={label,id:d.id,role:c.role,by:c.by,draws:0,lines:0,aux:0,added:0,choices:0,texts:[],script:{dialogue:0,choice:0,ui:0,none:0}};by.set(label,r);}
  r.draws++;if(d.kind==='line')r.lines++;if(d.kind==='aux'){r.aux++;r.added+=d.added||0;}if(d.kind==='choice')r.choices++;
  for(const t of d.kind==='choice'?d.items:[d.text]){if(!t)continue;if(r.texts.length<6&&!r.texts.includes(t))r.texts.push(t.slice(0,40));if(ix&&ix.files){const w=Scripts.whereIs(ix,t);r.script[w==='choice'?'choice':w||'none']++;}}}
 return [...by.values()].sort((a,b)=>b.draws-a.draws);}

/* the role the script gives an identity's texts (proposal for an identity no rule names, or one named only by a base class) */
function proposeRole(r){const s=r.script,n=s.dialogue+s.choice+s.ui+s.none;if(!n)return null;
 if(s.choice+s.ui>=n*0.6)return 'ui';if(s.dialogue>=n*0.6)return 'dialogue';if(s.none>=n*0.8)return 'system';return null;}
/* weak: classified only by a fallback, a pattern, or the bottom base class (Window_Base, a plain layer) */
const WEAK=/^(fallback|pattern:|class:Window_Base$|class:Window_Selectable$|layer:art$)/;

/* script pairing: share of the dialogue lines the replay shows (reader 'drawn', RPG Maker lines) found in the script */
function scriptPair(rep,ix){if(!ix||!ix.dialogue.size)return null;const texts=[...rep.events.filter(e=>e.kind==='drawn').map(e=>e.text),...rep.draws.filter(d=>d.kind==='line'&&d.text).map(d=>d.text)].filter(t=>[...fold(t)].length>=2);
 const uniq=[...new Set(texts)];if(!uniq.length)return null;const found=uniq.filter(t=>Scripts.whereIs(ix,t)==='dialogue').length;return {lines:uniq.length,found,rate:Math.round(found/uniq.length*1000)/1000};}

function search(rep,profile,ix){const t=thresholdsOf(profile);
 const sources=rep.events.some(e=>e.kind==='box')?['engine']:[];
 const all=ap.candidates(sources).map(p=>({params:p,...evaluate(rep.events,p,t)}));
 const hide=all.filter(c=>c.params.hideMethod==='hide');
 const passing=hide.filter(c=>c.pass).sort((a,b)=>a.cost-b.cost||changes(a.params)-changes(b.params));
 const best=passing[0]||all.find(c=>c.params.hideMethod==='read');
 const hideBest=hide.slice().sort((a,b)=>a.over.length-b.over.length||a.cost-b.cost)[0]||null;
 /* per key: which values pass at all (the report's table) */
 const perKey={};for(const [key,get] of [['positionSource',p=>p.positionSource],['effectFrames',p=>p.effectFrames],['filters',p=>p.filters]]){perKey[key]={};
  for(const c of hide){const v=String(get(c.params));const cur=perKey[key][v];if(!cur||(c.pass&&!cur.pass)||(c.pass===cur.pass&&c.cost<cur.cost))perKey[key][v]={pass:c.pass,cost:c.cost,over:c.over};}}
 const ident=roles(rep.draws,profile,ix);
 const proposals={};for(const r of ident){if(r.id.src==='kernel'||(r.role&&!WEAK.test(r.by)))continue;const p=proposeRole(r);if(p&&p!==r.role)proposals[r.id.cls?.[0]?'class:'+r.id.cls[0]:Role.keys(r.id)[0]]=p;}
 return {thresholds:t,best,hideBest,candidates:all.sort((a,b)=>a.cost-b.cost),perKey,textBox:textBox(rep.events),roles:ident,proposals,scriptPair:scriptPair(rep,ix)};}

/* the measured settings (a game diff layer: defaults.cjs keys only) */
function settingsOf(result){const p=result.best.params;const s={calibrate:{positionSource:p.positionSource,textBox:result.textBox,hideMethod:p.hideMethod},hide:{textEffectsRead:p.hideMethod==='read'}};
 if(p.effectFrames!==null)s.page={effectFrames:p.effectFrames};if(p.filters==='none')s.choice={filters:[]};
 if(p.positionSource==='glyph')s.placement={firstLineAnchor:'glyph'};else if(p.positionSource==='ocr')s.placement={firstLineAnchor:'box'};
 if(Object.keys(result.proposals).length)s.role={map:{...result.proposals}};return s;}
module.exports={search,evaluate,windows,paramsOf,settingsOf,roles,thresholdsOf,WEAK};
