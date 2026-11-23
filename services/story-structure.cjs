// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto');
const id=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,20);
const clean=s=>String(s||'').replace(/\[[^\]]*\]/g,'').trim();
/* Structure adapters consume the original engine's decoded documents. They never execute expressions. */
function psbGraph(doc,proof={},gallery=[]){
 const storage=doc.name,nodes=[],edges=[];
 for(const [sceneIndex,scene] of (doc.scenes||[]).entries()){if(typeof scene.label!=='string')continue;const key=storage+scene.label,nid=id(key),chart=[...(scene.preevals||[]),...(scene.postevals||[])].find(x=>x[0]==='f.currentChartPos')?.[1];
  const title=Array.isArray(scene.title)?scene.title[0]:scene.title;
  const readKeys=['trail_'+storage.replace(/\.ks$/i,'')+'_'+scene.label.slice(1)];
  if(chart)readKeys.push('fos_'+chart,'eos_'+chart);
  const reader=require('./story-content.cjs'),content=reader.psbFirstLine(scene,sceneIndex),image=reader.psbImage(scene,sceneIndex,new Map(gallery.map(name=>[name.toLowerCase(),name]))),source={storage,label:scene.label,...proof,at:'scenes['+sceneIndex+']'};if(content)source.firstLineAt=content.firstLineAt;if(image)source.imageAt=image.imageAt;
  nodes.push({id:nid,kind:scene.selects?.length?'choice':'scene',label:{ja:clean(title)||clean(storage.replace(/ver[^]*$/,''))},...(content?{firstLine:content.firstLine}:{}),...(image?{image:image.image}:{}),read:{any:readKeys},source});
  const targets=new Set();
  for(const next of scene.nexts||[]){if(!next.target||!next.storage)continue;const to=id(next.storage+next.target);if(targets.has(to))continue;targets.add(to);edges.push({from:nid,to});}
  for(const [index,option] of (scene.selects||[]).entries()){
   const oid=id(key+':select:'+index),tag=typeof option.tag==='string'?option.tag:'';
   nodes.push({id:oid,kind:'option',label:{ja:clean(option.text),zh:clean(option.language?.[2]?.text),en:clean(option.language?.[1]?.text)},read:tag?{any:['select_'+tag]}:undefined,source:{storage,label:scene.label,...proof,at:'scenes['+sceneIndex+'].selects['+index+']'}});
   edges.push({from:nid,to:oid});if(option.storage&&option.target)edges.push({from:oid,to:id(option.storage+option.target)});
  }
 }
 return {id:id(storage),label:{ja:storage.replace(/ver[^]*$/,'').replace(/\.ks$/i,'')},nodes,edges};
}
function attributes(tag){const out={};for(const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))/g))out[m[1].toLowerCase()]=m[2]??m[3]??m[4];return out;}
function kagGraph(storage,text){
 const nodes=[],edges=[],labels=[...text.matchAll(/^\*([^|\r\n]+)(?:\|([^\r\n]*))?/gm)];
 for(let i=0;i<labels.length;i++){const label=labels[i][1].trim(),body=text.slice(labels[i].index+labels[i][0].length,labels[i+1]?.index??text.length),nid=id(storage+'*'+label),choices=[...body.matchAll(/\[link\b([^\]]*)\]([^]*?)\[endlink\]/gi)];
  nodes.push({id:nid,kind:choices.length?'choice':'scene',label:{ja:clean(labels[i][2])||label},read:{any:['trail_'+storage.replace(/\.ks$/i,'')+'_'+label]},source:{storage,label:'*'+label}});
  const links=[];for(const [index,m] of choices.entries()){const a=attributes(m[1]),oid=id(storage+'*'+label+':select:'+index);nodes.push({id:oid,kind:'option',label:{ja:clean(m[2])},source:{storage,label:'*'+label}});edges.push({from:nid,to:oid});if(a.target)links.push({from:oid,to:id((a.storage||storage)+a.target),condition:a.cond||''});}
  for(const m of body.matchAll(/(?:\[|^@)jump\b([^\]\r\n]*)/gim)){const a=attributes(m[1]);if(a.target)links.push({from:nid,to:id((a.storage||storage)+a.target),condition:a.cond||''});}
  edges.push(...links);
  /* Fall-through is only explicit when the block has no stop or jump; conditional/scripted jumps are left partial. */
  if(!links.length&&!/\[s\]|^@s\b|\[return\]|\[jump\b|^@jump\b/im.test(body)&&labels[i+1])edges.push({from:nid,to:id(storage+'*'+labels[i+1][1].trim())});
 }
 const counts=new Map();for(const n of nodes)counts.set(n.id,(counts.get(n.id)||0)+1);const ambiguous=new Set([...counts].filter(([,n])=>n>1).map(([id])=>id));
 return {id:id(storage),label:{ja:storage.replace(/\.ks$/i,'')},nodes:nodes.filter(n=>!ambiguous.has(n.id)),edges:edges.filter(e=>!ambiguous.has(e.from)&&!ambiguous.has(e.to)),partial:true};
}
module.exports={id,psbGraph,kagGraph,attributes};
