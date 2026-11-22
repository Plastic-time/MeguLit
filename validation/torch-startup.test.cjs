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
 const calls=[],globalEvents=new EventTarget(),documentEvents=new EventTarget(),bake=deferred(),font=deferred(),page=deferred();
 const mounts=[],scenes=[],search=deferred(),jump=deferred();
 let builds=0,disposals=0,lookups=0,intros=0,active=false,paints=0;
 function node(){
  return Object.assign(new EventTarget(),{style:{},setAttribute(){},remove(){
   if(this.parent?.child===this)this.parent.child=null;
   this.removed=true;
  }});
 }
 const nodes=new Map();
 const context={
  performance,setTimeout,window:{},localStorage:{getItem:()=> 'high'},matchMedia:()=>({matches:false}),
  document:{fonts:{load(){calls.push('font');return font.promise;}},hasFocus:()=>true,
   createElement(tag){
    if(tag==='canvas')return {getContext:()=>({measureText:()=>({width:10})})};
    const host=node(),children=new Map();nodes.set(host,children);
    host.querySelector=key=>{if(!children.has(key))children.set(key,node());return children.get(key);};
    host.contains=()=>true;
    return host;
   },
   addEventListener:documentEvents.addEventListener.bind(documentEvents),removeEventListener:documentEvents.removeEventListener.bind(documentEvents)},
  addEventListener:globalEvents.addEventListener.bind(globalEvents),removeEventListener:globalEvents.removeEventListener.bind(globalEvents),
  ResizeObserver:class{observe(){this.observing=true;} disconnect(){this.observing=false;}},
  loadGsap(){calls.push('gsap');return Promise.resolve(null);},
  loadBaked(){calls.push('bake');return bake.promise;},
  withBaked:(result,build)=>build(),
  buildScene({onFirstFrame}){
   builds++;
   const scene={tier:'high',firstFrame:onFirstFrame,prepare(fn){this.ready=fn;},intro(){intros++;},resize(){},
    setActive(on){active=on;},suspend(){active=false;},reading(){lookups++;return false;},
    paintFace(){paints++;},dispose(){disposals++;}};
   scenes.push(scene);return scene;
  }
 };
 const hall=vm.runInNewContext(source+'\n({openTorchMonument,closeTorchMonument,suspendTorchMonument,invalidateTorchMonument})',context);
 const api=(name,params)=>{
  calls.push(name);
  if(name==='torch_page')return params.cursor?jump.promise:page.promise;
  if(name==='torch_find'&&!params.probe)return search.promise;
  return Promise.resolve({ok:false});
 };
 const notes=[];
 const open=(locale='en',onContextLost)=>{
  const mount={append(el){el.parent=this;this.child=el;el.removed=false;}};
  mounts.push(mount);
  return hall.openTorchMonument({locale,mount,api,toast:note=>notes.push(note),onContextLost});
 };
 const emit=(type,props={})=>globalEvents.dispatchEvent(Object.assign(new Event(type),props));
 return {open,close:hall.closeTorchMonument,suspend:hall.suspendTorchMonument,invalidate:hall.invalidateTorchMonument,emit,
  get host(){return [...nodes.keys()].at(-1);},get nodes(){return nodes.get(this.host);},
  mounts,calls,bake,font,page,search,jump,notes,ready:()=>scenes.at(-1).ready(),firstFrame:()=>scenes.at(-1).firstFrame(),
  get active(){return active;},get builds(){return builds;},get disposals(){return disposals;},
  get lookups(){return lookups;},get intros(){return intros;},get paints(){return paints;}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const resolveAssets=f=>{f.bake.resolve({ok:true});f.font.resolve();};
async function prepared(f){
 const opening=f.open();
 resolveAssets(f);f.page.resolve({ok:true,items:[{torchNo:0,name:'First'}],total:1});
 await opening;f.ready();
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

test('scene preparation can finish before names arrive, and explicit close owns teardown',async()=>{
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

test('a missing route, a connection failure and an empty page have distinct status',async()=>{
 for(const [response,message] of [
  [{ok:false,error:'NOT_DEPLOYED'},'This list feature is not available on the server yet.'],
  [{ok:false,error:'OFFLINE'},'Cannot reach the server right now. Try again later.'],
  [{ok:true,total:0,items:[]},'']
 ]){
  const f=fixture();
  const pending=f.open();
  f.bake.resolve({ok:true});f.font.resolve();f.page.resolve(response);
  await pending;
  f.ready();
  assert.equal(f.nodes.get('.tm-status').textContent,message);
  assert.equal(f.nodes.get('.tm-status').hidden,!message);
  f.close();
 }
});


test('leave and reenter reuse a prepared scene and its first frame without repolling',async()=>{
 const f=fixture();await prepared(f);
 const host=f.host,calls=[...f.calls],veil=f.nodes.get('.tm-veil'),paints=f.paints;
 assert.equal(f.active,true);
 assert.equal(f.intros,0);
 f.suspend();
 assert.equal(f.active,false);
 assert.equal(f.mounts[0].child,null);
 f.emit('focus');
 f.emit('keydown',{key:'Escape'});
 assert.equal(f.active,false);
 assert.equal(f.lookups,0);
 await f.open();
 assert.equal(f.mounts[1].child,host);
 assert.equal(f.intros,0);
 f.firstFrame();
 assert.equal(f.intros,1);
 assert.equal(veil.style.opacity,'0');
 f.suspend();
 await f.open();
 assert.equal(f.mounts[2].child,host);
 assert.deepEqual(f.calls,calls);
 assert.equal(f.paints,paints);
 assert.equal(f.intros,1);
 assert.equal(f.builds,1);
 assert.equal(f.disposals,0);
 assert.equal(f.active,true);
 f.close();
});

test('in-flight preparation is shared and does not build into a route that has already left',async()=>{
 const f=fixture(),first=f.open();
 f.suspend();
 resolveAssets(f);f.page.resolve({ok:true,items:[]});
 await flush();await flush();
 assert.equal(f.builds,0);
 assert.equal(f.active,false);
 const second=f.open();
 assert.equal(await first,await second);
 assert.equal(f.builds,1);
 assert.equal(f.calls.filter(call=>call==='torch_page').length,1);
 f.close();
});

test('late search and jump replies cannot toast or change the roster after a new visit',async()=>{
 const f=fixture();await prepared(f);
 const form=f.nodes.get('.tm-find');
 const input=f.host.querySelector('.tm-find input');
 input.value='someone';form.dispatchEvent(new Event('submit'));
 input.value='#100';form.dispatchEvent(new Event('submit'));
 assert.equal(f.calls.filter(name=>name==='torch_page').length,2);
 f.suspend();await f.open();
 const paints=f.paints;
 f.search.resolve({ok:false});
 f.jump.resolve({ok:true,total:1,items:[{torchNo:100,name:'Late'}]});
 await flush();
 assert.match(f.nodes.get('.tm-range').textContent,/0/);
 assert.deepEqual(f.notes,[]);
 assert.equal(f.paints,paints);
 assert.equal(f.nodes.get('.tm-status').hidden,true);
 f.close();
});

test('a detached scene is disposed on locale change, shutdown or context loss',async()=>{
 for(const dispose of [
  f=>f.invalidate('ja'),
  f=>f.emit('pagehide',{persisted:false}),
  f=>f.emit('megulit-game-launch'),
  f=>f.nodes.get('.tm-canvas').dispatchEvent(new Event('webglcontextlost'))
 ]){
  const f=fixture();await prepared(f);
  f.suspend();
  f.emit('pagehide',{persisted:true});
  assert.equal(f.disposals,0);
  dispose(f);
  assert.equal(f.disposals,1);
  assert.equal(f.active,false);
  await f.open();
  assert.equal(f.builds,2);
  f.close();
 }
});

test('context loss calls only the current route recovery handler',async()=>{
 const f=fixture();await prepared(f);
 const canvas=f.nodes.get('.tm-canvas');
 f.suspend();
 let recoveries=0;
 await f.open('en',()=>recoveries++);
 canvas.dispatchEvent(new Event('webglcontextlost'));
 canvas.dispatchEvent(new Event('webglcontextlost'));
 assert.equal(recoveries,1);
 assert.equal(f.disposals,1);
 assert.equal(f.mounts.at(-1).child,null);
});
