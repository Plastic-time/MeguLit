// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 「差分只能是数据，绝不能带代码；服务端校验键和值域」) the value domain of every key of core/profiles/defaults.cjs.
   A game diff that comes from outside the repository (this PC's calibration, the relay's shared or official diff) passes clean()
   before it becomes a profile layer: unknown keys and values outside their domain are dropped (and listed), so shared data can
   only choose among the behaviours the kernel already has. The same file runs in the relay (relay/src/auto-profile.js) and in
   the app (services/auto-profile-feed.cjs). validation/profile-domains.test.cjs fails when a key of defaults.cjs has no domain.
   Kinds: enum (the listed values), bool, number [min,max] (nullable when listed), rect {x,y,w,h[,client]}, regexList (RegExp
   sources with flags 'u': no backreferences, no nested quantifiers, bounded size). */
const DOMAINS={
 'placement.firstLineAnchor':{enum:[null,'glyph','box','page']},
 'placement.lineOffsetY':{number:[-400,400]},
 'placement.drawWhileBlanking':{bool:true},
 'placement.translationGrowsDown':{bool:true},
 'page.effectFrames':{enum:[null,true,false]},
 'page.flowPage':{enum:[null,true,false]},
 'page.holdMs':{number:[0,20000],nullable:true},
 'choice.filters':{regexList:{max:20,chars:200}},
 'hide.textEffectsRead':{bool:true},
 'hide.preflight':{enum:[null,true,false]},
 'hide.drawsHidden':{enum:[null,true,false]},
 'selfCheck.window':{number:[5,200]},
 'selfCheck.minLines':{number:[1,200]},
 'selfCheck.hideVisible':{number:[0,1]},
 'selfCheck.dropRate':{number:[0,1]},
 'selfCheck.repeatRate':{number:[0,1]},
 'selfCheck.choiceMismatch':{number:[0,100]},
 'selfCheck.positionPx':{number:[0,4000]},
 'selfCheck.pairRate':{number:[0,1]},
 'calibrate.positionSource':{enum:[null,'engine','glyph','ocr']},
 'calibrate.textBox':{rect:true,nullable:true},
 'calibrate.hideMethod':{enum:[null,'hide','engine','glyph','gpu','read']},
 'safeMode.redrawRate':{number:[0,120],nullable:true},
};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
/* a RegExp source that cannot blow up: compiles, no backreference, no quantified group that itself repeats */
function safeRegex(src,chars=200){if(typeof src!=='string'||!src||src.length>chars)return false;if(/\\[1-9]|\\k</.test(src))return false;if(/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(src))return false;try{new RegExp(src,'u');return true;}catch{return false;}}
function okValue(d,v){
 if(v===null)return !!d.nullable||(d.enum||[]).includes(null);
 if(d.enum)return d.enum.includes(v);
 if(d.bool)return typeof v==='boolean';
 if(d.number)return typeof v==='number'&&Number.isFinite(v)&&v>=d.number[0]&&v<=d.number[1];
 if(d.rect){if(!plain(v))return false;const keys=Object.keys(v);if(!keys.every(k=>['x','y','w','h','client'].includes(k)))return false;
  if(!['x','y','w','h'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k])<=100000))return false;
  return v.client===undefined||Array.isArray(v.client)&&v.client.length===2&&v.client.every(n=>typeof n==='number'&&n>0&&n<=100000);}
 if(d.regexList)return Array.isArray(v)&&v.length<=d.regexList.max&&v.every(s=>safeRegex(s,d.regexList.chars));
 return false;}
/* settings (a nested layer) -> {value, rejected}: only domain keys with in-domain values survive */
function clean(settings){const value={},rejected=[];if(!plain(settings))return {value,rejected:settings==null?[]:['(not an object)']};
 for(const [group,inner] of Object.entries(settings)){if(!plain(inner)){rejected.push(group);continue;}
  for(const [k,v] of Object.entries(inner)){const p=group+'.'+k,d=DOMAINS[p];if(!d||!okValue(d,v)){rejected.push(p);continue;}(value[group]||(value[group]={}))[k]=Array.isArray(v)?v.slice():plain(v)?JSON.parse(JSON.stringify(v)):v;}}
 return {value,rejected};}
/* every leaf of a defaults tree (for the test that keeps DOMAINS complete) */
function leaves(tree,at=''){const out=[];for(const [k,v] of Object.entries(tree))if(plain(v))out.push(...leaves(v,at+k+'.'));else out.push(at+k);return out;}
module.exports={DOMAINS,clean,okValue,safeRegex,leaves};
