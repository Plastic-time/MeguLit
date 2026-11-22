// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {launch,findBrowser}=require('../services/cardinal/cdp.cjs');
const {startWeb}=require('./library-views-perf.cjs');
const {Reader}=require('../services/reader.cjs'),{LocalLearning}=require('../core/learning-native.cjs');
const {HookNative}=require('../core/hook-native.cjs');

// CLANNAD 2026-11-22 09:44:38Z, reading_events and layoutDiagnostic, including the OCR spelling in the third paragraph.
const notice=['登場する人物・団体・地名・事件および職業などは全て架空の物であり、実在の物とは一切関係ありません。',
 '当社の許諾を得ずに賃貸業に使用すること、私的使用その他法律によって明示的に認められる範囲を超えて、複製、改変、ネットワーク上へのアップロード、Ｐ２Ｐソフトでの交換・送信・頒布することを禁止します。',
 'また、最近動画サイトなどへの避去アップロードが多くなっております。デモ動画を除く本ゲーム内の楽曲や画像、プレイ動画などを無断でアップロードすることはご遠慮ください。'].join('\n');

test('reader restart restores installed status and bounds the recorded opening notice before returning to ordinary dialogue',{skip:!findBrowser()},async t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-reader-restart-'));
 t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const dic=path.join(folder,'sudachidict_full/resources/system.dic');fs.mkdirSync(path.dirname(dic),{recursive:true});fs.writeFileSync(dic,'fixture');
 class FixtureLearning extends LocalLearning{runtimeFolder(){return folder;}}
 let learning;
 const reader=Object.assign(Object.create(Reader.prototype),{active:()=>true,runtime:{learning:()=>learning}});
 const web=await startWeb({call(){}});
 t.after(()=>new Promise(resolve=>web.close(resolve)));
 const browser=await launch({viewport:{width:1600,height:1080}});t.after(()=>browser.close());
 const {page}=browser;
 await page.exposeFunction('restoreReader',()=>reader.message({type:'loadGalPreferences'}));
 await page.addInitScript(()=>{
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
   const r=args?.request||{};
   if(cmd==='service'){
    if(r.action==='home')return {preferences:{language:'ja',themeMode:'dark'},games:[]};
    if(r.action==='reader_bootstrap')return {engines:[],native:{}};
    if(r.message?.type==='loadGalPreferences')return window.restoreReader();
    if(r.action==='reader_message')return {replies:[]};
   }
   return {};
  }};
 });
 for(let boot=0;boot<2;boot++){
  learning=new FixtureLearning(folder);
  await page.goto('http://127.0.0.1:'+web.address().port+'/reader/index.html');
  await page.waitForFunction(()=>window.__TOME_READER_READY__);
  assert.deepEqual(await page.evaluate(()=>{const b=window.__tomoyoChinese;return [b.localLearningReady,b.localLearningProgress,!!document.querySelector('.tomoyo-learning-notice')];}),[true,{stage:'ready',percent:100},false]);
  await page.evaluate(()=>window.__tomoyoChinese.openSettings());
  await page.waitForFunction(()=>document.querySelector('.tomoyo-learning-panel [data-learning-stage]'));
  const panel=await page.evaluate(()=>{
   const p=document.querySelector('.tomoyo-learning-panel');
   return [p.querySelector('[data-learning-progress]').dataset.stage,p.querySelector('[data-learning-status]').textContent];
  });
  assert.deepEqual(panel,['ready','']);
  await page.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());
  await page.waitForFunction(()=>!document.querySelector('.tomoyo-cn-dialog[open]'));
  learning.stop();
 }
 await page.evaluate(text=>{
  const b=window.__tomoyoChinese;window.__tomoyoMode.set('translation');
  b.galLayout({readerX:550,readerY:798,readerWidth:787,readerHeight:188,clientX:177,clientY:53,clientWidth:1243,clientHeight:933});
  b.galStatus({bound:true,hookActive:true,dialogVisible:true,hookSequence:27,hookSourceOrigin:'ocr',hookSource:text});
  document.body.classList.add('tomoyo-gal-bound');
 },notice);
 await page.waitForFunction(()=>document.querySelector('.tomoyo-hook-reader.megulit-ocr-notice .char-token'));
 const metrics=()=>page.evaluate(()=>{
  const win=document.querySelector('.tomoyo-hook-reader'),rect=win.getBoundingClientRect(),tokens=win.querySelectorAll('.char-token');
  return {top:rect.top,bottom:rect.bottom,first:tokens[0].getBoundingClientRect().top,last:tokens[tokens.length-1].getBoundingClientRect().bottom,count:tokens.length,scroll:win.scrollHeight>win.clientHeight+1};
 });
 let box=await metrics();
 t.diagnostic('opening notice '+JSON.stringify(box));
 assert.ok(box.count>=220&&box.bottom<=986&&box.top>=53&&box.first>=53,JSON.stringify(box));
 await page.evaluate(()=>{const b=window.__tomoyoChinese;b.galLayout({...b.galLayoutInfo(),clientHeight:145});});
 await page.waitForFunction(()=>{const w=document.querySelector('.megulit-ocr-notice');return w.scrollHeight>w.clientHeight+1&&w.getBoundingClientRect().bottom<=198;});
 await page.evaluate(()=>{const tokens=document.querySelectorAll('.tomoyo-hook-reader .char-token');tokens[tokens.length-1].scrollIntoView({block:'center'});});
 box=await metrics();assert.ok(box.scroll&&box.last<=198&&box.last>=53,JSON.stringify(box));
 await page.evaluate(()=>{const b=window.__tomoyoChinese;b.galLayout({...b.galLayoutInfo(),clientHeight:933});});
 await page.evaluate(()=>window.__tomoyoChinese.galStatus({hookSourceOrigin:'live',hookSource:'そう、雪だ。',hookSequence:28}));
 await page.waitForFunction(()=>!document.querySelector('.megulit-ocr-notice')&&document.querySelector('.tomoyo-hook-reader .sentence-text')?.textContent.includes('雪'));
 const next=await metrics();assert.ok(next.top>=790&&next.first>=798&&next.last<=986&&next.count===6,JSON.stringify(next));
 t.diagnostic('following dialogue '+JSON.stringify(next));
});

test('reopened CLANNAD replaces the old OCR page and Alt+T re-pick leads to clickable live dialogue',{skip:!findBrowser()},async t=>{
 const web=await startWeb({call(){}});
 t.after(()=>new Promise(resolve=>web.close(resolve)));
 const browser=await launch({viewport:{width:1600,height:1080}});
 t.after(()=>browser.close());
 const {page}=browser;
 const events=[],commands=[];
 let now=20000;
 const hook=new HookNative({native:__dirname},e=>events.push(e),()=>{},()=>now);
 clearInterval(hook.timer);
 hook.trace=()=>{};
 hook.send=m=>commands.push(m);
 const reader=Object.assign(Object.create(Reader.prototype),{active:()=>true,gal:{hooks:hook}});
 await page.exposeFunction('readerHostMessage',r=>reader.message(r));
 await page.addInitScript(()=>{
  window.readerRegions=[];window.lookups=[];window.reselectCalls=[];
  window.fixtureTranslations={
   '俺たちは登り始める。':'我们开始向上走',
   'ひとりきりの登校。':'独自一人去上学',
   '「じゃあ、聴くなっ」':'那就别听！',
  };
  window.__TAURI_INTERNALS__={transformCallback(callback){window.readerEvent=message=>callback({payload:message});return 1;},invoke:async(cmd,args)=>{
   const r=args?.request||{};
   if(cmd!=='service')return {};
   if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};
   if(r.action==='reader_bootstrap')return {engines:[],native:{}};
   const m=r.message;
   if(m?.type==='hookReselect'){
    const request=window.readerHostMessage(m);
    window.reselectCalls.push(request);
    return request;
   }
   if(m?.type==='galHitRegions')window.readerRegions=m.regions;
   if(m?.type==='learningRequest'&&m.command==='lookup_at_position'){
    window.lookups.push(m.args);
    return {replies:[{method:'learningDeliver',args:[m.id,{start:m.args.position,end:m.args.position+1},'']}]};
   }
   const translation=window.fixtureTranslations[m?.text];
   if(Number.isSafeInteger(m?.id)&&!m.type&&translation){
    const target=window.__tomoyoChinese.translationTarget();
    return {replies:[{method:'deliver',args:[m.id,translation,false,'',{target,source:'patch'}]}]};
   }
   return {replies:[]};
  }};
 });
 await page.goto('http://127.0.0.1:'+web.address().port+'/reader/index.html');
 await page.waitForFunction(()=>window.__TOME_READER_READY__);
 const flush=extra=>page.evaluate(batch=>{for(const m of batch)window.readerEvent(m);},[...events.splice(0),...(extra||[])]);
 const bounds={readerX:495,readerY:806,readerWidth:787,readerHeight:188,clientX:248,clientY:64,clientWidth:1243,clientHeight:933};
 const bind=async (gameProcessId,gameStarted,gameHwnd)=>{
  const binding={type:'bound',bound:true,interfaceMode:'translation',gameProcessId,gameStarted,gameHwnd,processName:'SiglusEngine_Steam'};
  hook.configure({bindEnabled:true,hookProfile:'off'},binding);
  await hook.stopPending;
  await flush([binding]);
  await page.evaluate(layout=>{
   window.__tomoyoMode.set('translation');
   window.__tomoyoChinese.galLayout(layout);
   document.body.classList.add('tomoyo-gal-bound');
  },bounds);
 };
 const publish=async (text,origin)=>{now+=2000;hook.emitSource(text,origin);await flush();};
 const rendered=text=>page.waitForFunction(expected=>document.querySelector('.tomoyo-hook-reader .sentence-text')?.__tomeHookText===expected,text,{timeout:5000});
 const previous=notice.split('\n').slice(0,2).join('\n');
 await bind(20668,'639309410009754317','4850222');
 await publish(previous,'ocr');
 await rendered(previous);
 const closed={type:'gameClosed',bound:false,gameProcessId:0,gameStarted:'',gameHwnd:''};
 hook.configure({bindEnabled:true,hookProfile:'off'},closed);
 await hook.stopPending;
 await flush([closed]);
 await bind(75288,'639309411832173120','5505582');
 await publish(notice,'ocr');
 await rendered(notice);
 await page.waitForFunction(()=>document.querySelector('.tomoyo-hook-reader.megulit-ocr-notice .char-token'));

 // Only HookBridge transport is substituted. The actual Alt+T button calls Reader.message and HookNative.
 hook.process={};
 hook.wanted=true;
 await page.evaluate(()=>window.__tomoyoChinese.openSettings());
 await page.waitForFunction(()=>document.querySelector('[data-calibrate-stream]')!==null);
 const calibration=await page.evaluate(()=>window.__tomoyoChinese.galPreferences());
 await page.evaluate(async()=>{
  const button=document.querySelector('[data-calibrate-stream]');
  button.click();
  button.click();
  await Promise.all(window.reselectCalls);
 });
 assert.equal(hook.state.hookReselectState,'waiting');
 await flush();
 assert.equal(commands.filter(m=>m.type==='probeStreams').length,1);
 const waiting=await page.evaluate(()=>document.querySelector('[data-calibrate-stream-status]').textContent);
 assert.match(waiting,/推进一句/);
 assert.deepEqual(await page.evaluate(()=>window.__tomoyoChinese.galPreferences()),calibration);
 await page.evaluate(()=>window.__tomoyoChinese.toggleGalMenu());
 await page.waitForFunction(()=>!document.querySelector('.tomoyo-cn-dialog[open]'));

 for(const text of ['俺たちは登り始める。','ひとりきりの登校。','「じゃあ、聴くなっ」']){
  now+=1800;
  hook.source({type:'hookSource',origin:'live',sourceName:'EmbedSiglus',streamProbe:1,text},'SiglusEngine_Steam');
  await flush();
  await rendered(text);
  await page.waitForFunction(expected=>{
   const output=document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output[data-state=ready]');
   return output?.textContent===window.fixtureTranslations[expected];
  },text,{timeout:5000});
  await page.waitForFunction(()=>{
   const token=document.querySelector('.tomoyo-hook-reader .char-token:not(.tome-typewriter-pending)');
   if(!token)return false;
   const r=token.getBoundingClientRect(),x=(r.left+r.right)*devicePixelRatio/2,y=(r.top+r.bottom)*devicePixelRatio/2;
   return r.width>0&&window.readerRegions.some(h=>!h.pass&&x>=h.x&&x<h.x+h.width&&y>=h.y&&y<h.y+h.height);
  },undefined,{timeout:6000});
  const pos=await page.evaluate(()=>{
   const token=document.querySelector('.tomoyo-hook-reader .char-token:not(.tome-typewriter-pending)'),r=token.getBoundingClientRect();
   return {x:(r.left+r.right)/2,y:(r.top+r.bottom)/2,top:r.top,bottom:r.bottom,history:window.__tomoyoChinese.hookPageLines()};
  });
  assert.deepEqual(pos.history,[]);
  assert.ok(pos.top>=bounds.clientY&&pos.bottom<=bounds.clientY+bounds.clientHeight,JSON.stringify(pos));
  for(const type of ['mousePressed','mouseReleased'])await page.c.send('Input.dispatchMouseEvent',{type,x:pos.x,y:pos.y,button:'left',clickCount:1});
  await page.waitForFunction(expected=>window.lookups.at(-1)?.text===expected&&!!document.querySelector('.tomoyo-selection-card'),text,{timeout:5000});
  await page.evaluate(()=>window.__tomoyoChinese.closeLocalSelection());
 }
 assert.equal(hook.state.hookReselectState,'recovered');
 hook.process=null;
 await hook.stop();
});
