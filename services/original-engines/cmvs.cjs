// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {classify}=require('./cmvs-bytecode.cjs');
/* E592 CMVS — Purple Software's engine (Purple software, Chronoclock, Amatarasu Riddle Star, 青空の見える丘, ハピメア …;
   ~44 company releases, 26 since 2016). Family A (string pool, docs/engine-families.md).
   Format references (read, not copied): GARbro ArcFormats/Cmvs ArcCPZ.cs, CpzHeader.cs, CmvsMD5.cs (morkt, MIT) for the
   archive; ZQF-ReVN/RxCMVS PS3_Cryptor.cpp / PS3_TextEditor.cpp (no licence: format facts only) for the script; the
   per-title constants live in cmvs-schemes.json.
     CVNS    "CPZ1" and "CPZ2" use a flat index. CPZ1 has a fixed byte key; CPZ2 has a masked header, a
             checksum and separate keys for the index and entries. Their .pss scripts use PSS0,
             with the PS2A section layout and LZSS stream but no script-level byte rotation.
     CMVS    "CPZ3" keeps the flat index and checksum of CPZ2, with different masks and a different word cipher.
             Its .ps2 scripts use the existing PS2A parser.
     *.cpz   "CPZ5" / "CPZ6" / "CPZ7" (read). A 0x40-byte header
             of XOR-masked fields with an additive checksum and the index's MD5; the index is decrypted in four passes
             (stage 1 with the CPZ5 secret, a byte substitution table, the directory cipher, the per-directory entry
             cipher), keyed by a modified MD5 of four header words (the variant differs per title). Entries are
             decrypted with the same secret and table.
             CMVS 3.x CPZ6 (アマツツミ, クロノクロック …) runs the same passes with the CPZ6/7 constants and the
             CPZ5 entry seed subtrahend (cmvs-schemes.json "cpz6"; seen in cmvs32 3.26: seed − 0x5C29E87B, decoder factor
             0x1A74F195); the index decides which set fits, the md5 variant is "Chrono" there.
             CPZ7 (青い鳥 …): a 0x48-byte header; after the index comes a key block {MD5 of the rest, unpacked
             length, 4 XOR bytes, a Huffman tree and stream} whose ≥ 1023 bytes are XORed over the index first. The passes
             then run with the CPZ6/7 constants (cmvs-schemes.json "cpz7") and four per-archive values that start.ps3
             registers with the archive (0x2268–0x226E after packing mode 0x201F = 13; mode 12 means zeros): the
             directory and file step XORs, a seed addend and an entry-seed XOR. Format reference (read, not copied):
             Shizuku-in/cmvs-rs crates/cmvs-core/src/cpz/{cpz7,crypto}.rs and script_control.rs (Apache-2.0).
     *.ps2 / *.ps3  "PS2A": 0x30-byte header {+0xC key, +0x10 text count, +0x14 code size, +0x18 extra size,
             +0x1C text size, +0x24 packed size, +0x28 unpacked size}; the body is byte-rotated
             (b = ror(k ^ (b - 0x7C), (key >> 20) % 5 + 1), k = (key >> 24) + (key >> 3)) then LZSS (2 KB window from
             0x7DF, 3 offset bits in the high byte, length + 2).
   Text model: the code section (code + 4 × text count + extra) pushes strings with 01 02 20 01 <u32 offset> 0F 02 30 04;
   the offset points into the text section (C strings). Lines come in push order, so a Chinese patch that appends its
   strings and repoints the pushes (how RxCMVS rebuilds a .ps3) pairs 1:1. Resource names (.ogg, .ps3 …) and ASCII
   strings are anchors. */
const kit=require('./kit.cjs'),fs=require('node:fs'),path=require('node:path');
const SCHEMES=require('./cmvs-schemes.json');
const hex=s=>parseInt(s,16)>>>0;
/* set 'cpz5' (CPZ5/CPZ6) or 'cpz7'; an adapter pack's params may bring its own md5 variants and either set */
function scheme(params,set='cpz5'){const s=params||SCHEMES,c={...SCHEMES[set],...(s[set]||{})};
 return {md5:Object.entries(s.md5||SCHEMES.md5).map(([name,v])=>({name,init:v.init.map(hex),out:v.out.map(([i,op,k])=>[i,op,hex(k)])})),
  secret:c.secret.map(hex),factor:hex(c.decoderFactor),entryInit:hex(c.entryInitKey),entrySub:hex(c.entrySubKey),entryTail:hex(c.entryTailKey),entryPos:hex(c.entryKeyPos),
  indexSeed:hex(c.indexSeed),indexAddend:hex(c.indexAddend),indexSub:hex(c.indexSubtrahend),dirAddend:c.dirKeyAddend.map(hex),
  entryIndexTail:hex(c.entryIndexTail||'5')};}
const DEFAULT=scheme(),DEFAULT7=scheme(null,'cpz7');
/* CPZ5/CPZ6 archives try each constant set in cmvs-schemes.json "order": the GARbro CPZ5 set, then the CMVS 3.x CPZ6 set */
const ORDER=(SCHEMES.order||['cpz5']).filter(n=>SCHEMES[n]),DEFAULTS=ORDER.map(n=>scheme(null,n));
const late5=SCHEMES.cpz5Late,CPZ5_SETS=[...DEFAULTS,
 scheme({cpz5:{secret:late5.secret},md5:{Mode8:late5.mode8Digest}}),
 scheme({cpz5:{secret:late5.secret,...late5.mode9},md5:{B:SCHEMES.md5.B}})];
const rotl=(v,n)=>{n&=31;return n?((v<<n)|(v>>>(32-n)))>>>0:v>>>0;},rotr=(v,n)=>{n&=31;return n?((v>>>n)|(v<<(32-n)))>>>0:v>>>0;};

/* ---- modified MD5: one compression of {w0..w3, 0x80, 0 …, 0x80 (bit length), 0} from the variant's state ---------- */
const S=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]],T=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);
function md5Words(words,variant){const m=new Array(16).fill(0);for(let i=0;i<4;i++)m[i]=words[i]>>>0;m[4]=0x80;m[14]=0x80;
 let [a,b,c,d]=variant.init;const st=[...variant.init];
 for(let i=0;i<64;i++){let f,g;if(i<16){f=d^(b&(c^d));g=i;}else if(i<32){f=c^(d&(b^c));g=(5*i+1)&15;}else if(i<48){f=b^c^d;g=(3*i+5)&15;}else{f=c^(b|~d);g=(7*i)&15;}
  const t=d;d=c;c=b;b=(b+rotl((a+f+m[g]+T[i])>>>0,S[i>>4][i&3]))>>>0;a=t;}
 st[0]=(st[0]+a)>>>0;st[1]=(st[1]+b)>>>0;st[2]=(st[2]+c)>>>0;st[3]=(st[3]+d)>>>0;
 return variant.out.map(([i,op,k])=>op==='^'?(st[i]^k)>>>0:op==='+'?(st[i]+k)>>>0:(st[i]-k)>>>0);}

/* ---- header ------------------------------------------------------------------------------------------------------- */
function header(h){if(h.length<0x40||h.toString('latin1',0,3)!=='CPZ')return null;const v=h[3]-48;if(v<5||v>7)return null;
 const u=o=>h.readUInt32LE(o),i=o=>h.readInt32LE(o),sum=(n,init)=>{let s=init;for(let o=0;o<n;o+=4)s=(s+u(o))>>>0;return s;};
 const c=v===5?{k:[-0x1C5AC27,0x37F298E7,0x7A6F3A2C,0xAE7D39BF,0xFB73A955],m:[0x43DE7C19,0xCC65F415,0xD016A93C,0x97A3BA9A]}
  :{k:[-0x1C5AC26,0x37F298E8,0x7A6F3A2D,0xAE7D39B7,0xFB73A956],m:[0x43DE7C1A,0xCC65F416,0xD016A93D,0x97A3BA9B]};
 const r={version:v,dirCount:i(4)^c.k[0],dirSize:i(8)^c.k[1],fileSize:i(12)^c.k[2],master:(u(0x30)^c.k[3])>>>0,mode:(u(0x34)^c.k[4])>>>0,encrypted:((u(0x34)^c.k[4])>>>0)!==0,
  md5:c.m.map((k,n)=>(u(0x20+n*4)^k)>>>0),entryKey:v===5?0:(Math.imul(0x7DA8F173,rotr((u(0x38)^0x37ACF832)>>>0,5))+0x13712765)>>>0,nameAt:0x18,indexAt:0x40,checksum:true};
 if(v===7){if(h.length<0x48)return null;const raw=u(0x40);r.keySize=(raw^0x65EF99F3)|0;r.nameAt=0x1C;r.indexAt=0x48;r.checksum=sum(0x40,(raw-0x6DC5A9B4)>>>0)===u(0x44);}
 else r.checksum=sum(0x3C,0x923A564C)===u(0x3C);
 r.indexMd5=h.subarray(0x10,0x20);return r.checksum&&r.dirCount>0&&r.dirSize>0&&r.fileSize>0?r:null;}

/* ---- index -------------------------------------------------------------------------------------------------------- */
function table(key,summand,factor){const t=Uint8Array.from({length:256},(_,i)=>i);
 for(let n=0;n<256;n++){let a=(key>>>16)&255,b=key&255,x=t[a];t[a]=t[b];t[b]=x;a=(key>>>8)&255;b=key>>>24;x=t[a];t[a]=t[b];t[b]=x;key=(summand+Math.imul(factor,rotr(key,2)))>>>0;}
 return t;}
function stage1(d,key,sc){const sk=sc.secret.map(s=>(s-key)>>>0),shift=(((key>>>24)^(key>>>16)^(key>>>8)^key^0xB)&15)+7,n=d.length>>>2;let j=5;
 for(let p=0;p<n;p++){d.writeUInt32LE((rotr(((sk[j]^d.readUInt32LE(p*4))+sc.indexAddend)>>>0,shift)+0x01010101)>>>0,p*4);j=(j+1)%24;}
 for(let q=n*4,k=d.length&3;k>0;k--,q++){d[q]=((d[q]^(sk[j]>>>(k*4)))-sc.indexSub)&255;j=(j+1)%24;}}
function dirCipher(d,len,key4,arcKey=0){let seed=0x76548AEF,i=0;
 for(;i<len>>>2;i++){d.writeUInt32LE((rotl(((d.readUInt32LE(i*4)^key4[i&3])-0x4A91C262)>>>0,3)-seed)>>>0,i*4);seed=(seed+((0x10FB562A^arcKey)>>>0))>>>0;}
 for(let q=i*4;q<len;q++,i++)d[q]=((d[q]^(key4[i&3]>>>6))+0x37)&255;}
function entryCipher(d,at,len,key4,seed,arcKey=0,tail=5){let i=0;
 for(;i<len>>>2;i++){const o=at+i*4;d.writeUInt32LE((rotl(((d.readUInt32LE(o)^key4[i&3])-seed)>>>0,2)+0x37A19E8B)>>>0,o);seed=(seed-((0x139FA9B^arcKey)>>>0))>>>0;}
 for(let q=at+i*4;q<at+len;q++,i++)d[q]=((d[q]^(key4[i&3]>>>4))+tail)&255;}
/* the entries of one directory index decrypted with one md5 variant, or null when it does not parse;
   arc: a CPZ7 archive's start.ps3 values ({dirStep, fileStep}) and where its data begins (base) */
function readIndex(raw,h,variant,sc,fileSize,arc={}){const idx=Buffer.from(raw),md5=md5Words(h.md5,variant),mk=h.master;
 stage1(idx,(mk^0x3795B39A)>>>0,sc);let t=table(mk,md5[1],sc.factor);for(let i=0;i<h.dirSize;i++)idx[i]=t[0x3A^idx[i]];
 dirCipher(idx,h.dirSize,[(md5[0]^((mk+0x76A3BF29)>>>0))>>>0,(md5[1]^mk)>>>0,(md5[2]^((mk+0x10000000)>>>0))>>>0,(md5[3]^mk)>>>0],arc.dirStep||0);
 t=table(mk,md5[2],sc.factor);const base=arc.base??h.indexAt+raw.length,out=[];let dp=0;
 for(let d=0;d<h.dirCount;d++){if(dp+16>h.dirSize)return null;const size=idx.readInt32LE(dp),count=idx.readInt32LE(dp+4),eo=idx.readInt32LE(dp+8),dirKey=idx.readUInt32LE(dp+12);
  if(size<=16||dp+size>h.dirSize||count<0||count>=0x10000)return null;const name=kit.cstr(idx,dp+16,dp+size).toString('latin1');
  const next=d+1===h.dirCount?h.fileSize:(dp+size+12<=h.dirSize?idx.readInt32LE(dp+size+8):-1),len=next-eo;if(len<=0||eo<0||h.dirSize+eo+len>idx.length)return null;
  let cur=h.dirSize+eo;const end=cur+len;for(let i=cur;i<end;i++)idx[i]=t[0x7E^idx[i]];
  entryCipher(idx,cur,len,md5.map((m,j)=>(m^((dirKey+sc.dirAddend[j])>>>0))>>>0),sc.indexSeed,arc.fileStep||0,sc.entryIndexTail);
  for(let e=0;e<count;e++){if(cur+h.nameAt>end)return null;const es=idx.readInt32LE(cur);if(es<=h.nameAt||cur+es>end)return null;
   const nb=kit.cstr(idx,cur+h.nameAt,cur+es);if(!nb||!nb.length||nb.some(c=>c<0x20))return null;const ko=cur+(h.version>6?0x14:0x10);
   const entry={name:(name==='root'?'':name+'/')+kit.SJIS.decode(nb),offset:Number(idx.readBigInt64LE(cur+4))+base,size:idx.readUInt32LE(cur+12),key:(idx.readUInt32LE(ko+4)+dirKey)>>>0};
   if(entry.offset<base||entry.offset+entry.size>fileSize)return null;out.push(entry);cur+=es;}
  dp+=size;}
 return {entries:out,md5,variant:variant.name};}
const md5sum=b=>require('node:crypto').createHash('md5').update(b).digest();

/* ---- CPZ7 index key and start.ps3 values ---------------------------------------------------------------------------- */
/* the key block after a CPZ7 index: {MD5 of the rest, unpacked length, 4 XOR bytes, Huffman tree + stream} -> the key, or
   null. Bits are read low bit first from each byte XORed with xor[byte & 3]; a 0 bit is a leaf with an 8-bit symbol, a 1
   bit an inner node (left, then right); at most 255 inner nodes. */
function indexKey(block){if(block.length<24||!md5sum(block.subarray(16)).equals(block.subarray(0,16)))return null;const n=block.readUInt32LE(16);if(n<0x3FF||n>0x10000)return null;
 const xor=block.subarray(20,24),bits=block.subarray(24);let bit=0;
 const get=c=>{let v=0;for(;c>0;c--){const at=bit>>>3;if(at>=bits.length)throw Error('CPZ7_KEY_SHORT');v=(v<<1)|(((bits[at]^xor[at&3])>>>(bit&7))&1);bit++;}return v;};
 const nodes=[],tree=()=>{if(!get(1))return get(8);if(nodes.length>=255)throw Error('CPZ7_KEY_TREE');const at=nodes.push([0,0])-1,l=tree(),r=tree();nodes[at]=[l,r];return at+256;};
 try{const root=tree(),out=Buffer.alloc(n);for(let i=0;i<n;i++){let s=root;while(s>=256)s=nodes[s-256][get(1)];out[i]=s;}return out;}catch{return null;}}
/* start.ps3's straight-line pushes: 00 02 00 01 <u32> 0F 02 30 04 (number) or 01 02 20 01 <text offset> 0F 02 30 04 (string),
   then a 2-byte command. Packing mode 0x201F = 13 registers each CPZ7 archive with 0x2268–0x226E after six pushes: entry-seed
   XOR, seed addend, file step XOR, directory step XOR, path, slot. Mode 12 uses zeros. -> {name: values} (lower-case base
   names), {'*': zeros} for mode 12, null when the script says nothing. */
const NUM=[0,2,0,1],STR=[1,2,0x20,1],END=[0x0F,2,0x30,4];
function startValues(buf){const d=unpackPs2(buf);if(!d)return null;const count=d.readUInt32LE(0x10),code=0x30,codeLen=d.readUInt32LE(0x14),text=code+codeLen+4*count+d.readUInt32LE(0x18),textLen=d.readUInt32LE(0x1C);
 if(text+textLen>d.length)return null;const end=Math.min(code+codeLen,text);
 const push=(p,kind)=>{if(p<code||p+12>end)return null;for(let i=0;i<4;i++)if(d[p+i]!==kind[i]||d[p+8+i]!==END[i])return null;return d.readUInt32LE(p+4);};
 let mode=null;const out={};
 for(let p=code+12;p+2<=end;p++){const op=d.readUInt16LE(p);
  if(op===0x201F&&push(p-12,NUM)!==null){mode=push(p-12,NUM);continue;}
  if(mode!==13||op<0x2268||op>0x226E)continue;
  const v=[0,12,24,36].map(o=>push(p-72+o,NUM)),at=push(p-24,STR),slot=push(p-12,NUM);if(v.includes(null)||at===null||slot===null)continue;
  const s=kit.cstr(d,text+at,text+textLen);if(!s)continue;const name=s.toString('latin1').split(/[\\/]/).pop().toLowerCase();
  out[name]={resXor:v[0],seedAdd:v[1],fileStep:v[2],dirStep:v[3]};}
 return mode===12?{'*':{resXor:0,seedAdd:0,fileStep:0,dirStep:0}}:Object.keys(out).length?out:null;}
const ZERO7={resXor:0,seedAdd:0,fileStep:0,dirStep:0};
/* the values for one CPZ7 archive: start.ps3 beside it (data/pack) or one or two folders up, else zeros (青い鳥) */
function cpz7Values(file){const name=path.basename(file).toLowerCase();let dir=path.dirname(file);
 for(let up=0;up<3;up++,dir=path.dirname(dir)){const s=path.join(dir,'start.ps3');if(!kit.isFile(s))continue;
  let v=null;try{v=startValues(fs.readFileSync(s));}catch{}if(v)return v[name]||v['*']||null;}
 return null;}
function open7(file,h,fsz,params){if(h.mode>1||h.keySize<24)return null;const n=h.dirSize+h.fileSize,raw=kit.readAt(file,h.indexAt,n+h.keySize);
 if(raw.length!==n+h.keySize||!md5sum(raw).equals(h.indexMd5))return null;const key=indexKey(raw.subarray(n));if(!key)return null;
 const idx=Buffer.from(raw.subarray(0,n));for(let i=0;i<n;i++)idx[i]^=key[(i+3)%0x3FF];
 const sc=params?scheme(params,'cpz7'):DEFAULT7,found=cpz7Values(file),tries=found?[found,ZERO7]:[ZERO7];
 for(const values of tries)for(const v of sc.md5){const x=readIndex(idx,h,v,sc,fsz,{...values,base:h.indexAt+n+h.keySize});if(x&&x.entries.length)return {...x,h,sc,values};}
 return null;}

const memo=new Map();
const paramsKey=p=>{if(!p)return '';try{return JSON.stringify(p);}catch{return null;}};
function startStamp(file){const out=[];let dir=path.dirname(file);
 for(let up=0;up<3;up++){const s=path.join(dir,'start.ps3');let st=null;try{st=fs.statSync(s,{throwIfNoEntry:false});}catch{}if(st&&st.isFile())out.push(s+':'+st.size+':'+st.mtimeMs);
  const upDir=path.dirname(dir);if(upDir===dir)break;dir=upDir;}
 return out.join(';');}
/* Flat CPZ indexes (GARbro ArcCPZ1.cs / ArcCPZ2.cs, cmvs-rs cpz2.rs / cpz3.rs). */
const CPZ1_KEY=Buffer.from(SCHEMES.cpz1.key,'hex');
const FLAT_WORD_FORMATS={
 2:{countMask:0xe47c59f3,indexSizeMask:0x3f71de2a,indexKeyMask:0x40de832c,entryKeyMask:0x796c3afd,
    words:SCHEMES.cpz2.words.map(hex),shiftSeed:5,firstWord:0,wordAdd:-0x15c3e7,rotate:rotr,tailAdd:55,reverseTail:false},
 3:{countMask:0x5e9c4f37,indexSizeMask:0xf32aed17,indexKeyMask:0xdddddddd^0x7bf4a539,entryKeyMask:0xc7f5da63,
    words:SCHEMES.cpz3.words.map(hex),shiftSeed:13,firstWord:3,wordAdd:0x6e58a5c2,rotate:rotl,tailAdd:0x52,reverseTail:true}
};
function decryptCpz1(data){
 for(let i=0;i<data.length;i++)data[i]=((data[i]^CPZ1_KEY[i%CPZ1_KEY.length])-0x6c)&255;
 return data;
}
function decryptFlatWords(data,key,format){
 let shift=format.shiftSeed;
 for(let bit=0;bit<32;bit+=4)shift^=(key>>>bit)&15;
 shift+=8;
 const table=format.words.map(word=>(word+key)>>>0);
 let pos=0,word=format.firstWord;
 for(;pos+4<=data.length;pos+=4,word++){
  const value=(data.readUInt32LE(pos)^table[word&15])+format.wordAdd;
  data.writeUInt32LE(format.rotate(value,shift),pos);
 }
 const tailStart=pos;
 for(;pos<data.length;pos++,word++){
  const nibble=format.reverseTail?data.length-pos:pos-tailStart;
  data[pos]=(data[pos]^(table[word&15]>>>(nibble*4)))+format.tailAdd;
 }
 return data;
}
function flatChecksum(data){
 let sum=0x78341256,pos=0;
 for(;pos+4<=data.length;pos+=4)sum=(sum+data.readUInt32LE(pos))>>>0;
 for(;pos<data.length;pos++)sum=(sum+data[pos])>>>0;
 return sum;
}
function openFlat(file,header,fsz,version){
 const format=FLAT_WORD_FORMATS[version],indexAt=format?0x14:0x10;
 if(header.length<indexAt)return null;
 const count=(header.readUInt32LE(4)^(format?.countMask??0))>>>0;
 const indexSize=(header.readUInt32LE(8)^(format?.indexSizeMask??0))>>>0;
 const base=indexAt+indexSize,minRecord=0x1a;
 if((version!==3&&!count)||count>1e6||count>Math.floor(indexSize/minRecord)||indexSize>(64<<20)||base>fsz)return null;
 const index=kit.readAt(file,indexAt,indexSize),entries=[];
 if(index.length!==indexSize)return null;
 if(format){
  if(flatChecksum(index)!==header.readUInt32LE(0x0c))return null;
  decryptFlatWords(index,(header.readUInt32LE(0x10)^format.indexKeyMask)>>>0,format);
 }else decryptCpz1(index);
 let pos=0;
 for(let i=0;i<count;i++){
  if(pos+minRecord>index.length)return null;
  const recordSize=index.readUInt32LE(pos),end=pos+recordSize,nameAt=pos+0x18;
  if(recordSize<minRecord||end>index.length)return null;
  const nameEnd=index.indexOf(0,nameAt);
  const size=index.readUInt32LE(pos+4),offset=base+index.readUInt32LE(pos+8);
  if(nameEnd<=nameAt||nameEnd>=end||offset+size>fsz)return null;
  const entry={name:kit.SJIS.decode(index.subarray(nameAt,nameEnd)),offset,size};
  if(format){
   entry.checksum=index.readUInt32LE(pos+0x10);
   entry.key=(index.readUInt32LE(pos+0x14)^format.entryKeyMask)>>>0;
  }
  entries.push(entry);
  pos=end;
 }
 return {version,h:{version,encrypted:true},entries};
}

/* Open a supported CPZ archive and retain the information needed to read its entries. */
function open(file,params){const fsz=kit.size(file),pk=paramsKey(params),stamp=pk===null?null:file+'|'+fsz+'|'+(kit.isFile(file)?fs.statSync(file).mtimeMs:0)+'|'+startStamp(file)+'|'+pk;
 if(stamp!==null&&memo.has(stamp))return memo.get(stamp);
 let r=null;try{const bytes=kit.head(file,0x48),h=header(bytes),magic=bytes.toString('latin1',0,4);
  if(/^CPZ[123]$/.test(magic))r=openFlat(file,bytes,fsz,bytes[3]-0x30);
  else if(h&&h.version===7)r=open7(file,h,fsz,params);
  else if(h){const sets=params?ORDER.map(n=>scheme(params,n)):h.version===5?CPZ5_SETS:DEFAULTS,raw=kit.readAt(file,h.indexAt,h.dirSize+h.fileSize);
  if(raw.length===h.dirSize+h.fileSize&&md5sum(raw).equals(h.indexMd5))
   find:for(const sc of sets)for(const v of sc.md5){const x=readIndex(raw,h,v,sc,fsz);if(x&&x.entries.length){r={...x,h,sc};break find;}}}}catch{r=null;}
 if(stamp!==null){if(memo.size>64)memo.clear();memo.set(stamp,r);}return r;}
const list=file=>open(file)?.entries||null;
const EARLY_CPZ_MAX_SCRIPT_BODY=64<<20;
/* An all-literal LZSS stream adds one flag byte per eight bytes, plus the script header. */
const EARLY_CPZ_MAX_PACKED_SCRIPT=0x30+EARLY_CPZ_MAX_SCRIPT_BODY+(EARLY_CPZ_MAX_SCRIPT_BODY>>>3);
function read(file,e,params){
 const a=open(file,params);
 if(a?.version<=3&&e.size>EARLY_CPZ_MAX_PACKED_SCRIPT)return Buffer.alloc(0);
 const data=kit.readAt(file,e.offset,e.size);
 if(!a||!a.h.encrypted)return data;
 if(a.version===1)return decryptCpz1(data);
 const format=FLAT_WORD_FORMATS[a.version];
 if(format)return data.length===e.size&&flatChecksum(data)===e.checksum?decryptFlatWords(data,e.key,format):Buffer.alloc(0);
 const {h,sc,md5}=a,v=a.values||ZERO7;let seed=(((((h.master^e.key)>>>0)+h.dirCount)>>>0)^v.resXor)>>>0;seed=(seed-sc.entrySub)>>>0;seed=(seed^((h.entryKey+v.seedAdd)>>>0))>>>0;
 const t=table(md5[3],h.master,sc.factor),kb=Buffer.alloc(64);for(let i=0;i<16;i++)kb.writeUInt32LE(sc.secret[i],i*4);
 const low=(md5[1]>>>2)&255,sk=Array.from({length:16},(_,i)=>{for(let q=0;q<4;q++)kb[i*4+q]=low^t[kb[i*4+q]];return (kb.readUInt32LE(i*4)^seed)>>>0;});
 let key=sc.entryInit,k=sc.entryPos;const n=data.length>>>2;
 for(let i=0;i<n;i++){const v=(md5[key&3]^(((data.readUInt32LE(i*4)^sk[(key>>>6)&15]^(sk[k]>>>1))>>>0)-seed))>>>0;data.writeUInt32LE(v,i*4);k=(k+1)&15;key=(key+seed+v)>>>0;}
 for(let q=n*4;q<data.length;q++)data[q]=t[data[q]^sc.entryTail];
 return data;}

/* ---- PS2A script -------------------------------------------------------------------------------------------------- */
/* a script whose header lengths (code, the 4-byte table, data, text) add up to the file is already plain: the official
   Chinese release of a CPZ7 title keeps its scripts unpacked in FileHook\ */
const scriptSize=buf=>buf.readUInt32LE(0x14)+4*buf.readUInt32LE(0x10)+buf.readUInt32LE(0x18)+buf.readUInt32LE(0x1c);
const scriptLzss={window:0x800,start:0x7df,lenBits:5,minMatch:2};
function unpackPss0(buf){
 if(buf.length<0x30||buf.toString('latin1',0,4)!=='PSS0')return null;
 const expected=buf.readUInt32LE(0x28);
 if(expected!==scriptSize(buf)||expected>EARLY_CPZ_MAX_SCRIPT_BODY||buf.readUInt32LE(0x24)!==buf.length-0x30)return null;
 const body=kit.lzss(buf.subarray(0x30),expected,scriptLzss);
 return body.length===expected?Buffer.concat([buf.subarray(0,0x30),body]):null;
}
function unpackPs2(buf){
 if(buf.length<0x30||buf.toString('latin1',0,4)!=='PS2A')return null;
 if(0x30+scriptSize(buf)===buf.length)return buf;
 const key=buf.readUInt32LE(12),shift=((key>>>20)%5)+1,k=((key>>>24)+(key>>>3))&255;
 const body=Buffer.from(buf.subarray(0x30).map(b=>kit.ror(k^((b-0x7C)&255),shift)));
 return Buffer.concat([buf.subarray(0,0x30),kit.lzss(body,buf.readUInt32LE(0x28),scriptLzss)]);
}
const PUSH=Buffer.from([1,2,0x20,1]),PUSH_END=Buffer.from([0x0f,2,0x30,4]);
const RESOURCE=/\.(ogg|wav|mv2|pb3|pb2|ps3|ps2|cur|cmv|mgv|png|bmp)\b/i;
const CVNS_RESOURCE=/^\S+\.pss$/i;
const DIALOGUE_PUNCT=/[「」『』。、！？…]/;
/* The original offset scan defines push ordinals, even when a slot is empty or decoding falls back.
   MAX_PUSH bounds a damaged string with no terminator. */
const MAX_PUSH=0x2000;
function pushSlots(d){
 const count=d.readUInt32LE(0x10),code=0x30,codeLen=d.readUInt32LE(0x14)+4*count+d.readUInt32LE(0x18),text=code+codeLen,textLen=d.readUInt32LE(0x1C),out=[];
 if(text+textLen>d.length||codeLen<0)return out;
 const tend=text+textLen;
 for(let p=code;p+12<=text;p++){
  if(d[p]!==1||!d.subarray(p,p+4).equals(PUSH)||!d.subarray(p+8,p+12).equals(PUSH_END))continue;
  const at=text+d.readUInt32LE(p+4),end=Math.min(tend,at+MAX_PUSH),s=at<end?kit.cstr(d.subarray(at,end),0,end-at):null;
  out.push({pc:p,bytes:s&&s.length<MAX_PUSH?s:Buffer.alloc(0),valid:!!s&&at+s.length<end});
  p+=11;
 }
 return out;
}
const pushed=d=>pushSlots(d).map(slot=>slot.bytes);
const clean=t=>kit.trimBoth(t.replace(/\\n/g,'\n'));
const expandTabs=t=>String(t||'').replace(/\\t/g,'\t');
const displayText=t=>clean(expandTabs(t));
/* Keep the original classification and string normalization for Seed and patch identity. */
const prose=t=>/[A-Za-z]/.test(t)&&(/\s/.test(t)||/[,.!?"'\u2026]/.test(t)||/^[A-Z][a-z]+$/.test(t));
function identitySlots(pushes,cvns,dec){
 return pushes.map(({bytes:s})=>{
  const t=!s.length?'':s.some(c=>c>=0x80)?clean(dec.decode(s)):s.toString('latin1');
  if(!t)return {kind:'',t};
  if(((RESOURCE.test(t)||(cvns&&CVNS_RESOURCE.test(t)))&&!DIALOGUE_PUNCT.test(t))||(kit.ascii(t)&&!prose(t)))return {kind:'anchor',t};
  return {kind:'line',t:kit.ascii(t)?clean(t):t};
 });
}
function scriptSlots(buf,withDisplay){
 const cvns=buf.toString('latin1',0,4)==='PSS0',d=cvns?unpackPss0(buf):unpackPs2(buf);
 if(!d)return {identity:[],display:[]};
 const pushes=pushSlots(d),dec=kit.decoder(pushes.map(s=>s.bytes).filter(s=>s.length));
 const identity=identitySlots(pushes,cvns,dec);
 if(!withDisplay)return {identity};
 const bytecode=pushes.length?classify(d,cvns):null;
 const byPc=new Map(pushes.map((slot,i)=>[slot.pc,i])),messages=new Map(),parameters=new Set();
 for(const [pc,message] of bytecode?.messages||[]){
  const text=byPc.get(pc),voice=byPc.get(message.voice),speaker=byPc.get(message.speaker);
  if(!pushes[text]?.valid||!pushes[voice]?.valid||!pushes[speaker]?.valid)continue;
  const ref=pushes[voice].bytes;
  messages.set(text,{speaker:displayText(identity[speaker].t),
   voice:ref.some(c=>c>=0x80)?dec.decode(ref):ref.toString('latin1'),lineId:message.lineId});
  parameters.add(voice);
  parameters.add(speaker);
 }
 const display=identity.map((slot,i)=>{
  const message=messages.get(i);
  if(message){const t=displayText(slot.t);return {kind:t?'line':'',t,message};}
  if(parameters.has(i)||bytecode?.anchors.has(pushes[i].pc))return {kind:slot.t?'anchor':'',t:slot.t};
  if(slot.kind!=='line')return slot;
  const t=displayText(slot.t);
  return {kind:t?'line':'',t};
 });
 return {identity,display};
}
/* The full push sequence remains available for alignment and the legacy oracle. */
const texts=buf=>scriptSlots(buf,false).identity;
function parse(buf){
 const {identity,display}=scriptSlots(buf,true),lines=[],anchors=[],records=[],identityIndices=[];
 const identityProjection={lines:[],anchors:[]};
 for(let i=0;i<identity.length;i++){
  const before=identity[i],after=display[i];
  const identityIndex=before.kind==='line'?identityProjection.lines.length:-1;
  if(before.kind==='line')identityProjection.lines.push(before.t);
  else if(before.kind==='anchor')identityProjection.anchors.push(before.t);
  if(after.kind==='line'){
   lines.push(after.t);
   records.push({text:after.t,...(after.message||{speaker:'',voice:'',lineId:null})});
   identityIndices.push(identityIndex);
  }else if(after.kind==='anchor')anchors.push(after.t);
 }
 return {lines,anchors,records,identityIndices,identityProjection};
}

const PS=/\.ps[23]$/i,PSS=/\.pss$/i;
function listScripts(file){
 const archive=open(file);
 if(!archive)return null;
 const ext=archive.version<3?PSS:PS;
 const entries=archive.entries.filter(entry=>ext.test(entry.name));
 return entries.length?entries:null;
}
/* CMVS games keep their archives in data/pack (青い鳥, アマツツミ) */
const SUBS=['','data/pack','pack'],PS_SUBS=['','script','patch','FileHook','data/code','data/update','data'];
/* A supported CPZ archive in the usual pack folders is enough to identify the engine. */
const SUPPORTED_CPZ=/^CPZ([123567])$/;
const packed=dir=>kit.files(dir,{name:/\.cpz$/i,subs:['data/pack','pack'],max:4}).some(f=>SUPPORTED_CPZ.test(kit.head(f,4).toString('latin1')));
/* Only report an unreadable archive when there is no usable script pack or loose script. */
const cpzFail=dir=>{const all=kit.files(dir,{name:/\.cpz$/i,subs:SUBS});if(all.some(listScripts)||kit.files(dir,{name:PS,subs:PS_SUBS,max:1}).length)return 0;
 let legacy=0;
 for(const f of all){
  const match=SUPPORTED_CPZ.exec(kit.head(f,4).toString('latin1'));
  if(!match||open(f))continue;
  const version=+match[1];
  if(version>=5)return version;
  legacy||=version;
 }
 return legacy;
};
const cpz7=dir=>cpzFail(dir)>0;
/* CPZ1–3 have no per-title scheme lookup. A fixed-cipher archive that cannot open is a format failure. */
const failCode=dir=>{
 const version=cpzFail(dir);
 if(!version)return '';
 if(version<5)return 'CMVS_CPZ'+version+'_ARCHIVE';
 return version===7?'CMVS_CPZ7':'CMVS_CPZ'+version+'_KEY';
};
function cmvsArchives(dir){return kit.files(dir,{name:/\.cpz$/i,magic:'CPZ',subs:SUBS});}
function archiveScenes(dir){
 const existing=new Map(),cpz3=new Map();
 for(const file of cmvsArchives(dir)){
  const entries=engine.archiveEntries(file);
  if(!entries)continue;
  const group=open(file)?.version===3?cpz3:existing;
  for(const scene of entries)group.set(scene.name.toLowerCase(),scene);
 }
 return {existing,cpz3};
}
const bySceneName=(a,b)=>a.name.localeCompare(b.name);
/* Keep existing CMVS scenes ahead of newly supported CPZ3 scenes. The original reader samples the first 64. */
function cmvsScenes(dir){
 const {existing,cpz3}=archiveScenes(dir);
 for(const file of kit.files(dir,{name:PS,subs:PS_SUBS,max:20000})){
  const name=path.basename(file);
  existing.set(name.toLowerCase(),{name,read:()=>fs.readFileSync(file)});
 }
 for(const name of existing.keys())cpz3.delete(name);
 return [...[...existing.values()].sort(bySceneName),...[...cpz3.values()].sort(bySceneName)];
}
const engine=kit.engine({id:'cmvs',hint:'*.cpz（*.pss / *.ps2 / *.ps3）',
 archives:{find:cmvsArchives,list:listScripts,read},
 loose:{name:PS,subs:PS_SUBS},parse,
 extra:{scenes:cmvsScenes,archives:cmvsScenes,unsupported:failCode,REASONS:{
  CMVS_CPZ1_ARCHIVE:'这部 CVNS 作品的 CPZ1 封包索引读不了，请检查安装文件是否完整',
  CMVS_CPZ2_ARCHIVE:'这部 CVNS 作品的 CPZ2 封包索引读不了，请检查安装文件是否完整',
  CMVS_CPZ3_ARCHIVE:'这部 CMVS 作品的 CPZ3 封包索引读不了，请检查安装文件是否完整',
  CMVS_CPZ5_KEY:'这部 CMVS 作品的 CPZ5 归档用了未知的密钥常数，暂时读不了剧本',CMVS_CPZ6_KEY:'这部 CMVS 作品的 CPZ6 归档用了未知的密钥常数，暂时读不了剧本',CMVS_CPZ7:'这部 CMVS 作品的 CPZ7 归档解不开（start.ps3 里没找到它的注册参数，或者常数和已知作品不同），暂时读不了剧本'},
  displayProjection:true,normalizeDisplayText:expandTabs,
  originalLines:dir=>originalLines(dir),originalProjection:dir=>pairedOriginal(dir,true)}});
/* An official Chinese release keeps the Japanese scripts in data/pack and lays plain Chinese ones over them in
   FileHook\ (its loader reads those first), so the running script is Chinese and the archives hold its original. Both
   builds push the same strings in the same order: the running line at push n has the Japanese line at push n. One line
   per running line, '' where a scene has no archived copy or its pushes differ. */
function pairedOriginal(dir,withDisplay){
 const {existing,cpz3}=archiveScenes(dir),lines=[],displayLines=[];
 for(const scene of engine.scenes(dir)){
  let own;try{own=scriptSlots(scene.read(),withDisplay);}catch{continue;}
  const key=scene.name.toLowerCase(),archive=existing.get(key)||cpz3.get(key);
  let ja;try{if(archive)ja=scriptSlots(archive.read(),withDisplay);}catch{}
  const matched=ja&&ja.identity.length===own.identity.length;
  for(let i=0;i<own.identity.length;i++){
   if(own.identity[i].kind==='line')lines.push(matched&&ja.identity[i].kind==='line'?ja.identity[i].t:'');
   if(withDisplay&&own.display[i].kind==='line')displayLines.push(matched&&ja.display[i].kind==='line'?ja.display[i].t:'');
  }
 }
 return {lines,displayLines};
}
const originalLines=dir=>pairedOriginal(dir,false).lines;
module.exports={engine,packed,parse,texts,originalLines,header,open,list,read,unpackPs2,unpackPss0,pushed,md5Words,table,stage1,dirCipher,entryCipher,scheme,DEFAULT,DEFAULT7,DEFAULTS,indexKey,startValues,rotl,rotr};
