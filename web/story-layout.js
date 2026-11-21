// Layered left-to-right placement; no external layout runtime or animation loop
export function layoutStory(nodes,edges){
 if(nodes.length>3000||edges.length>12000)throw Error('STORY_LAYOUT_LIMIT');
 const ids=new Set(),rank=new Map(),incoming=new Map(),out=new Map(),parents=new Map();
 for(const n of nodes){if(ids.has(n.id))throw Error('STORY_LAYOUT_DUPLICATE');ids.add(n.id);rank.set(n.id,0);incoming.set(n.id,0);out.set(n.id,[]);parents.set(n.id,[]);}
 const seen=new Set();
 for(const e of edges){const key=JSON.stringify([e.from,e.to]);if(e.dependency||e.from===e.to||!ids.has(e.from)||!ids.has(e.to)||seen.has(key))continue;seen.add(key);out.get(e.from).push(e.to);parents.get(e.to).push(e.from);incoming.set(e.to,incoming.get(e.to)+1);}
 const queue=nodes.filter(n=>incoming.get(n.id)===0).map(n=>n.id),done=new Set();
 for(let i=0;i<queue.length;i++){const id=queue[i];done.add(id);for(const child of out.get(id)){rank.set(child,Math.max(rank.get(child),rank.get(id)+1));incoming.set(child,incoming.get(child)-1);if(!incoming.get(child))queue.push(child);}}
 let tail=Math.max(0,...rank.values());for(const n of nodes)if(!done.has(n.id))rank.set(n.id,++tail);
 const columns=new Map(),order=new Map(nodes.map((n,i)=>[n.id,i]));
 for(const n of nodes){const column=rank.get(n.id);if(!columns.has(column))columns.set(column,[]);columns.get(column).push(n);}
 // Shared-parent branches stay together; ties retain script order
 const lanes=new Map();
 for(const [,items]of [...columns].sort((a,b)=>a[0]-b[0])){const center=n=>{const p=parents.get(n.id).filter(id=>lanes.has(id));return p.length?p.reduce((sum,id)=>sum+lanes.get(id),0)/p.length:order.get(n.id);};items.sort((a,b)=>center(a)-center(b)||order.get(a.id)-order.get(b.id));items.forEach((n,i)=>lanes.set(n.id,i));}
 const positions=new Map(),rowGap=54,padding=72;
 const size=n=>n.kind==='ending'?{w:264,h:172}:n.kind==='option'||n.kind==='choice'?{w:192,h:116}:{w:232,h:148};
 let height=440;for(const items of columns.values())height=Math.max(height,items.reduce((sum,n)=>sum+size(n).h+rowGap,0)-rowGap+padding*2);
 let x=padding;
 for(const [,items]of [...columns].sort((a,b)=>a[0]-b[0])){const width=Math.max(...items.map(n=>size(n).w));let y=(height-items.reduce((sum,n)=>sum+size(n).h+rowGap,0)+rowGap)/2;for(const n of items){const dimensions=size(n);positions.set(n.id,{x:x+(width-dimensions.w)/2,y,...dimensions});y+=dimensions.h+rowGap;}x+=width+88;}
 return {width:Math.max(740,x-88+padding),height,positions};
}
