// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The case behind every generated probe fixture (tools/diff-maker): load <name>.replay.json, apply the game diff it names over the
   kernel + engine layers, replay the recorded events with the keys that diff sets and check
     - the diff uses defaults.cjs keys only
     - the self-check verdict, the over list and every metric are what the maker recorded (deterministic)
     - the best hide candidate still fails the same way when the diff chose read mode (the read decision stays justified)
     - every recorded draw identity gets the recorded role (a change of an engine or game role rule shows up here) */
const fs=require('node:fs'),path=require('node:path');
const Profiles=require('../../core/profiles/index.cjs');
const Role=require('../../core/draw-role.cjs');
const Search=require('../../tools/diff-maker/search.cjs');
module.exports=async(ctx,file)=>{const {assert}=ctx;const root=ctx.root||path.join(__dirname,'..','..');
 const rep=JSON.parse(fs.readFileSync(path.join(ctx.fixture,file),'utf8'));
 const diff=JSON.parse(fs.readFileSync(path.join(root,rep.diff),'utf8'));
 assert.equal(diff.exeHash,rep.exeHash,file+': diff and replay are the same exe');
 assert.deepEqual(Profiles.unknownKeys(diff.settings),[],file+': diff keys must be in core/profiles/defaults.cjs');
 const profile=Profiles.apply(Profiles.profileFor({engine:rep.engine}),diff.settings,'diff');
 const t=Search.thresholdsOf(profile);
 const params=Search.paramsOf(diff.settings);assert.deepEqual(params,rep.expect.params,file+': the diff stands for the recorded candidate');
 const r=Search.evaluate(rep.events,params,t);
 assert.equal(r.pass,rep.expect.pass,file+': verdict '+JSON.stringify(r.over));assert.deepEqual(r.over,rep.expect.over);assert.deepEqual(r.metrics,rep.expect.metrics,file+': metrics');
 if(rep.expect.hideBest&&params.hideMethod==='read'){const h=Search.evaluate(rep.events,rep.expect.hideBest.params,t);assert.equal(h.pass,false,file+': a hide candidate passes now, the read mode is no longer needed');assert.deepEqual(h.over,rep.expect.hideBest.over);}
 for(const {label,id} of rep.identities)assert.equal(Role.classify(profile,id).role,rep.expect.roles[label],file+': role of '+label);
};
