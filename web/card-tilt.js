// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: the infinite wall should answer the mouse like Steam trading cards): a cover under the pointer
   tilts toward it with a moving sheen. Presentation only; CSS in unify.css reads --rx/--ry/--mx/--my. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
let frame=null,raf=0,last=null;
function reset(el){if(!el)return;el.classList.remove('is-tilting');for(const k of ['--rx','--ry','--mx','--my'])el.style.removeProperty(k);}
function paint(){raf=0;if(!frame||!last)return;const r=frame.getBoundingClientRect();if(!r.width)return;
 const x=Math.min(1,Math.max(0,(last.clientX-r.left)/r.width)),y=Math.min(1,Math.max(0,(last.clientY-r.top)/r.height));
 frame.style.setProperty('--ry',((x-.5)*16).toFixed(2)+'deg');frame.style.setProperty('--rx',((.5-y)*14).toFixed(2)+'deg');
 frame.style.setProperty('--mx',(x*100).toFixed(1)+'%');frame.style.setProperty('--my',(y*100).toFixed(1)+'%');frame.classList.add('is-tilting');}
if(!calm)document.addEventListener('pointermove',event=>{
 const el=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('.lib-field .cover-frame')||null;
 if(el!==frame){reset(frame);frame=el;}
 if(!frame)return;last=event;if(!raf)raf=requestAnimationFrame(paint);
},{passive:true,capture:true});
document.addEventListener('pointerleave',()=>{reset(frame);frame=null;},{passive:true});
