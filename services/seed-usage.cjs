/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const feed=require('./auto-profile-feed.cjs'),relay=require('./relay-config.cjs'),Profiles=require('../core/profiles/index.cjs'),diff=require('../core/game-diff.cjs');
const ROUTE='/api/seed/usage',MAX_BYTES=128*1024,MAX_RECORDS=128,RETRY_MS=30000;
const queues=new Map(),scheduled=new WeakSet(),recent=new WeakMap();
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fileOf=root=>path.join(root,'data','The Seed','usage.json');
const HEX=/^[0-9a-f]{64}$/,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const fields=['schema','version','eventId','exeSha256','seedHash','layer','seedKey','revision','engine','at'];
function validEvent(e){return !!e&&Object.keys(e).length===fields.length&&fields.every(k=>Object.hasOwn(e,k))&&e.schema==='megulit.seed-usage'&&e.version===1&&UUID.test(e.eventId)&&HEX.test(e.exeSha256)&&HEX.test(e.seedHash)&&HEX.test(e.seedKey)&&['version','game'].includes(e.layer)&&Number.isSafeInteger(e.revision)&&e.revision>0&&/^[a-z0-9_-]{1,40}$/.test(e.engine)&&typeof e.at==='string'&&Number.isFinite(Date.parse(e.at))&&new Date(e.at).toISOString()===e.at;}
function permitted(root){return process.env.MEGULIT_CARDINAL_REPLAY!=='1'&&String(process.env.MEGULIT_RELAY_BASE||'').trim().toLowerCase()!=='off'&&feed.sharing(root)&&relay.endpoints(root,ROUTE).length>0;}
function read(root){const file=fileOf(root);try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES)throw Error('USAGE_STORE');const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.version!==1||!Array.isArray(value.entries)||value.entries.length>MAX_RECORDS||value.entries.some(x=>!HEX.test(x.key)||!validEvent(x.event)||!['pending','sent','stopped'].includes(x.stage)||!Number.isFinite(x.attemptAt)))throw Error('USAGE_STORE');return value;}catch(error){if(error.code==='ENOENT')return {version:1,entries:[]};throw error;}}
function write(root,value){const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>MAX_BYTES)throw Error('USAGE_STORE_LIMIT');const file=fileOf(root),tmp=file+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(tmp,bytes,{flag:'wx'});fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch{}}}
function current(reader,token){const state=reader.gal?.state;return reader.active?.()===true&&reader.root===token.root&&reader.gameExe===token.exe&&reader.gamePid===token.pid&&String(reader.gameBirth||'')===token.birth&&state?.bound===true&&Number(state.gameProcessId)===token.pid&&String(state.gameStarted||'')===token.birth&&reader.gal.profile===token.profile;}
function tokenFor(reader){const state=reader.gal?.state,pid=Number(reader.gamePid),birth=String(reader.gameBirth||'');if(!reader.root||!reader.gameExe||!Number.isSafeInteger(pid)||pid<1||!/^[1-9]\d{0,29}$/.test(birth)||!state||!reader.gal.profile)return null;return {root:reader.root,exe:reader.gameExe,pid,birth,profile:reader.gal.profile};}
function adopted(reader,token){if(!current(reader,token)||!permitted(token.root))return [];
 const live=require('./self-check-live.cjs'),s=live.current();if(!s||s.reader!==reader||s.exe!==token.exe||s.pid!==token.pid||s.birth!==token.birth||!HEX.test(s.key)||!['official','shared'].includes(s.from))return [];
 const input=live.inputOf(s),actual=reader.gal.profile,layers=String(actual.layers||'').split('+');if(layers.includes('stepdown')||layers.includes('owner-test')||diff.canonical(Profiles.profileFor(input))!==diff.canonical(actual))return [];
 const shared=feed.forExe(s.shared,s.key,token.exe);if(!shared?.exact||shared.match!=='exe')return [];
 return feed.documentsFor(shared,s.key,token.exe).filter(({document:d,slot,match})=>{
  const name=(d.source==='official'||shared.torchBound?'official':'shared')+(slot==='game'?'-game':'');if(!layers.includes(name)||d.layer!==slot||!Number.isSafeInteger(d.rev)||d.rev<1||d.engine!==actual.engine)return false;
  if(slot==='version')return match==='exe'&&d.key===s.key;
  return ['exe','script','pack','steam','vndb'].includes(match)&&(match==='exe'?(d.key===s.key||d.prints?.exe===s.key):s.prints?.[match]&&s.prints[match]===d.prints?.[match]);
 }).map(({document,slot})=>({document,slot,exe:s.key}));
}
async function flush(root,state,{fetcher=globalThis.fetch,now=Date.now(),save=write}={}){if(!permitted(root)||!fetcher)return;
 for(const entry of state.entries.filter(x=>x.stage==='pending'&&now-x.attemptAt>=RETRY_MS).slice(0,8)){
  if(!permitted(root))return;entry.attemptAt=now;save(root,state);
  for(const url of relay.endpoints(root,ROUTE)){if(!permitted(root))return;let response;try{response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body:JSON.stringify(entry.event),signal:AbortSignal.timeout(5000)});}catch{continue;}
   if(response.ok){let ack;try{ack=await response.json();}catch{continue;}if(ack?.ok===true&&ack.accepted===true&&ack.eventId===entry.event.eventId){entry.stage='sent';save(root,state);break;}}
   else if(response.status>=400&&response.status<500&&![408,425,429].includes(response.status)){entry.stage='stopped';save(root,state);break;}
  }
 }
}
async function observe(reader,token=tokenFor(reader),options={}){if(!token||!current(reader,token)||!permitted(token.root))return {state:'skipped'};const found=adopted(reader,token);if(!found.length)return {state:'skipped'};const root=token.root,prior=queues.get(root)||Promise.resolve();
 const work=prior.catch(()=>{}).then(async()=>{if(!current(reader,token)||!permitted(root))return {state:'skipped'};const state=read(root),now=options.now??Date.now();let changed=false;
  for(const {document,slot,exe} of adopted(reader,token)){const seedHash=hash(diff.canonical(document)),key=hash([exe,token.pid,token.birth,seedHash].join('|'));if(state.entries.some(x=>x.key===key))continue;
   while(state.entries.length>=MAX_RECORDS){const at=state.entries.findIndex(x=>x.stage!=='pending');if(at<0){await flush(root,state,options);return {state:'full'};}state.entries.splice(at,1);}
   const event={schema:'megulit.seed-usage',version:1,eventId:crypto.randomUUID(),exeSha256:exe,seedHash,layer:slot,seedKey:document.key,revision:document.rev,engine:reader.gal.profile.engine,at:new Date(now).toISOString()};if(!validEvent(event))return {state:'skipped'};state.entries.push({key,event,stage:'pending',attemptAt:0});changed=true;
  }
  if(changed)(options.save||write)(root,state);await flush(root,state,options);return {state:'recorded'};
 }).catch(()=>({state:'failed'}));queues.set(root,work);try{return await work;}finally{if(queues.get(root)===work)queues.delete(root);}}
function note(reader){const token=tokenFor(reader);if(!token)return;const last=recent.get(reader),now=Date.now();if(last&&last.pid===token.pid&&last.birth===token.birth&&last.profile===token.profile&&now-last.at<RETRY_MS)return;if(scheduled.has(reader))return;scheduled.add(reader);setImmediate(()=>{scheduled.delete(reader);recent.set(reader,{...token,at:now});void observe(reader,token).catch(()=>{});});}
module.exports={note,observe,adopted,read,fileOf,validEvent,ROUTE,MAX_BYTES,MAX_RECORDS};
