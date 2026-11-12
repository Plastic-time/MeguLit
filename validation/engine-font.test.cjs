process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* E472 engine font: the face KiriKiri's lineLayer draws with, overridden by a pre-rendered glyph file of another family. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pick,familyClass}=require('../core/engine-font.cjs');
test('family class of face and .tft names',()=>{
 assert.equal(familyClass('ＭＳ Ｐ明朝'),'mincho');assert.equal(familyClass('ＭＳ Ｐゴシック'),'gothic');assert.equal(familyClass('mincho2'),'mincho');
 assert.equal(familyClass('Meiryo'),'gothic');assert.equal(familyClass('font_min24'),'mincho');assert.equal(familyClass('admin'),'');assert.equal(familyClass('Yu Mincho'),'mincho');});
test('ファタモルガーナの館: lineLayer face ＭＳ Ｐ明朝 with mincho2.tft keeps the face',()=>{
 assert.deepEqual(pick({face:'ＭＳ Ｐ明朝',prerendered:'mincho2.tft'}),{key:'engine:ＭＳ Ｐ明朝',face:'ＭＳ Ｐ明朝',reason:'face'});});
test('a pre-rendered mincho set over a gothic face wins',()=>{
 assert.equal(pick({face:'ＭＳ Ｐゴシック',prerendered:'mincho.tft'}).key,'originalMincho');
 assert.equal(pick({face:'ＭＳ 明朝',prerendered:'gothic24.tft'}).key,'originalGothic');
 assert.equal(pick({face:'ＭＳ Ｐゴシック',prerendered:'font1.tft'}).key,'engine:ＭＳ Ｐゴシック');});
test('bundled font of the same family first; unsafe faces refused',()=>{
 assert.equal(pick({face:'Ｍｅｒｒｉｗｅａｔｈｅｒ',fonts:[{id:'abcdef0123',family:'Merriweather',lang:'en'}]}).key,'game:abcdef0123');
 assert.equal(pick({face:'x";}'}),null);assert.equal(pick({face:''}),null);});
test('KiriKiri script reads the lineLayer font and first.ks mappfont, wraps nothing',()=>{
 const s=fs.readFileSync(path.join(__dirname,'..','native','krkrtext','script.inc'),'utf8');
 assert.match(s,/st\.drawFont=function\(L\)\{[^\n]*L\.lineLayer\.font/);assert.match(s,/\[\]\.load\('first\.ks'\)/);
 assert.match(s,/' pfont='\+pf/);assert.doesNotMatch(s,/mapPrerenderedFont\s*=/);
 const hb=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');assert.ok(hb.includes(String.raw` pfont=(\S{1,80}))? face=`));assert.match(hb,/prerendered=font\.Groups\[3\]\.Value/);});
