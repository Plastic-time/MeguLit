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
test('reallive: quoted text keeps embedded ASCII, escapes and Shift-JIS 0x5c trail bytes',()=>{
 const {sjis,gbk}=require('./helpers/engine-fixtures.cjs');
 const nl=Buffer.from('\n\x10\x00','latin1'),cmd=Buffer.from('#\x01\x02\x03\x04\x05\x06\x07("BGM01",1,2)','latin1');
 const ja=Buffer.concat([cmd,
  sjis('"今日は2024年です"'),nl,
  sjis('"今日は 2024年 です"'),nl,
  sjis('"HP 100でOK!"'),nl,
  sjis('"2024年1月"'),nl,
  sjis('"ソ"'),nl,
  sjis('"彼は\\"元気\\"です"'),nl,
  sjis('"A\\\\Bの記録"'),nl,
  sjis('今日は"2024"年です'),nl,
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(ja).lines,['今日は2024年です','今日は 2024年 です','HP 100でOK!','2024年1月','ソ','彼は"元気"です','A\\\\Bの記録','今日は2024年です']);
 const zh=Buffer.concat([cmd,
  gbk('"今天是 2024年 OK"'),nl,
  gbk('"【""樱""】""「2024年好」"'),nl,
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(zh).lines,['今天是 2024年 OK','【樱】「2024年好」']);
 /* long quoted piece (>200 KB) must not throw RangeError on spread */
 const big=Buffer.concat([Buffer.from('"','latin1'),sjis('あ'),Buffer.alloc(200000,0x30),Buffer.from('"','latin1'),nl]);
 assert.equal(rl.parse(big).lines[0].length,200001);
});
test('reallive: quoted single-character lines/choices are kept while unquoted runs stay at base behavior',()=>{
 const {sjis,gbk}=require('./helpers/engine-fixtures.cjs');
 const nl=Buffer.from('\n\x10\x00','latin1');
 const ja=Buffer.concat([
  Buffer.from('#\x01\x02\x03\x04\x05\x06\x07("BGM01")','latin1'),
  sjis('「どうする？」'),nl,
  sjis('「４月１５日」'),nl,
  sjis('「行こう」'),nl,
  /* quoted single-char dialogue and choices must not flip ja/zh vote to Chinese */
  sjis('"え"'),nl,
  Buffer.from('{','latin1'),sjis('"右"'),nl,sjis('"左"'),nl,sjis('"上"'),Buffer.from('}','latin1'),
  /* stray 0x22 in line number (\n\x22\x2a) or int constant ($\xff\x22***) must not open a pure-ASCII quote before a real line */
  Buffer.from('\n\x22\x2a','latin1'),sjis('"「行こう」"'),nl,
  Buffer.from('#\x01\x0a\x00\x00\x00\x02\x00\x00($\xff\x22\x2a\x2a\x2a,','latin1'),sjis('"「行こう」"'),Buffer.from(')','latin1'),nl,
  /* stray unclosed quote before a real line must not swallow the line */
  Buffer.from('"','latin1'),sjis('「あい」'),nl,
  /* unquoted runs keep base behavior: split on ASCII and drop single-char */
  sjis('今日は2024年です'),nl,
  sjis('あ'),nl,
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(ja).lines,['「どうする？」','「４月１５日」','「行こう」','え','右','左','上','「行こう」','「行こう」','「あい」','今日は','年です']);
 /* standalone small Japanese scene: 3 quoted single-kanji choices must not outvote 2 kana lines and flip the date line to GBK */
 const smallJa=Buffer.concat([
  Buffer.from('#\x00\x01\x0a\x00\x00\x00\x00\x00','latin1'),
  sjis('「どうする？」'),nl,sjis('「４月１５日」'),nl,sjis('「行こう」'),nl,
  Buffer.from('#\x00\x02\x01\x00\x03\x00\x00{','latin1'),nl,sjis('"右"'),nl,sjis('"左"'),nl,sjis('"上"'),Buffer.from('}','latin1'),
  Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(smallJa).lines,['「どうする？」','「４月１５日」','「行こう」','右','左','上']);
 const zh=Buffer.concat([Buffer.from('{','latin1'),gbk('"右"'),nl,gbk('"左"'),Buffer.from('}','latin1'),Buffer.alloc(700,0x2c)]);
 assert.deepEqual(rl.parse(zh).lines,['右','左']);
});
test('reallive: score() checks JUNK on double-byte bytes only so kana-less English quoted lines do not mispick the key',()=>{
 const {sjis}=require('./helpers/engine-fixtures.cjs');
 const nl=Buffer.from('\n\x10\x00','latin1'),line=s=>Buffer.concat([sjis(s),nl]);
 const head=Buffer.concat([Buffer.from('#\x01\x02\x03\x04\x05\x06\x07(1,2)','latin1'),Buffer.alloc(245,0x2c)]);
 const inReg=Buffer.concat([head,line('"「よし」"'),line('"理樹 VS 真人"'),line('"謙吾 VS 恭介"'),line('"Lv 5 鈴"'),line('"HP 100 最大"')]);
 const reg=inReg.length<560?Buffer.concat([inReg,Buffer.alloc(560-inReg.length,0x2c)]):inReg;
 const body=Buffer.concat([reg,line('「あい」'),line('「あいう」'),line('「いう」'),line('「あう」'),Buffer.alloc(200,0x2c)]);
 const dec=rl.bytecode(scenario(body,110002,'little-busters'),null);
 assert.ok(dec);
 assert.deepEqual(rl.parse(dec).lines,['「よし」','理樹 VS 真人','謙吾 VS 恭介','Lv 5 鈴','HP 100 最大','「あい」','「あいう」','「いう」','「あう」']);
});
test('reallive: score() preserves base double-byte junk penalty across unclosed 0x22 when auto-picking keys',()=>{
 const xorKey=(buf,key)=>{const d=Buffer.from(buf);for(const [k,off,len] of key)for(let i=0;i<len&&off+i<d.length;i++)d[off+i]^=k[i%16];return d;};
 const plain=Buffer.alloc(429,0x2c),junk=Buffer.from([0xaa,0x99,0x22,0x9b,0x5b]);
 const ex=xorKey(Buffer.alloc(429),rl.KEYS['little-busters-ex']),lb=xorKey(Buffer.alloc(429),rl.KEYS['little-busters']);
 for(let j=0;j<junk.length;j++)plain[399+j]=junk[j]^ex[399+j]^lb[399+j];
 const dec=rl.bytecode(scenario(plain,1110002,'little-busters-ex'),null);
 assert.ok(dec);
 assert.deepEqual(dec,plain);
});
