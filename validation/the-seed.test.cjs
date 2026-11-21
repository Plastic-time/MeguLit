// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner) The Seed/: the built-in game diffs, pure data. Every file of the folder: format (core/game-diff.cjs + the seed
// fields), value domains, prints, folder names, no path or user name; how the resolver uses each status; release and hot updates
// ship the folder.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Seed=require('../core/profiles/seed.cjs'),Profiles=require('../core/profiles/index.cjs'),GameDiff=require('../core/game-diff.cjs');
const root=path.join(__dirname,'..'),DIR=path.join(root,'The Seed');
const SENREN_EXE='fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3',FATA_EXE='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';

test('every file of The Seed passes: format, keys and values, prints, folder names, no private data',()=>{
 const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(path.relative(DIR,p).replace(/\\/g,'/'));}};walk(DIR);
 assert.ok(files.includes('README.md'));
 for(const f of files){if(f==='README.md')continue;
  const m=/^([a-z0-9]{2,40})\/([a-z0-9][a-z0-9-]{1,62})\/(game\.json|versions\/[0-9a-f]{64}\.json)$/.exec(f);assert.ok(m,'unexpected file '+f+' (The Seed/<engine>/<slug>/game.json or versions/<exe SHA-256>.json)');
  const text=fs.readFileSync(path.join(DIR,f),'utf8');assert.ok(Buffer.byteLength(text)<=16*1024,f+': a seed stays small');
  const doc=JSON.parse(text);const r=Seed.check(doc,m[3]==='game.json'?{engine:m[1],slug:m[2]}:{engine:m[1],file:path.basename(f)});assert.deepEqual(r.errors,[],f);}
 const all=Seed.load(DIR);assert.deepEqual(all.errors,[]);
 const slugs=all.games.map(g=>g.key);assert.equal(new Set(slugs).size,slugs.length,'a slug is unique across engines');
 for(const g of all.games)for(const b of g.match.exeSha256)assert.ok(all.versions.has(b),g.key+': build '+b.slice(0,8)+' has no version file');
});

test('check() refuses what a seed must not carry',()=>{
 const g={...GameDiff.build({key:'ab'.repeat(32),layer:'game',source:'official',mode:'hide',engine:'kirikiri',issuedAt:'',settings:{page:{holdMs:1}}}),status:'skeleton',slug:'some-game',builds:[]};
 assert.deepEqual(Seed.check(g,{engine:'kirikiri',slug:'some-game'}).errors,[]);
 for(const [bad,why] of [[{settings:{draw:{embed:true}}},'LAYER_KEYS'],[{settings:{page:{holdMs:-1}}},'SETTINGS'],[{prints:{exe:'a'.repeat(64)}},'exe prints'],[{exe:'C:\\Users\\me\\game.exe'},'path'],
  [{status:'great'},'status'],[{status:'read'},'mode read'],[{slug:'other-game'},'folder'],[{signature:{alg:'ed25519',keyId:'k',value:'x'}},'not signed'],[{sourceLangs:['japanese!']},'sourceLangs'],[{match:{exe:['a/b.exe']}},'match']])
  assert.ok(Seed.check({...g,...bad},{engine:'kirikiri',slug:'some-game'}).errors.some(e=>e.includes(why)),why+' '+JSON.stringify(Seed.check({...g,...bad},{engine:'kirikiri',slug:'some-game'}).errors));
 const v={...GameDiff.build({key:'cd'.repeat(32),source:'official',engine:'kirikiri',issuedAt:'',settings:{draw:{embed:true}}})};
 assert.deepEqual(Seed.check(v,{engine:'kirikiri',file:'cd'.repeat(32)+'.json'}).errors,[]);assert.ok(Seed.check(v,{file:'other.json'}).errors.length);
 assert.ok(Seed.check({...v,status:'verified'}).errors.some(e=>e.includes('belongs to game.json')));
});

test('status: verified / owner-ok / read are the official game layer (read in read mode), skeleton sits under this PC calibration',()=>{
 const s=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'});assert.equal(s.gameKey,'senren-banka');assert.equal(s.seedStatus,'verified');assert.equal(s.layers,'core+engine+seed-game');
 const v=Profiles.profileFor({exe:'D:/x/renamed.exe',exeSha256:SENREN_EXE});assert.equal(v.gameKey,'senren-banka');assert.equal(v.match,'exe');assert.equal(v.layers,'core+engine+seed-game+seed');
 const f=Profiles.profileFor({exe:'D:/x/x.exe',exeSha256:FATA_EXE});assert.equal(f.seedStatus,'read');assert.equal(f.hide.textEffectsRead,true);assert.equal(f.choice.dropEffectFrames,true,'the Fata fixes live in its seed');
 const sk=Seed.seeds().games.find(g=>g.status==='skeleton');assert.ok(sk,'there are skeleton seeds');
 const k=Profiles.profileFor({exe:'D:/x/x.exe',exeSha256:sk.match.exeSha256[0],auto:{page:{holdMs:4321}}});assert.equal(k.gameKey,sk.key);assert.match(k.layers,/\+seed-skeleton\+auto/);assert.equal(k.page.holdMs,4321);
 const newer=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',officialGame:{page:{holdMs:9}},officialGameRev:1});assert.equal(newer.layers,'core+engine+official-game','a downloaded official diff with a rev replaces the built-in seed');
 assert.deepEqual([...s.sourceLangs],['ja']);
});

test('release, hot package and hot install carry The Seed/',()=>{
 const rel=fs.readFileSync(path.join(root,'Release.ps1'),'utf8');
 assert.match(rel,/git ls-files --cached --others --exclude-standard core services web setup 'The Seed'\)/);assert.match(rel,/\^\(web\|services\|core\|setup\|The Seed\)\//);
 assert.match(fs.readFileSync(path.join(root,'services','hot-update.cjs'),'utf8'),/const ALLOWED=\/\^\(web\|services\|core\|setup\|The Seed\)\\\/\//);
 assert.equal(Seed.SEED_DIR,DIR,'MeguLit/core/profiles -> MeguLit/The Seed');
});
