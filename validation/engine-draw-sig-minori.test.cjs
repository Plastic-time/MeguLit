// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../tools/engine-sigs/minori-input.cjs'),PE=require('../tools/engine-sigs/draw-sites.cjs'),fx=require('./fixtures/engine-sigs/minori-input.json');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),bytes=Buffer.from(fx.entry.hex,'hex');
test('minori entry is one thiscall string-object pointer and ret4, not a bare char pointer',()=>{
 assert.deepEqual(M.find(bytes),[{offset:0,thisRegister:'ecx',stackWords:1,arg1:'msvc-byte-string',cleanupBytes:4}]);
 assert.equal(bytes.subarray(-3).toString('hex'),'c20400');assert.equal(bytes.subarray(3,6).toString('hex'),'8b4508');
 assert.equal(bytes[21],0xe8);assert.equal(+fx.entry.va+26+bytes.readInt32LE(22),+fx.copyEntry.va,'actual string copy helper');
 assert.match(fx.copyLength.hex,/8b4d08578b7910/);assert.match(fx.copyLayout.hex,/39411472028b09/);assert.match(fx.callerNA.hex,/8d44246c508d8b280b0000ffd2$/,'caller passes local string object');
 assert.match(fx.copyEnd.hex,/897e10/);assert.match(fx.copyEnd.hex,/c6043800/);assert.equal(fx.abi.length,16);assert.equal(fx.abi.capacity,20);assert.equal(fx.abi.cursor,40);
 const snippet=read('native/megulithook/selftest/minoriinput-snippet.h');for(const s of [fx.entry,fx.copyEntry,fx.copyLayout])assert.ok(snippet.includes(s.hex),'independent native real-byte fixture');
});
test('minori signature rejects every mutation, truncation and ambiguity',()=>{
 for(let i=0;i<bytes.length;i++){const b=Buffer.from(bytes);b[i]^=0x5a;assert.deepEqual(M.find(b),[]);assert.deepEqual(M.find(bytes.subarray(0,i)),[]);}
 assert.equal(M.find(Buffer.concat([bytes,bytes])).length,2);assert.equal(M.sha256,fx.sha256);assert.equal(M.fileBytes,fx.fileBytes);assert.equal(M.entryRva,+fx.entry.va-0x400000);
});
test('available exact PE and other engine files are scanned read-only',()=>{
 let checked=0;for(const file of [fx,...require('./fixtures/engine-sigs/draw-sites-files.json')]){if(!fs.existsSync(file.path))continue;const b=fs.readFileSync(file.path),scan=M.scanBuffer(b),exact=path.resolve(file.path)===path.resolve(fx.path);assert.equal(scan.pinned,exact,file.name||file.path);
  if(exact){assert.deepEqual(scan.sites.map(x=>x.va),[+fx.entry.va]);assert.equal(scan.layout,true);assert.equal(scan.vtable,true);const pe=PE.pe(b);
   for(const p of [fx.entry,fx.copyEntry,fx.copyLayout,fx.copyLength,fx.copyEnd,fx.callerNA,fx.callerNB,...fx.layout]){const s=pe.secs.find(s=>+p.va>=pe.base+s.rva&&+p.va+p.hex.length/2<=pe.base+s.rva+s.raw),at=s.ptr+(+p.va)-pe.base-s.rva;assert.equal(b.subarray(at,at+p.hex.length/2).toString('hex'),p.hex);}
   const bad=Buffer.from(b);bad[bad.length-1]^=1;assert.equal(M.scanBuffer(bad).pinned,false,'same-size changed SHA');
  }else{const pe=PE.pe(b);for(const c of pe.code)assert.deepEqual(M.find(c.bytes),[],file.name);}checked++;
 }console.log('# inspected existing minori and cross-engine files: '+checked);
 for(const [name,s] of Object.entries(require('./fixtures/engine-sigs/draw-sites.json').snippets))assert.deepEqual(M.find(Buffer.from(s.hex,'hex')),[],name);
});
test('minori permission is independent, version-only, false by default and absent from all seed opt-ins',()=>{
 const P=require('../core/profiles/index.cjs'),D=require('../core/profiles/domains.cjs'),ED=require('../core/engine-draw.cjs');assert.equal(D.layerOf('draw.minoriInput'),'version');assert.equal(P.profileFor({}).draw.minoriInput,false);
 assert.deepEqual(D.clean({draw:{minoriInput:'true'}}).rejected,['draw.minoriInput']);assert.deepEqual(D.split({draw:{minoriInput:true,roles:true}}),{version:{draw:{minoriInput:true}},game:{draw:{roles:true}}});
 const flag=/(?:["']?minoriInput["']?|["']draw\.minoriInput["'])\s*:\s*true\b/;
 const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(/\.(json|cjs)$/.test(p))assert.doesNotMatch(fs.readFileSync(p,'utf8'),flag,p);}};
 assert.match('{"settings":{"draw":{"minoriInput":true}}}',flag);assert.match('{"version":{"draw":{"minoriInput":true}}}',flag);
 for(const d of ['core/profiles/games','core/profiles/engines','The Seed'])walk(path.join(root,d));
 const profile=structuredClone(P.profileFor({}));profile.draw.minoriInput=true;const writes=[];const e=new ED.EngineDraw({profile,transport:{write:c=>writes.push(c),stop(){}},onAsk:()=>assert.fail('no reader requests')});
 assert.equal(e.active,true);assert.equal(writes.at(-1).roles,false);assert.equal(writes.at(-1).embed,false);assert.match(ED.krkrControlText(writes.at(-1),new Map()),/^#cfg roles=0 embed=0 zh=1 minoriInput=1\r\n/);
 assert.equal(e.line({text:'sample',role:'line'}),false);e.put('sample',{zh:'sample'});assert.equal(writes.length,1);assert.doesNotMatch(read('native/megulithook/MinoriInput.h'),/ToMe_CHARS|ToMe_DRAWRUN/);
});
test('minori thin transport wiring never enables hide/embed or replacement and is in native freshness inputs',()=>{
 const {HookNative}=require('../core/hook-native.cjs'),P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs');const h=Object.create(HookNative.prototype),writes=[];Object.assign(h,{emit:()=>assert.fail('no source delivery'),trace(){},notify(){},state:{gameProcessId:4322},profile:P.profileFor({})});
 const old=ED.KrkrTransport.prototype.write;ED.KrkrTransport.prototype.write=function(c){writes.push(c);};
 try{h.drawSync();assert.equal(h.engineDraw,undefined);const p=structuredClone(h.profile);p.draw.minoriInput=true;h.setProfile(p);assert.equal(writes.at(-1).minoriInput,true);assert.equal(writes.at(-1).roles,false);assert.equal(writes.at(-1).embed,false);assert.equal(h.state.replacementState,undefined);assert.equal(h.enabled,undefined);}finally{ED.KrkrTransport.prototype.write=old;h.engineDraw?.stop();}
 for(const a of ['x86','x64'])assert.match(read('native/megulithook/build-'+a+'.cmd'),/MinoriInput\.h MinoriInputSig\.h/);
 assert.match(read('native/megulithook/enginecontrol.cpp'),/MinoriInput::Arm\(\)/);assert.match(read('native/megulithook/selftest/run.cmd'),/run-minori\.cmd/);
 const n=JSON.parse(read('native/native-builds.json')).find(x=>x.name==='megulithook');assert.ok(n.sources.includes('native/megulithook'));assert.equal(n.ci,false,'ordinary CI does not compile Hook DLL');
});
