// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),data=require('./story-data.cjs');
const positive=v=>v===true||typeof v==='number'&&v>0;
function knownFlag(key,p){const a=/^yuris:(\d+):(\d+)$/.exec(key);return !a||p.flags.get('yuris:'+a[1]+':count')>Number(a[2]);}
function state(rule,p){if(p.state!=='valid'||!rule)return 'unknown';if(rule.all){if(rule.all.some(k=>!knownFlag(k,p)))return 'unknown';return rule.all.every(k=>positive(p.flags.get(k)))?'done':'locked';}
 if(rule.any){if(rule.any.some(k=>positive(p.flags.get(k))))return 'done';return rule.any.every(k=>knownFlag(k,p))?'locked':'unknown';}return 'unknown';}
const label=(value,locale)=>String(value?.[locale]||value?.ja||value?.zh||value?.en||'');
function createService({allowExtraction=()=>true,cg=require('./game-cg.cjs'),cards=require('./card-wall.cjs'),find=data.find,analyze=(root,exe)=>require('./story-analysis.cjs').ensure(root,exe)}={}){
 function snapshot(db,root,gameId){const game=db.prepare('SELECT id,title,executable,cover,original FROM games WHERE id=? AND removed_at IS NULL').get(String(gameId||''));if(!game)throw Error('GAME_NOT_FOUND');
  const document=find(game);let story=document.data,analysis='ready';
  if(['preparing','busy','resource-limited','unavailable'].includes(document.status))analysis='preparing';else if(!story){const automatic=analyze(root,game.executable);analysis=['busy','resource-limited','unavailable'].includes(automatic.state)?'preparing':automatic.state;if(automatic.rules){const r=automatic.rules;story={gallery:r.gallery,galleryComplete:!!r.galleryComplete,chapters:r.chapters,endings:[],endingsComplete:false,sources:r.evidence};}}
  if(analysis==='preparing'&&!story)return {game,story:null,p:{state:'preparing',flags:new Map()},scan:{items:new Map()},allowed:new Set(),variants:new Map(),groups:[],endingStates:new Map(),revision:data.hash('preparing:'+game.id),analysis};
  let p={state:'unknown',flags:new Map()},scan={items:new Map()};try{p=cg.storyProgress(game.executable);scan=cg.scan(game.executable);}catch{}
  const marked=scan.engine==='KiriKiri'?cg.kirikiriMarked(game.executable):p.galleryUnlocked||scan.unlocked||new Set(scan.items.keys());
  let allowed=new Set();try{allowed=new Set(cards.sources(root,game,{safe:false,settle:false}).filter(s=>s.source==='save'&&s.kind==='cg').map(s=>s.name.toLowerCase()));}catch{}
  const ratings=new Map((story?.contentRatings||[]).map(v=>[v.name.toLowerCase(),v]));
  const variant=v=>{const key=v.name.toLowerCase();let sourceKey=null;try{sourceKey=cg.sourceKey(game.executable,v.name);}catch{}const classification=ratings.get(key);return {...v,sourceKey,renderable:p.state==='valid'&&allowed.has(key)&&/^[a-f0-9]{64}$/.test(sourceKey||''),adult:classification?.adult??true,basis:classification?.basis||'unknown',reasons:(classification?.reasons||[]).map(reason=>reason.kind==='game-rating'?'game-rating: '+reason.rating+(reason.vndb?' ('+reason.vndb+')':''):reason.kind+': '+reason.file+' / '+reason.entry+(reason.marker?' / '+reason.marker:''))};};
  const publicVariant=(id,v)=>({id,renderable:v.renderable,adult:v.adult,basis:v.basis,reasons:v.reasons});
  const galleryState=scan.engine==='YU-RIS'?p.galleryState||scan.progressState:p.state;
  const variants=new Map(),groups=(story?.gallery||[]).map(g=>{const items=g.variants.filter(v=>marked?.has(v.name.toLowerCase())).map(v=>{const id=data.hash('cg:'+v.name),current=variant(v);variants.set(id,current);return publicVariant(id,current);});return {id:g.id,state:galleryState==='valid'?items.length?'done':g.unlockComplete?'locked':'unknown':'unknown',routeId:null,character:null,variants:items,items,total:g.variantTotal??null};});
  // A save-only fallback has no verified complete catalog or route/character mapping
  if(!story){const groupMap=new Map();for(const [name,item] of scan.items){if(!marked?.has(name))continue;const gid=data.hash(item.group||name),id=data.hash('cg:'+name),current=variant({name});variants.set(id,current);if(!groupMap.has(gid))groupMap.set(gid,{id:gid,state:'done',routeId:null,character:null,variants:[],items:[],total:null});groupMap.get(gid).items.push(publicVariant(id,current));}for(const g of groupMap.values())g.variants=g.items;groups.push(...groupMap.values());}
  const endingStates=new Map((story?.endings||[]).map(e=>[e.id,state(e.unlock,p)]));
  for(const e of story?.endings||[])if(e.requires?.some(id=>endingStates.get(id)==='locked'))endingStates.set(e.id,'locked');
  const revision=data.hash(JSON.stringify([path.resolve(root),game.id,path.resolve(game.executable),document.revision||'',p.state,[...p.flags].sort(),[...variants].map(([id,v])=>[id,v.sourceKey,v.renderable,v.adult,v.basis])]));
  return {game,story,p,scan,allowed,variants,groups,endingStates,revision,analysis,progressKnown:p.state==='valid'&&galleryState==='valid'};
 }
 function list(db,root,r){const s=snapshot(db,root,r.gameId),locale=r.locale||'zh',offset=Number.isSafeInteger(r.offset)&&r.offset>=0?r.offset:0;
  const status=s.analysis==='preparing'?'preparing':s.progressKnown?'ready':'unknown';
  if(status!=='ready')return {status,analysis:s.analysis,catalog:!!s.story,revision:s.revision,groups:[],endings:[],chapters:[],next:null,unlocked:null,total:null,cgUnlocked:null,cgTotal:null,picturesUnlocked:null,picturesTotal:null,remaining:null,endingTotal:null,endingDone:null,choiceWalked:null,choiceTotal:null};
  const endings=(s.story?.endings||[]).map(e=>{const status=s.endingStates.get(e.id),chapter=s.story?.chapters.find(c=>c.nodes.some(n=>n.id===e.node));return {id:e.id,state:status,label:status==='done'?label(e.label,locale):'',type:status==='done'?e.type:'unknown',image:status==='done'?imageId(s,e.image):null,chapter:chapter?.id||null,node:chapter?e.node:null,requires:(e.requires||[]).length,requiresDone:(e.requires||[]).filter(id=>s.endingStates.get(id)==='done').length};});
  const known=endings.every(e=>e.state!=='unknown'),complete=!!s.story?.endingsComplete,remaining=complete&&known?endings.filter(e=>e.state!=='done').length:null;
  const galleryKnown=s.groups.length>0&&!s.groups.some(g=>g.state==='unknown'),unlockedKnown=s.groups.filter(g=>g.state==='done').length,total=s.story?.galleryComplete?s.groups.length:null;
  const orderedGroups=[...s.groups.filter(g=>g.state==='done'),...s.groups.filter(g=>g.state!=='done')];
  const options=(s.story?.chapters||[]).flatMap(c=>c.nodes.filter(n=>n.kind==='option')),choiceKnown=!!s.story?.chapters?.length&&!s.story.chapters.some(c=>c.partial)&&options.every(n=>state(n.read,s.p)!=='unknown');
  return {status,analysis:s.analysis,catalog:!!s.story,revision:s.revision,unlocked:galleryKnown?unlockedKnown:null,cgUnlocked:galleryKnown?unlockedKnown:null,unlockedKnown,total,cgTotal:total,picturesUnlocked:galleryKnown?s.variants.size:null,picturesTotal:s.story?.variantTotal??null,
   groups:orderedGroups.slice(offset,offset+24),next:offset+24<orderedGroups.length?offset+24:null,endings,remaining,endingTotal:complete?endings.length:null,endingDone:endings.filter(e=>e.state==='done').length,choiceWalked:choiceKnown?options.filter(n=>state(n.read,s.p)==='done').length:null,choiceTotal:choiceKnown?options.length:null,chapters:chapterList(s,locale)};
 }
 function imageId(s,name){if(!name)return null;const id=data.hash('cg:'+name);return s.variants.has(id)&&s.variants.get(id).renderable?id:null;}
 function chapterList(s,locale){return (s.story?.chapters||[]).map((c,i)=>({id:c.id,label:c.nodes.some(n=>state(n.read,s.p)==='done')?label(c.label,locale):'',position:i+1,partial:!!c.partial}));}
 function graph(db,root,r){const s=snapshot(db,root,r.gameId),locale=r.locale||'zh',chapter=s.story?.chapters.find(c=>c.id===r.chapter)||s.story?.chapters[0];if(!s.progressKnown||!chapter)return {status:s.analysis==='preparing'?'preparing':'unknown',revision:s.revision,nodes:[],edges:[],chapters:[]};
  const reveal=r.reveal===true,goal=s.story.endings.find(e=>e.id===r.goal&&e.route?.length)||s.story.endings.find(e=>e.type==='extra'&&e.route?.length)||s.story.endings.find(e=>e.type==='true'&&e.route?.length)||s.story.endings.find(e=>e.route?.length),route=new Set(reveal?goal?.route||[]:[]),allNodes=new Map(s.story.chapters.flatMap(c=>c.nodes.map(n=>[n.id,n])));
  const selectedNodes=[...chapter.nodes],external=new Set();for(const e of chapter.edges)for(const id of [e.from,e.to])if(!chapter.nodes.some(n=>n.id===id)&&allNodes.has(id)&&!external.has(id)){external.add(id);selectedNodes.push({...allNodes.get(id),external:s.story.chapters.find(c=>c.nodes.some(n=>n.id===id))?.id});}
  const nodes=selectedNodes.map(n=>{const ending=s.story.endings.find(e=>e.node===n.id),status=ending?s.endingStates.get(ending.id):state(n.read,s.p),show=status==='done'||reveal&&route.has(n.id),requires=ending?.requires||[];
   const nextChapter=s.story.chapters.find(c=>c.id!==chapter.id&&c.edges.some(e=>e.from===n.id&&c.nodes.some(next=>next.id===e.to)))?.id;
   return {id:n.id,kind:n.kind,state:status,label:show?label(n.label,locale):'',firstLine:show?label(n.firstLine,locale):'',ja:show&&n.kind==='option'?label(n.label,'ja'):'',translation:show&&n.kind==='option'&&locale!=='ja'?n.label?.[locale]||'':'',type:ending&&show?ending.type:'unknown',image:status==='done'?imageId(s,n.image||ending?.image):null,highlight:route.has(n.id),external:n.external||nextChapter||null,requires:requires.length,requiresDone:requires.filter(id=>s.endingStates.get(id)==='done').length};});
  const nodeStates=new Map(nodes.map(n=>[n.id,n.state]));
  const edges=chapter.edges.map(e=>({from:e.from,to:e.to,state:nodeStates.get(e.from)==='done'&&(nodeStates.get(e.to)||state(allNodes.get(e.to)?.read,s.p))==='done'?'done':'locked',highlight:route.has(e.from)&&route.has(e.to),dependency:!!e.dependency}));
  return {status:s.progressKnown?'ready':'unknown',revision:s.revision,chapter:chapter.id,partial:!!chapter.partial,chapters:chapterList(s,locale),nodes,edges,routeAvailable:!!goal?.route?.length,goal:goal?.id||'',revealed:reveal,goals:s.story.endings.filter(e=>e.route?.length).map((e,i)=>({id:e.id,label:s.endingStates.get(e.id)==='done'?label(e.label,locale):'',position:i+1}))};
 }
 function queue(root,s,names){let allowed=false;try{allowed=allowExtraction({root,gameId:s.game.id,executable:s.game.executable})===true;}catch{}if(!allowed)return {...cards.memoriesQueue(root,s.game.executable,names,{cacheOnly:true}),status:'resource-limited',cacheOnly:true};return cards.memoriesQueue(root,s.game.executable,names);}
 const fullQueue=new Map();
 const tag=(src,adult)=>String(src).replace(/(?:#r18)+$/g,'')+(adult?'#r18':'');
 const MAX_RESPONSE=4*Math.ceil(24*1024*1024/3)+128;
 async function image(db,root,r){const initial=snapshot(db,root,r.gameId);if(r.revision!==initial.revision)return {status:'changed'};const item=initial.variants.get(r.id);if(!initial.progressKnown||!item?.renderable)return {status:'unavailable'};
  const classified=current=>({adult:current.adult,basis:current.basis,reasons:current.reasons});
  const current=()=>{const s=snapshot(db,root,r.gameId),v=s.variants.get(r.id);return s.revision===r.revision&&s.progressKnown&&v?.renderable&&v.sourceKey===item.sourceKey?{s,v}:null;};
  if(!r.full){let t;try{t=cards.memoriesThumb(root,initial.game.executable,item.name);}catch{}if(!current())return {status:'changed'};if(t)return {status:'ready',...t,src:tag(t.src,item.adult),...classified(item)};return {status:'pending',...queue(root,initial,[item.name])};}
  const key=path.resolve(root)+'|'+String(r.gameId),prior=fullQueue.get(key)||Promise.resolve();const job=prior.catch(()=>{}).then(()=>{const checked=current();if(!checked)return {status:'changed'};const {s,v}=checked;if(require('node:os').freemem()<512*1024*1024)return {status:'resource-limited'};
   const file=cg.cachedPicture(root,s.game.executable,v.name);if(!file)return {status:'pending',...queue(root,s,[v.name])};
   try{if(!require('./story-image.cjs').check(file))return {status:'unavailable'};const result=cards.memoriesImage(db,root,r.gameId,v.name,{sourceKey:v.sourceKey});if(!current())return {status:'changed'};if(typeof result.src!=='string'||result.src.length>MAX_RESPONSE)return {status:'unavailable'};return {status:'ready',src:tag(result.src,v.adult),w:result.w,h:result.h,...classified(v)};}catch{return {status:'unavailable'};}});
  fullQueue.set(key,job);try{return await job;}finally{if(fullQueue.get(key)===job)fullQueue.delete(key);}
 }
 return {list,graph,image,async handle(db,root,r){if(r.action==='story_list')return list(db,root,r);if(r.action==='story_graph')return graph(db,root,r);if(r.action==='story_image')return image(db,root,r);throw Error('UNKNOWN_ACTION');}};
}
module.exports={...createService(),createService,state};
