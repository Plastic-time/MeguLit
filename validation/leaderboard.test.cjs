// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 client side of the opt-in leaderboard: local aggregation, opt-in / opt-out, the not-configured state, the shared
   relay address, nickname rules shared with the relay, and the top tab. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const lb=require('../services/leaderboard.cjs'),relay=require('../services/relay-config.cjs'),{SCHEMA}=require('../services/store.cjs'),{Settings}=require('../services/settings.cjs');
const NO_ENV={},BASE_ENV={MEGULIT_RELAY_BASE:'https://relay.test'};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-lb-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>db.close());return {root,db};
}
const at=(y,m,d,h=12)=>Math.floor(new Date(y,m-1,d,h).getTime()/1000);
function seed(db){
 db.prepare("INSERT INTO games(id,title) VALUES('g1','ATRI'),('g2','千恋＊万花'),('g3','Hidden')").run();db.prepare("UPDATE games SET hidden_at=1 WHERE id='g3'").run();
 const s=db.prepare('INSERT INTO reading_sessions(game_id,started_at,ended_at,active_seconds,characters) VALUES(?,?,?,?,?)');
 /* Tue 2026-11-10 is "now"; this week = Mon 9th..; this month = 1st.. */
 s.run('g1',at(2026,11,10),null,600,1000);s.run('g1',at(2026,11,9),null,300,500);s.run('g2',at(2026,11,8),null,1200,2000);
 s.run('g2',at(2026,11,7),null,60,100);s.run('g1',at(2026,10,20),null,3600,9000);s.run('g3',at(2026,11,10),null,10,10);
 s.run('g1',at(2026,11,5),null,0,0);
 const w=db.prepare("INSERT INTO vocabulary(spelling,reading,definitions,created_at,original) VALUES('語','ご','[]',?,'{}')");
 w.run(at(2026,11,10));w.run(at(2026,11,3));w.run(at(2026,9,1));
}
const NOW=new Date(2026,10,10,20,0,0);

test('collectStats sums week / month / all time, words and streaks from local records only',t=>{
 const {db}=fixture(t);seed(db);const s=lb.collectStats(db,NOW);
 assert.deepEqual(s.keys,{week:'2026-W46',month:'2026-11',all:'all'});
 assert.deepEqual(s.stats.week,{characters:1510,seconds:910,words:1,streak:2});
 assert.deepEqual(s.stats.month,{characters:3610,seconds:2170,words:2,streak:4});
 assert.deepEqual(s.stats.all,{characters:12610,seconds:5770,words:3,streak:4});
 assert.equal(s.currentStreak,4);
 assert.deepEqual(s.games.map(g=>[g.title,g.characters]),[['ATRI',10500],['千恋＊万花',2100]],'hidden games stay out');
 assert.equal(lb.longestRun(['2026-01-01','2026-01-02','2026-01-04']),2);
 assert.equal(lb.currentRun(['2026-11-08','2026-11-09'],NOW),2,'today without reading keeps yesterday\'s run');
});

test('relay address: env, then Settings, then the built-in default; https only except localhost',t=>{
 const {root}=fixture(t);
 assert.equal(relay.DEFAULT_RELAY_BASE,'','no relay until the domain exists');
 assert.equal(relay.relayBase(root,NO_ENV),'');
 assert.equal(relay.relayBase(root,{MEGULIT_RELAY_BASE:'https://r.example/'}),'https://r.example');
 for(const bad of ['http://r.example','https://u:p@r.example','https://r.example/?a=1','ftp://r.example','not a url'])assert.equal(relay.normalizeBase(bad),'',bad);
 assert.equal(relay.normalizeBase('http://127.0.0.1:8787'),'http://127.0.0.1:8787');
 const settings=new Settings(root);settings.save({scope:'online',values:{relayUrl:'https://relay.megulit.example/'}});
 assert.equal(relay.relayBase(root,NO_ENV),'https://relay.megulit.example');
 assert.equal(relay.endpoint(root,'/api/diagnostics',NO_ENV),'https://relay.megulit.example/api/diagnostics');
 assert.throws(()=>settings.save({scope:'online',values:{relayUrl:'http://relay.megulit.example'}}),/SETTINGS_INVALID_URL/);
 assert.throws(()=>settings.save({scope:'online',values:{leaderboardName:'fuck'}}),/LEADERBOARD_NAME_BLOCKED/);
});

test('not configured: the page gets local numbers and a not-configured board, and nothing is sent',async t=>{
 const {root,db}=fixture(t);seed(db);let calls=0;const fetch=async()=>{calls++;throw Error('must not fetch');};
 const before=await lb.view(root,db,{period:'month',metric:'characters'},{env:NO_ENV,fetch,now:NOW});
 assert.equal(before.configured,false);assert.deepEqual(before.board,{state:'not-configured'});assert.equal(before.local.stats.month.characters,3610);
 lb.join(root,{name:'めぐみん',consent:true});
 assert.deepEqual(await lb.submit(lb.collectStats(db,NOW),{root,env:NO_ENV,fetch}),{state:'not-configured'});
 assert.deepEqual(await lb.fetch('week','characters',{root,env:NO_ENV,fetch}),{state:'not-configured'});
 assert.deepEqual(await lb.leave(root,{env:NO_ENV,fetch}),{state:'left',remote:'not-configured'});
 assert.equal(calls,0);
});

test('opt-in needs consent and a clean nickname; only totals are uploaded; games only when shared',async t=>{
 const {root,db}=fixture(t);seed(db);const sent=[];
 const fetch=async(url,init)=>{sent.push({url,method:init.method,body:init.body?JSON.parse(init.body):null});return new Response(JSON.stringify(init.method==='GET'?{entries:[{rank:1,name:'めぐみん',value:1510,me:true}],total:1,me:{rank:1,value:1510}}:{ok:true}),{status:200});};
 assert.deepEqual(await lb.submit(lb.collectStats(db,NOW),{root,env:BASE_ENV,fetch}),{state:'disabled'},'nothing before joining');
 assert.throws(()=>lb.join(root,{name:'めぐみん'}),/LEADERBOARD_CONSENT_REQUIRED/);
 assert.throws(()=>lb.join(root,{name:'a',consent:true}),/LEADERBOARD_NAME_LENGTH/);
 assert.throws(()=>lb.join(root,{name:'sb',consent:true}),/LEADERBOARD_NAME_BLOCKED/);
 const joined=lb.join(root,{name:'  めぐみん ',consent:true});assert.equal(joined.joined,true);assert.match(joined.installId,/^[0-9a-f-]{36}$/);
 const view=await lb.view(root,db,{period:'week',metric:'characters'},{env:BASE_ENV,fetch,now:NOW});
 assert.equal(view.submit.state,'ok');assert.equal(view.board.entries[0].me,true);
 const post=sent.find(r=>r.method==='POST');
 assert.equal(post.url,'https://relay.test/api/leaderboard');
 assert.deepEqual(Object.keys(post.body).sort(),['id','keys','name','stats','version']);
 assert.deepEqual(post.body.stats.week,{characters:1510,seconds:910,words:1,streak:2});
 assert.equal(post.body.name,'めぐみん');assert.ok(!JSON.stringify(post.body).includes(os.hostname()),'no machine names');
 const get=sent.find(r=>r.method==='GET');assert.match(get.url,/period=week&metric=characters&key=2026-W46&me=[0-9a-f]{64}$/);
 /* within 10 minutes the page does not post again */
 await lb.view(root,db,{},{env:BASE_ENV,fetch,now:new Date(NOW.getTime()+60000)});assert.equal(sent.filter(r=>r.method==='POST').length,1);
 lb.join(root,{name:'めぐみん',consent:true,shareGames:true});
 await lb.submit(lb.collectStats(db,NOW),{root,env:BASE_ENV,fetch});
 assert.deepEqual(sent.at(-1).body.games,[{title:'ATRI',characters:10500,seconds:4500},{title:'千恋＊万花',characters:2100,seconds:1260}]);
});

test('opt-out: Settings switch off deletes the server entry and forgets the id and consent',async t=>{
 const {root}=fixture(t),calls=[];const fetch=async(url,init)=>{calls.push([init.method,url]);return new Response('{"ok":true}');};
 const {installId}=lb.join(root,{name:'Kazuma',consent:true});
 const left=await lb.leave(root,{env:BASE_ENV,fetch});
 assert.deepEqual(left,{state:'left',remote:'deleted'});assert.deepEqual(calls,[['DELETE','https://relay.test/api/leaderboard?id='+installId]]);
 const c=lb.config(root,BASE_ENV);assert.equal(c.joined,false);assert.equal(c.enabled,false);assert.equal(c.installId,'');
 assert.equal(new Settings(root).get().values.online.leaderboardEnabled,false);
 /* a failed delete still forgets locally and reports the error */
 lb.join(root,{name:'Kazuma',consent:true});
 const failed=await lb.leave(root,{env:BASE_ENV,fetch:async()=>{throw Error('offline');}});assert.equal(failed.remote,'NETWORK');assert.equal(lb.config(root,BASE_ENV).installId,'');
 /* turning the switch on in Settings alone is not consent */
 new Settings(root).save({scope:'online',values:{leaderboardEnabled:true,leaderboardName:'Kazuma'}});assert.equal(lb.config(root,BASE_ENV).joined,false);
});

test('bridge: switching 参加排行榜 off in Settings calls leave',async t=>{
 const {root}=fixture(t);
 /* bridge reads MEGULIT_ROOT at load time, so load it in a child with its own root */
 const {execFileSync}=require('node:child_process');
 lb.join(root,{name:'Kazuma',consent:true});
 const out=execFileSync(process.execPath,['-e',`require(${JSON.stringify(path.join(__dirname,'..','services','bridge.cjs'))}).dispatch({action:'settings_save',scope:'online',values:{leaderboardEnabled:false}}).then(r=>console.log(JSON.stringify(r.values.online))).catch(e=>console.log('ERR '+e.message))`],{env:{...process.env,MEGULIT_ROOT:root,MEGULIT_RELAY_BASE:''},encoding:'utf8'});
 assert.equal(JSON.parse(out.trim().split('\n').pop()).leaderboardEnabled,false);
 assert.equal(lb.config(root,NO_ENV).installId,'','id forgotten');
});

test('nickname rules match the relay; fetch output is sanitized',async t=>{
 const relayValidate=await import(pathToFileURL(path.join(__dirname,'..','relay','src','validate.js')).href);
 const samples=['めぐみん','Kazuma','a','x'.repeat(17),'grape lover','fuckyou','傻逼123','SB','sb2','admin','MeguLit官方','see http://x','a@b','名前​','<b>hi</b>','  爆裂  魔法  ','ＭＥＧＵ','Dickens','死ね死ね'];
 for(const name of samples)assert.deepEqual(lb.cleanName(name),relayValidate.cleanName(name),name);
 assert.deepEqual(relayValidate.BLOCKED,lb.BLOCKED,'one block list on both sides');
 assert.equal(lb.cleanName('  爆裂  魔法  ').name,'爆裂 魔法');assert.equal(lb.cleanName('grape lover').ok,true);
 const {root}=fixture(t);lb.join(root,{name:'Kazuma',consent:true});
 const res=await lb.fetch('all','streak',{root,env:BASE_ENV,fetch:async()=>new Response(JSON.stringify({entries:[{rank:'1',name:'x'.repeat(50),value:-5,me:'yes',extra:1}],total:3}))});
 assert.deepEqual(res.entries,[{rank:1,name:'x'.repeat(32),value:0,me:false}]);
 assert.deepEqual(await lb.fetch('week','characters',{root,env:BASE_ENV,fetch:async()=>new Response('{"ok":false,"error":"RATE_LIMITED"}',{status:429})}),{state:'error',error:'RATE_LIMITED'});
 await assert.rejects(()=>lb.fetch('year','characters',{root,env:BASE_ENV}),/LEADERBOARD_INVALID_QUERY/);
});

test('top tab 排行榜 sits between 学习 and 工具 and the page renders the not-ready state',async()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.ok(app.includes("['home','library','history','learning','leaderboard','tools','settings','about']"));
 const view=await import(pathToFileURL(path.join(__dirname,'..','web','leaderboard-view.js')).href);
 assert.deepEqual(view.leaderboardLabel,{zh:'排行榜',ja:'ランキング',en:'Leaderboard'});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
 const local={stats:{week:{characters:1510,seconds:910,words:1,streak:2}},currentStreak:4};
 const zh=view.leaderboardHTML({configured:false,local,board:{state:'not-configured'}},'zh',esc);
 assert.match(zh,/联网服务还在准备中/);assert.match(zh,/1,510 字/);assert.doesNotMatch(zh,/data-lb-join/);
 assert.match(view.leaderboardHTML({configured:false,local},'ja',esc),/オンラインサービスは準備中です/);
 assert.match(view.leaderboardHTML({configured:true,joined:false,local,board:{state:'ok',entries:[]}},'en',esc),/data-lb-join/);
 const board=view.leaderboardHTML({configured:true,joined:true,name:'<x>',local,board:{state:'ok',entries:[{rank:1,name:'<img>',value:3600,me:true}],me:{rank:1,value:3600}}},'zh',esc);
 assert.doesNotMatch(board,/<img>|<x>/);assert.match(board,/is-me/);
 for(const locale of ['zh','ja','en'])assert.deepEqual(Object.keys(view.leaderboardWords(locale)).sort(),Object.keys(view.leaderboardWords('zh')).sort(),locale);
 assert.equal(view.formatValue('seconds',3660,'zh'),'1 小时 1 分钟');
});
