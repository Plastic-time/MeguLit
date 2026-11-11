// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 the 转职 stage, rebuilt (user: only ice and dark were good; a grand original explosion circle for fire; no
   cheap dot particles anywhere — every particle has a shape and a material; every element keeps moving while it is
   shown; switching elements cross-fades both sides instead of cutting). One canvas, one loop.
   - Switching: the outgoing scene contracts and dissolves while the new one opens from the centre through a short wash
     of its colour (~520 ms); a new switch during that interrupts it (only two scenes ever draw at once).
   - Particles are typed and drawn as shapes: trailing sparks, six-armed flakes and needles, lightning arcs, wind
     streaks and leaves, teardrop drops, rock chips, four-point glints, smoke wisps and violet shards. Each scene keeps
     its own count under a cap and spawns continuously, so idle never runs dry.
   - fire: an original grand blast circle — twin rune bands of invented glyphs turning in opposite directions, a tick
     ring, a heptagram nested in a hexagram nested in an octagon, radial spokes, six satellite circles, crimson to gold,
     humming with a pulse; cast draws it ring by ring from the centre outward, the hum quickens, the circle clenches
     and bursts, and its lines linger as afterglow.
   - ice: a fine snowflake behind the glyph as a halo (graded branches, translucent body), a few shaped flakes and
     needles in depth, cold mist along the bottom, frost growing in from the edges, a glint sweeping the glyph.
   - thunder: a dark cloud bank lit from within, branching strikes down to the glyph, current crawling its strokes.
   - wind: a whirlwind column of helical streamlines behind the glyph, leaves carried round it.
   - water: a water orb with refraction and inner waves, ripples on the floor, drops rising and falling.
   - earth: a floating rock slab with glowing rune seams, chips orbiting, dust settling.
   - light: a halo of thin rings and slow god rays, twinkling four-point glints.
   - dark: an eclipse, smoke wisps seeping and circling, violet shards drawn in, a slow dark mist, a light-eating pulse.
   Reduced motion draws a still frame. Presentation only. */
import {glyphFor,paintGlyph} from './element-forms.js';
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU=Math.PI*2,R=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
const CAP=260;
const COLOR={fire:'#e2423e',ice:'#9fe3ff',thunder:'#ffe36a',wind:'#8fe0c0',water:'#5fb0f0',earth:'#c08a52',light:'#fff1b8',dark:'#a07ae0'};
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;};

/* ---------- shaped particles ---------- */
const DRAW={
 spark(c,p,k){p.trail.push([p.x,p.y]);if(p.trail.length>7)p.trail.shift();c.lineCap='round';for(let i=1;i<p.trail.length;i++){c.globalAlpha=(1-k)*i/p.trail.length;c.strokeStyle=k<.5?'#ffe2a0':'#ff8a3a';c.lineWidth=p.r*i/p.trail.length;c.beginPath();c.moveTo(...p.trail[i-1]);c.lineTo(...p.trail[i]);c.stroke();}},
 flake(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.sin(Math.PI*Math.min(1,k))*p.al;c.strokeStyle='#eaf8ff';c.lineWidth=p.r>5?1.2:.8;if(p.blur)c.filter=`blur(${p.blur}px)`;c.beginPath();for(let i=0;i<6;i++){const q=i*TAU/6,x=Math.sin(q)*p.r,y=-Math.cos(q)*p.r;c.moveTo(0,0);c.lineTo(x,y);const m=.55;c.moveTo(x*m,y*m);c.lineTo(x*m+Math.sin(q+.6)*p.r*.3,y*m-Math.cos(q+.6)*p.r*.3);c.moveTo(x*m,y*m);c.lineTo(x*m+Math.sin(q-.6)*p.r*.3,y*m-Math.cos(q-.6)*p.r*.3);}c.stroke();c.restore();},
 needle(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=(1-k)*.85;c.fillStyle='#dff6ff';c.beginPath();c.moveTo(0,-p.r*2.2);c.lineTo(p.r*.35,0);c.lineTo(0,p.r*2.2);c.lineTo(-p.r*.35,0);c.closePath();c.fill();c.restore();},
 leaf(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.sin(Math.PI*k)*.85;const g=c.createLinearGradient(-p.r,0,p.r,0);g.addColorStop(0,'#5fbf8f');g.addColorStop(1,'#c8f5dc');c.fillStyle=g;c.beginPath();c.moveTo(-p.r*1.6,0);c.quadraticCurveTo(0,-p.r*.9,p.r*1.6,0);c.quadraticCurveTo(0,p.r*.9,-p.r*1.6,0);c.fill();c.strokeStyle='rgba(30,90,60,.6)';c.lineWidth=.6;c.beginPath();c.moveTo(-p.r*1.4,0);c.lineTo(p.r*1.4,0);c.stroke();c.restore();},
 streak(c,p,k){p.trail.push([p.x,p.y]);if(p.trail.length>10)p.trail.shift();c.lineCap='round';c.strokeStyle=p.col||'#c8ffe8';for(let i=1;i<p.trail.length;i++){c.globalAlpha=Math.sin(Math.PI*k)*.55*i/p.trail.length;c.lineWidth=p.r*i/p.trail.length;c.beginPath();c.moveTo(...p.trail[i-1]);c.lineTo(...p.trail[i]);c.stroke();}},
 drop(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx)-Math.PI/2);c.globalAlpha=(1-k*.7)*.9;const g=c.createLinearGradient(0,-p.r*2,0,p.r);g.addColorStop(0,'#f0faff');g.addColorStop(1,'#4f9de8');c.fillStyle=g;c.beginPath();c.moveTo(0,-p.r*2);c.bezierCurveTo(p.r,-p.r*.4,p.r,p.r,0,p.r);c.bezierCurveTo(-p.r,p.r,-p.r,-p.r*.4,0,-p.r*2);c.fill();c.restore();},
 chip(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(p.a+p.t*p.spin);c.globalAlpha=Math.min(1,(p.life-p.t)*2,p.t*3);c.beginPath();p.pts.forEach(([a,b],i)=>c[i?'lineTo':'moveTo'](a*p.r,b*p.r));c.closePath();const g=c.createLinearGradient(-p.r,-p.r,p.r,p.r);g.addColorStop(0,'#9a7650');g.addColorStop(1,'#3a2618');c.fillStyle=g;c.fill();c.strokeStyle='rgba(240,200,150,.55)';c.lineWidth=.8;c.stroke();c.restore();},
 glint(c,p,k){const a=Math.sin(Math.PI*k);c.save();c.translate(p.x,p.y);c.rotate(p.a);c.globalAlpha=a;c.fillStyle='#fffbe8';const r=p.r*(.6+a*.6);c.beginPath();c.moveTo(0,-r*2.2);c.lineTo(r*.22,0);c.lineTo(0,r*2.2);c.lineTo(-r*.22,0);c.closePath();c.moveTo(-r*2.2,0);c.lineTo(0,r*.22);c.lineTo(r*2.2,0);c.lineTo(0,-r*.22);c.closePath();c.fill();c.restore();},
 wisp(c,p,k,s){p.a+=p.w*s.dt;p.rad=Math.max(p.minR||0,p.rad+p.dr*s.dt);const x=s.cx+Math.cos(p.a)*p.rad,y=s.cy+Math.sin(p.a)*p.rad*.8;if(p.px!=null){c.strokeStyle=`rgba(190,150,255,${Math.sin(Math.PI*k)*.7})`;c.lineWidth=p.r;c.lineCap='round';c.beginPath();c.moveTo(p.px,p.py);c.quadraticCurveTo((p.px+x)/2+Math.sin(p.t*3)*4,(p.py+y)/2,x,y);c.stroke();}p.px=x;p.py=y;},
 shard(c,p,k){c.save();c.translate(p.x,p.y);c.rotate(Math.atan2(p.vy,p.vx));c.globalAlpha=Math.sin(Math.PI*k);c.fillStyle='#c8a8ff';c.beginPath();c.moveTo(p.r*2.4,0);c.lineTo(0,p.r*.5);c.lineTo(-p.r*1.2,0);c.lineTo(0,-p.r*.5);c.closePath();c.fill();c.restore();},
 smoke(c,p,k){const r=p.r*(1+k*1.8),g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,r);g.addColorStop(0,`rgba(${p.col||'30,14,50'},${.4*Math.sin(Math.PI*k)})`);g.addColorStop(1,`rgba(${p.col||'30,14,50'},0)`);c.globalCompositeOperation='source-over';c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fill();c.globalCompositeOperation='lighter';},
 flame(c,p,k){const r=p.r*(1.1-k*.5),col=k<.25?'255,236,190':k<.55?'255,150,70':'210,60,40',g=c.createRadialGradient(p.x,p.y-r*.3,0,p.x,p.y,r*1.3);g.addColorStop(0,`rgba(${col},${.3*(1-k)})`);g.addColorStop(1,`rgba(${col},0)`);c.fillStyle=g;c.beginPath();c.arc(p.x,p.y,r*1.3,0,TAU);c.fill();},
 arc(c,p,k){c.strokeStyle=`rgba(255,250,215,${1-k})`;c.lineWidth=p.r;c.shadowColor='#ffe36a';c.shadowBlur=12;c.beginPath();p.pts.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();c.shadowBlur=0;}
};
function bolt(x0,y0,x1,y1,n=10,j=22){const pts=[[x0,y0]];for(let i=1;i<n;i++){const t=i/n;pts.push([x0+(x1-x0)*t+R(-j,j)*(1-Math.abs(t-.5)),y0+(y1-y0)*t+R(-j,j)*.4]);}pts.push([x1,y1]);return pts;}

/* invented rune shapes for the fire circle: a few strokes on a small grid, seeded, never a real script */
function runeSet(n,seed){let s=seed;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};return Array.from({length:n},()=>{const k=2+Math.floor(r()*3),st=[];for(let i=0;i<k;i++){const a=[Math.floor(r()*3)-1,Math.floor(r()*3)-1],b=[Math.floor(r()*3)-1,Math.floor(r()*3)-1];if(a[0]===b[0]&&a[1]===b[1])b[1]=-a[1]||1;st.push([a,b]);}if(r()<.4)st.push('o');return st;});}
const RUNES_A=runeSet(40,11),RUNES_B=runeSet(56,23);
function drawRune(c,rn,x,y,sz,rot){c.save();c.translate(x,y);c.rotate(rot);c.beginPath();for(const st of rn){if(st==='o'){c.moveTo(sz*.35,0);c.arc(0,0,sz*.35,0,TAU);continue;}c.moveTo(st[0][0]*sz*.5,st[0][1]*sz*.5);c.lineTo(st[1][0]*sz*.5,st[1][1]*sz*.5);}c.stroke();c.restore();}
const poly=(c,cx,cy,r,n,step,rot)=>{c.beginPath();for(let i=0;i<=n;i++){const q=rot-Math.PI/2+(i*step%n)*TAU/n;c[i?'lineTo':'moveTo'](cx+Math.cos(q)*r,cy+Math.sin(q)*r);}c.stroke();};
const arcP=(c,cx,cy,r,p,rot=0)=>{if(p<=0)return;c.beginPath();c.arc(cx,cy,r,rot-Math.PI/2,rot-Math.PI/2+TAU*Math.min(1,p));c.stroke();};
const stage=(s,t0,d)=>s.ct<0?1:Math.min(1,Math.max(0,(s.ct-t0)/d));

/* 2026-11-12 (user: every element's character designed for its element in the megu-edit manner — not a font glyph
   pasted on; bold or minimal, either). Each element gets a lettering lockup built from the character's shape and
   cached once: fire an open outline over a crimson shadow offset; ice cut into crystal slices; thunder split along a
   lightning cut; wind a motion smear; water liquid with its reflection; earth a heavy carved block, its edges eroded;
   light a hairline outline with an inner glow; dark a light-eating solid with a bite taken out. A small wide-tracked
   romaji line names it. Drawn per frame from the cache with a touch of motion. */
const LOCK=new Map();
const ROMAJI={fire:'HONOO',ice:'KŌRI',thunder:'IKAZUCHI',wind:'KAZE',water:'MIZU',earth:'TSUCHI',light:'HIKARI',dark:'YAMI'};
function canvasOf(w,h=w){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function tinted(mask,fill){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');fill(t,c.width,c.height);t.globalCompositeOperation='destination-in';t.drawImage(mask,0,0);return c;}
function outline(mask,w,color){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');const o=tinted(mask,(x,W,H)=>{x.fillStyle=color;x.fillRect(0,0,W,H);});for(let a=0;a<16;a++){const q=a/16*Math.PI*2;t.drawImage(o,Math.cos(q)*w,Math.sin(q)*w);}t.globalCompositeOperation='destination-out';t.drawImage(mask,0,0);return c;}
function dilate(mask,w,color){const c=canvasOf(mask.width,mask.height),t=c.getContext('2d');const o=tinted(mask,(x,W,H)=>{x.fillStyle=color;x.fillRect(0,0,W,H);});for(let a=0;a<16;a++){const q=a/16*Math.PI*2;t.drawImage(o,Math.cos(q)*w,Math.sin(q)*w);}t.drawImage(o,0,0);return c;}
function lockup(el,ch,size){
 const key=el+ch+size;if(LOCK.has(key))return LOCK.get(key);
 const g=glyphFor(ch,size),m=g.mask,W=m.width,c=canvasOf(W),t=c.getContext('2d');
 const grad=(stops,vertical=true)=>(x,w,h)=>{const gr=vertical?x.createLinearGradient(0,0,0,h):x.createLinearGradient(0,0,w,h);stops.forEach(([o,col])=>gr.addColorStop(o,col));x.fillStyle=gr;x.fillRect(0,0,w,h);};
 if(el==='fire'){t.globalAlpha=.85;t.drawImage(tinted(m,grad([[0,'#e2423e'],[1,'#5a0a10']])),size*.07,size*.07);t.globalAlpha=1;t.drawImage(tinted(m,grad([[0,'rgba(255,200,120,.35)'],[1,'rgba(255,120,60,.15)']])),0,0);t.drawImage(outline(m,1.6,'#ffe2b0'),0,0);}
 else if(el==='ice'){const body=tinted(m,grad([[0,'#ffffff'],[.5,'#cdeffc'],[1,'#7cc0e6']],false));const n=7;for(let i=0;i<n;i++){const y=W*(.12+i*.76/n),h=W*.76/n,dx=(i%2?1:-1)*size*.035;t.drawImage(body,0,y,W,h-1,dx,y,W,h-1);}t.globalAlpha=.6;t.drawImage(outline(m,1,'#e8f8ff'),0,0);}
 else if(el==='thunder'){const body=tinted(m,grad([[0,'#fffbe0'],[.6,'#ffd84a'],[1,'#b8861e']]));const cut=[[0,.42],[.32,.5],[.46,.38],[.64,.56],[1,.47]].map(([x,y])=>[x*W,y*W]);
  t.save();t.beginPath();t.moveTo(0,0);t.lineTo(W,0);cut.slice().reverse().forEach(([x,y])=>t.lineTo(x,y));t.closePath();t.clip();t.drawImage(body,-size*.03,-size*.02);t.restore();
  t.save();t.beginPath();t.moveTo(0,W);t.lineTo(W,W);cut.slice().reverse().forEach(([x,y])=>t.lineTo(x,y));t.closePath();t.clip();t.drawImage(body,size*.03,size*.02);t.restore();
  t.strokeStyle='rgba(255,255,235,.95)';t.lineWidth=1.2;t.shadowColor='#fff3a0';t.shadowBlur=8;t.beginPath();cut.forEach(([x,y],i)=>t[i?'lineTo':'moveTo'](x,y));t.stroke();}
 else if(el==='wind'){const body=tinted(m,grad([[0,'#effff8'],[1,'#9fe0c4']]));for(let i=6;i>=1;i--){t.globalAlpha=.07*(7-i)/2;t.drawImage(body,-i*size*.05,0);}t.globalAlpha=1;t.drawImage(body,0,0);}
 else if(el==='water'){t.drawImage(tinted(m,grad([[0,'#f2faff'],[.5,'#8fd0f8'],[1,'#2a70b8']])),0,0);t.globalAlpha=.7;t.drawImage(outline(m,1,'rgba(230,250,255,.9)'),0,0);}
 else if(el==='earth'){const block=dilate(m,size*.03,'#3a2616');t.drawImage(block,size*.02,size*.03);t.drawImage(tinted(m,(x,w,h)=>{const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#ecd6b0');gr.addColorStop(1,'#9a7048');x.fillStyle=gr;x.fillRect(0,0,w,h);for(let i=0;i<420;i++){const k=Math.random();x.fillStyle=k<.5?`rgba(60,40,24,${.25+k*.4})`:`rgba(255,240,215,${(k-.5)*.5})`;x.fillRect(Math.random()*w,Math.random()*h,1.4,1.4);}}),0,0);
  t.globalCompositeOperation='destination-out';for(const [x,y] of g.edges)if(Math.random()<.18){t.beginPath();t.arc(W/2+x+Math.random()*2-1,W/2+y+Math.random()*2-1,Math.random()*1.8+.4,0,Math.PI*2);t.fill();}t.globalCompositeOperation='source-over';}
 else if(el==='light'){t.globalAlpha=.35;t.drawImage(tinted(m,grad([[0,'#fffaf0'],[1,'#ffe8a8']])),0,0);t.globalAlpha=1;t.drawImage(outline(m,1.2,'#fff3c8'),0,0);}
 else if(el==='dark'){t.drawImage(dilate(m,1.4,'#8a64d0'),0,0);t.drawImage(tinted(m,grad([[0,'#0a0412'],[1,'#1c0c32']])),0,0);t.globalCompositeOperation='destination-out';const b=g.edges[Math.floor(g.edges.length*.15)]||[size*.3,-size*.3];t.beginPath();t.arc(W/2+b[0]+size*.06,W/2+b[1]-size*.06,size*.14,0,Math.PI*2);t.fill();t.globalCompositeOperation='source-over';}
 const out={c,W,g,size};LOCK.set(key,out);return out;
}
function drawLockup(s,c,el){
 /* (user: the redesigned lettering was ugly) one clean serif face for every element, a quiet gradient of its colour
    and a soft glow of the same colour; the element is told by the scene, not by distorting the character */
 const size=Math.round(Math.min(s.W,s.H)*.28),g=glyphFor(s.glyph,size),pal={fire:['#fff1d6','#ff9a5a'],ice:['#ffffff','#a8e4fa'],thunder:['#fffbe6','#ffd86a'],wind:['#f2fff9','#9fe6c8'],water:['#f4fbff','#8cc8f2'],earth:['#f6e6cc','#c8a070'],light:['#fffdf4','#ffe6a6'],dark:['#efe6ff','#a88ae0']}[el];
 paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,w*.2,0,w*.8);gr.addColorStop(0,pal[0]);gr.addColorStop(1,pal[1]);t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:rgba(COLOR[el],.75),blur:18});
}

/* ---------- the fire vortex disc (original geometry; style only after the user's references) ---------- */
const DISC=new Map();
function fireDisc(r){
 if(DISC.has(r))return DISC.get(r);const pad=30,W=(r+pad)*2,cv=document.createElement('canvas');cv.width=cv.height=W;const c=cv.getContext('2d');c.translate(W/2,W/2);c.globalCompositeOperation='lighter';c.lineCap='round';
 const stroke=(w,col,blur)=>{c.lineWidth=w;c.strokeStyle=col;c.shadowColor='#ff4a1a';c.shadowBlur=blur;c.stroke();};
 const ri=r*.22,K=11;
 /* swept blades: from the inner ring out to the rim, each curling the same way */
 for(let pass=0;pass<2;pass++)for(let i=0;i<K;i++){const a=i/K*Math.PI*2+pass*.18,sweep=pass?1.25:1.6,x0=Math.cos(a)*ri,y0=Math.sin(a)*ri,x3=Math.cos(a+sweep)*r*.94,y3=Math.sin(a+sweep)*r*.94,
  x1=Math.cos(a+.35)*r*.62,y1=Math.sin(a+.35)*r*.62,x2=Math.cos(a+sweep-.25)*r*1.02,y2=Math.sin(a+sweep-.25)*r*1.02;c.beginPath();c.moveTo(x0,y0);c.bezierCurveTo(x1,y1,x2,y2,x3,y3);
  if(pass===0){stroke(r*.035,'rgba(226,60,30,.85)',18);stroke(r*.012,'rgba(255,214,140,.9)',6);}else{stroke(r*.012,'rgba(255,120,60,.7)',10);}}
 /* heavy outer rim and its inner line */
 c.beginPath();c.arc(0,0,r,0,Math.PI*2);stroke(r*.06,'rgba(220,50,30,.9)',22);stroke(r*.018,'rgba(255,220,150,.95)',8);
 c.beginPath();c.arc(0,0,r*.9,0,Math.PI*2);stroke(r*.008,'rgba(255,150,80,.6)',6);
 /* the small inner ring with a scalloped edge */
 c.beginPath();for(let i=0;i<=72;i++){const q=i/72*Math.PI*2,rr=ri*(1+Math.sin(q*12)*.06);c[i?'lineTo':'moveTo'](Math.cos(q)*rr,Math.sin(q)*rr);}stroke(r*.02,'rgba(255,170,90,.9)',10);
 c.beginPath();c.arc(0,0,ri*.35,0,Math.PI*2);stroke(r*.012,'rgba(255,220,160,.8)',6);
 /* warm wash across the disc */
 c.globalCompositeOperation='lighter';const g=c.createRadialGradient(0,0,ri,0,0,r);g.addColorStop(0,'rgba(255,120,60,.10)');g.addColorStop(.8,'rgba(226,60,30,.08)');g.addColorStop(1,'rgba(226,60,30,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
 DISC.set(r,cv);return cv;
}
const layerY=(s,i,L)=>s.cy+s.H*(.3-i*(.62/(L-1)));
function layerBurst(s,i,L,base){const y=layerY(s,i,L),sc=.95-i*.09;for(let k=0;k<26;k++){const a=R(0,TAU),v=R(160,380)*sc;s.add({type:'spark',x:s.cx+Math.cos(a)*base*sc*.5,y:y+Math.sin(a)*base*sc*.17,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.34-40,drag:1.6,g:40,life:R(.5,.9),r:R(1,1.8),trail:[]});}for(let k=0;k<6;k++)s.add({type:'flame',x:s.cx+R(-1,1)*base*sc*.4,y:y+R(-6,6),vx:R(-60,60),vy:R(-60,-10),drag:2,life:R(.4,.7),r:R(14,22)});}
function columnBurst(s,base){for(let k=0;k<50;k++){const a=R(0,TAU),v=R(220,560);s.add({type:'spark',x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v*.6-60,drag:1.4,g:60,life:R(.8,1.4),r:R(1.2,2.2),trail:[]});}for(let k=0;k<18;k++){const a=R(0,TAU),v=R(60,200);s.add({type:'flame',x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-50,drag:2,life:R(.6,1.1),r:R(18,32)});}s.flash=.4;}

/* ---------- scenes ---------- */
const SC={
 fire:{
  /* (user: far more striking — many layers stacked, chain explosions) an original vortex circle: swept blade arcs
     curling from a small inner ring to a heavy outer ring, burning orange-red to gold. Several of them stand in
     perspective as a column, rising one by one from the bottom, each its own size and turning against its
     neighbour; they charge and pulse, then burst one after another up the column, the whole column erupts, the
     afterglow fades and the column builds again. The disc is pre-rendered once to a sprite, so a layer is one
     drawImage. */
  bg(s,c){
   const L=5,base=Math.min(s.W,s.H)*.46,cyc=s.cycT??=0;s.cycT+=s.dt;const T=s.cycT;
   const APPEAR=.32,CHARGE=L*APPEAR+.9,CHAIN=.2,BOOM=CHARGE+L*CHAIN+.05,END=BOOM+1.4;
   if(T>END){s.cycT=0;s.boomed=0;s.chain=0;}
   const spr=fireDisc(Math.round(base));
   for(let i=0;i<L;i++){
    const appear=Math.min(1,Math.max(0,(T-i*APPEAR)/.45)),blown=T>CHARGE+i*CHAIN;
    if(blown&&s.chain<=i){s.chain=i+1;layerBurst(s,i,L,base);}
    let a=appear;if(blown)a=Math.max(0,1-(T-(CHARGE+i*CHAIN))/.25);if(a<=0)continue;
    const pulse=T>L*APPEAR?.85+.15*Math.sin(T*(T>CHARGE-.6?22:8)+i):1,sc=(.9-i*.1)*(.7+.3*appear),y=layerY(s,i,L);
    c.save();c.globalAlpha*=a*pulse;c.translate(s.cx,y);c.scale(1,.34);c.rotate((i%2?-1:1)*T*(.6+i*.25));c.scale(sc,sc);c.drawImage(spr,-spr.width/2,-spr.height/2);c.restore();}
   if(T>BOOM&&!s.boomed){s.boomed=1;columnBurst(s,base);}
   if(T>BOOM&&T<BOOM+1.2){const k=(T-BOOM)/1.2,g=c.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,base*(.6+k*1.2));g.addColorStop(0,`rgba(255,220,150,${.35*(1-k)})`);g.addColorStop(.5,`rgba(226,66,40,${.18*(1-k)})`);g.addColorStop(1,'rgba(120,20,10,0)');c.fillStyle=g;c.fillRect(0,0,s.W,s.H);}
  },
  spawn(s){if(s.count('spark')<18)s.add({type:'spark',x:s.cx+R(-1,1)*s.W*.3,y:s.cy+R(.2,.45)*s.H,vx:R(-10,10),vy:-R(50,120),g:-10,life:R(1.2,2),r:R(.8,1.5),trail:[]});},
  burst(s){/* the cast skips straight to the chain of explosions, then a bigger eruption */const L=5,APPEAR=.32;s.cycT=Math.max(s.cycT||0,L*APPEAR+.9-.05);s.chain=0;s.boomed=0;s.flash=.35;},
  glyph(){}
 },
 ice:{
  bg(s,c){const Rr=Math.min(s.W,s.H)*.42*(s.big||1),grow=Math.min(1,s.t/1.4),rot=s.t*.06;if(s.shattered)return;
   /* cold mist along the bottom */
   for(let i=0;i<4;i++){const x=s.W*((i/4+s.t*.015*(i%2?1:-1))%1+1)%1,g=c.createRadialGradient(x,s.H*.9,0,x,s.H*.9,s.W*.35);g.addColorStop(0,'rgba(170,220,240,.07)');g.addColorStop(1,'rgba(170,220,240,0)');c.fillStyle=g;c.fillRect(0,s.H*.55,s.W,s.H*.45);}
   /* frost growing in from the edges */
   if(!s.frost)s.frost=Array.from({length:10},()=>{const side=Math.floor(R(0,4)),p=R(.1,.9);return {x:side===0?0:side===1?s.W:p*s.W,y:side===2?0:side===3?s.H:p*s.H,a:side===0?0:side===1?Math.PI:side===2?Math.PI/2:-Math.PI/2,br:Array.from({length:5},()=>[R(.15,.9),R(.3,.7)*(Math.random()<.5?1:-1)])};});
   c.strokeStyle='rgba(225,245,255,.35)';c.lineWidth=.8;for(const f of s.frost){const L=Math.min(1,s.t/6)*Math.min(s.W,s.H)*.18;c.beginPath();c.moveTo(f.x,f.y);const ex=f.x+Math.cos(f.a)*L,ey=f.y+Math.sin(f.a)*L;c.lineTo(ex,ey);for(const [at,da] of f.br){const bx=f.x+Math.cos(f.a)*L*at,by=f.y+Math.sin(f.a)*L*at,bl=L*.3*(1-at*.5);c.moveTo(bx,by);c.lineTo(bx+Math.cos(f.a+da)*bl,by+Math.sin(f.a+da)*bl);}c.stroke();}
   /* the halo snowflake: graded branches with a translucent body, behind the glyph */
   c.save();c.translate(s.cx,s.cy);c.rotate(rot);c.shadowColor='#9fe3ff';c.shadowBlur=8;
   for(let a=0;a<6;a++){c.save();c.rotate(a*TAU/6);const L=Rr*grow;const g=c.createLinearGradient(0,0,0,-L);g.addColorStop(0,'rgba(200,240,255,.0)');g.addColorStop(.3,'rgba(200,240,255,.22)');g.addColorStop(1,'rgba(235,250,255,.45)');c.fillStyle=g;c.beginPath();c.moveTo(-4,0);c.lineTo(-1.2,-L);c.lineTo(1.2,-L);c.lineTo(4,0);c.fill();
    c.strokeStyle='rgba(235,250,255,.55)';c.lineWidth=1;for(const [f,len] of [[.3,.32],[.5,.26],[.68,.2],[.84,.12]]){if(grow<f)continue;const b=L*len;for(const sd of [1,-1]){c.beginPath();c.moveTo(0,-L*f);c.lineTo(sd*b*.7,-L*f-b*.7);c.stroke();c.beginPath();c.moveTo(sd*b*.35,-L*f-b*.35);c.lineTo(sd*b*.35+sd*b*.2,-L*f-b*.35+b*.05);c.stroke();}}c.restore();}
   c.restore();c.shadowBlur=0;},
  spawn(s){if(s.count('flake')<22){const d=Math.random(),near=d>.8;s.add({type:'flake',x:R(0,s.W),y:R(-20,s.H*.3),vx:R(-6,6),vy:R(8,22)*(near?1.6:.7),life:R(6,10),r:near?R(8,13):R(2.5,5),blur:near?1.6:0,al:near?.5:.75,a:R(0,TAU),spin:R(-.4,.4)});}
   if(s.ct>=0&&s.count('needle')<30)s.add({type:'needle',x:s.cx+R(-1,1)*90,y:s.cy+R(-1,1)*90,vx:0,vy:0,life:.6,r:R(2,4),a:R(0,TAU),spin:0});},
  burst(s){s.shattered=1;setTimeout(()=>{s.shattered=0;s.t=0;s.big=1.2;s.flash=.6;},800);for(let i=0;i<70;i++){const a=R(0,TAU),v=R(120,420);s.add({type:'needle',x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:1.4,g:80,life:R(.8,1.5),r:R(2,5),a,spin:R(-6,6)});}s.flash=.6;},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,w,w);gr.addColorStop(0,'#ffffff');gr.addColorStop(.5,'#cdf1ff');gr.addColorStop(1,'#6fbfe6');t.fillStyle=gr;t.fillRect(0,0,w,w);const sw=((s.t*.25)%1.6-.3)*w;const hl=t.createLinearGradient(sw-w*.15,0,sw+w*.15,w*.3);hl.addColorStop(0,'rgba(255,255,255,0)');hl.addColorStop(.5,'rgba(255,255,255,.9)');hl.addColorStop(1,'rgba(255,255,255,0)');t.fillStyle=hl;t.fillRect(0,0,w,w);},{glow:'rgba(20,50,80,.9)',blur:6});}
 },
 thunder:{
  /* a plasma sphere: filaments from the glyph out to an unseen shell, each jittering and re-forking all the time */
  bg(s,c){const Rr=Math.min(s.W,s.H)*.4;if(!s.fil||s.t-(s.filT||0)>.07){s.filT=s.t;const n=s.ct>=0?9:6;s.fil=Array.from({length:n},(_,i)=>{const base=(s.seed0??=R(0,TAU))+i/n*TAU+Math.sin(s.t*.7+i*1.7)*.5,end=[s.cx+Math.cos(base)*Rr,s.cy+Math.sin(base)*Rr];const pts=bolt(s.cx+Math.cos(base)*18,s.cy+Math.sin(base)*18,end[0],end[1],14,14);const forks=[];for(let f=0;f<2;f++){const at=pts[4+Math.floor(R(0,8))],q=base+R(-.9,.9),L=R(20,60);forks.push(bolt(at[0],at[1],at[0]+Math.cos(q)*L,at[1]+Math.sin(q)*L,5,6));}return {pts,forks,end};});}
   c.strokeStyle='rgba(200,180,255,.12)';c.lineWidth=1;arcP(c,s.cx,s.cy,Rr,1);
   const g=c.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,Rr);g.addColorStop(0,'rgba(255,240,170,.12)');g.addColorStop(.7,'rgba(140,110,255,.04)');g.addColorStop(1,'rgba(140,110,255,.10)');c.fillStyle=g;c.beginPath();c.arc(s.cx,s.cy,Rr,0,TAU);c.fill();
   c.lineCap='round';c.lineJoin='round';for(const f of s.fil){c.shadowColor='#c8b4ff';c.shadowBlur=10;c.strokeStyle='rgba(210,190,255,.35)';c.lineWidth=3.2;c.beginPath();f.pts.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();c.shadowColor='#fff3a0';c.strokeStyle='rgba(255,250,225,.9)';c.lineWidth=1;c.stroke();c.lineWidth=.6;for(const k of f.forks){c.beginPath();k.forEach(([x,y],i)=>c[i?'lineTo':'moveTo'](x,y));c.stroke();}
    const e=c.createRadialGradient(f.end[0],f.end[1],0,f.end[0],f.end[1],10);e.addColorStop(0,'rgba(255,250,220,.8)');e.addColorStop(1,'rgba(200,180,255,0)');c.fillStyle=e;c.beginPath();c.arc(f.end[0],f.end[1],10,0,TAU);c.fill();}c.shadowBlur=0;},
  spawn(s){if(s.count('spark')<10&&Math.random()<.15&&s.fil?.length){const f=pick(s.fil),a=R(0,TAU),v=R(40,120);s.add({type:'spark',x:f.end[0],y:f.end[1],vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:3,life:R(.25,.5),r:R(.6,1.1),trail:[]});}},
  burst(s){const Rr=Math.min(s.W,s.H)*.4;for(let k=0;k<8;k++){const q=k/8*TAU;s.add({type:'arc',x:0,y:0,vx:0,vy:0,life:R(.25,.45),r:2.4,pts:bolt(s.cx,s.cy,s.cx+Math.cos(q)*Rr*1.4,s.cy+Math.sin(q)*Rr*1.4,16,26)});}s.flash=.55;},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,0,w);gr.addColorStop(0,'#fffbe0');gr.addColorStop(.6,'#ffe27a');gr.addColorStop(1,'#c99a2a');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#fff0a0',blur:16});}
 },
 wind:{
  /* air flowing past the glyph: streamlines bend round it like flow round a stone, with bright gusts travelling along them */
  bg(s,c){const Rr=Math.min(s.W,s.H)*.17,n=26,speed=s.ct>=0?2.2:1;if(!s.gusts)s.gusts=Array.from({length:n},()=>({u:R(0,1),v:R(.12,.3)}));
   c.lineCap='round';for(let i=0;i<n;i++){const y0=s.H*(.12+.76*i/(n-1)),pts=[];for(let k=0;k<=48;k++){const x=k/48*s.W,dx=x-s.cx,dy=y0-s.cy,r2=dx*dx+dy*dy,bend=Rr*Rr/(r2+Rr*Rr*.6);pts.push([x,y0+(dy>=0?1:-1)*bend*Rr*1.4+Math.sin(x*.012+s.t*1.3+i)*3]);}
    c.strokeStyle=`rgba(190,255,228,${.06+.05*(i%3===0)})`;c.lineWidth=.7;c.beginPath();pts.forEach(([x,y],k)=>c[k?'lineTo':'moveTo'](x,y));c.stroke();
    const gst=s.gusts[i];gst.u=(gst.u+gst.v*s.dt*speed)%1.25;const a=Math.floor(gst.u*48),b=Math.min(48,a+7);if(a<48){c.strokeStyle='rgba(215,255,238,.55)';c.lineWidth=1.3;c.beginPath();for(let k=a;k<=b;k++)c[k===a?'moveTo':'lineTo'](...pts[k]);c.stroke();}}},
  spawn(s){if(s.count('leaf')<6&&Math.random()<.04)s.add({type:'leaf',x:-20,y:s.H*R(.2,.8),vx:R(70,130),vy:R(-10,10),life:R(4,7),r:R(4,6),a:R(0,TAU),spin:R(-2,2)});},
  burst(s){for(const g of s.gusts||[])g.v*=4;setTimeout(()=>{for(const g of s.gusts||[])g.v/=4;},900);for(let i=0;i<8;i++)s.add({type:'leaf',x:s.cx,y:s.cy,vx:R(120,320)*(Math.random()<.5?1:-1),vy:R(-160,60),drag:.6,life:R(1.5,2.5),r:R(4,7),a:R(0,TAU),spin:R(-6,6)});s.flash=.2;},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{t.fillStyle='#e6fff4';t.fillRect(0,0,w,w);const o=(s.t*140)%(w*2)-w,gr=t.createLinearGradient(o,0,o+w,0);gr.addColorStop(0,'rgba(80,180,150,0)');gr.addColorStop(.5,'rgba(80,180,150,.6)');gr.addColorStop(1,'rgba(80,180,150,0)');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#1f5a46',blur:8});}
 },
 water:{
  /* a still pool under the glyph: the glyph's reflection wavers in it, drops fall and ring the surface, caustic light plays above */
  bg(s,c){const sy=s.cy+Math.min(s.W,s.H)*.2;s.sy=sy;
   const g=c.createLinearGradient(0,sy,0,s.H);g.addColorStop(0,'rgba(60,130,200,.16)');g.addColorStop(1,'rgba(20,50,100,0)');c.globalCompositeOperation='source-over';c.fillStyle=g;c.fillRect(0,sy,s.W,s.H-sy);c.globalCompositeOperation='lighter';
   c.strokeStyle='rgba(180,225,255,.35)';c.lineWidth=.8;c.beginPath();for(let x=0;x<=s.W;x+=8)c[x?'lineTo':'moveTo'](x,sy+Math.sin(x*.05+s.t*2)*1.2);c.stroke();
   if(!s.rip)s.rip=[];s.rip=s.rip.filter(r=>{r.t+=s.dt;if(r.t>2.6)return false;const k=r.t/2.6;for(let j=0;j<2;j++){const kk=Math.max(0,k-j*.12),rad=kk*s.W*.32;c.strokeStyle=`rgba(190,230,255,${(1-k)*.55})`;c.lineWidth=1;c.beginPath();c.ellipse(r.x,sy+8+r.dz,rad,rad*.16,0,0,TAU);c.stroke();}return true;});
   /* caustics: a soft net of light lines drifting over the upper field */
   c.strokeStyle='rgba(170,220,255,.08)';c.lineWidth=1;for(let i=0;i<7;i++){c.beginPath();for(let x=0;x<=s.W;x+=10){const y=s.H*.1+i*s.H*.09+Math.sin(x*.02+s.t*.9+i*1.3)*10+Math.sin(x*.047-s.t*.6)*6;c[x?'lineTo':'moveTo'](x,y);}c.stroke();}},
  spawn(s){if(s.count('drop')<6&&Math.random()<.04)s.add({type:'drop',x:s.cx+R(-.35,.35)*s.W,y:-10,vx:0,vy:R(160,220),g:300,life:3,r:R(1.8,2.6),hit:1});
   for(const p of s.ps)if(p.hit&&p.y>=(s.sy||s.H*.7)){p.hit=0;p.t=p.life;(s.rip||(s.rip=[])).push({t:0,x:p.x,dz:R(0,12)});}},
  burst(s){for(let i=0;i<40;i++){const a=R(-Math.PI*.9,-Math.PI*.1),v=R(180,420);s.add({type:'drop',x:s.cx+R(-14,14),y:s.sy||s.cy,vx:Math.cos(a)*v*.6,vy:Math.sin(a)*v,g:620,life:R(1,1.6),r:R(1.8,3.2)});}for(let i=0;i<3;i++)(s.rip||(s.rip=[])).push({t:-i*.18,x:s.cx,dz:0});s.flash=.25;},
  glyph(s,c,g){const w=g.w,tmp=document.createElement('canvas');tmp.width=tmp.height=w;const t=tmp.getContext('2d');const gr=t.createLinearGradient(0,0,0,w);gr.addColorStop(0,'#f2faff');gr.addColorStop(.5,'#8fd0f8');gr.addColorStop(1,'#2a70b8');t.fillStyle=gr;t.fillRect(0,0,w,w);t.globalCompositeOperation='destination-in';t.drawImage(g.mask,0,0);
   c.save();c.shadowColor='rgba(10,40,80,.85)';c.shadowBlur=6;c.drawImage(tmp,s.cx-w/2,s.cy-w/2);c.restore();
   /* the reflection, flipped and wavering, fading with depth */
   const sy=s.sy||s.cy+60;c.save();c.globalAlpha*=.35;for(let y=0;y<w*.7;y+=2){const off=Math.sin(y*.18+s.t*3)*(1+y*.03);c.globalAlpha=.35*(1-y/(w*.7));c.drawImage(tmp,0,w-y-2,w,2,s.cx-w/2+off,sy+6+y,w,2);}c.restore();}
 },
 earth:{
  /* a relief map: contour lines of a slowly breathing landscape ring the glyph, gold seams glint, stones drift above */
  bg(s,c){const Rr=Math.min(s.W,s.H)*.46,lv=9;c.lineJoin='round';
   for(let k=1;k<=lv;k++){const base=Rr*k/lv;c.strokeStyle=k%3===0?'rgba(220,175,120,.32)':'rgba(200,160,110,.16)';c.lineWidth=k%3===0?1.1:.7;c.beginPath();for(let i=0;i<=96;i++){const q=i/96*TAU,n=Math.sin(q*3+k*.7+s.t*.25)*.06+Math.sin(q*5-k*.4-s.t*.18)*.04+Math.sin(q*2+k)*.05,r=base*(1+n);c[i?'lineTo':'moveTo'](s.cx+Math.cos(q)*r,s.cy+Math.sin(q)*r*.82);}c.closePath();c.stroke();}
   const gl=.5+.5*Math.sin(s.t*1.6);c.strokeStyle=`rgba(255,200,110,${.25+gl*.35})`;c.lineWidth=1.2;c.shadowColor='#ffb860';c.shadowBlur=8;for(let i=0;i<3;i++){const q=i*2.1+.4;c.beginPath();for(let k=2;k<=7;k++){const r=Rr*k/lv*(1+Math.sin(q*3+k*.7+s.t*.25)*.06);c[k===2?'moveTo':'lineTo'](s.cx+Math.cos(q+k*.05)*r,s.cy+Math.sin(q+k*.05)*r*.82);}c.stroke();}c.shadowBlur=0;},
  spawn(s){if(s.count('chip')<9){const a=R(0,TAU),rad=R(.36,.5)*Math.min(s.W,s.H);s.add({type:'chip',orbit:{a,rad,w:R(.12,.25)*(s.ct>=0?3:1)*(Math.random()<.5?1:-1),dy:R(-.35,-.05),bob:R(0,TAU)},x:0,y:0,life:R(6,9),r:R(4,8),a:R(0,TAU),spin:R(-.6,.6),pts:Array.from({length:6},(_,k)=>{const q=k/6*TAU+R(-.3,.3);return [Math.cos(q)*R(.6,1),Math.sin(q)*R(.6,1)];})});}},
  burst(s){for(const p of s.ps)if(p.orbit)p.orbit.rad*=.25;setTimeout(()=>{for(const p of s.ps)if(p.orbit)p.orbit.rad=R(.42,.6)*Math.min(s.W,s.H);for(let i=0;i<12;i++)s.add({type:'smoke',x:s.cx+R(-40,40),y:s.cy+R(-20,30),vx:R(-80,80),vy:R(-40,10),drag:1.5,life:R(1.2,2),r:R(18,30),col:'120,90,60'});s.flash=.3;},380);},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,0,w);gr.addColorStop(0,'#e8cfa8');gr.addColorStop(1,'#8a6440');t.fillStyle=gr;t.fillRect(0,0,w,w);if(!s.grain)s.grain=Array.from({length:380},()=>[Math.random(),Math.random(),Math.random()]);for(const [a,b,k] of s.grain){t.fillStyle=k<.5?`rgba(60,40,24,${.25+k*.4})`:`rgba(255,240,215,${(k-.5)*.5})`;t.fillRect(a*w,b*w,1.4,1.4);}},{glow:'rgba(20,10,0,.9)',blur:6});}
 },
 light:{
  /* an engraved sunburst: 96 hairline rays of alternating length in gold, two thin halo rings, turning slowly, glints rising */
  bg(s,c){const Rr=Math.min(s.W,s.H)*.42,sun=s.sun||0;s.sun=Math.max(0,sun-s.dt*.8);const rot=s.t*.05;c.lineCap='round';
   for(let i=0;i<96;i++){const q=rot+i/96*TAU,long=i%4===0?1:i%2===0?.72:.5,L=Rr*long*(1+sun*.6)*(.94+.06*Math.sin(s.t*1.5+i*.7)),r0=Rr*.24;const g=c.createLinearGradient(s.cx+Math.cos(q)*r0,s.cy+Math.sin(q)*r0,s.cx+Math.cos(q)*L,s.cy+Math.sin(q)*L);g.addColorStop(0,'rgba(255,236,170,.55)');g.addColorStop(1,'rgba(255,236,170,0)');c.strokeStyle=g;c.lineWidth=i%4===0?1.2:.6;c.beginPath();c.moveTo(s.cx+Math.cos(q)*r0,s.cy+Math.sin(q)*r0);c.lineTo(s.cx+Math.cos(q)*L,s.cy+Math.sin(q)*L);c.stroke();}
   c.strokeStyle='rgba(255,236,170,.35)';c.lineWidth=.8;arcP(c,s.cx,s.cy,Rr*.24,1);c.strokeStyle='rgba(255,236,170,.18)';arcP(c,s.cx,s.cy,Rr*.3,1,-rot);},
  spawn(s){if(s.count('glint')<10&&Math.random()<.2)s.add({type:'glint',x:s.cx+R(-1,1)*s.W*.38,y:s.cy+R(-1,1)*s.H*.36,vx:0,vy:-R(4,10),life:R(1.2,2.2),r:R(1.4,2.8),a:R(0,.6)});},
  burst(s){s.sun=1.4;s.flash=.45;for(let i=0;i<16;i++)s.add({type:'glint',x:s.cx+R(-1,1)*140,y:s.cy+R(-1,1)*140,vx:0,vy:0,life:R(.6,1.2),r:R(2.6,4.4),a:R(0,.6)});},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createLinearGradient(0,0,0,w);gr.addColorStop(0,'#fffaf0');gr.addColorStop(1,'#e2b450');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'rgba(80,50,0,.95)',blur:5});}
 },
 dark:{
  bg(s,c){const r=Math.min(s.W,s.H)*.15*(s.ec||1);s.ec=(s.ec||1)+(1-(s.ec||1))*s.dt*2;
   /* slow dark mist */for(let i=0;i<3;i++){const x=s.W*(.5+.4*Math.sin(s.t*.08+i*2)),y=s.H*(.5+.3*Math.cos(s.t*.06+i)),g=c.createRadialGradient(x,y,0,x,y,s.W*.4);g.addColorStop(0,'rgba(30,10,50,.35)');g.addColorStop(1,'rgba(30,10,50,0)');c.globalCompositeOperation='source-over';c.fillStyle=g;c.fillRect(0,0,s.W,s.H);}
   const pulse=.5+.5*Math.sin(s.t*1.7),dg=c.createRadialGradient(s.cx,s.cy,r*.6,s.cx,s.cy,r*(1.7+pulse*.3));dg.addColorStop(0,'rgba(3,0,8,.96)');dg.addColorStop(.6,'rgba(45,18,80,.45)');dg.addColorStop(1,'rgba(45,18,80,0)');c.fillStyle=dg;c.beginPath();c.arc(s.cx,s.cy,r*2.2,0,TAU);c.fill();c.globalCompositeOperation='lighter';},
  spawn(s){if(s.count('wisp')<40){const far=Math.random()<.7;s.add({type:'wisp',x:0,y:0,a:R(0,TAU),rad:far?R(.3,.55)*Math.min(s.W,s.H):R(.12,.2)*Math.min(s.W,s.H),dr:far?-R(10,24):R(6,14),w:R(.8,1.6)*(Math.random()<.5?1:-1),minR:Math.min(s.W,s.H)*.08,life:R(2.2,3.6),r:R(1,2)});}
   if(s.count('shard')<10&&Math.random()<.12){const a=R(0,TAU),d=R(.35,.5)*Math.min(s.W,s.H);s.add({type:'shard',x:s.cx+Math.cos(a)*d,y:s.cy+Math.sin(a)*d,vx:-Math.cos(a)*d*.9,vy:-Math.sin(a)*d*.9,life:1,r:R(2,3.4)});}
   if(s.count('smoke')<12&&Math.random()<.15){const a=R(0,TAU);s.add({type:'smoke',x:s.cx+Math.cos(a)*30,y:s.cy+Math.sin(a)*24,vx:Math.cos(a)*10,vy:-R(8,18),life:R(2,3),r:R(10,18)});}},
  burst(s){s.ec=.3;for(let i=0;i<30;i++){const a=R(0,TAU),v=R(160,360);s.add({type:'shard',x:s.cx,y:s.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:1,life:R(.7,1.1),r:R(2.4,4)});}s.flash=.4;},
  glyph(s,c,g){paintGlyph(c,g,s.cx,s.cy,(t,w)=>{const gr=t.createRadialGradient(w/2,w/2,0,w/2,w/2,w*.6);gr.addColorStop(0,'#05010a');gr.addColorStop(.75,'#1c0c32');gr.addColorStop(1,'#7a56c0');t.fillStyle=gr;t.fillRect(0,0,w,w);},{glow:'#a07ae0',blur:12});}
 }
};

function newScene(el,glyph){return {el,glyph,ps:[],t:0,ct:-1,flash:0,W:0,H:0,cx:0,cy:0,dt:0,
 add(p){p.t=0;p.vx??=0;p.vy??=0;this.ps.push(p);if(this.ps.length>CAP)this.ps.splice(0,this.ps.length-CAP);},
 count(type){let n=0;for(const p of this.ps)if(p.type===type)n++;return n;}};}
function step(s,dt){
 s.t+=dt;s.dt=dt;if(s.ct>=0)s.ct+=dt;if(s.burst)s.burst+=dt;
 s.ps=s.ps.filter(p=>{p.t+=dt;if(p.t>p.life)return false;
  if(p.orbit){const o=p.orbit;o.a+=o.w*dt*(s.out?3:1);if(s.out)o.rad+=dt*220;p.x=s.cx+Math.cos(o.a)*o.rad;p.y=s.cy+Math.sin(o.a)*o.rad*.45+o.dy*o.rad+(o.bob!=null?Math.sin(s.t*1.4+o.bob)*5:0);}
  else if(p.type!=='wisp'){if(p.drag){p.vx*=1-p.drag*dt;p.vy*=1-p.drag*dt;}if(p.g)p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
  return true;});
 if(s.out)s.out=Math.max(0,s.out-dt*.8);
 /* after its burst the fire circle's afterglow fades, then the circle draws itself again ring by ring and keeps turning */
 if(s.el==='fire'&&s.burst>1.25){s.burst=0;s.ct=0;s.reform=1;}if(s.reform&&s.ct>1.6){s.ct=-1;s.reform=0;}
}
function render(c,s,alpha,scale){
 const sc=SC[s.el];c.save();c.globalAlpha=1;c.translate(s.cx,s.cy);c.scale(scale,scale);c.translate(-s.cx,-s.cy);
 c.globalCompositeOperation='lighter';const a0=alpha;
 c.globalAlpha=a0;sc.bg(s,c);
 for(const p of s.ps){c.globalAlpha=a0;DRAW[p.type]?.(c,p,p.t/p.life,s);}
 c.globalAlpha=a0;c.globalCompositeOperation='source-over';if(s.glyph)drawLockup(s,c,s.el);
 if(s.flash>0){c.globalCompositeOperation='lighter';const fr=Math.max(s.W,s.H)*.7,g=c.createRadialGradient(s.cx,s.cy,0,s.cx,s.cy,fr);g.addColorStop(0,rgba(COLOR[s.el],Math.min(.55,s.flash*.6)*a0));g.addColorStop(.35,rgba(COLOR[s.el],s.flash*.18*a0));g.addColorStop(1,rgba(COLOR[s.el],0));c.fillStyle=g;c.fillRect(0,0,s.W,s.H);s.flash=Math.max(0,s.flash-s.dt*2);}
 c.restore();
}

export function mountElementFx(canvas){
 const ctx=canvas.getContext('2d');if(!ctx)return {setElement(){},cast(cb){cb?.();},stop(){}};
 let cur=null,old=null,switchT=1,stopped=false,raf=0,prev=performance.now(),target=.4;
 const size=()=>{const dpr=Math.min(2,devicePixelRatio||1),W=canvas.clientWidth,H=canvas.clientHeight;if(W&&(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr))){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);for(const s of [cur,old])if(s){s.W=W;s.H=H;s.cx=W/2;s.cy=H/2;}};
 const frame=now=>{if(stopped||!canvas.isConnected)return;const dt=Math.min(.05,(now-prev)/1000);prev=now;size();ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  if(document.hidden){raf=requestAnimationFrame(frame);return;}
  /* (user: the old transition was ugly) out: the old scene shrinks, blurs and fades in ~200 ms; in: the new one grows
     from 92% and sharpens over ~360 ms, starting a beat later; one thin light sweep crosses once */
  switchT=Math.min(1,switchT+dt);const W=canvas.clientWidth,H=canvas.clientHeight;
  if(old&&switchT<.2){const k=switchT/.2,e=k*k;step(old,dt);ctx.save();ctx.filter=`blur(${(e*8).toFixed(1)}px)`;render(ctx,old,1-e,1-.12*e);ctx.restore();}else old=null;
  if(cur){if(!calm){SC[cur.el].spawn(cur);step(cur,dt);}const k=Math.min(1,Math.max(0,(switchT-.08)/.36)),e=1-Math.pow(1-k,3);
   if(k<1){ctx.save();ctx.filter=`blur(${((1-e)*6).toFixed(1)}px)`;render(ctx,cur,e,.92+.08*e);ctx.restore();
    const sx=-W*.3+(W*1.6)*e,gr=ctx.createLinearGradient(sx-60,0,sx+60,H);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.5,`rgba(255,250,240,${.12*(1-e)})`);gr.addColorStop(1,'rgba(255,255,255,0)');ctx.globalCompositeOperation='lighter';ctx.fillStyle=gr;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';}
   else render(ctx,cur,1,1);}
  if(!calm)raf=requestAnimationFrame(frame);};
 raf=requestAnimationFrame(frame);
 return {
  setElement(el,glyph){if(!SC[el])return;if(cur&&cur.el===el){if(glyph)cur.glyph=glyph;return;}
   old=cur&&switchT>=1?cur:(cur||null);switchT=cur?0:1;cur=newScene(el,glyph);size();if(calm)requestAnimationFrame(frame);},
  cast(onBurst){if(!cur){onBurst?.();return;}cur.ct=0;setTimeout(()=>{if(cur){SC[cur.el].burst(cur);}onBurst?.();},calm?0:1300);},
  stop(){stopped=true;cancelAnimationFrame(raf);}
 };
}
