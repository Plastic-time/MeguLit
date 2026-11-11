// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: the empty dictionary was too bare; make it move with the mouse, and let a search push the box
   up). While no result is shown, the words you look up most and a few kana float around the centred search box and
   drift with the pointer; when results arrive the box rises and the words scatter. Presentation only. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
function build(host){
 if(host.querySelector(':scope>.dict-cloud'))return;
 const words=[...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean).slice(0,10);
 const pool=[...words,...KANA.slice(0,16)];
 const cloud=document.createElement('div');cloud.className='dict-cloud';cloud.setAttribute('aria-hidden','true');
 let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 cloud.innerHTML=pool.map((t,i)=>{let a=rnd()*Math.PI*2,r=.36+rnd()*.58,x=50+Math.cos(a)*r*46,y=44+Math.sin(a)*r*42;if(Math.abs(y-40)<11)y+=y<40?-12:12;const d=(.3+rnd()*1.2).toFixed(2),s=(i<words.length?20+rnd()*22:13+rnd()*12).toFixed(0);
  return `<i style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--d:${d};font-size:${s}px;animation-delay:${(-rnd()*9).toFixed(1)}s">${t}</i>`;}).join('');
 host.prepend(cloud);
}
let tick=0;
function scan(){tick=0;const results=document.querySelector('#lookup-results');if(!results)return;const host=results.closest('#learning-content')||results.parentElement;if(host)build(host);}
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(scan);}).observe(document.body,{childList:true,subtree:true});
if(!calm)document.addEventListener('pointermove',e=>{const c=document.querySelector('.dict-cloud');if(!c)return;c.style.setProperty('--px',(e.clientX/innerWidth-.5).toFixed(3));c.style.setProperty('--py',(e.clientY/innerHeight-.5).toFixed(3));},{passive:true});
