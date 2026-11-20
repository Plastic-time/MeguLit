'use strict';
/* CHAOS;CHILD skip freeze (game-hang.dmp): Lock held across a d3d9 call deadlocked with the d3d9 device lock. No D3D/COM call
   is made while the GPU layer's Lock is held: a Guard block in the D3D9 hooks never calls a COM method. */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','native','gpuhide','GpuHide.cpp'),'utf8');
function guardBlocks(s){const out=[];let i=0;while((i=s.indexOf('Guard g;',i))>=0){/* the block that holds the guard: from here to the end of the enclosing brace */let depth=0,j=i;for(;j<s.length;j++){const c=s[j];if(c==='{')depth++;else if(c==='}'){if(depth===0)break;depth--;}}out.push({at:i,body:s.slice(i,j)});i+=8;}return out;}
test('no COM method call while Lock is held (D3D9 hooks)',()=>{
 assert.ok(!/NoteTexture/.test(src),'NoteTexture split into ProbeTexture (no lock) + StoreTexture (lock)');
 const bad=[];for(const g of guardBlocks(src)){const m=/(\b[a-z]\w*)->(GetDesc|GetContainer|GetLevelDesc|GetType|GetSurfaceLevel|GetDevice|Lock|Unlock|Release|QueryInterface|GetVertexDeclaration|GetTexture|GetStreamSource|GetIndices)\(/.exec(g.body);if(m)bad.push(src.slice(0,g.at).split('\n').length+': '+m[0]);}
 assert.deepStrictEqual(bad,[],'COM calls under Guard');
 assert.match(src,/TexInfo ti = ProbeTexture\(t\); Guard g; DevOf\(d\)->tex0 = t; StoreTexture\(t, ti\);/);
});
