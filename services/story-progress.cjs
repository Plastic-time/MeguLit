// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),data=require('./story-data.cjs');
const positive=v=>v===true||typeof v==='number'&&v>0;
function knownFlag(key,p){const a=/^yuris:(\d+):(\d+)$/.exec(key);return !a||p.flags.get('yuris:'+a[1]+':count')>Number(a[2]);}
function state(rule,p){if(p.state!=='valid'||!rule)return 'unknown';if(rule.all){if(rule.all.some(k=>!knownFlag(k,p)))return 'unknown';return rule.all.every(k=>positive(p.flags.get(k)))?'done':'locked';}
 if(rule.any){if(rule.any.some(k=>positive(p.flags.get(k))))return 'done';return rule.any.every(k=>knownFlag(k,p))?'locked':'unknown';}return 'unknown';}
const label=(value,locale)=>String(value?.[locale]||value?.ja||value?.zh||value?.en||'');
function createService({cg=require('./game-cg.cjs'),rating=require('./cg-rating.cjs'),cards=require('./card-wall.cjs'),find=data.find,analyze=(root,exe)=>require('./story-analysis.cjs').ensure(root,exe)}={}){
 function snapshot(db,root,gameId){const game=db.prepare('SELECT id,title,executable,cover,original FROM games WHERE id=? AND removed_at IS NULL').get(String(gameId||''));if(!game)throw Error('GAME_NOT_FOUND');
  const document=find(game);let story=document.data,analysis='ready';
  if(['preparing','busy','resource-limited','unavailable'].includes(document.status))analysis='preparing';else if(!story){const automatic=analyze(root,game.executable);analysis=['busy','resource-limited','unavailable'].includes(automatic.state)?'preparing':automatic.state;if(automatic.rules){const r=automatic.rules;story={gallery:r.gallery,galleryComplete:!!r.galleryComplete,chapters:r.chapters,endings:[],endingsComplete:false,sources:r.evidence};}}
  if(analysis==='preparing'&&!story)return {game,story:null,p:{state:'preparing',flags:new Map()},scan:{items:new Map()},safe:true,allowed:new Set(),variants:new Map(),groups:[],endingStates:new Map(),revision:data.hash('preparing:'+game.id),analysis};
  let p={state:'unknown',flags:new Map()},scan={items:new Map()};try{p=cg.storyProgress(game.executable);scan=cg.scan(game.executable);}catch{}
  let safe=true;try{safe=JSON.parse(fs.readFileSync(path.join(root,'data/config/native-preferences.json'),'utf8')).safe_cg!==false;}catch{}
  const marked=scan.engine==='KiriKiri'?cg.kirikiriMarked(game.executable):p.galleryUnlocked||scan.unlocked||new Set(scan.items.keys()),ratingNames=[...scan.items.keys()].filter(n=>marked?.has(n));let ratingState='idle';
  if(safe&&ratingNames.length){try{const queued=cg.list?.(game.executable,{root,safe:true,cold:false,freshRating:true,ratingLimit:24,names:ratingNames});if(queued?.pending){const status=rating.status(root);ratingState=status.error&&!status.ready&&!status.preparing?'failed':'preparing';}}catch{ratingState='failed';}}
  let allowed=new Set();try{allowed=new Set(cards.sources(root,game,{safe,settle:false}).filter(s=>s.source==='save'&&s.kind==='cg'&&(!safe||!cg.ratingCurrent||cg.ratingCurrent(root,game.executable,s.name))).map(s=>s.name));}catch{}
  const galleryState=scan.engine==='YU-RIS'?p.galleryState||scan.progressState:p.state;
  const variants=new Map(),groups=(story?.gallery||[]).map(g=>{const items=g.variants.filter(v=>marked?.has(v.name.toLowerCase())).map(v=>{const id=data.hash('cg:'+v.name);variants.set(id,{...v,renderable:allowed.has(v.name.toLowerCase())});return {id,renderable:allowed.has(v.name.toLowerCase())};});return {id:g.id,state:galleryState==='valid'?items.length?'done':g.unlockComplete?'locked':'unknown':'unknown',items,total:g.variantTotal??null};});
  /* Supported engines without a Seed catalog still show their save-only scenes, without claiming a complete total. */
  if(!story){const groupMap=new Map();for(const [name,item] of scan.items){if(!marked?.has(name))continue;const gid=data.hash(item.group||name),id=data.hash('cg:'+name);variants.set(id,{name,renderable:allowed.has(name)});if(!groupMap.has(gid))groupMap.set(gid,{id:gid,state:'done',items:[],total:null});groupMap.get(gid).items.push({id,renderable:allowed.has(name)});}groups.push(...groupMap.values());}
  const endingStates=new Map((story?.endings||[]).map(e=>[e.id,state(e.unlock,p)]));
  for(const e of story?.endings||[])if(e.requires?.some(id=>endingStates.get(id)==='locked'))endingStates.set(e.id,'locked');
  const revision=data.hash((document.revision||'')+'|'+[...p.flags].sort().map(x=>x.join(':')).join('|')+'|'+safe);
  return {game,story,p,scan,safe,allowed,variants,groups,endingStates,revision,analysis,ratingState};
 }
 function list(db,root,r){const s=snapshot(db,root,r.gameId),locale=r.locale||'zh',offset=Number.isSafeInteger(r.offset)&&r.offset>=0?r.offset:0;
  const endings=(s.story?.endings||[]).map(e=>{const status=s.endingStates.get(e.id);return {id:e.id,state:status,label:status==='done'?label(e.label,locale):'',type:status==='done'?e.type:'unknown',image:status==='done'?imageId(s,e.image):null,requires:(e.requires||[]).length,requiresDone:(e.requires||[]).filter(id=>s.endingStates.get(id)==='done').length};});
  const known=endings.every(e=>e.state!=='unknown'),complete=!!s.story?.endingsComplete,remaining=complete&&known?endings.filter(e=>e.state!=='done').length:null;
  const galleryKnown=s.p.state==='valid'&&s.groups.length>0&&!s.groups.some(g=>g.state==='unknown'),unlockedKnown=s.groups.filter(g=>g.state==='done').length;
  return {status:s.analysis==='preparing'?'preparing':s.p.state==='valid'?'ready':'unknown',analysis:s.analysis,ratingState:s.ratingState||'idle',catalog:!!s.story,revision:s.revision,safe:s.safe,unlocked:galleryKnown?unlockedKnown:null,unlockedKnown,total:s.story?.galleryComplete?s.groups.length:null,picturesUnlocked:galleryKnown?s.variants.size:null,picturesTotal:s.story?.variantTotal??null,
   groups:s.groups.slice(offset,offset+24),next:offset+24<s.groups.length?offset+24:null,endings,remaining,endingTotal:complete?endings.length:null,endingDone:endings.filter(e=>e.state==='done').length,chapters:chapterList(s,locale)};
 }
 function imageId(s,name){if(!name)return null;const id=data.hash('cg:'+name);return s.variants.has(id)&&s.variants.get(id).renderable?id:null;}
 function chapterList(s,locale){return (s.story?.chapters||[]).map((c,i)=>({id:c.id,label:c.nodes.some(n=>state(n.read,s.p)==='done')?label(c.label,locale):'',position:i+1,partial:!!c.partial}));}
 function graph(db,root,r){const s=snapshot(db,root,r.gameId),locale=r.locale||'zh',chapter=s.story?.chapters.find(c=>c.id===r.chapter)||s.story?.chapters[0];if(!chapter)return {status:'unknown',nodes:[],edges:[],chapters:[]};
  const reveal=r.reveal===true,goal=s.story.endings.find(e=>e.id===r.goal&&e.route?.length)||s.story.endings.find(e=>e.type==='extra'&&e.route?.length)||s.story.endings.find(e=>e.type==='true'&&e.route?.length)||s.story.endings.find(e=>e.route?.length),route=new Set(reveal?goal?.route||[]:[]),allNodes=new Map(s.story.chapters.flatMap(c=>c.nodes.map(n=>[n.id,n])));
  const selectedNodes=[...chapter.nodes],external=new Set();for(const e of chapter.edges)for(const id of [e.from,e.to])if(!chapter.nodes.some(n=>n.id===id)&&allNodes.has(id)&&!external.has(id)){external.add(id);selectedNodes.push({...allNodes.get(id),external:s.story.chapters.find(c=>c.nodes.some(n=>n.id===id))?.id});}
  const nodes=selectedNodes.map(n=>{const ending=s.story.endings.find(e=>e.node===n.id),status=ending?s.endingStates.get(ending.id):state(n.read,s.p),show=status==='done'||reveal&&route.has(n.id),requires=ending?.requires||[];
   const nextChapter=s.story.chapters.find(c=>c.id!==chapter.id&&c.edges.some(e=>e.from===n.id&&c.nodes.some(next=>next.id===e.to)))?.id;
   return {id:n.id,kind:n.kind,state:status,label:show?label(n.label,locale):'',ja:show&&n.kind==='option'?label(n.label,'ja'):'',translation:show&&n.kind==='option'&&locale!=='ja'?n.label?.[locale]||'':'',type:ending&&show?ending.type:'unknown',image:ending&&status==='done'?imageId(s,ending.image):null,highlight:route.has(n.id),external:n.external||nextChapter||null,requires:requires.length,requiresDone:requires.filter(id=>s.endingStates.get(id)==='done').length};});
  const nodeStates=new Map(nodes.map(n=>[n.id,n.state]));
  const edges=chapter.edges.map(e=>({from:e.from,to:e.to,state:nodeStates.get(e.from)==='done'&&(nodeStates.get(e.to)||state(allNodes.get(e.to)?.read,s.p))==='done'?'done':'locked',highlight:route.has(e.from)&&route.has(e.to),dependency:!!e.dependency}));
  return {status:s.p.state==='valid'?'ready':'unknown',revision:s.revision,chapter:chapter.id,partial:!!chapter.partial,chapters:chapterList(s,locale),nodes,edges,routeAvailable:!!goal?.route?.length,goal:goal?.id||'',revealed:reveal,goals:s.story.endings.filter(e=>e.route?.length).map((e,i)=>({id:e.id,label:s.endingStates.get(e.id)==='done'?label(e.label,locale):'',position:i+1}))};
 }
 const fullQueue=new Map();
 async function image(db,root,r){const initial=snapshot(db,root,r.gameId);if(r.revision!==initial.revision)return {status:'changed'};const item=initial.variants.get(r.id);if(!item?.renderable)return {status:'unavailable'};
  if(!r.full){let t;try{t=cards.memoriesThumb(root,initial.game.executable,item.name);}catch{}if(t)return {status:'ready',...t};return {status:'pending',...cards.memoriesQueue(root,initial.game.executable,[item.name])};}
  const key=String(r.gameId),prior=fullQueue.get(key)||Promise.resolve();const job=prior.catch(()=>{}).then(()=>{const s=snapshot(db,root,r.gameId),current=s.variants.get(r.id);if(r.revision!==s.revision||!current?.renderable)return {status:'changed'};
   const file=cg.cachedPicture(root,s.game.executable,current.name);if(!file)return {status:'pending',...cards.memoriesQueue(root,s.game.executable,[current.name])};
   if(!require('./story-image.cjs').check(file))return {status:'unavailable'};
   try{const result=cards.image(db,root,r.gameId,'save:'+current.name);if(typeof result.src!=='string'||result.src.length>6*1024*1024)return {status:'unavailable'};return {status:'ready',src:result.src,w:result.w,h:result.h};}catch{return {status:'unavailable'};}});
  fullQueue.set(key,job);try{return await job;}finally{if(fullQueue.get(key)===job)fullQueue.delete(key);}
 }
 return {list,graph,image,async handle(db,root,r){if(r.action==='story_list')return list(db,root,r);if(r.action==='story_graph')return graph(db,root,r);if(r.action==='story_image')return image(db,root,r);throw Error('UNKNOWN_ACTION');}};
}
module.exports={...createService(),createService,state};
