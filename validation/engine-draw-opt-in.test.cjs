// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* rc/1.4.23-engines: every engine-draw hook is off by default and goes on only when the game's seed asks for it
   (draw.roles -> MeguLit's control file %TEMP%\MeguLit\draw\<pid>.txt says roles=1). Pinned on both sides:
   - native: in each engine-draw runtime (GDI draw sites, YU-RIS, SiglusEngine, MAGES, CatSystem2, BGI) MinHook is only created /
     enabled inside Install() (or a helper only Install() calls), Install() is only called right behind the roles=1 check,
     and Arm() (run at engine detection in every game) never hooks;
   - kernel: the default profile has draw.roles / draw.embed off, its control text says roles=0, an EngineDraw with nothing
     on writes no control file at all;
   - seeds: no game's seed turns draw.roles / draw.embed on except the ones listed here (none yet: the owner turns them on
     per game after a live check). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),hook=path.join(root,'native','megulithook');
const RUNTIMES=['DrawSites.h','YurisDraw.h','SiglusDraw.h','MagesDraw.h','CS2Draw.h','BgiDraw.h','MajiroDraw.h'];
const SEEDS_ON=[]; /* seed folders (engine/game) allowed to turn draw.roles or draw.embed on */

const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,m=>m.replace(/[^\n]/g,' ')).replace(/\/\/[^\n]*/g,m=>' '.repeat(m.length)).replace(/"(?:[^"\\\n]|\\.)*"/g,m=>'"'+' '.repeat(m.length-2)+'"');
/* function bodies: name -> [start, end] of the outermost brace block after `name(...) {` */
function bodies(src){
 const out=[],re=/\b([A-Za-z_]\w*)\s*\([^;{}()]*(?:\([^()]*\)[^;{}()]*)*\)\s*(?:noexcept\s*)?\{/g;let m;
 while((m=re.exec(src))){if(['if','for','while','switch','catch','__except','__try','sizeof','return'].includes(m[1]))continue;
  let depth=0,i=m.index+m[0].length-1;for(;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&--depth===0)break;}
  out.push({name:m[1],start:m.index,end:i});}
 return out;
}
const inner=(fns,at)=>fns.filter(f=>at>f.start&&at<f.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];

for(const file of RUNTIMES){
 test('native '+file+': hooks only in Install(), Install() only behind roles=1, Arm() never hooks',()=>{
  const raw=fs.readFileSync(path.join(hook,file),'utf8'),src=strip(raw),fns=bodies(src);
  assert.ok(/roles=1/.test(raw),'reads roles=1 from the control file');
  const install=fns.filter(f=>f.name==='Install');assert.ok(install.length>=1,'has Install()');
  const inInstall=at=>install.some(f=>at>f.start&&at<f.end);
  /* every MinHook create / enable: inside Install(), or inside a helper whose every call is inside Install() */
  for(const m of src.matchAll(/\bMH_(?:CreateHook|EnableHook)\s*\(/g)){
   if(inInstall(m.index))continue;
   const f=inner(fns,m.index);assert.ok(f,'MinHook call outside any function at '+m.index);
   const calls=[...src.matchAll(new RegExp('\\b'+f.name+'\\s*\\(','g'))].filter(c=>!(c.index>=f.start&&c.index<f.start+f.name.length+1)&&!fns.some(g=>g.name===f.name&&g.start===c.index));
   assert.ok(calls.length>0&&calls.every(c=>inInstall(c.index)),file+': '+f.name+'() hooks and is called from outside Install()');
  }
  /* every call of Install(): on a line (statement) that checks roles */
  for(const m of src.matchAll(/\bInstall\s*\(\s*\)/g)){
   if(install.some(f=>f.start===m.index))continue;
   const lineStart=src.lastIndexOf('\n',m.index)+1,lineEnd=src.indexOf('\n',m.index),line=raw.slice(lineStart,lineEnd);
   assert.ok(/RolesAsked\s*\(\s*\)|ReadControl\s*\(\s*\)\s*&&|&&\s*roles\b|\broles\s*\)/.test(line),file+': Install() called without the roles=1 check: '+line.trim());
   /* ReadControl() as the guard (BGI): it must return the roles=1 flag of the #cfg line */
   if(/ReadControl\s*\(\s*\)\s*&&/.test(line)){const rc=fns.find(f=>f.name==='ReadControl');assert.ok(rc,file+': ReadControl()');const body=raw.slice(rc.start,rc.end);
    assert.ok(/roles\s*=[^;]*roles=1/.test(body)&&/return\s+roles\s*;/.test(body),file+': ReadControl() returns the roles=1 flag');}
  }
  for(const f of fns.filter(f=>f.name==='Arm'))assert.ok(!/\bMH_(?:CreateHook|EnableHook)\b|\bInstall\s*\(/.test(src.slice(f.start,f.end)),file+': Arm() hooks by itself');
 });
}

/* Unity IL2CPP (Il2cppDraw.h): it adds no hook of its own, LunaHook's Unity engine hands it the text setters it already
   observes; Observe() does nothing until Ready, Ready is only set in Build(), Build() is only reached through SafeBuild(),
   and SafeBuild() only behind RolesAsked() */
test('native Il2cppDraw.h: nothing observed until the control file says roles=1',()=>{
 const raw=fs.readFileSync(path.join(hook,'Il2cppDraw.h'),'utf8'),src=strip(raw),fns=bodies(src);
 assert.ok(/roles=1/.test(raw)&&!/\bMH_(?:CreateHook|EnableHook)\b/.test(src),'reads roles=1, creates no hook');
 const obs=fns.find(f=>f.name==='Observe');assert.ok(obs);assert.match(src.slice(obs.start,obs.end),/\{\s*if\s*\(\s*!Ready\b[^)]*\)\s*return\s*;/,'Observe() returns at once unless Ready');
 const sets=[...src.matchAll(/InterlockedExchange\s*\(\s*&Ready\s*,\s*1\s*\)|\bReady\s*=\s*1\b/g)];assert.ok(sets.length>=1);
 for(const m of sets)assert.equal(inner(fns,m.index)?.name,'Build','Ready is set only in Build()');
 for(const m of src.matchAll(/\bBuild\s*\(\s*\)/g)){const f=inner(fns,m.index);if(!f||f.start===m.index)continue;if(f.name==='Build')continue;assert.equal(f.name,'SafeBuild','Build() only from SafeBuild()');}
 for(const m of src.matchAll(/\bSafeBuild\s*\(\s*\)/g)){if(fns.some(f=>f.name==='SafeBuild'&&f.start===m.index))continue;
  const line=raw.slice(src.lastIndexOf('\n',m.index)+1,src.indexOf('\n',m.index));assert.match(line,/RolesAsked\s*\(\s*\)/,'SafeBuild() only behind RolesAsked(): '+line.trim());}
});

test('native: every engine-draw runtime is armed from the hook build (copied by build-x86.cmd)',()=>{
 const b=fs.readFileSync(path.join(hook,'build-x86.cmd'),'utf8');for(const f of RUNTIMES)assert.ok(b.includes(f),f+' in build-x86.cmd');
});

test('kernel: the default profile asks for nothing; no control file without a seed that turns draw on',()=>{
 const P=require('../core/profiles/index.cjs'),E=require('../core/engine-draw.cjs');
 const p=P.profileFor({});assert.equal(P.get(p,'draw.roles',null),false);assert.equal(P.get(p,'draw.embed',null),false);assert.equal(P.get(p,'draw.kemcoSprites',null),false);
 const s=E.settings(p);assert.equal(s.roles,false);assert.equal(s.embed,false);
 assert.match(E.krkrControlText(s,new Map()),/^#cfg roles=0 embed=0/);
 const calls=[];const ed=new E.EngineDraw({profile:p,transport:{write:(...a)=>calls.push(['write',...a]),stop:()=>calls.push(['stop'])}});
 assert.equal(ed.active,false);assert.ok(!calls.some(c=>c[0]==='write'),'no control file is written');
});

test('seeds: draw.roles / draw.embed stay off except the listed games',()=>{
 const dir=path.join(root,'The Seed'),on=[];
 for(const eng of fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()))
  for(const g of fs.readdirSync(path.join(dir,eng.name),{withFileTypes:true}).filter(d=>d.isDirectory())){
   const f=path.join(dir,eng.name,g.name,'game.json');if(!fs.existsSync(f))continue;
   const d=JSON.parse(fs.readFileSync(f,'utf8')).settings?.draw||{};assert.notEqual(d.kemcoSprites,true,eng.name+'/'+g.name+': Kemco observer requires separate live acceptance');if(d.roles===true||d.embed===true)on.push(eng.name+'/'+g.name);}
 assert.deepEqual(on.sort(),[...SEEDS_ON].sort());
});
