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
