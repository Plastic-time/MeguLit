/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/torch-controls.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));

test('ground limits height but preserves travel in both horizontal axes',async()=>{
 const {keepTorchCameraAboveFloor}=await load();
 const below={x:853,y:-8,z:-917},above={x:-853,y:300,z:917};
 keepTorchCameraAboveFloor(below);keepTorchCameraAboveFloor(above);
 assert.deepEqual(below,{x:853,y:1.2,z:-917});
 assert.deepEqual(above,{x:-853,y:300,z:917});
 const shore={x:0,y:-8,z:62};keepTorchCameraAboveFloor(shore,-4);
 assert.deepEqual(shore,{x:0,y:-2.8,z:62});
});

test('walking damps wheel input without losing distance at either frame rate',async()=>{
 const {createTorchWalk}=await load(),a=createTorchWalk(),b=createTorchWalk();
 a.wheel(-120);b.wheel(-120);
 const first=a.step(1/60),next=a.step(1/60);
 assert.ok(first>next&&next>0);
 let x=first+next,y=0;
 for(let i=2;i<120;i++)x+=a.step(1/60);
 for(let i=0;i<60;i++)y+=b.step(1/30);
 assert.ok(Math.abs(x-y)<1e-10);
 assert.ok(Math.abs(x-4.32)<1e-8);
});

test('repeated wheel input has no travel limit and reset discards queued movement',async()=>{
 const {createTorchWalk}=await load(),walk=createTorchWalk({reduced:true});
 for(let i=0;i<250;i++)walk.wheel(-120);
 assert.ok(walk.step(0)>1000);
 assert.equal(walk.step(0),0);
 walk.wheel(3,1);const line=walk.step(0);walk.wheel(48);assert.equal(line,walk.step(0));
 walk.wheel(-3,2);walk.reset();walk.wheel(NaN);assert.equal(walk.step(0),0);
});
