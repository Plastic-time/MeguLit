// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fixture=require('./fixtures/engine-sigs/exhibit-retouch-stock.json'),PE=require('../tools/engine-sigs/draw-sites.cjs');
const root=path.join(__dirname,'..'),stock=path.join(root,'preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32');
const source=n=>fs.readFileSync(path.join(root,n),'utf8');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function gitBlob(text){const b=Buffer.from(text.replace(/\r\n/g,'\n'));return crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');}
function mapped(file){
 const image=PE.pe(file);
 const offset=(rva,n=1)=>{
  const section=image.secs.find(s=>rva>=s.rva&&rva+n<=s.rva+s.raw);
  assert.ok(section,'requested RVA is file-backed');
  const at=section.ptr+rva-section.rva;assert.ok(at+n<=file.length);return at;
 };
 return {...image,offset,bytes:(rva,n)=>file.subarray(offset(rva,n),offset(rva,n)+n)};
}
/* Only used after full-file SHA pins on the known local publisher module */
function exportsOf(file,image){
 const optional=file.readUInt32LE(0x3c)+24,exportRva=file.readUInt32LE(optional+96),exportBytes=file.readUInt32LE(optional+100),dir=image.offset(exportRva,40);
 const count=file.readUInt32LE(dir+24),functions=image.offset(file.readUInt32LE(dir+28)),names=image.offset(file.readUInt32LE(dir+32)),ordinals=image.offset(file.readUInt32LE(dir+36)),out=new Map();
 assert.ok(count<100000);
 for(let n=0;n<count;n++){
  const at=image.offset(file.readUInt32LE(names+n*4)),end=file.indexOf(0,at);assert.ok(end>=at&&end-at<1024);
  const name=file.toString('ascii',at,end),ordinal=file.readUInt16LE(ordinals+n*2),rva=file.readUInt32LE(functions+ordinal*4);
  out.set(name,{rva,forwarded:rva>=exportRva&&rva<exportRva+exportBytes});
 }
 return out;
}
test('Retouch ordinary source matches the inspected upstream blobs and is already registered',()=>{
 for(const name of ['Retouch.cpp','Retouch.h'])assert.equal(gitBlob(fs.readFileSync(path.join(stock,name),'utf8')),fixture.stockSource[name].gitBlob,name);
 const registry=source('native/megulithook/enginecollection32.cpp');assert.match(registry,/#include "engine32\/Retouch.h"/);assert.match(registry,/new Retouch\s*,/);
 const adapter=fs.readFileSync(path.join(stock,'Retouch.cpp'),'utf8');
 for(const entry of fixture.ordinaryEntries){assert.ok(adapter.includes(entry.symbol));assert.ok(adapter.includes('NewHook(hp, "'+entry.hook+'")'));}
 assert.match(fs.readFileSync(path.join(stock,'Retouch.h'),'utf8'),/GetModuleHandle\(L"resident\.dll"\)/);
});
test('contract fixture compiles retained stock source without introducing a runtime implementation',()=>{
 const contract=source('native/megulithook/selftest/retouch-stock-contract.cpp');
 assert.match(contract,/#include "\.\.\/\.\.\/\.\.\/preserved\/source\/.+\/Retouch\.cpp"/);
 assert.match(contract,/fake Win32 discovery and NewHook/);assert.match(contract,/static bool NewHook/);
 assert.equal(fixture.newHookImplementation,false);assert.equal(fixture.runtimeVerified,false);assert.equal(fixture.readerVerified,false);
});
test('retained custom callback splits are thread identities and are not Reader role certification',()=>{
 const adapter=fs.readFileSync(path.join(stock,'Retouch.cpp'),'utf8');
 assert.match(adapter,/FIXED_SPLIT_VALUE \* 2/);assert.match(adapter,/FIXED_SPLIT_VALUE \* 1/);assert.match(adapter,/FIXED_SPLIT_VALUE \* 3/);
 const constant=source('preserved/source/lunahoook-adapted/NativeImpl/LunaHook/include/const.h');assert.match(constant,/FIXED_SPLIT_VALUE = 0x10001/);
 const policy=source('native/EmbedTextPolicy.cs');assert.match(policy,/ctx2 >= 1 && ctx2 <= 3/);
 const runtime=source('native/megulithook/texthook.cc');assert.match(runtime,/text_fun\(context, &hp, &buff, &lpSplit\)/);assert.match(runtime,/ThreadParam tp\{GetCurrentProcessId\(\), address, lpRetn, lpSplit\}/);assert.match(runtime,/TextOutput\(tp, hp, buffer, buff.size\)/);
});
test('ordinary output reaches the existing hookSource interface without an RLD reader dependency',()=>{
 const bridge=source('native/HookBridge.cs');assert.match(bridge,/OutputFrame\(code,name,tp,text\)/);assert.ok(bridge.includes('type="hookSource"'));
 const host=source('core/hook-native.cjs');assert.match(host,/m.type==='hookSource'.*this.sourcePage\(m,name\)/);
 const runtime=source('native/megulithook/enginecontrol.cpp');assert.match(runtime,/matched = m->check_function\(\)/);assert.match(runtime,/attached = m->attach_function\(\)/);
 /* This is a source trace only, not an assertion that output reached a real Reader */
 assert.equal(fixture.readerVerified,false);
});
test('default draw permissions remain off for this sample',()=>{
 const P=require('../core/profiles/index.cjs'),E=require('../core/engine-draw.cjs'),profile=P.profileFor({engine:'exhibit'}),writes=[];
 assert.equal(P.get(profile,'draw.roles',null),false);assert.equal(P.get(profile,'draw.embed',null),false);assert.equal(P.get(profile,'draw.advhdInput',null),false);
 const draw=new E.EngineDraw({profile,transport:{write:x=>writes.push(x),stop(){}}});assert.equal(draw.active,false);assert.deepEqual(writes,[]);
});
const sample=process.env.MEGULIT_EXHIBIT_SAMPLE;
test('exact local EXE, resident, scenario and script pins match actual PE exports and loader sites',{skip:sample?false:'MEGULIT_EXHIBIT_SAMPLE is required for publisher-file audit; no game files bundled'},()=>{
 const files=new Map();
 for(const row of fixture.modules){const full=path.join(sample,row.relativePath),raw=fs.readFileSync(full);assert.equal(raw.length,row.bytes,row.relativePath);assert.equal(sha(raw),row.sha256,row.relativePath);files.set(row.relativePath,raw);}
 const exe=files.get('LoveSweets体験版.exe'),resident=files.get('resident.dll'),scenario=files.get('sc00.dll'),ei=mapped(exe),ri=mapped(resident),si=mapped(scenario),exports=exportsOf(resident,ri);
 for(const entry of fixture.ordinaryEntries){assert.deepEqual(exports.get(entry.symbol),{rva:entry.rva,forwarded:false});assert.equal(ri.bytes(entry.rva,entry.prefixHex.length/2).toString('hex'),entry.prefixHex);}
 const loader=fixture.exeLoader;assert.equal(ei.bytes(loader.residentNameRva,13).toString('ascii'),'resident.dll\0');
 for(const site of loader.sites)assert.equal(ei.bytes(site.rva,site.hex.length/2).toString('hex'),site.hex);
 const target=site=>{const b=ei.bytes(site.rva,5);assert.equal(b[0],0xe8);return site.rva+5+b.readInt32LE(1);};
 assert.equal(target(loader.sites[1]),loader.wrapperRva);assert.equal(target(loader.sites[2]),loader.loaderRva);
 const call=ei.bytes(loader.sites[3].rva,6);assert.equal(call.readUInt16LE(0),0x15ff);assert.equal(call.readUInt32LE(2),ei.base+loader.loadLibraryExAIatRva);
 assert.ok(ei.slots('LoadLibraryExA').includes(ei.base+loader.loadLibraryExAIatRva));
 const history=fixture.historyEntry,needle=Buffer.from(history.patternHex,'hex'),hits=[];
 for(const section of ri.code)for(let at=section.bytes.indexOf(needle);at>=0;at=section.bytes.indexOf(needle,at+1))hits.push(section.va-ri.base+at);
 assert.deepEqual(hits,[history.matchRva]);assert.equal(ri.bytes(history.matchRva,history.prefixHex.length/2).toString('hex'),history.prefixHex);
 const historyCall=history.matchRva+needle.length-1,historyBytes=ri.bytes(historyCall,5);assert.equal(historyCall+5+historyBytes.readInt32LE(1),history.targetRva);
 assert.equal(exportsOf(scenario,si).get('start').rva,fixture.scenario.entryRva);assert.ok(scenario.includes(Buffer.from('resident.dll\0')));
 const ini=new TextDecoder('shift_jis').decode(files.get('ExHIBIT.ini'));assert.match(ini,/scenario=sc00\.dll/);assert.match(ini,/entry=start/);assert.match(ini,/VERSION=1\.00/);
 for(const file of ['rld/0_0419_01.rld','rld/0_0420_01.rld']){assert.equal(files.get(file).subarray(0,4).toString('hex'),'00444c52');assert.equal(files.get(file).readUInt32LE(4),3);}
 console.log('# Exact local sample pin audit passed; no game DLL loaded or code executed');
});
