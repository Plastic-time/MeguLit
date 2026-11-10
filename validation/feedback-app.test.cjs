// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E394 in-app feedback, the whole-app log package, and the relay's labelling of app feedback */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {DatabaseSync}=require('node:sqlite');

test('feedback goes to the relay /api/feedback with page app/<version>, never to GitHub',async()=>{
 const {send}=require('../services/feedback.cjs');let seen=null;
 const fetcher=async(url,init)=>{seen={url,body:JSON.parse(init.body)};return new Response(JSON.stringify({ok:true,url:'https://github.com/x/y/issues/1'}),{status:201});};
 const r=await send('',{kind:'feedback',text:' 闪退了 ',contact:'qq 1',lang:'zh',version:'1.3.3'},{fetcher,env:{MEGULIT_RELAY_BASE:'https://relay.test'}});
 assert.deepEqual(r,{ok:true,url:'https://github.com/x/y/issues/1'});
 assert.equal(seen.url,'https://relay.test/api/feedback');
 assert.deepEqual(seen.body,{kind:'feedback',text:'闪退了',contact:'qq 1',lang:'zh',page:'app/1.3.3'});
 assert.deepEqual(await send('',{kind:'game',text:''},{fetcher,env:{MEGULIT_RELAY_BASE:'https://relay.test'}}),{ok:false,error:'EMPTY'});
 assert.deepEqual(await send('',{kind:'spam',text:'x'},{fetcher}),{ok:false,error:'INVALID_KIND'});
 const failing=async()=>new Response(JSON.stringify({ok:false,error:'RATE_LIMITED'}),{status:429});
 assert.deepEqual(await send('',{kind:'game',text:'ATRI'},{fetcher:failing,env:{MEGULIT_RELAY_BASE:'https://relay.test'}}),{ok:false,error:'RATE_LIMITED'});
});

test('the relay titles app feedback 软件 and names the version',async()=>{
 const m=await import(pathToFileURL(path.join(__dirname,'..','relay','src','feedback.js')).href);
 const app=m.feedbackIssue({kind:'game',text:'海市蜃楼之馆',contact:'',lang:'zh',page:'app/1.3.3'});
 assert.equal(app.title,'[软件想玩] 海市蜃楼之馆');assert.match(app.body,/来自 MeguLit 软件 v1\.3\.3/);
 const site=m.feedbackIssue({kind:'feedback',text:'hi',contact:'',lang:'zh',page:'/'});
 assert.equal(site.title,'[官网反馈] hi');assert.match(site.body,/来自 megulit\.com/);
});

test('the whole-app package holds recent logs (scrubbed) and the library, and old logs stay out',()=>{
 const diag=require('../services/diagnostics.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-diagall-'));
 try{
  fs.mkdirSync(path.join(root,'logs'));
  fs.writeFileSync(path.join(root,'logs','reader-host.log'),'line one\nC:\\Users\\Someone\\AppData\\x mail me@example.com\n');
  const old=path.join(root,'logs','ancient.log');fs.writeFileSync(old,'old\n');const t=new Date(Date.now()-30*86400000);fs.utimesSync(old,t,t);
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id,title,library,last_launched_at)');db.prepare('INSERT INTO games VALUES (?,?,?,?)').run('7','ATRI','{"engine":"Unity","hook":"verified"}',1);
  const pack=diag.buildAll(root,db,{version:'1.3.3',who:{user:'Someone',profile:'C:\\Users\\Someone',names:[]}});
  const names=pack.entries.map(e=>e.name);
  assert.ok(names.includes('logs/reader-host.log'));assert.ok(!names.includes('logs/ancient.log'));assert.ok(names.includes('info.json'));
  assert.match(pack.name,/^MeguLit-diag-all-/);assert.equal(diag.ownPackage(root,pack.path),pack.path);
  const info=JSON.parse(pack.entries.find(e=>e.kind==='info').preview);assert.equal(info.kind,'all');assert.equal(info.games[0].title,'ATRI');
  const text=fs.readFileSync(pack.path).toString('latin1');assert.ok(!text.includes('me@example.com'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('a diagnostics upload with nothing configured uses the relay instead of stopping at "not configured"',()=>{
 const {config}=require('../services/diagnostics-upload.cjs'),before=process.env.MEGULIT_RELAY_BASE;
 try{process.env.MEGULIT_RELAY_BASE='https://relay.test';assert.equal(config(os.tmpdir()).endpoint,'https://relay.test/api/diagnostics');
  process.env.MEGULIT_RELAY_BASE='off';assert.equal(config(path.join(os.tmpdir(),'none')).endpoint,'');}
 finally{if(before===undefined)delete process.env.MEGULIT_RELAY_BASE;else process.env.MEGULIT_RELAY_BASE=before;}
});
