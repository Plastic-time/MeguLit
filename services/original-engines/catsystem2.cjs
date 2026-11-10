// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E356 CatSystem2 (ISLAND): scene.int is an encrypted KIF archive of CatScene (.cst) scripts. Decryption as in GARbro
   (ArcINT.cs, KifOpener.OpenEncrypted): the size field of the first entry (__key__.dat) seeds the CatSystem2 Mersenne
   Twister (the old sgenrand seeding with 69069), its first output is a 4-byte Blowfish key; each entry's (offset + index,
   size) pair is one Blowfish block, file data is Blowfish in 8-byte blocks (little-endian words). A CatScene is
   "CatScene", packed and unpacked sizes, then zlib: a 16-byte header (.., .., .., string table offset) and strings
   "\x01<type>text\0" — type 0x20 message, 0x21 speaker name, 0x30 command.
   The Chinese patch (cnscene.int) keeps every scene at the same index with the Japanese messages followed by the same
   number of Chinese (GBK) messages, so each scene gives the Japanese line and the group's translation.
   In the text, [base/reading] is ruby (a reading of only "・" is emphasis dots) and \n \@ \pc ... are layout codes. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Blowfish}=require('./blowfish.cjs');
const sjis=new TextDecoder('shift_jis'),gbk=new TextDecoder('gbk');
const memo=new Map();
const stat=f=>{try{const s=fs.statSync(f);return s.size+'|'+s.mtimeMs;}catch{return '';}};

function twister(seed){const mt=new Array(624);seed>>>=0;for(let i=0;i<624;i++){mt[i]=seed&0xffff0000;seed=(Math.imul(69069,seed)+1)>>>0;mt[i]=(mt[i]|((seed&0xffff0000)>>>16))>>>0;seed=(Math.imul(69069,seed)+1)>>>0;}let idx=624;
 return ()=>{if(idx>=624){for(let k=0;k<624;k++){const y=(mt[k]&0x80000000)|(mt[(k+1)%624]&0x7fffffff);mt[k]=(mt[(k+397)%624]^(y>>>1)^(y&1?0x9908b0df:0))>>>0;}idx=0;}let y=mt[idx++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;};}

// Entries of a KIF archive: [{index, read()}] (read gives the stored file, decrypted when the archive is).
function kif(file){const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);
 const fd=fs.openSync(file,'r');let list=[];
 try{const head=Buffer.alloc(8);fs.readSync(fd,head,0,8,0);if(head.toString('latin1',0,4)!=='KIF\0')throw Error('NOT_KIF');
  const n=head.readUInt32LE(4),dir=Buffer.alloc(n*0x48);fs.readSync(fd,dir,0,dir.length,8);
  const encrypted=dir.toString('latin1',0,12)==='__key__.dat\0';let bf=null;
  if(encrypted){const kb=Buffer.alloc(4);kb.writeUInt32LE(twister(dir.readUInt32LE(0x44))());bf=new Blowfish(kb);}
  for(let i=encrypted?1:0;i<n;i++){const p=i*0x48;let off=dir.readUInt32LE(p+0x40),size=dir.readUInt32LE(p+0x44);
   if(bf)[off,size]=bf.decrypt((off+i)>>>0,size);
   const name=encrypted?'':dir.toString('latin1',p,p+0x40).replace(/\0.*$/s,'');
   list.push({index:i,name,read:()=>{const b=Buffer.alloc(size),f=fs.openSync(file,'r');try{fs.readSync(f,b,0,size,off);}finally{fs.closeSync(f);}if(bf)bf.decryptBuffer(b);return b;}});}}
 finally{fs.closeSync(fd);}
 memo.set(key,list);return list;}

function catScene(buf){if(buf.toString('latin1',0,8)!=='CatScene')return null;return zlib.inflateSync(buf.subarray(16));}
// Messages (0x20) and their speaker names in order: [{text: Buffer, name: Buffer|null}]
function messages(z){const out=[];let name=null;for(let i=16+z.readUInt32LE(12);i+1<z.length;){const t=z[i],c=z[i+1],e=z.indexOf(0,i+2);if(e<0)break;
  if(t===1&&c===0x21)name=z.subarray(i+2,e);else if(t===1&&c===0x20){out.push({text:z.subarray(i+2,e),name});name=null;}i=e+1;}
 return out;}
const RUBY=/\[([^\[\]\/]+)\/([^\[\]]+)\]/g;
function clean(s){return s.replace(RUBY,'$1').replace(/\\n/g,'\n').replace(/\\[a-zA-Z@]+/g,'').replace(/\\/g,'').trim();}
function ruby(s){const pairs=[];for(const m of s.matchAll(RUBY))if(!/^・+$/.test(m[2]))pairs.push([m[1],m[2]]);return pairs.length?pairs:null;}

const sceneFile=dir=>{const f=path.join(dir,'scene.int');return fs.existsSync(f)?f:'';};
const patchFile=dir=>{let names;try{names=fs.readdirSync(dir);}catch{return '';}const f=names.find(n=>/^(cn|chs|sc|zh)scene\.int$/i.test(n));return f?path.join(dir,f):'';};

const catsystem2={
 id:'catsystem2',hint:'scene.int（汉化：cnscene.int）',
 scenes(dir){const jp=sceneFile(dir);if(!jp)return [];const cnFile=patchFile(dir);
  let cn=[];try{cn=cnFile?kif(cnFile):[];}catch{}
  return kif(jp).map((e,k)=>({name:'scene'+String(e.index).padStart(4,'0')+'.cst',read:()=>{
   const z=catScene(e.read());if(!z)return Buffer.from('{"ja":[],"zh":[]}');
   const ja=messages(z).map(m=>sjis.decode(m.text));let zh=[];
   const c=cn[k];if(c)try{const zc=catScene(c.read()),all=zc?messages(zc):[];if(all.length===2*ja.length&&all.slice(0,ja.length).every((m,j)=>sjis.decode(m.text)===ja[j]))zh=all.slice(ja.length).map(m=>gbk.decode(m.text));}catch{}
   return Buffer.from(JSON.stringify({ja,zh}));}}));},
 archives:()=>[],
 sources:dir=>[sceneFile(dir),patchFile(dir)].filter(Boolean),
 parse(buf){const doc=JSON.parse(buf.toString('utf8'));const lines=[],zh=[],rb=[];
  doc.ja.forEach((t,k)=>{lines.push(clean(t));zh.push(doc.zh[k]?clean(doc.zh[k]):'');rb.push(ruby(t));});
  return {lines,anchors:[],zh,ruby:rb};},
 test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{kif,catScene,messages,clean,twister},
};
module.exports=catsystem2;
