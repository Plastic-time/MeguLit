'use strict';
/* Issue 468 (寒蝉鸣泣之时解, full-page NVL): the text sometimes came out very large; the size set in MeguLit did nothing;
   Alt+T could make it smaller but closing the menu made it large again. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>require('./flat-source.cjs')(path.join(root,f));

for(const file of ['web/reader/modules/game-style.js','core/game-style.js']){
 const style=require('../'+file);
 const settings=style.clean({japaneseSize:34,translationSize:30,width:92,autoScale:true});
 const windowed={clientWidth:960,clientHeight:720,readerWidth:2560};
 test(file+': without the game client size the scale never comes from the desktop-wide layer',()=>{
  const known=style.gameScaleFor({settings,layout:windowed,bound:true,dpr:1,innerWidth:2560,dialogOpen:false,previous:1});
  assert.equal(known,.75);
  for(const layout of [null,{readerWidth:2560},{clientWidth:0,clientHeight:0,readerWidth:2560}])
   for(const dialogOpen of [false,true])
    assert.equal(style.gameScaleFor({settings,layout,bound:true,dpr:1,innerWidth:2560,dialogOpen,previous:known}),known,'kept: '+JSON.stringify(layout)+' menu '+dialogOpen);
  assert.equal(style.gameScaleFor({settings,layout:null,bound:false,dpr:1,innerWidth:2560,dialogOpen:false,previous:known}),1,'unbound reader: own size');
 });
 test(file+': a hand-set size is never capped or replaced by an automatic one',()=>{
  const user=style.clean({...settings,japaneseSize:20,translationSize:18,sizeSource:'user'});
  assert.equal(user.translationSize,18);assert.equal(user.sizeSource,'user');
  const s=style.gameScaleFor({settings:user,layout:{clientWidth:1280,clientHeight:300},bound:true,dpr:1,innerWidth:1920,dialogOpen:false,previous:1});
  assert.ok(Math.abs(s-1)<1e-9,String(s));
 });
}

test('Alt+T: a size changed in the menu is kept when the menu closes (same value as the home settings, hand-set)',()=>{
 const src=read('web/reader/modules/gal.js');
 const close=src.slice(src.indexOf("dialog.addEventListener('close', () => { if(previewFrame)"));
 const keep=close.indexOf("committed=appearance.clean({...committed,...size,sizeSource:'user'})"),revert=close.indexOf('preferences = {...committed,interfaceMode:preferences.interfaceMode}');
 assert.ok(keep>0&&revert>keep,'sizes committed before the menu snapshot is restored');
 const block=close.slice(keep,revert);
 assert.match(block,/localStorage\.setItem\('tomoyo-gal-settings'/);
 assert.match(block,/send\(\{ type: 'galConfigure', settings: committed \}\)/);
 assert.match(block,/saveGameProfileFromMenu\?\.\(committed\)/);
});

test('page modes: a hand-set translation size wins over the game\'s size',()=>{
 assert.match(read('web/reader/modules/island-page.js'),/--tome-island-cn-size',\(userSize\(p,true\)\|\|Math\.min\(size/);
});
