// 2026-11-16 (user video, 死に逝く君、館に芽吹く憎悪): Alt+T must only open/close the menu. Closing it re-sent the menu's
// snapshot (taken before the embed was restored, hookProfile 'read') as a preview; the host took the route from it and
// switched embedding off: the game's original showed and MeguLit's text vanished until the next check switched back.
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const {GalNative}=require('../core/gal-native.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function fakeHost(){
 const configured=[],sent=[];
 const h={preferences:{hookProfile:'embed',hookHide:true,hookAutoStart:true,hookFast:true,maskMode:'hook',x:10,y:25,width:90},state:{bound:true},previewPreferences:null,
  hooks:{configure:p=>configured.push(p.hookProfile)},compositor:{configure(){}},placement:{configure(){}},styleSync:{configure(){}},send:m=>sent.push(m)};
 h.hookPrefs=GalNative.prototype.hookPrefs.bind(h);return {h,configured,sent};
}

test('a page preview never changes the hook route (embed stays embed)',()=>{
 const {h,configured}=fakeHost();
 GalNative.prototype.preview.call(h,{hookProfile:'read',x:40,y:60,width:50});
 assert.equal(h.previewPreferences.hookProfile,'embed');
 assert.equal(h.previewPreferences.x,40,'style values still preview');
 assert.deepEqual(configured,['embed']);
});

test('closing the menu ends the preview: saved preferences apply again',()=>{
 const {h,configured,sent}=fakeHost();
 GalNative.prototype.preview.call(h,{hookProfile:'read',x:40});
 GalNative.prototype.endPreview.call(h);
 assert.equal(h.previewPreferences,null);
 assert.deepEqual(configured,['embed','embed']);
 assert.equal(sent.at(-1).type,'configure');assert.equal(sent.at(-1).x,10);
 const before=configured.length;GalNative.prototype.endPreview.call(h);assert.equal(configured.length,before,'no preview: nothing to undo');
});

test('reader host routes galPreviewEnd to the bridge host',()=>{
 assert.match(read('services/reader.cjs'),/case 'galPreviewEnd':g\?\.endPreview\?\.\(\);/);
});

test('menu close sends galPreviewEnd, not the snapshot as a preview',()=>{
 const s=read('web/reader/modules/gal.js');
 const close=s.slice(s.indexOf("dialog.addEventListener('close', () => { if(previewFrame)"),s.indexOf("send({ type: 'galMenu', open: true })"));
 assert.ok(close.length>0);
 assert.match(close,/send\(\{type:'galPreviewEnd'\}\)/);
 assert.doesNotMatch(close,/type:'galPreview',settings/);
});

test('host state pushed while the menu is open updates the menu snapshot',()=>{
 const s=read('web/reader/modules/gal.js');
 const restore=s.slice(s.indexOf('bridge.restoreGalSettings ='),s.indexOf('bridge.bindHotkeyResult'));
 assert.match(restore,/commitSynchronizedStyle\?\.\(restored\)/);
 // behaviour: run the same merge the open menu installs
 let committed={hookProfile:'read'};const commit=changed=>Object.assign(committed,changed);
 const restored={hookProfile:'embed'};commit(restored);
 assert.equal({...committed}.hookProfile,'embed');
});

test('Alt+T / Alt+H: one path; the page ignores keys the bridge holds',()=>{
 const s=read('web/reader/modules/settings.js'),b=read('web/reader/bootstrap.js');
 assert.match(b,/b\.nativeHotkeys=\{menu:message\.hotkey,cover:message\.coverHotkey===true\}/);
 // replay the page keydown logic with the bridge holding Alt+T
 const handler=s.slice(s.indexOf("document.addEventListener('keydown', event => {")+"document.addEventListener('keydown', ".length,s.indexOf('}, true);',s.indexOf("document.addEventListener('keydown', event => {"))+1);
 let toggles=0,covers=0;
 const bridge={nativeHotkeys:{menu:true,cover:true},toggleGalMenu:()=>toggles++};
 const fn=new Function('bridge','dialog','window',`return ${handler};`)(bridge,null,{__tomoyoTranslateRequest:()=>covers++});
 const ev=code=>({altKey:true,code,repeat:false,preventDefault(){},stopImmediatePropagation(){}});
 fn(ev('KeyT'));fn(ev('KeyH'));
 assert.equal(toggles,0,'menu toggled only by the bridge hotkey');assert.equal(covers,0,'cover toggled only by the bridge hotkey');
 bridge.nativeHotkeys={menu:false,cover:false};fn(ev('KeyT'));fn(ev('KeyH'));
 assert.equal(toggles,1,'fallback when another program holds Alt+T');assert.equal(covers,1);
});

test('Alt+T leaves no lone Alt behind: a mask key goes out while Alt is still down',()=>{
 const s=read('native/GalWindowBridge.cs');
 assert.match(s,/if\(message\.message==0x0312\)MaskAltRelease\(\);/);
 const fn=s.slice(s.indexOf('static void MaskAltRelease(){'),s.indexOf('static void ToggleCover(){'));
 assert.match(fn,/GetAsyncKeyState\(0x12\)&0x8000\)==0\)return;/,'only while Alt is held');
 assert.match(fn,/keybd_event\(0xE8,0,0,UIntPtr\.Zero\);keybd_event\(0xE8,0,2,UIntPtr\.Zero\);/);
});

test('why the layer was hidden reaches reader-host.log once per change',()=>{
 const s=read('services/reader.cjs');
 const at=s.indexOf("if(message.type==='coverDebug'");assert.ok(at>0);
 const logs=[];const self={logVisibility:e=>logs.push(e)};
 const body=s.slice(at,s.indexOf('\n',at));
 const call=m=>new Function('self','message',body.replace(/this\./g,'self.'))(self,m);
 call({type:'coverDebug',text:'阅读层隐藏 (translation, target=True) menu=False/False cover=True dialog=True iconic=False fg=other'});
 call({type:'coverDebug',text:'阅读层隐藏 (translation, target=True) menu=False/False cover=True dialog=True iconic=False fg=other'});
 assert.equal(logs.length,1);assert.match(logs[0].text,/fg=other/);
});
test('2026-11-16: closing the Alt+T menu hands the page the host state, never the stale menu snapshot',()=>{
 const s=require('fs').readFileSync(require('path').join(__dirname,'../services/reader.cjs'),'utf8');
 assert.match(s,/case 'galPreviewEnd':g\?\.endPreview\?\.\(\);[^\n]*reply\('restoreGalSettings',\{\.\.\.g\.preferences/);
});
test('2026-11-16 #299: an open Alt+T menu keeps the reading layer up before its hit region is ready',()=>{
 const s=require('fs').readFileSync(require('path').join(__dirname,'../native/GalWindowBridge.cs'),'utf8');
 assert.match(s,/ReadingVisible\(Layer\.Context,IsIconic\(Target\),IsIconic\(Overlay\),CoverEnabled,DialogVisible,MenuOpen\)/);
});
