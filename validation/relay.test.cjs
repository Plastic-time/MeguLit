// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 relay Worker handlers run in Node against a D1 stand-in on node:sqlite (same migration SQL) and an in-memory R2. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATION=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){
 const db=new DatabaseSync(':memory:');db.exec(MIGRATION);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function r2(){const store=new Map();return {store,put:async(key,bytes,opts)=>{store.set(key,{bytes:new Uint8Array(bytes),opts});},get:async key=>store.has(key)?{body:store.get(key).bytes}:null};}
function env(extra={}){return {DB:d1(),BUCKET:r2(),LINK_SECRET:'test-link-secret',HASH_SALT:'salt',...extra};}
const NOW=new Date('2026-11-10T04:00:00Z');
const ID='3f1c2b7a-1d2e-4f50-8a9b-0c1d2e3f4a5b',ID2='9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const stats=(c=1000)=>({week:{characters:c,seconds:600,words:3,streak:2},month:{characters:c*2,seconds:1200,words:5,streak:2},all:{characters:c*3,seconds:3600,words:10,streak:5}});
const body=(over={})=>({version:1,id:ID,name:'めぐみん',keys:{week:'2026-W46',month:'2026-11'},stats:stats(),...over});
const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'198.51.100.7',...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data)});

test('leaderboard body validation: id, nickname, period keys, caps and games',async()=>{
 const {validateLeaderboard}=await load('validate.js');
 assert.equal(validateLeaderboard(body(),NOW).ok,true);
 assert.equal(validateLeaderboard(body({id:'not-a-uuid'}),NOW).error,'INVALID_ID');
 assert.equal(validateLeaderboard(body({name:'x'}),NOW).error,'NAME_LENGTH');
 assert.equal(validateLeaderboard(body({name:'fuckyou'}),NOW).error,'NAME_BLOCKED');
 assert.equal(validateLeaderboard(body({name:'see www.x.com'}),NOW).error,'NAME_INVALID');
 assert.equal(validateLeaderboard(body({keys:{week:'2025-W01',month:'2026-11'}}),NOW).error,'PERIOD_KEY_OUT_OF_RANGE');
 assert.equal(validateLeaderboard(body({stats:{...stats(),week:{characters:9e6,seconds:1,words:1,streak:1}}}),NOW).error,'STATS_OUT_OF_RANGE');
 assert.equal(validateLeaderboard(body({stats:{...stats(),week:{characters:-1,seconds:1,words:1,streak:1}}}),NOW).error,'INVALID_STATS');
 assert.equal(validateLeaderboard(body({stats:{...stats(),week:{characters:1.5,seconds:1,words:1,streak:1}}}),NOW).error,'INVALID_STATS');
 assert.equal(validateLeaderboard(body({stats:{...stats(),week:{characters:1,seconds:1,words:1,streak:8}}}),NOW).error,'STATS_OUT_OF_RANGE');
 assert.equal(validateLeaderboard(body({games:[{title:'<script>',characters:1,seconds:1}]}),NOW).error,'INVALID_GAMES');
 assert.equal(validateLeaderboard(body({games:Array.from({length:31},(_,i)=>({title:'g'+i,characters:1,seconds:1}))}),NOW).error,'INVALID_GAMES');
 const ok=validateLeaderboard(body({games:[{title:'ATRI ',characters:5,seconds:6},{title:'atri',characters:1,seconds:1}]}),NOW);
 assert.deepEqual(ok.value.games,[{key:'atri',title:'ATRI',characters:5,seconds:6}]);
 /* a client a few hours ahead (UTC+9 on Monday morning) is still accepted */
 assert.equal(validateLeaderboard(body({keys:{week:'2026-W46',month:'2026-11'}}),new Date('2026-11-08T20:00:00Z')).ok,true);
});

test('leaderboard POST, ranked GET with ties and me, DELETE removes everything',async()=>{
 const {handle}=await load('worker.js'),e=env();
 assert.equal((await handle(req('POST','/api/leaderboard',body()),e,NOW)).status,200);
 const r2b=await handle(req('POST','/api/leaderboard',body({id:ID2,name:'Kazuma',stats:stats(1000)}),{'cf-connecting-ip':'203.0.113.9'}),e,NOW);assert.equal(r2b.status,200);
 const third='11111111-2222-4333-8444-555555555555';
 await handle(req('POST','/api/leaderboard',body({id:third,name:'Aqua',stats:stats(5000)}),{'cf-connecting-ip':'203.0.113.10'}),e,NOW);
 const {sha256}=await load('worker.js'),me=await sha256(ID);
 const res=await handle(req('GET',`/api/leaderboard?period=week&metric=characters&key=2026-W46&me=${me}`),e,NOW),data=await res.json();
 assert.equal(res.status,200);assert.equal(data.total,3);
 assert.deepEqual(data.entries.map(x=>[x.rank,x.name,x.value,x.me]).sort((x,y)=>x[0]-y[0]||String(x[1]).localeCompare(y[1])),[[1,'Aqua',5000,false],[2,'Kazuma',1000,false],[2,'めぐみん',1000,true]]);
 assert.deepEqual(data.me,{rank:2,value:1000});
 assert.ok(!JSON.stringify(data).includes(ID),'install id never leaves the server');
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM leaderboard_users WHERE id_hash=?').get(ID).n,0,'only the hash is stored');
 const all=await (await handle(req('GET','/api/leaderboard?period=all&metric=streak'),e,NOW)).json();assert.equal(all.entries[0].value,5);
 assert.equal((await handle(req('GET','/api/leaderboard?period=year&metric=characters'),e,NOW)).status,400);
 assert.equal((await handle(req('GET','/api/leaderboard?period=week&metric=characters;drop'),e,NOW)).status,400);
 assert.equal((await handle(req('DELETE','/api/leaderboard?id='+ID),e,NOW)).status,200);
 for(const t of ['leaderboard_users','leaderboard_stats','leaderboard_games'])assert.equal(e.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE id_hash=?`).get(me).n,0,t);
 assert.equal((await handle(req('DELETE','/api/leaderboard?id=nope'),e,NOW)).status,400);
});

test('per-game boards list games and their top readers; hiding games removes them',async()=>{
 const {handle}=await load('worker.js'),e=env();
 await handle(req('POST','/api/leaderboard',body({games:[{title:'ATRI',characters:900,seconds:100},{title:'千恋＊万花',characters:50,seconds:10}]})),e,NOW);
 await handle(req('POST','/api/leaderboard',body({id:ID2,name:'Kazuma',games:[{title:'atri',characters:1200,seconds:100}]}),{'cf-connecting-ip':'203.0.113.9'}),e,NOW);
 const list=await (await handle(req('GET','/api/leaderboard?metric=games'),e,NOW)).json();
 assert.equal(list.games[0].readers,2);assert.equal(list.games[0].top.name,'Kazuma');
 const one=await (await handle(req('GET','/api/leaderboard?metric=games&game=ATRI'),e,NOW)).json();
 assert.deepEqual(one.entries.map(x=>[x.rank,x.name,x.value]),[[1,'Kazuma',1200],[2,'めぐみん',900]]);
 await handle(req('POST','/api/leaderboard',body()),e,NOW);
 const after=await (await handle(req('GET','/api/leaderboard?metric=games&game=atri'),e,NOW)).json();assert.equal(after.total,1);
});

test('rate limits per IP and per install id; payload size cap; bad JSON',async()=>{
 const {handle,RATE}=await load('worker.js'),e=env();
 for(let i=0;i<RATE['lb-post'][0];i++)assert.equal((await handle(req('POST','/api/leaderboard',body()),e,NOW)).status,200,'post '+i);
 assert.equal((await handle(req('POST','/api/leaderboard',body()),e,NOW)).status,429);
 /* same install id from many addresses still runs into the per-id limit */
 const e2=env();let last;for(let i=0;i<RATE['lb-id'][0]+1;i++)last=await handle(req('POST','/api/leaderboard',body(),{'cf-connecting-ip':'10.0.0.'+i}),e2,NOW);
 assert.equal(last.status,429);
 assert.equal((await handle(req('POST','/api/leaderboard',JSON.stringify({pad:'x'.repeat(70*1024)})),env(),NOW)).status,413);
 assert.equal((await handle(req('POST','/api/leaderboard','{nope'),env(),NOW)).status,400);
});

test('shared adaptation: upsert, GET ?fp= and POST /query, rejects path-like or malformed records',async()=>{
 const {handle}=await load('worker.js'),e=env(),k1='a'.repeat(64),k2='b'.repeat(64);
 const rec=(key,extra={})=>({schema:'megulit.adaptation',version:1,key,fingerprint:{exe:'game.exe',size:1,head:'c'.repeat(64),engine:'kirikiri'},...extra});
 const res=await (await handle(req('POST','/api/adaptation',{version:1,records:[rec(k1),rec(k2,{note:'C:\\Users\\me\\game'}),{key:'short'},rec(k1,{hook:{profile:'embed'}})]}),e,NOW)).json();
 assert.deepEqual([res.accepted,res.rejected],[2,2]);
 assert.equal(e.DB.raw.prepare('SELECT reports FROM adaptation_records WHERE key=?').get(k1).reports,2);
 const got=await (await handle(req('GET',`/api/adaptation?fp=${k1},${k2}`),e,NOW)).json();
 assert.equal(got.records.length,1);assert.equal(got.records[0].hook.profile,'embed');
 const q=await (await handle(req('POST','/api/adaptation/query',{version:1,keys:[k1.toUpperCase(),'zz']}),e,NOW)).json();assert.equal(q.records.length,1);
 assert.equal((await handle(req('GET','/api/adaptation?fp='+Array.from({length:51},(_,i)=>i.toString(16).padStart(64,'0')).join(',')),e,NOW)).status,400);
 assert.equal((await handle(req('POST','/api/adaptation',{records:'x'}),e,NOW)).status,400);
});

async function diagForm(zip,meta){const form=new FormData();form.set('meta',JSON.stringify(meta));form.set('package',new Blob([zip],{type:'application/zip'}),'d.zip');return new Request('https://relay.test/api/diagnostics',{method:'POST',headers:{'cf-connecting-ip':'198.51.100.7'},body:form});}
test('diagnostics: zip to R2, GitHub issue with diagnostics label and a signed expiring link',async()=>{
 const {handle,sha256}=await load('worker.js'),calls=[];
 const e=env({GITHUB_TOKEN:'ghp_test',fetch:async(url,init)=>{calls.push({url,init:{...init,body:JSON.parse(init.body)}});return new Response(JSON.stringify({html_url:'https://github.com/ilynthn/MeguLit/issues/77'}),{status:201});}});
 const zip=new Uint8Array([0x50,0x4b,3,4,...new Array(40).fill(1)]);
 const res=await handle(await diagForm(zip,{schema:1,version:'1.2.8d',game:{id:'g',title:'ATRI',engine:'kirikiri'},os:'10.0',sha256:await sha256(zip),note:'it *broke* @someone'}),e,NOW),data=await res.json();
 assert.equal(res.status,201);assert.equal(data.issueUrl,'https://github.com/ilynthn/MeguLit/issues/77');
 assert.equal(e.BUCKET.store.size,1);
 assert.equal(calls[0].url,'https://api.github.com/repos/ilynthn/MeguLit/issues');assert.deepEqual(calls[0].init.body.labels,['diagnostics']);
 assert.equal(calls[0].init.headers.authorization,'Bearer ghp_test');
 const issue=calls[0].init.body.body;assert.match(issue,/ATRI/);assert.match(issue,/\\@someone/);
 const link=issue.match(/https:\/\/relay\.test\/api\/diagnostics\/download\/\S+/)[0];
 const dl=await handle(new Request(link,{headers:{'cf-connecting-ip':'1.2.3.4'}}),e,NOW);assert.equal(dl.status,200);assert.equal(dl.headers.get('content-type'),'application/zip');
 assert.equal((await handle(new Request(link.replace(/sig=([0-9a-f])/,(m,c)=>'sig='+(c==='0'?'1':'0')),{headers:{}}),e,NOW)).status,404);
 assert.equal((await handle(new Request(link),e,new Date(NOW.getTime()+31*86400000))).status,410);
 /* wrong checksum, not a zip, missing package, bad version */
 assert.equal((await handle(await diagForm(zip,{version:'1.2.8d',sha256:'0'.repeat(64)}),e,NOW)).status,400);
 assert.equal((await handle(await diagForm(new Uint8Array(40).fill(7),{version:'1.2.8d'}),e,NOW)).status,400);
 assert.equal((await handle(await diagForm(zip,{version:'not a version'}),e,NOW)).status,400);
 const noPkg=new FormData();noPkg.set('meta','{}');assert.equal((await handle(new Request('https://relay.test/api/diagnostics',{method:'POST',body:noPkg}),env(),NOW)).status,400);
 /* optional bearer token */
 assert.equal((await handle(await diagForm(zip,{version:'1.2.8d'}),env({DIAG_TOKEN:'k'}),NOW)).status,401);
});

test('CORS only for listed origins; unknown routes 404; methods 405',async()=>{
 const {handle}=await load('worker.js');
 const noCors=await handle(req('GET','/api/health',undefined,{origin:'https://evil.example'}),env(),NOW);assert.equal(noCors.headers.get('access-control-allow-origin'),null);
 assert.equal((await handle(req('OPTIONS','/api/leaderboard',undefined,{origin:'https://evil.example'}),env(),NOW)).status,403);
 const allowed=await handle(req('GET','/api/health',undefined,{origin:'http://tauri.localhost'}),env({ALLOWED_ORIGINS:'http://tauri.localhost'}),NOW);assert.equal(allowed.headers.get('access-control-allow-origin'),'http://tauri.localhost');
 assert.equal((await handle(req('GET','/api/nothing'),env(),NOW)).status,404);
 assert.equal((await handle(req('PUT','/api/leaderboard',{}),env(),NOW)).status,405);
});

test('wrangler.toml and README carry no secrets and name every binding',()=>{
 const toml=fs.readFileSync(path.join(relayDir,'wrangler.toml'),'utf8'),readme=fs.readFileSync(path.join(relayDir,'README.md'),'utf8');
 assert.doesNotMatch(toml+readme,/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/);
 for(const s of ['binding = "DB"','binding = "BUCKET"','migrations_dir = "migrations"'])assert.ok(toml.includes(s),s);
 for(const s of ['wrangler login','d1 create','r2 bucket create','secret put GITHUB_TOKEN','custom_domain'])assert.ok(readme.includes(s),s);
});

test('website feedback becomes a GitHub issue: mentions defused, honeypot and size checked, rate limited, CORS for the site', async () => {
 const {handle}=await load('worker.js');
 const sent=[];
 const fakeFetch=async(url,init)=>{sent.push({url,init:JSON.parse(init.body)});return new Response(JSON.stringify({html_url:'https://github.com/ilynthn/MeguLit/issues/999'}),{status:201});};
 const e=env({GITHUB_TOKEN:'t',GITHUB_REPO:'ilynthn/MeguLit',ALLOWED_ORIGINS:'https://megulit.com',fetch:fakeFetch});
 const site={origin:'https://megulit.com'};
 const ok=await handle(req('POST','/api/feedback',{kind:'game',text:'ファタモルガーナの館 @someone',lang:'zh',page:'/'},site),e,NOW);
 assert.equal(ok.status,201);assert.equal((await ok.json()).url,'https://github.com/ilynthn/MeguLit/issues/999');
 assert.equal(ok.headers.get('access-control-allow-origin'),'https://megulit.com');
 assert.match(sent[0].url,/repos\/ilynthn\/MeguLit\/issues$/);
 assert.ok(sent[0].init.title.startsWith('[官网想玩] ファタモルガーナの館'));
 assert.ok(!/@someone/.test(sent[0].init.body)&&/@‍someone/.test(sent[0].init.body));
 assert.deepEqual(sent[0].init.labels,['game-request']);
 assert.equal((await handle(req('POST','/api/feedback',{kind:'feedback',text:'x',website:'spam'},site),e,NOW)).status,400);
 assert.equal((await handle(req('POST','/api/feedback',{kind:'feedback',text:'   '},site),e,NOW)).status,400);
 assert.equal((await handle(req('POST','/api/feedback',{kind:'nope',text:'x'},site),e,NOW)).status,400);
 for(let i=0;i<3;i++)await handle(req('POST','/api/feedback',{kind:'feedback',text:'line '+i},site),e,NOW);
 assert.equal((await handle(req('POST','/api/feedback',{kind:'feedback',text:'one too many'},site),e,NOW)).status,429);
 const none=env({fetch:fakeFetch});
 assert.equal((await handle(req('POST','/api/feedback',{kind:'feedback',text:'hi'}),none,NOW)).status,503);
});
