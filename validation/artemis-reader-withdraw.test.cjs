// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const root=path.resolve(__dirname,'..');
function rig(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-artemis-withdraw-'));let permitted=true,revoked;const owner={pid:42,started:'638990000000000000'};
 const file=path.join(root,'core/artemis-session.cjs'),m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));const native=m.require.bind(m);
 m.require=name=>name==='./owner-tests.cjs'?{allowed:()=>permitted,bind:()=>true,revoke:()=>{},onRevoke:(_g,fn)=>{revoked=fn;return()=>{};}}:name==='../services/game-process.cjs'?{gameProcesses:async()=>[{...owner}]}:native(name);m._compile(fs.readFileSync(file,'utf8'),file);
 const S=m.exports,nfile=path.join(root,'core/hook-native.cjs'),n=new Module(nfile,module);n.filename=nfile;n.paths=Module._nodeModulePaths(path.dirname(nfile));const requireNative=n.require.bind(n);n.require=name=>name==='./artemis-session.cjs'?S:requireNative(name);n._compile(fs.readFileSync(nfile,'utf8'),nfile);
 const messages=[],h=new n.exports.HookNative({native:dir,hook:dir,logs:dir},e=>messages.push(e),()=>{throw Error('NATIVE_SPAWN_FORBIDDEN');},()=>1000);h.trace=()=>{};h.wanted=true;h.target={...owner};
 const s=new S.ArtemisSession({root,exe:'synthetic.exe',shadow:dir,identity:'synthetic',nonce:'abc',grant:{}});
 t.after(async()=>{await s.stop();await h.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const attach=async()=>{assert.equal(await s.connect(),true);clearInterval(s.timer);require('../core/text-paths-launch.cjs').attach({path:'artemis',session:s},h);};
 const send=(text,role='line',ruby=[])=>s.accept({nonce:'abc',generation:s.generation,role,text,ruby});
 return {s,h,send,attach,messages,owner,S,dir,revoke(){permitted=false;revoked();}};
}
test('actual session permission withdrawal clears only its accepted Reader sentence, speaker and ruby',async t=>{
 const r=rig(t);await r.attach();assert.equal(r.send('合成名','name'),true);assert.equal(r.send('最初の合成本文です。','line',[[0,2,'さいしょ']]),true);assert.equal(r.h.state.hookSpeaker,'合成名');const sequence=r.h.state.hookSequence;
 r.revoke();await r.s.stop();assert.equal(r.h.state.hookSource,null);assert.equal(r.h.state.hookSpeaker,'');assert.deepEqual(r.h.state.hookSourceRuby,[]);assert.equal(r.h.state.receivedText,false);assert.equal(r.h.state.hookSequence,sequence+1);assert.equal(r.h.state.hookSourceOrigin,'leave');
 const after=r.h.state.hookSequence;await r.s.stop();assert.equal(r.h.state.hookSequence,after,'withdrawal is idempotent');
});
test('old Artemis stop preserves a newer stock sentence and another owner ruby/name',async t=>{
 const r=rig(t);await r.attach();assert.equal(r.send('古い合成本文です。','line',[[0,2,'ふるい']]),true);r.h.emitSource('別の通常フックの本文です。','live');const snapshot={...r.h.state},speaker={text:'別名',at:1000},pairs=[['別','べつ',0]];r.h.speaker=speaker;r.h.sourceRuby.set('別の通常フックの本文です。',pairs);
 await r.s.stop();assert.equal(r.h.state.hookSource,snapshot.hookSource);assert.equal(r.h.state.hookSequence,snapshot.hookSequence);assert.equal(r.h.speaker,speaker);assert.equal(r.h.sourceRuby.get(snapshot.hookSource),pairs);
});
test('target change retires a still-owned old sentence without accepting a late old-run line',async t=>{
 const r=rig(t);await r.attach();assert.equal(r.send('前のプロセスの合成本文です。'),true);r.h.target={pid:43,started:'638990000000000001'};assert.equal(r.send('遅延した合成本文です。'),false);await r.s.stop();assert.equal(r.h.state.hookSource,null);assert.equal(r.h.state.receivedText,false);
});
test('a rejected pending Artemis row does not take ownership of a stock Reader sentence',async t=>{
 const r=rig(t);await r.attach();r.h.emitSource('通常フックの合成本文です。','live');const before={...r.h.state};r.h.engineDialog=false;r.h.engineDialogAt=1000;assert.equal(r.send('待ち行列の合成本文です。'),false);await r.s.stop();assert.equal(r.h.state.hookSource,before.hookSource);assert.equal(r.h.state.hookSequence,before.hookSequence);
});

test('synchronous permission withdrawal from actual source publication cannot leave its just-published sentence',async t=>{
 const r=rig(t);await r.attach();const emit=r.h.emit;r.h.emit=e=>{emit(e);if(e.hookSourceOrigin==='artemis-lua-input'&&e.hookSource)r.revoke();};
 assert.equal(r.send('通知の中で撤回される合成本文です。','line',[[0,2,'つうち']]),false);await r.s.stop();assert.equal(r.h.state.hookSource,null);assert.deepEqual(r.h.state.hookSourceRuby,[]);assert.equal(r.h.state.receivedText,false);assert.equal(r.h.state.hookSourceOrigin,'leave');
});

test('withdrawal follows actual normalized output rather than requiring the raw input text to survive unchanged',async t=>{
 const r=rig(t);await r.attach();assert.equal(r.send('<R合成|ごうせい>の本文です。'),false);assert.equal(r.h.state.hookSource,'合成の本文です。');await r.s.stop();assert.equal(r.h.state.hookSource,null);assert.equal(r.h.state.hookSpeaker,'');
});
test('a publication callback error still leaves an owned row that session stop can withdraw',async t=>{
 const r=rig(t);await r.attach();const emit=r.h.emit;r.h.emit=e=>{emit(e);if(e.hookSourceOrigin==='artemis-lua-input')throw Error('SYNTHETIC_PUBLICATION_ERROR');};
 assert.throws(()=>r.send('通知エラーの合成本文です。'),/SYNTHETIC_PUBLICATION_ERROR/);assert.equal(r.h.state.hookSource,'通知エラーの合成本文です。');await r.s.stop();assert.equal(r.h.state.hookSource,null);assert.equal(r.h.state.receivedText,false);
});

test('old session stop preserves a later Artemis session publication on the same HookNative',async t=>{
 const r=rig(t);await r.attach();assert.equal(r.send('古いセッションの合成本文です。'),true);const shadow=path.join(r.dir,'next-session');fs.mkdirSync(shadow);const next=new r.S.ArtemisSession({root,exe:'synthetic.exe',shadow,identity:'synthetic',nonce:'def',grant:{}});assert.equal(await next.connect(),true);clearInterval(next.timer);require('../core/text-paths-launch.cjs').attach({path:'artemis',session:next},r.h);
 assert.equal(next.accept({nonce:'def',generation:next.generation,role:'line',text:'新しいセッションの合成本文です。',ruby:[]}),true);const sequence=r.h.state.hookSequence;await r.s.stop();assert.equal(r.h.state.hookSource,'新しいセッションの合成本文です。');assert.equal(r.h.state.hookSequence,sequence);await next.stop();assert.equal(r.h.state.hookSource,null);
});
