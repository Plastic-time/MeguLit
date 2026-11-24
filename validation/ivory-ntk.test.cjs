'use strict';

const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),test=require('node:test');
const garbro=require('../services/original-engines/garbro.cjs');
const kit=require('../services/original-engines/kit.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const original=require('../services/original-text.cjs');

function encrypt(data,seed){
 const packed=Buffer.alloc(data.length);
 for(let at=0;at<data.length;at+=4){
  const word=(data.readUInt32LE(at)^seed)>>>0;
  let swapped=0;
  for(let shift=0;shift<32;shift+=2){
   const pair=(word>>>shift)&3,flag=(seed>>>shift)&3;
   swapped|=(flag===1||flag===2?(pair>>>1)|((pair&1)<<1):pair)<<shift;
  }
  packed.writeUInt32LE(swapped>>>0,at);
  seed=((seed<<1)|(seed>>>31))>>>0;
 }
 return packed;
}

function chunk(tag,headerSize,payload,seed){
 const labelTable=tag==='cCOD'?Buffer.alloc(4):Buffer.alloc(0);
 const header=Buffer.alloc(headerSize),padded=Buffer.alloc(Math.ceil(payload.length/4)*4);
 payload.copy(padded);
 header.write(tag);
 header.writeUInt32LE(header.length+padded.length+labelTable.length,4);
 header.writeUInt32LE(header.length,8);
 if(tag==='cCOD'){
  header.writeUInt32LE(header.length+padded.length,12);
  header.writeUInt32LE(seed,16);
  header.writeUInt32LE(1,24);
 }else header.writeUInt32LE(seed,12);
 return Buffer.concat([header,encrypt(padded,seed),labelTable]);
}

function textRow(text){
 const sjis=kit.encodeSjis(text),words=[];
 for(let i=0;i<sjis.length;i++){
  const byte=sjis[i];
  if(byte<0x80)words.push(0,byte);
  else words.push(byte,sjis[++i]);
 }
 return Buffer.from([...words,0,0]);
}

function record(op,...fields){
 const data=Buffer.alloc(4+fields.length*4);
 data.writeUInt16LE(op);data.writeUInt16LE(data.length,2);
 fields.forEach((value,i)=>data.writeUInt32LE(value,4+i*4));
 return data;
}

function scene(tail=Buffer.alloc(0)){
 const first=textRow('前置き。本題1はこちらです。'),second=textRow('「次の場面へ行きます。」');
 const a=textRow('はい'),b=textRow('いいえ'),extra=textRow('出力しない文字列');
 const code=Buffer.concat([
  record(2,0,0xffffffff,first.length,0xffffffff),
  record(47,0),
  record(1,0,textRow('前置き。').length-2),
  record(9,0,2,first.length+second.length,0,first.length+second.length+a.length,0),
  tail,
 ]);
 const body=Buffer.concat([
  chunk('cTEX',16,Buffer.concat([first,second,a,b,extra]),0x4821),
  chunk('cFNM',16,Buffer.from('bg01\0'),0x62ad),
  chunk('cCOD',28,code,0x1205),
 ]);
 const header=Buffer.alloc(8);header.write('fAGS');header.writeUInt32LE(8+body.length,4);
 return Buffer.concat([header,body]);
}

const expected=['「次の場面へ行きます。」','本題1はこちらです。','はい','いいえ'];

function sample(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ivory-ntk-')),dir=path.join(root,'game');
 const previous=process.env.MEGULIT_GARBRO_CACHE;
 const cacheRoot=path.join(root,'cache');process.env.MEGULIT_GARBRO_CACHE=cacheRoot;
 t.after(()=>{if(previous==null)delete process.env.MEGULIT_GARBRO_CACHE;else process.env.MEGULIT_GARBRO_CACHE=previous;fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(dir,'misc'),{recursive:true});
 const executable=path.join(dir,'ntk.exe');fs.writeFileSync(executable,'MZ');
 const archive=path.join(dir,'misc','script.pk'),header=Buffer.alloc(20000);
 header.write('fPK ');fs.writeFileSync(archive,header);
 return {root,dir,archive,executable,cacheRoot};
}

test('compiled Ivory scenes read dialogue and choices in bytecode order at both entries',t=>{
 const {root,dir,archive,executable}=sample(t),cache=garbro.cacheDir(archive);
 fs.mkdirSync(cache,{recursive:true});
 fs.writeFileSync(path.join(cache,'first.NTK'),scene());
 fs.writeFileSync(path.join(cache,'error.TXT'),kit.encodeSjis('読んではいけません。'));
 fs.writeFileSync(path.join(cache,'done.json'),JSON.stringify({format:'PK/IVORY',files:['first.NTK','error.TXT']}));
 const p=probeGame({dir,executable});
 assert.equal(p.step,'ok');assert.equal(p.detected,'garbro');assert.equal(p.japaneseLines,expected.length);
 const s=original.scanRunning(root,'1',executable);
 assert.equal(s.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(s.runtime.index,'utf8')).lines,expected);
});

test('a cached Ivory extraction from before compiled entries were supported is retried',t=>{
 const {dir,archive,executable,cacheRoot}=sample(t),st=fs.statSync(archive);
 const oldKey=crypto.createHash('sha256').update(path.resolve(archive).toLowerCase()+'|'+st.size+'|'+st.mtimeMs).digest('hex').slice(0,24);
 const oldCache=path.join(cacheRoot,oldKey);
 fs.mkdirSync(oldCache,{recursive:true});
 fs.writeFileSync(path.join(oldCache,'failed.json'),JSON.stringify({version:garbro.version(),error:'GARBRO_NO_SCRIPTS'}));
 const {RuntimePacks}=require('../core/runtime-packs.cjs');
 t.mock.method(RuntimePacks.prototype,'installed',()=>false);
 assert.equal(probeGame({dir,executable}).needs,'garbro');
});

test('compiled Ivory rejects malformed chunk and record boundaries',()=>{
 const {parse}=require('../services/original-engines/ivory-ntk.cjs');
 const data=scene(),duplicate=Buffer.from(data),overlap=Buffer.from(data),badTail=record(1,0,0);
 const fnm=data.indexOf('cFNM'),code=data.indexOf('cCOD');
 duplicate.write('cTEX',fnm);
 overlap.writeUInt32LE(24,code+12);
 badTail.writeUInt16LE(3,2);
 for(const bad of [data.subarray(0,data.length-4),duplicate,overlap,scene(badTail)]){
  assert.deepEqual(parse(bad).lines,[]);
 }
});
