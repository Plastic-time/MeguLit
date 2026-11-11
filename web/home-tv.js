import {activityCells} from './learning-activity.js';

const copy={
 zh:{read:'今日阅读',words:'收录单词',lookups:'查词',full:'完整统计',play:'继续游玩',detail:'作品详情',all:'全部作品',edit:'选择首页展示的作品',title:'首页展示的作品',sub:'拖动排序 · 置顶 · 隐藏',auto:'按最近游玩',pick:'只放我挑的',pin:'置顶',hide:'隐藏',close:'关闭',hintAuto:'按最近游玩自动轮播；置顶的永远在最前，隐藏的不出现。',hintPick:'只轮播这里的顺序；一个都不剩时回到最近游玩。',chars:'字',linked:'词',total:'累计',activity:'学习活动',days:'天',min:'分',empty:'还没有作品',add:'添加游戏'},
 ja:{read:'今日の読書',words:'収録単語',lookups:'辞書引き',full:'統計をすべて見る',play:'続きをプレイ',detail:'作品詳細',all:'すべての作品',edit:'ホームに表示する作品を選ぶ',title:'ホームに表示する作品',sub:'ドラッグで並べ替え · 固定 · 非表示',auto:'最近プレイ順',pick:'選んだ作品だけ',pin:'固定',hide:'非表示',close:'閉じる',hintAuto:'最近プレイ順に切り替わります。固定は常に先頭、非表示は出ません。',hintPick:'この順番だけで切り替えます。残りがなければ最近プレイ順に戻ります。',chars:'字',linked:'語',total:'累計',activity:'学習の記録',days:'日',min:'分',empty:'作品がまだありません',add:'ゲームを追加'},
 en:{read:'Read today',words:'Words saved',lookups:'Lookups',full:'Full statistics',play:'Continue',detail:'Details',all:'All games',edit:'Choose games for the home screen',title:'Games on the home screen',sub:'Drag to reorder · pin · hide',auto:'Recently played',pick:'Only my picks',pin:'Pin',hide:'Hide',close:'Close',hintAuto:'Cycles through recently played games; pinned ones lead, hidden ones never show.',hintPick:'Cycles through this order only; falls back to recently played when empty.',chars:'chars',linked:'words',total:'Total',activity:'Learning activity',days:'days',min:'min',empty:'No games yet',add:'Add game'}};

const DUR=12000,BEAT=476;
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

function deal(cover,background,animate){const face=cover.querySelector('.tv-face'),artEl=cover.querySelector('.tv-art');if(!animate||matchMedia('(prefers-reduced-motion:reduce)').matches||!artEl.style.background){artEl.style.background=background;return;}
 cover.querySelectorAll('.tv-ghost,.tv-old').forEach(n=>n.remove());
 const old=document.createElement('div');old.className='tv-old';old.style.background=artEl.style.background;cover.appendChild(old);
 old.animate([{transform:'none',opacity:1},{transform:'translate(70%,-35%) rotate(28deg) scale(.9)',opacity:0}],{duration:520,easing:'cubic-bezier(.6,0,.9,.4)',fill:'forwards'}).finished.then(()=>old.remove(),()=>old.remove());
 const ghosts=[0,1,2].map(n=>{const d=document.createElement('div');d.className='tv-ghost';cover.insertBefore(d,face);const side=n%2?1:-1;d.animate([{transform:'translate(0,0) rotate(0)',opacity:0},{transform:`translate(${side*42}%,${-6*n}%) rotate(${side*9}deg)`,opacity:1,offset:.45},{transform:`translate(${-side*8}%,0) rotate(${-side*3}deg)`,opacity:1,offset:.8},{transform:'translate(0,0) rotate(0)',opacity:0}],{duration:760,delay:120+n*70,easing:'cubic-bezier(.3,.7,.2,1)',fill:'both'}).finished.then(()=>d.remove(),()=>d.remove());return d;});
 face.animate([{transform:'translateY(18%) rotateY(-180deg) scale(.86)',opacity:0},{transform:'translateY(-6%) rotateY(-80deg) scale(1.04)',opacity:1,offset:.55},{transform:'none',opacity:1}],{duration:720,delay:520,easing:'cubic-bezier(.2,.9,.2,1)',fill:'backwards'});
 setTimeout(()=>{artEl.style.background=background;},520+300);}

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
 let setting=cleanShowcase(model.preferences.homeShowcase),list=showcaseGames(model.games,setting),cur=0,token=0;
 const date=new Date().toLocaleDateString({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[locale],{month:'long',day:'numeric',weekday:'long'});
 const mins=s=>{const m=Math.floor((s||0)/60);return m>=60?`${Math.floor(m/60)}h${String(m%60).padStart(2,'0')}`:`${m}m`;};
 main.innerHTML=`<div class="tv-home" tabindex="-1"><div class="tv-canvas">
  <div class="tv-plane" data-z="-200"><div class="tv-band"><div class="tv-band-in"></div></div><div class="tv-tl"></div></div>
  <div class="tv-plane" data-z="-80"><div class="tv-kana"></div><div class="tv-index"></div><div class="tv-ring"></div></div>
  <div class="tv-plane" data-z="0"><div class="tv-slices"></div><div class="tv-vocab"></div><div class="tv-heat-card tv-card"><div class="tv-face"><div class="tv-heat"></div><i class="tv-glare"></i></div></div></div>
  <div class="tv-plane" data-z="60"><div class="tv-cover tv-card"><div class="tv-face"><div class="tv-art"></div><i class="tv-foil"></i><i class="tv-glare"></i></div></div></div></div>
  <div class="tv-scan"></div><div class="tv-grain"></div><div class="tv-marks"><i></i><i></i><i></i><i></i></div><div class="tv-scene"></div><div class="tv-flash"></div>
  <div class="tv-clock"><span>${esc(date)}</span><b>${esc(greeting)}</b></div>
  <button class="tv-heatlink" data-go="activity"></button>
  <div class="tv-figs"><button class="tv-fig" data-go="statistics"><b>${mins(model.stats.readingSeconds)}</b><small>${w.read}</small></button><button class="tv-fig" data-go="words"><b>${number(model.stats.words)}</b><small>${w.words}</small></button><button class="tv-fig" data-go="statistics"><b>${number(model.stats.lookups)}</b><small>${w.lookups}</small></button><button class="tv-more" data-go="statistics">${w.full} →</button></div>
  <div class="tv-title"><div class="tv-ruby"></div><div class="tv-h1" role="heading" aria-level="1"></div><div class="tv-meta"></div></div>
  <div class="tv-rail"></div>
  <div class="tv-dialog"><span class="tv-who"></span><span class="tv-line"></span><div class="tv-act"><button class="tv-btn primary" data-act="play">${icon('play')}${w.play}</button><button class="tv-btn" data-act="detail">${w.detail}</button><button class="tv-btn" data-go="library">${w.all}</button></div></div>
  <section class="tv-drawer" aria-label="${w.title}"><h2>${w.title} <small>${w.sub}</small></h2><button class="tv-close">${w.close} ✕</button><div class="tv-mode"><button data-m="auto">${w.auto}</button><button data-m="pick">${w.pick}</button></div><div class="tv-list"></div><div class="tv-hint"></div></section></div>`;
 const root=main.querySelector('.tv-home'),$=s=>root.querySelector(s);
 live={root,timer:0,beat:0,typer:0,move:null};
 const art=(g,p)=>g.cover?`url("${String(g.cover).replace(/"/g,'%22')}") center/cover`:`linear-gradient(160deg,${p[0]},${p[2]} 70%)`;
 root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{const to=b.dataset.go;if(to==='words')navigate('learning','words');else if(to==='activity')navigate('statistics');else navigate(to);}));
 if(!list.length){$('.tv-h1').textContent=w.empty;$('.tv-act').innerHTML=model.games.length?'':`<button class="tv-btn primary" data-act="add">${icon('plus')}${w.add}</button>`;$('[data-act="add"]')?.addEventListener('click',onAdd);root.classList.add('empty');}
 $('[data-act="play"]')?.addEventListener('click',e=>list[cur]&&onLaunch(list[cur].id,e.currentTarget));
 $('[data-act="detail"]')?.addEventListener('click',()=>list[cur]&&onDetail(list[cur].id));
 const type=s=>{clearInterval(live.typer);let n=0;const line=$('.tv-line');line.textContent='';if(!s)return;live.typer=setInterval(()=>{line.textContent='「'+s.slice(0,++n)+(n<s.length?'':'」');if(n>=s.length)clearInterval(live.typer);},55);};
 const max=Math.max(1,...model.games.map(g=>g.characters||0));
 async function paint(i,flash=true){
  const g=list[i];if(!root.isConnected){if(live?.root===root)stopHomeTV();return;}if(!g||!live||live.root!==root)return;cur=i;const mine=++token;
  const [p,d]=await Promise.all([palette(g),detail(api,g.id,locale)]);if(mine!==token||!live||live.root!==root)return;
  ctx.onGame?.(g);root.style.setProperty('--tv-a',p[0]);root.style.setProperty('--tv-b',p[1]);root.style.setProperty('--tv-c',p[2]);
  const k=(g.title.length*37+i*13)%60,sentences=(d.sentences||[]).map(s=>String(s.text||'').trim()).filter(Boolean).slice(0,8),words=(d.words||[]).filter(x=>x.spelling).slice(0,10),sessions=d.sessions||[];
  $('.tv-kana').textContent=[...g.title].find(c=>/[一-鿿぀-ヿ]/.test(c))||g.title.slice(0,1);
  deal($('.tv-cover'),art(g,p),flash);
  const pct=(g.characters||0)/max,C=2*Math.PI*48,ring=$('.tv-ring');ring.style.left=(44+k%14)+'%';ring.innerHTML=`<div class="tv-disc" style="background:${art(g,p)}"></div><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="48"/><circle class="prog" cx="50" cy="50" r="48" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><span class="tv-pct">${number(g.characters||0)} ${w.chars}</span>`;requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=ring.querySelector('.prog');if(c)c.style.strokeDashoffset=C*(1-Math.max(.04,pct));}));
  const band=(sentences.length?sentences:[g.title]).map(t=>'「'+t+'」').join('　');$('.tv-band-in').textContent=(band+'　').repeat(Math.max(2,Math.ceil(80/band.length)));
  const now=Date.now(),span=40*864e5,big=Math.max(1,...sessions.map(s=>s.active_seconds||0))*.6;$('.tv-tl').innerHTML=sessions.filter(s=>now-s.started_at*1000<span).map(s=>{const y=10+((now-s.started_at*1000)/span)*70,long=(s.active_seconds||0)>=big;return `<b class="${long?'big':''}" style="top:${y}%"></b>`+(long?`<span style="top:${y}%">${new Date(s.started_at*1000).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})} · ${Math.round((s.active_seconds||0)/60)}${w.min}</span>`:'');}).join('');
  $('.tv-slices').innerHTML=Array.from({length:5},(_,j)=>`<i style="background:${art(g,p)};background-size:500% 100%;background-position:${j*25}% 0;transform:translateZ(${j%2?40:-20}px) translateY(${(j-2)*12}px)"></i>`).join('');
  const cards=words.length?words.slice(0,8).map(x=>({b:x.spelling,s:x.reading&&x.reading!==x.spelling?x.reading:'',t:String(x.definitions||'').replace(/<[^>]+>/g,'').slice(0,80)})):[...new Set([...g.title].filter(c=>c.trim()&&!/[*＊!！?？.。・\-]/.test(c)))].slice(0,6).map(c=>({b:c,s:'',t:''}));
  $('.tv-vocab').innerHTML=cards.map(c=>`<div class="tv-wcard tv-card" title="${esc(c.t)}"><div class="tv-face"><small>${esc(c.s)||'&nbsp;'}</small><b>${esc(c.b)}</b><i class="tv-glare"></i></div></div>`).join('');$('.tv-vocab').querySelectorAll('.tv-card').forEach(cardify);
  $('.tv-index').textContent=String(i+1).padStart(2,'0');$('.tv-scene').innerHTML=`SCENE <b>${String(i+1).padStart(2,'0')}</b> / ${String(list.length).padStart(2,'0')}`;
  const t=$('.tv-title');t.classList.remove('in');setTimeout(()=>{if(mine!==token)return;$('.tv-ruby').textContent=g.engine||'';let n=0;$('.tv-h1').innerHTML=String(g.title).split(' ').map(word=>`<i class="w">${[...word].map(c=>`<span style="transition-delay:${(n++)*28}ms">${esc(c)}</span>`).join('')}</i>`).join(' ');$('.tv-h1').title=g.title;$('.tv-meta').innerHTML=`<span>${esc(relativeTime(g.lastPlayedAt))}</span><span>${w.total} ${esc(duration(g.readingSeconds))}</span><span>${number(g.characters||0)} ${w.chars}</span><span>${number(g.learnedWords||0)} ${w.linked}</span>`;void t.offsetWidth;setTimeout(()=>t.classList.add('in'),30);},flash?180:0);
  $('.tv-who').textContent=g.title;type(sentences[0]||'');
  if(flash){const f=$('.tv-flash');f.classList.remove('on');void f.offsetWidth;f.classList.add('on');}
  rail();clearTimeout(live.timer);if(list.length>1&&!root.matches(':hover'))live.timer=setTimeout(()=>paint((cur+1)%list.length),DUR);
 }
 function rail(){const r=$('.tv-rail');r.innerHTML=list.map((g,i)=>`<button class="tv-chip${i===cur?' on':''}" data-i="${i}" title="${esc(g.title)}" style="--dur:${DUR}ms">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}${setting.pinned.includes(g.id)?'<span class="pin"></span>':''}<span class="bar"></span></button>`).join('')+`<button class="tv-edit" title="${w.edit}" aria-label="${w.edit}">＋</button>`;
  r.querySelectorAll('.tv-chip').forEach(b=>b.addEventListener('click',()=>paint(+b.dataset.i)));r.querySelector('.tv-edit').addEventListener('click',()=>{drawer();$('.tv-drawer').classList.add('open');});}
 function drawer(){const all=model.games.filter(g=>g.available!==false),when=g=>g.lastLaunchedAt||g.lastPlayedAt||0,ids=[...setting.order.filter(id=>all.some(g=>g.id===id)),...[...all].sort((a,b)=>when(b)-when(a)).map(g=>g.id).filter(id=>!setting.order.includes(id))];setting.order=ids;
  root.querySelectorAll('.tv-mode button').forEach(b=>b.classList.toggle('on',b.dataset.m===setting.mode));
  $('.tv-list').innerHTML=ids.map((id,i)=>{const g=all.find(x=>x.id===id),p=setting.pinned.includes(id),h=setting.hidden.includes(id);return `<div class="tv-item${p?' pinned':''}${h?' hidden':''}" draggable="true" data-id="${esc(id)}"><div class="cv">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}<span class="n">${String(i+1).padStart(2,'0')}</span></div><p title="${esc(g.title)}">${esc(g.title)}</p><div class="ops"><button data-op="pin" class="${p?'on':''}">${w.pin}</button><button data-op="hide" class="${h?'on':''}">${w.hide}</button></div></div>`;}).join('');
  $('.tv-hint').textContent=setting.mode==='auto'?w.hintAuto:w.hintPick;
  let drag=null;root.querySelectorAll('.tv-item').forEach(el=>{el.addEventListener('dragstart',()=>{drag=el.dataset.id;el.classList.add('dragging');});el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',()=>{const a=setting.order.indexOf(drag),b=setting.order.indexOf(el.dataset.id);if(a<0||b<0||a===b)return;setting.order.splice(b,0,setting.order.splice(a,1)[0]);setting.mode='pick';commit();});
   el.querySelectorAll('[data-op]').forEach(b=>b.addEventListener('click',()=>{const id=el.dataset.id,key=b.dataset.op==='pin'?'pinned':'hidden';setting[key]=setting[key].includes(id)?setting[key].filter(x=>x!==id):[...setting[key],id];commit();}));});}
 function commit(){model.preferences.homeShowcase=setting;savePreferences({homeShowcase:setting});drawer();const id=list[cur]?.id;list=showcaseGames(model.games,setting);paint(Math.max(0,list.findIndex(g=>g.id===id)),false);}
 root.querySelectorAll('.tv-mode button').forEach(b=>b.addEventListener('click',()=>{setting.mode=b.dataset.m;commit();}));
 $('.tv-close').addEventListener('click',()=>$('.tv-drawer').classList.remove('open'));
 api('learning_activity',{range:'year'}).then(records=>{if(!live||live.root!==root)return;const cells=activityCells(Array.isArray(records)?records:[]).slice(-26*7),active=cells.filter(c=>c.level).length;$('.tv-heat').innerHTML=cells.map((c,i)=>`<i class="${i===cells.length-1?'today':c.level?'l'+Math.min(3,c.level):''}" title="${esc(c.day)} · ${Math.round((c.seconds||0)/60)} ${w.min}"></i>`).join('');$('.tv-heatlink').textContent=`${w.activity} · ${active} ${w.days} →`;}).catch(()=>{});
 const canvas=$('.tv-canvas'),planes=[...root.querySelectorAll('.tv-plane')],reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 live.move=e=>{if(reduced)return;const r=root.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;canvas.style.transform=`rotateY(${x*6}deg) rotateX(${-y*5}deg)`;planes.forEach(p=>p.style.transform=`translate3d(${-x*p.dataset.z*.25}px,${-y*p.dataset.z*.2}px,${p.dataset.z}px)`);};
 root.addEventListener('mousemove',live.move);
 root.querySelectorAll('.tv-cover,.tv-heat-card').forEach(cardify);
 root.addEventListener('mouseenter',()=>clearTimeout(live?.timer));
 root.addEventListener('mouseleave',()=>{canvas.style.transform='';if(live&&list.length>1){clearTimeout(live.timer);live.timer=setTimeout(()=>paint((cur+1)%list.length),DUR);}});
 if(list.length)paint(0,false);
 return stopHomeTV;
}
