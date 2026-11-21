// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 NSFW setting (services/nsfw.cjs): off by default, the R18 filter forces the veil, covers VNDB rates adult are flagged by file
   name, ratings come from VNDB by id (only ids sent), a cover without an id is never veiled. No network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const nsfw=require('../services/nsfw.cjs');
const tmp=()=>fs.mkdtempSync(path.join(process.env.MEGULIT_TMP||os.tmpdir(),'nsfw-'));
const put=(root,rel,v)=>{const f=path.join(root,'data','config',rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v));};
const dbOf=rows=>({prepare:()=>({all:()=>rows})});
const rows=[{cover:'C:/x/covers/a.jpg',original:JSON.stringify({library:{vndbId:'v1'}})},{cover:'b.jpg',original:JSON.stringify({vndbManual:'v0002',library:{vndbId:'v9'}})},{cover:'c.jpg',original:'{}'},{cover:'d.jpg',original:JSON.stringify({library:{vndbId:'v4'}})}];
test('off by default; on only when set; the R18 filter wins',()=>{const root=tmp();assert.equal(nsfw.enabled(root),false);put(root,'library.json',{nsfw:true});assert.equal(nsfw.enabled(root),true);put(root,'native-preferences.json',{safe_cg:true});assert.equal(nsfw.enabled(root),false);assert.equal(nsfw.setting(root),true);});
test('adult rule: sexual or violence at 1 or more, a missing rating counts as adult',()=>{assert.equal(nsfw.adult({sexual:0,violence:0}),false);assert.equal(nsfw.adult({sexual:0.9,violence:0.2}),false);assert.equal(nsfw.adult({sexual:1,violence:0}),true);assert.equal(nsfw.adult({sexual:0,violence:1.5}),true);assert.equal(nsfw.adult(null),true);assert.equal(nsfw.adult({}),true);});
test('refresh: asks VNDB for the ids only, keeps the ratings, then state flags the adult covers by file name',async()=>{const root=tmp();let body=null;
 const f=async(url,init)=>{body=JSON.parse(init.body);return {ok:true,json:async()=>({results:[{id:'v1',image:{sexual:1.8,violence:0},developers:[{id:'p24',name:'Key',original:null}]},{id:'v2',image:{sexual:0,violence:0},developers:[]},{id:'v4',image:null}]})};};
 assert.equal(await nsfw.refresh(root,['v1','v2','v4'],{fetcher:f}),true);assert.deepEqual(body.filters,['or',['id','=','v1'],['id','=','v2'],['id','=','v4']]);assert.equal(body.fields,'image.sexual,image.violence,developers.id,developers.name,developers.original');assert.ok(!/title|path|exe/i.test(JSON.stringify(body.filters)));
 const s=nsfw.state(dbOf(rows),root);assert.deepEqual(s.flagged,['a.jpg']);assert.equal(s.on,false);assert.equal(s.pending,false,'a cover with no id, or an id with no image, is not pending and not flagged');
 put(root,'library.json',{nsfw:true});assert.equal(nsfw.state(dbOf(rows),root).on,true);});
test('an unknown id is pending (asked in the background); a failed ask is not repeated at once',async()=>{const root=tmp();let n=0;const f=async()=>{n++;throw Error('offline');};
 assert.equal(await nsfw.refresh(root,['v1'],{fetcher:f}),false);assert.equal(n,1);assert.equal(await nsfw.refresh(root,['v1'],{fetcher:f}),false);assert.equal(n,1,'retry only after a while');
 assert.equal(nsfw.state(dbOf(rows),root,{fetcher:async()=>{throw Error('x');}}).pending,true);});
test('the ids of the library: a manual id first, plain numbers get a v',()=>{assert.deepEqual(nsfw.games(dbOf(rows)).map(g=>g.vid),['v1','v2','','v4']);assert.deepEqual(nsfw.games(dbOf(rows)).map(g=>g.cover),['a.jpg','b.jpg','c.jpg','d.jpg']);assert.equal(nsfw.vid('123'),'v123');assert.equal(nsfw.vid('x1'),'');});
test('flag file: state writes the adult cover names; store.imageData tags exactly those covers with #r18',async()=>{const root=tmp();const store=require('../services/store.cjs');
 const dir=path.join(root,'data','assets','covers');fs.mkdirSync(dir,{recursive:true});const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),Buffer.alloc(20)]);fs.writeFileSync(path.join(dir,'a.png'),PNG);fs.writeFileSync(path.join(dir,'b.png'),PNG);
 assert.ok(!store.imageData(root,'covers','a.png').endsWith('#r18'),'before any rating nothing is tagged');
 const f=async()=>({ok:true,json:async()=>({results:[{id:'v1',image:{sexual:2,violence:0}},{id:'v2',image:{sexual:0,violence:0}}]})});await nsfw.refresh(root,['v1','v2'],{fetcher:f});
 const r=[{cover:'a.png',original:JSON.stringify({library:{vndbId:'v1'}})},{cover:'b.png',original:JSON.stringify({library:{vndbId:'v2'}})}];
 let s=nsfw.state(dbOf(r),root);assert.deepEqual(s.flagged,['a.png']);assert.equal(s.changed,true);
 assert.ok(store.imageData(root,'covers','a.png').endsWith('#r18'));assert.ok(!store.imageData(root,'covers','b.png').endsWith('#r18'));assert.ok(!store.imageData(root,'word-images','a.png').endsWith('#r18'),'only covers');
 s=nsfw.state(dbOf(r),root);assert.equal(s.changed,false,'an unchanged set is not a change');});

test('developers: each game gets its first VNDB developer from the same answers; old cache entries without developers are asked again',async()=>{const root=tmp();put(root,'cover-ratings.json',{vn:{v1:{sexual:0,violence:0,at:Date.now()}}});
 const f=async()=>({ok:true,json:async()=>({results:[{id:'v1',image:{sexual:0,violence:0},developers:[{id:'p24',name:'Key',original:'Key'}]}]})});
 const r=[{id:'7',cover:'a.jpg',original:JSON.stringify({library:{vndbId:'v1'}})},{id:'8',cover:'b.jpg',original:'{}'}];
 assert.deepEqual(nsfw.developers(dbOf(r),root,{fetcher:f}).byGame,{},'asked in the background first');await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(nsfw.developers(dbOf(r),root,{fetcher:f}).byGame,{7:{pid:'p24',name:'Key',original:'Key'}});});
