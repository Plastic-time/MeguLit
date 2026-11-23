// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// WHITE ALBUM (1998) Leaf PAK: WAMES.PAK (LZSS) with the Chinese build's CNMES.PAK beside it. Built by hand; no game files.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const lp=require('../services/original-engines/leaf-pak.cjs'),{encodeSjis}=require('../services/original-engines/kit.cjs');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
/* LZSS stream from items: a number is a literal byte, [ringPos,len] a copy (len 3..18, or longer with the extra byte) */
function lzss(items,full){const out=[];for(let i=0;i<items.length;i+=8){let flags=0;const body=[];
  items.slice(i,i+8).forEach((it,bit)=>{if(typeof it==='number'){flags|=1<<bit;body.push(it);}else{const [p,l]=it,f=l>=18?15:l-3,w=(p<<4)|f;body.push(w&255,w>>8);if(f===15)body.push(l-18);}});
  out.push(flags,...body);}
 const data=Buffer.from(out);return Buffer.concat([u32(data.length+8),u32(full),data]);}
function pak(entries){const head=4+entries.length*28;let at=head;const table=[u32(entries.length)],bodies=[];
 for(const [name,data,packed] of entries){const n=Buffer.alloc(16);n.write(name,'latin1');table.push(n,u32(data.length),u32(packed?1:0),u32(data.length?at:0));bodies.push(data);at+=data.length;}
 return Buffer.concat([...table,...bodies]);}
function mes(strings){const bufs=strings.map(s=>Buffer.concat([s,Buffer.from([0])]));let off=0;const offs=bufs.map(b=>{const o=off;off+=b.length;return u32(o);});return Buffer.concat([u32(bufs.length),...offs,...bufs]);}
const sj=s=>Buffer.from(encodeSjis(s));/* the GBK fixture below is written as raw bytes */

test('LZSS: literals, ring copies, the extra length byte, and overlapping copies before and after the ring went round',()=>{
 const text=Buffer.from('ABCDABCDABCD','latin1');
 assert.deepEqual(lp.unpack(lzss([0x41,0x42,0x43,0x44,[0,4],[0,4]],12)),text);
 const long=Buffer.alloc(40,0x5a);assert.deepEqual(lp.unpack(lzss([0x5a,[0,39]],40)),long,'a 39-byte copy: 15 in the field, 21 in the extra byte');
 /* first round: an overlapping copy repeats what it writes (「るるる」) */
 assert.deepEqual(lp.unpack(lzss([0x82,0xe9,[0,4]],6)),Buffer.from([0x82,0xe9,0x82,0xe9,0x82,0xe9]));
 /* after 2048 bytes: the part of a copy that runs into its own output reads the ring as it was before the copy */
 const fill=[];for(let i=0;i<2048;i++)fill.push(i&0xff);const before=Buffer.from(fill.slice(0,4));
 const out=lp.unpack(lzss([...fill,1,2,3,4,[0,5]],2048+4+5));/* ring 0..3 now hold 1 2 3 4; ring 4 still holds 4 (from the first round) */
 assert.deepEqual(out.subarray(2052),Buffer.from([1,2,3,4,4]));assert.notDeepEqual(out.subarray(2052),Buffer.concat([before,Buffer.from([1])]));
});

test('the Chinese build reads CNMES.PAK and takes WAMES.PAK as its original, message by message',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-leaf-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const ja=mes([Buffer.concat([Buffer.from('{#bgx 2004 06#mon#name ','latin1'),sj('ピンポーン。'),Buffer.from('ko#name 8','latin1'),sj('「はーい」'),Buffer.from('ko#name 0','latin1'),sj('「こんばんは、'),Buffer.from('%N0000','latin1'),sj('。'),Buffer.from('k','latin1'),sj('突然でごめんね」'),Buffer.from('ko}','latin1')])]);
 const zhText=Buffer.concat([Buffer.from('{#bgx 2004 06#mon#name ','latin1'),Buffer.from([0xb6,0xa3,0xdf,0xcb,0xa1,0xaa,0xa1,0xaa]),Buffer.from('ko#name 8','latin1'),Buffer.from([0xa1,0xb8,0xc0,0xb4,0xc1,0xcb,0xa1,0xb9]),Buffer.from('ko#name 0','latin1'),Buffer.from([0xa1,0xb8,0xcd,0xed,0xc9,0xcf,0xba,0xc3,0xa1,0xb9]),Buffer.from('ko}','latin1')]);
 const zh=mes([zhText]);
 fs.writeFileSync(path.join(dir,'WAMES.PAK'),pak([['n2mes000.mes',lzss([...ja],ja.length),true],['n2mes007.mes',Buffer.alloc(0),true]]));
 fs.writeFileSync(path.join(dir,'CNMES.PAK'),pak([['n2mes000.mes',zh,false]]));
 const e=lp.engine,scenes=e.scenes(dir);assert.deepEqual(scenes.map(s=>s.name),['n2mes000.mes']);
 const run=e.parse(scenes[0].read()).lines;assert.deepEqual(run,['叮咚——','「来了」','「晚上好」']);
 assert.deepEqual(e.originalLines(dir),['ピンポーン。','「はーい」','「こんばんは、。突然でごめんね」']);
 fs.rmSync(path.join(dir,'CNMES.PAK'));/* the Japanese release alone */
 assert.deepEqual(e.parse(e.scenes(dir)[0].read()).lines,['ピンポーン。','「はーい」','「こんばんは、。突然でごめんね」']);assert.equal(e.originalLines(dir),null);
 assert.ok(require('../services/original-engines/registry.cjs').readersFor(dir).includes('leaf-pak'));
});
