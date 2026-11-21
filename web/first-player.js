// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 首位玩家: the big card on the game page for the first player of an exe the engine layer already reads but nobody has
   calibrated (services/first-player.cjs decides). Three looks: first (play 3-8 minutes), off (sharing is switched off, one switch),
   thanks (the calibration went out). It asks once when the page opens (the service answers from its cache, a slow relay shows
   nothing) and then polls the cache, so the card turns into the thank-you by itself. */
const W={
 zh:{eyebrow:'传火计划',tags:['游戏闪退（也算）','打不开','卡住','日文没出来或点不了','翻译不显示或错位','内嵌用不了','选项没翻译','文字闪烁或重叠','其他任何问题'],hint:['遇到这些或其他任何问题，直接点上方「','反馈','」简单说说并上传，我们会手动修复，通常 12 小时到 1 周'],
  first:{title:'恭喜，你是第一位玩这个版本的玩家',body:'这个版本还没有人校准过。启动游戏后请耐心玩 3 到 8 分钟，让自动校准跑完，就算参与传火计划了。校准结果会共享给之后玩同一版本的人，他们打开就能直接用；你现在用到的适配，也是之前的玩家这样共享出来的。大家互相分享，每个人都省事',note:'约 3–8 分钟 · 自动校准 · 结果与之后的玩家共享'},
  off:{title:'打开共享适配，就能参与传火',body:'这个版本还没有人校准过，你是第一位。现在共享适配是关着的，校准结果只留在这台电脑上，之后的玩家用不上。打开后玩 3 到 8 分钟，让自动校准跑完，结果就会共享给之后玩同一版本的人',button:'打开共享适配',busy:'正在打开…',failed:'没打开成功，稍后再试'},
  thanks:{title:'感谢你的分享',body:'你的校准结果已上传，之后玩这个版本的玩家打开就能直接用',note:'已共享'}},
 en:{eyebrow:'Pass the flame',tags:['Game crashes (counts too)','Will not open','Freezes','Japanese missing or not clickable','Translation missing or misplaced','Embedding does not work','Choices not translated','Text flickers or overlaps','Anything else'],hint:['Any of these, or any other problem: just click ','Feedback',' at the top, describe it briefly and upload it; we fix it by hand, usually within 12 hours to a week'],
  first:{title:'Congratulations, you are the first to play this version',body:'Nobody has calibrated this version yet. After you start the game, please keep playing for 3 to 8 minutes so the automatic calibration can finish; that is all it takes to join. The result is shared with everyone who plays the same version later, and they can use it right away. The adaptations you use now were shared by earlier players in the same way: when everyone shares, everyone saves time',note:'About 3–8 minutes · automatic calibration · shared with later players'},
  off:{title:'Turn on shared adaptation to take part',body:'Nobody has calibrated this version yet, so you are the first. Shared adaptation is off, so the result stays on this PC and later players cannot use it. Turn it on, play for 3 to 8 minutes and let the automatic calibration finish, and the result is shared with everyone who plays this version later',button:'Turn on shared adaptation',busy:'Turning on…',failed:'Could not turn it on, try again later'},
  thanks:{title:'Thank you for sharing',body:'Your calibration has been uploaded. Players of this version can use it as soon as they open it',note:'Shared'}},
 ja:{eyebrow:'火を継ぐ計画',tags:['ゲームが落ちる（これも対象）','起動しない','固まる','日本語が出ない・押せない','翻訳が出ない・ずれる','埋め込みが使えない','選択肢が未翻訳','文字がちらつく・重なる','その他なんでも'],hint:['これらやその他の問題があれば、上の「','フィードバック','」から状況を簡単に書いて送ってください。手動で修正します（通常 12 時間〜1 週間）'],
  first:{title:'おめでとう、このバージョンを最初に遊ぶプレイヤーです',body:'このバージョンはまだ誰も校正していません。起動したら 3〜8 分ほど遊び続けて、自動校正を最後まで走らせてください。校正結果は同じバージョンを後から遊ぶ人に共有され、開くだけで使えます。いま使っている適応も、先に遊んだ人たちが共有してくれたものです。みんなで分け合えば、みんなが楽になります',note:'約 3〜8 分 · 自動校正 · 後のプレイヤーと共有'},
  off:{title:'共有適応をオンにすると参加できます',body:'このバージョンはまだ誰も校正していないので、あなたが最初です。いまは共有適応がオフで、結果はこの PC に残るだけ、後のプレイヤーには届きません。オンにして 3〜8 分遊び、自動校正を走らせれば、結果は同じバージョンを遊ぶ人に共有されます',button:'共有適応をオンにする',busy:'オンにしています…',failed:'オンにできませんでした。あとでもう一度'},
  thanks:{title:'共有ありがとうございます',body:'校正結果をアップロードしました。このバージョンを遊ぶ人は、開くだけで使えます',note:'共有済み'}}};
const POLL_MS=20000,POLL_MAX=90;
export function mountFirstPlayer({host,id,api,locale,esc,isCurrent=()=>true,placement='main'}){
 if(!host)return;const w=W[locale]||W.zh;let timer=0,shown='',polls=0;
 const box=document.createElement('section');box.className='first-player';box.hidden=true;box.setAttribute('aria-live','polite');host.after(box);
 const render=(state,{failed=false,busy=false}={})=>{if(state==='hidden'){box.hidden=true;box.innerHTML='';shown='';return;}const t=w[state],sig=state+(failed?'!':'')+(busy?'…':'');if(sig===shown)return;shown=sig;box.dataset.state=state;
  box.innerHTML=`<div class="first-player-copy"><div class="first-player-head"><span class="first-player-eyebrow">${esc(w.eyebrow)}</span><h2>${esc(t.title)}</h2></div><p>${esc(t.body)}</p>${state==='off'?`<div class="first-player-act"><button type="button" class="primary" data-fp-share ${busy?'disabled':''}>${esc(busy?t.busy:t.button)}</button>${failed?`<span class="first-player-fail">${esc(t.failed)}</span>`:''}</div>`:`<span class="first-player-note">${esc(t.note)}</span>`}<ul class="first-player-tags" aria-hidden="true">${w.tags.map((x,i)=>`<li${i===0?' class="is-key"':''}>${esc(x)}</li>`).join('')}</ul><p class="first-player-hint">${esc(w.hint[0])}<button type="button" class="first-player-link" data-fp-feedback>${esc(w.hint[1])}</button>${esc(w.hint[2])}</p></div>`;box.hidden=false;
  /* the same entry as the top bar's feedback button (app.js openFeedback): click it instead of building a second one */
  box.querySelector('[data-fp-feedback]').onclick=()=>document.querySelector('[data-top-feedback]')?.click();
  const b=box.querySelector('[data-fp-share]');if(b)b.onclick=async()=>{render('off',{busy:true});try{await api('first_player_share',{});await load(false);}catch{render('off',{failed:true});}};};
 async function load(first){let r;try{r=await api('first_player',{id,poll:!first});}catch{r=null;}if(!isCurrent()||!box.isConnected){clearTimeout(timer);return;}
  const state=r&&['first','off','thanks'].includes(r.state)?r.state:'hidden';render(state);
  clearTimeout(timer);if(state!=='thanks'&&polls++<POLL_MAX&&(state!=='hidden'||first))timer=setTimeout(()=>load(false),POLL_MS);}
 /* where the card sits (it survives tab swaps, so it is moved, not re-created): tabs = a slim strip under the tab bar (every tab),
    main = top of the overview's left column, aside = top of its right column; other tabs keep it under the tab bar */
 const place=(tab='overview')=>{const root=host.closest('.main')||document;const tabs=root.querySelector('.detail-tabs');let to=null;
  if(tab==='overview'&&placement==='main')to=root.querySelector('.detail-main');else if(tab==='overview'&&placement==='aside')to=root.querySelector('.detail-aside');
  if(to){if(box.parentNode!==to||to.firstChild!==box)to.prepend(box);}else if(tabs&&tabs.nextElementSibling!==box)tabs.after(box);box.dataset.place=to?placement:'tabs';};
 place('overview');load(true);return {place};
}
