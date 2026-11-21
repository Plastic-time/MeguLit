// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 tools/diff-maker: probe (folder or .mlfp) -> unsigned version-layer draft (exe SHA-256) + game-layer draft and
// engine-draw line replacement data (game identity) + replay fixture + report.
// The sample probes under validation/helpers/diff-maker/probes/ (KiriKiri: the owner's incr9 run of 千恋＊万花 and
// ファタモルガーナの館, trimmed; RPG Maker MZ: a made-up sample game reported as engine-draw records) must regenerate exactly
// the committed fixtures, and every generated probe fixture must replay green.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const Profiles=require('../core/profiles/index.cjs'),GameDiff=require('../core/game-diff.cjs'),Domains=require('../core/profiles/domains.cjs'),zlib=require('node:zlib'),crypto=require('node:crypto'),os=require('node:os');
const Emit=require('../tools/diff-maker/emit.cjs'),Maker=require('../tools/diff-maker/index.cjs'),Probe=require('../tools/diff-maker/probe.cjs'),Roles=require('../tools/diff-maker/roles.cjs'),Scripts=require('../tools/diff-maker/scripts.cjs');
const PROBES=path.join(__dirname,'helpers','diff-maker','probes'),FIX=path.join(__dirname,'fixtures','games');
const SAMPLES=[['senren-banka','','hide'],['fata-morgana','','read'],['rpgm-sample','rpgm-sample','hide']];
const REC='ToMe_CHARS engine=rpgm line=1 hidden=0 sw=816 sh=624 vx=0 vy=0 vw=0 vh=0 n=';

test('engine-draw records: role / id / box / sel / emb, UI items deduplicated by (role, id, text), protocol breaks counted',()=>{
 const line=Roles.record('2026-11-21T10:00:00Z '+REC+'2 rects=1,2,3,4;5,6,7,8 emb=1 text=はい');
 assert.equal(Roles.roleOf(line),'line');assert.equal(Roles.kindOf(line),'dialogue');assert.equal(line.emb,1);
 const ui=Roles.record(REC+'0 rects= role=choice id=c:0 box=10,20,200,36 sel=1 text=はい');
 assert.equal(ui.role,'choice');assert.deepEqual(ui.box,[10,20,200,36]);assert.equal(ui.sel,true);assert.equal(Roles.kindOf(ui),'ui');
 assert.equal(Roles.record(REC+'0 rects= role=line text=はい'),null,'a line needs its rects');
 assert.equal(Roles.record(REC+'0 rects= role=weird box=1,1,1,1 text=x'),null);
 assert.equal(Roles.kindOf({role:'name'}),'system');assert.equal(Roles.kindOf({role:'menu'}),'ui');assert.equal(Roles.kindOf({role:'button'}),'ui');
 const bad=Roles.record(REC.replace('hidden=0','hidden=1')+'0 rects= role=menu id=m box=1,1,1,1 emb=2 text=x');assert.deepEqual(Roles.violations(bad),['hidden','emb=2']);
 const clear=Roles.record(REC+'0 rects= role=choice id=L0: box=0,0,0,0 text=');assert.ok(clear&&Roles.clearGroup(clear),'an empty snapshot clears a group');
 const sum=Roles.summary([line,ui,ui,{...ui,id:'c:1'},bad,clear]);
 assert.deepEqual(sum.roles.map(r=>[r.role,r.records,r.unique,r.violations]),[['choice',3,2,0],['line',1,1,0],['menu',1,1,1]]);assert.equal(sum.items.length,3);
});

test('line replacement data: k without white space, game ruby as [start, len, reading] over k, aligned patch zh',()=>{
 assert.deepEqual(Scripts.rubyRanges('「志那都荘まで」',[['志那都','しなつ']]),[[1,3,'しなつ']]);
 assert.deepEqual(Scripts.rubyRanges('𠮟る犬と犬',[['犬','いぬ'],['犬','いぬ'],['猫','ねこ']]),[[2,1,'いぬ'],[4,1,'いぬ']],'code points, left to right, unknown base skipped');
 assert.deepEqual(Scripts.replacements([{line:'あ い',ruby:null,zh:'啊'},{line:'あい',ruby:null,zh:'重复'},{line:'う',ruby:null,zh:''}]),[{k:'あい',ruby:[],zh:'啊'}]);
});

test('engine detection: manifest, then engine-draw records / hooks, then files; the exe key is the full SHA-256',()=>{
 const none={hookEvents:'',extra:''};
 assert.equal(Probe.detectEngine({detected:'KiriKiri Z'},none,[]).engine,'kirikiri');
 assert.equal(Probe.detectEngine({},{hookEvents:'2026-11-21T10:00:00Z '+REC+'0 rects= text=',extra:''},[]).engine,'rpgmaker');
 assert.equal(Probe.detectEngine({},{hookEvents:'2026-11-20T22:51:55.204Z krkr page: hook line drawn nowhere',extra:''},[]).engine,'kirikiri');
 assert.equal(Probe.detectEngine({},none,[{path:'www/js/rpg_core.js'}]).engine,'rpgmaker');assert.equal(Probe.detectEngine({},none,['data.xp3']).engine,'kirikiri');
 assert.equal(Profiles.engineId('RPG Maker MZ'),'rpgmaker');assert.equal(Profiles.engineId('rpgm'),'rpgmaker');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dm-'));fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify({exe:{name:'a.exe',hash:'0'.repeat(64)}}));
 assert.throws(()=>Probe.load(tmp),/full exe SHA-256/,'the head/tail probe-identity hash is not the exe key');
 fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify({exe:'sub/a.exe',files:[{path:'sub/a.exe',sha256:'a'.repeat(64)},{path:'sub/a_cn.exe',sha256:'b'.repeat(64)},{path:'scn.xp3',size:5,sha256:'c'.repeat(64)},{path:'bg.xp3',size:9,sha256:'d'.repeat(64)}]}));
 const p=Probe.load(tmp);assert.equal(p.exe.sha256,'a'.repeat(64),'probe-full: the files[] entry of the exe');assert.deepEqual(p.versions.map(v=>[v.exe,v.probed]),[['a.exe',true],['a_cn.exe',false]]);
 assert.equal(p.game.archive.path,'scn.xp3','the script archive wins over a bigger image archive');fs.rmSync(tmp,{recursive:true,force:true});
});

for(const [name,key,mode] of SAMPLES){
 test('sample probe '+name+' regenerates the committed fixture ('+mode+')',()=>{
  const m=Maker.make(path.join(PROBES,name),{key});assert.equal(m.result.best.params.hideMethod,mode);
  const read=f=>JSON.parse(fs.readFileSync(path.join(FIX,m.key,m.name+f),'utf8'));const stale=' is stale: node tools/diff-maker/index.cjs '+path.relative(root,path.join(PROBES,name)).replace(/\\/g,'/')+(key?' --key '+key:'')+' --write-repo';
  assert.deepEqual(JSON.parse(JSON.stringify(m.diffs.version)),read('.version.json'),m.name+'.version.json'+stale);
  assert.deepEqual(JSON.parse(JSON.stringify(m.diffs.game)),read('.game.json'),m.name+'.game.json'+stale);
  assert.deepEqual(JSON.parse(JSON.stringify(m.replay)),read('.replay.json'),m.name+'.replay.json'+stale);
  assert.deepEqual(JSON.parse(JSON.stringify(m.fixtureLines)),read('.lines.json').lines,m.name+'.lines.json'+stale);
  assert.deepEqual(GameDiff.validate(m.diffs.version),{ok:true});assert.equal(m.diffs.version.key,m.probe.exe.sha256);assert.equal(m.diffs.version.layer,'version');assert.deepEqual(GameDiff.validate(m.diffs.game),{ok:true});assert.equal(m.diffs.game.layer,'game');assert.ok(!('signature' in m.diffs.version));
  assert.equal(m.diffs.version.mode,undefined,'the version layer leaves the mode to the game layer');assert.deepEqual(Object.keys(m.diffs.version.settings),[],'the samples measure game keys only');
  assert.equal(m.diffs.game.mode,mode);assert.ok(m.diffs.game.prints.script,'script print');assert.ok(m.diffs.game.prints.title,'title print');assert.equal(m.diffs.game.key,Probe.gameId(m.probe.prints),'game key = relay gidFor of the prints');
 });
}

test('samples: the live gate verdicts (Fata read, Senren hide), the engine-draw roles of the RPG Maker sample',()=>{
 const f=Maker.make(path.join(PROBES,'fata-morgana')),s=Maker.make(path.join(PROBES,'senren-banka')),r=Maker.make(path.join(PROBES,'rpgm-sample'),{key:'rpgm-sample'});
 assert.ok(f.result.hideBest.over.includes('dropRate'),'Fata: lines drawn nowhere');assert.equal(f.diffs.game.settings.hide.textEffectsRead,true);
 assert.deepEqual(f.diffs.covers.map(c=>c.exe),['fata_jp.exe','fata_cn.exe','fata_en.exe'],'Fata: the language builds of the folder share the game layer');
 assert.equal(s.result.best.pass,true);assert.equal(s.diffs.game.settings.placement.drawWhileBlanking,true,'the hand-written game diff is carried into the game layer');
 assert.equal(s.diffs.game.prints.steam,'1144400');assert.equal(s.probe.game.archive.path,'scn.xp3');
 assert.ok(s.lines.length>0&&s.lines.every(l=>l.zh),'Senren: the aligned Chinese patch gives zh');assert.equal(f.lines.length,0,'Fata: the patch is not aligned (other line count), no zh');
 assert.ok(s.report.look.some(x=>/没有 engine-draw 记录/.test(x)),'old KiriKiri probes carry no roles: said in the report');
 const roles=Object.fromEntries(r.result.draw.roles.map(x=>[x.role,x]));
 assert.deepEqual(Object.keys(roles).sort(),['button','choice','line','menu','name','system']);
 assert.equal(roles.line.script.dialogue,roles.line.unique,'every line is script dialogue');assert.equal(roles.choice.script.choice,2,'the choices are the script\'s 102 choices');
 assert.equal(roles.menu.boxOnly,6,'shop list items reported as box only');assert.ok(r.result.draw.roles.every(x=>x.violations===0));
 assert.ok(!r.report.look.some(x=>/引擎差分可能把/.test(x)),'no role contradicts the script');
});

test('layers: the version document keeps version-layer keys, the game document the rest; suspicious measurements stay out',()=>{
 const all={hide:{engineTrial:{enabled:true},textEffectsRead:false},placement:{drawWhileBlanking:true}};
 const d=Emit.docs({prints:{exe:'a'.repeat(64),steam:'1'},exeSha:'a'.repeat(64),exeName:'x.exe',engine:'kirikiri',mode:'hide',settings:all,gid:'b'.repeat(64)});
 assert.deepEqual(d.version.settings,{hide:{engineTrial:{enabled:true}}});assert.deepEqual(d.game.settings,{hide:{textEffectsRead:false},placement:{drawWhileBlanking:true}});
 assert.equal(d.version.mode,undefined);assert.deepEqual(d.version.prints,{exe:'a'.repeat(64)});assert.deepEqual(d.game.prints,{steam:'1'});
 assert.equal(Domains.layerOf('hide.engineTrial.enabled'),'version');
 const top=Emit.suspect({calibrate:{textBox:{x:70,y:20,w:322,h:538,client:[1280,720]}}});assert.equal(top.length,1);assert.match(top[0].why,/贴顶/);assert.match(top[0].why,/45%/);
 assert.match(Emit.suspect({calibrate:{textBox:{x:374,y:707,w:31,h:31,client:[1535,863]}}})[0].why,/一个字框/);assert.deepEqual(Emit.suspect({calibrate:{textBox:{x:220,y:488,w:185,h:250,client:[1535,863]}}}),[],'line starts are a narrow column: fine');
 assert.deepEqual(Emit.suspect({calibrate:{textBox:{x:70,y:488,w:700,h:90,client:[804,604]}}}),[]);
 assert.deepEqual(Emit.withoutSuspect({calibrate:{textBox:{x:1},hideMethod:'hide'}},[{key:'calibrate.textBox'}]),{calibrate:{hideMethod:'hide'}});
});

test('a .mlfp probe with runtime items, and a relay runtime bundle',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dm-mlfp-'));const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const work=path.join(tmp,'unpacked');process.env.MEGULIT_DIFF_WORK=work;
 const src=path.join(PROBES,'rpgm-sample');const man=JSON.parse(fs.readFileSync(path.join(src,'manifest.json'),'utf8'));
 const raw=[['runtime','runtime/hook-events.log'],['runtime','runtime/reader-host.log'],['script','data/Map001.json'],['script','data/System.json'],['script','data/CommonEvents.json'],['script','data/Items.json']].map(([kind,p])=>({kind,path:p,b:fs.readFileSync(path.join(src,kind==='runtime'?p:'scripts/'+p))}));
 let off=0;const blobs=[];const items=raw.map(r=>{const z=zlib.gzipSync(r.b);blobs.push(z);const it={kind:r.kind,path:r.path,size:r.b.length,sha256:sha(r.b),offset:off,packed:z.length};off+=z.length;return it;});
 const {exe,...rest}=man;const mz=zlib.gzipSync(Buffer.from(JSON.stringify({...rest,schema:'megulit.probe-full',version:1,exe:'Game.exe',versions:{},items}))),head=Buffer.alloc(12);head.write('MLFP',0,'latin1');head.writeUInt32LE(1,4);head.writeUInt32LE(mz.length,8);
 const file=path.join(tmp,'sample.mlfp');fs.writeFileSync(file,Buffer.concat([head,mz,...blobs]));
 try{
  const m=Maker.make(file,{key:'rpgm-sample'}),ref=Maker.make(src,{key:'rpgm-sample'});
  assert.equal(m.probe.exe.sha256,ref.probe.exe.sha256,'exe SHA-256 from the files[] entry');assert.deepEqual(m.result.best.metrics,ref.result.best.metrics,'same replay from the .mlfp');assert.equal(m.rep.records.length,ref.rep.records.length);
  assert.equal(m.probe.game.script,ref.probe.game.script,'same script fingerprint');
  const bare=path.join(tmp,'bare');fs.mkdirSync(bare);fs.writeFileSync(path.join(bare,'manifest.json'),JSON.stringify(man));
  const files=['hook-events.log','reader-host.log'].map(name=>{const b=fs.readFileSync(path.join(src,'runtime',name));return {name,kind:'runtime',sha256:sha(b),data:b.toString('base64')};});
  const bundle=path.join(tmp,'rt.json.gz');fs.writeFileSync(bundle,zlib.gzipSync(JSON.stringify({schema:'megulit.runtime-bundle',version:1,key:man.exe.sha256,files})));
  const b=Maker.make(bare,{key:'rpgm-sample',runtime:bundle});assert.deepEqual(b.result.best.metrics,ref.result.best.metrics,'same replay from the runtime bundle');
 }finally{delete process.env.MEGULIT_DIFF_WORK;fs.rmSync(tmp,{recursive:true,force:true});}
});

test('every generated probe fixture replays green',async()=>{let n=0;
 for(const key of fs.readdirSync(FIX)){const dir=path.join(FIX,key);for(const f of fs.readdirSync(dir).filter(f=>/^probe-[0-9a-f]{8}\.case\.cjs$/.test(f))){n++;
  await require(path.join(dir,f))({assert,root,fixture:dir,name:f,Profiles,profile:null});}}
 assert.ok(n>=3,'the three sample fixtures exist');
});
