// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 Encrypted name tables of Yuzusoft-style xp3 archives, as in GARbro (morkt, MIT; ArcFormats/KiriKiri/YuzCrypt.cs):
   only the first 0x100 bytes of the zlib table are encrypted. "dls:" (NanaCxCrypt: Grisaia Phantom Trigger 3/4,
   Haruoto Alice＊Gram, Momoiro Closet) XORs each 8 bytes with a 27-round transform of (block number ^ seed); "yuz:" in
   RiddleCxCrypt titles (Riddle Joker, Café Stella) XORs each 64 bytes with a ChaCha-like block of the scheme's YuzKey,
   control block, seeds and block number. The keys are the YuzKey of each scheme in cx-schemes.json. */
const zlib=require('node:zlib');
const rotl=(x,n)=>((x<<n)|(x>>>(32-n)))>>>0,rotr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
// NanaDecryptor
function nana(key,data){const state=new Uint32Array(27);let k=key[0]>>>0;const s=[key[1]>>>0,key[2]>>>0,key[3]>>>0];state[0]=k;
 for(let i=0;i<26;i++){const src=i%3,m=rotr(s[src],8),n=(i^((k+m)>>>0))>>>0;k=(n^rotl(k,3))>>>0;state[i+1]=k;s[src]=n;}
 const seedLo=key[4]>>>0,seedHi=key[5]>>>0,len=Math.min(data.length,0x100);let i=0,off=0;
 while(i<len){off++;let lo=(off^seedLo)>>>0,hi=seedHi>>>0;/* offset < 2^32 */
  for(let r=0;r<27;r++){hi=rotr(hi,8);hi=(hi+lo)>>>0;hi=(hi^state[r])>>>0;lo=rotl(lo,3);lo=(lo^hi)>>>0;}
  const kb=[lo&255,lo>>>8&255,lo>>>16&255,lo>>>24,hi&255,hi>>>8&255,hi>>>16&255,hi>>>24];for(let j=0;j<8&&i<len;j++)data[i++]^=kb[j];}
 return data;}
// YuzDecryptor (key1: the control block's first 32 bytes, key2: YuzKey's first 16 bytes)
function yuzc(cb,key,data){const st=Buffer.alloc(64);for(let i=0;i<4;i++)st.writeUInt32LE(key[i]>>>0,i*4);for(let i=0;i<8;i++)st.writeUInt32LE(cb[i]>>>0,16+i*4);
 st.writeUInt32LE(0xffffffff,48);st.writeUInt32LE(0xffffffff,52);st.writeUInt32LE((~key[4])>>>0,56);st.writeUInt32LE((~key[5])>>>0,60);
 const len=Math.min(data.length,0x100);let i=0,off=0;
 while(i<len){const s1=Buffer.from(st);s1.writeUInt32LE((~off)>>>0,48);s1.writeUInt32LE(0xffffffff,52);off++;const out=transform(s1);for(let j=0;j<64&&i<len;j++)data[i++]^=out[j];}
 return data;}
function transform(s1){const t=new Uint32Array(16);for(let i=0;i<16;i++)t[i]=(~s1.readUInt32LE(i*4))>>>0;const R=rotl;
 for(let c=4;c>0;c--){let t1=(t[4]+t[0])>>>0,t2=R((t1^t[12])>>>0,16),t3=(t2+t[8])>>>0,t4=R((t[4]^t3)>>>0,12),t5=(t4+t1)>>>0,t6=R((t5^t2)>>>0,8);
  t[12]=t6;t6=(t6+t3)>>>0;t[4]=R((t4^t6)>>>0,7);
  t4=R(((t[5]+t[1])^t[13])>>>0,16);t3=R((t[5]^((t4+t[9])>>>0))>>>0,12);t2=(t3+t[5]+t[1])>>>0;t[13]=R((t2^t4)>>>0,8);t[9]=(t[9]+t[13]+t4)>>>0;t[5]=R((t3^t[9])>>>0,7);
  t4=R(((t[6]+t[2])^t[14])>>>0,16);t[10]=(t[10]+t4)>>>0;t1=R((t[6]^t[10])>>>0,12);t3=(t1+t[6]+t[2])>>>0;t[14]=R((t3^t4)>>>0,8);t[6]=R((t1^((t[14]+t[10])>>>0))>>>0,7);t[10]=(t[10]+t[14])>>>0;
  t4=((t[7]+t[3])^t[15])>>>0;t[3]=(t[3]+t[7])>>>0;t4=R(t4,16);t[11]=(t[11]+t4)>>>0;t1=R((t[7]^t[11])>>>0,12);t4=(t4^((t1+t[3])>>>0))>>>0;t[3]=(t[3]+t1)>>>0;t4=R(t4,8);t[11]=(t[11]+t4)>>>0;t1=R((t1^t[11])>>>0,7);
  t5=(t5+t[5])>>>0;t2=(t2+t[6])>>>0;t4=R((t5^t4)>>>0,16);t[10]=(t[10]+t4)>>>0;t[5]=R((t[5]^t[10])>>>0,12);t[0]=(t[5]+t5)>>>0;t4=R((t[0]^t4)>>>0,8);t[15]=t4;t[10]=(t[10]+t4)>>>0;t[5]=R((t[5]^t[10])>>>0,7);
  t[12]=R((t[12]^t2)>>>0,16);t[11]=(t[11]+t[12])>>>0;t4=R((t[11]^t[6])>>>0,12);t[1]=(t4+t2)>>>0;t[12]=R((t[12]^t[1])>>>0,8);t[11]=(t[11]+t[12])>>>0;t[6]=R((t4^t[11])>>>0,7);
  t3=(t3+t1)>>>0;t4=R((t[13]^t3)>>>0,16);t2=(t4+t6)>>>0;t1=R((t2^t1)>>>0,12);t[2]=(t1+t3)>>>0;t[13]=R((t4^t[2])>>>0,8);t[8]=(t[13]+t2)>>>0;t[7]=R((t[8]^t1)>>>0,7);
  t6=R((t[14]^((t[4]+t[3])>>>0))>>>0,16);t1=R((t[4]^((t6+t[9])>>>0))>>>0,12);t[3]=(t[3]+t1+t[4])>>>0;t3=R((t6^t[3])>>>0,8);t[9]=(t[9]+t3+t6)>>>0;t[4]=R((t1^t[9])>>>0,7);t[14]=t3;}
 const out=Buffer.alloc(64);for(let i=0;i<16;i++)out.writeUInt32LE((t[i]+((~s1.readUInt32LE(i*4))>>>0))>>>0,i*4);return out;}
let schemes=null;const yuzSchemes=()=>schemes??=require('./cx-schemes.json').schemes.filter(s=>Array.isArray(s.yuz)).map(s=>({type:s.type,yuz:s.yuz,cb:s.cb?(()=>{const b=Buffer.from(s.cb,'base64');return Array.from({length:b.length>>2},(_,i)=>b.readUInt32LE(i*4));})():null}));
// The plain name table (zlib inflated) of a raw one: as stored when it inflates, else under each known key.
function inflateNames(raw,tag){const tries=[b=>b];if(tag==='dls:'||tag==='yuz:')for(const s of yuzSchemes()){if(s.type==='NanaCxCrypt')tries.push(b=>nana(s.yuz,b));else if(s.cb)tries.push(b=>yuzc(s.cb,s.yuz,b));}
 for(const f of tries){try{return zlib.inflateSync(f(Buffer.from(raw)));}catch{}}return null;}
module.exports={nana,yuzc,inflateNames,_transform:transform};
