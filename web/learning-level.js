/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 日语水平 (2026-11-11). The first visit to the learning page asks how much Japanese you know; the choice marks
   what lies below it as known (kana, N5 grammar) and says where to start. Changeable from the grammar page any time. */
import {SEION_LIST,DAKU_LIST,YOON_LIST,toKata} from './kana/data.js';
export const LEVEL_CHOICES=[
 {id:'none',name:'完全不懂',sub:'一个假名也不认识',seal:'零'},
 {id:'kana',name:'认识部分五十音',sub:'见过假名，还没记全',seal:'仮'},
 {id:'N5',name:'N5',sub:'五十音过关，会最基础的句子',seal:'五'},
 {id:'N4',name:'N4',sub:'日常简单对话、基础活用',seal:'四'},
 {id:'N3',name:'N3',sub:'能读懂大部分日常台词',seal:'三'},
 {id:'N2',name:'N2',sub:'生肉 gal 基本无压力',seal:'二'},
 {id:'N1',name:'N1',sub:'书面语、长难句都能啃',seal:'一'},
 {id:'N0',name:'N0 · 母语级',sub:'考级之外：俗语、口癖、网络用语、真实生活里的说法',seal:'〇'}
];
const RECOMMEND={
 kana:'从五十音第一课 あ行 开始——每课五个假名，五分钟一课',
 'kana-rest':'先在五十音图里把认识的假名点成「掌握」，剩下的按课学完',
 grammar:'假名已经全部标为掌握。去「语法」从下一级开始',
 native:'假名和 N5 语法都已标为掌握。去「读过的词」看看你游戏里那些考级不考的说法'
};
export const allKana=()=>{const h=[...SEION_LIST,...DAKU_LIST,...YOON_LIST];return [...h,...h.map(toKata)];};
export const levelName=id=>LEVEL_CHOICES.find(l=>l.id===id)?.name||'';
export function pickerHTML(current,esc){
 return `<div class="lv-dialog" role="dialog" aria-modal="true" aria-labelledby="lv-title"><header><p class="lv-kicker">学习 · 初次见面</p><h2 id="lv-title">你现在的日语水平是？</h2>
<p class="lv-lead">吾名惠惠！先告诉我你的魔力等级——选好后，比这低的内容会自动标成「已掌握」，并告诉你从哪里学起。以后随时可以改。</p></header>
<div class="lv-grid" role="radiogroup">${LEVEL_CHOICES.map((l,i)=>`<button type="button" role="radio" class="lv-opt${l.id===current?' active':''}" aria-checked="${l.id===current}" data-level-pick="${l.id}" style="--i:${i}"><span class="lv-seal" aria-hidden="true">${l.seal}</span><b>${esc(l.name)}</b><small>${esc(l.sub)}</small></button>`).join('')}</div>
<footer><p class="lv-note" data-lv-note></p><button type="button" class="secondary" data-lv-later>${current?'取消':'以后再说'}</button><button type="button" class="primary" data-lv-ok disabled>就是它了！</button></footer></div>`;
}
let asked=false;
/* Opens the picker; resolves with the backend's answer (level, what was marked, where to start) or null if dismissed. */
export function openLevelPicker({api,esc,toast,current=null}){
 return new Promise(resolve=>{
  const back=document.createElement('div');back.className='lv-backdrop';back.innerHTML=pickerHTML(current,esc);document.body.appendChild(back);
  let pick=current;const ok=back.querySelector('[data-lv-ok]'),note=back.querySelector('[data-lv-note]');ok.disabled=!pick;
  const close=v=>{document.removeEventListener('keydown',key);back.classList.add('out');setTimeout(()=>back.remove(),160);resolve(v);};
  const key=e=>{if(e.key==='Escape')close(null);};document.addEventListener('keydown',key);
  back.querySelectorAll('[data-level-pick]').forEach(b=>b.onclick=()=>{pick=b.dataset.levelPick;back.querySelectorAll('[data-level-pick]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-checked',String(x===b));});ok.disabled=false;
   const r=['none','kana'].includes(pick)?'':pick==='N5'?'所有假名会标成「掌握」':'所有假名和 N5 语法会标成「掌握」';note.textContent=r;});
  back.querySelector('[data-lv-later]').onclick=()=>close(null);
  back.addEventListener('click',e=>{if(e.target===back)close(null);});
  ok.onclick=async()=>{ok.disabled=true;try{const r=await api('learning_level_set',{level:pick,kana:allKana()});toast?.(`已设为「${levelName(pick)}」 · ${RECOMMEND[r.recommend.reason]||''}`);close(r);}catch(error){ok.disabled=false;toast?.(String(error?.message||error));}};
  back.querySelector('.lv-opt.active,.lv-opt')?.focus();
 });
}
export const recommendText=r=>RECOMMEND[r?.recommend?.reason]||'';
/* Called each time the learning page opens: asks once per session while no level is set. */
export async function ensureLevel({api,esc,toast,openTab}){
 if(asked)return null;asked=true;
 const cur=await api('learning_level').catch(()=>null);if(!cur||cur.level)return cur;
 const r=await openLevelPicker({api,esc,toast});if(r&&openTab)openTab(r.recommend.tab);return r;
}
