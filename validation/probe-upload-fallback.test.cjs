// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-16 QQ group (Fate/stay night REMASTERED): 「未知封包格式 上传失败，稍后自动重试」 every time while the relay never
   stored a part. The desensitized probe now tries the other built-in relay after a transport failure, and every failure
   (an exception included) keeps its error code, which the dialog shows. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fx=require('./helpers/adapter-fixtures.cjs'),auto=require('../services/probe-auto.cjs'),d=require('../services/desensitize.cjs');
function setup(prefix){const r=fx.root(prefix),dir=path.join(r,'G');fs.mkdirSync(path.join(dir,'obb'),{recursive:true});const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,crypto.randomBytes(300000));fs.writeFileSync(path.join(dir,'obb','pack00d.bin'),crypto.randomBytes(8192));
 const res={schema:'megulit.probe-result',version:1,step:'unknown-pack',detail:'magic:46504400',detected:null,engines:[],lines:0,japaneseLines:0,inventory:{files:2,bytes:1,ext:{'.bin':1,'.exe':1},archives:[{name:'obb/pack00d.bin',size:8192,magic:'4650440000000000',format:''}]},title:'x',stamp:'s',at:Date.now()};
 fs.mkdirSync(path.join(r,'data','adapter-probe'),{recursive:true});fs.writeFileSync(path.join(r,'data','adapter-probe','state.json'),JSON.stringify({version:1,run:null,results:{g1:res}}));
 return {root:r,db:fx.db([{id:'g1',title:'Fate/stay night REMASTERED',executable:exe}])};}
const sampler=async()=>({samples:[(()=>{const s=d.sample(Buffer.alloc(4096,7),{max:4096,compress:true});return {name:'obb/pack00d.bin',role:'archive',size:4096,head:'0'.repeat(64),sample:s,...d.sampleSizes(s)};})()],keys:[]});
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
test('a blocked first relay (403 / network) is retried on the other built-in relay',async()=>{
 const prev=process.env.MEGULIT_RELAY_BASE;delete process.env.MEGULIT_RELAY_BASE;
 try{const u=setup('megulit-puf-');const calls=[];
  const fetcher=async(url,init={})=>{calls.push(url);if(url.includes('/has'))return json({ok:true,state:'none',items:0});if(url.startsWith('https://cn-api.'))return new Response('<html>blocked</html>',{status:403});return json({ok:true,id:'i',issueUrl:'https://github.com/o/r/issues/9'},201);};
  const r=await auto.run(u.root,u.db,{wait:async()=>{},probeFirst:false,hasEndpoint:'https://api.megulit.com/api/probe/has',fetcher,sampler});
  assert.equal(r.results.g1,'sent');
  const posts=calls.filter(c=>/\/api\/probe$/.test(c));assert.equal(posts.length,2);assert.notEqual(new URL(posts[0]).host,new URL(posts[1]).host);
 }finally{if(prev===undefined)delete process.env.MEGULIT_RELAY_BASE;else process.env.MEGULIT_RELAY_BASE=prev;}
});
test('an exception keeps an error code and a backoff; the result carries it for the dialog',async()=>{
 const u=setup('megulit-pue-');const fetcher=async url=>{if(url.includes('/has'))return json({ok:true,state:'none',items:0});throw new Error('unused');};
 const r=await auto.run(u.root,u.db,{wait:async()=>{},probeFirst:false,endpoint:'https://relay.test/api/probe',hasEndpoint:'https://relay.test/api/probe/has',fetcher,sampler:async()=>{throw new Error('x');},});
 assert.equal(r.results.g1,'failed');assert.match(r.errors.g1,/^(NETWORK|EXC )/);
 const g=auto.status(u.root).games.g1;assert.equal(g.state,'failed');assert.ok(g.error);assert.ok(g.nextAt>Date.now());
});
test('the dialog shows the error code after 上传失败',()=>{const src=fs.readFileSync(path.join(__dirname,'../web/adapter-probe-ui.js'),'utf8');assert.match(src,/res\[x\.id\]==='failed'&&r\?\.errors\?\.\[x\.id\]/);});
