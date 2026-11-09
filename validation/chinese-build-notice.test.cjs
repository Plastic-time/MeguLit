'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const probe=()=>{const h=Object.create(HookNative.prototype);h.state={};h.trace=()=>{};h.sent=[];h.notify=m=>{h.sent.push(m);Object.assign(h.state,m);};return h;};
// E347: Chinese read as Shift-JIS (Steam Saya with a Chinese patch) counts as a Chinese build; real Japanese never does.
test('garbled Chinese text marks the source as a Chinese build',()=>{
 const h=probe();for(let i=0;i<3;i++)h.languageCheck('寳懐ｯｹ莠・ｯｹ莠・ｼ瑚ｿ呎ｬ｡諸槫−口謌ｦ豢ｳ謌ｻ蒿ｱ亥萱・御ｻ雁ｹｴ隕∽ｸ咲ｦ∝悉');
 assert.equal(h.state.sourceChinese,true);assert.match(h.state.hookMessage,/日文原版启动程序/);
});
test('Japanese text is not flagged',()=>{const h=probe();for(let i=0;i<5;i++)h.languageCheck('余計な不安を煽るかのように、鳥の鳴き声が響いていた。');assert.equal(h.sent.length,0);});
test('the reader shows the notice under the caption',()=>{const src=fs.readFileSync(path.join(__dirname,'../web/reader/modules/hook-panel.js'),'utf8');assert.match(src,/m\.sourceChinese===true\)chineseNotice\(\)/);assert.match(src,/工具 → 日文原版恢复/);});
