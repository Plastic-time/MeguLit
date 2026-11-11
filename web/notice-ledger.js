// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user): the start-up notice's update ledger reads itself — it scrolls slowly on its own, pauses while
   the pointer is over it, and comes back to the top after a rest at the end. A wheel scroll glides with momentum and
   stretches a little past either end before springing back, and a thin rail beside it can be dragged or clicked.
   Presentation only: nothing here reads or writes app data. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const SEL='.dev-notice-page[data-page="1"]>.dev-notice-updates:not([hidden])',SPEED=18;
const ease=(k,dt)=>1-Math.pow(1-k,dt*60);
function enhance(ul){
 if(ul.dataset.ledger)return;ul.dataset.ledger='1';
 const rail=document.createElement('div');rail.className='u-rail';rail.setAttribute('aria-hidden','true');rail.innerHTML='<i></i>';ul.after(rail);
 const thumb=rail.firstChild;
 let pos=ul.scrollTop,vel=0,glide=null,hover=false,drag=null,idle=performance.now()+1600,rest=0,back=false,last=-1,prev=performance.now();
 const max=()=>Math.max(0,ul.scrollHeight-ul.clientHeight);
 const geo=()=>{const h=ul.clientHeight,th=Math.max(28,h*h/Math.max(1,ul.scrollHeight));return {h,th,m:max()};};
 const wake=ms=>{idle=performance.now()+ms;back=false;rest=0;};
 function frame(now){
  if(!ul.isConnected){rail.remove();return;}
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-prev)/1000);prev=now;
  if(!ul.offsetParent)return;
  if(Math.abs(ul.scrollTop-last)>1&&!drag){pos=ul.scrollTop;vel=0;glide=null;wake(3000);}
  const {h,th,m}=geo();rail.hidden=m<=1;rail.style.height=`${ul.offsetHeight}px`;
  if(m<=1)return;
  if(drag){}
  else if(glide!==null){pos+=(glide-pos)*ease(.16,dt);if(Math.abs(glide-pos)<.5){pos=glide;glide=null;}}
  else if(Math.abs(vel)>.05){pos+=vel*dt*60;vel*=Math.pow(pos<0||pos>m?.55:.9,dt*60);}
  else if(!calm&&!hover&&now>idle){
   if(back){pos+=(0-pos)*ease(.05,dt);if(pos<.5){pos=0;back=false;idle=now+1800;}}
   else if(pos>=m-.5){if(!rest)rest=now+2400;else if(now>rest){back=true;rest=0;}}
   else pos=Math.min(m,pos+SPEED*dt);
  }
  /* past an end: the content stretches (rubber band) and springs back */
  if(!drag&&glide===null){const k=ease(.18,dt);if(pos<0)pos+=(0-pos)*k;else if(pos>m)pos+=(m-pos)*k;}
  const over=pos<0?pos:pos>m?pos-m:0,band=Math.sign(over)*Math.min(60,Math.abs(over)*.6);
  ul.style.setProperty('--over',`${(-band).toFixed(1)}px`);
  ul.scrollTop=Math.max(0,Math.min(m,pos));last=ul.scrollTop;
  thumb.style.height=`${th.toFixed(0)}px`;thumb.style.transform=`translateY(${(Math.max(0,Math.min(m,pos))/m*(ul.offsetHeight-th)).toFixed(1)}px)`;
 }
 ul.addEventListener('wheel',e=>{const m=max();if(m<=1)return;e.preventDefault();e.stopPropagation();
  const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?ul.clientHeight:1);glide=null;
  vel+=d*((pos<=0&&d<0)||(pos>=m&&d>0)?.035:.12);vel=Math.max(-60,Math.min(60,vel));wake(3500);},{passive:false});
 for(const el of [ul,rail]){el.addEventListener('pointerenter',()=>{hover=true;});el.addEventListener('pointerleave',()=>{hover=false;wake(1400);});}
 thumb.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();thumb.setPointerCapture(e.pointerId);drag={y:e.clientY,p:Math.max(0,Math.min(max(),pos))};vel=0;glide=null;rail.classList.add('is-drag');});
 thumb.addEventListener('pointermove',e=>{if(!drag)return;const {th,m}=geo(),span=Math.max(1,ul.offsetHeight-th);pos=Math.max(0,Math.min(m,drag.p+(e.clientY-drag.y)*m/span));wake(3500);});
 const end=()=>{if(drag){drag=null;rail.classList.remove('is-drag');wake(3500);}};
 thumb.addEventListener('pointerup',end);thumb.addEventListener('pointercancel',end);
 rail.addEventListener('pointerdown',e=>{if(e.target===thumb)return;const {th,m}=geo(),r=rail.getBoundingClientRect();glide=Math.max(0,Math.min(m,(e.clientY-r.top-th/2)/Math.max(1,ul.offsetHeight-th)*m));vel=0;wake(3500);});
 requestAnimationFrame(frame);
}
let tick=0;
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(()=>{tick=0;for(const ul of document.querySelectorAll(SEL))enhance(ul);});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
