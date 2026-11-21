// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火署名 (relay/src/torch-credit.js, auto-profile.js hooks): name cleaning, numbers that only grow, a re-upload keeps
   its number, change / withdraw by PUT, block list -> anonymous, credit in GET /api/game-profile (auto diff only, outside the
   signed document). Relay in-process, no network. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay'),MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){const db=new DatabaseSync(':memory:');db.exec(MIGRATION);const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)||0}};}});return {prepare:sql=>stmt(sql),raw:db};}
const mod=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const KA='a'.repeat(64),KB='b'.repeat(64);
const mk=()=>{const ENV={DB:d1(),BUCKET:{},HASH_SALT:'salt',ADAPTER_ADMIN_TOKEN:'adm',LINK_SECRET:'l'};
 const call=async(ip,method,route,body)=>{const {handle}=await mod('worker.js');return handle(new Request('https://relay.test'+route,{method,headers:{'cf-connecting-ip':ip,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),ENV,new Date(),{waitUntil(){}});};
 const report=(ip,key,credit,extra={})=>call(ip,'POST','/api/game-profile/report',{version:1,profile:{key,engine:'krkr',exe:'a.exe',version:'1.4.23',source:'calibration',mode:'hide',settings:{},score:{cost:0,metrics:{}},...extra},...(credit===undefined?{}:{credit})});
 return {ENV,call,report};};

test('cleanName: control / zero-width removed, 1-30 characters, links / @ / email refused, block list -> anonymous',async()=>{
 const {cleanName}=await mod('torch-credit.js');
 assert.deepEqual(cleanName('  惠惠​\u0007 fan  '),{ok:true,name:'惠惠 fan'});
 assert.equal(cleanName('あ'.repeat(30)).name.length,30);assert.equal(cleanName('あ'.repeat(31)).ok,false);
 assert.equal(cleanName('😀'.repeat(30)).ok,true,'counted by character, not UTF-16 unit');
 for(const bad of ['','   ','​​','a@b.com','＠abc','http://x.y','www.abc.com','abc.cn','nick.com',7,{},[]])assert.equal(cleanName(bad).ok,false,String(bad));
 assert.deepEqual(cleanName(null),{ok:true,name:null});
 for(const blocked of ['管理员小王','Ad min','O.F.F.I.C.I.A.L','ＦＵＣＫ','傻 逼'])assert.deepEqual([cleanName(blocked).ok,cleanName(blocked).name],[true,null],blocked);
 assert.equal(cleanName('我的朋友',{CREDIT_BLOCKLIST:'朋友'}).name,null,'extra words from the relay var');
});

test('credit shape: only name allowed; anything else refuses the report, nothing stored',async()=>{
 const {report,ENV}=mk();
 for(const [i,c] of [{name:'a',email:'x'},{userId:1},[],'x',{name:'a@b.c'},{name:'x'.repeat(31)},{name:5}].entries()){
  const r=await report('8.8.8.'+i,KA,c);assert.equal(r.status,400,JSON.stringify(c));assert.equal((await r.json()).error,'INVALID_CREDIT');}
 assert.equal(ENV.DB.raw.prepare('SELECT COUNT(*) n FROM torch_credits').get().n,0);assert.equal(ENV.DB.raw.prepare('SELECT COUNT(*) n FROM auto_profile_reports').get().n,0);
});

test('numbers only grow; a re-upload keeps its number; name updates only when mentioned; raw IP never stored',async()=>{
 const {report,ENV}=mk();
 let r=await report('1.1.1.1',KA,{name:'小明'});assert.equal(r.status,201);let b=await r.json();assert.equal(b.torchNo,1);assert.equal(b.name,'小明');assert.ok(b.at>0);assert.deepEqual(b.credit,{torchNo:1,name:'小明',at:b.at});
 b=await (await report('2.2.2.2',KA)).json();assert.equal(b.torchNo,2);assert.equal(b.name,null,'no credit sent = anonymous');
 b=await (await report('3.3.3.3',KB,{name:'小红'})).json();assert.equal(b.torchNo,3,'global, not per game');
 b=await (await report('1.1.1.1',KA,{name:'小明二号'})).json();assert.equal(b.torchNo,1);assert.equal(b.name,'小明二号');
 b=await (await report('1.1.1.1',KA)).json();assert.equal(b.torchNo,1);assert.equal(b.name,'小明二号','not mentioned = unchanged');
 b=await (await report('1.1.1.1',KB,{name:'小明'})).json();assert.equal(b.torchNo,4,'another game, another torch');
 b=await (await report('4.4.4.4',KA,{name:'管理员'})).json();assert.equal(b.torchNo,5);assert.equal(b.name,null,'blocked word -> anonymous');
 const rows=ENV.DB.raw.prepare('SELECT * FROM torch_credits ORDER BY torch_no').all();assert.deepEqual(rows.map(x=>x.torch_no),[1,2,3,4,5]);
 assert.doesNotMatch(JSON.stringify(rows),/\d+\.\d+\.\d+\.\d+/);
});

test('PUT /api/game-profile/credit: change, withdraw, same reporter only',async()=>{
 const {report,call}=mk();
 await report('1.1.1.1',KA,{name:'小明'});await report('2.2.2.2',KA,{name:'小红'});
 let r=await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:'新名字'});assert.equal(r.status,200);let b=await r.json();assert.equal(b.torchNo,1);assert.equal(b.name,'新名字');
 b=await (await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:null})).json();assert.equal(b.name,null);assert.equal(b.torchNo,1,'the number stays');
 b=await (await report('2.2.2.2',KA)).json();assert.equal(b.name,'小红','someone else\'s withdrawal did not touch it');
 assert.equal((await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KB,name:'x'})).status,404,'no upload for this game from this reporter');
 assert.equal((await call('9.9.9.9','PUT','/api/game-profile/credit',{key:KA,name:'冒名'})).status,404);
 for(const bad of [{key:KA},{key:KA,name:'a@b.c'},{key:KA,name:'x',ip:'1'},{key:'z',name:'x'},{key:KA,name:''}])assert.equal((await call('1.1.1.1','PUT','/api/game-profile/credit',bad)).status,400,JSON.stringify(bad));
 assert.equal((await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:'管理员'})).status,200,'blocked name = anonymous, still accepted');
 assert.equal((await call('1.1.1.1','POST','/api/game-profile/credit',{})).status,405);
});

test('GET /api/game-profile: auto diff carries credit (first reporter of the picked calibration), official none; signed document untouched',async()=>{
 const {report,call,ENV}=mk();
 await report('1.1.1.1',KA,{name:'小明'});await report('2.2.2.2',KA,{name:'小红'});
 const row=ENV.DB.raw.prepare('SELECT settings,settings_hash,mode FROM auto_profile_reports WHERE game_key=?').get(KA);
 const doc={schema:'megulit.game-diff',key:KA,layer:'version',source:'auto',mode:row.mode,settings:JSON.parse(row.settings),rev:1,signature:{alg:'ed25519',keyId:'p1',value:'x'}};
 ENV.DB.raw.prepare("INSERT INTO game_diffs(layer,game_key,source,body,rev,updated_at) VALUES('version',?,'auto',?,1,1)").run(KA,JSON.stringify(doc));
 let b=await (await call('9.9.9.9','GET','/api/game-profile/'+KA)).json();
 assert.equal(b.credit.torchNo,1);assert.equal(b.credit.name,'小明');assert.deepEqual(b.versionLayer.credit,b.credit);assert.deepEqual(b.diff,doc,'credit sits outside the signed document');
 await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:null});
 b=await (await call('9.9.9.9','GET','/api/game-profile/'+KA)).json();assert.equal(b.credit.torchNo,1);assert.equal(b.credit.name,null);
 ENV.DB.raw.prepare("UPDATE game_diffs SET source='official',body=? WHERE game_key=?").run(JSON.stringify({...doc,source:'official'}),KA);
 b=await (await call('9.9.9.9','GET','/api/game-profile/'+KA)).json();assert.equal(b.credit,null,'official diffs carry no credit');
});

test('传火碑 GET /api/torch/monument: oldest first, cursor paging, total, withdrawn = 匿名 #N and stays, no key / reporter, game title when known, 30 characters',async()=>{
 const {report,call,ENV}=mk();
 await report('1.1.1.1',KA,{name:'あ'.repeat(30)},{});assert.equal((await report('9.9.9.1',KA,{name:'あ'.repeat(31)})).status,400,'31 characters refused');
 for(let i=2;i<=7;i++)await report('1.1.1.'+i,i%2?KA:KB,i===4?undefined:{name:'传火'+i});
 await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:null});/* withdrawn: the record stays */
 /* a title the relay knows: the VNDB id of KB's calibrations -> a probe title */
 const prints=JSON.stringify({exe:KB,vndb:'v17'});ENV.DB.raw.prepare('UPDATE auto_profile_reports SET prints=? WHERE game_key=?').run(prints,KB);
 ENV.DB.raw.prepare("INSERT INTO probe_full(identity,upload,object_key,sha256,size,parts,state,title,vndb,created_at,updated_at,expires_at) VALUES('i','u','k','d',1,1,'ready','千恋＊万花','v17',0,0,9999999999)").run();
 const page=async q=>{const r=await call('7.7.7.7','GET','/api/torch/monument'+q);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/max-age=60/);return r.json();};
 let a=await page('?limit=3');assert.equal(a.total,7);assert.deepEqual(a.items.map(i=>i.torchNo),[1,2,3]);assert.equal(a.next,'3');
 assert.equal(a.items[0].name,null);assert.equal(a.items[0].display,'传火人 #1','withdrawn shows as 传火人 #N');assert.equal(a.items[1].name,'传火2');
 assert.equal(a.items[1].game,'千恋＊万花');assert.equal(a.items[2].game,null,'KA has no known title');
 for(const it of a.items)assert.deepEqual(Object.keys(it).sort(),['at','display','game','name','torchNo']);
 assert.doesNotMatch(JSON.stringify(a),/aaaaaaaa|bbbbbbbb|reporter|1\.1\.1/);
 let b=await page('?cursor='+a.next+'&limit=3');assert.deepEqual(b.items.map(i=>i.torchNo),[4,5,6]);assert.equal(b.items[0].display,'传火人 #4','never named = 匿名 too');
 let c=await page('?cursor='+b.next+'&limit=3');assert.deepEqual(c.items.map(i=>i.torchNo),[7]);assert.equal(c.next,null);
 assert.ok(a.items.every((x,i,arr)=>!i||arr[i-1].at<=x.at),'oldest first');
 assert.equal((await page('?limit=99999')).items.length,7,'limit is capped at 500, default 100');
 assert.equal((await call('7.7.7.7','GET','/api/torch/monument?cursor=abc')).status,400);assert.equal((await call('7.7.7.7','GET','/api/torch/monument?limit=x')).status,400);
 const before=a.total;await report('5.5.5.5',KB,{name:'新人'});assert.equal((await page('')).total,before+1,'only grows');
});
