// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E343 Capcom Unity Ace Attorney collections (Steam 逆転検事 1&2 御剣セレクション, GK12.exe). The dialogue of each game
   lives in Addressables bundles per language:
     <name>_Data/StreamingAssets/aa/StandaloneWindows64/gk1_scriptmessage_jpn_assets_all_<hash>.bundle  (sim, tra ...)
   A bundle (UnityFS, LZ4 blocks) holds one SerializedFile whose TextAssets are scenes (gk1_sce4_c3_00 ...). A scene's
   bytes are 32-bit words: the message count n, n entries of 4 words (the 4th is the message length in words), then
   the messages back to back. In a message a word is a character code (0x0A a line break) except 0x00FFFFFF, which starts
   a command: the command word and its arguments (the words below 0x20 after it) are skipped. One message is one text box.
   The messages of the Japanese and the Chinese scene line up one for one (same count, same order), so the release's
   Simplified (else Traditional) Chinese message is the translation of each Japanese one. Trial bundles are left out. */
const fs=require('node:fs'),path=require('node:path');
const stat=file=>{try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}};
function lz4(src,outLen){const out=Buffer.alloc(outLen);let s=0,o=0;
 while(s<src.length){const tok=src[s++];let lit=tok>>4;if(lit===15){let b;do{b=src[s++];lit+=b;}while(b===255&&s<src.length);}
  src.copy(out,o,s,s+lit);s+=lit;o+=lit;if(s>=src.length)break;const off=src[s]|src[s+1]<<8;s+=2;if(!off||off>o)throw Error('LZ4');
  let ml=tok&15;if(ml===15){let b;do{b=src[s++];ml+=b;}while(b===255&&s<src.length);}ml+=4;if(o+ml>outLen)throw Error('LZ4');for(let k=0;k<ml;k++){out[o]=out[o-off];o++;}}
 return out.subarray(0,o);}
// UnityFS: the files inside (name, bytes). Blocks are stored or LZ4/LZ4HC (other compressions are not read).
function unityfs(b){let p=0;const cstr=()=>{const e=b.indexOf(0,p);if(e<0)throw Error('UnityFS');const s=b.toString('latin1',p,e);p=e+1;return s;};
 if(cstr()!=='UnityFS')throw Error('UnityFS');const ver=b.readUInt32BE(p);p+=4;cstr();cstr();p+=8;
 const csz=b.readUInt32BE(p),usz=b.readUInt32BE(p+4),flags=b.readUInt32BE(p+8);p+=12;if(ver>=7)p=(p+15)&~15;
 const atEnd=!!(flags&0x80),at=atEnd?b.length-csz:p,raw=b.subarray(at,at+csz),kind=flags&0x3f;
 const info=kind===0?raw:kind===2||kind===3?lz4(raw,usz):null;if(!info)throw Error('UnityFS compression');
 if(!atEnd)p+=csz;if(flags&0x200)p=(p+15)&~15;
 let q=16;const nb=info.readUInt32BE(q);q+=4;const parts=[];
 for(let i=0;i<nb;i++){const u=info.readUInt32BE(q),c=info.readUInt32BE(q+4),f=info.readUInt16BE(q+8)&0x3f;q+=10;const blk=b.subarray(p,p+c);p+=c;
  if(f===0)parts.push(blk);else if(f===2||f===3)parts.push(lz4(blk,u));else throw Error('UnityFS compression');}
 const data=Buffer.concat(parts),nn=info.readUInt32BE(q);q+=4;const nodes=[];
 for(let i=0;i<nn;i++){const off=Number(info.readBigUInt64BE(q)),sz=Number(info.readBigUInt64BE(q+8));q+=20;const e=info.indexOf(0,q);nodes.push({name:info.toString('utf8',q,e),data:data.subarray(off,off+sz)});q=e+1;}
 return nodes;}
// SerializedFile (format 22, Unity 2022): the TextAssets (class 49) as name -> bytes.
function textAssets(b,out=new Map()){if(b.length<48||b.readUInt32BE(8)<22)return out;
 const LE=b[16]===0,dataOffset=Number(b.readBigUInt64BE(32));let p=48;
 const u8=()=>b[p++],i16=()=>{const v=LE?b.readInt16LE(p):b.readInt16BE(p);p+=2;return v;},i32=()=>{const v=LE?b.readInt32LE(p):b.readInt32BE(p);p+=4;return v;},u32=()=>{const v=LE?b.readUInt32LE(p):b.readUInt32BE(p);p+=4;return v;};
 const u64=()=>{const v=Number(LE?b.readBigUInt64LE(p):b.readBigUInt64BE(p));p+=8;return v;};
 p=b.indexOf(0,p)+1;i32();const typeTree=!!u8();const nt=i32(),classes=[];
 for(let t=0;t<nt;t++){const cls=i32();u8();i16();if(cls===114)p+=16;p+=16;if(typeTree){const nodes=i32(),strings=i32();p+=nodes*32+strings;const deps=i32();p+=deps*4;}classes.push(cls);}
 const n=i32();
 for(let k=0;k<n;k++){p=(p+3)&~3;p+=8;const at=dataOffset+u64(),size=u32(),cls=classes[i32()];if(cls!==49||at+8>b.length)continue;
  const nl=LE?b.readUInt32LE(at):b.readUInt32BE(at);if(nl>256||at+4+nl>b.length)continue;const name=b.toString('utf8',at+4,at+4+nl);const j=(at+4+nl+3)&~3;
  const len=LE?b.readUInt32LE(j):b.readUInt32BE(j);if(j+4+len>at+size+4||j+4+len>b.length)continue;out.set(name,b.subarray(j+4,j+4+len));}
 return out;}
const bundleMemo=new Map();
function bundleScenes(file){const key=file+'|'+stat(file);if(bundleMemo.has(key))return bundleMemo.get(key);let out=new Map();
 try{for(const node of unityfs(fs.readFileSync(file)))if(!/\.res[sS]$|\.resource$/.test(node.name))textAssets(node.data,out);}catch{out=new Map();}
 bundleMemo.set(key,out);if(bundleMemo.size>12)bundleMemo.delete(bundleMemo.keys().next().value);return out;}
// Argument words per command, counted from the commands followed directly by another command in both games' Japanese
// and Chinese scripts (an argument can be 0x20 or more, e.g. "W" or "]", so it cannot be told from text by value).
// A command not listed skips the words below 0x20 after it.
const ARGS={0x02:1,0x03:1,0x04:1,0x05:1,0x07:1,0x08:2,0x09:2,0x0a:1,0x0b:1,0x0e:4,0x0f:9,0x10:3,0x11:14,0x14:1,0x15:1,0x16:1,0x17:4,0x18:3,0x19:1,0x1b:0,0x1f:1,0x20:1,0x25:3,0x26:1,0x27:1};
// Messages of one scene as text.
function messages(buf){if(buf.length<4)return [];const n=buf.readUInt32LE(0);if(!n||4+n*16>buf.length)return [];
 let at=4+n*16;const out=[];
 for(let i=0;i<n;i++){const len=buf.readUInt32LE(4+i*16+12);if(at+len*4>buf.length)return [];let s='',cmd=false,args=false,skip=0;
  for(let k=0;k<len;k++){const v=buf.readUInt32LE(at+k*4);
   if(v===0xffffff){cmd=true;args=false;skip=0;continue;}
   if(cmd){cmd=false;if(v in ARGS)skip=ARGS[v];else args=true;continue;}
   if(skip){skip--;continue;}
   if(args&&v<0x20)continue;args=false;
   if(v===0x0a)s+='\n';else if(v>=0x20&&v<0x110000&&!(v>=0xd800&&v<0xe000))s+=String.fromCodePoint(v);}
  out.push(s.replace(/^\n+|\n+$/g,''));at+=len*4;}
 return out;}
const bundleDirs=dir=>{let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}
 return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name,'StreamingAssets','aa','StandaloneWindows64')).filter(d=>{try{return fs.statSync(d).isDirectory();}catch{return false;}});};
const BUNDLE=/^(\w+?)_scriptmessage_(jpn|sim|tra)_assets_all_[0-9a-f]+\.bundle$/i;
// Per game prefix (gk1, gk2): its Japanese bundle and its Chinese one.
function bundles(dir){const games=new Map();
 for(const d of bundleDirs(dir)){let files=[];try{files=fs.readdirSync(d);}catch{}
  for(const f of files){const m=f.match(BUNDLE);if(!m)continue;const g=games.get(m[1].toLowerCase())||{};g[m[2].toLowerCase()]=path.join(d,f);games.set(m[1].toLowerCase(),g);}}
 return [...games].filter(([,g])=>g.jpn).sort((a,b)=>a[0].localeCompare(b[0]));}
const capcomMsg={
 id:'capcom-msg',hint:'StreamingAssets\\aa\\*_scriptmessage_jpn_*.bundle',
 scenes(dir){const out=[];
  for(const [game,g] of bundles(dir)){const ja=bundleScenes(g.jpn),zh=g.sim?bundleScenes(g.sim):g.tra?bundleScenes(g.tra):new Map();
   for(const [name,buf] of ja)out.push({name:game+'/'+name,read:()=>{const own=messages(buf),z=zh.has(name)?messages(zh.get(name)):[];return Buffer.from(JSON.stringify({ja:own,zh:z.length===own.length?z:[]}));}});}
  return out.sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>bundles(dir).flatMap(([,g])=>[g.jpn,g.sim||g.tra].filter(Boolean)),
 parse(buf){const doc=JSON.parse(buf.toString('utf8'));return {lines:doc.ja,anchors:[],zh:doc.ja.map((_,i)=>doc.zh[i]||'')};},
 test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{lz4,unityfs,textAssets,messages},
};
module.exports=capcomMsg;
