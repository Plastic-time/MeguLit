// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 优先测 skeleton 或 read 的游戏，以及服务器修复队列里要求补测的；verified 的不测；同一台电脑同一部游戏测过就
   不重复) which library game the idle-time cold test takes next. Pure: the caller hands in the library, how each game
   matches The Seed (core/profiles profileFor: seedStatus), the relay's retest list and this PC's record.

   order:  1 retest   the relay's repair queue asks for it (exe key or game identity), newer than this PC's last test
           2 skeleton a seed with identity + pinned values only
           3 read     a seed that only reads (we want it to hide)
           4 unknown  no seed yet (it gets one from this test)
   never:  verified / owner-ok seeds; a game this PC tested before (unless the retest is newer); a game marked blocked here
           (no save place, Steam relaunch, unguarded writes, restore trouble); a missing exe; a game running now */
const RANK={retest:1,skeleton:2,read:3,unknown:4};
const NEVER_STATUS=new Set(['verified','owner-ok']);
/* verdicts after which this PC does not test the game again by itself */
const FINAL=new Set(['pass','edge','fail','inconclusive']);

/* games: [{id, title, exe, engine, exeKey?, seedStatus?, gameKey?}]; retest: {keys:{<exeKey>:lastAt}, games:{<gameKey|gid>:lastAt}}
   state: {tested:{<exeKey|id>:{at, verdict}}, blocked:{<exeKey|id>:{why, at}}}; running(exe) -> bool; exists(exe) -> bool */
function candidates(games,{retest={keys:{},games:{}},state={},running=()=>false,exists=()=>true}={}){const out=[];
 const tested=state.tested||{},blocked=state.blocked||{};
 for(const g of games||[]){if(!g||!g.exe)continue;const id=g.exeKey||'id:'+g.id;
  if(blocked[id]||blocked['id:'+g.id])continue;
  if(!exists(g.exe)||running(g.exe))continue;
  const status=String(g.seedStatus||'');
  const asked=Math.max(Number(retest.keys?.[g.exeKey]||0),Number(retest.games?.[g.gameKey]||0),Number(retest.games?.[g.gid]||0));
  const last=tested[id]||tested['id:'+g.id]||null;
  let rank;
  if(asked&&(!last||asked>Number(last.at||0)))rank=RANK.retest;
  else if(NEVER_STATUS.has(status))continue;
  else if(last&&FINAL.has(last.verdict))continue;
  else rank=status==='skeleton'?RANK.skeleton:status==='read'?RANK.read:RANK.unknown;
  out.push({...g,rank,why:Object.keys(RANK).find(k=>RANK[k]===rank)});}
 /* inside one rank: games never tried first, then the ones tried longest ago (a stopped run is tried again later) */
 return out.sort((a,b)=>a.rank-b.rank||(Number((state.tested||{})[a.exeKey||'id:'+a.id]?.at||0)-Number((state.tested||{})[b.exeKey||'id:'+b.id]?.at||0))||String(a.title).localeCompare(String(b.title)));}

/* the relay's open repair queue as the client sees it (GET /api/game-profile/retest) -> {keys, games} of lastAt ms */
function retestOf(answer){const out={keys:{},games:{}};if(!answer||answer.schema!=='megulit.cold-retest')return out;const hex=/^[0-9a-f]{64}$/;
 for(const r of Array.isArray(answer.items)?answer.items.slice(0,500):[]){const at=Number(r.at)*1000||0;if(hex.test(String(r.key||'')))out.keys[r.key]=Math.max(out.keys[r.key]||0,at);if(hex.test(String(r.game||'')))out.games[r.game]=Math.max(out.games[r.game]||0,at);}
 return out;}

module.exports={RANK,candidates,retestOf,NEVER_STATUS};
