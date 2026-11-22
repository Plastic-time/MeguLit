// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sig=require('../tools/engine-sigs/iga-text.cjs'),fixture=require('./fixtures/engine-sigs/iga-text.json');
const bytes=Buffer.from(fixture.bytes,'hex');
test('native IGA cache-before input has one exact executable entry',()=>{assert.deepEqual(sig.find(bytes),[0]);assert.deepEqual(sig.signature().fixed,fixture.fixed);assert.equal(fixture.rva,0x8440);});
test('IGA fixed instructions and truncations fail closed',()=>{for(let i=0;i<bytes.length;i++){assert.deepEqual(sig.find(bytes.subarray(0,i)),[]);if(!fixture.fixed[i])continue;const bad=Buffer.from(bytes);bad[i]^=0x5a;assert.deepEqual(sig.find(bad),[],String(i));}});
test('IGA relocated absolute operands match but ambiguity is retained',()=>{const relocated=Buffer.from(bytes);for(const at of fixture.relocations)relocated.writeUInt32LE((relocated.readUInt32LE(at)+0x20000000)>>>0,at);assert.deepEqual(sig.find(relocated),[0]);assert.deepEqual(sig.find(Buffer.concat([bytes,bytes])),[0,bytes.length]);});
test('IGA native integration remains an explicit private read-only stream',()=>{const native=fs.readFileSync(path.join(__dirname,'../native/megulithook/IgaText.h'),'utf8');assert.match(native,/if\(!Asked\(\)\)return 0/);assert.match(native,/MEGULIT_IGA_TEXT/);assert.match(native,/value\[0\]==L'1'/);assert.match(native,/hp\.offset=regoffset\(ecx\)/);assert.match(native,/hp\.codepage=932/);assert.doesNotMatch(native,/EMBED_ABLE|NO_CONTEXT|MH_CreateHook|ToMe_CHARS/);assert.match(native,/IgaTextPin::Verify/);assert.match(native,/count==1&&found-base==IgaTextSig::EntryRva/);});
