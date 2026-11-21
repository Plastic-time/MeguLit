// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner) The Seed/: the built-in game diffs, pure data. Every file of the folder: format, value domains, prints,
// no path or user name; the resolver takes them at the official level; release and hot updates ship the folder.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Seed=require('../core/profiles/seed.cjs'),Profiles=require('../core/profiles/index.cjs');
const root=path.join(__dirname,'..'),DIR=path.join(root,'The Seed');

test('every file of The Seed passes: format, keys and values, prints, folder names, no private data',()=>{
 const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(path.relative(DIR,p).replace(/\\/g,'/'));}};walk(DIR);
 assert.ok(files.includes('README.md'));
 for(const f of files){if(f==='README.md')continue;
  const m=/^([a-z0-9]{2,40})\/([a-z0-9][a-z0-9-]{1,62})\/(game\.json|versions\/[0-9a-f]{64}\.json)$/.exec(f);assert.ok(m,'unexpected file '+f+' (The Seed/<engine>/<gameId>/game.json or versions/<exe SHA-256>.json)');
  const text=fs.readFileSync(path.join(DIR,f),'utf8');assert.ok(Buffer.byteLength(text)<=16*1024,f+': a seed stays small');
  const doc=JSON.parse(text);const r=Seed.check(doc,m[3]==='game.json'?{engine:m[1],id:m[2]}:{file:path.basename(f)});assert.deepEqual(r.errors,[],f);
  if(m[3]==='game.json')assert.ok(fs.existsSync(path.join(root,'core','profiles','engines',m[1]+'.cjs'))||m[1]==='unknown',f+': no engine diff core/profiles/engines/'+m[1]+'.cjs');}
 const all=Seed.load(DIR);assert.deepEqual(all.errors,[]);
 const ids=all.games.map(g=>g.key);assert.equal(new Set(ids).size,ids.length,'a gameId is unique across engines');
});

test('check() refuses what a seed must not carry',()=>{
 const g={schema:'megulit.seed',version:1,layer:'game',id:'some-game',engine:'kirikiri',title:{ja:'ゲーム'},rev:1,settings:{}};
 assert.deepEqual(Seed.check(g,{engine:'kirikiri',id:'some-game'}).errors,[]);
 for(const [bad,why] of [[{settings:{draw:{embed:true}}},'game keys only'],[{settings:{page:{holdMs:-1}}},'settings'],[{prints:{exe:'a'.repeat(64)}},'exe prints'],[{note:'C:\\Users\\me\\game'},'path'],[{note:'mail me@example.com'},'address'],[{rev:0},'rev'],[{code:'x'},'unknown field'],[{mode:'read'},'textEffectsRead']])
  assert.ok(Seed.check({...g,...bad},{engine:'kirikiri',id:'some-game'}).errors.some(e=>e.includes(why)),why);
 const v={schema:'megulit.seed',version:1,layer:'version',key:'ab'.repeat(32),rev:1,settings:{draw:{embed:true},page:{holdMs:3}}};
 assert.deepEqual(Seed.check(v,{file:'ab'.repeat(32)+'.json'}).errors,[]);assert.ok(Seed.check(v,{file:'other.json'}).errors.length);
 assert.ok(Seed.check({...v,prints:{steam:'1'}}).errors.some(e=>e.includes('own exe prints')));
});

test('seeds are official-level: the game seed by name/title/prints, the version seed by the exe hash; a newer download wins',()=>{
 const s=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'});assert.equal(s.gameKey,'senren-banka');assert.equal(s.layers,'core+engine+seed-game');assert.equal(s.placement.drawWhileBlanking,true);
 const v=Profiles.profileFor({exe:'D:/x/renamed.exe',exeSha256:'fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3'});assert.equal(v.gameKey,'senren-banka');assert.equal(v.match,'exe');assert.equal(v.layers,'core+engine+seed-game+seed');
 const older=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',officialGame:{page:{holdMs:9}},officialGameRev:1});assert.equal(older.layers,'core+engine+seed-game','a download of the same rev does not replace the seed');
 const newer=Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',officialGame:{page:{holdMs:9}},officialGameRev:2});assert.equal(newer.layers,'core+engine+official-game');assert.equal(newer.page.holdMs,9);
 const byPrint=Profiles.profileFor({exe:'D:/x/x.exe',prints:{steam:'303310'},steamAppId:'303310'});assert.equal(byPrint.gameKey,'fata-morgana');
});

test('release, hot package and hot install carry The Seed/',()=>{
 const rel=fs.readFileSync(path.join(root,'Release.ps1'),'utf8');
 assert.match(rel,/git ls-files --cached --others --exclude-standard core services web setup 'The Seed'\)/);assert.match(rel,/\^\(web\|services\|core\|setup\|The Seed\)\//);
 assert.match(fs.readFileSync(path.join(root,'services','hot-update.cjs'),'utf8'),/const ALLOWED=\/\^\(web\|services\|core\|setup\|The Seed\)\\\/\//);
 assert.equal(Seed.SEED_DIR,DIR,'MeguLit/core/profiles -> MeguLit/The Seed');
});
