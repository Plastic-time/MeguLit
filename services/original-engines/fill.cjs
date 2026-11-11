// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 Filled translations (user, 2026-11-11: every line of a game with a Chinese release has Chinese; a line the
   release itself leaves without one gets a translation written in the style of that release, marked as ours).
   filled.json maps the SHA-1 of a Japanese line (the text as the readers return it) to its Chinese, so no game text is
   stored here. Shared by every engine: scenes.read() fills its zh column, the patch builder fills lines the patch kept
   in Japanese. Each filled line is reported with source 'filled'; lines from the release keep source 'release'.
   Asset names some scripts push as text (ギター.tga, ライブシーン.ani) are not lines: source 'asset', no Chinese. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
let table=null;
function entries(){if(table)return table;try{table=JSON.parse(fs.readFileSync(path.join(__dirname,'filled.json'),'utf8')).lines||{};}catch{table={};}return table;}
const key=t=>crypto.createHash('sha1').update(String(t).normalize('NFC'),'utf8').digest('hex');
const ASSET=/^[^\s「」『』（）]{1,40}\.(?:tga|ani|png|bmp|jpg|ogg|wav|mpg|wmv|psd)$/i;
function lookup(ja){if(ASSET.test(ja))return {zh:'',source:'asset'};const t=entries()[key(ja)];return t?{zh:t,source:'filled'}:null;}
// A parsed scene with a zh column: fills the gaps, adds zhSource (release / filled / asset / '').
function scene(s){if(!s||!Array.isArray(s.lines)||!Array.isArray(s.zh))return s;const zh=s.zh.slice(),src=[];
 s.lines.forEach((ja,i)=>{if(zh[i]){src[i]='release';return;}const f=lookup(ja);if(f){zh[i]=f.zh;src[i]=f.source;}else src[i]='';});
 return {...s,zh,zhSource:src};}
module.exports={lookup,scene,key,ASSET,_entries:entries};
