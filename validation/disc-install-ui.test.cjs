/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const base=path.join(__dirname,'..','web');
const flowURL=data(fs.readFileSync(path.join(base,'disc-install-flow.js'),'utf8'));
const wordsURL=data(fs.readFileSync(path.join(base,'disc-install-copy.js'),'utf8'));
const uiURL=data(fs.readFileSync(path.join(base,'disc-install.js'),'utf8').replace("'./disc-install-flow.js'",JSON.stringify(flowURL)).replace("'./disc-install-copy.js'",JSON.stringify(wordsURL)));
const imports=Promise.all([import(flowURL),import(wordsURL),import(uiURL)]);
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('actual Japanese-original import context includes its installation guidance',async()=>{
 const [, {discWords},{discInstallHTML}]=await imports;
 const app=fs.readFileSync(path.join(base,'app.js'),'utf8');
 assert.match(app,/installDisc\(\[source\],'japanese'\)/);
 const view={session:null,paths:[],installRoots:[],confirmed:false,pending:false};
 for(const locale of ['zh','en','ja']){
  assert.ok(discInstallHTML(view,{locale,context:'japanese'}).includes(discWords[locale].jp));
  assert.ok(discInstallHTML(view,{locale,context:'jp-import'}).includes(discWords[locale].jp));
  assert.equal(discInstallHTML(view,{locale,context:'library'}).includes(discWords[locale].jp),false);
 }
});
const dto=(state,extra={})=>({id:'owned-fixture',state,busy:false,mounted:false,image:'H:\\fixture.mds',installers:[],candidates:[],imported:[],warnings:[],error:'',...extra});
function fake(api,extra={}){return {api,schedule:()=>1,unschedule:()=>{},...extra};}
test('all eight image suffixes are handed to the backend unchanged; no conversion or pair guessing',async()=>{
 const [{discImagePaths}]=await imports;
 const paths=['mds','mdf','cue','bin','ccd','img','nrg','iso'].map(x=>'H:\\fixture.'+x);
 assert.deepEqual(discImagePaths(paths),paths);assert.deepEqual(discImagePaths(['x.exe','x.zip','x.iso\0']),[]);
});
test('prepare and mount consent do not silently install a standard driver',async()=>{
 const [{createDiscInstallFlow}]=await imports,calls=[];let mounts=0;
 const flow=createDiscInstallFlow(fake(async(action,args)=>{calls.push([action,args]);
  if(action==='disc_prepare')return dto('ready_to_mount');
  if(action==='disc_mount')return ++mounts===1?dto('awaiting_driver'):dto('ready_to_install',{mounted:true});
  if(action==='disc_driver')return dto('ready_to_mount');throw Error('UNEXPECTED_ACTION');
 }));
 await flow.prepare(['H:\\fixture.mds'],['H:\\Games']);await flush();assert.deepEqual(calls.map(x=>x[0]),['disc_prepare']);
 await flow.confirm();await flush();assert.deepEqual(calls.map(x=>x[0]),['disc_prepare','disc_mount']);
 await flow.retryDriver();await flush();assert.deepEqual(calls[2],['disc_driver',{id:'owned-fixture',confirmed:true,mode:'standard'}]);
 assert.equal(calls.filter(x=>x[0]==='disc_mount').length,2);flow.dispose();
});
test('confirmed single installer launches once, scan imports, and only real unmount DTO finishes',async()=>{
 const [{createDiscInstallFlow}]=await imports,calls=[];let refreshed=0;
 const flow=createDiscInstallFlow(fake(async(action,args)=>{calls.push([action,args]);
  if(action==='disc_prepare')return dto('ready_to_mount');
  if(action==='disc_mount')return dto('ready_to_install',{mounted:true,installers:[{path:'R:\\setup.exe',name:'Setup'}]});
  if(action==='disc_install')return dto('installing',{mounted:true});
  if(action==='disc_scan')return dto('awaiting_unmount',{mounted:true,imported:[{id:'game',title:'Neutral',executable:'H:\\Games\\game.exe'}]});
  if(action==='disc_finish')return dto('done',{mounted:false,keepMounted:false});throw Error('UNEXPECTED_ACTION');
 },{onLibraryChanged:async()=>{refreshed++;}}));
 await flow.prepare(['H:\\fixture.iso'],['H:\\Games']);await Promise.all([flow.confirm(),flow.confirm()]);await flush();
 assert.equal(calls.filter(x=>x[0]==='disc_install').length,1);assert.equal(await flow.finish(false),false);
 await flow.scan();assert.equal(refreshed,1);await flow.finish(false);assert.equal(flow.state().session.mounted,false);flow.dispose();
});
test('cancel never kills installer and a keep-mounted completion stays visibly mounted',async()=>{
 const [{createDiscInstallFlow},,{discInstallHTML}]=await imports,calls=[];
 const flow=createDiscInstallFlow(fake(async action=>{calls.push(action);
  return action==='disc_prepare'?dto('ready_to_mount'):action==='disc_mount'?dto('installing',{mounted:true}):action==='disc_cancel'?dto('awaiting_unmount',{mounted:true,warnings:['DISC_INSTALLER_NOT_STOPPED']}):dto('done',{mounted:true,keepMounted:true});
 }));
 await flow.prepare(['H:\\fixture.iso'],['H:\\Games']);await flow.confirm();await flow.cancel();await flow.finish(true);
 const html=discInstallHTML(flow.state(),{locale:'en'});assert.ok(html.includes('remains mounted'));assert.equal(html.includes('disc was unmounted'),false);
 assert.equal(calls.some(x=>/kill|terminate/i.test(x)),false);flow.dispose();
});
test('false unmount claims, stale responses and changed session identities do not become success',async()=>{
 const [{createDiscInstallFlow}]=await imports;let resolve,changes=0;
 const late=createDiscInstallFlow(fake(()=>new Promise(r=>{resolve=r;}),{onChange:()=>changes++}));
 const work=late.prepare(['H:\\fixture.iso'],['H:\\Games']);late.dispose();const before=changes;resolve(dto('ready_to_mount'));await work;await flush();assert.equal(changes,before);assert.equal(late.state().session,null);
 const flow=createDiscInstallFlow(fake(async action=>action==='disc_prepare'?dto('ready_to_mount'):action==='disc_mount'?dto('awaiting_unmount',{mounted:true}):dto('done',{mounted:true,keepMounted:false})));
 await flow.prepare(['H:\\fixture.iso'],['H:\\Games']);await flow.confirm();assert.equal(await flow.finish(false),false);assert.equal(flow.state().notice,'DISC_UI_PROTOCOL');assert.equal(flow.state().session.state,'awaiting_unmount');flow.dispose();
});
test('three-language renderer escapes paths, names and says standard driver/UAC explicitly',async()=>{
 const [, {discWords,discError},{discInstallHTML}]=await imports;
 for(const locale of ['zh','en','ja']){
  const html=discInstallHTML({session:dto('awaiting_driver'),paths:['<img src=x>'],installRoots:[],confirmed:true,pending:false},{locale});
  assert.ok(html.includes('UAC'));assert.ok(html.includes('WinCDEmu'));assert.ok(html.includes('data-disc-action="driver"'));assert.equal(html.includes('<img src=x>'),false);
  assert.ok(discWords[locale].standardDriverInfo);assert.equal(discError('PRIVATE_UNKNOWN',locale).includes('PRIVATE_UNKNOWN'),false);
 }
});
test('native drop binds only main and disposal suppresses callbacks and unlistens',async()=>{
 const [,,{bindDiscDrop}]=await imports,calls=[],images=[],listeners=new Map();let callback;
 const stop=await bindDiscDrop({invoke:async(a,b)=>{calls.push([a,b]);return 9;},internals:{transformCallback:fn=>{callback=fn;return 4;}},onImages:p=>images.push(p),
  root:{addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)},eventInternals:{unregisterListener:(event,id)=>calls.push(['unregister',{event,id}])}});
 assert.deepEqual(calls[0][1].target,{kind:'WebviewWindow',label:'main'});
 callback({payload:{paths:['H:\\fixture.iso','H:\\other.exe']}});assert.deepEqual(images,[['H:\\fixture.iso']]);
 await stop();callback({payload:{paths:['H:\\late.iso']}});assert.equal(images.length,1);assert.equal(listeners.size,0);assert.equal(calls.at(-1)[0],'plugin:event|unlisten');
});
