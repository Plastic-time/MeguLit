'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('E460 the all-ages examples switch exists, is on by default, and the grammar report drops explicit lines when it is on',()=>{
 assert.equal(require('../services/native-defaults.cjs').safe_examples,true);
 const {fields}=require('../services/settings-schema.cjs');assert.ok(fields.some(f=>f.key==='safe_examples'&&f.type==='boolean'));
 const g=require('../services/grammar.cjs');assert.ok(g.isExplicit('行人のオチ●ポ優しくてぇ'));assert.ok(!g.isExplicit('僕、足速いっす！'));
 const src=fs.readFileSync(path.join(__dirname,'..','services','grammar.cjs'),'utf8');assert.match(src,/safe_examples!==false/);assert.match(src,/v\.filter\(e=>!isExplicit\(e\?\.text\)\)/);
});
