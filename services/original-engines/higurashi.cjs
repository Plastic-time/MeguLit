// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E341 07th Expansion / MangaGamer Unity engine (Steam ひぐらしのなく頃に 奉). The scenario is plain text in
   <name>_Data/StreamingAssets/Scripts/*.txt; every displayed piece is one call with both languages:
     OutputLine(<日本語の名前|NULL>, "日本語", <English name|NULL>, "English", Line_WaitForInput);
   The Japanese string is the line (a sentence is often split over several calls and drawn one after another; the
   matcher joins consecutive lines). The second string is the translation slot: a Chinese patch puts its Chinese there,
   the stock release English, which is left alone (zero-latency translation then machine-translates the Japanese).
   <size=..> style tags are dropped; \" and \n are unescaped. */
const fs=require('node:fs'),path=require('node:path');
const KANA=/[ぁ-ゖァ-ヺ]/;
const STR='"((?:[^"\\\\]|\\\\.)*)"',ARG='(?:NULL|'+STR+')';
const CALL=new RegExp('OutputLine\\(\\s*'+ARG+'\\s*,\\s*'+STR+'\\s*,\\s*'+ARG+'\\s*,\\s*'+STR+'\\s*,\\s*(Line_\\w+)\\s*\\)','g');
const unq=s=>s.replace(/\\n/g,'\n').replace(/\\(.)/g,'$1');
const clean=s=>unq(s).replace(/<[^>]*>/g,'');
// StreamingAssets/Scripts folders of the <name>_Data folders beside the program.
function scriptDirs(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
 return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name,'StreamingAssets','Scripts')).filter(d=>{try{return fs.statSync(d).isDirectory();}catch{return false;}});}
const TXT=n=>/\.txt$/i.test(n);
const chinese=t=>/[一-鿿]/.test(t)&&!KANA.test(t);
function parse(buf){const text=buf.toString('utf8'),lines=[],zh=[],anchors=[];let m;CALL.lastIndex=0;
 while((m=CALL.exec(text))){const ja=clean(m[2]);if(!ja.trim())continue;lines.push(ja);const other=clean(m[4]);zh.push(chinese(other)?other:'');}
 for(const a of text.matchAll(/^\s*(?:void\s+\w+|(?:Jump|Call)\w*\([^)]*\))/gm))anchors.push(a[0].trim());
 return {lines,anchors,zh};}
const higurashi={
 id:'higurashi',hint:'StreamingAssets\\Scripts\\*.txt',
 scenes(dir){const out=[];
  for(const d of scriptDirs(dir)){let files=[];try{files=fs.readdirSync(d).filter(TXT);}catch{}
   for(const f of files)out.push({name:f,read:()=>fs.readFileSync(path.join(d,f))});}
  return out.sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>scriptDirs(dir).flatMap(d=>{try{return fs.readdirSync(d).filter(TXT).map(f=>path.join(d,f));}catch{return [];}}),
 parse,test:()=>false,
 // A Chinese patch's text in the second slot is the translation; English is not.
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{clean},
};
module.exports=higurashi;
