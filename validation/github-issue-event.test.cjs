// SPDX-License-Identifier: GPL-3.0-or-later
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseSelector} = require('../core/game-request-selector.cjs');

test('review draft and Markdown are recoverable before closing, with no issue text in either',async t=>{
  const {handleIssue,readProbe,openQueue,receiptFrom} = await import('../tools/github-issue-event.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'issue-event-'));
  const db = openQueue(directory);
  t.after(()=>{ db.close(); fs.rmSync(directory,{recursive:true,force:true}); });
  const key = 'a'.repeat(64), id = '01234567-1234-4567-8123-0123456789ab';
  const body = ['MeguLit desensitized probe uploaded through the relay','- Games: 1','- key: \x60'+key+'\x60',
    '- step: **chinese-build** private user text','Download (expires in 30 days): https://api.megulit.com/api/probe/download/'+id+'?exp=1940000000&sig='+key].join('\n');
  const issue = {number:1,html_url:'https://github.com/ilynthn/MeguLit/issues/1',user:{login:'ilynthn'},state:'open',labels:[{name:'adapter-probe'}],body};
  let patches=0, reads=0;
  const data = {schema:'megulit.probe-bundle',version:1,games:[{key,identity:'f'.repeat(64),step:'chinese-build'}]};
  const opts = {db,directory,read:()=>({...issue}),download:body=>readProbe(body,async (_,init)=>{
    reads++; assert.equal(init.redirect,'error'); return Response.json(data);
  }),close:()=>{assert.equal(db.prepare('SELECT COUNT(*) n FROM github_issue_receipts').get().n,1);
    if (++patches === 1) throw Error('GitHub unavailable'); issue.state='closed'; return issue;}};
  assert.equal(receiptFrom(body.replace('api.megulit.com','api.megulit.com.invalid')),null);
  assert.equal(receiptFrom(body.replace('https://api','https://nobody@api')),null);
  assert.equal(receiptFrom(body+'\n'+body),null);
  await assert.rejects(handleIssue(1,opts),/GitHub unavailable/);
  assert.equal((await handleIssue(1,opts)).status,'skeleton');
  assert.equal((await handleIssue(1,opts)).status,'skeleton');
  assert.equal(reads,1); assert.equal(patches,2);
  const draft=db.prepare('SELECT * FROM seed_admin_items').get();
  assert.equal(draft.state,'pending'); assert.equal(draft.published,0); assert.equal(draft.revision,1);
  assert.doesNotMatch(draft.body,/private user text|sig=/);
  issue.state='open';issue.body=body.replace('api.megulit.com','127.0.0.1');
  opts.close=()=>{issue.state='closed'; return issue;};
  const pending=await handleIssue(1,opts);
  assert.equal(pending.status,'backlog');assert.equal(reads,1);
  assert.doesNotMatch(fs.readFileSync(path.join(directory,pending.detail.at(-1)),'utf8'),/private user text|127\.0|sig=/);
  issue.labels.push({name:'diagnostics'});issue.state='open';
  assert.equal((await handleIssue(1,opts)).status,'unmatched');assert.equal(issue.state,'open');
  issue.labels.pop();issue.user.login='someone-else';
  assert.equal((await handleIssue(1,opts)).status,'unmatched');
});

test('recheck changes before close and keep unknown editions open',async t=>{
  const {handleIssue,openQueue,matchesVersion}=await import('../tools/github-issue-event.mjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'issue-request-')),db=openQueue(directory);
  t.after(()=>{db.close();fs.rmSync(directory,{recursive:true,force:true});});
  const exe='a'.repeat(64),script='b'.repeat(64),input=['v4','siglus','ja',exe,script].join('|');
  const selector=parseSelector(input);
  assert.equal(parseSelector(input.slice(0,-1)),null);
  const game={schema:'megulit.game-diff',layer:'game',status:'skeleton',prints:{vndb:'v4',script},engine:'siglus',builds:[exe],sourceLangs:['ja']};
  const version={schema:game.schema,layer:'version',key:exe,engine:'siglus',prints:{exe}};
  assert.ok(matchesVersion(selector,game,version));assert.ok(!matchesVersion({...selector,lang:'zh'},game,version));
  assert.ok(!matchesVersion({...selector,script:exe},game,version));
  const issue={number:2,html_url:'https://github.com/ilynthn/MeguLit/issues/2',user:{login:'ilynthn'},state:'open',labels:[{name:'game-request'}],
    title:'[软件想玩] '+input.slice(0,80),body:['**想玩的游戏**：'+input,'','联系方式：（未留）','界面语言：zh','','_来自 MeguLit 软件 v1.4.22，由 relay 自动创建_'].join('\n')};
  let reads=0;
  const options={db,directory,read:()=>++reads>1?{...issue,title:'[软件想玩] CLANNAD'}:issue,
    evidence:()=>({status:'skeleton',ref:'test'}),close:()=>assert.fail('changed request')};
  assert.equal((await handleIssue(2,options)).status,'source-changed');
  assert.equal(db.prepare('SELECT count(*) n FROM github_issue_receipts').get().n,0);
  assert.equal((await handleIssue(2,{...options,read:()=>issue,evidence:()=>null})).status,'no-exact-evidence');
});
