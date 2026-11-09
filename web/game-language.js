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
 zh:{title:'汉化脚本 · 零延迟双语',checking:'正在检查游戏脚本…',patch:'导入汉化包',original:'导入日文原版',clear:'移除',importing:'正在读取并对齐脚本…',
  unsupported:'这部作品的引擎暂时读不了脚本（目前支持 System4、BGI）',japanese:'当前是日文原版：导入汉化包后，每句的译文直接用汉化组的翻译，不用等翻译接口',patched:'当前是汉化版：导入日文原版后，显示日文，译文直接用汉化组的翻译',
  patchReady:n=>'已导入汉化包（'+n+' 行）：译文直接使用汉化组翻译',originalReady:'已导入日文原版：显示日文，译文使用汉化组翻译',unreliable:'导入的脚本和当前游戏版本对不上，没有启用；请换成同一版本的汉化包或原版',
  errors:{PATCH_SCRIPT_NOT_FOUND:'这个文件夹里没找到对应的脚本文件',PATCH_NOT_TRANSLATED:'这个文件夹里的脚本还是日文，不像汉化包',PATCH_SAME_AS_RUNNING:'选的是游戏自己的文件，请选汉化包所在的文件夹',PATCH_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选汉化包所在的文件夹',ORIGINAL_SCRIPT_NOT_FOUND:'这个文件夹里没找到对应的脚本文件',ORIGINAL_NOT_JAPANESE:'这个文件夹里的脚本不是日文',ORIGINAL_SAME_AS_RUNNING:'选的是游戏自己的文件，请选日文原版所在的文件夹',ORIGINAL_IS_RUNNING_COPY:'选的是游戏自己的文件夹，请选日文原版所在的文件夹'},failed:'导入失败'},
 en:{title:'Translation script · zero-latency bilingual',checking:'Checking the game script…',patch:'Import Chinese patch',original:'Import Japanese original',clear:'Remove',importing:'Reading and lining up the script…',
  unsupported:'This engine\'s script cannot be read yet (System4 and BGI for now)',japanese:'Japanese edition: import a Chinese patch and each line uses the group\'s translation at once',patched:'Patched edition: import the Japanese original to read Japanese with the group\'s translation',
  patchReady:n=>'Chinese patch imported ('+n+' lines): translations come from the group',originalReady:'Japanese original imported: Japanese text, group translations',unreliable:'The imported script does not match this game version, so it is not used',
  errors:{PATCH_SCRIPT_NOT_FOUND:'No matching script in this folder',PATCH_NOT_TRANSLATED:'This folder\'s script is still Japanese',PATCH_SAME_AS_RUNNING:'These are the game\'s own files',PATCH_IS_RUNNING_COPY:'This is the game\'s own folder',ORIGINAL_SCRIPT_NOT_FOUND:'No matching script in this folder',ORIGINAL_NOT_JAPANESE:'This folder\'s script is not Japanese',ORIGINAL_SAME_AS_RUNNING:'These are the game\'s own files',ORIGINAL_IS_RUNNING_COPY:'This is the game\'s own folder'},failed:'Import failed'},
 ja:{title:'翻訳スクリプト・遅延なしの対訳',checking:'ゲームのスクリプトを確認しています…',patch:'中国語パッチを読み込む',original:'日本語版を読み込む',clear:'解除',importing:'スクリプトを読み込んで照合しています…',
  unsupported:'このエンジンのスクリプトはまだ読み込めません（現在は System4、BGI）',japanese:'日本語版です。中国語パッチを読み込むと、各文の訳にパッチの翻訳をそのまま使います',patched:'翻訳版です。日本語版を読み込むと日本語で表示し、訳にパッチの翻訳を使います',
  patchReady:n=>'中国語パッチを読み込みました（'+n+' 行）',originalReady:'日本語版を読み込みました',unreliable:'読み込んだスクリプトがこのバージョンと一致しないため使っていません',
  errors:{},failed:'読み込めませんでした'}};
function mountTextSource(dialog,{id,api,invoke,locale,esc}){
 const w=sourceWords[locale]||sourceWords.zh,box=document.createElement('section');box.className='exe-bilingual';
 box.innerHTML=`<strong>${w.title}</strong><p class="settings-help" role="status" data-ts-status>${w.checking}</p><div class="exe-bilingual-actions"><button type="button" class="secondary" data-ts="patch" hidden>${w.patch}</button><button type="button" class="secondary" data-ts="original" hidden>${w.original}</button><button type="button" class="text-button" data-ts-clear hidden>${w.clear}</button></div>`;
 dialog.querySelector('.dialog-actions').before(box);
 const status=box.querySelector('[data-ts-status]'),patchBtn=box.querySelector('[data-ts="patch"]'),originalBtn=box.querySelector('[data-ts="original"]'),clearBtn=box.querySelector('[data-ts-clear]');
 const paint=s=>{patchBtn.hidden=originalBtn.hidden=clearBtn.hidden=true;
  if(!s||s.status==='unsupported'){status.textContent=w.unsupported;return;}
  if(s.patchStatus==='ready'){status.textContent=w.patchReady(s.patch?.lines||0);clearBtn.hidden=false;clearBtn.dataset.kind='patch';return;}
  if(s.mode==='original'&&s.status==='ready'){status.textContent=w.originalReady;clearBtn.hidden=false;clearBtn.dataset.kind='original';return;}
  const japanese=s.status==='native-japanese';status.textContent=(s.patchStatus==='unreliable'||s.status==='unreliable')?w.unreliable:japanese?w.japanese:w.patched;
  (japanese?patchBtn:originalBtn).hidden=false;};
 const load=()=>api('text_source_status',{id}).then(paint,()=>paint(null));
 const pick=async kind=>{let dir;try{dir=(await invoke('pick_directories',{multiple:false}))?.[0];}catch{return;}if(!dir)return;
  for(const b of box.querySelectorAll('button'))b.disabled=true;status.textContent=w.importing;
  try{paint(await api('text_source_import',{id,kind,dir}));}catch(error){const code=String(error?.message||error);status.textContent=(w.errors[code]||sourceWords.zh.errors[code]||w.failed)+'';}
  finally{for(const b of box.querySelectorAll('button'))b.disabled=false;}};
 patchBtn.onclick=()=>pick('patch');originalBtn.onclick=()=>pick('original');
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
