/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 日语水平 (2026-11-11). The first visit to the learning page asks how much Japanese you know; the choice marks
   what lies below it as known (kana, N5 grammar) and says where to start. Changeable from the grammar page any time. */
import {SEION_LIST,DAKU_LIST,YOON_LIST,toKata} from './kana/data.js';
/* 2026-11-11 the picker speaks the interface language (it was Chinese under every language) */
const loc=()=>{const l=String(globalThis.document?.documentElement?.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
const TEXT={
 zh:{kicker:'学习 · 初次见面',title:'你现在的日语水平是？',lead:'吾名惠惠！先告诉我你的魔力等级——选好后，比这低的内容会自动标成「已掌握」，并告诉你从哪里学起。以后随时可以改。',later:'以后再说',cancel:'取消',ok:'就是它了！',noteN5:'所有假名会标成「掌握」',noteUp:'所有假名和 N5 语法会标成「掌握」',set:n=>`已设为「${n}」`,
  levels:[['完全不懂','一个假名也不认识'],['认识部分五十音','见过假名，还没记全'],['N5','五十音过关，会最基础的句子'],['N4','日常简单对话、基础活用'],['N3','能读懂大部分日常台词'],['N2','生肉 gal 基本无压力'],['N1','书面语、长难句都能啃'],['N0 · 母语级','考级之外：俗语、口癖、网络用语、真实生活里的说法']],
  rec:{kana:'从五十音第一课 あ行 开始——每课五个假名，五分钟一课','kana-rest':'先在五十音图里把认识的假名点成「掌握」，剩下的按课学完',grammar:'假名已经全部标为掌握。去「语法」从下一级开始',native:'假名和 N5 语法都已标为掌握。去「读过的词」看看你游戏里那些考级不考的说法'}},
 ja:{kicker:'学習 · はじめまして',title:'いまの日本語レベルは？',lead:'我が名はめぐみん！まずは魔力のレベルを教えて。選ぶとそれより下の内容は「習得済み」になり、どこから始めればいいかも分かります。あとからいつでも変えられます。',later:'あとで',cancel:'キャンセル',ok:'これにする！',noteN5:'すべての仮名が「習得」になります',noteUp:'すべての仮名と N5 文法が「習得」になります',set:n=>`「${n}」に設定しました`,
  levels:[['まったく分からない','仮名もまだ読めない'],['五十音を少し','仮名は見たことがある、まだ全部は覚えていない'],['N5','五十音は大丈夫、ごく基本の文が分かる'],['N4','簡単な日常会話、基本の活用'],['N3','日常のセリフはだいたい読める'],['N2','生のギャルゲもほぼ問題なし'],['N1','書き言葉や長い文もこなせる'],['N0 · ネイティブ級','試験の外：俗語、口癖、ネットスラング、本当の言い回し']],
  rec:{kana:'五十音の第一課「あ行」から。1 課 5 文字、5 分です','kana-rest':'まず五十音図で知っている仮名を「習得」にして、残りを課ごとに','grammar':'仮名はすべて習得済み。「文法」で次のレベルから始めましょう',native:'仮名と N5 文法は習得済み。「読んだ語」でゲームに出る試験外の言い回しを見てみましょう'}},
 en:{kicker:'Learning · First visit',title:'How much Japanese do you know?',lead:'I am Megumin! Tell me your level of magic first. Everything below it is marked as known, and you’ll see where to start. You can change it any time.',later:'Later',cancel:'Cancel',ok:'That’s me!',noteN5:'All kana will be marked as known',noteUp:'All kana and N5 grammar will be marked as known',set:n=>`Set to “${n}”`,
  levels:[['None yet','Can’t read kana yet'],['Some kana','Seen kana, not all memorised'],['N5','Kana done, the most basic sentences'],['N4','Simple everyday talk, basic conjugation'],['N3','Most everyday lines make sense'],['N2','Raw visual novels are mostly fine'],['N1','Written style and long sentences too'],['N0 · Native-like','Beyond the tests: slang, verbal tics, net speak, real-life phrasing']],
  rec:{kana:'Start with the first kana lesson, the あ row: five kana, five minutes','kana-rest':'Mark the kana you know as known on the chart, then take the rest lesson by lesson',grammar:'All kana are marked as known. Go to Grammar and start from the next level',native:'Kana and N5 grammar are marked as known. Look at Read words for the phrasing your games use beyond the tests'}}
};
const T=()=>TEXT[loc()]||TEXT.zh;
const SEALS=['零','仮','五','四','三','二','一','〇'],IDS=['none','kana','N5','N4','N3','N2','N1','N0'];
export const LEVEL_CHOICES=IDS.map((id,i)=>({id,get name(){return T().levels[i][0];},get sub(){return T().levels[i][1];},seal:SEALS[i]}));
const RECOMMEND=new Proxy({},{get:(_,k)=>T().rec[k]});
export const allKana=()=>{const h=[...SEION_LIST,...DAKU_LIST,...YOON_LIST];return [...h,...h.map(toKata)];};
export const levelName=id=>LEVEL_CHOICES.find(l=>l.id===id)?.name||'';
export function pickerHTML(current,esc){
 return `<div class="lv-dialog" role="dialog" aria-modal="true" aria-labelledby="lv-title"><header><p class="lv-kicker">${esc(T().kicker)}</p><h2 id="lv-title">${esc(T().title)}</h2>
<p class="lv-lead">${esc(T().lead)}</p></header>
<div class="lv-grid" role="radiogroup">${LEVEL_CHOICES.map((l,i)=>`<button type="button" role="radio" class="lv-opt${l.id===current?' active':''}" aria-checked="${l.id===current}" data-level-pick="${l.id}" style="--i:${i}"><span class="lv-seal" aria-hidden="true">${l.seal}</span><b>${esc(l.name)}</b><small>${esc(l.sub)}</small></button>`).join('')}</div>
<footer><p class="lv-note" data-lv-note></p><button type="button" class="secondary" data-lv-later>${esc(current?T().cancel:T().later)}</button><button type="button" class="primary" data-lv-ok disabled>${esc(T().ok)}</button></footer></div>`;
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
   const r=['none','kana'].includes(pick)?'':pick==='N5'?T().noteN5:T().noteUp;note.textContent=r;});
  back.querySelector('[data-lv-later]').onclick=()=>close(null);
  back.addEventListener('click',e=>{if(e.target===back)close(null);});
  ok.onclick=async()=>{ok.disabled=true;try{const r=await api('learning_level_set',{level:pick,kana:allKana()});toast?.(`${T().set(levelName(pick))} · ${RECOMMEND[r.recommend.reason]||''}`);close(r);}catch(error){ok.disabled=false;toast?.(String(error?.message||error));}};
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
