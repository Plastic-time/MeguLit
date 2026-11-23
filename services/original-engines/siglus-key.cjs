// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* SiglusEngine second-layer key (exe_el, 16 bytes) for Scene.pck scenes / Gameexe.dat when scn_data_exe_angou_mod != 0.
   Sources, cheapest first:
   1. 暗号.dat text (OS-section source or next to the pck): exe_el = EXE_ORG xor-folded with the cp932 bytes.
   2. SiglusEngine*.exe: the decrypt loop "8A 44 0D d / 8D 52 01 30 42 FF 41" and the 16 byte stores before it.
      1 and 2 ported from Jirehlov/SiglusSceneScriptUtility common.py (Unlicense OR 0BSD).
   3. Known plaintext (own work): every scene is lzss(dat) ^ exe_el ^ EASY_ANGOU_CODE with both keys restarting per scene.
      The lzss header gives key[0..3] (packed size); the rest is solved by decoding the lzss stream symbolically against
      the fixed scene-dat layout (header field relations + the string index list), branching only on flag / back-reference
      bytes. Every candidate is checked by a strict full decompress of several scenes. */
const fs=require('node:fs');
const path=require('node:path');
const kit=require('./kit.cjs');

const EXE_ORG=Buffer.from('3659c9732eb509bae44cf26aa234ec7c','hex');
const GAMEEXE_ANGOU_CODE=Buffer.from('d829b9163d1a76d0879b2d0c7bd1a919229f91736a35b17ed1b5e7e6d5f506d6babff3453ff161dd4c676a6f74ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c9b1f9ad549e9340f282d1b52395c368956a79614be2ec53e085f47a9df889fd4cc691f309fe7cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452eab7b88c5fa74ad03b89ed5f56fdcfa444931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f2365c345a0c392489deadd312ce9e21022aae1ad2cc42d7f','hex');
const SCN_HDR_SIZE=132;

function angouToKey(bytes){
 const r=Buffer.from(EXE_ORG);if(!bytes||!bytes.length)return null;
 const n=bytes.length,cnt=Math.max(n,16);
 for(let i=0;i<cnt;i++)r[i%16]^=bytes[i%n];
 return r;
}
/* 暗号.dat: its first line, as cp932 bytes, at least 8 of them */
function angouDatKey(raw){
 if(!raw||!raw.length)return null;
 let text;
 if(raw[0]===0xff&&raw[1]===0xfe)text=raw.toString('utf16le',2);
 else if(raw[0]===0xef&&raw[1]===0xbb&&raw[2]===0xbf)text=raw.toString('utf8',3);
 else{const nl=raw.indexOf(0x0a);let line=nl>=0?raw.subarray(0,nl):raw;if(line[line.length-1]===0x0d)line=line.subarray(0,-1);return line.length>=8?angouToKey(line):null;}
 const line=text.split(/\r?\n/)[0];let bytes;try{bytes=Buffer.from(kit.encodeSjis(line));}catch{return null;}
 return bytes.length>=8?angouToKey(bytes):null;
}
function peSections(b){
 if(b.length<0x40||b.readUInt16LE(0)!==0x5a4d)return null;
 const pe=b.readUInt32LE(0x3c);if(pe+24>b.length||b.readUInt32LE(pe)!==0x4550)return null;
 const n=b.readUInt16LE(pe+6),opt=pe+24,magic=b.readUInt16LE(opt);
 const imageBase=magic===0x20b?Number(b.readBigUInt64LE(opt+24)):b.readUInt32LE(opt+28);
 const so=opt+b.readUInt16LE(pe+20),secs=[];
 for(let i=0;i<n;i++){const o=so+i*40;if(o+40>b.length)break;secs.push({va:b.readUInt32LE(o+12),rawSize:b.readUInt32LE(o+16),raw:b.readUInt32LE(o+20),chr:b.readUInt32LE(o+36)});}
 return {imageBase,secs};
}
function vaToOff(pe,va){const r=va-pe.imageBase;for(const s of pe.secs)if(r>=s.va&&r<s.va+s.rawSize)return s.raw+(r-s.va);return -1;}
function exeKey(b){
 const pe=peSections(b);if(!pe)return null;
 const SIG=Buffer.from([0x8a,0x44,0x0d]),TAIL=Buffer.from([0x8d,0x52,0x01,0x30,0x42,0xff,0x41]);
 let hit=-1,disp=0;
 for(const s of pe.secs){
  if(!(s.chr&0x20000000)||s.raw+s.rawSize>b.length)continue;
  const x=b.subarray(s.raw,s.raw+s.rawSize);
  for(let i=x.indexOf(SIG);i>=0&&i<x.length-11;i=x.indexOf(SIG,i+1))if(x.subarray(i+4,i+11).equals(TAIL)){hit=s.raw+i;disp=(x[i+3]<<24)>>24;break;}
  if(hit>=0)break;
 }
 if(hit<0)return null;
 const got=new Map(),from=Math.max(0,hit-0x800),blob=b.subarray(from,hit),want=d=>d>=disp&&d<disp+16;
 for(let i=0;i+4<blob.length;i++)if(blob[i]===0xc6&&blob[i+1]===0x45){const d=(blob[i+2]<<24)>>24;if(want(d)&&!got.has(d))got.set(d,blob[i+3]);}
 for(let i=0;i+3<blob.length;i++){
  if(blob[i]!==0x88||blob[i+1]!==0x45)continue;
  const d=(blob[i+2]<<24)>>24;if(!want(d)||got.has(d))continue;
  for(let j=i-1;j>Math.max(-1,i-0x30);j--){
   if(blob[j]===0xa0&&j+5<=i){const p=vaToOff(pe,blob.readUInt32LE(j+1));if(p>=0&&p<b.length){got.set(d,b[p]);break;}}
   if(blob[j]===0xb0&&j+2<=i){got.set(d,blob[j+1]);break;}
  }
 }
 const out=Buffer.alloc(16);
 for(let d=0;d<16;d++){if(!got.has(disp+d))return null;out[d]=got.get(disp+d);}
 return out;
}

/* ---------- known-plaintext solver ---------- */
const lo=v=>typeof v==='number';
/* the scene dat layout: header field relations (target field <- fields it depends on) */
/* field i <- f(fields): the compiler (SiglusSceneScriptUtility BS.py) writes the sections back to back in this order;
   z labels are a fixed table per engine build (TNM_Z_LABEL_CNT: 1000; 100 in the original Rewrite), tried in turn */
let zCount=1000;
const REL=[[3,()=>SCN_HDR_SIZE,[]],[5,f=>f[3]+8*f[4],[3,4]],[6,f=>f[4],[4]],[7,f=>f[1]+f[2],[1,2]],[9,f=>f[7]+4*f[8],[7,8]],
 [10,()=>zCount<0?null:zCount,[]],[11,f=>f[9]+4*f[10],[9,10]],[13,f=>f[11]+8*f[12],[11,12]],[15,f=>f[13]+8*f[14],[13,14]],[17,f=>f[15]+8*f[16],[15,16]],
 [18,f=>f[16],[16]],[21,f=>f[19]+4*f[20],[19,20]],[23,f=>f[21]+8*f[22],[21,22]],[24,f=>f[22],[22]],[27,f=>f[25]+8*f[26],[25,26]],
 [28,f=>f[26],[26]],[31,f=>f[29]+4*f[30],[29,30]]];
/* sections whose size is a run of UTF-16 text: start must not go backwards and stays even-aligned with the previous one */
const GAP=[[1,5],[19,17],[25,23],[29,27]];
const MAX_IDX=64;
function u32(out,p){let v=0;for(let i=3;i>=0;i--){const x=out[p+i];if(!lo(x))return null;v=v*256+x;}return v;}
/* expected byte at output p, or null when unknown */
function expect(out,p){
 if(p<SCN_HDR_SIZE){
  const fi=p>>2,bi=p&3;if(bi===3)return 0;
  if(fi===0)return (SCN_HDR_SIZE>>(8*bi))&255;
  const r=REL.find(x=>x[0]===fi);if(!r)return null;
  const f=[];for(const d of r[2]){const v=u32(out,d*4);if(v===null)return null;f[d]=v;}
  const t=r[1](f);return t===null?null:(t>>>(8*bi))&255;
 }
 const cnt=u32(out,16);if(cnt===null)return null;
 const q=p-SCN_HDR_SIZE,e=q>>3;if(e>=Math.min(cnt,MAX_IDX))return null;
 /* entries are (char offset, char length) in no particular order: only the high bytes are fixed */
 const w=(q>>2)&1,bi=q&3;if(bi===3||(w&&bi===2))return 0;
 return null;
}
/* decode c (lzss ^ key) as far as the known key bytes allow; literals with an unknown key stay symbolic {j,x} */
function symDecode(c,key){
 const out=[],pins=[];let s=8,need=-1;
 const lim=()=>{const cnt=out.length>=20?u32(out,16):null;return SCN_HDR_SIZE+8*Math.min(cnt===null?0:cnt,MAX_IDX);};
 const put=v=>{
  const p=out.length;out.push(v);
  const e=expect(out,p);
  if(e!==null){if(lo(v)){if(v!==e)return false;}else{pins.push([v.j,v.x^e]);out[p]=e;}}
  if(p<SCN_HDR_SIZE&&(p&3)===3){
   const fi=p>>2;
   for(const [a,b] of GAP)if(a===fi||b===fi){const x=u32(out,a*4),y=u32(out,b*4);if(x!==null&&y!==null&&(x<y||(x-y)&1))return false;}
   /* the last two fields give the unpacked size = lzss header bytes 4..7 */
   if(fi===32){const x=u32(out,124),y=u32(out,128);if(x!==null&&y!==null){const n=x+4*y;for(let j=0;j<4;j++){const b=(n>>>(8*j))&255;if(key[4+j]<0)pins.push([4+j,c[4+j]^b]);else if((c[4+j]^key[4+j])!==b)return false;}}}
  }
  return true;
 };
 const kb=i=>key[i&15];
 outer:while(s<c.length&&out.length<Math.max(lim(),20)){
  if(kb(s)<0){need=s&15;break;}
  const fl=c[s]^kb(s);s++;
  for(let b=0;b<8;b++){
   if(out.length>=Math.max(lim(),20))break outer;
   if(s>=c.length)break outer;
   if((fl>>b)&1){const k=kb(s);if(!put(k<0?{j:s&15,x:c[s]}:c[s]^k))return null;s++;continue;}
   if(s+1>=c.length)return null;
   if(kb(s)<0){need=s&15;break outer;}if(kb(s+1)<0){need=(s+1)&15;break outer;}
   const t=(c[s]^kb(s))|((c[s+1]^kb(s+1))<<8),d=t>>4,l=(t&15)+2;s+=2;
   if(!d||d>out.length)return null;
   for(let i=0;i<l;i++)if(!put(out[out.length-d]))return null;
  }
 }
 return {need,pins,out};
}
function lzssUnpack(c){return kit.lzDistance(c,c.readUInt32LE(4),{at:8,strict:true});}
/* blobs: scene data already XORed with EASY_ANGOU_CODE. check(dat) validates a decompressed scene. */
function solveKey(blobs,{check=()=>true,maxNodes=8e6,verify=6,seed=null}={}){
 blobs=blobs.filter(c=>c&&c.length>=24&&c.length<64<<20);
 if(!blobs.length)return null;
 const votes=new Map();
 for(const c of blobs){const t=Buffer.alloc(4);t.writeUInt32LE(c.length);const k=Buffer.from([0,1,2,3].map(j=>c[j]^t[j])).toString('hex');votes.set(k,(votes.get(k)||0)+1);}
 const top=[...votes].sort((a,b)=>b[1]-a[1])[0];
 if(top[1]<Math.min(3,blobs.length))return null;
 const head=Buffer.from(top[0],'hex');
 const pool=blobs.filter(c=>{const t=Buffer.alloc(4);t.writeUInt32LE(c.length);return [0,1,2,3].every(j=>(c[j]^t[j])===head[j]);});
 /* spread the sample over different stream openings: identical prefixes add no constraints */
 const seen=new Set(),sample=[];
 for(const c of pool){const k=c.subarray(8,16).toString('hex');if(seen.has(k))continue;seen.add(k);sample.push(c);if(sample.length>=16)break;}
 for(const c of pool){if(sample.length>=24)break;if(!sample.includes(c))sample.push(c);}
 const key=seed?Int16Array.from(seed):new Int16Array(16).fill(-1);for(let j=0;j<4;j++)key[j]=head[j];
 let nodes=0;
 const final=k=>{
  if(Array.from(k).some(v=>v<0))return null;
  const kb=Buffer.from(Array.from(k));
  let ok=0;for(const c of pool.slice(0,verify)){try{const d=lzssUnpack(kit.xor(c,kb));if(!check(d))return null;ok++;}catch{return null;}}
  return ok?kb:null;
 };
 /* returns a key, NO (subtree refuted) or CAP (gave up at this cap); each child subtree gets at most cap nodes,
    and the caller retries with a larger cap, so one wide wrong branch cannot starve the right one */
 const NO=0,CAP=1;
 const dfs=(k,cap,cnt)=>{
  if(++nodes>maxNodes||++cnt.n>cap)return CAP;
  let need=-1;
  for(let round=0;round<64;round++){
   let changed=false;need=-1;
   for(const c of sample){
    const r=symDecode(c,k);if(!r)return NO;
    for(const [j,v] of r.pins){if(k[j]<0){k[j]=v;changed=true;}else if(k[j]!==v)return NO;}
    if(r.need>=0&&need<0)need=r.need;
   }
   if(!changed)break;
  }
  if(need<0){
   for(let j=0;j<16;j++)if(k[j]<0){need=j;break;}
   if(need<0)return final(k)||NO;
  }
  let capped=false;
  for(let v=0;v<256;v++){
   const k2=Int16Array.from(k);k2[need]=v;
   const r=dfs(k2,cap,{n:0});
   if(r&&r!==CAP)return r;if(r===CAP)capped=true;
   if(nodes>maxNodes)return CAP;
  }
  return capped?CAP:NO;
 };
 /* the compressor opens every dat the same way (literal 84, literal 00, ref dist 1 len 2): try that guess first */
 const mode=j=>{const m=new Map();for(const c of pool)m.set(c[j],(m.get(c[j])||0)+1);return [...m].sort((a,b)=>b[1]-a[1])[0][0];};
 const guess=Int16Array.from(key);[[9,0x84],[10,0],[11,0x10],[12,0]].forEach(([j,v])=>{if(guess[j]<0)guess[j]=mode(j)^v;});
 const run=(start,limit)=>{const stop=nodes+limit;for(let cap=64;nodes<stop&&nodes<maxNodes;cap*=4){const r=dfs(Int16Array.from(start),cap,{n:0});if(r!==CAP)return r||null;}return null;};
 const saved=zCount;
 try{
  for(const z of [1000,100,-1]){zCount=z;const r=run(guess,maxNodes>>3);if(r)return r;}
  for(const z of [1000,100,-1]){zCount=z;const r=run(key,maxNodes);if(r)return r;}
 }finally{zCount=saved;}
 return null;
}

/* ---------- Gameexe.dat ---------- */
function gameexeText(buf,exeEl){
 if(!buf||buf.length<16)return '';
 const mode=buf.readInt32LE(4);
 let p=kit.xor(Buffer.from(buf.subarray(8)),GAMEEXE_ANGOU_CODE);
 if(mode!==0){if(!exeEl)return '';p=kit.xor(p,exeEl);}
 if(p.readUInt32LE(0)!==p.length)return '';
 try{return lzssUnpack(p).toString('utf16le');}catch{return '';}
}
function gameexeFile(dir){let names=[];try{names=fs.readdirSync(dir).filter(n=>/^gameexe.*\.dat$/i.test(n));}catch{}names.sort((a,b)=>(/^gameexe\.dat$/i.test(b)?1:0)-(/^gameexe\.dat$/i.test(a)?1:0));return names.length?path.join(dir,names[0]):null;}
function exeCandidates(dir){
 let names=[];try{names=fs.readdirSync(dir).filter(n=>/\.exe$/i.test(n));}catch{}
 names.sort((a,b)=>(/^siglus/i.test(b)?1:0)-(/^siglus/i.test(a)?1:0));
 return names.map(n=>path.join(dir,n)).filter(f=>{try{const s=fs.statSync(f).size;return s>512<<10&&s<64<<20;}catch{return false;}});
}

module.exports={angouToKey,angouDatKey,exeKey,solveKey,gameexeText,gameexeFile,exeCandidates,_internal:{REL,GAP,EXE_ORG,GAMEEXE_ANGOU_CODE,symDecode,expect,lzssUnpack}};
