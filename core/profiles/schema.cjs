// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 the type and range of every kernel key (core/profiles/defaults.cjs). A diff is data: the repo game/engine files,
   a signed official diff handed out by the relay (data/profiles/remote/<exeSha256>.json) and this PC's calibration all go
   through validate(). One bad key rejects the whole diff (a half-applied diff is a different, untested diff).
   A key added to defaults.cjs must be registered here too (validation/profile-layers.test.cjs checks every leaf). */
const nul=f=>v=>v===null||f(v);
const bool=v=>typeof v==='boolean';
const int=(lo,hi)=>v=>Number.isInteger(v)&&v>=lo&&v<=hi;
const num=(lo,hi)=>v=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
const oneOf=(...xs)=>v=>xs.includes(v);
const box=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===4&&['x','y','w','h'].every(k=>int(-20000,20000)(v[k]))&&v.w>0&&v.h>0;
function regexList(v){if(!Array.isArray(v)||v.length>32)return false;let safe;try{safe=require('../../services/adapter-packs.cjs').safeRegex;}catch{safe=null;}
 return v.every(s=>{if(typeof s!=='string'||!s||s.length>200)return false;if(safe)return !!safe(s,'u');try{new RegExp(s,'u');return true;}catch{return false;}});}
const SPEC={
 'placement.firstLineAnchor':nul(oneOf('glyph','box','page')),
 'placement.lineOffsetY':int(-400,400),
 'placement.drawWhileBlanking':bool,
 'placement.translationGrowsDown':bool,
 'page.effectFrames':nul(bool),
 'page.flowPage':nul(bool),
 'page.holdMs':nul(int(0,20000)),
 'choice.filters':regexList,
 'hide.textEffectsRead':bool,
 'hide.preflight':nul(bool),
 'hide.drawsHidden':nul(bool),
 'hide.engineTrial.enabled':nul(bool),
 'hide.engineTrial.unconfirmedLines':nul(int(1,10)),
 'hide.engineTrial.clickMs':nul(int(100,10000)),
 'hide.engineTrial.skipAside':nul(bool),
 'selfCheck.window':int(5,200),
 'selfCheck.minLines':int(1,200),
 'selfCheck.hideVisible':num(0,1),
 'selfCheck.dropRate':num(0,1),
 'selfCheck.repeatRate':num(0,1),
 'selfCheck.choiceMismatch':int(0,50),
 'selfCheck.positionPx':int(0,4000),
 'selfCheck.pairRate':num(0,1),
 'calibrate.positionSource':nul(oneOf('engine','glyph','ocr')),
 'calibrate.textBox':nul(box),
 'calibrate.hideMethod':nul(oneOf('engine','glyph','gpu','read')),
 'safeMode.redrawRate':nul(num(0,240)),
};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
/* dotted leaf keys of the kernel tree (a null or array default is a leaf) */
function leaves(tree,at=''){const out=[];for(const [k,v] of Object.entries(tree))if(plain(v))out.push(...leaves(v,at+k+'.'));else out.push(at+k);return out;}
/* {ok, errors:[...]} for a settings object of any layer: every key must be a kernel key with a valid value */
function validate(settings,DEFAULTS=require('./defaults.cjs')){const errors=[];if(settings===undefined)return {ok:true,errors};if(!plain(settings))return {ok:false,errors:['settings is not an object']};
 const walk=(v,base,at)=>{for(const [k,x] of Object.entries(v)){const key=at+k;if(!(k in base)){errors.push(key+': unknown key');continue;}
  if(plain(base[k])){if(!plain(x))errors.push(key+': not an object');else walk(x,base[k],key+'.');continue;}
  const check=SPEC[key];if(!check)errors.push(key+': no type registered');else if(!check(x))errors.push(key+': bad value '+JSON.stringify(x).slice(0,60));}};
 walk(settings,DEFAULTS,'');return {ok:!errors.length,errors};}
module.exports={SPEC,validate,leaves};
