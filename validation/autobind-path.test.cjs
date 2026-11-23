'use strict';
/* 2026-11-19 (two MeguLit copies on one PC: one auto-bound the other's 千恋＊万花 because only the program name "SenrenBanka" was
   remembered). Players hit the same with engines that share a program name (BGI.exe, cs2.exe, SiglusEngine.exe, RealLive.exe):
   the remembered game is its full program path; another folder's program of the same name is never auto-bound to it, and an
   old record without a path still matches by name until its first bind writes the path. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const clean=require('../core/game-style.js').clean;

test('the remembered full program path survives the preference cleaning (core and reader copies)',()=>{
 const p=clean({gameProcess:'BGI',gameExecutable:String.raw`E:\GAL\素晴日\BGI.exe`,bindEnabled:true});
 assert.equal(p.gameExecutable,String.raw`E:\GAL\素晴日\BGI.exe`);assert.equal(p.gameProcess,'BGI');
 assert.match(read('web/reader/modules/game-style.js'),/result\.gameExecutable = value\.gameExecutable\.slice\(0,1000\)/);
});

test('the bridge reports the bound program path and binds a remembered path only to that program',()=>{
 const cs=read('native/GalWindowBridge.cs');
 assert.match(cs,/processName=WantedProcess,gameExecutable=ProcessImage\(pid\)/);
 assert.match(cs,/if\(Bool\(d,"bindEnabled"\)&&WantedExecutable==""\)\{string remembered=Str\(d,"gameExecutable"\);if\(remembered!=""\)WantedExecutable=remembered;\}/);
 /* the auto-bind loop takes only processes whose image is the wanted one when a path is known; by name only otherwise */
 assert.match(cs,/if\(WantedExecutable==""\|\|SameImage\(ProcessImage\(\(uint\)process\.Id\),WantedExecutable\)\)pids\.Add/);
});

/* the matching rule the bridge applies, on two games with the same program name in different folders */
const norm=s=>String(s||'').toLowerCase().split('/').join(String.fromCharCode(92));
function autoBindTargets(wanted,running){return running.filter(p=>p.name.toLowerCase()===wanted.process.toLowerCase()&&(!wanted.executable||norm(p.image)===norm(wanted.executable)));}
test('two games with the same program name each bind their own record; an old record without a path falls back to the name',()=>{
 const running=[{name:'BGI',image:String.raw`E:\GAL\素晴日\BGI.exe`},{name:'BGI',image:String.raw`E:\GAL\穢翼のユースティア\BGI.exe`}];
 assert.deepEqual(autoBindTargets({process:'BGI',executable:String.raw`e:/gal/素晴日/BGI.exe`},running).map(p=>p.image),[String.raw`E:\GAL\素晴日\BGI.exe`]);
 assert.deepEqual(autoBindTargets({process:'BGI',executable:String.raw`E:\GAL\穢翼のユースティア\BGI.exe`},running).map(p=>p.image),[String.raw`E:\GAL\穢翼のユースティア\BGI.exe`]);
 assert.equal(autoBindTargets({process:'BGI',executable:''},running).length,2,'old record: by name, as before');
});

test('a bind remembers the path; a record of the same program keeps its path, another program clears it',()=>{
 const js=read('core/gal-native.cjs');
 assert.match(js,/gameExecutable: String\(message\.gameExecutable\|\|\(prev\.gameProcess===message\.processName\?prev\.gameExecutable\|\|'':''\)\)/);
 for(const f of ['services/reader.cjs','services/runtime.cjs'])assert.match(read(f),/gameExecutable:g\.preferences\.gameExecutable/);
});
