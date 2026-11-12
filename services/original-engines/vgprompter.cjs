// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E403 Doki Doki Literature Club Plus! (Steam, Unity 2019.4, issue #76). The scenario lives in the language bundles
   <name>_Data/StreamingAssets/AssetBundles/Windows/lang<code>.cy: every byte XOR 0x28 gives a UnityFS bundle (LZ4),
   whose MonoBehaviour "Lines_<code>" (script RenPyParser.VGPrompter.DataHolders.Lines) is
     int labels; per label: string name, int n, uint32 hash[n], string line[n]   (strings length-prefixed, 4-aligned)
   One label is one scene. langja.cy gives the Japanese text; langzh-cn.cy (else zh-tw) gives the release's own Chinese,
   lined up by hash. Text markup: <i>..</i>, <sprite ..> dropped, <br> a line break; [player] and the other Ren'Py
   substitutions stay as written (the game fills in the player's name). */
const fs=require('node:fs'),path=require('node:path'),unityfs=require('./unityfs.cjs');
const KEY=0x28;
const {stat}=require('./file-key.cjs');
function bundleDir(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return '';}
 for(const e of names)if(e.isDirectory()&&/_Data$/i.test(e.name)){const d=path.join(dir,e.name,'StreamingAssets','AssetBundles','Windows');if(fs.existsSync(path.join(d,'langja.cy')))return d;}
 return '';}
function langFile(dir,codes){const d=bundleDir(dir);if(!d)return '';for(const c of codes){const f=path.join(d,'lang'+c+'.cy');if(fs.existsSync(f))return f;}return '';}
function decrypt(buf){if(buf.toString('latin1',0,7)==='UnityFS')return buf;const out=Buffer.allocUnsafe(buf.length);for(let i=0;i<buf.length;i++)out[i]=buf[i]^KEY;return out;}
// The Lines object inside one serialized file: [{name, hashes, lines}].
function labels(data){const marker=Buffer.from('Lines_');let at=0;
 while((at=data.indexOf(marker,at))>=0){const p=at-4;at+=marker.length;if(p<0||p%4)continue;const n=data.readUInt32LE(p);if(n<7||n>32||!/^Lines_[\w-]+$/.test(data.toString('latin1',p+4,p+4+n)))continue;
  try{const out=table(data,(p+4+n+3)&~3);if(out.length)return out;}catch{}}
 return [];}
function table(d,q){const count=d.readUInt32LE(q);q+=4;if(count<1||count>5000)throw Error('VGP_COUNT');const out=[];
 const str=()=>{const n=d.readUInt32LE(q);if(n>200000||q+4+n>d.length)throw Error('VGP_STRING');const s=d.toString('utf8',q+4,q+4+n);q=(q+4+n+3)&~3;return s;};
 for(let i=0;i<count;i++){const name=str();const n=d.readUInt32LE(q);q+=4;if(n>100000||q+n*4>d.length)throw Error('VGP_LINES');
  const hashes=[];for(let k=0;k<n;k++)hashes.push(d.readUInt32LE(q+k*4));q+=n*4;
  const m=d.readUInt32LE(q);q+=4;if(m!==n)throw Error('VGP_MISMATCH');const lines=[];for(let k=0;k<n;k++)lines.push(str());
  out.push({name,hashes,lines});}
 return out;}
const memo=new Map();
function readLang(file){if(!file)return [];const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);let out=[];
 try{for(const node of unityfs.read(decrypt(fs.readFileSync(file)))){out=labels(node.data);if(out.length)break;}}catch{out=[];}
 memo.set(key,out);if(memo.size>8)memo.delete(memo.keys().next().value);return out;}
const tidy=t=>t.replace(/<br>/gi,'\n').replace(/<\/?i>/gi,'').replace(/<sprite[^>]*>/gi,'').trim();
function parse(buf){const doc=JSON.parse(Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf));
 return {lines:doc.lines.map(tidy),anchors:[],zh:(doc.zh||[]).map(t=>tidy(t||''))};}
const vgprompter={
 id:'vgprompter',hint:'<游戏>_Data\StreamingAssets\AssetBundles\Windows\langja.cy',
 scenes(dir){const ja=readLang(langFile(dir,['ja']));if(!ja.length)return [];
  const zhMap=new Map();for(const l of readLang(langFile(dir,['zh-cn','zh-tw'])))l.hashes.forEach((h,k)=>zhMap.set(h,l.lines[k]));
  return ja.filter(l=>l.lines.length).map(l=>({name:l.name,read:()=>Buffer.from(JSON.stringify({lines:l.lines,zh:l.hashes.map(h=>zhMap.get(h)||'')}),'utf8')}));},
 /* 2026-11-13 (user: DDLC Plus set to English showed nothing): every other language bundle (lang*.cy), line by line hash,
    keyed by its normalized text -> the Japanese line. Used when the hook captures a line in a language other than Japanese. */
 foreign(dir){const d=bundleDir(dir);if(!d)return null;const ja=new Map();for(const l of readLang(langFile(dir,['ja'])))l.hashes.forEach((h,k)=>ja.set(h,tidy(l.lines[k])));if(!ja.size)return null;
  const key=require('../original-text.cjs').foreignKey,out=new Map();let files=[];try{files=fs.readdirSync(d).filter(f=>/^lang.+\.cy$/i.test(f)&&!/^lang(ja|zh-cn|zh-tw|pyc|uage)?\.cy$/i.test(f)&&!/^supported/i.test(f));}catch{}
  for(const f of files)for(const l of readLang(path.join(d,f)))l.hashes.forEach((h,k)=>{const j=ja.get(h),t=key(tidy(l.lines[k]||''));if(j&&t&&t.length>=2&&!out.has(t))out.set(t,j);});
  return out;},
 archives:()=>[],
 sources:dir=>[langFile(dir,['ja']),langFile(dir,['zh-cn','zh-tw'])].filter(Boolean),
 parse,test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{decrypt,labels,table,tidy},
};
module.exports=vgprompter;
