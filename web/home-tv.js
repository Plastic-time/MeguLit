import {activityCells} from './learning-activity.js';

const copy={
 zh:{daily:'每日热点',streak:'最长连续',figRead:'累计阅读',figChars:'读过的字',figWords:'关联单词',last:'上次',coverHint:'单击查看详情 · 双击抽卡',search:'搜索作品',read:'今日阅读',words:'收录单词',lookups:'查词',full:'完整统计',play:'继续游玩',detail:'作品详情',all:'全部作品',edit:'选择首页展示的作品',title:'首页展示的作品',sub:'拖动排序 · 置顶 · 隐藏',auto:'按最近游玩',pick:'只放我挑的',pin:'置顶',hide:'隐藏',close:'关闭',hintAuto:'按最近游玩自动轮播；置顶的永远在最前，隐藏的不出现。',hintPick:'只轮播这里的顺序；一个都不剩时回到最近游玩。',chars:'字',linked:'词',total:'累计',activity:'学习活动',days:'天',min:'分',empty:'还没有作品',add:'添加游戏'},
 ja:{daily:'今日の話題',streak:'最長連続',figRead:'累計読書',figChars:'読んだ文字',figWords:'関連単語',last:'前回',coverHint:'クリックで詳細 · ダブルクリックでガチャ',search:'作品を検索',read:'今日の読書',words:'収録単語',lookups:'辞書引き',full:'統計をすべて見る',play:'続きをプレイ',detail:'作品詳細',all:'すべての作品',edit:'ホームに表示する作品を選ぶ',title:'ホームに表示する作品',sub:'ドラッグで並べ替え · 固定 · 非表示',auto:'最近プレイ順',pick:'選んだ作品だけ',pin:'固定',hide:'非表示',close:'閉じる',hintAuto:'最近プレイ順に切り替わります。固定は常に先頭、非表示は出ません。',hintPick:'この順番だけで切り替えます。残りがなければ最近プレイ順に戻ります。',chars:'字',linked:'語',total:'累計',activity:'学習の記録',days:'日',min:'分',empty:'作品がまだありません',add:'ゲームを追加'},
 en:{daily:'Daily picks',streak:'best streak',figRead:'Time read',figChars:'Characters read',figWords:'Linked words',last:'Last',coverHint:'Click for details · double-click to draw',search:'Search games',read:'Read today',words:'Words saved',lookups:'Lookups',full:'Full statistics',play:'Continue',detail:'Details',all:'All games',edit:'Choose games for the home screen',title:'Games on the home screen',sub:'Drag to reorder · pin · hide',auto:'Recently played',pick:'Only my picks',pin:'Pin',hide:'Hide',close:'Close',hintAuto:'Cycles through recently played games; pinned ones lead, hidden ones never show.',hintPick:'Cycles through this order only; falls back to recently played when empty.',chars:'chars',linked:'words',total:'Total',activity:'Learning activity',days:'days',min:'min',empty:'No games yet',add:'Add game'}};

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
const backCard=()=>{const d=document.createElement('div');d.className='tv-back tv-loose';d.innerHTML=`<img src="${LOGO}" alt=""><i></i><i></i><i></i><i></i>`;return d;};
const PILE={x:-82,y:44,r:-11,s:.74,n:6};
function pileCards(pile){if(pile.childElementCount)return;for(let n=0;n<PILE.n;n++){const c=backCard();c.style.transform=`translate(${(PILE.n-1-n)*1.6}px,${(PILE.n-1-n)*2}px) rotate(${((n*37)%7-3)*.5}deg)`;pile.appendChild(c);}}
const at=(dx,dy,r,s,extra='')=>`translate(${dx}%,${dy}%) ${extra} rotate(${r}deg) rotateY(var(--turn)) scale(${s})`;
const P0=()=>at(PILE.x,PILE.y,PILE.r,PILE.s),UP=(k=1)=>`translateZ(${rnd(50,100)*k}px)`,E1='cubic-bezier(.25,.8,.25,1)',E2='cubic-bezier(.22,1,.36,1)',E3='cubic-bezier(.45,0,.25,1)',EB='cubic-bezier(.3,1.35,.5,1)';
const DRAWS={
 slide:()=>({pile:'none',f:[[0,P0()],[.14,at(PILE.x-12,PILE.y+2,PILE.r-5,PILE.s),E1],[.36,at(PILE.x*.45,PILE.y*.25-rnd(12,22),PILE.r*.3,.96,UP(.7)),E2]]}),
 flick:()=>{const sp=pickOne([-1,1])*360;return {pile:'bump',f:[[0,P0()],[.1,at(PILE.x,PILE.y-3,PILE.r+4,PILE.s*.97),E3],[.34,at(PILE.x*.5,PILE.y*.1-rnd(30,45),PILE.r+sp*.8,.9,UP(1.2)),E2],[.46,at(0,-4,sp,1.02),E1]]};},
 fan:()=>({pile:'fan',f:[[0,P0()],[.16,at(PILE.x+4,PILE.y-6,PILE.r+18,PILE.s),E1],[.26,at(PILE.x+6,PILE.y-30,PILE.r+12,PILE.s*1.05),E1],[.4,at(PILE.x*.35,PILE.y*.1-14,PILE.r*.2,.97,UP(.7)),E2]]}),
 cut:()=>({pile:'cut',f:[[0,P0()],[.18,P0(),'linear'],[.27,at(PILE.x+2,PILE.y-24,PILE.r-6,PILE.s*1.04),E1],[.4,at(PILE.x*.4,PILE.y*.15-16,PILE.r*.3,.97,UP(.7)),E2]]}),
 peel:()=>({pile:'none',f:[[0,P0()],[.15,at(PILE.x,PILE.y-4,PILE.r,PILE.s,'rotateX(38deg)'),E1],[.24,at(PILE.x+3,PILE.y-12,PILE.r+6,PILE.s*1.04,'rotateX(10deg)'),E1],[.4,at(PILE.x*.4,PILE.y*.15-18,PILE.r*.2,.97,UP(.7)),E2]]}),
 riffle:()=>({pile:'riffle',f:[[0,P0()],[.22,P0(),'linear'],[.3,at(PILE.x-4,PILE.y-18,PILE.r-10,PILE.s*1.03),E1],[.42,at(PILE.x*.4,PILE.y*.1-20,PILE.r*.2,.97,UP(.8)),E2]]}),
 bottom:()=>({pile:'lift',f:[[0,at(PILE.x,PILE.y,PILE.r,PILE.s,'translateZ(-30px)')],[.16,at(PILE.x+20,PILE.y+6,PILE.r+6,PILE.s,'translateZ(-30px)'),E1],[.28,at(PILE.x+30,PILE.y-6,PILE.r+4,PILE.s*1.02,UP(.4)),E1],[.42,at(PILE.x*.3,PILE.y*.1-12,PILE.r*.2,.98,UP(.7)),E2]]}),
 fromLeft:()=>({f:[[0,at(-190,rnd(-30,30),-25,.9)],[.42,at(6,0,4,1.01),E2]]}),
 fromRight:()=>({f:[[0,at(190,rnd(-30,30),25,.9)],[.42,at(-6,0,-4,1.01),E2]]}),
 slam:()=>({f:[[0,at(0,-170,rnd(-8,8),1.25,UP(2.5))],[.3,at(0,3,0,.97),'cubic-bezier(.6,0,.9,.5)'],[.38,at(0,-4,0,1.02),E1],[.45,at(0,1,0,1),E1]]}),
 rise:()=>({f:[[0,at(0,170,rnd(-6,6),.8)],[.4,at(0,-6,0,1.02),E2]]}),
 spinIn:()=>({f:[[0,at(0,0,pickOne([-720,720]),.05)],[.42,at(0,0,0,1.04),'cubic-bezier(.15,.8,.25,1)']]}),
 zoom:()=>({f:[[0,at(rnd(-20,20),rnd(-20,20),rnd(-20,20),3.2,UP(3))],[.12,at(0,0,0,2.4,UP(2)),'linear'],[.4,at(0,0,0,1,''),'cubic-bezier(.2,.8,.2,1)']]}),
 boomerang:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*200,-40,sx*60,.8)],[.22,at(-sx*55,10,-sx*30,.95,UP(.6)),E2],[.42,at(sx*4,0,sx*3,1),E1]]};},
 spiral:()=>{const k=pickOne([-1,1]),fr=[];for(let n=0;n<=6;n++){const a=n/6*Math.PI*2.4*k,rr=(1-n/6)*120;fr.push([n/6*.44,at(Math.cos(a)*rr,Math.sin(a)*rr*.8,(1-n/6)*k*-200,.5+n/12),n?'linear':undefined]);}return {f:fr};},
 frisbee:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-160,-120,sx*-40,.7,'rotateX(70deg)')],[.24,at(sx*-40,-50,sx*-200,.9,'rotateX(45deg) '+UP()),E2],[.44,at(0,0,0,1,'rotateX(0deg)'),E1]]};},
 behind:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(0,0,0,.8,'translateZ(-160px)')],[.2,at(sx*90,-4,sx*8,.9,'translateZ(-60px)'),E1],[.42,at(0,0,0,1,UP(.5)),E2]]};},
 portal:()=>({f:[[0,at(0,0,0,1,'scaleX(.02) scaleY(.02)')],[.18,at(0,0,0,1,'scaleX(1.05) scaleY(.03)'),E1],[.38,at(0,0,0,1,'scaleY(1.06)'),EB],[.46,at(0,0,0,1),E1]]}),
 leaf:()=>{const k=pickOne([-1,1]);return {f:[[0,at(k*-30,-180,k*-30,.9)],[.12,at(k*30,-120,k*25,.92),E3],[.24,at(k*-25,-60,k*-18,.95),E3],[.36,at(k*12,-16,k*10,.98),E3],[.46,at(0,0,0,1),E3]]};},
 dealer:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-170,140,sx*-540,.85)],[.3,at(sx*14,4,sx*6,1),'cubic-bezier(.1,.7,.3,1)'],[.42,at(0,0,0,1),E1]]};},
 elastic:()=>({f:[[0,at(0,0,0,.01)],[.2,at(0,0,rnd(-6,6),1.28),'cubic-bezier(.2,.9,.3,1)'],[.3,at(0,0,0,.9),E3],[.38,at(0,0,0,1.06),E3],[.46,at(0,0,0,1),E3]]}),
 slots:()=>({f:[[0,at(0,-320,0,1)],[.1,at(0,-140,0,1),'linear'],[.2,at(0,-30,0,1),'linear'],[.32,at(0,8,0,1),'cubic-bezier(.2,.8,.3,1)'],[.42,at(0,0,0,1),E1]]}),
 tumble:()=>({f:[[0,at(rnd(-40,40),-200,rnd(-10,10),.9,'rotateX(720deg)')],[.42,at(0,0,0,1,'rotateX(0deg)'),'cubic-bezier(.25,.8,.3,1)']]}),
 skid:()=>{const sx=pickOne([-1,1]);return {f:[[0,at(sx*-220,8,sx*-12,1)],[.22,at(sx*24,2,sx*6,1),'cubic-bezier(.1,.8,.3,1)'],[.34,at(sx*-5,0,sx*-2,1),E3],[.44,at(0,0,0,1),E1]]};},
 heli:()=>{const k=pickOne([-1,1]);return {f:[[0,at(rnd(-30,30),-190,0,.6,UP(1.5))],[.42,at(0,0,k*1080,1),'cubic-bezier(.2,.6,.3,1)']]};}};
const PILE_IN=620;
function pileMotion(pile,kind,total,delay){const cards=[...pile.children],top=cards[cards.length-1],rest=cards.slice(0,-1),base=c=>c.style.transform;
 pile.getAnimations().forEach(x=>x.cancel());const inMs=PILE_IN,from=pickOne([['-120%','70%',-28],['-50%','130%',-10],['60%','110%',18]]);pile.animate([{opacity:0,translate:`${from[0]} ${from[1]}`,rotate:`${from[2]}deg`,scale:'.85',easing:'cubic-bezier(.3,.75,.3,1)'},{opacity:1,translate:'0 0',rotate:'0deg',scale:'1',offset:inMs/(inMs+total),easing:'linear'},{opacity:1,translate:'0 0',rotate:'0deg',scale:'1',offset:(inMs+total*.42)/(inMs+total),easing:'cubic-bezier(.4,0,.6,1)'},{opacity:0,translate:'-8% 14%',rotate:'-6deg',scale:'.94',offset:(inMs+total*.62)/(inMs+total),easing:'linear'},{opacity:0,translate:'-8% 14%',rotate:'-6deg',scale:'.94'}],{duration:inMs+total,delay:Math.max(0,delay-inMs),easing:'linear',fill:'both'});
 cards.forEach((c,n)=>c.animate([{opacity:0,translate:'0 -34px',rotate:`${(n%2?1:-1)*6}deg`},{opacity:1,translate:'0 0',rotate:'0deg'}],{duration:320,delay:Math.max(0,delay-inMs)+180+n*55,easing:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'}));
 const hid=kind==='lift'?cards[0]:top;hid.animate([{opacity:0},{opacity:0}],{duration:total*.85,delay,fill:'backwards'});
 const wob=(c,kf,o)=>c.animate(kf,{duration:total*.5,delay,easing:E1,fill:'backwards',...o});
 if(kind==='fan')rest.forEach((c,n)=>{const k=n-(rest.length-1)/2;wob(c,[{transform:base(c)},{transform:`${base(c)} rotate(${k*9}deg) translateX(${k*6}px)`,offset:.35},{transform:`${base(c)} rotate(${k*9}deg) translateX(${k*6}px)`,offset:.6},{transform:base(c)}]);});
 if(kind==='cut')rest.forEach((c,n)=>{const up=n>=rest.length/2;wob(c,[{transform:base(c)},{transform:`${base(c)} translate(${up?-22:22}px,${up?-6:4}px) rotate(${up?-6:5}deg)`,offset:.4},{transform:`${base(c)} translate(${up?-22:22}px,${up?-6:4}px) rotate(${up?-6:5}deg)`,offset:.6},{transform:base(c)}]);});
 if(kind==='riffle')rest.forEach((c,n)=>{const sx=n%2?1:-1;wob(c,[{transform:base(c)},{transform:`${base(c)} translateX(${sx*26}px) rotate(${sx*4}deg)`,offset:.2+n*.03},{transform:base(c),offset:.45+n*.04},{transform:base(c)}]);});
 if(kind==='lift')cards.slice(1).forEach(c=>wob(c,[{transform:base(c)},{transform:`${base(c)} translateY(-8px)`,offset:.3},{transform:`${base(c)} translateY(-8px)`,offset:.55},{transform:base(c)}]));
 if(kind==='bump')rest.forEach((c,n)=>{c.animate([{transform:base(c)},{transform:`${base(c)} translateY(3px)`,offset:.3},{transform:base(c)}],{duration:260,delay:delay+total*.1+n*12,easing:'ease-out'});});}
const parsePose=(dx,dy,r,s,extra='')=>{const g=(re,d)=>{const m=extra.match(re);return m?parseFloat(m[1]):d;};return {x:dx,y:dy,r,s,z:g(/translateZ\((-?[\d.]+)px\)/,0),rx:g(/rotateX\((-?[\d.]+)deg\)/,0),sx:g(/scaleX\((-?[\d.]+)\)/,1),sy:g(/scaleY\((-?[\d.]+)\)/,1)};};
const FEELS={soft:{k:120,c:16,lead:1.15,drag:.05},fluid:{k:190,c:21,lead:1,drag:.04},snappy:{k:320,c:27,lead:.85,drag:.03},crisp:{k:700,c:52,lead:.72,drag:.012}};
function springTrack(targets,feel){const ch=['x','y','r','s','z','rx','ry','sx','sy'],pos={...targets[0].p},vel=Object.fromEntries(ch.map(k=>[k,0])),dt=1/240,out=[];let ti=0,t=0,settled=0;const last=targets[targets.length-1].at;
 while(t<last+3){while(ti+1<targets.length&&targets[ti+1].at<=t)ti++;const tg=targets[ti].p,k=targets[ti].k||feel.k,c=targets[ti].c||feel.c;let moving=false;
  for(const n of ch){const a=k*(tg[n]-pos[n])-c*vel[n];vel[n]+=a*dt;pos[n]+=vel[n]*dt;if(Math.abs(tg[n]-pos[n])>(n==='s'||n==='sx'||n==='sy'?.002:.15)||Math.abs(vel[n])>(n==='s'||n==='sx'||n==='sy'?.01:1))moving=true;}
  if(Math.round(t/dt)%4===0)out.push({t,p:{...pos},v:{x:vel.x,y:vel.y}});
  t+=dt;if(t>last&&!moving){if(++settled>12)break;}else settled=0;}
 return out;}
function deal(cover,background,animate,mode='draw'){const flip=cover.querySelector('.tv-flip'),face=cover.querySelector('.tv-face'),artEl=cover.querySelector('.tv-art'),backFace=flip.querySelector('.tv-back'),pile=cover.parentNode.querySelector('.tv-pile');cover.querySelectorAll('.tv-old,.tv-sheen').forEach(n=>n.remove());[flip,face,backFace,...(pile?[pile,...pile.children]:[])].forEach(el=>el.getAnimations().forEach(x=>x.cancel()));
 if(!animate||matchMedia('(prefers-reduced-motion:reduce)').matches||!artEl.style.background){artEl.style.background=background;return 0;}
 if(mode==='fade'){const fresh=document.createElement('div');fresh.className='tv-old';fresh.style.background=background;cover.appendChild(fresh);const a=fresh.animate([{opacity:0,filter:'blur(10px) saturate(.6)',transform:'scale(1.04)'},{opacity:1,filter:'blur(0) saturate(1)',transform:'none'}],{duration:760,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});a.finished.then(()=>{artEl.style.background=background;fresh.remove();},()=>fresh.remove());return 260;}
 const outDir=rnd(0,Math.PI*2),outDur=rnd(360,460);
 const old=document.createElement('div');old.className='tv-old';old.style.background=artEl.style.background;cover.appendChild(old);
 old.animate([{transform:'none',opacity:1},{transform:`translate(${Math.cos(outDir)*18}%,${Math.sin(outDir)*14}%) rotate(${rnd(-12,12)}deg) scale(.97)`,opacity:.9,offset:.35},{transform:`translate(${Math.cos(outDir)*rnd(120,160)}%,${Math.sin(outDir)*rnd(90,120)}%) rotate(${rnd(-50,50)}deg) scale(${rnd(.75,.9)})`,opacity:0}],{duration:outDur,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'}).finished.then(()=>old.remove(),()=>old.remove());
 artEl.style.background=background;
 const names=Object.keys(DRAWS),name=names.filter(n=>n!==cover.dataset.draw)[Math.floor(Math.random()*(names.length-1))],style=DRAWS[name](),feelName=pickOne(['soft','fluid','fluid','snappy','snappy','crisp']),feel=FEELS[feelName];
 const side=Math.random()<.5?-1:1,turn=180*side,tilt=rnd(-4,4),lift=rnd(50,100),over=rnd(1.04,1.09),T=rnd(1.05,1.3)*feel.lead,gap=outDur*.25/1000;
 const targets=style.f.map(([t,s])=>{const m=s.match(/translate\((-?[\d.]+)%,(-?[\d.]+)%\)\s*(.*?)\s*rotate\((-?[\d.]+)deg\)\s*rotateY\(var\(--turn\)\)\s*scale\((-?[\d.]+)\)/);const p=m?parsePose(+m[1],+m[2],+m[4],+m[5],m[3]):parsePose(0,0,0,1);p.ry=turn;return {at:t*T,p};});
 const slot={x:0,y:0,r:tilt,s:1,z:0,rx:0,ry:turn,sx:1,sy:1},tf=.52*T;
 targets.push({at:tf,p:{...slot}},{at:tf+.12,p:{...slot,z:lift,s:over,ry:0,r:tilt*.4},k:feel.k*.9},{at:tf+.42,p:{x:0,y:0,r:0,s:1,z:0,rx:0,ry:0,sx:1,sy:1}});
 const track=springTrack(targets,feel),total=track[track.length-1].t*1000;
 const frames=track.map(({t,p,v})=>{const lean=Math.max(-14,Math.min(14,v.x*feel.drag)),pitch=Math.max(-12,Math.min(12,-v.y*feel.drag*.8));return {offset:Math.min(1,t*1000/total),transform:`translate(${p.x.toFixed(2)}%,${p.y.toFixed(2)}%) translateZ(${p.z.toFixed(1)}px) rotateX(${(p.rx+pitch).toFixed(2)}deg) rotate(${(p.r+lean).toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale(${p.s.toFixed(4)}) scaleX(${p.sx.toFixed(3)}) scaleY(${p.sy.toFixed(3)})`};});
 frames[0].offset=0;frames[frames.length-1]={offset:1,transform:'none'};
 const swapAt=track.find(f=>Math.abs(f.p.ry)<90)?.t*1000||total*.7,mid=Math.min(.999,swapAt/total),delay=gap*1000+(style.pile&&pile?PILE_IN:0),timing={duration:total,delay,easing:'linear',fill:'backwards'};
 if(pile&&style.pile){pileCards(pile);pileMotion(pile,style.pile,total,delay);}
 flip.animate(frames,timing);
 face.animate([{opacity:0},{opacity:0,offset:mid},{opacity:1,offset:Math.min(1,mid+.001)},{opacity:1}],timing);
 backFace.animate([{opacity:1},{opacity:1,offset:mid},{opacity:0,offset:Math.min(1,mid+.001)},{opacity:0}],{...timing,fill:'both'}).finished.then(()=>backFace.getAnimations().forEach(x=>x.cancel()),()=>{});
 const sheen=document.createElement('i');sheen.className='tv-sheen';face.appendChild(sheen);sheen.style.setProperty('--sa',rnd(95,135)+'deg');
 sheen.animate([{backgroundPosition:'120% 0',opacity:0},{opacity:1,offset:.3},{backgroundPosition:'-40% 0',opacity:0}],{duration:rnd(700,950),delay:delay+swapAt,easing:'ease-out',fill:'both'}).finished.then(()=>sheen.remove(),()=>sheen.remove());
 cover.dataset.draw=name;cover.dataset.feel=feelName;
 return delay+swapAt;}

export const DRAW_NAMES=Object.keys(DRAWS);

function fitTitle(h){const max=Math.min(128,Math.max(44,innerWidth*.074));let size=max;h.style.fontSize=size+'px';const limit=()=>h.scrollHeight>size*1.12*(h.textContent.length>18?3:2)+size*.3||h.scrollWidth>h.clientWidth+2;while(limit()&&size>26){size-=4;h.style.fontSize=size+'px';}}

function tweenFig(el,to,fmt){if(!el)return;const from=+el.dataset.v||0;el.dataset.v=to;cancelAnimationFrame(+el.dataset.raf||0);if(matchMedia('(prefers-reduced-motion:reduce)').matches||from===to){el.textContent=fmt(to);return;}const t0=performance.now(),dur=900;const tick=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,4);el.textContent=fmt(from+(to-from)*e);if(k<1)el.dataset.raf=requestAnimationFrame(tick);};el.dataset.raf=requestAnimationFrame(tick);setTimeout(()=>{if(+el.dataset.v===to)el.textContent=fmt(to);},dur+80);}

let glowTimer=0;
function glowTo(fn,g){if(!fn)return;const layer=document.querySelector('.grimoire-glow');if(!layer||!layer.classList.contains('ready')){fn(g);return;}clearTimeout(glowTimer);layer.style.transition='opacity .45s cubic-bezier(.4,0,.2,1)';layer.style.opacity='0';glowTimer=setTimeout(()=>{fn(g);layer.style.transition='opacity 1.1s cubic-bezier(.22,1,.36,1)';layer.style.opacity='';},460);}

function cardify(card){const face=card.querySelector('.tv-face');let pressed=false,last=null;
 const set=(x,y)=>{const depth=pressed?1.6:1,rx=(.5-y)*20*depth,ry=(x-.5)*20*depth;face.style.transform=`rotateX(${rx}deg) rotateY(${ry}deg) scale(${pressed?.96:1.03})`;face.style.setProperty('--px',`${x*100}%`);face.style.setProperty('--py',`${y*100}%`);face.style.setProperty('--hue',`${Math.round(x*360)}deg`);};
 card.addEventListener('pointerenter',()=>{card.classList.add('touch');face.style.transition='transform .12s ease-out';});
 card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();last=[Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))];set(...last);});
 card.addEventListener('pointerdown',()=>{pressed=true;if(last)set(...last);});
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
  <div class="tv-plane" data-z="0"><div class="tv-slices"></div><div class="tv-script"></div></div>
  <div class="tv-plane" data-z="60"><div class="tv-pile" aria-hidden="true"></div><div class="tv-cover tv-card"><div class="tv-flip"><div class="tv-face"><div class="tv-art"></div><i class="tv-foil"></i><i class="tv-glare"></i></div><div class="tv-back"><img src="${LOGO}" alt=""><i></i><i></i><i></i><i></i></div></div></div></div></div>
  <div class="tv-scan"></div><div class="tv-grain"></div><div class="tv-marks"><i></i><i></i><i></i><i></i></div><div class="tv-scene"></div>
  <div class="tv-left"><div class="tv-clock"><span>${esc(date)}</span><b>${esc(greeting)}</b></div><div class="tv-heat-card tv-card"><div class="tv-face"><button class="tv-heatlink" data-go="activity"></button><div class="tv-heat"></div><div class="tv-heatsum"></div><button class="tv-daily" data-go="daily"><i aria-hidden="true"></i><span class="tv-daily-k">${w.daily}</span><span class="tv-daily-t"></span><small>→</small></button><i class="tv-glare"></i></div></div></div>
  
  <div class="tv-figs"><button class="tv-fig" data-go="statistics"><b data-fig="time">0m</b><small>${w.figRead}</small></button><button class="tv-fig" data-go="detail"><b data-fig="chars">0</b><small>${w.figChars}</small></button><button class="tv-fig" data-go="words"><b data-fig="words">0</b><small>${w.figWords}</small></button><button class="tv-more" data-go="statistics">${w.full} →</button></div>
  <div class="tv-title"><div class="tv-ruby"></div><div class="tv-h1" role="heading" aria-level="1"></div><div class="tv-meta"></div></div>
  <div class="tv-rail"></div>
  <div class="tv-dialog"><span class="tv-who"></span><span class="tv-line"></span><div class="tv-act"><button class="tv-btn primary tv-play" data-act="play"><i class="tv-play-ic" aria-hidden="true"></i><span class="tv-play-tx"><b>${w.play}</b><small class="tv-play-sub"></small></span></button><button class="tv-btn" data-act="detail">${w.detail}</button><button class="tv-btn" data-go="library">${w.all}</button></div></div>
  <section class="tv-drawer" aria-label="${w.title}"><h2>${w.title} <small>${w.sub}</small></h2><button class="tv-close">${w.close} ✕</button><div class="tv-mode"><button data-m="auto">${w.auto}</button><button data-m="pick">${w.pick}</button><input class="tv-search" type="search" placeholder="${w.search}" aria-label="${w.search}"></div><div class="tv-list"></div><div class="tv-hint"></div></section></div>`;
 const root=main.querySelector('.tv-home'),$=s=>root.querySelector(s);
 live={root,timer:0,beat:0,typer:0,move:null};
 const art=(g,p)=>g.cover?`url("${String(g.cover).replace(/"/g,'%22')}") center/cover`:`linear-gradient(160deg,${p[0]},${p[2]} 70%)`;
 root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>{const to=b.dataset.go;if(to==='detail'){if(shown)onDetail(shown.id);return;}if(to==='words')navigate('learning','words');else if(to==='activity')navigate('statistics');else navigate(to);}));
 if(!list.length){$('.tv-h1').textContent=w.empty;$('.tv-act').innerHTML=model.games.length?'':`<button class="tv-btn primary" data-act="add">${icon('plus')}${w.add}</button>`;$('[data-act="add"]')?.addEventListener('click',onAdd);root.classList.add('empty');}
 $('[data-act="play"]')?.addEventListener('click',e=>shown&&onLaunch(shown.id,e.currentTarget));
 $('[data-act="detail"]')?.addEventListener('click',()=>shown&&onDetail(shown.id));
 const type=s=>{clearInterval(live.typer);let n=0;const line=$('.tv-line');line.textContent='';if(!s)return;live.typer=setInterval(()=>{line.textContent='「'+s.slice(0,++n)+(n<s.length?'':'」');if(n>=s.length)clearInterval(live.typer);},55);};
 const max=Math.max(1,...model.games.map(g=>g.characters||0));
 async function paint(i,flash=true,mode='draw'){
  const g=typeof i==='object'?i:list[i];if(!root.isConnected){if(live?.root===root)stopHomeTV();return;}if(!g||!live||live.root!==root)return;shown=g;cur=list.indexOf(g);const mine=++token;
  const started=performance.now(),reveal=deal($('.tv-cover'),art(g,['#3b2a26','#3b2a26','#1a1110']),flash,mode);
  const [p,d]=await Promise.all([palette(g),detail(api,g.id,locale)]);if(mine!==token||!live||live.root!==root)return;
  const wait=flash?Math.max(0,reveal-(performance.now()-started)):0;if(wait){await new Promise(r=>setTimeout(r,wait));if(mine!==token||!live||live.root!==root)return;}
  glowTo(ctx.onGame,g);root.style.setProperty('--tv-a',p[0]);root.style.setProperty('--tv-b',p[1]);root.style.setProperty('--tv-c',p[2]);
  const k=(g.title.length*37+pool.indexOf(g)*13)%60,saved=(d.sentences||[]).map(s=>String(s.text||'').trim()).filter(Boolean),sentences=(saved.length?saved:(d.recentLines||[]).map(s=>String(s.text||'').trim()).filter(Boolean).slice(-6)).slice(0,8),words=(d.words||[]).filter(x=>x.spelling).slice(0,10),sessions=d.sessions||[];
  $('.tv-kana').textContent=[...g.title].find(c=>/[一-鿿぀-ヿ]/.test(c))||([...g.title].find(c=>/[A-Za-z0-9]/.test(c))||g.title.slice(0,1)).toUpperCase();
  if(!g.cover)$('.tv-art').style.background=art(g,p);$('.tv-play-sub').textContent=g.lastPlayedAt?`${w.last} · ${relativeTime(g.lastPlayedAt)}`:'';
  const pct=Math.max(.02,Math.min(1,(g.characters||0)/max)),N=72,ring=$('.tv-ring');ring.style.left=(44+k%14)+'%';const on=Math.round(pct*N),ang=pct*360-90,ex=50+46*Math.cos(ang*Math.PI/180),ey=50+46*Math.sin(ang*Math.PI/180);
  ring.innerHTML=`<svg viewBox="0 0 100 100"><defs><path id="tvarc" d="M50,50 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0"/><linearGradient id="tvgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--g-gold)"/><stop offset="1" stop-color="var(--tv-a)"/></linearGradient></defs><circle class="halo" cx="50" cy="50" r="46"/>${Array.from({length:N},(_,t)=>{const a=t/N*2*Math.PI-Math.PI/2,big=t%6===0,r1=big?42.5:43.6,r2=48;return `<line class="tick${t<on?' on':''}" style="--d:${t*14}ms" x1="${(50+r1*Math.cos(a)).toFixed(2)}" y1="${(50+r1*Math.sin(a)).toFixed(2)}" x2="${(50+r2*Math.cos(a)).toFixed(2)}" y2="${(50+r2*Math.sin(a)).toFixed(2)}"/>`;}).join('')}<circle class="head" cx="${ex.toFixed(2)}" cy="${ey.toFixed(2)}" r="1.1"/><text class="arc-label"><textPath href="#tvarc" startOffset="2%">${number(g.characters||0)} ${w.chars} · ${esc(duration(g.readingSeconds))}</textPath></text></svg>`;
  const script=$('.tv-script');script.innerHTML=sentences.slice(-5).map((t,n)=>`<p class="${n?'':'on'}" data-n="${n}"><span class="tv-sno">${String(n+1).padStart(2,'0')}</span>${esc(t)}</p>`).join('');script.querySelectorAll('p').forEach(el=>el.addEventListener('pointerenter',()=>{script.querySelectorAll('p').forEach(x=>x.classList.toggle('on',x===el));type(sentences[+el.dataset.n]);}));
  const now=Date.now(),span=40*864e5,big=Math.max(1,...sessions.map(s=>s.active_seconds||0))*.6;$('.tv-tl').innerHTML=sessions.filter(s=>now-s.started_at*1000<span).map(s=>{const y=10+((now-s.started_at*1000)/span)*70,long=(s.active_seconds||0)>=big;return `<b class="${long?'big':''}" style="top:${y}%"></b>`+(long?`<span style="top:${y}%">${new Date(s.started_at*1000).toLocaleDateString(undefined,{month:'numeric',day:'numeric'})} · ${Math.round((s.active_seconds||0)/60)}${w.min}</span>`:'');}).join('');
  $('.tv-slices').innerHTML=Array.from({length:5},(_,j)=>`<i style="background:${art(g,p)};background-size:500% 100%;background-position:${j*25}% 0;transform:translateZ(${j%2?40:-20}px) translateY(${(j-2)*12}px)"></i>`).join('');

  const no=String(Math.max(1,pool.indexOf(g)+1)).padStart(2,'0');$('.tv-index').textContent=no;$('.tv-scene').innerHTML=`SCENE <b>${no}</b> / ${String(pool.length).padStart(2,'0')}`;
  const t=$('.tv-title');t.classList.remove('in');setTimeout(()=>{if(mine!==token)return;$('.tv-ruby').textContent=g.engine||'';let n=0;$('.tv-h1').innerHTML=(String(g.title).match(/[A-Za-z0-9À-ɏ'’:;!?.,&\-]+|\s+|./gu)||[]).map(word=>/^\s+$/.test(word)?' ':`<i class="w">${[...word].map(c=>`<span style="transition-delay:${(n++)*28}ms">${esc(c)}</span>`).join('')}</i>`).join('');$('.tv-h1').title=g.title;$('.tv-meta').innerHTML=g.lastPlayedAt?`<span>${w.last} · ${esc(relativeTime(g.lastPlayedAt))}</span>`:'';void t.offsetWidth;fitTitle($('.tv-h1'));setTimeout(()=>t.classList.add('in'),30);},flash?Math.max(0,reveal-(performance.now()-started)):0);
  tweenFig($('[data-fig="time"]'),g.readingSeconds||0,v=>mins(v));tweenFig($('[data-fig="chars"]'),g.characters||0,v=>number(Math.round(v)));tweenFig($('[data-fig="words"]'),g.learnedWords||0,v=>number(Math.round(v)));
  $('.tv-who').textContent=g.title;type(sentences[0]||'');
  
  rail();
 }
 function rail(){const r=$('.tv-rail');r.innerHTML=list.map((g,i)=>`<button class="tv-chip${i===cur?' on':''}" data-i="${i}" title="${esc(g.title)}" style="--dur:${DUR}ms">${g.cover?`<img src="${esc(g.cover)}" alt="">`:''}${setting.pinned.includes(g.id)?'<span class="pin"></span>':''}<span class="bar"></span></button>`).join('')+`<button class="tv-edit" title="${w.edit}" aria-label="${w.edit}">＋</button>`;
  r.querySelectorAll('.tv-chip').forEach(b=>b.addEventListener('click',()=>paint(+b.dataset.i,true,'fade')));r.querySelector('.tv-edit').addEventListener('click',()=>{drawer();$('.tv-drawer').classList.add('open');});}
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
 api('daily_view',{}).then(v=>{if(!live||live.root!==root)return;const n=v?.news?.items?.[0],h=v?.words?.words?.[0],t=$('.tv-daily-t');if(n){t.textContent=n.title;t.title=n.title+(n.source?' · '+n.source:'');}else if(h){t.textContent=h.term+(h.gloss?' · '+h.gloss:'');}}).catch(()=>{});
 api('learning_activity',{range:'year'}).then(records=>{if(!live||live.root!==root)return;const all=activityCells(Array.isArray(records)?records:[]);let from=Math.max(0,all.length-20*7);while(from>0&&all[from].weekday!==0)from--;const cells=all.slice(from),active=cells.filter(c=>c.level).length;$('.tv-heat').innerHTML=cells.map((c,i)=>`<i style="grid-row:${c.weekday+1};grid-column:${Math.floor(i/7)+1}" class="${i===cells.length-1?'today':c.level?'l'+Math.min(3,c.level):''}" title="${esc(c.day)} · ${Math.round((c.seconds||0)/60)} ${w.min}"></i>`).join('');$('.tv-heatlink').textContent=`${w.activity} · ${active} ${w.days} →`;let run=0,best=0;for(const c of cells){run=c.level?run+1:0;best=Math.max(best,run);}const secs=cells.reduce((a,c)=>a+(c.seconds||0),0);$('.tv-heatsum').innerHTML=`<span><b>${active}</b>${w.days}</span><span><b>${esc(duration(secs))}</b>${w.total}</span><span><b>${best}</b>${w.streak}</span>`;}).catch(()=>{});
 const canvas=$('.tv-canvas'),planes=[...root.querySelectorAll('.tv-plane')],reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 live.move=e=>{if(reduced)return;const r=root.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;canvas.style.transform=`rotateY(${x*6}deg) rotateX(${-y*5}deg)`;planes.forEach(p=>p.style.transform=`translate3d(${-x*p.dataset.z*.25}px,${-y*p.dataset.z*.2}px,${p.dataset.z}px)`);};
 root.addEventListener('mousemove',live.move);
 root.querySelectorAll('.tv-cover,.tv-heat-card').forEach(cardify);
 root.addEventListener('mouseleave',()=>{canvas.style.transform='';});
 const coverEl=$('.tv-cover');let clickTimer=0;coverEl.title=w.coverHint;coverEl.addEventListener('click',()=>{clearTimeout(clickTimer);clickTimer=setTimeout(()=>shown&&onDetail(shown.id),260);});coverEl.addEventListener('dblclick',e=>{e.preventDefault();clearTimeout(clickTimer);if(pool.length>1)paint(randomGame());});
 if(list.length)paint(0,false);
 return stopHomeTV;
}
