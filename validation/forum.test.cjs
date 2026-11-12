process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
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
/* #117 交流 board on the relay: open to read, accounts write, local filter + AI verdict reasons, author / admin delete,
   per-account limits, account deletion wipes the text. */
const ai=answer=>({run:async()=>({response:answer})});
const post=(extra={})=>({title:'ATRI 的 hook 抓不到文字',body:'Kirikiri 引擎，选了自动 hook 还是没有字幕。\n\n有人遇到过吗？',tag:'question',game:'ATRI -My Dear Moments-',engine:'Kirikiri',...extra});

test('forum validation: lengths, links, blocked words, tags, game and engine',async()=>{
 const {validatePost,validateReply,cleanText}=await load('forum.js');
 assert.equal(validatePost(post()).ok,true);
 assert.equal(validatePost(post()).value.gameKey,'atri -my dear moments-');
 assert.equal(validatePost(post({title:'a'})).error,'TITLE_LENGTH');
 assert.equal(validatePost(post({title:'あ'.repeat(61)})).error,'TITLE_LENGTH');
 assert.equal(validatePost(post({body:'あ'.repeat(4001)})).error,'BODY_LENGTH');
 assert.equal(validatePost(post({body:'  '})).error,'BODY_REQUIRED');
 for(const bad of ['看 https://x.cn','加我 www.example.com','ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ','mail a@b.cn','加 qq: 12345678','vx：abcdef1'])assert.equal(validatePost(post({body:bad})).error,'TEXT_LINK',bad);
 for(const bad of ['你这个傻逼','约炮吗','fuck you'])assert.equal(validatePost(post({body:bad})).error,'TEXT_BLOCKED',bad);
 assert.equal(validatePost(post({body:'a​b'})).error,'TEXT_INVALID');
 assert.equal(validatePost(post({tag:'x'})).error,'INVALID_TAG');
 assert.equal(validatePost(post({engine:'<script>'})).error,'INVALID_ENGINE');
 assert.equal(validatePost(post({game:'a<b'})).error,'INVALID_GAME');
 assert.equal(validatePost(post({game:'',engine:''})).value.game,'');
 assert.equal(cleanText('a\n\n\n\n\nb',[1,10],true,'BODY').text,'a\n\nb');
 assert.equal(cleanText('MeguLit 很好用 (｡･ω･｡)',[1,40],true,'BODY').ok,true,'nickname-only words are fine in posts');
 assert.equal(validateReply({body:'x'.repeat(2001)}).error,'BODY_LENGTH');
});

test('forum: anyone reads, only accounts write; AI verdict reasons; replies bump the thread',async()=>{
 const {handle}=await load('worker.js');const e=env();e.AI=ai('SAFE');
 const A=account(e,1),B=account(e,2);
 await call(handle,e,'POST','/api/leaderboard',body(1),A);
 assert.equal((await call(handle,e,'POST','/api/forum',post())).status,401,'signed out cannot post');
 const made=await call(handle,e,'POST','/api/forum',post(),A);assert.equal(made.status,201);const id=made.data.id;assert.match(id,/^[0-9a-f]{16}$/);
 const list=await call(handle,e,'GET','/api/forum');assert.equal(list.status,200);assert.equal(list.data.signedIn,false);
 assert.equal(list.data.posts.length,1);assert.equal(list.data.posts[0].author.name,'Reader1');assert.equal(list.data.posts[0].author.mine,false);assert.equal(list.data.posts[0].game,'ATRI -My Dear Moments-');
 assert.equal((await call(handle,e,'POST',`/api/forum/${id}/replies`,{body:'试试手动 hook'})).status,401);
 const r=await call(handle,e,'POST',`/api/forum/${id}/replies`,{body:'试试手动 hook 码'},B);assert.equal(r.status,201);
 const thread=await call(handle,e,'GET','/api/forum/'+id,undefined,B);
 assert.equal(thread.data.post.replies,1);assert.equal(thread.data.replies[0].author.name,'#'+sha('account:acc2').slice(0,4),'not joined: short tag, never the e-mail');
 assert.equal(thread.data.replies[0].author.mine,true);assert.equal(thread.data.post.author.mine,false);
 assert.ok(!JSON.stringify(thread.data).includes('example.com'));
 await call(handle,e,'POST','/api/forum',post({title:'分享一个 Siglus 设置',tag:'share',game:'',engine:'SiglusEngine'}),B);
 assert.equal((await call(handle,e,'GET','/api/forum?game='+encodeURIComponent(' atri -my dear moments- '))).data.posts.length,1);
 assert.equal((await call(handle,e,'GET','/api/forum?engine=siglusengine')).data.posts[0].tag,'share');
 assert.equal((await call(handle,e,'GET','/api/forum?tag=share')).data.posts.length,1);
 assert.equal((await call(handle,e,'GET','/api/forum?tag=bad')).status,400);
 assert.equal((await call(handle,e,'GET','/api/forum?mine=1')).status,401);
 assert.equal((await call(handle,e,'GET','/api/forum?mine=1',undefined,A)).data.posts.length,1);
 assert.equal((await call(handle,e,'GET','/api/forum')).data.posts.length,2);
 for(const[answer,reason]of [['ADULT','MODERATION_ADULT'],['abuse.','MODERATION_ABUSE'],['SPAM','MODERATION_SPAM']]){e.AI=ai(answer);const x=await call(handle,e,'POST','/api/forum',post({title:'再问 '+answer}),B);assert.equal(x.status,422);assert.equal(x.data.error,reason);}
 e.AI={run:async()=>{throw Error('down');}};assert.equal((await call(handle,e,'POST',`/api/forum/${id}/replies`,{body:'模型挂了也能回复'},A)).status,201,'model down: local filter decides');
 e.AI=ai('SAFE');assert.equal((await call(handle,e,'POST',`/api/forum/${id}/replies`,{body:'加我 qq 12345678'},A)).data.error,'TEXT_LINK');
});

test('forum: authors delete their own, the admin key deletes anything, others cannot',async()=>{
 const {handle}=await load('worker.js');const e=env();e.ADMIN_TOKEN='admin-key-123';
 const A=account(e,1),B=account(e,2);
 const id=(await call(handle,e,'POST','/api/forum',post(),A)).data.id;
 const rid=(await call(handle,e,'POST',`/api/forum/${id}/replies`,{body:'同问'},B)).data.id;
 assert.equal((await call(handle,e,'DELETE','/api/forum/'+id,undefined,B)).status,403);
 assert.equal((await call(handle,e,'DELETE',`/api/forum/${id}/replies/${rid}`,undefined,A)).status,403);
 assert.equal((await call(handle,e,'DELETE','/api/forum/'+id)).status,401);
 assert.equal((await call(handle,e,'DELETE','/api/forum/'+id,undefined,{'x-megulit-admin':'wrong-key-123'})).status,401);
 assert.equal((await call(handle,e,'DELETE',`/api/forum/${id}/replies/${rid}`,undefined,B)).status,200);
 const t=await call(handle,e,'GET','/api/forum/'+id);assert.deepEqual(Object.keys(t.data.replies[0]).sort(),['created','deleted','id']);assert.equal(t.data.post.replies,0);
 assert.equal((await call(handle,e,'DELETE','/api/forum/'+id,undefined,{'x-megulit-admin':'admin-key-123'})).status,200);
 assert.equal((await call(handle,e,'GET','/api/forum/'+id)).status,404);
 const row=e.DB.raw.prepare('SELECT deleted,body FROM forum_posts WHERE id=?').get(id);assert.equal(row.deleted,2);assert.equal(row.body,'','removed text is not kept');
 const own=(await call(handle,e,'POST','/api/forum',post(),B)).data.id;assert.equal((await call(handle,e,'DELETE','/api/forum/'+own,undefined,B)).status,200);
 assert.equal((await call(handle,e,'GET','/api/forum')).data.posts.length,0);
});

test('forum: per-account post limit, page size, account deletion wipes the text',async()=>{
 const {handle}=await load('worker.js');const e=env();const A=account(e,1);
 for(let i=0;i<5;i++)assert.equal((await call(handle,e,'POST','/api/forum',post({title:'问题 '+i}),A)).status,201);
 assert.equal((await call(handle,e,'POST','/api/forum',post(),A)).status,429);
 for(let n=2;n<=6;n++){const X=account(e,n);for(let i=0;i<5;i++)await call(handle,e,'POST','/api/forum',post({title:`问题 ${n}-${i}`}),X);}
 const first=await call(handle,e,'GET','/api/forum');assert.equal(first.data.posts.length,20);assert.equal(first.data.more,true);
 const second=await call(handle,e,'GET','/api/forum?page=1');assert.equal(second.data.posts.length,10);assert.equal(second.data.more,false);
 assert.equal((await call(handle,e,'DELETE','/api/me',undefined,A)).status,200);
 assert.equal(e.DB.raw.prepare("SELECT COUNT(*) n FROM forum_posts WHERE author=? AND body<>''").get(sha('account:acc1')).n,0);
});

/* 2026-11-12 pictures: checked on upload, stored only when SAFE, attached by the post that names them, served only
   then, never claimable by someone else, removed with their post; unused ones are cleaned up after a day */
const webp=(w=40,h=30)=>{const b=new Uint8Array(64);b.set([...'RIFF'].map(c=>c.charCodeAt(0)),0);b.set([...'WEBPVP8X'].map(c=>c.charCodeAt(0)),8);const W=w-1,H=h-1;b[24]=W&255;b[25]=W>>8&255;b[26]=W>>16&255;b[27]=H&255;b[28]=H>>8&255;b[29]=H>>16&255;return b;};
const upload=async(handle,e,auth,bytes=webp())=>{const r=await handle(new Request('https://relay.test/api/forum/images',{method:'POST',headers:{'cf-connecting-ip':'10.9.0.'+(ipN++&255),'content-type':'image/webp',...auth},body:bytes}),e,NOW);return {status:r.status,data:await r.json()};};
test('forum pictures: vision check, attach on post, serve, ownership, delete and cleanup',async()=>{
 const {handle}=await load('worker.js'),{webpSize,cleanupForumImages}=await load('forum.js');const e=env();e.AI=ai('SAFE');
 assert.deepEqual(webpSize(webp(1920,1080)),{width:1920,height:1080});assert.equal(webpSize(new Uint8Array(40)),null);
 const A=account(e,1),B=account(e,2);
 assert.equal((await upload(handle,e,{})).status,401);
 const up=await upload(handle,e,A);assert.equal(up.status,201);const pic=up.data.id;assert.match(pic,/^[0-9a-f]{32}$/);assert.ok(e.BUCKET.store.has(`forum/${pic}.webp`));
 assert.equal((await call(handle,e,'GET','/api/forum/images/'+pic)).status,404,'not served before a post names it');
 e.AI=ai('ADULT');const bad=await upload(handle,e,A);assert.equal(bad.status,422);assert.equal(bad.data.error,'IMAGE_ADULT');assert.equal(e.BUCKET.store.size,1,'a rejected picture is never stored');
 delete e.AI;assert.equal((await upload(handle,e,A)).data.error,'IMAGE_UNAVAILABLE','no model, no picture');e.AI=ai('SAFE');
 assert.equal((await call(handle,e,'POST','/api/forum',post({images:[pic]}),B)).data.error,'INVALID_IMAGES','someone else cannot use it');
 const made=await call(handle,e,'POST','/api/forum',post({images:[pic]}),A);assert.equal(made.status,201);
 const got=await handle(req('GET','/api/forum/images/'+pic),e,NOW);assert.equal(got.status,200);assert.equal(got.headers.get('content-type'),'image/webp');
 const thread=await call(handle,e,'GET','/api/forum/'+made.data.id);assert.deepEqual(thread.data.post.images,[pic]);
 assert.equal((await call(handle,e,'GET','/api/forum')).data.posts[0].pictures,1);
 assert.equal((await call(handle,e,'POST','/api/forum',post({images:[pic]}),A)).data.error,'INVALID_IMAGES','a picture belongs to one post');
 const rp=(await upload(handle,e,B)).data.id;const reply=await call(handle,e,'POST',`/api/forum/${made.data.id}/replies`,{body:'看图',images:[rp]},B);assert.equal(reply.status,201);
 assert.deepEqual((await call(handle,e,'GET','/api/forum/'+made.data.id)).data.replies[0].images,[rp]);
 assert.equal((await call(handle,e,'DELETE','/api/forum/'+made.data.id,undefined,A)).status,200);
 assert.equal(e.BUCKET.store.has(`forum/${pic}.webp`),false);assert.equal(e.BUCKET.store.has(`forum/${rp}.webp`),false,'the replies\' pictures go with the post');
 const stale=(await upload(handle,e,A)).data.id;assert.equal(await cleanupForumImages(e,new Date(NOW.getTime()+3600e3)),0);
 assert.equal(await cleanupForumImages(e,new Date(NOW.getTime()+90000e3)),1);assert.equal(e.BUCKET.store.has(`forum/${stale}.webp`),false);
 assert.equal((await call(handle,e,'POST','/api/forum',post({images:['x']}),A)).data.error,'INVALID_IMAGES');
});
