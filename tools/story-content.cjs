// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Developer-only enrichment of an anchored story document. It reads scripts, never save/progress files. */
const fs=require('node:fs'),path=require('node:path');
const data=require('../services/story-data.cjs'),content=require('../services/story-content.cjs'),discovery=require('../services/story-discovery.cjs');
const MAX_ENTRY=8*1024*1024;
const readYpf=content.readYpf;
function endingMarkers(entries,file,commands,nodes,endings){
 const y=require('../services/original-engines/yuris.cjs')._internal,bindings=new Map(),writes=[],seen=new Set();let bytes=0;
 for(const e of entries){const storage=path.basename(e.name.replace(/\\/g,'/'));if(!/^yst\d+\.ybn$/i.test(storage)||seen.has(storage.toLowerCase()))continue;seen.add(storage.toLowerCase());if((bytes+=e.unpacked)>64*1024*1024)throw Error('STORY_METADATA_BUDGET');const b=readYpf(file,e),xs=y.ystb(b);if(!xs)continue;
  for(const [at,x] of xs.entries()){if(commands[x.op]==='LOAD'&&discovery.literal(x.args[0])==='gsd.sd'){const section=discovery.integer(x.args[1]?.data),ref=x.args[2]?.data;if(section!==null&&ref?.length===6&&ref.subarray(0,4).toString('hex')==='76030040'){const variable=ref.readUInt16LE(4),prior=bindings.get(variable);if(prior&&prior.section!==section)throw Error('STORY_MARKER_BINDING');bindings.set(variable,{section,storage,at,sha256:content.digest(b)});}}
   if(commands[x.op]==='LET'){const assignment=discovery.arrayWrite(x);if(assignment)writes.push({storage,at,...assignment});}
  }
 }
 const found=[];for(const n of nodes){const record=endings.find(e=>e.node===n.id);if(n.kind!=='ending'||n.read?.all?.length!==1||record?.unlock?.all?.length!==1||record.unlock.all[0]!==n.read.all[0]||n.source?.file&&n.source.file!==path.basename(file))continue;const key=/^yuris:(\d+):(\d+)$/.exec(n.read.all[0]);if(!key)continue;const matches=writes.filter(w=>bindings.get(w.variable)?.section===Number(key[1])&&w.index===Number(key[2]));if(matches.length!==1)continue;const marker=matches[0];if(n.source?.storage&&n.source.storage!==marker.storage)continue;n.source={...n.source,storage:marker.storage,at:'instructions['+marker.at+']'};found.push({node:n.id,key:n.read.all[0],...marker,binding:bindings.get(marker.variable)});}
 return found;
}
function enrich(story,executable){
 const checked=data.validate(story);if(!checked.ok)throw Error('STORY_INVALID: '+checked.errors.join(','));const build=data.digest(executable);if(!story.builds.includes(build))throw Error('STORY_BUILD_IDENTITY');const dir=path.dirname(executable),doc=structuredClone(story),nodes=doc.chapters.flatMap(c=>c.nodes),names=new Map(doc.gallery.flatMap(g=>g.variants.map(v=>[v.name.toLowerCase(),v.name]))),receipt={buildSHA256:build,entries:[],nodes:[],unresolved:[]};
 const files=doc.scripts.map(s=>{const file=path.join(dir,s.location||'',s.name);if(data.digest(file)!==s.sha256)throw Error('STORY_SOURCE_IDENTITY');return {s,file};});
 let yurisCommands=[],yurisLabels=[];
 for(const {s,file} of files){
  if(/\.ypf$/i.test(s.name)){
   const y=require('../services/original-engines/yuris.cjs')._internal,entries=y.ypfList(file)||[],commandEntry=entries.find(e=>/(?:^|[\\/])ysc\.ybn$/i.test(e.name)),labelEntry=entries.find(e=>/(?:^|[\\/])ysl\.ybn$/i.test(e.name));if(commandEntry)yurisCommands=content.yurisCommands(readYpf(file,commandEntry));if(labelEntry)yurisLabels=discovery.yurisLabels(readYpf(file,labelEntry));const markers=endingMarkers(entries,file,yurisCommands,nodes,doc.endings);receipt.completions=[...(receipt.completions||[]),...markers];
   const seen=new Set();for(const e of entries){const name=path.basename(e.name.replace(/\\/g,'/')).toLowerCase();if(seen.has(name))continue;seen.add(name);const selected=nodes.filter(n=>n.source?.storage&&(!n.source.file||n.source.file===s.name)&&path.basename(n.source.storage.replace(/\\/g,'/')).toLowerCase()===name);if(!selected.length)continue;
    const b=readYpf(file,e),xs=y.ystb(b);if(!xs)throw Error('STORY_YSTB');const sha256=content.digest(b),number=Number(e.name.match(/yst(\d+)\.ybn$/i)?.[1]),local=yurisLabels.filter(l=>l.script===number).sort((a,b)=>a.index-b.index);receipt.entries.push({file:s.name,entry:e.name.replace(/\\/g,'/'),bytes:b.length,sha256});
    for(const n of selected){const explicit=/^instructions\[(\d+)\](?:\.args\[\d+\])?$/.exec(n.source.at||''),matches=local.filter(l=>l.label===n.source.label),start=explicit?Number(explicit[1]):matches.length===1?matches[0].index:null;if(start===null||start>=xs.length){receipt.unresolved.push(n.id);continue;}const end=local.find(l=>l.index>start)?.index??xs.length;n.source={...n.source,file:s.name,entry:e.name.replace(/\\/g,'/'),sha256,at:'instructions['+start+']'};
     if(n.kind==='option'){const fn=discovery.literal(xs[start].args[0]);if(yurisCommands[xs[start].op]!=='GOSUB'||fn.toUpperCase()!=='ES.SEL.SET'||!xs[start].args.slice(1).some(a=>discovery.literal(a)===n.label.ja))throw Error('STORY_OPTION_SOURCE: '+n.id);}
     else if(n.kind==='ending'&&markers.some(m=>m.node===n.id)){const ending=content.yurisEnding(xs,yurisCommands,start,local,names);if(!ending){receipt.unresolved.push(n.id);continue;}for(const k of ['firstLine','image'])delete n[k];for(const k of ['firstLineAt','imageAt','startAt','terminalAt','jumpAt'])delete n.source[k];const {firstLine,image,...proof}=ending;n.source={...n.source,...proof};if(firstLine)n.firstLine=firstLine;if(image)n.image=image;const record=doc.endings.find(e=>e.node===n.id);if(record){delete record.image;if(image)record.image=image;}}
     else if(n.kind==='scene'){delete n.firstLine;delete n.image;delete n.source.firstLineAt;delete n.source.imageAt;const first=content.yurisFirstLine(xs,yurisCommands,start,end);if(first){n.firstLine=first.firstLine;n.source.firstLineAt=first.firstLineAt;}const image=content.yurisImage(xs,start,end,names,yurisCommands);if(image){n.image=image.image;n.source.imageAt=image.imageAt;}}
     receipt.nodes.push({id:n.id,source:n.source,...(n.firstLine?{firstLine:n.firstLine}:{}),...(n.image?{image:n.image}:{})});
    }
   }
  }else if(/\.xp3$/i.test(s.name)){
   const xp=require('../services/original-engines/xp3.cjs'),entries=xp.list(file)?.files||[],cx=entries.some(e=>e.encrypted)?require('../services/original-engines/cx-filter.cjs').forArchive(file):null;
   for(const e of entries){if(!/\.scn$/i.test(e.name))continue;const selected=nodes.filter(n=>n.source?.storage===e.name.replace(/\.scn$/i,'')&&(!n.source.file||n.source.file===s.name));if(!selected.length)continue;if(![e.size,e.packed].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_ENTRY))throw Error('STORY_ENTRY_BUDGET');const raw=xp.read(file,e,cx),parsed=content.psbDocument(raw);if(!parsed?.root?.scenes){receipt.unresolved.push(...selected.map(n=>n.id));continue;}
    const sha256=content.digest(raw);receipt.entries.push({file:s.name,entry:e.name,bytes:raw.length,sha256});
    for(const n of selected){const matches=parsed.root.scenes.map((scene,index)=>({scene,index})).filter(x=>x.scene.label===n.source.label);if(matches.length!==1){receipt.unresolved.push(n.id);continue;}const {scene,index}=matches[0];n.source={...n.source,file:s.name,entry:e.name,sha256,at:'scenes['+index+']'};
     if(n.kind!=='option'){delete n.firstLine;delete n.image;delete n.source.firstLineAt;delete n.source.imageAt;const first=content.psbFirstLine(scene,index);if(first){n.firstLine=first.firstLine;n.source.firstLineAt=first.firstLineAt;}const image=content.psbImage(scene,index,names);if(image){n.image=image.image;n.source.imageAt=image.imageAt;}}
     else{const options=(scene.selects||[]).map((option,index)=>({option,index})).filter(x=>x.option.text===n.label.ja);if(options.length!==1)throw Error('STORY_OPTION_SOURCE: '+n.id);n.source.at+='.'+'selects['+options[0].index+']';}
     receipt.nodes.push({id:n.id,source:n.source,...(n.firstLine?{firstLine:n.firstLine}:{}),...(n.image?{image:n.image}:{})});
    }
   }
  }
 }
 for(const {s,file} of files)if(data.digest(file)!==s.sha256)throw Error('STORY_SOURCE_CHANGED');if(data.digest(executable)!==build)throw Error('STORY_BUILD_CHANGED');const validation=data.validate(doc);if(!validation.ok)throw Error('STORY_INVALID: '+validation.errors.join(','));return {story:doc,receipt};
}
if(require.main===module){const [storyFile,executable,out]=process.argv.slice(2);if(!storyFile||!executable||!out)throw Error('Usage: node tools/story-content.cjs <story.json> <game.exe> <out.json>');const result=enrich(JSON.parse(fs.readFileSync(storyFile,'utf8')),executable);fs.writeFileSync(out,JSON.stringify(result.story,null,1)+'\n');fs.writeFileSync(out+'.receipt.json',JSON.stringify(result.receipt,null,1)+'\n');console.log(JSON.stringify({entries:result.receipt.entries.length,nodes:result.receipt.nodes.length,firstLines:result.receipt.nodes.filter(n=>n.firstLine).length,images:result.receipt.nodes.filter(n=>n.image).length,unresolved:result.receipt.unresolved.length,progressIncluded:false}));}
module.exports={enrich,readYpf};
