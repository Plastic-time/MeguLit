// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 developer panel (services/seed-producer.cjs): VNDB's description cut to a short plain intro, the links (VNDB page, official
   site, Moegirlpedia search, Japanese Wikipedia), cached, opened by the service from its own answer only. No network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const P=require('../services/seed-producer.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'producer-'));
const RAW='Key is a studio. It was formed in 1998. Co-founder Jun Maeda wrote most of the scenarios. Another long sentence here.\n\nSecond paragraph.\n\n[From [url=http://en.wikipedia.org/wiki/Key]Wikipedia[/url]]';
const answer={results:[{name:'Key',original:null,description:RAW,extlinks:[{name:'twitter',url:'https://x.com/k'},{name:'website',url:'http://key.visualarts.gr.jp/'},{name:'jawiki',url:'https://ja.wikipedia.org/wiki/Key_(ゲームブランド)'},{name:'enwiki',url:'https://en.wikipedia.org/wiki/Key'}]}]};
const ok=body=>async()=>({ok:true,json:async()=>body});
test('intro: markup and source lines gone, at most three sentences, plain text',()=>{const t=P.intro(RAW);assert.equal(t,'Key is a studio. It was formed in 1998. Co-founder Jun Maeda wrote most of the scenarios.');assert.ok(!/From|url=|\[/.test(t));assert.equal(P.intro(''),'');assert.ok(P.intro('[spoiler]x[/spoiler]A [b]bold[/b] [url=http://a.b]link[/url] word.').startsWith('A bold link word'));assert.ok(P.intro('x'.repeat(2000)).length<=361);});
test('a producer: the intro, the four links, the Moegirlpedia search by name; cached afterwards',async()=>{const root=tmp();let n=0,body=null;const f=async(u,i)=>{n++;body=JSON.parse(i.body);return ok(answer)();};
 const info=await P.producer(root,'p24',{fetch:f});assert.equal(info.source,'VNDB');assert.equal(info.intro.split('. ').length,3);assert.deepEqual(info.links.map(l=>l.kind),['vndb','site','moegirl','jawiki']);
 assert.equal(info.links[0].url,'https://vndb.org/p24');assert.equal(info.links[2].url,'https://zh.moegirl.org.cn/index.php?search=Key');assert.deepEqual(body.filters,['id','=','p24']);assert.equal(body.fields.includes('description'),true);
 const again=await P.producer(root,'p24',{fetch:async()=>{throw Error('no network');}});assert.equal(again.name,'Key');assert.equal(n,1);});
test('the original name is searched when there is one; a local official site or a non-wikipedia jawiki is not linked',()=>{const i=P.build('p9',{name:'Nitro',original:'ニトロプラス',description:'',extlinks:[{name:'website',url:'http://192.168.0.2/'},{name:'jawiki',url:'https://evil.example.com/x'}]});
 assert.deepEqual(i.links.map(l=>l.kind),['vndb','moegirl']);assert.match(i.links[1].url,/search=%E3%83%8B%E3%83%88%E3%83%AD/);assert.equal(i.intro,'');});
test('a bad id, an unknown producer and a failed ask: null, and a failed ask is not repeated at once',async()=>{const root=tmp();assert.equal(await P.producer(root,'x1',{fetch:ok(answer)}),null);assert.equal(await P.producer(root,'p5',{fetch:ok({results:[]})}),null);
 let n=0;const bad=async()=>{n++;throw Error('x');};assert.equal(await P.producer(root,'p6',{fetch:bad}),null);assert.equal(await P.producer(root,'p6',{fetch:bad}),null);assert.equal(n,1);});
test('open: only a link of the cached answer, in the system browser; anything else is refused',async()=>{const root=tmp();await P.producer(root,'p24',{fetch:ok(answer)});const seen=[];const sp=(exe,args)=>{seen.push([exe,...args]);return {};};
 assert.deepEqual(P.open(root,'p24','moegirl',{spawnFn:sp}),{opened:true});assert.deepEqual(seen[0],['explorer.exe','https://zh.moegirl.org.cn/index.php?search=Key']);
 assert.throws(()=>P.open(root,'p24','twitter',{spawnFn:sp}),/INVALID_LINK/);assert.throws(()=>P.open(root,'p99','vndb',{spawnFn:sp}),/INVALID_LINK/);assert.throws(()=>P.open(root,'../x','vndb',{spawnFn:sp}),/INVALID_LINK/);assert.equal(seen.length,1);});
