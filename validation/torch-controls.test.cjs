/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/torch-controls.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('a long retreat during the intro or while panning keeps the camera above the floor',async()=>{
 const {createTorchZoom,keepTorchCameraAboveFloor}=await load();
 const zoom=createTorchZoom({reduced:true});
 for(let i=0;i<30;i++)zoom.wheel(120);
 const intro={y:27+(2.6-27)*zoom.value,z:3+(37-3)*zoom.value};
 const dragged={y:4.7+(2.3-4.7)*zoom.value-3,z:20.5*zoom.value};
 const inside={y:2.3,z:20.5};
 keepTorchCameraAboveFloor(intro);
 keepTorchCameraAboveFloor(dragged);
 keepTorchCameraAboveFloor(inside);
 assert.deepEqual(intro,{y:1.2,z:54});
 assert.deepEqual(dragged,{y:1.2,z:30.75});
 assert.deepEqual(inside,{y:2.3,z:20.5});
});
test('wheel zoom continues gently after input stops and converges at both frame rates',async()=>{const {createTorchZoom}=await load(),a=createTorchZoom(),b=createTorchZoom();a.wheel(-120);b.wheel(-120);const target=a.target,first=a.step(1/60),next=a.step(1/60);assert(first<1&&first>target);assert(next<first&&next>target);for(let i=0;i<58;i++)a.step(1/60);for(let i=0;i<30;i++)b.step(1/30);assert(Math.abs(a.value-b.value)<1e-12);assert(Math.abs(a.value-target)<.00002);});
test('zoom bounded, wheel units normalized, reduced-motion immediate, reset stable',async()=>{const {createTorchZoom}=await load(),z=createTorchZoom();for(let i=0;i<100;i++)z.wheel(-1000);assert.equal(z.target,.24);for(let i=0;i<100;i++)z.wheel(1000);assert.equal(z.target,1.5);z.reset();assert.equal(z.value,1);assert.equal(z.target,1);z.wheel(NaN);assert.equal(z.target,1);const line=createTorchZoom(),pixel=createTorchZoom();line.wheel(3,1);pixel.wheel(48,0);assert.equal(line.target,pixel.target);const r=createTorchZoom({reduced:true});r.wheel(-100);assert.equal(r.value,r.target);});
