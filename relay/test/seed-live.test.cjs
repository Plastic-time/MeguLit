// Local D1 adapter and WebSocket transport. Both receiving installations have independent stores.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const {WebSocketServer}=require('ws');
const {fixture,database,malwareClean}=require('../../validation/helpers/torch-release.cjs');
const receive=require('../../services/torch-receive.cjs'),feed=require('../../services/auto-profile-feed.cjs');
const sessions=require('../../services/self-check-live.cjs'),{subscribe}=require('../../services/seed-live.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
async function until(check){for(let i=0;i<300;i++){if(check())return;await new Promise(r=>setTimeout(r,20));}assert.fail('timed out awaiting observed state');}

test('an HTTPS mirror replays the change log when it refuses the socket upgrade',async t=>{
 const key=sha('mirror test'),applied=[],cursors=[];
 class RefusedSocket{
  constructor(){queueMicrotask(()=>this.onerror());}
  close(){}
 }
 const stop=subscribe('isolated-client',{base:'https://mirror.test',Socket:RefusedSocket,
  fetcher:async url=>{
   const cursor=new URL(url).searchParams.get('after');cursors.push(cursor);
   const changes=cursor==='0'?Array.from({length:128},(_,i)=>({seq:i+1,game_key:key})):[{seq:129,game_key:key}];
   return Response.json({changes});
  },
  apply:async(_root,rows)=>applied.push(...rows.map(row=>row.seq))
 });
 t.after(stop);
 await until(()=>applied.length===129);
 assert.deepEqual(cursors,['0','128']);
 assert.deepEqual(applied,Array.from({length:129},(_,i)=>i+1));
});

test('publish, live delivery, offline revocation replay and next-dialogue application',async t=>{
 const f=fixture(),db=database(),now=new Date('2026-11-21T01:00:00Z');
 const {torchReleaseRoute,propose}=await import('../src/torch-release.js');
 const {SeedNotifications}=await import('../src/seed-notifications.js');
 db.raw.exec(fs.readFileSync(path.join(__dirname,'../migrations/0031_torch_changes.sql'),'utf8'));
 const sockets=new WebSocketServer({noServer:true}),hub=new SeedNotifications({getWebSockets:()=>[...sockets.clients]});
 const env={...f.env,DB:db,SEED_NOTIFICATIONS:{idFromName:n=>n,get:()=>({fetch:(url,init)=>hub.fetch(new Request(url,init))})}};
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);
  const url=new URL(req.url,'http://localhost'),request=new Request(url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
  const reply=await torchReleaseRoute(request,env,now,url,url.pathname,{json:(data,status=200)=>Response.json(data,{status}),fail:(error,status)=>Response.json({ok:false,error},{status})});
  res.writeHead(reply.status);res.end(await reply.text());
 });
 server.on('upgrade',(req,socket,head)=>sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws)));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 t.mock.method(require('../../services/relay-config.cjs'),'endpoints',(_root,route)=>[base+route]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'seed-live-')),roots=['publisher','peer'].map(n=>path.join(root,n)),stops=[];
 t.after(async()=>{await Promise.all(stops.map(stop=>stop()));sessions.stop();feed._trust(null);sockets.close();server.closeAllConnections();server.close();db.raw.close();fs.rmSync(root,{recursive:true,force:true});});
 const exeBytes='neutral executable',scriptBytes='neutral script';f.identity.exe=sha(exeBytes);f.identity.script=sha(scriptBytes);
 for(const dir of roots){
  fs.mkdirSync(dir);const exe=path.join(dir,'game.exe');fs.writeFileSync(exe,exeBytes);fs.writeFileSync(path.join(dir,'data.xp3'),scriptBytes);
  const store=require('../../services/store.cjs').openStore(dir);
  store.prepare("INSERT INTO games(id,title,executable) VALUES('7','Test',?)").run(exe);store.close();
 }
 const original=receive.receive,layer=feed.layer;
 t.mock.method(receive,'receive',(dir,id,options)=>original(dir,id,{...options,keys:f.keys}));
 t.mock.method(feed,'layer',(doc,key,options)=>layer(doc,key,{...options,torchTrust:f.keys}));
 t.mock.method(feed,'refresh',async()=>null);
 feed._trust(f.keys.profileKeys);
 const profiles=[],offsets=[];
 const {HookNative}=require('../../core/hook-native.cjs');
 const hooks=new HookNative({native:root,hook:root,logs:root},m=>{if(m.hookSource)offsets.push(hooks.profile.placement.lineOffsetY);},()=>{});
 clearInterval(hooks.timer);hooks.trace=()=>{};
 const reader={root:roots[1],gal:{hooks,setGameProfile(p,i){profiles.push(p);hooks.setProfile(p,i);}},emit:()=>{}};
 const exe=path.join(reader.root,'game.exe'),key=f.identity.exe,session=sessions.start(reader,exe,null,{exe,engine:'kirikiri'},{key});
 session.confirmedPresentation='adv';
 const line=(seq,continues=false)=>sessions.seedBoundary(reader,{hookSequence:seq,hookSource:'line '+seq,hookSourceContinues:continues});
 hooks.emitSource("First dialogue!",'live','',1);
 for(const dir of roots)stops.push(subscribe(dir,{base}));
 await until(()=>sockets.clients.size===2);
 async function post(action,document){
  const r=await fetch(base+'/api/torch-release/'+action,{method:'POST',headers:{authorization:'Bearer '+env.ADAPTER_ADMIN_TOKEN},body:JSON.stringify(document)});
  const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));return result;
 }
 const profile=f.publisher.sign({...f.profile(),settings:{placement:{lineOffsetY:4},page:{presentation:'nvl'}}}),review=await f.review(profile);
 const proposal=await propose(db,{profile,review},env,now);await malwareClean(db,profile,env,now);
 const release=f.publisher.sign(proposal.proposal);
 await post('publish',release);
 await until(()=>roots.every(dir=>feed.cached(dir,key)?.torchRelease?.revision===1)&&session.seedPending);
 assert.equal(profiles.length,0);line(1);line(2,true);assert.equal(profiles.length,0);
 hooks.emitSource('Second dialogue!', 'live','',2);assert.deepEqual(offsets,[0,4]);assert.equal(profiles.at(-1).placement.lineOffsetY,4);assert.equal(profiles.at(-1).page.presentation,'adv');
 await post('publish',release);line(3);assert.equal(profiles.length,1);
 for(const ws of sockets.clients)ws.terminate();
 await post('revoke',f.publisher.sign({schema:'megulit.torch-revocation',version:1,profileHash:review.candidateHash,reason:'review-withdrawn'}));
 await until(()=>roots.every(dir=>feed.cached(dir,key)?.torchQuarantined)&&session.seedPending);
 line(4);assert.equal(profiles.at(-1).placement.lineOffsetY,0);
 assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM torch_changes').get().n,2);
});
