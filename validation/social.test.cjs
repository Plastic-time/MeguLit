process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E397 public profiles, follows and 同好 on the relay: login required to write, private by default, private readers
   never get a pid, cannot be opened, followed or suggested, and "recently reading" only comes from shared games.
   Worker runs against a node:sqlite D1 stand-in with every migration applied. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{DatabaseSync}=require('node:sqlite');
const relayDir=path.join(__dirname,'..','relay');
const load=name=>import(pathToFileURL(path.join(relayDir,'src',name)).href);
const MIGRATIONS=fs.readdirSync(path.join(relayDir,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>fs.readFileSync(path.join(relayDir,'migrations',f),'utf8')).join('');
function d1(){
 const db=new DatabaseSync(':memory:');db.exec(MIGRATIONS);
 const stmt=(sql,args=[])=>({bind:(...a)=>stmt(sql,a),first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{db.prepare(sql).run(...args);return {success:true};}});
 return {prepare:sql=>stmt(sql),batch:async list=>{db.exec('BEGIN');try{for(const s of list)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function r2(){const store=new Map();return {store,put:async(k,b)=>{store.set(k,new Uint8Array(b));},get:async k=>store.has(k)?{body:store.get(k)}:null,delete:async k=>{store.delete(k);}};}
const env=()=>({DB:d1(),BUCKET:r2(),HASH_SALT:'s',LINK_SECRET:'l'});
const NOW=new Date('2026-11-10T04:00:00Z'),T=Math.floor(NOW.getTime()/1000);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
let ipN=0;const req=(method,url,data,headers={})=>new Request('https://relay.test'+url,{method,headers:{'cf-connecting-ip':'10.2.'+(ipN>>8&255)+'.'+(ipN++&255),...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const stats={week:{characters:100,seconds:60,words:1,streak:1},month:{characters:100,seconds:60,words:1,streak:1},all:{characters:100,seconds:60,words:1,streak:1}};
/* an account with a session token; returns the Authorization header */
function account(e,n){const token='mgl_'+String(n).repeat(43).slice(0,43);e.DB.raw.prepare('INSERT INTO accounts(id,email,created_at,last_login_at) VALUES(?,?,?,?)').run('acc'+n,n+'@example.com',T,T);
 e.DB.raw.prepare('INSERT INTO account_sessions(id,account_id,token_hash,created_at,last_used_at,rotated_at,expires_at) VALUES(?,?,?,?,?,?,?)').run('s'+n,'acc'+n,sha(token),T,T,T,T+86400*100);return {authorization:'Bearer '+token};}
const body=(n,games)=>({version:1,id:uuid(n),name:'Reader'+n,keys:{week:'2026-W46',month:'2026-11'},stats,...(games?{games}:{})});
const call=async(handle,e,...a)=>{const r=await handle(req(...a),e,NOW);return {status:r.status,data:await r.json()};};

test('profile validation: one-line signature with the nickname filter, up to five favourites, optional VNDB id',async()=>{
 const {cleanBio,validateProfile}=await load('validate.js');
 assert.deepEqual(cleanBio('  爆裂魔法  一日一发 '),{ok:true,bio:'爆裂魔法 一日一发'});assert.deepEqual(cleanBio(''),{ok:true,bio:''});assert.deepEqual(cleanBio(undefined),{ok:true,bio:''});
 assert.equal(cleanBio('あ'.repeat(61)).error,'BIO_LENGTH');assert.equal(cleanBio('あ'.repeat(60)).ok,true);
 for(const bad of ['看 www.example.com','mail me a@b.c','<b>x</b>'])assert.equal(cleanBio(bad).error,'BIO_INVALID',bad);
 for(const bad of ['喜欢色情游戏','r18 only','you are a bitch','约炮吗'])assert.equal(cleanBio(bad).error,'BIO_BLOCKED',bad);
 assert.equal(cleanBio('I love MeguLit').ok,true,'impersonation words are only for nicknames');
 const ok=validateProfile({bio:'hi',favorites:[{title:'ATRI'},{title:' atri '},{title:'千恋＊万花',vndb:'V19073'}],public:true});
 assert.deepEqual(ok.value,{bio:'hi',favorites:[{key:'atri',title:'ATRI',vndb:''},{key:'千恋*万花',title:'千恋*万花',vndb:'v19073'}],public:true});
 assert.equal(validateProfile({favorites:Array.from({length:6},(_,i)=>({title:'G'+i}))}).error,'INVALID_FAVORITES');
 assert.equal(validateProfile({favorites:[{title:'x',vndb:'r12'}]}).error,'INVALID_FAVORITES');
 assert.equal(validateProfile({public:'yes'}).error,'INVALID_BODY');assert.equal(validateProfile({}).value.public,false,'private by default');
});

test('report: kind required, reason optional; the profile hides at once; the issue goes only to the private REPORT_REPO',async()=>{
 const {handle}=await load('worker.js');
 for(const repo of ['owner/megulit-reports','']){
  const e=env(),calls=[];e.REPORT_REPO=repo;e.GITHUB_TOKEN='ghp_x';e.fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({html_url:'https://github.com/owner/megulit-reports/issues/1'}),{status:201});};
  const A=account(e,1),B=account(e,2);
  await call(handle,e,'POST','/api/leaderboard',body(1),A);await call(handle,e,'POST','/api/leaderboard',body(2),B);
  const pid=(await call(handle,e,'PUT','/api/profile',{bio:'hello',favorites:[{title:'ATRI'}],public:true},A)).data.pid;
  assert.equal((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'nudity'})).status,401,'login first');
  assert.equal((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'bad'},B)).data.error,'INVALID_KIND');
  assert.equal((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'other'},A)).data.error,'CANNOT_REPORT_SELF');
  assert.equal((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'racism',reason:'x'.repeat(501)},B)).data.error,'INVALID_REASON');
  assert.deepEqual((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'racism',reason:'签名里有歧视内容'},B)).data,{ok:true,hidden:true});
  /* hidden at once: no card, no pid, not followable; the owner sees why and cannot unhide it alone */
  assert.equal((await call(handle,e,'GET','/api/profile/'+pid,undefined,B)).status,404);
  assert.ok((await call(handle,e,'GET','/api/leaderboard?period=all&metric=characters')).data.entries.every(r=>r.pid===null));
  assert.equal((await call(handle,e,'POST','/api/follow/'+pid,undefined,B)).status,404);
  await call(handle,e,'PUT','/api/profile',{bio:'hello',public:true},A);
  const own=(await call(handle,e,'GET','/api/profile',undefined,A)).data;assert.deepEqual([own.hidden,own.pid],[true,null]);
  assert.equal((await call(handle,e,'POST',`/api/profile/${pid}/report`,{kind:'racism'},B)).data.already,true,'one report per reader');
  /* E398 異議あり！ the owner objects once per hiding; it stays hidden until the maintainer decides */
  assert.equal((await call(handle,e,'POST','/api/profile/appeal',{reason:'只是普通签名'})).status,401);
  assert.equal((await call(handle,e,'POST','/api/profile/appeal',{},B)).data.error,'NOT_HIDDEN');
  assert.deepEqual((await call(handle,e,'POST','/api/profile/appeal',{reason:'只是普通签名'},A)).data,{ok:true,appealed:true});
  assert.equal((await call(handle,e,'POST','/api/profile/appeal',{},A)).data.already,true);
  assert.deepEqual((({hidden,appealed})=>[hidden,appealed])((await call(handle,e,'GET','/api/profile',undefined,A)).data),[true,true]);
  assert.equal((await call(handle,e,'GET','/api/profile/'+pid)).status,404,'still hidden');
  assert.deepEqual(e.DB.raw.prepare("SELECT kind,subject,reason FROM moderation_queue").all().map(r=>({...r})),[{kind:'profile',subject:pid,reason:'racism: 签名里有歧视内容'},{kind:'profile-appeal',subject:pid,reason:'只是普通签名'}]);
  if(repo){
   assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url==='https://api.github.com/repos/owner/megulit-reports/issues'),'both go to the private repo');
   const objection=calls[1].body;assert.deepEqual(objection.labels,['profile-appeal']);assert.match(objection.title,/異議あり/);assert.match(objection.body,/只是普通签名/);assert.match(objection.body,/`racism`: 签名里有歧视内容/);assert.match(objection.body,/SET hidden=0,appealed_at=0/);
   const issue=calls[0].body;assert.deepEqual(issue.labels,['profile-report']);assert.match(issue.title,/racism · Reader1/);
   assert.match(issue.body,/签名里有歧视内容/);assert.match(issue.body,/signature: hello/);assert.match(issue.body,/favourites: ATRI/);assert.match(issue.body,/SET hidden=0 WHERE pid='[0-9a-f]{16}'/);
   assert.equal(e.DB.raw.prepare('SELECT issue_url FROM profile_reports').get().issue_url,'https://github.com/owner/megulit-reports/issues/1');
   /* the maintainer restores it with the command from the issue */
   e.DB.raw.prepare('UPDATE profiles SET hidden=0 WHERE pid=?').run(pid);assert.equal((await call(handle,e,'GET','/api/profile/'+pid)).status,200);
  }else assert.equal(calls.length,0,'never the public repo: without REPORT_REPO the report only waits in the queue');
 }
});

test('profiles, follows and 同好: login to write, private by default, privacy holds when a reader goes private',async()=>{
 const {handle}=await load('worker.js'),e=env(),A=account(e,1),B=account(e,2),C=account(e,3);
 const games=[{title:'ATRI -My Dear Moments-',characters:5000,seconds:900,last:T-3600},{title:'サノバウィッチ',characters:900,seconds:300,last:T-86400}];
 assert.equal((await call(handle,e,'POST','/api/leaderboard',body(1,games),A)).status,200);
 assert.equal((await call(handle,e,'POST','/api/leaderboard',body(2,[{title:'atri -my dear moments-',characters:10,seconds:10}]),B)).status,200);
 assert.equal((await call(handle,e,'POST','/api/leaderboard',body(3),C)).status,200);
 assert.equal((await call(handle,e,'POST','/api/leaderboard',body(9,[{title:'X',characters:1,seconds:1,last:T+3*86400}]))).data.error,'INVALID_GAMES','no future read times');
 /* writing needs an account, and a leaderboard row */
 assert.equal((await call(handle,e,'PUT','/api/profile',{bio:'hi'})).status,401);
 const D=account(e,4);assert.equal((await call(handle,e,'PUT','/api/profile',{bio:'hi'},D)).data.error,'NOT_JOINED');
 assert.equal((await call(handle,e,'PUT','/api/profile',{bio:'约炮吗'},A)).data.error,'BIO_BLOCKED');
 /* private by default: no pid on the board */
 let own=(await call(handle,e,'PUT','/api/profile',{bio:'爆裂魔法 一日一发',favorites:[{title:'千恋＊万花'}]},A)).data;
 assert.deepEqual([own.public,own.pid,own.bio],[false,null,'爆裂魔法 一日一发']);
 assert.deepEqual((await call(handle,e,'GET','/api/profile',undefined,A)).data.favorites,[{title:'千恋*万花',vndb:''}]);
 const board=async()=>(await call(handle,e,'GET','/api/leaderboard?period=all&metric=characters')).data.entries;
 assert.ok((await board()).every(r=>r.pid===null));
 /* public: a pid shows on A's row only, and anyone can open the card */
 own=(await call(handle,e,'PUT','/api/profile',{bio:'爆裂魔法 一日一发',favorites:[{title:'千恋＊万花'},{title:'ATRI -My Dear Moments-',vndb:'v24302'}],public:true},A)).data;
 assert.match(own.pid,/^[0-9a-f]{16}$/);const pid=own.pid;
 const rows=await board();assert.equal(rows.find(r=>r.name==='Reader1').pid,pid);assert.equal(rows.find(r=>r.name==='Reader2').pid,null);
 const card=(await call(handle,e,'GET','/api/profile/'+pid,undefined,B)).data;
 assert.deepEqual([card.name,card.bio,card.favorites.length,card.following,card.me],['Reader1','爆裂魔法 一日一发',2,false,false]);
 assert.deepEqual(card.recent.map(g=>[g.title,g.last]),[['ATRI -My Dear Moments-',T-3600],['サノバウィッチ',T-86400]],'newest first');
 assert.equal((await call(handle,e,'GET','/api/profile/'+pid)).status,200,'cards are public');
 assert.equal((await call(handle,e,'GET','/api/profile/'+pid,undefined,A)).data.me,true);
 /* follow: login, not yourself, idempotent */
 assert.equal((await call(handle,e,'POST','/api/follow/'+pid)).status,401);
 assert.equal((await call(handle,e,'POST','/api/follow/'+pid,undefined,A)).data.error,'CANNOT_FOLLOW_SELF');
 assert.equal((await call(handle,e,'POST','/api/follow/'+pid,undefined,B)).data.following,true);await call(handle,e,'POST','/api/follow/'+pid,undefined,B);
 assert.equal((await call(handle,e,'GET','/api/profile/'+pid,undefined,B)).data.followers,1);
 let feed=(await call(handle,e,'GET','/api/following',undefined,B)).data.following;
 assert.deepEqual(feed.map(p=>[p.pid,p.name,p.public,p.recent.length,p.last]),[[pid,'Reader1',true,2,T-3600]]);
 /* 同好: B shares ATRI with A; C shares nothing; private readers never appear */
 const kin=(await call(handle,e,'GET','/api/kindred',undefined,B)).data.kindred;
 assert.deepEqual(kin.map(p=>[p.name,p.count,p.following]),[['Reader1',1,true]]);assert.deepEqual(kin[0].shared,['ATRI -My Dear Moments-']);
 assert.deepEqual((await call(handle,e,'GET','/api/kindred',undefined,C)).data.kindred,[]);
 /* A goes private: card 404, no pid, not in 同好, feed keeps the row without what they read; B can still unfollow */
 await call(handle,e,'PUT','/api/profile',{bio:'x',public:false},A);
 assert.equal((await call(handle,e,'GET','/api/profile/'+pid,undefined,B)).status,404);
 assert.ok((await board()).every(r=>r.pid===null));
 assert.deepEqual((await call(handle,e,'GET','/api/kindred',undefined,B)).data.kindred,[]);
 feed=(await call(handle,e,'GET','/api/following',undefined,B)).data.following;assert.deepEqual(feed.map(p=>[p.public,p.recent.length,p.avatar]),[[false,0,null]]);
 assert.equal((await call(handle,e,'POST','/api/follow/'+pid,undefined,C)).status,404,'cannot newly follow a private reader');
 assert.equal((await call(handle,e,'DELETE','/api/follow/'+pid,undefined,B)).data.following,false);
 assert.deepEqual((await call(handle,e,'GET','/api/following',undefined,B)).data.following,[]);
 /* recent only from shared games: B shares, then stops sharing (no games field) */
 own=(await call(handle,e,'PUT','/api/profile',{public:true},B)).data;
 assert.equal((await call(handle,e,'GET','/api/profile/'+own.pid)).data.recent.length,1);
 await call(handle,e,'POST','/api/leaderboard',body(2),B);
 assert.deepEqual((await call(handle,e,'GET','/api/profile/'+own.pid)).data.recent,[]);
 /* leaving the leaderboard removes the profile and every follow */
 await call(handle,e,'PUT','/api/profile',{public:true},A);await call(handle,e,'POST','/api/follow/'+own.pid,undefined,A);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM follows').get().n,1);
 assert.equal((await call(handle,e,'DELETE','/api/leaderboard?id='+uuid(2),undefined,B)).status,200);
 for(const t of ['profiles','profile_favorites'])assert.equal(e.DB.raw.prepare(`SELECT COUNT(*) n FROM ${t} WHERE id_hash=?`).get(sha('account:acc2')).n,0,t);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) n FROM follows').get().n,0);
});
