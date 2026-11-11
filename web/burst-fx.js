// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 shared impact effects (presentation only): a pit knocked out of a surface with fine cracks round it,
   chips of the surface falling away under gravity, an Explosion (爆裂魔法) burst for a wrong answer and an Aqua-style
   flower-and-water fountain (花鳥風月) that mends a pit for a right one. Used by dict-impact.js and practice-fx.js. */
export const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NS='http://www.w3.org/2000/svg';
export const rng=seed=>{let s=(seed>>>0)%2147483647||1;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};};
const f1=n=>n.toFixed(1);

/* a jagged hole: outline points around (x,y) with radius r */
export function pitPath(r,x,y,R){
 const n=10+Math.floor(r()*5),a0=r()*Math.PI*2;let d='';
 for(let i=0;i<n;i++){const a=a0+i/n*Math.PI*2+(r()-.5)*.35,rad=R*(.62+r()*.42);d+=`${i?'L':'M'}${f1(x+Math.cos(a)*rad)} ${f1(y+Math.sin(a)*rad)} `;}
 return d+'Z';
}
/* fine cracks: a few short jagged lines out of the pit's rim */
export function crackPaths(r,x,y,R,reach,rays,from=0,span=Math.PI*2){
 const out=[];
 for(let i=0;i<rays;i++){
  let a=from+(i+.2+r()*.6)/rays*span,px=x+Math.cos(a)*R*.8,py=y+Math.sin(a)*R*.8,d=`M${f1(px)} ${f1(py)}`;
  const len=reach*(.45+r()*.55),seg=3+Math.floor(r()*3);
  for(let k=0;k<seg;k++){a+=(r()-.5)*.8;const l=len/seg*(.6+r()*.8);px+=Math.cos(a)*l;py+=Math.sin(a)*l;d+=` L${f1(px)} ${f1(py)}`;
   if(r()<.25){let ba=a+(r()<.5?-1:1)*(.6+r()*.5),bx=px,by=py,bd=`M${f1(px)} ${f1(py)}`;for(let j=0;j<2;j++){ba+=(r()-.5)*.6;const bl=len/seg*(.35+r()*.4);bx+=Math.cos(ba)*bl;by+=Math.sin(ba)*bl;bd+=` L${f1(bx)} ${f1(by)}`;}out.push({d:bd,w:.45});}}
  out.push({d,w:.7});
 }
 return out;
}
/* markup of one scar (pit + cracks) for an svg <g> */
export function scarMarkup(seed,x,y,R,reach,rays,from,span){
 const r=rng(seed),hole=pitPath(r,x,y,R),rim=pitPath(rng(seed+1),x,y+R*.12,R*1.12);
 return `<path class="fx-rim" d="${rim}"/><path class="fx-pit" d="${hole}"/><path class="fx-pit-lip" d="${hole}"/>`+
  crackPaths(r,x,y,R,reach,rays,from,span).map(p=>`<path class="fx-crack" pathLength="1" d="${p.d}" stroke-width="${p.w}"/>`).join('');
}

function layer(){let l=document.querySelector('body>.fx-layer');if(!l){l=document.createElement('div');l.className='fx-layer';l.setAttribute('aria-hidden','true');document.body.append(l);}return l;}
const later=(el,ms)=>setTimeout(()=>el.remove(),ms);

/* chips of the surface: small irregular flakes thrown a little and falling */
export function debris(x,y,{n=10,spread=1,up=.6,tint='glass'}={}){
 if(calm)return;
 const l=layer();
 for(let i=0;i<n;i++){
  const c=document.createElement('i');c.className=`fx-chip is-${tint}`;const s=2+Math.random()*5*spread;
  const pts=Array.from({length:4+Math.floor(Math.random()*3)},(_,k,arr)=>{const a=k/arr.length*Math.PI*2+Math.random()*.6,rr=35+Math.random()*15;return `${f1(50+Math.cos(a)*rr)}% ${f1(50+Math.sin(a)*rr)}%`;}).join(',');
  c.style.cssText=`left:${x}px;top:${y}px;width:${f1(s)}px;height:${f1(s*(.6+Math.random()*.7))}px;clip-path:polygon(${pts})`;l.append(c);
  const vx=(Math.random()-.5)*220*spread,vy=-(Math.random()*up*260),g=900+Math.random()*500,T=.7+Math.random()*.7,spin=(Math.random()-.5)*900,frames=[];
  for(let k=0;k<=8;k++){const t=T*k/8;frames.push({transform:`translate(${f1(vx*t)}px,${f1(vy*t+g*t*t/2)}px) rotate(${f1(spin*t)}deg)`,opacity:k<6?1:(8-k)/2.5});}
  c.animate(frames,{duration:T*1000,easing:'linear',fill:'forwards'});later(c,T*1000+60);
 }
 const dust=document.createElement('b');dust.className='fx-dust';dust.style.cssText=`left:${x}px;top:${y}px`;l.append(dust);
 dust.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:.55},{transform:'translate(-50%,-30%) scale(1.8)',opacity:0}],{duration:900,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});later(dust,950);
}

/* 爆裂魔法: a red seal draws itself, a white core flash, a fireball, the shock ring and sparks; the frame shakes */
export function explosion(x,y,{shake}={}){
 if(calm)return Promise.resolve();
 const l=layer(),w=document.createElement('div');w.className='fx-explosion';w.style.cssText=`left:${x}px;top:${y}px`;
 w.innerHTML=`<svg class="fx-seal" viewBox="-60 -60 120 120"><circle r="54"/><circle r="44"/><path d="${Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*Math.PI*4/5;return `${i?'L':'M'}${f1(Math.cos(a)*44)} ${f1(Math.sin(a)*44)}`;}).join(' ')}Z"/>${Array.from({length:12},(_,i)=>`<text transform="rotate(${i*30}) translate(0 -49)">${'爆裂紅魔我が名はめぐみん'[i]}</text>`).join('')}</svg><b class="fx-core"></b><b class="fx-fire"></b><b class="fx-ring"></b>`;
 l.append(w);
 const seal=w.querySelector('.fx-seal'),core=w.querySelector('.fx-core'),fire=w.querySelector('.fx-fire'),ring=w.querySelector('.fx-ring');
 seal.animate([{transform:'translate(-50%,-50%) scale(.4) rotate(-40deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(0)',opacity:1,offset:.55},{transform:'translate(-50%,-50%) scale(1.25) rotate(25deg)',opacity:0}],{duration:620,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
 core.animate([{transform:'translate(-50%,-50%) scale(0)',opacity:0},{transform:'translate(-50%,-50%) scale(0)',opacity:0,offset:.42},{transform:'translate(-50%,-50%) scale(1.4)',opacity:1,offset:.5},{transform:'translate(-50%,-50%) scale(2.2)',opacity:0}],{duration:760,easing:'ease-out',fill:'forwards'});
 fire.animate([{transform:'translate(-50%,-50%) scale(0)',opacity:0},{transform:'translate(-50%,-50%) scale(0)',opacity:0,offset:.44},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.6},{transform:'translate(-50%,-50%) scale(1.5)',opacity:0}],{duration:980,easing:'cubic-bezier(.2,.8,.3,1)',fill:'forwards'});
 ring.animate([{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(.1)',opacity:.9,offset:.46},{transform:'translate(-50%,-50%) scale(3.4)',opacity:0}],{duration:900,easing:'cubic-bezier(.1,.7,.3,1)',fill:'forwards'});
 for(let i=0;i<16;i++){const s=document.createElement('i');s.className='fx-spark';w.append(s);const a=Math.random()*Math.PI*2,d=60+Math.random()*120;
  s.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:0},{opacity:1,offset:.5,transform:'translate(-50%,-50%) scale(1)'},{transform:`translate(calc(-50% + ${f1(Math.cos(a)*d)}px),calc(-50% + ${f1(Math.sin(a)*d+30)}px)) scale(.3)`,opacity:0}],{duration:900+Math.random()*300,easing:'cubic-bezier(.1,.7,.3,1)',fill:'forwards'});}
 later(w,1400);
 /* the aftermath: a faint mushroom of smoke climbs from the blast and drifts apart */
 const m=document.createElement('div');m.className='fx-mushroom';m.style.cssText=`left:${x}px;top:${y}px`;
 const puffs=[[0,0,34,30,'stem'],[0,-26,30,34,'stem'],[0,-58,26,30,'stem'],[-34,-92,62,46,'cap'],[30,-94,66,48,'cap'],[0,-108,80,54,'cap'],[-62,-80,44,34,'cap'],[60,-80,46,34,'cap']];
 m.innerHTML=puffs.map(([px,py,pw,ph,k])=>`<i class="is-${k}" style="left:${px}px;top:${py}px;width:${pw}px;height:${ph}px"></i>`).join('');l.append(m);
 m.querySelectorAll('i').forEach((p,i)=>{const cap=p.classList.contains('is-cap'),dx=(Math.random()-.5)*(cap?70:24);
  p.animate([{transform:'translate(-50%,-50%) translateY(40px) scale(.3)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.3},{transform:`translate(calc(-50% + ${f1(dx)}px),calc(-50% - ${cap?60:40}px)) scale(${cap?1.9:1.5})`,opacity:0}],{duration:2600+Math.random()*900,delay:420+i*40,easing:'cubic-bezier(.25,.6,.3,1)',fill:'both'});});
 later(m,4200);
 return new Promise(res=>setTimeout(()=>{
  if(shake)shake.animate([{transform:'none'},{transform:'translate(-6px,3px)'},{transform:'translate(5px,-4px)'},{transform:'translate(-3px,2px)'},{transform:'none'}],{duration:320,easing:'ease-out'});
  res();},320));
}

/* 花鳥風月: water arcs up and falls with petals and a few sparkles */
export function fountain(x,y){
 if(calm)return;
 const l=layer();
 for(let i=0;i<26;i++){
  const flower=i%3===0,el=document.createElement('i');el.className=flower?'fx-petal':'fx-drop';
  el.style.cssText=`left:${x}px;top:${y}px`;if(flower)el.textContent=['✿','❀','✾'][Math.floor(Math.random()*3)];l.append(el);
  const vx=(Math.random()-.5)*260,vy=-(260+Math.random()*260),g=900,T=1+Math.random()*.6,spin=(Math.random()-.5)*360,frames=[];
  for(let k=0;k<=8;k++){const t=T*k/8;frames.push({transform:`translate(${f1(vx*t)}px,${f1(vy*t+g*t*t/2)}px) rotate(${f1(spin*t)}deg) scale(${k===0?.3:1})`,opacity:k===0?0:k<6?1:(8-k)/2.5});}
  el.animate(frames,{duration:T*1000,delay:Math.random()*160,easing:'linear',fill:'both'});later(el,T*1000+260);
 }
 const glow=document.createElement('b');glow.className='fx-bloom';glow.style.cssText=`left:${x}px;top:${y}px`;l.append(glow);
 glow.animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:.8,offset:.3},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],{duration:900,easing:'ease-out',fill:'forwards'});later(glow,950);
}
