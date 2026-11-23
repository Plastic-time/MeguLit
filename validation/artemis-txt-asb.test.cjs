// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const scenes=require('../services/original-engines/scenes.cjs');
function asb(items){const parts=[Buffer.from('ASB\0\0'),u32(items.length)];const str=s=>{const b=Buffer.from(s,'utf8');return Buffer.concat([u32(b.length),b,Buffer.from([0])]);};
 for(const it of items){if(it.label){parts.push(u32(1),str(it.label));continue;}parts.push(u32(0),str(it.cmd),u32(1),u32(Object.keys(it.a||{}).length));for(const [k,v] of Object.entries(it.a||{}))parts.push(str(k),str(v));}
 return Buffer.concat(parts);}
function u32(v){const b=Buffer.alloc(4);b.writeUInt32LE(v);return b;}
function pf8(files){const names=Object.keys(files);let idx=[u32(names.length)];let size=4;for(const n of names)size+=4+Buffer.byteLength(n)+4+8;size+=4+8*names.length+8;
 let off=7+size;const data=[];const ents=[];for(const n of names){const nb=Buffer.from(n);ents.push(Buffer.concat([u32(nb.length),nb,u32(0),u32(off),u32(files[n].length)]));data.push(files[n]);off+=files[n].length;}
 const index=Buffer.concat([u32(names.length),...ents,u32(0),Buffer.alloc(8*names.length+8)]);const key=crypto.createHash('sha1').update(index).digest();
 const enc=data.map(b=>{const c=Buffer.from(b);for(let i=0;i<c.length;i++)c[i]^=key[i%20];return c;});
 const head=Buffer.alloc(7);head.write('pf8');head.writeUInt32LE(index.length,3);return Buffer.concat([head,index,...enc]);}
test('Artemis plain-text scenario/*.txt inside a pf8 archive',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'art-'));
 const txt='*start\r\n; comment\r\n[name 春香]\r\n「おはよう、今日はいい天気だね」[r]\r\nそう言って笑った。\r\n\r\n[sel_text text="右へ行く"]\r\n[bg file="a.png"]\r\n';
 fs.writeFileSync(path.join(dir,'root.pfs'),pf8({['system\\readme.txt']:Buffer.from('not a scenario'),['scenario\\s01.txt']:Buffer.from(txt,'utf8')}));
 const list=scenes.ENGINES.artemis.scenes(dir);assert.deepStrictEqual(list.map(s=>s.name),['s01.txt']);
 const p=scenes.ENGINES.artemis.parse(list[0].read());
 assert.deepStrictEqual(p.lines,['「おはよう、今日はいい天気だね」\nそう言って笑った。','右へ行く']);
 fs.rmSync(dir,{recursive:true,force:true});});
test('Artemis compiled .asb: print runs, ruby base, sel_text',()=>{
 const b=asb([{label:'top'},{cmd:'name',a:{'0':'春香'}},{cmd:'print',a:{data:'今日は'}},{cmd:'ruby',a:{text:'いい'}},{cmd:'print',a:{data:'良い'}},{cmd:'/ruby'},{cmd:'print',a:{data:'天気だね'}},{cmd:'p'},{cmd:'sel_text',a:{text:'帰る'}}]);
 const p=scenes.ENGINES.artemis.parse(b);assert.deepStrictEqual(p.lines,['今日は良い天気だね','帰る']);});
test('Artemis Lua .ast still goes through parseAst',()=>{
 const p=scenes.ENGINES.artemis.parse(Buffer.from('astver = 2.0\nast = { block_00000 = { {"text"}, text = { "こんにちは" } } }','utf8'));assert.ok(p.lines.includes('こんにちは'));});
test('loose scenario/*.txt without Artemis evidence is not claimed',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'art-'));fs.mkdirSync(path.join(dir,'scenario'));fs.writeFileSync(path.join(dir,'scenario','a.txt'),'あいう');
 assert.strictEqual(scenes.ENGINES.artemis.scenes(dir).length,0);fs.writeFileSync(path.join(dir,'scenario','main.iet'),'x');
 assert.strictEqual(scenes.ENGINES.artemis.scenes(dir).length,1);fs.rmSync(dir,{recursive:true,force:true});});
