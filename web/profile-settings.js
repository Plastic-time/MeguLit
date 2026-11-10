// SPDX-License-Identifier: GPL-3.0-or-later
/* E394 Settings → 个人主页: everything about you in one place. The signed-in account (email, sign out; sync and
   devices stay on the 账号 page), the leaderboard picture (leaderboard-avatar.js, crop window from avatar-crop.js),
   the nickname, sharing the games you read, and joining or leaving the leaderboard. Leaving asks twice and says it
   deletes the server entry. Saving a nickname or the sharing switch while joined goes through leaderboard_join, so the
   relay gets the same name check as joining. 联网服务 keeps only the service address. */
import {mountEmailLogin} from './account-ui.js';
import {mountAvatarSettings} from './leaderboard-avatar.js';
import {leaderboardWords} from './leaderboard-view.js';
export const profileLabel={zh:'个人主页',ja:'プロフィール',en:'Profile'};
const T={
 zh:{account:'账号',signedIn:'已登录',signOut:'退出登录',signedOut:'已退出登录',syncDevices:'同步与设备',notReady:'联网服务还在准备中，账号和排行榜暂时不能用',
  loginHint:'用邮箱登录 MeguLit 账号后才能参加排行榜；邮箱只用来登录，不会出现在榜上',
  board:'排行榜',joined:'参加排行榜',joinedHint:'只上传阅读字数、时长、收录单词数、复习次数、假名练习题数、连续天数和本周查词的汇总',
  nickname:'昵称',nicknameHint:'2–16 个字，显示在排行榜上',share:'公开我读过的游戏',shareHint:'用于“按游戏”排行，只显示游戏名',
  joinNow:'参加',saved:'已保存',leaveAsk:'退出排行榜会删除服务器上的记录（名次、昵称、头像），之后可以重新参加。确定退出吗？',leaveYes:'确认退出',leaveNo:'取消',left:'已退出排行榜，服务器上的记录已删除',leftLocal:'已退出排行榜；服务器暂时连不上，下次联网时不会再上传',
  offline:'暂时连不上联网服务',
  publicTitle:'公开主页',publicSwitch:'公开我的主页',publicHint:'公开后，别人可以在排行榜上点开你的主页、关注你，也会在“同好”里看到你。最近在玩只在打开“公开我读过的游戏”时显示',
  publicLogin:'登录后可以设置公开主页',publicJoin:'参加排行榜后可以设置公开主页',publicHidden:'你的主页被举报，已暂时隐藏，等待人工审核。审核通过后会自动恢复',objection:'一斤鸭梨！',objectionTitle:'驳回举报',objectionHint:'觉得举报不成立？提出异议，开发者会人工复核。每次被隐藏只能提一次',objectionPh:'说说为什么（可不填）',objectionSend:'提出异议',appealed:'已提出异议，等待人工复核',
  bio:'签名',bioHint:'一行，最多 60 字；不能包含网址、成人或辱骂内容',bioPh:'比如：爆裂魔法一日一发',favorites:'最喜欢的游戏',favoritesHint:'从游戏库里选，最多 5 个',addFavorite:'＋ 添加游戏',removeFavorite:'移除'},
 ja:{account:'アカウント',signedIn:'ログイン中',signOut:'ログアウト',signedOut:'ログアウトしました',syncDevices:'同期とデバイス',notReady:'オンラインサービスは準備中のため、アカウントとランキングはまだ使えません',
  loginHint:'ランキングに参加するには、メールアドレスで MeguLit アカウントにログインしてください。アドレスはログインにのみ使い、ランキングには表示されません',
  board:'ランキング',joined:'ランキングに参加',joinedHint:'読んだ文字数・時間・登録単語数・復習回数・かな練習の問題数・連続日数と、今週調べた語の合計だけを送ります',
  nickname:'ニックネーム',nicknameHint:'2〜16 文字。ランキングに表示されます',share:'読んだゲームを公開',shareHint:'ゲーム別ランキング用。ゲーム名だけを表示します',
  joinNow:'参加する',saved:'保存しました',leaveAsk:'退出すると、サーバー上の記録（順位・ニックネーム・アイコン）が削除されます。あとで再参加できます。退出しますか？',leaveYes:'退出する',leaveNo:'キャンセル',left:'ランキングから退出し、サーバーの記録を削除しました',leftLocal:'ランキングから退出しました。サーバーに接続できませんでしたが、今後は送信しません',
  offline:'オンラインサービスに接続できません',
  publicTitle:'公開プロフィール',publicSwitch:'プロフィールを公開',publicHint:'公開すると、ほかの人がランキングからプロフィールを開いたりフォローしたりでき、「同好」にも表示されます。最近読んでいるゲームは「読んだゲームを公開」がオンのときだけ表示されます',
  publicLogin:'ログインすると公開プロフィールを設定できます',publicJoin:'ランキングに参加すると公開プロフィールを設定できます',publicHidden:'通報を受けたため、プロフィールは確認まで非表示です。問題がなければ自動で戻ります',objection:'異議あり！',objectionTitle:'通報に異議を申し立てる',objectionHint:'通報が不当だと思ったら異議を申し立てられます。開発者が確認します。非表示 1 回につき 1 度だけです',objectionPh:'理由（任意）',objectionSend:'異議を申し立てる',appealed:'異議を申し立てました。確認をお待ちください',
  bio:'ひとこと',bioHint:'1 行、60 文字まで。URL・成人向け・暴言は使えません',bioPh:'例：爆裂魔法は一日一発',favorites:'好きなゲーム',favoritesHint:'ライブラリから最大 5 本',addFavorite:'＋ ゲームを追加',removeFavorite:'削除'},
 en:{account:'Account',signedIn:'Signed in',signOut:'Sign out',signedOut:'Signed out',syncDevices:'Sync and devices',notReady:'Online services are not ready yet, so accounts and the leaderboard are unavailable',
  loginHint:'Sign in to a MeguLit account with your email to join the leaderboard. Your email is used only to sign in and never shows on the board',
  board:'Leaderboard',joined:'Join the leaderboard',joinedHint:'Uploads only totals: characters, reading time, words saved, reviews, kana questions answered, streak days and this week\'s looked-up words',
  nickname:'Nickname',nicknameHint:'2–16 characters, shown on the leaderboard',share:'Show the games I read',shareHint:'For the per-game boards; only game titles are shown',
  joinNow:'Join',saved:'Saved',leaveAsk:'Leaving deletes your entry on the server (rank, nickname, picture). You can join again later. Leave now?',leaveYes:'Leave',leaveNo:'Cancel',left:'You left the leaderboard; your server entry was deleted',leftLocal:'You left the leaderboard; the server could not be reached, but nothing more will be uploaded',
  offline:'Cannot reach the online service right now',
  publicTitle:'Public profile',publicSwitch:'Make my profile public',publicHint:'Others can open your profile from the leaderboard, follow you, and find you under Kindred readers. Reading lately shows only while "Show the games I read" is on',
  publicLogin:'Sign in to set up a public profile',publicJoin:'Join the leaderboard to set up a public profile',publicHidden:'Your profile was reported and is hidden until it is reviewed; it comes back by itself if all is fine',objection:'Objection!',objectionTitle:'Dispute the report',objectionHint:'Think the report is wrong? Object and the developer reviews it by hand. Once per hiding',objectionPh:'Why (optional)',objectionSend:'Send objection',appealed:'Objection sent; waiting for a human review',
  bio:'Signature',bioHint:'One line, up to 60 characters; no links, adult or abusive content',bioPh:'e.g. One explosion a day',favorites:'Favourite games',favoritesHint:'Pick up to 5 from your library',addFavorite:'+ Add a game',removeFavorite:'Remove'}
};
export async function mountProfileSettings({content,api,locale,esc,toast,openSection=()=>{},onSignedOut=null}){
 const t=T[locale]||T.zh,lw=leaderboardWords(locale),root=document.createElement('div');root.className='profile-settings';content.append(root);
 /* order: account, picture, leaderboard. The leaderboard block is the page's only <form>, so settings search finds
    its fields (leaderboardName …) by name */
 root.innerHTML=`<section class="panel profile-account" data-profile-account><h2 class="panel-title">${t.account}</h2><p class="settings-help">…</p></section><div data-profile-avatar></div><form class="panel profile-board" data-profile-board autocomplete="off"><h2 class="panel-title">${t.board}</h2><p class="settings-help">…</p></form><section class="panel profile-public" data-profile-public><h2 class="panel-title">${t.publicTitle}</h2><p class="settings-help">…</p></section>`;
 const publicBox=root.querySelector('[data-profile-public]'),accountBox=root.querySelector('[data-profile-account]'),avatarBox=root.querySelector('[data-profile-avatar]'),form=root.querySelector('[data-profile-board]');
 let account={configured:false,loggedIn:false},board=null;
 /* E400 the bridge error may arrive as an Error or a plain string, sometimes with a prefix: pick the code out of it */
 const errorCode=error=>{const text=String(error?.message||error||'');return (text.match(/LEADERBOARD_([A-Z_]+)/)||text.match(/\b([A-Z][A-Z_]{3,})\b/)||[])[1]||'';};
 const errorText=error=>{const code=errorCode(error);return code==='UNAUTHORIZED'?t.publicLogin:lw[code]||(code?t.offline+' ('+code+')':t.offline);};
 async function paintAvatar(){avatarBox.replaceChildren();await mountAvatarSettings({content:avatarBox,api,locale,esc,toast}).catch(()=>{});}
 async function paintAccount(){
  try{account=await api('account_status',{autoSync:false});}catch{account={configured:false,loggedIn:false};}
  if(!account.configured){accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><p class="settings-help">${t.notReady}</p>`;return;}
  if(!account.loggedIn){accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><p class="settings-help">${t.loginHint}</p><div data-email-login></div>`;
   mountEmailLogin(accountBox.querySelector('[data-email-login]'),{api,locale,esc,toast,onDone:async()=>{await paintAccount();await paintBoard();await paintPublic();}});return;}
  accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><div class="settings-row profile-account-row"><span class="setting-description"><span class="settings-label">${t.signedIn}</span><small class="settings-help">${esc(account.email||'')}</small></span><span class="review-controls"><button type="button" class="secondary" data-profile-sync>${t.syncDevices}</button><button type="button" class="secondary" data-profile-logout>${t.signOut}</button></span></div>`;
  accountBox.querySelector('[data-profile-sync]').onclick=()=>openSection('account');
  accountBox.querySelector('[data-profile-logout]').onclick=async event=>{event.currentTarget.disabled=true;try{await api('account_logout',{});toast(t.signedOut);}catch{toast(t.offline);}if(onSignedOut){onSignedOut();return;}/* E404 the panel switches back to sign-in */await paintAccount();await paintBoard();await paintPublic();};
 }

 /* E397 公开主页: signature, favourite games (from your library), the public switch. Needs an account and a joined
    leaderboard; saved to the relay on every change. A reported profile shows why it is hidden. */
 async function paintPublic(){
  let p;try{p=await api('leaderboard_profile_get',{});}catch{p={state:'error'};}
  const head=`<h2 class="panel-title">${t.publicTitle}</h2>`;
  if(p.state==='not-configured'){publicBox.innerHTML=head+`<p class="settings-help">${t.notReady}</p>`;return;}
  if(p.state==='login'){publicBox.innerHTML=head+`<p class="settings-help">${t.publicLogin}</p>`;return;}
  if(p.state!=='ok'){publicBox.innerHTML=head+`<p class="settings-help">${t.offline}</p>`;return;}
  if(!p.joined){publicBox.innerHTML=head+`<p class="settings-help">${t.publicJoin}</p>`;return;}
  let library=[];try{library=await api('leaderboard_library',{});}catch{}
  let favorites=[...p.favorites];
  const draw=()=>{
   const left=library.filter(title=>!favorites.some(f=>f.title===title));
   publicBox.innerHTML=`${head}${p.hidden?`<div class="profile-hidden" role="status"><p>${t.publicHidden}</p>${p.appealed?`<p class="profile-appealed">${t.appealed}</p>`:`<button type="button" class="profile-objection" data-objection title="${esc(t.objectionTitle)}">${t.objection}</button><small>${t.objectionHint}</small><div class="profile-objection-form" data-objection-form hidden><textarea rows="3" maxlength="500" placeholder="${esc(t.objectionPh)}" aria-label="${esc(t.objectionPh)}"></textarea><button type="button" class="primary" data-objection-send>${t.objectionSend}</button></div>`}</div>`:''}
    <label class="settings-row"><span class="setting-description"><span class="settings-label">${t.publicSwitch}</span><small class="settings-help">${t.publicHint}</small></span><input class="switch" type="checkbox" name="profilePublic" ${p.public?'checked':''}></label>
    <label class="settings-row"><span class="setting-description"><span class="settings-label">${t.bio}</span><small class="settings-help">${t.bioHint}</small></span><input name="profileBio" type="text" maxlength="60" value="${esc(p.bio)}" placeholder="${esc(t.bioPh)}"></label>
    <div class="settings-row profile-favorites"><span class="setting-description"><span class="settings-label">${t.favorites}</span><small class="settings-help">${t.favoritesHint}</small></span>
     <div class="profile-favorite-list">${favorites.map((f,i)=>`<span class="lb-chip profile-favorite">${esc(f.title)}<button type="button" data-remove-favorite="${i}" aria-label="${esc(t.removeFavorite)}">×</button></span>`).join('')}
      ${favorites.length<5?`<select data-add-favorite aria-label="${esc(t.addFavorite)}"><option value="">${t.addFavorite}</option>${left.map(title=>`<option value="${esc(title)}">${esc(title)}</option>`).join('')}</select>`:''}</div></div>
    <p class="leaderboard-error" data-public-error hidden></p>`;
   const error=publicBox.querySelector('[data-public-error]');
   /* E400 saving: on every change, and 0.9 s after typing stops. A refusal keeps what you typed on screen and says
      why (sign in first, signature rule, offline …) instead of failing quietly. */
   const local=()=>({bio:publicBox.querySelector('[name=profileBio]').value,favorites:[...favorites],public:publicBox.querySelector('[name=profilePublic]').checked});
   const failWith=(message,values)=>{p={...p,...values};favorites=[...values.favorites];draw();const box=publicBox.querySelector('[data-public-error]');box.textContent=message;box.hidden=false;};
   let saving=null,again=false,typing=0;
   const save=async()=>{
    clearTimeout(typing);if(saving){again=true;return;}
    const values=local();error.hidden=true;
    saving=(async()=>{
     try{const r=await api('leaderboard_profile_save',values);
      if(r?.state==='ok'){p=r;favorites=[...r.favorites];toast(t.saved);draw();return;}
      failWith(r?.state==='login'?t.publicLogin:r?.state==='not-configured'?t.notReady:errorText(r?.error||''),values);}
     catch(e){failWith(errorText(e),values);}
    })();
    try{await saving;}finally{saving=null;if(again){again=false;save();}}
   };
   /* E398 異議あり！ opens a short statement box, then sends the objection once */
   publicBox.querySelector('[data-objection]')?.addEventListener('click',()=>{const f=publicBox.querySelector('[data-objection-form]');f.hidden=false;f.querySelector('textarea').focus();});
   publicBox.querySelector('[data-objection-send]')?.addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;
    try{const r=await api('leaderboard_profile_appeal',{reason:publicBox.querySelector('[data-objection-form] textarea').value});if(r.state!=='ok'){toast(t.offline);b.disabled=false;return;}p={...p,appealed:true};toast(t.appealed);draw();}catch{toast(t.offline);b.disabled=false;}});
   publicBox.querySelector('[name=profilePublic]').onchange=save;
   const bioInput=publicBox.querySelector('[name=profileBio]');bioInput.onchange=save;bioInput.addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(save,900);});
   bioInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();save();}});
   publicBox.querySelectorAll('[data-remove-favorite]').forEach(b=>b.onclick=()=>{favorites.splice(Number(b.dataset.removeFavorite),1);save();});
   publicBox.querySelector('[data-add-favorite]')?.addEventListener('change',event=>{const title=event.currentTarget.value;if(!title||favorites.some(f=>f.title===title)||favorites.length>=5)return;favorites.push({title,vndb:''});save();});
  };
  draw();
 }
 async function paintBoard(){
  try{board=await api('leaderboard_profile',{});}catch{board=null;}
  if(!board){form.innerHTML=`<h2 class="panel-title">${t.board}</h2><p class="settings-help">${t.offline}</p>`;return;}
  const joined=board.joined===true,needsLogin=!account.loggedIn&&!joined;
  form.innerHTML=`<h2 class="panel-title">${t.board}</h2>${!board.configured?`<p class="settings-help">${t.notReady}</p>`:''}
   <label class="settings-row"><span class="setting-description"><span class="settings-label">${t.joined}</span><small class="settings-help">${needsLogin?t.loginHint:t.joinedHint}</small></span><input class="switch" type="checkbox" name="leaderboardEnabled" ${joined?'checked':''} ${!board.configured||needsLogin?'disabled':''}></label>
   <div class="profile-leave" data-profile-leave hidden role="alert"><p>${t.leaveAsk}</p><div class="review-controls"><button type="button" class="secondary" data-leave-no>${t.leaveNo}</button><button type="button" class="danger primary" data-leave-yes>${t.leaveYes}</button></div></div>
   <label class="settings-row"><span class="setting-description"><span class="settings-label">${t.nickname}</span><small class="settings-help">${t.nicknameHint}</small></span><input name="leaderboardName" type="text" maxlength="16" value="${esc(board.name||'')}" placeholder="${esc(lw.nicknameHint||'')}" ${!board.configured?'disabled':''}></label>
   <label class="settings-row"><span class="setting-description"><span class="settings-label">${t.share}</span><small class="settings-help">${t.shareHint}</small></span><input class="switch" type="checkbox" name="leaderboardShareGames" ${board.shareGames?'checked':''} ${!board.configured?'disabled':''}></label>
   <div class="profile-join" data-profile-join hidden><label class="leaderboard-check"><input type="checkbox" class="switch" data-profile-consent><span>${lw.consent}</span></label><button type="button" class="primary" data-profile-join-go>${t.joinNow}</button></div>
   <p class="leaderboard-error" data-profile-error hidden></p>`;
  const $=q=>form.querySelector(q),toggle=$('[name=leaderboardEnabled]'),name=$('[name=leaderboardName]'),share=$('[name=leaderboardShareGames]'),leave=$('[data-profile-leave]'),join=$('[data-profile-join]'),error=$('[data-profile-error]');
  const fail=e=>{error.textContent=errorText(e);error.hidden=false;};
  const saveJoined=async()=>{error.hidden=true;try{await api('leaderboard_join',{name:name.value,shareGames:share.checked,consent:true});toast(t.saved);}catch(e){fail(e);}};
  const saveLocal=async()=>{try{await api('settings_save',{scope:'online',values:{leaderboardName:name.value.trim(),leaderboardShareGames:share.checked}});error.hidden=true;}catch(e){fail(e);}};
  toggle.onchange=()=>{error.hidden=true;if(joined){leave.hidden=toggle.checked;if(!toggle.checked)leave.querySelector('[data-leave-no]').focus();}else join.hidden=!toggle.checked;};
  $('[data-leave-no]').onclick=()=>{toggle.checked=true;leave.hidden=true;};
  $('[data-leave-yes]').onclick=async event=>{event.currentTarget.disabled=true;try{const r=await api('leaderboard_leave');toast(r?.remote==='deleted'?t.left:t.leftLocal);}catch{toast(t.offline);}await paintBoard();await paintAvatar();await paintPublic();};
  $('[data-profile-join-go]').onclick=async event=>{error.hidden=true;if(!$('[data-profile-consent]').checked){error.textContent=lw.CONSENT_REQUIRED;error.hidden=false;return;}
   const b=event.currentTarget;b.disabled=true;try{await api('leaderboard_join',{name:name.value,shareGames:share.checked,consent:true});await paintBoard();await paintAvatar();await paintPublic();}catch(e){b.disabled=false;fail(e);}};
  name.onchange=()=>joined?saveJoined():saveLocal();share.onchange=()=>joined?saveJoined():saveLocal();
  form.onsubmit=event=>{event.preventDefault();name.blur();};
 }
 await paintAccount();await Promise.all([paintBoard(),paintAvatar(),paintPublic()]);
}
