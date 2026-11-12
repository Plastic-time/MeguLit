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
