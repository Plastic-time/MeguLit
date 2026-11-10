// SPDX-License-Identifier: GPL-3.0-or-later
/* E397 the social side of the 排行榜 page: click any reader (podium, rows, per-game rows) to open their card; the
   关注 tab lists who you follow and what they read lately, with 同好 (readers whose favourites or shared games overlap
   yours) underneath. A card can be reported: pick a kind, a reason is optional; the profile is hidden at once until
   the maintainer reviews it. Data: bridge leaderboard_card / leaderboard_follow / leaderboard_report_profile and
   leaderboard_view {tab:'follow'} (services/leaderboard.cjs → relay/src/social.js). */
const T={
 zh:{follow:'关注',following:'已关注',unfollow:'取消关注',followers:'{n} 人关注',kindred:'同好',kindredHint:'最喜欢的游戏或最近在玩和你重合的公开读者',
  followingTitle:'我关注的人',followingEmpty:'还没有关注任何人。点排行榜上的头像或名字打开主页，就能关注',kindredEmpty:'暂时没找到同好。在 个人主页 填上最喜欢的游戏、打开“公开我读过的游戏”，会更容易找到',
  loginFirst:'登录并参加排行榜后，可以关注别人、找同好',toProfile:'去个人主页',privateCard:'这位读者没有公开主页',privateMine:'你的主页还没有公开',privateFollowed:'对方已不再公开主页',
  bio:'签名',favorites:'最喜欢的游戏',recent:'最近在玩',nothingRecent:'没有公开最近在玩',both:'都在读：{titles}',you:'这是你',editProfile:'编辑个人主页',close:'关闭',back:'返回',
  report:'举报',reportTitle:'举报这个主页',reportHint:'提交后这个主页会先暂时隐藏，由开发者人工审核。理由可以不填',reportKind:'举报类型',reportReason:'举报理由（可不填）',reportSend:'提交举报',reportSent:'已举报，主页已暂时隐藏，等待人工审核',reportPick:'请先选择举报类型',
  kinds:{discrimination:'歧视',nudity:'裸露或色情',racism:'种族歧视',harassment:'骚扰辱骂',spam:'广告或刷屏',other:'其他'},
  offline:'暂时连不上联网服务',loginToFollow:'登录后才能关注',now:'刚刚',hoursAgo:'{n} 小时前',daysAgo:'{n} 天前'},
 ja:{follow:'フォロー',following:'フォロー中',unfollow:'フォロー解除',followers:'フォロワー {n} 人',kindred:'同好',kindredHint:'好きなゲームや最近読んでいるゲームがあなたと重なる公開ユーザー',
  followingTitle:'フォロー中の人',followingEmpty:'まだ誰もフォローしていません。ランキングのアイコンか名前からプロフィールを開いてフォローできます',kindredEmpty:'まだ同好が見つかりません。プロフィールに好きなゲームを入れ、「読んだゲームを公開」をオンにすると見つかりやすくなります',
  loginFirst:'ログインしてランキングに参加すると、フォローや同好探しができます',toProfile:'プロフィールへ',privateCard:'この読者はプロフィールを公開していません',privateMine:'あなたのプロフィールはまだ非公開です',privateFollowed:'相手はプロフィールを非公開にしました',
  bio:'ひとこと',favorites:'好きなゲーム',recent:'最近読んでいる',nothingRecent:'最近読んでいるゲームは非公開です',both:'共通：{titles}',you:'あなたです',editProfile:'プロフィールを編集',close:'閉じる',back:'戻る',
  report:'通報',reportTitle:'このプロフィールを通報',reportHint:'送信するとこのプロフィールは一時的に非表示になり、開発者が確認します。理由は空欄でもかまいません',reportKind:'種類',reportReason:'理由（任意）',reportSend:'通報する',reportSent:'通報しました。プロフィールは確認まで非表示です',reportPick:'種類を選んでください',
  kinds:{discrimination:'差別',nudity:'露出・性的な内容',racism:'人種差別',harassment:'嫌がらせ・暴言',spam:'宣伝・スパム',other:'その他'},
  offline:'オンラインサービスに接続できません',loginToFollow:'フォローするにはログインしてください',now:'たった今',hoursAgo:'{n} 時間前',daysAgo:'{n} 日前'},
 en:{follow:'Follow',following:'Following',unfollow:'Unfollow',followers:'{n} followers',kindred:'Kindred readers',kindredHint:'Public readers whose favourite or recent games overlap yours',
  followingTitle:'People you follow',followingEmpty:'You are not following anyone yet. Click a picture or name on the leaderboard to open a profile and follow',kindredEmpty:'No kindred readers yet. Add favourite games in your Profile and share the games you read to find more',
  loginFirst:'Sign in and join the leaderboard to follow readers and find kindred ones',toProfile:'Open Profile',privateCard:'This reader\'s profile is not public',privateMine:'Your profile is not public yet',privateFollowed:'No longer public',
  bio:'Signature',favorites:'Favourite games',recent:'Reading lately',nothingRecent:'Recent games are not shared',both:'Both reading: {titles}',you:'This is you',editProfile:'Edit profile',close:'Close',back:'Back',
  report:'Report',reportTitle:'Report this profile',reportHint:'The profile is hidden right away and reviewed by the developer. A reason is optional',reportKind:'Kind',reportReason:'Reason (optional)',reportSend:'Send report',reportSent:'Reported; the profile is hidden until it is reviewed',reportPick:'Pick a kind first',
  kinds:{discrimination:'Discrimination',nudity:'Nudity or sexual content',racism:'Racism',harassment:'Harassment or abuse',spam:'Ads or spam',other:'Other'},
  offline:'Cannot reach the online service right now',loginToFollow:'Sign in to follow',now:'just now',hoursAgo:'{n} h ago',daysAgo:'{n} days ago'}
};
export const socialWords=locale=>T[locale]||T.zh;
export const tabLabel={zh:'关注',ja:'フォロー',en:'Following'};
const fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>String(v[k]??''));
export function ago(seconds,locale,now=Date.now()){
 const w=socialWords(locale);if(!seconds)return '';const h=Math.floor((now/1000-seconds)/3600);
 if(h<1)return w.now;if(h<24)return fill(w.hoursAgo,{n:h});const d=Math.floor(h/24);
 if(d<=30)return fill(w.daysAgo,{n:d});return new Date(seconds*1000).toLocaleDateString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US');
}
/* wraps a reader's picture and name so a click opens their card; works for every row, public or not */
export function personButton(e,inner,esc){return `<button type="button" class="lb-person" data-lb-person data-pid="${esc(e.pid||'')}" data-name="${esc(e.name||'')}" data-avatar="${esc(e.avatar||'')}" data-me="${e.me?'1':''}">${inner}</button>`;}
const recentLine=(list,w,locale,esc)=>list.length?list.map(g=>`<span>${esc(g.title)}${g.last?` <small>· ${esc(ago(g.last,locale))}</small>`:''}</span>`).join(''):`<span class="is-muted">${w.nothingRecent}</span>`;
/* the 关注 tab body */
export function socialHTML(state,locale,esc,avatarHTML){
 const w=socialWords(locale);
 if(!state||state.state==='login')return `<section class="lb-card lb-social-empty"><p>${w.loginFirst}</p><button type="button" class="primary" data-lb-profile>${w.toProfile}</button></section>`;
 if(state.state!=='ok')return `<section class="lb-card"><p class="lb-note">${w.offline}</p><button type="button" class="primary" data-lb-retry>↻</button></section>`;
 const img=state.avatars||{},who=p=>personButton(p,`${avatarHTML(p,img,esc)}<span class="leaderboard-name">${esc(p.name)}</span>`,esc);
 const following=state.following.length?`<ul class="lb-people">${state.following.map(p=>`<li>${who(p)}<div class="lb-people-recent">${p.public?recentLine(p.recent,w,locale,esc):`<span class="is-muted">${w.privateFollowed}</span>`}</div>${p.pid?`<button type="button" class="leaderboard-leave" data-lb-follow="${esc(p.pid)}" data-on="">${w.unfollow}</button>`:''}</li>`).join('')}</ul>`:`<p class="lb-note lb-empty">${w.followingEmpty}</p>`;
 const kindred=state.kindred.length?`<ul class="lb-people">${state.kindred.map(p=>`<li>${who(p)}<div class="lb-people-recent"><span>${esc(fill(w.both,{titles:p.shared.join(locale==='en'?', ':'、')}))}</span></div>${p.following?`<span class="lb-chip">${w.following}</span>`:`<button type="button" class="lb-follow-button" data-lb-follow="${esc(p.pid)}" data-on="1">${w.follow}</button>`}</li>`).join('')}</ul>`:`<p class="lb-note lb-empty">${w.kindredEmpty}</p>`;
 return `<section class="lb-card"><h2 class="lb-h2">${w.followingTitle} <span>· ${state.following.length}</span></h2>${following}</section><section class="lb-card"><h2 class="lb-h2">${w.kindred}</h2><p class="lb-note">${w.kindredHint}</p>${kindred}</section>`;
}
let openDialog=null;
/* opens a reader's card; person = {pid,name,avatar,me} from the clicked row, images = data URLs already on the page */
export async function openProfileCard(person,{api,locale,esc,toast,images={},avatarHTML,openSettings=()=>{},onChange=()=>{}}){
 openDialog?.close();const w=socialWords(locale);
 const dialog=document.createElement('dialog');dialog.className='lb-profile-card';dialog.setAttribute('aria-label',person.name||'');document.body.append(dialog);openDialog=dialog;
 dialog.addEventListener('close',()=>{dialog.remove();if(openDialog===dialog)openDialog=null;},{once:true});
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 const head=(p,img)=>`<header><span class="lb-profile-avatar">${avatarHTML(p,img,esc)}</span><div><h2>${esc(p.name)}</h2>${p.followers!==undefined?`<small>${esc(fill(w.followers,{n:p.followers}))}</small>`:''}</div><button type="button" class="lb-profile-close" data-close aria-label="${w.close}">×</button></header>`;
 const base={name:person.name,avatar:person.avatar||null};
 const paintPrivate=()=>{dialog.innerHTML=`${head(base,images)}<p class="lb-note">${person.me?w.privateMine:w.privateCard}</p>${person.me?`<footer><button type="button" class="primary" data-edit>${w.editProfile}</button></footer>`:''}`;bindCommon();};
 const bindCommon=()=>{dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.close());dialog.querySelector('[data-edit]')?.addEventListener('click',()=>{dialog.close();openSettings('personal');});};
 dialog.innerHTML=`${head(base,images)}<p class="lb-note">…</p>`;bindCommon();dialog.showModal();
 if(!person.pid){paintPrivate();return;}
 let card;try{card=await api('leaderboard_card',{pid:person.pid});}catch{card={state:'error'};}
 if(!dialog.isConnected)return;
 if(card.state==='private'){paintPrivate();return;}
 if(card.state!=='ok'){dialog.querySelector('.lb-note').textContent=w.offline;return;}
 const img={...images,...(card.avatars||{})};
 const paint=()=>{
  dialog.innerHTML=`${head(card,img)}
   ${card.bio?`<p class="lb-profile-bio">${esc(card.bio)}</p>`:''}
   ${card.favorites.length?`<h3>${w.favorites}</h3><ul class="lb-profile-games">${card.favorites.map(g=>`<li>${esc(g.title)}</li>`).join('')}</ul>`:''}
   <h3>${w.recent}</h3><div class="lb-profile-recent">${recentLine(card.recent,w,locale,esc)}</div>
   <footer>${card.me?`<span class="lb-chip">${w.you}</span><button type="button" class="primary" data-edit>${w.editProfile}</button>`:`<button type="button" class="leaderboard-leave" data-report>${w.report}</button>${card.canFollow?`<button type="button" class="${card.following?'secondary':'primary'}" data-follow>${card.following?w.following:w.follow}</button>`:`<small>${w.loginToFollow}</small>`}`}</footer>`;
  bindCommon();
  dialog.querySelector('[data-follow]')?.addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;
   try{const r=await api('leaderboard_follow',{pid:card.pid,on:!card.following});if(r.state!=='ok'){toast(r.state==='login'?w.loginToFollow:w.offline);b.disabled=false;return;}card.following=r.following;card.followers=Math.max(0,card.followers+(r.following?1:-1));paint();onChange();}
   catch{toast(w.offline);b.disabled=false;}});
  dialog.querySelector('[data-report]')?.addEventListener('click',paintReport);
 };
 const paintReport=()=>{
  dialog.innerHTML=`${head(card,img)}<h3>${w.reportTitle}</h3><p class="lb-note">${w.reportHint}</p>
   <fieldset class="lb-report-kinds"><legend>${w.reportKind}</legend>${Object.entries(w.kinds).map(([k,label])=>`<label><input type="radio" name="kind" value="${k}"><span>${label}</span></label>`).join('')}</fieldset>
   <label class="lb-report-reason"><span>${w.reportReason}</span><textarea rows="3" maxlength="500"></textarea></label>
   <p class="leaderboard-error" data-error hidden></p><footer><button type="button" class="secondary" data-back>${w.back}</button><button type="button" class="primary" data-send>${w.reportSend}</button></footer>`;
  bindCommon();dialog.querySelector('[data-back]').onclick=paint;
  dialog.querySelector('[data-send]').onclick=async event=>{const kind=dialog.querySelector('[name=kind]:checked')?.value,error=dialog.querySelector('[data-error]');
   if(!kind){error.textContent=w.reportPick;error.hidden=false;return;}const b=event.currentTarget;b.disabled=true;
   try{const r=await api('leaderboard_report_profile',{pid:card.pid,kind,reason:dialog.querySelector('textarea').value});
    if(r.state!=='ok'){toast(r.state==='login'?w.loginToFollow:w.offline);b.disabled=false;return;}toast(w.reportSent);dialog.close();onChange();}
   catch{toast(w.offline);b.disabled=false;}};
 };
 paint();
}
/* wires clicks inside the page: person buttons open cards, follow buttons in the 关注 tab toggle and re-render */
export function bindSocial(main,{api,locale,esc,toast,images,avatarHTML,openSettings,rerender}){
 const w=socialWords(locale);
 main.querySelectorAll('[data-lb-person]').forEach(b=>b.addEventListener('click',()=>openProfileCard({pid:b.dataset.pid,name:b.dataset.name,avatar:b.dataset.avatar||null,me:b.dataset.me==='1'},{api,locale,esc,toast,images:images(),avatarHTML,openSettings,onChange:rerender})));
 main.querySelectorAll('[data-lb-follow]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;
  try{const r=await api('leaderboard_follow',{pid:b.dataset.lbFollow,on:b.dataset.on==='1'});if(r.state!=='ok'){toast(r.state==='login'?w.loginToFollow:w.offline);b.disabled=false;return;}rerender();}
  catch{toast(w.offline);b.disabled=false;}}));
}
