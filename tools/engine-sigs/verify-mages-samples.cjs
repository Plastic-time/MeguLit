// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Explicit local-only verification: all five fixed x86 files are required, and both native programs scan bytes from stdin */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const Sample=require('./mages-sample.cjs'),SS=require('./steamstub.cjs'),M=require('./mages-draw.cjs');
const fixtures=require('../../validation/fixtures/engine-sigs/mages-draw.json');
const [steamRoot,native32,native64]=process.argv.slice(2);
if(!steamRoot||!native32||!native64){console.error('usage: node verify-mages-samples.cjs <common-directory> <scanner32.exe> <scanner64.exe>');process.exit(2);}
const receipt={kind:'static-x86-code-only',liveGame:false,results:[]};
for(const [slug,s] of Object.entries(fixtures.snippets)){
 const file=path.join(steamRoot,s.exe);let bytes;
 try{bytes=fs.readFileSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 const identity=bytes?{file,...Sample.inspect(bytes,s.sha256)}:{file,status:'missing'},result={slug,identity};receipt.results.push(result);
 if(identity.status!=='matched'){process.exitCode=1;continue;}
 try{
  const image=SS.plainText(bytes),r=M.find(image.code,image.va);
  assert.equal(image.steamstub,true);assert.deepEqual(r.problems,[]);
  assert.deepEqual(M.table({...r,base:image.base}),s.table);
  const expected={ok:1,heads:2,dialogue:r.dialogue.map(v=>v-image.va),drawGlyph:r.drawGlyph-image.va,
   pages:r.pages,stride:r.stride,chars:r.S,scale:r.scale,commits:1,commit:r.commit.at-image.va,
   count:r.commit.count,codes:r.commit.codes,info:r.commit.info,clear:r.clear.map(v=>v-image.va),
   backbuffers:1,backbufferWidth:r.backbuffer.w};
  result.hosts=[];
  for(const [host,exe] of [['x86',native32],['x64',native64]]){
   const run=spawnSync(exe,[],{input:image.code,encoding:'utf8',timeout:15000,maxBuffer:65536,windowsHide:true});
   if(run.error)throw run.error;
   assert.equal(run.status,0,host+' native scanner: '+run.stderr);
   const actual=JSON.parse(run.stdout);assert.deepEqual(actual,expected,host+' full-image match');
   result.hosts.push({host,matched:true});
  }
  result.decryptedCodeBytes=image.code.length;result.table=s.table;result.status='static-parity-passed';
 }catch(error){result.status='failed';result.error=error.message;process.exitCode=1;}
}
console.log(JSON.stringify(receipt,null,2));
