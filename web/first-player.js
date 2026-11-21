// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 首位玩家: the big card on the game page for the first player of an exe the engine layer already reads but nobody has
   calibrated (services/first-player.cjs decides). Three looks: first (play 3-8 minutes), off (sharing is switched off, one switch),
   thanks (the calibration went out). It asks once when the page opens (the service answers from its cache, a slow relay shows
   nothing) and then polls the cache, so the card turns into the thank-you by itself. */
const W={
 zh:{eyebrow:'传火计划',glyph:'火',
  first:{title:'恭喜，你是第一位玩这个版本的玩家',body:'这个版本还没有人校准过，第一簇火要由你来点。启动游戏后请耐心玩 3 到 8 分钟，让自动校准跑完，就算加入传火计划了。你的校准结果会共享给之后玩同一版本的人，他们打开就能直接用；你平时用到的适配，也是前面的玩家这样一份份传下来的。互相传火，大家才走得远',note:'约 3–8 分钟 · 自动校准 · 结果与之后的玩家共享'},
  off:{title:'打开共享适配，就能参与传火',body:'这个版本还没有人校准过，你会是第一位。现在共享适配关着，校准结果只留在这台电脑上，之后的玩家用不上。打开它，玩 3 到 8 分钟让自动校准跑完，结果就会共享给之后玩同一版本的人；你用到的适配，也是别的玩家这样共享来的',button:'打开共享适配',busy:'正在打开…',failed:'没打开成功，稍后再试'},
  thanks:{title:'火已经传出去了',body:'你的校准结果已经上传。之后玩这个版本的人，打开就能直接用上，这是你点的火。谢谢你，传火人',note:'已共享 · 之后的玩家会直接拿到'}},
 en:{eyebrow:'Pass the flame',glyph:'火',
  first:{title:'Congratulations, you are the first to play this version',body:'Nobody has calibrated this version yet, so the first spark is yours. After you start the game, please keep playing for 3 to 8 minutes so the automatic calibration can finish; that is all it takes to join the Pass the flame project. Your result is shared with everyone who plays the same version later, and they can use it right away. The adaptations you rely on were passed to you by earlier players in just the same way: we get further by sharing',note:'About 3–8 minutes · automatic calibration · shared with later players'},
  off:{title:'Turn on shared adaptation to pass the flame',body:'Nobody has calibrated this version yet, so you would be the first. Shared adaptation is off, which keeps the result on this PC and no later player can use it. Turn it on, play for 3 to 8 minutes to let the automatic calibration finish, and the result is shared with everyone who plays this version later, just as other players shared theirs with you',button:'Turn on shared adaptation',busy:'Turning on…',failed:'Could not turn it on, try again later'},
  thanks:{title:'The flame has been passed on',body:'Your calibration has been uploaded. Whoever plays this version next can use it as soon as they open it: you lit that fire. Thank you, flame bearer',note:'Shared · later players get it right away'}},
 ja:{eyebrow:'火を継ぐ計画',glyph:'火',
  first:{title:'おめでとう、このバージョンを最初に遊ぶプレイヤーです',body:'このバージョンはまだ誰も校正していません。最初の火はあなたの手で。起動したら 3〜8 分ほど遊び続けて、自動校正を最後まで走らせてください。それで「火を継ぐ計画」に参加したことになります。校正結果は同じバージョンを後から遊ぶ人に共有され、開くだけで使えます。あなたが使っている適応も、先に遊んだ人たちがこうして届けてくれたものです。分け合ってこそ遠くまで行けます',note:'約 3〜8 分 · 自動校正 · 後のプレイヤーと共有'},
  off:{title:'共有適応をオンにすると火を継げます',body:'このバージョンはまだ誰も校正していないので、あなたが最初になります。いまは共有適応がオフで、結果はこの PC に残るだけ、後のプレイヤーには届きません。オンにして 3〜8 分遊び、自動校正を走らせれば、結果は同じバージョンを遊ぶ人に共有されます',button:'共有適応をオンにする',busy:'オンにしています…',failed:'オンにできませんでした。あとでもう一度'},
  thanks:{title:'火は無事に継がれました',body:'校正結果をアップロードしました。このバージョンを次に遊ぶ人は、開くだけで使えます。あなたが灯した火です。ありがとう、火を継ぐ人',note:'共有済み · 後のプレイヤーはすぐ使えます'}}};
const POLL_MS=20000,POLL_MAX=90;
export function mountFirstPlayer({host,id,api,locale,esc,isCurrent=()=>true}){
 if(!host)return;const w=W[locale]||W.zh;let timer=0,shown='',polls=0;
 const box=document.createElement('section');box.className='first-player';box.hidden=true;box.setAttribute('aria-live','polite');host.after(box);
 const render=(state,{failed=false,busy=false}={})=>{if(state==='hidden'){box.hidden=true;box.innerHTML='';shown='';return;}const t=w[state],sig=state+(failed?'!':'')+(busy?'…':'');if(sig===shown)return;shown=sig;box.dataset.state=state;
  box.innerHTML=`<i class="first-player-glyph" aria-hidden="true">${esc(w.glyph)}</i><div class="first-player-copy"><span class="first-player-eyebrow">${esc(w.eyebrow)}</span><h2>${esc(t.title)}</h2><p>${esc(t.body)}</p>${state==='off'?`<div class="first-player-act"><button type="button" class="primary" data-fp-share ${busy?'disabled':''}>${esc(busy?t.busy:t.button)}</button>${failed?`<span class="first-player-fail">${esc(t.failed)}</span>`:''}</div>`:`<span class="first-player-note">${esc(t.note)}</span>`}</div>`;box.hidden=false;
  const b=box.querySelector('[data-fp-share]');if(b)b.onclick=async()=>{render('off',{busy:true});try{await api('first_player_share',{});await load(false);}catch{render('off',{failed:true});}};};
 async function load(first){let r;try{r=await api('first_player',{id,poll:!first});}catch{r=null;}if(!isCurrent()||!box.isConnected){clearTimeout(timer);return;}
  const state=r&&['first','off','thanks'].includes(r.state)?r.state:'hidden';render(state);
  clearTimeout(timer);if(state!=='thanks'&&polls++<POLL_MAX&&(state!=='hidden'||first))timer=setTimeout(()=>load(false),POLL_MS);}
 load(true);
}
