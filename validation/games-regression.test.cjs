// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner: 「每个游戏都不要互相影响」) per-game regression of the layered profile (core/profiles).
// Every game file core/profiles/games/<gameKey>.cjs has a fixture folder validation/fixtures/games/<gameKey>/ with
//   identity.json   {"same":[profileFor inputs that are this game], "other":[inputs that must not be]}
//   *.case.cjs      module.exports=async ctx=>{...}  replays of this game (ctx: profile, Profiles, HookNative, assert, root, fixture)
// Which games run: MEGULIT_GAMES=key1,key2 (or 'all'); otherwise from git: when every changed file (working tree + commits
// since main) is a game file or a game's fixtures, only those games run; a change anywhere else (kernel, engine file) or no
// change runs every game.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),FIX=path.join(__dirname,'fixtures','games');
const Profiles=require('../core/profiles/index.cjs');
const all=Profiles.games().map(g=>g.key);

function changedFiles(){const run=args=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:8000}).split(/\r?\n/).filter(Boolean);}catch{return null;}};
 const st=run(['status','--porcelain']);if(st===null)return null;const out=st.map(l=>l.slice(3).replace(/^.* -> /,'').replace(/^"|"$/g,''));
 const base=run(['merge-base','HEAD','main']);if(base&&base[0]){const head=run(['rev-parse','HEAD']);if(head&&head[0]!==base[0])out.push(...(run(['diff','--name-only',base[0]+'..HEAD'])||[]));}return out;}
function selected(){const env=String(process.env.MEGULIT_GAMES||'').trim();if(env&&env!=='all')return env.split(/[,\s]+/).filter(k=>all.includes(k));if(env==='all')return all;
 const files=changedFiles();if(!files||!files.length)return all;const keys=new Set();
 for(const f of files.map(x=>x.replace(/\\/g,'/'))){let m=/^core\/profiles\/games\/([a-z0-9-]+)\.cjs$/.exec(f)||/^validation\/fixtures\/games\/([a-z0-9-]+)\//.exec(f);if(m){keys.add(m[1]);continue;}
  if(f==='validation/games-regression.test.cjs')continue;return all;}
 return [...keys].filter(k=>all.includes(k));}
const run=selected();

test('profile layers: kernel defaults <- engine diff <- game diff, frozen',()=>{
 const p=Profiles.profileFor({});assert.equal(p.layers,'core');assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.placement)&&Object.isFrozen(p.choice.filters));
 assert.deepEqual({...p.placement},Profiles.DEFAULTS.placement);
 assert.match(Profiles.traceLine(Profiles.profileFor({exe:'C:/g/Unknown.exe',title:'x'})),/^profile auto-[0-9a-f]{10} engine=unknown layers=core$/);
 assert.equal(Profiles.engineId('BGI / Ethornell'),'bgi');assert.equal(Profiles.engineId('KiriKiri'),'kirikiri');assert.equal(Profiles.engineId('System4 (AliceSoft)'),'system4');
 assert.equal(Profiles.get(p,'placement.firstLineAnchor','auto'),'auto');assert.equal(Profiles.get(p,'no.such.key',5),5);
});

test('every engine and game file uses kernel keys only, every game has fixtures',()=>{
 for(const f of fs.readdirSync(Profiles.ENGINE_DIR).filter(f=>f.endsWith('.cjs'))){const e=require(path.join(Profiles.ENGINE_DIR,f));
  assert.equal(e.engine,f.slice(0,-4),f+': engine id = file name');assert.deepEqual(Profiles.unknownKeys(e.settings),[],f+': keys not in core/profiles/defaults.cjs');}
 for(const g of Profiles.games()){assert.match(g.key,/^[a-z0-9][a-z0-9-]{1,62}$/);assert.ok(!g.key.startsWith('auto-'),g.key+': auto- is reserved');
  assert.deepEqual(Profiles.unknownKeys(g.settings),[],g.key+': keys not in core/profiles/defaults.cjs');
  const eng=Profiles.engineId(g.engine);if(eng)assert.ok(fs.existsSync(path.join(Profiles.ENGINE_DIR,eng+'.cjs')),g.key+': engine file '+eng+'.cjs missing');
  assert.ok(fs.existsSync(path.join(FIX,g.key,'identity.json')),g.key+': validation/fixtures/games/'+g.key+'/identity.json missing');}
});

test('the kernel never branches on a program name (the game diff does)',()=>{
 const bad=/\b(?:exe|exeName|processName|gameProcess|program)\b\s*(?:===?|!==?)\s*['"][^'"]+\.exe['"]/i,hits=[];
 const scan=dir=>{for(const f of fs.readdirSync(path.join(root,dir))){const rel=dir+'/'+f;if(/\.(c?js)$/.test(f)&&!rel.startsWith('core/profiles/')){const s=fs.readFileSync(path.join(root,rel),'utf8');if(bad.test(s))hits.push(rel);}}};
 for(const d of ['core','web/reader/modules','services'])scan(d);
 assert.deepEqual(hits,[],'move the branch into core/profiles/games/<gameKey>.cjs and read a profile key');
});

for(const key of all){
 test('game '+key+(run.includes(key)?'':' (skipped: not touched)'),{skip:!run.includes(key)},async()=>{
  const dir=path.join(FIX,key),id=JSON.parse(fs.readFileSync(path.join(dir,'identity.json'),'utf8'));
  for(const input of id.same||[]){const p=Profiles.profileFor(input);assert.equal(p.gameKey,key,'should be '+key+': '+JSON.stringify(input));assert.match(p.layers,/\+game$/);}
  for(const input of id.other||[])assert.notEqual(Profiles.profileFor(input).gameKey,key,'should not be '+key+': '+JSON.stringify(input));
  /* isolation: no other game's copies resolve to this game */
  for(const other of all.filter(k=>k!==key)){const f=path.join(FIX,other,'identity.json');if(!fs.existsSync(f))continue;for(const input of JSON.parse(fs.readFileSync(f,'utf8')).same||[])assert.notEqual(Profiles.profileFor(input).gameKey,key,other+' copy resolved to '+key);}
  const profile=Profiles.profileFor(id.same?.[0]||{});
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.case.cjs')).sort()){const c=require(path.join(dir,f));
   await c({profile,Profiles,HookNative:require('../core/hook-native.cjs').HookNative,assert,root,fixture:dir,name:f});}
 });
}
