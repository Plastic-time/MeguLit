/* Bounded DAG layout with a stable fallback for loops. Work is done only when the chapter changes. */
export function layoutStory(nodes,edges){
 const ids=new Set(nodes.map(n=>n.id)),incoming=new Map(nodes.map(n=>[n.id,0])),out=new Map(nodes.map(n=>[n.id,[]])),rank=new Map(nodes.map(n=>[n.id,0]));
 for(const e of edges)if(ids.has(e.from)&&ids.has(e.to)&&e.from!==e.to&&!e.dependency){incoming.set(e.to,incoming.get(e.to)+1);out.get(e.from).push(e.to);}
 const queue=nodes.filter(n=>!incoming.get(n.id)).map(n=>n.id),done=new Set();let index=0;
 while(index<queue.length){const id=queue[index++];if(done.has(id))continue;done.add(id);for(const to of out.get(id)){rank.set(to,Math.max(rank.get(to),rank.get(id)+1));incoming.set(to,incoming.get(to)-1);if(incoming.get(to)===0)queue.push(to);}}
 let tail=Math.max(0,...rank.values());for(const n of nodes)if(!done.has(n.id))rank.set(n.id,++tail);
 const rows=new Map();for(const n of nodes){const r=rank.get(n.id);if(!rows.has(r))rows.set(r,[]);rows.get(r).push(n);}
 const width=Math.max(740,...[...rows.values()].map(r=>r.length*260+80)),positions=new Map();
 for(const [row,list] of rows)list.forEach((n,i)=>positions.set(n.id,{x:(width-list.length*260)/2+i*260+12,y:48+row*152,w:236,h:104}));
 return {width,height:Math.max(420,(Math.max(0,...rank.values())+1)*152+80),positions};
}
