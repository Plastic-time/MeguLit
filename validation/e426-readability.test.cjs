// SPDX-License-Identifier: GPL-3.0-or-later
/* E426 Readability: local dictionary text becomes numbered senses, the translation guide starts folded under the settings, the dictionary row has one height, read words have a Known button */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const web=path.join(__dirname,'..','web'),read=f=>fs.readFileSync(path.join(web,f),'utf8'),load=f=>import(pathToFileURL(path.join(web,f)).href);
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('local dictionary text is split into clean senses',async()=>{
 const {formatDefinition,definitionHtml}=await load('dictionary-format.js');
 assert.deepEqual(formatDefinition('impeach;→英和 denounce; censure'),[{tags:[],glosses:['impeach','denounce','censure']}]);
 assert.deepEqual(formatDefinition('(n,vs) 弹劾\n(1) to accuse (2) to blame; to blame'),[{tags:['n','vs'],glosses:['弹劾']},{tags:[],glosses:['to accuse']},{tags:[],glosses:['to blame']}]);
 assert.deepEqual(formatDefinition(''),[]);
 const html=definitionHtml('a<b>;→英和 c',esc);assert.match(html,/^<ol class="dict-senses">/);assert.ok(!html.includes('→')&&html.includes('a&lt;b&gt;'));
 const app=read('app.js');assert.match(app,/definitionHtml\(w\.definition,esc\)/);assert.match(app,/record dict-entry/);
});
test('translation guide: short folded card after the settings, animated, icons, three languages',async()=>{
 const g=await load('settings-guides.js'),src=read('settings-guides.js'),css=read('settings-grimoire.css');
 for(const [l,max] of [['zh',700],['en',1400],['ja',700]])assert.ok(g.guideText('translation',l).length<max,'translation guide kept short '+l);
 assert.match(src,/content\.append\(card\)/);assert.match(src,/!!opened\(\)\[section\]/);assert.equal((src.match(/icon: '/g)||[]).length,6);
 assert.match(css,/\.guide-body\{display:grid;grid-template-rows:0fr/);assert.match(css,/\.settings-guide\.open \.guide-body\{grid-template-rows:1fr/);
 assert.match(css,/\.guide-block li\{font-size:14\.5px/);
});
test('dictionary search row: input and both buttons share one height',()=>{
 const css=read('moji.css');assert.match(css,/\.lookup-form>input,\.lookup-form>button\{[^}]*height:46px!important/);
 assert.match(css,/\.moji-detail \.word-spelling\{font-size:44px/);assert.match(css,/\.moji-detail \.moji-note\{[^}]*border-radius:14px/);
});
test('read words: Known marks the word mastered and drops it',async()=>{
 const r=await load('reading-insights.js');assert.equal(r.KNOWN_STATUS,3);
 const data={weekly:[{key:'a'},{key:'b'}],frequent:[{key:'b'}]};r.dropWord(data,'b');assert.deepEqual([data.weekly.length,data.frequent.length],[1,0]);
 const html=r.readingInsightsHTML({lines:1,weekly:[{key:'雪',base:'雪',count:2}],frequent:[],jlpt:[],games:[]},{locale:'zh',esc,number:String});
 assert.match(html,/data-known="雪"/);assert.match(html,/已掌握/);
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');assert.match(bridge,/\{status:Number\.isInteger\(request\.status\)\?request\.status:null\}/);
});
