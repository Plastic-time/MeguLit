// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('../tools/engine-sigs/cmvs-draw.cjs'),PE=require('../tools/engine-sigs/draw-sites.cjs'),fx=require('./fixtures/engine-sigs/cmvs-draw.json');
const root=path.join(__dirname,'..'),entries=fx.entries.map(e=>Buffer.from(e.hex,'hex'));
test('CMVS two actual draw entries have ECX this, arg1 full text and callee ret8, distinct from measurements',()=>{
 for(const [entry,e] of fx.entries.entries()){
  assert.deepEqual(C.find(entries[entry]),[{entry,offset:0,thisRegister:'ecx',stackWords:2,textArg:1,calleePop:8}]);
  const load=Buffer.from(e.inputLoad.hex,'hex');assert.equal(load.toString('hex'),'8b7d08');assert.equal((load[2]-4)/4,1,'actual EBP-relative full text load is the first caller argument');
  assert.equal(e.ret.hex,'c20800','actual return pops eight bytes');assert.equal(Buffer.from(e.ret.hex,'hex').readUInt16LE(1),2*4);
  const loop=Buffer.from(e.nulLoop.hex,'hex');assert.equal(loop.subarray(0,3).toString('hex'),'803f00');assert.equal(loop.subarray(3,5).toString('hex'),'0f85');const repeat=e.nulLoop.va+9+loop.readInt32LE(5);assert.ok(repeat>e.va&&repeat<e.nulLoop.va,'real NUL loop branches back into its own body');
  for(const call of e.callers){const b=Buffer.from(call.hex,'hex');assert.equal(call.provenIn.length,1);assert.equal(+call.va+5+b.readInt32LE(1),e.va,'call is confirmed from its enclosing CFG');}
  for(const call of e.glyphDrawCalls){const b=Buffer.from(call.hex,'hex');assert.equal(+call.va+5+b.readInt32LE(1),0x465de0);}
 }
 assert.deepEqual(fx.entries.map(e=>e.glyphDrawCalls.length),[7,3]);assert.deepEqual(C.find(Buffer.from(fx.measurement.hex,'hex')),[],'full-string metrics entry grants no drawing capability');
 assert.equal(fx.primaryLuna.matches.filter(x=>x.guardAt).length,1);assert.deepEqual(fx.primaryLuna.matches.find(x=>x.guardAt).provenIn,['0x464850']);
});
test('CMVS mutation, truncation and duplicate signatures never masquerade as a complete pair',()=>{
 const complete=fx.entries.map((e,entry)=>({entry,va:e.va}));assert.equal(C.validPair(complete,fx.imageBase),true);
 for(let entry=0;entry<2;entry++){
  for(let i=0;i<C.patterns[entry].length;i++){const bad=Buffer.from(entries[entry]);bad[i]^=0x5a;assert.deepEqual(C.find(bad),[],`${entry}:${i}`);}
  for(let i=0;i<C.patterns[entry].length;i++)assert.deepEqual(C.find(entries[entry].subarray(0,i)),[]);
  assert.equal(C.find(Buffer.concat([entries[entry],entries[entry]])).length,2);assert.equal(C.validPair(complete.filter(s=>s.entry!==entry),fx.imageBase),false,'one missing rejects both');assert.equal(C.validPair([...complete,complete[entry]],fx.imageBase),false,'one ambiguous rejects both');
  assert.equal(C.validPair(complete.map(s=>({...s,va:s.va+(s.entry===entry?1:0)})),fx.imageBase),false,'one wrong RVA rejects both');
 }
});
test('CMVS actual cache-hit branches bypass glyph creation and do not imply full repaint coverage',()=>{
 const glyph=Buffer.from(fx.cacheGlyph.hex,'hex');assert.equal(glyph[0],0xe8);assert.equal(fx.cacheGlyph.va+5+glyph.readInt32LE(1),0x414010);assert.equal(glyph.subarray(9,11).toString('hex'),'742a');assert.equal(fx.cacheGlyph.va+11+glyph.readInt8(10),0x461424);assert.equal(glyph.subarray(-3).toString('hex'),'c21000','nonzero hit falls through directly to callee return');
 const metrics=Buffer.from(fx.cacheMetrics.hex,'hex');assert.equal(fx.cacheMetrics.va+5+metrics.readInt32LE(1),0x461740);assert.equal(metrics.subarray(-2).toString('hex'),'7545');assert.equal(fx.cacheMetrics.va+metrics.length+metrics.readInt8(metrics.length-1),0x461b83,'wrapper hit skips the lower glyph entry');
 const supplied=Buffer.from(fx.suppliedGlyph.hex,'hex'),condition=supplied.indexOf(Buffer.from('85ff751e','hex'));assert.ok(condition>=0);assert.equal(fx.suppliedGlyph.va+condition+4+supplied.readInt8(condition+3),0x461c13,'provided glyph bypasses generation call');
 const node=Buffer.from(fx.cacheNode.hex,'hex');assert.equal(node.subarray(0,6).toString('hex'),'837f30007564');assert.equal(fx.cacheNode.va+6+node.readInt8(5),0x43acf6,'existing bitmap jumps past the node renderer');assert.ok(node.includes(Buffer.from('e8ce6e0200','hex')),'miss path has a renderer call absent from the hit path');
});
test('CMVS pinned identity and exact fixture bytes agree with available local samples',()=>{
 assert.equal(C.sha256,fx.sha256);assert.equal(C.fileBytes,fx.fileBytes);assert.deepEqual(C.rvas,fx.entries.map(e=>e.va-fx.imageBase));
 const others=require('./fixtures/engine-sigs/draw-sites.json');for(const [name,s] of Object.entries(others.snippets))assert.deepEqual(C.find(Buffer.from(s.hex,'hex')),[],name);
 let inspected=0;for(const f of require('./fixtures/engine-sigs/draw-sites-files.json')){if(!fs.existsSync(f.path))continue;const raw=fs.readFileSync(f.path),p=PE.pe(raw),sites=p.code.flatMap(c=>C.find(c.bytes).map(s=>({...s,va:c.va+s.offset})));
  if(f.id==='cmvs'){
   assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),fx.sha256);assert.equal(raw.length,fx.fileBytes);assert.equal(C.scanFile(f.path).pinned,true);assert.equal(C.validPair(sites,p.base),true);
   for(const s of [...fx.entries.flatMap(e=>[e,e.inputLoad,e.nulLoop,e.ret,...e.callers,...e.glyphDrawCalls]),fx.measurement,fx.cacheGlyph,fx.cacheMetrics,fx.suppliedGlyph,fx.cacheNode]){const va=+s.va,sec=p.secs.find(x=>va>=p.base+x.rva&&va<p.base+x.rva+x.raw);assert.ok(sec);const o=sec.ptr+va-p.base-sec.rva;assert.equal(raw.subarray(o,o+s.hex.length/2).toString('hex'),s.hex,`${va.toString(16)} raw fixture`);}
  }else{assert.deepEqual(sites,[],f.path);assert.equal(C.scanFile(f.path).pinned,false);}inspected++;
 }console.log('# CMVS local fixture file checks: '+inspected);
});
test('CMVS diagnostic version permission stays off in every game, engine and version seed',()=>{
 const P=require('../core/profiles/index.cjs'),D=require('../core/profiles/domains.cjs');assert.equal(P.profileFor({}).draw.cmvsInput,false);assert.equal(D.layerOf('draw.cmvsInput'),'version');assert.deepEqual(D.split({draw:{roles:true,cmvsInput:true}}),{version:{draw:{cmvsInput:true}},game:{draw:{roles:true}}});assert.deepEqual(D.clean({draw:{cmvsInput:'true'}}).rejected,['draw.cmvsInput']);
 const enabled=s=>/(?:["']?cmvsInput["']?|["']draw\.cmvsInput["'])\s*:\s*true\b/.test(s),reject=(s,p)=>assert.equal(enabled(s),false,p),seen=[];
 for(const p of ['The Seed/cmvs/game.json','The Seed/cmvs/game/versions/hash.json'])assert.throws(()=>reject('{"settings":{"draw":{"cmvsInput":true}}}',p),assert.AssertionError);
 function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory())walk(p);else if(/\.(?:json|cjs)$/.test(f.name)){reject(fs.readFileSync(p,'utf8'),p);seen.push(p);}}}
 for(const p of ['core/profiles/games','core/profiles/engines','The Seed']){const dir=path.join(root,p);assert.ok(fs.statSync(dir).isDirectory());walk(dir);}assert.ok(seen.some(p=>p.includes(path.sep+'versions'+path.sep)));
});
test('CMVS input control with roles0 grants no reader route, replacement, role or render capability',()=>{
 const P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs'),{HookNative}=require('../core/hook-native.cjs');const profile=structuredClone(P.profileFor({}));profile.draw.cmvsInput=true;
 const writes=[],asks=[];const ed=new ED.EngineDraw({profile,transport:{write:c=>writes.push(c),stop(){}},onAsk:x=>asks.push(x)});assert.equal(ed.active,true);assert.equal(writes[0].roles,false);assert.equal(writes[0].embed,false);assert.match(ED.krkrControlText(writes[0],new Map()),/^#cfg roles=0 embed=0 zh=1 cmvsInput=1/);assert.equal(ed.line({text:'本文',role:'line'}),false);ed.put('本文',{zh:'译文'});assert.deepEqual(asks,[]);assert.equal(writes.length,1);
 const h=Object.create(HookNative.prototype);Object.assign(h,{profile:P.profileFor({}),state:{gameProcessId:4282},trace(){},notify(){},emit:()=>assert.fail('diagnostic cannot emit a reader route')});const saved=ED.KrkrTransport.prototype.write;ED.KrkrTransport.prototype.write=function(c){writes.push(c);};
 try{h.drawSync();assert.equal(h.engineDraw,undefined);h.setProfile(profile);assert.equal(h.engineDraw.pid,4282);assert.equal(writes.at(-1).cmvsInput,true);assert.equal(writes.at(-1).roles,false);assert.equal(writes.at(-1).embed,false);assert.equal(h.state.replacementState,undefined);assert.equal(h.enabled,undefined);}finally{ED.KrkrTransport.prototype.write=saved;h.engineDraw?.stop?.();}
 assert.ok(!('cmvsInput' in ED.settings(P.profileFor({}))));assert.doesNotMatch(ED.krkrControlText(ED.settings(P.profileFor({})),new Map()),/cmvsInput=/,'false does not alter legacy serialized controls');
 const src=fs.readFileSync(path.join(root,'native/megulithook/CmvsDraw.h'),'utf8');assert.doesNotMatch(src,/ToMe_CHARS|ToMe_DRAWRUN/);assert.match(src,/if\(!CmvsDrawSig::ValidPair\(total,rvas\)\)return false/);assert.match(src,/!DrawAt\[0\]\|\|!DrawAt\[1\]/);assert.match(src,/if\(DiagnosticAsked\(\)\)\{if\(Install\(\)\)/);assert.match(src,/#else\s+namespace CmvsDraw \{ static void Arm\(\) \{\} \}/);
});
