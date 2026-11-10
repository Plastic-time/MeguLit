// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E377 opt-in reading leaderboard (client side; the relay is relay/src/worker.js).

   Nothing is sent until the user picks a nickname and agrees on the 排行榜 page. Then:
     - an anonymous install id (random UUID, made here, no account, no hardware ids) is kept in data/config/leaderboard.json;
     - only totals are sent: characters, reading seconds, words saved and the longest run of reading days for this week,
       this month and all time (reading_sessions / vocabulary in services/store.cjs);
     - per-game totals (title, characters, seconds) only when 公开我读过的游戏 is on.
   Settings 联网服务 · 参加排行榜 (data/config/online.json leaderboardEnabled) off → leave(): DELETE on the relay, then the
   local id and consent are forgotten. With no relay configured (services/relay-config.cjs) every call returns
   {state:'not-configured'} and the page shows only the local numbers.

   Wire format (relay/README.md):
     POST   /api/leaderboard {version:1,id,name,keys:{week:'2026-W46',month:'2026-11'},stats:{week,month,all},games?}
            stats.<period> = {characters,seconds,words,streak}     → {ok:true}
     GET    /api/leaderboard?period=week|month|all&metric=characters|seconds|words|streak&key=<period key>&me=<hash>
            → {entries:[{rank,name,value,me}],total,me:{rank,value}|null}
     GET    /api/leaderboard?metric=games[&game=<title>]           → {games:[{title,readers,top}]} / {entries:[...]}
     DELETE /api/leaderboard?id=<install id>                          → {ok:true}
   The relay stores only sha256(id); `me` is that hash so the page can mark the user's own row. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const relay=require('./relay-config.cjs');
const PERIODS=['week','month','all'],METRICS=['characters','seconds','words','streak'],TIMEOUT=8000,SUBMIT_EVERY=10*60*1000,MAX_GAMES=30;
const stateFile=root=>path.join(root,'data','config','leaderboard.json');
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,1));fs.renameSync(tmp,file);}

/* ---- nickname ------------------------------------------------------------------------------------------------- */
/* Same rules as relay/src/validate.js cleanName (kept in step by validation/leaderboard.test.cjs). */
const BLOCKED=['fuck','shit','bitch','cunt','nigger','nigga','faggot','rape','porn','penis','vagina','asshole','dick','whore','slut','hitler','nazi','傻逼','煞笔','傻b','sb','操你','草你','肏','日你','你妈','尼玛','妈逼','屌','鸡巴','婊子','贱人','强奸','做爱','色情','黄片','习近平','共产党','法轮','台独','死ね','殺す','ちんこ','まんこ','うんこ','セックス','レイプ','きちがい','キチガイ','admin','管理员','官方','megulit'];
/* control, bidi and zero-width characters */
const hidden=ch=>{const c=ch.codePointAt(0);return c<32||c>=0x7f&&c<=0x9f||c>=0x200b&&c<=0x200f||c>=0x2028&&c<=0x202e||c>=0x2060&&c<=0x206f||c===0xfeff;};
function cleanName(value){
 if(typeof value!=='string')return {ok:false,error:'NAME_REQUIRED'};
 const name=value.normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!name)return {ok:false,error:'NAME_REQUIRED'};
 const chars=[...name];if(chars.length<2||chars.length>16)return {ok:false,error:'NAME_LENGTH'};
 if(chars.some(hidden)||/[<>"'`\\]/.test(name)||/https?:|www\.|\.(?:com|net|org|cn|jp|io)\b|@/i.test(name))return {ok:false,error:'NAME_INVALID'};
 const lower=name.toLowerCase(),flat=lower.replace(/[\s._\-*·・]/g,''),tokens=lower.split(/[^a-z]+/).filter(Boolean);
 /* Latin words: a word that starts with one (so "grape" passes, "fuckyou" does not) or the whole name; others: anywhere. */
 if(BLOCKED.some(word=>/^[a-z]+$/.test(word)?flat===word||tokens.some(t=>t.startsWith(word)):flat.includes(word)))return {ok:false,error:'NAME_BLOCKED'};
 return {ok:true,name};
}

/* ---- local numbers -------------------------------------------------------------------------------------------- */
const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function isoWeek(now){const d=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),first=new Date(Date.UTC(year,0,1));return `${year}-W${String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0')}`;}
function periodKeys(now=new Date()){return {week:isoWeek(now),month:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,all:'all'};}
/* Local-time windows in unix seconds: week starts Monday 00:00, month on the 1st. */
function windows(now=new Date()){
 const week=new Date(now);week.setHours(0,0,0,0);week.setDate(week.getDate()-(week.getDay()+6)%7);
 const month=new Date(now.getFullYear(),now.getMonth(),1);const until=Math.floor(now.getTime()/1000)+1;
 return {week:{from:Math.floor(week.getTime()/1000),until},month:{from:Math.floor(month.getTime()/1000),until},all:{from:0,until}};
}
/* Longest run of consecutive local days that have any reading. */
function longestRun(days){let best=0,run=0,prev=null;for(const day of [...days].sort()){const d=new Date(day+'T00:00:00');run=prev&&Math.round((d-prev)/86400000)===1?run+1:1;best=Math.max(best,run);prev=d;}return best;}
/* Days in a row up to today (or up to yesterday when today has no reading yet). */
function currentRun(days,now=new Date()){const set=new Set(days),d=new Date(now);d.setHours(0,0,0,0);if(!set.has(dayKey(d)))d.setDate(d.getDate()-1);let run=0;while(set.has(dayKey(d))){run++;d.setDate(d.getDate()-1);}return run;}
const int=v=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.round(Number(v)||0)));
function collectStats(db,now=new Date()){
 const w=windows(now),out={keys:periodKeys(now),stats:{},games:[]};
 const sessions=db.prepare('SELECT game_id,started_at,active_seconds,characters FROM reading_sessions WHERE started_at<?').all(w.all.until);
 const words=db.prepare('SELECT created_at FROM vocabulary WHERE created_at<?').all(w.all.until).map(r=>Number(r.created_at)||0);
 const readDay=s=>dayKey(new Date(s.started_at*1000)),reading=s=>s.characters>0||s.active_seconds>0;
 for(const period of PERIODS){
  const {from,until}=w[period],inside=sessions.filter(s=>s.started_at>=from&&s.started_at<until);
  out.stats[period]={characters:int(inside.reduce((n,s)=>n+(s.characters||0),0)),seconds:int(inside.reduce((n,s)=>n+(s.active_seconds||0),0)),words:words.filter(t=>t>=from&&t<until).length,streak:longestRun(new Set(inside.filter(reading).map(readDay)))};
 }
 out.currentStreak=currentRun(sessions.filter(reading).map(readDay),now);
 const titles=new Map(db.prepare('SELECT id,title FROM games WHERE removed_at IS NULL AND hidden_at IS NULL').all().map(g=>[g.id,String(g.title||'').trim()]));
 const perGame=new Map();for(const s of sessions){const title=titles.get(s.game_id);if(!title)continue;const g=perGame.get(title)||{title,characters:0,seconds:0};g.characters+=s.characters||0;g.seconds+=s.active_seconds||0;perGame.set(title,g);}
 out.games=[...perGame.values()].filter(g=>g.characters>0).sort((a,b)=>b.characters-a.characters).slice(0,MAX_GAMES).map(g=>({title:g.title.slice(0,120),characters:int(g.characters),seconds:int(g.seconds)}));
 return out;
}

/* ---- opt-in state --------------------------------------------------------------------------------------------- */
function online(root){const v=relay.readJSON(relay.onlineFile(root));return {enabled:v.leaderboardEnabled===true,name:typeof v.leaderboardName==='string'?v.leaderboardName:'',shareGames:v.leaderboardShareGames===true};}
function saveOnline(root,patch){const file=relay.onlineFile(root);atomic(file,{...relay.readJSON(file),...patch});}
function state(root){const s=relay.readJSON(stateFile(root));return {installId:/^[0-9a-f-]{36}$/.test(String(s.installId||''))?s.installId:'',consentAt:typeof s.consentAt==='string'?s.consentAt:'',lastSubmitAt:Number(s.lastSubmitAt)||0};}
const publicHash=id=>id?crypto.createHash('sha256').update(String(id)).digest('hex'):'';
/* Taking part = switch on + consent given + a nickname that passes the filter. */
function config(root,env=process.env){const o=online(root),s=state(root),base=relay.relayBase(root,env);return {...o,...s,base,configured:!!base,joined:o.enabled&&!!s.consentAt&&!!s.installId&&cleanName(o.name).ok,me:publicHash(s.installId)};}
function join(root,{name,shareGames=false,consent}={}){
 if(consent!==true)throw Error('LEADERBOARD_CONSENT_REQUIRED');
 const checked=cleanName(name);if(!checked.ok)throw Error('LEADERBOARD_'+checked.error);
 const s=state(root);atomic(stateFile(root),{...relay.readJSON(stateFile(root)),installId:s.installId||crypto.randomUUID(),consentAt:new Date().toISOString(),lastSubmitAt:0});
 saveOnline(root,{leaderboardEnabled:true,leaderboardName:checked.name,leaderboardShareGames:shareGames===true});
 return config(root);
}

/* ---- network -------------------------------------------------------------------------------------------------- */
async function call(url,init,fetcher){
 let r;try{r=await fetcher(url,{...init,headers:{'user-agent':'MeguLit',...(init.body?{'content-type':'application/json'}:{})},signal:AbortSignal.timeout(TIMEOUT)});}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
 let data=null;try{data=await r.json();}catch{}
 if(!r.ok)return {state:'error',error:typeof data?.error==='string'&&/^[A-Z_]{2,40}$/.test(data.error)?data.error:'HTTP_'+r.status};
 return {state:'ok',data:data||{}};
}
/* submit(stats) — stats as collectStats() returns it. */
async function submit(stats,options={}){
 const root=options.root,c=config(root,options.env);
 if(!c.joined)return {state:'disabled'};if(!c.configured)return {state:'not-configured'};
 const body={version:1,id:c.installId,name:cleanName(c.name).name,keys:{week:stats?.keys?.week,month:stats?.keys?.month},stats:{}};
 for(const period of PERIODS){const p=stats?.stats?.[period]||{};body.stats[period]=Object.fromEntries(METRICS.map(m=>[m,int(p[m])]));}
 if(c.shareGames&&Array.isArray(stats?.games))body.games=stats.games.slice(0,MAX_GAMES).map(g=>({title:String(g.title||'').slice(0,120),characters:int(g.characters),seconds:int(g.seconds)})).filter(g=>g.title);
 const res=await call(c.base+'/api/leaderboard',{method:'POST',body:JSON.stringify(body)},options.fetch||fetch);
 if(res.state==='ok'&&root)atomic(stateFile(root),{...relay.readJSON(stateFile(root)),lastSubmitAt:(options.now||new Date()).getTime()});
 return res.state==='ok'?{state:'ok'}:res;
}
/* fetch(period, metric) — named fetchBoard inside so the global fetch stays reachable. */
async function fetchBoard(period,metric,options={}){
 const c=config(options.root,options.env);if(!c.configured)return {state:'not-configured'};
 const isGames=metric==='games';if(!isGames&&(!PERIODS.includes(period)||!METRICS.includes(metric)))throw Error('LEADERBOARD_INVALID_QUERY');
 const q=new URLSearchParams(isGames?{metric}:{period,metric});if(!isGames&&period!=='all')q.set('key',periodKeys(options.now)[period]);
 if(isGames&&options.game)q.set('game',String(options.game).slice(0,120));if(c.me)q.set('me',c.me);
 const res=await call(c.base+'/api/leaderboard?'+q,{method:'GET'},options.fetch||fetch);if(res.state!=='ok')return res;
 const clean=e=>({rank:int(e?.rank),name:String(e?.name||'').slice(0,32),value:int(e?.value),me:e?.me===true});
 if(isGames&&!options.game)return {state:'ok',games:(Array.isArray(res.data.games)?res.data.games:[]).slice(0,100).map(g=>({title:String(g?.title||'').slice(0,120),readers:int(g?.readers),top:g?.top?clean(g.top):null}))};
 return {state:'ok',entries:(Array.isArray(res.data.entries)?res.data.entries:[]).slice(0,100).map(clean),total:int(res.data.total),me:res.data.me?{rank:int(res.data.me.rank),value:int(res.data.me.value)}:null};
}
/* Turning the switch off: delete the server entry (when reachable), then forget id and consent either way. */
async function leave(root,options={}){
 const c=config(root,options.env);let remote='skipped';
 if(c.installId&&c.configured){const res=await call(c.base+'/api/leaderboard?id='+encodeURIComponent(c.installId),{method:'DELETE'},options.fetch||fetch);remote=res.state==='ok'?'deleted':res.error;}
 else if(!c.configured)remote='not-configured';
 const s=relay.readJSON(stateFile(root));delete s.installId;delete s.consentAt;delete s.lastSubmitAt;atomic(stateFile(root),s);
 saveOnline(root,{leaderboardEnabled:false});
 return {state:'left',remote};
}
/* Everything the 排行榜 page needs in one call; refreshes the user's own entry at most every 10 minutes. */
async function view(root,db,request={},options={}){
 const now=options.now||new Date(),period=PERIODS.includes(request.period)?request.period:'week',metric=[...METRICS,'games'].includes(request.metric)?request.metric:'characters';
 const local=collectStats(db,now),c=config(root,options.env);
 const result={configured:c.configured,joined:c.joined,enabled:c.enabled,name:c.name,shareGames:c.shareGames,period,metric,local,board:null};
 if(!c.configured)return {...result,board:{state:'not-configured'}};
 if(c.joined&&(request.submit===true||now.getTime()-c.lastSubmitAt>SUBMIT_EVERY))result.submit=await submit(local,{...options,root,now});
 result.board=await fetchBoard(period,metric,{...options,root,now,game:request.game});
 return result;
}
module.exports={PERIODS,METRICS,BLOCKED,cleanName,collectStats,periodKeys,windows,longestRun,currentRun,config,join,leave,submit,fetch:fetchBoard,view,publicHash,stateFile};
