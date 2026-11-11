// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 the dictionary's drifting field (user: it never takes part in the impact and never goes away; more of it,
   in depth; mouse interaction like the website hero; the box's rush up stirs it like a breeze, gently, strongest near
   the box; nothing overlaps). One canvas behind the dictionary: about 70 glyphs — the words you look up most, kana and
   common kanji — in three depths (far small and faint, near larger), placed so no two touch and none sit on the search
   box. Each drifts on its own slow orbit; the pointer pushes the near ones aside a little and shifts the depths in
   parallax; while the box flies (dict-impact.js sends 'megulit:dict-wind' with its position and velocity) every glyph
   feels a push along that motion, falling off with distance, plus a little turbulence, and its spring brings it back
   to its orbit. Presentation only. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテト';
const KANJI='言葉読夢空花月星雪風声心光影音色春夏秋冬朝夜海雨時恋魔法約束記憶物語世界';
const DEPTH=[{size:[11,14],alpha:.13,par:6},{size:[15,21],alpha:.22,par:14},{size:[22,34],alpha:.34,par:26}];
const R=(a,b)=>a+Math.random()*(b-a);
let field=null;
function words(){return [...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean).slice(0,12);}
function build(host){
 const cv=document.createElement('canvas');cv.className='dict-field';cv.setAttribute('aria-hidden','true');host.prepend(cv);
 const f={cv,host,ctx:cv.getContext('2d'),gl:[],W:0,H:0,px:0,py:0,mx:-1e4,my:-1e4,wind:null,prev:performance.now(),raf:0};
 f.layout=()=>{const r=host.getBoundingClientRect(),W=Math.round(r.width),H=Math.round(Math.max(innerHeight-Math.max(0,r.top)-20,r.height));if(!W||!H)return;const dpr=Math.min(2,devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';f.ctx.setTransform(dpr,0,0,dpr,0,0);f.W=W;f.H=H;place(f);};
 f.layout();setTimeout(()=>f.layout(),700);field=f;return f;
}
/* rejection sampling: no two glyph boxes overlap (with a margin), none over the search box */
function place(f){
 const ctx=f.ctx,w=words(),pool=[...w.map(t=>({t,word:1})),...[...KANA].map(t=>({t})),...[...KANJI].map(t=>({t}))],boxes=[],out=[];
 const form=f.host.querySelector('#lookup-form'),hr=f.host.getBoundingClientRect(),fr=form?form.getBoundingClientRect():null;
 if(fr)boxes.push({x:fr.left-hr.left-30,y:fr.top-hr.top-24,w:fr.width+60,h:fr.height+48});
 const want=70;let tries=0;
 while(out.length<want&&tries<4000){tries++;
  const d=out.length<want*.4?0:out.length<want*.75?1:2,word=w.length&&Math.random()<.18,item=word?{t:w[Math.floor(Math.random()*w.length)],word:1}:pool[w.length+Math.floor(Math.random()*(pool.length-w.length))];
  const size=R(...DEPTH[d].size)*(item.word?1.15:1);ctx.font=`500 ${size}px "Noto Serif JP","Yu Mincho",serif`;const tw=ctx.measureText(item.t).width,th=size*1.1;
  const x=R(10,f.W-tw-10),y=R(th,f.H-10),b={x:x-8,y:y-th-6,w:tw+16,h:th+12};
  if(boxes.some(o=>b.x<o.x+o.w&&o.x<b.x+b.w&&b.y<o.y+o.h&&o.y<b.y+b.h))continue;
  boxes.push(b);out.push({t:item.t,word:!!item.word,d,size,tw,bx:x,by:y,ox:0,oy:0,vx:0,vy:0,ph:R(0,Math.PI*2),sp:R(.15,.4),amp:R(3,8)});
 }
 f.gl=out;
}
function frame(now){
 const f=field;if(!f||!f.cv.isConnected){field=null;return;}
 const dt=Math.min(.05,(now-f.prev)/1000);f.prev=now;const res=document.querySelector('#lookup-results');const want=res&&(res.children.length||res.textContent.trim())?1:0;f.busyK=(f.busyK||0)+(want-(f.busyK||0))*Math.min(1,dt*3);f.busy=f.busyK>.02?1-.62*f.busyK:0;const ctx=f.ctx;ctx.clearRect(0,0,f.W,f.H);
 const hr=f.cv.getBoundingClientRect(),mx=f.mx-hr.left,my=f.my-hr.top,wind=f.wind&&now-f.wind.at<120?f.wind:null;
 for(const g of f.gl){
  const D=DEPTH[g.d];
  let ax=-40*g.ox-7*g.vx,ay=-40*g.oy-7*g.vy;
  /* wind from the flying box: a push along its velocity, falling off with distance, with a little turbulence */
  if(wind){const dx=g.bx-wind.x,dy=g.by-wind.y,dist=Math.hypot(dx,dy),fall=Math.exp(-dist/240)*(.45+g.d*.3);ax+=(wind.vx*.35+(Math.random()-.5)*900+dx/(dist||1)*300)*fall;ay+=(wind.vy*.35+(Math.random()-.5)*900+dy/(dist||1)*200)*fall;}
  /* the pointer pushes the nearer ones aside a little */
  const ddx=g.bx+g.ox-mx,ddy=g.by+g.oy-my,dm=Math.hypot(ddx,ddy);if(dm<140){const k=(1-dm/140)*(g.d+1)*260;ax+=ddx/(dm||1)*k;ay+=ddy/(dm||1)*k;}
  g.vx+=ax*dt;g.vy+=ay*dt;g.ox+=g.vx*dt;g.oy+=g.vy*dt;g.ox=Math.max(-90,Math.min(90,g.ox));g.oy=Math.max(-90,Math.min(90,g.oy));
  const t=now/1000*g.sp+g.ph,x=g.bx+g.ox+Math.cos(t)*g.amp-f.px*D.par,y=g.by+g.oy+Math.sin(t*1.3)*g.amp*.7-f.py*D.par;
  ctx.font=`500 ${g.size}px "Noto Serif JP","Yu Mincho",serif`;const dim=f.busy||1;ctx.fillStyle=g.word?`rgba(237,181,110,${D.alpha*1.5*dim})`:`rgba(241,224,210,${D.alpha*dim})`;ctx.fillText(g.t,x,y);
 }
 f.raf=requestAnimationFrame(frame);
}
let tick=0;
function scan(){tick=0;const results=document.querySelector('#lookup-results');if(!results)return;const host=results.closest('#learning-content')||results.parentElement;if(!host)return;
 if(field&&field.host===host&&field.cv.isConnected)return;
 const f=build(host);if(calm){frame(performance.now());cancelAnimationFrame(f.raf);}else f.raf=requestAnimationFrame(frame);}
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(scan);}).observe(document.body,{childList:true,subtree:true});
addEventListener('resize',()=>field?.layout());
if(!calm)document.addEventListener('pointermove',e=>{if(!field)return;field.mx=e.clientX;field.my=e.clientY;field.px=e.clientX/innerWidth-.5;field.py=e.clientY/innerHeight-.5;},{passive:true});
document.addEventListener('megulit:dict-wind',e=>{if(!field)return;const hr=field.cv.getBoundingClientRect(),d=e.detail;field.wind={x:d.x-hr.left,y:d.y-hr.top,vx:d.vx,vy:d.vy,at:performance.now()};});
