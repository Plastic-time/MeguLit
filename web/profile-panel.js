// SPDX-License-Identifier: GPL-3.0-or-later
/* E404 个人主页 as its own panel (a drawer on the right, grimoire style), opened from the 我的主页 chip on the 排行榜
   page, the 编辑个人主页 links, a profile card and Settings search. Signed out it shows sign-up / sign-in first (one
   flow: e-mail + 6-digit code; the first sign-in creates the account) with what an account unlocks; once signed in
   the same panel turns into the profile editor (web/profile-settings.js) without closing or moving. Signing out turns
   it back. The drawer has a fixed size; only its body changes, with a short fade. */
import {mountEmailLogin} from './account-ui.js';
import {mountProfileSettings} from './profile-settings.js';
const T={
 zh:{title:'个人主页',close:'关闭',joinTitle:'注册 / 登录 MeguLit 账号',joinText:'用邮箱收一个 6 位验证码就能登录，第一次登录就是注册，不用密码',
  perks:['公开个人主页：头像、签名、最喜欢的游戏','关注别的读者，看他们最近在玩什么，找到同好','参加排行榜，几台电脑合并成一行','云同步单词、收藏的句子和阅读记录'],
  privacy:'邮箱只用来登录，不会显示在任何地方',notReady:'联网服务还在准备中，暂时不能登录',offline:'暂时连不上联网服务',welcome:'已登录，欢迎'},
 ja:{title:'プロフィール',close:'閉じる',joinTitle:'MeguLit アカウントに登録 / ログイン',joinText:'メールに届く 6 桁のコードでログインします。初回のログインがそのまま登録になり、パスワードは不要です',
  perks:['プロフィールを公開：アイコン・ひとこと・好きなゲーム','ほかの読者をフォローして最近読んでいるゲームを見たり、同好を探したり','ランキングに参加（複数の PC を 1 行にまとめます）','単語・保存した文・読書記録をクラウド同期'],
  privacy:'メールアドレスはログインにのみ使い、どこにも表示されません',notReady:'オンラインサービスは準備中のため、まだログインできません',offline:'オンラインサービスに接続できません',welcome:'ログインしました'},
 en:{title:'Profile',close:'Close',joinTitle:'Sign up / sign in to MeguLit',joinText:'Sign in with a 6-digit code sent to your e-mail; the first sign-in creates your account. No password',
  perks:['A public profile: picture, signature, favourite games','Follow readers, see what they read lately, find kindred ones','Join the leaderboard, all your PCs as one row','Cloud sync for words, saved sentences and reading records'],
  privacy:'Your e-mail is only used to sign in and is never shown',notReady:'Online services are not ready yet, so signing in is unavailable',offline:'Cannot reach the online service right now',welcome:'Signed in'}
};
export const panelWords=locale=>T[locale]||T.zh;
let current=null;
/* opens (or brings back) the panel; onClose runs once when it closes, e.g. to refresh the 排行榜 page */
export async function openProfilePanel({api,locale,esc,toast,onClose=()=>{},openSettings=()=>{}}){
 if(current?.isConnected){current.querySelector('[data-close]')?.focus();return current;}
 const t=panelWords(locale),dialog=document.createElement('dialog');dialog.className='profile-panel';dialog.setAttribute('aria-label',t.title);
 dialog.innerHTML=`<header class="profile-panel-head"><h2>${t.title}</h2><button type="button" class="profile-panel-close" data-close aria-label="${t.close}">×</button></header><div class="profile-panel-body settings-content" data-body></div>`;
 /* inside .main so the settings form styles (.main .settings-content …) apply; a modal dialog is drawn on top anyway */
 (document.querySelector('.main')||document.body).append(dialog);current=dialog;
 const body=dialog.querySelector('[data-body]');let closed=false;
 const close=()=>{if(!closed){closed=true;dialog.close();}};
 dialog.addEventListener('close',()=>{dialog.remove();if(current===dialog)current=null;onClose();},{once:true});
 dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
 dialog.querySelector('[data-close]').onclick=close;
 /* swap the body with a short fade; the drawer itself never changes size or place */
 const swap=html=>{body.classList.remove('is-in');body.innerHTML=html;void body.offsetWidth;body.classList.add('is-in');};
 const paintLogin=state=>{
  if(!state.configured){swap(`<div class="profile-panel-intro"><p class="settings-help">${t.notReady}</p></div>`);return;}
  swap(`<section class="profile-panel-intro"><h3>${t.joinTitle}</h3><p class="settings-help">${t.joinText}</p><ul class="profile-perks">${t.perks.map(p=>`<li>${p}</li>`).join('')}</ul><div class="profile-panel-login" data-login-box></div><p class="profile-privacy">${t.privacy}</p></section>`);
  mountEmailLogin(body.querySelector('[data-login-box]'),{api,locale,esc,toast,onDone:async()=>{toast(t.welcome);await paint();}});
 };
 const paintEditor=async()=>{
  swap('<div data-editor class="profile-panel-editor"></div>');
  await mountProfileSettings({content:body.querySelector('[data-editor]'),api,locale,esc,toast,openSection:section=>{close();openSettings(section);},onSignedOut:()=>paint()});
 };
 async function paint(){
  let state;try{state=await api('account_status',{autoSync:false});}catch{state=null;}
  if(!dialog.isConnected)return;
  if(!state){swap(`<div class="profile-panel-intro"><p class="settings-help">${t.offline}</p></div>`);return;}
  if(!state.loggedIn)paintLogin(state);else await paintEditor();
 }
 dialog.showModal();
 swap('<div class="profile-panel-loading"><span class="spinner"></span></div>');
 await paint();
 return dialog;
}
