// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../web/reader/modules/hook-reader.js'),'utf8');
function rig(){let now=10000;const bridge={galStatus(){}},document={documentElement:{},body:{classList:{toggle(){}}},head:{append(){}},createElement:()=>({}),querySelectorAll:()=>[],querySelector:()=>null};const window={__tomoyoChinese:bridge};vm.runInNewContext(source,{window,document,Date:{now:()=>now},MutationObserver:class{observe(){}},setTimeout,clearTimeout,requestAnimationFrame(){}});bridge.galStatus({hookActive:true});return {bridge,tick:ms=>{now+=ms;},source(text){bridge.galStatus({hookSource:text,hookSourceEngine:'fixture'});},hide(){bridge.galStatus({dialogVisible:false,reason:'window'});},show(){bridge.galStatus({dialogVisible:true});},chars:()=>bridge.hookReaderStatus().chars};}
const old='これは旧作品の保留行です。',next='これは新作品の保留行です。';
for(const boundary of [{hookSource:null,hookChoices:null,receivedText:false},{type:'gameClosed'}]){
 const name=boundary.type||'hookSource:null';
 test(name+' discards a held old-game line before another game becomes visible',()=>{const r=rig();r.hide();r.tick(900);r.source(old);assert.equal(r.chars(),0);assert.equal(r.bridge.hookHiddenHeld,1);r.bridge.galStatus(boundary);r.show();assert.equal(r.chars(),0);});
 test(name+' resets held keys so only a new-game held line may be released',()=>{const r=rig();r.hide();r.tick(900);r.source(old);r.source('これは旧作品の別行です。');r.bridge.galStatus(boundary);r.hide();r.tick(900);r.source(next);assert.equal(r.chars(),0);r.show();assert.equal(r.chars(),next.length);});
 test(name+' resets hidden-window timing before the new-game first line',()=>{const r=rig();r.hide();r.tick(900);r.source(old);r.bridge.galStatus(boundary);r.source(next);assert.equal(r.chars(),next.length);});
}
test('same-game CG hide/show still releases its single held dialogue line',()=>{const r=rig();r.hide();r.tick(900);r.source(next);assert.equal(r.chars(),0);r.show();assert.equal(r.chars(),next.length);});
