import {launchReason} from './launch-feedback.js';
const labels={
 zh:['日文原版启动程序','自动查找原版 EXE','手动选择路径','关闭','请先准备日文原版。MeguLit 需要能正常运行的日文原版来读取游戏原文','已保存启动程序','查找中…'],
 en:['Japanese executable','Find original EXE','Choose path','Close','Prepare an installed Japanese original. MeguLit uses it to read Japanese game text.','Executable saved','Searching…'],
 ja:['日本語版の実行ファイル','日本語版 EXE を探す','パスを選択','閉じる','日本語の原文を読み込むため、日本語版のゲームを用意してください','実行ファイルを保存しました','検索中…']
};
const localeWords={zh:['以日文系统环境启动','游戏弹窗或菜单出现乱码时打开。只对这部作品生效，不改电脑设置'],en:['Start in a Japanese system environment','Turn on if the game shows garbled dialogs or menus. Applies to this game only; your PC settings are unchanged'],ja:['日本語環境で起動','ゲームのダイアログやメニューが文字化けする場合にオン。この作品だけに適用し、PC の設定は変えません']};
export const gameLanguageLabel=locale=>(labels[locale]||labels.en)[0];
const openFailed={zh:'无法读取日文原版程序设置',en:'Could not load the Japanese executable setting',ja:'日本語版の実行ファイル設定を読み込めませんでした'};
export function originalExecutableError(error,locale){const text=String(error?.message||error||''),code=(text.match(/[A-Z][A-Z0-9_]{4,}/)||[])[0]||'';return launchReason(code,locale)||(openFailed[locale]||openFailed.en)+(code?' · '+code:'');}
export async function openGameLanguage({id,api,invoke,locale,esc,toast,onChanged}){
 const [title,find,pick,close,hint,saved,searching]=labels[locale]||labels.en;
 const state=await api('game_original_executable',{id});
 const dialog=document.createElement('dialog');
 dialog.innerHTML=`<h2>${title}</h2><p>${hint}</p><p class="settings-help" role="status">${esc(state.executable||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale))}</p><label class="locale-toggle"><input type="checkbox" data-locale ${state.localeJapanese?'checked':''}><span class="review-switch" aria-hidden="true"></span><span><strong>${(localeWords[locale]||localeWords.en)[0]}</strong><small class="settings-help">${(localeWords[locale]||localeWords.en)[1]}</small></span></label><div class="dialog-actions"><button class="secondary" data-close>${close}</button><button class="secondary" data-find>${find}</button><button class="primary" data-pick>${pick}</button></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 const controls=[dialog.querySelector('[data-find]'),dialog.querySelector('[data-pick]')];
 async function save(mode){
  for(const button of controls)button.disabled=true;
  const status=dialog.querySelector('[role=status]');
  try{
   const executable=mode==='select'?await invoke('pick_executable',{directory:state.directory}):undefined;
   if(mode==='select'&&!executable)return;
   status.textContent=searching;
   await api('game_original_executable',{id,mode,executable});
   dialog.close();toast(saved);await onChanged?.();
  }catch(error){status.textContent=launchReason(error,locale)||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale);}
  finally{for(const button of controls)button.disabled=false;}
 }
 dialog.querySelector('[data-locale]').onchange=async event=>{try{await api('game_locale_mode',{id,japanese:event.target.checked});}catch{event.target.checked=!event.target.checked;}};
 controls[0].onclick=()=>save('find');controls[1].onclick=()=>save('select');
}
