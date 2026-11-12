// SPDX-License-Identifier: GPL-3.0-or-later
// Layout coordinates never include an in-flight animation or page scroll.
export function gridLayout(grid){
 const nodes=[...grid.children],tops=[...new Set(nodes.map(node=>node.offsetTop))].sort((a,b)=>a-b);
 const rows=new Map();for(const n of nodes){const t=n.offsetTop;if(!rows.has(t))rows.set(t,[]);rows.get(t).push(n);}for(const r of rows.values())r.sort((a,b)=>a.offsetLeft-b.offsetLeft);
 return new Map(nodes.map(node=>{const top=node.offsetTop,left=node.offsetLeft;
  const rowNodes=rows.get(top);
  return[node,{left,top,row:tops.indexOf(top),column:rowNodes.indexOf(node)}];
 }));
}
export function observeGridMotion(grid,{Observer=globalThis.ResizeObserver,reducedMotion=()=>globalThis.matchMedia('(prefers-reduced-motion:reduce)').matches}={}){
 if(!grid)return()=>{};
 let previous=gridLayout(grid);const motions=new Map();
 const cancel=()=>{for(const animation of motions.values())animation.cancel();motions.clear();};
 const observer=new Observer(()=>{
  if(!grid.isConnected){observer.disconnect();cancel();return;}
  const next=gridLayout(grid);
  // A resize that does not move a card to another cell must not interrupt its flight.
  // Layout snapshots contain no animated translation, so offsets cannot feed back.
  for(const[node,animation]of motions)if(!next.has(node)){animation.cancel();motions.delete(node);}
  if(reducedMotion())cancel();
  else for(const[node,position]of next){const old=previous.get(node);
   // Fluid sizing and a moving grid origin need no extra translation. Animate real reflow.
   if(old&&(old.row!==position.row||old.column!==position.column)){
    const running=motions.get(node),translation=running?(globalThis.getComputedStyle?.(node)?.translate||'none').split(/\s+/):[];
    const x=old.left-position.left+(Number.parseFloat(translation[0])||0),y=old.top-position.top+(Number.parseFloat(translation[1])||0);
    running?.cancel();
    const animation=node.animate([{translate:`${x}px ${y}px`},{translate:'0px 0px'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
    motions.set(node,animation);animation.onfinish=()=>{if(motions.get(node)===animation)motions.delete(node);};
   }
  }
  previous=next;
 });observer.observe(grid);
 return()=>{observer.disconnect();cancel();};
}
