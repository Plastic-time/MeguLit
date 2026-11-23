'use strict';
/* Owner 2026-11-21: Alt+T sliders hard to grab / did not move. The press area is 20 px tall (the drawn rail stays thin), and a
   value code writes back right after the user's input is logged (kind=sliderOverwrite) */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const W=f=>fs.readFileSync(path.join(__dirname,'..','web','reader',f),'utf8');
test('slider press area and overwrite diagnostic',()=>{
 assert.match(W('host-surface.css'),/\.tomoyo-cn-dialog input\[type=range\]\{height:20px!important;background-size:100% 4px!important;background-position:0 50%!important/);
 const a=W('modules/altt-compact.js');
 assert.match(a,/kind:'sliderOverwrite'/);assert.match(a,/performance\.now\(\)-r\.at<300&&String\(v\)!==String\(r\.v\)/);assert.match(a,/desc\.set\.call\(this,v\);/,'the write still happens');
});
