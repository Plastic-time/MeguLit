// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Reader}=require('../services/reader.cjs');
const reset=r=>Reader.prototype.clearGameVisuals.call(r);
test('switching games immediately clears all art and choice content, including evicted item ids',()=>{
 const events=[],oldTurns=new Map([['old',1]]),r={emit:(type,m)=>events.push(m),artTurns:oldTurns,drawUi:{items:new Map([['old','x']]),groups:new Map([['g',1]])},latest:7,lookup:3,pageScope:'old',gameUiPreview:{pid:1}};
 reset(r);assert.equal(oldTurns.size,0);assert.equal(r.drawUi,null);assert.equal(r.pageScope,'');assert.equal(r.gameUiPreview,null);assert.equal(r.latest,8);assert.equal(r.lookup,4);assert.deepEqual(events,[{type:'artText',clear:true},{hookSource:null,hookChoices:null,receivedText:false}]);
});
test('late art translation cannot paint a previous game over the new session, even with a reused id',async()=>{
 let finish;const events=[],r={emit:(type,m)=>events.push(m),targetLanguage:()=> 'zh',embedCached:()=>'',baseOptions:()=>({}),chainTranslate:()=>new Promise(resolve=>{finish=resolve;})};
 Object.setPrototypeOf(r,Reader.prototype);const old=Reader.prototype.artText.call(r,{id:'same',visible:true,text:'魔法使い',source:'engine',role:'system'});assert.equal(typeof finish,'function');reset(r);
 await Reader.prototype.artText.call(r,{id:'same',visible:true,text:'女性',source:'engine',role:'name'});finish({text:'巫师'});await old;
 assert.ok(!events.some(m=>m.translation==='巫师'));assert.equal(events.at(-1).role,'name');assert.equal(events.at(-1).translation,'');
});
test('a deferred old UiTracker removal cannot delete a matching new-game item',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const events=[],r={active:()=>true,emit:(type,m)=>events.push(m),artText:m=>events.push(m),gal:{state:{gameStarted:'1'}}};
 const feed=(pid,line,id)=>Reader.prototype.event.call(r,{type:'hookDrawUi',gameProcessId:pid,gameStarted:String(pid),role:'menu',id,line,text:'項目',box:[10,20,80,20],sw:800,sh:600});
 feed(1,1,'one');feed(1,2,'two');feed(2,1,'one');const at=events.length;t.mock.timers.tick(100);assert.equal(events.length,at);assert.equal(r.visualIdentity,'2|2');
});
test('frontend clear removes every current art node immediately and allows a fresh empty session',()=>{
 let cleared=0;const layer={className:'',setAttribute(){},replaceChildren(){cleared++;}},doc={body:{append(){}},head:{append(){}},createElement:tag=>tag==='div'?layer:{}};
 const bridge={},ctx=vm.createContext({document:doc,window:{__tomoyoChinese:bridge},setTimeout(){},requestAnimationFrame(){},Map});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/reader/modules/art-text.js'),'utf8'),ctx);bridge.artText({clear:true});assert.equal(cleared,1);bridge.artText({clear:true});assert.equal(cleared,2);
});
test('a late native embed result is not written into another game using the same bridge',async()=>{
 let finish;const writes=[],owner={hooks:{embedReply:(...a)=>writes.push(a)}};
 const r={gal:owner,targetLanguage:()=> 'zh',embedCached:()=>'',baseOptions:()=>({}),chainTranslate:()=>new Promise(resolve=>{finish=resolve;}),emit(){}};
 Object.setPrototypeOf(r,Reader.prototype);const work=Reader.prototype.embedTranslate.call(r,1,'これは中性の台詞です。');assert.equal(typeof finish,'function');reset(r);finish({text:'旧游戏译文'});await work;assert.deepEqual(writes,[]);
});
