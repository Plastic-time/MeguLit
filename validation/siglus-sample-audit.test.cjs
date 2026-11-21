/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const audit=require('../tools/engine-sigs/siglus-sample-audit.cjs');
const samples={clannad:'E:/GAL/CLANNAD/SiglusEngine_Steam.exe','summer-pockets':'E:/Steam/steamapps/common/Summer Pockets/SiglusEngine_Steam.exe'};
for(const [game,file] of Object.entries(samples)){
 test('read-only real Siglus sample: '+game,{skip:!fs.existsSync(file)&&'sample not on this PC'},()=>{
  const bytes=fs.readFileSync(file),result=audit.auditBytes(bytes);
  assert.equal(result.fixture,game);assert.equal(result.status,'pinned-static-match');
  assert.equal(result.machine,'x86');assert.equal(result.expectedMatches,true);assert.deepEqual(result.packingMarkers,[]);
  /* Matching layout from an unregistered binary is insufficient for this exact-build audit */
  const changed=Buffer.from(bytes);changed[changed.length-1]^=1;
  const unknown=audit.auditBytes(changed);assert.equal(unknown.signatureMatches,true);
  assert.equal(unknown.fixture,null);assert.equal(unknown.status,'not-qualified');
 });
}
test('malformed PE files fail before matching or allocating section data',()=>{
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(64),Buffer.from('MZ')])assert.throws(()=>audit.auditBytes(bytes));
 const bytes=Buffer.alloc(64);bytes.write('MZ');bytes.writeUInt32LE(0xfffffff0,60);
 assert.throws(()=>audit.auditBytes(bytes),/truncated PE/);
});
test('non-Siglus real-byte fixture windows cannot qualify as Siglus signatures',()=>{
 const S=require('../tools/engine-sigs/siglus-draw.cjs');
 for(const file of ['bgi-draw.json','yuris-draw.json']){
  const fixture=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/engine-sigs',file),'utf8'));
  const hex=[];function collect(value){if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='hex'&&typeof item==='string')hex.push(item);else if(typeof item==='object')collect(item);}}
  collect(fixture);assert.ok(hex.length>0,file+' has byte windows');
  for(const h of hex)assert.equal(S.find([{va:0x401000,code:Buffer.from(h,'hex')}]).ok,false,file);
 }
});
