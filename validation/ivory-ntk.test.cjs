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

function file(...chunks){
 const body=Buffer.concat(chunks),header=Buffer.alloc(8);
 header.write('fAGS');header.writeUInt32LE(8+body.length,4);
 return Buffer.concat([header,body]);
}

function script(text,code){
 return file(chunk('cTEX',16,text,0x4821),chunk('cFNM',16,Buffer.from('bg01\0'),0x62ad),chunk('cCOD',28,code,0x1205));
}

function scene(tail=Buffer.alloc(0)){
 const first=textRow('前置き。本題1はこちらです。'),second=textRow('「次の場面へ行きます。」');
 const a=textRow('はい'),b=textRow('いいえ'),extra=textRow('出力しない文字列');
 const code=Buffer.concat([
  record(2,0,0xffffffff,first.length,0xffffffff),
  record(47,0),
  record(1,0,textRow('前置き。').length-2),
  record(9,0,2,first.length+second.length,0,first.length+second.length+a.length,0),
  record(9,0,1,first.length+second.length,0,first.length+second.length+a.length,0),
  tail,
 ]);
 return script(Buffer.concat([first,second,a,b,extra]),code);
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

function writeCache(cache,files){
 fs.mkdirSync(cache,{recursive:true});
 for(const [name,body] of Object.entries(files)){
  const file=path.join(cache,name);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,body);
 }
 fs.writeFileSync(path.join(cache,'done.json'),JSON.stringify({format:'PK/IVORY',files:Object.keys(files)}));
}

function previousCache(cacheRoot,archive){
 const st=fs.statSync(archive);
 const key=crypto.createHash('sha256').update(path.resolve(archive).toLowerCase()+'|'+st.size+'|'+st.mtimeMs).digest('hex').slice(0,24);
 return path.join(cacheRoot,key);
}

test('compiled Ivory scenes read dialogue and choices in bytecode order at both entries',t=>{
 const {root,dir,archive,executable}=sample(t),cache=garbro.cacheDir(archive);
 writeCache(cache,{'first.NTK':scene(),'first.TXT':kit.encodeSjis('読んではいけません。'),'second.NTK':scene(),'second.HPB':'fAGS'});
 const p=probeGame({dir,executable});
 assert.equal(p.step,'ok');assert.equal(p.detected,'garbro');assert.equal(p.japaneseLines,expected.length*2);
 const s=original.scanRunning(root,'1',executable);
 assert.equal(s.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(s.runtime.index,'utf8')).lines,[...expected,...expected]);
});

test('a cached Ivory extraction from before compiled entries were supported is retried',t=>{
 const {dir,archive,executable,cacheRoot}=sample(t),oldCache=previousCache(cacheRoot,archive);
 fs.mkdirSync(oldCache,{recursive:true});
 fs.writeFileSync(path.join(oldCache,'failed.json'),JSON.stringify({version:garbro.version(),error:'GARBRO_NO_SCRIPTS'}));
 const {RuntimePacks}=require('../core/runtime-packs.cjs');
 t.mock.method(RuntimePacks.prototype,'installed',()=>false);
 assert.equal(probeGame({dir,executable}).needs,'garbro');
});

test('an older paired Ivory cache remains readable when re-extraction is unavailable',t=>{
 const {root,dir,archive,executable,cacheRoot}=sample(t);
 const dialogue='これまでの原文です。';
 writeCache(previousCache(cacheRoot,archive),{'start.TXT':kit.encodeSjis(dialogue),'start.HPB':'fAGS'});
 const {RuntimePacks}=require('../core/runtime-packs.cjs');
 let available=false;
 t.mock.method(RuntimePacks.prototype,'installed',()=>available);
 assert.equal(probeGame({dir,executable}).japaneseLines,1);
 const s=original.scanRunning(root,'1',executable);
 assert.equal(s.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(s.runtime.index,'utf8')).lines,[dialogue]);
 const files={'start.TXT':kit.encodeSjis(dialogue),'start.HPB':'fAGS','next.NTK':scene()};
 const extract=t.mock.method(require('node:child_process'),'spawnSync',(_program,args)=>{
  assert.equal(args[args.indexOf('-Archive')+1],archive);
  writeCache(args[args.indexOf('-Out')+1],files);
  return {status:0,stdout:JSON.stringify({format:'PK/IVORY',files:Object.keys(files)})};
 });
 available=true;
 assert.notEqual(require('../services/original-engines/scenes.cjs').fingerprint('garbro',dir),s.runtime.sha256);
 assert.equal(probeGame({dir,executable}).japaneseLines,1+expected.length);
 assert.equal(extract.mock.callCount(),1);
 const refreshed=original.scanRunning(root,'1',executable);
 assert.deepEqual(JSON.parse(fs.readFileSync(refreshed.runtime.index,'utf8')).lines,[dialogue,...expected]);
});

test('Ivory pairs names across slash styles without duplicating a compiled scene',t=>{
 const {root,dir,archive,executable}=sample(t);
 const dialogue='先に読みます。';
 writeCache(garbro.cacheDir(archive),{'part/start.TXT':kit.encodeSjis(dialogue),'part/start.HPB':'fAGS','part\\start.NTK':scene()});
 assert.equal(probeGame({dir,executable}).japaneseLines,1);
 const s=original.scanRunning(root,'1',executable);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.runtime.index,'utf8')).lines,[dialogue]);
});

for(const [label,extra,lines] of [
 ['paired source',{'next.TXT':kit.encodeSjis('続きはここです。'),'next.HPB':'fAGS'},['続きはここです。']],
 ['compiled script',{'next.NTK':scene()},expected],
])test('the Original Text entry finds a '+label+' after 64 compiled scenes without dialogue',t=>{
 const {root,dir,archive,executable}=sample(t),cache=garbro.cacheDir(archive);
 const empty=script(textRow('表示されない文字'),record(47,0));
 const preceding=Object.fromEntries(Array.from({length:64},(_,i)=>[i+'.NTK',empty]));
 writeCache(cache,{...preceding,...extra});
 assert.equal(probeGame({dir,executable}).japaneseLines,lines.length);
 const s=original.scanRunning(root,'1',executable);
 assert.equal(s.status,'native-japanese');
 assert.deepEqual(JSON.parse(fs.readFileSync(s.runtime.index,'utf8')).lines,lines);
});

test('compiled Ivory rejects malformed chunk and record boundaries',()=>{
 const {parse}=require('../services/original-engines/ivory-ntk.cjs');
 const data=scene(),badTail=record(1,0,0);
 const fnm=data.indexOf('cFNM'),code=data.indexOf('cCOD');
 const text=data.subarray(8,fnm),names=data.subarray(fnm,code),commands=data.subarray(code);
 const changeWord=(buffer,at,value)=>{const copy=Buffer.from(buffer);copy.writeUInt32LE(value,at);return copy;};
 const wrongMagic=Buffer.from(data);wrongMagic.write('fAGX');
 const misaligned=changeWord(Buffer.concat([names,Buffer.alloc(1)]),4,names.length+1);
 badTail.writeUInt16LE(3,2);
 for(const [label,bad] of [
  ['short file',Buffer.from('fAGS')],
  ['oversized file',file(text,chunk('cFNM',16,Buffer.alloc(1<<20),0),commands)],
  ['bad magic',wrongMagic],
  ['bad envelope length',changeWord(data,4,data.length-4)],
  ['truncated chunk header',file(text,commands,names.subarray(0,8))],
  ['duplicate chunk',file(text,names,names,commands)],
  ['missing chunk',file(text,commands)],
  ['invalid payload start',file(text,changeWord(names,8,20),commands)],
  ['chunk shorter than header',file(text,changeWord(names.subarray(0,12),4,12),commands)],
  ['unaligned chunk size',file(text,misaligned,commands)],
  ['chunk past file end',file(text,commands,changeWord(names,4,names.length+4))],
  ['code overlapping header',file(text,names,changeWord(changeWord(commands,12,24),24,(commands.length-24)/4))],
  ['offset table count',changeWord(data,code+24,2)],
  ['invalid final record',scene(badTail)],
 ]){
  assert.deepEqual(parse(bad).lines,[],label);
 }
});

test('compiled Ivory skips control words and refuses invalid Shift-JIS rows',()=>{
 const {parse}=require('../services/original-engines/ivory-ntk.cjs');
 const padding=Buffer.alloc(128);
 const clean=Buffer.concat([textRow('これが').subarray(0,-2),Buffer.of(0xff,1),textRow('本題です。')]);
 const invalid=Buffer.concat([textRow('壊れた文字').subarray(0,-2),Buffer.of(0x82,0x7f,0,0)]);
 const code=Buffer.concat([record(1,0,padding.length),record(1,0,padding.length+clean.length)]);
 assert.deepEqual(parse(script(Buffer.concat([padding,clean,invalid]),code)).lines,['これが本題です。']);
});

test('compiled Ivory refuses an unterminated row at the end of the text section',()=>{
 const {parse}=require('../services/original-engines/ivory-ntk.cjs');
 const clean=textRow('前の行。'),truncated=textRow('途中まで').subarray(0,-2);
 const code=Buffer.concat([record(1,0,0),record(1,0,clean.length+2)]);
 const text=Buffer.concat([clean,Buffer.alloc(2),truncated]);
 assert.deepEqual(parse(script(text,code)).lines,['前の行。']);
});

test('compiled Ivory bounds renderer text references',()=>{
 const {parse}=require('../services/original-engines/ivory-ntk.cjs');
 const clean=textRow('表示する行。'),long=textRow('長'.repeat(2049));
 const code=Buffer.concat([record(1,0,0),record(1,0,1),record(1,0,0xffffffff-1),record(1,0,clean.length)]);
 assert.deepEqual(parse(script(Buffer.concat([clean,long]),code)).lines,['表示する行。']);
});
