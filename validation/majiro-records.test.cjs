/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const R=require('../services/original-engines/majiro-records.cjs'),M=require('../services/original-engines/majiro.cjs');
const F=require('./helpers/engine-fixtures.cjs'),fixture=require('./fixtures/games/majiro/records.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const on=b=>R.readRecords(b,{enabled:true});
function rawObject(code){const out=Buffer.alloc(32+code.length);out.write('MajiroObjV1.000\0','latin1');out.writeUInt32LE(code.length,28);code.copy(out,32);return out;}

test('Majiro structured source is off until boolean opt-in, and has no live role claim',()=>{
 for(const options of [undefined,{}, {enabled:false},{enabled:1},{enabled:'true'}]){
  const r=R.readRecords(null,options);assert.equal(r.enabled,false);assert.equal(r.live,false);assert.equal(r.complete,false);assert.deepEqual(r.messages,[]);assert.equal(r.error,null);
 }
 assert.equal(on(Buffer.from('not Majiro')).error.reason,'invalid-object');assert.equal(on('text').error.reason,'not-buffer');
});

test('plain and encrypted Majiro replay keeps script text, literals and repeated lines separate',()=>{
 for(const encrypted of [false,true]){
  const bytes=F.mjo(fixture.ops,{encrypted}),r=on(bytes);assert.equal(r.complete,true);assert.equal(r.error,null);assert.equal(r.live,false);
  assert.deepEqual(r.messages.map(x=>x.text),fixture.messages);assert.deepEqual(r.literals.map(x=>x.text),fixture.literals);
  assert.equal(r.messages.filter(x=>x.text==='同じ文です').length,2);
  for(const record of [...r.messages,...r.literals]){assert.equal(record.role,'unknown');assert.ok(record.offset<record.end);assert.ok(record.end<=M.objHeader(bytes).code.length);}
  assert.equal(r.controls.filter(x=>x.value==='n').length,1);assert.ok(r.messages[0].fragments.length===3);
 }
});

test('literal font/menu labels are not body and quoted names do not invent role evidence',()=>{
 const r=on(F.mjo([['ldstr','名前'],['ldstr','設定'],['text','名前「本文」'],['proc']]));
 assert.deepEqual(r.messages.map(x=>x.text),['名前「本文」']);assert.deepEqual(r.literals.map(x=>x.text),['名前','設定']);
 assert.ok(r.messages.every(x=>x.role==='unknown'));assert.equal(r.messages[0].speaker,undefined);
 const old=M.parse(F.mjo([['ldstr','ＭＳ ゴシック'],['ldstr','設定']]));assert.deepEqual(old.lines,['ＭＳ ゴシック','設定']);
 assert.deepEqual(on(F.mjo([['ldstr','ＭＳ ゴシック'],['ldstr','設定']])).messages,[]);
});

test('operand bytes resembling text opcodes never become script text',()=>{
 const r=on(F.mjo([['ldc',0x00000840],['alloca',[0x40,8]],['switch',[0x00000840]],['text','本文'],['proc']]));
 assert.equal(r.complete,true);assert.deepEqual(r.messages.map(x=>x.text),['本文']);
});

test('unknown and malformed bytecode stop at the instruction boundary and drop pending fragments',()=>{
 const prefix=M.objHeader(F.mjo([['text','確定'],['proc'],['text','未確定']])).code;
 for(const [tail,reason] of [
  [Buffer.from('ffff','hex'),'unknown-opcode'],[Buffer.from('40','hex'),'truncated-opcode'],
  [Buffer.from('0008ff','hex'),'truncated-operand'],[Buffer.from('4008ff','hex'),'truncated-length'],
  [Buffer.from('40080000','hex'),'invalid-string'],[Buffer.from('4008020041','hex'),'invalid-string'],
  [Buffer.from('400802004142','hex'),'invalid-string'],[Buffer.from('40080300410000','hex'),'embedded-nul'],
  [Buffer.from('400802008100','hex'),'invalid-cp932'],[Buffer.from('29080100','hex'),'truncated-table']
 ]){
  const r=on(rawObject(Buffer.concat([prefix,tail])));assert.equal(r.complete,false,reason);assert.deepEqual(r.messages.map(x=>x.text),['確定'],reason);assert.deepEqual(r.error,{offset:prefix.length,reason});
 }
});

test('synthetic object truncation is rejected at every byte of its declared body',()=>{
 const bytes=F.mjo(fixture.ops,{encrypted:false});for(let n=0;n<bytes.length;n++)assert.equal(on(bytes.subarray(0,n)).complete,false,String(n));
});

const sample=process.env.MEGULIT_MAJIRO_DIR||'H:/MeguLit-Work/samples/majiro-himeko/narci_himeko';
test('owned Himeko corpus matches pinned archive and all 50 strict opcode walks',{skip:!fs.existsSync(path.join(sample,'scenario.arc'))&&'owned sample absent'},()=>{
 const receipt=require('../side-session-notes/re-majiro-source-evidence.json'),arc=fs.readFileSync(path.join(sample,'scenario.arc'));
 assert.equal(sha(arc),receipt.archive.sha256);assert.equal(arc.length,receipt.archive.size);assert.equal(sha(fs.readFileSync(path.join(sample,receipt.exe.name))),receipt.exe.sha256);
 const entries=M.arcList(arc).filter(x=>/\.mjo$/i.test(x.name));assert.equal(entries.length,50);assert.equal(receipt.scenes.length,50);
 let total=0;for(const expected of receipt.scenes){const e=entries.find(x=>x.name===expected.name);assert.ok(e);assert.equal(e.offset,expected.offset);assert.equal(e.size,expected.size);
  const bytes=arc.subarray(e.offset,e.offset+e.size),r=on(bytes);assert.equal(sha(bytes),expected.sha256,e.name);assert.equal(r.complete,true,e.name);assert.equal(r.error,null,e.name);
  for(const field of ['messages','literals','controls'])assert.equal(r[field].length,expected[field],e.name+' '+field);
  const digest=rows=>sha(Buffer.from(JSON.stringify(rows.map(x=>[x.offset,x.end,x.text]))));assert.equal(digest(r.messages),expected.textDigest,e.name);assert.equal(digest(r.literals),expected.literalDigest,e.name);
  assert.equal(M.parse(bytes).lines.length,expected.legacyLines,e.name);total+=r.messages.length;
 }
 assert.equal(total,12773);const menu=receipt.scenes.find(x=>x.name==='menu.mjo');assert.equal(menu.messages,0);assert.equal(menu.literals,43);assert.equal(menu.legacyLines,9);
});
