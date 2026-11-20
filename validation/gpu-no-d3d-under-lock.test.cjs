'use strict';
/* CHAOS;CHILD skip freeze (game-hang.dmp): Lock held across a d3d9 call deadlocked with the d3d9 device lock. No D3D/COM or GL
   call is made while the GPU layer's Lock is held, in any of its sources. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'..','native','gpuhide'),files=['GpuHide.cpp','GpuHide11.h','GpuHideGL.h','FontDots.h','GlyphTrace.h','GlyphQuads.h'].filter(f=>fs.existsSync(path.join(dir,f)));
const src=fs.readFileSync(path.join(dir,'GpuHide.cpp'),'utf8');
function guardBlocks(s){const out=[];let i=0;while((i=s.indexOf('Guard g;',i))>=0){let depth=0,j=i;for(;j<s.length;j++){const c=s[j];if(c==='{')depth++;else if(c==='}'){if(depth===0)break;depth--;}}out.push({at:i,body:s.slice(i,j)});i+=8;}return out;}
test('no COM or GL call while Lock is held',()=>{
 assert.ok(!/NoteTexture/.test(src),'NoteTexture split into ProbeTexture (no lock) + StoreTexture (lock)');
 const bad=[];for(const f of files){const t=fs.readFileSync(path.join(dir,f),'utf8');for(const g of guardBlocks(t)){const m=/->\s*[A-Z]\w*\(|\bgl[A-Z]\w*\(/.exec(g.body);if(m)bad.push(f+':'+t.slice(0,g.at).split('\n').length+': '+m[0]);}}
 assert.deepStrictEqual(bad,[],'COM/GL calls under Guard');
 assert.match(src,/TexInfo ti = ProbeTexture\(t\); Guard g; DevOf\(d\)->tex0 = t; StoreTexture\(t, ti\);/);
});
