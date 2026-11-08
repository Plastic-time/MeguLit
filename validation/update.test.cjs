'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   About → update: version comparison and release asset checks (offline). */
const test=require('node:test'),assert=require('node:assert/strict');
const u=require('../services/update.cjs');
test('update: semantic version comparison',()=>{
 assert.equal(u.newer('1.0.6','1.0.5'),true);assert.equal(u.newer('1.0.5','1.0.6'),false);
 assert.equal(u.newer('1.0.10','1.0.9'),true);assert.equal(u.newer('v1.1.0','1.0.99'),true);assert.equal(u.newer('1.0.5','1.0.5'),false);
});
test('update: only the official zip from GitHub is accepted',async()=>{
 const rel=assets=>async()=>({ok:true,json:async()=>({tag_name:'v9.9.9',assets})});
 await assert.rejects(u.latest(rel([{name:'other.zip',browser_download_url:'https://github.com/x'}])),/UPDATE_ASSET_MISSING/);
 await assert.rejects(u.latest(rel([{name:'MeguLit-v9.9.9-win-x64.zip',browser_download_url:'https://evil.example/MeguLit.zip'}])),/UPDATE_URL_REJECTED/);
 const ok=await u.latest(rel([{name:'MeguLit-v9.9.9-win-x64.zip',size:3,digest:'sha256:'+'a'.repeat(64),browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]));
 assert.equal(ok.version,'9.9.9');assert.equal(ok.digest,'a'.repeat(64));
});
test('update: background download reports real progress, verifies and reuses the package',async()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'upd-'));u.reset();
 const zip=Buffer.concat([Buffer.from('PK'),crypto.randomBytes(300000)]),digest='sha256:'+crypto.createHash('sha256').update(zip).digest('hex');
 const rel={tag_name:'v9.9.9',body:'notes',assets:[{name:'MeguLit-v9.9.9-win-x64.zip',size:zip.length,digest,browser_download_url:'https://github.com/ilynthn/MeguLit/releases/download/v9.9.9/MeguLit-v9.9.9-win-x64.zip'}]};
 const old={tag_name:'v1.1.0',assets:[{name:'MeguLit-v1.1.0-win-x64.zip',size:zip.length-1000,browser_download_url:'https://github.com/x'}]};
 let downloads=0,seen=[];
 const fetcher=async url=>{
  if(url.endsWith('/latest'))return {ok:true,json:async()=>rel};
  if(url.endsWith('/tags/v1.1.0'))return {ok:true,json:async()=>old};
  downloads++;let at=0;
  return {ok:true,url,headers:{get:()=>String(zip.length)},body:{getReader:()=>({read:async()=>{if(at>=zip.length)return {done:true};const v=zip.subarray(at,at+65536);at+=v.length;seen.push(u.status().received);return {done:false,value:v};}})}};
 };
 const info=await u.check('1.1.0',fetcher);assert.equal(info.newer,true);assert.equal(info.delta,1000);
 const done=await u.start(root,'1.1.0',fetcher);assert.equal(done.phase,'ready');assert.equal(done.received,zip.length);
 assert.ok(seen.some(n=>n>0&&n<zip.length),'progress moves during the download');
 u.reset();const again=await u.start(root,'1.1.0',fetcher);assert.equal(again.phase,'ready');assert.equal(downloads,1,'a verified package is reused');
 u.reset();fs.rmSync(root,{recursive:true,force:true});
});
test('v1.1.2: the update script is started by Windows (WMI), and a failed launch keeps MeguLit open',async()=>{
 const {EventEmitter}=require('node:events');let seen=null;
 const fake=code=>(cmd,args,opt)=>{seen={cmd,args,opt};const c=new EventEmitter();setTimeout(()=>c.emit('exit',code),5);return c;};
 assert.equal(await u.launchScript('C:\MeguLit',{run:fake(0)}),true);
 assert.match(seen.args.join(' '),/Win32_Process -MethodName Create/);assert.match(seen.opt.env.MEGULIT_UPDATE_COMMAND,/-File ".*" -Root "C:\MeguLit"/);
 assert.equal(await u.launchScript('C:\MeguLit',{run:fake(9)}),false);
});
