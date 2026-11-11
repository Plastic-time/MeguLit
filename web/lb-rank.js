// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 转职 on the leaderboard: the relay reports each reader's level and element; your own row is filled in
   from this PC when the relay has not caught up yet (before your next submission). Read-only. */
import {readerLevel,rankTitle,SCHOOLS,elementName} from './reader-class.js';
const call=(action,params={})=>{const req={request:{action,...params}};if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__('service',req);const n=window.__TAURI_INTERNALS__?.invoke;return n?n('service',req):Promise.reject(Error('DESKTOP_REQUIRED'));};
let cache=null,at=0,busy=null;
async function mine(){
 if(cache&&Date.now()-at<30000)return cache;if(busy)return busy;
 busy=Promise.all([call('reader_class_get').catch(()=>null),call('leaderboard_view',{period:'all',metric:'seconds'}).catch(()=>null)]).then(([c,v])=>{
  const school=SCHOOLS[c?.element]?c.element:'',lv=readerLevel(v?.local?.stats?.all,school);cache={lv,school};at=Date.now();busy=null;return cache;});
 return busy;
}
const loc=()=>{const l=String(document.documentElement.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
let tick=0;
async function scan(){
 tick=0;const names=[...document.querySelectorAll('.is-me :is(.leaderboard-name,.lb-name,.lb-gname)')].filter(n=>!n.parentElement.querySelector('.lb-rank-tag'));
 if(!names.length)return;const m=await mine(),l=loc();
 for(const n of names){if(n.parentElement.querySelector('.lb-rank-tag'))continue;const t=document.createElement('small');t.className='lb-rank-tag';
  if(m.school)t.style.setProperty('--c',SCHOOLS[m.school].color);
  t.textContent=`Lv.${m.lv.level} · ${m.school?elementName(m.school,l)+' · ':''}${rankTitle(m.lv.level,l,m.school)}`;n.after(t);}
}
new MutationObserver(()=>{if(!tick)tick=requestAnimationFrame(()=>{scan().catch(()=>{});});}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('megulit:reader-class',()=>{cache=null;document.querySelectorAll('.is-me .lb-rank-tag').forEach(t=>t.remove());scan().catch(()=>{});});
