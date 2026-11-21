// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const actual=require('../core/artemis-session.cjs'),pf8=require('../core/artemis-language.cjs')._internal.pf8;
const root=path.resolve(__dirname,'..'),LUA=[process.env.MEGULIT_LUA51,'H:/MeguLit-Work/deps/lua/bin/lua51.exe'].find(p=>p&&fs.existsSync(p));
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-artemis-session-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function injected({allowed=()=>true,processes=async()=>[{pid:42,started:'638990000000000000'}]}={}){
 const file=path.join(root,'core/artemis-session.cjs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const native=m.require.bind(m);
 m.require=name=>name==='./owner-tests.cjs'?{allowed,bind:()=>true,revoke:()=>{},registerLaunch:async()=>true}:name==='../services/game-process.cjs'?{gameProcesses:processes}:native(name);m._compile(fs.readFileSync(file,'utf8'),file);return m.exports;
}
test('default-off actual prepare does not inspect executable or create shadow',async()=>{
 const r=await actual.prepare({root:'Z:/not-a-directory',exe:'Z:/absent.exe',ownerTestGrant:{enabled:true}});assert.equal(r,null);
});
test('effective Lua follows numbered archive order and rejects duplicate/path/range/index budgets',t=>{
 const dir=temporary(t),name='system/msg/message.lua';fs.writeFileSync(path.join(dir,'game.pfs'),pf8([{name,data:Buffer.from('base')}]));fs.writeFileSync(path.join(dir,'game.pfs.005'),pf8([{name,data:Buffer.from('last')}]));
 const a=actual._internal.effectiveModules(dir);assert.equal(a.patch,'game.pfs.006');assert.equal(a.modules[name].toString(),'last');
 fs.writeFileSync(path.join(dir,'game.pfs.006'),pf8([{name,data:Buffer.from('x')},{name:name.toUpperCase(),data:Buffer.from('y')}]));assert.throws(()=>actual._internal.effectiveModules(dir),/ARTEMIS_INDEX/);
 fs.writeFileSync(path.join(dir,'game.pfs.006'),pf8([{name:'../bad',data:Buffer.alloc(0)}]));assert.throws(()=>actual._internal.effectiveModules(dir),/ARTEMIS_INDEX/);
 const h=Buffer.from('706638ffffff7f','hex');fs.writeFileSync(path.join(dir,'game.pfs.006'),h);assert.throws(()=>actual._internal.effectiveModules(dir),/ARTEMIS_INDEX/);
});
test('shadow excludes saves/config/extra archives and never links a directory',t=>{
 const dir=temporary(t),game=path.join(dir,'game'),shadow=path.join(dir,'shadow');fs.mkdirSync(game);fs.mkdirSync(shadow);fs.mkdirSync(path.join(game,'savedata'));fs.writeFileSync(path.join(game,'savedata','system.dat'),'personal synthetic save');
 for(const n of ['game.exe','iarsys64.dll','game.pfs','script.ini','game.pfs.001.disabled'])fs.writeFileSync(path.join(game,n),n);
 actual._internal.shadowFiles(game,shadow,['game.pfs']);assert.deepEqual(fs.readdirSync(path.join(shadow,'savedata')),[]);assert.equal(fs.existsSync(path.join(shadow,'script.ini')),false);assert.equal(fs.existsSync(path.join(shadow,'game.pfs.001.disabled')),false);assert.equal(fs.lstatSync(path.join(shadow,'savedata')).isSymbolicLink(),false);
 fs.writeFileSync(path.join(shadow,'game.exe'),'private changed');assert.equal(fs.readFileSync(path.join(game,'game.exe'),'utf8'),'game.exe');assert.equal(fs.readFileSync(path.join(game,'savedata','system.dat'),'utf8'),'personal synthetic save');
 fs.mkdirSync(path.join(game,'system'));assert.throws(()=>actual._internal.shadowFiles(game,path.join(dir,'unused'),['game.pfs']));
});
test('real Lua boot tail and actual Node session exchange bounded records, revoke in-flight and expire stopped owner heartbeat',{skip:!LUA&&'Lua 5.1 unavailable'},async t=>{
 const dir=temporary(t),control=path.join(dir,'megulit-artemis.ctl'),output=path.join(dir,'megulit-artemis.jsonl'),nonce='0123456789abcdef0123456789abcdef';
 const Observer=require('../core/artemis-observer.cjs'),factory=fs.readFileSync(path.join(root,'core/artemis-observer.lua'),'utf8');
 // Synthetic engine methods, real shipped boot/observer and real filesystem protocol. Not a commercial-game render claim.
 const prepared={script:'return (function()\n'+factory+'\nend)()'};
 const tail=actual._internal.bootTail(prepared,{nonce,control,output}).toString('utf8');
 let permitted=true;const S=injected({allowed:()=>permitted}).ArtemisSession,s=new S({root,exe:'synthetic.exe',shadow:dir,identity:Observer.variants[0].id,nonce,grant:{}});t.after(()=>s.stop());assert.equal(await s.connect(),true);clearInterval(s.timer);
 const source=String.raw`
local now=100; e={now=function()return now end,var=function()return 'savedata' end}
function getTextBlockFloat(p) return p.ja[1] end
function mw_textloop(p,...) getTextBlockFloat(p.text);if p.change then p.change()end;return nil,'tail',nil,... end
function message_name(...)return ... end
function ui_message(...)return ... end
function select_message(...)return ... end
function getMWID()return '1.80.120' end
__TAIL__
message_name('合成名')
local function pack(...)return {n=select('#',...),...}end
local r=pack(mw_textloop({lang='ja',text={ja={{'合成',{'ruby',text='かんじ'},'漢字',{'/ruby'},'😀'}}}},'arg',nil))
assert(r.n==5 and r[2]=='tail' and r[4]=='arg' and r[5]==nil)
now=4201
mw_textloop({lang='ja',text={ja={{'expired synthetic'}}}})
io.write('PASS boot filesystem, exact return tuple, stopped heartbeat\n')
`.replace('__TAIL__',()=>tail);
 const child=spawnSync(LUA,['-'],{input:source,encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:32768});assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
 const lines=fs.readFileSync(output,'utf8').trim().split('\n');assert.equal(lines.length,3);const observed=[],status=[];s.onSource=m=>{observed.push(m);return true;};s.onStatus=x=>status.push(x);s.consume();assert.equal(status.length,1);assert.equal(observed.length,1);assert.equal(observed[0].text,'合成漢字😀\x1d漢字\x1cかんじ');assert.deepEqual(observed[0].artemisOwner,{pid:42,started:'638990000000000000'});
 permitted=false;assert.equal(s.accept(JSON.parse(lines[2])),false);permitted=true;await s.stop();assert.equal(s.accept(JSON.parse(lines[2])),false);assert.match(fs.readFileSync(control,'utf8'),/ 0\n$/);
});
test('source protocol rejects wrong nonce/generation/roles/ruby/text budgets and stop waits pending owned query',async t=>{
 const dir=temporary(t);let finish,queries=0;const S=injected({processes:async()=>{if(++queries===1)return [{pid:42,started:'638990000000000000'}];return await new Promise(r=>finish=r);}}).ArtemisSession;
 const s=new S({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});assert.equal(await s.connect(),true);clearInterval(s.timer);
 const valid={nonce:'abc',generation:s.generation,role:'line',text:'合成正文',ruby:[]};let n=0;s.onSource=()=>{n++;return true;};assert.equal(s.accept(valid),true);
 for(const patch of [{nonce:'wrong'},{generation:1},{role:'button'},{text:'x'.repeat(2049)},{ruby:[[0,99,'a']]}])assert.equal(s.accept({...valid,...patch}),false);assert.equal(n,1);
 s.query=s.tick();await new Promise(r=>setImmediate(r));let ended=false;const stopping=s.stop().then(()=>ended=true);await new Promise(r=>setImmediate(r));assert.equal(ended,false);assert.equal(s.accept(valid),false);finish([{pid:42,started:'638990000000000000'}]);await stopping;assert.equal(ended,true);
});
test('different or ambiguous process generation cannot activate the transport',async t=>{
 for(const p of [[],[{pid:42,started:''}],[{pid:1,started:'638990000000000000'},{pid:2,started:'638990000000000000'}]]){
  const dir=temporary(t),S=injected({processes:async()=>p}).ArtemisSession,s=new S({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});assert.equal(await s.connect(),false);assert.equal(s.on,false);await s.stop();
 }
});
test('actual attach/source/deliver/emit reject a stopped or rebound private source, including a delayed box callback',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const dir=temporary(t),S=injected(),file=path.join(root,'core/hook-native.cjs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const native=m.require.bind(m);m.require=name=>name==='./artemis-session.cjs'?S:native(name);m._compile(fs.readFileSync(file,'utf8'),file);
 let now=1000;const out=[],h=new m.exports.HookNative({native:dir,hook:dir,logs:dir},e=>out.push(e),()=>{throw Error('NO_NATIVE_SPAWN');},()=>now);h.trace=()=>{};
 const s=new S.ArtemisSession({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});assert.equal(await s.connect(),true);clearInterval(s.timer);h.target={...s.owner};require('../core/text-paths-launch.cjs').attach({path:'artemis',session:s},h);
 const packet=text=>({nonce:'abc',generation:s.generation,role:'line',text,ruby:[]});
 try{
  assert.equal(s.accept({...packet('合成名'),role:'name'}),true);assert.equal(s.accept(packet('最初の本文を読みます。')),true);assert.equal(h.state.hookSource,'最初の本文を読みます。');assert.equal(h.state.hookSpeaker,'合成名');
  let held;const original=s.onSource;s.onSource=x=>{held=x;return original(x);};now+=20;h.engineDialog=false;h.engineDialogAt=now;
  assert.equal(s.accept(packet('遅れて届く本文を拒否します。')),false);assert.equal(h.boxBlink.lines.length,1);
  await s.stop();now+=1000;t.mock.timers.tick(1000);assert.equal(h.state.hookSource,'最初の本文を読みます。');
  const sequence=h.state.hookSequence;h.deliverSource('偽の本文です。','artemis-lua-input','',0,held);h.emitSource('偽の本文です。','artemis-lua-input');assert.equal(h.state.hookSequence,sequence);
  h.target={pid:43,started:'638990000000000001'};h.source({...held},'Artemis Lua input');assert.equal(h.state.hookSequence,sequence);
  assert.equal(S.shouldBlock(null,held,h.target),true);assert.equal(S.shouldBlock(null,{origin:'artemis-lua-input'},h.target),true);assert.equal(S.shouldBlock(null,{origin:'live'},h.target),false);
 }finally{await s.stop();await h.stop();}
});
test('a failed off control write is reported and a subsequent owned stop can retry',async t=>{
 const dir=temporary(t),S=injected().ArtemisSession,s=new S({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});assert.equal(await s.connect(),true);clearInterval(s.timer);
 fs.unlinkSync(s.control);fs.mkdirSync(s.control);await assert.rejects(s.stop(),/READER_STOP_INCOMPLETE/);assert.equal(s.stopped,true);fs.rmdirSync(s.control);await s.stop();assert.match(fs.readFileSync(s.control,'utf8'),/ 0\n$/);
});
test('concurrent connect is one actual query and stop joins the initial query before completing',async t=>{
 const dir=temporary(t);let release,n=0;const S=injected({processes:async()=>{n++;return await new Promise(r=>release=r);}}).ArtemisSession,s=new S({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});
 const a=s.connect(),b=s.connect();assert.equal(a,b);let ended=false;const stop=s.stop().then(()=>ended=true);await new Promise(r=>setImmediate(r));assert.equal(ended,false);release([{pid:42,started:'638990000000000000'}]);assert.equal(await a,false);await stop;assert.equal(n,1);assert.equal(ended,true);
});
test('production prepare builds an owned PF8 loader from exact local executable/Lua and compiles all three complete patched modules',{skip:(!LUA&&'Lua 5.1 unavailable')||(!fs.existsSync('H:/MeguLit-Work/samples/amakano3-trial/Amakano3_tr.exe')&&'known source fixture unavailable')},async t=>{
 const source='H:/MeguLit-Work/samples/amakano3-trial',dir=temporary(t),game=path.join(dir,'game'),exe=path.join(game,'Amakano3_tr.exe');fs.mkdirSync(game);
 const modules=actual._internal.effectiveModules(source).modules;fs.copyFileSync(path.join(source,'Amakano3_tr.exe'),exe);fs.writeFileSync(path.join(game,'fixture.pfs'),pf8(Object.entries(modules).map(([name,data])=>({name,data}))));
 fs.mkdirSync(path.join(game,'savedata'));fs.writeFileSync(path.join(game,'savedata','system.dat'),'private synthetic progress');const S=injected(),p=await S.prepare({root:dir,exe,ownerTestGrant:{}});assert.equal(p.path,'artemis');assert.notEqual(p.exe,exe);assert.ok(fs.readFileSync(p.exe).equals(fs.readFileSync(exe)));assert.equal(fs.readFileSync(path.join(game,'savedata','system.dat'),'utf8'),'private synthetic progress');assert.deepEqual(fs.readdirSync(path.join(p.cwd,'savedata')),[]);
 const manifest=JSON.parse(fs.readFileSync(path.join(p.cwd,'megulit-artemis-manifest.json'),'utf8'));assert.equal(manifest.identity,'amakano3-trial-lua-input-v1');assert.equal(manifest.patch,'fixture.pfs.000');
 const sc=require('../services/original-engines/scenes.cjs'),file=path.join(p.cwd,manifest.patch),index=sc.pfsList(file);assert.equal(index.files.length,3);
 let checks='';for(const entry of index.files){const bytes=sc.pfsRead(file,entry,index.key),text=bytes.toString('utf8');assert.match(text,/MeguLitArtemis1/);assert.ok(!/@(?:KEY|NONCE|CONTROL|OUTPUT|SAVE|OBSERVER)@/.test(text));let equals='=';while(text.includes(']'+equals+']'))equals+='=';checks+='assert(loadstring(['+equals+'['+text+']'+equals+']))\n';}
 const compiled=spawnSync(LUA,['-'],{input:checks+"io.write('PASS complete real Lua sources plus production loader\\n')",encoding:'utf8',windowsHide:true,timeout:5000,maxBuffer:32768});assert.equal(compiled.status,0,compiled.stderr);assert.match(compiled.stdout,/PASS/);await p.session.stop();
 const changed={...modules,'system/msg/ui.lua':Buffer.concat([modules['system/msg/ui.lua'],Buffer.from('\n-- changed')])};fs.writeFileSync(path.join(game,'fixture.pfs'),pf8(Object.entries(changed).map(([name,data])=>({name,data}))));assert.equal(await S.prepare({root:dir,exe,ownerTestGrant:{}}),null);
});
