'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.MEGULIT_VOCAL_NO_FETCH='1';
const v=require('../services/vocal-sep.cjs');
test('E455 without the model a clip is left as it is and nothing is fetched',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-vs-'));fs.mkdirSync(path.join(root,'logs'));
 assert.equal(v.ready(root),false);assert.equal(await v.isolate(root,Buffer.alloc(5000)),null);assert.equal(await v.prepare(root),false);
 assert.equal(fs.existsSync(path.join(root,'data','vocal-sep','pylib')),false);});
test('E455 the model is pinned by revision, size and SHA-256, and the mirror allows its repository',()=>{
 assert.match(v.MODEL.revision,/^[0-9a-f]{40}$/);assert.equal(v.MODEL.size,66762490);assert.match(v.MODEL.sha256,/^[0-9a-f]{64}$/);
 const mirror=fs.readFileSync(path.join(__dirname,'..','site','mirror','src','index.mjs'),'utf8');assert.match(mirror,/'LeeAeron\/uvr_mdx-net'/);
 const py=fs.readFileSync(path.join(__dirname,'..','services','vocal-sep.py'),'utf8');assert.match(py,/N_FFT, HOP, DIM_F, DIM_T, COMPENSATE = 44100, 7680, 1024, 3072, 256, 1\.021|SR, N_FFT, HOP, DIM_F, DIM_T, COMPENSATE = 44100, 7680, 1024, 3072, 256, 1\.021/);});
test('E455 the setting exists, is on by default, and a recorded card clip is replaced in the background',()=>{
 const {cleanV4}=require('../core/v4-config.cjs');assert.equal(cleanV4({}).ankiVoiceIsolate,true);assert.equal(cleanV4({ankiVoiceIsolate:false}).ankiVoiceIsolate,false);
 const reader=fs.readFileSync(path.join(__dirname,'..','services','reader.cjs'),'utf8');assert.match(reader,/extra\.recorded&&config\.ankiVoiceIsolate!==false/);assert.match(reader,/'storeMediaFile',\{filename:name/);});
