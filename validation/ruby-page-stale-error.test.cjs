// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/reader/modules/gal.js'),'utf8');
const method=source.slice(source.indexOf('  function reportRubyFailure('),source.indexOf('  // Furigana must appear'));
function rig(){
 let reject,resolve;const pending=new Promise((a,b)=>{resolve=a;reject=b;}),events=[];
 const sentence={isConnected:true,text:'旦那さまでございます。',closest:()=>true};
 const context=vm.createContext({renderSerial:0,preferences:{furigana:true},dialogFields:null,tokenCache:new Map(),rubyTargets:()=>[sentence],sourceText:s=>s.text,rubyTokens:()=>pending,updateLineRuby:()=>{},paint:(...args)=>events.push(['paint',...args]),clearRuby:s=>events.push(['clear',s]),bridge:{options:()=>({}),learningStatus:m=>events.push(['status',m]),islandPage:{refresh:()=>events.push(['refresh'])}}});
 vm.runInContext(method+'\nthis.update=updateRuby;',context);
 return {sentence,context,events,reject,resolve,update:()=>context.update()};
}
test('late failure from a previous page does not erase the current page ruby or post an obsolete error',async()=>{
 const h=rig(),work=h.update();h.context.renderSerial++;h.sentence.text='次のページはもう描かれている。';h.reject(Error('Sudachi 本地分词失败'));
 await work;assert.deepEqual(h.events,[]);
});
test('a removed sentence and a disabled ruby setting reject late failures',async()=>{
 for(const change of [h=>{h.sentence.isConnected=false;},h=>{h.context.preferences.furigana=false;}]){
  const h=rig(),work=h.update();change(h);h.reject(Error('old failure'));await work;assert.deepEqual(h.events,[]);
 }
});
test('current page errors reach settings without changing dictionary status, and successful tokens repaint the page',async()=>{
 const bad=rig(),work=bad.update();bad.reject(Error('current failure'));await work;
 assert.equal(bad.events[0][0],'clear');assert.equal(bad.events[1][1].learningRubyError,'current failure');
 assert.deepEqual(Object.keys(bad.events[1][1]),['learningRubyError']);
 const good=rig(),done=good.update();good.resolve([{surface:good.sentence.text}]);await done;
 assert.deepEqual(good.events.map(event=>event[0]),['paint','refresh']);
});
test('a pending successful request cannot paint readings after furigana has been turned off',async()=>{
 const h=rig(),work=h.update();h.context.preferences.furigana=false;h.resolve([{surface:h.sentence.text}]);await work;assert.deepEqual(h.events,[]);
});
