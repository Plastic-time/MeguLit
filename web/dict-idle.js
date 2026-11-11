// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 the dictionary's drifting field, made like the website hero (site/public/assets/js/spell.js; user: full
   screen, in layers, white or red at random, random sizes, the nearer the blurrier — real depth of field). Every glyph
   has a depth z (0 far, 1 near): far ones are small and soft, the focal band is sharp, near ones are large and out of
   focus. Each is pre-rendered once (with its blur) to a sprite, so a frame is only drawImage calls. They drift upward
   all the time and the pointer pushes the nearer ones aside; the field never takes part in the search impact — while
   the box flies (dict-impact.js sends 'megulit:dict-wind') each glyph feels a push along its motion, falling off with
   distance and scaled by depth, with a little turbulence, and drifts on. The words you look up most are among them,
   in gold. One still frame when motion is reduced. Presentation only. */
import {fxPref} from './fx-prefs.js';
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエカキクサシスタチツナニ読物語言葉魔導書続空気夢花月星雪風声心光影';
const FONT='"Noto Serif JP","Yu Mincho","MeguLit Serif",serif',FOCUS=.42;
const R=(a,b)=>a+Math.random()*(b-a);
function sprite(text,size,blur,color){
 const m=document.createElement('canvas').getContext('2d');m.font=`600 ${size}px ${FONT}`;
 const tw=Math.max(size,m.measureText(text).width),pad=Math.ceil(blur*2.5+4),w=Math.ceil(tw+pad*2),h=Math.ceil(size*1.3+pad*2);
 const c=document.createElement('canvas'),dpr=Math.min(devicePixelRatio||1,2);c.width=Math.ceil(w*dpr);c.height=Math.ceil(h*dpr);
 const g=c.getContext('2d');g.scale(dpr,dpr);g.filter=blur>.3?`blur(${blur.toFixed(1)}px)`:'none';g.fillStyle=color;g.font=`600 ${size}px ${FONT}`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,w/2,h/2);
 return {c,w,h};
}
let field=null;
function words(){return [...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean).slice(0,10);}
function make(f,anywhere){
 const ws=f.words,word=ws.length&&Math.random()<.1,z=Math.pow(Math.random(),1.3),size=(word?.7:1)*(13+z*62),blur=Math.abs(z-FOCUS)*(z>FOCUS?16:7);
 const red=!word&&Math.random()<.14,text=word?ws[Math.floor(Math.random()*ws.length)]:KANA[Math.floor(Math.random()*KANA.length)];
 const color=word?'#f0c36a':red?'#d23a48':'#eceae6';
 return {z,spr:sprite(text,size,blur,color),x:Math.random()*f.W,y:anywhere?Math.random()*f.H:f.H+60,vx:(Math.random()-.5)*6,vy:-(4+Math.random()*10)*(.4+z),rot:(Math.random()-.5)*.5,vr:(Math.random()-.5)*.12,sway:Math.random()*Math.PI*2,
  alpha:(.1+.3*(1-Math.abs(z-FOCUS)*1.4))*(red||word?1.3:1),ox:0,oy:0,wx:0,wy:0};
}
function build(host){
 const cv=document.createElement('canvas');cv.className='dict-field';cv.setAttribute('aria-hidden','true');host.prepend(cv);
 const f={cv,host,ctx:cv.getContext('2d'),parts:[],W:0,H:0,mx:-1e4,my:-1e4,wind:null,prev:performance.now(),raf:0,words:words()};
 f.fit=()=>{const dpr=Math.min(devicePixelRatio||1,2);f.W=innerWidth;f.H=innerHeight;cv.width=Math.round(f.W*dpr);cv.height=Math.round(f.H*dpr);f.ctx.setTransform(dpr,0,0,dpr,0,0);
  const want=Math.round(Math.min(110,f.W*f.H/14000));while(f.parts.length<want)f.parts.push(make(f,true));f.parts.length=want;};
 f.fit();field=f;return f;
}
function frame(now){
 const f=field;if(!f||!f.cv.isConnected){field=null;return;}
 const dt=Math.min(.05,(now-f.prev)/1000);f.prev=now;const ctx=f.ctx;ctx.clearRect(0,0,f.W,f.H);
 const pref=fxPref('dictField');if(!pref.on){if(!calm)f.raf=requestAnimationFrame(frame);return;}
 const res=document.querySelector('#lookup-results'),busy=res&&(res.children.length||res.textContent.trim())?1:0;f.dim=(f.dim??1)+((busy?.45:1)-(f.dim??1))*Math.min(1,dt*3);
 const wind=f.wind&&now-f.wind.at<120?f.wind:null;
 const order=f.parts;
 for(const p of order){
  p.sway+=dt*.6;p.x+=(p.vx+Math.sin(p.sway)*4)*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
  /* wind from the flying box, by distance and depth, with turbulence; then it eases off */
  if(wind){const dx=p.x-wind.x,dy=p.y-wind.y,dist=Math.hypot(dx,dy),fall=Math.exp(-dist/300)*(.35+p.z*.9);p.wx+=(wind.vx*.5+(Math.random()-.5)*700+dx/(dist||1)*260)*fall*dt;p.wy+=(wind.vy*.5+(Math.random()-.5)*700+dy/(dist||1)*160)*fall*dt;}
  p.x+=p.wx*dt;p.y+=p.wy*dt;p.wx*=1-Math.min(1,2.2*dt);p.wy*=1-Math.min(1,2.2*dt);
  /* the pointer pushes the nearer glyphs aside; springs bring them back */
  const ddx=p.x+p.ox-f.mx,ddy=p.y+p.oy-f.my,dm=Math.hypot(ddx,ddy),reach=90+p.z*120;
  let ax=-30*p.ox,ay=-30*p.oy;if(dm<reach){const k=(1-dm/reach)*(200+p.z*600);ax+=ddx/(dm||1)*k;ay+=ddy/(dm||1)*k;}
  p.ovx=((p.ovx||0)+ax*dt)*(1-Math.min(1,5*dt));p.ovy=((p.ovy||0)+ay*dt)*(1-Math.min(1,5*dt));p.ox+=p.ovx*dt;p.oy+=p.ovy*dt;
  if(p.y<-80||p.x<-120||p.x>f.W+120){Object.assign(p,make(f,false),{x:Math.random()*f.W});}
  if(p.y>f.H+120)p.y=-60;
  const s=p.spr;ctx.globalAlpha=Math.min(1,p.alpha*f.dim*pref.k);ctx.save();ctx.translate(p.x+p.ox,p.y+p.oy);ctx.rotate(p.rot);ctx.drawImage(s.c,-s.w/2,-s.h/2,s.w,s.h);ctx.restore();
 }
 ctx.globalAlpha=1;
 if(!calm)f.raf=requestAnimationFrame(frame);
}
let tick=0;
function scan(){tick=0;const results=document.querySelector('#lookup-results');if(!results)return;const host=results.closest('#learning-content')||results.parentElement;if(!host)return;
 if(field&&field.host===host&&field.cv.isConnected)return;
 build(host);requestAnimationFrame(frame);}
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(scan);}).observe(document.body,{childList:true,subtree:true});
addEventListener('resize',()=>field?.fit());
if(!calm)document.addEventListener('pointermove',e=>{if(!field)return;field.mx=e.clientX;field.my=e.clientY;},{passive:true});
document.addEventListener('megulit:dict-wind',e=>{if(!field)return;const d=e.detail;field.wind={x:d.x,y:d.y,vx:d.vx,vy:d.vy,at:performance.now()};});
