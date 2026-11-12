// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E451 Capcom's Unity Ace Attorney Trilogy (Steam 逆転裁判123 成歩堂セレクション, PWAAT.exe) and other games on that
   engine: <name>_Data/StreamingAssets/GS<n>/scenario/<scene>.mdt, one file per language (<scene>.mdt Japanese,
   _s Simplified Chinese, _t Traditional Chinese, _u English ...).
   Every StreamingAssets file is AES-128-CBC encrypted; key and IV are the 32 bytes PBKDF2-SHA1 (1000 rounds) makes of
   the game's password "u8DurGE2" and salt "6BBGizHE". A decrypted .mdt is a u32 count, that many u32 message offsets
   (an offset past the file marks an unused slot) and the messages: u16 words, where a word of 0x80 or more is a
   character (its full-width code point plus 0x80) and a smaller word is a command followed by its arguments. The number
   of arguments of each command is the game's MessageSystem.code_proc_arg_count_table (Assembly-CSharp.dll), copied below, except
   0x69: its handler (CodeProc_69) reads two arguments and moves on by three words, while the table says four (with four
   the next command's arguments read as text). 0x01 breaks a line; a text box ends at the commands the game's
   MdtData.isPageCommand names (PAGE below; 0x02 waits for a click, 0x0D ends the message). One text box is one line.
   The language files of a scene hold the same messages in the same order. Within a message the Japanese and Chinese
   text boxes match one for one in nearly every message; where a translation splits or joins boxes they are aligned by
   length (1:1, 1:2, 2:1 ... 3:3), so every Japanese box gets the Chinese of the boxes it was aligned with. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {stat}=require('./file-key.cjs');
let keyIv=null;const kv=()=>keyIv??=crypto.pbkdf2Sync('u8DurGE2','6BBGizHE',1000,32,'sha1');
function decrypt(buf){const k=kv(),d=crypto.createDecipheriv('aes-128-cbc',k.subarray(0,16),k.subarray(16,32));return Buffer.concat([d.update(buf),d.final()]);}
const ARGS=[0,0,0,1,1,2,2,0,2,3,1,1,1,0,1,2,1,0,3,1,0,0,0,1,1,2,4,1,1,1,3,0,1,0,2,2,0,1,1,2,1,1,3,0,1,0,0,2,1,2,2,5,1,2,1,2,1,1,3,2,1,1,1,0,0,0,1,1,1,0,1,2,2,0,1,1,0,2,1,7,1,2,1,0,2,1,2,1,0,1,1,2,3,0,0,3,4,3,0,0,1,2,3,0,0,2,1,3,0,1,1,1,3,3,0,0,2,4,2,2,1,0,1,2,0,1,1,1,0];
const PAGE=new Set([0x02,0x07,0x08,0x09,0x0a,0x0d,0x15,0x2a,0x2d,0x2e,0x45]);
// The messages of a decrypted .mdt as u16 word arrays (null for an unused slot).
function messages(b){if(b.length<4)return [];const n=b.readUInt32LE(0);if(!n||4+n*4>b.length)return [];
 const o=[...Array(n)].map((_,i)=>b.readUInt32LE(4+i*4)),ends=[...new Set(o.filter(v=>v<b.length)),b.length].sort((x,y)=>x-y);
 return o.map(s=>{if(s>=b.length||s<4+n*4)return null;const e=ends.find(v=>v>s);const u=new Array((e-s)>>1);for(let i=0;i<u.length;i++)u[i]=b.readUInt16LE(s+i*2);return u;});}
// The text boxes of one message.
function boxes(words){const out=[];let s='',i=0;
 while(i<words.length){const x=words[i];if(x>=0x80){if(x>=0xa0)s+=String.fromCharCode(x-0x80);i++;continue;} /* below 0xA0: control characters (0x80 pads a GS2 line) */
  if(x===1)s+='\n';else if(PAGE.has(x)){out.push(s);s='';}i+=1+(ARGS[x]??0);}
 out.push(s);return out.map(t=>t.replace(/^[\n　]+|[\n　]+$/g,'')).filter(t=>t.trim());}
const len=t=>t.replace(/\s/g,'').length;
// Aligns the Japanese boxes of a message with the Chinese ones (both non-empty): for each Japanese box, the Chinese text.
const MOVES=[[1,1,0],[1,2,1],[2,1,1],[1,3,2],[3,1,2],[2,2,2],[2,3,3],[3,2,3],[3,3,4]];
function align(ja,zh){if(ja.length===zh.length)return zh.slice();const n=ja.length,m=zh.length,R=1;
 const cost=Array.from({length:n+1},()=>new Array(m+1).fill(Infinity)),from=Array.from({length:n+1},()=>new Array(m+1).fill(null));cost[0][0]=0;
 for(let i=0;i<=n;i++)for(let j=0;j<=m;j++){if(cost[i][j]===Infinity)continue;
  for(const [a,b,pen] of MOVES){if(i+a>n||j+b>m)continue;const lj=ja.slice(i,i+a).reduce((s,t)=>s+len(t),0),lz=zh.slice(j,j+b).reduce((s,t)=>s+len(t),0);
   const c=cost[i][j]+Math.abs(lj*R-lz)/Math.sqrt(lj+lz+1)+pen;if(c<cost[i+a][j+b]){cost[i+a][j+b]=c;from[i+a][j+b]=[a,b];}}}
 const out=new Array(n).fill('');let i=n,j=m;if(cost[n][m]===Infinity){out[0]=zh.join('\n');return out.map((t,k)=>t||zh.join('\n'));}
 while(i>0){const [a,b]=from[i][j];const z=zh.slice(j-b,j).join('\n');for(let k=i-a;k<i;k++)out[k]=z;i-=a;j-=b;}
 return out;}
// One scene: its Japanese boxes and their Chinese.
function scene(jaBuf,zhBuf){const ja=messages(jaBuf),zh=zhBuf?messages(zhBuf):[];const lines=[],zhs=[],split=[];
 ja.forEach((w,k)=>{if(!w)return;const j=boxes(w);if(!j.length)return;const z=zh.length===ja.length&&zh[k]?boxes(zh[k]):[];
  const a=z.length?align(j,z):j.map(()=>'');if(z.length&&z.length!==j.length)split.push(k);lines.push(...j);zhs.push(...a);});
 return {lines,zh:zhs,split};}
const dataDirs=dir=>{let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
 return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name,'StreamingAssets'));};
const SCENE=/^((?:sc|ev)[\w]*?_(?:text|mes))(?:_([a-z]))?\.mdt$/i;
// Per scene (GS1/sc0_text): the Japanese file and the Chinese one (Simplified, else Traditional).
function files(dir){const out=[];
 for(const sa of dataDirs(dir)){let games=[];try{games=fs.readdirSync(sa).filter(g=>/^GS\d+$/i.test(g)).sort();}catch{}
  for(const g of games){const d=path.join(sa,g,'scenario');let names=[];try{names=fs.readdirSync(d);}catch{continue;}const by=new Map();
   for(const f of names){const m=f.match(SCENE);if(!m)continue;const e=by.get(m[1])||{};e[m[2]?m[2].toLowerCase():'ja']=path.join(d,f);by.set(m[1],e);}
   for(const [name,e] of by)if(e.ja)out.push({name:g.toUpperCase()+'/'+name,ja:e.ja,zh:e.s||e.t||null});}}
 return out.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));}
const readMemo=new Map();const dec=file=>{const key=file+'|'+stat(file);if(readMemo.has(key))return readMemo.get(key);const b=decrypt(fs.readFileSync(file));readMemo.set(key,b);if(readMemo.size>8)readMemo.delete(readMemo.keys().next().value);return b;};
const pwaat={
 id:'pwaat',hint:'StreamingAssets\\GS1\\scenario\\*.mdt',
 scenes(dir){return files(dir).map(f=>({name:f.name,read:()=>{const s=scene(dec(f.ja),f.zh?dec(f.zh):null);return Buffer.from(JSON.stringify({ja:s.lines,zh:s.zh}));}}));},
 archives:()=>[],
 sources:dir=>files(dir).flatMap(f=>[f.ja,f.zh].filter(Boolean)),
 parse(buf){const doc=JSON.parse(buf.toString('utf8'));return {lines:doc.ja,anchors:[],zh:doc.ja.map((_,i)=>doc.zh[i]||'')};},
 test:()=>false,
 patchLines(base){let any=false;const list=base.map(s=>{const zh=s.zh||[];if(!zh.some(Boolean))return s;any=true;return {...s,patched:true,lines:s.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{decrypt,messages,boxes,align,scene,files,ARGS,PAGE},
};
module.exports=pwaat;
