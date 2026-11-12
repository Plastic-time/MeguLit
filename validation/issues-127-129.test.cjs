'use strict';
// Issues 127-129 (v1.4.4).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('129: a translator that never answers does not hold the daily page; glosses are left out',async()=>{
 const daily=require('../services/daily.cjs');
 const f=async url=>({ok:true,json:async()=>url.includes('/api/news')?{items:[{title:'t',link:'https://moepedia.net/n'}]}:{day:'2026-11-12',words:[{term:'推し活'},{term:'線状降水帯'}]}});
 const hang=()=>new Promise(()=>{});
 const started=Date.now();
 const v=await daily.view('',null,{env:{MEGULIT_RELAY_BASE:'https://relay.test'},fetch:f,glossBudget:150,runtime:{reviews:()=>({translate:hang})},translateFree:hang});
 assert.ok(Date.now()-started<2000,'answers within the gloss budget');
 assert.equal(v.state,'ok');assert.equal(v.words.words.length,2);assert.ok(v.words.words.every(w=>!w.gloss));
});

test('129: the page has its own deadline, shows the error card past it and reloads when the connection returns',()=>{
 const src=read('web/daily-view.js');
 assert.match(src,/const LOAD_LIMIT=25000;/);
 assert.match(src,/Promise\.race\(\[api\('daily_view'/);
 assert.match(src,/data=\{state:'error',error:/);
 assert.match(src,/addEventListener\('online'/);
});

const {Immersion}=require('../core/immersion.cjs');
test('127: the pointer on MeguLit\'s text keeps the layer up while the marker is gone, and lifts a marker hide',()=>{
 let now=0;const events=[];const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「テスト」','bgi');
 now=500;im.marker(true);im.tick();now=2000;im.marker(false);
 for(let t=2500;t<=14000;t+=500){now=t;if(t%1000===0)im.reading();im.tick();}
 assert.notEqual(events.at(-1),false,'hovering the subtitles for 12 s with the marker gone: still shown');
 now=14000+3500;im.tick();assert.equal(events.at(-1),false,'once the pointer has left, the usual marker rule applies');
 now=18000;im.reading();assert.equal(events.at(-1),true,'pointing at the subtitles again brings a marker-hidden layer back');
});
test('127: a scene or skip hide is not lifted by the pointer',()=>{
 let now=0;const events=[];const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「テスト」','bgi');im.scene(false,'scene changed');
 now=100;im.reading();assert.equal(events.at(-1),false);
});
test('127: the page reports pointer activity over its text, the service passes it on, and cover toggles are logged',()=>{
 assert.match(read('web/reader/modules/gal.js'),/type:'readerReading'/);
 assert.match(read('services/reader.cjs'),/case 'readerReading':this\.immersion\?\.reading\?\.\(\);break;/);
 assert.match(read('services/reader.cjs'),/logVisibility\(\{type:'cover',enabled:message\.coverEnabled\}\)/);
 assert.match(read('core/immersion.cjs'),/if\(this\.readingAt!=null&&this\.now\(\)-this\.readingAt<3000\)return;/);
});

test('128: the Anki card panel fills the review column even though the landing card is centred',()=>{
 assert.match(read('web/unify.css'),/html:not\(#u\):not\(#v\) body \.review-page #review-content>\.anki-review-panel\{align-self:stretch;width:100%;box-sizing:border-box\}/);
});

test('127: Alt+H says the current line returns with the next one and points to Alt+T for original-only or translation-only',()=>{
 const g=read('web/reader/modules/gal.js');
 assert.match(g,/tip\.className='megulit-cover-hint'/);
 assert.match(g,/if \(!message\.coverEnabled && was!=='false'\)/);
 for(const s of ['原文要从下一句起才由游戏显示','按 Alt+T，在「显示内容」里切换','press Alt+T and change “Show”','Alt+T の「表示内容」'])assert.ok(g.includes(s),s);
 assert.match(g,/pointer-events:none/);
});
test('134: an open look-up or selection card keeps the reader reading, so the marker rule cannot hide the subtitles under it',()=>{
 const gal=read('web/reader/modules/gal.js');
 assert.match(gal,/querySelectorAll\('\.tomoyo-selection-card,\.tooltip-entries'\)[\s\S]{0,260}type:'readerReading'/);
 let now=0;const events=[];const im=new Immersion(e=>events.push(e.dialogVisible),()=>now);
 im.configure({immersion:true,dialogDetection:'marker'});im.bind('g');im.source('「長い台詞」','pal');
 now=500;im.marker(true);im.tick();now=2000;im.marker(false);
 for(let t=2500;t<=30000;t+=500){now=t;if(t%1000===0)im.reading();im.tick();}
 assert.notEqual(events.at(-1),false,'30 s on the context explanation with the marker out of sight: still shown');
});
