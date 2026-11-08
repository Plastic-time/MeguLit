// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../web/grid-motion.js')).toString('base64'));
async function fixture(reduced=false){const {observeGridMotion}=await modulePromise;let update,disconnected=false;const played=[];
 const nodes=Array.from({length:3},(_,i)=>({offsetLeft:i*200,offsetTop:0,getBoundingClientRect(){throw Error('Animated viewport coordinates must not be sampled');},animate(frames,options){const animation={cancelled:false,cancel(){this.cancelled=true;}};played.push({frames,options,animation});return animation;}}));
 const grid={children:nodes,isConnected:true};class Observer{constructor(callback){update=callback;}observe(){}disconnect(){disconnected=true;}}
 const stop=observeGridMotion(grid,{Observer,reducedMotion:()=>reduced});return{grid,nodes,played,stop,update:()=>update(),disconnected:()=>disconnected};
}
test('continuous resizing of one row never accumulates translated card positions',async()=>{const f=await fixture();for(let i=0;i<200;i++){f.nodes.forEach((node,index)=>node.offsetLeft=index*(160+i));f.update();}assert.equal(f.played.length,0);f.stop();});
test('actual reflow keeps its full duration across subsequent resize callbacks',async()=>{const f=await fixture();f.nodes[2].offsetLeft=0;f.nodes[2].offsetTop=300;f.update();assert.equal(f.played.length,1);assert.equal(f.played[0].options.duration,220);assert.equal(f.played[0].frames[0].translate,'400px -300px');f.nodes[2].offsetTop=320;f.update();assert.equal(f.played[0].animation.cancelled,false);assert.equal(f.played.length,1);f.stop();assert.ok(f.played[0].animation.cancelled);assert.ok(f.disconnected());});
test('scroll and grid origin changes do not move cards; detached grids disconnect',async()=>{const f=await fixture();f.update();f.update();assert.equal(f.played.length,0);f.grid.isConnected=false;f.update();assert.ok(f.disconnected());});
test('reduced motion skips reflow animation',async()=>{const f=await fixture(true);f.nodes[2].offsetTop=300;f.update();assert.equal(f.played.length,0);f.stop();});
