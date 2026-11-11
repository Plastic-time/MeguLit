// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user): in every practice, a wrong answer is hit by Explosion (爆裂魔法) — the page is blown into a pit,
   chips fall out of it and fine cracks run from it — and a right answer brings Aqua's 花鳥風月 fountain, which mends the
   oldest pit. It only watches what the practices already show (the right / wrong marks on kana and grammar answers, the
   Again / Good / Easy buttons of the review) and only reacts within a moment of the learner's own click or key. */
import {calm,NS,scarMarkup,debris,explosion,fountain} from './burst-fx.js';
const WRONG='.wrong,.miss,.gm-blank.bad',RIGHT='.right,.hit,.gm-blank.ok',MAX=10;
let lastInput=0,queued=null;
const recent=()=>performance.now()-lastInput<1600;
addEventListener('pointerdown',()=>{lastInput=performance.now();},true);
addEventListener('keydown',()=>{lastInput=performance.now();},true);

const hostOf=el=>{const root=el.getRootNode();return root instanceof ShadowRoot?root.host:el;};
const scope=el=>hostOf(el).closest('#learning-content')||hostOf(el).closest('.main')||document.body;
const inPractice=el=>el.getRootNode() instanceof ShadowRoot?!!hostOf(el).closest('.kana-host')||hostOf(el).classList.contains('kana-host'):/(^|\s)gm-/.test(el.className||'')||!!el.closest?.('[class*="gm-"]');
function scarsOf(box){
 let svg=box.querySelector(':scope>svg.fx-scars');
 if(!svg){svg=document.createElementNS(NS,'svg');svg.setAttribute('class','fx-scars');svg.setAttribute('aria-hidden','true');box.classList.add('has-fx-scars');box.append(svg);}
 svg.setAttribute('width',box.scrollWidth);svg.setAttribute('height',box.scrollHeight);svg.setAttribute('viewBox',`0 0 ${box.scrollWidth} ${box.scrollHeight}`);
 return svg;
}
function center(el){const r=el.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};}
async function blast(el){
 const box=scope(el),{x,y}=center(el);
 await explosion(x,y,{shake:box,bar:document.querySelector('header.titlebar')});
 if(!box.isConnected)return;
 const svg=scarsOf(box),b=box.getBoundingClientRect(),seed=Math.floor(Math.random()*2147483646)+1;
 const g=document.createElementNS(NS,'g');g.setAttribute('class','fx-scar');
 const R=44+Math.random()*16;
 g.innerHTML=scarMarkup(seed,x-b.left,y-b.top,R,R*1.4+Math.random()*40,6+Math.floor(Math.random()*3))+`<circle class="fx-water" cx="${(x-b.left).toFixed(1)}" cy="${(y-b.top).toFixed(1)}" r="0"/>`;g.classList.add('is-hot');setTimeout(()=>g.classList.remove('is-hot'),2600);
 svg.append(g);
 const all=svg.querySelectorAll('g.fx-scar:not(.is-gone)');if(all.length>MAX)mend(all[0]);
 debris(x,y+R*.4,{n:16,spread:1.3,up:.9,tint:'ash'});
}
function mend(g){const w=g.querySelector('.fx-water'),pit=g.querySelector('.fx-rim');if(w&&pit){const R=pit.getBBox?Math.max(pit.getBBox().width,pit.getBBox().height)/2:50;w.animate([{r:0,opacity:.95},{r:R,opacity:.95,offset:.55},{r:R,opacity:0}],{duration:1300,easing:'cubic-bezier(.3,.7,.2,1)',fill:'forwards'});}g.classList.add('is-gone');setTimeout(()=>g.remove(),1600);}
function bloom(el){
 const box=scope(el),{x,y}=center(el);
 fountain(x,y);
 const scar=box.querySelector(':scope>svg.fx-scars g.fx-scar:not(.is-gone)');
 if(scar)setTimeout(()=>mend(scar),380);
}
function react(kind,el){
 if(!queued){queued={};requestAnimationFrame(()=>{const q=queued;queued=null;if(q.wrong)blast(q.wrong);else if(q.right)bloom(q.right);});}
 if(!queued[kind])queued[kind]=el;
}
function check(el,old){
 if(!(el instanceof Element)||!recent()||!inPractice(el))return;
 if(el.matches(WRONG)&&!(old&&/(^|\s)(wrong|miss|bad)(\s|$)/.test(old)))react('wrong',el);
 else if(el.matches(RIGHT)&&!(old&&/(^|\s)(right|hit|ok)(\s|$)/.test(old)))react('right',el);
}
function onMut(list){
 if(calm)return;
 for(const m of list){
  if(m.type==='attributes')check(m.target,m.oldValue||'');
  else for(const n of m.addedNodes){if(!(n instanceof Element))continue;check(n,'');if(recent())for(const c of n.querySelectorAll(`${WRONG},${RIGHT}`))check(c,'');watchShadows(n);}
 }
}
const OPTS={subtree:true,childList:true,attributes:true,attributeFilter:['class'],attributeOldValue:true};
const seen=new WeakSet();
function watchShadows(root){for(const h of (root.matches?.('.kana-host')?[root]:[]).concat([...(root.querySelectorAll?.('.kana-host')||[])]))if(h.shadowRoot&&!seen.has(h.shadowRoot)){seen.add(h.shadowRoot);new MutationObserver(onMut).observe(h.shadowRoot,OPTS);}}
new MutationObserver(onMut).observe(document.body,OPTS);
watchShadows(document.body);
/* the review: Again is a miss, Good and Easy are hits */
document.addEventListener('click',e=>{if(calm)return;const b=e.target.closest?.('.anki-rating');if(!b)return;if(b.classList.contains('rating-1'))blast(b);else if(b.matches('.rating-3,.rating-4'))bloom(b);},true);
