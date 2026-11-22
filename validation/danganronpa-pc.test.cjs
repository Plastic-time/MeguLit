// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const D=require('../core/danganronpa-pc-source.cjs'),P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs');
const {SHA,SIG,PREFIX,DISPATCH,inspect}=require('../tools/engine-sigs/danganronpa-pc.cjs');
const {hookSource,ownerSource}=require('../tools/engine-sigs/danganronpa-root-glue.cjs');
const fixture=require('./fixtures/engines/danganronpa-pc.json'),root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
function rig(){const grant=Object.freeze(Object.create(null)),target={pid:42,started:'638000000000000000'},calls=[];let valid=true;
 const h={profile:{engine:'spikechunsoft',draw:{spikechunsoftInput:true}},profileInput:{exe:'E:/fixture/DR1_us.exe'},target,ownerTestGrant:grant,serial:4,source(m,n){calls.push({m,n});}};
 const owner={allowed:(token,ctx)=>valid&&token===grant&&ctx.exe===h.profileInput.exe&&ctx.engine==='spikechunsoft'&&ctx.capability==='diagnostic-input',matches:(token,ctx)=>valid&&token===grant&&ctx.pid===42&&ctx.birth===target.started};
 return {h,owner,calls,revoke(){valid=false;}};
}
const message=text=>({type:'hookSource',text,sourceName:D.NAME,sourceCode:'HWN0@50C00:DR1_us.exe',hookActive:true});
test('default profile and every public Danganronpa seed keep new input off',()=>{
 assert.equal(P.DEFAULTS.draw.spikechunsoftInput,false);assert.equal(ED.settings(P.profileFor({})).spikechunsoftInput,undefined);
 for(const slug of ['danganronpa-trigger-happy-havoc','danganronpa-2-goodbye-despair','danganronpa-v3-killing-harmony']){
  const seed=JSON.parse(read('The Seed/spikechunsoft/'+slug+'/game.json'));assert.notEqual(seed.settings.draw.spikechunsoftInput,true);assert.equal(seed.settings.draw.roles,false);
 }
});
test('version input token alone keeps its control transport alive without role or embed claims',()=>{
 const profile=P.apply(P.profileFor({engine:'spikechunsoft'}),{draw:{spikechunsoftInput:true}},'version'),cfg=ED.settings(profile),writes=[];
 const engine=new ED.EngineDraw({profile,transport:{write(c,e){writes.push(ED.krkrControlText(c,e));},stop(){writes.push('STOP');}}});
 assert.equal(engine.active,true);assert.match(writes[0],/^#cfg roles=0 embed=0 zh=1 spikechunsoftInput=1\r\n/);assert.equal(cfg.roles,false);assert.equal(cfg.embed,false);
 engine.setProfile(P.profileFor({engine:'spikechunsoft'}));assert.equal(writes.at(-1),'STOP');
});
test('real byte excerpts pin the exact PC source call and distinct opcode handlers',()=>{
 const b=fixture.builds[0];assert.equal(fixture.builds.length,1);assert.equal(b.exeSha256,SHA);assert.equal(b.runtimeEvidence,false);
 for(const s of b.snippets)assert.equal(crypto.createHash('sha256').update(Buffer.from(s.hex,'hex')).digest('hex'),s.sha256);
 assert.equal(b.snippets.find(s=>s.name==='format-entry').hex,PREFIX.toString('hex'));assert.equal(b.snippets.find(s=>s.name==='dispatch').hex,DISPATCH.toString('hex'));
 const call=b.snippets.find(s=>s.name==='source-call-0'),bytes=Buffer.from(call.hex,'hex'),at=SIG.sourceReturn-5-call.rva;
 assert.equal(bytes[at],0xe8);assert.equal(SIG.sourceReturn+bytes.readInt32LE(at+1),SIG.entry);
});
test('PC adapter is registered in the actual x86 build and has no writeback or geometry protocol',()=>{
 assert.match(read('native/megulithook/enginecollection32.cpp'),/new ToMeDanganronpaPc,/);
 assert.match(read('native/megulithook/build-x86.cmd'),/for %%F in \(DanganronpaPc\.h DanganronpaPcSig\.h\)/);
 const code=read('native/megulithook/DanganronpaPc.h');assert.match(code,/NewHook\(hp,"DanganronpaPcText"\)/);assert.doesNotMatch(code,/EMBED_ABLE|ToMe_CHARS|ToMe_DRAWRUN|CreateThread|WriteProcessMemory/);
 assert.match(code,/ExactFiles\(\)/);assert.match(code,/spikechunsoftInput=1/);assert.match(code,/CODEC_UTF16\|NO_CONTEXT\|FULL_STRING/);
});
test('unknown binary and V3 cannot match a DR1 PC signature',()=>{
 assert.equal(inspect(Buffer.from('not a DR1 executable')).matched,false);assert.equal(inspect(Buffer.alloc(3459728)).matched,false);
});
test('only a current opaque owner grant can route the native stream',()=>{
 const r=rig(),m=message('日本語の本文です。');assert.equal(D.receive(r.h,m,'DR1_us',r.owner),true);assert.equal(r.calls.length,1);
 const received=r.calls[0].m;assert.equal(received.origin,D.ORIGIN);assert.equal(D.shouldBlock(r.h,received,undefined,r.owner),false);
 r.revoke();assert.equal(D.shouldBlock(r.h,received,undefined,r.owner),true);D.receive(r.h,m,'DR1_us',r.owner);assert.equal(r.calls.length,1);
});
test('no grant, disabled input, wrong engine and mismatched process reject source',()=>{
 for(const change of [r=>r.h.ownerTestGrant=null,r=>r.h.profile.draw.spikechunsoftInput=false,r=>r.h.profile.engine='unity',r=>r.h.target={pid:99,started:r.h.target.started}]){
  const r=rig();change(r);assert.equal(D.receive(r.h,message('本文です。'),'DR1_us',r.owner),true);assert.equal(r.calls.length,0);
 }
});
test('history, unknown native name, overlong and empty input never become a source',()=>{
 for(const m of [{...message('古い本文です。'),origin:'history'},{...message('偽の本文です。'),sourceName:'DanganronpaPcOther'},message('あ'.repeat(4001)),message('  ')]){
  const r=rig();assert.equal(D.receive(r.h,m,'DR1_us',r.owner),true);assert.equal(r.calls.length,0);
 }
});
test('copied public fields and a lost authority cannot bypass the final source boundary',()=>{
 const r=rig();D.receive(r.h,message('本文です。'),'DR1_us',r.owner);const m=r.calls[0].m;
 assert.equal(D.shouldBlock(r.h,{text:m.text,sourceName:m.sourceName,origin:m.origin},undefined,r.owner),true);
 assert.equal(D.shouldBlock(r.h,undefined,D.ORIGIN,r.owner),true);assert.equal(D.shouldBlock(r.h,{text:'other',sourceName:'KiriKiri1'},undefined,r.owner),false);
 r.h.serial++;assert.equal(D.shouldBlock(r.h,m,undefined,r.owner),true);
});
test('a different grant cannot reuse the same game process after withdrawal',()=>{
 const r=rig();D.receive(r.h,message('最初の本文です。'),'DR1_us',r.owner);r.h.ownerTestGrant=Object.freeze(Object.create(null));
 const permissive={allowed:()=>true,matches:()=>true};D.receive(r.h,message('遅れた本文です。'),'DR1_us',permissive);assert.equal(r.calls.length,1);
 r.h.target={pid:43,started:'638000000000000001'};D.receive(r.h,message('再起動した本文です。'),'DR1_us',permissive);assert.equal(r.calls.length,2);
});
test('withdrawal clears only a source actually delivered by this engine',()=>{
 const out=[],h={state:{hookSourceOrigin:D.ORIGIN,hookSequence:4},lastSource:'本文',notify:m=>out.push(m)};assert.equal(D.clear(h),true);assert.equal(h.lastSource,'');assert.equal(out[0].hookSource,'');assert.equal(out[0].hookSequence,5);
 h.state.hookSourceOrigin='live';assert.equal(D.clear(h),false);assert.equal(out.length,1);
});
test('shared glue is an exact incremental transform and includes source/deferred/final gates',()=>{
 const source=hookSource(read('core/hook-native.cjs'));assert.equal((source.match(/danganronpa-pc-source\.cjs/g)||[]).length,4);assert.match(source,/cfg\.spikechunsoftInput===true/);
 assert.throws(()=>hookSource(source),/DR1_GLUE_ANCHOR/);assert.equal(ownerSource('const DRAW=new Set([\'roles\']);'),"const DRAW=new Set(['spikechunsoftInput','roles']);");
});
