/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Dragging without HTML5 drag-and-drop (2026-11-11, user: 拖不动 in the real WebView2). pointerdown captures the
   pointer, a ghost copy follows it, the drop target is found under the pointer on pointerup. A press that does not
   move is a normal click (tap to choose still works, and so does the keyboard); after a real drag the click that the
   browser fires is swallowed so it is not counted twice. */
export function pointerDrag(el,{over,onDrop,threshold=6}){
 if(!el||el.dataset.pdrag)return;el.dataset.pdrag='1';el.style.touchAction='none';
 el.addEventListener('click',ev=>{if(el._dragged){el._dragged=false;ev.stopImmediatePropagation();ev.preventDefault();}},true);
 el.addEventListener('pointerdown',e=>{
  if(e.button!==0||el.disabled)return;const sx=e.clientX,sy=e.clientY,id=e.pointerId;let ghost=null,hover=null;
  try{el.setPointerCapture(id);}catch{}
  const at=(x,y)=>{const hit=document.elementFromPoint(x,y);return hit&&hit.closest?hit.closest(over):null;};
  const move=ev=>{
   if(!ghost){if(Math.hypot(ev.clientX-sx,ev.clientY-sy)<threshold)return;const r=el.getBoundingClientRect();ghost=el.cloneNode(true);ghost.removeAttribute('id');ghost.classList.add('drag-ghost');
    Object.assign(ghost.style,{position:'fixed',left:'0',top:'0',width:r.width+'px',height:r.height+'px',margin:'0',pointerEvents:'none',zIndex:'80'});document.body.appendChild(ghost);el.classList.add('dragging');}
   ghost.style.transform=`translate(${ev.clientX-ghost.offsetWidth/2}px,${ev.clientY-ghost.offsetHeight/2}px) rotate(-3deg) scale(1.06)`;
   const t=at(ev.clientX,ev.clientY);if(t!==hover){hover?.classList.remove('over');hover=t;hover?.classList.add('over');}
  };
  const end=ev=>{
   el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);try{el.releasePointerCapture(id);}catch{}
   hover?.classList.remove('over');el.classList.remove('dragging');
   if(!ghost)return;ghost.remove();el._dragged=true;setTimeout(()=>{el._dragged=false;},0);
   if(ev.type==='pointerup'){const t=at(ev.clientX,ev.clientY);if(t)onDrop(t);}
  };
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 });
}
