'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GalNative}=require('../core/gal-native.cjs');
// E337: re-pick the text stream; 校准当前句 only switches when the current sample is garbled.
function fake(threads){const g=Object.create(GalNative.prototype);g.hooks={state:{hookThreads:threads}};g.state={gameProcessId:1,gameStarted:1};g.started=[];g.userStart=(p,f,id)=>g.started.push(id);return g;}
test('garbled stream is replaced by the best Japanese one',()=>{
 const g=fake([{id:'a',selected:true,sample:'ﾏ｢･ｼﾔﾎ□ｽﾔ邊ﾍうなﾔﾈﾕﾊ'},{id:'b',sample:'由良'},{id:'c',sample:'「ふざけるな、もう帰るからな」'}]);
 assert.equal(g.reselectStream(true).selected,'c');
});
test('a good stream is kept by the calibration check, but the button still moves on',()=>{
 const g=fake([{id:'a',selected:true,sample:'「ふざけるな、もう帰るからな」'},{id:'b',sample:'由良が振り向いた。'}]);
 assert.deepEqual(g.reselectStream(true),{kept:true});
 assert.equal(g.reselectStream(false).selected,'b');
});
