// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: every corner but ice's was ugly — make each one a real natural thing that grows in from the edge,
   like frost). Each element's corners are a procedural picture of something that happens at an edge in nature, drawn
   once per size and cached: noise, fractal growth, domain-warped smoke; dense detail, semi-transparent, held to the
   corners by a soft ragged mask. No lines, symbols or patterns.
   fire   — a burnt edge: charred black eating in on noise, a glowing ember seam at its front
   thunder— Lichtenberg figures: dense fractal discharge trees, thinning branch by branch, violet-cyan glow
   wind   — torn mist: domain-warped smoke curling in the corners
   water  — condensation: droplets of every size with refraction and highlights, a few running trails
   earth  — crystal clusters: translucent amber and smoky-quartz prisms with lit and shaded facets
   light  — film light leaks: warm soft blooms and bokeh in the corners
   dark   — ink in water: dark violet ink billowing in from the corners
   Presentation only. */
const TAU=Math.PI*2;
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return ((s>>>0)%1e9)/1e9;};}
/* value noise with a hashed lattice, smoothstep blending; fbm over octaves */
function makeNoise(seed){const r=rng(seed),P=new Uint8Array(512),G=new Float32Array(256);for(let i=0;i<256;i++){P[i]=i;G[i]=r();}for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[P[i],P[j]]=[P[j],P[i]];}for(let i=0;i<256;i++)P[i+256]=P[i];
 const v=(x,y)=>G[P[(x&255)+P[y&255]]];const s=t=>t*t*(3-2*t);
 const n=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=s(xf),w=s(yf);const a=v(xi,yi),b=v(xi+1,yi),c=v(xi,yi+1),d=v(xi+1,yi+1);return a+(b-a)*u+(c-a)*w+(a-b-c+d)*u*w;};
 const fbm=(x,y,o=5)=>{let t=0,amp=.5,f=1,norm=0;for(let i=0;i<o;i++){t+=amp*n(x*f,y*f);norm+=amp;amp*=.5;f*=2.03;}return t/norm;};
 return {n,fbm};}
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
/* how much each point belongs to a corner: 1 at a corner fading to 0 inward, the boundary torn by noise */
function cornerness(x,y,W,H,M,reach,warp){let best=-9;for(const [cx,cy] of [[0,0],[W,0],[0,H],[W,H]]){const d=Math.hypot(x-cx,y-cy)/(M*reach)+warp;best=Math.max(best,1-d);}return best;}
const sstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
/* pixel-shaded fields are computed at a lower resolution and drawn up smoothly */
function shade(W,H,k,fn){const w=Math.round(W*k),h=Math.round(H*k),c=canvas(w,h),x=c.getContext('2d'),img=x.createImageData(w,h),d=img.data;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const o=(j*w+i)*4,px=fn(i/k,j/k);if(!px)continue;d[o]=px[0];d[o+1]=px[1];d[o+2]=px[2];d[o+3]=px[3];}x.putImageData(img,0,0);
 const out=canvas(W,H),y=out.getContext('2d');y.imageSmoothingEnabled=true;y.imageSmoothingQuality='high';y.drawImage(c,0,0,W,H);return out;}

/* ---------- fire: a burnt edge ---------- */
function fire(W,H){const M=Math.min(W,H),N=makeNoise(7);
 /* an organic front (large and middle-scale noise), a narrow charred margin with charcoal grain and a pale ash rim just
    behind the seam, a few burnt-through holes, the seam's light bloomed into the paper ahead, embers lifting off */
 const field=(x,y)=>cornerness(x,y,W,H,M,.38,(N.fbm(x/(M*.2),y/(M*.2),4)-.5)*.8+(N.fbm(x/(M*.06)+20,y/(M*.06),4)-.5)*.28);
 const hole=(x,y)=>N.fbm(x/(M*.03)+50,y/(M*.03)+5,3);
 const seam=shade(W,H,.5,(x,y)=>{let c=field(x,y);const h=hole(x,y),inner=c>.03&&h>.72;if(inner)c=.03-(h-.72)*.3;if(c<-.02||c>.03)return null;const t=Math.max(0,1-Math.abs(c-.004)/.014),live=.5+.5*N.fbm(x/(M*.035)+70,y/(M*.035),3);const k=t*live;return [255,Math.round(110+140*k),Math.round(30+160*k*k),Math.round(255*k)];});
 const char=shade(W,H,.5,(x,y)=>{const c=field(x,y);if(c<=.012)return null;const h=hole(x,y);if(h>.76&&c>.05)return null;
  const grain=N.fbm(x/(M*.008)+5,y/(M*.008),3),ash=Math.exp(-(c-.012)/.012),heat=Math.exp(-(c-.012)/.035),crack=sstep(.9,.98,1-Math.abs(2*N.fbm(x/(M*.02)+3,y/(M*.02)+8,4)-1));
  const g=9+grain*16-crack*6;const R=g+14+heat*90+ash*120,G=g*.62+heat*22+ash*95,B=g*.5+heat*5+ash*78;
  return [Math.min(255,Math.round(R)),Math.min(255,Math.round(G)),Math.min(255,Math.round(B)),Math.round(255*Math.min(.95,.62+sstep(.012,.08,c)*.33))];});
 const brown=shade(W,H,.35,(x,y)=>{const c=field(x,y);if(c>.012||c<-.13)return null;const m=N.fbm(x/(M*.03),y/(M*.03)+9,3);return [115,52,16,Math.round(255*sstep(-.13,0,c)*(.3+.3*m))];});
 const out=canvas(W,H),o=out.getContext('2d');o.drawImage(brown,0,0);o.drawImage(char,0,0);
 o.globalCompositeOperation='lighter';o.filter='blur(18px)';o.globalAlpha=.85;o.drawImage(seam,0,0);o.filter='blur(5px)';o.drawImage(seam,0,0);o.filter='none';o.globalAlpha=1;o.drawImage(seam,0,0);
 const r=rng(19);for(let i=0;i<160;i++){const x=r()*W,y=r()*H,c=field(x,y);if(c<-.07||c>.006)continue;const rad=.6+r()*1.6,g=o.createRadialGradient(x,y,0,x,y,rad*4);g.addColorStop(0,'rgba(255,220,150,.9)');g.addColorStop(.3,'rgba(255,140,50,.5)');g.addColorStop(1,'rgba(255,90,30,0)');o.fillStyle=g;o.fillRect(x-rad*4,y-rad*4,rad*8,rad*8);}
 return out;}

/* ---------- thunder: Lichtenberg figures ---------- */
function thunder(W,H){const M=Math.min(W,H),r=rng(31),core=canvas(W,H),c=core.getContext('2d');c.lineCap='round';c.lineJoin='round';
 /* as discharge trees look in acrylic: fine glowing filaments, the trunk only a little heavier than the rest, branching
    densely toward the tips; mostly glow, very little hard white */
 let budget=60000;const segs=[];
 const grow=(x,y,a,w,len,depth)=>{let px=x,py=y,aa=a;const step=2.2,steps=Math.round(len/step);
  for(let i=0;i<steps&&budget>0;i++,budget--){aa+=(r()-.5)*(.22+depth*.14);const nx=px+Math.cos(aa)*step,ny=py+Math.sin(aa)*step,ww=w*(1-i/steps*.5);segs.push([px,py,nx,ny,ww,depth]);px=nx;py=ny;
   if(depth<7&&r()<.04+depth*.035){const side=r()<.5?1:-1;grow(px,py,aa+side*(.35+r()*.55),ww*.7,len*(.34+r()*.2)*(1-i/steps*.3),depth+1);}}};
 for(const [x,y,a] of [[0,0,.78],[W,0,2.36],[0,H,-.78],[W,H,-2.36]])for(let k=0;k<3;k++)grow(x,y,a+(k-1)*.34+(r()-.5)*.2,2,M*(.34+r()*.1),0);
 for(const [x0,y0,x1,y1,w,d] of segs){c.strokeStyle=`rgba(225,236,255,${Math.max(.18,.7-d*.08)})`;c.lineWidth=Math.max(.35,w);c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();}
 const out=canvas(W,H),o=out.getContext('2d');
 /* a plasma haze over the whole figure, a blue glow round every filament, a pale core */
 o.filter='blur(40px)';o.globalAlpha=.75;o.drawImage(tint(core,'#3a2bd8'),0,0);o.filter='blur(10px)';o.globalAlpha=1;o.drawImage(tint(core,'#4f7dff'),0,0);o.drawImage(tint(core,'#4f7dff'),0,0);o.filter='blur(2px)';o.drawImage(tint(core,'#9cc4ff'),0,0);o.filter='none';o.globalAlpha=.7;o.drawImage(core,0,0);return out;}
function tint(src,col){const c=canvas(src.width,src.height),x=c.getContext('2d');x.fillStyle=col;x.fillRect(0,0,c.width,c.height);x.globalCompositeOperation='destination-in';x.drawImage(src,0,0);return c;}

/* ---------- wind: torn mist ---------- */
function wind(W,H){const M=Math.min(W,H),N=makeNoise(53);
 return shade(W,H,.4,(x,y)=>{const u=x/(M*.22),v=y/(M*.22);const q1=N.fbm(u,v,4),q2=N.fbm(u+5.2,v+1.3,4);const f=N.fbm(u+2.4*q1+1.7,v+2.4*q2+9.2,5),fine=N.fbm(u*3.1+4*q2,v*3.1+4*q1,4);
  const c=cornerness(x,y,W,H,M,.52,(N.fbm(u*.6+3,v*.6,3)-.5)*.9+(fine-.5)*.25);if(c<=0)return null;const den=sstep(.36,.76,f*.75+fine*.35)*sstep(0,.5,c);if(den<.01)return null;
  const lit=.75+.25*sstep(.5,.85,f);return [Math.round(205*lit),Math.round(240*lit),Math.round(228*lit),Math.round(255*den*.55)];});}

/* ---------- water: condensation on glass ---------- */
function water(W,H){const M=Math.min(W,H),r=rng(97),N=makeNoise(5),out=canvas(W,H),c=out.getContext('2d');
 const drops=[];for(let i=0;i<9000;i++){const x=r()*W,y=r()*H,cn=cornerness(x,y,W,H,M,.48,(N.fbm(x/(M*.1),y/(M*.1),3)-.5)*.5);if(cn<=0||r()>Math.pow(cn,.7)*1.4)continue;const big=r();const rad=(big<.06?6+r()*9:big<.3?2.6+r()*3.5:.9+r()*1.8)*(.55+cn)*(M/700);if(drops.some(d=>Math.abs(d[0]-x)<d[2]+rad&&Math.abs(d[1]-y)<d[2]+rad&&Math.hypot(d[0]-x,d[1]-y)<d[2]+rad))continue;drops.push([x,y,rad,cn]);if(drops.length>1400)break;}
 drops.sort((a,b)=>a[2]-b[2]);
 c.drawImage(shade(W,H,.25,(x,y)=>{const cn=cornerness(x,y,W,H,M,.52,(N.fbm(x/(M*.08),y/(M*.08),4)-.5)*.6);if(cn<=0)return null;return [200,225,245,Math.round(255*sstep(0,.6,cn)*.16)];}),0,0);
 /* a few drops have run: a thin wet trail above them */
 for(const d of drops.filter(d=>d[2]>5*(M/700)).slice(0,10)){const [x,y,rad]=d,len=rad*(6+r()*10),g=c.createLinearGradient(x,y-len,x,y);g.addColorStop(0,'rgba(180,220,250,0)');g.addColorStop(1,'rgba(180,220,250,.18)');c.fillStyle=g;c.beginPath();c.moveTo(x-rad*.45,y);c.quadraticCurveTo(x-rad*.25,y-len*.6,x,y-len);c.quadraticCurveTo(x+rad*.25,y-len*.6,x+rad*.45,y);c.fill();}
 for(const [x,y,rad] of drops){
  /* shadow below, a dark rim, a bright lens toward the bottom, a sharp glint top-left */
  c.fillStyle='rgba(0,8,20,.28)';c.beginPath();c.arc(x+rad*.12,y+rad*.22,rad,0,TAU);c.fill();
  const g=c.createRadialGradient(x-rad*.25,y-rad*.3,rad*.1,x,y,rad);g.addColorStop(0,'rgba(170,215,245,.10)');g.addColorStop(.7,'rgba(120,180,230,.16)');g.addColorStop(.92,'rgba(20,50,90,.42)');g.addColorStop(1,'rgba(200,235,255,.5)');c.fillStyle=g;c.beginPath();c.arc(x,y,rad,0,TAU);c.fill();
  c.fillStyle='rgba(220,245,255,.55)';c.beginPath();c.ellipse(x+rad*.1,y+rad*.5,rad*.5,rad*.22,0,0,TAU);c.fill();
  if(rad>1.2){c.fillStyle='rgba(255,255,255,.9)';c.beginPath();c.ellipse(x-rad*.38,y-rad*.42,rad*.2,rad*.13,-.6,0,TAU);c.fill();}}
 return out;}

/* ---------- earth: dry cracked earth ---------- */
function earth(W,H){const M=Math.min(W,H),N=makeNoise(17),r=rng(211);
 /* mud dried into plates. The cells are laid on noise-warped coordinates, so cracks run in uneven curves; crack width
    varies; each plate dishes inward (darker toward its middle) and lifts at its rim, lit from the top-left and casting
    a shadow into the crack on the far side; plates grow smaller toward the corner where it dried first */
 const cell=M*.038,gw=Math.ceil(W/cell)+4,gh=Math.ceil(H/cell)+4,P=new Float32Array(gw*gh*2);
 for(let j=0;j<gh;j++)for(let i=0;i<gw;i++){const k=(j*gw+i)*2;P[k]=(i-2+.1+r()*.8)*cell;P[k+1]=(j-2+.1+r()*.8)*cell;}
 const voro=(x,y)=>{const gi=Math.floor(x/cell)+2,gj=Math.floor(y/cell)+2;let d1=1e9,d2=1e9,bx=0,by=0;for(let j=gj-1;j<=gj+1;j++)for(let i=gi-1;i<=gi+1;i++){if(i<0||j<0||i>=gw||j>=gh)continue;const k=(j*gw+i)*2,dx=x-P[k],dy=y-P[k+1],d=dx*dx+dy*dy;if(d<d1){d2=d1;d1=d;bx=P[k];by=P[k+1];}else if(d<d2)d2=d;}return [Math.sqrt(d1),Math.sqrt(d2),bx,by];};
 return shade(W,H,.5,(x,y)=>{const nz=N.fbm(x/(M*.08),y/(M*.08),4),cn=cornerness(x,y,W,H,M,.44,(nz-.5)*.6);if(cn<=0)return null;
  /* finer plates nearer the corner: zoom the lattice */
  const wx=x+(N.fbm(x/(M*.04),y/(M*.04),3)-.5)*cell*.45,wy=y+(N.fbm(x/(M*.04)+9,y/(M*.04)+4,3)-.5)*cell*.45;
  const [d1,d2,bx,by]=voro(wx,wy),edge=(d2-d1)/cell,cw=.025+.06*N.fbm(wx/(M*.02),wy/(M*.02),2);
  const tex=N.fbm(x/(M*.005),y/(M*.005),3),tone=.36+.14*N.fbm(bx/(M*.06),by/(M*.06),2)+.1*tex;
  const fade=Math.min(1,cn*3);
  if(edge<cw){const k=edge/cw,v=10+28*k*k;return [Math.round(v*1.05),Math.round(v*.82),Math.round(v*.62),Math.round(255*fade)];}
  const nx=wx-bx,ny=wy-by,nl=Math.hypot(nx,ny)||1,toward=-(nx/nl+ny/nl)*.707,rim=1-sstep(cw,cw+.2,edge),dish=sstep(.15,.5,edge);
  const L=Math.max(0,Math.min(1,tone*(1-dish*.18)+rim*toward*.22+rim*.04-(toward<0?rim*.08:0)));
  return [Math.round(255*L*.88),Math.round(255*L*.7),Math.round(255*L*.52),Math.round(255*fade*.97)];});}

/* ---------- light: light leaks and bokeh ---------- */
function light(W,H){const M=Math.min(W,H),r=rng(77),N=makeNoise(29),out=canvas(W,H),c=out.getContext('2d');c.globalCompositeOperation='lighter';
 const leak=shade(W,H,.35,(x,y)=>{const u=x/(M*.5),v=y/(M*.5),ru=(u+v)*.7,rv=(u-v)*.7,streak=N.fbm(ru*.6,rv*4.5,4),f=N.fbm(u+N.fbm(u,v,3)*1.2,v,4);
  const cn=cornerness(x,y,W,H,M,.58,(f-.5)*.45);if(cn<=0)return null;const k=Math.pow(sstep(0,.95,cn),1.5)*(.35+.9*sstep(.35,.75,streak));
  /* film burn: deep orange-red at the very edge, warm gold, then creamy white where it is strongest */
  const e=sstep(.55,1,cn);return [255,Math.round(150+95*(1-e*.6)*(.6+.4*streak)),Math.round(70+150*(1-e)*streak),Math.round(255*Math.min(.85,k*.75))];});c.drawImage(leak,0,0);
 const hex=(x,y,R)=>{c.beginPath();for(let i=0;i<6;i++){const q=i/6*TAU+.3;c[i?'lineTo':'moveTo'](x+Math.cos(q)*R,y+Math.sin(q)*R);}c.closePath();};
 for(let i=0;i<40;i++){const x=r()*W,y=r()*H,cn=cornerness(x,y,W,H,M,.55,0);if(cn<=.08)continue;const R=M*(.006+r()*r()*.045),a=(.08+r()*.22)*Math.min(1,cn*2.5);
  const g=c.createRadialGradient(x,y,0,x,y,R);g.addColorStop(0,`rgba(255,236,200,${a*.45})`);g.addColorStop(.8,`rgba(255,226,180,${a*.6})`);g.addColorStop(1,`rgba(255,246,226,${a*1.2})`);c.fillStyle=g;hex(x,y,R);c.fill();}
 return out;}

/* ---------- dark: ink in water ---------- */
function dark(W,H){const M=Math.min(W,H),N=makeNoise(131);
 /* density of ink as smoke: domain-warped twice; soft where thin, nearly opaque where it gathers; fine curling strands
    ride the billows; violet only where the ink is thin enough for light to pass */
 return shade(W,H,.4,(x,y)=>{const u=x/(M*.2),v=y/(M*.2);const q1=N.fbm(u,v,4),q2=N.fbm(u+3.1,v+7.7,4),r1=N.fbm(u+3*q1+1.2,v+3*q2+5.1,4),r2=N.fbm(u+3*q1+8.3,v+3*q2+2.8,4);const f=N.fbm(u+2.2*r1,v+2.2*r2,5);
  const c=cornerness(x,y,W,H,M,.56,(r1-.5)*.9);if(c<=0)return null;
  const strand=Math.pow(Math.max(0,1-Math.abs(N.fbm(u*2.6+r1*2.5,v*2.6+r2*2.5,4)-.5)*5),3);
  const den=Math.min(1,sstep(.3,.72,f+c*.55)*1.1+strand*sstep(.2,.6,c)*.5);if(den<.02)return null;
  const thin=1-sstep(.35,.9,den),cv=sstep(.15,.6,c);
  return [Math.round(4+125*thin*cv+60*strand*thin),Math.round(2+38*thin*cv+20*strand*thin),Math.round(8+220*thin*cv+120*strand*thin),Math.round(255*Math.min(.97,den*(.55+.45*cv)))];});}

/* (user: fire, thunder and earth are not done with corners at all) */
const ART={wind,water,light,dark};
const CACHE=new Map();
export function cornerArt(el,W,H){W=Math.round(W);H=Math.round(H);const k=el+W+'x'+H;if(CACHE.has(k))return CACHE.get(k);const f=ART[el];if(!f)return null;const cv=f(W,H);CACHE.set(k,cv);return cv;}
export const cornerBlend=el=>({thunder:'lighter',wind:'lighter',light:'lighter',water:'source-over',earth:'source-over',fire:'source-over',dark:'source-over'})[el]||'source-over';
