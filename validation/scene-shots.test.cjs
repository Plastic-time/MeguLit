'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const shots=require('../services/scene-shots.cjs');
const jpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');
test('scenes: low scores are skipped, near-duplicates keep the better one, each game keeps its best few',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shots-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const exe='C:\Games\a\a.exe';
 assert.equal(shots.keep(root,exe,{jpeg,score:5,hash:'0000000000000000'},1),'skipped');
 assert.equal(shots.keep(root,exe,{jpeg,score:60,hash:'0000000000000000'},2),'kept');
 assert.equal(shots.keep(root,exe,{jpeg,score:50,hash:'0000000000000003'},3),'duplicate');
 assert.equal(shots.keep(root,exe,{jpeg,score:70,hash:'0000000000000001'},4),'replaced');
 assert.equal(shots.list(root,exe).length,1);assert.equal(shots.list(root,exe)[0].score,70);
 for(let i=0;i<shots.KEEP+5;i++)shots.keep(root,exe,{jpeg,score:40+i,hash:(BigInt(i+1)*0x0f0f0f0f0f0fn).toString(16).padStart(16,'0').slice(-16)},10+i);
 const list=shots.list(root,exe);assert.ok(list.length<=shots.KEEP);assert.ok(list.every((it,i)=>i===0||list[i-1].score>=it.score));
 assert.equal(shots.read(root,exe,list[0].file).mime,'image/jpeg');assert.throws(()=>shots.read(root,exe,'../x.jpg'));
 assert.equal(fs.readdirSync(path.dirname(path.join(root,'data','scene-shots','x'))).length,1);
});
test('hamming distance between difference hashes',()=>{assert.equal(shots.hamming('0000000000000000','000000000000000f'),4);assert.equal(shots.hamming('','0'),64);});

test('a full shelf keeps its lowest scoring picture until the new index is saved',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shots-full-')),exe=path.join(root,'game.exe');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const hash=i=>require('node:crypto').createHash('sha256').update(String(i)).digest('hex').slice(0,16);
 for(let i=0;i<shots.KEEP;i++)assert.equal(shots.keep(root,exe,{jpeg,score:40+i,hash:hash(i)},i+1),'kept');
 const shelf=shots.list(root,exe),lowest=shelf.at(-1);
 const fresh={jpeg,score:99,hash:hash(shots.KEEP)};
 const fault=t.mock.method(fs,'renameSync',()=>{throw Error('index busy');});
 assert.throws(()=>shots.keep(root,exe,fresh),/index busy/);
 fault.mock.restore();
 assert.equal(shots.read(root,exe,lowest.file).data,jpeg);
 assert.deepEqual(shots.list(root,exe),shelf);
 assert.equal(shots.keep(root,exe,fresh),'kept');
 assert.equal(shots.list(root,exe).length,shots.KEEP);
 assert.throws(()=>shots.read(root,exe,lowest.file),/SHOT_NOT_FOUND/);
});

test('a failed index update preserves the previous scene and can be retried',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'shots-retry-')),exe=path.join(root,'game.exe');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const before={jpeg,score:60,hash:'0000000000000000'};
 const after={jpeg:Buffer.from('replacement').toString('base64'),score:80,hash:'0000000000000001'};
 shots.keep(root,exe,before,1);
 const first=shots.list(root,exe)[0];
 const rename=fs.renameSync;
 const fault=t.mock.method(fs,'renameSync',(from,to)=>{
  if(path.basename(to)==='index.json')throw Error('index busy');return rename(from,to);
 });
 assert.throws(()=>shots.keep(root,exe,after,1),/index busy/);
 fault.mock.restore();
 assert.deepEqual(shots.list(root,exe),[first]);
 assert.equal(shots.read(root,exe,first.file).data,before.jpeg);
 const base=path.join(root,'data','scene-shots'),dir=path.join(base,fs.readdirSync(base)[0]);
 assert.deepEqual(fs.readdirSync(dir).sort(),[first.file,'index.json'].sort());
 const write=fs.writeFileSync;
 const partial=t.mock.method(fs,'writeFileSync',(file,data,...options)=>{
  if(Buffer.isBuffer(data)){write(file,data.subarray(0,1),...options);throw Error('disk full');}
  return write(file,data,...options);
 });
 assert.throws(()=>shots.keep(root,exe,after,1),/disk full/);
 partial.mock.restore();
 assert.equal(shots.read(root,exe,first.file).data,before.jpeg);
 assert.deepEqual(fs.readdirSync(dir).sort(),[first.file,'index.json'].sort());
 assert.equal(shots.keep(root,exe,after,1),'replaced');
 const saved=shots.list(root,exe);
 assert.equal(saved.length,1);
 assert.equal(shots.read(root,exe,saved[0].file).data,after.jpeg);
 assert.deepEqual(fs.readdirSync(dir).sort(),[saved[0].file,'index.json'].sort());
});
