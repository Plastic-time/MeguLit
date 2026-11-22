// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const key = 'fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3';
const profile = require('../core/profiles/index.cjs').profileFor({exeSha256:key});
let chromium;
try { ({chromium} = require(process.env.MEGULIT_PLAYWRIGHT || 'H:/MeguLit-Work/pw/node_modules/playwright-core')); } catch {}

test('Senren ADV keeps the first clickable glyph on its game row across a turn and late translation', {skip:!chromium, timeout:60000}, async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1920,height:1080}});
    await page.route('http://reader.test/**', route => {
      const asset = path.join(__dirname, '../web', new URL(route.request().url()).pathname);
      return fs.existsSync(asset) ? route.fulfill({path:asset}) : route.fulfill({status:404});
    });
    await page.addInitScript(() => {
      let handler;
      window.__TAURI_INTERNALS__ = {
        transformCallback(fn) { handler=fn; return 1; },
        async invoke(cmd, args) {
          if (args?.event==='reader-event') {
            const listener=handler;
            window.readerEvent=m=>listener({payload:m});
          }
          switch (args?.request?.action) {
            case 'home': return {preferences:{language:'zh',themeMode:'dark'},games:[]};
            case 'reader_bootstrap': return {engines:[],native:{}};
            case 'reader_message': return {replies:[]};
            default: return {};
          }
        }
      };
    });
    await page.goto('http://reader.test/reader/index.html');
    await page.waitForFunction(()=>window.__TOME_READER_READY__);
    const frames = await page.evaluate(async ({profile,key}) => {
      const b=window.__tomoyoChinese, send=window.readerEvent;
      window.__tomoyoMode.set('translation');
      send({bound:true,gameProfile:profile});
      b.galLayout({clientX:34,clientY:134,clientWidth:1505,clientHeight:846,readerX:335,readerY:777,readerWidth:903,readerHeight:203,workBottom:1040});
      b.gameStyleStatus({gameStyleState:'profile',gameStyleKey:key,gameStyleIdentity:'6104|1',
        gameStyleEffectivePrefs:{x:20,y:76,width:60,height:24,anchorDX:0,anchorDY:0,paddingX:20,paddingY:10,
          japaneseSize:34,translationSize:31,lineHeight:0,lineHeightMode:'offset',furigana:true,typewriter:true,gap:-2}});
      send({type:'textPlaceMode',on:true,game:'6104'});
      const prev='無視して、そのまま外に出た。', next='「まだ距離があるけど……ま、いっか。久しぶりだし歩こう」';
      const source=(text,seq)=>send({hookActive:true,hookSource:text,hookSequence:seq,hookSourceEngine:''});
      const place=text=>send({type:'textPlace',text,client:[1505,846],rects:[...text].map((_,i)=>[367+i*30.57,693,31,31])});
      const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      source(prev,22); place(prev);
      await new Promise(resolve=>setTimeout(resolve,550));
      send({type:'textPlace',gone:true,text:prev});
      await frame();
      const samples=[];
      function sample(stage) {
        const sentence=document.querySelector('.tomoyo-hook-reader .sentence-text');
        const token=sentence.querySelector('.char-token'), rect=token.getBoundingClientRect();
        const out=document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output');
        samples.push({stage,seq:sentence.dataset.sequence,x:rect.x,y:rect.y,visible:getComputedStyle(token).visibility,cn:out?.textContent.length||0});
      }
      // Source events can land inside an animation frame. Inspect at the following paint.
      await new Promise(resolve=>requestAnimationFrame(()=>{source(next,23);queueMicrotask(()=>{sample('source');resolve();});}));
      const start=performance.now();
      const patch='「这还真有点远啊……也罢，反正好久没来了，边走边逛吧」';
      b.deliverBackfill(next,patch,'better');
      await frame();sample('patch');
      const prebox='前一行换成很长的汉化。'.repeat(10);
      let delivered=false;
      while(performance.now()-start<307){
        await frame();
        if(!delivered && performance.now()-start>100){b.deliverBackfill(next,prebox,'better');delivered=true;}
        sample('waiting');
      }
      place(next); await frame(); await frame();sample('boxes');
      for(const cn of ['尚有一段路。','距离目的地还有一段路，我们就一路走过去吧。'.repeat(12),'走吧。']){
        b.deliverBackfill(next,cn,'better'); await frame(); await frame();sample('translation');
      }
      return samples;
    },{profile,key});
    console.log('Senren first glyph', JSON.stringify(frames.filter((f,i)=>i===0||i===frames.length-1||f.stage!==frames[i-1].stage||f.y!==frames[i-1].y||f.cn!==frames[i-1].cn)));
    for(const f of frames){
      assert.equal(f.seq,'23',f.stage);
      assert.equal(f.visible,'visible',f.stage);
      assert.ok(Math.abs(f.x-401)<2 && Math.abs(f.y-827)<2,JSON.stringify(f));
    }
    assert.ok(frames.some(f=>f.stage==='patch' && f.cn===27),'recorded patch #24 delivered before coordinates');
    assert.deepEqual(frames.filter(f=>f.stage==='translation').map(f=>f.cn),[6, '距离目的地还有一段路，我们就一路走过去吧。'.length*12,3]);
    assert.ok(frames.some(f=>f.stage==='waiting'&&f.cn>80),'long translation displayed before the native rectangles');
    // Leave the real settings panel open after saving, as in the recording.
    const savedTurn=await page.evaluate(async () => {
      const b=window.__tomoyoChinese;
      await b.openSettings();
      await new Promise(resolve=>setTimeout(resolve,350));
      const dialog=document.querySelector('.tomoyo-cn-dialog[open]');
      dialog.querySelector('[data-menu-key=calibrate]').click();
      const changes={japaneseSize:23.16,translationSize:22.039,sizeSource:'user'};
      b.applyGalPreferences(changes,{preview:true});
      const savedAt=1795340499723;
      b.gameStyleStatus({gameStyleState:'saved',gameStyleKey:b.gameProfileKey(),gameStyleSavedAt:savedAt,gameStyleEffectivePrefs:b.galPreferences()});
      const text='息を吐き、両手を腰に当てて、大きく背をのけ反らせる。';
      window.readerEvent({hookActive:true,hookSource:text,hookSequence:24,hookSourceEngine:''});
      window.readerEvent({type:'textPlace',text,client:[1505,846],rects:[...text].map((_,i)=>[367+i*30.57,693,31,31])});
      await new Promise(resolve=>setTimeout(resolve,400));
      const sentence=document.querySelector('.tomoyo-hook-reader .sentence-text');
      return {seq:sentence.dataset.sequence,text:[...sentence.querySelectorAll('.char-token')].map(t=>t.textContent).join(''),expected:text,
        japaneseSize:b.galPreferences().japaneseSize,top:sentence.querySelector('.char-token').getBoundingClientRect().top,open:dialog.open};
    });
    assert.equal(savedTurn.open,true);
    assert.equal(savedTurn.japaneseSize,23.16);
    assert.equal(savedTurn.seq,'24');
    assert.equal(savedTurn.text,savedTurn.expected);
    assert.ok(Math.abs(savedTurn.top-827)<2,JSON.stringify(savedTurn));
  } finally { await browser.close(); }
});
