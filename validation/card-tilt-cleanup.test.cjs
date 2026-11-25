'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),test=require('node:test');
const {startEdge,startWeb}=require('./library-views-perf.cjs');

// Only the home page calls the tilt stop function. Detail, leaderboard and series pages repaint and drop their cards.
test('card tilt keeps one controller per card and drops page listeners once the card leaves',async t=>{
 const server=await startWeb({});t.after(()=>server.close());
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'megu-tilt-cleanup-'));let edge;
 t.after(async()=>{await edge?.stop();fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});});
 try{edge=await startEdge(profile);}catch(error){if(error.message==='EDGE_NOT_FOUND')return t.skip('Edge unavailable');throw error;}
 const {send,evaluate}=edge;
 const card=id=>`<div id="${id}" class="tv-card tv-cover" style="width:220px;height:300px"><div class="tv-face"></div></div>`;
 const html=`<html><body><script>
  window.__live=0;const live=new Set();
  for(const [name,target] of [['window',window],['document',document]]){
   const add=target.addEventListener,remove=target.removeEventListener;
   const key=(type,fn,options)=>[name,type,!!(options===true||options?.capture),fn];
   const find=k=>[...live].find(e=>e.every((v,i)=>v===k[i]));
   target.addEventListener=function(type,fn,options){const k=key(type,fn,options);if(!find(k)){live.add(k);__live++;}return add.call(this,type,fn,options);};
   target.removeEventListener=function(type,fn,options){const e=find(key(type,fn,options));if(e){live.delete(e);__live--;}return remove.call(this,type,fn,options);};
  }
 </script><div class="tv-home">${card('a')}${card('b')}</div><script type="module">
  import {cardify} from './home-tv.js';window.cardify=cardify;window.__ready=true;
 </script></body></html>`;
 const [serve]=server.listeners('request');server.off('request',serve).on('request',(req,res)=>{
  if(req.url!=='/tilt-cleanup-test')return serve(req,res);
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);
 });
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/tilt-cleanup-test'});
 const deadline=Date.now()+30000;
 while(!await evaluate('window.__ready===true')){assert.ok(Date.now()<deadline,'module loaded');await new Promise(r=>setTimeout(r,25));}
 // Warm up shared helpers (the frame gate listens lazily) so the baseline only leaves the tilt listeners out.
 const base=await evaluate(`(()=>{const w=document.createElement('div');w.className='tv-card';w.innerHTML='<div class="tv-face"></div>';
  document.querySelector('.tv-home').append(w);const stop=cardify(w);window.dispatchEvent(new Event('resize'));stop();w.remove();return __live;})()`);
 const once=await evaluate(`(()=>{const a=document.getElementById('a');window.__stopA=cardify(a);return __live;})()`);
 assert.ok(once>base,'cardify listens on window and document');
 const again=await evaluate(`(()=>{const a=document.getElementById('a');return {same:cardify(a)===__stopA,live:__live};})()`);
 assert.deepEqual(again,{same:true,live:once},'a repaint does not stack a second controller on the same card');
 const gone=await evaluate(`(()=>{const a=document.getElementById('a');a.remove();window.dispatchEvent(new Event('resize'));return {live:__live,mark:'__tiltStop' in a};})()`);
 assert.deepEqual(gone,{live:base,mark:false},'a card that left the page drops its window and document listeners');
 const stopped=await evaluate(`(()=>{const b=document.getElementById('b'),stop=cardify(b);stop();stop();const mark='__tiltStop' in b,fresh=cardify(b)!==stop;return {live:__live,mark,fresh};})()`);
 assert.deepEqual(stopped,{live:once,mark:false,fresh:true},'stop clears the card, and a later cardify starts a fresh controller');
});
