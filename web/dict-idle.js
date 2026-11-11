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
 const cv=document.createElement('canvas');cv.className='dict-field';cv.setAttribute('aria-hidden','true');(host.parentElement||host).prepend(cv);
 const f={cv,host,ctx:cv.getContext('2d'),parts:[],W:0,H:0,mx:-1e4,my:-1e4,wind:null,prev:performance.now(),raf:0,words:words()};
 f.fit=()=>{const dpr=Math.min(devicePixelRatio||1,2);f.W=innerWidth;f.H=innerHeight;cv.width=Math.round(f.W*dpr);cv.height=Math.round(f.H*dpr);f.ctx.setTransform(dpr,0,0,dpr,0,0);
  const want=Math.round(Math.min(110,f.W*f.H/14000));while(f.parts.length<want)f.parts.push(make(f,true));f.parts.length=want;};
 f.fit();field=f;return f;
}
function frame(now){
 const f=field;if(!f||!f.cv.isConnected||!f.host.isConnected||!document.querySelector('#lookup-results')){f?.cv.remove();field=null;return;}
 const dt=Math.min(.05,(now-f.prev)/1000);f.prev=now;const ctx=f.ctx;ctx.clearRect(0,0,f.W,f.H);
 const pref=fxPref('dictField');if(!pref.on){if(!calm)f.raf=requestAnimationFrame(frame);return;}
 const res=document.querySelector('#lookup-results'),busy=res&&(res.children.length||res.textContent.trim())?1:0;f.dim=(f.dim??1)+((busy?.45:1)-(f.dim??1))*Math.min(1,dt*3);
 const order=f.parts;
 for(const p of order){
  p.sway+=dt*.6;p.x+=(p.vx+Math.sin(p.sway)*4)*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
  /* a gust moves the glyph itself; air drag slows it; out of the frame it drifts back in later as a new glyph */
  p.x+=(p.wx||0)*dt;p.y+=(p.wy||0)*dt;p.rot+=(p.wr||0)*dt;const drag=Math.exp(-1.4*dt);p.wx=(p.wx||0)*drag;p.wy=(p.wy||0)*drag;p.wr=(p.wr||0)*Math.exp(-1.2*dt);
  /* (user: the turbulence must be visible) the flying box leaves a wake: glyphs near its path are carried along its
     motion and rolled outward into small eddies on either side, spun a little; strongest nearest the box (up to ~40-80 px
     and ~15-30 degrees), a gentle sway further off; springs bring them back to their drift within a second or two */
  let ax=-30*p.ox,ay=-30*p.oy,aspin=-24*(p.orot||0);
  /* the pointer pushes the nearer glyphs aside */
  const ddx=p.x+p.ox-f.mx,ddy=p.y+p.oy-f.my,dm=Math.hypot(ddx,ddy),reach=90+p.z*120;
  if(dm<reach){const k=(1-dm/reach)*(200+p.z*600);ax+=ddx/(dm||1)*k;ay+=ddy/(dm||1)*k;}
  p.ovx=((p.ovx||0)+ax*dt)*(1-Math.min(1,3.2*dt));p.ovy=((p.ovy||0)+ay*dt)*(1-Math.min(1,3.2*dt));p.ox+=p.ovx*dt;p.oy+=p.ovy*dt;
  p.ospin=((p.ospin||0)+aspin*dt)*(1-Math.min(1,3*dt));p.orot=(p.orot||0)+p.ospin*dt;
  if(p.y<-80||p.x<-120||p.x>f.W+120){const n=make(f,false),e=Math.random(),edge=e<.35?'l':e<.7?'r':'b';
   /* back into the frame from an edge, carried in on a breeze and fading up, so the field fills again in 2-4 s */
   Object.assign(p,n,edge==='l'?{x:-60,y:R(.15,.9)*f.H,wx:R(180,320),wy:R(-60,20)}:edge==='r'?{x:f.W+60,y:R(.15,.9)*f.H,wx:-R(180,320),wy:R(-60,20)}:{x:R(.05,.95)*f.W,y:f.H+50,wx:R(-40,40),wy:-R(160,280)},{wr:0,fade:0});}
  p.fade=Math.min(1,(p.fade??1)+dt*1.4);
  if(p.y>f.H+120)p.y=-60;
  const s=p.spr,base=Math.min(1,p.alpha*f.dim*pref.k)*(p.fade??1),sp=Math.hypot(p.wx||0,p.wy||0);
  if(sp>260){for(let k=3;k>=1;k--){ctx.globalAlpha=base*.18*(4-k)/3;ctx.save();ctx.translate(p.x+p.ox-p.wx*.014*k,p.y+p.oy-p.wy*.014*k);ctx.rotate(p.rot+(p.orot||0));ctx.drawImage(s.c,-s.w/2,-s.h/2,s.w,s.h);ctx.restore();}}
  ctx.globalAlpha=base;ctx.save();ctx.translate(p.x+p.ox,p.y+p.oy);ctx.rotate(p.rot+(p.orot||0));ctx.drawImage(s.c,-s.w/2,-s.h/2,s.w,s.h);ctx.restore();
 }
 ctx.globalAlpha=1;
 if(!calm)f.raf=requestAnimationFrame(frame);
}
let tick=0;
function scan(){tick=0;const results=document.querySelector('#lookup-results');if(!results)return;const host=results.closest('#learning-content')||results.parentElement;if(!host)return;
 if(field&&field.host===host&&field.cv.isConnected)return;if(field){field.cv.remove();field=null;}
 build(host);requestAnimationFrame(frame);}
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(scan);}).observe(document.body,{childList:true,subtree:true});
addEventListener('resize',()=>field?.fit());
if(!calm)document.addEventListener('pointermove',e=>{if(!field)return;field.mx=e.clientX;field.my=e.clientY;},{passive:true});
/* the wake is given by how far the box actually moved since its last report, so it is as strong at any frame rate */
/* (user: a real wind that blows the glyphs away, the nearer the harder) the rushing box throws the field: glyphs are
   flung along its motion and outward, spinning, out to about half the screen's width with a smooth fall-off; the
   push is by how far the box moved since its last report, so it is as strong at any frame rate */
document.addEventListener('megulit:dict-wind',e=>{if(!field)return;const d=e.detail,now=performance.now(),w=field.wind;const prevY=w&&now-w.at<400?w.y:d.y+40;field.wind={x:d.x,y:d.y,at:now};const moved=d.y-prevY;if(moved>=0)return;
 const R0=field.W*.5,m=-moved;
 for(const p of field.parts){const px=p.x+p.ox,py=p.y+p.oy,dxr=Math.max(0,Math.abs(px-d.x)-(d.hw||200)*.6),dyr=py-d.y,dist=Math.hypot(dxr,dyr),fall=Math.exp(-(dist/R0)*2.2)*(.6+p.z*.6);if(fall<.01)continue;
  const side=px<d.x?-1:1,ox=(px-d.x)/(Math.hypot(px-d.x,dyr)||1),oy=dyr/(Math.hypot(px-d.x,dyr)||1);
  p.wx=(p.wx||0)+(side*m*4+ox*m*2.4+(Math.random()-.5)*m*2.4)*fall;p.wy=(p.wy||0)+(moved*5.5+oy*m*1.6)*fall;p.wr=(p.wr||0)+side*m*.035*fall*(.5+Math.random());}});
/* the hit itself: one outward gust from the point of impact */
/* the hit: a second, outward blast from the point of impact */
document.addEventListener('megulit:dict-gust',e=>{if(!field)return;const {x,y}=e.detail,R0=field.W*.55;for(const p of field.parts){const dx=p.x+p.ox-x,dy=p.y+p.oy-y,d=Math.hypot(dx,dy)||1,k=Math.exp(-(d/R0)*2)*(.6+p.z*.6);p.wx=(p.wx||0)+dx/d*1500*k;p.wy=(p.wy||0)+dy/d*1500*k;p.wr=(p.wr||0)+(Math.random()-.5)*10*k;}});
