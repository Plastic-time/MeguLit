// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: fuse each glyph with its element; fire gets a finely made pentagram circle; thunder, wind, water,
   earth and light need their own formation and their own burst, as good as ice and dark). Two parts, drawn into the
   element-fx canvas every frame:
   - FORMS: the element's formation behind the glyph. fire: three concentric rings, a rune ring, 72 ticks and a
     pentagram, drawn ring by ring when cast, turning; flames then jet from the five points to the centre. thunder:
     a hexagon of six conductor nodes with arcs jumping between them, all firing inward when cast. wind: three tapered
     spiral arms turning, tightening when cast and unwinding into a gust. water: a living wave ring with ripples inside,
     contracting when cast. earth: six rune slabs orbiting, drawn inward when cast and slammed together. light: a halo
     of thin rings and an eight-point star with long turning rays that reach the edges when cast. ice and dark keep
     their scenes (the user liked them) and only gain the glyph treatment.
   - GLYPH: the element's character rendered in its material through a mask of its own shape, with particles shed
     from its outline: fire lava and embers, ice crystal and frost, thunder current crawling the strokes, wind streams
     along the outline, water refraction and drips, earth rock grain and falling grit, light radiance and rays, dark a
     light-eating core with smoke rising from the edges. */
const TAU=Math.PI*2,R=(a,b)=>a+Math.random()*(b-a);
const cache=new Map();
/* the glyph's own shape: a white mask, outline points and inside points */
function glyphShape(ch,size){
 const key=ch+'|'+Math.round(size);if(cache.has(key))return cache.get(key);
 const w=Math.ceil(size*1.5),c=document.createElement('canvas');c.width=w;c.height=w;const x=c.getContext('2d');
 x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';x.font=`600 ${Math.round(size)}px "Noto Serif SC","Noto Serif JP","Source Han Serif SC","Yu Mincho",serif`;x.fillText(ch,w/2,w/2+size*.04);
 const d=x.getImageData(0,0,w,w).data,at=(i,j)=>d[(j*w+i)*4+3],edges=[],inner=[];
 for(let j=1;j<w-1;j+=2)for(let i=1;i<w-1;i+=2){if(at(i,j)<128)continue;if(at(i-2,j)<128||at(i+2,j)<128||at(i,j-2)<128||at(i,j+2)<128)edges.push([i-w/2,j-w/2]);else if(Math.random()<.25)inner.push([i-w/2,j-w/2]);}
 const out={mask:c,w,edges,inner};cache.set(key,out);return out;
}
const tmp=document.createElement('canvas');
function paintGlyph(ctx,g,cx,cy,texture,{glow='',blur=0,alpha=1}={}){
 if(tmp.width!==g.w){tmp.width=g.w;tmp.height=g.w;}const t=tmp.getContext('2d');t.globalCompositeOperation='source-over';t.clearRect(0,0,g.w,g.w);texture(t,g.w);t.globalCompositeOperation='destination-in';t.drawImage(g.mask,0,0);
 ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=alpha;if(glow){ctx.shadowColor=glow;ctx.shadowBlur=blur;}ctx.drawImage(tmp,cx-g.w/2,cy-g.w/2);ctx.restore();
}
const pick=a=>a[Math.floor(Math.random()*a.length)];
export const glyphFor=glyphShape;

export const GLYPH={
 fire(s,ctx,g,I){paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,w*.8,0,w*.2);gr.addColorStop(0,'#fff3c8');gr.addColorStop(.35,'#ffb347');gr.addColorStop(.7,'#e2422a');gr.addColorStop(1,'#5a0e0a');t.fillStyle=gr;t.fillRect(0,0,w,w);
   for(let i=0;i<5;i++){const y=(w*(1-((s.age*.35+i/5)%1))),rg=t.createRadialGradient(w*(.3+.4*Math.sin(i*2.3+s.age)),y,0,w*(.3+.4*Math.sin(i*2.3+s.age)),y,w*.22);rg.addColorStop(0,'rgba(255,240,190,.75)');rg.addColorStop(1,'rgba(255,200,120,0)');t.fillStyle=rg;t.fillRect(0,0,w,w);}},{glow:'#ff6a2a',blur:18+I*16});
  if(Math.random()<.6+I)for(let i=0;i<2;i++){const [x,y]=pick(g.edges);if(y>0&&Math.random()<.6)continue;s.ps.push({x:s.cx+x,y:s.cy+y,vx:R(-10,10),vy:-R(30,90),life:R(.6,1.3),t:0,r:R(.8,2),kind:'ember'});}},
 ice(s,ctx,g,I){paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,w,w);gr.addColorStop(0,'#ffffff');gr.addColorStop(.45,'#bfeeff');gr.addColorStop(1,'#5fb6e0');t.fillStyle=gr;t.fillRect(0,0,w,w);t.strokeStyle='rgba(255,255,255,.75)';t.lineWidth=1.2;for(let i=0;i<7;i++){const a=i*.9+.3;t.beginPath();t.moveTo(w/2+Math.cos(a)*w,w/2+Math.sin(a)*w);t.lineTo(w/2-Math.cos(a)*w,w/2-Math.sin(a)*w);t.stroke();}},{glow:'#9fe3ff',blur:14+I*12});
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.fillStyle='rgba(235,250,255,.8)';for(let i=0;i<14;i++){const [x,y]=pick(g.edges);ctx.fillRect(s.cx+x+R(-1.5,1.5),s.cy+y+R(-1.5,1.5),1.2,1.2);}ctx.restore();},
 thunder(s,ctx,g,I){paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,0,w);gr.addColorStop(0,'#fff6c0');gr.addColorStop(.5,'#ffd84a');gr.addColorStop(1,'#a8781a');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#ffe36a',blur:10+I*14,alpha:.92});
  ctx.save();ctx.globalCompositeOperation='lighter';const runs=1+Math.floor(I*3+Math.random()*1.5);for(let r=0;r<runs;r++){let [x,y]=pick(g.edges);ctx.strokeStyle='rgba(255,255,235,.95)';ctx.lineWidth=1.2;ctx.shadowColor='#fff3a0';ctx.shadowBlur=10;ctx.beginPath();ctx.moveTo(s.cx+x,s.cy+y);for(let k=0;k<6;k++){let best=null,bd=1e9;for(let q=0;q<10;q++){const p=pick(g.edges),dd=Math.hypot(p[0]-x,p[1]-y);if(dd>3&&dd<bd){bd=dd;best=p;}}if(!best)break;[x,y]=best;ctx.lineTo(s.cx+x+R(-2,2),s.cy+y+R(-2,2));}ctx.stroke();}
  if(Math.random()<.08+I*.2){const [x,y]=pick(g.edges),a=Math.atan2(y,x),L=R(14,34)*(s.u||1);ctx.beginPath();ctx.moveTo(s.cx+x,s.cy+y);ctx.lineTo(s.cx+x+Math.cos(a+R(-.4,.4))*L*.5+R(-4,4),s.cy+y+Math.sin(a)*L*.5);ctx.lineTo(s.cx+x+Math.cos(a)*L,s.cy+y+Math.sin(a)*L);ctx.stroke();}ctx.restore();},
 wind(s,ctx,g,I){paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{t.fillStyle='rgba(200,255,232,.9)';t.fillRect(0,0,w,w);const o=(s.age*120)%w;const gr=t.createLinearGradient(o-w,0,o,0);gr.addColorStop(0,'rgba(120,210,180,0)');gr.addColorStop(.5,'rgba(90,190,160,.75)');gr.addColorStop(1,'rgba(120,210,180,0)');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#8fe0c0',blur:10+I*10,alpha:.95});
  if(Math.random()<.7+I)for(let i=0;i<2;i++){const [x,y]=pick(g.edges);s.ps.push({x:s.cx+x,y:s.cy+y,vx:R(60,140)*(Math.random()<.5?1:-1),vy:R(-30,10),drag:1.6,life:R(.5,1),t:0,kind:'gust',trail:[]});}},
 water(s,ctx,g,I){const w=g.w;if(tmp.width!==w){tmp.width=w;tmp.height=w;}
  ctx.save();ctx.shadowColor='#5fb0f0';ctx.shadowBlur=12+I*10;const slices=Math.round(w/3);
  paintGlyph({save(){},restore(){},drawImage(){},set globalCompositeOperation(v){},set globalAlpha(v){},set shadowColor(v){},set shadowBlur(v){}},g,0,0,(t,ww)=>{const gr=t.createLinearGradient(0,0,0,ww);gr.addColorStop(0,'#e8f6ff');gr.addColorStop(.4,'#7cc4f4');gr.addColorStop(1,'#1d5fa8');t.fillStyle=gr;t.fillRect(0,0,ww,ww);const yb=((s.age*.4)%1)*ww;t.fillStyle='rgba(255,255,255,.45)';t.fillRect(0,yb,ww,ww*.05);});
  for(let i=0;i<slices;i++){const sy=i*3,off=Math.sin(sy*.09+s.age*3)*(1.5+I*2);ctx.drawImage(tmp,0,sy,w,3,s.cx-w/2+off,s.cy-w/2+sy,w,3);}ctx.restore();
  if(Math.random()<.12+I*.3){const low=g.edges.filter(p=>p[1]>0);if(low.length){const [x,y]=pick(low);s.ps.push({x:s.cx+x,y:s.cy+y,vx:0,vy:R(10,30),g:300,life:R(.6,1),t:0,r:R(1.2,2.2)*(s.u||1),kind:'drop'});}}},
 earth(s,ctx,g,I){paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{t.fillStyle='#8a6a48';t.fillRect(0,0,w,w);if(!s.grain){s.grain=Array.from({length:420},()=>[Math.random(),Math.random(),Math.random()]);}for(const [a,b,c] of s.grain){t.fillStyle=c<.5?`rgba(40,26,16,${.35+c*.5})`:`rgba(230,200,160,${(c-.5)*.6})`;t.fillRect(a*w,b*w,1.6,1.6);}t.strokeStyle='rgba(30,18,10,.8)';t.lineWidth=1;t.beginPath();t.moveTo(w*.2,w*.3);t.lineTo(w*.45,w*.5);t.lineTo(w*.4,w*.75);t.moveTo(w*.6,w*.2);t.lineTo(w*.7,w*.55);t.stroke();},{glow:'rgba(0,0,0,.7)',blur:6});
  if(Math.random()<.15+I*.35){const low=g.edges.filter(p=>p[1]>0);if(low.length){const [x,y]=pick(low);s.ps.push({x:s.cx+x,y:s.cy+y,vx:R(-12,12),vy:R(0,20),g:420,life:R(.6,1.1),t:0,r:R(1,2.4),kind:'dust'});}}},
 light(s,ctx,g,I){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<10;i++){const [x,y]=g.edges[(i*37+Math.floor(s.age*14))%g.edges.length]||[0,0],a=Math.atan2(y,x),L=(20+I*40)*(s.u||1);const gr=ctx.createLinearGradient(s.cx+x,s.cy+y,s.cx+x+Math.cos(a)*L,s.cy+y+Math.sin(a)*L);gr.addColorStop(0,'rgba(255,250,220,.6)');gr.addColorStop(1,'rgba(255,240,180,0)');ctx.strokeStyle=gr;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(s.cx+x,s.cy+y);ctx.lineTo(s.cx+x+Math.cos(a)*L,s.cy+y+Math.sin(a)*L);ctx.stroke();}ctx.restore();
  paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{const gr=t.createRadialGradient(w/2,w/2,0,w/2,w/2,w*.6);gr.addColorStop(0,'#ffffff');gr.addColorStop(.6,'#fff1c0');gr.addColorStop(1,'#e8c060');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#fff1b8',blur:22+I*20});},
 dark(s,ctx,g,I){const halo=ctx.createRadialGradient(s.cx,s.cy,g.w*.15,s.cx,s.cy,g.w*.75);halo.addColorStop(0,'rgba(0,0,0,.6)');halo.addColorStop(1,'rgba(0,0,0,0)');ctx.save();ctx.globalCompositeOperation='source-over';ctx.fillStyle=halo;ctx.fillRect(s.cx-g.w,s.cy-g.w,g.w*2,g.w*2);ctx.restore();
  paintGlyph(ctx,g,s.cx,s.cy,(t,w)=>{const gr=t.createRadialGradient(w/2,w/2,0,w/2,w/2,w*.6);gr.addColorStop(0,'#05010a');gr.addColorStop(.75,'#1a0b2e');gr.addColorStop(1,'#6a46b0');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#a07ae0',blur:10+I*12});
  if(Math.random()<.5+I)for(let i=0;i<2;i++){const [x,y]=pick(g.edges);s.ps.push({x:s.cx+x,y:s.cy+y,vx:R(-8,8),vy:-R(10,30),life:R(1,1.8),t:0,r:R(4,9),kind:'smoke'});}}
};

/* formations; s.ct = seconds since cast (or -1) */
const ring=(ctx,cx,cy,r,p,rot=0)=>{ctx.beginPath();ctx.arc(cx,cy,r,rot-Math.PI/2,rot-Math.PI/2+TAU*Math.min(1,Math.max(0,p)));ctx.stroke();};
const stage=(s,t0,d)=>s.ct<0?1:Math.min(1,Math.max(0,(s.ct-t0)/d));
export const FORMS={
 fire(s,ctx,I){const Rr=Math.min(s.W,s.H)*.42,a=s.ct<0?.42:.95,rot=s.age*(s.ct<0?.08:.35);ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=`rgba(255,110,60,${a})`;ctx.shadowColor='#ff4a2a';ctx.shadowBlur=s.ct<0?6:14;ctx.lineWidth=1.2;
  ring(ctx,s.cx,s.cy,Rr,stage(s,0,.35),rot);ctx.lineWidth=.6;ring(ctx,s.cx,s.cy,Rr*.93,stage(s,.1,.35),-rot);ctx.lineWidth=1;ring(ctx,s.cx,s.cy,Rr*.74,stage(s,.25,.35),rot*1.4);ring(ctx,s.cx,s.cy,Rr*.3,stage(s,.5,.3),-rot);
  const tp=stage(s,.15,.4);ctx.lineWidth=.8;for(let i=0;i<72*tp;i++){const q=rot+i/72*TAU,L=i%6?Rr*.025:Rr*.05;ctx.beginPath();ctx.moveTo(s.cx+Math.cos(q)*Rr,s.cy+Math.sin(q)*Rr);ctx.lineTo(s.cx+Math.cos(q)*(Rr-L),s.cy+Math.sin(q)*(Rr-L));ctx.stroke();}
  const rp=stage(s,.3,.4);ctx.fillStyle=`rgba(255,140,90,${a*rp})`;ctx.font=`${Math.round(Rr*.07)}px "Noto Serif JP",serif`;ctx.textAlign='center';ctx.textBaseline='middle';const RUNE='爆裂焔紅蓮灼炎劫火陽炎鳳凰熾天燼烈煌燦';for(let i=0;i<18;i++){const q=-rot*.7+i/18*TAU;ctx.save();ctx.translate(s.cx+Math.cos(q)*Rr*.835,s.cy+Math.sin(q)*Rr*.835);ctx.rotate(q+Math.PI/2);ctx.fillText(RUNE[i],0,0);ctx.restore();}
  const sp=stage(s,.55,.45),pts=Array.from({length:5},(_,i)=>{const q=rot*1.4-Math.PI/2+i*TAU/5;return [s.cx+Math.cos(q)*Rr*.74,s.cy+Math.sin(q)*Rr*.74];});ctx.lineWidth=1.3;ctx.beginPath();const order=[0,2,4,1,3,0];for(let k=0;k<5;k++){const f=Math.min(1,Math.max(0,sp*5-k));if(f<=0)break;const [x0,y0]=pts[order[k]],[x1,y1]=pts[order[k+1]];ctx.moveTo(x0,y0);ctx.lineTo(x0+(x1-x0)*f,y0+(y1-y0)*f);}ctx.stroke();
  if(s.ct>.9&&s.ct<1.35)for(const [x,y] of pts){for(let k=0;k<2;k++){const dx=s.cx-x,dy=s.cy-y,m=Math.hypot(dx,dy);s.ps.push({x,y,vx:dx/m*R(220,340),vy:dy/m*R(220,340),drag:.6,life:m/280,t:0,r:R(14,22)*(s.u||1),kind:'flame'});}}
  ctx.restore();},
 thunder(s,ctx,I){const Rr=Math.min(s.W,s.H)*.38,rot=s.age*.12,nodes=Array.from({length:6},(_,i)=>{const q=rot+i*TAU/6;return [s.cx+Math.cos(q)*Rr,s.cy+Math.sin(q)*Rr];});ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=`rgba(255,230,120,${s.ct<0?.35:.8})`;ctx.lineWidth=1;ctx.beginPath();nodes.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();ring(ctx,s.cx,s.cy,Rr*1.08,1);ctx.setLineDash([2,6]);ring(ctx,s.cx,s.cy,Rr*.55,1,-rot);ctx.setLineDash([]);
  for(const [x,y] of nodes){const gl=ctx.createRadialGradient(x,y,0,x,y,10*(s.u||1));gl.addColorStop(0,'rgba(255,255,230,.95)');gl.addColorStop(1,'rgba(255,220,90,0)');ctx.fillStyle=gl;ctx.beginPath();ctx.arc(x,y,10*(s.u||1),0,TAU);ctx.fill();}
  const sc=this._sc;if(Math.random()<(s.ct<0?.05:.35)){const i=Math.floor(Math.random()*6),a=nodes[i],b=s.ct<0?nodes[(i+1)%6]:[s.cx,s.cy];s.boltAt?.(a[0],a[1],b[0],b[1],s.ct<0?1:1.8);}ctx.restore();},
 wind(s,ctx,I){const Rr=Math.min(s.W,s.H)*.44,spin=s.age*(s.ct<0?.6:2.4),tight=s.ct<0?1:1-Math.min(.35,s.ct*.25);ctx.save();ctx.globalCompositeOperation='lighter';
  for(let arm=0;arm<3;arm++){const a0=spin+arm*TAU/3;for(let i=0;i<40;i++){const t0=i/40,t1=(i+1)/40,r0=Rr*t0*tight*(1+s.out),r1=Rr*t1*tight*(1+s.out),q0=a0+t0*3.2,q1=a0+t1*3.2;ctx.strokeStyle=`rgba(190,255,228,${(1-t0)*.15+t0*.5*(s.ct<0?.6:1)})`;ctx.lineWidth=.4+t0*2.4;ctx.beginPath();ctx.moveTo(s.cx+Math.cos(q0)*r0,s.cy+Math.sin(q0)*r0*.7);ctx.lineTo(s.cx+Math.cos(q1)*r1,s.cy+Math.sin(q1)*r1*.7);ctx.stroke();}}
  ctx.strokeStyle='rgba(190,255,228,.18)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(s.cx,s.cy,Rr,Rr*.7,0,0,TAU);ctx.stroke();ctx.restore();},
 water(s,ctx,I){const Rr=Math.min(s.W,s.H)*.4*(s.ct<0?1:1-Math.min(.3,s.ct*.22)),n=14;ctx.save();ctx.globalCompositeOperation='lighter';
  for(let layer=0;layer<3;layer++){ctx.strokeStyle=`rgba(150,215,255,${[.55,.3,.18][layer]*(s.ct<0?.7:1)})`;ctx.lineWidth=[1.4,1,.8][layer];ctx.beginPath();for(let i=0;i<=120;i++){const q=i/120*TAU,r=Rr*(1-layer*.12)+Math.sin(q*n+s.age*(2+layer)+layer)*(4+layer*2)*(s.u||1);ctx[i?'lineTo':'moveTo'](s.cx+Math.cos(q)*r,s.cy+Math.sin(q)*r*.9);}ctx.closePath();ctx.stroke();}
  ctx.restore();},
 earth(s,ctx,I){const Rr=Math.min(s.W,s.H)*.4*(s.ct<0?1:Math.max(.2,1-Math.max(0,s.ct-.3)*.8)),rot=s.age*.18;if(!s.slabs)s.slabs=Array.from({length:6},()=>Array.from({length:6},(_,k)=>{const q=k/6*TAU+R(-.25,.25);return [Math.cos(q)*R(.75,1),Math.sin(q)*R(.75,1)];}));ctx.save();ctx.globalCompositeOperation='source-over';
  ctx.strokeStyle='rgba(208,160,112,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(s.cx,s.cy+Rr*.15,Rr*1.05,Rr*.32,0,0,TAU);ctx.stroke();
  for(let i=0;i<6;i++){const q=rot+i*TAU/6,x=s.cx+Math.cos(q)*Rr,y=s.cy+Math.sin(q)*Rr*.55+Math.sin(s.age*1.4+i)*4,sz=14*(s.u||1);ctx.save();ctx.translate(x,y);ctx.rotate(q*.3+i);ctx.beginPath();s.slabs[i].forEach(([a,b],k)=>ctx[k?'lineTo':'moveTo'](a*sz,b*sz*1.4));ctx.closePath();const gr=ctx.createLinearGradient(-sz,-sz,sz,sz);gr.addColorStop(0,'#8a6a48');gr.addColorStop(1,'#3a2618');ctx.fillStyle=gr;ctx.fill();ctx.strokeStyle='rgba(240,200,150,.6)';ctx.stroke();ctx.fillStyle='rgba(255,200,140,.8)';ctx.font=`${Math.round(sz*.8)}px "Noto Serif JP",serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('岩地石山砂鉱'[i],0,0);ctx.restore();}
  if(s.cracks){ctx.strokeStyle='rgba(255,190,120,.7)';ctx.lineWidth=1.2;s.cracks=s.cracks.filter(c=>{c.t+=s.dt;if(c.t>2.4)return false;ctx.globalAlpha=Math.min(1,(2.4-c.t));const L=Math.min(1,c.t*3)*c.L*Rr*1.6;ctx.beginPath();ctx.moveTo(s.cx,s.cy+Rr*.15);ctx.lineTo(s.cx+Math.cos(c.a)*L,s.cy+Rr*.15+Math.sin(c.a)*L*.3);ctx.stroke();return true;});ctx.globalAlpha=1;}
  ctx.restore();},
 light(s,ctx,I){const Rr=Math.min(s.W,s.H)*.4,rot=s.age*.1,reach=s.ct<0?1:1+Math.min(1.4,Math.max(0,s.ct-.5)*1.4);ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(255,244,200,.3)';ctx.lineWidth=.7;for(const k of [1,.86,.62])ring(ctx,s.cx,s.cy,Rr*k,1);
  ctx.strokeStyle='rgba(255,246,210,.55)';ctx.lineWidth=1;ctx.beginPath();for(let i=0;i<=16;i++){const q=-rot+i*TAU/16,r=i%2?Rr*.3:Rr*.62;ctx[i?'lineTo':'moveTo'](s.cx+Math.cos(q)*r,s.cy+Math.sin(q)*r);}ctx.closePath();ctx.stroke();
  for(let i=0;i<12;i++){const q=rot+i*TAU/12,L=Rr*(i%2?.9:1.25)*reach,gr=ctx.createLinearGradient(s.cx,s.cy,s.cx+Math.cos(q)*L,s.cy+Math.sin(q)*L);gr.addColorStop(0,'rgba(255,250,220,.0)');gr.addColorStop(.3,'rgba(255,250,220,.45)');gr.addColorStop(1,'rgba(255,240,180,0)');ctx.strokeStyle=gr;ctx.lineWidth=i%2?1:2;ctx.beginPath();ctx.moveTo(s.cx,s.cy);ctx.lineTo(s.cx+Math.cos(q)*L,s.cy+Math.sin(q)*L);ctx.stroke();}ctx.restore();}
};
/* element-specific bursts, added to the scene's own */
export const BURSTS={
 fire(s){for(let i=0;i<40;i++){const a=R(0,TAU),v=R(80,260);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,drag:2,life:R(.8,1.4),t:0,r:R(16,30)*(s.u||1),kind:'flame'});}},
 thunder(s){const Rr=Math.min(s.W,s.H)*.38;for(let i=0;i<6;i++){const q=s.age*.12+i*TAU/6;s.boltAt?.(s.cx+Math.cos(q)*Rr,s.cy+Math.sin(q)*Rr,s.cx,s.cy,2.6);}},
 wind(s){for(let i=0;i<60;i++){const a=R(0,TAU),v=R(200,480);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.7,drag:1.4,life:R(.6,1.1),t:0,kind:'gust',trail:[]});}},
 water(s){for(let i=0;i<4;i++)s.rings.push({t:-i*.12,life:2.4});},
 earth(s){for(let i=0;i<18;i++){const a=R(0,TAU);s.cracks=(s.cracks||[]);s.cracks.push({a,L:R(.4,1),t:0});}},
 light(s){s.sun=2;}
};
