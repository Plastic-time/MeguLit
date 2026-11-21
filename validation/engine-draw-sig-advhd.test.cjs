// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('../tools/engine-sigs/advhd-draw.cjs'),PE=require('../tools/engine-sigs/draw-sites.cjs'),fx=require('./fixtures/engine-sigs/advhd-draw.json');
const root=path.join(__dirname,'..'),bytes=Buffer.from(fx.entry.hex,'hex'),files=require('./fixtures/engine-sigs/draw-sites-files.json');
test('AdvHD diagnostic permission stays version-only and no game or engine seed enables it',()=>{
 const D=require('../core/profiles/domains.cjs');assert.equal(D.layerOf('draw.advhdInput'),'version');
 assert.deepEqual(D.split({draw:{roles:true,advhdInput:true}}),{version:{draw:{advhdInput:true}},game:{draw:{roles:true}}});
 assert.deepEqual(D.clean({draw:{advhdInput:'true'}}).rejected,['draw.advhdInput']);
 const enabled=src=>/(?:["']?advhdInput["']?|["']draw\.advhdInput["'])\s*:\s*true\b/.test(src);
 const reject=(src,p)=>assert.equal(enabled(src),false,p);
 for(const [p,src] of [['The Seed/advhd/game.json','{"settings":{"draw":{"advhdInput":true}}}'],['The Seed/advhd/game/versions/hash.json','{"version":{"draw":{"advhdInput":true}}}']])assert.throws(()=>reject(src,p),assert.AssertionError,'a game or version opt-in must fail the same scanner');
 const seen=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.(?:cjs|json)$/.test(e.name)){reject(fs.readFileSync(p,'utf8'),p);seen.push(p);}}}
 for(const p of ['core/profiles/games','core/profiles/engines','The Seed']){const dir=path.join(root,p);assert.ok(fs.statSync(dir).isDirectory(),p);walk(dir);}
 assert.ok(seen.some(p=>p.includes(path.sep+'The Seed'+path.sep)));assert.ok(seen.some(p=>p.includes(path.sep+'versions'+path.sep)),'actual version seeds must be scanned');
});
test('AdvHD actual entry bytes expose EAX height, arg7 and 11 caller-cleaned stack words',()=>{
 assert.equal(A.find(bytes).length,1);assert.deepEqual(A.find(bytes)[0],{offset:0,heightRegister:'eax',stackWords:11,textArg:7});
 let depth=0;for(const i of fx.prologue){const b=Buffer.from(i.hex,'hex');if(b[0]===0x81&&b[1]===0xec)depth+=b.readUInt32LE(2);else if(b[0]>=0x50&&b[0]<=0x57)depth+=4;}
 const text=Buffer.from(fx.textPointerLoad.hex,'hex');assert.equal(text.subarray(0,3).toString('hex'),'8b8424');assert.equal((text.readUInt32LE(3)-depth)/4,7,'actual string load is arg7');
 assert.ok(bytes.includes(Buffer.from('8bf8','hex')),'entry EAX copied into EDI');assert.equal(Buffer.from(fx.originalReturn.hex,'hex').at(-1),0xc3,'plain ret, caller owns stack cleanup');
 assert.equal(fx.callers.length,23);for(const c of fx.callers){const b=Buffer.from(c.call.hex,'hex');assert.equal(b[0],0xe8);assert.equal(+c.call.va+5+b.readInt32LE(1),+fx.entry.va);const clean=Buffer.from(c.cleanup.hex,'hex');assert.equal(clean.subarray(0,2).toString('hex'),'83c4');assert.equal(clean[2]/4,11);}
 assert.match(fs.readFileSync(path.join(root,'native/megulithook/selftest/advhddraw-snippet.h'),'utf8'),new RegExp(fx.entry.hex));
});
test('AdvHD entry mutation, truncation and ambiguity remain observable',()=>{
 for(let i=0;i<A.pattern.length;i++){const bad=Buffer.from(bytes);bad[i]^=0x5a;assert.deepEqual(A.find(bad),[],String(i));}
 for(let i=0;i<A.pattern.length;i++)assert.deepEqual(A.find(bytes.subarray(0,i)),[]);
 assert.equal(A.find(Buffer.concat([bytes,bytes])).length,2);
});
test('AdvHD recorded build identity agrees; available owned files are checked without a CI game dependency',()=>{
 assert.equal(A.sha256,fx.sha256);assert.equal(A.fileBytes,fx.fileBytes);assert.equal(A.entryRva,+fx.entry.va-0x400000);
 const others=require('./fixtures/engine-sigs/draw-sites.json');for(const [name,s] of Object.entries(others.snippets))assert.deepEqual(A.find(Buffer.from(s.hex,'hex')),[],name);
 let inspected=0;for(const f of files){if(!fs.existsSync(f.path))continue;const raw=fs.readFileSync(f.path),pe=PE.pe(raw);const hits=pe.code.flatMap(c=>A.find(c.bytes).map(s=>c.va+s.offset));
  if(f.id==='advhd'){assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),fx.sha256);assert.equal(raw.length,fx.fileBytes);assert.deepEqual(hits,[+fx.entry.va]);assert.equal(A.scanFile(f.path).pinned,true);
   for(const s of [fx.entry,fx.textPointerLoad,fx.fontHelper,fx.cacheProbe,fx.cacheBranch,fx.cacheGet,fx.originalReturn,...fx.callers.flatMap(c=>[c.call,c.cleanup])]){const sec=pe.secs.find(x=>+s.va>=pe.base+x.rva&&+s.va<pe.base+x.rva+x.raw);assert.ok(sec);const o=sec.ptr+(+s.va)-pe.base-sec.rva;assert.equal(raw.subarray(o,o+s.hex.length/2).toString('hex'),s.hex,s.va);}
  }else{assert.deepEqual(hits,[],f.name);assert.equal(A.scanFile(f.path).pinned,false);}inspected++;
 }console.log('# inspected existing files: '+inspected);
});
test('AdvHD cached glyphs bypass the old GDI site; the input observer grants no roles or render capability',()=>{
 const branch=Buffer.from(fx.cacheBranch.hex,'hex');assert.equal(branch.subarray(-6,-4).toString('hex'),'0f85');assert.equal(+fx.cacheBranch.va+branch.length+branch.readInt32LE(branch.length-4),+fx.cacheGet.va);
 const P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs');assert.equal(P.get(P.profileFor({}),'draw.advhdInput',null),false);
 const profile=structuredClone(P.profileFor({}));profile.draw.advhdInput=true;const writes=[],asked=[];const ed=new ED.EngineDraw({profile,transport:{write:c=>writes.push(c),stop(){}},onAsk:x=>asked.push(x)});
 assert.equal(ed.active,true);assert.equal(writes.at(-1).roles,false);assert.equal(writes.at(-1).embed,false);assert.match(ED.krkrControlText(writes.at(-1),new Map()),/^#cfg roles=0 embed=0 zh=1 advhdInput=1/);
 assert.equal(ed.line({text:'本文',role:'line'}),false);ed.put('本文',{zh:'译文'});assert.deepEqual(asked,[]);assert.equal(writes.length,1,'diagnostic input does not create a replacement table update');
 const src=fs.readFileSync(path.join(root,'native/megulithook/AdvhdDraw.h'),'utf8');assert.doesNotMatch(src,/ToMe_CHARS|ToMe_DRAWRUN/);assert.match(src,/if\(Blocked\|\|!VersionPinned\|\|!DrawAt\)return false/);assert.match(src,/if\(total!=1\|\|found-base!=AdvhdDrawSig::EntryRva\)return false/);assert.match(src,/SetPermission\(DiagnosticAsked\(\)&&Install\(\)\)/);assert.match(src,/"advhdInput=1"/);assert.match(src,/#else\s+namespace AdvhdDraw \{ static void Arm\(\) \{\} \}/);
});
test('AdvHD diagnostic profile creates transport without changing route/hide/embed state',()=>{
 const {HookNative}=require('../core/hook-native.cjs'),P=require('../core/profiles/index.cjs'),ED=require('../core/engine-draw.cjs');const h=Object.create(HookNative.prototype),written=[];Object.assign(h,{emit:()=>assert.fail('diagnostic cannot emit reader source or replacement'),trace(){},notify(){},state:{gameProcessId:4322},profile:P.profileFor({})});
 const old=ED.KrkrTransport.prototype.write;ED.KrkrTransport.prototype.write=function(cfg){written.push({...cfg});};
 try{h.drawSync();assert.equal(h.engineDraw,undefined);const profile=structuredClone(P.profileFor({}));profile.draw.advhdInput=true;h.setProfile(profile);assert.equal(h.engineDraw.pid,4322);assert.equal(written.at(-1).advhdInput,true);assert.equal(written.at(-1).roles,false);assert.equal(written.at(-1).embed,false);assert.equal(h.state.replacementState,undefined);assert.equal(h.enabled,undefined);assert.equal(h.engineDraw.line({text:'test'}),false);}finally{ED.KrkrTransport.prototype.write=old;h.engineDraw?.stop?.();}
});
