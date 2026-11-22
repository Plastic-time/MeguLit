// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火署名 (relay/src/torch-credit.js, auto-profile.js hooks): name cleaning, numbers that only grow, a re-upload keeps
   its number, change / withdraw by PUT, block list -> anonymous, credit in GET /api/game-profile (auto diff only, outside the
   signed document). Relay in-process, no network. */
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const {fallbackAlias}=require('../core/torch-alias.cjs');
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

test('传火碑 GET /api/torch/monument: oldest first, cursor paging, total, withdrawn uses a Japanese alias and stays, no key / reporter, game title when known, 30 characters',async()=>{
 const {report,call,ENV}=mk();
 await report('1.1.1.1',KA,{name:'あ'.repeat(30)},{});assert.equal((await report('9.9.9.1',KA,{name:'あ'.repeat(31)})).status,400,'31 characters refused');
 for(let i=2;i<=7;i++)await report('1.1.1.'+i,i%2?KA:KB,i===4?undefined:{name:'传火'+i});
 await call('1.1.1.1','PUT','/api/game-profile/credit',{key:KA,name:null});/* withdrawn: the record stays */
 /* a title the relay knows: the VNDB id of KB's calibrations -> a probe title */
 const prints=JSON.stringify({exe:KB,vndb:'v17'});ENV.DB.raw.prepare('UPDATE auto_profile_reports SET prints=? WHERE game_key=?').run(prints,KB);
 ENV.DB.raw.prepare("INSERT INTO probe_full(identity,upload,object_key,sha256,size,parts,state,title,vndb,created_at,updated_at,expires_at) VALUES('i','u','k','d',1,1,'ready','千恋＊万花','v17',0,0,9999999999)").run();
 const page=async q=>{const r=await call('7.7.7.7','GET','/api/torch/monument'+q);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/max-age=60/);return r.json();};
 let a=await page('?limit=3');assert.equal(a.total,7);assert.deepEqual(a.items.map(i=>i.torchNo),[1,2,3]);assert.equal(a.next,'3');
 assert.equal(a.items[0].name,null);assert.equal(a.items[0].display,fallbackAlias(1));assert.equal(a.items[0].alias,a.items[0].display);assert.equal(a.items[1].name,'传火2');
 assert.equal(a.items[1].game,'千恋＊万花');assert.equal(a.items[2].game,null,'KA has no known title');
 for(const it of a.items)assert.deepEqual(Object.keys(it).sort(),[...(it.name?[]:['alias']),'at','display','game','name','torchNo']);
 assert.doesNotMatch(JSON.stringify(a),/aaaaaaaa|bbbbbbbb|reporter|1\.1\.1/);
 let b=await page('?cursor='+a.next+'&limit=3');assert.deepEqual(b.items.map(i=>i.torchNo),[4,5,6]);assert.equal(b.items[0].display,fallbackAlias(4));
 let c=await page('?cursor='+b.next+'&limit=3');assert.deepEqual(c.items.map(i=>i.torchNo),[7]);assert.equal(c.next,null);
 assert.ok(a.items.every((x,i,arr)=>!i||arr[i-1].at<=x.at),'oldest first');
 assert.equal((await page('?limit=99999')).items.length,7,'limit is capped at 500, default 100');
 assert.equal((await call('7.7.7.7','GET','/api/torch/monument?cursor=abc')).status,400);assert.equal((await call('7.7.7.7','GET','/api/torch/monument?limit=x')).status,400);
 const before=a.total;await report('5.5.5.5',KB,{name:'新人'});assert.equal((await page('')).total,before+1,'only grows');
});

test('传火碑 at scale: month filter + /months, /find prefix, /me, counter rows (no COUNT(*)), withdraw / rename keep the search right',async()=>{
 const {report,call,ENV}=mk();const day=(y,m,d)=>Math.floor(Date.UTC(y,m-1,d,12)/1000);
 for(const [i,n] of ['Alice','alice b','Albert','Bob','Alina'].entries())await report('3.3.3.'+(i+1),i%2?KB:KA,{name:n});
 await report('3.3.3.6',KA);/* #6 never named */
 /* move the numbers into months (the clock of the test is today) */
 const at={1:day(2026,9,30),2:day(2026,10,1),3:day(2026,10,15),4:day(2026,10,31),5:day(2026,11,2),6:day(2026,11,3)};
 for(const [no,t] of Object.entries(at))ENV.DB.raw.prepare('UPDATE torch_credits SET at=? WHERE torch_no=?').run(t,+no);
 ENV.DB.raw.exec("DELETE FROM torch_months");for(const m of ['2026-09','2026-10','2026-10','2026-10','2026-11','2026-11'])ENV.DB.raw.prepare('INSERT INTO torch_months(month,n) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET n=n+1').run(m);
 const get=async(r,ip='7.7.7.7')=>{const x=await call(ip,'GET',r);return {status:x.status,body:await x.json(),h:x.headers};};
 let m=await get('/api/torch/months');assert.deepEqual(m.body.months,[{month:'2026-09',n:1},{month:'2026-10',n:3},{month:'2026-11',n:2}]);assert.equal(m.body.total,6);assert.match(m.h.get('cache-control'),/max-age=60/);
 let o=await get('/api/torch/monument?month=2026-10&limit=2');assert.deepEqual(o.body.items.map(i=>i.torchNo),[2,3]);assert.equal(o.body.total,3);assert.equal(o.body.next,'3');assert.equal(o.body.month,'2026-10');
 o=await get('/api/torch/monument?month=2026-10&cursor=3');assert.deepEqual(o.body.items.map(i=>i.torchNo),[4]);assert.equal(o.body.next,null);
 assert.equal((await get('/api/torch/monument?month=2026-13')).status,400);assert.equal((await get('/api/torch/monument?month=2030-01')).body.items.length,0);
 /* the totals come from counter rows */
 assert.equal(ENV.DB.raw.prepare('SELECT total FROM torch_counter WHERE id=1').get().total,6);
 /* find: prefix, case and spaces folded, name order, at most 50 */
 let f=await get('/api/torch/find?name=al');assert.deepEqual(f.body.items.map(i=>[i.torchNo,i.month]),[[3,'2026-10'],[1,'2026-09'],[2,'2026-10'],[5,'2026-11']],'in name order (Albert, Alice, alice b, Alina), so a wide prefix stays an index scan');
 assert.deepEqual((await get('/api/torch/find?name=ALICE')).body.items.map(i=>i.torchNo),[1,2],'case folded; "alice b" matches the prefix');
 assert.deepEqual((await get('/api/torch/find?name=bob')).body.items.map(i=>i.torchNo),[4]);assert.equal((await get('/api/torch/find?name=zzz')).body.items.length,0);
 assert.equal((await get('/api/torch/find?name=')).status,400);assert.equal((await get('/api/torch/find?name='+'a'.repeat(31))).status,400);
 /* withdraw / rename: the search follows */
 await call('3.3.3.1','PUT','/api/game-profile/credit',{key:KA,name:null});
 assert.deepEqual((await get('/api/torch/find?name=alice')).body.items.map(i=>i.torchNo),[2],'a withdrawn name is not findable');
 await call('3.3.3.3','PUT','/api/game-profile/credit',{key:KA,name:'Zed'});
 assert.deepEqual((await get('/api/torch/find?name=zed')).body.items.map(i=>i.torchNo),[3]);assert.ok(!(await get('/api/torch/find?name=albert')).body.items.length);
 /* me: only the caller's numbers, optionally one game, not cached, no key / reporter in the answer */
 let me=await get('/api/torch/me',' 3.3.3.2'.trim());assert.deepEqual(me.body.items.map(i=>[i.torchNo,i.name,i.month]),[[2,'alice b','2026-10']]);assert.equal(me.h.get('cache-control'),'private, no-store');
 assert.equal((await get('/api/torch/me?key='+KA,'3.3.3.2')).body.items.length,0);assert.equal((await get('/api/torch/me?key='+KB,'3.3.3.2')).body.items.length,1);
 assert.equal((await get('/api/torch/me?key=zz','3.3.3.2')).status,400);assert.equal((await get('/api/torch/me','9.9.9.9')).body.items.length,0);
 assert.doesNotMatch(JSON.stringify(me.body),/reporter|game_key|[0-9a-f]{32}/);
 /* a re-upload does not move the counters; a new number does */
 await report('3.3.3.1',KA);assert.equal(ENV.DB.raw.prepare('SELECT total FROM torch_counter WHERE id=1').get().total,6);
 await report('3.3.3.9',KA,{name:'New'});assert.equal(ENV.DB.raw.prepare('SELECT total FROM torch_counter WHERE id=1').get().total,7);
 assert.equal((await get('/api/torch/months')).body.months.pop().n,3,'this month (the test clock) got the new number');
});

test('0026 backfills the counters from rows that already exist',async()=>{
 const db=new DatabaseSync(':memory:');const files=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const f of files.filter(f=>f<'0026'))db.exec(fs.readFileSync(path.join(relayDir,'migrations',f),'utf8'));
 db.exec("INSERT INTO torch_credits VALUES('k','r1',1,'Ann',1790000000),('k','r2',2,NULL,1790000100),('k','r3',3,'Bo B',1795000000)");
 db.exec(fs.readFileSync(path.join(relayDir,'migrations','0026_torch_scale.sql'),'utf8'));
 assert.equal(db.prepare('SELECT total FROM torch_counter').get().total,3);
 assert.deepEqual(db.prepare('SELECT month,n FROM torch_months ORDER BY month').all().map(r=>[r.month,r.n]),[['2026-09',2],['2026-11',1]]);
 assert.deepEqual(db.prepare('SELECT * FROM torch_names ORDER BY torch_no').all().map(r=>r.name_key),['ann','bob']);
});

test('0030 preserves manual signatures and assigns dispersed official Japanese aliases including #0',()=>{
 const db=new DatabaseSync(':memory:'),dir=path.join(relayDir,'migrations');
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.sql')&&f<'0030').sort())db.exec(fs.readFileSync(path.join(dir,file),'utf8'));
 const put=db.prepare('INSERT INTO torch_credits(game_key,reporter_hash,torch_no,name,at) VALUES(?,?,?,?,?)');
 for(let n=0;n<48;n++)put.run(KA,'private-'+n,n,n===1?'惠惠':null,1790000000);
 db.exec(fs.readFileSync(path.join(dir,'0030_torch_aliases.sql'),'utf8'));
 put.run(KA,'inserted by an old worker',48,null,1790000000);
 const rows=db.prepare('SELECT torch_no,name,alias FROM torch_credits ORDER BY torch_no').all();
 assert.equal(rows[0].alias,'ユージオ');
 assert.equal(rows[1].name,'惠惠');
 for(const row of rows){
  assert.equal(row.alias,fallbackAlias(row.torch_no));
  assert.match(row.alias,/^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u);
  assert.doesNotMatch(row.alias,/めぐみん|メグミン|惠惠|恵恵|megumin/iu);
 }
 assert.equal(new Set(rows.slice(0,24).map(r=>r.alias)).size,24);
 assert.equal(new Set(rows.slice(24,48).map(r=>r.alias)).size,24);
 assert.ok(rows.slice(1).every((r,i)=>r.alias!==rows[i].alias));
});

test('anonymous #0 is searchable and consistent through monument, me, reupload and withdrawal',async()=>{
 const {report,call,ENV}=mk(),ip='4.4.4.4',alias=fallbackAlias(0);
 const get=async route=>(await call(ip,'GET',route)).json();
 const find=name=>get('/api/torch/find?name='+encodeURIComponent(name));
 await report(ip,KA,{name:'Manual signature'});
 ENV.DB.raw.exec("DELETE FROM torch_names WHERE torch_no=1; UPDATE torch_credits SET torch_no=0, name=NULL, alias='ユージオ' WHERE torch_no=1");
 for(const result of [await get('/api/torch/monument'),await get('/api/torch/me?key='+KA),await find('ﾕｰ')]){
  assert.equal(result.items[0].torchNo,0);
  assert.equal(result.items[0].name,null);
  assert.equal(result.items[0].alias,alias);
  assert.doesNotMatch(JSON.stringify(result),/reporter|4\.4\.4\.4|Manual signature|aaaaaaaa/);
 }
 assert.equal((await (await report(ip,KA)).json()).credit.alias,alias);
 const rename=name=>call(ip,'PUT','/api/game-profile/credit',{key:KA,name});
 await rename('My Explicit Name');
 assert.deepEqual((await find(alias)).items,[]);
 assert.equal((await find('MY E')).items[0].name,'My Explicit Name');
 await rename(null);
 assert.deepEqual((await find('MY E')).items,[]);
 assert.equal((await find(alias)).items[0].alias,alias);
 assert.equal((await report('5.5.5.5',KB,{alias:'アクア',candidates:['private library']})).status,400);
});
