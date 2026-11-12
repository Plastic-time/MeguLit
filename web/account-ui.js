// SPDX-License-Identifier: GPL-3.0-or-later
/* E378 Settings → 账号: email + code login and cloud sync (services/account.cjs). Not logged in = everything stays local. */
const T={
 zh:{title:'账号',notReady:'联网服务还在准备中，账号和云同步暂时不能用；所有功能照常在本机使用',intro:'登录后可以在几台电脑之间同步单词、收藏的句子、阅读记录和按游戏设置。不登录也能照常使用全部功能',privacy:'只同步下面打开的内容；不上传游戏路径和日志；邮箱只用来登录',email:'邮箱',emailPh:'you@example.com',send:'发送验证码',resend:'重新发送',code:'验证码',codePh:'6 位数字',login:'登录',sentTo:'验证码已发到 {email}，10 分钟内有效',loggedAs:'已登录',lastSync:'上次同步',never:'还没有同步',syncNow:'立即同步',syncing:'同步中…',synced:'同步完成',pending:'待上传 {n} 条',kinds:'同步内容',words:'单词与例句',sentences:'收藏的句子',reading:'阅读记录（每日汇总）',settings:'按游戏设置（不含路径）',devices:'已登录的设备',thisDevice:'本机',revoke:'移除',logout:'退出登录',remove:'删除账号（含云端数据）',removeTitle:'删除账号和云端数据？',removeBody:'会删除服务器上的账号、所有设备的登录和已同步的数据，无法恢复。本机数据保留不变',confirm:'删除',cancel:'取消',removed:'账号已删除',loggedOut:'已退出登录',err:{EMAIL_INVALID:'邮箱格式不对',RATE_LIMITED:'操作太频繁，请稍后再试',WRONG_CODE:'验证码不对',CODE_EXPIRED:'验证码已过期，请重新发送',TOO_MANY_TRIES:'错误次数太多，请重新发送验证码',NO_CODE:'请先发送验证码',EMAIL_NOT_CONFIGURED:'邮件服务还在准备中，暂时不能登录',EMAIL_SEND_FAILED:'邮件发送失败，请稍后再试',NETWORK:'连不上联网服务，请检查网络',UNAUTHORIZED:'登录已失效，请重新登录',SYNC_QUOTA_EXCEEDED:'云端空间已满，可以关掉部分同步内容',RELAY_NOT_CONFIGURED:'联网服务还在准备中',VAULT_UNAVAILABLE:'Windows 加密存储不可用，无法保存登录',other:'操作失败，请稍后再试'}},
 ja:{title:'アカウント',notReady:'オンラインサービスは準備中です。アカウントとクラウド同期はまだ使えません。ほかの機能はこれまでどおり使えます',intro:'ログインすると、単語・保存した文・読書記録・作品別の設定を複数の PC で同期できます。ログインしなくてもすべての機能を使えます',privacy:'オンにした項目だけを同期します。ゲームのパスやログは送信しません。メールアドレスはログインにのみ使います',email:'メールアドレス',emailPh:'you@example.com',send:'確認コードを送信',resend:'再送信',code:'確認コード',codePh:'6 桁の数字',login:'ログイン',sentTo:'{email} に確認コードを送りました（10 分間有効）',loggedAs:'ログイン中',lastSync:'前回の同期',never:'まだ同期していません',syncNow:'今すぐ同期',syncing:'同期中…',synced:'同期しました',pending:'未送信 {n} 件',kinds:'同期する内容',words:'単語と例文',sentences:'保存した文',reading:'読書記録（日ごとの合計）',settings:'作品別の設定（パスを除く）',devices:'ログイン中のデバイス',thisDevice:'この PC',revoke:'削除',logout:'ログアウト',remove:'アカウントを削除（クラウドのデータも）',removeTitle:'アカウントとクラウドのデータを削除しますか？',removeBody:'サーバー上のアカウント、全デバイスのログイン、同期したデータを削除します。元に戻せません。この PC のデータはそのまま残ります',confirm:'削除',cancel:'キャンセル',removed:'アカウントを削除しました',loggedOut:'ログアウトしました',err:{EMAIL_INVALID:'メールアドレスの形式が正しくありません',RATE_LIMITED:'操作が多すぎます。しばらくしてからお試しください',WRONG_CODE:'確認コードが違います',CODE_EXPIRED:'確認コードの期限が切れました。再送信してください',TOO_MANY_TRIES:'入力ミスが多すぎます。確認コードを再送信してください',NO_CODE:'先に確認コードを送信してください',EMAIL_NOT_CONFIGURED:'メール送信は準備中のため、まだログインできません',EMAIL_SEND_FAILED:'メールを送信できませんでした。しばらくしてからお試しください',NETWORK:'オンラインサービスに接続できません。ネットワークを確認してください',UNAUTHORIZED:'ログインが切れました。もう一度ログインしてください',SYNC_QUOTA_EXCEEDED:'クラウドの容量が上限です。同期する内容を減らしてください',RELAY_NOT_CONFIGURED:'オンラインサービスは準備中です',VAULT_UNAVAILABLE:'Windows の暗号化ストアが使えないため、ログインを保存できません',other:'操作に失敗しました。しばらくしてからお試しください'}},
 en:{title:'Account',notReady:'Online services are not ready yet, so accounts and cloud sync are unavailable. Everything else works locally as usual',intro:'Sign in to sync words, saved sentences, reading records and per-game settings between your PCs. Everything works without an account too',privacy:'Only what you turn on below is synced. Game paths and logs are never uploaded. Your email is used only to sign in',email:'Email',emailPh:'you@example.com',send:'Send code',resend:'Resend',code:'Code',codePh:'6 digits',login:'Sign in',sentTo:'Code sent to {email}, valid for 10 minutes',loggedAs:'Signed in',lastSync:'Last sync',never:'Not synced yet',syncNow:'Sync now',syncing:'Syncing…',synced:'Synced',pending:'{n} waiting to upload',kinds:'What to sync',words:'Words and examples',sentences:'Saved sentences',reading:'Reading records (daily totals)',settings:'Per-game settings (no paths)',devices:'Signed-in devices',thisDevice:'This PC',revoke:'Remove',logout:'Sign out',remove:'Delete account (and cloud data)',removeTitle:'Delete your account and cloud data?',removeBody:'This deletes the account on the server, every device sign-in and all synced data. It cannot be undone. Data on this PC stays as it is',confirm:'Delete',cancel:'Cancel',removed:'Account deleted',loggedOut:'Signed out',err:{EMAIL_INVALID:'That email address does not look right',RATE_LIMITED:'Too many attempts, try again later',WRONG_CODE:'Wrong code',CODE_EXPIRED:'The code expired, send a new one',TOO_MANY_TRIES:'Too many wrong codes, send a new one',NO_CODE:'Send a code first',EMAIL_NOT_CONFIGURED:'Email delivery is not ready yet, so sign-in is unavailable',EMAIL_SEND_FAILED:'Could not send the email, try again later',NETWORK:'Cannot reach the online service, check your connection',UNAUTHORIZED:'Your sign-in expired, sign in again',SYNC_QUOTA_EXCEEDED:'Cloud storage is full, turn off some sync items',RELAY_NOT_CONFIGURED:'Online services are not ready yet',VAULT_UNAVAILABLE:'Windows protected storage is unavailable, cannot keep you signed in',other:'Something went wrong, try again later'}}
};
const KINDS=['words','sentences','reading','settings'];
export const accountLabel={zh:T.zh.title,ja:T.ja.title,en:T.en.title};
function errorText(t,error){const raw=String(error?.code||error?.message||error||'');const code=Object.keys(t.err).find(k=>raw.includes(k));return t.err[code]||t.err.other;}
/* E385 the email + code form on its own, shared by Settings → 账号 and the leaderboard join card. kinds() gives the
   sync choice to save at sign-in (null keeps the saved/default one); onDone runs after a successful sign-in. */
export function mountEmailLogin(box,{api,locale,esc,toast,kinds=()=>null,onDone=()=>{}}){
 const t=T[locale]||T.zh,fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>esc(String(v[k]??'')));
 box.innerHTML=`<label class="form-label">${t.email}</label><div class="input-group"><input class="form-input" type="email" data-login-email autocomplete="email" spellcheck="false" placeholder="${t.emailPh}" aria-label="${t.email}"><button type="button" class="secondary" data-send>${t.send}</button></div>
  <div data-code-step hidden><p class="settings-help" data-sent></p><label class="form-label">${t.code}</label><div class="input-group"><input class="form-input" data-login-code inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t.codePh}" aria-label="${t.code}"><button type="button" class="primary" data-login>${t.login}</button></div></div>`;
 const email=box.querySelector('[data-login-email]'),code=box.querySelector('[data-login-code]'),step=box.querySelector('[data-code-step]'),send=box.querySelector('[data-send]');
 const busy=on=>box.querySelectorAll('button,input').forEach(el=>el.disabled=on);
 send.onclick=async()=>{busy(true);try{const r=await api('account_code',{email:email.value});step.hidden=false;box.querySelector('[data-sent]').innerHTML=fill(t.sentTo,{email:r.email});send.textContent=t.resend;busy(false);code.focus();}catch(error){busy(false);toast(errorText(t,error));}};
 email.onkeydown=e=>{if(e.key==='Enter')send.click();};
 let running=false;
 const login=async()=>{if(running)return;running=true;busy(true);try{await api('account_verify',{email:email.value,code:code.value,kinds:kinds()});await onDone();}catch(error){toast(errorText(t,error));busy(false);}finally{running=false;}};
 box.querySelector('[data-login]').onclick=login;code.onkeydown=e=>{if(e.key==='Enter')login();};
 code.oninput=()=>{code.value=code.value.replace(/\D/g,'').slice(0,6);if(code.value.length===6)login();};
}
export async function renderAccount({target,api,locale,esc,toast}){
 const t=T[locale]||T.zh,fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>esc(String(v[k]??'')));
 const when=ms=>ms?new Date(ms).toLocaleString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-US'):t.never;
 let status;try{status=await api('account_status',{});}catch(error){target.innerHTML=`<section class="panel"><h2>${t.title}</h2><p class="settings-help u-status" data-state="error">${esc(errorText(t,error))}</p></section>`;return;}
 const kindRows=kinds=>KINDS.map(k=>`<label class="settings-row"><span class="settings-label">${t[k]}</span><input class="switch" type="checkbox" data-kind="${k}" ${kinds[k]?'checked':''}></label>`).join('');
 const busy=(on,root=target)=>root.querySelectorAll('button,input').forEach(el=>el.disabled=on);
 const fail=error=>{toast(errorText(t,error));if(String(error?.message||'').includes('UNAUTHORIZED'))paint().catch(()=>{});};
 async function paint(){
  status=await api('account_status',{autoSync:false});
  if(!status.configured){target.innerHTML=`<section class="panel"><h2>${t.title}</h2><p class="settings-help">${t.notReady}</p></section>`;return;}
  if(!status.loggedIn){
   target.innerHTML=`<section class="panel account-login"><h2>${t.title}</h2><p class="settings-help">${t.intro}</p><p class="settings-help">${t.privacy}</p><div data-email-login></div>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.kinds}</h3>${kindRows(status.kinds)}</section>`;
   const chosen=()=>Object.fromEntries([...target.querySelectorAll('[data-kind]')].map(el=>[el.dataset.kind,el.checked]));
   mountEmailLogin(target.querySelector('[data-email-login]'),{api,locale,esc,toast,kinds:chosen,onDone:()=>paint()});
   return;
  }
  const pending=Object.values(status.pending||{}).reduce((a,b)=>a+b,0);
  target.innerHTML=`<section class="panel account-panel"><h2>${t.title}</h2>
    <div class="settings-row"><span><span class="settings-label">${t.loggedAs}</span><p class="settings-help">${esc(status.email)}</p></span></div>
    <div class="settings-row"><span><span class="settings-label">${t.lastSync}</span><p class="settings-help" data-last>${esc(when(status.lastSyncAt))}${pending?' · '+fill(t.pending,{n:pending}):''}${status.lastError?' · '+esc(errorText(t,status.lastError)):''}</p></span><button class="primary" data-sync>${status.syncing?t.syncing:t.syncNow}</button></div>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.kinds}</h3>${kindRows(status.kinds)}<p class="settings-help">${t.privacy}</p>
    <h3 class="settings-label" style="margin:22px 0 4px">${t.devices}</h3><div data-devices><p class="settings-help">…</p></div>
    <div class="review-controls" style="justify-content:flex-start;margin-top:22px"><button class="secondary" data-logout>${t.logout}</button><button class="secondary" data-remove>${t.remove}</button></div></section>`;
  const syncButton=target.querySelector('[data-sync]');
  syncButton.onclick=async()=>{syncButton.disabled=true;syncButton.textContent=t.syncing;try{await api('account_sync',{});toast(t.synced);}catch(error){fail(error);}await paint().catch(()=>{});};
  target.querySelectorAll('[data-kind]').forEach(el=>el.onchange=async()=>{try{await api('account_kinds',{kinds:{[el.dataset.kind]:el.checked}});}catch(error){el.checked=!el.checked;fail(error);}});
  target.querySelector('[data-logout]').onclick=async()=>{busy(true);try{await api('account_logout',{});toast(t.loggedOut);}catch(error){fail(error);}await paint().catch(()=>{});};
  target.querySelector('[data-remove]').onclick=()=>{
   const dialog=document.createElement('dialog');dialog.innerHTML=`<h2>${t.removeTitle}</h2><p>${t.removeBody}</p><p>${esc(status.email)}</p><div class="dialog-actions"><button class="secondary" data-no>${t.cancel}</button><button class="primary" data-yes>${t.confirm}</button></div>`;
   document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('[data-no]').onclick=()=>dialog.close();
   dialog.querySelector('[data-yes]').onclick=async()=>{busy(true,dialog);try{await api('account_delete',{});dialog.close();toast(t.removed);await paint();}catch(error){busy(false,dialog);fail(error);}};
   dialog.showModal();
  };
  if(status.syncing)setTimeout(()=>{if(target.isConnected)paint().catch(()=>{});},3000);
  try{
   const me=await api('account_me',{}),box=target.querySelector('[data-devices]');if(!box)return;
   box.innerHTML=(me.devices||[]).map(d=>`<div class="settings-row"><span><span class="settings-label">${esc(d.device)}${d.current?` · ${t.thisDevice}`:''}</span><p class="settings-help">${esc(when((d.lastUsedAt||0)*1000))}</p></span>${d.current?'':`<button class="secondary" data-revoke="${esc(d.id)}">${t.revoke}</button>`}</div>`).join('');
   box.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('account_logout',{sessionId:b.dataset.revoke});b.closest('.settings-row').remove();}catch(error){b.disabled=false;fail(error);}});
  }catch(error){const box=target.querySelector('[data-devices]');if(box)box.innerHTML=`<p class="settings-help u-status" data-state="error">${esc(errorText(t,error))}</p>`;}
 }
 /* the first account_status above also starts a background sync when the last one is older than 15 minutes */
 await paint();
}
