// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('../tools/engine-sigs/fvp-draw.cjs'),PE=require('../tools/engine-sigs/draw-sites.cjs'),fx=require('./fixtures/engine-sigs/fvp-draw.json');
const root=path.join(__dirname,'..'),bytes=w=>Buffer.from(w.hex,'hex');
function target(w){const b=bytes(w);assert.equal(b[0],0xe8);return Number(w.va)+5+b.readInt32LE(1);}
test('FVP actual prologue and caller prove ECX plus one callee-cleaned argument, copied before slot reuse',()=>{
 assert.equal(F.builds.length,2);
 for(const [build,s] of fx.samples.entries()){
  const entry=bytes(s.entry);assert.deepEqual(F.find(entry),[{offset:0,thisRegister:'ecx',stackWords:1,textArg:1,calleePop:4,event:'append'}]);
  assert.equal(entry.subarray(0,8).toString('hex'),'83ec0c5556578bf9');
  const locals=entry[2],pushes=entry.subarray(3,6);assert.ok([...pushes].every(x=>x>=0x50&&x<=0x57));
  const depth=locals+pushes.length*4,load=bytes(s.inputLoad);assert.equal(load.subarray(0,3).toString('hex'),'8b6c24');assert.equal(load[3]-depth,4,'after two callee-cleaned helper calls, stack load is original arg1');
  assert.deepEqual(s.helperCalls.map(target),s.helperReturns.map(h=>h.entry));for(const h of s.helperReturns){assert.equal(h.rets.length,2);for(const r of h.rets)assert.equal(r.hex,'c20400','both helper return paths pop the word pushed before the call, so pre-input-load ESP is known');}
  const ret=bytes(s.ret);assert.equal(ret[0],0xc2);assert.equal(ret.readUInt16LE(1),4,'callee pops one word');
  const caller=bytes(s.caller);assert.equal(caller.subarray(0,3).toString('hex'),'568bcd','caller pushes ESI source, assigns ECX from target object');assert.equal(target({va:s.caller.va+3,hex:caller.subarray(3).toString('hex')}),s.entry.va);
  const reused=bytes(s.slotReuse);assert.equal(reused.subarray(0,4).toString('hex'),'c7442420');assert.equal(reused.readUInt32LE(4),0x7e);assert.equal(reused[3]-(depth+4),4,'helper push shifts reused arg1 slot by four bytes; post-return capture would lose the pointer');
  const layout=bytes(s.layoutCall);assert.equal(layout.subarray(0,8).toString('hex'),'6a016a006a008bcf');assert.equal(target({va:s.layoutCall.va+8,hex:layout.subarray(8).toString('hex')}),s.layout);
  assert.ok(entry.includes(Buffer.from('66891f83c702897e10','hex')),'writes a word at current vector end, increments by two, stores end; this is append, not a whole-page setter');
  assert.equal(F.validSite(build,[{va:s.entry.va}],s.imageBase),true);assert.deepEqual(F.builds[build],{sha256:s.sha256,fileBytes:s.fileBytes,rva:s.entry.va-s.imageBase});
 }
});
test('FVP mutated, truncated, ambiguous, wrong-version and misplaced entries cannot activate',()=>{
 for(const [build,s] of fx.samples.entries()){
  const entry=bytes(s.entry);
  for(let i=0;i<F.pattern.length;i++){const bad=Buffer.from(entry);bad[i]^=0x5a;assert.deepEqual(F.find(bad),[],`${build}:${i}`);}
  for(let i=0;i<F.pattern.length;i++)assert.deepEqual(F.find(entry.subarray(0,i)),[]);
  assert.equal(F.find(Buffer.concat([entry,entry])).length,2);
  assert.equal(F.validSite(build,[],s.imageBase),false);assert.equal(F.validSite(build,[{va:s.entry.va},{va:s.entry.va}],s.imageBase),false);
  assert.equal(F.validSite(build,[{va:s.entry.va+1}],s.imageBase),false);assert.equal(F.validSite(1-build,[{va:s.entry.va}],s.imageBase),false);
 }
 for(const build of [-1,2,undefined,1.5])assert.equal(F.validSite(build,[{va:0x431bb0}],0x400000),false);
 for(const [name,w] of Object.entries(require('./fixtures/engine-sigs/draw-sites.json').snippets))assert.deepEqual(F.find(bytes(w)),[],name);
});
test('FVP 32-target identity is not a role, and relayout plus cached flush can bypass raw append',()=>{
 for(const s of fx.samples){
  const t=bytes(s.witnesses.targetSlot);assert.ok(t.includes(Buffer.from('83f81f','hex')));assert.ok(t.includes(Buffer.from('8bac8298000000','hex')),'bounded index selects [global+index*4+0x98], with no inferred role');
  const all=bytes(s.witnesses.all32Targets);assert.equal(all.subarray(0,5).toString('hex'),'bf98000000');assert.ok(all.includes(Buffer.from('83c70481ff18010000','hex')));assert.equal((0x118-0x98)/4,32);
  const rebuild=bytes(s.witnesses.rebuildWithoutInput);assert.equal(target({va:s.witnesses.rebuildWithoutInput.va+rebuild.length-5,hex:rebuild.subarray(-5).toString('hex')}),s.layout);
  const calls=name=>s.functions[name].calls.filter(c=>bytes(c)[0]===0xe8).map(target);
  assert.ok(calls('relayout').includes(s.layout));assert.ok(!calls('relayout').includes(s.entry.va),'retained vector can be rebuilt without new input bytes');
  assert.ok(calls('frameDriver').includes(Number(s.functions.tick.entry)));assert.ok(calls('tick').includes(Number(s.functions.flush.entry)));assert.ok(calls('flush').includes(Number(s.functions.upload.entry)));
  for(const name of ['tick','flush'])assert.ok(!calls(name).some(va=>va===s.entry.va||va===s.layout),'cached pixels do not require input or layout');
  const q=bytes(s.witnesses.rawPixelQueue);assert.ok(q.includes(Buffer.from('8b9520050000','hex')),'CPU buffer at this+0x520');
  for(const name of ['targetSlot','rebuildWithoutInput','all32Targets','rawPixelQueue','resourceAndLock','resourceUnlock'])assert.deepEqual(F.find(bytes(s.witnesses[name])),[],name+' must not become append signature');
  for(const fn of Object.values(s.functions)){assert.equal(fn.cutoff,false);assert.deepEqual(fn.unknown,[]);assert.deepEqual(fn.overlap,[]);}
 }
});
test('FVP fixtures verify actual local binaries when present and finite corpus has no unrelated hit',()=>{
 assert.equal(F.pattern.toString('hex'),fx.prefixHex);assert.equal(fx.corpus.uniqueFiles,16);assert.equal(fx.corpus.uniqueSha256,15);assert.equal(fx.corpus.matches.length,2);
 const files=new Set(require('./fixtures/engine-sigs/draw-sites-files.json').map(f=>f.path));for(const s of fx.samples)files.add(s.path);
 let inspected=0;for(const file of files){if(!fs.existsSync(file))continue;const raw=fs.readFileSync(file),sha=crypto.createHash('sha256').update(raw).digest('hex'),s=fx.samples.find(s=>s.sha256===sha),p=PE.pe(raw),sites=p.code.flatMap(c=>F.find(c.bytes).map(x=>({...x,va:c.va+x.offset})));
  if(!s){assert.deepEqual(sites,[],file);assert.equal(F.scanFile(file).pinned,false);}else{
   assert.equal(raw.length,s.fileBytes);assert.equal(F.scanFile(file).pinned,true);assert.equal(sites.length,1);assert.equal(sites[0].va,s.entry.va);
   const records=[s.entry,s.inputLoad,s.ret,s.slotReuse,s.layoutCall,s.caller,...s.helperCalls,...s.helperReturns.flatMap(h=>h.rets),...Object.values(s.witnesses),...Object.values(s.functions).flatMap(f=>[{va:Number(f.entry),hex:f.entryBytes},...f.calls,...f.ret])];
   for(const w of records){const va=Number(w.va),sec=p.secs.find(c=>va>=p.base+c.rva&&va<p.base+c.rva+c.raw);assert.ok(sec);const off=sec.ptr+va-p.base-sec.rva;assert.equal(raw.subarray(off,off+w.hex.length/2).toString('hex'),w.hex,va.toString(16));}
  }inspected++;
 }console.log('# FVP local file checks: '+inspected+'; finite corpus is not global compatibility');
});
test('FVP diagnostic stays false in every real game, engine and root The Seed including versions',()=>{
 const P=require('../core/profiles/index.cjs'),D=require('../core/profiles/domains.cjs');assert.equal(P.profileFor({}).draw.fvpInput,false);assert.equal(D.layerOf('draw.fvpInput'),'version');assert.deepEqual(D.split({draw:{roles:true,fvpInput:true}}),{version:{draw:{fvpInput:true}},game:{draw:{roles:true}}});assert.deepEqual(D.clean({draw:{fvpInput:'true'}}).rejected,['draw.fvpInput']);
 const enabled=s=>/(?:["']?fvpInput["']?|["']draw\.fvpInput["'])\s*:\s*true\b/.test(s),reject=(s,p)=>assert.equal(enabled(s),false,p),seen=[];
 for(const p of ['The Seed/fvp/game.json','The Seed/fvp/game/versions/hash.json'])assert.throws(()=>reject('{"settings":{"draw":{"fvpInput":true}}}',p),assert.AssertionError,'positive control proves scanner detects real seed shape');
 function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(/\.(?:json|cjs)$/.test(f.name)){reject(fs.readFileSync(p,'utf8'),p);seen.push(p);}}}
 for(const p of ['core/profiles/games','core/profiles/engines','The Seed']){const dir=path.join(root,p);assert.ok(fs.statSync(dir).isDirectory());walk(dir);}assert.ok(seen.some(p=>p.includes(path.sep+'versions'+path.sep)));
});
test('FVP roles0 control grants no CHARS, reader route, replacement, hiding or embed and preserves legacy controls',()=>{
 const P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs'),{HookNative}=require('../core/hook-native.cjs');const profile=structuredClone(P.profileFor({}));profile.draw.fvpInput=true;
 const writes=[],asks=[];const ed=new ED.EngineDraw({profile,transport:{write:c=>writes.push(c),stop(){}},onAsk:x=>asks.push(x)});assert.equal(ed.active,true);assert.equal(writes[0].roles,false);assert.equal(writes[0].embed,false);assert.match(ED.krkrControlText(writes[0],new Map()),/^#cfg roles=0 embed=0 zh=1 fvpInput=1/);assert.equal(ed.line({text:'本文',role:'line'}),false);ed.put('本文',{zh:'译文'});assert.deepEqual(asks,[]);assert.equal(writes.length,1);
 const h=Object.create(HookNative.prototype);Object.assign(h,{profile:P.profileFor({}),state:{gameProcessId:4282},trace(){},notify(){},emit:()=>assert.fail('diagnostic cannot emit reader route')});const saved=ED.KrkrTransport.prototype.write;ED.KrkrTransport.prototype.write=function(c){writes.push(c);};
 try{h.drawSync();assert.equal(h.engineDraw,undefined);h.setProfile(profile);assert.equal(h.engineDraw.pid,4282);assert.equal(writes.at(-1).fvpInput,true);assert.equal(writes.at(-1).roles,false);assert.equal(writes.at(-1).embed,false);assert.equal(h.state.replacementState,undefined);assert.equal(h.enabled,undefined);}finally{ED.KrkrTransport.prototype.write=saved;h.engineDraw?.stop?.();}
 assert.ok(!('fvpInput' in ED.settings(P.profileFor({}))));assert.doesNotMatch(ED.krkrControlText(ED.settings(P.profileFor({})),new Map()),/fvpInput=/);
 const src=fs.readFileSync(path.join(root,'native/megulithook/FvpDraw.h'),'utf8');assert.doesNotMatch(src,/ToMe_CHARS|ToMe_DRAWRUN/);assert.match(src,/PinFileBuild\(file\)/);assert.match(src,/if\(!FvpDrawSig::ValidSite\(build,total,found-base\)\)return false/);assert.match(src,/#else\s+namespace FvpDraw \{ static void Arm\(\) \{\} \}/);
});
