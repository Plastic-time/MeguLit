'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Blowfish,piWords}=require('../services/original-engines/blowfish.cjs');
// E356: Blowfish with pi computed at run time (CatSystem2 key material).
test('Blowfish matches the reference vector and pi digits',()=>{
 assert.deepEqual(piWords(4).map(x=>x.toString(16)),['243f6a88','85a308d3','13198a2e','3707344']);
 assert.deepEqual(new Blowfish(Buffer.alloc(8)).encrypt(0,0).map(x=>x.toString(16)),['4ef99745','6198dd78']);
 const v=Buffer.from('b37963a3b91d9f9bd35b78b96827c9f1','hex');new Blowfish(Buffer.from('Frontwing')).decryptBuffer(v);
 assert.equal(v.toString('latin1').replace(/\0+$/,''),'FW-L3EY8BDY','ISLAND V_CODE decrypts with KEY_CODE ^ 0xCD');
});
