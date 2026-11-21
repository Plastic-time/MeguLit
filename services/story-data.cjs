// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),seed=require('../core/profiles/seed.cjs');
const privateValue=/(?:^|[\s"'=])[A-Za-z]:[\\/]|\\\\|\/(?:Users|home)\/|\\Users\\|@[a-z0-9-]+\.[a-z]{2,}/i;
const badKeys=new Set(['progress','unlocked','achieved','visited','saveValue','executable','personalPath','player','userId']);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v),name=s=>typeof s==='string'&&s.length>0&&s.length<=240;
function validateDocument(d){const errors=[];const bad=s=>errors.push(s);
 if(!plain(d)||d.schema!=='megulit.story'||d.version!==1)return {ok:false,errors:['schema']};
 let scanned=0;const walk=(v,depth=0)=>{if(++scanned>200000||depth>32){bad('nested data budget');return;}if(typeof v==='string'&&privateValue.test(v))bad('private value');else if(Array.isArray(v))v.forEach(x=>walk(x,depth+1));else if(plain(v))for(const [k,value] of Object.entries(v)){if(badKeys.has(k))bad('personal field '+k);walk(value,depth+1);}};walk(d);
 if(!name(d.gameKey)||!Array.isArray(d.sources)||d.sources.length>40)bad('identity or sources');
 if(!Array.isArray(d.gallery)||d.gallery.length>5000||!Array.isArray(d.endings)||d.endings.length>256||!Array.isArray(d.chapters)||d.chapters.length>500)bad('collections');
 if(errors.length)return {ok:false,errors};
 if([...d.sources,...d.gallery,...d.endings,...d.chapters].some(x=>!plain(x)))return {ok:false,errors:['collection object']};
 const keys=(object,allowed,where)=>{if(!plain(object)||Object.keys(object).some(k=>!allowed.includes(k)))bad('unknown '+where+' field');};
 keys(d,['schema','version','gameKey','builds','scripts','sources','galleryComplete','variantTotal','gallery','endingsComplete','endings','chapters'],'story');
 const rule=r=>{if(r===undefined)return;if(!plain(r)){bad('rule');return;}keys(r,['any','all'],'rule');const sets=[r.any,r.all].filter(Boolean);if(sets.length!==1||sets.some(a=>!Array.isArray(a)||!a.length||a.length>64||a.some(k=>!name(k)||/[\x00-\x1f]/.test(k))))bad('rule');};
 for(const key of ['galleryComplete','endingsComplete'])if(d[key]!==undefined&&typeof d[key]!=='boolean')bad(key);
 if(d.variantTotal!==undefined&&d.variantTotal!==null&&(!Number.isSafeInteger(d.variantTotal)||d.variantTotal<0||d.variantTotal>100000))bad('image total');
 if(!Array.isArray(d.builds)||!d.builds.length||d.builds.length>64||d.builds.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))bad('builds');
 if(!Array.isArray(d.scripts)||!d.scripts.length||d.scripts.length>32)bad('scripts');else for(const s of d.scripts){keys(s,['name','location','sha256'],'script');if(!name(s.name)||s.name==='..'||/[\\/]/.test(s.name)||s.location!==undefined&&!/^[a-z0-9-]{1,40}$/i.test(s.location)||typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256))bad('script identity');}
 for(const s of d.sources){keys(s,['kind','file','entry','notes','url','documents','adapter'],'source');if(s.url!==undefined&&!/^https:\/\//.test(s.url))bad('source URL');}
 const ids=new Set(),add=(v,kind)=>{if(!name(v)||ids.has(v))bad(kind+' id');ids.add(v);};
 const localized=v=>{keys(v,['zh','ja','en'],'localized text');if(plain(v)&&Object.values(v).some(s=>typeof s!=='string'||s.length>1000))bad('localized text');};
 for(const s of d.gallery){keys(s,['id','variants','variantTotal','unlockComplete'],'gallery');add(s.id,'gallery');if(s.unlockComplete!==undefined&&typeof s.unlockComplete!=='boolean')bad('gallery completion');if(!Array.isArray(s.variants)||s.variants.length>2048||s.variants.some(v=>!plain(v)||!name(v.name)||/[\\/]/.test(v.name)))bad('variants');else for(const v of s.variants)keys(v,['name'],'variant');}
 for(const e of d.endings){keys(e,['id','type','label','unlock','node','route','requires','image'],'ending');add(e.id,'ending');if(!['true','good','normal','bad','extra'].includes(e.type))bad('ending type');localized(e.label);rule(e.unlock);}
 const nodeIds=new Set();let nodeCount=0;
 for(const ch of d.chapters){keys(ch,['id','label','nodes','edges','partial'],'chapter');localized(ch.label);if(!name(ch.id)||!Array.isArray(ch.nodes)||ch.nodes.length>5000||!Array.isArray(ch.edges)||ch.edges.length>20000){bad('chapter');continue;}
  for(const n of ch.nodes){if(!plain(n)){bad('node');continue;}keys(n,['id','kind','label','read','source'],'node');localized(n.label);rule(n.read);if(n.source)keys(n.source,['storage','label'],'node source');if(!name(n.id)||nodeIds.has(n.id)||!['scene','choice','option','ending'].includes(n.kind))bad('node');nodeIds.add(n.id);nodeCount++;}
 }
 if(nodeCount>50000)bad('node limit');
 const edgeSet=new Set();for(const ch of d.chapters)for(const e of ch.edges||[]){if(!plain(e)){bad('edge');continue;}keys(e,['from','to','condition','dependency'],'edge');if(!nodeIds.has(e.from)||!nodeIds.has(e.to))bad('edge target');edgeSet.add(e.from+'|'+e.to);}
 for(const e of d.endings)if(e.node&&!nodeIds.has(e.node))bad('ending node');
 for(const e of d.endings)if(e.requires!==undefined&&(!Array.isArray(e.requires)||e.requires.length>256||e.requires.some(x=>!d.endings.some(y=>y.id===x))))bad('ending dependency');
 for(const e of d.endings)if(e.route!==undefined&&(!Array.isArray(e.route)||e.route.some(n=>!nodeIds.has(n))||e.route.slice(1).some((to,i)=>!edgeSet.has(e.route[i]+'|'+to))))bad('route path');
 return {ok:!errors.length,errors:[...new Set(errors)]};
}
function validate(d){try{return validateDocument(d);}catch{return {ok:false,errors:['malformed story']};}}
function validateSeed(d,game,versions=[]){const v=validate(d);if(!v.ok)return v;if(!plain(game)||!Array.isArray(game.builds||[])||!Array.isArray(versions))return {ok:false,errors:['story Seed identity']};const allowed=new Set([...(game.builds||[]),...versions]);if(d.gameKey!==game.key||d.builds.some(b=>!allowed.has(b)))return {ok:false,errors:['story Seed identity']};return v;}
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
const digests=new Map();
function digest(file){const canonical=fs.realpathSync(file),st=fs.statSync(canonical),key=canonical+'|'+st.dev+'|'+st.ino+'|'+st.size+'|'+st.mtimeMs+'|'+st.ctimeMs;const hit=digests.get(key);if(hit)return hit;const h=crypto.createHash('sha256'),fd=fs.openSync(canonical,'r'),buf=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,buf,0,buf.length,null)))h.update(buf.subarray(0,n));}finally{fs.closeSync(fd);}const after=fs.statSync(canonical);if(after.ino!==st.ino||after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ctimeMs!==st.ctimeMs)throw Error('STORY_SOURCE_CHANGED');const value=h.digest('hex');digests.set(key,value);if(digests.size>24)digests.delete(digests.keys().next().value);return value;}
/* Select an existing Seed identity, then reread just its story document on each request. Updates need no app restart. */
function find(game,{seedDir=seed.SEED_DIR}={}){
 let original={};try{original=JSON.parse(game.original||'{}');}catch{}
 const vndb=original.vndbManual||original.library?.vndbId,title=String(game.title||'').toLowerCase(),exe=path.basename(String(game.executable||'')).toLowerCase();
 const candidates=seed.seeds().games.filter(g=>vndb&&g.prints.vndb===vndb||(g.match.titles||[]).some(t=>t.toLowerCase()===title)||(g.match.exe||[]).some(n=>n.toLowerCase()===exe&& !/^(?:bgi|game|siglusengine|advhd)\.exe$/i.test(n)));
 if(candidates.length!==1)return {status:'unknown',data:null};
 const g=candidates[0],file=path.join(seedDir,g.engine,g.key,'story.json');
 try{const stat=fs.statSync(file);if(stat.size>8*1024*1024)return {status:'invalid',data:null};const raw=fs.readFileSync(file,'utf8'),d=JSON.parse(raw),base=path.dirname(file),gameFile=path.join(base,'game.json');if(fs.statSync(gameFile).size>16*1024)return {status:'invalid',data:null};const gameDoc=JSON.parse(fs.readFileSync(gameFile,'utf8'));let versions=[];try{versions=fs.readdirSync(path.join(base,'versions')).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>n.slice(0,-5));}catch{}const v=validateSeed(d,gameDoc,versions);if(!v.ok||d.gameKey!==g.gameId||!seed.check(gameDoc,{engine:g.engine,slug:g.key}).ok)return {status:'invalid',data:null};
  const proof=require('./story-analysis.cjs').identity(game.executable,d);if(proof.state!=='ready')return {status:proof.state,data:null};
  return {status:'ready',data:d,revision:hash(raw),engine:g.engine};}catch{return {status:'unknown',data:null};}
}
module.exports={validate,validateSeed,find,hash,digest};
