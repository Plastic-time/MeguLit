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
 let pos=ul.scrollTop,vel=0,glide=null,hover=false,drag=null,idle=performance.now()+1600,rest=0,back=false,last=ul.scrollTop,prev=performance.now(),moved=false;
 /* 2026-11-12 (user: scrolling the update list was slow and stuttered): the loop read scrollHeight / offsetParent and
    wrote --over, the rail height and scrollTop on every frame, so each frame forced a layout and restyled all ~300
    rows. Sizes are now measured at most twice a second (or after a resize), every write happens only when its value
    changed, and a scroll from outside is noticed by the scroll event instead of reading scrollTop each frame. */
 let size=null;
 const geo=()=>{const now=performance.now();if(!size||now-size.at>500){const h=ul.clientHeight,sh=ul.scrollHeight;size={h,oh:ul.offsetHeight,th:Math.max(28,h*h/Math.max(1,sh)),m:Math.max(0,sh-h),at:now};}return size;};
 const max=()=>geo().m;
 new ResizeObserver(()=>{size=null;}).observe(ul);
 ul.addEventListener('scroll',()=>{if(Math.abs(ul.scrollTop-last)>1)moved=true;},{passive:true});
 const put=(el,prop,value,key)=>{if(el[key]!==value){el[key]=value;el.style.setProperty(prop,value);}};
 const wake=ms=>{idle=performance.now()+ms;back=false;rest=0;};
 function frame(now){
  if(!ul.isConnected){rail.remove();return;}
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-prev)/1000);prev=now;
  const {h,oh,th,m}=geo();
  if(!h)return;
  if(moved){moved=false;if(!drag){pos=ul.scrollTop;vel=0;glide=null;wake(3000);}}
  if(rail.hidden!==(m<=1))rail.hidden=m<=1;put(rail,'height',`${oh}px`,'_h');
  if(m<=1)return;
  if(drag){}
  else if(glide!==null){pos+=(glide-pos)*ease(.24,dt);if(Math.abs(glide-pos)<.5){pos=glide;glide=null;}}
  else if(Math.abs(vel)>.05){pos+=vel*dt*60;vel*=Math.pow(pos<0||pos>m?.55:.9,dt*60);}
  else if(!calm&&!hover&&now>idle){
   if(back){pos+=(0-pos)*ease(.05,dt);if(pos<.5){pos=0;back=false;idle=now+1800;}}
   else if(pos>=m-.5){if(!rest)rest=now+2400;else if(now>rest){back=true;rest=0;}}
   else pos=Math.min(m,pos+SPEED*dt);
  }
  /* past an end: the content stretches (rubber band) and springs back */
  if(!drag&&glide===null){const k=ease(.18,dt);if(pos<0)pos+=(0-pos)*k;else if(pos>m)pos+=(m-pos)*k;}
  const over=pos<0?pos:pos>m?pos-m:0,band=Math.sign(over)*Math.min(60,Math.abs(over)*.6);
  put(ul,'--over',`${(-band).toFixed(1)}px`,'_over');
  const top=Math.max(0,Math.min(m,pos));
  if(Math.abs(top-last)>=.25){ul.scrollTop=top;last=top;}
  put(thumb,'height',`${th.toFixed(0)}px`,'_h');put(thumb,'transform',`translateY(${(top/m*(oh-th)).toFixed(1)}px)`,'_t');
 }
 ul.addEventListener('wheel',e=>{const m=max();if(m<=1)return;e.preventDefault();e.stopPropagation();
  const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?ul.clientHeight:1);
  /* 2026-11-12 (user: the list scrolled slowly): a notch moves the full wheel distance and the list catches up in about
     130 ms; quick notches add up. Past an end it gives up to 40 px, then springs back. */
  const base=glide!==null?glide:pos;vel=0;glide=Math.max(-40,Math.min(m+40,base+d));wake(3500);},{passive:false});
 for(const el of [ul,rail]){el.addEventListener('pointerenter',()=>{hover=true;});el.addEventListener('pointerleave',()=>{hover=false;wake(1400);});}
 thumb.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();thumb.setPointerCapture(e.pointerId);drag={y:e.clientY,p:Math.max(0,Math.min(max(),pos))};vel=0;glide=null;rail.classList.add('is-drag');});
 thumb.addEventListener('pointermove',e=>{if(!drag)return;const {oh,th,m}=geo(),span=Math.max(1,oh-th);pos=Math.max(0,Math.min(m,drag.p+(e.clientY-drag.y)*m/span));wake(3500);});
 const end=()=>{if(drag){drag=null;rail.classList.remove('is-drag');wake(3500);}};
 thumb.addEventListener('pointerup',end);thumb.addEventListener('pointercancel',end);
 rail.addEventListener('pointerdown',e=>{if(e.target===thumb)return;const {oh,th,m}=geo(),r=rail.getBoundingClientRect();glide=Math.max(0,Math.min(m,(e.clientY-r.top-th/2)/Math.max(1,oh-th)*m));vel=0;wake(3500);});
 requestAnimationFrame(frame);
}
let tick=0;
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(()=>{tick=0;for(const ul of document.querySelectorAll(SEL))enhance(ul);});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
