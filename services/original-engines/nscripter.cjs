// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E331 NScripter / ONScripter (月姫). The script is 0.txt ... 99.txt (or 00.txt ...) read in number order, else
   nscript.dat (every byte XOR 0x84). It is split into blocks at its labels (*f20, *s20 ...); a block is one scene,
   named by its label, so a translated script lines up block by block even where a block was rewritten.
   A line whose first character is not ASCII is text. It is cut at the click waits (@) and page ends (\) into the parts
   the game shows one at a time; inline commands (!w100, !sd, #ffffff colours) are dropped. Labels and the ASCII
   command lines are anchors. Shift-JIS or GBK (Chinese builds) is chosen per file by which reads with fewer errors. */
const fs=require('node:fs'),path=require('node:path');
const KANA=/[ぁ-ゖァ-ヺ]/g;
/* E577 kit.decodeText */
const decode=kit.decodeText;
const {stat}=require('./file-key.cjs');
const zlib=require('node:zlib');
/* E600 ONScripter-RU release script ("ONS2" 16-byte header: magic, compressed, decompressed, version 110; then zlib data
   scrambled by T[b^0x86]^0x23 before and T[b^0x45]^0x71 after inflating; text is UTF-8). Umineko Project: script.file /
   default.file / ru.file / cht.file. Source: umineko-project/onscripter-ru Engine/Handlers/Script.cpp. */
const ONS2T=Uint8Array.from([0x37,0x6a,0x09,0x5e,0x7a,0xaf,0xf5,0xa4,0xba,0x78,0x84,0x58,0x35,0x1e,0x6b,0x0c,0x49,0xc6,0xc3,0x44,0x40,0x9e,0x6f,0x65,0xe4,0xf6,0xfe,0x22,0xe2,0x95,0xc7,0x38,0xf0,0x1a,0x82,0xe0,0x5b,0x2a,0xd8,0xe5,0xce,0x2f,0x74,0x25,0xec,0x59,0xc0,0x45,0x4b,0x64,0x43,0xdc,0xb0,0xb9,0x30,0x6d,0x28,0xd1,0x16,0xbb,0x66,0x98,0x92,0x90,0x2c,0xa7,0xf1,0x80,0xc1,0xd4,0x8b,0xd6,0xdf,0x24,0x2d,0xf7,0xfb,0x88,0x4d,0x3c,0x72,0xf3,0xdb,0x2b,0x93,0x73,0xef,0x85,0x83,0xee,0xc2,0x8d,0x5c,0xb2,0x0b,0x94,0x3d,0xa8,0x3f,0x1c,0x4c,0x6e,0x03,0x7b,0x1d,0x5a,0x51,0xa1,0x70,0x41,0xd0,0xaa,0xa0,0x7e,0xcd,0xd5,0x15,0xa9,0x18,0x76,0xc9,0x7d,0x7f,0x0e,0x3a,0x99,0xbf,0xab,0x3b,0x14,0x3e,0x9a,0x04,0xda,0x02,0xfd,0x63,0xd9,0xfa,0x9f,0x4e,0xe3,0x61,0xbe,0x07,0x11,0xa6,0x1b,0x19,0x55,0x8e,0x77,0x0a,0x47,0xe6,0xf8,0x0d,0xcf,0xd7,0x33,0x23,0x1f,0xbc,0x62,0xde,0x9b,0x29,0x53,0x68,0xe8,0x21,0xb6,0x34,0x52,0x87,0xcb,0x08,0x79,0xf4,0x67,0x69,0x54,0xe7,0x86,0xea,0xb4,0x20,0x71,0x01,0xbd,0x06,0x31,0x00,0x50,0xc8,0xb8,0xac,0x5d,0x57,0x7c,0x89,0xeb,0xb7,0x36,0x8f,0xf2,0xe1,0x56,0x81,0x4a,0xd2,0x8c,0xf9,0xad,0x60,0xa5,0x42,0x10,0x5f,0x12,0xb3,0xff,0x4f,0xdd,0x46,0x26,0xa2,0x17,0xc5,0x75,0x91,0x27,0xb5,0x8a,0xd3,0x13,0x2e,0xc4,0xe9,0x9d,0x97,0x39,0x32,0x05,0x0f,0xca,0xcc,0x48,0xfc,0xae,0x96,0xed,0x6c,0x9c,0xb1,0xa3]);
function ons2(b){if(b.length<=16||b.readUInt32LE(0)!==0x32534E4F||b.readUInt32LE(12)!==110)return null;
 const n=Math.min(b.readUInt32LE(4),b.length-16),c=Buffer.alloc(n);for(let i=0;i<n;i++)c[i]=ONS2T[b[16+i]^0x86]^0x23;
 let d;try{d=zlib.inflateSync(c,{finishFlush:zlib.constants.Z_SYNC_FLUSH});}catch{return null;}for(let i=0;i<d.length;i++)d[i]=ONS2T[d[i]^0x45]^0x71;return d;}
const isUtf8=b=>{try{new TextDecoder('utf-8',{fatal:true}).decode(b);return true;}catch{return false;}};
function readScriptFile(f){const b=fs.readFileSync(f);
 if(b.length>16&&b.readUInt32LE(0)===0x32534E4F){const d=ons2(b);return d?d.toString('utf8').replace(/^﻿/,''):'';}
 if(/\.dat$/i.test(f))for(let i=0;i<b.length;i++)b[i]^=0x84;
 if(/\.utf$/i.test(f)||b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF)return b.toString('utf8').replace(/﻿/g,'');
 /* pscript.dat (ponscripter) is UTF-8 under XOR 0x84; nscript.dat is Shift-JIS/GBK */
 return /^pscript\.dat$/i.test(path.basename(f))&&isUtf8(b)?b.toString('utf8'):decode(b);}
const TXT=n=>/^\d{1,2}\.(txt|utf)$/i.test(n);
const isOns2=f=>{try{const fd=fs.openSync(f,'r');try{const h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);return h.readUInt32LE(0)===0x32534E4F&&h.readUInt32LE(12)===110;}finally{fs.closeSync(fd);}}catch{return false;}};
const FILE_RANK=n=>/^script\.file$/i.test(n)?0:/^default\.file$/i.test(n)?1:/^(en|jp|ja)\.file$/i.test(n)?2:3;
function scriptFiles(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}
 const num=(a,b)=>parseInt(a,10)-parseInt(b,10)||a.length-b.length;
 const files=names.filter(n=>/\.file$/i.test(n)).sort((a,b)=>FILE_RANK(a)-FILE_RANK(b)||a.localeCompare(b)).map(f=>path.join(dir,f)).filter(isOns2);
 if(files.length)return [files[0]];
 for(const ext of ['utf','txt']){const t=names.filter(n=>TXT(n)&&n.toLowerCase().endsWith('.'+ext)).sort(num).map(f=>path.join(dir,f));if(t.length)return t;}
 const dat=names.find(n=>/^pscript\.dat$/i.test(n))||names.find(n=>/^nscript\.dat$/i.test(n));return dat?[path.join(dir,dat)]:[];}
const textMemo=new Map();
// The whole script as text, or '' when it is not an NScripter script (it must define *define and *start).
function scriptText(dir){const files=scriptFiles(dir);if(!files.length)return '';const key=files.map(f=>f+'|'+stat(f)).join('\n');if(textMemo.has(key))return textMemo.get(key);
 let text='';try{text=files.map(f=>readScriptFile(f)).join('\n');}catch{text='';}
 if(!/^[ \t]*\*define\b/im.test(text)||!/^[ \t]*\*start\b/im.test(text))text='';
 textMemo.set(key,text);if(textMemo.size>8)textMemo.delete(textMemo.keys().next().value);return text;}
// Label blocks in file order; the text before the first label is "*_head". A label used twice keeps its first block.
function blocks(text){const out=[],seen=new Set();let name='*_head',body=[];
 const push=()=>{const key=name.toLowerCase();if(!seen.has(key)){seen.add(key);out.push({name,body:body.join('\n')});}};
 for(const raw of text.split(/\r?\n/)){const m=raw.match(/^\s*(\*[A-Za-z0-9_]+)/);if(m){push();name=m[1];body=[raw];}else body.push(raw);}
 push();return out;}
function clean(t){let s=t.replace(/!(?:w|d)\d+|!s(?:d|\d+)?|#[0-9A-Fa-f]{6}/g,'').trim();if(s[0]==='`')s=s.replace(/`/g,'');return s.replace(/[\/`]$/,'').trim();}
const isText=s=>!!s&&(s.charCodeAt(0)>=0x80||s[0]==='`');
function parse(buf){const lines=[],anchors=[];
 for(const raw of buf.toString('utf8').split('\n')){let t=raw.trim();if(!t||t[0]===';')continue;
  // A text line may open with inline commands (!w500「…」, #ffffff…) or ONScripter's backtick text prefix (`…).
  const lead=t.replace(/^(?:!(?:w|d)\d+|!s(?:d|\d+)?|#[0-9A-Fa-f]{6})+/,'');if(lead!==t&&isText(lead))t=lead;
  if(!isText(t)){if(t[0]==='*')anchors.push(t.split(/\s/)[0]);continue;}
  for(const part of t.split(/[@\\]/)){const s=clean(part);if(s)lines.push(s);}}
 return {lines,anchors};}
const nscripter={
 id:'nscripter',hint:'0.txt（或 nscript.dat）',
 scenes(dir){const text=scriptText(dir);if(!text)return [];return blocks(text).map(b=>({name:b.name,read:()=>Buffer.from(b.body,'utf8')}));},
 // A patch folder holds a whole script too: its blocks stand for the running script's blocks of the same label.
 archives(dir){return this.scenes(dir);},
 sources:dir=>scriptFiles(dir),
 /* the code page the script (and so the game's ANSI text calls) is written in; '' when there is no script. GBK = a Chinese build */
 codepage(dir){const files=scriptFiles(dir);if(!files.length)return '';if(files.some(f=>/\.(utf|file)$/i.test(f)||/^pscript\.dat$/i.test(path.basename(f))))return 'utf-8';const bufs=[];let total=0;
  for(const f of files){if(total>=1<<20)break;let b;try{const fd=fs.openSync(f,'r');try{b=Buffer.alloc(Math.min(1<<20,fs.fstatSync(fd).size));fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}}catch{continue;}
   if(/\.dat$/i.test(f))for(let i=0;i<b.length;i++)b[i]^=0x84;bufs.push(b);total+=b.length;}
  return bufs.length?kit.codepage(Buffer.concat(bufs)):'';},
 parse,test:()=>false,
 _internal:{blocks,clean,scriptText,ons2:Object.assign(ons2,{T:ONS2T})},
};
module.exports=nscripter;
