// SPDX-License-Identifier: GPL-3.0-or-later
/* E404 个人主页 as its own panel (a drawer on the right, grimoire style), opened from the 我的主页 chip on the 排行榜
   page, the 编辑个人主页 links, a profile card and Settings search. Signed out it shows sign-up / sign-in first (one
   flow: e-mail + 6-digit code; the first sign-in creates the account) with what an account unlocks; once signed in
   the same panel turns into the profile editor (web/profile-settings.js) without closing or moving. Signing out turns
   it back. The drawer has a fixed size; only its body changes, with a short fade. */
import {mountEmailLogin} from './account-ui.js';
import {mountProfileSettings} from './profile-settings.js';
import {cropAvatarFile,pickImageFile} from './avatar-crop.js';
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

const HERO={zh:{time:'累计阅读',chars:'读过的字',words:'收录单词',streak:'最长连续',days:'天',fav:'最喜欢的游戏',noBio:'还没有签名',pick:'更换头像',rename:'改昵称',checking:'头像审核中',rejected:'头像没有通过审核，换一张吧',joining:'设置头像会同时参加排行榜',saved:'已保存',offline:'暂时连不上联网服务',xp:'经验',h:'小时',m:'分'},
 ja:{time:'累計読書',chars:'読んだ文字',words:'登録単語',streak:'最長連続',days:'日',fav:'お気に入りのゲーム',noBio:'ひとことはまだありません',pick:'アイコンを変更',rename:'ニックネームを変更',checking:'アイコン審査中',rejected:'アイコンが審査を通過しませんでした',joining:'アイコンを設定するとランキングにも参加します',saved:'保存しました',offline:'オンラインサービスに接続できません',xp:'経験値',h:'時間',m:'分'},
 en:{time:'Time read',chars:'Characters',words:'Words saved',streak:'Best streak',days:'days',fav:'Favourite games',noBio:'No signature yet',pick:'Change picture',rename:'Rename',checking:'Picture being checked',rejected:'Picture not approved; try another',joining:'Setting a picture also joins the leaderboard',saved:'Saved',offline:'Cannot reach the online service',xp:'XP',h:'h',m:'min'}};
async function heroData(api){
 const [board,prof,view,pic]=await Promise.all([api('leaderboard_profile',{}).catch(()=>null),api('leaderboard_profile_get',{}).catch(()=>null),api('leaderboard_view',{period:'all',metric:'seconds'}).catch(()=>null),api('leaderboard_avatar_status').catch(()=>null)]);
 return {board,pic:pic?.state==='ok'?pic:null,name:board?.name||'',bio:prof?.state==='ok'?prof.bio:'',favorites:prof?.state==='ok'?(prof.favorites||[]):[],stats:view?.local?.stats?.all||null,streak:view?.local?.currentStreak};
}

/* 2026-11-12 (user: under the name, a rank and an experience bar instead of the signature). Experience comes from
   what the profile already shows — characters read, minutes read, words saved — so nothing new is stored. The first
   five levels come quickly (100, 150, 200, 250, 300), then every level costs the same 600 and there is no top level;
   the rank title moves up with the level. */
const XP_EARLY=[100,150,200,250,300],XP_STEP=600;
const RANKS={zh:[[1,'见习读者'],[5,'初级魔导士'],[10,'魔导士'],[20,'上级魔导士'],[35,'大魔导士'],[50,'红魔族'],[80,'爆裂魔法学徒']],
 ja:[[1,'見習い読者'],[5,'初級魔導士'],[10,'魔導士'],[20,'上級魔導士'],[35,'大魔導士'],[50,'紅魔族'],[80,'爆裂魔法見習い']],
 en:[[1,'Apprentice reader'],[5,'Novice mage'],[10,'Mage'],[20,'High mage'],[35,'Archmage'],[50,'Crimson demon'],[80,'Explosion apprentice']]};
export function readerLevel(stats){
 const st=stats||{};let xp=Math.floor((Number(st.characters)||0)/50)+Math.floor((Number(st.seconds)||0)/60)*2+(Number(st.words)||0)*10;
 const total=xp;let level=1;
 for(const cost of XP_EARLY){if(xp<cost)return {level,xp:total,into:xp,need:cost};xp-=cost;level++;}
 const more=Math.floor(xp/XP_STEP);return {level:level+more,xp:total,into:xp-more*XP_STEP,need:XP_STEP};
}
const rankTitle=(level,locale)=>{const list=RANKS[locale]||RANKS.zh;let t=list[0][1];for(const [at,name] of list)if(level>=at)t=name;return t;};
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
  /* 2026-11-12 (user: the profile was only a settings form): a real profile first — avatar, name and signature,
     four lifetime figures, favourite games — then the settings below. Read-only; nothing new is stored. */
  swap('<section class="profile-hero" data-hero aria-live="polite"></section><div data-editor class="profile-panel-editor"></div>');
  paintHero(body.querySelector('[data-hero]')).catch(()=>{});
  await mountProfileSettings({content:body.querySelector('[data-editor]'),api,locale,esc,toast,openSection:section=>{close();openSettings(section);},onSignedOut:()=>paint()});
 };

 async function paintHero(hero){
  const h=HERO[locale]||HERO.zh,d=await heroData(api);if(!hero.isConnected)return;
  const nf=new Intl.NumberFormat({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[locale]||'zh-CN'),st=d.stats||{},sec=Number(st.seconds)||0;
  const time=sec>=3600?`${Math.floor(sec/3600)}<small>${h.h}</small>${Math.floor(sec%3600/60)}<small>${h.m}</small>`:`${Math.floor(sec/60)}<small>${h.m}</small>`;
  const lv=readerLevel(d.stats);const initial=esc([...(d.name||'?')][0]||'?');
  hero.innerHTML=`<div class="profile-hero-id"><button type="button" class="profile-hero-avatar" data-hero-avatar title="${h.pick}" aria-label="${h.pick}">${d.pic?.image&&d.pic.status==='approved'?`<img src="${esc(d.pic.image)}" alt="">`:initial}<span class="profile-hero-avatar-edit" aria-hidden="true">${h.pick}</span></button><div class="profile-hero-who"><h3><button type="button" class="profile-hero-name" data-hero-name title="${h.rename}">${esc(d.name||'')}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 11.5V13h1.5l6.8-6.8-1.5-1.5L3 11.5zm9.7-6.2a.6.6 0 000-.9l-1-1a.6.6 0 00-.9 0l-.8.8 1.9 1.9.8-.8z"/></svg></button></h3>${d.pic&&['pending','rejected'].includes(d.pic.status)?`<small class="profile-hero-note" data-status="${esc(d.pic.status)}">${d.pic.status==='pending'?h.checking:h.rejected}</small>`:''}<div class="profile-rank"><span class="profile-rank-lv">Lv.<b>${lv.level}</b></span><span class="profile-rank-name">${esc(rankTitle(lv.level,locale))}</span><span class="profile-rank-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.into}" aria-label="${h.xp}"><i style="--p:${(lv.into/lv.need*100).toFixed(1)}%"></i></span><span class="profile-rank-xp">${nf.format(lv.into)} / ${nf.format(lv.need)} ${h.xp}</span></div></div></div>
<dl class="profile-hero-figs"><div><dt>${h.time}</dt><dd>${time}</dd></div><div><dt>${h.chars}</dt><dd>${nf.format(Number(st.characters)||0)}</dd></div><div><dt>${h.words}</dt><dd>${nf.format(Number(st.words)||0)}</dd></div><div><dt>${h.streak}</dt><dd>${nf.format(Number(st.streak)||0)}<small>${h.days}</small></dd></div></dl>
${d.favorites.length?`<div class="profile-hero-fav"><h4>${h.fav}</h4><ol>${d.favorites.map(f=>`<li>${esc(f.title||f)}</li>`).join('')}</ol></div>`:''}`;
  bindHero(hero,d,h);
 }

 /* 2026-11-12 (user): the header is where the picture and the name change. Choosing a picture joins the leaderboard
    when not joined yet (the picture only exists there); the name saves through leaderboard_join when joined, the
    same name check as before, and into the local setting otherwise. */
 function bindHero(hero,d,h){
  const board=d.board||{},sync=v=>{const f=body.querySelector('[name=leaderboardName]');if(f)f.value=v;};
  hero.querySelector('[data-hero-avatar]').onclick=async()=>{
   const file=await pickImageFile();if(!file)return;let data;try{data=await cropAvatarFile(file,locale);}catch{toast(h.offline);return;}if(!data||!hero.isConnected)return;
   const btn=hero.querySelector('[data-hero-avatar]');btn.classList.add('is-busy');
   try{
    if(!board.joined){toast(h.joining);await api('leaderboard_join',{name:d.name,shareGames:board.shareGames===true,consent:true});}
    const r=await api('leaderboard_avatar_set',{data});if(r?.state&&r.state!=='ok')toast(h.offline);
   }catch(e){toast(String(e?.message||h.offline));}
   await paintHero(hero);
  };
  const nameBtn=hero.querySelector('[data-hero-name]');
  nameBtn.onclick=()=>{
   const input=document.createElement('input');input.type='text';input.maxLength=16;input.value=d.name||'';input.className='profile-hero-name-input';input.setAttribute('aria-label',h.rename);
   nameBtn.replaceWith(input);input.focus();input.select();let done=false;
   const finish=async save=>{if(done)return;done=true;const v=input.value.trim();
    if(save&&v&&v!==d.name){try{if(board.joined)await api('leaderboard_join',{name:v,shareGames:board.shareGames===true,consent:true});else await api('settings_save',{scope:'online',values:{leaderboardName:v}});d.name=v;sync(v);toast(h.saved);}catch(e){toast(String(e?.message||h.offline));}}
    await paintHero(hero);};
   input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};
   input.onblur=()=>finish(true);
  };
 }
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
