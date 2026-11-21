// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const cmvs=require('../services/original-engines/cmvs.cjs');
// Independent synthetic archives from Shizuku-in/cmvs-rs. See THIRD-PARTY.md.
const vectors=require('./helpers/cmvs-cpz5-vectors.json');

for(const mode of [8,9])test('CPZ5 packing mode '+mode+' reads both entries and requires a valid index',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cpz5-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bytes=Buffer.from(vectors[mode],'hex'),file=path.join(dir,'script.cpz');
 fs.writeFileSync(file,bytes);
 const entries=cmvs.list(file);
 assert.equal(entries?.length,2);
 for(const [i,entry] of entries.entries()){
  assert.deepEqual(cmvs.read(file,entry),Buffer.from('synthetic CPZ5 payload '+i+(mode===8?'!!!':'')));
 }
 const damaged=path.join(dir,'damaged.cpz');
 bytes[64]^=1;
 fs.writeFileSync(damaged,bytes);
 assert.equal(cmvs.list(damaged),null);
});

// Cpz5Index::write(Mode9) in cmvs-rs, with one root/tail.bin containing the seven bytes below.
test('CPZ5 packing mode 9 preserves trailing bytes after a full word',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cpz5-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'script.cpz');
 fs.writeFileSync(file,Buffer.from(vectors.mode9Tail,'hex'));
 const entries=cmvs.list(file);
 assert.equal(entries?.length,1);
 assert.equal(entries[0].name,'tail.bin');
 assert.deepEqual(cmvs.read(file,entries[0]),Buffer.from([0x00,0x80,0xff,0x7f,0xfe,0x01,0x81]));
});
