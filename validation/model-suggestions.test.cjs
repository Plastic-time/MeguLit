// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21: claude's default model is claude-haiku-5-5; 模型名 offers each engine's known names as a datalist in both settings
   pages (still free text); a saved model name is kept. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../core/engines.cjs'),root=path.join(__dirname,'..');
test('claude default and known model lists',()=>{
 assert.equal(E.ENGINES.claude.model,'claude-haiku-5-5');
 assert.deepEqual(E.modelsFor('claude'),['claude-haiku-5-5','claude-sonnet-5-5','claude-opus-5-5']);
 for(const [k,e] of Object.entries(E.ENGINES))if(e.model&&E.MODELS[k])assert.equal(E.modelsFor(k)[0],e.model,k+': the default comes first');
 assert.deepEqual(E.modelsFor('google'),[]);assert.equal(E.modelsFor('deepseek')[0],'deepseek-flash');
 assert.equal(require('../core/providers.cjs').resolveOptions({provider:'claude',model:'my-saved-model',apiKey:'x'}).model,'my-saved-model','a saved name is kept');
});
test('both settings pages wire the datalist; bootstrap and settings hand the lists over',()=>{
 const ts=fs.readFileSync(path.join(root,'web','translation-settings.js'),'utf8'),rs=fs.readFileSync(path.join(root,'web','reader','modules','settings.js'),'utf8');
 assert.match(ts,/model\.setAttribute\('list',modelList\.id\)/);assert.match(ts,/meta\.models/);
 assert.match(rs,/name="model"[^>]*list="megulit-reader-model-list"><datalist id="megulit-reader-model-list"><\/datalist>/);assert.match(rs,/eng\?\.models/);
 assert.match(fs.readFileSync(path.join(root,'services','runtime.cjs'),'utf8'),/models:require\('\.\.\/core\/engines\.cjs'\)\.modelsFor\(name\)/);
 assert.match(fs.readFileSync(path.join(root,'services','settings.cjs'),'utf8'),/providers\[provider\]=\{models:/);
});
