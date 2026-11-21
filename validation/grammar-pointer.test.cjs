'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('a second touch on a grammar tile cannot move or drop the first drag',async t=>{
 const {pointerDrag}=await import('../web/drag.js');
 const classes=()=>{const set=new Set();return {add:c=>set.add(c),remove:c=>set.delete(c),has:c=>set.has(c)};};
 const el=Object.assign(new EventTarget(),{dataset:{},style:{},classList:classes(),
  getBoundingClientRect:()=>({width:20,height:20}),setPointerCapture(){},releasePointerCapture(){}});
 const ghosts=new Set(),slot={classList:classes()},drops=[];
 el.cloneNode=()=>({style:{},classList:classes(),removeAttribute(){},remove(){ghosts.delete(this);}});
 const old=Object.getOwnPropertyDescriptor(globalThis,'document');
 const doc=Object.assign(new EventTarget(),{elementFromPoint:()=>({closest:()=>slot}),body:{appendChild:g=>ghosts.add(g)}});
 Object.defineProperty(globalThis,'document',{value:doc,configurable:true});
 t.after(()=>{if(old)Object.defineProperty(globalThis,'document',old);else delete globalThis.document;});
 pointerDrag(el,{over:'[data-slot]',onDrop:s=>drops.push(s)});
 const send=(type,pointerId,x)=>el.dispatchEvent(Object.assign(new Event(type),{pointerId,button:0,clientX:x,clientY:0}));
 send('pointerdown',1,0);send('pointerdown',2,0);send('pointermove',2,20);
 assert.equal(ghosts.size,0);
 send('pointermove',1,30);
 assert.equal(ghosts.size,1);
 send('pointerup',2,40);
 assert.deepEqual(drops,[]);assert.equal(ghosts.size,1);
 send('pointerup',1,40);
 assert.deepEqual(drops,[slot]);assert.equal(ghosts.size,0);
 send('pointerdown',2,0);send('pointermove',2,30);send('pointercancel',2,30);
 assert.deepEqual(drops,[slot]);assert.equal(ghosts.size,0);
 send('pointerdown',3,0);send('pointermove',3,30);
 el.isConnected=false;
 doc.dispatchEvent(Object.assign(new Event('lostpointercapture'),{pointerId:3}));
 el.isConnected=true;
 assert.deepEqual(drops,[slot]);assert.equal(ghosts.size,0);
 send('pointerdown',4,0);send('pointermove',4,30);send('pointerup',4,40);
 assert.deepEqual(drops,[slot,slot]);assert.equal(ghosts.size,0);
 send('pointerdown',5,0);send('pointermove',5,30);
 const lost=Object.assign(new Event('lostpointercapture'),{pointerId:5});
 Object.defineProperty(lost,'target',{value:el});
 doc.dispatchEvent(lost);
 assert.equal(ghosts.size,0);assert.deepEqual(drops,[slot,slot]);
});
