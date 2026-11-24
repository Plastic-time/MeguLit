// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const kogado=require('../services/original-engines/kogado.cjs'),advhd=require('../services/original-engines/advhd.cjs'),core=require('../services/adapter-probe-core.cjs');
const u32=v=>{const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;},u16=v=>{const b=Buffer.alloc(2);b.writeUInt16LE(v);return b;};
const sjis=s=>Buffer.from(new TextEncoder().encode(s));/* kana as UTF-8 is enough for decodeText's auto-detect */
function sr01(strings){const table=Buffer.concat(strings.map(s=>{const b=Buffer.concat([sjis(s),Buffer.from([0])]);return Buffer.concat([u16(b.length+2),b]);}));
 const head=Buffer.alloc(0x40);head.write('SR01');const at=head.length;head.writeUInt32LE(at,0x28);head.writeUInt32LE(table.length,0x2c);head.writeUInt32LE(strings.length,0x30);head.writeUInt32LE(at+table.length,4);return Buffer.concat([head,table]);}
function hypack(entries){/* v3: data from 0x10, index after it, 48-byte entries */
 let data=Buffer.alloc(0);const idx=[];for(const e of entries){const off=data.length;data=Buffer.concat([data,e.stored]);const r=Buffer.alloc(48);r.write(e.name,0,'latin1');r.write(e.ext,0x15,'latin1');r.writeUInt32LE(off,0x18);r.writeUInt32LE(e.unpacked,0x1c);r.writeUInt32LE(e.stored.length,0x20);r[0x24]=e.type;idx.push(r);}
 const h=Buffer.alloc(16);h.write('HyPack');h.writeUInt16LE(0x300,6);h.writeUInt32LE(data.length,8);h.writeInt32LE(entries.length,12);return Buffer.concat([h,data,...idx]);}
test('Mariel LZ: literals and a back reference',()=>{assert.strictEqual(kogado.mariel(Buffer.concat([u32(0x08000000),Buffer.from('ABCD'),Buffer.from([0x33])]),8).toString(),'ABCDABCD');});
test('HyPack Script.pak: plain and XOR SR01 string tables read',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hyp-'));const sc=sr01(['「おはよう、トルタ」','雨が降っている。','Func_a01']);
 const plain=Buffer.from(sc);
 fs.writeFileSync(path.join(dir,'Script.pak'),hypack([{name:'scr0001',ext:'kgo',type:0,unpacked:plain.length,stored:plain},{name:'scr0002',ext:'kgo',type:3,unpacked:plain.length,stored:Buffer.from(plain.map(x=>x^0xff))}]));
 const list=kogado.engine.scenes(dir);assert.deepStrictEqual(list.map(s=>s.name),['scr0001.kgo','scr0002.kgo']);
 for(const s of list)assert.deepStrictEqual(kogado.engine.parse(s.read()).lines,['「おはよう、トルタ」','雨が降っている。']);
 const fp=require('../services/engine-fingerprint.cjs');assert.strictEqual(fp.archiveInfo('Script.pak',Buffer.from('HyPack\0\x03').toString('hex')).engine,'kogado');
 fs.rmSync(dir,{recursive:true,force:true});});
test('HyPack: truncated index or short index read returns null without aborting sibling archives',t=>{
 const kit=require('../services/original-engines/kit.cjs'),origReadAt=kit.readAt;
 t.after(()=>{kit.readAt=origReadAt;});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hyp-trunc-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const sc=sr01(['「おはよう、トルタ」','雨が降っている。']);
 const goodBuf=hypack([{name:'scr0001',ext:'kgo',type:0,unpacked:sc.length,stored:sc}]);
 const badStatic=Buffer.alloc(32);badStatic.write('HyPack',0,'latin1');badStatic.writeUInt16LE(0x300,6);badStatic.writeUInt32LE(0,8);badStatic.writeInt32LE(10,12);
 const badStaticFile=path.join(dir,'Script0_trunc.pak');fs.writeFileSync(badStaticFile,badStatic);
 assert.strictEqual(kogado.list(badStaticFile),null);
 /* Simulate concurrent short read on Script1_short.pak while Script2_good.pak stays valid */
 const shortFile=path.join(dir,'Script1_short.pak'),goodFile=path.join(dir,'Script2_good.pak');
 fs.writeFileSync(shortFile,goodBuf);fs.writeFileSync(goodFile,goodBuf);
 kit.readAt=(f,at,len)=>f===shortFile&&at>0?origReadAt(f,at,Math.min(len,8)):origReadAt(f,at,len);
 assert.strictEqual(kogado.list(shortFile),null);
 assert.deepStrictEqual(kogado.engine.scenes(dir).map(s=>s.name),['scr0001.kgo']);
});
test('HyPack Cocotte reads consecutive range blocks, resets the model after a stored block, and reads the SKTR table',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hyp-cocotte-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 // Synthetic four-block script, decoded independently with GARbro (two range blocks, stored, range).
 const packed=Buffer.from('IABAAADgF3rIuAAAAAAAEr161VUe8nZQaR6vhuoAABwoADAAAONj0ptOpVBE/obk1k/mY/s4pG3ErI90z3Z6Gn9crWSqAAAkMgAsABcOETQzBQQTlgugmr+owmUXFxevwfqWc28Zt9DyyBcAFRgAAAAAFgEAAAAAAKgtACkAAONssCfjkhzRzkMeYv8aOsmsSNmzxuTWjeZEXOnuEJzShmR76CsAACk=','base64');
 fs.writeFileSync(path.join(dir,'Script.pak'),hypack([
  {name:'lesson',ext:'kgo',type:2,unpacked:197,stored:packed},
  {name:'truncated',ext:'kgo',type:2,unpacked:197,stored:packed.subarray(0,-1)},
  {name:'wrongSize',ext:'kgo',type:2,unpacked:198,stored:packed},
 ]));
 const [scene,truncated,wrongSize]=kogado.engine.scenes(dir);
 const decoded=scene.read();
 assert.strictEqual(require('node:crypto').createHash('sha256').update(decoded).digest('hex'),
  '78120d7b5bf1a73679814c32a2a9c09d4a9aabd65d855fb423726d6a37543279');
 assert.deepStrictEqual(kogado.engine.parse(decoded).lines,['明日は雨が降りそうです。','忘れずに傘を持ってきてね。','駅まで一緒に歩きましょう。']);
 assert.throws(()=>truncated.read(),{code:'HYPACK_COCOTTE'});
 assert.throws(()=>wrongSize.read(),{code:'HYPACK_COCOTTE'});
 const probe=core.probeGame({dir,executable:'',title:'Compiled lesson'});
 assert.strictEqual(probe.step,'ok');
 assert.strictEqual(probe.detected,'kogado');
 assert.strictEqual(probe.japaneseLines,3);
});
test('HyPack remaster reads SK20 entries as UTF-8 even when a neighboring entry is malformed',()=>{
 const lines=['雨下得越来越大了。','我们先去车站避雨吧。'];
 const raw=sr01([...lines,'bad glyph']);
 raw.write('SK20');
 raw.copy(raw,0x34,0x28,0x34);
 raw.fill(0,0x28,0x34);
 raw[raw.indexOf('bad glyph')]=0xff;
 assert.deepStrictEqual(kogado.parse(raw).lines,[...lines,'�ad glyph']);
});
test('HyPack Cocotte rejects malformed blocks and oversized entries before reading them',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hyp-cocotte-invalid-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const block=bytes=>Buffer.concat([u16(bytes.length+4),u16(1),Buffer.from(bytes)]);
 const valid=block([0,0,0]);
 const entries=[
  {name:'badRow',unpacked:1,stored:block([1,1,0])},
  {name:'shortHeader',unpacked:1,stored:Buffer.concat([valid,Buffer.from([0])])},
  {name:'shortRange',unpacked:1,stored:block([0])},
  {name:'tooLarge',unpacked:64*1024*1024+1,stored:valid},
 ];
 fs.writeFileSync(path.join(dir,'Script.pak'),hypack(entries.map(e=>({...e,ext:'kgo',type:2}))));
 const alloc=Buffer.alloc;
 t.mock.method(Buffer,'alloc',(size,...args)=>{
  assert.ok(size<=64*1024*1024,'Refuse the entry before allocating its output');
  return alloc(size,...args);
 });
 const list=kogado.engine.scenes(dir);
 assert.strictEqual(list.length,entries.length);
 for(const s of list)assert.throws(()=>s.read(),{code:'HYPACK_COCOTTE'},s.name);
});
test('HyPack with no readable Cocotte scripts retains the probe error and Kogado identity',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hyp-cocotte-failed-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'Script.pak'),hypack([
  {name:'bad',ext:'kgo',type:2,unpacked:1,stored:Buffer.from([0])},
  {name:'resource',ext:'bin',type:0,unpacked:4096,stored:Buffer.alloc(4096)},
 ]));
 const result=core.probeGame({dir,executable:'',title:'Fixture'});
 assert.strictEqual(result.step,'parse-failed');
 assert.strictEqual(result.detail,'kogado:HYPACK_COCOTTE');
 assert.deepStrictEqual(result.unsupported,{engine:'kogado',code:'HYPACK_COCOTTE'});
 assert.strictEqual(require('../services/probe-identity.cjs').engineOf(result),'kogado');
});
test('AdvHD v2 ARC (UTF-16 names): Rio.arc .ws2 messages and names',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ws2-'));const rot=b=>Buffer.from(b.map(x=>((x<<2)|(x>>>6))&255));
 const sjEnc=t=>Buffer.from(require('../services/original-engines/kit.cjs').encodeSjis(t));
 const msg=sjEnc('「ねえ、聞いてる？」');
 const ws2=Buffer.concat([Buffer.from([0x15]),sjEnc('%LCリル'),Buffer.from([0,0x14]),u32(7),Buffer.from('v_lil0001\0','latin1'),msg,Buffer.from('%K%P\0','latin1')]);
 const names=['Rio_01.ws2','bg.png'],datas=[rot(ws2),Buffer.from('PNG')];const ents=names.map((n,i)=>Buffer.concat([u32(datas[i].length),u32(i?datas[0].length:0),Buffer.from(n+'\0','utf16le')]));
 const index=Buffer.concat(ents);fs.writeFileSync(path.join(dir,'Rio.arc'),Buffer.concat([u32(2),u32(index.length),index,...datas]));
 const list=advhd.engine.scenes(dir);assert.deepStrictEqual(list.map(s=>s.name),['Rio_01.ws2']);
 assert.deepStrictEqual(advhd.engine.parse(list[0].read()).lines,['リル','「ねえ、聞いてる？」']);
 fs.rmSync(dir,{recursive:true,force:true});});
test('an archive GARbro would open, pack not installed: unknown-pack says needs-garbro',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gar-'));process.env.MEGULIT_GARBRO_ROOT=dir;fs.writeFileSync(path.join(dir,'script.dat'),Buffer.concat([Buffer.from('ZZZZ'),Buffer.alloc(40000,7)]));
 const r=core.probeGame({dir,executable:'',title:'x'});delete process.env.MEGULIT_GARBRO_ROOT;
 assert.strictEqual(r.step,'unknown-pack');assert.match(r.detail,/^needs-garbro:/);assert.strictEqual(r.needs,'garbro');fs.rmSync(dir,{recursive:true,force:true});});
