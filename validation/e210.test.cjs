// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');

test('two registered works keep independent prompts and explicit clearing affects only one',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-prompts-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'config');fs.mkdirSync(folder);
 const {Reader}=require('../services/reader.cjs'),events=[];
 const reader=new Reader({root,folder,emit:(_,event)=>events.push(event)});
 reader.setWorkPrompt('game-a');reader.saveWorkPrompt('game-a','人物A：保留原名');
 reader.setWorkPrompt('game-b');assert.equal(reader.workPrompt,'');
 reader.saveWorkPrompt('game-a','stale draft from previous work');
 reader.saveWorkPrompt('game-b','Keep this work’s own terminology');
 reader.setWorkPrompt('game-a');assert.equal(reader.workPrompt,'人物A：保留原名');
 reader.saveWorkPrompt('game-a','');reader.setWorkPrompt('game-b');
 assert.equal(reader.workPrompt,'Keep this work’s own terminology');
 assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(folder,'game-translation-prompts.json'),'utf8'))),['game-b']);
 assert.equal(events.at(-1).key,'game-b');
});
test('a work prompt augments the default instructions and separates translation cache entries',async()=>{
 const {createTranslationService}=require('../core/providers.cjs'),calls=[];
 const translator=createTranslationService(async(url,request)=>{
  calls.push(JSON.parse(request.body));
  return {ok:true,json:async()=>({choices:[{message:{content:'译文'}}]})};
 },'fixture-key');
 const common={provider:'gpt',contextEnabled:false};
 await translator.translate('同じ原文',{...common,translationPrompt:'人名译成甲'});
 await translator.translate('同じ原文',{...common,translationPrompt:'人名译成甲'});
 await translator.translate('同じ原文',{...common,translationPrompt:'人名译成乙'});
 assert.equal(calls.length,2);
 assert(calls[0].messages[0].content.includes('只输出译文。'));
 assert(calls[0].messages[0].content.endsWith('人名译成甲'));
 assert(calls[1].messages[0].content.endsWith('人名译成乙'));
});
test('a scene cut fades the previous line and stale hook redraws cannot bring it back',()=>{
 const {Immersion}=require('../core/immersion.cjs'),events=[];let now=5000;
 const immersion=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 immersion.configure({immersion:true,dialogDetection:'marker'});
 immersion.bind('new-window');immersion.source('前のセリフ','unity');
 now+=45000;immersion.tick();assert.deepEqual(events,[]);
 immersion.scene(false);immersion.source('前のセリフ','unity');immersion.marker(true);immersion.tick();
 assert.deepEqual(events,[false]);
 immersion.source('次のセリフ','unity');assert.deepEqual(events,[false],'E277: a new line waits until it is on screen');
 immersion.marker(true);assert.deepEqual(events,[false,true]);
 immersion.scene(false);immersion.scene(true);assert.deepEqual(events,[false,true,false,true]);
});
test('held fast-forward hides the reading layer after a threshold and waits for a fresh line',()=>{
 const {Immersion}=require('../core/immersion.cjs'),events=[];let now=1000;
 const immersion=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 immersion.configure({immersion:true});immersion.source('元の文字','hook');
 immersion.skip(true);now+=100;immersion.tick();assert.deepEqual(events,[]);
 now+=300;immersion.tick();immersion.source('途中','hook');immersion.skip(false);immersion.tick();
 assert.deepEqual(events,[false]);immersion.source('次の文字','hook');assert.deepEqual(events,[false]);now+=700;immersion.tick();assert.deepEqual(events,[false,true],'shown after 0.7 s without other signals');
});
test('choice colours follow selected state and the OCR preview never claims a choice state',()=>{
 const {uiItems}=require('../core/game-ui.cjs'),common={text:'続ける',x:.2,y:.3,width:.4,height:.05,font:'Yu Mincho',color:'#101010',originalHidden:true};
 const prefs={choiceSelectedColor:'#e0a0a0',choiceUnselectedColor:'#b5b5b5',choiceFont:'yuGothic'};
 const [selected,unselected]=uiItems([{...common,selected:true},{...common,selected:false},{...common},{...common,selected:true,originalHidden:false}], 'choice',prefs);
 assert.equal(uiItems([common],'choice',prefs).length,0);
 assert.equal(selected.color,'#e0a0a0');assert.equal(unselected.color,'#b5b5b5');assert.equal(selected.font,'Yu Gothic');
 assert.deepEqual(uiItems([{...common,selected:true}]),[{text:'続ける',x:.2,y:.3,width:.4,height:.05}]);
 assert.equal(uiItems([{...common,x:.9}]).length,0);
});
test('generated Alt+T keeps neutral work status, independent colour folds and a bounded log first paint',()=>{
 const module=name=>fs.readFileSync(path.join(__dirname,'../web/reader/modules',name+'.js'),'utf8');
 const header=module('game-style-sync-ui'),menu=module('menu-layout'),log=module('backlog'),interaction=module('interaction');
 assert.match(header,/使用已保存设置/);assert.doesNotMatch(header,/当前正在使用「\{game\}」/);
 assert.match(menu,/已读 \/ 未读设置/);assert.match(menu,/已选 \/ 未选设置/);
 assert.match(log,/matched\.slice\(-pageSize\)/);assert.match(log,/pageSize=20/);
 assert.match(interaction,/maxWait=700/);assert.match(log,/\},220\)/);
});
test('desktop overlay region stays independent of the game window',()=>{
 const module=name=>fs.readFileSync(path.join(__dirname,'../web/reader/modules',name+'.js'),'utf8');
 assert.doesNotMatch(module('interaction'),/leftBound|rightBound|megulit-client-clip/);
 assert.match(module('interaction'),/Math.min\(innerWidth,r.right\+side\)/);
 assert.match(module('gal'),/galTranslationLineHeight/);
});

// E277 (user, 2026-11-09): the layer hid late into transitions, and a line read during a black-screen transition showed
// before the game drew it. Hide 0.6 s after the wait marker leaves; while hidden, show a new line once it is on screen.
test('auto-hide follows the marker quickly and a hidden layer waits for the next line to be drawn',()=>{
 const {Immersion}=require('../core/immersion.cjs'),events=[];let now=1000;
 const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('w');im.source('短い台詞','hook');
 now+=500;im.marker(true);im.tick();now+=2000;im.marker(false);
 now+=500;im.tick();assert.deepEqual(events,[],'not yet');now+=150;im.tick();assert.deepEqual(events,[false],'hidden 0.6 s after the marker left');
 im.source('黒画面の独白','hook');now+=300;im.tick();assert.deepEqual(events,[false],'read but not drawn yet');
 im.marker(true);assert.deepEqual(events,[false,true],'shown once the game draws it');
});
