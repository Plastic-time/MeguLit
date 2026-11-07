// SPDX-License-Identifier: GPL-3.0-or-later
// Reveal paint only: the full sentence remains available to translation, lookup and Anki.
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TomeTypewriter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const rate=v=>Math.max(5,Math.min(120,Number(v)||35));
 function createReveal({now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,update=()=>{},done=()=>{}}={}){
  let timer=null,serial=0,total=0,shown=0,base=0,started=0,speed=35,running=false;
  const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
  const paint=count=>{if(count!==shown){shown=count;update(shown,total);}};
  function tick(id){timer=null;if(!running||id!==serial)return;
   paint(Math.min(total,base+Math.floor(Math.max(0,now()-started)*speed/1000)));
   if(shown>=total){running=false;done();return;}
   timer=schedule(()=>tick(id),Math.min(50,1000/speed));
  }
  return {
   start(length,{speed:next=35,instant=false}={}){
    clear();serial++;total=Math.max(0,Math.floor(Number(length)||0));shown=base=0;speed=rate(next);started=now();running=total>0&&!instant;
    if(instant)shown=total;update(shown,total);
    if(running){const id=serial;timer=schedule(()=>tick(id),Math.min(50,1000/speed));}else done();
   },
   finish(){if(!running)return;clear();serial++;running=false;paint(total);done();},
   stop(){clear();serial++;running=false;},
   setSpeed(next){speed=rate(next);if(running){base=shown;started=now();clear();const id=serial;timer=schedule(()=>tick(id),Math.min(50,1000/speed));}},
   status:()=>({running,shown,total,speed})
  };
 }
 let enabled=true,speed=35,skipping=false,styleInstalled=false;
 const active=new Map();
 function ensureStyle(){
  if(styleInstalled||!root.document)return;const host=root.document.head||root.document.documentElement;if(!host)return;
  const style=root.document.createElement('style');style.textContent='.tome-typewriter-pending{opacity:0!important;pointer-events:none!important;transition:none!important}[data-tome-typing=true] .char-token,[data-tome-typing=true]>*{transition:opacity 70ms linear}@media (prefers-reduced-motion:reduce){[data-tome-typing=true] .char-token,[data-tome-typing=true]>*{transition:none}}[data-tome-typing=true]>.tome-inline-wait{visibility:hidden!important}';host.appendChild(style);styleInstalled=true;
 }
 function stop(element){const state=active.get(element);if(!state)return;state.controller.stop();active.delete(element);}
 function finishAll(native=false){const now=root.performance?.now?.()||0;for(const state of [...active.values()])if(!native||now-state.started>=120)state.controller.finish();}
 function stopAll(){for(const [element,state]of active){state.controller.stop();delete element.dataset.tomeTyping;}active.clear();}
 function reveal(element,nodes,{instant=false}={}){
  ensureStyle();stop(element);nodes=[...nodes];let painted=0;
  for(const node of nodes)node.classList.add('tome-typewriter-pending');
  const state={controller:null,started:root.performance?.now?.()||0};
  state.controller=createReveal({schedule:root.requestAnimationFrame?fn=>root.requestAnimationFrame(()=>fn()):undefined,cancel:root.cancelAnimationFrame?id=>root.cancelAnimationFrame(id):undefined,
   update(count,total){
    for(let i=painted;i<count;i++)nodes[i].classList.remove('tome-typewriter-pending');
    painted=count;element.dataset.tomeTyping=String(count<total);if(count===0||count===total)root.dispatchEvent?.(new root.CustomEvent('megulit-reveal-progress',{detail:{typing:count<total}}));element.dataset.tomeRevealed=String(count);
    root.__tomoyoHitRegionsRefresh?.();
   },
   done(){delete element.dataset.tomeTyping;if(active.get(element)===state)active.delete(element);}
  });
  active.set(element,state);state.controller.start(nodes.length,{speed,instant:instant||!enabled||skipping});
 }
 function text(element,value,{instant=false}={}){
  stop(element);const nodes=[...String(value)].map(character=>{const span=root.document.createElement('span');span.className=/^\p{Script=Latin}$/u.test(character)?'tome-translation-char megulit-latin':'tome-translation-char';span.textContent=character;return span;});
  element.replaceChildren(...nodes);reveal(element,nodes,{instant});
 }
 function configure(options={}){
  const next=options.enabled!==false,newSpeed=rate(options.speed);
  if(enabled&&!next)finishAll();enabled=next;
  if(newSpeed!==speed){speed=newSpeed;for(const state of active.values())state.controller.setSpeed(speed);}
 }
 function setSkipping(value){skipping=!!value;if(skipping)finishAll();}
 function bindBridge(bridge){
  if(bridge.typewriterInstalled)return;bridge.typewriterInstalled=true;
  bridge.completeTypewriter=finishAll;
  const previous=bridge.galStatus;bridge.galStatus=message=>{
   previous?.(message);
   if(message.type==='readerInput'){
    if(typeof message.skipHeld==='boolean')setSkipping(message.skipHeld);
    // Native polling may deliver the advance click just after the next sentence starts.
    if(message.complete)finishAll(true);
   }
   if(message.type==='gameClosed'||message.hookSource===null){stopAll();skipping=false;}
  };
  const doc=root.document;if(!doc)return;
  const controls='input,textarea,select,button,a,[contenteditable],.tomoyo-cn-dialog,.tome-backlog,.tomoyo-selection-card,.lookup-tooltip';

  doc.addEventListener('keydown',event=>{
   if(event.target?.closest?.(controls)||event.altKey||event.metaKey)return;
   if(event.key==='Control')setSkipping(true);
   if(event.code==='Space'||event.key==='Enter')finishAll();
  },true);
  doc.addEventListener('keyup',event=>{if(event.key==='Control')setSkipping(false);},true);
  root.addEventListener?.('blur',()=>setSkipping(false));
 }
 return {createReveal,reveal,text,stop,finishAll,configure,bindBridge,setSkipping,status:element=>active.get(element)?.controller.status()||null};
});
