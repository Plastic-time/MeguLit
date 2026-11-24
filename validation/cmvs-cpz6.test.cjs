// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* CMVS 3.x CPZ6 (アマツツミ, クロノクロック: cmvs32 3.26): a CPZ6 header with the CPZ6/7 index and entry constants and the
   CPZ5 entry seed subtrahend (cmvs-schemes.json "cpz6"). Synthetic archives written by the fixture encoder, no game text. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const cmvs=require('../services/original-engines/cmvs.cjs'),F={...require('./helpers/engine-fixtures.cjs'),...require('./helpers/engine-fixtures-d.cjs')},scenes=require('../services/original-engines/scenes.cjs');
const JA=['さくら','「おはよう、遅刻するよ」','朝の光が差し込む。'];
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'cmvs6-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};

test('CMVS: the cpz6 set carries the cmvs32 3.26 constants and is tried after cpz5',()=>{
 const sc=cmvs.scheme(null,'cpz6');
 assert.equal(sc.factor,0x1A74F195);assert.equal(sc.entrySub,0x5C29E87B);assert.equal(sc.indexSeed,0x2A65CB4F);assert.equal(sc.entryIndexTail,3);assert.equal(sc.entryTail,0xAE);
 assert.deepEqual(cmvs.DEFAULTS.map(s=>s.factor),[0x1A743125,0x1A74F195]);
});

test('CMVS: a 3.x CPZ6 (Chrono md5, cpz6 constants) in data/pack decrypts and reads as text',t=>{
 const game=tmp(t);
 F.writeTree(game,{'cmvs32.exe':'MZ','cmvs.cfg':'','data/pack/script.cpz':F.cpz({'code/sn101.ps3':F.ps2a(JA),'code/sn102.ps3':F.ps2a(['二本目の話。',{push:'bgm01.ogg'}]),'code/start.ps3':F.ps2a([{push:'sn101.ps3'}])},{version:6,variant:'Chrono',set:'cpz6'}),
  'data/pack/se.cpz':F.cpz({'wave/se001.ogg':Buffer.concat([Buffer.from('OggS'),Buffer.alloc(61,7)])},{version:6,variant:'Chrono',set:'cpz6',master:0x0BADF00D})});
 const f=path.join(game,'data/pack/script.cpz'),a=cmvs.open(f);
 assert.equal(a?.variant,'Chrono');assert.equal(a.sc.entrySub,0x5C29E87B);assert.deepEqual(a.entries.map(e=>e.name),['code/sn101.ps3','code/sn102.ps3','code/start.ps3']);
 const se=path.join(game,'data/pack/se.cpz'),o=cmvs.list(se);assert.equal(cmvs.read(se,o[0]).toString('latin1',0,4),'OggS');
 assert.equal(scenes.detect(game),'cmvs');assert.equal(scenes.unsupportedReason(game),null);
 assert.deepEqual(scenes.read('cmvs',game).filter(s=>s.lines.length).map(s=>s.lines),[JA,['二本目の話。']]);
});

test('CMVS: the older GARbro CPZ6 (cpz5 constants) still opens with the cpz5 set',t=>{
 const game=tmp(t);F.writeTree(game,{'script.cpz':F.cpz({'a01.ps3':F.ps2a(JA)},{version:6,variant:'Natsu'})});
 const a=cmvs.open(path.join(game,'script.cpz'));assert.equal(a?.variant,'Natsu');assert.equal(a.sc.factor,0x1A743125);
 assert.deepEqual(cmvs.parse(cmvs.read(path.join(game,'script.cpz'),a.entries[0])).lines,JA);
});

test('CMVS: an adapter pack that sends only md5 variants keeps both default constant sets',t=>{
 const game=tmp(t),f=path.join(game,'script.cpz');F.writeTree(game,{'script.cpz':F.cpz({'a01.ps3':F.ps2a(JA)},{version:6,variant:'Chrono',set:'cpz6'})});
 const md5=require('../services/original-engines/cmvs-schemes.json').md5;
 assert.equal(cmvs.open(f,{md5:{Chrono:md5.Chrono}})?.variant,'Chrono');
});

test('CMVS: a CPZ6 whose master key fits no constant set is still reported as a key problem',t=>{
 const game=tmp(t),c=F.cpz({'a.ps3':F.ps2a(['x'])},{version:6,variant:'Chrono',set:'cpz6'});
 c.writeUInt32LE((c.readUInt32LE(0x30)^0x00010000)>>>0,0x30);
 let sum=0x923A564C;for(let o=0;o<0x3C;o+=4)sum=(sum+c.readUInt32LE(o))>>>0;c.writeUInt32LE(sum,0x3C);
 F.writeTree(game,{'cmvs32.exe':'MZ','script.cpz':c});
 assert.equal(cmvs.list(path.join(game,'script.cpz')),null);assert.equal(scenes.unsupportedReason(game)?.code,'CMVS_CPZ6_KEY');
});

test('CMVS: a damaged text section (no NUL) gives empty pushes, not the rest of the section for each one',()=>{
 const push=at=>{const b=Buffer.alloc(12);Buffer.from([1,2,0x20,1]).copy(b);b.writeUInt32LE(at,4);Buffer.from([0x0F,2,0x30,4]).copy(b,8);return b;};
 const code=Buffer.concat(Array.from({length:200},(_,i)=>push(i*7))),text=Buffer.alloc(0x10000,0x41);
 const d=cmvs.unpackPs2(F.ps2aRaw(code,text)),list=cmvs.pushed(d);
 assert.equal(list.length,200);assert.ok(list.every(s=>s.length===0));
 const ok=Buffer.concat([Buffer.from('abc\0','latin1'),Buffer.alloc(0x3000,0x41)]),one=cmvs.pushed(cmvs.unpackPs2(F.ps2aRaw(push(0),ok)));
 assert.equal(one[0].toString('latin1'),'abc');
 /* #20: unterminated string reaching MAX_PUSH at tend must yield empty push, while short unterminated tail lines stay readable */
 const shortText=F.sjis('朝の光');
 const shortPs2=F.ps2aRaw(push(0),shortText);
 assert.deepEqual(cmvs.parse(shortPs2).lines,['朝の光']);
 const exactMax=F.ps2aRaw(push(0),Buffer.alloc(0x2000,0x41));
 assert.deepEqual(cmvs.pushed(cmvs.unpackPs2(exactMax)),[Buffer.alloc(0)]);
 const mixedText=Buffer.concat([F.sjis('正当な行。'),Buffer.from([0]),F.sjis('末尾の行')]);
 const mixedPs2=F.ps2aRaw(Buffer.concat([push(0),push(F.sjis('正当な行。').length+1),push(mixedText.length+4)]),mixedText);
 assert.deepEqual(cmvs.parse(mixedPs2).lines,['正当な行。','末尾の行']);
 assert.deepEqual(cmvs.pushed(cmvs.unpackPs2(mixedPs2)).map(b=>b.length),[F.sjis('正当な行。').length,F.sjis('末尾の行').length,0]);
});

test('CMVS: readIndex bounds entry filenames to [cur + nameAt, cur + es) without bleeding into the next entry',t=>{
 const crypto=require('node:crypto'),dir=tmp(t);
 const inv=tb=>{const o=new Uint8Array(256);for(let i=0;i<256;i++)o[tb[i]]=i;return o;};
 const noNulCpz=files=>{
  const buf=Buffer.from(F.cpz(files,{version:6,variant:'Mirai',set:'cpz5'}));
  const h=cmvs.header(buf),sc=cmvs.scheme(null,'cpz5'),v=sc.md5.find(x=>x.name==='Mirai'),md5=cmvs.md5Words(h.md5,v),mk=h.master;
  const idx=Buffer.from(buf.subarray(h.indexAt,h.indexAt+h.dirSize+h.fileSize));
  cmvs.stage1(idx,(mk^0x3795B39A)>>>0,sc);
  const t1=cmvs.table(mk,md5[1],sc.factor),t2=cmvs.table(mk,md5[2],sc.factor),i1=inv(t1),i2=inv(t2);
  for(let i=0;i<h.dirSize;i++)idx[i]=t1[0x3A^idx[i]];
  cmvs.dirCipher(idx,h.dirSize,[(md5[0]^((mk+0x76A3BF29)>>>0))>>>0,(md5[1]^mk)>>>0,(md5[2]^((mk+0x10000000)>>>0))>>>0,(md5[3]^mk)>>>0],0);
  const dirKey=idx.readUInt32LE(12),cur=h.dirSize+idx.readInt32LE(8),len=h.fileSize;
  for(let i=cur;i<cur+len;i++)idx[i]=t2[0x7E^idx[i]];
  cmvs.entryCipher(idx,cur,len,md5.map((m,j)=>(m^((dirKey+sc.dirAddend[j])>>>0))>>>0),sc.indexSeed,0,sc.entryIndexTail);
  /* replace the NUL byte at the end of entry 0's 8-byte name ("a01.ps3\0") with 'x' so it fills [cur+0x18, cur+es) */
  const es=idx.readInt32LE(cur);
  for(let p=cur+h.nameAt;p<cur+es;p++)if(idx[p]===0)idx[p]=0x78;
  /* re-encrypt entry block, dir block, stage1 and update header index MD5 + checksum */
  const ek=md5.map((m,j)=>(m^((dirKey+sc.dirAddend[j])>>>0))>>>0);
  let seed=sc.indexSeed,i=0;for(;i<len>>>2;i++){const o=cur+i*4;idx.writeUInt32LE(((cmvs.rotr((idx.readUInt32LE(o)-0x37A19E8B)>>>0,2)+seed)>>>0^ek[i&3])>>>0,o);seed=(seed-0x139FA9B)>>>0;}
  for(let q=cur+i*4;q<cur+len;q++,i++)idx[q]=(((idx[q]-sc.entryIndexTail)&255)^(ek[i&3]>>>4))&255;
  for(let q=cur;q<cur+len;q++)idx[q]=i2[idx[q]]^0x7E;
  const dk=[(md5[0]^((mk+0x76A3BF29)>>>0))>>>0,(md5[1]^mk)>>>0,(md5[2]^((mk+0x10000000)>>>0))>>>0,(md5[3]^mk)>>>0];
  seed=0x76548AEF;i=0;for(;i<h.dirSize>>>2;i++){idx.writeUInt32LE(((cmvs.rotr((idx.readUInt32LE(i*4)+seed)>>>0,3)+0x4A91C262)>>>0^dk[i&3])>>>0,i*4);seed=(seed+0x10FB562A)>>>0;}
  for(let q=i*4;q<h.dirSize;q++,i++)idx[q]=(((idx[q]-0x37)&255)^(dk[i&3]>>>6))&255;
  for(let q=0;q<h.dirSize;q++)idx[q]=i1[idx[q]]^0x3A;
  const sk=sc.secret.map(s=>(s-((mk^0x3795B39A)>>>0))>>>0),k1=(mk^0x3795B39A)>>>0,sh=(((k1>>>24)^(k1>>>16)^(k1>>>8)^k1^0xB)&15)+7,n=idx.length>>>2;let j=5;
  for(let p=0;p<n;p++){idx.writeUInt32LE(((cmvs.rotl((idx.readUInt32LE(p*4)-0x01010101)>>>0,sh)-sc.indexAddend)>>>0^sk[j])>>>0,p*4);j=(j+1)%24;}
  for(let q=n*4,k=idx.length&3;k>0;k--,q++){idx[q]=(((idx[q]+sc.indexSub)&255)^(sk[j]>>>(k*4)))&255;j=(j+1)%24;}
  idx.copy(buf,h.indexAt);crypto.createHash('md5').update(idx).digest().copy(buf,0x10);
  let sum=0x923A564C;for(let o=0;o<0x3C;o+=4)sum=(sum+buf.readUInt32LE(o))>>>0;buf.writeUInt32LE(sum,0x3C);
  return buf;
 };
 /* two entries: unterminated entry 0 stays "a01.ps3x" instead of bleeding into entry 1's 0x20 length byte ("a01.ps3x ") */
 const f2=path.join(dir,'bleed.cpz');fs.writeFileSync(f2,noNulCpz({'a01.ps3':F.ps2a(JA),'b01.ps3':F.ps2a(['二本目。'])}));
 assert.deepEqual(cmvs.list(f2).map(e=>e.name),['a01.ps3x','b01.ps3']);
 /* single entry: unterminated entry 0 filling its slot stays readable as before */
 const f1=path.join(dir,'nonul.cpz');fs.writeFileSync(f1,noNulCpz({'a01.ps3':F.ps2a(JA)}));
 assert.deepEqual(cmvs.list(f1).map(e=>e.name),['a01.ps3x']);
});
