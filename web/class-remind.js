// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 转职 reminders. Once a reader reaches Lv.20 without an element: the first time, the rite opens by itself
   ("到达 Lv.20！"); after that, each launch shows one quiet card at the corner with 去转职 / 稍后; and while it is due
   the profile chip in the top bar carries a small red dot. Choosing an element clears all of it. Presentation only:
   it reads reader_level and opens the same rite as the profile. */
import {openRite,classWords} from './reader-class.js';
const call=(action,params={})=>{const req={request:{action,...params}};if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__('service',req);const n=window.__TAURI_INTERNALS__?.invoke;return n?n('service',req):Promise.reject(Error('DESKTOP_REQUIRED'));};
const KEY='megulit.class.reached.v1';
const loc=()=>{const l=String(document.documentElement.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=text=>{const t=document.getElementById('toast');if(!t)return;t.textContent=text;t.classList.add('visible');setTimeout(()=>t.classList.remove('visible'),4600);};
let due=false,nudged=false,state=null;
function dot(){for(const b of document.querySelectorAll('[data-top-me]'))b.classList.toggle('has-class-due',due);}
function rite(headline=''){
 openRite({api:call,locale:loc(),esc,toast,current:state?.element||'',pending:state?.pending||0,xpTotal:(state?.xp||0)+(state?.pending||0),headline,onDone:()=>{due=false;dot();document.querySelector('.class-nudge')?.remove();}});
}
function nudge(){
 if(nudged||document.querySelector('.class-nudge'))return;nudged=true;
 const w=classWords(loc()),card=document.createElement('aside');card.className='class-nudge';card.setAttribute('role','status');
 card.innerHTML=`<b class="class-nudge-glyph" aria-hidden="true">転</b><p>${esc(w.nudge)}</p><div><button type="button" class="text-button" data-later>${esc(w.nudgeLater)}</button><button type="button" class="primary" data-go>${esc(w.nudgeGo)}</button></div>`;
 document.body.append(card);
 const go=()=>{card.classList.add('is-out');setTimeout(()=>card.remove(),300);};
 card.querySelector('[data-later]').onclick=go;card.querySelector('[data-go]').onclick=()=>{go();rite();};
}
async function check(first){
 try{state=await call('reader_level');}catch{return;}
 due=!!state?.locked;dot();if(!due)return;
 let seen=false;try{seen=localStorage.getItem(KEY)==='1';}catch{}
 if(!seen){try{localStorage.setItem(KEY,'1');}catch{}nudged=true;rite(classWords(loc()).reached);return;}
 if(first)nudge();
}
document.addEventListener('megulit:reader-class',()=>{due=false;dot();});
new MutationObserver(()=>{if(due&&document.querySelector('[data-top-me]:not(.has-class-due)'))dot();}).observe(document.body,{childList:true,subtree:true});
/* after the app has settled (and any start-up notice had its moment), then every ten minutes for a level reached mid-session */
setTimeout(()=>{const wait=()=>document.querySelector('dialog[open]')?setTimeout(wait,4000):check(true);wait();},6000);
setInterval(()=>check(false),600000);
