// SPDX-License-Identifier: GPL-3.0-or-later
/* E427 Lookup card: choosing another homograph in the styled dropdown (rendered on <body>) keeps the card open and swaps the entry */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=require('./flat-source.cjs')(path.join(__dirname,'..','web','reader','modules','selection.js'));
test('the dropdown list counts as part of the lookup card',()=>{
 const m=src.match(/const inOwn=node=>node\?\.closest\?\.\('([^']+)'\)/);assert.ok(m,'inOwn found');
 const own=m[1].split(',');assert.ok(own.includes('.mg-select-pop'),'mg-select-pop is own');assert.ok(own.includes('.tomoyo-selection-card'));
 assert.match(src,/document\.addEventListener\('pointerdown',e=>\{if\(inOwn\(e\.target\)\)return;/,'outside-click close is guarded by inOwn');
 const poll=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','polish.js'),'utf8');assert.match(poll,/pop\.className='mg-select-pop'/);
});
test('switching homographs re-renders the card from the chosen entry',()=>{
 const body=src.slice(src.indexOf('其他同形词条'));assert.match(body,/select\.onchange=\(\)=>\{const replacement=\{\.\.\.result,entries:\[result\.entries\[Number\(select\.value\)\]\]\}/);
 assert.match(body,/wordHeader\(replacement,replacement\.entries\[0\],sub\);senses\(replacement\.entries\[0\],sub\)/);
});
