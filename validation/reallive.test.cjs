// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// RealLive Seen.txt built by hand: literal-only LZ blocks under the fixed mask, a second-level key, an index of 10000.
const test=require('node:test'),assert=require('node:assert');
const rl=require('../services/original-engines/reallive.cjs');
const SJ=s=>{const map={'あ':[0x82,0xa0],'い':[0x82,0xa2],'う':[0x82,0xa4],'「':[0x81,0x75],'」':[0x81,0x76],'名':[0x96,0xbc]};const out=[];for(const ch of s){if(map[ch])out.push(...map[ch]);else out.push(ch.charCodeAt(0));}return Buffer.from(out);};
// Compress as literals only: per 8 bytes a flag byte 0xff, every stored byte XOR-ed with the running mask position.
function pack(plain){const out=[0,0,0,0,0,0,0,0];let m=8;for(let i=0;i<plain.length;i+=8){out.push(0xff^rl.MASK[m++&255]);for(let k=i;k<Math.min(i+8,plain.length);k++)out.push(plain[k]^rl.MASK[m++&255]);}return Buffer.from(out);}
function scenario(code,version,keyName){const plain=Buffer.from(code);if(keyName)for(const [k,off,len] of rl.KEYS[keyName])for(let i=0;i<len&&off+i<plain.length;i++)plain[off+i]^=k[i%16];
 const body=pack(plain),h=Buffer.alloc(0x1d0);h.writeInt32LE(0x1d0,0);h.writeInt32LE(version,4);h.writeInt32LE(0x1d0,0x20);h.writeInt32LE(code.length,0x24);h.writeInt32LE(body.length,0x28);return Buffer.concat([h,body]);}
function seen(list){const idx=Buffer.alloc(80000);let at=80000;const parts=[];for(const [id,s] of list){idx.writeInt32LE(at,id*8);idx.writeInt32LE(s.length,id*8+4);parts.push(s);at+=s.length;}return Buffer.concat([idx,...parts]);}
// Bytecode with ASCII commands around the text, padded past the keyed ranges (256..640).
const code=(...texts)=>{const parts=[Buffer.from('#\x01\x02\x03\x04\x05\x06\x07(1,2)','latin1')];for(const t of texts)parts.push(SJ(t),Buffer.from('\n\x10\x00','latin1'));parts.push(Buffer.alloc(700,0x2c));return Buffer.concat(parts);};
test('reallive: the mask-XOR LZ decodes, back references included',()=>{
 const plain=Buffer.from('abcabcabcabc','latin1');const lit=pack(Buffer.from('abc','latin1'));
 // literal "abc", then one back reference: distance 3, length 9 -> count word ((3)<<4)|(9-2)
 const m0=8;const out=[0,0,0,0,0,0,0,0];let m=m0;out.push(0b00000111^rl.MASK[m++]);for(const c of Buffer.from('abc','latin1'))out.push(c^rl.MASK[m++]);const w=(3<<4)|7;out.push((w&255)^rl.MASK[m++],(w>>8)^rl.MASK[m++]);
 assert.deepEqual(rl.decompress(Buffer.from(out),12,null),plain);assert.ok(lit.length>3);});
test('reallive: Seen.txt index, header, second-level key picked by the text it gives, lines read',()=>{
 const s1=scenario(code('「あい」','名「う」'),110002,'little-busters'),s2=scenario(code('いいう'),10002,null);
 const b=seen([[1,s1],[42,s2]]);const idx=rl.index(b);assert.deepEqual(idx.map(e=>e.id),[1,42]);
 const d1=rl.bytecode(b.subarray(idx[0].offset,idx[0].offset+idx[0].length),null);
 assert.deepEqual(rl.parse(d1).lines,['「あい」','名「う」']);
 const d2=rl.bytecode(b.subarray(idx[1].offset,idx[1].offset+idx[1].length),null);assert.deepEqual(rl.parse(d2).lines,['いいう']);});
test('reallive: a Chinese patch Seen.txt (GBK) reads as Chinese',()=>{
 const gb=Buffer.concat([Buffer.from('#\x01\x02\x03\x04\x05\x06\x07','latin1'),Buffer.from([0xc4,0xe3,0xba,0xc3,0xa3,0xa1]),Buffer.from('\n\x10\x00','latin1'),Buffer.alloc(700,0x2c)]);
 const d=rl.bytecode(scenario(gb,10002,null),null);assert.deepEqual(rl.parse(d).lines,['你好！']);});
test('reallive: a Chinese patch Seen.txt with the second-level key REGNAME names reads all its lines',()=>{
 const gb=Buffer.concat([Buffer.from('#\x01\x02\x03\x04\x05\x06\x07','latin1'),Buffer.from([0xc4,0xe3,0xba,0xc3,0xa3,0xa1]),Buffer.from('\n\x10\x00','latin1'),Buffer.alloc(700,0x2c)]);
 const d=rl.bytecode(scenario(gb,110002,'clannad-full-voice'),'clannad-full-voice');assert.ok(d);assert.deepEqual(rl.parse(d).lines,['你好！']);});
test('reallive: quoted pieces are one line, so a patch\'s 【name】 stays on its line',()=>{
 const q=Buffer.from('"','latin1'),gb=Buffer.concat([Buffer.from('#\x01\x02\x03\x04\x05\x06\x07','latin1'),
  q,Buffer.from([0xa1,0xbe]),q,q,Buffer.from([0xc5,0xae,0xba,0xa2]),q,q,Buffer.from([0xa1,0xbf]),q,q,Buffer.from([0xa1,0xb8,0xc4,0xe3,0xba,0xc3,0xa1,0xb9]),q,
  Buffer.from('\n\x10\x00','latin1'),Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(gb).lines,['【女孩】「你好」']);});
test('reallive: a kana-less line in a Japanese scenario stays Shift-JIS',()=>{
 assert.deepEqual(rl.parse(code('「あい」','あいう','名名')).lines,['「あい」','あいう','名名']);});
test('reallive: ASCII digits, spaces and words stay inside quoted and unquoted text tokens',()=>{
 const {sjis,gbk}=require('./helpers/engine-fixtures.cjs');
 const nl=Buffer.from('\n\x10\x00','latin1'),cmd=Buffer.from('#\x01\x02\x03\x04\x05\x06\x07("BGM01",1,2)','latin1');
 const ja=Buffer.concat([cmd,
  sjis('"今日は2024年です"'),nl,
  sjis('今日は 2024年 です'),nl,
  sjis('"HP 100でOK! #1 (テスト)"'),nl,
  sjis('2024年1月'),nl,
  sjis('"ソ"'),nl,
  sjis('"彼は\\"元気\\"です"'),nl,
  sjis('今日は"2024"年です'),Buffer.from('!\x05\x00','latin1'),sjis('次の行'),nl,
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(ja).lines,['今日は2024年です','今日は 2024年 です','HP 100でOK! #1 (テスト)','2024年1月','ソ','彼は"元気"です','今日は2024年です','次の行']);
 const zh=Buffer.concat([cmd,
  gbk('"今天是 2024年 OK"'),nl,
  gbk('今天是2024年'),nl,
  gbk('"【""樱""】""「2024年好」"'),nl,
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(zh).lines,['今天是 2024年 OK','今天是2024年','【樱】「2024年好」']);
});
test('reallive: single-character dialogue and choices are kept while bytecode payloads do not leak false positives',()=>{
 const {sjis,gbk}=require('./helpers/engine-fixtures.cjs');
 const ja=Buffer.concat([
  /* command header containing 0x96 0xbc ('名'), line marker with 0x82 0xa0 ('あ'), kidoku with 'い'/'う', int literal with 'あ', store var $\xc8 + op */
  Buffer.from('#\x00\x02\x96\xbc\x01\x00\x00("BGM01")','latin1'),
  Buffer.from('\n\x82\xa0@\x82\xa2!\x82\xa4$\xff\x82\xa0\x00\x00$\xc8\\\x28','latin1'),
  sjis('「おはよう」'),Buffer.from('\n\x01\x00','latin1'),
  sjis('「どちらへ行く？」'),Buffer.from('\n\x02\x00','latin1'),
  sjis('「決めた」'),Buffer.from('\n\x03\x00','latin1'),
  sjis('「そうだね」'),Buffer.from('\n\x04\x00','latin1'),
  /* unquoted single-char dialogue and select choices */
  sjis('え'),Buffer.from('\n\x05\x00','latin1'),
  Buffer.from('#\x00\x02\x00\x00\x02\x00\x00{\n\x06\x00','latin1'),sjis('右'),Buffer.from('\n\x07\x00','latin1'),sjis('左'),Buffer.from('}','latin1'),
  /* quoted single-char choices */
  Buffer.from('#\x00\x02\x00\x00\x02\x00\x00{','latin1'),sjis('"上"'),Buffer.from('\n\x08\x00','latin1'),sjis('"下"'),Buffer.from('}','latin1'),
  /* stray unclosed quote before a real line must not swallow the line */
  Buffer.from('"','latin1'),sjis('「あい」'),Buffer.from('\n\x09\x00','latin1'),
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(ja).lines,['「おはよう」','「どちらへ行く？」','「決めた」','「そうだね」','え','右','左','上','下','「あい」']);
 /* GBK patch single-character choices */
 const zh=Buffer.concat([Buffer.from('#\x00\x02\x00\x00\x02\x00\x00{','latin1'),gbk('"右"'),Buffer.from('\n\x01\x00','latin1'),gbk('"左"'),Buffer.from('}','latin1'),Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(zh).lines,['右','左']);
});
