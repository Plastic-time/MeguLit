// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const TP=require('../core/text-paths.cjs');
const tape=require('./helpers/renpy-live-capture.cjs');
test('actual isolated 8.4 native capture: twelve distinct Japanese glyph lines hide and restore',()=>{
 const records=tape.lines.map(raw=>TP.parseChars(raw.replace(/\x1f/g,'\n')));
 assert.ok(records.every(Boolean),'every actual native record must parse');
 const body=records.filter(r=>!r.role);
 assert.deepEqual([...new Set(body.filter(r=>r.hidden).map(r=>r.line))],Array.from({length:12},(_,i)=>i+1));
 for(const r of body){assert.equal(r.engine,'renpy');assert.equal(r.sw,1280);assert.equal(r.sh,720);assert.equal([...r.text].length,r.rects.length);assert.ok(r.rects.every(q=>q.every(Number.isFinite)&&q[2]>0&&q[3]>0));}
 assert.equal(body.at(-1).line,12);assert.equal(body.at(-1).hidden,false,'event reset eventually restores original rendering, not synchronous ACK');
 assert.ok(body.some(r=>r.emb===2));
 assert.ok(body.every(r=>!r.text.includes('柔和的光')),'native body remains Japanese through replacement and restoration');
});
test('actual isolated choice screen: semantic name and action-bound captions preserve separate boxes',()=>{
 const records=tape.lines.map(raw=>TP.parseChars(raw.replace(/\x1f/g,'\n')));
 const choices=records.filter(r=>r.role==='choice'&&r.text);
 assert.deepEqual(choices.map(r=>[r.id,r.text]),[['C:0','本を読む'],['C:1','窓を見る']]);
 assert.ok(choices[0].box[1]<choices[1].box[1]);assert.ok(choices.every(r=>r.hidden===false));
 assert.ok(records.some(r=>r.role==='choice'&&r.id==='C:'&&!r.text),'choice completion clears its snapshot');
 assert.ok(records.some(r=>r.role==='name'&&r.text==='魔法使い'));
});
