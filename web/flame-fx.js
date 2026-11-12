// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user): a wrong answer in the grammar / kana practice also sets the page alight — 蔓延火焰. A ragged fire
   front runs outward from where the answer was hit, licking flames rise off it, a scorched rim glows behind it and
   everything burns out within two seconds. One canvas for the whole viewport, drawn with additive light; nothing
   on the page is laid out again while it burns. Reduced motion: no fire at all. */
import {calm} from './burst-fx.js';

const MAX_PARTS=520,RAYS=72;
let layer=null,ctx=null,fires=[],parts=[],raf=0,last=0,dpr=1;

function ensure(){
 if(layer&&layer.isConnected)return;
 layer=document.createElement('canvas');layer.className='fx-flame-layer';layer.setAttribute('aria-hidden','true');
 layer.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;contain:strict';
 document.body.append(layer);ctx=layer.getContext('2d');size();
}
function size(){if(!layer)return;dpr=Math.min(1.5,devicePixelRatio||1);layer.width=Math.round(innerWidth*dpr);layer.height=Math.round(innerHeight*dpr);}
addEventListener('resize',size);

/* smooth per-ray speed: a few sine waves so the front is ragged but continuous */
function front(seed){const a=[];for(let i=0;i<3;i++)a.push({f:2+Math.floor((seed*(i+3)*97)%5),p:(seed*(i+1)*13.7)%6.283,w:.12/(i+1)});return th=>1+a.reduce((s,o)=>s+o.w*Math.sin(o.f*th+o.p),0);}

export function spreadFire(x,y,{k=1,bounds=null}={}){
 if(calm||typeof document==='undefined')return null;
 ensure();
 const r=bounds||{left:0,top:0,right:innerWidth,bottom:innerHeight};
 const reach=Math.min(420,Math.max(160,Math.hypot(r.right-r.left,r.bottom-r.top)*.28))*Math.min(1.4,Math.max(.4,k));
 const seed=Math.random()*1000+1,f={x,y,t:0,reach,shape:front(seed),rays:new Float32Array(RAYS),clip:r,life:1900};
 if(fires.length>=3)fires.shift();
 fires.push(f);
 if(!raf){last=performance.now();raf=requestAnimationFrame(tick);}
 return f;
}

function spawn(f,px,py,heat){
 if(parts.length>=MAX_PARTS)return;
 parts.push({x:px,y:py,vx:(Math.random()-.5)*28,vy:-(40+Math.random()*90)*heat,life:0,max:.38+Math.random()*.42,s:(6+Math.random()*10)*heat,c:f.clip});
}

function tick(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;
 const W=layer.width,H=layer.height;
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);ctx.setTransform(dpr,0,0,dpr,0,0);
 for(const f of fires){
  f.t+=dt*1000;const p=Math.min(1,f.t/900),ease=1-Math.pow(1-p,3),fade=f.t<1100?1:Math.max(0,1-(f.t-1100)/(f.life-1100));
  ctx.save();ctx.beginPath();ctx.rect(f.clip.left,f.clip.top,f.clip.right-f.clip.left,f.clip.bottom-f.clip.top);ctx.clip();
  /* scorched disc: dark ember red, inside the front */
  ctx.globalCompositeOperation='source-over';
  ctx.beginPath();
  for(let i=0;i<=RAYS;i++){const th=i/RAYS*6.2832,rr=f.reach*ease*f.shape(th);f.rays[i%RAYS]=rr;const px=f.x+Math.cos(th)*rr,py=f.y+Math.sin(th)*rr*.82;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
  ctx.closePath();
  const g=ctx.createRadialGradient(f.x,f.y,0,f.x,f.y,Math.max(1,f.reach*ease));
  g.addColorStop(0,`rgba(40,8,4,${.20*fade})`);g.addColorStop(.75,`rgba(120,24,6,${.16*fade})`);g.addColorStop(1,`rgba(255,90,20,${.10*fade})`);
  ctx.fillStyle=g;ctx.fill();
  /* the burning rim */
  ctx.globalCompositeOperation='lighter';
  ctx.lineWidth=3+5*(1-p);ctx.strokeStyle=`rgba(255,${Math.round(120+80*(1-p))},40,${.55*fade})`;ctx.stroke();
  /* flames along the front while it still moves */
  if(fade>0){const n=Math.round((p<1?10:3)*fade);for(let j=0;j<n;j++){const i=Math.floor(Math.random()*RAYS),th=i/RAYS*6.2832,rr=f.rays[i];spawn(f,f.x+Math.cos(th)*rr,f.y+Math.sin(th)*rr*.82,.6+.6*fade);}}
  ctx.restore();
 }
 fires=fires.filter(f=>f.t<f.life);
 ctx.globalCompositeOperation='lighter';
 for(const q of parts){
  q.life+=dt;const a=q.life/q.max;if(a>=1)continue;
  q.x+=q.vx*dt;q.y+=q.vy*dt;q.vy-=60*dt;q.vx*=.98;
  if(q.x<q.c.left||q.x>q.c.right||q.y<q.c.top||q.y>q.c.bottom)continue;
  const s=q.s*(1-a*.7),hue=a<.3?`255,${Math.round(230-a*300)},${Math.round(150-a*400)}`:`255,${Math.round(150-a*110)},20`;
  const gr=ctx.createRadialGradient(q.x,q.y,0,q.x,q.y,s);
  gr.addColorStop(0,`rgba(${hue},${(1-a)*.9})`);gr.addColorStop(1,'rgba(255,40,0,0)');
  ctx.fillStyle=gr;ctx.beginPath();ctx.arc(q.x,q.y,s,0,6.2832);ctx.fill();
 }
 parts=parts.filter(q=>q.life<q.max);
 ctx.globalCompositeOperation='source-over';
 if(fires.length||parts.length)raf=requestAnimationFrame(tick);
 else{raf=0;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,W,H);layer.remove();layer=null;}
}
export const _flameState=()=>({fires:fires.length,parts:parts.length,running:!!raf});
