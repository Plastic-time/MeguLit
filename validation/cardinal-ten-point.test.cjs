// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),display=require('../core/cardinal/display.cjs');
test('Cardinal presents exact normalized scores on a ten-point scale',()=>{
 for(const [raw,points] of [[0,0],[0.001,0.01],[0.257,2.57],[0.94,9.4],[0.999,9.99],[0.9999,9.99],[1,10]])assert.equal(display.toPoints(raw),points);
 assert.equal(display.format(0.94),'9.4 / 10');assert.equal(display.format(1),'10 / 10');
});
test('missing and invalid observations remain unknown instead of perfect or zero',()=>{
 for(const value of [undefined,null,'0.94',NaN,Infinity,-0.1,1.01]){assert.equal(display.toPoints(value),null);assert.equal(display.format(value),'未知');}
});
test('display conversion never mutates signed or stored normalized evidence',()=>{
 const raw=Object.freeze({total:0.94,scores:Object.freeze({row:1,stable:0.9,clean:0.999,clear:0.5,choice:0,pair:null,leak:0.94})});
 const before=JSON.stringify(raw),view=display.summary(raw);
 assert.deepEqual(view,{scale:10,total:9.4,scores:{row:10,stable:9,clean:9.99,clear:5,choice:0,pair:null,leak:9.4}});
 assert.equal(JSON.stringify(raw),before);
});
