'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('E458 the dictionary field covers the whole window, never limited by the content column max-width',()=>{
 const css=fs.readFileSync(path.join(__dirname,'..','web','unify.css'),'utf8');
 assert.match(css,/body \.dict-field\{max-width:none!important;max-height:none!important;margin:0!important\}/);
 assert.match(css,/body \.dict-field\{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important/);
});
