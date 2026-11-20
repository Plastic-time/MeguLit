// E346 (user 2026-11-10): when no stream of any engine can be embedded, MeguLit tells the user to send feedback
// with the game name and a screenshot instead of only saying the original stays visible.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {HookControl}=require('../core/hook-control.cjs');
function host(threads){const sent=[];return {sent,preferences:{hookHide:true,hookProfile:'read'},state:{gameProcessId:7,gameStarted:'t',bound:true},
 hooks:{state:{hookThreads:threads}},notify:m=>sent.push(m),send:()=>{},save(p){this.preferences=p;}};}

test('read-only streams with text end in the feedback hint, flagged for the caption and panel',()=>{
 let now=0;const h=host([{id:'a',name:'YU-RIS2',sample:'「こんにちは」',selected:true,embeddable:false}]);const c=new HookControl(h,()=>now);c.plan='read';c.running=true;
 c.apply();assert.equal(h.sent.at(-1).hookCheckState,'waiting');
 now=9000;c.apply();const last=h.sent.at(-1);
 assert.equal(last.hookEmbedUnsupported,true);assert.match(last.hookCheckMessage,/关于.*提交反馈.*游戏名和截图.*一天内/);
});

test('starting an embed clears the hint; an embeddable stream never shows it',()=>{
 let now=0;const h=host([{id:'e',name:'EmbedYURIS6',sample:'「こんにちは」',selected:true,embeddable:true}]);const c=new HookControl(h,()=>now);c.plan='read';c.running=true;
 c.apply();now=9000;c.apply();
 assert.ok(!h.sent.some(m=>m.hookEmbedUnsupported===true));assert.ok(h.sent.some(m=>m.hookProfile==='embed'&&m.hookEmbedUnsupported===false));
});

test('reader shows the hint once per game under the caption and keeps a feedback button in the panel',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web/reader/modules/hook-panel.js'),'utf8');
 assert.match(ui,/feedbackShown\.has\(id\)/);assert.match(ui,/querySelector\('\.sentence-window'\)/);assert.match(ui,/setTimeout\(close,8000\)/);
 assert.match(ui,/data-hook-feedback/);assert.match(ui,/github\.com\/ilynthn\/MeguLit\/issues/);
 for(const lang of ['zh:','ja:','en:'])assert.ok(ui.includes(lang),lang);
});

/* 2026-11-21 (owner, ファタモルガーナの館 incr11, screenshot orange-marker-27: 「已经隐藏了却显示了这个提示」 — a narrow brown box over 「う」 at the end of
   「君がどんな姿になっていようとも」 and over the translation). hook-events: 23:31:21.984 隐藏检查通过, 23:31:37.856 render mode embed -> custom (glyph
   mode blank, read-only stream), then 这个游戏暂时不能隐藏原文 every 2 s until 23:32:35. The original was hidden all along (glyph layer + MeguLit's own
   drawing on the game's place). */
const fata=over=>{const h=host([{id:'52c3a7:0:32',name:'KiriKiri2',sample:'君がどんな姿になっていようとも',selected:true,embeddable:false}]);
 h.hooks.enabled=true;h.hooks.route='custom';h.hooks.ownTextFn=()=>true;h.hooks.compositedFn=()=>false;Object.assign(h,over||{});return h;};
test('recorded ファタ 23:31:37: hidden by the glyph layer and redrawn in place, no "cannot hide" hint',()=>{
 let now=0;const h=fata();const c=new HookControl(h,()=>now);c.plan='read';c.running=true;c.apply();
 for(now=2000;now<=60000;now+=2000)c.apply();
 assert.ok(!h.sent.some(m=>m.hookEmbedUnsupported===true),'never flagged');assert.ok(!h.sent.some(m=>/暂时不能隐藏原文/.test(m.hookCheckMessage||'')));
 assert.ok(h.sent.some(m=>m.hookEmbedUnsupported===false&&/原文已隐藏/.test(m.hookCheckMessage||'')));
 /* the same game without that route (nothing hides it) still gets the hint */
 let t=0;const g=fata();g.hooks.enabled=false;g.hooks.route='read';const d=new HookControl(g,()=>t);d.plan='read';d.running=true;d.apply();t=9000;d.apply();
 assert.equal(g.sent.at(-1).hookEmbedUnsupported,true);
});
test('read mode chosen on purpose (self-check / text effects): the read-mode line, never "send feedback"; a stale hint is cleared',()=>{
 let now=0;const h=fata();h.hooks.enabled=false;h.hooks.route='read';const c=new HookControl(h,()=>now);c.plan='read';c.running=true;c.apply();now=9000;c.apply();
 assert.equal(h.sent.at(-1).hookEmbedUnsupported,true,'before: flagged');
 h.textEffectsHold={hookHide:true,why:'效果帧过多'};h.preferences={...h.preferences,hookHide:false};c.apply(true);
 const last=h.sent.filter(m=>'hookEmbedUnsupported' in m).at(-1);assert.equal(last.hookEmbedUnsupported,false);assert.match(last.hookCheckMessage,/已自动改为只显示译文：效果帧过多/);
 const ui=fs.readFileSync(path.join(__dirname,'..','web/reader/modules/hook-panel.js'),'utf8');
 assert.match(ui,/m\.hookEmbedUnsupported===true&&state\.textEffectsRead!==true\)captionFeedback\(\)/);
});
test('the hint is its own fixed box, never inside the sentence window (an anchored line squeezed it into a strip at the line end)',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web/reader/modules/hook-panel.js'),'utf8'),f=ui.slice(ui.indexOf('function captionFeedback'),ui.indexOf('function captionFeedback')+1600);
 assert.ok(!/host\.appendChild\(n\)/.test(f));assert.match(f,/position:fixed/);assert.match(f,/document\.body\.appendChild\(n\)/);
});
