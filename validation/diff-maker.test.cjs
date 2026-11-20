// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 tools/diff-maker: probe -> unsigned game diff draft + engine-draw line replacement data + replay fixture + report.
// The sample probes under validation/helpers/diff-maker/probes/ (KiriKiri: the owner's incr9 run of 千恋＊万花 and
// ファタモルガーナの館, trimmed; RPG Maker MZ: a made-up sample game reported as engine-draw records) must regenerate exactly
// the committed fixtures, and every generated probe fixture must replay green.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const Profiles=require('../core/profiles/index.cjs');
const Maker=require('../tools/diff-maker/index.cjs'),Probe=require('../tools/diff-maker/probe.cjs'),Roles=require('../tools/diff-maker/roles.cjs'),Scripts=require('../tools/diff-maker/scripts.cjs');
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
 const sum=Roles.summary([line,ui,ui,{...ui,id:'c:1'},bad]);
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
 const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'dm-'));fs.writeFileSync(path.join(tmp,'manifest.json'),JSON.stringify({exe:{name:'a.exe',hash:'0'.repeat(64)}}));
 assert.throws(()=>Probe.load(tmp),/full exe SHA-256/,'the head/tail probe-identity hash is not the exe key');fs.rmSync(tmp,{recursive:true,force:true});
});

for(const [name,key,mode] of SAMPLES){
 test('sample probe '+name+' regenerates the committed fixture ('+mode+')',()=>{
  const m=Maker.make(path.join(PROBES,name),{key});assert.equal(m.result.best.params.hideMethod,mode);
  const read=f=>JSON.parse(fs.readFileSync(path.join(FIX,m.key,m.name+f),'utf8'));const stale=' is stale: node tools/diff-maker/index.cjs '+path.relative(root,path.join(PROBES,name)).replace(/\\/g,'/')+(key?' --key '+key:'')+' --write-repo';
  assert.deepEqual(JSON.parse(JSON.stringify(m.diff)),read('.diff.json'),m.name+'.diff.json'+stale);
  assert.deepEqual(JSON.parse(JSON.stringify(m.replay)),read('.replay.json'),m.name+'.replay.json'+stale);
  assert.deepEqual(JSON.parse(JSON.stringify(m.fixtureLines)),read('.lines.json').lines,m.name+'.lines.json'+stale);
  assert.equal(m.diff.schema,'megulit.profile');assert.equal(m.diff.exeSha256,m.probe.exe.sha256);assert.ok(!('signature' in m.diff));
  assert.deepEqual(Object.keys(m.diff),['schema','format','exeSha256','gameKey','engine','settings','note']);
 });
}

test('samples: the live gate verdicts (Fata read, Senren hide), the engine-draw roles of the RPG Maker sample',()=>{
 const f=Maker.make(path.join(PROBES,'fata-morgana')),s=Maker.make(path.join(PROBES,'senren-banka')),r=Maker.make(path.join(PROBES,'rpgm-sample'),{key:'rpgm-sample'});
 assert.ok(f.result.hideBest.over.includes('dropRate'),'Fata: lines drawn nowhere');assert.equal(f.diff.settings.hide.textEffectsRead,true);
 assert.equal(s.result.best.pass,true);assert.equal(s.diff.settings.placement.drawWhileBlanking,true,'the hand-written game diff is carried into the draft');
 assert.ok(s.lines.length>0&&s.lines.every(l=>l.zh),'Senren: the aligned Chinese patch gives zh');assert.equal(f.lines.length,0,'Fata: the patch is not aligned (other line count), no zh');
 assert.ok(s.report.look.some(x=>/没有 engine-draw 记录/.test(x)),'old KiriKiri probes carry no roles: said in the report');
 const roles=Object.fromEntries(r.result.draw.roles.map(x=>[x.role,x]));
 assert.deepEqual(Object.keys(roles).sort(),['button','choice','line','menu','name','system']);
 assert.equal(roles.line.script.dialogue,roles.line.unique,'every line is script dialogue');assert.equal(roles.choice.script.choice,2,'the choices are the script\'s 102 choices');
 assert.equal(roles.menu.boxOnly,6,'shop list items reported as box only');assert.ok(r.result.draw.roles.every(x=>x.violations===0));
 assert.ok(!r.report.look.some(x=>/引擎差分可能把/.test(x)),'no role contradicts the script');
});

test('every generated probe fixture replays green',async()=>{let n=0;
 for(const key of fs.readdirSync(FIX)){const dir=path.join(FIX,key);for(const f of fs.readdirSync(dir).filter(f=>/^probe-[0-9a-f]{8}\.case\.cjs$/.test(f))){n++;
  await require(path.join(dir,f))({assert,root,fixture:dir,name:f,Profiles,profile:null});}}
 assert.ok(n>=3,'the three sample fixtures exist');
});
