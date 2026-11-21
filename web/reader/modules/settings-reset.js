// SPDX-License-Identifier: GPL-3.0-or-later
// Alt+T 外观 → 危险区: 重置所有设置, the same reset as Settings → 数据与备份 (web/settings-reset.js), served by the
// same services/settings-reset.cjs through the reader service, so both entries reset the same files the same way.
// Same safeguards: small block at the bottom, a dialog that says what is and is not reset, focus on Cancel, a red
// confirm button, a backup before the reset and a 10-second undo. Engine independent: only menu DOM and the service.
(function installSettingsReset(){
 'use strict';
 const b=window.__tomoyoChinese;if(!b){setTimeout(installSettingsReset,200);return;}if(b.settingsResetInstalled)return;b.settingsResetInstalled=true;
 const T={
  zh:{zone:'危险区',title:'重置所有设置',hint:'把所有设置恢复为推荐默认值。重置前会自动备份当前设置',button:'重置所有设置…',
   dialog:'重置所有设置？',resets:'会重置：常规、外观、翻译、查词、朗读、Anki、阅读层文字与位置，以及每个作品单独保存的 Alt+T 设置（字体恢复为 Noto Sans 等默认值）',
   keeps:'不会动：游戏库、阅读记录、单词、句子、账号登录、API 密钥和翻译接口地址、界面语言',cancel:'取消',confirm:'确认重置',done:'已重置所有设置',undo:'撤销',undone:'已撤销，设置已恢复',failed:'操作失败，请稍后重试'},
  en:{zone:'Danger zone',title:'Reset all settings',hint:'Restore every setting to the recommended defaults. Your current settings are backed up first',button:'Reset all settings…',
   dialog:'Reset all settings?',resets:'Resets: general, appearance, translation, lookup, speech, Anki, reader text and position, and every work’s own Alt+T settings (fonts go back to Noto Sans and the other defaults)',
   keeps:'Keeps: your library, reading history, words, sentences, account sign-in, API keys and translation endpoints, interface language',cancel:'Cancel',confirm:'Reset now',done:'All settings were reset',undo:'Undo',undone:'Undone; your settings are back',failed:'Something went wrong. Try again later'},
  ja:{zone:'危険な操作',title:'すべての設定をリセット',hint:'すべての設定をおすすめの既定値に戻します。リセット前に現在の設定を自動でバックアップします',button:'すべての設定をリセット…',
   dialog:'すべての設定をリセットしますか？',resets:'リセットされるもの：一般・外観・翻訳・辞書・読み上げ・Anki・字幕の文字と位置、作品ごとに保存した Alt+T の設定（フォントは Noto Sans などの既定値に戻ります）',
   keeps:'変わらないもの：ライブラリ・読書履歴・単語・例文・アカウントのログイン・API キーと翻訳 API のアドレス・表示言語',cancel:'キャンセル',confirm:'リセットする',done:'すべての設定をリセットしました',undo:'元に戻す',undone:'元に戻しました',failed:'操作に失敗しました。しばらくしてからもう一度お試しください'}};
 const t=()=>T[window.__tomeI18n?.get?.()]||T.zh;
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const style=document.createElement('style');style.textContent=`
 .tome-reset-zone{margin:22px 0 6px;padding:10px 12px;border:1px dashed color-mix(in srgb,#d64545 45%,transparent);border-radius:10px}
 .tome-reset-zone h4{margin:0 0 6px;font-size:12px;font-weight:600;color:color-mix(in srgb,#d64545 80%,currentColor);letter-spacing:.04em}
 .tome-reset-zone .tome-reset-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
 .tome-reset-zone small{display:block;margin-top:2px;color:var(--theme-textSecondary,#aaa);font-size:11px}
 .tome-reset-zone button,.tome-reset-dialog button,.tome-reset-undo button{flex:none;padding:6px 12px;border-radius:8px;border:1px solid var(--theme-border,#44444a);background:transparent;color:inherit;font:inherit;cursor:pointer}
 .tome-reset-zone [data-reset-open]{color:#e06060;border-color:color-mix(in srgb,#d64545 50%,transparent)}
 .tome-reset-zone [data-reset-open]:hover{background:color-mix(in srgb,#d64545 12%,transparent)}
 .tome-reset-dialog{max-width:440px;padding:18px 20px;border-radius:14px;border:1px solid var(--theme-border,#34343a);background:var(--theme-surface,#18181b);color:var(--theme-text,#e8e9ec);font:13px/1.6 'Microsoft YaHei',sans-serif}
 .tome-reset-dialog::backdrop{background:#0006}
 .tome-reset-dialog h3{margin:0 0 8px;font-size:16px}
 .tome-reset-dialog .tome-reset-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
 .tome-reset-dialog [data-reset-confirm]{background:#c43c3c;border-color:#c43c3c;color:#fff}
 .tome-reset-dialog [data-reset-confirm]:hover{background:#a92f2f}
 .tome-reset-undo{inset:auto auto 28px 50%;transform:translateX(-50%);margin:0;display:flex;gap:14px;align-items:center;padding:10px 12px 10px 18px;border:0;border-radius:12px;background:#22252e;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.35);font:13px 'Microsoft YaHei',sans-serif}
 .tome-reset-undo b{font-weight:600;opacity:.7;margin-left:4px;font-variant-numeric:tabular-nums}`;
 document.head.append(style);
 const el=(tag,cls,html)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;n.dataset.noI18n='';return n;};
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 function zone(){const w=t(),z=el('section','tome-reset-zone',`<h4>${esc(w.zone)}</h4><div class="tome-reset-row"><span>${esc(w.title)}<small>${esc(w.hint)}</small></span><button type="button" data-reset-open>${esc(w.button)}</button></div>`);z.querySelector('[data-reset-open]').onclick=open;return z;}
 function mount(){const panel=document.querySelector('.tomoyo-cn-dialog [data-menu-category=misc]');if(!panel)return;const old=panel.querySelector(':scope>.tome-reset-zone');if(old&&old.dataset.lang===String(window.__tomeI18n?.get?.()||'zh')&&old===panel.lastElementChild)return;old?.remove();const z=zone();z.dataset.lang=String(window.__tomeI18n?.get?.()||'zh');panel.append(z);}
 let dialog=null,pending=null;
 function open(){
  const w=t();dialog?.remove();
  dialog=el('dialog','tome-reset-dialog',`<h3>${esc(w.dialog)}</h3><p>${esc(w.resets)}</p><p>${esc(w.keeps)}</p><div class="tome-reset-actions"><button type="button" data-reset-cancel autofocus>${esc(w.cancel)}</button><button type="button" data-reset-confirm>${esc(w.confirm)}</button></div>`);
  document.body.append(dialog);const d=dialog;d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;},{once:true});
  for(const type of ['keydown','keyup'])d.addEventListener(type,e=>e.stopPropagation());
  d.showModal();const cancel=d.querySelector('[data-reset-cancel]');cancel.focus();cancel.onclick=()=>d.close();
  d.querySelector('[data-reset-confirm]').onclick=e=>{e.currentTarget.disabled=true;pending='reset';send({type:'settingsReset'});};
 }
 let bar=null,timer=0;
 function closeBar(){clearInterval(timer);if(bar){try{bar.hidePopover?.();}catch{}bar.remove();bar=null;}}
 function note(text){closeBar();bar=el('div','tome-reset-undo',`<span>${esc(text)}</span>`);bar.setAttribute('popover','manual');bar.setAttribute('role','status');document.body.append(bar);try{bar.showPopover();}catch{}const n=bar;timer=setInterval(()=>{if(bar===n)closeBar();},3000);}
 b.settingsResetDone=id=>{pending=null;dialog?.close();const w=t();closeBar();
  bar=el('div','tome-reset-undo',`<span>${esc(w.done)}</span><button type="button" data-reset-undo>${esc(w.undo)} <b data-seconds>10</b></button>`);bar.setAttribute('popover','manual');bar.setAttribute('role','status');document.body.append(bar);try{bar.showPopover();}catch{}
  let left=10;const n=bar;timer=setInterval(()=>{left-=1;const s=n.querySelector('[data-seconds]');if(s)s.textContent=String(left);if(left<=0&&bar===n)closeBar();},1000);
  n.querySelector('[data-reset-undo]').onclick=e=>{e.currentTarget.disabled=true;clearInterval(timer);pending='undo';send({type:'settingsResetUndo',id:String(id||'')});};};
 b.settingsResetUndone=()=>{pending=null;note(t().undone);};
 b.settingsResetFailed=()=>{const was=pending;pending=null;const c=dialog?.querySelector('[data-reset-confirm]');if(c)c.disabled=false;if(was==='undo')note(t().failed);else if(!dialog)note(t().failed);else{let p=dialog.querySelector('.tome-reset-error');if(!p){p=el('p','tome-reset-error');dialog.querySelector('.tome-reset-actions').before(p);}p.textContent=t().failed;}};
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount();});};
 new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
 addEventListener('tome-language-change',schedule);schedule();
})();
