// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),yui=require('../services/yui.cjs');
test('consent, startup history, bounded offline retry and revocation',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'yui-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'logs/yui');fs.mkdirSync(dir,{recursive:true});
 const old=Date.now()-100000;
 fs.writeFileSync(path.join(dir,old+'-1.log'),'0 native-entry\n5 desktop-failed\n');
 assert.equal(yui.enabled(root),false);
 await yui.flush(root,{fetcher:assert.fail});
 yui.setEnabled(root,true);
 const start=Date.now(),name=start+'-2';
 fs.writeFileSync(path.join(dir,name+'.log'),'0 document\n11111 content-painted\n11112 secret@example.org\n11113 route-failed\n');
 let rows=yui.sessions(root,name);
 assert.deepEqual(rows.map(r=>r.state),['failed','running']);assert.equal(rows[1].slow,true);
 assert.equal(yui.sessions(root,'next')[1].state,'interrupted');
 fs.appendFileSync(path.join(dir,name+'.log'),'11114 closed\n');
 assert.equal(yui.sessions(root,name)[1].state,'closed');
 const sent=[];
 const send=ok=>yui.flush(root,{urls:['mock'],fetcher:async(url,args)=>{sent.push(JSON.parse(args.body));return {ok,json:async()=>({ok})};}});
 await send(false);await send(true);await send(true);
 assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);assert.deepEqual(Object.keys(sent[0]).sort(),['id','ms','previous','stage']);assert.equal(sent[0].stage,'route-failed');
 for(let i=0;i<100;i++)fs.appendFileSync(path.join(dir,name+'.log'),(12000+i)+' frontend-error\n');
 await send(false);
 const queue=path.join(root,'logs/yui-outbox.json');assert.equal(JSON.parse(fs.readFileSync(queue)).pending.length,64);
 yui.setEnabled(root,false);assert.equal(fs.existsSync(queue),false);assert.equal(yui.enabled(root),false);
});
test('relay validates fields and merges concurrent deliveries including ambiguous GitHub create',async()=>{
 const {yuiPost,syncYui}=await import('../relay/src/yui.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(path.join(__dirname,'../relay/migrations/0031_yui.sql'),'utf8'));
 const issues=[],env={GITHUB_TOKEN:'mock',DB:{prepare:q=>({bind:(...v)=>({run:()=>sql.prepare(q).run(...v),first:()=>sql.prepare(q).get(...v),all:()=>({results:sql.prepare(q).all(...v)})})})},fetch:async(url,{method,body})=>{
  if(method==='GET')return {ok:true,json:async()=>issues};
  if(method==='POST'){issues.push({...JSON.parse(body),number:42});throw Error('simulated lost response');}
  Object.assign(issues[0],JSON.parse(body));return {ok:true,json:async()=>issues[0]};
 }};
 const post=value=>yuiPost({},env,{readJSON:async()=>({value}),fail:()=>false,json:v=>v.ok,hit:async()=>true},'mock',new Date());
 const v={id:'1'.repeat(64),stage:'webview-failed',previous:'webview-build-start',ms:100};
 assert.equal(await post({...v,manualSentence:'private'}),false);
 await Promise.all([post(v),post(v)]);await assert.rejects(syncYui(env));
 sql.exec('UPDATE yui_issues SET lease=0');await post({...v,id:'2'.repeat(64)});
 await Promise.all([syncYui(env),syncYui(env)]);
 assert.equal(issues.length,1);assert.match(issues[0].title,/^\[Yui\]/);assert.match(issues[0].body,/Occurrences: 2/);
 assert.deepEqual(issues[0].labels,['yui-report','diagnostics']);assert.equal(sql.prepare('SELECT synced FROM yui_issues').get().synced,2);
 sql.close();
});
