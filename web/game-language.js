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

// Script sources for zero-latency bilingual (user, 2026-11-09): a Chinese patch for the Japanese game, or the Japanese
// original for a patched game. Shown inside the executable dialog; the reader uses an import on the next line.
const sourceWords={
 zh:{title:'汉化脚本 · 零延迟双语',checking:'正在检查游戏脚本…',search:'重新查找',pick:'手动选择',original:'导入日文原版',clear:'移除',importing:'正在读取并对齐脚本…',searching:'正在本机查找这部作品的汉化包…',declined:'已移除自动找到的汉化包，不会再自动用回；点「重新查找」可以恢复',
  unsupported:'这部作品的引擎暂时读不了脚本（目前支持 System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（含 Steam 版加密封包）、Artemis、Ren\'Py）',patched:'当前是汉化版：导入日文原版后，显示日文，译文直接用汉化组的翻译',
  notFound:h=>'本机没找到汉化包。手动选择时，打开汉化版（或汉化补丁）的游戏根目录，选中 '+h+'；汉化补丁是单个启动程序的，直接选那个 exe',
  pickTitle:h=>'打开汉化版的游戏根目录，选中 '+h+'（或汉化启动程序 exe）',
  patchReady:n=>'已用汉化包（'+n+' 行）：译文直接用汉化组的翻译',autoReady:n=>'已自动找到本机的汉化包（'+n+' 行）：译文直接用汉化组的翻译',originalReady:'已导入日文原版：显示日文，译文使用汉化组翻译',unreliable:'找到的脚本和当前游戏版本对不上，没有启用；请换成同一版本的汉化包或原版',
  errors:{PATCH_SCRIPT_NOT_FOUND:'这里没找到对应的脚本，请按提示选中文件',PATCH_NOT_TRANSLATED:'这里的脚本还是日文，不像汉化包',PATCH_SAME_AS_RUNNING:'选的是游戏自己的文件，请选汉化版里的文件',PATCH_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选汉化版所在的文件夹',ORIGINAL_SCRIPT_NOT_FOUND:'这个文件夹里没找到对应的脚本文件',ORIGINAL_NOT_JAPANESE:'这个文件夹里的脚本不是日文',ORIGINAL_SAME_AS_RUNNING:'选的是游戏自己的文件，请选日文原版所在的文件夹',ORIGINAL_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选日文原版所在的文件夹'},failed:'导入失败'},
 en:{title:'Translation script · zero-latency bilingual',checking:'Checking the game script…',search:'Search again',pick:'Choose manually',original:'Import Japanese original',clear:'Remove',importing:'Reading and lining up the script…',searching:'Looking for a Chinese patch on this computer…',declined:'The patch found automatically was removed and will not come back by itself; Search again restores it',
  unsupported:'This engine\'s script cannot be read yet (System4, BGI / Ethornell, Steam Siglus, KiriKiri (including encrypted Steam archives), Artemis and Ren\'Py for now)',patched:'Patched edition: import the Japanese original to read Japanese with the group\'s translation',
  notFound:h=>'No Chinese patch found on this computer. To choose one, open the patched game\'s folder and select '+h+', or the patch\'s own launcher exe',
  pickTitle:h=>'Open the patched game folder and select '+h+' (or the patch launcher exe)',
  patchReady:n=>'Chinese patch in use ('+n+' lines): translations come from the group',autoReady:n=>'Found a Chinese patch on this computer ('+n+' lines): translations come from the group',originalReady:'Japanese original imported: Japanese text, group translations',unreliable:'The script found does not match this game version, so it is not used',
  errors:{PATCH_SCRIPT_NOT_FOUND:'No matching script here; select the file named above',PATCH_NOT_TRANSLATED:'This script is still Japanese',PATCH_SAME_AS_RUNNING:'These are the game\'s own files',PATCH_IS_RUNNING_COPY:'This is the game\'s own folder',ORIGINAL_SCRIPT_NOT_FOUND:'No matching script in this folder',ORIGINAL_NOT_JAPANESE:'This folder\'s script is not Japanese',ORIGINAL_SAME_AS_RUNNING:'These are the game\'s own files',ORIGINAL_IS_RUNNING_COPY:'This is the game\'s own folder'},failed:'Import failed'},
 ja:{title:'翻訳スクリプト・遅延なしの対訳',checking:'ゲームのスクリプトを確認しています…',search:'再検索',pick:'手動で選択',original:'日本語版を読み込む',clear:'解除',importing:'スクリプトを読み込んで照合しています…',searching:'この PC で中国語パッチを探しています…',declined:'自動で見つけたパッチを解除しました。再検索で元に戻せます',
  unsupported:'このエンジンのスクリプトはまだ読み込めません（現在は System4、BGI / Ethornell、Steam 版 Siglus、KiriKiri（Steam 版の暗号化アーカイブを含む）、Artemis、Ren\'Py）',patched:'翻訳版です。日本語版を読み込むと日本語で表示し、訳にパッチの翻訳を使います',
  notFound:h=>'この PC に中国語パッチは見つかりませんでした。手動の場合は翻訳版のゲームフォルダを開いて '+h+' を選択してください',
  pickTitle:h=>'翻訳版のゲームフォルダを開いて '+h+' を選択',
  patchReady:n=>'中国語パッチを使用中（'+n+' 行）',autoReady:n=>'この PC の中国語パッチを自動で見つけました（'+n+' 行）',originalReady:'日本語版を読み込みました',unreliable:'見つかったスクリプトがこのバージョンと一致しないため使っていません',
  errors:{},failed:'読み込めませんでした'}};
function mountTextSource(dialog,{id,api,invoke,locale,esc}){
 const w=sourceWords[locale]||sourceWords.zh,box=document.createElement('section');box.className='exe-bilingual';
 box.innerHTML=`<strong>${w.title}</strong><p class="settings-help" role="status" data-ts-status>${w.checking}</p><div class="exe-bilingual-actions"><button type="button" class="secondary" data-ts="search" hidden>${w.search}</button><button type="button" class="secondary" data-ts="patch" hidden>${w.pick}</button><button type="button" class="secondary" data-ts="original" hidden>${w.original}</button><button type="button" class="text-button" data-ts-clear hidden>${w.clear}</button></div>`;
 dialog.querySelector('.dialog-actions').before(box);
 const status=box.querySelector('[data-ts-status]'),searchBtn=box.querySelector('[data-ts="search"]'),patchBtn=box.querySelector('[data-ts="patch"]'),originalBtn=box.querySelector('[data-ts="original"]'),clearBtn=box.querySelector('[data-ts-clear]');
 let timer=0,last=null;
 const paint=s=>{last=s;clearTimeout(timer);searchBtn.hidden=patchBtn.hidden=originalBtn.hidden=clearBtn.hidden=true;
  if(!s||s.status==='unsupported'){status.textContent=w.unsupported;return;}
  if(s.patchStatus==='ready'){status.textContent=(s.patch?.auto?w.autoReady:w.patchReady)(s.patch?.lines||0);clearBtn.hidden=false;clearBtn.dataset.kind='patch';patchBtn.hidden=false;return;}
  if(s.mode==='original'&&s.status==='ready'){status.textContent=w.originalReady;clearBtn.hidden=false;clearBtn.dataset.kind='original';return;}
  if(s.status!=='native-japanese'){status.textContent=s.status==='unreliable'?w.unreliable:w.patched;originalBtn.hidden=false;return;}
  // The search runs by itself; while it does, the dialog checks back.
  if(s.patchSearch?.running){status.textContent=w.searching;if(dialog.open)timer=setTimeout(load,1500);return;}
  status.textContent=s.patchStatus==='unreliable'?w.unreliable:s.patchSearch?.declined?w.declined:w.notFound(s.patchHint||'');searchBtn.hidden=patchBtn.hidden=false;};
 const load=(search)=>api('text_source_status',{id,search:!!search}).then(paint,()=>paint(null));
 dialog.addEventListener('close',()=>clearTimeout(timer));
 const busy=on=>{for(const b of box.querySelectorAll('button'))b.disabled=on;};
 const run=async(kind,source)=>{busy(true);status.textContent=w.importing;
  try{paint(await api('text_source_import',{id,kind,dir:source}));}catch(error){const code=String(error?.message||error).match(/[A-Z][A-Z0-9_]{4,}/)?.[0]||'';status.textContent=w.errors[code]||sourceWords.zh.errors[code]||w.failed;}
  finally{busy(false);}};
 // Manual pick (user, 2026-11-10): the picker opens at the game and its title names the file to select.
 patchBtn.onclick=async()=>{let file;try{file=await invoke('pick_patch_file',{title:w.pickTitle(last?.patchHint||''),directory:last?.gameDir||null});}catch{return;}if(file)run('patch',file);};
 originalBtn.onclick=async()=>{let dir;try{dir=(await invoke('pick_directories',{multiple:false}))?.[0];}catch{return;}if(dir)run('original',dir);};
 searchBtn.onclick=()=>{status.textContent=w.searching;load(true);};
 clearBtn.onclick=async()=>{clearBtn.disabled=true;try{paint(await api('text_source_clear',{id,kind:clearBtn.dataset.kind}));}catch{}finally{clearBtn.disabled=false;}};
 load();
}
export async function openGameLanguage({id,api,invoke,locale,esc,toast,onChanged}){
 const [title,find,pick,close,hint,saved,searching]=labels[locale]||labels.en;
 const state=await api('game_original_executable',{id});
 const dialog=document.createElement('dialog');dialog.className='exe-dialog';
 dialog.innerHTML=`<h2>${title}</h2><p>${hint}</p><p class="exe-path" role="status" title="${esc(state.executable||'')}">${esc(state.executable||launchReason('JAPANESE_EXECUTABLE_REQUIRED',locale))}</p><label class="locale-toggle"><input type="checkbox" data-locale ${state.localeJapanese?'checked':''}><span class="review-switch" aria-hidden="true"></span><span><strong>${(localeWords[locale]||localeWords.en)[0]}</strong><small class="settings-help">${(localeWords[locale]||localeWords.en)[1]}</small></span></label><div class="dialog-actions"><button class="text-button exe-close" data-close>${close}</button><button class="secondary" data-find>${find}</button><button class="primary" data-pick>${pick}</button></div>`;
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
 mountTextSource(dialog,{id,api,invoke,locale,esc});
}
