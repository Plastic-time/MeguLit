/* 2026-11-13 (user: 右下封面条改成卡牌游戏的「手牌」) the showcase games sit as a hand of cards on an arc along the bottom right; the hovered card
   lifts while its neighbours give way, and picking one plays a card: the field card flies back into its slot (收牌) and the picked one flies onto the
   field (出牌). Ten flight styles share one spring (same mass and damping), are picked at random without repeating, can be interrupted from their
   current pose, and move only transform/opacity. */

export const HAND_VARIANTS=['toss','flip','swing','slap','fan','dive','sidetilt','trail','pull','diag'];

/* quadratic arc rising from bottom-middle-left, peaking above the old cover strip and falling into the bottom-right corner (container units) */
export function arcPoint(t,W,H){const P0=[.0*W,1.04*H],P1=[.58*W,-.36*H],P2=[.97*W,.74*H],u=1-t,
 x=u*u*P0[0]+2*u*t*P1[0]+t*t*P2[0],y=u*u*P0[1]+2*u*t*P1[1]+t*t*P2[1],dx=2*u*(P1[0]-P0[0])+2*t*(P2[0]-P1[0]),dy=2*u*(P1[1]-P0[1])+2*t*(P2[1]-P1[1]);
 return {x,y,a:Math.atan2(dy,dx)*180/Math.PI};}

/* positions for n cards; hover lifts one card and pushes the others aside along the arc */
export function handLayout(n,{W,H,cw,hover=-1}){if(n<=0)return [];const ch=cw*4/3,step=Math.min(.082,(.9-.16)/Math.max(1,n-1)),mid=.6,start=mid-step*(n-1)/2;
 return Array.from({length:n},(_,j)=>{let t=start+step*j;if(hover>=0&&j!==hover){const d=j-hover;t+=Math.sign(d)*.04*Math.exp(-(Math.abs(d)-1)*.55);}
  const p=arcPoint(Math.max(0,Math.min(1,t)),W,H),a=p.a*.82;if(j!==hover)return {x:p.x,y:p.y,a,s:1,z:j};
  const rad=(a-90)*Math.PI/180;return {x:p.x+Math.cos(rad)*ch*.32,y:p.y+Math.sin(rad)*ch*.32,a:a*.3,s:1.34,z:999};});}

/* step response of a damped spring at normalised time q (0..1 of the flight) */
export function springAt(q,{zeta=.74,omega=11,T=.74}={}){const t=q*T;if(t<=0)return 0;const wd=omega*Math.sqrt(1-zeta*zeta),e=Math.exp(-zeta*omega*t);
 return 1-e*(Math.cos(wd*t)+zeta*omega/wd*Math.sin(wd*t));}

const lerp=(a,b,k)=>a+(b-a)*k,ease=q=>1-Math.pow(1-q,3),bell=q=>Math.sin(Math.PI*Math.max(0,Math.min(1,q)));
/* pose of a flight of `kind` from A to B at normalised time q; poses are {x,y,r,s,rx,ry,o} in root pixels */
export function flightPose(kind,A,B,q){const dx=B.x-A.x,dy=B.y-A.y,dist=Math.hypot(dx,dy)||1;let nx=-dy/dist,ny=dx/dist;if(ny>0){nx=-nx;ny=-ny;}
 const take=B.s<A.s,spring=kind==='pull'?{zeta:.62,omega:10}:kind==='slap'?{zeta:.68,omega:13}:{};let p=springAt(q,spring),from=A,lift=0,side=0,s0=0,r0=0,rx=0,ry=0;
 if(kind==='dive'){const h=take?.3:.2,dy0=take?60:-34,ds=take?.9:1.05;if(q<h){const k=ease(q/h);return {x:A.x,y:A.y+dy0*k,r:A.r*(1-k*.6),s:A.s*(1+(ds-1)*k),rx:-8*k,ry:0,o:1};}from={...A,y:A.y+dy0,r:A.r*.4,s:A.s*ds};
  p=springAt((q-h)/(1-h),{zeta:.7,omega:12});rx=-8*(1-Math.min(1,p));}
 const b=bell(Math.min(1,p));
 switch(kind){case 'toss':lift=.34;r0=-10*bell(q);break;case 'flip':{lift=.18;const k=Math.min(1,q/.38);ry=360*(k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2);s0=.03*b;break;}
  case 'swing':lift=.14;r0=14*Math.sin(2*Math.PI*q)*(1-q)*Math.sign(dx||1);break;case 'slap':lift=.06;side=take?.1:0;s0=.035*bell(Math.min(1,q*1.25));rx=8*bell(q);break;
  case 'fan':lift=-.13;r0=-16*bell(q);break;case 'sidetilt':side=.16;ry=-22*bell(q)*Math.sign(dx||1);rx=6*bell(q);break;case 'trail':lift=.24;r0=-6*bell(q);break;
  case 'pull':{const back=q<.34?Math.sin(Math.PI*q/.34)*.07:0;from={...A,x:A.x-dx*back,y:A.y-dy*back};break;}
  case 'diag':rx=16*bell(q);r0=11*bell(q)*Math.sign(dx||1);break;default:break;}
 const x=lerp(from.x,B.x,p)+nx*dist*lift*b+ny*dist*side*b*(dx>0?1:-1),y=lerp(from.y,B.y,p)+ny*dist*lift*b-nx*dist*side*b*(dx>0?1:-1);
 /* growing onto the field the size leads the travel a little (ease-out), shrinking into the hand it follows it */
 const sp=B.s>from.s&&kind!=='dive'?springAt(q,{zeta:.8,omega:12.5}):p;
 return {x,y,r:lerp(from.r,B.r,p)+r0,s:Math.max(.05,lerp(from.s,B.s,sp)*(1+s0)),rx,ry,o:1};}

export function flightFrames(kind,A,B,steps=30){return Array.from({length:steps+1},(_,i)=>flightPose(kind,A,B,i/steps));}
export function samplePose(frames,k){const f=Math.max(0,Math.min(1,k))*(frames.length-1),i=Math.floor(f),j=Math.min(frames.length-1,i+1),u=f-i,a=frames[i],b=frames[j];
 return Object.fromEntries(Object.keys(a).map(key=>[key,lerp(a[key],b[key],u)]));}
/* random flight style, never the same twice running */
export function pickVariant(last,rnd=Math.random){const pool=HAND_VARIANTS.filter(v=>v!==last);return pool[Math.floor(rnd()*pool.length)%pool.length];}
export function poseTransform(p,W,H){return `perspective(2200px) translate3d(${(p.x-W/2).toFixed(2)}px,${(p.y-H/2).toFixed(2)}px,0) rotate(${p.r.toFixed(2)}deg) rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale(${p.s.toFixed(4)})`;}

/* the live hand. opts: {root,box,layer,cover,art(g),back,reduced,onPlay(g,kind),onLand(g),extras:[{html,cls,onClick}]} */
export function createHand(opts){const {root,box,layer,cover,art,back='',onPlay,onLand}=opts,reduced=!!opts.reduced;
 const st={games:[],cards:new Map(),out:null,hover:-1,flights:new Map(),last:null,extras:[]};
 const metrics=()=>{const W=box.clientWidth,H=box.clientHeight,cw=Math.max(66,Math.min(118,innerWidth*.058));return {W,H,cw,ch:cw*4/3};};
 const inHand=()=>st.games.filter(g=>g.id!==st.out);
 function layout(){const m=metrics(),hand=inHand(),n=hand.length+st.extras.length,pos=handLayout(n,{...m,hover:st.hover});box.style.setProperty('--cw',m.cw+'px');
  hand.forEach((g,j)=>place(st.cards.get(g.id),pos[j],m));st.extras.forEach((el,k)=>place(el,pos[hand.length+k],m));
  const o=st.out&&st.cards.get(st.out);if(o){const j=Math.max(0,st.games.findIndex(g=>g.id===st.out)-1),p=pos[Math.min(j,pos.length-1)]||{x:m.W/2,y:m.H,a:0,s:1,z:0};
   place(o,{...p,s:.9},m);}return {pos,m};}
 function place(el,p,m){if(!el||!p)return;el.style.zIndex=String(p.z);el.dataset.a=p.a;el.style.transform=`translate3d(${(p.x-m.cw/2).toFixed(1)}px,${(p.y-m.ch/2).toFixed(1)}px,0) rotate(${p.a.toFixed(2)}deg) scale(${p.s})`;}
 /* pose of a game's slot in root pixels, from the layout numbers (not from a card that may be mid-transition) */
 function slotPose(id,W){const {pos,m}=st.lastLayout||layout(),j=inHand().findIndex(g=>g.id===id);const p=pos[j];if(!p)return null;const br=box.getBoundingClientRect(),
  rr=root.getBoundingClientRect();
  return {x:br.left-rr.left+p.x,y:br.top-rr.top+p.y,r:p.a,s:m.cw/W,rx:0,ry:0,o:1};}
 function coverPose(){const r=cover.getBoundingClientRect(),rr=root.getBoundingClientRect();return {x:r.left-rr.left+r.width/2,y:r.top-rr.top+r.height/2,r:-4,s:1,rx:0,ry:0,o:1};}
 function relayout(){st.lastLayout=layout();}
 function render(games,outId){st.games=games.slice();st.out=outId;const keep=new Set(games.map(g=>g.id));
  for(const [id,el] of st.cards)if(!keep.has(id)){el.remove();st.cards.delete(id);}
  games.forEach(g=>{let el=st.cards.get(g.id);if(!el){el=document.createElement('button');el.type='button';el.className='tv-hc';el.dataset.id=g.id;
   el.innerHTML=`<span class="tv-hc-face"></span>`;el.querySelector('.tv-hc-face').style.background=art(g);el.addEventListener('click',()=>play(g.id));
   el.addEventListener('pointerenter',()=>hoverTo(el));el.addEventListener('focus',()=>hoverTo(el));el.addEventListener('blur',()=>hoverTo(null));box.appendChild(el);st.cards.set(g.id,el);}
   el.title=g.title;el.setAttribute('aria-label',g.title);el.classList.toggle('is-out',g.id===st.out);el.classList.toggle('pinned',!!g.pinned);});
  relayout();}
 function setExtras(list){st.extras.forEach(e=>e.remove());st.extras=list.map(x=>{const el=document.createElement('button');el.type='button';el.className='tv-hc tv-hc-extra '+(x.cls||'');
  el.innerHTML=x.html;el.title=x.title||'';el.setAttribute('aria-label',x.title||'');el.addEventListener('click',x.onClick);el.addEventListener('pointerenter',()=>hoverTo(el));box.appendChild(el);return el;});relayout();}
 function hoverTo(el){const all=[...inHand().map(g=>st.cards.get(g.id)),...st.extras],i=el?all.indexOf(el):-1;if(i===st.hover)return;st.hover=i;relayout();}
 box.addEventListener('pointerleave',()=>hoverTo(null));
 function ghostFor(id,g){let f=st.flights.get(id);if(f){f.anims.forEach(a=>a.cancel());return f;}const W=cover.offsetWidth,H=cover.offsetHeight,el=document.createElement('div');
  el.className='tv-ghost';el.style.width=W+'px';el.style.height=H+'px';el.innerHTML=`<i class="tv-ghost-face"></i><i class="tv-ghost-back">${back}</i>`;el.firstChild.style.background=art(g);
  layer.appendChild(el);f={el,W,H,anims:[],frames:null,t0:0,dur:1,trails:[]};st.flights.set(id,f);return f;}
 function currentPose(f){return f.frames?samplePose(f.frames,(performance.now()-f.t0)/f.dur):null;}
 function fly(id,g,A,B,kind,dur,delay,done){const f=ghostFor(id,g),W=f.W,H=f.H;f.trails.forEach(t=>t.remove());f.trails=[];
  const frames=flightFrames(kind,A,B);f.frames=frames;f.t0=performance.now()+delay;f.dur=dur;const keys=frames.map(p=>({transform:poseTransform(p,W,H)}));
  f.el.style.transform=keys[0].transform;const timing={duration:dur,delay,easing:'linear',fill:'both'};f.anims=[f.el.animate(keys,timing)];
  if(kind==='trail')[.2,.11,.05].forEach((o,k)=>{const t=f.el.cloneNode(true);t.classList.add('is-trail');layer.insertBefore(t,f.el);f.trails.push(t);
   f.anims.push(t.animate(keys.map((x,i)=>({...x,opacity:o*Math.max(0,1-i/(keys.length*.55))})),{...timing,delay:delay+(k+1)*34}));});
  f.anims[0].finished.then(()=>{if(st.flights.get(id)!==f)return;st.flights.delete(id);f.anims.forEach(a=>a.cancel());f.trails.forEach(t=>t.remove());done?.();
   requestAnimationFrame(()=>f.el.remove());},()=>{});return f;}
 function play(id){const g=st.games.find(x=>x.id===id);if(!g||id===st.out&&!st.flights.has(id))return;const old=st.out?st.games.find(x=>x.id===st.out):null;
  if(reduced){st.out=id;render(st.games,id);onPlay(g,'plain');onLand?.(g);return;}
  const kind=globalThis.__forceKind||pickVariant(st.last);st.last=kind;const W=cover.offsetWidth;
  /* where the picked card is now: mid-flight pose if it was flying, else its hand slot */
  const fromPick=(st.flights.has(id)&&currentPose(st.flights.get(id)))||slotPose(id,W);
  const fromOld=old?((st.flights.has(old.id)&&currentPose(st.flights.get(old.id)))||coverPose()):null;
  st.out=id;st.hover=-1;render(st.games,id);onPlay(g,kind);
  if(old){const el=st.cards.get(old.id);el?.classList.add('is-wait');const to=slotPose(old.id,W);/* the card going home slides in under its neighbours, the one coming out stays on top */if(to)fly(old.id,old,fromOld,to,kind,680,0,()=>{el?.classList.remove('is-wait');}).el.style.zIndex='6';else el?.classList.remove('is-wait');}
  if(fromPick)fly(id,g,fromPick,coverPose(),kind,kind==='dive'?820:760,old?(kind==='dive'?120:140):0,()=>onLand?.(g)).el.style.zIndex='8';else onLand?.(g);}
 /* the field card changed some other way (double-click draw): take it out of the hand without a flight */
 function sync(id){if(id===st.out||st.flights.has(id))return;st.out=id;render(st.games,id);}
 const onResize=()=>relayout();addEventListener('resize',onResize);
 function stop(){removeEventListener('resize',onResize);st.flights.forEach(f=>{f.anims.forEach(a=>a.cancel());f.el.remove();f.trails.forEach(t=>t.remove());});st.flights.clear();}
 return {render,setExtras,play,sync,stop,relayout,state:st,flying:()=>st.flights.size>0};}
