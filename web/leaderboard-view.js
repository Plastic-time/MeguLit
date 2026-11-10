// SPDX-License-Identifier: GPL-3.0-or-later
/* E377 排行榜 page (top tab between 学习 and 工具). Data: bridge leaderboard_view / leaderboard_join / leaderboard_leave
   (services/leaderboard.cjs). Opt-in only; with no relay configured the page shows a "not ready yet" notice and the
   numbers computed on this PC.
   E379: avatars (moderated on the relay; default = initial on a preset colour) with a report button, and a second
   view 每周热词: 词汇 / 短语 / 短句, podium for 1–3, cards with the AI guess for 4–10, a plain list for 11–50. */
export const leaderboardLabel={zh:'排行榜',ja:'ランキング',en:'Leaderboard'};
const W={
 zh:{title:'排行榜',week:'本周',month:'本月',all:'全部',characters:'阅读字数',seconds:'阅读时长',words:'收录单词',streak:'连续天数',games:'按游戏',
  notReady:'联网服务还在准备中',notReadyText:'排行榜上线后会显示在这里。下面是只在本机计算的个人数据，不会上传',
  mine:'我的数据',currentStreak:'当前连续',days:'天',unitChars:'字',unitWords:'个',hours:'小时',minutes:'分钟',
  joinTitle:'参加排行榜',joinText:'参加后只会上传阅读字数、时长、收录单词数、连续天数的汇总，以及本周查词的词条和次数（不含原句和游戏进度），用本机随机生成的匿名 ID，不需要账号，也不读取硬件信息。登录了 MeguLit 账号时，几台电脑会合并成一行。随时可以在 设置 › 联网服务 关闭，关闭时会删除服务器上的记录',
  nickname:'昵称',nicknameHint:'2–16 个字',shareGames:'同时公开我读过的游戏（用于“按游戏”排行）',consent:'我同意上传上述汇总数据',join:'参加',
  joinedAs:'以 {name} 参加',leave:'退出排行榜',leaveConfirm:'再点一次确认退出（会删除服务器上的记录）',left:'已退出排行榜',
  me:'我的排名',rank:'第 {n} 名',empty:'还没有人上榜',offline:'暂时连不上联网服务',retry:'重试',readers:'{n} 人在读',top:'榜首',back:'返回游戏列表',
  report:'举报头像',reported:'已举报，谢谢',reportHidden:'已举报，这个头像已隐藏',
  board:'阅读榜',hot:'每周热词',word:'词汇',phrase:'短语',sentence:'短句',weekOf:'{week} 周',pastWeeks:'往期',
  hotPending:'本周热词会在周一 00:00（北京时间）揭晓',hotEmpty:'这一周还没有达到上榜门槛的词',hotRule:'至少 3 位读者查过才会上榜，只统计参加排行榜的读者',
  lookedUp:'{users} 人查过 · {n} 次',times:'{n} 次',aiGuess:'AI 推测',participants:'{n} 位读者参与',
  NAME_REQUIRED:'请填写昵称',NAME_LENGTH:'昵称需要 2–16 个字',NAME_INVALID:'昵称不能包含网址、引号或特殊字符',NAME_BLOCKED:'这个昵称不能使用，换一个吧',CONSENT_REQUIRED:'请先勾选同意'},
 ja:{title:'ランキング',week:'今週',month:'今月',all:'全期間',characters:'読んだ文字数',seconds:'読書時間',words:'登録単語',streak:'連続日数',games:'ゲーム別',
  notReady:'オンラインサービスは準備中です',notReadyText:'公開後、ランキングはここに表示されます。下はこの PC だけで計算した個人の記録で、送信されません',
  mine:'自分の記録',currentStreak:'現在の連続',days:'日',unitChars:'字',unitWords:'語',hours:'時間',minutes:'分',
  joinTitle:'ランキングに参加',joinText:'参加すると、読んだ文字数・時間・登録単語数・連続日数の合計と、今週調べた語とその回数（原文やゲームの進行状況は含みません）だけを、この PC で作った匿名のランダム ID で送ります。アカウントは不要で、ハードウェア情報も読みません。MeguLit アカウントにログインしていると、複数の PC が 1 行にまとまります。設定 › オンラインサービス でいつでもオフにでき、そのときサーバーの記録も削除します',
  nickname:'ニックネーム',nicknameHint:'2〜16 文字',shareGames:'読んだゲームも公開する（ゲーム別ランキング用）',consent:'上記の合計データの送信に同意します',join:'参加する',
  joinedAs:'{name} として参加中',leave:'ランキングから退出',leaveConfirm:'もう一度押すと退出します（サーバーの記録を削除）',left:'ランキングから退出しました',
  me:'自分の順位',rank:'{n} 位',empty:'まだ誰も載っていません',offline:'オンラインサービスに接続できません',retry:'再試行',readers:'{n} 人が読書中',top:'1 位',back:'ゲーム一覧に戻る',
  report:'アイコンを通報',reported:'通報しました',reportHidden:'通報しました。このアイコンは非表示になりました',
  board:'読書ランキング',hot:'今週の注目語',word:'単語',phrase:'フレーズ',sentence:'短文',weekOf:'{week} 週',pastWeeks:'過去の週',
  hotPending:'今週の注目語は月曜 0:00（UTC+8）に発表されます',hotEmpty:'この週は掲載基準に達した語がありません',hotRule:'3 人以上が調べた語だけを掲載します。ランキング参加者のみ集計',
  lookedUp:'{users} 人が {n} 回調べました',times:'{n} 回',aiGuess:'AI の推測',participants:'{n} 人が参加',
  NAME_REQUIRED:'ニックネームを入力してください',NAME_LENGTH:'ニックネームは 2〜16 文字です',NAME_INVALID:'URL・引用符・特殊文字は使えません',NAME_BLOCKED:'このニックネームは使えません',CONSENT_REQUIRED:'同意にチェックしてください'},
 en:{title:'Leaderboard',week:'This week',month:'This month',all:'All time',characters:'Characters read',seconds:'Reading time',words:'Words saved',streak:'Streak days',games:'By game',
  notReady:'Online services are still being set up',notReadyText:'The leaderboard will appear here once it is live. Below are your own numbers, computed on this PC and not uploaded',
  mine:'My numbers',currentStreak:'Current streak',days:'days',unitChars:'chars',unitWords:'words',hours:'h',minutes:'min',
  joinTitle:'Join the leaderboard',joinText:'Only totals are uploaded: characters read, reading time, words saved, streak days, and this week\'s looked-up words with their counts (no sentences, no game progress), under a random anonymous id made on this PC. No account, no hardware ids. When you are signed in to a MeguLit account, your PCs share one row. Turn it off any time in Settings › Online services, which also deletes your entry on the server',
  nickname:'Nickname',nicknameHint:'2–16 characters',shareGames:'Also show the games I read (for the per-game boards)',consent:'I agree to upload these totals',join:'Join',
  joinedAs:'Joined as {name}',leave:'Leave the leaderboard',leaveConfirm:'Click again to leave (deletes your entry on the server)',left:'You left the leaderboard',
  me:'My rank',rank:'#{n}',empty:'Nobody here yet',offline:'Cannot reach the online service right now',retry:'Retry',readers:'{n} readers',top:'Top',back:'Back to games',
  report:'Report picture',reported:'Reported, thank you',reportHidden:'Reported; this picture is now hidden',
  board:'Reading',hot:'Weekly hot words',word:'Words',phrase:'Phrases',sentence:'Sentences',weekOf:'Week {week}',pastWeeks:'Past weeks',
  hotPending:'This week\'s hot words are announced Monday 00:00 (UTC+8)',hotEmpty:'No term reached the threshold this week',hotRule:'A term needs at least 3 different readers; only people who joined the leaderboard count',
  lookedUp:'{users} readers · {n} lookups',times:'{n}×',aiGuess:'AI guess',participants:'{n} readers took part',
  NAME_REQUIRED:'Enter a nickname',NAME_LENGTH:'Nicknames are 2–16 characters',NAME_INVALID:'No links, quotes or special characters',NAME_BLOCKED:'That nickname is not allowed',CONSENT_REQUIRED:'Please tick the agreement first'}
};
const PERIODS=['week','month','all'],METRICS=['characters','seconds','words','streak','games'],CATS=['word','phrase','sentence'];
let view={tab:'board',period:'week',metric:'characters',game:'',category:'word',week:''};
export function leaderboardWords(locale){return W[locale]||W.zh;}
function fill(template,values){return template.replace(/\{(\w+)\}/g,(_,k)=>values[k]??'');}
const nf=locale=>new Intl.NumberFormat(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US');
export function formatValue(metric,value,locale){
 const w=leaderboardWords(locale),n=nf(locale).format(value||0);
 if(metric==='seconds'){const min=Math.floor((value||0)/60);return min>=60?`${Math.floor(min/60)} ${w.hours} ${min%60} ${w.minutes}`:`${min} ${w.minutes}`;}
 if(metric==='words')return `${n} ${w.unitWords}`;if(metric==='streak')return `${n} ${w.days}`;return `${n} ${w.unitChars}`;
}
/* Default avatar: the first character of the name on one of six preset colours picked by the name. */
const PRESETS=['#ad1539','#b8862e','#3f7d6e','#4867a8','#7a4ea3','#a65a3a'];
export function defaultAvatar(name){const text=String(name||'?');let h=0;for(const ch of text)h=(h*31+ch.codePointAt(0))>>>0;return {initial:[...text.trim()][0]||'?',color:PRESETS[h%PRESETS.length]};}
export function avatarHTML(entry,images,esc){
 const src=entry?.avatar&&images?.[entry.avatar];
 if(src&&/^data:image\/webp;base64,/.test(src))return `<img class="leaderboard-avatar" src="${esc(src)}" alt="" width="36" height="36" loading="lazy" decoding="async">`;
 const d=defaultAvatar(entry?.name);return `<span class="leaderboard-avatar is-default" style="--avatar-color:${d.color}" aria-hidden="true">${esc(d.initial)}</span>`;
}
function switches(name,items,current,w){return `<div class="statistics-ranges leaderboard-switch" role="group" data-lb-group="${name}">${items.map(item=>`<button type="button" data-lb-${name}="${item}" aria-pressed="${item===current}">${w[item]}</button>`).join('')}</div>`;}
function localHTML(data,w,locale,esc){
 const stats=data.local?.stats?.[view.period]||{};
 return `<section class="panel leaderboard-mine"><div class="section-header"><h2 class="panel-title">${w.mine} · ${w[view.period]}</h2></div><div class="leaderboard-tiles">${['characters','seconds','words','streak'].map(m=>`<div class="leaderboard-tile"><small>${w[m]}</small><strong>${esc(formatValue(m,stats[m],locale))}</strong></div>`).join('')}<div class="leaderboard-tile"><small>${w.currentStreak}</small><strong>${esc(formatValue('streak',data.local?.currentStreak,locale))}</strong></div></div></section>`;
}
const flag='<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14"><path d="M6 21V4m0 0h10l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
function rows(entries,metric,w,locale,esc,images){
 if(!entries.length)return `<p class="statistics-empty">${w.empty}</p>`;
 return `<ol class="leaderboard-list">${entries.map(e=>`<li class="${e.me?'is-me':''}"><span class="leaderboard-rank">${e.rank}</span>${avatarHTML(e,images,esc)}<span class="leaderboard-name">${esc(e.name)}</span>${e.avatar&&!e.me?`<button type="button" class="leaderboard-report" data-lb-report="${esc(e.avatar)}" title="${w.report}" aria-label="${w.report}">${flag}</button>`:''}<strong>${esc(formatValue(metric,e.value,locale))}</strong></li>`).join('')}</ol>`;
}
export function boardHTML(data,w,locale,esc){
 const board=data.board||{},images=data.avatars||{};
 if(board.state==='error')return `<div class="leaderboard-offline"><p>${w.offline}</p><button type="button" class="primary" data-lb-retry>${w.retry}</button></div>`;
 if(view.metric==='games'&&!view.game){const games=board.games||[];if(!games.length)return `<p class="statistics-empty">${w.empty}</p>`;
  return `<ol class="leaderboard-list leaderboard-games">${games.map(g=>`<li><button type="button" data-lb-game="${esc(g.title)}"><span class="leaderboard-name">${esc(g.title)}</span><small>${esc(fill(w.readers,{n:g.readers}))}${g.top?` · ${w.top} ${esc(g.top.name)}`:''}</small></button></li>`).join('')}</ol>`;}
 const metric=view.metric==='games'?'characters':view.metric;
 const me=board.me?`<p class="leaderboard-me">${w.me}：<strong>${esc(fill(w.rank,{n:board.me.rank}))}</strong> · ${esc(formatValue(metric,board.me.value,locale))}</p>`:'';
 return (view.game?`<button type="button" class="leaderboard-back" data-lb-back>‹ ${w.back}</button><h3 class="leaderboard-game-title">${esc(view.game)}</h3>`:'')+me+rows(board.entries||[],metric,w,locale,esc,images);
}
/* ---- 每周热词 ------------------------------------------------------------------------------------------------- */
/* Pure split used by the page and the tests: podium 1–3, cards 4–10, list 11–50. */
export function splitAwards(awards){const sorted=[...(awards||[])].sort((a,b)=>a.rank-b.rank);return {podium:sorted.filter(a=>a.rank<=3),cards:sorted.filter(a=>a.rank>=4&&a.rank<=10),list:sorted.filter(a=>a.rank>=11&&a.rank<=50)};}
const MEDAL={1:'gold',2:'silver',3:'bronze'};
export function hotHTML(hot,w,locale,esc){
 if(!hot||hot.state==='error')return `<div class="leaderboard-offline"><p>${w.offline}</p><button type="button" class="primary" data-lb-retry>${w.retry}</button></div>`;
 const n=v=>nf(locale).format(v||0);
 const weeks=hot.weeks||[];
 const picker=weeks.length>1?`<label class="leaderboard-weeks"><span>${w.pastWeeks}</span><select data-lb-week>${weeks.map(k=>`<option value="${esc(k)}" ${k===hot.week?'selected':''}>${esc(fill(w.weekOf,{week:k}))}</option>`).join('')}</select></label>`:'';
 const head=`<div class="leaderboard-hot-head">${switches('category',CATS,view.category,w)}${picker}</div>`;
 if(!hot.settled||!hot.awards?.length)return head+`<p class="statistics-empty">${hot.settled?w.hotEmpty:w.hotPending}</p><p class="leaderboard-note">${w.hotRule}</p>`;
 const {podium,cards,list}=splitAwards(hot.awards);
 /* visual order 2 · 1 · 3, the champion in the middle and highest */
 const order=[2,1,3].map(r=>podium.find(a=>a.rank===r)).filter(Boolean);
 const ai=a=>a.reason?`<p class="leaderboard-reason">${a.ai?`<span class="leaderboard-ai">${w.aiGuess}</span>`:''}${esc(a.reason)}</p>`:'';
 return head+`<p class="leaderboard-note">${esc(fill(w.weekOf,{week:hot.week}))} · ${esc(fill(w.participants,{n:n(hot.participants)}))} · ${w.hotRule}</p>
  <div class="leaderboard-podium" role="list">${order.map(a=>`<div class="podium-place medal-${MEDAL[a.rank]}" role="listitem" data-rank="${a.rank}" style="--delay:${({1:2,2:1,3:0})[a.rank]*140}ms"><div class="podium-term" lang="ja">${esc(a.term)}</div><small>${esc(fill(w.lookedUp,{users:n(a.users),n:n(a.lookups)}))}</small>${ai(a)}<div class="podium-step"><span>${a.rank}</span></div></div>`).join('')}</div>
  ${cards.length?`<ol class="leaderboard-cards">${cards.map(a=>`<li class="leaderboard-card"><span class="leaderboard-rank">${a.rank}</span><div><strong lang="ja">${esc(a.term)}</strong><small>${esc(fill(w.lookedUp,{users:n(a.users),n:n(a.lookups)}))}</small>${ai(a)}</div></li>`).join('')}</ol>`:''}
  ${list.length?`<ol class="leaderboard-list leaderboard-hot-list">${list.map(a=>`<li><span class="leaderboard-rank">${a.rank}</span><span class="leaderboard-name" lang="ja">${esc(a.term)}</span><strong>${esc(fill(w.times,{n:n(a.lookups)}))}</strong></li>`).join('')}</ol>`:''}`;
}
function joinHTML(data,w,esc){
 return `<section class="panel leaderboard-join"><h2 class="panel-title">${w.joinTitle}</h2><p class="leaderboard-note">${w.joinText}</p>
  <label class="leaderboard-field"><span>${w.nickname}</span><input type="text" maxlength="16" data-lb-name value="${esc(data.name||'')}" placeholder="${w.nicknameHint}" autocomplete="off" spellcheck="false"></label>
  <label class="leaderboard-check"><input type="checkbox" class="switch" data-lb-share ${data.shareGames?'checked':''}><span>${w.shareGames}</span></label>
  <label class="leaderboard-check"><input type="checkbox" class="switch" data-lb-consent><span>${w.consent}</span></label>
  <p class="leaderboard-error" data-lb-error hidden></p><button type="button" class="primary" data-lb-join>${w.join}</button></section>`;
}
export function leaderboardHTML(data,locale,esc){
 const w=leaderboardWords(locale);
 const head=`<div class="page-header"><h1>${w.title}</h1><div class="page-tools"></div></div>`;
 if(!data)return head;
 if(!data.configured)return head+`<div class="leaderboard-page">${switches('period',PERIODS,view.period,w)}<section class="panel leaderboard-notice"><h2 class="panel-title">${w.notReady}</h2><p class="leaderboard-note">${w.notReadyText}</p></section>${localHTML(data,w,locale,esc)}</div>`;
 const tab=data.tab==='hot'?'hot':'board',tabs=switches('tab',['board','hot'],tab,w);
 if(tab==='hot')return head+`<div class="leaderboard-page">${tabs}<section class="panel leaderboard-hot"><h2 class="panel-title">${w.hot} · ${w[view.category]}</h2>${hotHTML(data.hot,w,locale,esc)}</section></div>`;
 const top=tabs+switches('period',PERIODS,view.period,w)+switches('metric',METRICS,view.metric,w);
 const body=data.joined?`<section class="panel leaderboard-board"><div class="section-header"><h2 class="panel-title">${w[view.metric]} · ${view.metric==='games'?w.all:w[view.period]}</h2><small>${esc(fill(w.joinedAs,{name:data.name}))} · <button type="button" class="leaderboard-leave" data-lb-leave>${w.leave}</button></small></div>${boardHTML(data,w,locale,esc)}</section>`:joinHTML(data,w,esc);
 return head+`<div class="leaderboard-page">${top}${body}${localHTML(data,w,locale,esc)}</div>`;
}
/* Mounts the page into main; isCurrent() guards against a late reply after the user moved on. */
export async function mountLeaderboard(main,{api,locale,esc,toast,isCurrent=()=>true}){
 const w=leaderboardWords(locale);
 const render=async(action='leaderboard_view',extra={})=>{
  let data;try{data=await api(action,{tab:view.tab,period:view.period,metric:view.metric,game:view.game,category:view.category,week:view.week,...extra});}
  catch(error){const code=String(error?.message||error).replace(/^LEADERBOARD_/,'');const box=main.querySelector('[data-lb-error]');if(box&&w[code]){box.textContent=w[code];box.hidden=false;return;}toast(w.offline);return;}
  if(!isCurrent())return;main.innerHTML=leaderboardHTML(data,locale,esc);bind();
 };
 const bind=()=>{
  main.querySelectorAll('[data-lb-tab]').forEach(b=>b.onclick=()=>{view.tab=b.dataset.lbTab;render();});
  main.querySelectorAll('[data-lb-period]').forEach(b=>b.onclick=()=>{view.period=b.dataset.lbPeriod;render();});
  main.querySelectorAll('[data-lb-metric]').forEach(b=>b.onclick=()=>{view.metric=b.dataset.lbMetric;view.game='';render();});
  main.querySelectorAll('[data-lb-category]').forEach(b=>b.onclick=()=>{view.category=b.dataset.lbCategory;render();});
  main.querySelector('[data-lb-week]')?.addEventListener('change',event=>{view.week=event.currentTarget.value;render();});
  main.querySelectorAll('[data-lb-game]').forEach(b=>b.onclick=()=>{view.game=b.dataset.lbGame;render();});
  main.querySelectorAll('[data-lb-report]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('leaderboard_report',{avatar:b.dataset.lbReport});toast(r?.hidden?w.reportHidden:w.reported);}catch{toast(w.offline);b.disabled=false;}});
  main.querySelector('[data-lb-back]')?.addEventListener('click',()=>{view.game='';render();});
  main.querySelector('[data-lb-retry]')?.addEventListener('click',()=>render());
  main.querySelector('[data-lb-join]')?.addEventListener('click',()=>{const box=main.querySelector('[data-lb-error]');box.hidden=true;
   if(!main.querySelector('[data-lb-consent]').checked){box.textContent=w.CONSENT_REQUIRED;box.hidden=false;return;}
   render('leaderboard_join',{name:main.querySelector('[data-lb-name]').value,shareGames:main.querySelector('[data-lb-share]').checked,consent:true});});
  main.querySelector('[data-lb-leave]')?.addEventListener('click',async event=>{const b=event.currentTarget;if(!b.dataset.armed){b.dataset.armed='1';b.textContent=w.leaveConfirm;setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent=w.leave;}},4000);return;}try{await api('leaderboard_leave');toast(w.left);}catch{toast(w.offline);}render();});
 };
 main.innerHTML=leaderboardHTML(null,locale,esc)+'<div class="loading-screen"><span class="spinner"></span></div>';
 await render();
}
