import {activityCells} from './learning-activity.js';

const copy={
 zh:{coverHint:'单击查看详情 · 双击抽卡',search:'搜索作品',read:'今日阅读',words:'收录单词',lookups:'查词',full:'完整统计',play:'继续游玩',detail:'作品详情',all:'全部作品',edit:'选择首页展示的作品',title:'首页展示的作品',sub:'拖动排序 · 置顶 · 隐藏',auto:'按最近游玩',pick:'只放我挑的',pin:'置顶',hide:'隐藏',close:'关闭',hintAuto:'按最近游玩自动轮播；置顶的永远在最前，隐藏的不出现。',hintPick:'只轮播这里的顺序；一个都不剩时回到最近游玩。',chars:'字',linked:'词',total:'累计',activity:'学习活动',days:'天',min:'分',empty:'还没有作品',add:'添加游戏'},
 ja:{coverHint:'クリックで詳細 · ダブルクリックでガチャ',search:'作品を検索',read:'今日の読書',words:'収録単語',lookups:'辞書引き',full:'統計をすべて見る',play:'続きをプレイ',detail:'作品詳細',all:'すべての作品',edit:'ホームに表示する作品を選ぶ',title:'ホームに表示する作品',sub:'ドラッグで並べ替え · 固定 · 非表示',auto:'最近プレイ順',pick:'選んだ作品だけ',pin:'固定',hide:'非表示',close:'閉じる',hintAuto:'最近プレイ順に切り替わります。固定は常に先頭、非表示は出ません。',hintPick:'この順番だけで切り替えます。残りがなければ最近プレイ順に戻ります。',chars:'字',linked:'語',total:'累計',activity:'学習の記録',days:'日',min:'分',empty:'作品がまだありません',add:'ゲームを追加'},
 en:{coverHint:'Click for details · double-click to draw',search:'Search games',read:'Read today',words:'Words saved',lookups:'Lookups',full:'Full statistics',play:'Continue',detail:'Details',all:'All games',edit:'Choose games for the home screen',title:'Games on the home screen',sub:'Drag to reorder · pin · hide',auto:'Recently played',pick:'Only my picks',pin:'Pin',hide:'Hide',close:'Close',hintAuto:'Cycles through recently played games; pinned ones lead, hidden ones never show.',hintPick:'Cycles through this order only; falls back to recently played when empty.',chars:'chars',linked:'words',total:'Total',activity:'Learning activity',days:'days',min:'min',empty:'No games yet',add:'Add game'}};

const DUR=12000,BEAT=476,LOGO=new URL('./assets/megulit-logo.svg',import.meta.url).href;
const details=new Map(),palettes=new Map();
let live=null;

export function cleanShowcase(value){const v=value&&typeof value==='object'?value:{},ids=list=>Array.isArray(list)?[...new Set(list.filter(x=>typeof x==='string'&&x.length<200))].slice(0,500):[];return {mode:v.mode==='pick'?'pick':'auto',order:ids(v.order),pinned:ids(v.pinned),hidden:ids(v.hidden)};}

export function showcaseGames(games,setting){const sc=cleanShowcase(setting),available=games.filter(g=>g.available!==false&&!sc.hidden.includes(g.id)),by=id=>available.find(g=>g.id===id),when=g=>g.lastLaunchedAt||g.lastPlayedAt||0,recent=[...available].sort((a,b)=>when(b)-when(a)),pinned=sc.pinned.map(by).filter(Boolean);
 if(sc.mode==='pick'){const picked=sc.order.map(by).filter(Boolean);if(picked.length)return [...pinned,...picked.filter(g=>!pinned.includes(g))];}
 return [...pinned,...recent.filter(g=>!pinned.includes(g))].slice(0,8);}

function palette(game){if(palettes.has(game.id))return Promise.resolve(palettes.get(game.id));const fallback=['#d05b34','#edb56e','#3b4a8c'];if(!game.cover)return Promise.resolve(fallback);
 return new Promise(done=>{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=c.height=24;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,24,24);const d=x.getImageData(0,0,24,24).data,px=[];for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);px.push({r,g,b,s:mx?(mx-mn)/mx:0,l:(mx+mn)/510});}
  const hex=p=>'#'+[p.r,p.g,p.b].map(v=>v.toString(16).padStart(2,'0')).join(''),vivid=[...px].sort((a,b)=>b.s*(1-Math.abs(a.l-.5))-a.s*(1-Math.abs(b.l-.5))),light=[...px].sort((a,b)=>b.l-a.l),dark=[...px].sort((a,b)=>a.l-b.l);const out=[hex(vivid[0]),hex(light[Math.floor(light.length*.1)]),hex(dark[Math.floor(dark.length*.15)])];palettes.set(game.id,out);done(out);}catch{done(fallback);}};img.onerror=()=>done(fallback);img.src=game.cover;});}

function detail(api,id,locale){if(!details.has(id))details.set(id,api('game_detail',{id,locale}).catch(()=>({})));return details.get(id);}

const rnd=(a,b)=>a+Math.random()*(b-a),pickOne=list=>list[Math.floor(Math.random()*list.length)];
const EASES=['cubic-bezier(.2,.8,.2,1)','cubic-bezier(.16,1,.3,1)','cubic-bezier(.34,1.56,.64,1)','cubic-bezier(.7,0,.2,1)'];
const backCard=()=>{const d=document.createElement('div');d.className='tv-back tv-loose';d.innerHTML=`<img src="${LOGO}" alt="">`;return d;};
function deal(cover,background,animate){const flip=cover.querySelector('.tv-flip'),face=cover.querySelector('.tv-face'),artEl=cover.querySelector('.tv-art'),backFace=flip.querySelector('.tv-back');cover.querySelectorAll('.tv-old,.tv-sheen,.tv-deck').forEach(n=>n.remove());[flip,face,backFace].forEach(el=>el.getAnimations().forEach(x=>x.cancel()));
 if(!animate||matchMedia('(prefers-reduced-motion:reduce)').matches||!artEl.style.background){artEl.style.background=background;return 0;}
 const outDir=rnd(0,Math.PI*2),outDur=rnd(220,320);
 const old=document.createElement('div');old.className='tv-old';old.style.background=artEl.style.background;cover.appendChild(old);
 old.animate([{transform:'none',opacity:1,filter:'blur(0)'},{transform:`translate(${Math.cos(outDir)*rnd(110,160)}%,${Math.sin(outDir)*rnd(80,120)}%) rotate(${rnd(-70,70)}deg) scale(${rnd(.6,.9)})`,opacity:0,filter:'blur(6px)'}],{duration:outDur,easing:'cubic-bezier(.5,0,.9,.5)',fill:'forwards'}).finished.then(()=>old.remove(),()=>old.remove());
 artEl.style.background=background;
 const side=Math.random()<.5?-1:1,turn=180*side,tilt=rnd(-5,5),lift=rnd(60,120),over=rnd(1.06,1.12),gap=outDur*rnd(.25,.45),ease=pickOne(EASES),flipDur=rnd(380,500);let frames,travel;
 if(Math.random()<.5){
  travel=rnd(520,680);const sx=pickOne([-1,-1,1]),dx=sx>0?rnd(55,70):-rnd(72,92),dy=rnd(18,38),dr=sx*rnd(4,12);
  const deck=document.createElement('div');deck.className='tv-deck';
  for(let n=4;n>=1;n--){const c=backCard();c.style.transform=`translate(${n*2.2}px,${n*2.6}px) rotate(${(n-2)*.8}deg)`;deck.appendChild(c);}cover.insertBefore(deck,flip);
  const life=gap+travel+flipDur;
  deck.animate([{opacity:0,transform:`translate(${dx}%,${dy+14}%) rotate(${dr}deg) scale(.86)`},{opacity:1,transform:`translate(${dx}%,${dy}%) rotate(${dr}deg) scale(.9)`,offset:Math.min(.3,gap/life+.1)},{opacity:1,transform:`translate(${dx}%,${dy}%) rotate(${dr}deg) scale(.9)`,offset:.75},{opacity:0,transform:`translate(${dx+sx*6}%,${dy+6}%) rotate(${dr}deg) scale(.88)`}],{duration:life,easing:'ease-out',fill:'both'}).finished.then(()=>deck.remove(),()=>deck.remove());
  frames=[{transform:`translate(${dx}%,${dy}%) rotate(${dr}deg) rotateY(${turn}deg) scale(.9)`,easing:'cubic-bezier(.4,0,.6,1)'},{transform:`translate(${dx-sx*10}%,${dy-4}%) rotate(${dr*.6}deg) rotateY(${turn}deg) scale(.93)`,offset:.16,easing:'cubic-bezier(.3,0,.2,1)'},{transform:`translate(${dx*.4}%,${dy*.2-rnd(12,24)}%) translateZ(${lift*.6}px) rotate(${dr*.2}deg) rotateY(${turn}deg) scale(1.02)`,offset:.38,easing:'cubic-bezier(.2,.7,.3,1)'},{transform:`rotate(${tilt}deg) rotateY(${turn}deg) scale(1)`,offset:.55,easing:'cubic-bezier(.5,0,.4,1)'}];
 }else{
  travel=rnd(380,520);const dir=rnd(0,Math.PI*2),dist=rnd(100,160),spin=pickOne([0,0,rnd(-160,160),rnd(-380,-220),rnd(220,380)]);
  frames=[{transform:`translate(${Math.cos(dir)*dist}%,${Math.sin(dir)*dist}%) rotate(${spin}deg) rotateY(${turn}deg) scale(${rnd(.6,1.25)})`,opacity:0,easing:ease},{opacity:1,offset:.15,easing:ease},{transform:`rotate(${tilt}deg) rotateY(${turn}deg) scale(1)`,opacity:1,offset:.5,easing:'cubic-bezier(.5,0,.4,1)'}];
 }
 frames.push({transform:`translateZ(${lift}px) rotate(${tilt*.5}deg) rotateY(${turn*.5}deg) scale(${over})`,offset:.74,easing:'cubic-bezier(.2,.8,.3,1)'},{transform:`translateZ(${lift*.25}px) rotateY(${-side*rnd(5,12)}deg) scale(${(over+1)/2})`,offset:.88,easing:'cubic-bezier(.3,0,.3,1)'},{transform:'none',opacity:1});
 const total=travel+flipDur,mid=.74,timing={duration:total,delay:gap,easing:'linear',fill:'backwards'};
 flip.animate(frames,timing);
 face.animate([{opacity:0},{opacity:0,offset:mid},{opacity:1,offset:mid+.001},{opacity:1}],timing);
 backFace.animate([{opacity:1},{opacity:1,offset:mid},{opacity:0,offset:mid+.001},{opacity:0}],{...timing,fill:'both'}).finished.then(()=>backFace.getAnimations().forEach(x=>x.cancel()),()=>{});
 const sheen=document.createElement('i');sheen.className='tv-sheen';face.appendChild(sheen);sheen.style.setProperty('--sa',rnd(95,135)+'deg');
 sheen.animate([{backgroundPosition:'120% 0',opacity:0},{opacity:1,offset:.3},{backgroundPosition:'-40% 0',opacity:0}],{duration:rnd(600,850),delay:gap+total*.8,easing:'ease-out',fill:'both'}).finished.then(()=>sheen.remove(),()=>sheen.remove());
 return gap+total*mid;}

function cardify(card){const face=card.querySelector('.tv-face');let pressed=false,last=null;
 const set=(x,y)=>{const depth=pressed?1.6:1,rx=(.5-y)*20*depth,ry=(x-.5)*20*depth;face.style.transform=`rotateX(${rx}deg) rotateY(${ry}deg) scale(${pressed?.96:1.03})`;face.style.setProperty('--px',`${x*100}%`);face.style.setProperty('--py',`${y*100}%`);face.style.setProperty('--hue',`${Math.round(x*360)}deg`);};
 card.addEventListener('pointerenter',()=>{card.classList.add('touch');face.style.transition='transform .12s ease-out';});
 card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();last=[Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];set(...last);});
 card.addEventListener('pointerdown',e=>{pressed=true;card.setPointerCapture?.(e.pointerId);if(last)set(...last);});
 const up=()=>{pressed=false;if(last)set(...last);};card.addEventListener('pointerup',up);card.addEventListener('pointercancel',up);
 card.addEventListener('pointerleave',()=>{pressed=false;last=null;card.classList.remove('touch');face.style.transition='transform .7s cubic-bezier(.2,1.6,.4,1)';face.style.transform='';});}

export function stopHomeTV(){if(!live)return;clearTimeout(live.timer);clearInterval(live.beat);clearInterval(live.typer);live.root?.removeEventListener('mousemove',live.move);live=null;}

export function homeTVSignature(model){return JSON.stringify([model.games.map(g=>[g.id,g.available,g.cover?.length,g.title,g.lastPlayedAt,g.readingSeconds,g.characters,g.learnedWords]),model.stats,model.preferences.homeShowcase,model.preferences.username]);}

export function renderHomeTV(main,ctx){
 stopHomeTV();
 const {model,api,locale,esc,icon,number,duration,relativeTime,navigate,onLaunch,onDetail,onAdd,greeting,savePreferences}=ctx,w=copy[locale]||copy.zh;
 let setting=cleanShowcase(model.preferences.homeShowcase),list=showcaseGames(model.games,setting),cur=0,token=0,shown=null;const pool=model.games.filter(g=>g.available!==false),randomGame=()=>{const rest=pool.filter(g=>g!==shown);return rest[Math.floor(Math.random()*rest.length)]||pool[0];};
 const date=new Date().toLocaleDateString({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[locale],{month:'long',day:'numeric',weekday:'long'});
 const mins=s=>{const m=Math.floor((s||0)/60);return m>=60?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:`${m}m`;};
 main.innerHTML=`<div class="tv-home" tabindex="-1"><div class="tv-canvas">
  <div class="tv-plane" data-z="-200"><div class="tv-tl"></div></div>
  <div class="tv-plane" data-z="-80"><div class="tv-kana"></div><div class="tv-index"></div><div class="tv-ring"></div></div>
  <div class="tv-plane" data-z="0"><div class="tv-slices"></div><div class="tv-script"></div><div class="tv-vocab"></div><div class="tv-heat-card tv-card"><div class="tv-face"><div class="tv-heat"></div><i class="tv-glare"></i></div></div></div>
  <div class="tv-plane" data-z="60"><div class="tv-cover tv-card"><div class="tv-flip"><div class="tv-face"><div class="tv-art"></div><i class="tv-foil"></i><i class="tv-glare"></i></div><div class="tv-back"><img src="${LOGO}" alt=""></div></div></div></div></div>
  <div class="tv-scan"></div><div class="tv-grain"></div><div class="tv-marks"><i></i><i></i><i></i><i></i></div><div class="tv-scene"></div><div class="tv-flash"></div>
  <div class="tv-clock"><span>${esc(date)}</span><b>${esc(greeting)}</b></div>
  <button class="tv-heatlink" data-go="activity"></button>
  <div class="tv-figs"><button class="tv-fig" data-go="statistics"><b>${mins(model.stats.readingSeconds)}</b><small>${w.read}</small></button><button class="tv-fig" data-go="words"><b>${number(model.stats.words)}</b><small>${w.words}</small></button><button class="tv-fig" data-go="statistics"><b>${number(model.stats.lookups)}</b><small>${w.lookups}</small></button><button class="tv-more" data-go="statistics">${w.full} →</button></div>
  <div class="tv-title"><div class="tv-ruby"></div><div class="tv-h1" role="heading" aria-level="1"></div><div class="tv-meta"></div></div>
  <div class="tv-rail"></div>
  <div class="tv-dialog"><span class="tv-who"></span><span class="tv-line"></span><div class="tv-act"><button class="tv-btn primary tv-play" data-act="play"><i class="tv-play-ic" aria-hidden="true"></i><span class="tv-play-tx"><b>${w.play}</b><small class="tv-play-sub"></small></span></button><button class="tv-btn" data-act="detail">${w.detail}</button><button class="tv-btn" data-go="library">${w.all}</button></div></div>
  <section class="tv-drawer" aria-label="${w.title}"><h2>${w.title} <small>${w.sub}</small></h2><button class="tv-close">${w.close} ✕</button><div class="tv-mode"><button data-m="auto">${w.auto}</button><button data-m="pick">${w.pick}</button><input class="tv-search" type="search" placeholder="${w.search}" aria-label="${w.search}"></div><div class="tv-list"></div><div class="tv-hint"></div></section></div>`;
 const root=main.querySelector('.tv-home'),$=s=>root.querySelector(s);
 live={root,timer:0,beat:0,typer:0,move:null};
 const art=(g,p)=>g.cover?`url("${String(g.cover).replace(/"/g,'%22')}") center/cover`:`linear-gradient(160deg,${p[0]},${p[2]} 70%)`;
 root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{const to=b.dataset.go;if(to==='words')navigate('learning','words');else if(to==='activity')navigate('statistics');else navigate(to);}));
 if(!list.length){$('.tv-h1').textContent=w.empty;$('.tv-act').innerHTML=model.games.length?'':`<button class="tv-btn primary" data-act="add">${icon('plus')}${w.add}</button>`;$('[data-act="add"]')?.addEventListener('click',onAdd);root.classList.add('empty');}
 $('[data-act="play"]')?.addEventListener('click',e=>shown&&onLaunch(shown.id,e.currentTarget));
 $('[data-act="detail"]')?.addEventListener('click',()=>shown&&onDetail(shown.id));
 const type=s=>{clearInterval(live.typer);let n=0;const line=$('.tv-line');line.textContent='';if(!s)return;live.typer=setInterval(()=>{line.textContent='「'+s.slice(0,++n)+(n<s.length?'':'」');if(n>=s.length)clearInterval(live.typer);},55);};
 const max=Math.max(1,...model.games.map(g=>g.characters||0));
 async function paint(i,flash=true){
  const g=typeof i==='object'?i:list[i];if(!root.isConnected){if(live?.root===root)stopHomeTV();return;}if(!g||!live||live.root!==root)return;shown=g;cur=list.indexOf(g);const mine=++token;
  const started=performance.now(),reveal=deal($('.tv-cover'),art(g,['#3b2a26','#3b2a26','#1a1110']),flash);
  const [p,d]=await Promise.all([palette(g),detail(api,g.id,locale)]);if(mine!==token||!live||live.root!==root)return;
  ctx.onGame?.(g);root.style.setProperty('--tv-a',p[0]);root.style.setProperty('--tv-b',p[1]);root.style.setProperty('--tv-c',p[2]);
  const k=(g.title.length*37+pool.indexOf(g)*13)%60,saved=(d.sentences||[]).map(s=>String(s.text||'').trim()).filter(Boolean),sentences=(saved.length?saved:(d.recentLines||[]).map(s=>String(s.text||'').trim()).filter(Boolean).slice(-6)).slice(0,8),words=(d.words||[]).filter(x=>x.spelling).slice(0,10),sessions=d.sessions||[];
  $('.tv-kana').textContent=[...g.title].find(c=>/[一-鿿぀-ヿ]/.test(c))||g.title.slice(0,1);
  if(!g.cover)$('.tv-art').style.background=art(g,p);$('.tv-play-sub').textContent=relativeTime(g.lastPlayedAt);
  const pct=Math.max(.02,Math.min(1,(g.characters||0)/max)),N=72,ring=$('.tv-ring');ring.style.left=(44+k%14)+'%';const on=Math.round(pct*N),ang=pct*360-90,ex=50+46*Math.cos(ang*Math.PI/180),ey=50+46*Math.sin(ang*Math.PI/180);
  ring.innerHTML=`<svg viewBox="0 0 100 100"><defs><path id="tvarc" d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0"/><linearGradient id="tvgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--g-gold)"/><stop offset="1" stop-color="var(--tv-a)"/></linearGradient></defs><circle class="halo" cx="50" cy="50" r="46"/>${Array.from({length:N},(_,t)=>{const a=t/N*2*Math.PI-Math.PI/2,big=t%6===0,r1=big?42.5:43.6,r2=48;return `<line class="tick${t<on?' on':''}" style="--d:${t*14}ms" x1="${(50+r1*Math.cos(a)).toFixed(2)}" y1="${(50+r1*Math.sin(a)).toFixed(2)}" x2="${(50+r2*Math.cos(a)).toFixed(2)}" y2="${(50+r2*Math.sin(a)).toFixed(2)}"/>`;}).join('')}<circle class="head" cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="1.1"/><text class="arc-label"><textPath href="#tvarc" startOffset="2%">${number(g.characters||0)} ${w.chars} · ${esc(duration(g.readingSeconds))}</textPath></text></svg>`;
  const script=$('.tv-script');script.innerHTML=sentences.slice(-5).map((t,n)=>`<p class="${n?'':'on'}" data-n="${n}"><span class="tv-sno">${String(n+1).padStart(2,'0')}</span>${esc(t)}</p>`).join('');script.querySelectorAll('p').forEach(el=>el.addEventListener('pointerenter',()=>{script.querySelectorAll('p').forEach(x=>x.classList.toggle('on',x===el));type(sentences[+el.dataset.n]);}));
  const now=Date.now(),span=40*864e5,big=Math.max(1,...sessions.map(s=>s.active_seconds||0))*.6;$('.tv-tl').innerHTML=sessions.filter(s=>now-s.started_at*1000<span).map(s=>{const y=10+((now-s.started_at*1000)/span)*70,long=(s.active_seconds||0)>=big;return `<b class="${long?'big':''}" style="top:${y}%"></b>`+(long?`<span style="top:${y}%">${new Date(s.started_at*1000).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})} · ${Math.round((s.active_seconds||0)/60)}${w.min}</span>`:'');}).join('');
  $('.tv-slices').innerHTML=Array.from({length:5},(_,j)=>`<i style="background:${art(g,p)};background-size:500% 100%;background-position:${j*25}% 0;transform:translateZ(${j%2?40:-20}px) translateY(${(j-2)*12}px)"></i>`).join('');
  const cards=words.slice(0,8).map(x=>({b:x.spelling,s:x.reading&&x.reading!==x.spelling?x.reading:'',t:String(x.definitions||'').replace(/<[^>]+>/g,'').slice(0,80)}));
  $('.tv-vocab').innerHTML=cards.map(c=>`<div class="tv-wcard tv-card" title="${esc(c.t)}"><div class="tv-face"><small>${esc(c.s)||'&nbsp;'}</small><b>${esc(c.b)}</b><i class="tv-glare"></i></div></div>`).join('');$('.tv-vocab').querySelectorAll('.tv-card').forEach(cardify);
  const no=String(Math.max(1,pool.indexOf(g)+1)).padStart(2,'0');$('.tv-index').textContent=no;$('.tv-scene').innerHTML=`SCENE <b>${no}</b> / ${String(pool.length).padStart(2,'0')}`;
  const t=$('.tv-title');t.classList.remove('in');setTimeout(()=>{if(mine!==token)return;$('.tv-ruby').textContent=g.engine||'';let n=0;$('.tv-h1').innerHTML=String(g.title).split(' ').map(word=>`<i class="w">${[...word].map(c=>`<span style="transition-delay:${(n++)*28}ms">${esc(c)}</span>`).join('')}</i>`).join(' ');$('.tv-h1').title=g.title;$('.tv-meta').innerHTML=`<span>${esc(relativeTime(g.lastPlayedAt))}</span><span>${w.total} ${esc(duration(g.readingSeconds))}</span><span>${number(g.characters||0)} ${w.chars}</span><span>${number(g.learnedWords||0)} ${w.linked}</span>`;void t.offsetWidth;setTimeout(()=>t.classList.add('in'),30);},flash?Math.max(0,reveal-(performance.now()-started)):0);
  $('.tv-who').textContent=g.title;type(sentences[0]||'');
  if(flash){const f=$('.tv-flash');f.classList.remove('on');void f.offsetWidth;f.classList.add('on');}
  rail();
 }
 function rail(){const r=$('.tv-rail');r.innerHTML=list.map((g,i)=>`<button class="tv-chip${i===cur?' on':''}" data-i="${i}" title="${esc(g.title)}" style="--dur:${DUR}ms">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}${setting.pinned.includes(g.id)?'<span class="pin"></span>':''}<span class="bar"></span></button>`).join('')+`<button class="tv-edit" title="${w.edit}" aria-label="${w.edit}">＋</button>`;
  r.querySelectorAll('.tv-chip').forEach(b=>b.addEventListener('click',()=>paint(+b.dataset.i)));r.querySelector('.tv-edit').addEventListener('click',()=>{drawer();$('.tv-drawer').classList.add('open');});}
 function drawer(){const all=model.games.filter(g=>g.available!==false),when=g=>g.lastLaunchedAt||g.lastPlayedAt||0,ids=[...setting.order.filter(id=>all.some(g=>g.id===id)),...[...all].sort((a,b)=>when(b)-when(a)).map(g=>g.id).filter(id=>!setting.order.includes(id))];setting.order=ids;
  root.querySelectorAll('.tv-mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===setting.mode));
  $('.tv-list').innerHTML=ids.map((id,i)=>{const g=all.find(x=>x.id===id),p=setting.pinned.includes(id),h=setting.hidden.includes(id);return `<div class="tv-item${p?' pinned':''}${h?' hidden':''}" draggable="true" data-id="${esc(id)}" data-q="${esc((g.title+' '+(g.names||[]).join(' ')+' '+(g.engine||'')).toLowerCase())}"><div class="cv">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}<span class="n">${String(i+1).padStart(2,'0')}</span></div><p title="${esc(g.title)}">${esc(g.title)}</p><div class="ops"><button data-op="pin" class="${p?'on':''}">${w.pin}</button><button data-op="hide" class="${h?'on':''}">${w.hide}</button></div></div>`;}).join('');
  $('.tv-hint').textContent=setting.mode==='auto'?w.hintAuto:w.hintPick;filter();
  let drag=null;root.querySelectorAll('.tv-item').forEach(el=>{el.addEventListener('dragstart',()=>{drag=el.dataset.id;el.classList.add('dragging');});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',()=>{const a=setting.order.indexOf(drag),b=setting.order.indexOf(el.dataset.id);if(a<0||b<0||a===b)return;setting.order.splice(b,0,setting.order.splice(a,1)[0]);setting.mode='pick';commit();});
   el.querySelectorAll('[data-op]').forEach(b=>b.addEventListener('click',()=>{const id=el.dataset.id,key=b.dataset.op==='pin'?'pinned':'hidden';setting[key]=setting[key].includes(id)?setting[key].filter(x=>x!==id):[...setting[key],id];commit();}));});}
 function filter(){const q=$('.tv-search').value.trim().toLowerCase();root.querySelectorAll('.tv-item').forEach(el=>{el.hidden=!!q&&!el.dataset.q.includes(q);});}
 function commit(){model.preferences.homeShowcase=setting;savePreferences({homeShowcase:setting});drawer();const id=shown?.id;list=showcaseGames(model.games,setting);paint(Math.max(0,list.findIndex(g=>g.id===id)),false);}
 root.querySelectorAll('.tv-mode button').forEach(b=>b.addEventListener('click',()=>{setting.mode=b.dataset.m;commit();}));
 $('.tv-search').addEventListener('input',filter);
 $('.tv-close').addEventListener('click',()=>$('.tv-drawer').classList.remove('open'));
 api('learning_activity',{range:'year'}).then(records=>{if(!live||live.root!==root)return;const all=activityCells(Array.isArray(records)?records:[]);let from=Math.max(0,all.length-26*7);while(from>0&&all[from].weekday!==0)from--;const cells=all.slice(from),active=cells.filter(c=>c.level).length;$('.tv-heat').innerHTML=cells.map((c,i)=>`<i style="grid-row:${c.weekday+1};grid-column:${Math.floor(i/7)+1}" class="${i===cells.length-1?'today':c.level?'l'+Math.min(3,c.level):''}" title="${esc(c.day)} · ${Math.round((c.seconds||0)/60)} ${w.min}"></i>`).join('');$('.tv-heatlink').textContent=`${w.activity} · ${active} ${w.days} →`;}).catch(()=>{});
 const canvas=$('.tv-canvas'),planes=[...root.querySelectorAll('.tv-plane')],reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 live.move=e=>{if(reduced)return;const r=root.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;canvas.style.transform=`rotateY(${x*6}deg) rotateX(${-y*5}deg)`;planes.forEach(p=>p.style.transform=`translate3d(${-x*p.dataset.z*.25}px,${-y*p.dataset.z*.2}px,${p.dataset.z}px)`);};
 root.addEventListener('mousemove',live.move);
 root.querySelectorAll('.tv-cover,.tv-heat-card').forEach(cardify);
 root.addEventListener('mouseleave',()=>{canvas.style.transform='';});
 const coverEl=$('.tv-cover');let clickTimer=0;coverEl.title=w.coverHint;coverEl.addEventListener('click',()=>{clearTimeout(clickTimer);clickTimer=setTimeout(()=>shown&&onDetail(shown.id),260);});coverEl.addEventListener('dblclick',e=>{e.preventDefault();clearTimeout(clickTimer);if(pool.length>1)paint(randomGame());});
 if(list.length)paint(0,false);
 return stopHomeTV;
}
