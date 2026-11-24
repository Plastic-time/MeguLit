// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Eushully AGE: a synthetic S3IN sys4ini.bin + ALF with one SYS4 script (name, two-line message with ruby). */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sjis=require('../services/original-engines/kit.cjs').encodeSjis;
const eu=require('../services/original-engines/eushully.cjs');
const u32=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
test('Eushully AGE script and archive',()=>{
 /* build strings aligned to 4 */
 const strs=['魔女','こんにちは','世界','漢','かん'],enc=s=>{const e=Buffer.concat([Buffer.from(sjis(s)),Buffer.from([0])]);const pad=Buffer.alloc((4-e.length%4)%4);return Buffer.concat([e,pad]).map(c=>c^0xff);};
 const pool=[],at={};let off=0;for(const s of strs){const e=Buffer.from(enc(s));at[s]=off/4;pool.push(e);off+=e.length;}
 const ops=[[0x6e,[[0,2],[2,'魔女']]],[0x6e,[[0,0],[2,'こんにちは']]],[0x6f,[[0,0]]],[0x6e,[[0,0],[2,'世界']]],[0x196,[[0,0],[2,'漢'],[2,'かん']]],[0x2,[]]];
 const codeLen=ops.reduce((n,[,a])=>n+4+a.length*8,0),poolAddr=codeLen/4,parts=[];
 for(const [op,args] of ops){parts.push(u32(op));for(const [t,v] of args)parts.push(u32(t),u32(t===2?poolAddr+at[v]:v));}
 const head=Buffer.alloc(0x3c);head.write('SYS4',0,'latin1');head.writeUInt32LE(0x1c,0x20);head.writeInt32LE(0,0x24);head.writeInt32LE(poolAddr,0x28);
 const scr=Buffer.concat([head,...parts,...pool]);
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'eu-'));
 const alf=Buffer.concat([Buffer.alloc(16,1),scr]);fs.writeFileSync(path.join(dir,'DATA1.ALF'),alf);
 const arcName=Buffer.alloc(0x100);arcName.write('DATA1.ALF');const fn=Buffer.alloc(0x40);fn.write('A0001.bin');
 fs.writeFileSync(path.join(dir,'Sys4Ini.bin'),Buffer.concat([Buffer.alloc(0x12c),u32(1),arcName,u32(1),fn,u32(0),u32(0),u32(16),u32(scr.length)]).map((c,i)=>i<0?c:c));
 fs.writeFileSync(path.join(dir,'Sys4Ini.bin'),Buffer.concat([Buffer.from('S3IN'),Buffer.alloc(0x128),u32(1),arcName,u32(1),fn,u32(0),u32(0),u32(16),u32(scr.length)]));
 const scenes=eu.engine.scenes(dir);assert.strictEqual(scenes.length,1);
 const r=eu.engine.parse(scenes[0].read());assert.deepStrictEqual(r.lines,['魔女','こんにちは世界漢']);
});
test('Eushully AGE: an unknown opcode falls back to the string pool',()=>{
 const sjis2=require('../services/original-engines/kit.cjs').encodeSjis;const w=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
 const enc=s=>{const e=Buffer.concat([Buffer.from(sjis2(s)),Buffer.from([0])]);return Buffer.from(Buffer.concat([e,Buffer.alloc((4-e.length%4)%4)]).map(c=>c^0xff));};
 const a=enc('こんにちは'),b2=enc('世界');
 const code=Buffer.concat([w(0x6e),w(0),w(0),w(2),w(0),w(0x999),w(0)]);/* Print(0,str@pool) then an unknown opcode */
 const poolAddr=code.length/4,pool=Buffer.concat([a,b2]);
 const code2=Buffer.concat([w(0x6e),w(0),w(0),w(2),w(poolAddr),w(0x999),w(0)]);
 const head=Buffer.alloc(0x3c);head.write('SYS4',0,'latin1');head.writeUInt32LE(0x1c,0x20);head.writeInt32LE(poolAddr+pool.length/4,0x28);
 const r=eu.parse(Buffer.concat([head,code2,pool]));
 assert.deepStrictEqual(r.lines,['こんにちは','世界']);
});
test('Eushully AGE: half-width kana (0xA1-0xDF) does not swallow following F040-F043 escapes while real SJIS pairs stay intact',()=>{
 const notPad=raw=>{const e=Buffer.concat([raw,Buffer.from([0])]);return Buffer.from(Buffer.concat([e,Buffer.alloc((4-e.length%4)%4)]).map(c=>c^0xff));};
 /* 0xA6 = ｦ followed by F040 (…), 0xB1/0xB2/0xB3 = ｱ/ｲ/ｳ followed by F041-F043 (―);
    and genuine 2-byte SJIS ending in 0xF0 (0x82 0xF0 = を, 0xE0 0xF0 = 瑩) followed by 0x40 (@) must not trigger F040 */
 const s1=notPad(Buffer.from([0xa6,0xf0,0x40,0xb1,0xf0,0x41,0xb2,0xf0,0x42,0xb3,0xf0,0x43]));
 const s2=notPad(Buffer.from([0x82,0xf0,0x40,0xe0,0xf0,0x40]));
 const ops=[[0x6e,[[0,0],[2,0]]],[0x2,[]],[0x6e,[[0,0],[2,s1.length/4]]],[0x2,[]]];
 const codeLen=ops.reduce((n,[,a])=>n+4+a.length*8,0),poolAddr=codeLen/4,parts=[];
 for(const [op,args] of ops){parts.push(u32(op));for(const [t,v] of args)parts.push(u32(t),u32(t===2?poolAddr+v:v));}
 const head=Buffer.alloc(0x3c);head.write('SYS4',0,'latin1');head.writeUInt32LE(0x1c,0x20);head.writeInt32LE(poolAddr+(s1.length+s2.length)/4,0x28);
 const r=eu.parse(Buffer.concat([head,...parts,s1,s2]));
 assert.deepStrictEqual(r.lines,['ｦ…ｱ―ｲ―ｳ―','を@瑩@']);
 /* exhaustive 0x80-0xFF lead-byte boundary table against eu.stringAt */
 const dec=require('../services/original-engines/kit.cjs').SJIS;
 for(let x=0x80;x<=0xff;x++){
  const b=Buffer.alloc(0x40);b[0x3c]=x^0xff;b[0x3d]=0xf0^0xff;b[0x3e]=0x40^0xff;b[0x3f]=0xff;
  const isLead=x>=0x81&&x<=0x9f||x>=0xe0&&x<=0xfc;
  const want=isLead?dec.decode(Buffer.from([x,0xf0]))+'@':dec.decode(Buffer.from([x]))+'…';
  assert.strictEqual(eu.stringAt(b,0),want,'byte 0x'+x.toString(16));
 }
});
