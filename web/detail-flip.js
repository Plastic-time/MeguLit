// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: the detail page's card turns over on a click, with a fine card-flip animation; the back shows a
   random CG this computer has already unlocked). The unlock state comes from the game's own saves (services/game-cg);
   a game whose saves cannot be read yet shows the card's own back: a crest with the title's first character.
   With the R18 filter on (setting safe_cg) the list holds only CGs already rated safe; while others are still being
   rated in the background (pending) the list is asked for again at each turn.
   The flip: the card lifts toward the viewer, turns on a slight diagonal, a light runs across the face at the edge-on
   moment, it overshoots and settles. It keeps turning the same way (0 -> 180 -> 360), so it reads as one card.
   A long press or a drag only plays with the card (the tilt); it never flips. */
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const words={zh:{cg:'CG',back:'卡背',flip:'点击翻面'},ja:{cg:'CG',back:'カードの裏',flip:'クリックで裏返す'},en:{cg:'CG',back:'Card back',flip:'Click to turn over'}};
export function flipCard(card,{api,id,esc,game,locale='zh'}){
 const flip=card.querySelector('.dtv-flip'),art=card.querySelector('.dtv-back-art');if(!flip||!art)return;
 const w=words[locale]||words.zh;card.setAttribute('aria-label',w.flip);
 const glyph=[...String(game?.title||'')].find(c=>/[一-鿿぀-ヿ]/.test(c))||String(game?.title||' ').trim().charAt(0).toUpperCase()||'M';
 let angle=0,busy=null,list=null,last='',pressAt=0,pressXY=[0,0];
 const crest=()=>{art.className='dtv-back-art is-crest';art.innerHTML=`<i class="dtv-ring"></i><i class="dtv-ring is-inner"></i><b>${esc(glyph)}</b><span>MeguLit</span><small>${esc(game?.title||'')}</small>`;};
 crest();
 let pending=0;
 async function cgs(){if(list&&!pending)return list;try{const r=await api('game_cgs',{id});list=Array.isArray(r?.items)?r.items:[];pending=Number(r?.pending)||0;}catch{list=list||[];pending=0;}return list;}
 /* a new random unlocked CG for this turn (never the same one twice in a row); decoded before the card turns */
 async function prepareBack(){
  const items=await cgs();if(!items.length){crest();return;}
  const pool=items.length>1?items.filter(n=>n!==last):items,name=pool[Math.floor(Math.random()*pool.length)];
  try{const r=await api('game_cg',{id,name});if(!r?.data)throw 0;const img=new Image();img.src='data:'+r.mime+';base64,'+r.data;await img.decode().catch(()=>{});
   last=name;art.className='dtv-back-art is-cg';art.replaceChildren(img);const tag=document.createElement('span');tag.className='dtv-cg-tag';tag.textContent=`${w.cg} · ${items.indexOf(name)+1} / ${items.length}`;art.append(tag);
   img.animate([{objectPosition:'0% 50%'},{objectPosition:'100% 50%'}],{duration:16000,iterations:Infinity,direction:'alternate',easing:'ease-in-out'});
  }catch{crest();}
 }
 function sweep(){if(reduce())return;for(const side of card.querySelectorAll('.dtv-side')){let s=side.querySelector('.dtv-sweep');if(!s){s=document.createElement('i');s.className='dtv-sweep';side.append(s);}
  s.animate([{opacity:0,backgroundPosition:'140% 0'},{opacity:.95,offset:.45},{opacity:0,backgroundPosition:'-40% 0'}],{duration:620,delay:150,easing:'cubic-bezier(.3,.1,.3,1)'});}}
 async function turn(){
  if(busy)return;const toBack=angle%360===0;busy=toBack?prepareBack():Promise.resolve();await busy;
  const from=angle,to=angle+180;angle=to;card.setAttribute('aria-pressed',String(toBack));
  card.querySelector('.dtv-back')?.setAttribute('aria-hidden',String(!toBack));card.querySelector('.dtv-front')?.setAttribute('aria-hidden',String(toBack));
  if(reduce()){flip.style.transform=`rotateY(${to%360}deg)`;angle=to%360;busy=null;return;}
  card.classList.add('is-flipping');sweep();
  const r=(a,z,s,tilt)=>`translateZ(${z}px) rotateY(${a}deg) rotateZ(${tilt}deg) scale(${s})`;
  const anim=flip.animate([
   {transform:r(from,0,1,0),easing:'cubic-bezier(.35,0,.6,.2)'},
   {transform:r(from+55,70,1.07,-2.2),offset:.3,easing:'cubic-bezier(.2,0,.4,1)'},
   {transform:r(from+150,90,1.08,1.6),offset:.58,easing:'cubic-bezier(.2,.7,.3,1)'},
   {transform:r(to+9,12,1.01,-.4),offset:.8,easing:'cubic-bezier(.4,0,.4,1)'},
   {transform:r(to-2.5,0,1,0),offset:.91,easing:'ease-in-out'},
   {transform:r(to,0,1,0)}],{duration:980,fill:'forwards'});
  await anim.finished.catch(()=>{});
  angle=to%360;flip.style.transform=`rotateY(${angle}deg)`;anim.cancel();card.classList.remove('is-flipping');busy=null;
 }
 card.addEventListener('pointerdown',e=>{pressAt=performance.now();pressXY=[e.clientX,e.clientY];});
 card.addEventListener('click',e=>{if(e.detail&&(performance.now()-pressAt>350||Math.hypot(e.clientX-pressXY[0],e.clientY-pressXY[1])>6))return;turn();});
 card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();turn();}});
 cgs();
}
