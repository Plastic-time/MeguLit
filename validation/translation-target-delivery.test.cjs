// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function inject(){const document={documentElement:{},head:{appendChild(){}},createElement:()=>({}),querySelector:()=>null,querySelectorAll:()=>[]},window={__tomoyoTranslateRequest(){}};vm.runInNewContext(fs.readFileSync(require.resolve('../web/reader/modules/inject.js'),'utf8'),{document,window,localStorage:{getItem:()=>null},setTimeout:()=>0,clearTimeout(){},setInterval(){},MutationObserver:class{observe(){}}});return window.__tomoyoChinese;}
test('real inject dispatch rejects wrong-language ordinary replies before page delegation',()=>{
 const b=inject(),calls=[];let display='english',language='zh';b.galPreferences=()=>({display});b.options=()=>({learnerLanguage:language});b.deliverPageTranslation=(...args)=>{calls.push(args);return true;};
 b.deliver(1,'迟到中文',false,'',{target:'zh'});assert.equal(calls.length,0);b.deliver(1,'English answer',false,'',{target:'en'});assert.equal(calls.length,1);
 display='bilingual';language='en';b.deliver(2,'迟到中文',false,'',{target:'zh'});assert.equal(calls.length,1);b.deliver(2,'English answer',false,'',{target:'en'});assert.equal(calls.length,2);
 language='zh';b.deliver(3,'late English',false,'',{target:'en'});assert.equal(calls.length,2);b.deliver(3,'当前中文',false,'',{target:'zh'});assert.equal(calls.length,3);
});
test('real inject backfill rejects an old target before mutating or filling earlier page rows',()=>{
 const b=inject(),fills=[];let display='english';b.galPreferences=()=>({display});b.options=()=>({learnerLanguage:'zh'});b.pageTranslationFill=(...args)=>fills.push(args);b.sourceText='別の本文';
 b.deliverBackfill('本文','迟到中文','better',{target:'zh'});assert.equal(fills.length,0);b.deliverBackfill('本文','English answer','better',{target:'en'});assert.equal(fills.length,1);
 display='bilingual';b.deliverBackfill('本文','late English','guard',{target:'en'});assert.equal(fills.length,1);b.deliverBackfill('本文','当前中文','patch',{target:'zh'});assert.equal(fills.length,2);
});
