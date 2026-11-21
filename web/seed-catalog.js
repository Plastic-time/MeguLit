// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed catalog: every game that has a seed, grouped by developer, with its cover (services/seed-catalog.cjs).
   Two modes. Normal shows only the covers VNDB rates safe; NSFW shows every cover and asks once before it first turns on.
   The mode stays on this PC (localStorage). Opened from The Seed dialog and the About section (web/the-seed.js). */
const W={
 zh:{title:'已种下的游戏',sub:(g,s,b)=>`${g} 部游戏 · ${s} 颗种子 · ${b} 个游戏社`,seeds:n=>`${n} 颗种子`,partly:(a,b)=>`${a}/${b} 已确认`,locked:'设置里开着「卡背过滤 R18 图片」，这里只显示普通模式',search:'搜索游戏名或游戏社',mode:'封面',normal:'普通',nsfw:'NSFW',
  ask:'NSFW 模式会显示成人向封面。确认你已满 18 岁？',yes:'确认并显示',no:'取消',count:n=>`${n} 部`,other:'其他',
  status:{verified:'已确认','owner-ok':'已确认',read:'只读模式',skeleton:'等传火'},hidden:'普通模式不显示这张封面',
  offline:'连不上 VNDB，部分游戏名和封面暂时显示不了',empty:'没有找到',close:'关闭',loading:'正在读取…',failed:'读取失败，稍后再试',link:'看看都有哪些游戏'},
 en:{title:'Seeded games',sub:(g,s,b)=>`${g} games · ${s} seeds · ${b} developers`,seeds:n=>`${n} seeds`,partly:(a,b)=>`${a}/${b} confirmed`,locked:'"Keep R18 pictures off the card back" is on in Settings, so only normal mode is shown',search:'Search a game or developer',mode:'Covers',normal:'Normal',nsfw:'NSFW',
  ask:'NSFW mode shows adult covers. Confirm that you are 18 or older?',yes:'Confirm and show',no:'Cancel',count:n=>`${n} ${n===1?'game':'games'}`,other:'Other',
  status:{verified:'Confirmed','owner-ok':'Confirmed',read:'Read mode',skeleton:'Waiting for a spark'},hidden:'Hidden in normal mode',
  offline:'VNDB cannot be reached, so some names and covers are missing for now',empty:'Nothing found',close:'Close',loading:'Loading…',failed:'Could not load the list, try again later',link:'See which games'},
 ja:{title:'種まき済みのゲーム',sub:(g,s,b)=>`${g} 本 · 種 ${s} 個 · ${b} ブランド`,seeds:n=>`種 ${n} 個`,partly:(a,b)=>`${a}/${b} 確認済み`,locked:'設定で「カード裏の R18 画像を除外」がオンのため、通常モードのみ表示します',search:'ゲーム名・ブランドで検索',mode:'表紙',normal:'通常',nsfw:'NSFW',
  ask:'NSFW モードでは成人向けの表紙を表示します。18 歳以上ですか？',yes:'確認して表示',no:'キャンセル',count:n=>`${n} 本`,other:'その他',
  status:{verified:'確認済み','owner-ok':'確認済み',read:'読み取りモード',skeleton:'伝火待ち'},hidden:'通常モードでは表示しません',
  offline:'VNDB に接続できないため、一部の名前と表紙を表示できません',empty:'見つかりません',close:'閉じる',loading:'読み込み中…',failed:'読み込めませんでした。後でもう一度お試しください',link:'収録ゲームを見る'}
};
export const catalogWords=locale=>W[locale]||W.zh;
const MODE_KEY='megulit.seedCatalogMode',ADULT_KEY='megulit.seedCatalogAdult';
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
export const savedMode=()=>read(MODE_KEY)==='nsfw'&&read(ADULT_KEY)==='1'?'nsfw':'normal';
/* a click on a mode button: {mode} to switch to, or {ask:true} when NSFW is asked for the first time */
export function modeStep(current,wanted,{adult=false,safeOnly=false}={}){
 if(wanted!=='nsfw')return {mode:'normal'};
 if(safeOnly)return {mode:current==='nsfw'?'normal':current};
 return adult?{mode:'nsfw'}:{ask:true,mode:current};
}

/* names: Japanese (or Chinese) users get the original script, English users the romanised title; a game VNDB does not know
   shows its seed slug */
const fromSlug=s=>String(s||'').split('-').filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
export const gameTitle=(g,locale)=>(locale==='en'?g.title||g.alttitle:g.alttitle||g.title)||fromSlug(g.slug);
export const developerName=(d,locale)=>(locale==='en'?d.name||d.original:d.original||d.name)||'';
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
/* one card per game: seeds of different builds that share a VNDB id (月姫 v1.4 and v1.6) become one card with seeds = 2.
   ok = how many of them are confirmed; the card says 「1/2 已确认」 when only some are, so a build that was never confirmed
   does not look confirmed. status is the best of them, for the colour. */
const RANK={verified:0,'owner-ok':1,read:2,skeleton:3};
const rank=s=>RANK[s]??4;
const confirmed=s=>s==='verified'||s==='owner-ok';
export function mergeGames(games){
 const out=[],byVn=new Map();
 for(const g of games){
  const same=g.vndb&&byVn.get(g.vndb);
  if(!same){const c={...g,seeds:1,ok:confirmed(g.status)?1:0,engines:[g.engine]};out.push(c);if(g.vndb)byVn.set(g.vndb,c);continue;}
  same.seeds++;same.ok+=confirmed(g.status)?1:0;if(!same.engines.includes(g.engine))same.engines.push(g.engine);if(rank(g.status)<rank(same.status))same.status=g.status;
 }
 return out;
}
export const statusText=(g,locale)=>{const t=catalogWords(locale);return g.seeds>1&&g.ok>0&&g.ok<g.seeds?t.partly(g.ok,g.seeds):t.status[g.status]||t.status.skeleton;};
/* groups by the first developer; the biggest first, games without a developer last */
export function groupGames(games,locale,query=''){
 const q=fold(query),m=new Map();
 for(const g of mergeGames(games)){
  const d=g.developers?.[0],name=d?developerName(d,locale):'';
  if(q&&![gameTitle(g,locale),g.title,g.alttitle,g.slug,...(g.developers||[]).flatMap(x=>[x.name,x.original])].some(s=>fold(s).includes(q)))continue;
  const key=d?.id||'';if(!m.has(key))m.set(key,{id:key,name,games:[]});m.get(key).games.push(g);
 }
 const cmp=(a,b)=>a.localeCompare(b,locale==='en'?'en':'ja');
 for(const x of m.values())x.games.sort((a,b)=>cmp(gameTitle(a,locale),gameTitle(b,locale)));
 return [...m.values()].sort((a,b)=>(!a.id)-(!b.id)||b.games.length-a.games.length||cmp(a.name,b.name));
}
/* what a card shows where the cover goes: an image to load, the placeholder because the mode hides it, or no cover at all */
export const coverState=(g,mode)=>g.cover==='safe'||(g.cover==='nsfw'&&mode==='nsfw')?'load':g.cover==='nsfw'?'hidden':'none';

const STATUS_CLASS={verified:'ok','owner-ok':'ok',read:'read',skeleton:'wait'};
function cardHTML(g,locale,mode,esc){
 const t=catalogWords(locale),title=gameTitle(g,locale),st=coverState(g,mode),dev=g.developers?.[0]?developerName(g.developers[0],locale):'';
 const ph=`<span class="sc-ph" aria-hidden="true">${esc(Array.from(dev||title)[0]||'?')}</span>${st==='hidden'?`<small class="sc-veil">${esc(t.hidden)}</small>`:''}`;
 return `<li class="sc-card"><div class="sc-cover" data-state="${st}"${st==='load'?` data-vndb="${esc(g.vndb)}"`:''}>${ph}</div>
  <div class="sc-meta"><b title="${esc(title)}">${esc(title)}</b><span class="sc-tags"><span class="sc-engine">${esc((g.engines||[g.engine]).join(' / '))}</span>${g.seeds>1?`<span class="sc-builds">${esc(t.seeds(g.seeds))}</span>`:''}<span class="sc-st sc-st-${g.seeds>1&&g.ok>0&&g.ok<g.seeds?'part':STATUS_CLASS[g.status]||'wait'}">${esc(statusText(g,locale))}</span></span></div></li>`;
}
export function catalogHTML(games,locale,mode,esc,query=''){
 const t=catalogWords(locale),groups=groupGames(games,locale,query);
 if(!groups.length)return `<p class="sc-empty">${esc(t.empty)}</p>`;
 return groups.map(gr=>`<section class="sc-group"><h3><span>${esc(gr.name||t.other)}</span><small>${esc(t.count(gr.games.length))}</small></h3>
  <ul class="sc-grid">${gr.games.map(g=>cardHTML(g,locale,mode,esc)).join('')}</ul></section>`).join('');
}

/* covers: four at a time. A cover that arrived is kept per mode for as long as the app runs; a miss or an error is asked
   again next time. live() is false once the list was drawn again (search, mode switch) or closed: that run stops before its
   next request, so leaving NSFW mode stops the downloads of covers normal mode does not show. */
const covers=new Map();
const isCover=u=>typeof u==='string'&&u.startsWith('data:image/');
export function loadCovers(root,api,mode,live=()=>root.isConnected,{cache=covers,show=showCover}={}){
 const todo=[...root.querySelectorAll('.sc-cover[data-state="load"][data-vndb]')];let at=0;
 const next=async()=>{while(at<todo.length&&live()){const el=todo[at++],vid=el.dataset.vndb,key=vid+'|'+mode;if(!el.isConnected)continue;
  let p=cache.get(key);if(!p){p=Promise.resolve().then(()=>api('seed_cover',{vndb:vid,nsfw:mode==='nsfw'})).catch(()=>null).then(u=>{if(!isCover(u))cache.delete(key);return u;});cache.set(key,p);}
  const url=await p;if(isCover(url)&&live()&&el.isConnected)show(el,url);}};
 return Promise.all([next(),next(),next(),next()]);
}
function showCover(el,url){const img=new Image();img.alt='';img.decoding='async';img.onload=()=>img.classList.add('is-in');img.src=url;el.prepend(img);el.dataset.loaded='1';}

export function openSeedCatalog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-catalog')?.close();
 const t=catalogWords(locale),dialog=document.createElement('dialog');let mode=savedMode(),games=[],query='';
 dialog.className='game-dialog seed-catalog';
 /* the app's dialog parts: game-dialog head, a bar like the lines picker, the list, the action row */
 dialog.innerHTML=`<div class="game-dialog-head"><h2>${esc(t.title)}</h2><p data-sub>${esc(t.loading)}</p></div>
  <div class="sc-bar"><label class="sc-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off" spellcheck="false"></label>
  <div class="sc-mode-wrap"><span aria-hidden="true">${esc(t.mode)}</span><div class="sc-mode" role="radiogroup" aria-label="${esc(t.mode)}"><button type="button" role="radio" data-mode="normal">${esc(t.normal)}</button><button type="button" role="radio" data-mode="nsfw">${esc(t.nsfw)}</button></div></div></div>
  <div class="sc-ask" data-ask hidden><span>${esc(t.ask)}</span><button type="button" class="secondary" data-yes>${esc(t.yes)}</button><button type="button" class="secondary" data-no>${esc(t.no)}</button></div>
  <p class="sc-offline" data-offline hidden>${esc(t.offline)}</p>
  <div class="sc-body" data-body></div>
  <div class="dialog-actions"><button type="button" class="text-button" data-close>${esc(t.close)}</button></div>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const $=s=>dialog.querySelector(s),body=$('[data-body]'),ask=$('[data-ask]');
 let safeOnly=false,run=0;
 const showMode=()=>{for(const b of dialog.querySelectorAll('[data-mode]')){const on=b.dataset.mode===mode;b.setAttribute('aria-checked',String(on));b.classList.toggle('on',on);
  if(b.dataset.mode==='nsfw'){b.disabled=safeOnly;b.title=safeOnly?t.locked:'';}}dialog.dataset.mode=mode;};
 const render=()=>{const mine=++run;body.innerHTML=catalogHTML(games,locale,mode,esc,query);loadCovers(body,api,mode,()=>mine===run&&dialog.isConnected);};
 const setMode=m=>{mode=m;write(MODE_KEY,m);ask.hidden=true;showMode();render();};
 dialog.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{const s=modeStep(mode,b.dataset.mode,{adult:read(ADULT_KEY)==='1',safeOnly});if(s.ask){ask.hidden=false;$('[data-yes]').focus();return;}if(s.mode!==mode)setMode(s.mode);});
 $('[data-yes]').onclick=()=>{if(safeOnly)return;write(ADULT_KEY,'1');setMode('nsfw');};
 $('[data-no]').onclick=()=>{ask.hidden=true;};
 $('[data-search]').addEventListener('input',e=>{query=e.target.value;render();});
 $('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 showMode();dialog.showModal();
 Promise.resolve().then(()=>api('seed_catalog',{})).then(r=>{
  if(!dialog.isConnected)return;games=Array.isArray(r?.games)?r.games:[];
  /* the app's R18 filter (卡背过滤 R18 图片) is on: normal mode only, the NSFW button off with a hint */
  if(r?.safeOnly===true){safeOnly=true;mode='normal';ask.hidden=true;showMode();}
  $('[data-sub]').textContent=t.sub(mergeGames(games).length,games.length,new Set(games.map(g=>g.developers?.[0]?.id).filter(Boolean)).size);
  $('[data-offline]').hidden=!r?.offline;render();
 }).catch(()=>{if(dialog.isConnected){$('[data-sub]').textContent=t.failed;toast&&toast(t.failed);}});
 return dialog;
}
/* the entry button for The Seed dialog and the About section */
export const catalogLinkHTML=(locale,esc,cls='seed-link')=>`<button type="button" class="${cls}" data-seed-catalog>${esc(catalogWords(locale).link)}<i aria-hidden="true">→</i></button>`;
export function bindSeedCatalog(root,{api,locale,esc,toast}){root.querySelectorAll('[data-seed-catalog]').forEach(b=>b.addEventListener('click',()=>openSeedCatalog({api,locale,esc,toast})));}
