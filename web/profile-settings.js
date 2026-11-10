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
  board:'排行榜',joined:'参加排行榜',joinedHint:'只上传阅读字数、时长、收录单词数、连续天数和本周查词的汇总',
  nickname:'昵称',nicknameHint:'2–16 个字，显示在排行榜上',share:'公开我读过的游戏',shareHint:'用于“按游戏”排行，只显示游戏名',
  joinNow:'参加',saved:'已保存',leaveAsk:'退出排行榜会删除服务器上的记录（名次、昵称、头像），之后可以重新参加。确定退出吗？',leaveYes:'确认退出',leaveNo:'取消',left:'已退出排行榜，服务器上的记录已删除',leftLocal:'已退出排行榜；服务器暂时连不上，下次联网时不会再上传',
  offline:'暂时连不上联网服务'},
 ja:{account:'アカウント',signedIn:'ログイン中',signOut:'ログアウト',signedOut:'ログアウトしました',syncDevices:'同期とデバイス',notReady:'オンラインサービスは準備中のため、アカウントとランキングはまだ使えません',
  loginHint:'ランキングに参加するには、メールアドレスで MeguLit アカウントにログインしてください。アドレスはログインにのみ使い、ランキングには表示されません',
  board:'ランキング',joined:'ランキングに参加',joinedHint:'読んだ文字数・時間・登録単語数・連続日数と、今週調べた語の合計だけを送ります',
  nickname:'ニックネーム',nicknameHint:'2〜16 文字。ランキングに表示されます',share:'読んだゲームを公開',shareHint:'ゲーム別ランキング用。ゲーム名だけを表示します',
  joinNow:'参加する',saved:'保存しました',leaveAsk:'退出すると、サーバー上の記録（順位・ニックネーム・アイコン）が削除されます。あとで再参加できます。退出しますか？',leaveYes:'退出する',leaveNo:'キャンセル',left:'ランキングから退出し、サーバーの記録を削除しました',leftLocal:'ランキングから退出しました。サーバーに接続できませんでしたが、今後は送信しません',
  offline:'オンラインサービスに接続できません'},
 en:{account:'Account',signedIn:'Signed in',signOut:'Sign out',signedOut:'Signed out',syncDevices:'Sync and devices',notReady:'Online services are not ready yet, so accounts and the leaderboard are unavailable',
  loginHint:'Sign in to a MeguLit account with your email to join the leaderboard. Your email is used only to sign in and never shows on the board',
  board:'Leaderboard',joined:'Join the leaderboard',joinedHint:'Uploads only totals: characters, reading time, words saved, streak days and this week\'s looked-up words',
  nickname:'Nickname',nicknameHint:'2–16 characters, shown on the leaderboard',share:'Show the games I read',shareHint:'For the per-game boards; only game titles are shown',
  joinNow:'Join',saved:'Saved',leaveAsk:'Leaving deletes your entry on the server (rank, nickname, picture). You can join again later. Leave now?',leaveYes:'Leave',leaveNo:'Cancel',left:'You left the leaderboard; your server entry was deleted',leftLocal:'You left the leaderboard; the server could not be reached, but nothing more will be uploaded',
  offline:'Cannot reach the online service right now'}
};
export async function mountProfileSettings({content,api,locale,esc,toast,openSection=()=>{}}){
 const t=T[locale]||T.zh,lw=leaderboardWords(locale),root=document.createElement('div');root.className='profile-settings';content.append(root);
 /* order: account, picture, leaderboard. The leaderboard block is the page's only <form>, so settings search finds
    its fields (leaderboardName …) by name */
 root.innerHTML=`<section class="panel profile-account" data-profile-account><h2 class="panel-title">${t.account}</h2><p class="settings-help">…</p></section><div data-profile-avatar></div><form class="panel profile-board" data-profile-board autocomplete="off"><h2 class="panel-title">${t.board}</h2><p class="settings-help">…</p></form>`;
 const accountBox=root.querySelector('[data-profile-account]'),avatarBox=root.querySelector('[data-profile-avatar]'),form=root.querySelector('[data-profile-board]');
 let account={configured:false,loggedIn:false},board=null;
 const errorText=error=>{const code=String(error?.message||error).replace(/^LEADERBOARD_/,'');return lw[code]||t.offline;};
 async function paintAvatar(){avatarBox.replaceChildren();await mountAvatarSettings({content:avatarBox,api,locale,esc,toast}).catch(()=>{});}
 async function paintAccount(){
  try{account=await api('account_status',{autoSync:false});}catch{account={configured:false,loggedIn:false};}
  if(!account.configured){accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><p class="settings-help">${t.notReady}</p>`;return;}
  if(!account.loggedIn){accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><p class="settings-help">${t.loginHint}</p><div data-email-login></div>`;
   mountEmailLogin(accountBox.querySelector('[data-email-login]'),{api,locale,esc,toast,onDone:async()=>{await paintAccount();await paintBoard();}});return;}
  accountBox.innerHTML=`<h2 class="panel-title">${t.account}</h2><div class="settings-row profile-account-row"><span class="setting-description"><span class="settings-label">${t.signedIn}</span><small class="settings-help">${esc(account.email||'')}</small></span><span class="review-controls"><button type="button" class="secondary" data-profile-sync>${t.syncDevices}</button><button type="button" class="secondary" data-profile-logout>${t.signOut}</button></span></div>`;
  accountBox.querySelector('[data-profile-sync]').onclick=()=>openSection('account');
  accountBox.querySelector('[data-profile-logout]').onclick=async event=>{event.currentTarget.disabled=true;try{await api('account_logout',{});toast(t.signedOut);}catch{toast(t.offline);}await paintAccount();await paintBoard();};
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
  $('[data-leave-yes]').onclick=async event=>{event.currentTarget.disabled=true;try{const r=await api('leaderboard_leave');toast(r?.remote==='deleted'?t.left:t.leftLocal);}catch{toast(t.offline);}await paintBoard();await paintAvatar();};
  $('[data-profile-join-go]').onclick=async event=>{error.hidden=true;if(!$('[data-profile-consent]').checked){error.textContent=lw.CONSENT_REQUIRED;error.hidden=false;return;}
   const b=event.currentTarget;b.disabled=true;try{await api('leaderboard_join',{name:name.value,shareGames:share.checked,consent:true});await paintBoard();await paintAvatar();}catch(e){b.disabled=false;fail(e);}};
  name.onchange=()=>joined?saveJoined():saveLocal();share.onchange=()=>joined?saveJoined():saveLocal();
  form.onsubmit=event=>{event.preventDefault();name.blur();};
 }
 await paintAccount();await Promise.all([paintBoard(),paintAvatar()]);
}
