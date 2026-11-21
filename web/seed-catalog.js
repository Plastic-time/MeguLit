// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed catalog: every game that has a seed, grouped by developer, with its cover (services/seed-catalog.cjs).
   Covers follow the global NSFW setting (Settings, off by default; web/nsfw.js): off, a cover VNDB rates adult is a veil card
   (one line of text) and a click shows that one cover; on, every cover. Opened from The Seed dialog and the About section (web/the-seed.js). */
import {nsfwOn} from './nsfw.js';
const W={
 zh:{title:'已种下的游戏',sub:(g,s,b)=>`${g} 部游戏 · ${s} 颗种子 · ${b} 个游戏社`,seeds:n=>`${n} 颗种子`,partly:(a,b)=>`${a}/${b} 已确认`,locked:'设置里开着「卡背过滤 R18 图片」，成人封面不能显示',search:'搜索游戏名或游戏社',
  count:n=>`${n} 部`,other:'其他',
  status:{verified:'已确认','owner-ok':'已确认',read:'只读模式',skeleton:'等传火'},hidden:'成人内容 · 在设置里开启后显示',reveal:'点击只临时查看这一张',devNone:'暂时读不到这个游戏社的介绍',devSource:'简介来自 VNDB',devOpen:'在浏览器中打开',links:{vndb:'VNDB 游戏社页',site:'官网',moegirl:'萌娘百科',jawiki:'日文维基'},
  offline:'连不上 VNDB，部分游戏名和封面暂时显示不了',empty:'没有找到',close:'关闭',loading:'正在读取…',failed:'读取失败，稍后再试',link:'看看都有哪些游戏'},
 en:{title:'Seeded games',sub:(g,s,b)=>`${g} games · ${s} seeds · ${b} developers`,seeds:n=>`${n} seeds`,partly:(a,b)=>`${a}/${b} confirmed`,locked:'"Keep R18 pictures off the card back" is on in Settings, so only normal mode is shown',search:'Search a game or developer',
  count:n=>`${n} ${n===1?'game':'games'}`,other:'Other',
  status:{verified:'Confirmed','owner-ok':'Confirmed',read:'Read mode',skeleton:'Waiting for a spark'},hidden:'Adult content · shown when enabled in Settings',reveal:'Click to see only this one for now',devNone:'No introduction could be loaded for this developer for now',devSource:'Introduction from VNDB',devOpen:'Open in the browser',links:{vndb:'VNDB developer page',site:'Official site',moegirl:'Moegirlpedia',jawiki:'Japanese Wikipedia'},
  offline:'VNDB cannot be reached, so some names and covers are missing for now',empty:'Nothing found',close:'Close',loading:'Loading…',failed:'Could not load the list, try again later',link:'See which games'},
 ja:{title:'種まき済みのゲーム',sub:(g,s,b)=>`${g} 本 · 種 ${s} 個 · ${b} ブランド`,seeds:n=>`種 ${n} 個`,partly:(a,b)=>`${a}/${b} 確認済み`,locked:'設定で「カード裏の R18 画像を除外」がオンのため、通常モードのみ表示します',search:'ゲーム名・ブランドで検索',
  count:n=>`${n} 本`,other:'その他',
  status:{verified:'確認済み','owner-ok':'確認済み',read:'読み取りモード',skeleton:'伝火待ち'},hidden:'成人向け · 設定でオンにすると表示',reveal:'クリックでこの 1 枚だけ一時的に表示',devNone:'このブランドの紹介は今は読み込めません',devSource:'紹介文の出典：VNDB',devOpen:'ブラウザで開く',links:{vndb:'VNDB のブランドページ',site:'公式サイト',moegirl:'萌娘百科（中国語）',jawiki:'日本語版ウィキペディア'},
  offline:'VNDB に接続できないため、一部の名前と表紙を表示できません',empty:'見つかりません',close:'閉じる',loading:'読み込み中…',failed:'読み込めませんでした。後でもう一度お試しください',link:'収録ゲームを見る'}
};
export const catalogWords=locale=>W[locale]||W.zh;
/* the covers' mode is the global NSFW setting */
export const savedMode=()=>nsfwOn()?'nsfw':'normal';

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
 const ph=`<span class="sc-ph" aria-hidden="true">${esc(Array.from(dev||title)[0]||'?')}</span>${st==='hidden'?`<button type="button" class="sc-veil" data-reveal="${esc(g.vndb)}" title="${esc(t.reveal)}">${esc(t.hidden)}</button>`:''}`;
 return `<li class="sc-card"><div class="sc-cover" data-state="${st}"${st==='load'?` data-vndb="${esc(g.vndb)}"`:''}>${ph}</div>
  <div class="sc-meta"><b title="${esc(title)}">${esc(title)}</b><span class="sc-tags"><span class="sc-engine">${esc((g.engines||[g.engine]).join(' / '))}</span>${g.seeds>1?`<span class="sc-builds">${esc(t.seeds(g.seeds))}</span>`:''}<span class="sc-st sc-st-${g.seeds>1&&g.ok>0&&g.ok<g.seeds?'part':STATUS_CLASS[g.status]||'wait'}">${esc(statusText(g,locale))}</span></span></div></li>`;
}
export function catalogHTML(games,locale,mode,esc,query=''){
 const t=catalogWords(locale),groups=groupGames(games,locale,query);
 if(!groups.length)return `<p class="sc-empty">${esc(t.empty)}</p>`;
 return groups.map(gr=>`<section class="sc-group"><h3><span class="sc-logo" aria-hidden="true"${gr.id?` data-pid="${esc(gr.id)}"`:''}>${esc(Array.from(gr.name||t.other)[0]||'?')}</span>${gr.id?`<button type="button" class="sc-dev" data-dev="${esc(gr.id)}" aria-expanded="false">${esc(gr.name||t.other)}</button>`:`<span>${esc(gr.name||t.other)}</span>`}<small>${esc(t.count(gr.games.length))}</small></h3>${gr.id?'<div class="sc-panel" data-panel hidden></div>':''}
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

/* the panel under a developer's name; the intro is text (escaped), the links are buttons the service opens in the browser */
export function devPanelHTML(info,t,esc){
 if(!info||!Array.isArray(info.links))return `<p class="sc-panel-note">${esc(t.devNone)}</p>`;
 const ok=new Set(['vndb','site','moegirl','jawiki']);
 return `${info.intro?`<p class="sc-intro">${esc(info.intro)}<small>${esc(t.devSource)}</small></p>`:''}<ul class="sc-links">${info.links.filter(l=>ok.has(l.kind)).map(l=>`<li><button type="button" class="sc-link" data-link="${esc(l.kind)}" title="${esc(t.devOpen)}">${esc(t.links[l.kind]||l.kind)}<span aria-hidden="true"> ↗</span></button></li>`).join('')}</ul>`;
}
/* developer logos: the small icon of the developer's own site (services/seed-logo.cjs), three at a time; no icon = the letter badge stays */
const logos=new Map();
export function loadLogos(root,api,live=()=>root.isConnected,{cache=logos}={}){
 const todo=[...root.querySelectorAll('.sc-logo[data-pid]')];let at=0;
 const next=async()=>{while(at<todo.length&&live()){const el=todo[at++],pid=el.dataset.pid;if(!el.isConnected)continue;
  let p=cache.get(pid);if(!p){p=Promise.resolve().then(()=>api('seed_logo',{pid})).catch(()=>null).then(u=>{if(!isCover(u))cache.set(pid,Promise.resolve(null));return u;});cache.set(pid,p);}
  const url=await p;if(isCover(url)&&live()&&el.isConnected){const img=new Image();img.alt='';img.decoding='async';img.onload=()=>{el.textContent='';el.append(img);el.classList.add('has-img');};img.src=url;}}};
 return Promise.all([next(),next(),next()]);
}
export function openSeedCatalog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-catalog')?.close();
 const t=catalogWords(locale),dialog=document.createElement('dialog');let mode=savedMode(),games=[],query='',safeOnly=false;
 dialog.className='game-dialog seed-catalog';
 /* the app's dialog parts: game-dialog head, a bar like the lines picker, the list, the action row */
 dialog.innerHTML=`<div class="game-dialog-head"><h2>${esc(t.title)}</h2><p data-sub>${esc(t.loading)}</p></div>
  <div class="sc-bar"><label class="sc-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" data-search placeholder="${esc(t.search)}" aria-label="${esc(t.search)}" autocomplete="off" spellcheck="false"></label></div>
  <p class="sc-offline" data-offline hidden>${esc(t.offline)}</p>
  <div class="sc-body" data-body></div>
  <div class="dialog-actions"><button type="button" class="text-button" data-close>${esc(t.close)}</button></div>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const $=s=>dialog.querySelector(s),body=$('[data-body]');
 let run=0;
 const render=()=>{const mine=++run;dialog.dataset.mode=mode;body.innerHTML=catalogHTML(games,locale,mode,esc,query);loadCovers(body,api,mode,()=>mine===run&&dialog.isConnected);loadLogos(body,api,()=>mine===run&&dialog.isConnected);};
 /* a veil card: a click shows that one cover for now (the setting stays off; the app's R18 filter still refuses it) */
 body.addEventListener('click',async e=>{const b=e.target.closest('[data-reveal]');if(!b||b.disabled)return;const el=b.closest('.sc-cover');b.disabled=true;let u=null;try{u=await api('seed_cover',{vndb:b.dataset.reveal,nsfw:true});}catch{}
  if(isCover(u)&&el.isConnected){b.remove();el.querySelector('.sc-ph')?.remove();showCover(el,u);el.dataset.state='load';}else{b.disabled=false;b.title=safeOnly?t.locked:t.failed;}});
 /* a developer's name opens a small panel: VNDB's introduction (cut short, source named) and links; links open in the system browser */
 body.addEventListener('click',async e=>{const b=e.target.closest('[data-dev]');if(b){const panel=b.closest('.sc-group').querySelector('[data-panel]'),open=panel.hidden;panel.hidden=!open;b.setAttribute('aria-expanded',String(open));if(open&&!panel.dataset.loaded){panel.dataset.loaded='1';panel.innerHTML='<p class="sc-panel-note">'+esc(t.loading)+'</p>';let info=null;try{info=await api('seed_producer',{pid:b.dataset.dev});}catch{}panel.innerHTML=devPanelHTML(info,t,esc);if(!info)delete panel.dataset.loaded;}return;}
  const l=e.target.closest('[data-link]');if(l){const pid=l.closest('.sc-group').querySelector('[data-dev]')?.dataset.dev;try{await api('seed_producer_open',{pid,kind:l.dataset.link});}catch{toast&&toast(t.failed);}}});
 $('[data-search]').addEventListener('input',e=>{query=e.target.value;render();});
 $('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.showModal();
 Promise.resolve().then(()=>api('seed_catalog',{})).then(r=>{
  if(!dialog.isConnected)return;games=Array.isArray(r?.games)?r.games:[];
  /* the app's R18 filter (卡背过滤 R18 图片) is on: normal mode only, the NSFW button off with a hint */
  if(r?.safeOnly===true){safeOnly=true;mode='normal';render();}
  $('[data-sub]').textContent=t.sub(mergeGames(games).length,games.length,new Set(games.map(g=>g.developers?.[0]?.id).filter(Boolean)).size);
  $('[data-offline]').hidden=!r?.offline;render();
 }).catch(()=>{if(dialog.isConnected){$('[data-sub]').textContent=t.failed;toast&&toast(t.failed);}});
 return dialog;
}
/* the entry button for The Seed dialog and the About section */
export const catalogLinkHTML=(locale,esc,cls='seed-link')=>`<button type="button" class="${cls}" data-seed-catalog>${esc(catalogWords(locale).link)}<i aria-hidden="true">→</i></button>`;
export function bindSeedCatalog(root,{api,locale,esc,toast}){root.querySelectorAll('[data-seed-catalog]').forEach(b=>b.addEventListener('click',()=>openSeedCatalog({api,locale,esc,toast})));}
