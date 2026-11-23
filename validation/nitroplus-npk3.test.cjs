// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// NPK3 (You and Me and Her / 君と彼女と彼女の恋。 Steam, MwareStuff NPK3Tool layout): NPK2 with zstd segments.
// Synthetic archive from the spec; no game text.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const npk=require('../core/nitroplus-npk.cjs'),engine=require('../services/original-engines/npk.cjs');
const {probeGame}=require('../services/adapter-probe-core.cjs');
const KEY=Buffer.from(require('../services/original-engines/nitro-schemes.json').npk2['You and Me and Her'],'hex');
const hasZstd=typeof zlib.zstdCompressSync==='function';

/* compiled Squirrel string literals: 0x08000010, u32 length, UTF-8 */
const lit=s=>{const b=Buffer.from(s,'utf8'),h=Buffer.alloc(8);h.writeUInt32LE(0x08000010,0);h.writeUInt32LE(b.length,4);return Buffer.concat([h,b]);};
function nut(n){const parts=[Buffer.from('SCRPRIQS'),lit('CreateTexture')];
 for(let i=0;i<n;i++){parts.push(lit(i%2?`\r\n地の文その${i}、ここは合成テスト用の文章です。`:`//【テスト${i%3}】\r\n<voice name='テスト' src='voice/a00/${i}'>\r\n「台詞その${i}、合成テストです」`),Buffer.alloc(32,i&0xff));}
 return Buffer.concat(parts);}

test('NPK3 archive round-trips with zstd segments',{skip:!hasZstd},()=>{
 const big=Buffer.alloc(200000,'あいう');
 const buf=npk.createNpk({'media/script/nut/a0001.nut':nut(4),'media/big.bin':big},{key:KEY,major:3});
 assert.equal(buf.toString('latin1',0,4),'NPK3');
 const arc=npk.readNpkAny(buf);assert.equal(arc.major,3);
 assert.ok(npk.npkData(arc,arc.entries[1]).equals(big));});

test('NPK3 script.npk: found by key, scenes parsed, probe ok',{skip:!hasZstd},t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npk3-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const files={'media/script/nut/a0001.nut':nut(80),'media/script/nut/a0002.nut':nut(80),'media/script/lang/en/nut/a0001.nut':nut(2),'media/script/system/boot.nut':Buffer.from('SCRP')};
 fs.writeFileSync(path.join(dir,'script.npk'),npk.createNpk(files,{key:KEY,major:3}));fs.writeFileSync(path.join(dir,'totono_Steam.exe'),'MZ');
 const k=engine.findKey(path.join(dir,'script.npk'));assert.ok(k,'key found');
 const sc=engine.engine.scenes(dir);assert.deepEqual(sc.map(s=>s.name),['a0001.nut','a0002.nut']);
 const r=engine.engine.parse(sc[0].read());
 assert.equal(r.lines[0],'テスト0');assert.equal(r.lines[1],'「台詞その0、合成テストです」');assert.equal(r.lines[2],'地の文その1、ここは合成テスト用の文章です。');
 const res=probeGame({dir,executable:path.join(dir,'totono_Steam.exe'),title:'君と彼女と彼女の恋。'});
 assert.equal(res.step,'ok',res.detail);assert.equal(res.detected,'nitro-npk');assert.ok(res.lines>=200,String(res.lines));});
