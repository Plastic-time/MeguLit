// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E282: reads every scene file of a cx-encrypted KiriKiri Z archive once, off the main thread, and stores the text as
// JSON next to MeguLit's other caches. Each text keeps its language slots (Japanese, English, Simplified, Traditional).
const {workerData,parentPort}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const xp3=require('./xp3.cjs'),psb=require('./psb.cjs');
// Ruby is written "[reading]kanji"; line breaks are a literal \n.
const clean=s=>typeof s==='string'?s.replace(/\[[^\]]*\]/g,'').replace(/\\n/g,'\n'):'';
// The game's own readings (user: game ruby first): "[し]志[な]那[つ]都荘" puts a reading on each following character. A
// reading padded with full-width spaces ("[　げんじ　]玄[　ゅう]十") belongs to a word spread over several characters, so
// those characters are joined into one base with one reading.
const padded=r=>/^[\s　]|[\s　]$/.test(r);
function rubyOf(s){
 if(typeof s!=='string'||!s.includes('['))return [];
 const marks=[...s.matchAll(/\[([^\]]*)\](.)/gu)].map(m=>({at:m.index,end:m.index+m[0].length,reading:m[1],base:m[2]})),out=[];
 for(let i=0;i<marks.length;i++){const m=marks[i];
  if(padded(m.reading)){let base=m.base,reading=m.reading,j=i;
   while(j+1<marks.length&&marks[j+1].at===marks[j].end&&padded(marks[j+1].reading)){j++;base+=marks[j].base;reading+=marks[j].reading;}
   reading=reading.replace(/[\s　]/g,'');if(/[ぁ-ヿ]/.test(reading))out.push([base,reading]);i=j;continue;}
  // Neighbouring single readings make one word (志那都 → しなつ): learned per work, a lone 都 → つ would misread 都会.
  let base=m.base,reading=m.reading,j=i;
  while(j+1<marks.length&&marks[j+1].at===marks[j].end&&!padded(marks[j+1].reading)){j++;base+=marks[j].base;reading+=marks[j].reading;}
  if(/[ぁ-ヿ]/.test(reading))out.push([base,reading]);i=j;}
 return out;
}
function textsOf(doc){
 const scenes=[];
 for(const scene of Array.isArray(doc.root?.scenes)?doc.root.scenes:[]){
  const rows=[],ruby=[];
  for(const t of Array.isArray(scene?.texts)?scene.texts:[]){if(!Array.isArray(t))continue;const slots=t[2];
   if(Array.isArray(slots)){rows.push(slots.map(s=>Array.isArray(s)?clean(s[1]):''));ruby.push(rubyOf(Array.isArray(slots[0])?slots[0][1]:''));}
   else if(typeof slots==='string'){rows.push([clean(slots)]);ruby.push(rubyOf(slots));}}
  if(rows.length)scenes.push({label:typeof scene.label==='string'?scene.label:'',rows,ruby});
 }
 return scenes;
}
function build(file){
 const list=xp3.list(file),docs=[];if(!list)return {docs,files:0};let tried=0;
 for(const entry of list.files){
  let raw;try{raw=xp3.read(file,entry);}catch{continue;}
  if(raw.length<0x40||(raw[1]^raw[3])!==0x53||(raw[2]^raw[3])!==0x42)continue;tried++;
  const doc=psb.openCx(raw);if(!doc)continue;const scenes=textsOf(doc);
  if(scenes.length)docs.push({entry:entry.name,name:typeof doc.root.name==='string'?doc.root.name:'',scenes});
 }
 return {docs,files:tried};
}
if(parentPort&&workerData){
 const {file,out}=workerData;
 try{const result=build(file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out+'.tmp',JSON.stringify({schema:1,file,...result}));fs.renameSync(out+'.tmp',out);parentPort.postMessage({ok:true,docs:result.docs.length});}
 catch(error){parentPort.postMessage({ok:false,error:String(error?.message||error)});}
}
module.exports={build,textsOf,clean,rubyOf};
