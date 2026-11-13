// E263: wall <-> simple list switch. Wall gathers to the centre and fades, the list then unrolls top-down like
// dominoes (and the reverse), each cover with a small pan-crop. Uses individual translate/scale so the wall's own
// positioning transforms are left alone.
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const host=()=>document.querySelector('#library-results');
function visible(root){
 if(!root)return [];
 return [...root.querySelectorAll('.library-card')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}).slice(0,120);
}
const cover=el=>el.querySelector('.cover-frame img,.cover-frame .cover');
const settle=list=>Promise.all(list.map(a=>a.finished.catch(()=>{})));
const centre=root=>{const b=root.getBoundingClientRect();const top=Math.max(b.top,0),bottom=Math.min(b.bottom,innerHeight);return [b.left+b.width/2,(top+bottom)/2];};
// warm the compositor once: the first switches were janky while animation and filter pipelines spun up
globalThis.requestIdleCallback?.(()=>{const d=document.createElement('div');d.style.cssText='position:fixed;left:-9px;top:0;width:1px;height:1px;clip-path:inset(0);';document.body.append(d);d.animate([{translate:'0 0',scale:1,opacity:1,clipPath:'inset(0 0 0 0)'},{translate:'1px 1px',scale:.9,opacity:.5,clipPath:'inset(0 0 50% 0)'}],{duration:60}).finished.finally(()=>d.remove());});
let busy=false;const spots={};
// E275 (user: after fullscreen <-> windowed the capsule flew sideways first): remembered spots are window coordinates,
// so a resize makes them stale. Forget them; the next switch measures fresh and only the FLIP moves the capsule.
addEventListener('resize',()=>{delete spots.wall;delete spots.list;});
// the wall lays itself out around the search capsule; measure again once the capsule has stopped moving
const capsule=()=>document.querySelector('.field-search');
const remeasure=()=>dispatchEvent(new Event('megulit-field-measure'));
const vignette=(el,out)=>el?.animate(out?[{scale:'1 1',opacity:1},{scale:'1.7 1',opacity:0}]:[{scale:'1.7 1',opacity:0},{scale:'1 1',opacity:1}],{pseudoElement:'::after',duration:out?300:560,easing:out?'cubic-bezier(.55,0,.75,.2)':'cubic-bezier(.2,.8,.2,1)',fill:out?'forwards':'backwards'});
export const isBusy=()=>busy;
/* 2026-11-13 (user: the three views must switch like a top Apple motion designer made it): a shared-element morph.
   Every cover visible before and after flies from its old frame to its new one on a critically damped spring, as a
   ghost on its own pre-warmed compositor layer; the real layouts only cross-fade underneath. Reads happen in one batch
   before the render and one batch after it, writes go out together, and every animation is transform/opacity only
   (WAAPI, so the compositor runs it even while the main thread builds the new layout). */
const SPRING='linear(0,.009,.035 2.1%,.141 4.4%,.723 12.9%,.938 16.7%,1.017 19.4%,1.067,1.099 24.3%,1.108 26%,1.1,1.077 30.5%,1.024 35.4%,.996 39.8%,.987 42.6%,.987 46.2%,.997 54%,1.003 61.8%,1)';
const SOFT='linear(0,.012,.048 3%,.188 6.6%,.588 15%,.778 20.4%,.9 26.1%,.966 32.3%,.994 39.6%,1.005 49%,1.003 62%,1)';
const MORPH=620,GHOSTS=56;
const coverBox=el=>el.querySelector('.cover-frame')||el;
function snapshot(root){
 const out=new Map();if(!root)return out;const b=root.getBoundingClientRect(),cx=b.left+b.width/2,cy=Math.max(0,b.top)+Math.min(innerHeight,b.bottom)/2;
 for(const el of root.querySelectorAll('.library-card[data-member-id]')){if(el.closest('[data-parked]'))continue;const box=coverBox(el),r=box.getBoundingClientRect();
  if(!r.width||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;const d=Math.hypot(r.left+r.width/2-cx,r.top+r.height/2-cy),id=el.dataset.memberId,prev=out.get(id);
  if(!prev||d<prev.d)out.set(id,{el,r,d,src:box.querySelector('img')?.currentSrc||''});}
 return out;}
function ghostLayer(){const layer=document.createElement('div');layer.className='lib-morph';layer.setAttribute('aria-hidden','true');
 layer.style.cssText='position:fixed;inset:0;z-index:5;pointer-events:none;contain:strict';document.body.append(layer);return layer;}
function ghost(layer,from){const g=document.createElement('img');g.decoding='sync';g.src=from.src;const r=from.r;
 g.style.cssText=`position:absolute;left:0;top:0;width:${r.width}px;height:${r.height}px;object-fit:cover;border-radius:6px;will-change:transform,opacity;transform:translate(${r.left}px,${r.top}px);box-shadow:0 18px 40px -18px #000`;
 layer.append(g);return g;}
export async function switchLibrary(view,render,from=''){
 if(busy)return;busy=true;const toWall=view!=='list';
 try{
  if(reduce()){render();if(toWall)remeasure();return;}
  const root=host(),before=snapshot(root),cap=capsule(),capFrom=cap?.getBoundingClientRect();
  /* one ghost per shared cover, nearest the centre first; painted on this frame, before the heavy render */
  const picked=[...before.values()].filter(v=>v.src).sort((a,b)=>a.d-b.d).slice(0,GHOSTS);
  const layer=ghostLayer(),ghosts=new Map(picked.map(v=>[v.el.dataset.memberId,{from:v,g:ghost(layer,v)}]));
  await Promise.race([Promise.all([...ghosts.values()].map(x=>x.g.decode?.().catch(()=>{}))),new Promise(r=>setTimeout(r,90))]);
  /* old layout recedes as one compositor layer (no per-card work): a touch smaller and gone */
  const leave=root?.animate([{opacity:1,scale:1},{opacity:0,scale:.985}],{duration:300,easing:'cubic-bezier(.3,0,.8,.15)',fill:'forwards'});
  /* pick-up: shared covers lift a hair toward the viewer while the old layout recedes. Both run on the compositor, so the
     heavy render below (new DOM, style, layout) happens under motion that keeps playing at full rate */
  for(const {g} of ghosts.values())g.animate([{scale:1,opacity:1},{scale:1.035,opacity:1}],{duration:460,easing:SOFT,fill:'forwards'});
  await frame();
  if(cap)cap.style.transition='none';
  window.__megulitOrbitWarm=true; /* tracks: no fly-in of its own, the ghosts are the entrance */
  render();if(toWall)remeasure();
  const next=host();
  if(next){next.animate([{opacity:0},{opacity:0}],{duration:1,fill:'forwards',id:'lib-hold'});}
  await frame();
  /* after: one batch of reads */
  const after=snapshot(next),capTo=capsule()?.getBoundingClientRect();
  const now=capsule();
  if(now&&capFrom&&capTo){const dx=capFrom.left+capFrom.width/2-(capTo.left+capTo.width/2),dy=capFrom.top+capFrom.height/2-(capTo.top+capTo.height/2);
   if(Math.abs(dx)+Math.abs(dy)>1)now.animate([{translate:`${dx}px ${dy}px`},{translate:'0 0'}],{duration:MORPH,easing:SPRING}).finished.catch(()=>{}).finally(()=>{now.style.transition='';if(toWall)remeasure();});else now.style.transition='';}
  /* then all writes: ghosts spring to their new frames, staggered a hair by distance from the centre */
  const runs=[];let i=0;
  for(const [id,{from:f,g}] of ghosts){const t=after.get(id);
   if(!t){runs.push(g.animate([{opacity:1,transform:g.style.transform},{opacity:0,transform:`${g.style.transform} scale(.92)`}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished);continue;}
   const sx=t.r.width/f.r.width,sy=t.r.height/f.r.height,delay=Math.min(70,i++*1.6);
   g.getAnimations().forEach(a=>{if(a.effect?.getKeyframes?.()[1]?.scale)a.commitStyles?.();a.cancel();});g.style.scale='1';
   runs.push(g.animate([{transform:`translate(${f.r.left}px,${f.r.top}px) scale(1.035)`,transformOrigin:'0 0'},{transform:`translate(${t.r.left}px,${t.r.top}px) scale(${sx},${sy})`,transformOrigin:'0 0'}],{duration:MORPH,delay,easing:SPRING,fill:'forwards'}).finished);
   t.el.animate([{opacity:0},{opacity:0,offset:.8},{opacity:1}],{duration:MORPH+delay,easing:'linear',fill:'backwards'});}
  /* the new layout fades up underneath; covers without a ghost rise in softly (opacity + translate only, no scale on cells
     that already carry a positioning transform) */
  next?.getAnimations().forEach(a=>{if(a.id==='lib-hold')a.cancel();});
  next?.animate([{opacity:0},{opacity:1}],{duration:260,easing:SOFT});
  if(next){const b=next.getBoundingClientRect(),cy=b.top+b.height/2;let k=0;
   for(const [id,t] of after){if(ghosts.has(id))continue;const lift=(t.r.top+t.r.height/2-cy)*.06;
    (t.el.closest('mg-cell')||t.el).animate([{opacity:0,translate:`0 ${lift}px`},{opacity:1,translate:'0 0'}],{duration:520,delay:Math.min(160,40+k++*3),easing:SOFT,fill:'backwards'});}}
  leave?.cancel();
  await Promise.race([Promise.all(runs).catch(()=>{}),new Promise(r=>setTimeout(r,MORPH+200))]);
  /* hand over: ghosts dissolve onto the real covers */
  await layer.animate([{opacity:1},{opacity:0}],{duration:140,easing:'linear',fill:'forwards'}).finished.catch(()=>{});
  layer.remove();
  if(toWall)setTimeout(remeasure,760);
 }finally{busy=false;window.__megulitOrbitWarm=false;document.querySelectorAll('body > .lib-morph').forEach(n=>n.remove());host()?.classList.remove('lib-entering');}
}

/* v1.1.6 (user: switching back to the wall, and opening the library, must gather from the outside in, not spread out
   from the centre): cards start further out from the centre, a little larger and transparent, and settle inward; the
   outer ring arrives first. Also played when the library opens straight into the wall. */
export function wallIn(next,incoming=next?[...next.querySelectorAll('.library-card')].filter(el=>!el.closest('[data-parked]')).slice(0,400):[]){
 if(!next||!incoming.length||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const [cx,cy]=centre(next);let far=1;const d=incoming.map(el=>{const r=el.getBoundingClientRect(),dx=(r.left+r.width/2)-cx,dy=(r.top+r.height/2)-cy,h=Math.hypot(dx,dy);far=Math.max(far,h);return {el,dx,dy,h};});
 for(const {el,dx,dy,h} of d){const delay=Math.round((1-h/far)*240);
  /* 2026-11-13 (user: the wall still hitched when dragged right after opening): on the wall each cover's <mg-cell> is
     already a compositor layer, so the entrance plays on it (an individual translate composes with the wall's inline
     transform; a scale there would also scale that transform's offset, so the cell only glides and fades, and the
     cover inside keeps its own zoom). Animating the inner card promoted a layer per card for the entrance and
     repainted every cover when those layers dropped at the end. */
  const cell=el.closest('mg-cell');
  if(cell)cell.animate([{translate:`${dx*.32}px ${dy*.32}px`,opacity:0},{translate:'0 0',opacity:cell.style.opacity||'1'}],{duration:520,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  else el.animate([{translate:`${dx*.32}px ${dy*.32}px`,scale:1.12,opacity:0},{translate:'0 0',scale:1,opacity:1}],{duration:520,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
  cover(el)?.animate([{scale:1.16,translate:`${(dx/Math.max(1,h))*-4}% ${(dy/Math.max(1,h))*-4}%`},{scale:1,translate:'0 0'}],{duration:720,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});}
}
