// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: expanding and collapsing needs a transition) the reading sessions' "N 次" list opens and closes by
   animating its height, its rows fading in a step behind; reduced motion keeps the instant toggle. Presentation only. */
const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('click',e=>{
 const sum=e.target.closest?.('details.history-parts>summary');if(!sum||calm())return;
 const d=sum.parentElement;if(d.dataset.moving)return;e.preventDefault();d.dataset.moving='1';
 const from=d.offsetHeight,ease='cubic-bezier(.2,.8,.2,1)';
 if(!d.open){d.open=true;const to=d.offsetHeight;const a=d.animate([{height:from+'px'},{height:to+'px'}],{duration:320,easing:ease});
  d.querySelector('ol')?.animate([{opacity:0,transform:'translateY(-6px)'},{opacity:1,transform:'none'}],{duration:280,delay:60,easing:ease,fill:'backwards'});
  a.onfinish=a.oncancel=()=>{delete d.dataset.moving;};}
 else{const to=sum.offsetHeight;d.querySelector('ol')?.animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'});const a=d.animate([{height:from+'px'},{height:to+'px'}],{duration:260,easing:ease});
  a.onfinish=()=>{d.open=false;d.querySelector('ol')?.getAnimations().forEach(x=>x.cancel());delete d.dataset.moving;};a.oncancel=()=>{delete d.dataset.moving;};}
},true);
