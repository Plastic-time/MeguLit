// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Older BGI scripts (キラ☆キラ): no BurikoCompiledScript magic, header size 0x10, push-string (3) operands are absolute offsets. */
const test=require('node:test'),assert=require('node:assert');
const bgi=require('../services/original-engines/bgi.cjs'),sjis=require('../services/original-engines/kit.cjs').encodeSjis;
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
test('old BGI script lines',()=>{
 const a=Buffer.concat([Buffer.from(sjis('こんにちは')),Buffer.from([0])]),b=Buffer.concat([Buffer.from(sjis('世界')),Buffer.from([0])]);
 const code=Buffer.concat([w(0x10),Buffer.alloc(12),w(3),w(0),w(3),w(0),w(0),w(0),w(0),w(0),w(0),w(0)]);/* two pushes, patched below */
 const at=code.length,c=Buffer.from(code);c.writeUInt32LE(at,0x14);c.writeUInt32LE(at+a.length,0x1c);
 assert.deepStrictEqual(bgi.scriptLines(Buffer.concat([c,a,b])),['こんにちは','世界']);
 assert.strictEqual(bgi.scriptLines(Buffer.alloc(64)),null);
});

test('a debug build\'s source paths are not lines',()=>{
 const strs=['E:\\BURIKOScriptSystem\\Game\\Script\\あいう.txt','こんにちは'].map(s=>Buffer.concat([Buffer.from(sjis(s)),Buffer.from([0])]));
 const code=Buffer.concat([w(0x10),Buffer.alloc(12),w(3),w(0),w(3),w(0),w(0),w(0),w(0),w(0),w(0),w(0)]);
 const at=code.length,c=Buffer.from(code);c.writeUInt32LE(at,0x14);c.writeUInt32LE(at+strs[0].length,0x1c);
 assert.deepStrictEqual(bgi.scriptLines(Buffer.concat([c,...strs])),['こんにちは']);
});
test('scenario archives in an Archive folder beside the exe are found',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),ot=require('../services/original-text.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-bgi-archive-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(path.join(dir,'Archive'));for(const n of ['data01000.arc','data02000.arc'])fs.writeFileSync(path.join(dir,'Archive',n),Buffer.concat([Buffer.from('BURIKO ARC20','latin1'),Buffer.alloc(4)]));
 assert.deepStrictEqual(bgi.arcFiles(dir).map(f=>path.relative(dir,f)),[path.join('Archive','data01000.arc'),path.join('Archive','data02000.arc')]);
 assert.deepStrictEqual(ot.ADAPTERS.bgi.locate(dir),{engine:'bgi',target:dir});
 fs.writeFileSync(path.join(dir,'data01000.arc'),Buffer.from('BURIKO ARC20','latin1'));/* archives beside the exe come first */
 assert.deepStrictEqual(bgi.arcFiles(dir),[path.join(dir,'data01000.arc')]);
});