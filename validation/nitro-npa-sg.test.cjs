// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Steins;Gate (PC) .npa: u32 index size + index, both index and entries XOR-ed with ~"BUCKTICK"; scripts are compiled .nsb
// whose <PRE @box> arguments hold the text. Built by hand here; no game files are read.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const npa=require('../core/nitroplus-npa.cjs'),nn=require('../services/original-engines/nitro-npa.cjs'),{encodeSjis}=require('../services/original-engines/kit.cjs');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const sj=s=>Buffer.from(encodeSjis(s));
function record(line,op,args){const h=Buffer.alloc(8);h.writeUInt32LE(line,0);h.writeUInt16LE(op,4);h.writeUInt16LE(args.length,6);return Buffer.concat([h,...args.flatMap(a=>{const b=Buffer.isBuffer(a)?a:sj(a);return [u32(b.length),b];})]);}
function archive(files){const names=files.map(([n])=>sj(n));let size=4;names.forEach(n=>size+=4+n.length+12);
 let at=4+size;const idx=[u32(files.length)];files.forEach(([,d],i)=>{const off=Buffer.alloc(8);off.writeBigUInt64LE(BigInt(at));idx.push(u32(names[i].length),names[i],u32(d.length),off);at+=d.length;});
 const index=npa.sgXor(Buffer.concat(idx));return Buffer.concat([u32(index.length),index,...files.map(([,d])=>npa.sgXor(Buffer.from(d)))]);}
const script=Buffer.concat([
 record(94,0xb0,['$スクリプトバージョン']),record(198,0xd0,['STRING','ムービー']),
 record(466,0xd8,['text00010','@box00','<PRE @box00>[text00010]\n<voice name="少女" class="VID_MAY" src="voice/MAY_0000" mode="on">\n「ねえ、聞いてる？」\n\n電話の向こうは静かだった。\n\n</PRE>']),
 record(504,0xd8,['text00020','@box00','<PRE @box00>[text00020]\n<RUBY text="とけい">時計</RUBY>を見た。\n\n</PRE>'])]);

test('a Steins;Gate npa opens and its .nsb scripts give the <PRE> text',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sg-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'nss.npa'),archive([['nss/sg00_01.map',Buffer.from([0,0,0,0])],['nss/sg00_01.nsb',script]]));
 const arc=npa.openNpa(path.join(dir,'nss.npa'));assert.equal(arc.sg,true);assert.deepEqual(arc.entries.map(e=>e.name),['nss/sg00_01.map','nss/sg00_01.nsb']);
 assert.deepEqual(npa.npaData(arc,arc.entries[1]),script);
 const scenes=nn.engine.scenes(dir);assert.deepEqual(scenes.map(s=>s.name),['sg00_01.nsb']);
 const r=nn.engine.parse(scenes[0].read());
 assert.deepEqual(r.lines,['少女','「ねえ、聞いてる？」','電話の向こうは静かだった。','時計を見た。']);
 assert.deepEqual(r.ruby[3],[['時計','とけい']]);assert.ok(r.anchors.includes('[text00010]'));
});
test('a file that is not a Steins;Gate npa is still refused',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-sg-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const f=path.join(dir,'x.npa');fs.writeFileSync(f,Buffer.concat([u32(64),Buffer.alloc(200,0x41)]));
 assert.throws(()=>npa.openNpa(f),/NPA_MAGIC/);
 assert.equal(nn.nsbText(Buffer.from('<PRE @box00>\nこんにちは\n</PRE>\n','utf8')),null);
});
