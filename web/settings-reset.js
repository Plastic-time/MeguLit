// SPDX-License-Identifier: GPL-3.0-or-later
/* Settings → 数据与备份 → 危险区: reset every setting to the defaults, with a confirm dialog (focus on Cancel)
   and a 10-second undo bar. The server backs the files up before resetting (services/settings-reset.cjs). */
const words={
 zh:{zone:'危险区',title:'重置所有设置',hint:'把所有设置恢复为推荐默认值。重置前会自动备份当前设置',button:'重置所有设置…',
  dialog:'重置所有设置？',resets:'会重置：常规、外观、翻译、查词、朗读、Anki、阅读层文字与位置，以及每个作品单独保存的 Alt+T 设置（字体恢复为 Noto Sans 等默认值）',
  keeps:'不会动：游戏库、阅读记录、单词、句子、账号登录、API 密钥和翻译接口地址、界面语言',cancel:'取消',confirm:'确认重置',done:'已重置所有设置',undo:'撤销',undone:'已撤销，设置已恢复',failed:'操作失败，请稍后重试'},
 en:{zone:'Danger zone',title:'Reset all settings',hint:'Restore every setting to the recommended defaults. Your current settings are backed up first',button:'Reset all settings…',
  dialog:'Reset all settings?',resets:'Resets: general, appearance, translation, lookup, speech, Anki, reader text and position, and every work’s own Alt+T settings (fonts go back to Noto Sans and the other defaults)',
  keeps:'Keeps: your library, reading history, words, sentences, account sign-in, API keys and translation endpoints, interface language',cancel:'Cancel',confirm:'Reset now',done:'All settings were reset',undo:'Undo',undone:'Undone; your settings are back',failed:'Something went wrong. Try again later'},
 ja:{zone:'危険な操作',title:'すべての設定をリセット',hint:'すべての設定をおすすめの既定値に戻します。リセット前に現在の設定を自動でバックアップします',button:'すべての設定をリセット…',
  dialog:'すべての設定をリセットしますか？',resets:'リセットされるもの：一般・外観・翻訳・辞書・読み上げ・Anki・字幕の文字と位置、作品ごとに保存した Alt+T の設定（フォントは Noto Sans などの既定値に戻ります）',
  keeps:'変わらないもの：ライブラリ・読書履歴・単語・例文・アカウントのログイン・API キーと翻訳 API のアドレス・表示言語',cancel:'キャンセル',confirm:'リセットする',done:'すべての設定をリセットしました',undo:'元に戻す',undone:'元に戻しました',failed:'操作に失敗しました。しばらくしてからもう一度お試しください'}};
export function resetWords(locale){return words[locale]||words.zh;}
export function mountSettingsReset({target,api,locale,esc,toast,onSaved}){
 const t=resetWords(locale);
 const zone=document.createElement('section');zone.className='panel settings-danger-zone';
 zone.innerHTML=`<h3>${esc(t.zone)}</h3><div class="settings-row"><span class="settings-label">${esc(t.title)}<small class="settings-help">${esc(t.hint)}</small></span><button type="button" class="secondary danger-outline" data-reset-all>${esc(t.button)}</button></div>`;
 target.append(zone);
 const refresh=async()=>{try{const ui=await api('ui_state');for(const[key,value]of Object.entries(ui))localStorage.setItem(key,value);}catch{}try{await onSaved({scope:'reset'});}catch{}};
 zone.querySelector('[data-reset-all]').onclick=()=>{
  const dialog=document.createElement('dialog');dialog.className='settings-reset-dialog';
  dialog.innerHTML=`<h2>${esc(t.dialog)}</h2><p>${esc(t.resets)}</p><p>${esc(t.keeps)}</p><div class="dialog-actions"><button type="button" class="secondary" data-cancel autofocus>${esc(t.cancel)}</button><button type="button" class="danger" data-confirm>${esc(t.confirm)}</button></div>`;
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
  const cancel=dialog.querySelector('[data-cancel]');cancel.focus();cancel.onclick=()=>dialog.close();
  dialog.querySelector('[data-confirm]').onclick=async event=>{
   event.currentTarget.disabled=true;
   try{const result=await api('settings_reset');dialog.close();await refresh();showUndo({id:result.id});}
   catch{event.currentTarget.disabled=false;toast(t.failed);}
  };
 };
 function showUndo({id}){
  document.querySelector('.settings-reset-undo')?.remove();
  const bar=document.createElement('div');bar.className='settings-reset-undo';bar.setAttribute('role','status');
  bar.innerHTML=`<span>${esc(t.done)}</span><button type="button" class="secondary" data-undo>${esc(t.undo)} <b data-seconds>10</b></button>`;
  document.body.append(bar);let left=10;
  const timer=setInterval(()=>{left-=1;const s=bar.querySelector('[data-seconds]');if(s)s.textContent=String(left);if(left<=0){clearInterval(timer);bar.remove();}},1000);
  bar.querySelector('[data-undo]').onclick=async event=>{event.currentTarget.disabled=true;clearInterval(timer);try{await api('settings_reset_undo',{id});bar.remove();await refresh();toast(t.undone);}catch{bar.remove();toast(t.failed);}};
 }
}
