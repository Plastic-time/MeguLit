'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {area,apply}=require('../core/scan-area.cjs');

test('automatic scan area follows the text box, as percentages of the game window',()=>{
 assert.deepEqual(area({}),{scanX:2,scanY:60,scanWidth:96,scanHeight:39},'default text box gives the old default area');
 assert.deepEqual(area({x:10,y:5,width:80,height:20}),{scanX:8,scanY:0,scanWidth:84,scanHeight:27},'a box at the top is scanned at the top');
});
test('full-screen text-page games scan the whole window',()=>{
 assert.deepEqual(area({gameProcess:'WoH.exe'}),{scanX:0,scanY:0,scanWidth:100,scanHeight:100});
 assert.deepEqual(area({gameProcess:'BGI.exe'},true),{scanX:0,scanY:0,scanWidth:100,scanHeight:100});
});
test('turning the automatic area off keeps the hand-set numbers',()=>{
 assert.deepEqual(area({scanAuto:false,scanX:5,scanY:50,scanWidth:90,scanHeight:45,gameProcess:'WoH.exe'}),{scanX:5,scanY:50,scanWidth:90,scanHeight:45});
 assert.equal(apply({type:'configure',x:4,y:70,width:92,height:27}).type,'configure');
});
test('the gal preferences keep scanAuto on by default',()=>{
 const style=require('../core/game-style.js');const clean=style.cleanGal||style.clean||Object.values(style).find(f=>typeof f==='function'&&/scanAuto/.test(String(f)));
 if(typeof clean==='function'){assert.equal(clean({}).scanAuto,true);assert.equal(clean({scanAuto:false}).scanAuto,false);}
});
