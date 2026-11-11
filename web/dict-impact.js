// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user): a dictionary search slams the box up into the top bar. The hit lands at a random point, throws
   the floating kana and words out in random directions, and leaves cracks in the box and the bar. The cracks stay;
   each search adds more. Opening words heals them, about ten words per search, the newest repair glowing gold
   (kintsugi) as the line closes from its tips back to the impact point. Presentation only: the state is a short list
   of impact points in localStorage, nothing in the app's data changes. */
import {scarMarkup,debris} from './burst-fx.js';
const KEY='megulit.dict.cracks.v1',MAX=12,STEP=.1,NS='http://www.w3.org/2000/svg';
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソ';
const load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(c=>c&&c.h>0).slice(-MAX):[];}catch{return [];}};
const save=list=>{try{localStorage.setItem(KEY,JSON.stringify(list));}catch{}};
let cracks=load();
const rng=seed=>{let s=(seed>>>0)%2147483647||1;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};};

function layer(host,cls){
 let svg=host.querySelector(`:scope>svg.${cls}`);
 if(!svg){svg=document.createElementNS(NS,'svg');svg.setAttribute('class',`dict-crack ${cls}`);svg.setAttribute('aria-hidden','true');host.append(svg);}
 return svg;
}
function paint(svg,w,h,which){
 svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('width',w);svg.setAttribute('height',h);
 const keep=new Set();
 for(const c of cracks){
  const id=`${which}${c.s}`;keep.add(id);let g=svg.querySelector(`[data-c="${id}"]`);
  if(!g){g=document.createElementNS(NS,'g');g.dataset.c=id;
   const x=which==='f'?c.x*w:c.vx*w,y=which==='f'?1:h-1;
   /* 2026-11-12 (user: 75% weaker, a dent knocked out with chips falling): a small pit on the struck edge and
      two or three short cracks out of it */
   const sd=c.s+(which==='f'?0:977),rr=((sd%1000)/1000);
   g.innerHTML=which==='f'?scarMarkup(sd,x,y,6+rr*4,26+rr*16,2+(sd%2),0,Math.PI):scarMarkup(sd,x,y,4+rr*3,16+rr*14,1+(sd%3),Math.PI,Math.PI);
   svg.append(g);}
  g.style.setProperty('--h',Math.max(0,Math.min(1,c.h)).toFixed(2));
 }
 for(const g of svg.querySelectorAll('g[data-c]'))if(!keep.has(g.dataset.c)){g.style.setProperty('--h','0');setTimeout(()=>g.remove(),1400);}
}
function render(){
 const form=document.querySelector('#lookup-form'),bar=document.querySelector('header.titlebar');
 const input=form?.querySelector('#lookup-input');
 /* the box's cracks live on the field itself, not across the buttons */
 if(input&&input.offsetWidth){const svg=layer(form,'is-box');svg.style.left=`${input.offsetLeft}px`;svg.style.top=`${input.offsetTop}px`;paint(svg,input.offsetWidth,input.offsetHeight,'f');}
 if(bar&&bar.offsetWidth){
  let svg=document.querySelector('body>svg.dict-crack.is-bar');if(!svg){svg=layer(document.body,'is-bar');}
  const rect=bar.getBoundingClientRect();svg.style.top=`${rect.top}px`;svg.style.left=`${rect.left}px`;
  /* only while the dictionary is open; the bar keeps its cracks hidden elsewhere */
  svg.classList.toggle('is-off',!form);
  if(form)paint(svg,rect.width,rect.height,'b');
 }
}

/* the throw: every floating glyph and a handful of fresh shards fly away from the impact point */
function scatter(ix,iy){
 if(calm)return;
 const cloud=document.querySelector('.dict-cloud');
 if(cloud&&getComputedStyle(cloud).opacity!=='0'){
  cloud.classList.add('is-burst');
  for(const g of cloud.querySelectorAll('i')){
   const b=g.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;let dx=cx-ix,dy=cy-iy;const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;
   const far=380+Math.random()*700+Math.max(0,600-m),spin=(Math.random()-.5)*540,dur=650+Math.random()*700;
   g.animate([{transform:'translate(0,0) rotate(0) scale(1)',opacity:1},{transform:`translate(${(dx*far*.18).toFixed(0)}px,${(dy*far*.18).toFixed(0)}px) rotate(${(spin*.2).toFixed(0)}deg) scale(1.15)`,opacity:1,offset:.12},{transform:`translate(${(dx*far).toFixed(0)}px,${(dy*far+260*Math.random()).toFixed(0)}px) rotate(${spin.toFixed(0)}deg) scale(${(.4+Math.random()*.9).toFixed(2)})`,opacity:0}],{duration:dur,delay:Math.max(0,m*.35-40)*Math.random()*.6,easing:'cubic-bezier(.12,.75,.3,1)',fill:'forwards'});
  }
 }
 const words=[...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean);
 const fx=document.createElement('div');fx.className='dict-shards';fx.setAttribute('aria-hidden','true');
 const n=12+Math.floor(Math.random()*8);let html='';
 for(let i=0;i<n;i++){const t=Math.random()<.3&&words.length?words[Math.floor(Math.random()*words.length)]:KANA[Math.floor(Math.random()*KANA.length)];html+=`<i style="left:${ix}px;top:${iy}px;font-size:${(12+Math.random()*30).toFixed(0)}px">${t}</i>`;}
 fx.innerHTML=html+`<b style="left:${ix}px;top:${iy}px"></b>`;document.body.append(fx);
 for(const g of fx.querySelectorAll('i')){
  const a=Math.PI*(.05+Math.random()*.9),far=120+Math.random()*420,spin=(Math.random()-.5)*720;
  const tx=Math.cos(a)*far*(Math.random()<.5?-1:1),ty=Math.sin(a)*far*(Math.random()<.4?-.7:.6);
  g.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:`translate(calc(-50% + ${(tx*.3).toFixed(0)}px),calc(-50% + ${(ty*.3).toFixed(0)}px)) rotate(${(spin*.3).toFixed(0)}deg) scale(1)`,opacity:1,offset:.15},{transform:`translate(calc(-50% + ${tx.toFixed(0)}px),calc(-50% + ${(ty+180).toFixed(0)}px)) rotate(${spin.toFixed(0)}deg) scale(.6)`,opacity:0}],{duration:700+Math.random()*800,easing:'cubic-bezier(.1,.7,.35,1)',fill:'forwards'});
 }
 fx.querySelector('b').animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:.9},{transform:'translate(-50%,-50%) scale(3.2)',opacity:0}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
 setTimeout(()=>fx.remove(),1800);
}
function jolt(el,dy){if(calm||!el)return;const k=(Math.random()-.5)*3;el.animate([{transform:'none'},{transform:`translate(${k.toFixed(1)}px,${dy}px) rotate(${(k*.15).toFixed(2)}deg)`},{transform:`translate(${(-k*.5).toFixed(1)}px,${(-dy*.35).toFixed(1)}px)`},{transform:'none'}],{duration:340,easing:'cubic-bezier(.3,.7,.2,1)'});}

function impact(){
 const form=document.querySelector('#lookup-form');if(!form)return;
 const bar=document.querySelector('header.titlebar'),results=document.querySelector('#lookup-results');
 const rising=results&&!results.children.length&&!results.textContent.trim();
 const hit=()=>{
  const box=(form.querySelector('#lookup-input')||form).getBoundingClientRect(),fxr=.1+Math.random()*.8,ix=box.left+box.width*fxr,iy=box.top;
  const vw=bar?bar.getBoundingClientRect().width:innerWidth;
  /* keep the bar's crack clear of the logo and the window buttons */
  const vx=Math.min(.72,Math.max(.24,ix/vw));
  cracks.push({s:Math.floor(Math.random()*2147483646)+1,x:+fxr.toFixed(3),vx:+vx.toFixed(3),h:1});
  if(cracks.length>MAX)cracks=cracks.slice(-MAX);save(cracks);
  scatter(ix,iy);jolt(form,-6);jolt(bar,-3);
  debris(ix,iy+2,{n:9,spread:.8,up:.3});if(bar){const br=bar.getBoundingClientRect();debris(br.left+vx*br.width,br.bottom-1,{n:6,spread:.6,up:.1});}
  requestAnimationFrame(render);
 };
 if(rising&&!calm){
  form.animate([{transform:'none'},{transform:'translateY(4px)'},{transform:'none'}],{duration:140,easing:'ease-out'});
  setTimeout(hit,440);
 }else{
  if(!calm)form.animate([{transform:'none'},{transform:'translateY(-18px)',offset:.45},{transform:'none'}],{duration:300,easing:'cubic-bezier(.4,0,.2,1)'});
  setTimeout(hit,calm?0:130);
 }
}
/* reading a word mends the oldest crack by a tenth */
function heal(){
 const c=cracks[0];if(!c)return;
 c.h=+(c.h-STEP).toFixed(2);
 for(const g of document.querySelectorAll(`.dict-crack g[data-c="f${c.s}"],.dict-crack g[data-c="b${c.s}"]`)){g.classList.remove('is-mending');void g.getBoundingClientRect();g.classList.add('is-mending');}
 if(c.h<=0)cracks.shift();save(cracks);render();
}

document.addEventListener('submit',e=>{if(e.target?.id==='lookup-form')impact();},true);
document.addEventListener('click',e=>{const entry=e.target.closest?.('#lookup-results .dict-entry');if(entry)heal();},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest?.('#lookup-results .moji-entry'))heal();},true);
let tick=0;
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(()=>{tick=0;render();});}).observe(document.body,{childList:true,subtree:true});
addEventListener('resize',()=>requestAnimationFrame(render));
