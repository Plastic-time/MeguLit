// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {launch, findBrowser} = require('../services/cardinal/cdp.cjs');
const {startWeb} = require('./library-views-perf.cjs');
const senren = require('./fixtures/games/senren-banka/probe-fd37d708.lines.json').lines;
// CLANNAD, sequence 33 and its neighbours from the owner's November 22 translation cache.
const clannad = [
  ['すべての山を切り開けば、どれだけ楽に登校できるだろうか。','如果你把所有的山都翻开，通勤去学校会容易多少？'],
  ['（俺の生活は、いつか変わるんだろうか…）','（我的人生会改变吗......）'],
  ['やたらと自然が多い町。','一个充满自然气息的小镇。'],
  ['山を迂回しての登校。','我绕山路通勤去学校。'],
  ['直線距離を取れば、２０分ぐらいは短縮できそうだった。','如果我走直线距离，时间本可以缩短大约20分钟。'],
  ['（すると、一年でどれぐらい、俺は時間を得することになるんだ…）','（那么，一年我能多得多少时间......？）'],
  ['計算しながら、歩く。','边行边算。'],
];

test('configured Chinese fits the actual wrapped text on CLANNAD sequence 33 and twenty cross-title lines', {skip:!findBrowser()}, async t => {
  const web = await startWeb({call(){}});
  t.after(()=>new Promise(resolve=>web.close(resolve)));
  const browser = await launch({viewport:{width:1600,height:1080}});
  t.after(()=>browser.close());
  const {page} = browser;
  await page.addInitScript(()=>{
    window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(cmd,args)=>{
      const r=args?.request||{};
      if(cmd==='service'&&r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};
      if(cmd==='service'&&r.action==='reader_bootstrap')return {engines:[],native:{}};
      return {replies:[]};
    }};
  });
  await page.goto('http://127.0.0.1:'+web.address().port+'/reader/index.html');
  await page.waitForFunction(()=>window.__TOME_READER_READY__);
  await page.evaluate(()=>{
    const b=window.__tomoyoChinese;
    b.localTokenize=async text=>Object.entries({'山':'ヤマ','切':'キ','開':'ヒラ','楽':'ラク','登校':'トウコウ'}).filter(([word])=>text.includes(word)).map(([surface,reading])=>({surface,reading,start:text.indexOf(surface),end:text.indexOf(surface)+surface.length,source:'SudachiDict Full'}));
    window.__tomoyoMode.set('translation');
    b.galLayout({readerX:430,readerY:795,readerWidth:787,readerHeight:224,clientX:181,clientY:53,clientWidth:1243,clientHeight:933});
    b.galStatus({bound:true,hookActive:true,dialogVisible:true,interfaceMode:'translation'});
    b.applyGalPreferences({japaneseSize:32.8,translationSize:28.293,sizeSource:'user',autoScale:true,
      width:63.3,height:24,paddingX:0,paddingY:0,gap:-25,lineHeight:-1.2,lineHeightMode:'offset',
      translationWidth:75,rubyScale:.44,rubyOffsetY:10.5,furigana:true,typewriter:false,japaneseFont:'originalGothic',chineseFont:'notoSansSC'}, {persist:false});
  });
  const inputs=[...clannad,...senren.slice(0,14).map(x=>[x.k,x.zh])];
  const run=async([jp,zh],i)=>{
    await page.evaluate(([hookSource,hookSequence])=>window.__tomoyoChinese.galStatus({hookActive:true,dialogVisible:true,hookSequence,hookSourceOrigin:'live',hookSource}),[jp,33+i]);
    await page.waitForFunction(text=>window.__tomoyoChinese.current===text&&document.querySelector('.tomoyo-hook-reader .char-token'),jp);
    const pos=await page.evaluate(async()=>{
      await document.fonts.ready;
      const win=document.querySelector('.tomoyo-hook-reader');
      const animations=document.getAnimations().filter(a=>a.effect?.getComputedTiming().endTime<600&&
        (win.contains(a.effect.target)||a.effect.target?.contains(win)));
      await Promise.allSettled(animations.map(a=>a.finished));
      return win.querySelector('.char-token').getBoundingClientRect().toJSON();
    });
    await page.evaluate(([jp,zh])=>window.__tomoyoChinese.deliverBackfill(jp,zh,'better',{source:'machine',target:'zh'}),[jp,zh]);
    await page.waitForFunction(zh=>document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output')?.textContent===zh,zh);
    const m=await page.evaluate(async()=>{
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const win=document.querySelector('.tomoyo-hook-reader'),jp=win.querySelector('.sentence-text'),cn=win.querySelector('.tomoyo-cn-output');
      const cs=getComputedStyle(cn), rect=cn.getBoundingClientRect(), glyph=jp.querySelector('.char-token').getBoundingClientRect();
      const range=document.createRange();range.selectNodeContents(cn);
      const result={size:parseFloat(cs.fontSize),base:parseFloat(cs.getPropertyValue('--tomoyo-gal-cn-size')),x:glyph.x,y:glyph.y,top:rect.top,
        width:rect.width,bottom:rect.bottom,ink:range.getBoundingClientRect().bottom,reserve:cs.minHeight,fit:window.__tomoyoChinese.gameFit.state(),
        jpSize:getComputedStyle(jp).fontSize,ruby:jp.querySelectorAll('[data-tomoyo-reading]').length,
        rows:new Set(Array.from(range.getClientRects(),r=>Math.round(r.top))).size};
      // Independent full-size and slightly-larger trials, using the live layout with scrolling removed.
      const saved=cn.style.cssText;
      cn.style.setProperty('max-height','none','important');cn.style.setProperty('min-height','0','important');
      cn.style.setProperty('font-size',result.base+'px','important');result.fullBottom=cn.getBoundingClientRect().bottom;
      cn.style.setProperty('font-size',(result.size+.1)+'px','important');result.largerBottom=cn.getBoundingClientRect().bottom;
      cn.style.cssText=saved;
      const g=window.__tomoyoChinese.galLayoutInfo();result.limit=Math.min(innerHeight,(g.clientY+g.clientHeight)/devicePixelRatio)-4;
      return result;
    });
    if(i===0)t.diagnostic(JSON.stringify(m));
    assert.ok(Math.abs(pos.x-m.x)<.5&&Math.abs(pos.y-m.y)<.5,'Japanese anchor '+JSON.stringify({i,pos,m}));
    return m;
  };
  let full=0,smaller=0,wrapped=0;
  for(const [i,input] of inputs.entries()){
    // Recorded Senren client, replaying the same ordinary reader route. Native placement has its own browser suite.
    if(i===clannad.length)await page.evaluate(()=>window.__tomoyoChinese.galLayout({
      readerX:566,readerY:776,readerWidth:974,readerHeight:207,clientX:192,clientY:92,clientWidth:1535,clientHeight:863}));
    const m=await run(input,i);
    if(i===0){assert.equal(m.ruby,5);assert.equal(m.jpSize,'31.85px');assert.equal(m.width,787);assert.ok(Math.abs(m.y-818.5)<.5);}
    if(m.fullBottom<=m.limit){assert.ok(Math.abs(m.size-m.base)<.02,'full size fits '+JSON.stringify({i,m}));full++;if(m.rows>1)wrapped++;}
    else {assert.ok(m.size<m.base&&m.largerBottom>m.limit,'only as much as necessary '+JSON.stringify({i,m}));smaller++;}
  }
  t.diagnostic(JSON.stringify({lines:inputs.length,full,smaller,wrapped}));
  // Give the recorded long Senren pair a higher calibrated origin: two wrapped rows fit at full size.
  await page.evaluate(()=>{const b=window.__tomoyoChinese;b.galLayout({...b.galLayoutInfo(),readerY:600});});
  const long=senren[11],multi=await run([long.k,long.zh],39);
  assert.ok(multi.rows>=2&&multi.fullBottom<=multi.limit&&Math.abs(multi.size-multi.base)<.02,JSON.stringify(multi));
  t.diagnostic('two rows at configured size '+JSON.stringify(multi));
  // Resizing the same line can make room again without a page turn.
  await page.evaluate(()=>window.__tomoyoChinese.galLayout({
    readerX:430,readerY:795,readerWidth:787,readerHeight:224,clientX:181,clientY:53,clientWidth:1243,clientHeight:882}));
  const tight=await run(clannad[0],40);
  assert.ok(tight.fullBottom>tight.limit&&tight.size<tight.base&&tight.bottom<=tight.limit+.02&&tight.largerBottom>tight.limit,JSON.stringify(tight));
  await page.evaluate(()=>{const b=window.__tomoyoChinese;b.galLayout({...b.galLayoutInfo(),clientHeight:933});});
  await page.waitForFunction(()=>window.__tomoyoChinese.gameFit.state().fit===1);
  const restored=await page.evaluate(()=>{const w=document.querySelector('.tomoyo-hook-reader');return [getComputedStyle(w.querySelector('.tomoyo-cn-output')).fontSize,w.querySelector('.char-token').getBoundingClientRect().top];});
  assert.deepEqual(restored[0],'27.48px');assert.ok(Math.abs(restored[1]-tight.y)<.5);
  t.diagnostic('reduced height '+JSON.stringify(tight));
});
