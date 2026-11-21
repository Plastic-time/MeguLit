// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Independently authored DOM contracts, not a Tyrano runtime or game fixture. */
const test=require('node:test'),assert=require('node:assert/strict');
let chromium;try{({chromium}=require(process.env.MEGULIT_PLAYWRIGHT||'H:/MeguLit-Work/pw/node_modules/playwright-core'));}catch{}
const domTest=(name,fn)=>test(name,{skip:!chromium&&'playwright-core unavailable'},fn);
const W=require('../core/text-paths-web.cjs'),TP=require('../core/text-paths.cjs'),ED=require('../core/engine-draw.cjs');
let browser;
test.before(async()=>{if(chromium)browser=await chromium.launch({channel:'msedge',headless:true});});
test.after(async()=>{await browser?.close();});
const html=body=>`<!doctype html><style>body{margin:0}.tyrano_base{width:1200px;height:720px}.message_inner{font:28px/1.5 monospace;color:rgb(240,230,220);min-height:60px;width:1000px}.chara_name_area,.glink_button,.button_graphic,.tyrano_button_text{font:24px/1.5 monospace;min-height:40px;width:240px}.char{display:inline}.char .entity{position:absolute}.char .dummy{visibility:hidden}</style><div class="tyrano_base">${body}</div>`;
async function rig(body,{engine=false,dpr=1}={}){
 const page=await browser.newPage({viewport:{width:1200,height:720},deviceScaleFactor:dpr});
 await page.setContent(html(body));
 await page.evaluate(engine=>{window.reports=[];window.__megulitReport=s=>reports.push(JSON.parse(s));
  if(engine)window.TYRANO={kag:{stat:{is_adding_text:false},getMessageInnerLayer(){return [document.querySelector('#active')];}}};
 },engine);
 await page.addScriptTag({content:W.PAGE_SCRIPT});
 return {page,run:(f,arg)=>page.evaluate(f,arg),enable:cfg=>page.evaluate(c=>{__megulitText.config(c||{});__megulitText.hide(true);},cfg),
  body:async()=>page.evaluate(()=>reports.filter(r=>Array.isArray(r.rects)&&!r.ui).at(-1)),
  wait:async predicate=>page.waitForFunction(predicate),close:()=>page.close()};
}
const rec=o=>{let parsed;new W.WebTextPath({port:1,onChars:l=>{parsed=TP.parseChars(l);}}).report(JSON.stringify(o));return parsed;};

domTest('Tyrano profile, roles and embed stay off by default',async()=>{
 const P=require('../core/profiles/index.cjs').profileFor({engine:'tyrano'});assert.equal(P.draw.roles,false);assert.equal(P.draw.embed,false);
 const r=await rig('<div class="chara_name_area">名前</div><div class="glink_button">選ぶ</div><div class="message_inner">本文</div>');
 try{await r.wait(()=>reports.some(x=>x.rects));assert.equal(await r.run(()=>document.querySelector('[data-megulit-hide],.megulit-ruby,.megulit-zh')),null);assert.equal(await r.run(()=>reports.some(x=>x.ui||x.ask)),false);}finally{await r.close();}
});

domTest('visible canonical glyphs only: opacity-zero future chars and stroke/dummy copies never become body text',async()=>{
 const r=await rig('<div class="message_inner"><span class="char">春</span><span class="char" style="opacity:0">風</span><span class="char"><span class="stroke entity">空</span><span class="fill entity">空</span><span class="dummy">空</span></span></div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.text==='春空'&&x.hidden));const m=rec(await r.body());assert.equal(m.text,'春空');assert.equal(m.rects.length,2);assert.equal(m.color,'#f0e6dc');
 await r.run(()=>document.querySelectorAll('.char')[1].style.opacity='1');await r.wait(()=>reports.some(x=>x.text==='春風空'));assert.equal((await r.body()).rects.length,3);
 }finally{await r.close();}
});

domTest('CSS animation completion and ancestor opacity are observed without an engine hook',async()=>{
 const r=await rig('<style>@keyframes reveal{from{opacity:0}to{opacity:1}}</style><div class="message_inner"><span>先</span><span style="animation:reveal 0.4s steps(1,end) forwards;opacity:0">後</span></div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.text==='先後'));await r.run(()=>document.querySelector('.tyrano_base').style.opacity='0');await r.wait(()=>reports.some(x=>x.text===''&&!x.ui));assert.equal((await r.body()).hidden,false);}finally{await r.close();}
});

domTest('current engine message owner wins over another visible message or a throwing getter',async()=>{
 const r=await rig('<div id="active" class="message_inner">現在</div><div class="message_inner">履歴</div>',{engine:true});
 try{await r.enable();await r.wait(()=>reports.some(x=>x.text==='現在'&&x.hidden));await r.run(()=>{TYRANO.kag.getMessageInnerLayer=()=>{throw Error('no current layer');};__megulitText.scan();});assert.equal((await r.body()).text,'');assert.equal(await r.run(()=>document.querySelectorAll('[data-megulit-hide]').length),0);assert.equal(await r.run(()=>reports.some(x=>x.text==='履歴')),false);}finally{await r.close();}
});

domTest('clear, disconnect and identical text in a replaced page retire the exact prior line',async()=>{
 const r=await rig('<div class="message_inner">同じ</div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.hidden));const old=await r.body();await r.run(()=>{document.querySelector('.message_inner').textContent='同じ';__megulitText.scan();});let m=await r.body();assert.ok(m.line>old.line);assert.equal(await r.run(id=>reports.some(x=>x.line===id&&x.text===''&&!x.ui),old.line),true);
 await r.run(()=>{document.querySelector('.message_inner').remove();__megulitText.scan();});m=await r.body();assert.equal(m.text,'');assert.equal(m.rects.length,0);assert.equal(m.hidden,false);
 }finally{await r.close();}
});

domTest('DOM clear reaches the real WebTextPath -> HookNative -> HiddenGate -> placement gone chain',async()=>{
 const r=await rig('<div class="message_inner">消す</div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.hidden));await r.run(()=>{document.querySelector('.message_inner').textContent='';__megulitText.scan();});
 const {HookNative}=require('../core/hook-native.cjs'),{OverlayPlacement}=require('../core/overlay-placement.cjs'),messages=[];
 const placement=new OverlayPlacement({send:m=>messages.push(m)});placement.on=true;placement.client=[1200,720];
 const hook={textPathActive:true,drawLog(){},engineDrawLine(){},now:()=>1,emit:m=>placement.hook(m)};
 const path=new W.WebTextPath({port:1,onChars:wire=>HookNative.prototype.charRects.call(hook,wire)});
 for(const o of await r.run(()=>reports.filter(x=>Array.isArray(x.rects)&&!x.ui)))path.report(JSON.stringify(o));
 assert.ok(messages.some(m=>m.type==='textPlace'&&m.gone===true));assert.equal(hook.charGates.get('web').hidden((await r.body()).line),false);
 }finally{await r.close();}
});

domTest('a body over the shared UTF16 budget remains visible and retires prior hidden proof',async()=>{
 const r=await rig('<div class="message_inner">短文</div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.hidden));await r.run(()=>{document.querySelector('.message_inner').textContent='長'.repeat(4001);__megulitText.scan();});assert.equal(await r.run(()=>document.querySelector('[data-megulit-hide]')),null);assert.equal((await r.body()).text,'');}finally{await r.close();}
});

domTest('split surrogate DOM nodes cannot yield a hidden record the shared parser would reject',async()=>{
 const r=await rig('<div class="message_inner">通常</div>');
 try{await r.enable();await r.wait(()=>reports.some(x=>x.hidden));await r.run(()=>{const el=document.querySelector('.message_inner');el.textContent='';for(const unit of ['\ud840','\udc00']){const span=document.createElement('span');span.textContent=unit;el.appendChild(span);}__megulitText.scan();});assert.equal(await r.run(()=>document.querySelector('[data-megulit-hide]')),null);assert.equal((await r.body()).text,'');}finally{await r.close();}
});

domTest('UI glyph rectangles keep multiline text, dpr and original choice clicks; disabling roles sends empty snapshots',async()=>{
 const r=await rig('<div class="chara_name_area">話者</div><div class="glink_button" onclick="window.clicked=1">第一<br>第二</div><div class="message_inner">本文</div>',{dpr:2});
 try{await r.enable({roles:true});await r.wait(()=>reports.some(x=>x.role==='choice'));const ui=await r.run(()=>reports.find(x=>x.role==='choice'));const parsed=rec(ui);assert.equal(parsed.text,'第一\n第二');assert.equal(parsed.rects.length,4);assert.equal(parsed.sw,2400);assert.equal(ED.rowsOf(parsed).length,2);assert.ok(parsed.rects[2][1]>parsed.rects[0][1]);await r.page.click('.glink_button');assert.equal(await r.run(()=>clicked),1);
 await r.run(()=>__megulitText.config({roles:false}));const cleared=await r.run(()=>reports.filter(x=>x.ui&&x.text==='').map(x=>x.role));assert.deepEqual(cleared,['name','choice']);
 }finally{await r.close();}
});

domTest('configured name area and graphic glink use explicit engine ownership, not guessed captions',async()=>{
 const r=await rig('<div class="custom-name" style="font:24px monospace">独自名</div><div class="button_graphic" data-event-tag="glink">選択</div><div id="active" class="message_inner">本文</div>',{engine:true});
 try{await r.run(()=>{TYRANO.kag.chara={getCharaNameArea:()=>[document.querySelector('.custom-name')]};});await r.enable({roles:true});await r.wait(()=>reports.some(x=>x.role==='name'));assert.deepEqual(await r.run(()=>reports.filter(x=>x.ui&&x.text).map(x=>[x.role,x.text])),[['name','独自名'],['choice','選択']]);}finally{await r.close();}
});

domTest('an inline engine link is never hidden, embedded, or merged into body',async()=>{
 const r=await rig('<div class="message_inner">説明<span data-event-tag="link" onclick="window.clicked=1">選択</span></div>');
 try{await r.enable({roles:true});await r.wait(()=>reports.some(x=>x.role==='choice'));assert.equal((await r.body()).text,'説明');assert.equal((await r.body()).hidden,false);assert.equal(await r.run(()=>document.querySelector('[data-megulit-hide]')),null);await r.enable({roles:true,embed:true});await r.run(()=>__megulitText.embed('説明',{ruby:[[0,2,'せつめい']],zh:'说明'}));await r.page.waitForTimeout(400);assert.equal(await r.run(()=>document.querySelector('.megulit-ruby,.megulit-zh')),null);await r.page.click('[data-event-tag=link]');assert.equal(await r.run(()=>clicked),1);}finally{await r.close();}
});

domTest('embedding waits for the engine typewriter, preserves native ruby and removes only owned additions on withdrawal',async()=>{
 const r=await rig('<div id="active" class="message_inner"><ruby id="original"><rb>今日</rb><rt>ゲームよみ</rt></ruby><span id="keep" onclick="window.kept=1">晴</span></div>',{engine:true});
 try{await r.run(()=>{window.keep=document.querySelector('#keep');window.nativeRuby=document.querySelector('#original');TYRANO.kag.stat.is_adding_text=true;});await r.enable({embed:true});await r.run(()=>__megulitText.embed('今日晴',{ruby:[[0,2,'辞書よみ'],[2,3,'はれ']],zh:'今天晴朗'}));await r.page.waitForTimeout(450);assert.equal(await r.run(()=>document.querySelector('.megulit-zh')),null);
 await r.run(()=>TYRANO.kag.stat.is_adding_text=false);await r.wait(()=>reports.some(x=>x.emb===2));assert.equal(await r.run(()=>document.querySelector('#original rt').textContent),'ゲームよみ');assert.equal(await r.run(()=>document.querySelectorAll('ruby ruby').length),0);assert.equal((await r.body()).text,'今日晴');assert.equal((await r.body()).emb,2);
 await r.run(()=>__megulitText.config({embed:false}));assert.equal(await r.run(()=>document.querySelector('.megulit-ruby,.megulit-zh')),null);assert.equal(await r.run(()=>document.querySelector('#keep')===window.keep&&document.querySelector('#original')===nativeRuby),true);await r.page.click('#keep');assert.equal(await r.run(()=>kept),1);
 }finally{await r.close();}
});

domTest('disable and transport stop restore embedding and clear UI while keeping a page reusable',async()=>{
 const r=await rig('<div class="chara_name_area">名前</div><div class="message_inner"><span>晴</span></div>');
 try{await r.enable({roles:true,embed:true});await r.run(()=>__megulitText.embed('晴',{ruby:[[0,1,'はれ']],zh:'晴天'}));await r.wait(()=>!!document.querySelector('.megulit-zh'));await r.wait(()=>reports.some(x=>x.ui));await r.run(()=>__megulitText.hide(false));assert.equal(await r.run(()=>document.querySelector('.megulit-ruby,.megulit-zh,[data-megulit-hide]')),null);assert.equal(await r.run(()=>reports.some(x=>x.ui&&x.text==='')),true);
 await r.enable({embed:true});await r.wait(()=>!!document.querySelector('.megulit-zh'));await r.run(()=>__megulitText.stop());assert.equal(await r.run(()=>document.querySelector('.megulit-zh')),null);
 }finally{await r.close();}
 const p=new W.WebTextPath({port:1}),evals=[];let closed=0;p.pages.set('x',{close(){closed++;}});p.evaluate=(c,js)=>{evals.push(js);return Promise.resolve();};p.stop();await new Promise(resolve=>setImmediate(resolve));assert.match(evals[0],/__megulitText\.stop/);assert.equal(closed,1);
});

domTest('a stale replacement cannot embed into the new page; zh=false rebuilds ruby without Chinese',async()=>{
 const r=await rig('<div class="message_inner"><span>古</span></div>');
 try{await r.enable({embed:true});await r.wait(()=>reports.some(x=>x.ask==='古'));await r.run(()=>{document.querySelector('.message_inner').innerHTML='<span>新</span>';__megulitText.scan();__megulitText.embed('古',{ruby:[],zh:'旧译文'});});await r.page.waitForTimeout(400);assert.equal(await r.run(()=>document.querySelector('.megulit-zh')),null);
 await r.run(()=>__megulitText.embed('新',{ruby:[[0,1,'しん']],zh:'新译文'}));await r.wait(()=>reports.some(x=>x.emb===2&&x.text==='新'));await r.run(()=>__megulitText.config({embed:true,zh:false}));await r.wait(()=>reports.some(x=>x.emb===1&&x.text==='新'));assert.equal(await r.run(()=>document.querySelector('.megulit-zh')),null);assert.equal(await r.run(()=>document.querySelector('.megulit-ruby rt').textContent),'しん');
 }finally{await r.close();}
});

domTest('generic DOM text keeps its own styles and node click handlers through embedding withdrawal',async()=>{
 const r=await rig('<div id="dialogue" style="font:28px monospace;min-height:60px"><span id="generic" onclick="window.clicked=1">本文</span></div>');
 try{await r.run(()=>{document.querySelector('.tyrano_base').className='generic-engine';window.original=document.querySelector('#generic');});await r.enable({embed:true});await r.run(()=>__megulitText.embed('本文',{ruby:[[0,2,'ほんぶん']],zh:'正文'}));await r.wait(()=>reports.some(x=>x.emb===2));await r.run(()=>__megulitText.hide(false));assert.equal(await r.run(()=>document.querySelector('#generic')===original),true);await r.page.click('#generic');assert.equal(await r.run(()=>clicked),1);assert.equal(await r.run(()=>document.querySelector('.megulit-zh,.megulit-ruby')),null);}finally{await r.close();}
});
