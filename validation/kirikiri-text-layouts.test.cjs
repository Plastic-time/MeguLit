// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// probe/kirikiri-text: single-language KiriKiri Z scn text layout and FE FE scrambled .ks scripts.
const assert=require('node:assert'),zlib=require('node:zlib');
const {textsOf}=require('../services/original-engines/cx-worker.cjs'),kit=require('../services/original-engines/kit.cjs'),xp3=require('../services/original-engines/xp3.cjs');
// single-language layout: [name, [[speaker,text,len,plain,plain]], [voices]|null, ...]
const doc={root:{scenes:[{label:'s1',texts:[
 ['ウルティナ',[[null,'「国王陛下！」',7]],[{name:'ウルティナ',voice:'ul_0001'}],80,{}],
 [null,[[null,'彼女の声が響く。',8,'彼女の声が響く。']],null,64,{}],
 // multilingual layout: [name, display, [[spk,text]...per language], [voices]]
 ['a','a',[[null,'こんにちは'],[null,'Hello'],[null,'你好']],[{voice:'v1'}]],
]}]}};
const rows=textsOf(doc).flatMap(s=>s.rows);
assert.deepStrictEqual(rows.map(r=>r[0]),['「国王陛下！」','彼女の声が響く。','こんにちは']);
assert.strictEqual(rows[2][2],'你好');
assert.strictEqual(textsOf(doc)[0].voices[0],'ul_0001');
// FE FE scrambled scripts
const text='*start\r\nこんにちは[l]\r\n';const u=Buffer.from(text,'utf16le');
const head=Buffer.from([0xfe,0xfe,0,0xff,0xfe]);
const m0=Buffer.from(u);for(let i=0;i<m0.length;i+=2){let c=m0.readUInt16LE(i);if(c>=0x20)c^=((c&0xfe)<<8)^1;m0.writeUInt16LE(c&0xffff,i);}
assert.strictEqual(kit.decodeText(Buffer.concat([head,m0])),text);
// mode 1 swaps the bits of every unit, as KiriKiri writes it (krkrz TextStream.cpp): CR LF are stored as 0E 05, a space as 10
const text1='*start\r\nabc [l]「こんにちは！」\r\n',u1=Buffer.from(text1,'utf16le'),m1=Buffer.from(u1);for(let i=0;i<m1.length;i+=2){const c=m1.readUInt16LE(i);m1.writeUInt16LE(((c&0xaaaa)>>1)|((c&0x5555)<<1),i);}
assert.strictEqual(m1.readUInt16LE(14),0x05);
assert.strictEqual(kit.decodeText(Buffer.concat([Buffer.from([0xfe,0xfe,1,0xff,0xfe]),m1])),text1);
assert.strictEqual(xp3.decodeText(Buffer.concat([Buffer.from([0xfe,0xfe,1,0xff,0xfe]),m1])).text,text1);
const m2=Buffer.concat([Buffer.from([0xfe,0xfe,2,0xff,0xfe]),Buffer.alloc(16),zlib.deflateSync(u)]);
assert.strictEqual(kit.decodeText(m2),text);
assert.strictEqual(xp3.decodeText(Buffer.concat([head,m0])).text,text);
console.log('kirikiri-text-layouts ok');
