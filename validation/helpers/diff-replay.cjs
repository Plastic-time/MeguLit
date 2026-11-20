// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The case behind every generated probe fixture (tools/diff-maker): <name>.replay.json + <name>.diff.json + <name>.lines.json.
   It applies the diff over the kernel + engine layers, replays the recorded events with the keys that diff sets and checks
     - the diff is an unsigned megulit.profile draft for the same exe and uses defaults.cjs keys only
     - the self-check verdict, the over list and every metric are what the maker recorded (deterministic)
     - the best hide candidate still fails the same way when the diff chose read mode (the read decision stays justified)
     - the raw engine-draw records (ToMe_CHARS role/id/box/sel/emb) parse to the recorded roles, counts and protocol checks
     - every line replacement {k, ruby, zh} is well formed (k without white space, ruby ranges inside k) */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs');
const Search=require('../../tools/diff-maker/search.cjs'),Roles=require('../../tools/diff-maker/roles.cjs');
module.exports=async(ctx,name)=>{const {assert}=ctx;const read=f=>JSON.parse(fs.readFileSync(path.join(ctx.fixture,f),'utf8'));
 const rep=read(name+'.replay.json'),diff=read(rep.diff),lines=read(rep.lines);
 assert.equal(diff.schema,'megulit.profile');assert.equal(diff.format,1);assert.ok(!('signature' in diff),'a draft is unsigned');
 assert.equal(diff.exeSha256,rep.exeSha256,name+': diff and replay are the same exe');assert.match(diff.exeSha256,/^[0-9a-f]{64}$/);
 assert.deepEqual(Profiles.unknownKeys(diff.settings),[],name+': diff keys must be in core/profiles/defaults.cjs');
 const profile=Profiles.apply(Profiles.profileFor({engine:rep.engine}),diff.settings,'diff');
 const t=Search.thresholdsOf(profile);
 const params=Search.paramsOf(diff.settings);assert.deepEqual(params,rep.expect.params,name+': the diff stands for the recorded candidate');
 const r=Search.evaluate(rep.events,params,t);
 assert.equal(r.pass,rep.expect.pass,name+': verdict '+JSON.stringify(r.over));assert.deepEqual(r.over,rep.expect.over);assert.deepEqual(r.metrics,rep.expect.metrics,name+': metrics');
 if(rep.expect.hideBest&&params.hideMethod==='read'){const h=Search.evaluate(rep.events,rep.expect.hideBest.params,t);assert.equal(h.pass,false,name+': a hide candidate passes now, the read mode is no longer needed');assert.deepEqual(h.over,rep.expect.hideBest.over);}
 const records=rep.records.map(x=>{const rec=Roles.record(x.raw);assert.ok(rec,name+': engine-draw record no longer parses: '+x.raw.slice(0,80));return rec;});
 const sum=Roles.summary(records);
 assert.deepEqual(sum.roles.map(r=>({role:r.role,kind:r.kind,records:r.records,unique:r.unique,emb:r.emb,hidden:r.hidden,boxOnly:r.boxOnly,violations:r.violations})),rep.expect.draw,name+': draw roles');
 assert.equal(sum.items.length,rep.expect.items,name+': UI items after (role, id, text) dedup');
 assert.equal(lines.exeSha256,rep.exeSha256);
 for(const l of lines.lines){assert.ok(l.k&&!/\s/.test(l.k),'k without white space: '+l.k);const n=[...l.k].length;
  for(const [s,len,yomi] of l.ruby)assert.ok(Number.isInteger(s)&&len>0&&s+len<=n&&typeof yomi==='string'&&yomi,'ruby '+JSON.stringify([s,len,yomi])+' inside '+l.k);
  assert.equal(typeof l.zh,'string');}
};
