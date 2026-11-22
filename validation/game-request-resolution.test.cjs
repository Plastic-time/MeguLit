// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,createHmac,randomUUID}=require('node:crypto');
const {fixture,database,malwareClean}=require('./helpers/torch-release.cjs');
const migrations=path.join(__dirname,'../relay/migrations');
const schema=fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFileSync(path.join(migrations,n),'utf8')).join('');
const now=new Date('2026-11-22T01:00:00.000Z'),pepper='local-fixture',repo='fixture/MeguLit';
const sha=value=>createHash('sha256').update(value).digest('hex');
const exact=(work,exe=sha(work),lang='ja',engine='kirikiri',script='b'.repeat(64))=>`${work} | ${engine} | ${lang} | ${exe} | ${script}`;

test('website and desktop game requests close only against four durable exact evidence sources',async t=>{
 const db=database(schema),f=fixture(),objects=new Map(),issues=new Map(),writes=[];
 t.after(()=>db.raw.close());
 const {handle}=await import('../relay/src/worker.js');
 const torch=await import('../relay/src/torch-release.js');
 let failPatch=null;
 const env={...f.env,DB:db,HASH_SALT:'salt',GITHUB_REPO:repo,GITHUB_TOKEN:'fixture',GAME_REQUEST_ISSUE_AUTHOR:'relay-bot',
  ADAPTER_PROBE_WEBHOOK_SECRET:pepper,BUCKET:{
   put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:objects.get(k)}:null,delete:async k=>objects.delete(k)
  },fetch:async(url,init)=>{
   if(init.method==='POST'){
    const number=issues.size+100,doc=JSON.parse(init.body);
    const issue={...doc,labels:doc.labels.map(name=>({name})),number,state:'open',user:{login:'relay-bot'},
     html_url:`https://github.com/${repo}/issues/${number}`};
    issues.set(number,issue);return Response.json(issue,{status:201});
   }
   const number=Number(url.split('/').at(-1)),issue=issues.get(number);
   assert.ok(issue,url);
   if(init.method==='GET')return Response.json(issue);
   assert.equal(init.method,'PATCH');
   const receipt=db.raw.prepare('SELECT * FROM game_request_jobs WHERE issue=?').get(number);
   assert.ok(receipt?.matched_kind&&receipt?.matched_ref,'receipt must be persisted before GitHub PATCH');
   assert.equal(JSON.parse(init.body).state_reason,'not_planned');
   writes.push(number);
   if(failPatch===number)return new Response(null,{status:503});
   issue.state='closed';return Response.json(issue);
  }};
 const request=(url,body,headers={},at=now)=>handle(new Request('https://relay.test'+url,{
  method:body===undefined?'GET':'POST',body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),headers
 }),env,at);
 const admin=(body,query='')=>request('/api/seed-admin/game-request-evidence'+query,body,{authorization:'Bearer test-admin'});
 const trigger=(issue,at=now)=>{
  const body=JSON.stringify({repository:{full_name:repo},action:'opened',issue});
  return request('/api/probe/issue-webhook',body,{'x-github-event':'issues',
   'x-hub-signature-256':'sha256='+createHmac('sha256',pepper).update(body).digest('hex')},at);
 };
 const submit=async(text,page='/',kind='game')=>{
  const r=await request('/api/feedback',{kind,text,page,lang:'en'},{'cf-connecting-ip':'198.51.100.'+(issues.size+10)});
  assert.equal(r.status,201);return issues.get(issues.size+99);
 };
 const numberOfState=number=>db.raw.prepare('SELECT closed_at FROM game_request_jobs WHERE issue=?').get(number)?.closed_at;
 const register=async(selector,kind,ref)=>assert.equal((await admin({selector,kind,ref})).status,201);

 const generating=exact('v1'),active=await submit(generating);
 assert.equal((await (await trigger(active)).json()).gameRequest,'open');
 await register(generating.toUpperCase(),'generating',randomUUID());
 assert.equal(active.state,'closed','durable generation registration wakes prior matching request');

 const profile=f.profile(),review=await f.review(profile);
 const proposed=await torch.propose(db,{profile,review},env,now);
 await malwareClean(db,profile,env,now);
 const released=await torch.publish(db,f.publisher.sign(proposed.proposal),env,now);
 const available=exact('v2',f.identity.exe);
 await register(available,'available',released.hash);
 const app=await submit(available,'app/1.4.22');
 assert.equal((await trigger(app)).status,200);assert.equal(app.state,'closed');

 const skeleton=exact('v3'),probeHash=sha('probe fixture');
 const bundle=JSON.stringify({schema:'megulit.probe-bundle',version:1,games:[{identity:probeHash,step:'parse-failed',
  inventory:{archives:[{magic:'5850330d0a'}]}}]});
 const upload=()=>request('/api/probe',{version:1,upload:randomUUID(),part:0,parts:1,size:Buffer.byteLength(bundle),
  sha256:sha(bundle),data:Buffer.from(bundle).toString('base64')});
 assert.equal((await upload()).status,201);assert.equal((await upload()).status,201);
 const drafts=db.raw.prepare("SELECT id FROM seed_admin_items WHERE kind='probe-skeleton'").all();
 assert.equal(drafts.length,1);await register(skeleton,'skeleton',drafts[0].id);
 const probe=await submit(skeleton);assert.equal((await trigger(probe)).status,200);assert.equal(probe.state,'closed');
 assert.equal((await admin({selector:exact('v99'),kind:'skeleton',ref:drafts[0].id})).status,409);

 const backlog=exact('v4');
 db.raw.prepare("INSERT INTO probe_issue_disposition(repo,issue,markdown,created_at) VALUES(?,700,'# Pending adaptation',?)").run(repo,now.toISOString());
 await register(backlog,'backlog','700');
 const pending=await submit(backlog,'app/1.4.22');failPatch=pending.number;
 assert.equal((await trigger(pending)).status,502);assert.equal(pending.state,'open');assert.equal(numberOfState(pending.number),null);
 failPatch=null;assert.equal((await trigger(pending)).status,200);assert.equal(pending.state,'closed');
 assert.equal((await trigger(pending)).status,200);
 const receipt=await (await admin(undefined,'?issue='+pending.number)).json();
 assert.equal(receipt.status,'backlog');assert.equal(receipt.ref,'700');assert.ok(receipt.closedAt);

 for(const value of ['Same familiar title',exact('v20',f.identity.exe),exact('v2'),exact('v2',f.identity.exe,'zh-Hans'),
   exact('v2',f.identity.exe,'ja','reallive'),exact('v2',f.identity.exe,'ja','kirikiri','c'.repeat(64)),exact('v5')]){
  const wrong=await submit(value);assert.equal((await trigger(wrong)).status,200);assert.equal(wrong.state,'open',value);
 }
 const feedback=await submit(available,'app/1.4.22','feedback');
 assert.equal((await (await trigger(feedback)).json()).ignored,true);assert.equal(feedback.state,'open');
 const diagnostic=await submit(available);
 diagnostic.labels.push({name:'diagnostics'});
 assert.equal((await (await trigger(diagnostic)).json()).ignored,true);assert.equal(diagnostic.state,'open');
 const fails=await submit(available);
 db.raw.exec("CREATE TRIGGER fail_game_match BEFORE UPDATE OF matched_kind ON game_request_jobs BEGIN SELECT RAISE(ABORT,'fixture match persistence failure'); END");
 try{assert.equal((await trigger(fails)).status,500);assert.equal(fails.state,'open');}
 finally{db.raw.exec('DROP TRIGGER fail_game_match');}
 const stale=exact('v7'),expired=await submit(stale);
 await register(stale,'generating',randomUUID());
 assert.equal((await trigger(expired,new Date(+now+7*3600000))).status,200);
 assert.equal(expired.state,'open');
 const removed=await submit(skeleton);
 db.raw.prepare("UPDATE seed_admin_items SET state='deleted' WHERE id=?").run(drafts[0].id);
 assert.equal((await trigger(removed)).status,200);assert.equal(removed.state,'open');
 assert.deepEqual(writes,[active.number,app.number,probe.number,pending.number,pending.number]);
 assert.ok(db.raw.prepare('SELECT count(*) n FROM game_request_jobs WHERE closed_at IS NOT NULL').get().n===4);
});
