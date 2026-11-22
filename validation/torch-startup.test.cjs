/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const web=path.join(__dirname,'../web');
const source=fs.readFileSync(path.join(web,'torch-monument.js'),'utf8')
 .split('/* ================= the scene ================= */')[0]
 .replace(/^import .*\r?\n/gm,'').replaceAll('export ','');
const deferred=()=>Promise.withResolvers();

function fixture(){
 const calls=[],nodes=new Map(),bake=deferred(),font=deferred(),page=deferred();
 let ready,builds=0,disposals=0;
 const node=()=>({style:{},setAttribute(){},addEventListener(){},remove(){this.removed=true;}});
 const host={...node(),querySelector(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);}};
 const context={
  performance,setTimeout,window:{},localStorage:{getItem:()=> 'high'},matchMedia:()=>({matches:false}),
  document:{fonts:{load(){calls.push('font');return font.promise;}},
   createElement:tag=>tag==='canvas'?{getContext:()=>({measureText:()=>({width:10})})}:host,
   addEventListener(){},removeEventListener(){}},
  addEventListener(){},removeEventListener(){},ResizeObserver:class{observe(){} disconnect(){}},
  loadGsap(){calls.push('gsap');return Promise.resolve(null);},
  loadBaked(){calls.push('bake');return bake.promise;},
  withBaked:(result,build)=>build(),
  buildScene(){builds++;return {tier:'high',prepare:fn=>{ready=fn;},intro(){},paintFace(){},dispose(){disposals++;}};}
 };
 const {openTorchMonument,closeTorchMonument}=vm.runInNewContext(source+'\n({openTorchMonument,closeTorchMonument})',context);
 const open=()=>openTorchMonument({locale:'en',mount:{append(el){assert.equal(el,host);}},
  api(name){calls.push(name);return name==='torch_page'?page.promise:Promise.resolve({ok:false});}});
 return {open,close:closeTorchMonument,host,nodes,calls,bake,font,page,ready:()=>ready(),get builds(){return builds;},get disposals(){return disposals;}};
}

test('prepare local assets and page 1 together, then discard a visit cancelled during startup',async()=>{
 const f=fixture();
 const pending=f.open();
 assert.deepEqual(f.calls,['font','gsap','bake','torch_page']);
 assert.equal(f.nodes.get('.tm-status').textContent,'Preparing the hall…');
 assert.doesNotMatch(f.host.innerHTML,/tm-close/);
 f.close();
 f.bake.resolve({ok:true});f.font.resolve();f.page.resolve({ok:true,items:[]});
 assert.equal(await pending,null);
 assert.equal(f.host.removed,true);
 assert.equal(f.builds,0);
 assert.deepEqual(f.calls,['font','gsap','bake','torch_page']);
});

test('scene preparation can finish before names arrive, and navigation owns teardown',async()=>{
 const f=fixture();
 const pending=f.open();
 f.bake.resolve({ok:true});f.font.resolve();
 await pending;
 assert.equal(f.builds,1);
 f.ready();
 assert.equal(f.nodes.get('.tm-status').textContent,'Loading…');
 f.close();f.close();
 f.page.resolve({ok:true,items:[]});
 assert.equal(f.host.removed,true);
 assert.equal(f.disposals,1);
});
