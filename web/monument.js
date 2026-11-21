// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: a full-page monument of the players who shared a calibration. A wide black stone in a dim marble hall with a cold
   light from above; every name is engraved in a vertical column (credit, or "传火人 #N"), with the date and the game in small type.
   Drawn with CSS only (monument.css, linked on first use). The names come from the relay through the service (torch_monument, paged by
   cursor); the list is virtual: only the rows in view exist, and the next page loads as the stone is scrolled. */
const W={
 zh:{title:'传火碑',sub:'分享过校准结果的玩家，名字都刻在这里',total:n=>'已刻 '+n+' 人',empty:'还没有人刻下名字',close:'关闭',mine:'这是你刻下的名字',torch:n=>'传火人 #'+n,label:'传火碑的名字列表'},
 en:{title:'Monument',sub:'Players who shared a calibration have their names engraved here',total:n=>n+' names',empty:'No one has engraved a name yet',close:'Close',mine:'This is your name',torch:n=>'Torch bearer #'+n,label:'Names on the monument'},
 ja:{title:'火の碑',sub:'校正結果を共有したプレイヤーの名前がここに刻まれます',total:n=>n+' 人',empty:'まだ誰の名前も刻まれていません',close:'閉じる',mine:'あなたの名前です',torch:n=>'火を継ぐ人 #'+n,label:'碑に刻まれた名前の一覧'}};
const CELL_W=88,ROW_H=196,PAGE=120,BUFFER=2;
let open=null;
const dateOf=at=>{const d=new Date(/^\d+$/.test(String(at))?Number(at):at);return isNaN(d)?'':d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0')+'.'+String(d.getDate()).padStart(2,'0');};
const timeOf=at=>{const d=new Date(/^\d+$/.test(String(at))?Number(at):at);return isNaN(d)?'':d.toLocaleString();};
function linkCss(){const href='monument.css';try{if(![...document.styleSheets].some(s=>s.href&&s.href.endsWith(href))){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.append(l);}}catch{}}
export function toggleMonument(ctx){if(open){open.close();return;}open=mountMonument(ctx);}
export function mountMonument({api,locale,esc,toast}){
 linkCss();const w=W[locale]||W.zh;
 const root=document.createElement('section');root.className='monu';root.setAttribute('role','dialog');root.setAttribute('aria-label',w.title);root.tabIndex=-1;
 root.innerHTML=`<div class="monu-hall" aria-hidden="true"><i class="monu-beam b1"></i><i class="monu-beam b2"></i><i class="monu-beam b3"></i><i class="monu-floor"></i></div>
  <header class="monu-head"><div><h2>${esc(w.title)}</h2><p>${esc(w.sub)}</p></div><span class="monu-total" data-total></span><button type="button" class="monu-close" data-close aria-label="${esc(w.close)}" title="${esc(w.close)}">×</button></header>
  <div class="monu-slab"><div class="monu-scroll" data-scroll tabindex="0" role="list" aria-label="${esc(w.label)}"><div class="monu-space" data-space></div></div><p class="monu-empty" data-empty hidden>${esc(w.empty)}</p></div>`;
 document.body.append(root);
 const scroll=root.querySelector('[data-scroll]'),space=root.querySelector('[data-space]'),emptyEl=root.querySelector('[data-empty]'),totalEl=root.querySelector('[data-total]');
 let items=[],next=null,total=0,loading=false,loaded=false,mine=new Set(),cols=1,rows=new Map(),dead=false;
 const cell=(it,i)=>{const own=mine.has(it.torchNo),name=it.name||w.torch(it.torchNo),tip=[name,it.game,timeOf(it.at)].filter(Boolean).join('\n')+(own?'\n'+w.mine:'');
  return `<div class="monu-cell${own?' is-mine':''}${it.name?'':' is-anon'}" role="listitem" title="${esc(tip)}"><span class="monu-name${[...name].length>20?' is-long':''}">${esc(name)}</span><span class="monu-date">${esc(dateOf(it.at))}</span><span class="monu-game">${esc(it.game||'')}</span></div>`;};
 const rowCount=()=>Math.ceil(Math.max(total,items.length)/cols);
 function measure(){const width=Math.max(CELL_W,scroll.clientWidth-48);cols=Math.max(1,Math.floor(width/CELL_W));scroll.style.setProperty('--cols',cols);scroll.style.setProperty('--cell',CELL_W+'px');scroll.style.setProperty('--row',ROW_H+'px');space.style.height=rowCount()*ROW_H+'px';}
 function paint(){if(dead)return;const top=scroll.scrollTop,h=scroll.clientHeight,first=Math.max(0,Math.floor(top/ROW_H)-BUFFER),last=Math.min(rowCount()-1,Math.ceil((top+h)/ROW_H)+BUFFER);
  for(const [r,el] of rows)if(r<first||r>last){el.remove();rows.delete(r);}
  for(let r=first;r<=last;r++){if(rows.has(r))continue;const from=r*cols,slice=items.slice(from,from+cols);if(!slice.length)continue;const el=document.createElement('div');el.className='monu-row';el.style.transform=`translateY(${r*ROW_H}px)`;el.dataset.r=r;el.innerHTML=slice.map((it,k)=>cell(it,from+k)).join('');space.append(el);rows.set(r,el);}
  if((last+1)*cols>=items.length)more();}
 async function more(){if(loading||dead||(loaded&&next===null))return;loading=true;let res=null;try{res=await api('torch_monument',{cursor:next===null?'':next,limit:PAGE});}catch{res=null;}loading=false;if(dead)return;
  loaded=true;if(res&&Array.isArray(res.items)){const have=new Set(items.map(x=>x.torchNo));for(const it of res.items)if(!have.has(it.torchNo))items.push(it);next=res.next??null;total=Math.max(res.total|0,items.length);}else next=null;
  measure();rows.forEach(el=>el.remove());rows.clear();head();paint();}
 function head(){emptyEl.hidden=items.length>0||!loaded;totalEl.textContent=items.length?w.total(Math.max(total,items.length)):'';root.classList.toggle('is-empty',!items.length);}
 let raf=0;const onScroll=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(paint);};
 scroll.addEventListener('scroll',onScroll,{passive:true});
 const ro=window.ResizeObserver?new ResizeObserver(()=>{const old=cols;measure();if(cols!==old){rows.forEach(el=>el.remove());rows.clear();}paint();}):null;ro?.observe(scroll);
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();}};document.addEventListener('keydown',onKey);
 function close(){if(dead)return;dead=true;cancelAnimationFrame(raf);ro?.disconnect();document.removeEventListener('keydown',onKey);scroll.removeEventListener('scroll',onScroll);root.classList.add('is-closing');setTimeout(()=>root.remove(),matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);open=null;}
 root.querySelector('[data-close]').onclick=close;
 measure();head();root.focus({preventScroll:true});
 api('torch_mine',{}).then(r=>{mine=new Set((r&&r.torchNos)||[]);rows.forEach(el=>el.remove());rows.clear();paint();}).catch(()=>{});
 more();
 return {close};
}
