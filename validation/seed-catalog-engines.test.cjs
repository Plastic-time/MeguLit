// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const test=require('node:test'),assert=require('node:assert/strict');
const catalog=require('../services/seed-catalog.cjs');
const DAY=864e5,MIN=60000,NOW=Date.now();
const seeds={games:[{key:'private-profile',engine:'kirikiri',prints:{vndb:'v0001',steam:'1234',pack:'private-print'}}]};
const tmp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'seed-engines-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};
const vn=(id,title,sexual=0)=>({id,title,image:{thumbnail:'https://t.vndb.org/cv/01/1.jpg',sexual,violence:0}});
const json=body=>({ok:true,json:async()=>body});

test('the engine overview uses a measured count snapshot without querying titles',t=>{
 const root=tmp(t);
 const {engines,snapshot}=require('../services/seed-catalog-engine-map.cjs');
 const native=require('../services/original-engines/scenes.cjs').ENGINES;
 const legacy=require('../services/original-text.cjs').ADAPTERS;
 for(const id of Object.keys(engines))assert.ok(native[id==='silkys'?'silky':id]?.scenes||legacy[id]?.read,id);
 for(const id of ['unity','livemaker','godot','lightvn'])assert.ok(!Object.hasOwn(engines,id),id);
 assert.deepEqual(engines.kirikiri.vndb,['KiriKiri','KRKR2/KAG3']);
 assert.deepEqual(engines.bgi.vndb,['BGI/Ethornell']);
 const r=catalog.engineCounts(root,{now:snapshot.at,fetch:()=>{throw Error('overview should not query VNDB');}});
 assert.equal(r.offline,false);
 assert.deepEqual(Object.fromEntries(r.engines.map(e=>[e.id,e.count])),snapshot.counts);
 assert.ok(r.engines.every(e=>!e.stale));
 assert.ok(catalog.engineCounts(root,{now:snapshot.at+30*DAY}).engines.every(e=>e.stale));
 assert.ok(catalog.engineCounts(root,{seeds,now:snapshot.at}).engines.every(e=>e.stale));
});

test('engine pages count unique Japanese works, skip seeded ids and share the cover cache',async t=>{
 const root=tmp(t),calls=[];
 const fetch=async(url,o)=>{
  calls.push({url,headers:o.headers,q:JSON.parse(o.body)});
  return calls.length===1?json({count:101,more:true,results:[vn('v1','Seeded'),vn('v2','First'),vn('v2','Duplicate'),vn('v3','Mature',1),{id:'broken'}]}):
   json({more:false,results:[vn('v4','Second page')]});
 };
 const options={seeds,fetch,now:NOW};
 const [first,same]=await Promise.all([catalog.enginePage(root,'kirikiri',1,options),catalog.enginePage(root,'kirikiri',1,options)]);
 assert.deepEqual(first,same);
 assert.deepEqual(first.games.map(g=>[g.vndb,g.title,g.cover]),[['v2','First','safe'],['v3','Mature','nsfw']]);
 assert.equal(first.count,101);
 assert.equal(first.more,true);
 assert.equal(first.offline,false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,catalog.VNDB);
 assert.equal(calls[0].headers['User-Agent'],'MeguLit seed catalog');
 const f=['or',['engine','=','KiriKiri'],['engine','=','KRKR2/KAG3']];
 assert.deepEqual(calls[0].q.filters,['and',['or',['and',['olang','=','ja'],['release','=',f]],['release','=',['and',f,['lang','=','ja']]]],['id','!=','v1']]);
 assert.ok(calls[0].q.fields.split(',').includes('image.sexual'));
 assert.deepEqual([calls[0].q.page,calls[0].q.results,calls[0].q.count],[1,100,true]);
 assert.ok(!/private|1234/.test(JSON.stringify(calls[0])));
 assert.equal(catalog.readCache(root).vn.v2.title,'First');
 const config=path.join(root,'data','config');
 fs.writeFileSync(path.join(config,'native-preferences.json'),JSON.stringify({safe_cg:true}));
 assert.equal(await catalog.cover(root,'v3',{nsfw:true,fetch:()=>{throw Error('must use R18 gate');}}),null);
 const second=await catalog.enginePage(root,'kirikiri',2,options);
 assert.deepEqual(second.games.map(g=>g.vndb),['v4']);
 assert.equal(second.more,false);
 assert.equal(second.count,101);
 assert.equal(calls[1].q.page,2);
 assert.equal(calls[1].q.results,100);
 assert.equal(calls[1].q.count,undefined);
 assert.deepEqual(await catalog.enginePage(root,'kirikiri',1,options),first);
 assert.equal(calls.length,2);
 for(const [id,n] of [['constructor',1],['KiriKiri',1],['kirikiri','1'],['kirikiri',0],['kirikiri',1e9]])
  assert.equal(await catalog.enginePage(root,id,n,options),null);
 assert.equal(calls.length,2);
});

test('engine pages retain cleaned cache on 429 and retry after ten minutes',async t=>{
 const root=tmp(t),scope={seeds,now:NOW};
 const before=await catalog.enginePage(root,'kirikiri',1,{...scope,fetch:async()=>json({count:1,more:false,results:[vn('v2','Before')]})});
 assert.equal(before.count,1);
 const file=path.join(root,'data','config','seed-catalog.json');
 const data=catalog.readCache(root);
 data.engines.kirikiri.entries[1].ids.push('v2','bad','v1');
 data.vn.v2.image.url='https://other.example/image';
 fs.writeFileSync(file,JSON.stringify(data));
 const cached=await catalog.enginePage(root,'kirikiri',1,{...scope,now:NOW+29*DAY,fetch:()=>{throw Error('still fresh');}});
 assert.deepEqual(cached.games.map(g=>[g.vndb,g.cover]),[['v2','none']]);
 let calls=0;
 const blocked=async()=>{calls++;return {ok:false,status:429};};
 const at=NOW+30*DAY;
 const error=await catalog.enginePage(root,'kirikiri',1,{...scope,now:at,fetch:blocked});
 assert.equal(calls,1);
 assert.equal(error.offline,true);
 assert.equal(error.games[0].title,'Before');
 const r=catalog.engineCounts(root,{seeds,now:at+9*MIN});
 assert.equal(r.offline,true);
 assert.deepEqual(r.engines.find(e=>e.id==='kirikiri'),{id:'kirikiri',name:'KiriKiri',count:1,stale:true});
 assert.deepEqual(await catalog.enginePage(root,'kirikiri',2,{...scope,now:at+9*MIN,fetch:blocked}),
  {page:2,games:[],count:1,more:false,offline:true});
 assert.equal(calls,1);
 const retried=await catalog.enginePage(root,'kirikiri',1,{...scope,now:at+10*MIN,fetch:async()=>{calls++;return json({count:1,more:false,results:[vn('v2','After')]});}});
 assert.equal(calls,2);
 assert.equal(retried.offline,false);
 assert.equal(retried.games[0].title,'After');
});

test('new built-in VNDB ids invalidate an engine count and page together',async t=>{
 const root=tmp(t);let calls=0;
 const fetch=async()=>{calls++;return json({count:1,more:false,results:[vn('v2','A Game')]});};
 await catalog.enginePage(root,'kirikiri',1,{seeds,fetch,now:NOW});
 const moreSeeds={games:[...seeds.games,{prints:{vndb:'v2'}}]};
 assert.ok(catalog.engineCounts(root,{seeds:moreSeeds,now:NOW}).engines.find(g=>g.id==='kirikiri').stale);
 const page=await catalog.enginePage(root,'kirikiri',1,{seeds:moreSeeds,fetch,now:NOW});
 assert.equal(calls,2);
 assert.deepEqual(page.games,[]);
});

test('a failed engine page pauses only the engine pages, not the tested games',async t=>{
 const root=tmp(t);
 const failed=await catalog.enginePage(root,'kirikiri',1,{seeds,now:NOW,fetch:async()=>({ok:false,status:429})});
 assert.equal(failed.offline,true);
 assert.equal(catalog.engineCounts(root,{seeds,now:NOW+MIN}).offline,true);
 let asked=0;
 const r=await catalog.catalog(root,{seeds,now:NOW+MIN,fetch:async()=>{asked++;return json({results:[vn('v1','Seeded')]});}});
 assert.equal(asked,1,'the tested games still ask VNDB for a missing name');
 assert.equal(r.offline,false);
 assert.equal(r.games[0].title,'Seeded');
});

test('a hand-edited engine cache keeps only canonical pages and a valid scope',async t=>{
 const root=tmp(t),scope={seeds,now:NOW};
 await catalog.enginePage(root,'kirikiri',1,{...scope,fetch:async()=>json({count:3,more:true,results:[vn('v2','Kept')]})});
 const file=path.join(root,'data','config','seed-catalog.json'),data=JSON.parse(fs.readFileSync(file,'utf8'));
 const row={at:NOW,ids:['v2'],more:false};
 Object.assign(data.engines.kirikiri.entries,{'01':{...row,ids:['v9']},'1001':row,'2':{...row,at:-1},'3':{...row,ids:Array.from({length:150},(_,i)=>'v'+(i+10))}});
 data.engines.tyrano={scope:'not-a-digest',entries:{0:{at:NOW,count:9},1:row}};
 fs.writeFileSync(file,JSON.stringify(data));
 const cache=catalog.readCache(root);
 assert.deepEqual(Object.keys(cache.engines.kirikiri.entries),['0','1','3']);
 assert.deepEqual(cache.engines.kirikiri.entries[1].ids,['v2'],'page "01" is not page 1');
 assert.equal(cache.engines.kirikiri.entries[3].ids.length,100);
 assert.equal(cache.engines.tyrano,undefined);
});
