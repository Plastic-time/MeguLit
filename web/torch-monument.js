// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: everyone who shared a calibration (The Seed) is carved on one black stone in a dim marble hall.
   A real three.js scene (web/vendor/three, r168, offline): basilica hall with arcades, a drum of high windows under a dome,
   cold light shafts, drifting dust, a polished marble floor that mirrors the shafts and the inscription, and a black
   basalt stele on three steps. Names are drawn into the stele's textures one page at a time (canvas, carved look), so a
   monument with hundreds of thousands of names only ever holds a few hundred in memory.

   Data: services/torch-monument.cjs through the bridge (torch_page / torch_months / torch_find / torch_me).
   Life cycle: the scene is built when the page opens and fully disposed when it closes (GPU context released). It stops
   drawing while the window is hidden or not focused, and closes itself when a game starts (event megulit-game-launch).
   Quality: 'high' (mirror floor, bloom, shadows) or 'low' (no mirror, no bloom, lower resolution); auto picks low on weak
   machines and drops to low when frames run slow. */
import * as THREE from './vendor/three/three.module.min.js';
import {Reflector} from './vendor/three/addons/objects/Reflector.js';
import {EffectComposer} from './vendor/three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './vendor/three/addons/postprocessing/OutputPass.js';
import {loadGsap} from './gsap-loader.js';

const COPY={
 zh:{title:'传火碑',sub:'分享过校准结果的玩家，名字都刻在这里',count:n=>'已刻 '+n+' 人',monthCount:(m,n)=>m+' · '+n+' 人',range:(a,b)=>'第 '+a+'–'+b+' 位',all:'全部',
  anon:n=>'传火人 #'+n,empty:'还没有人刻下名字',find:'找名字',findGo:'查找',me:'我的名字',meNone:'这台电脑还没有传过火',quality:{high:'画质 标准',low:'画质 省电'},
  close:'关闭',prev:'往前',next:'往后',none:'没找到这个名字',offline:'暂时连不上服务器，过一会儿再打开看看',loading:'正在读取…',nth:n=>'第 '+n+' 位',more:'只显示前 50 个',
  ym:m=>m.replace(/^(\d{4})-(\d{2})$/,(x,y,mo)=>y+' 年 '+Number(mo)+' 月')},
 en:{title:'Monument',sub:'Everyone who shared a calibration is carved here',count:n=>n+' names',monthCount:(m,n)=>m+' · '+n,range:(a,b)=>'#'+a+'–'+b,all:'All',
  anon:n=>'Torch bearer #'+n,empty:'No names carved yet',find:'Find a name',findGo:'Find',me:'My name',meNone:'This PC has not shared yet',quality:{high:'Quality: full',low:'Quality: light'},
  close:'Close',prev:'Back',next:'On',none:'No such name',offline:'Cannot reach the server right now. Try again later.',loading:'Loading…',nth:n=>'#'+n,more:'First 50 only',
  ym:m=>m},
 ja:{title:'継火の碑',sub:'キャリブレーションを共有した人の名前が刻まれています',count:n=>n+' 名',monthCount:(m,n)=>m+' · '+n+' 名',range:(a,b)=>a+'–'+b+' 番目',all:'すべて',
  anon:n=>'火を継ぐ人 #'+n,empty:'まだ誰の名前も刻まれていません',find:'名前を探す',findGo:'探す',me:'自分の名前',meNone:'この PC からはまだ共有していません',quality:{high:'画質 標準',low:'画質 軽量'},
  close:'閉じる',prev:'前へ',next:'次へ',none:'見つかりませんでした',offline:'サーバーに接続できません。しばらくしてからもう一度開いてください',loading:'読み込み中…',nth:n=>n+' 番目',more:'最初の 50 件のみ',
  ym:m=>m.replace(/^(\d{4})-(\d{2})$/,(x,y,mo)=>y+' 年 '+Number(mo)+' 月')}};
const QUALITY_KEY='megulit-torch-quality';
const FONT='"Torch Serif","Noto Serif SC","Source Han Serif SC","Noto Serif JP","Songti SC","SimSun","Yu Mincho",serif';
const PAGE=300,KEEP=1200;
/* stele face: a 4096×1536 canvas in "logical" units (drawn at half size on the low tier) */
const FW=4096,FH=984,BAND_Y0=14,BAND_Y1=100,RULE_Y=112,AREA_X0=90,AREA_X1=4006,AREA_Y0=146,AREA_Y1=954,COL_W=66;
const NAME_PX=40,NAME_ADV=42,SIDE_PX=15,SIDE_ADV=16,DATE_PX=14,GAP=30;

let current=null;
export function closeTorchMonument(){if(current)current.close();}
export function torchMonumentOpen(){return !!current;}

export async function openTorchMonument({api,locale='zh',esc=s=>String(s??''),toast=()=>{}}={}){
 if(current){current.focus();return current;}
 const t=COPY[locale]||COPY.zh;
 const host=document.createElement('div');host.className='torch-monument';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label',t.title);
 host.innerHTML=`<canvas class="tm-canvas" aria-hidden="true"></canvas><div class="tm-veil" aria-hidden="true"></div>
  <header class="tm-head"><h2 class="tm-title">${esc(t.title)}</h2><p class="tm-sub">${esc(t.sub)}</p></header>
  <p class="tm-count" aria-live="polite"></p>
  <div class="tm-tip" role="tooltip" hidden><b class="tm-tip-name"></b><span class="tm-tip-meta"></span></div>
  <p class="tm-status" role="status" hidden></p>
  <footer class="tm-bar">
   <div class="tm-pager"><button type="button" class="tm-btn tm-next" aria-label="${esc(t.next)}" title="${esc(t.next)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg></button><span class="tm-range"></span><button type="button" class="tm-btn tm-prev" aria-label="${esc(t.prev)}" title="${esc(t.prev)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg></button></div>
   <form class="tm-find" hidden><input type="search" maxlength="30" autocomplete="off" spellcheck="false" placeholder="${esc(t.find)}" aria-label="${esc(t.find)}"><button type="submit" class="tm-btn tm-text">${esc(t.findGo)}</button><ul class="tm-results" hidden></ul></form>
   <button type="button" class="tm-btn tm-text tm-me" hidden>${esc(t.me)}</button>
   <span class="tm-sep" aria-hidden="true"></span>
   <button type="button" class="tm-btn tm-text tm-quality" aria-pressed="false"></button>
   <button type="button" class="tm-btn tm-text tm-close">${esc(t.close)}</button>
  </footer>`;
 const frame=document.querySelector('.app-frame')||document.body;frame.append(host);
 const place=()=>{const bar=document.querySelector('.titlebar');const top=bar?Math.round(bar.getBoundingClientRect().bottom):0;host.style.top=top+'px';};place();
 const $=s=>host.querySelector(s);
 const state={month:'',months:[],monthsOn:false,findOn:false,mine:[],mineAt:0,items:[],off:0,next:null,atStart:true,total:0,loading:false,offline:false,focusNo:0,fit:0,layout:null,
  bandWindow:0,hover:null,hoverMonth:null};
 let disposed=false,scene=null,gsap=null;
 const quality=()=>{let q='auto';try{q=localStorage.getItem(QUALITY_KEY)||'auto';}catch{}return q==='high'||q==='low'?q:'auto';};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

 /* ---------- data ---------- */
 const call=(a,p)=>api(a,p).catch(()=>({ok:false}));
 async function loadAt({month=state.month,cursor=''}={}){state.loading=true;
  const r=await call('torch_page',{month,cursor,limit:PAGE});state.loading=false;if(disposed)return false;
  if(!r||!r.ok){state.offline=true;state.items=[];state.total=0;status(t.offline);redraw();return false;}
  state.offline=false;status('');state.month=r.month||month||'';state.items=r.items||[];state.next=r.next;state.total=r.total|0;state.off=0;
  state.atStart=!cursor||cursor==='0'||!state.items.length;return true;}
 async function ahead(){if(state.loading||!state.next||state.off+state.fit+60<state.items.length)return;state.loading=true;
  const r=await call('torch_page',{month:state.month,cursor:state.next,limit:PAGE});state.loading=false;if(disposed||!r?.ok)return;
  const last=state.items.length?state.items[state.items.length-1].torchNo:0;state.items.push(...(r.items||[]).filter(i=>i.torchNo>last));state.next=r.next;
  if(state.items.length>KEEP&&state.off>PAGE){state.items.splice(0,PAGE);state.off-=PAGE;state.atStart=false;}}
 async function behind(){if(state.loading||state.atStart||!state.items.length)return 0;const first=state.items[0].torchNo;if(first<=1){state.atStart=true;return 0;}
  state.loading=true;const r=await call('torch_page',{month:state.month,cursor:String(Math.max(0,first-1-PAGE)),limit:PAGE});state.loading=false;if(disposed||!r?.ok)return 0;
  const add=(r.items||[]).filter(i=>i.torchNo<first);if(!add.length){state.atStart=true;return 0;}state.items.unshift(...add);state.off+=add.length;
  if(first-1-PAGE<=0)state.atStart=true;
  if(state.items.length>KEEP){const cut=state.items.length-KEEP;state.items.splice(KEEP,cut);state.next=String(state.items[state.items.length-1].torchNo);}
  return add.length;}
 async function jumpTo(item){if(!item)return;const month=state.monthsOn&&item.month?item.month:'';state.focusNo=item.torchNo;
  const ok=await loadAt({month,cursor:String(Math.max(0,item.torchNo-80))});if(!ok)return;
  if(state.items.length&&item.torchNo-80>0)state.atStart=false;
  const idx=state.items.findIndex(i=>i.torchNo===item.torchNo);
  if(idx<0){state.focusNo=0;}else{const half=Math.floor((state.fit||160)/2);state.off=Math.max(0,idx-half);layoutNow();
   if(!state.layout.entries.some(e=>e.item.torchNo===item.torchNo)){state.off=idx;}}
  redraw(true);await ahead();if(state.focusNo)scene?.lookAtFocus();}

 /* ---------- UI ---------- */
 function status(msg){const el=$('.tm-status');el.textContent=msg||'';el.hidden=!msg;}
 function updateChrome(){const L=state.layout,n=state.total;
  $('.tm-count').textContent=state.month?t.monthCount(t.ym(state.month),n):n?t.count(n):'';
  const first=L?.entries[0]?.item,last=L?.entries[L.entries.length-1]?.item;
  $('.tm-range').textContent=first?t.range(first.torchNo,last.torchNo):'';
  $('.tm-pager').hidden=!first;
  $('.tm-prev').disabled=!state.off&&state.atStart;$('.tm-next').disabled=!(L&&state.off+L.entries.length<state.items.length)&&!state.next;
  const q=scene?.tier||'high';const qb=$('.tm-quality');qb.textContent=t.quality[q];qb.setAttribute('aria-pressed',String(q==='low'));}
 async function step(dir,cols=false){if(!state.layout)return;
  if(dir>0){const L=state.layout;const n=cols?Math.max(1,L.firstColumnCount):Math.max(1,L.entries.length);if(state.off+n>=state.items.length&&!state.next)return;
   state.off=Math.min(state.items.length-1,state.off+n);redraw();await ahead();redraw();}
  else{if(state.off<=0)await behind();if(state.off<=0){redraw();return;}const n=cols?backColumn(state.off):backPage(state.off);state.off=Math.max(0,state.off-n);redraw();}}
 const tip=$('.tm-tip');
 function showTip(entry,x,y){if(!entry){tip.hidden=true;return;}const it=entry.item;
  tip.querySelector('.tm-tip-name').textContent=it.name||t.anon(it.torchNo);
  tip.querySelector('.tm-tip-meta').textContent=[dateText(it.at,true),it.game,t.nth(it.torchNo)].filter(Boolean).join(' · ');
  tip.hidden=false;const r=host.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.min(r.width-w-12,Math.max(12,x-r.left+16))+'px';tip.style.top=Math.min(r.height-h-12,Math.max(12,y-r.top+18))+'px';}

 /* ---------- face layout & drawing ---------- */
 const measure=document.createElement('canvas').getContext('2d');
 const runs=s=>{const out=[];for(const ch of s){const latin=/[ -~ -ɏ]/.test(ch);const last=out[out.length-1];if(last&&last.latin===latin)last.text+=ch;else out.push({latin,text:ch});}return out;};
 function verticalLength(s,px,adv){measure.font=px+'px '+FONT;let len=0;for(const r of runs(s))len+=r.latin?measure.measureText(r.text.trim()?r.text:' ').width+px*0.18:[...r.text].length*adv;return len;}
 function dateText(at,full){if(!at)return '';const d=new Date(at*1000),p=n=>String(n).padStart(2,'0');return full?d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()):p(d.getMonth()+1)+'·'+p(d.getDate());}
 function entryBox(item){const name=item.name||t.anon(item.torchNo);let px=NAME_PX,adv=NAME_ADV,len=verticalLength(name,px,adv);const room=AREA_Y1-AREA_Y0-56;
  if(len>room){const k=room/len;px=Math.floor(px*k);adv=adv*k;len=verticalLength(name,px,adv);}
  const game=item.game||'';let side=game;const sideRoom=Math.max(len,4*SIDE_ADV);
  while(side&&verticalLength(side,SIDE_PX,SIDE_ADV)>sideRoom)side=[...side].slice(0,-2).join('')+'…';if(side==='…')side='';
  const sideLen=side?verticalLength(side,SIDE_PX,SIDE_ADV):0;return {name,px,adv,len,side,sideLen,h:Math.max(len,sideLen)+24};}
 function layoutFrom(off){const entries=[];let col=0,y=AREA_Y0,firstColumnCount=0;const cols=Math.floor((AREA_X1-AREA_X0)/COL_W);
  for(let i=off;i<state.items.length;i++){const box=entryBox(state.items[i]);if(y+box.h>AREA_Y1&&y>AREA_Y0){col++;y=AREA_Y0;}if(col>=cols)break;
   const x=AREA_X1-COL_W*(col+1);entries.push({item:state.items[i],box,x,y,col});if(col===0)firstColumnCount++;y+=box.h+GAP;}
  return {entries,firstColumnCount,cols};}
 function backColumn(off){let y=AREA_Y0,n=0;for(let i=off-1;i>=0;i--){const h=entryBox(state.items[i]).h;if(y+h>AREA_Y1&&n)break;y+=h+GAP;n++;}return Math.max(1,n);}
 function backPage(off){let n=0,o=off;const cols=Math.floor((AREA_X1-AREA_X0)/COL_W);for(let c=0;c<cols&&o>0;c++){const k=backColumn(o);o-=k;n+=k;}return Math.max(1,n);}
 function layoutNow(){state.layout=layoutFrom(state.off);state.fit=state.layout.entries.length;return state.layout;}
 function redraw(force){if(disposed)return;layoutNow();updateChrome();scene?.paintFace(force);}

 /* ---------- scene ---------- */
 await document.fonts.load('44px "Torch Serif"','传火碑人').catch(()=>{});
 gsap=await loadGsap().catch(()=>null);
 if(disposed)return null;
 scene=buildScene({host,canvas:$('.tm-canvas'),state,t,tier:pickTier(quality()),reduced,gsap,onTier:()=>updateChrome()});
 const ctl={close,focus:()=>$('.tm-close').focus()};current=ctl;

 /* first data: page 1, then the side routes (their buttons stay hidden until the relay has them) */
 status(t.loading);redraw();
 const firstLoad=loadAt({}).then(()=>{redraw(true);return ahead();}).then(()=>redraw());
 call('torch_months').then(r=>{if(disposed||!r?.ok)return;state.monthsOn=r.available!==false;state.months=r.months||[];state.bandWindow=Math.max(0,state.months.length-12);redraw();});
 call('torch_find',{name:'',probe:true}).then(r=>{if(disposed)return;state.findOn=!!(r&&r.available!==false);$('.tm-find').hidden=!state.findOn;});
 call('torch_me').then(async r=>{if(disposed||!r?.ok)return;state.mine=r.items||[];$('.tm-me').hidden=!(r.available!==false&&state.mine.length);
  if(state.mine.length){await firstLoad;redraw(true);}});

 /* controls */
 $('.tm-close').addEventListener('click',()=>close());
 $('.tm-prev').addEventListener('click',()=>step(-1));$('.tm-next').addEventListener('click',()=>step(1));
 $('.tm-quality').addEventListener('click',()=>{const next=scene.tier==='low'?'high':'low';try{localStorage.setItem(QUALITY_KEY,next);}catch{}scene.setTier(next);updateChrome();});
 $('.tm-me').addEventListener('click',()=>{if(!state.mine.length){toast(t.meNone);return;}const it=state.mine[state.mineAt%state.mine.length];state.mineAt++;jumpTo(it);});
 const results=$('.tm-results');
 $('.tm-find').addEventListener('submit',async e=>{e.preventDefault();const q=$('.tm-find input').value.trim();results.hidden=true;if(!q)return;
  const no=/^(?:传火人|火を継ぐ人|torch bearer)?\s*#?\s*(\d{1,12})$/i.exec(q);if(no){jumpTo({torchNo:Number(no[1]),month:''});return;}
  const r=await call('torch_find',{name:q});if(disposed)return;const list=r?.items||[];
  if(!list.length){toast(t.none);return;}if(list.length===1){jumpTo(list[0]);return;}
  results.innerHTML=list.map((it,i)=>`<li><button type="button" data-i="${i}"><b>${esc(it.name||t.anon(it.torchNo))}</b><span>${esc(dateText(it.at,true))} · ${esc(t.nth(it.torchNo))}</span></button></li>`).join('')+(list.length>=50?`<li class="tm-results-more">${esc(t.more)}</li>`:'');
  results.hidden=false;results.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{results.hidden=true;jumpTo(list[Number(b.dataset.i)]);}));});
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();if(!results.hidden){results.hidden=true;return;}if(scene.reading()){scene.setRead(null);return;}close();return;}
  if(e.target.closest?.('input,textarea'))return;
  if(e.key==='PageDown'||e.key==='ArrowLeft'){e.preventDefault();step(1);}else if(e.key==='PageUp'||e.key==='ArrowRight'){e.preventDefault();step(-1);}};
 addEventListener('keydown',onKey,true);
 /* the stele: wheel scrolls one column at a time; the month band at its top picks a month */
 let wheelAcc=0;
 const onWheel=e=>{if(e.target.closest?.('.tm-bar,.tm-results'))return;e.preventDefault();wheelAcc+=e.deltaY||e.deltaX;if(Math.abs(wheelAcc)<50)return;const d=Math.sign(wheelAcc);wheelAcc=0;step(d,true);};
 host.addEventListener('wheel',onWheel,{passive:false});
 const canvas=$('.tm-canvas');
 canvas.addEventListener('pointermove',e=>{const hit=scene.pick(e.clientX,e.clientY);let cursor='';state.hoverMonth=null;
  if(hit&&hit.band){state.hoverMonth=hit.band;cursor='pointer';showTip(null);}else if(hit&&hit.entry){cursor=scene.reading()?'zoom-out':'zoom-in';showTip(hit.entry,e.clientX,e.clientY);}else{if(hit)cursor=scene.reading()?'zoom-out':'zoom-in';showTip(null);}
  canvas.style.cursor=cursor||'';});
 canvas.addEventListener('pointerleave',()=>showTip(null));
 canvas.addEventListener('click',async e=>{if(scene.dragged())return;const hit=scene.pick(e.clientX,e.clientY);
  if(!hit){if(scene.reading())scene.setRead(null);return;}
  if(!hit.band){scene.setRead(scene.reading()?null:hit.point);return;}const b=hit.band;
  if(b.kind==='shift'){state.bandWindow=Math.max(0,Math.min(Math.max(0,state.months.length-12),state.bandWindow+b.dir*6));redraw();return;}
  state.focusNo=0;await loadAt({month:b.month,cursor:''});redraw(true);await ahead();redraw();});
 /* stop drawing in the background; close before a game starts */
 const onVis=()=>scene.setActive(!document.hidden&&document.hasFocus());
 const onBlur=()=>scene.setActive(false),onFocus=()=>scene.setActive(!document.hidden);
 const onLaunch=()=>close(true);
 document.addEventListener('visibilitychange',onVis);addEventListener('blur',onBlur);addEventListener('focus',onFocus);addEventListener('megulit-game-launch',onLaunch);
 addEventListener('resize',place);
 const ro=new ResizeObserver(()=>scene.resize());ro.observe(host);

 /* entrance */
 const veil=$('.tm-veil'),chrome=[...host.querySelectorAll('.tm-head,.tm-count,.tm-bar')];
 if(gsap&&!reduced){gsap.set(chrome,{autoAlpha:0,y:8});gsap.to(veil,{autoAlpha:0,duration:1.6,ease:'power2.out'});
  gsap.to(chrome,{autoAlpha:1,y:0,duration:.9,ease:'power3.out',stagger:.12,delay:scene.introSeconds*0.62});}
 else veil.style.opacity='0';
 scene.intro();
 $('.tm-close').focus({preventScroll:true});

 function close(now=false){if(disposed)return;disposed=true;current=null;
  removeEventListener('keydown',onKey,true);document.removeEventListener('visibilitychange',onVis);removeEventListener('blur',onBlur);removeEventListener('focus',onFocus);
  removeEventListener('megulit-game-launch',onLaunch);removeEventListener('resize',place);ro.disconnect();
  scene.setActive(false);
  const done=()=>{scene.dispose();host.remove();};
  if(now||!gsap||reduced){done();return;}
  gsap.to(host,{autoAlpha:0,duration:.35,ease:'power2.in',onComplete:done});}
 return ctl;
}

/* weak machines start on the light tier: few cores, little memory, or a software renderer */
function pickTier(q){if(q!=='auto')return q;const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||8;
 let soft=false;try{const gl=document.createElement('canvas').getContext('webgl2');const ext=gl&&gl.getExtension('WEBGL_debug_renderer_info');
  const name=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)):'';soft=/swiftshader|basic render|llvmpipe|software/i.test(name);gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
 return soft||cores<=2||mem<=2?'low':'high';}

/* ================= procedural textures ================= */
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
/* tileable value noise + fbm on a period-p lattice */
function makeNoise(seed){const r=rng(seed),P=256,v=new Float32Array(P*P);for(let i=0;i<v.length;i++)v[i]=r();
 const at=(x,y,p)=>v[((y%p+p)%p)*P+((x%p+p)%p)];
 const n=(x,y,p)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),w=yf*yf*(3-2*yf);
  const a=at(xi,yi,p),b=at(xi+1,yi,p),c=at(xi,yi+1,p),d=at(xi+1,yi+1,p);return a+(b-a)*u+(c-a)*w+(a-b-c+d)*u*w;};
 return (x,y,base=4,oct=5)=>{let s=0,amp=.5,f=base;for(let o=0;o<oct;o++){s+=amp*n(x*f,y*f,f);amp*=.5;f*=2;}return s;};}
function canvas2d(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function pixels(w,h,fn){const c=canvas2d(w,h),g=c.getContext('2d'),img=g.createImageData(w,h),d=img.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4,px=fn(x/w,y/h,x,y);d[o]=px[0];d[o+1]=px[1];d[o+2]=px[2];d[o+3]=px[3]??255;}g.putImageData(img,0,0);return c;}
/* dark marble: domain-warped veins */
function marbleTextures(size,seed,{base=[16,18,22],vein=[86,92,104],veinK=7,warp=2.6,repeat=1}={}){const fbm=makeNoise(seed);const tone=[],rough=[];
 const col=pixels(size,size,(u,v)=>{const w=fbm(u,v,3,5),w2=fbm(u+.31,v+.77,5,4);const s=Math.abs(Math.sin((u*veinK*repeat+v*2.3+w*warp)*Math.PI));
  const veinA=Math.pow(1-s,18)*.95+Math.pow(1-Math.abs(Math.sin((v*veinK*1.7+u*.9+w2*warp*1.4)*Math.PI)),40)*.5;const m=.82+w2*.36;
  return [base[0]*m+(vein[0]-base[0])*veinA,base[1]*m+(vein[1]-base[1])*veinA,base[2]*m+(vein[2]-base[2])*veinA];});
 const rgh=pixels(size>>1,size>>1,(u,v)=>{const n=fbm(u*2,v*2,6,3);const g=40+n*40;return [g,g,g];});
 tone.push(col);rough.push(rgh);return {map:col,rough:rgh};}
/* polished basalt: near-black with fine grain; normal from fbm height */
function basaltTextures(size,seed){const fbm=makeNoise(seed),h=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)h[y*size+x]=fbm(x/size,y/size,8,5);
 const r=rng(seed+7);
 const map=pixels(size,size,(u,v,x,y)=>{const n=h[y*size+x];const s=r()<.004?26:0;const g=9+n*9+s;return [g,g*1.02+.4,g*1.08+.8];});
 const normal=pixels(size,size,(u,v,x,y)=>{const at=(i,j)=>h[((j+size)%size)*size+((i+size)%size)];const dx=(at(x+1,y)-at(x-1,y))*6,dy=(at(x,y+1)-at(x,y-1))*6;
  const l=Math.hypot(dx,dy,1);return [(-dx/l*.5+.5)*255,(-dy/l*.5+.5)*255,(1/l*.5+.5)*255];});
 const rough=pixels(size,size,(u,v,x,y)=>{const n=h[y*size+x];const g=30+n*36+(r()<.01?60:0);return [g,g,g];});
 return {map,normal,rough};}
function stoneTexture(size,seed,base=[20,21,24]){const fbm=makeNoise(seed);return pixels(size,size,(u,v)=>{const n=fbm(u,v,2,4);const m=.9+n*.18;return [base[0]*m,base[1]*m,base[2]*m];});}
/* floor: big marble slabs with joints */
/* floor: pale polished marble in staggered slabs of different lengths (8 m per tile of texture), violet-grey veins, thin joints */
function floorTextures(size,seed){const m=marbleTextures(size,seed,{base:[150,148,158],vein:[128,122,140],veinK:5,warp:3.2});const g=m.map.getContext('2d'),r=m.rough.getContext('2d');
 const rnd=rng(seed+5),rows=8,rh=size/rows,k=m.rough.width/size,fbm=makeNoise(seed+9);
 /* each slab slightly different in tone */
 const slabs=[];for(let y=0;y<rows;y++){let x=-rnd()*rh*1.6;while(x<size){const w=rh*(1.1+rnd()*1.5);slabs.push([x,y*rh,w,rh]);x+=w;}}
 for(const [x,y,w,h] of slabs){const t=rnd();g.fillStyle=t<.5?'rgba(20,16,30,'+(t*.12)+')':'rgba(255,250,244,'+((t-.5)*.1)+')';g.fillRect(x,y,w,h);if(x<0){g.fillRect(x+size,y,w,h);}}
 /* soft water-like stains */
 g.globalCompositeOperation='multiply';for(let i=0;i<14;i++){const cx=rnd()*size,cy=rnd()*size,rr=size*(.05+rnd()*.1);const gr=g.createRadialGradient(cx,cy,0,cx,cy,rr);gr.addColorStop(0,'rgba(150,150,165,.35)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(cx-rr,cy-rr,rr*2,rr*2);}
 g.globalCompositeOperation='source-over';
 g.strokeStyle='rgba(60,54,70,.75)';g.lineWidth=Math.max(1.5,size/900);r.strokeStyle='#cfcfcf';r.lineWidth=Math.max(1.5,size/1200);
 for(const [x,y,w,h] of slabs){g.strokeRect(x,y,w,h);if(x<0)g.strokeRect(x+size,y,w,h);r.strokeRect(x*k,y*k,w*k,h*k);if(x<0)r.strokeRect((x+size)*k,y*k,w*k,h*k);}
 return m;}
function glowSprite(size,inner='rgba(210,232,255,1)'){const c=canvas2d(size,size),g=c.getContext('2d'),gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 gr.addColorStop(0,inner);gr.addColorStop(.25,'rgba(190,180,240,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,size,size);return c;}
/* painted vault: cream ground, black-violet ribs and borders, Megumin red and orange bands and medallions (original pattern) */
function domePainting(w,h,half){const c=canvas2d(w,h),g=c.getContext('2d'),fbm=makeNoise(half?71:73);
 const base=pixels(w>>2,h>>2,(u,v)=>{const n=fbm(u,v,3,4);const k=.86+n*.22;return [206*k,192*k,170*k];});g.imageSmoothingEnabled=true;g.drawImage(base,0,0,w,h);
 const ribs=half?10:16;
 /* ribs from the crown down */
 for(let i=0;i<ribs;i++){const x=i/ribs*w;g.fillStyle='rgba(40,26,52,.9)';g.fillRect(x-w*.006,0,w*.012,h);g.fillStyle='rgba(232,116,44,.85)';g.fillRect(x-w*.0016,0,w*.0032,h);}
 /* panels between ribs: a pale lozenge and a red medallion */
 for(let i=0;i<ribs;i++){const cx=(i+.5)/ribs*w,cy=h*(half?.42:.5),rw=w/ribs*.28,rh=h*.16;g.fillStyle='rgba(244,236,222,.55)';g.beginPath();g.moveTo(cx,cy-rh);g.lineTo(cx+rw,cy);g.lineTo(cx,cy+rh);g.lineTo(cx-rw,cy);g.closePath();g.fill();
  g.strokeStyle='rgba(40,26,52,.75)';g.lineWidth=w*.002;g.stroke();g.fillStyle='rgba(173,21,57,.85)';g.beginPath();g.arc(cx,cy,Math.min(rw,rh)*.34,0,Math.PI*2);g.fill();
  g.strokeStyle='rgba(232,116,44,.9)';g.lineWidth=w*.0016;g.beginPath();g.arc(cx,cy,Math.min(rw,rh)*.46,0,Math.PI*2);g.stroke();}
 /* lower border: black-violet band with a running orange wave and a red line */
 const by=h*(half?.8:.86),bh=h*.07;g.fillStyle='rgba(34,22,44,.95)';g.fillRect(0,by,w,bh);g.strokeStyle='rgba(232,116,44,.9)';g.lineWidth=h*.006;g.beginPath();
 for(let x=0;x<=w;x+=2){const y=by+bh/2+Math.sin(x/w*Math.PI*2*(half?20:32))*bh*.28;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
 g.fillStyle='rgba(173,21,57,.9)';g.fillRect(0,by-h*.008,w,h*.006);g.fillRect(0,by+bh+h*.002,w,h*.006);
 /* crown: a dark violet disc */
 const cg=g.createLinearGradient(0,0,0,h*.12);cg.addColorStop(0,'rgba(30,20,40,.9)');cg.addColorStop(1,'rgba(30,20,40,0)');g.fillStyle=cg;g.fillRect(0,0,w,h*.12);
 return c;}
/* frieze: running vine scroll in cream on black-violet, a red bead line top and bottom (original pattern) */
function friezeTexture(w,h){const c=canvas2d(w,h),g=c.getContext('2d');g.fillStyle='#22162c';g.fillRect(0,0,w,h);
 g.strokeStyle='#d9ccb6';g.lineWidth=h*.045;g.lineCap='round';const n=8,step=w/n,mid=h/2;
 g.beginPath();for(let x=0;x<=w;x+=2){const y=mid+Math.sin(x/step*Math.PI*2)*h*.16;x?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();
 for(let i=0;i<n*2;i++){const x=(i+.5)*step/2,up=i%2===0,cy=mid+(up?-1:1)*h*.06,r=h*.17;g.beginPath();
  for(let a=0;a<Math.PI*1.75;a+=.05){const rr=r*(1-a/(Math.PI*2.2));const px=x+Math.cos(a+(up?Math.PI:0))*rr,py=cy+(up?-1:1)*Math.sin(a)*rr*.9;a?g.lineTo(px,py):g.moveTo(px,py);}g.stroke();
  g.fillStyle='#e8742c';g.beginPath();g.arc(x,cy+(up?-1:1)*h*.02,h*.035,0,Math.PI*2);g.fill();}
 g.fillStyle='#ad1539';for(let x=step/8;x<w;x+=step/4){g.beginPath();g.arc(x,h*.08,h*.025,0,Math.PI*2);g.fill();g.beginPath();g.arc(x,h*.92,h*.025,0,Math.PI*2);g.fill();}
 g.fillStyle='#d9ccb6';g.fillRect(0,0,w,h*.03);g.fillRect(0,h*.97,w,h*.03);return c;}

/* ================= the scene ================= */
function buildScene({host,canvas,state,t,tier,reduced,gsap,onTier}){
 const bag=new Set();const keep=o=>{bag.add(o);return o;};
 const tex=(c,srgb=true,rep=1)=>{const x=keep(new THREE.CanvasTexture(c));x.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;x.wrapS=x.wrapT=THREE.RepeatWrapping;x.repeat.set(rep,rep);x.anisotropy=8;return x;};
 let renderer,composer=null,bloom=null,reflector=null,active=true,raf=0,last=performance.now(),slow=0,frames=0,introDone=false,dragMoved=false;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x0e0c14);scene.fog=new THREE.FogExp2(0x16131f,0.015);
 const camera=new THREE.PerspectiveCamera(44,1,0.1,160);
 const START={pos:new THREE.Vector3(0,3.2,38.5),look:new THREE.Vector3(0,5.2,0)},END={pos:new THREE.Vector3(0,2.3,20.5),look:new THREE.Vector3(0,4.7,0)};
 const view={pos:START.pos.clone(),look:START.look.clone(),yaw:0,pitch:0,yawT:0,pitchT:0,dragYaw:0,dragPitch:0,px:0,pxT:0,read:null};
 camera.position.copy(view.pos);camera.lookAt(view.look);

 /* ---- materials (all procedural). Palette: cream white stone, black-violet marble, Megumin red and orange as inlay accents;
    the daylight itself is a cold violet ---- */
 const fl=floorTextures(2048,11),col=marbleTextures(512,23,{base:[40,26,54],vein:[120,86,140],veinK:3,warp:2.4}),bas=basaltTextures(512,37);
 const creamTex=tex(stoneTexture(512,41,[178,168,152]),true,2),domeTex=tex(domePainting(2048,1024,false),true),halfTex=tex(domePainting(1024,512,true),true),friezeTex=tex(friezeTexture(1024,128),true);
 friezeTex.wrapT=THREE.ClampToEdgeWrapping;
 const cream=keep(new THREE.MeshStandardMaterial({map:creamTex,roughness:.84,metalness:0,envMapIntensity:.4}));
 const creamLight=keep(new THREE.MeshStandardMaterial({map:creamTex,color:0xf3ece0,roughness:.66,metalness:0,envMapIntensity:.5}));
 const violet=keep(new THREE.MeshStandardMaterial({map:tex(col.map,true),roughnessMap:tex(col.rough,false),roughness:.4,metalness:0,envMapIntensity:.85}));
 const frieze=keep(new THREE.MeshStandardMaterial({map:friezeTex,roughness:.75,metalness:0,envMapIntensity:.3}));
 /* inlay strips: Megumin red and orange, a little self-lit so they read in the dim hall */
 const inlayRed=keep(new THREE.MeshStandardMaterial({color:0xad1539,emissive:0xad1539,emissiveIntensity:.22,roughness:.35,metalness:.2}));
 const inlayOrange=keep(new THREE.MeshStandardMaterial({color:0xe8742c,emissive:0xe8742c,emissiveIntensity:.28,roughness:.3,metalness:.35}));
 const darkGlass=keep(new THREE.MeshStandardMaterial({color:0x1a1424,roughness:.25,metalness:.1,envMapIntensity:1}));
 const basaltBody=keep(new THREE.MeshStandardMaterial({map:tex(bas.map,true,2),normalMap:tex(bas.normal,false,2),normalScale:new THREE.Vector2(.18,.18),roughnessMap:tex(bas.rough,false,2),
  roughness:1,metalness:0,envMapIntensity:.9}));
 const stepMat=keep(new THREE.MeshStandardMaterial({map:creamTex,color:0xf1e9da,roughness:.5,metalness:0,envMapIntensity:.5}));
 /* the painted vault is cut to the square bay with clip planes (a sail vault over four arches) */
 const domeMat=keep(new THREE.MeshStandardMaterial({map:domeTex,roughness:.9,metalness:0,side:THREE.BackSide,envMapIntensity:.2,
  clippingPlanes:[new THREE.Plane(new THREE.Vector3(1,0,0),10.6),new THREE.Plane(new THREE.Vector3(-1,0,0),10.6),new THREE.Plane(new THREE.Vector3(0,0,1),7.2),new THREE.Plane(new THREE.Vector3(0,0,-1),15.2)]}));
 const halfMat=keep(new THREE.MeshStandardMaterial({map:halfTex,roughness:.9,metalness:0,side:THREE.BackSide,envMapIntensity:.2}));
 const oculusMat=keep(new THREE.MeshBasicMaterial({color:new THREE.Color(0xe2dcff).multiplyScalar(2.6),fog:false}));
 const oculusSide=keep(new THREE.MeshBasicMaterial({color:new THREE.Color(0xe2dcff).multiplyScalar(2.6),fog:false,side:THREE.DoubleSide}));

 /* ---- environment for reflections: a dim hall with bright violet-white round windows high up ---- */
 function envMap(){const pm=new THREE.PMREMGenerator(renderer);const es=new THREE.Scene();es.background=new THREE.Color(0x2c2638);
  const box=new THREE.Mesh(new THREE.BoxGeometry(40,30,40),new THREE.MeshBasicMaterial({color:0x3a3446,side:THREE.BackSide}));box.position.y=10;es.add(box);
  const flr=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:0x6e6a72}));flr.rotation.x=-Math.PI/2;flr.position.y=-4.9;es.add(flr);
  const win=new THREE.MeshBasicMaterial({color:new THREE.Color(0xe2dcff).multiplyScalar(5)});
  for(let i=0;i<9;i++){const a=(i/8-.5)*Math.PI*.9,m=new THREE.Mesh(new THREE.CircleGeometry(1.1,20),win);m.position.set(Math.sin(a)*14,12,-Math.cos(a)*14);m.lookAt(0,8,0);es.add(m);}
  for(const s of [-1,1])for(const z of [-1,4]){const m=new THREE.Mesh(new THREE.CircleGeometry(1.4,20),win);m.position.set(s*15,14,z);m.lookAt(0,10,z);es.add(m);}
  const rt=pm.fromScene(es,.02);es.traverse(o=>{o.geometry?.dispose();o.material?.dispose?.();});pm.dispose();return keep(rt);}

 /* ---- hall: a square bay (x ±10, z -6.5…14.5) under a sail vault, a nave running back toward the camera ---- */
 const hall=new THREE.Group();scene.add(hall);
 const HX=10,BACK=-6.5,FRONT=14.5,SPRING=9.3,NZ1=40,AX=13.2,R=HX;
 const add=(geo,mat,pos,rot,shadow)=>{const m=new THREE.Mesh(keep(geo),mat);if(pos)m.position.set(...pos);if(rot)m.rotation.set(...rot);if(shadow){m.castShadow=true;m.receiveShadow=true;}hall.add(m);return m;};
 function instanced(geo,mat,list){const m=new THREE.InstancedMesh(keep(geo),mat,list.length);const o=new THREE.Object3D();list.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.rotation.set(p[4]||0,p[3]||0,0);o.updateMatrix();m.setMatrixAt(i,o.matrix);});
  m.instanceMatrix.needsUpdate=true;hall.add(m);return m;}
 /* an arch band (half annulus) in the XY plane, extruded `d` along z, centred on z */
 const archBand=(r0,r1,d)=>{const s=new THREE.Shape();s.moveTo(r1,0);s.absarc(0,0,r1,0,Math.PI,false);s.lineTo(-r0,0);s.absarc(0,0,r0,Math.PI,0,true);s.lineTo(r1,0);
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:48});g.translate(0,0,-d/2);return g;};
 /* a wall w×h (bottom-left at the origin) with round-headed openings {x,y,w,h}, extruded `d` */
 const wallWithArches=(w,h,holes,d)=>{const s=new THREE.Shape();s.moveTo(0,0);s.lineTo(w,0);s.lineTo(w,h);s.lineTo(0,h);s.lineTo(0,0);
  for(const o of holes){const p=new THREE.Path();p.moveTo(o.x,o.y);p.lineTo(o.x+o.w,o.y);p.lineTo(o.x+o.w,o.y+o.h-o.w/2);p.absarc(o.x+o.w/2,o.y+o.h-o.w/2,o.w/2,0,Math.PI,false);p.lineTo(o.x,o.y);s.holes.push(p);}
  return new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:14});};
 /* four great piers at the corners of the bay: cream stone, a black-violet panel, red and orange bands under the cap */
 for(const sx of [-1,1])for(const z of [BACK+.9,FRONT-.4]){add(new THREE.BoxGeometry(2.4,SPRING,2.4),cream,[sx*(HX+.2),SPRING/2,z],null,true);
  add(new THREE.BoxGeometry(1.5,5.2,.06),violet,[sx*(HX+.2),3.6,z+(z<0?1.23:-1.23)]);add(new THREE.BoxGeometry(.06,5.2,1.5),violet,[sx*(HX+.2)-sx*1.23,3.6,z]);
  add(new THREE.BoxGeometry(2.48,.07,2.48),inlayOrange,[sx*(HX+.2),SPRING-1.32,z]);add(new THREE.BoxGeometry(2.46,.12,2.46),inlayRed,[sx*(HX+.2),SPRING-1.18,z]);
  add(new THREE.BoxGeometry(2.8,.36,2.8),creamLight,[sx*(HX+.2),SPRING-.9,z]);add(new THREE.BoxGeometry(3.0,.5,3.0),creamLight,[sx*(HX+.2),SPRING+.25,z]);
  add(new THREE.BoxGeometry(2.6,.5,2.6),violet,[sx*(HX+.2),.25,z]);}
 /* back wall: two tall round-headed windows beside the stele, a carved frieze, a dentil cornice with a red line */
 { const w=2*HX,g=wallWithArches(w,7.2,[{x:1.3,y:1.2,w:1.9,h:5.0},{x:w-3.2,y:1.2,w:1.9,h:5.0}],.8);g.translate(-HX,0,0);add(g,cream,[0,0,BACK-.4]);
   for(const x of [-HX+2.25,HX-2.25]){add(new THREE.PlaneGeometry(1.9,5.0),darkGlass,[x,3.7,BACK-.3]);add(new THREE.BoxGeometry(.1,5,.1),creamLight,[x,3.7,BACK-.28]);add(new THREE.BoxGeometry(1.9,.1,.1),creamLight,[x,3.4,BACK-.28]);}
   add(new THREE.BoxGeometry(w,.5,.84),violet,[0,.25,BACK]);add(new THREE.BoxGeometry(w,.05,.86),inlayOrange,[0,.52,BACK]);
   add(new THREE.BoxGeometry(w,1.3,.9),frieze,[0,7.85,BACK]);add(new THREE.BoxGeometry(w,.08,.95),inlayRed,[0,7.17,BACK]);
   add(new THREE.BoxGeometry(w+.4,.22,1.2),creamLight,[0,8.6,BACK+.1]);
   const dent=[];for(let x=-HX;x<=HX;x+=.42)dent.push([x,8.84,BACK+.55]);instanced(new THREE.BoxGeometry(.22,.26,.3),creamLight,dent);
   add(new THREE.BoxGeometry(w+.8,.36,1.5),creamLight,[0,9.12,BACK+.2]);}
 /* side colonnades under the side arches and down the nave: black-violet marble shafts, cream bases and capitals, an orange collar */
 const colZ=[];for(let z=BACK+2.6;z<NZ1-2;z+=1.7)if(Math.abs(z-(FRONT-.4))>1.6)colZ.push(z);
 const colP=[];for(const z of colZ)for(const sx of [-1,1])colP.push([sx*HX,0,z]);
 instanced(new THREE.BoxGeometry(.85,.32,.85),cream,colP.map(p=>[p[0],.16,p[2]]));
 instanced(new THREE.CylinderGeometry(.36,.4,.18,20),creamLight,colP.map(p=>[p[0],.41,p[2]]));
 instanced(new THREE.CylinderGeometry(.27,.31,5.0,20),violet,colP.map(p=>[p[0],3.0,p[2]]));
 instanced(new THREE.TorusGeometry(.285,.035,6,20).rotateX(Math.PI/2),inlayOrange,colP.map(p=>[p[0],5.45,p[2]]));
 instanced(new THREE.CylinderGeometry(.5,.3,.55,4).rotateY(Math.PI/4),creamLight,colP.map(p=>[p[0],5.77,p[2]]));
 instanced(new THREE.BoxGeometry(.9,.16,.9),creamLight,colP.map(p=>[p[0],6.12,p[2]]));
 /* the arcade wall riding the colonnade, its frieze and cornice */
 for(const sx of [-1,1]){for(const [z0,z1] of [[BACK+1.8,FRONT-1.6],[FRONT+.8,NZ1-1]]){const cz=colZ.filter(z=>z>z0-.01&&z<z1+.01);if(cz.length<2)continue;
   const s=new THREE.Shape(),A=6.2,T=7.2,r=(1.7-.5)/2;
   s.moveTo(cz[0]-.85,T);s.lineTo(cz[0]-.85,A);for(let i=0;i<cz.length;i++){s.lineTo(cz[i]+.25,A);if(i<cz.length-1)s.absarc(cz[i]+.85,A,r*.98,Math.PI,0,true);}
   s.lineTo(cz[cz.length-1]+.85,A);s.lineTo(cz[cz.length-1]+.85,T);s.lineTo(cz[0]-.85,T);
   add(new THREE.ExtrudeGeometry(s,{depth:.7,bevelEnabled:false,curveSegments:16}),cream,[sx*HX+.35,0,0],[0,-Math.PI/2,0]);
   const L=z1-z0+1.6,zc=(z0+z1)/2;
   add(new THREE.BoxGeometry(1.0,1.2,L),frieze,[sx*HX,7.8,zc]);add(new THREE.BoxGeometry(1.04,.07,L),inlayRed,[sx*HX,7.2,zc]);
   add(new THREE.BoxGeometry(1.4,.3,L),creamLight,[sx*HX,8.55,zc]);
   const dent=[];for(let z=z0-.6;z<=z1+.6;z+=.42)dent.push([sx*(HX-.45),8.8,z]);instanced(new THREE.BoxGeometry(.3,.26,.22),creamLight,dent);
   add(new THREE.BoxGeometry(1.6,.34,L),creamLight,[sx*HX,9.1,zc]);}}
 /* aisles behind the colonnades: darker walls with arched niches, low ceilings */
 const aisleMat=keep(new THREE.MeshStandardMaterial({map:creamTex,color:0x7d7470,roughness:.92})),nicheMat=keep(new THREE.MeshStandardMaterial({color:0x140f1a,roughness:.9}));
 for(const sx of [-1,1]){const L=NZ1-BACK,holes=[];for(let z=1.2;z<L-2;z+=3.4)holes.push({x:z,y:.9,w:1.5,h:4.2});
  add(wallWithArches(L,SPRING,holes,.5),aisleMat,[sx*AX+(sx>0?.5:0),0,BACK],[0,-Math.PI/2,0]);
  for(const o of holes)add(new THREE.PlaneGeometry(1.5,4.2),nicheMat,[sx*(AX+.3),3.0,BACK+o.x+.75],[0,-sx*Math.PI/2,0]);
  add(new THREE.BoxGeometry(AX-HX+.8,.4,NZ1-BACK),cream,[sx*(HX+AX)/2,SPRING-.1,(BACK+NZ1)/2]);}
 /* four great arches: the back one opens into the half dome, the side ones hold round windows, the front one leads to the nave.
    Each carries a black-violet soffit and a red edge line. */
 const bigArch=(pos,rot)=>{add(archBand(R-.05,R+.8,1.4),creamLight,pos,rot);add(archBand(R-.08,R+.02,1.0),violet,pos,rot);
  const a=add(archBand(R+.79,R+.86,1.45),inlayRed,pos,rot);return a;};
 bigArch([0,SPRING,BACK]);bigArch([0,SPRING,FRONT]);
 for(const sx of [-1,1]){bigArch([sx*HX,SPRING,(BACK+FRONT)/2],[0,Math.PI/2,0]);
  /* lunette in the side arch with three round windows */
  const s=new THREE.Shape();s.moveTo(-R,0);s.absarc(0,0,R,Math.PI,0,true);s.lineTo(-R,0);
  const holes=[[-3.2,4.2,1.25],[3.2,4.2,1.25],[0,6.8,1.0]];for(const [x,y,r] of holes){const h=new THREE.Path();h.absarc(x,y,r,0,Math.PI*2,true);s.holes.push(h);}
  add(new THREE.ExtrudeGeometry(s,{depth:.5,bevelEnabled:false,curveSegments:40}),cream,[sx<0?-(HX+1.1):HX+.6,SPRING,(BACK+FRONT)/2],[0,Math.PI/2,0]);
  for(const [x,y,r] of holes){add(new THREE.CircleGeometry(r,28),oculusSide,[sx*(HX+.85),SPRING+y,(BACK+FRONT)/2-x],[0,Math.PI/2,0]);
   add(new THREE.TorusGeometry(r+.06,.06,6,32),inlayOrange,[sx*(HX+.55),SPRING+y,(BACK+FRONT)/2-x],[0,Math.PI/2,0]);}}
 /* half dome behind the back arch, a ring of round windows at its foot */
 add(new THREE.CylinderGeometry(R,R,1.6,40,1,true,Math.PI/2,Math.PI),keep(new THREE.MeshStandardMaterial({map:creamTex,roughness:.9,side:THREE.BackSide})),[0,SPRING+.8,BACK]);
 add(new THREE.SphereGeometry(R,48,20,Math.PI,Math.PI,0,Math.PI/2),halfMat,[0,SPRING+1.6,BACK]);
 /* the ring of round windows sits on the curve of the half dome, high enough to be seen over the back wall */
 { const N=7,el=.42,rr=(R-.08)*Math.cos(el),yy=SPRING+1.6+(R-.08)*Math.sin(el);for(let i=0;i<N;i++){const a=Math.PI/2+(i+.5)/N*Math.PI,x=Math.sin(a)*rr,z=BACK+Math.cos(a)*rr;
   const c=add(new THREE.CircleGeometry(.78,28),oculusMat,[x,yy,z]);c.lookAt(0,SPRING+1.6,BACK);const f=add(new THREE.TorusGeometry(.84,.06,6,32),inlayOrange,[x,yy,z]);f.lookAt(0,SPRING+1.6,BACK);}}
 /* sail vault over the bay: one sphere through the four arch crowns, clipped to the square, painted */
 add(new THREE.SphereGeometry(Math.hypot(HX,10.5),64,32,0,Math.PI*2,0,Math.PI/2),domeMat,[0,SPRING,(BACK+FRONT)/2]);
 /* nave vault toward the camera, ribbed */
 add(new THREE.CylinderGeometry(R+.6,R+.6,NZ1-FRONT,48,1,true,-Math.PI/2,Math.PI).rotateX(-Math.PI/2),keep(new THREE.MeshStandardMaterial({map:halfTex,roughness:.92,side:THREE.BackSide,color:0xc8c0b8})),[0,SPRING,(FRONT+NZ1)/2]);
 { const ribs=[];for(let z=FRONT+3.4;z<NZ1;z+=3.4)ribs.push([0,SPRING,z]);instanced(new THREE.TorusGeometry(R+.5,.16,6,40,Math.PI),violet,ribs);}
 add(new THREE.BoxGeometry(2*AX+1,26,.8),cream,[0,13,NZ1]);

 /* ---- floor: mirror under a polished pale marble skin (light tier: the skin alone) ---- */
 const FL_W=2*AX+1,FL_Z0=BACK-1,FL_L=NZ1-FL_Z0,FL_Z=(FL_Z0+NZ1)/2;
 const floorMat=keep(new THREE.MeshStandardMaterial({map:tex(fl.map,true,1),roughnessMap:tex(fl.rough,false,1),roughness:.42,metalness:0,envMapIntensity:.5}));
 floorMat.map.repeat.set(FL_W/8,FL_L/8);floorMat.roughnessMap.repeat.set(FL_W/8,FL_L/8);
 const floor=add(new THREE.PlaneGeometry(FL_W,FL_L),floorMat,[0,0,FL_Z],[-Math.PI/2,0,0]);floor.receiveShadow=true;floor.renderOrder=-2;
 const skipInMirror=[];skipInMirror.push(floor);
 /* a black-violet runner with red edging leads up the nave to the stair */
 { const run=add(new THREE.PlaneGeometry(3.2,NZ1-4.4),keep(new THREE.MeshStandardMaterial({color:0x22172c,roughness:.96,metalness:0,envMapIntensity:.1})),[0,.004,(4.4+NZ1)/2],[-Math.PI/2,0,0]);run.receiveShadow=true;skipInMirror.push(run);
   for(const sx of [-1,1]){const e=add(new THREE.PlaneGeometry(.08,NZ1-4.4),inlayRed,[sx*1.66,.005,(4.4+NZ1)/2],[-Math.PI/2,0,0]);skipInMirror.push(e);}}

 /* ---- the stele: a long black slab on two square posts, a wide low stair in front ---- */
 const stele=new THREE.Group();scene.add(stele);
 const STEP_N=7,STEP_H=.085,SW=12.6,SH=3.2,SD=.44,POST_Y=STEP_N*STEP_H,BASE_Y=1.75;
 for(let i=0;i<STEP_N;i++){const w=15.6-i*.12,front=3.6-i*.36,back=-.9,d=front-back;const m=new THREE.Mesh(keep(new THREE.BoxGeometry(w,STEP_H,d)),stepMat);
  m.position.set(0,STEP_H*i+STEP_H/2,back+d/2);m.receiveShadow=true;m.castShadow=i===STEP_N-1;stele.add(m);}
 { const nose=new THREE.Mesh(keep(new THREE.BoxGeometry(15.62,.02,.04)),inlayOrange);nose.position.set(0,STEP_H-.01,3.62);stele.add(nose);}
 for(const sx of [-1,1]){const p=new THREE.Mesh(keep(new THREE.BoxGeometry(1.35,BASE_Y-POST_Y,.78)),stepMat);p.position.set(sx*3.7,POST_Y+(BASE_Y-POST_Y)/2,0);p.castShadow=p.receiveShadow=true;stele.add(p);
  const band=new THREE.Mesh(keep(new THREE.BoxGeometry(1.39,.06,.82)),inlayRed);band.position.set(sx*3.7,BASE_Y-.14,0);stele.add(band);}
 function slabGeo(w,h,d,b){const s=new THREE.Shape();s.moveTo(-w/2+b,-h/2);s.lineTo(w/2-b,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+b);s.lineTo(w/2,h/2-b);s.quadraticCurveTo(w/2,h/2,w/2-b,h/2);
  s.lineTo(-w/2+b,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-b);s.lineTo(-w/2,-h/2+b);s.quadraticCurveTo(-w/2,-h/2,-w/2+b,-h/2);
  const g=new THREE.ExtrudeGeometry(s,{depth:d-.06,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:3,curveSegments:6});g.translate(0,0,-(d-.06)/2);return g;}
 const slab=new THREE.Mesh(keep(slabGeo(SW,SH,SD,.04)),basaltBody);slab.position.set(0,BASE_Y+SH/2,0);slab.castShadow=slab.receiveShadow=true;stele.add(slab);
 /* inscription surface: its own maps, redrawn per page */
 const LOW=tier==='low',FS=()=>tier==='low'?.5:1;
 const faceW=SW-.3,faceH=faceW*FH/FW,faceY=slab.position.y;
 const faces={map:canvas2d(FW,FH),emissive:canvas2d(FW,FH),rough:canvas2d(FW,FH),mask:canvas2d(FW,FH),t1:canvas2d(FW,FH),t2:canvas2d(FW,FH),base:null,baseR:null,scale:1};
 const faceMat=keep(new THREE.MeshStandardMaterial({roughness:1,metalness:0,envMapIntensity:1.0,emissive:0xffffff,emissiveIntensity:1,
  normalMap:basaltBody.normalMap,normalScale:new THREE.Vector2(.12,.12)}));
 const faceTex={map:keep(new THREE.CanvasTexture(faces.map)),emissive:keep(new THREE.CanvasTexture(faces.emissive)),rough:keep(new THREE.CanvasTexture(faces.rough))};
 faceTex.map.colorSpace=faceTex.emissive.colorSpace=THREE.SRGBColorSpace;for(const k in faceTex){faceTex[k].anisotropy=8;faceTex[k].generateMipmaps=true;}
 faceMat.map=faceTex.map;faceMat.emissiveMap=faceTex.emissive;faceMat.roughnessMap=faceTex.rough;
 const face=new THREE.Mesh(keep(new THREE.PlaneGeometry(faceW,faceH)),faceMat);face.position.set(0,faceY,SD/2+.002);face.receiveShadow=true;stele.add(face);
 /* glow for the entry being looked for */
 const glowTex=tex(glowSprite(256),true);
 const glow=new THREE.Mesh(keep(new THREE.PlaneGeometry(1,1)),keep(new THREE.MeshBasicMaterial({map:glowTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false})));
 glow.position.set(0,faceY,SD/2+.03);glow.renderOrder=5;stele.add(glow);
 const glowLight=new THREE.PointLight(0xbfe0ff,0,3.2,2);glowLight.position.set(0,faceY,SD/2+.6);stele.add(glowLight);

 function ensureFaceSize(){const k=FS();if(faces.scale===k&&faces.base)return;faces.scale=k;const w=Math.round(FW*k),h=Math.round(FH*k);
  for(const n of ['map','emissive','rough','mask','t1','t2']){faces[n].width=w;faces[n].height=h;}
  /* polished basalt under the letters: grain from the basalt tile, a soft sheen from top */
  const b=canvas2d(w,h),g=b.getContext('2d');g.fillStyle='#08090b';g.fillRect(0,0,w,h);g.globalAlpha=.9;const pat=g.createPattern(bas.map,'repeat');g.fillStyle=pat;g.fillRect(0,0,w,h);g.globalAlpha=1;
  const sh=g.createLinearGradient(0,0,0,h);sh.addColorStop(0,'rgba(120,140,165,.05)');sh.addColorStop(.5,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,.25)');g.fillStyle=sh;g.fillRect(0,0,w,h);
  const r=canvas2d(w,h),rg=r.getContext('2d');rg.fillStyle=rg.createPattern(bas.rough,'repeat');rg.fillRect(0,0,w,h);
  faces.base=b;faces.baseR=r;faceTex.map.dispose();faceTex.emissive.dispose();faceTex.rough.dispose();}

 /* vertical text: CJK upright, Latin runs turned 90° like tategaki */
 function vText(g,s,cx,y,px,adv,fill){g.font=px+'px '+FONT;g.textAlign='center';g.textBaseline='middle';let yy=y;
  for(const r of ((str)=>{const out=[];for(const ch of str){const latin=/[ -~ -ɏ]/.test(ch);const last=out[out.length-1];if(last&&last.latin===latin)last.text+=ch;else out.push({latin,text:ch});}return out;})(s)){
   if(r.latin){const w=g.measureText(r.text).width;g.save();g.translate(cx,yy+w/2+px*.09);g.rotate(Math.PI/2);if(fill)g.fillStyle=fill;g.fillText(r.text,0,0);g.restore();yy+=w+px*.18;}
   else for(const ch of r.text){if(fill)g.fillStyle=fill;if(/[ー〜～…‥]/.test(ch)){g.save();g.translate(cx,yy+adv/2);g.rotate(Math.PI/2);g.fillText(ch,0,0);g.restore();}
    else if(/[、。，．]/.test(ch))g.fillText(ch,cx+px*.32,yy+adv/2-px*.3);else g.fillText(ch,cx,yy+adv/2);yy+=adv;}}
  return yy-y;}
 /* everything carved goes through `glyphs(g,colorFor)`: the same call fills the mask and the glow layer */
 function glyphs(g,colorFor){const L=state.layout;if(!L)return;
  /* month band */
  const band=bandItems();g.textAlign='center';g.textBaseline='middle';
  if(!band.length){const c=colorFor({title:true});if(c){g.fillStyle=c;g.font='54px '+FONT;if('letterSpacing' in g)g.letterSpacing='24px';g.fillText(t.title,FW/2+12,(BAND_Y0+BAND_Y1)/2+4);if('letterSpacing' in g)g.letterSpacing='0px';}}
  for(const b of band){const c=colorFor({band:b});if(!c)continue;g.fillStyle=c;
   if(b.kind==='shift'){g.font='40px '+FONT;g.fillText(b.dir<0?'‹':'›',b.x,(BAND_Y0+BAND_Y1)/2);continue;}
   g.fillRect(b.x-2,BAND_Y1-10,4,14);g.font=(b.active?'600 42px ':'38px ')+FONT;g.fillText(b.label,b.x,BAND_Y0+30);
   if(b.sub){g.font='20px '+FONT;g.fillText(b.sub,b.x,BAND_Y0+68);}}
  const rc=colorFor({rule:true});if(rc){g.fillStyle=rc;g.fillRect(AREA_X0,RULE_Y,AREA_X1-AREA_X0,3);g.fillRect(AREA_X0,RULE_Y+10,AREA_X1-AREA_X0,1.2);}
  if(!L.entries.length){const c=colorFor({empty:true});if(c&&!state.loading&&!state.offline){vText(g,t.empty,FW/2,(AREA_Y0+AREA_Y1)/2-verticalLen(t.empty,84,88)/2,84,88,c);}return;}
  for(const e of L.entries){const c=colorFor({entry:e});if(!c)continue;const cx=e.x+26;
   vText(g,e.box.name,cx,e.y,e.box.px,e.box.adv,c);
   if(e.box.side)vText(g,e.box.side,e.x+55,e.y+3,SIDE_PX,SIDE_ADV,c);
   g.font=DATE_PX+'px '+FONT;g.textAlign='center';g.textBaseline='middle';g.fillStyle=c;g.fillText(dateShort(e.item.at),e.x+30,e.y+Math.max(e.box.len,e.box.sideLen)+13);}}
 const verticalLen=(s,px,adv)=>{const c=faces.t1.getContext('2d');c.font=px+'px '+FONT;let len=0;for(const ch of s)len+=/[ -~]/.test(ch)?c.measureText(ch).width:adv;return len;};
 const dateShort=at=>{if(!at)return '';const d=new Date(at*1000);return String(d.getMonth()+1).padStart(2,'0')+'·'+String(d.getDate()).padStart(2,'0');};
 function bandItems(){const out=[];if(!state.monthsOn||!state.months.length){state.band=out;return out;}const list=state.months,win=state.bandWindow,shown=list.slice(win,win+12);
  const xs=AREA_X0+120,xe=AREA_X1-120,slots=shown.length+1,stepX=Math.min(300,(xe-xs)/Math.max(1,slots));
  const start=(AREA_X0+AREA_X1)/2-stepX*(slots-1)/2;
  out.push({kind:'month',month:'',label:t.all,sub:'',x:start,active:!state.month,w:stepX});
  shown.forEach((m,i)=>out.push({kind:'month',month:m.month,label:m.month.replace('-','.'),sub:String(m.n),x:start+stepX*(i+1),active:state.month===m.month,w:stepX}));
  if(win>0)out.push({kind:'shift',dir:-1,x:AREA_X0+30,w:80});if(win+12<list.length)out.push({kind:'shift',dir:1,x:AREA_X1-30,w:80});
  state.band=out;return out;}
 const mineSet=()=>new Set(state.mine.map(m=>m.torchNo));
 function paintFace(){ensureFaceSize();const k=faces.scale,w=faces.map.width,h=faces.map.height;const mine=mineSet();
  const prep=c=>{const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-over';g.globalAlpha=1;g.clearRect(0,0,w,h);g.setTransform(k,0,0,k,0,0);return g;};
  /* mask: every glyph in white */
  const gm=prep(faces.mask);glyphs(gm,()=>'#fff');
  const flat=(c,color)=>{const g=c.getContext('2d');g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,w,h);g.globalCompositeOperation='source-over';};
  const sh=Math.max(1,Math.round(4*k));
  /* albedo: polished stone + carved letters (dark upper wall, lit lower lip, matte grey floor of the cut) */
  const gA=faces.map.getContext('2d');gA.setTransform(1,0,0,1,0,0);gA.globalCompositeOperation='source-over';gA.drawImage(faces.base,0,0);
  const g1=prep(faces.t1);g1.setTransform(1,0,0,1,0,0);g1.drawImage(faces.mask,0,0);flat(faces.t1,'#020203');gA.drawImage(faces.t1,0,0);
  const g2=prep(faces.t2);g2.setTransform(1,0,0,1,0,0);g2.drawImage(faces.mask,0,sh);g2.globalCompositeOperation='destination-in';g2.drawImage(faces.mask,0,0);g2.globalCompositeOperation='source-over';
  flat(faces.t2,'#6f7c8b');gA.drawImage(faces.t2,0,0);
  g2.setTransform(1,0,0,1,0,0);g2.clearRect(0,0,w,h);g2.drawImage(faces.mask,0,sh);g2.globalCompositeOperation='destination-in';g2.drawImage(faces.mask,0,0);g2.drawImage(faces.mask,0,-Math.max(1,Math.round(2*k)));
  g2.globalCompositeOperation='source-over';flat(faces.t2,'#39424d');gA.drawImage(faces.t2,0,0);
  /* roughness: polished stone, matte cuts */
  const gR=faces.rough.getContext('2d');gR.setTransform(1,0,0,1,0,0);gR.drawImage(faces.baseR,0,0);g1.setTransform(1,0,0,1,0,0);g1.clearRect(0,0,w,h);g1.drawImage(faces.mask,0,0);flat(faces.t1,'#d4d4d4');gR.drawImage(faces.t1,0,0);
  /* glow: faint cold light in every cut, brighter for this PC's names and the one looked for */
  const gE=faces.emissive.getContext('2d');gE.setTransform(1,0,0,1,0,0);gE.fillStyle='#000';gE.fillRect(0,0,w,h);g1.setTransform(1,0,0,1,0,0);g1.clearRect(0,0,w,h);g1.drawImage(faces.mask,0,sh>>1);
  g1.globalCompositeOperation='destination-in';g1.drawImage(faces.mask,0,0);flat(faces.t1,'#4d7398');gE.drawImage(faces.t1,0,0);
  gE.setTransform(k,0,0,k,0,0);
  glyphs(gE,o=>{if(o.entry){const n=o.entry.item.torchNo;if(n===state.focusNo)return '#f2f8ff';if(mine.has(n))return '#7fa9d6';return null;}
   if(o.band){if(o.band.active)return '#9cc4ee';if(state.hoverMonth&&o.band.kind===state.hoverMonth.kind&&o.band.month===state.hoverMonth.month&&o.band.dir===state.hoverMonth.dir)return '#5f87b0';return null;}
   return null;});
  gE.setTransform(1,0,0,1,0,0);
  faceTex.map.needsUpdate=faceTex.emissive.needsUpdate=faceTex.rough.needsUpdate=true;placeGlow();}
 let paintQueued=0,lastHoverKey='';
 function queuePaint(){if(paintQueued)return;paintQueued=requestAnimationFrame(()=>{paintQueued=0;paintFace();if(!active)draw();});}
 function placeGlow(){const e=state.layout?.entries.find(x=>x.item.torchNo===state.focusNo);if(!e){glow.userData.on=false;return;}
  const cx=e.x+38,cy=e.y+Math.max(e.box.len,e.box.sideLen)/2+6,u=cx/FW,v=cy/FH;glow.position.x=(u-.5)*faceW;glow.position.y=faceY+(.5-v)*faceH;
  glow.scale.set(COL_W/FW*faceW*2.2,(e.box.len+80)/FH*faceH*1.35,1);glow.userData.on=true;glow.userData.t0=performance.now();
  glowLight.position.set(glow.position.x,glow.position.y,SD/2+.5);glow.userData.world=new THREE.Vector3(glow.position.x,glow.position.y,0);}

 /* ---- light: cool violet daylight from the round windows; faint parallel shafts from the side lunettes; dust ---- */
 scene.add(keep(new THREE.HemisphereLight(0xb4aaf0,0x2a2430,.42)));
 const amb=new THREE.AmbientLight(0x6c64a0,.12);scene.add(amb);
 /* daylight through the half dome behind the stele: throws the slab's soft shadow forward onto the stair */
 const sky=new THREE.DirectionalLight(0xcfc4ff,1.05);sky.position.set(1.5,20,-16);sky.target.position.set(0,0,4);scene.add(sky);scene.add(sky.target);
 { const sc=sky.shadow.camera;sc.left=-14;sc.right=14;sc.top=14;sc.bottom=-14;sc.near=1;sc.far=50;}
 /* a soft fill from the nave so the face of the stone is never pitch black */
 const fill=new THREE.DirectionalLight(0x9088c8,.16);fill.position.set(-4,8,24);scene.add(fill);
 const beams=new THREE.Group();scene.add(beams);
 const beamMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,
  uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0xd2caf8)},uStrength:{value:1},uGain:{value:1}},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime;uniform vec3 uColor;uniform float uStrength;uniform float uGain;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   void main(){float edge=abs(dot(normalize(vN),normalize(vV)));edge=pow(edge,3.2);
    float along=vUv.y;float fade=smoothstep(0.,.3,along)*smoothstep(1.,.7,along);
    float streak=.82+.18*n(vec2(vUv.x*14.,along*1.2-uTime*.02))+.06*n(vec2(vUv.x*48.,along*4.+uTime*.04));
    float floorFade=smoothstep(-.4,2.6,vW.y);
    float a=edge*fade*streak*floorFade*.3*uStrength*uGain;gl_FragColor=vec4(uColor*a,a);}`}));
 /* the side lunettes' round windows: two light directions (left and right), parallel within each side */
 const SHAFTS=[];
 for(const sx of [-1,1]){const dir=new THREE.Vector3(-sx*.62,-1,.22).normalize();
  for(const [x,y,w,str] of [[-3.2,4.2,1.15,.9],[3.2,4.2,1.15,.75],[0,6.8,.95,.6]]){const from=new THREE.Vector3(sx*(HX+.9),SPRING+y,(BACK+FRONT)/2-x);const k=from.y/-dir.y;
   SHAFTS.push([dir,from,from.clone().addScaledVector(dir,k),w,str]);}}
 const pools=[];
 const poolTex=tex(glowSprite(256,'rgba(222,214,255,.8)'),true);
 for(const [dir,from,to,w,str] of SHAFTS){const len=from.distanceTo(to);
  const g=new THREE.CylinderGeometry(w*.9,w*1.15,len,32,1,true);g.translate(0,-len/2,0);
  const m=new THREE.Mesh(keep(g),beamMat.clone());keep(m.material);m.material.uniforms.uStrength.value=str;m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir);m.renderOrder=3;beams.add(m);
  const pool=new THREE.Mesh(keep(new THREE.PlaneGeometry(w*2.4,w*2.4/Math.max(.4,-dir.y))),keep(new THREE.MeshBasicMaterial({map:poolTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.12*str,fog:false})));
  pool.rotation.x=-Math.PI/2;pool.rotation.z=-Math.atan2(dir.x,dir.z);pool.position.set(to.x,.012,to.z);pool.renderOrder=2;scene.add(pool);pools.push(pool);skipInMirror.push(pool);}
 /* the light those windows carry */
 const spots=[];
 for(const i of [0,3]){const [dir,from]=SHAFTS[i];const s=new THREE.SpotLight(0xd2c8ff,320,40,.3,1,1.4);s.position.copy(from);s.target.position.copy(from.clone().addScaledVector(dir,14));scene.add(s);scene.add(s.target);spots.push(s);}
 /* dust */
 let dust=null;
 function makeDust(n){const pos=new Float32Array(n*3),seed=new Float32Array(n),lit=new Float32Array(n),r=rng(91);
  const shafts=SHAFTS.map(([,a,b])=>({a,b}));
  for(let i=0;i<n;i++){let p;if(i<n*.6){const s=shafts[Math.floor(r()*shafts.length)],k=.25+r()*.7;p=s.a.clone().lerp(s.b,k);p.x+=(r()-.5)*1.6*k;p.z+=(r()-.5)*1.6*k;p.y+=(r()-.5)*.6;lit[i]=1;}
   else{p=new THREE.Vector3((r()-.5)*HX*2,r()*14,-6+r()*34);lit[i]=.3;}
   pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;seed[i]=r();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aLit',new THREE.BufferAttribute(lit,1));
  const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:{uTime:{value:0},uScale:{value:1},uSpeed:{value:reduced?.25:1}},
   vertexShader:`uniform float uTime;uniform float uScale;uniform float uSpeed;attribute float aSeed;attribute float aLit;varying float vA;
    void main(){vec3 p=position;float t=uTime*uSpeed;p.x+=sin(t*.11+aSeed*40.)*.35;p.y+=sin(t*.07+aSeed*17.)*.45-mod(t*.03+aSeed*3.,1.)*.25;p.z+=cos(t*.09+aSeed*29.)*.35;
     vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float tw=.55+.45*sin(t*(.6+aSeed)+aSeed*60.);
     vA=aLit*tw*smoothstep(28.,6.,-mv.z)*smoothstep(1.2,4.5,-mv.z);gl_PointSize=uScale*(.8+aSeed*1.6)*(8./-mv.z);}`,
   fragmentShader:`varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;float a=smoothstep(.5,0.,d)*vA*.5;gl_FragColor=vec4(vec3(.86,.84,1.)*a,a);}`});
  keep(g);keep(m);const p=new THREE.Points(g,m);p.renderOrder=4;p.frustumCulled=false;return p;}

 /* ---- renderer & tiers ---- */
 function makeRenderer(){renderer=new THREE.WebGLRenderer({canvas,antialias:tier!=='low',powerPreference:tier==='low'?'low-power':'high-performance',stencil:false});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.localClippingEnabled=true;renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=tier!=='low';renderer.shadowMap.type=THREE.PCFSoftShadowMap;}
 makeRenderer();
 let env=envMap();scene.environment=env.texture;
 function applyTier(){const low=tier==='low';
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?.75:1.5));renderer.shadowMap.enabled=!low;
  sky.castShadow=!low;if(!low){sky.shadow.mapSize.set(2048,2048);sky.shadow.bias=-.0004;sky.shadow.normalBias=.02;sky.shadow.radius=6;}
  /* floor: mirror + translucent marble, or the marble alone */
  if(reflector){scene.remove(reflector);reflector.getRenderTarget().dispose();reflector.material.dispose();reflector=null;}
  if(!low){const s=host.getBoundingClientRect();reflector=new Reflector(new THREE.PlaneGeometry(FL_W,FL_L),{clipBias:.003,textureWidth:Math.max(256,s.width*.6),textureHeight:Math.max(256,s.height*.6),color:0xb4b0c4,multisample:0});
   keep(reflector.geometry);reflector.rotation.x=-Math.PI/2;reflector.position.set(0,-.001,FL_Z);reflector.renderOrder=-3;scene.add(reflector);
   const before=reflector.onBeforeRender;reflector.onBeforeRender=function(...a){const v=skipInMirror.map(o=>o.visible);skipInMirror.forEach(o=>o.visible=false);
    before.apply(this,a);skipInMirror.forEach((o,i)=>o.visible=v[i]);};
   floorMat.transparent=true;floorMat.opacity=.7;floorMat.depthWrite=true;}
  else{floorMat.transparent=false;floorMat.opacity=1;}
  floorMat.needsUpdate=true;
  beams.children.forEach(b=>b.material.uniforms.uGain.value=low?1.6:1);
  if(dust){scene.remove(dust);}dust=makeDust(low?700:2400);scene.add(dust);
  if(composer){composer.dispose();composer.renderTarget1.dispose();composer.renderTarget2.dispose();bloom?.dispose();composer=null;bloom=null;}
  if(!low){composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));bloom=new UnrealBloomPass(new THREE.Vector2(512,512),.55,.7,.82);composer.addPass(bloom);composer.addPass(new OutputPass());}
  resize();queuePaint();}

 /* ---- view ---- */
 function resize(){const r=host.getBoundingClientRect();const w=Math.max(2,Math.round(r.width)),h=Math.max(2,Math.round(r.height));renderer.setSize(w,h,false);
  camera.aspect=w/h;camera.fov=w/h<1.45?52:44;camera.updateProjectionMatrix();
  if(composer){composer.setSize(w,h);}
  if(reflector){const pr=renderer.getPixelRatio();reflector.getRenderTarget().setSize(Math.round(w*pr*.6),Math.round(h*pr*.6));}
  if(dust)dust.material.uniforms.uScale.value=h/700*renderer.getPixelRatio();if(!active)draw();}
 const pointer={x:0,y:0,down:false,sx:0,sy:0,yaw0:0,pitch0:0,moved:0};
 const onMove=e=>{const r=host.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=((e.clientY-r.top)/r.height)*2-1;
  if(pointer.down){const dx=(e.clientX-pointer.sx)/r.width,dy=(e.clientY-pointer.sy)/r.height;pointer.moved=Math.max(pointer.moved,Math.abs(dx)+Math.abs(dy));
   view.dragYaw=THREE.MathUtils.clamp(pointer.yaw0+dx*.9,-.26,.26);view.dragPitch=THREE.MathUtils.clamp(pointer.pitch0+dy*.5,-.09,.12);}};
 const onDown=e=>{if(e.button!==0)return;pointer.down=true;pointer.moved=0;pointer.sx=e.clientX;pointer.sy=e.clientY;pointer.yaw0=view.dragYaw;pointer.pitch0=view.dragPitch;dragMoved=false;canvas.setPointerCapture?.(e.pointerId);};
 const onUp=e=>{pointer.down=false;dragMoved=pointer.moved>.012;canvas.releasePointerCapture?.(e.pointerId);};
 canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function pick(x,y){const r=canvas.getBoundingClientRect();ndc.set(((x-r.left)/r.width)*2-1,-((y-r.top)/r.height)*2+1);ray.setFromCamera(ndc,camera);
  const hit=ray.intersectObject(face,false)[0];if(!hit||!hit.uv)return null;const point=stele.worldToLocal(hit.point.clone());const lx=hit.uv.x*FW,ly=(1-hit.uv.y)*FH;
  if(ly<RULE_Y){const b=(state.band||[]).find(b=>Math.abs(lx-b.x)<b.w/2);if(b){const key=b.kind+b.month+b.dir;if(key!==lastHoverKey){lastHoverKey=key;state.hoverMonth=b;queuePaint();}}else if(lastHoverKey){lastHoverKey='';state.hoverMonth=null;queuePaint();}return b?{band:b}:null;}
  if(lastHoverKey){lastHoverKey='';state.hoverMonth=null;queuePaint();}
  const e=state.layout?.entries.find(e=>lx>=e.x&&lx<e.x+COL_W&&ly>=e.y-6&&ly<e.y+e.box.h);return {entry:e||null,point};}

 /* intro: a slow push from the far end of the nave to the foot of the stone */
 const INTRO=reduced?0:7.2;let introT=reduced?1:0,introStart=0;
 function intro(){if(reduced){introT=1;introDone=true;return;}introStart=performance.now();
  if(gsap){const o={t:0};gsap.to(o,{t:1,duration:INTRO,ease:'power2.inOut',onUpdate:()=>{introT=o.t;},onComplete:()=>{introDone=true;}});}}
 const ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
 const tmpDir=new THREE.Vector3(),tmpPos=new THREE.Vector3(),eul=new THREE.Euler(0,0,0,'YXZ');
 function updateCamera(dt){if(!gsap&&!introDone&&introStart){introT=Math.min(1,(performance.now()-introStart)/1000/INTRO);if(introT>=1)introDone=true;}
  const k=gsap?introT:ease(introT);
  view.pos.lerpVectors(START.pos,END.pos,k);view.pos.y+=Math.sin(k*Math.PI)*.5;view.look.lerpVectors(START.look,END.look,k);
  if(view.read&&introDone){const r=view.read;view.pos.set(THREE.MathUtils.clamp(r.x*.92,-5,5),THREE.MathUtils.clamp(r.y+.05,2.2,4.4),5.2);view.look.set(r.x,r.y,0);}
  const settle=introDone?1:Math.max(0,(k-.7)/.3);
  view.yawT=-pointer.x*.06*settle+view.dragYaw;view.pitchT=-pointer.y*.035*settle-view.dragPitch;view.pxT=pointer.x*.3*settle;
  const a=1-Math.exp(-dt*2.6);view.yaw+=(view.yawT-view.yaw)*a;view.pitch+=(view.pitchT-view.pitch)*a;view.px+=(view.pxT-view.px)*a;
  if(view.smoothPos){view.smoothPos.lerp(view.pos,1-Math.exp(-dt*2.2));view.smoothLook.lerp(view.look,1-Math.exp(-dt*2.2));}else{view.smoothPos=view.pos.clone();view.smoothLook=view.look.clone();}
  camera.position.copy(view.smoothPos);camera.position.x+=view.px;
  tmpDir.copy(view.smoothLook).sub(view.smoothPos).normalize();eul.set(view.pitch,view.yaw,0);tmpDir.applyEuler(eul);camera.lookAt(tmpPos.copy(camera.position).add(tmpDir));}
 function lookAtFocus(){placeGlow();if(glow.userData.on&&glow.userData.world)view.read=glow.userData.world.clone();}
 function setRead(p){view.read=p?new THREE.Vector3(THREE.MathUtils.clamp(p.x,-5.2,5.2),THREE.MathUtils.clamp(p.y,2.2,4.6),0):null;}

 /* ---- loop ---- */
 function draw(){if(composer)composer.render();else renderer.render(scene,camera);}
 function frame(now){raf=0;if(!active)return;const dt=Math.min(.1,(now-last)/1000);last=now;
  if(tier==='low'&&now-(frame.lastDraw||0)<31){raf=requestAnimationFrame(frame);return;}frame.lastDraw=now;
  const time=now/1000;beamMat.uniforms.uTime.value=time;beams.children.forEach(b=>b.material.uniforms.uTime.value=time);if(dust)dust.material.uniforms.uTime.value=time;
  if(glow.userData.on){const p=(now-glow.userData.t0)/1000;const o=Math.min(1,p/1.2)*(.42+.1*Math.sin(p*1.6));glow.material.opacity=o;glowLight.intensity=o*2.2;}else{glow.material.opacity*=.9;glowLight.intensity*=.9;}
  updateCamera(dt);draw();
  /* slow frames on the full tier for ~3 s after the intro: switch to the light tier (only in auto mode) */
  if(introDone&&tier==='high'&&autoTier){frames++;if(dt>.045)slow++;if(frames>=180){if(slow>120){setTier('low',true);}frames=0;slow=0;}}
  raf=requestAnimationFrame(frame);}
 let autoTier=(()=>{try{return !localStorage.getItem(QUALITY_KEY)||localStorage.getItem(QUALITY_KEY)==='auto';}catch{return true;}})();
 function setActive(on){if(disposed)return;active=!!on;if(active&&!raf){last=performance.now();raf=requestAnimationFrame(frame);}if(!active&&raf){cancelAnimationFrame(raf);raf=0;}}
 function setTier(next,auto=false){if(next===tier)return;tier=next;if(!auto)autoTier=false;applyTier();scene.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(m=>m.needsUpdate=true);});onTier?.();}
 let disposed=false;
 function dispose(){disposed=true;active=false;if(raf)cancelAnimationFrame(raf);raf=0;if(paintQueued)cancelAnimationFrame(paintQueued);
  canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);
  if(composer){composer.renderTarget1.dispose();composer.renderTarget2.dispose();composer.passes.forEach(p=>p.dispose?.());composer.dispose?.();}
  if(reflector){reflector.getRenderTarget().dispose();reflector.material.dispose();}
  if(dust){dust.geometry.dispose();dust.material.dispose();}
  scene.traverse(o=>{if(o.isMesh||o.isPoints||o.isInstancedMesh){o.geometry?.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(!m)return;for(const k in m){const v=m[k];if(v&&v.isTexture)v.dispose();}m.dispose();});}
   if(o.isLight&&o.shadow?.map)o.shadow.map.dispose();});
  for(const o of bag){try{o.dispose?.();}catch{}}bag.clear();
  for(const k of ['map','emissive','rough','mask','t1','t2']){faces[k].width=faces[k].height=1;}
  renderer.renderLists.dispose();renderer.dispose();renderer.forceContextLoss();}

 applyTier();paintFace();setActive(true);
 return {get tier(){return tier;},introSeconds:INTRO,intro,setActive,setTier,resize,pick,dispose,paintFace:()=>queuePaint(),lookAtFocus,setRead,reading:()=>!!view.read,dragged:()=>dragMoved,debug:{renderer,scene,camera}};
}
