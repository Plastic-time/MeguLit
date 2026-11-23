'use strict';
/* Owner 2026-11-21: with b31d1ae6 every Alt+T slider in every game stopped dragging (headless it dragged): the gate, now on
   while the menu is open, took the panel's gestures. A gesture that starts on the panel goes to the WebView untouched. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const N=f=>fs.readFileSync(path.join(__dirname,'..','native',f),'utf8');
test('panel gestures pass the pointer gate',()=>{
 const g=N('ReaderPointerGate.cs'),b=N('GalWindowBridge.cs');
 assert.match(b,/class HitRegion\{public Rect Bounds;public bool Pass;public bool Menu;/);
 assert.match(b,/Menu=Bool\(rect,"menu"\)/,'the page\'s menu flag is kept');
 assert.match(b,/HitRegions\.FindAll\(h=>h\.Menu\)\.ConvertAll\(h=>h\.Bounds\)\.ToArray\(\)\);/);
 assert.match(g,/if\(gesture\.Owner==null&&index>=0&&context\.InMenu\(point\.X,point\.Y\)\)return false;/,'a press on the panel is not taken: press, moves and release go to the WebView');
 assert.match(g,/if\(!c\.InMenu\(1500,400\)\|\|c\.InMenu\(300,620\)\|\|!c\.Hit\(300,620\)\)return false;/,'self-test');
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','interaction.js'),'utf8'),/menu:isMenu/,'regions carry the menu flag');
});
