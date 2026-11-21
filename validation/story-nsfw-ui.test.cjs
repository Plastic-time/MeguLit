// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

function fixture(){
 const images=[],listeners=new Map();let observer,answer={on:false,setting:false},timers=0;
 const classes=()=>{const set=new Set();return {toggle(name,on){if(on)set.add(name);else set.delete(name);},contains:name=>set.has(name),add:name=>set.add(name),remove:name=>set.delete(name)};};
 const document={documentElement:{classList:classes()},createElement(){return {firstChild:{},className:'',classList:{contains:name=>name==='nsfw-veil'},addEventListener(type,callback){this[type]=callback;},remove(){if(this.previousElementSibling?.nextElementSibling===this)this.previousElementSibling.nextElementSibling=null;}};},querySelectorAll(selector){if(selector==='img')return images;if(selector==='.nsfw-veil')return images.map(img=>img.nextElementSibling).filter(Boolean);return [];}};
 function image(src,story){const img={tagName:'IMG',nodeType:1,classList:classes(),parentElement:{classList:classes()},nextElementSibling:null,querySelectorAll:()=>[],getAttribute:name=>name==='src'?src:null,closest:selector=>story&&selector==='[data-story-nsfw]'?{}:null,after(button){img.nextElementSibling=button;button.previousElementSibling=img;}};images.push(img);return img;}
 const context={document,getComputedStyle:()=>({position:'relative'}),MutationObserver:class{constructor(callback){observer=callback;}observe(){}},addEventListener:(name,callback)=>listeners.set(name,callback),dispatchEvent(){},Event:class{},setTimeout:()=>++timers,clearTimeout(){},setInterval:()=>++timers};
 const source=fs.readFileSync(path.join(__dirname,'../web/nsfw.js'),'utf8').replace(/export /g,'');
 vm.runInNewContext(source+'\nglobalThis.start=initNsfw;',context,{filename:'web/nsfw.js'});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {image,flush,start:async()=>{context.start({api:async()=>answer,locale:'zh'});await flush();},set:async value=>{answer=value;listeners.get('megulit-nsfw-changed')();await flush();},insert:img=>observer([{type:'childList',addedNodes:[img]}]),get timers(){return timers;}};
}

test('story CGs use the NSFW switch while covers retain the recording filter',async()=>{
 const f=fixture(),story=f.image('data:image/png;base64,adult#r18',true),cover=f.image('data:image/png;base64,cover#r18',false),normal=f.image('data:image/png;base64,normal',true);
 await f.start();assert.equal(story.classList.contains('nsfw-masked'),true);assert.equal(cover.classList.contains('nsfw-masked'),true);assert.equal(normal.classList.contains('nsfw-masked'),false);
 await f.set({on:false,setting:true,locked:true});assert.equal(story.classList.contains('nsfw-masked'),false);assert.equal(story.nextElementSibling,null);assert.equal(cover.classList.contains('nsfw-masked'),true);
 await f.set({on:true,setting:true});assert.equal(cover.classList.contains('nsfw-masked'),false);
 await f.set({on:false,setting:false});assert.equal(story.classList.contains('nsfw-masked'),true);assert.equal(normal.classList.contains('nsfw-masked'),false);
});

test('temporary reveal affects only that image and late-loaded story CGs are veiled',async()=>{
 const f=fixture(),one=f.image('data:image/png;base64,one#r18',true),two=f.image('data:image/png;base64,two#r18',true);await f.start();
 let prevented=0;one.nextElementSibling.click({preventDefault(){prevented++;},stopPropagation(){prevented++;}});assert.equal(prevented,2);assert.equal(one.classList.contains('nsfw-masked'),false);assert.equal(two.classList.contains('nsfw-masked'),true);
 const late=f.image('data:image/png;base64,late#r18',true);f.insert(late);assert.equal(late.classList.contains('nsfw-masked'),true);assert.equal(f.timers,1,'only the existing global NSFW refresh timer is registered');
 await f.set({on:true,setting:true});await f.set({on:false,setting:false});assert.equal(one.classList.contains('nsfw-masked'),false);assert.equal(two.classList.contains('nsfw-masked'),true);
});
