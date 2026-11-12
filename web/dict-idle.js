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
function words(){return [...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean).slice(0,12);}
/* (user: the words and short phrases come from my own reading) through the app's existing service calls only: short
   phrases cut from recent dialogue, the saved words (what goes to Anki), the words looked up most; kana fill the gaps,
   and a small default list only when there is nothing yet */
const call=(action,params={})=>{const req={request:{action,...params}};if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__('service',req);const n=window.__TAURI_INTERNALS__?.invoke;return n?n('service',req):Promise.reject(Error('DESKTOP_REQUIRED'));};
const FALLBACK=['言葉','物語','約束','記憶','魔法','世界','夢','光'];
async function loadPool(f){
 const [lines,vocab]=await Promise.all([call('dialogue').catch(()=>[]),call('vocabulary').catch(()=>[])]);
 const phrases=[];for(const row of (Array.isArray(lines)?lines:[]).slice(0,80)){for(const seg of String(row?.text||'').split(/[、。！？!?「」『』（）()…\s]+/)){const t=seg.trim();if(t.length>=2&&t.length<=9&&/[぀-ヿ一-鿿]/.test(t))phrases.push(t);}if(phrases.length>60)break;}
 const saved=(Array.isArray(vocab)?vocab:[]).map(v=>String(v?.spelling||'').trim()).filter(t=>t&&t.length<=8).slice(0,60);
 f.pool={phrases,saved,looked:f.words};
}
function pickText(f){const P=f.pool||{phrases:[],saved:[],looked:f.words},r=Math.random(),pick=a=>a[Math.floor(Math.random()*a.length)];
 if(r<.22&&P.phrases.length)return {t:pick(P.phrases),kind:'phrase'};if(r<.42&&P.saved.length)return {t:pick(P.saved),kind:'word'};if(r<.55&&P.looked.length)return {t:pick(P.looked),kind:'word'};
 if(r<.6&&!P.phrases.length&&!P.saved.length&&!P.looked.length)return {t:pick(FALLBACK),kind:'word'};return {t:KANA[Math.floor(Math.random()*KANA.length)],kind:'kana'};}
function make(f,anywhere){
 const pk=pickText(f),word=pk.kind!=='kana',text=pk.t,z=Math.pow(Math.random(),1.3),shrink=pk.kind==='kana'?1:Math.max(.42,.85-text.length*.05),size=shrink*(13+z*62),blur=Math.abs(z-FOCUS)*(z>FOCUS?16:7);
 const red=Math.random()<.14,color=pk.kind==='word'?'#f0c36a':red?'#d23a48':'#eceae6';
 return {z,spr:sprite(text,size,blur,color),x:Math.random()*f.W,y:anywhere?Math.random()*f.H:f.H+60,vx:(Math.random()-.5)*6,vy:-(4+Math.random()*10)*(.4+z),rot:0,rot0:(Math.random()-.5)*.42,vr:0,sway:Math.random()*Math.PI*2,
  alpha:(.1+.3*(1-Math.abs(z-FOCUS)*1.4))*(red||word?1.3:1),ox:0,oy:0,wx:0,wy:0};
}
function build(host){
 const cv=document.createElement('canvas');cv.className='dict-field';cv.setAttribute('aria-hidden','true');(host.parentElement||host).prepend(cv);
 const f={cv,host,ctx:cv.getContext('2d'),parts:[],W:0,H:0,mx:-1e4,my:-1e4,wind:null,prev:performance.now(),raf:0,words:words()};
 f.fit=()=>{const dpr=Math.min(devicePixelRatio||1,2);f.W=innerWidth;f.H=innerHeight;cv.width=Math.round(f.W*dpr);cv.height=Math.round(f.H*dpr);f.ctx.setTransform(dpr,0,0,dpr,0,0);
  const want=Math.round(Math.min(110,f.W*f.H/14000));while(f.parts.length<want)f.parts.push(make(f,true));f.parts.length=want;};
 f.fit();field=f;loadPool(f).then(()=>{f.parts=f.parts.map(p=>Object.assign(make(f,true),{x:p.x,y:p.y,wx:p.wx,wy:p.wy}));}).catch(()=>{});return f;
}
function frame(now){
 const f=field;if(!f||!f.cv.isConnected||!f.host.isConnected||!document.querySelector('#lookup-results')){f?.cv.remove();field=null;return;}
 const dt=Math.min(.05,(now-f.prev)/1000);f.prev=now;const ctx=f.ctx;ctx.clearRect(0,0,f.W,f.H);
 const pref=fxPref('dictField');if(!pref.on){if(!calm)setTimeout(()=>{if(field===f)f.raf=requestAnimationFrame(frame);},250);return;}
 const res=document.querySelector('#lookup-results'),busy=res&&(res.children.length||res.textContent.trim())?1:0;f.dim=(f.dim??1)+((busy?.45:1)-(f.dim??1))*Math.min(1,dt*3);
 const order=f.parts;f.pvx=(f.pvx||0)*Math.exp(-8*dt);f.pvy=(f.pvy||0)*Math.exp(-8*dt);
 /* (user: the field has no fixed places — a pushed glyph stays where it was pushed; the whole only rebalances, slowly)
    a coarse density grid drives two gentle things over tens of seconds: a very slow drift from crowded cells toward
    emptier ones, and in an over-full cell a glyph now and then fades out and fades up again in the emptiest cell.
    Nothing is ever pulled back to a place of its own. */
 const GX=8,GY=5,cw=f.W/GX,ch=f.H/GY,cnt=new Float32Array(GX*GY),cell=(x,y)=>Math.min(GX-1,Math.max(0,Math.floor(x/cw)))+Math.min(GY-1,Math.max(0,Math.floor(y/ch)))*GX;
 for(const p of order)if(p.y>-40&&p.y<f.H+40&&p.x>-40&&p.x<f.W+40)cnt[cell(p.x,p.y)]+=1;f.cnt=cnt;f.cellOf=cell;f.grid=[GX,GY,cw,ch];
 const at=(i,j)=>i<0||j<0||i>=GX||j>=GY?cnt[Math.min(GX-1,Math.max(0,i))+Math.min(GY-1,Math.max(0,j))*GX]+2:cnt[i+j*GX];
 /* (judge fx9: sharp glyphs of one layer piled into each other) glyphs near the focal plane gently make room for a
    neighbour that overlaps them — only when touching, never toward any place */
 const sharp=order.filter(q=>Math.abs(q.z-FOCUS)<.2&&(q.fade??1)>.5);
 for(let a=0;a<sharp.length;a++){const A=sharp[a];for(let b=a+1;b<sharp.length;b++){const B=sharp[b],dx=B.x-A.x,dy=B.y-A.y,need=(A.spr.w+B.spr.w)*.32,d2=dx*dx+dy*dy;if(d2>need*need||d2<1e-3)continue;const d=Math.sqrt(d2),k=(1-d/need)*60*dt,ux=dx/d,uy=dy/d;A.wx-=ux*k;A.wy-=uy*k*.6;B.wx+=ux*k;B.wy+=uy*k*.6;}}
 for(const p of order){
  {const i=Math.min(GX-1,Math.max(0,Math.floor(p.x/cw))),j=Math.min(GY-1,Math.max(0,Math.floor(p.y/ch))),K=5;p.wx=(p.wx||0)+(at(i-1,j)-at(i+1,j))*K*dt;p.wy=(p.wy||0)+(at(i,j-1)-at(i,j+1))*K*.6*dt;}
  p.sway+=dt*.6;p.x+=(p.vx+Math.sin(p.sway)*4)*dt;p.y+=p.vy*dt;
  /* (judge fx8: blown glyphs stayed upside down) each glyph eases back to its own resting tilt once the spin dies down */
  p.rot0??=(Math.random()-.5)*.42;p.rot+=((p.rot0+Math.sin(p.sway*.7)*.06)-p.rot)*Math.min(1,dt*1.6/(1+Math.abs(p.wr||0)*.6));
  /* a gust moves the glyph itself; air drag slows it; out of the frame it drifts back in later as a new glyph */
  p.x+=(p.wx||0)*dt;p.y+=(p.wy||0)*dt;p.rot+=(p.wr||0)*dt;const drag=Math.exp(-1.4*dt);p.wx=(p.wx||0)*drag;p.wy=(p.wy||0)*drag;p.wr=(p.wr||0)*Math.exp(-1.2*dt);
  /* (user: the field has no fixed places — the pointer pushes it about like water; a click pushes harder) the pointer's own
     motion is handed to the glyphs it passes, nearer and nearer-depth more; nothing pulls them back, they just drift on */
  const ddx=p.x-f.mx,ddy=p.y-f.my,dm=Math.hypot(ddx,ddy),reach=110+p.z*140;
  if(dm<reach&&(f.pvx||f.pvy)){const k=(1-dm/reach)*(.5+p.z*.8);p.wx=(p.wx||0)+(f.pvx*1.6+ddx/(dm||1)*60)*k*dt*6;p.wy=(p.wy||0)+(f.pvy*1.6+ddy/(dm||1)*60)*k*dt*6;p.wr=(p.wr||0)+(Math.random()-.5)*k*dt*8;}
  if(p.y<-80||p.x<-120||p.x>f.W+120){const n=make(f,false),e=Math.random(),edge=e<.35?'l':e<.7?'r':'b';
   /* half of them fade up inside the emptiest cell, so the gap a gust leaves closes from within too */
   if(Math.random()<.5){let bi=0;for(let q=1;q<cnt.length;q++)if(cnt[q]<cnt[bi])bi=q;cnt[bi]+=1;Object.assign(p,n,{x:(bi%GX+Math.random())*cw,y:(Math.floor(bi/GX)+Math.random())*ch,wx:0,wy:0,wr:0,fade:0});continue;}
   /* back into the frame from an edge, carried in on a breeze and fading up, so the field fills again in 2-4 s */
   Object.assign(p,n,edge==='l'?{x:-60,y:R(.15,.9)*f.H,wx:R(180,320),wy:R(-60,20)}:edge==='r'?{x:f.W+60,y:R(.15,.9)*f.H,wx:-R(180,320),wy:R(-60,20)}:{x:R(.05,.95)*f.W,y:f.H+50,wx:R(-40,40),wy:-R(160,280)},{wr:0,fade:0});}
  {const mean=order.length/(GX*GY),ci=cell(p.x,p.y);if(!p.leaving&&(p.fade??1)>=1&&cnt[ci]>mean*1.8&&Math.random()<dt*.12){p.leaving=1;cnt[ci]-=1;}}
  if(p.leaving){p.fade=Math.max(0,(p.fade??1)-dt*.7);if(p.fade<=0){let bi=0;for(let q=1;q<cnt.length;q++)if(cnt[q]<cnt[bi])bi=q;cnt[bi]+=1;Object.assign(p,make(f,true),{x:(bi%GX+Math.random())*cw,y:(Math.floor(bi/GX)+Math.random())*ch,wx:0,wy:0,wr:0,fade:0,leaving:0});}}
  else p.fade=Math.min(1,(p.fade??1)+dt*.5);
  if(p.y>f.H+120)p.y=-60;
  const s=p.spr,base=Math.min(1,p.alpha*f.dim*pref.k)*(p.fade??1),sp=Math.hypot(p.wx||0,p.wy||0);
  /* (judge fx7: the trail read as stepped copies) one smear instead: the sprite stretched along its velocity, behind it */
  if(sp>220){const a=Math.atan2(p.wy,p.wx),len=Math.min(220,sp*.05),st=1+len/Math.max(24,s.w);ctx.globalAlpha=base*.34;ctx.save();ctx.filter=`blur(${Math.min(6,1.5+len*.04).toFixed(1)}px)`;ctx.translate(p.x+p.ox-Math.cos(a)*len*.5,p.y+p.oy-Math.sin(a)*len*.5);ctx.rotate(a);ctx.scale(st,1/(1+len/400));ctx.rotate(p.rot+(p.orot||0)-a);ctx.drawImage(s.c,-s.w/2,-s.h/2,s.w,s.h);ctx.restore();}
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
if(!calm){document.addEventListener('pointermove',e=>{if(!field)return;const now=performance.now(),dt=Math.max(8,now-(field.pt||now-16))/1000;if(field.pt){field.pvx=(e.clientX-field.mx)/dt;field.pvy=(e.clientY-field.my)/dt;}field.mx=e.clientX;field.my=e.clientY;field.pt=now;},{passive:true});
 /* a click (not on a control) sends a ring of force out from the pointer */
 document.addEventListener('pointerdown',e=>{if(!field||e.target.closest?.('input,button,a,select,textarea,[role=button],.record,label'))return;for(const p of field.parts){const dx=p.x-e.clientX,dy=p.y-e.clientY,d=Math.hypot(dx,dy)||1,k=Math.exp(-d/240)*(.5+p.z*.8);p.wx=(p.wx||0)+dx/d*850*k;p.wy=(p.wy||0)+dy/d*850*k;p.wr=(p.wr||0)+(Math.random()-.5)*8*k;}},{passive:true});}
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
