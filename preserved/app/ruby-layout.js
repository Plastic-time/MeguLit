(function(root){'use strict';
 // Furigana placement, one text line at a time (user, 2026-11-03). Every reading stays centred over its own word
 // (shifting readings sideways read as misaligned) and may reach over a neighbouring kana by half a character or a
 // kanji by a quarter (allowLeft/allowRight from the caller), as in print: ふたた over 再び. When readings collide or
 // run out of room, every reading on the line shrinks by the same ratio until none overlaps, so a line has one ruby
 // size; the old greedy pass kept one full size and shrank, then dropped, the other (再び lost its reading next to 今).
 // Only at the minimum size is the reading with the lowest priority omitted.
 // Reaching over a neighbour is not a reason to shrink (user, 2026-11-03: the ruby size slider seemed capped, because
 // one long reading such as ちょうしょう over 嘲笑 shrank the whole line back): only readings that would overlap each
 // other, or leave the line, shrink. allowLeft/allowRight are kept for callers but no longer limit the size.
 function layout(items,{gap=1,minFont=8,step=.04}={}){
  const result=new Map(),lines=[];
  for(const item of items.slice().sort((a,b)=>a.top-b.top||a.left-b.left)){let line=lines.find(l=>Math.abs(l.top-item.top)<4);if(!line)lines.push(line={top:item.top,items:[]});line.items.push(item);}
  for(const line of lines){
   const list=line.items.sort((a,b)=>a.left-b.left),scale=new Map(list.map(it=>[it,1])),hidden=new Set();
   for(let guard=0;guard<400;guard++){
    const live=list.filter(it=>!hidden.has(it));if(!live.length)break;
    const w=live.map(it=>it.width*scale.get(it)),lo=live.map(it=>it.limitLeft),hi=live.map(it=>it.limitRight);
    // At the start or end of a line a wider reading moves inward instead of shrinking the line (蔑まれ at the line start
    // capped every reading on it, user 2026-11-03); elsewhere it stays centred over its word.
    const x=live.map((it,i)=>{const c=(it.left+it.right)/2-w[i]/2;return hi[i]-lo[i]>=w[i]?Math.min(Math.max(c,lo[i]),hi[i]-w[i]):c;});
    const bad=live.findIndex((it,i)=>x[i]<lo[i]-.5||x[i]+w[i]>hi[i]+.5||(i>0&&x[i]<x[i-1]+w[i-1]+gap-.5));
    if(bad<0){live.forEach((it,i)=>result.set(it,{...it,font:it.font*scale.get(it),shift:x[i]-((it.left+it.right)/2-w[i]/2),visible:true}));break;}
    // One size per line (user: 一样大最好): any crowding shrinks every reading on the line by the same ratio.
    const group=live,next=Math.min(...group.map(it=>scale.get(it)))-step;
    if(group.every(it=>it.font*next>=Math.min(minFont,it.font)))for(const it of group)scale.set(it,next);
    else hidden.add(group.slice().sort((p,q)=>(p.priority||0)-(q.priority||0)||q.width-p.width)[0]);
   }
   for(const it of list)if(!result.has(it))result.set(it,{...it,visible:false});
  }
  return items.map(it=>result.get(it)||{...it,visible:false});
 }
 const api={layout};if(typeof module==='object')module.exports=api;else root.TomoyoRubyLayout=api;
})(globalThis);
