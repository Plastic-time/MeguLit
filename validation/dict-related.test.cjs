// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const {related,tokens}=require('../services/dict-related.cjs');

test('related words: same kanji, same reading, near meaning from saved words, each with its proficiency',()=>{
 const vocab=[{spelling:'悪夢',status:1,definitions:'噩梦'},{spelling:'夢中',status:2,definitions:'着迷，入迷'},{spelling:'熱中',status:0,definitions:'着迷，热衷'}];
 const out=related({query:'夢中',reading:'むちゅう',definition:'着迷，入迷'},{vocab});
 const by=w=>out.find(o=>o.t===w);
 assert.ok(!by('夢中'),'never the query itself');
 assert.equal(by('悪夢')?.why,'kanji');assert.equal(by('悪夢').status,1);
 assert.equal(by('熱中')?.why,'kanji','shares 中');
 assert.ok(out.some(o=>o.why==='kanji'&&o.status===null),'dictionary words not saved yet have no status');
 const h=related({query:'はし',reading:'はし'},{vocab:[]});assert.ok(h.some(o=>o.why==='reading'&&/[橋箸端]/.test(o.t)),'homophones from the local list');
 const n=related({query:'楽しい',definition:'快乐，愉快'},{vocab:[{spelling:'嬉しい',status:0,definitions:'高兴，快乐'}]});assert.equal(n.find(o=>o.t==='嬉しい')?.why,'near');
 assert.ok(out.length<=16);assert.ok(tokens('to dream; 梦想').has('dream'));
});

test('the dictionary field colours glyphs by proficiency and takes related words after a search; the smear has no canvas filter',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','web','dict-idle.js'),'utf8');
 assert.match(s,/fresh:'#[0-9a-f]{6}',learning:'#[0-9a-f]{6}',known:'#[0-9a-f]{6}'/);
 assert.match(s,/call\('dictionary_related'/);assert.doesNotMatch(s,/ctx\.filter=/,'no per-frame canvas filter');
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'dictionary_related'/);
 const g=fs.readFileSync(path.join(__dirname,'..','web','grimoire.js'),'utf8');assert.doesNotMatch(g,/plane\.style\.filter=[^;]*url\(#mg-wall-blur\)/,'no SVG filter on the moving wall');
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','web','dict-impact.js'),'utf8'),/brightness\(/,'no filter animation on the title bar');
});
