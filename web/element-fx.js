// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: not the same magic circle for every element — each element its own animation and particles,
   finely made). A canvas scene per element for the 转职 stage. Idle it breathes quietly; cast() raises it to full
   strength and then bursts in the element's own way:
   fire   embers and flame tongues rising, a hot core; burst: a column of fire and a spray of embers
   ice    a snowflake drawing itself arm by arm, snow drifting; burst: the flake shatters into glinting shards
   thunder forked bolts striking the centre, sparks; burst: one great bolt and a white flash
   wind   streaks circling on curved paths, leaves riding them; burst: a gust ring and everything flung outward
   water  ripples spreading, droplets rising and falling; burst: a splash crown
   earth  rock fragments levitating and turning, dust; burst: the rocks slam together and dust bursts out
   light  slow rays turning, motes rising; burst: a sunburst of rays and a soft flash
   dark   wisps spiralling into an eclipse; burst: the eclipse implodes and a violet ring breaks outward
   Presentation only; reduced motion draws one still frame. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const R=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;
function hexA(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;}

const SCENES={
 fire:{color:'#ff7a3a',
  spawn(s,I){for(let i=0;i<Math.round(2+I*5);i++)s.ps.push({x:s.cx+R(-60,60)*(1+I*.4)*s.u,y:s.cy+R(30,90)*s.u,vx:R(-12,12),vy:-R(40,110)*(.6+I),life:R(.9,1.8),t:0,r:R(1,3.2),kind:'ember'});
   if(Math.random()<.5+I*.4)s.ps.push({x:s.cx+R(-34,34)*s.u,y:s.cy+R(10,40)*s.u,vx:R(-6,6),vy:-R(60,120)*(.7+I)*s.u,life:R(.5,.9),t:0,r:R(10,22)*(.7+I*.5)*s.u,kind:'flame'});},
  draw(s,ctx,I){const FR=(70+I*40)*s.u,g=ctx.createRadialGradient(s.cx,s.cy+10,0,s.cx,s.cy+10,FR);g.addColorStop(0,`rgba(255,240,200,${.35+I*.35})`);g.addColorStop(.35,`rgba(255,140,60,${.18+I*.2})`);g.addColorStop(1,'rgba(255,60,30,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.cx,s.cy+10,FR,0,TAU);ctx.fill();},
  part(p,ctx){const k=p.t/p.life,hot=1-k;if(p.kind==='flame'){ctx.fillStyle=`rgba(255,${Math.round(110+120*hot)},${Math.round(40*hot)},${.22*hot})`;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*(1-k*.5),p.r*1.6*(1-k*.4),0,0,TAU);ctx.fill();}
   else{ctx.fillStyle=`rgba(255,${Math.round(150+100*hot)},${Math.round(80*hot)},${hot})`;ctx.beginPath();ctx.arc(p.x+Math.sin(p.t*9+p.r)*3,p.y,p.r*(.5+hot*.5),0,TAU);ctx.fill();}},
  burst(s){for(let i=0;i<160;i++){const a=R(-Math.PI*.95,-Math.PI*.05),v=R(120,520);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:260,life:R(.8,1.8),t:0,r:R(1,3),kind:'ember'});}
   for(let i=0;i<26;i++)s.ps.push({x:s.cx+R(-20,20),y:s.cy+R(-10,30),vx:R(-20,20),vy:-R(200,420),life:R(.5,.9),t:0,r:R(18,34),kind:'flame'});s.flash=.6;}},
 ice:{color:'#9fe3ff',
  spawn(s,I){if(Math.random()<.5+I)s.ps.push({x:R(0,s.W),y:-6,vx:R(-8,8),vy:R(14,34)*(1+I),life:R(5,9),t:0,r:R(.6,2),kind:'snow',ph:R(0,TAU)});},
  draw(s,ctx,I){const grow=Math.min(1,s.age/1.6+I*.6),rot=s.age*.08;ctx.save();ctx.translate(s.cx,s.cy);ctx.rotate(rot);ctx.strokeStyle=`rgba(200,240,255,${.45+I*.45})`;ctx.lineCap='round';ctx.shadowColor='#9fe3ff';ctx.shadowBlur=8+I*14;
   for(let a=0;a<6;a++){ctx.save();ctx.rotate(a*TAU/6);ctx.lineWidth=1.6*s.u;const L=(46+I*22)*grow*s.u;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-L);ctx.stroke();
    for(const f of [.35,.6,.82]){if(grow<f)continue;const b=L*.28*(1-f*.4);ctx.lineWidth=1.1*s.u;ctx.beginPath();ctx.moveTo(0,-L*f);ctx.lineTo(-b,-L*f-b);ctx.moveTo(0,-L*f);ctx.lineTo(b,-L*f-b);ctx.stroke();}ctx.restore();}
   ctx.restore();ctx.shadowBlur=0;},
  part(p,ctx){if(p.kind==='shard'){const k=p.t/p.life;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a+p.t*p.spin);ctx.fillStyle=`rgba(220,248,255,${1-k})`;ctx.beginPath();ctx.moveTo(0,-p.r*2);ctx.lineTo(p.r*.6,0);ctx.lineTo(0,p.r*2);ctx.lineTo(-p.r*.6,0);ctx.closePath();ctx.fill();ctx.restore();return;}
   p.x+=Math.sin(p.t*1.4+p.ph)*.3;ctx.fillStyle=`rgba(225,246,255,${Math.min(1,p.t)*.9})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();},
  burst(s){for(let i=0;i<90;i++){const a=R(0,TAU),v=R(80,420);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,g:120,drag:1.4,life:R(.8,1.6),t:0,r:R(1.5,4.5),kind:'shard',a:R(0,TAU),spin:R(-6,6)});}s.flash=.45;}},
 thunder:{color:'#ffe36a',
  bolt(s,x0,y0,x1,y1,w){const pts=[[x0,y0]],n=10;for(let i=1;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t+R(-1,1)*26*(1-Math.abs(t-.5)),y0+(y1-y0)*t+R(-1,1)*16]);}pts.push([x1,y1]);s.bolts.push({pts,t:0,life:R(.12,.22),w});},
  spawn(s,I){if(Math.random()<.04+I*.12){const a=R(0,TAU),r=Math.max(s.W,s.H)*.6;this.bolt(s,s.cx+Math.cos(a)*r,s.cy+Math.sin(a)*r,s.cx+R(-8,8),s.cy+R(-8,8),1.2+I*1.6);for(let i=0;i<8;i++){const b=R(0,TAU),v=R(60,220);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(b)*v,vy:Math.sin(b)*v,drag:3,life:R(.2,.5),t:0,r:R(.8,1.8),kind:'spark'});}}},
  draw(s,ctx,I){s.bolts=s.bolts.filter(b=>{b.t+=s.dt;if(b.t>b.life)return false;const a=1-b.t/b.life;ctx.strokeStyle=`rgba(255,248,210,${a})`;ctx.shadowColor='#ffe36a';ctx.shadowBlur=18;ctx.lineWidth=b.w;ctx.beginPath();b.pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.lineWidth=b.w*3;ctx.strokeStyle=`rgba(255,220,90,${a*.25})`;ctx.stroke();return true;});ctx.shadowBlur=0;
   const TR=(30+I*30)*s.u,g=ctx.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,TR);g.addColorStop(0,`rgba(255,250,220,${.3+I*.4})`);g.addColorStop(1,'rgba(255,220,90,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.cx,s.cy,TR,0,TAU);ctx.fill();},
  part(p,ctx){ctx.strokeStyle=`rgba(255,245,190,${1-p.t/p.life})`;ctx.lineWidth=p.r;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.04,p.y-p.vy*.04);ctx.stroke();},
  burst(s){this.bolt(s,s.cx+R(-40,40),-10,s.cx,s.cy,4);this.bolt(s,s.cx+R(-80,80),-10,s.cx,s.cy,2.4);for(let i=0;i<70;i++){const b=R(0,TAU),v=R(120,480);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(b)*v,vy:Math.sin(b)*v,drag:2.4,life:R(.3,.8),t:0,r:R(1,2.2),kind:'spark'});}s.flash=1;}},
 wind:{color:'#8fe0c0',
  spawn(s,I){if(s.ps.length<70+I*90)s.ps.push({a:R(0,TAU),rad:R(40,Math.min(s.W,s.H)*.46),w:R(.8,1.8)*(1+I*1.4)*(Math.random()<.5?1:1),life:R(1.6,3.2),t:0,kind:Math.random()<.12?'leaf':'streak',r:R(2,4),x:0,y:0,spin:R(-4,4)});},
  draw(){},
  part(p,ctx,s){const k=p.t/p.life,al=Math.sin(Math.PI*k);p.a+=p.w*s.dt*(1+s.I);if(s.out)p.rad+=s.out*s.dt*260;const x=s.cx+Math.cos(p.a)*p.rad,y=s.cy+Math.sin(p.a)*p.rad*.62;
   if(p.kind==='leaf'){ctx.save();ctx.translate(x,y);ctx.rotate(p.a*2+p.t*p.spin);ctx.fillStyle=`rgba(170,240,200,${al*.9})`;ctx.beginPath();ctx.ellipse(0,0,p.r*1.6,p.r*.7,0,0,TAU);ctx.fill();ctx.restore();return;}
   ctx.strokeStyle=`rgba(200,255,232,${al*.55})`;ctx.lineWidth=1.1;ctx.beginPath();ctx.ellipse(s.cx,s.cy,p.rad,p.rad*.62,0,p.a-.35*p.w,p.a);ctx.stroke();},
  burst(s){s.out=1.4;s.ring=1;s.flash=.25;}},
 water:{color:'#5fb0f0',
  spawn(s,I){if(Math.random()<.025+I*.05)s.rings.push({t:0,life:R(1.8,2.6)});if(Math.random()<.2+I*.6){const a=R(-Math.PI*.8,-Math.PI*.2),v=R(60,200)*(.6+I);s.ps.push({x:s.cx+R(-14,14),y:s.cy+18*s.u,vx:Math.cos(a)*v*s.u,vy:Math.sin(a)*v*s.u,g:380*s.u,life:R(.8,1.5),t:0,r:R(1.4,3)*s.u,kind:'drop'});}},
  draw(s,ctx){s.rings=s.rings.filter(r=>{r.t+=s.dt;if(r.t>r.life)return false;const k=r.t/r.life,rad=(12+k*Math.min(s.W,s.H)*.42);ctx.strokeStyle=`rgba(150,210,255,${(1-k)*.7})`;ctx.lineWidth=1.4*(1-k)+.4;ctx.beginPath();ctx.ellipse(s.cx,s.cy+22,rad,rad*.32,0,0,TAU);ctx.stroke();return true;});},
  part(p,ctx){const k=p.t/p.life;ctx.fillStyle=`rgba(190,230,255,${1-k*.8})`;ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*.8,p.r*1.3,Math.atan2(p.vy,p.vx)+Math.PI/2,0,TAU);ctx.fill();},
  burst(s){for(let i=0;i<110;i++){const a=R(-Math.PI*.98,-Math.PI*.02),v=R(160,560);s.ps.push({x:s.cx+R(-10,10),y:s.cy+18,vx:Math.cos(a)*v*.7,vy:Math.sin(a)*v,g:620,life:R(1,1.8),t:0,r:R(1.5,3.6),kind:'drop'});}for(let i=0;i<3;i++)s.rings.push({t:-i*.15,life:2.2});s.flash=.3;}},
 earth:{color:'#d0a070',
  spawn(s,I){if(s.ps.filter(p=>p.kind==='rock').length<10+I*8){const a=R(0,TAU),rad=R(60,Math.min(s.W,s.H)*.4);const pts=Array.from({length:6},(_,i)=>{const b=i/6*TAU+R(-.3,.3),r=R(.6,1);return [Math.cos(b)*r,Math.sin(b)*r];});s.ps.push({kind:'rock',a,rad,size:R(5,14)*s.u,pts,rot:R(0,TAU),spin:R(-.6,.6),bob:R(0,TAU),life:R(4,7),t:0});}
   if(Math.random()<.3+I)s.ps.push({x:s.cx+R(-120,120),y:s.cy+R(40,90),vx:R(-8,8),vy:-R(8,26),life:R(1.5,3),t:0,r:R(.6,1.6),kind:'dust'});},
  draw(){},
  part(p,ctx,s){if(p.kind==='dust'){ctx.fillStyle=`rgba(210,170,130,${(1-p.t/p.life)*.6})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();return;}
   const k=p.t/p.life,al=Math.min(1,p.t*2)*Math.min(1,(p.life-p.t)*2);if(s.pull)p.rad=Math.max(14,p.rad-s.pull*s.dt*240);p.a+=.12*s.dt*(1+s.I*2);
   const x=s.cx+Math.cos(p.a)*p.rad,y=s.cy+Math.sin(p.a)*p.rad*.55+Math.sin(p.t*1.6+p.bob)*6-(1-k)*4;
   ctx.save();ctx.translate(x,y);ctx.rotate(p.rot+p.t*p.spin);ctx.beginPath();p.pts.forEach(([a,b],i)=>i?ctx.lineTo(a*p.size,b*p.size):ctx.moveTo(a*p.size,b*p.size));ctx.closePath();
   ctx.fillStyle=`rgba(96,70,50,${al})`;ctx.fill();ctx.strokeStyle=`rgba(230,190,140,${al*.7})`;ctx.lineWidth=1;ctx.stroke();ctx.restore();},
  burst(s){s.pull=1;setTimeout(()=>{s.pull=0;for(const p of s.ps)if(p.kind==='rock'){p.rad+=R(40,140);}for(let i=0;i<120;i++){const a=R(0,TAU),v=R(60,300);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.5-40,drag:2,life:R(.8,1.8),t:0,r:R(1,2.6),kind:'dust'});}s.flash=.35;},420);}},
 light:{color:'#fff1b8',
  spawn(s,I){if(Math.random()<.3+I*.8)s.ps.push({x:s.cx+R(-140,140),y:s.cy+R(0,120),vx:R(-6,6),vy:-R(14,40)*(1+I),life:R(2,4),t:0,r:R(.8,2.2),kind:'mote'});},
  draw(s,ctx,I){const n=16,len=(90+I*80)*(1+s.sun)*s.u;ctx.save();ctx.translate(s.cx,s.cy);ctx.rotate(s.age*.06);for(let i=0;i<n;i++){ctx.rotate(TAU/n);const l=len*(i%2?.6:1)*(.85+.15*Math.sin(s.age*1.3+i));const g=ctx.createLinearGradient(0,0,0,-l);g.addColorStop(0,`rgba(255,248,220,${.35+I*.3})`);g.addColorStop(1,'rgba(255,240,180,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-2.5,0);ctx.lineTo(0,-l);ctx.lineTo(2.5,0);ctx.fill();}ctx.restore();
   const LR=(46+I*30)*s.u,g=ctx.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,LR);g.addColorStop(0,`rgba(255,255,240,${.5+I*.4})`);g.addColorStop(1,'rgba(255,240,180,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(s.cx,s.cy,LR,0,TAU);ctx.fill();s.sun*=.96;},
  part(p,ctx){const k=p.t/p.life;ctx.fillStyle=`rgba(255,250,225,${Math.sin(Math.PI*k)})`;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,TAU);ctx.fill();},
  burst(s){s.sun=1.6;s.flash=.7;for(let i=0;i<60;i++){const a=R(0,TAU),v=R(80,300);s.ps.push({x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:1.5,life:R(1,2),t:0,r:R(1,2.4),kind:'mote'});}}},
 dark:{color:'#a07ae0',
  spawn(s,I){if(s.ps.length<120+I*120)s.ps.push({a:R(0,TAU),rad:R(70,Math.max(s.W,s.H)*.6),life:R(2,4),t:0,kind:'wisp',w:R(.6,1.4),px:null,py:null});},
  draw(s,ctx,I){const r=(30+I*10)*s.ec*s.u;ctx.fillStyle='rgba(6,2,12,.95)';ctx.beginPath();ctx.arc(s.cx,s.cy,r,0,TAU);ctx.fill();ctx.strokeStyle=`rgba(190,150,255,${.5+I*.4})`;ctx.lineWidth=1.6;ctx.shadowColor='#a07ae0';ctx.shadowBlur=16+I*16;ctx.beginPath();ctx.arc(s.cx,s.cy,r,0,TAU);ctx.stroke();ctx.shadowBlur=0;
   if(s.ring){s.ring+=s.dt*1.1;const k=s.ring-1;if(k>1)s.ring=0;else{ctx.strokeStyle=`rgba(200,160,255,${1-k})`;ctx.lineWidth=3*(1-k)+.5;ctx.beginPath();ctx.arc(s.cx,s.cy,r+k*Math.max(s.W,s.H)*.6,0,TAU);ctx.stroke();}}},
  part(p,ctx,s){const k=p.t/p.life;p.a+=p.w*s.dt*(1.4+s.I*2)*(80/Math.max(30,p.rad));p.rad=Math.max(0,p.rad-s.dt*(26+s.I*70)*(s.implode?4:1));const x=s.cx+Math.cos(p.a)*p.rad,y=s.cy+Math.sin(p.a)*p.rad;
   if(p.px!==null){ctx.strokeStyle=`rgba(170,130,240,${Math.sin(Math.PI*k)*.55})`;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(x,y);ctx.stroke();}p.px=x;p.py=y;if(p.rad<(30*s.ec*s.u))p.t=p.life;},
  burst(s){s.implode=1;setTimeout(()=>{s.implode=0;s.ec=.4;s.ring=1;s.flash=.35;},380);}}
};

/* mount(canvas, element) → {setElement, cast(onBurst), stop} */
export function mountElementFx(canvas){
 const ctx=canvas.getContext('2d');if(!ctx)return {setElement(){},cast(cb){cb?.();},stop(){}};
 const s={u:1,ps:[],bolts:[],rings:[],age:0,dt:0,I:.35,target:.35,flash:0,sun:0,ec:1,out:0,ring:0,pull:0,implode:0,W:0,H:0,cx:0,cy:0};
 let el='fire',raf=0,prev=performance.now(),stopped=false;
 const size=()=>{const dpr=Math.min(2,devicePixelRatio||1),W=canvas.clientWidth,H=canvas.clientHeight;if(W&&(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr))){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);s.W=W;s.H=H;s.cx=W/2;s.cy=H/2;s.u=Math.max(1,Math.min(W,H)/240);};
 const frame=now=>{if(stopped||!canvas.isConnected)return;s.dt=Math.min(.05,(now-prev)/1000);prev=now;s.age+=s.dt;s.I+=(s.target-s.I)*Math.min(1,s.dt*3);size();
  const sc=SCENES[el];ctx.clearRect(0,0,s.W,s.H);ctx.globalCompositeOperation=el==='dark'?'source-over':'lighter';
  sc.spawn(s,s.I);sc.draw(s,ctx,s.I);
  s.ps=s.ps.filter(p=>{p.t+=s.dt;if(p.t>p.life)return false;if(p.vx!==undefined){if(p.drag){p.vx*=1-p.drag*s.dt;p.vy*=1-p.drag*s.dt;}if(p.g)p.vy+=p.g*s.dt;p.x+=p.vx*s.dt;p.y+=p.vy*s.dt;}sc.part(p,ctx,s);return true;});
  if(el==='wind'&&s.ring){s.ring+=s.dt;const k=s.ring-1;if(k>1){s.ring=0;}else{ctx.strokeStyle=`rgba(200,255,232,${1-k})`;ctx.lineWidth=2*(1-k)+.4;ctx.beginPath();ctx.ellipse(s.cx,s.cy,20+k*s.W*.6,(20+k*s.W*.6)*.62,0,0,TAU);ctx.stroke();}}
  s.out*=.97;s.ec+=(1-s.ec)*s.dt*2;
  if(s.flash>0){ctx.globalCompositeOperation='lighter';ctx.fillStyle=hexA(el==='dark'?'#c8a8ff':'#ffffff',s.flash*.5);ctx.fillRect(0,0,s.W,s.H);s.flash=Math.max(0,s.flash-s.dt*2.4);}
  if(calm){return;}raf=requestAnimationFrame(frame);};
 raf=requestAnimationFrame(frame);
 return {
  setElement(next){if(next===el||!SCENES[next])return;el=next;s.ps=[];s.bolts=[];s.rings=[];s.age=0;s.flash=0;s.sun=0;s.ec=1;s.out=0;s.ring=0;s.pull=0;s.implode=0;},
  cast(onBurst){s.target=1;setTimeout(()=>{SCENES[el].burst(s);s.target=.7;onBurst?.();},calm?0:1250);},
  color:()=>SCENES[el].color,
  stop(){stopped=true;cancelAnimationFrame(raf);}
 };
}
