/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const N=require('../core/nw-runtime.cjs'),W=require('../core/text-paths-web.cjs'),L=require('../core/text-paths-launch.cjs');
const markers='node-webkit\0d:\\builder\\nw\\src\\shell_main.cc\0remote-debugging-port\0nw.exe.pdb\0';
function pe({bits=32,text=markers,section='.rdata'}={}){const b=Buffer.alloc(2048);b.write('MZ');b.writeUInt32LE(128,60);b.write('PE\0\0',128,'latin1');b.writeUInt16LE(bits===64?0x8664:0x14c,132);b.writeUInt16LE(1,134);b.writeUInt16LE(224,148);b.writeUInt16LE(bits===64?0x20b:0x10b,152);b.write(section,376);b.writeUInt32LE(512,392);b.writeUInt32LE(1024,396);b.write(text,1024,'latin1');return b;}
function rig(t,b=pe()){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-nw-runtime-')),exe=path.join(root,'Game.exe');fs.writeFileSync(exe,b);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,exe};}
test('integrated legacy NW PE runtime does not require adjacent virtual files, on x86 or x64',t=>{for(const bits of [32,64]){const {exe}=rig(t,pe({bits}));assert.equal(N.legacyNw(exe),true);assert.equal(W.chromiumShell(exe),'nwjs');}});
test('Enigma names, a renamed executable and incomplete or misplaced NW text grant nothing',t=>{
 for(const b of [pe({section:'.enigma1'}),pe({text:'node-webkit\0remote-debugging-port'}),pe({section:'.text'}),Buffer.from(markers),Buffer.alloc(8)])assert.equal(N.legacyNw(rig(t,b).exe),false);
 assert.equal(N.legacyNw('Z:/missing/Creatures.exe'),false);
});
test('malformed PE offsets, oversized sections and truncated reads refuse without throwing',t=>{
 const cases=[];for(const mutate of [b=>b.writeUInt32LE(0xffffffff,60),b=>b.writeUInt16LE(97,134),b=>b.writeUInt32LE(N.MAX_DATA+1,392),b=>b.writeUInt32LE(2000,396),b=>b.writeUInt32LE(0,396),b=>b.writeUInt16LE(0,152)]){const b=pe();mutate(b);cases.push(b);}for(const b of cases)assert.equal(N.legacyNw(rig(t,b).exe),false);
});
test('normal prepare uses debugger switches only with owner output enabled; no draw settings turn on',async t=>{
 const {root,exe}=rig(t);assert.equal(await L.prepare({root,exe,enabled:false}),null);const prepared=await L.prepare({root,exe,enabled:true});assert.equal(prepared.path,'web');assert.equal(prepared.exe,exe);assert.match(prepared.args[0],/^--remote-debugging-port=\d+$/);assert.equal(prepared.session.drawCfg,null);assert.equal(prepared.session.on,false);await prepared.session.stop();
});
const real=process.env.MEGULIT_CREATURES_EXE||'H:/MeguLit-Work/samples/rpgmv-creatures-jp-20261122/Creatures.exe';
test('official full Creatures sample is read-only recognized as legacy NW, not extracted',{skip:!fs.existsSync(real)&&'sample absent'},()=>{const before=fs.statSync(real),hash=crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex');assert.equal(hash,'33a22315571262b88e13f896492b33b5f21ad37ef6f0d69507698415443b75e9');assert.equal(W.chromiumShell(real),'nwjs');const after=fs.statSync(real);assert.equal(before.mtimeMs,after.mtimeMs);assert.equal(before.size,after.size);});
