import {fitLibraryGrid} from './library-grid-fit.js';
import './primary-buttons.js';
import {embedStatus} from './embed-status.js';
import {statisticsHTML,statisticsResultsHTML,bindStatistics,bindStatisticsCharts} from './statistics-view.js';
import {renderActivity} from './learning-activity.js';
import {mountStatistics} from './statistics-grimoire.js';
import {mountHistoryTranslations} from './history-translation.js';
import {updateHomeOverview,createHomeRefresh} from './home-refresh.js';
import {recentGames} from './home-library.js';
import {historyHTML} from './history-view.js';
import {createSeriesLibrary} from './series-library.js';
import {createLibraryRefresh} from './library-refresh.js';
import {mountSettingsAutosave,leaveSettings,flushSettings} from './settings-autosave.js';
// SPDX-License-Identifier: GPL-3.0-or-later
import {messages,locales} from './i18n.js';
import {icon} from './icons.js';
import {enhanceSelects} from './select-control.js';
import {renderAnkiReview} from './anki-review.js';
import {createHomeMotion} from './home-motion.js';
import {renderGamePage} from './game-detail.js';
import {words as grimoireWords,paintGlow,stopGlow,setupMarquees,fitShelf,placeGreeting,closeDialog,toolsHTML,dockPageTools,pageEnter,subpageEnter,watchHomeFade,matchJacket,fieldify,stopField,moveTabInk} from './grimoire.js';
import {aboutHTML,aboutLabel,mountAbout,VERSION} from './about.js';
import {checkForUpdates} from './update-notice.js';
import {maybeFirstRun} from './first-run.js';
let selectedGameId='',gameOrigin='library',selectedSeriesId='';
import {renderSettings} from './settings.js';
import {openBackgroundCrop,backgroundGeometry} from './background-crop.js';

const app=document.querySelector('#app');
let model={games:[],stats:{readingSeconds:0,words:0,lookups:0},preferences:{language:'zh',accent:'#ad1539'}};
let stopHistoryTranslations=()=>{};
let route='home',subtab='',search='',pageToken=0,toastTimer;
/* v1.1.6 (user: coming back to Settings started from scratch): the last section is remembered, also across restarts */
let settingsSection=(()=>{try{return localStorage.getItem('megulit-settings-section')||'';}catch{return '';}})(),settingsProfile='';
const LIBRARY_WALL_KEY='tome-library-wall';
let libraryBusy=false,navigationTicket=0;
const libraryCopy=()=>({zh:{refresh:'刷新游戏库',settings:'游戏库设置',done:'游戏库已刷新',added:n=>'已发现 '+n+' 个新游戏'},en:{refresh:'Refresh library',settings:'Library settings',done:'Library refreshed',added:n=>'Found '+n+' new games'},ja:{refresh:'ライブラリを更新',settings:'ライブラリ設定',done:'ライブラリを更新しました',added:n=>n+' 件の新しいゲームを追加'}}[locale]);
function libraryBusyState(busy){libraryBusy=busy;const button=document.querySelector('#refresh-library');if(button){button.disabled=busy;button.setAttribute('aria-busy',String(busy));}}
const refreshLibrary=createLibraryRefresh({api:(...args)=>api(...args),onBusy:libraryBusyState,onUpdated:next=>{model=next;if(route==='library')renderGames();else if(route==='home')home();}});

let locale='zh',text=messages.zh;
let homeImageDimensions=null,backgroundPreview=null,currentBackgroundSrc='',backgroundRequest=0,backgroundEditRequest=0;
function placeBackground(){const layer=document.querySelector('.app-backdrop');if(!layer||!homeImageDimensions)return;const crop=backgroundPreview?.crop||model.background?.crop||{},g=backgroundGeometry(homeImageDimensions,crop,{width:innerWidth,height:innerHeight},model.background?.blur||0);layer.style.setProperty('--home-image-position',`${g.ox}px ${g.oy}px`);layer.style.setProperty('--home-image-size',`${Math.ceil(g.dw)}px ${Math.ceil(g.dh)}px`);}
/* v1.1.0: with no picture of the user's own, the bundled default follows the light/dark theme */
const defaultBackground=()=>document.documentElement.dataset.theme==='light'?'assets/default-background-light.webp':'assets/default-background-dark.webp';let backgroundIsDefault=false;const themeBackground=()=>{if(backgroundIsDefault)applyBackground('');};
async function applyBackground(image){const revision=++backgroundRequest;backgroundIsDefault=!image&&!backgroundPreview&&!!model.preferences.homeBackground;if(backgroundIsDefault)image=defaultBackground();if(!model.preferences.homeBackground&&!backgroundPreview)image='';const layer=document.querySelector('.app-backdrop');if(!layer)return false;if(!image){layer.style.setProperty('--home-image','none');homeImageDimensions=null;if(!backgroundPreview)currentBackgroundSrc='';return true;}try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=image;});if(revision!==backgroundRequest||!layer.isConnected)return false;layer.style.setProperty('--home-image',`url("${image}")`);homeImageDimensions=[img.naturalWidth,img.naturalHeight];if(!backgroundPreview)currentBackgroundSrc=image;placeBackground();return true;}catch{return false;}}

addEventListener('resize',placeBackground);
addEventListener('tome-background-preview',event=>{const next={...model.background,crop:{...model.background?.crop}};for(const[key,value]of Object.entries(event.detail||{})){if(key.startsWith('crop.'))next.crop[key.slice(5)]=value;else next[key]=value;}model.background=next;setAppearance();});
async function editHomeBackground(path=null){
 const ticket=++backgroundEditRequest;
 try{
  const previousImage=currentBackgroundSrc;
  // Reopen the very image painted behind the editor; never replace it with a legacy fallback.
  const src=path?await api('asset_preview',{path}):currentBackgroundSrc||await api('background');
  if(ticket!==backgroundEditRequest)return;
  if(!src){toast({zh:'请先选择背景图片',en:'Choose a background image first',ja:'先に背景画像を選択してください'}[locale]);return;}
  openBackgroundCrop({src,crop:path?{x:50,y:50,zoom:1}:model.background?.crop,blur:model.background?.blur||0,locale,
   onPreview:value=>{backgroundPreview=value;applyBackground(value?.src||previousImage);},
   onCommit:async crop=>{try{
    // Use the exact result of the save rather than racing a second background read.
    const saved=path?await api('asset_set',{slot:'home',path}):null,committedSrc=saved?.src||src;
    await api('settings_save',{scope:'background',values:{'crop.x':crop.x,'crop.y':crop.y,'crop.zoom':crop.zoom}});
    await api('save_preferences',{values:{homeBackground:true}});
    const ui=await api('ui_state');for(const[key,value]of Object.entries(ui))localStorage.setItem(key,value);
    model=await api('home');backgroundPreview=null;setAppearance();
    // The image was already decoded in the crop preview and persisted above.
    // A superseded paint is not a failed save and must not strand the crop dialog.
    if(ticket!==backgroundEditRequest)return;
    currentBackgroundSrc=committedSrc;
    await applyBackground(committedSrc);
    const main=document.querySelector('#main');if(main)delete main.__settingsData;
    renderRoute();toast(text.saved);
   }catch(error){toast(errorMessage(error));throw error;}}
  });
 }catch(error){toast(errorMessage(error));}
}

addEventListener('tome-open-home-crop',()=>editHomeBackground());
addEventListener('tome-pick-home-picture',async()=>{try{const path=await invoke('pick_image');if(path)editHomeBackground(path);}catch(error){toast(errorMessage(error));}});
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const invoke=(command,args={})=>{
  if(window.__TOME_TEST_TRANSPORT__)return window.__TOME_TEST_TRANSPORT__(command,args);
  const native=window.__TAURI_INTERNALS__?.invoke;
  if(!native)return Promise.reject(Error('DESKTOP_REQUIRED'));
  return native(command,args);
};
import {launchCopy,launchReason} from './launch-feedback.js';
const quickActions=new Set(['settings_get','vocabulary','unknown_words','home','preferences','ui_state','history','dialogue','sentences','word_trash','statistics','game_detail','reader_status']);
const api=(action,params={})=>{const request=invoke('service',{request:{action,...params}});if(!quickActions.has(action)&&action!=='launch')return request;let timer;return Promise.race([request,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('SERVICE_TIMEOUT')),action==='launch'?48000:12000);})]).finally(()=>clearTimeout(timer));};
const number=value=>new Intl.NumberFormat(locales[locale]).format(value||0);
const cover=(game,cls='cover')=>game.cover?`<img class="${cls}" src="${esc(game.cover)}" alt="" loading="lazy">`:`<div class="${cls} hero-placeholder">${icon('game')}</div>`;
function relativeTime(timestamp){
  if(!timestamp)return text.neverPlayed;
  const date=new Date(timestamp*1000),today=new Date();today.setHours(0,0,0,0);
  const time=date.toLocaleTimeString(locales[locale],{hour:'2-digit',minute:'2-digit'});
  if(date>=today)return `${text.today} ${time}`;
  const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  if(date>=yesterday)return `${text.yesterday} ${time}`;
  return date.toLocaleDateString(locales[locale],{year:'numeric',month:'short',day:'numeric'});
}
const datetime=timestamp=>timestamp?new Date(timestamp*1000).toLocaleString(locales[locale],{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):text.unknownTime;
function duration(seconds){const min=Math.floor((seconds||0)/60);return min>=60?`${Math.floor(min/60)} ${text.hours} ${min%60} ${text.minutes}`:`${min} ${text.minutes}`;}
function toast(message){clearTimeout(toastTimer);const element=document.querySelector('#toast');element.textContent=message;element.classList.add('visible');toastTimer=setTimeout(()=>element.classList.remove('visible'),4600);}
function errorMessage(error){const code=typeof error==='string'?error:error?.message;return ({LOCALE_EMULATOR_REQUIRED:({zh:'请到设置 → 游戏库安装 Locale Emulator，或浏览选择 LEProc.exe',en:'Install Locale Emulator in Settings → Library, or browse to LEProc.exe',ja:'設定 → ライブラリで Locale Emulator をインストールするか、LEProc.exe を指定してください'}[locale]),LE_X86_ONLY:({zh:'Locale Emulator 仅支持 32 位程序，请关闭此游戏的日语环境选项',en:'Locale Emulator supports 32-bit programs only',ja:'Locale Emulator は32ビット専用です'}[locale]),INVALID_IMAGE:({zh:'无法读取图片，请重新选择 PNG、JPG、WebP、GIF 或 BMP 图片',en:'Cannot read this image. Choose a PNG, JPG, WebP, GIF or BMP file',ja:'画像を読み込めません。PNG・JPG・WebP・GIF・BMP を選び直してください'}[locale]),EXECUTABLE_MISSING:text.missingExe,LOCALE_ADAPTER_PENDING:text.localePending,GAME_WINDOW_NOT_READY:({zh:"未确认稳定的游戏窗口，主页已保留，请检查游戏启动方式或单独运行游戏",en:"No stable game window was confirmed. Home remains open; check the launch mode or run the game directly",ja:"安定したゲームウィンドウを確認できません。ホームは開いたままです。起動設定を確認してください"}[locale]),GAME_LAUNCH_FAILED:text.startFailed,INVALID_EXECUTABLE:text.invalidExe,INVALID_VNDB_ID:({zh:'VNDB 编号格式不对，例如 v12345 或 https://vndb.org/v12345',en:'Enter a VNDB ID such as v12345 or https://vndb.org/v12345',ja:'VNDB の ID は v12345 や https://vndb.org/v12345 の形で入力してください'}[locale]),INVALID_TITLE:text.invalidTitle,READER_HOTKEY_IN_USE:({zh:'游戏已启动，但 Alt+T 被其他程序占用，请关闭其他 MeguLit 实例后重新打开',en:'Game launched, but Alt+T is already in use. Close other MeguLit instances and reopen',ja:'ゲームは起動しましたが Alt+T は使用中です。ほかの MeguLit を閉じて開き直してください'}[locale]),READER_START_TIMEOUT:({zh:'游戏已启动，但游戏内功能未就绪，请重新打开 MeguLit 后再试',en:'Game launched, but the in-game bridge is not ready. Reopen MeguLit and retry',ja:'ゲームは起動しましたが、ゲーム内機能の準備ができていません。MeguLit を開き直してください'}[locale]),LEGACY_TRASH_ADAPTER_PENDING:text.serviceFailed})[code]||(text.serviceFailed+(/^[A-Z_]+$/.test(code)?` (${code})`:''));}
document.addEventListener('focusin',e=>{const t=e.target;if(t?.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea')&&!t.hasAttribute('autocomplete'))t.setAttribute('autocomplete','off');});
function setAppearance(preferences=model.preferences){
  locale=['zh','ja','en'].includes(preferences.language)?preferences.language:'zh';text=messages[locale];
  document.documentElement.lang=locales[locale];
  {const theme=preferences.themeMode||'dark',was=document.documentElement.dataset.theme;document.documentElement.dataset.theme=theme;if(was&&was!==theme&&typeof themeBackground==='function')themeBackground();}
  document.documentElement.style.setProperty('--g-bar',/^#[0-9a-f]{6}$/i.test(preferences.barColor||'')?preferences.barColor:'#1a1110');
  document.documentElement.dataset.glow=preferences.glow===false?'off':'on';document.documentElement.style.setProperty('--home-font-scale',Number(preferences.homeFontScale)||1);document.documentElement.style.setProperty('--glow-speed',Number(preferences.glowSpeed)||1);
  document.documentElement.style.setProperty('--accent',preferences.accent);
  const rootStyle=document.documentElement.style,accent=preferences.accent||'#ad1539';
  for(const [key,fallback]of Object.entries({'--e-red':'#c8303c','--e-red-btn':'#b72a36','--g-wine':'#9e1b32','--g-wine-hi':'#c02a43','--g-wine-deep':'#5e0f1d'}))rootStyle.setProperty(key,accent==='#ad1539'?fallback:accent);
  const chosenFont=String(preferences.fontFamily||'').replace(/["\\;{}]/g,'');
  for(const key of ['--g-zh','--g-serif','--g-serif-ja']){if(chosenFont)rootStyle.setProperty(key,'"'+chosenFont+'",sans-serif');else rootStyle.removeProperty(key);}

  const value=preferences.accent?.slice(1)||'ad1539';const rgb=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16));
  document.documentElement.style.setProperty('--accent-light',`rgb(${rgb.map(c=>Math.round(c+(255-c)*.54)).join(',')})`);
  if(preferences.fontFamily)document.documentElement.style.fontFamily=`"${preferences.fontFamily.replace(/["\\]/g,'')}","Segoe UI","Yu Gothic UI","Microsoft YaHei UI",sans-serif`;
  else document.documentElement.style.removeProperty('font-family');
  document.documentElement.style.setProperty('--background-dim',preferences.backgroundDim??.78);
  const bg=model.background||{},clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
  document.documentElement.style.setProperty('--background-blur',clamp(bg.blur,0,40,0)+'px');
  document.documentElement.style.setProperty('--background-saturation',clamp(bg.saturate,0,200,100)+'%');
  if(Object.hasOwn(bg,'dim'))document.documentElement.style.setProperty('--background-dim',clamp(bg.dim,0,100,35)/100);
  document.documentElement.style.setProperty('--home-glass-blur',clamp(bg.glassBlur,0,40,14)+'px');
  document.documentElement.style.setProperty('--home-glass-alpha',clamp(bg.glassAlpha,0,100,55)+'%');
  document.documentElement.classList.toggle('home-glass',bg.glass!==false); /* v1.1.5: same default as Settings (on), so the switch and the screen agree */
  const reading=model.historyAppearance||{};const font=String(reading.history_font_family||'Yu Gothic').replace(/["\\;{}]/g,'');
  document.documentElement.style.setProperty('--history-font-family','"'+font+'","Yu Gothic","Microsoft YaHei",sans-serif');
  document.documentElement.style.setProperty('--history-font-size',clamp(reading.history_font_size,12,32,16)+'px');
  document.documentElement.style.setProperty('--history-line-height',clamp(reading.history_line_height,1.3,2.6,1.9));
  placeBackground();
}
/* Reader start failures (user, 2026-11-08: players only saw 「游戏内功能未就绪」 and could not tell why): say which cause it is and what to do, with the code visible. */
const READER_HINTS={
 READER_NATIVE_MISSING:{zh:'MeguLit 的游戏组件不见了，多半被杀毒软件隔离：从隔离区恢复，并把 MeguLit 文件夹加入信任后重开',en:'MeguLit game components are missing, most likely quarantined by antivirus: restore them and trust the MeguLit folder, then reopen',ja:'ゲーム用コンポーネントが見つかりません。ウイルス対策ソフトの隔離を解除し、MeguLit フォルダーを除外に追加して再起動してください'},
 READER_NATIVE_EXITED:{zh:'游戏组件启动后被关闭，多半是杀毒软件拦截：把 MeguLit 文件夹加入信任后点「重新连接」',en:'The game component was stopped right after starting, usually by antivirus: trust the MeguLit folder and press Reconnect',ja:'ゲーム用コンポーネントが停止されました。ウイルス対策ソフトで MeguLit フォルダーを除外して「再接続」を押してください'},
 READER_HOTKEY_IN_USE:{zh:'Alt+T 被别的程序占用，或开了两个 MeguLit：关掉多余的再点「重新连接」',en:'Alt+T is taken by another program or a second MeguLit: close it and press Reconnect',ja:'Alt+T が他のアプリか 2 つ目の MeguLit に使われています。閉じてから「再接続」を押してください'},
 READER_START_TIMEOUT:{zh:'游戏组件启动太慢（第一次启动或电脑较忙时常见）：稍等后点「重新连接」',en:'The game component is slow to start (common on first launch): wait a moment and press Reconnect',ja:'ゲーム用コンポーネントの起動が遅れています。少し待ってから「再接続」を押してください'}};
let readerFailures=0;
function readerNotice(error){const panel=document.querySelector('#reader-notice');if(!panel)return;panel.hidden=!error;if(!error){readerFailures=0;return;}
 const text=String(error),code=(text.match(/READER_[A-Z_]+/)||[''])[0],label={zh:'游戏内功能未就绪',en:'In-game features are not ready',ja:'ゲーム内機能が準備できていません'}[locale];
 panel.querySelector('span').textContent=label;panel.title=text;panel.querySelector('button').disabled=false;
 let detail=panel.querySelector('small');if(!detail){detail=document.createElement('small');detail.style.cssText='display:block;flex-basis:100%;margin-top:4px;font-size:12px;line-height:1.5;opacity:.85;white-space:normal';panel.insertBefore(detail,panel.querySelector('button'));}
 detail.textContent=((READER_HINTS[code]||{})[locale]||text)+(code?' ('+code+')':'');
 let copy=panel.querySelector('[data-reader-diagnostics]');
 if(readerFailures>=2&&!copy){copy=document.createElement('button');copy.type='button';copy.dataset.readerDiagnostics='';copy.textContent={zh:'复制诊断信息',en:'Copy diagnostics',ja:'診断情報をコピー'}[locale];copy.onclick=async()=>{const status=await api('reader_status').catch(e=>({error:String(e)}));const info=['MeguLit '+(document.querySelector('[data-app-version]')?.textContent||''),'error: '+text,'status: '+JSON.stringify(status),'logs: MeguLit/logs/reader-startup.log, MeguLit/logs/reader-native.log'].join('\n');try{await navigator.clipboard.writeText(info);copy.textContent={zh:'已复制，可粘贴到反馈里',en:'Copied',ja:'コピーしました'}[locale];}catch{}};panel.append(copy);}
}
let readerWaits=0;
async function waitReader(){let state;const deadline=Date.now()+(readerWaits++?20000:45000);do{state=await api('reader_status');if(state.error)throw Error(state.error);if(state.ready){readerNotice('');return state;}await new Promise(resolve=>setTimeout(resolve,120));}while(Date.now()<deadline);throw Error('READER_START_TIMEOUT');}
async function retryReader(button){button.disabled=true;try{await invoke('reader_restart');await waitReader();}catch(error){readerFailures++;readerNotice(error.message||error);}finally{button.disabled=false;}}
function shell(){
  app.setAttribute('aria-busy','false');
  app.innerHTML=`${["nw","ne","sw","se"].map(c=>`<div class="window-corner corner-${c}" data-resize="${c}" aria-hidden="true"></div>`).join('')}<div class="app-backdrop" aria-hidden="true"></div><div class="app-frame">
    <header class="titlebar"><div class="grimoire-glow" aria-hidden="true"></div>
    <img class="brand-logo" src="assets/megulit-logo.svg" alt="MeguLit" width="3424" height="1452" draggable="false">
    <nav class="nav-history" aria-label="${({zh:'页面历史',ja:'ページ履歴',en:'Page history'})[locale]}"><button type="button" class="nav-step" data-nav-step="-1" disabled aria-label="${({zh:'返回上一页',ja:'前のページへ',en:'Back'})[locale]}" title="${({zh:'返回上一页',ja:'前のページへ',en:'Back'})[locale]} (Alt+←)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5 9 12l5.5 5.5"/></svg></button><button type="button" class="nav-step" data-nav-step="1" disabled aria-label="${({zh:'前往下一页',ja:'次のページへ',en:'Forward'})[locale]}" title="${({zh:'前往下一页',ja:'次のページへ',en:'Forward'})[locale]} (Alt+→)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 15 12l-5.5 5.5"/></svg></button></nav>
    <span class="tab-ink" aria-hidden="true"></span><nav class="top-tabs" aria-label="MeguLit">${['home','library','history','learning','tools','settings','about'].map(item=>`<button class="top-tab" data-route="${item}" ${route===item?'aria-current="page"':''}>${item==='tools'?(grimoireWords[locale]||grimoireWords.zh).tools:item==='about'?(aboutLabel[locale]||aboutLabel.zh):text[item]}</button>`).join('')}</nav><div class="bar-tools" id="bar-tools"></div><div class="titlebar-end"><div class="window-actions">${[['minimize','minus'],['maximize','maximize'],['close','close']].map(([action,symbol])=>`<button class="window-action" data-window="${action}" aria-label="${text[action]}" title="${text[action]}">${icon(symbol)}</button>`).join('')}</div></div></header><aside class="reader-notice" id="reader-notice" hidden role="status"><span></span><button type="button">${{zh:'重新连接',en:'Reconnect',ja:'再接続'}[locale]}</button></aside>
    <div class="workspace"><main class="main" id="main" tabindex="-1"></main></div></div>`;
  document.querySelectorAll('[data-window]').forEach(button=>button.addEventListener('click',async()=>{try{if(route==='settings')await flushSettings().catch(()=>{});if(button.dataset.window==='close'&&model.preferences.closeAsk!==false){const choice=await closeDialog(locale);if(!choice)return;const values={closeToTray:choice.tray};if(choice.remember)values.closeAsk=false;model.preferences=await api('save_preferences',{values});}await invoke('window_action',{action:button.dataset.window});}catch(error){toast(errorMessage(error));}}));
  document.querySelectorAll('[data-route]').forEach(button=>button.addEventListener('click',()=>{navigate(button.dataset.route);}));
  if(model.preferences.homeBackground)api('background').then(image=>{if(!backgroundPreview)applyBackground(image);}).catch(()=>{});
  document.querySelector('#reader-notice button').onclick=event=>retryReader(event.currentTarget);
  /* E273 (user: the close button did nothing when maximized): the invisible top-right resize corner sat over the close
     button and swallowed the click, and resizing is a no-op while maximized. Hide the corners while maximized. */
  {const mark=()=>document.documentElement.classList.toggle('is-maximized',outerWidth>=screen.availWidth-2&&outerHeight>=screen.availHeight-2);mark();addEventListener('resize',mark);}
  document.querySelectorAll('[data-resize]').forEach(handle=>handle.addEventListener('mousedown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();invoke('window_action',{action:'resize_'+handle.dataset.resize}).catch(error=>toast(errorMessage(error)));}));
  {const end=document.querySelector('.titlebar-end'),hist=document.querySelector('.titlebar .nav-history');if(end&&hist)end.prepend(hist);}
  bindDrag();
  moveTabInk();
  document.querySelectorAll('[data-nav-step]').forEach(button=>button.addEventListener('click',()=>stepNavigation(Number(button.dataset.navStep))));updateNavButtons();
  // Mouse side buttons and Alt+arrows step through the same history.
  addEventListener('mouseup',event=>{if(event.button===3||event.button===4){event.preventDefault();stepNavigation(event.button===3?-1:1);}});
  addEventListener('keydown',event=>{if(event.altKey&&!event.ctrlKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')&&!event.target.closest?.('input,textarea,select,[contenteditable]')){event.preventDefault();stepNavigation(event.key==='ArrowLeft'?-1:1);}});
}
function bindDrag(){
 const drag=event=>{if(event.button!==0||event.detail>1||event.target.closest('button,input,select,textarea,a,summary'))return;event.preventDefault();window.__TAURI_INTERNALS__?.invoke('plugin:window|start_dragging',{label:'main'}).catch(error=>toast(errorMessage(error)));};
 const titlebar=document.querySelector('.titlebar');titlebar.addEventListener('mousedown',drag);titlebar.addEventListener('dblclick',event=>{if(!event.target.closest('button'))invoke('window_action',{action:'maximize'}).catch(error=>toast(errorMessage(error)));});
 document.querySelector('.app-frame').addEventListener('mousedown',event=>{if(event.target.matches('.app-frame,.workspace,.main'))drag(event);});
}

function empty(label,symbol='library',sub=''){const kind={[text.emptyWords]:'words',[text.emptySentences]:'sentences',[text.emptyTrash]:'trash',[text.emptyHistory]:'history',[text.emptyDialogue]:'history'}[label];if(kind)return blankPage(kind);return `<div class="empty-state">${icon(symbol)}<h2>${esc(label)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>`;}
/* v1.0.5 空状态：说明这里会出现什么、怎么让它出现，并给出可以直接点的入口 */
const BLANK={
 zh:{sentences:['句','句子','还没有收藏句子','在游戏里读到喜欢、想记住的台词，收藏下来，会连同作品名、时间和译文一起留在这里，也能做成 Anki 卡片',[['启动游戏','从游戏库打开一部作品'],['打开阅读层菜单','按 Alt+T'],['收藏这一句','当前台词会存到这里']],[['library','去游戏库 →']]],
  words:['詞','单词','生词本还是空的','在游戏里点一下不认识的词，在查词卡片上收录，它就会带着读音、释义和出处例句来到这里',[['点一下生词','阅读层里直接点'],['拖一段短语','可以查整句里的搭配'],['收录','之后可以同步到 Anki']],[['library','去游戏库 →'],['kana','先学五十音']]],
  trash:['屑','回收站','回收站是空的','从生词本删掉的词会先放在这里，不会马上消失。点「恢复」就能放回去，连同例句和掌握程度',[],[['words','← 回到单词本',1]]],
  history:['頁','历史','还没有阅读记录','每次用 MeguLit 打开游戏，读了多久、读了多少字、每一句原文和译文，都会自动记在这里，不用手动保存',[['选一部作品','游戏库里点封面'],['启动游戏','阅读层会自动接上'],['开始读','记录自动生成']],[['library','去游戏库 →']]]},
 ja:{sentences:['句','文','保存した文はまだありません','気に入った台詞を保存すると、作品名・日時・訳文と一緒にここに残り、Anki カードにもできます',[['ゲームを起動','ライブラリから作品を開く'],['読書メニューを開く','Alt+T'],['この台詞を保存','現在の台詞がここに入ります']],[['library','ライブラリへ →']]],
  words:['詞','単語','単語帳はまだ空です','ゲーム中にわからない語をクリックし、辞書カードで登録すると、読み・意味・出典の例文と一緒にここに入ります',[['語をクリック','読書レイヤーで直接'],['フレーズをドラッグ','組み合わせも調べられます'],['登録','Anki にも同期できます']],[['library','ライブラリへ →'],['kana','五十音から始める']]],
  trash:['屑','ごみ箱','ごみ箱は空です','単語帳から削除した語はいったんここに入ります。「復元」で例文や習熟度ごと戻せます',[],[['words','← 単語帳へ',1]]],
  history:['頁','履歴','読書の記録はまだありません','MeguLit でゲームを開くと、読書時間・文字数・原文と訳文が自動でここに記録されます',[['作品を選ぶ','ライブラリでカバーをクリック'],['ゲームを起動','読書レイヤーが自動で接続'],['読み始める','記録は自動で作られます']],[['library','ライブラリへ →']]]},
 en:{sentences:['句','Sentences','No saved sentences yet','Save a line you like while reading. It stays here with the game, time and translation, and can become an Anki card',[['Launch a game','Open one from the library'],['Open the reader menu','Press Alt+T'],['Save this line','The current line lands here']],[['library','Go to library →']]],
  words:['詞','Words','Your word list is empty','Click an unknown word in the game and add it from the lookup card. It arrives here with its reading, meaning and the line it came from',[['Click a word','Right in the overlay'],['Drag a phrase','Look up whole expressions'],['Add it','Sync to Anki later']],[['library','Go to library →'],['kana','Start with kana']]],
  trash:['屑','Recycle bin','The recycle bin is empty','Words you delete wait here first. Restore brings them back with their examples and progress',[],[['words','← Back to words',1]]],
  history:['頁','History','No reading yet','Every time MeguLit opens a game, reading time, characters and every line with its translation are recorded here automatically',[['Pick a game','Click a cover in the library'],['Launch it','The overlay attaches by itself'],['Start reading','Records appear automatically']],[['library','Go to library →']]]}
};
function blankPage(kind){const [glyph,eyebrow,title,lede,steps,acts]=(BLANK[locale]||BLANK.zh)[kind],nums=['壱','弐','参'];
 return `<section class="g-blank"><span class="glyph" aria-hidden="true">${glyph}</span><div class="eyebrow">${esc(eyebrow)}</div><h2>${esc(title)}</h2><p class="lede">${esc(lede)}</p>${steps.length?`<div class="steps">${steps.map(([b,s],i)=>`<div><i>${nums[i]}</i><b>${esc(b)}</b>${esc(s)}</div>`).join('')}</div>`:''}<div class="acts">${acts.map(([to,label,alt],i)=>`<button type="button" class="${i||alt?'alt':'go'}" data-blank-go="${to}">${esc(label)}</button>`).join('')}</div></section>`;}
document.addEventListener('click',event=>{const b=event.target.closest?.('[data-blank-go]');if(!b)return;const to=b.dataset.blankGo;if(to==='library')navigate('library');else navigate('learning',to==='kana'?'kana':'words');});
function heading(title,tools=''){return `<div class="page-header"><h1>${esc(title)}</h1><div class="page-tools">${tools}</div></div>`;}
function card(game,library=false){
 const copy={zh:{hook:'Hook 可用',pending:'Hook 待实测',unsupported:'Hook 未适配',hookHint:'依据已有作品适配记录；实时连接状态请在游戏内查看',reading:'累计阅读',words:'关联单词',engine:'游戏引擎',last:'上次游玩',details:'点击查看详情'},en:{hook:'Hook supported',pending:'Hook unverified',unsupported:'Hook unsupported',hookHint:'From the saved compatibility record; check live status in game',reading:'Total reading',words:'Linked words',engine:'Engine',last:'Last played',details:'Click for details'},ja:{hook:'Hook 対応',pending:'Hook 未検証',unsupported:'Hook 未対応',hookHint:'保存済みの対応情報です。現在の接続はゲーム内で確認できます',reading:'累計読書',words:'関連単語',engine:'エンジン',last:'前回のプレイ',details:'クリックで詳細'}}[locale],embed=embedStatus(game,locale),hook=embed.label;
 return `<div class="${library?'library-card':''}"><button class="game-card" data-game="${esc(game.id)}" aria-label="${esc(game.title)}"><span class="cover-frame">${cover(game)}${library?`<span class="game-hover"><strong>${esc(game.title)}</strong>${game.engine?`<span>${copy.engine} · ${esc(game.engine)}</span>`:''}<span>${copy.last} · ${relativeTime(game.lastPlayedAt)}</span><span>${copy.reading} · ${duration(game.readingSeconds)}</span><span>${copy.words} · ${number(game.learnedWords||0)}</span><small>${copy.details} →</small></span>`:''}</span><span class="game-caption mq-box"><span class="mq">${esc(game.title)}</span></span>${library?`<span class="library-card-meta"><span class="hook-support ${embed.kind==='verified'||embed.kind==='supported'?'supported':embed.kind==='unsupported'?'unsupported':'pending'}" title="${esc(embed.tooltip)}">${game.available?hook:({zh:"游戏已删除或移动",ja:"削除または移動済み",en:"Game deleted or moved"})[locale]}</span><span class="library-card-numbers"><span title="${copy.reading}">${icon('clock')}${duration(game.readingSeconds)}</span><span title="${copy.words}">${icon('word')}${number(game.learnedWords||0)}</span></span></span>`:''}</button></div>`;
}

let stopShelf=()=>{};
function home(){
  const main=document.querySelector('#main'),hour=new Date().getHours(),w=grimoireWords[locale]||grimoireWords.zh;
  const scroll=main.scrollTop;
  const greeting=(hour>=5&&hour<12?text.morning:hour>=12&&hour<18?text.afternoon:text.evening).split(/[，,、]/)[0];
  const available=model.games.filter(game=>game.available!==false),played=recentGames(available),game=played[0];
  // The shelf fills the window: recently played first, then the rest of the library by last play time.
  const recent=[...played,...available.filter(g=>!played.includes(g)).sort((a,b)=>(b.lastLaunchedAt||b.lastPlayedAt||0)-(a.lastLaunchedAt||a.lastPlayedAt||0))].slice(0,16);
  const date=new Date().toLocaleDateString(locales[locale],{month:'long',day:'numeric',weekday:'long'});
  const greet=`<p class="greet"><b class="greet-hello">${esc(greeting)}${model.preferences.username?`${locale==='en'?', ':locale==='ja'?'、':'，'}<span class="greet-name">${esc(model.preferences.username)}</span>`:''}</b><span class="greet-date">${esc(date)}</span></p>`;
  const parts=seconds=>{const m=Math.floor((seconds||0)/60);return m>=60?[number(Math.floor(m/60)),`${w.hour} ${m%60} ${w.min}`]:[number(m),w.min];};
  const [rn,ru]=parts(model.stats.readingSeconds);
  const today=`<aside class="today" aria-label="${w.today}">${greet}<div class="today-head">${w.today}</div>
    <button class="fig" data-stats><span class="fig-value">${rn}<small>${ru}</small></span><span class="fig-label">${w.read}</span></button>
    <button class="fig" id="view-words"><span class="fig-value">${number(model.stats.words)}<small>${w.unitWord}</small></span><span class="fig-label">${w.words}</span></button>
    <button class="fig" data-stats><span class="fig-value">${number(model.stats.lookups)}<small>${w.unitTimes}</small></span><span class="fig-label">${w.lookups}</span></button>
    <button class="g-link" id="view-statistics">${w.full}${icon('arrow')}</button></aside>`;
  let hero;
  if(game){const embed=embedStatus(game,locale),kind=embed.kind==='verified'||embed.kind==='supported'?'ok':embed.kind==='unsupported'?'bad':'wait',[gn,gu]=parts(game.readingSeconds);
   hero=`<section class="g-hero" data-hero="${esc(game.id)}"><div class="jacket">${cover(game,'jacket-img')}<span class="ribbon" aria-hidden="true"></span></div>
    <div class="hero-copy"><p class="kicker">${w.kicker}</p><div role="heading" aria-level="1" class="hero-title" title="${esc(game.title)}">${esc(game.title)}</div>
     <div class="hero-meta"><span>${relativeTime(game.lastPlayedAt)}</span>${game.engine?`<span>${esc(game.engine)}</span>`:''}<span title="${esc(embed.tooltip)}"><i class="status-dot ${kind}"></i>${esc(embed.label)}</span></div>
     <div class="hero-figs"><div><b>${gn}<small>${gu}</small></b><span>${w.total}</span></div><div><b>${number(game.characters||0)}</b><span>${w.chars}</span></div><div><b>${number(game.learnedWords||0)}</b><span>${w.linked}</span></div></div>
     <div class="hero-actions"><button class="g-btn primary" data-launch="${esc(game.id)}">${icon('play')}${text.continue}</button><button class="g-btn quiet" data-game="${esc(game.id)}">${text.detail}</button></div></div>${today}</section>`;}
  else hero=`<section class="g-hero empty"><div class="hero-copy"><div role="heading" aria-level="1" class="hero-title">${w.empty}</div><div class="hero-meta">${w.emptySub}</div><div class="hero-actions">${model.games.length?'':`<button class="g-btn primary" id="home-add">${icon('plus')}${text.addGame}</button>`}</div></div>${today}</section>`;
  const shelf=recent.map(g=>`<div class="book"><div class="jk"><button class="cover-btn" data-game="${esc(g.id)}" title="${esc(g.title)}">${cover(g,'book-img')}</button></div><span class="mq-box"><span class="mq">${esc(g.title)}</span></span><span class="sub">${relativeTime(g.lastPlayedAt)}</span></div>`).join('');
  const markup=`<div class="home-overview grimoire-home">${hero}
   <section class="home-library-section"><div class="g-head"><h2>${w.recent}</h2><button class="g-link" id="view-library">${w.all}${icon('arrow')}</button></div>${recent.length?`<div class="shelf">${shelf}</div>`:''}</section></div><div id="home-activity"></div>`;
  const changed=updateHomeOverview(main,markup);
  refreshHomeActivity().catch(()=>{});
  paintGlow(game?.cover||'');
  if(!changed)return;
  main.querySelector('#view-library')?.addEventListener('click',()=>navigate('library'));
  main.querySelector('#home-add')?.addEventListener('click',()=>editGame());
  maybeFirstRun({gamesCount:model.games.length,api,invoke,locale,esc,toast,onDone:()=>renderRoute()});
  main.querySelector('#view-words')?.addEventListener('click',()=>navigate('learning','words'));
  main.querySelector('#view-statistics')?.addEventListener('click',()=>navigate('statistics'));
  main.querySelectorAll('[data-stats]').forEach(b=>b.addEventListener('click',()=>navigate('statistics')));
  attachGameActions(main);stopShelf();stopShelf=fitShelf(main.querySelector('.shelf'));watchHomeFade(main);
  requestAnimationFrame(()=>matchJacket(main));
  main.scrollTop=scroll;
}
const homeView=()=>route==='home'?pageToken:null;
const refreshHomeActivity=createHomeRefresh({load:()=>{const target=document.querySelector('#home-activity'),date=target?.dataset.activityDate,range=target?.dataset.activityRange;return range==='day'?api('statistics',{range,date}).then(data=>data.buckets):api('learning_activity',{range,date});},view:()=>route==='home'?pageToken+':'+(document.querySelector('#home-activity')?.dataset.activityRange||'year')+':'+(document.querySelector('#home-activity')?.dataset.activityDate||''):null,apply:records=>{const target=document.querySelector('#home-activity');if(target)renderActivity(target,records,{locale,esc,duration,number},api);}});
const refreshFocusedHome=createHomeRefresh({load:()=>api('home'),view:homeView,apply:next=>{model=next;home();}});

function attachGameActions(main){
  main.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>gameDetail(button.dataset.game)));
  main.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>editGame(button.dataset.edit)));
  main.querySelectorAll('[data-launch]').forEach(button=>button.addEventListener('click',()=>startGame(button.dataset.launch,button)));
}
let launchInFlight=false,pendingHomeGame='';
const playHomeMotion=createHomeMotion({frame:()=>document.querySelector('.app-frame'),reduced:()=>matchMedia('(prefers-reduced-motion:reduce)').matches});
async function collapseHome(){await invoke('window_action',{action:'enter_overlay'});}
async function startGame(id,button){
 if(launchInFlight)return;
 launchInFlight=true;if(button)button.disabled=true;
 let started=false;
 try{
  await invoke('reader_open',{background:true});
  const result=await api('launch',{id});started=true;await waitReader();
  toast(result.action==='focused'?text.focusDone:result.action==='running'?text.runningDone:text.launchDone);
  /* v1.1.6 (user): launching a game no longer hides the home window; the game is just brought to the front */
  api('focus_game',{id}).catch(()=>{});model=await api('home');if(route==='home')home();
 }catch(error){
  const code=typeof error==='string'?error:error?.message;
  const [failure,close]=launchCopy(locale),title=started?({zh:'游戏已启动，MeguLit 连接失败',ja:'ゲームは起動済みです。MeguLit の接続に失敗しました',en:'Game started. MeguLit could not connect.'})[locale]:failure,reason=launchReason(code,locale)||errorMessage(error);
  const dialog=modal('<h2>'+title+'</h2><p>'+esc(reason)+'</p><div class="dialog-actions"><button class="secondary" data-launch-close>'+close+'</button></div>');
  dialog.querySelector('[data-launch-close]').onclick=()=>dialog.close();
  if(code==='JAPANESE_EXECUTABLE_REQUIRED'){
   const {gameLanguageLabel,openGameLanguage}=await import('./game-language.js');
   if(dialog.open){const choose=document.createElement('button');choose.className='secondary';choose.textContent=gameLanguageLabel(locale);choose.onclick=()=>{dialog.close();openGameLanguage({id,api,invoke,locale,esc,toast,onChanged:async()=>{model=await api('home');renderRoute();}}).catch(()=>toast(text.serviceFailed));};dialog.querySelector('.dialog-actions').append(choose);}
  }
 }finally{launchInFlight=false;if(button)button.disabled=false;}
}

const seriesUI=createSeriesLibrary({model:()=>model,locale:()=>locale,text:()=>text,esc,icon,api,invoke,card,modal,duration,number,relativeTime,search:()=>search,toast,bindGames:attachGameActions,onLibraryRendered:showLibraryResults,openSeries:id=>{selectedSeriesId=id;navigate('series');},back:()=>navigate('library'),reload:async()=>{model=await api('home');const main=document.querySelector('#main'),scroll=main.scrollTop;if(route==='library')renderGames();else if(route==='series')seriesUI.renderDetail(main,selectedSeriesId);main.scrollTop=scroll;}});
function library(){
  const main=document.querySelector('#main');
  main.innerHTML=heading(text.library,`<span class="lib-left"></span><input id="game-search" type="search" placeholder="${text.searchGames}" aria-label="${text.searchGames}" value="${esc(search)}"><button class="icon-button" id="refresh-library" aria-label="${libraryCopy().refresh}" title="${libraryCopy().refresh}" aria-busy="${libraryBusy}" ${libraryBusy?'disabled':''}>${icon('refresh')}</button><button class="icon-button" id="library-settings" aria-label="${libraryCopy().settings}" title="${libraryCopy().settings}">${icon('settings')}</button><button class="icon-button" id="select-games" aria-label="${text.series.select}" title="${text.series.select}">${icon('multiselect')}</button><button class="icon-button" id="add-game" aria-label="${text.addGame}">${icon('plus')}</button>`)+`<div id="library-results"></div>`;
  const input=main.querySelector('#game-search');
  const wallToggle=document.createElement('button');
  const wallLabel={zh:'无限墙',en:'Infinite wall',ja:'無限ウォール'}[locale];
  wallToggle.type='button';wallToggle.className='library-wall-toggle';import('./library-switch-motion.js').catch(()=>{});
  wallToggle.setAttribute('role','switch');wallToggle.setAttribute('aria-label',wallLabel);
  wallToggle.setAttribute('aria-checked',String(localStorage.getItem(LIBRARY_WALL_KEY)!=='off'));
  wallToggle.onclick=async()=>{
    // E275: ignore clicks while a switch is running, otherwise the stored state and the shown layout drift apart
    let motion=null;try{motion=await import('./library-switch-motion.js');}catch{}
    if(motion?.isBusy())return;
    const enabled=wallToggle.getAttribute('aria-checked')!=='true';
    localStorage.setItem(LIBRARY_WALL_KEY,enabled?'on':'off');
    wallToggle.setAttribute('aria-checked',String(enabled));
    if(motion)motion.switchLibrary(enabled,()=>renderGames()).catch(()=>renderGames());else renderGames();
  };

  const pod=document.createElement('div'),left=document.createElement('span'),right=document.createElement('span');
  pod.className='field-search';left.className=right.className='side';
  left.append(main.querySelector('#refresh-library'),main.querySelector('#library-settings'),wallToggle);
  right.append(main.querySelector('#select-games'),main.querySelector('#add-game'));
  pod.append(left,input,right);main.append(pod);main.classList.add('field-page');
  const searchAppearance=()=>main.classList.toggle('searching',document.activeElement===input||!!input.value);
  input.addEventListener('focus',searchAppearance);
  input.addEventListener('blur',searchAppearance);
  let searchTimer=0;input.addEventListener('input',()=>{search=input.value;main.classList.toggle('searching',!!search);clearTimeout(searchTimer);searchTimer=setTimeout(()=>{if(input.isConnected)renderGames();},140);});
  input.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    event.preventDefault();
    input.value='';
    input.dispatchEvent(new Event('input'));
    input.blur();
  });
  searchAppearance();
  main.querySelector('#select-games').onclick=()=>seriesUI.toggleSelection(main.querySelector('#library-results'));main.querySelector('#add-game').addEventListener('click',()=>editGame());main.querySelector('#refresh-library').onclick=()=>refreshLibrary().then(result=>toast(result.added?libraryCopy().added(result.added):libraryCopy().done)).catch(error=>toast(errorMessage(error)));main.querySelector('#library-settings').onclick=()=>{settingsSection='library';settingsProfile='';navigate('settings');};renderGames();
  /* v1.1.6 (user): opening the library straight into the wall plays the same outside-in gathering as switching to it */
  /* hidden from the first paint (cards start at opacity 0) and revealed only once each card holds its start frame, so the laid-out wall never flashes */
  if(localStorage.getItem(LIBRARY_WALL_KEY)!=='off'&&!search.trim()&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const h0=document.querySelector('#library-results');h0?.classList.add('lib-entering');const reveal=()=>document.querySelector('#library-results')?.classList.remove('lib-entering');setTimeout(reveal,900);requestAnimationFrame(()=>requestAnimationFrame(async()=>{try{const m=await import('./library-switch-motion.js');const h=document.querySelector('#library-results');if(h&&route==='library')m.wallIn(h);}catch{}finally{reveal();}}));}
}
// E245.5 (user): entering a search, the wall fades out in place as dominoes from the centre outwards, then the matches
// fade in on the orbit; clearing it, the orbit fades out, then the wall returns as dominoes from the edges inwards.
let gameTransition=null;
function renderGames(){
  const host=document.querySelector('#library-results');if(!host)return;
  if(gameTransition){gameTransition.cancel();gameTransition=null;}
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches,plane=host.querySelector('.field-plane');
  const orbit=host.classList.contains('field-orbit'),wall=!!plane&&!orbit&&!host.querySelector('.field-feature'),filtered=!!search.trim();
  const cells=plane?[...plane.children]:[];
  if(!animate||!cells.length||!((wall&&filtered)||(orbit&&!filtered)))return renderGamesNow();
  const b=host.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
  const dist=cells.map(c=>{const r=c.getBoundingClientRect();return Math.hypot(r.left+r.width/2-cx,r.top+r.height/2-cy);}),max=Math.max(1,...dist);
  /* E272: leaving the orbit, covers fall back into the capsule (reverse of their entrance) */
  const runs=cells.map((c,i)=>{const n=c.firstElementChild||c;if(wall)return n.animate([{opacity:1,transform:'none'},{opacity:0,transform:'scale(.9)'}],{duration:260,delay:dist[i]/max*360,easing:'ease-in',fill:'forwards'});const r=c.getBoundingClientRect(),ox=r.left+r.width/2-cx,oy=r.top+r.height/2-cy,ol=Math.hypot(ox,oy)||1,push=Math.max(innerWidth,innerHeight)*.35;return n.animate([{opacity:1,transform:'none'},{opacity:0,transform:`translate(${ox/ol*push}px,${oy/ol*push}px) scale(1.04)`}],{duration:380,delay:dist[i]/max*80,easing:'cubic-bezier(.55,0,.8,.3)',fill:'forwards'});}); /* E273 (user): clearing the search, orbit covers fly outward, never into the capsule */
  let done=false;const finish=()=>{if(done)return;done=true;gameTransition=null;renderGamesNow(orbit&&!filtered?'domino':'fresh');};
  gameTransition={cancel(){runs.forEach(r=>r.cancel());done=true;}};
  Promise.all(runs.map(r=>r.finished)).then(finish,()=>{});setTimeout(finish,wall?(260+360)*.82:300); /* E271 overlap: no blank frame between out and in */
}
function renderGamesNow(mode=''){
  const host=document.querySelector('#library-results');
  if(!host)return;
  const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const oldSingle=host.querySelector('.field-feature > [data-member-id]');
  const oldRect=oldSingle?.getBoundingClientRect();
  const wallCards=animate&&!oldSingle?[...host.querySelectorAll('.field-plane > [data-member-id]')].map(card=>({card,rect:card.getBoundingClientRect()})):[];
  // E245.3: covers that stay on screen fly from where they were (orbit <-> orbit, orbit <-> single); the orbit skips its
  // grow-from-centre entrance when it inherits covers.
  const wasOrbit=host.classList.contains('field-orbit');
  window.__megulitOrbitWarm=mode!=='fresh'&&animate&&(wallCards.length>0||!!oldSingle);
  seriesUI.renderLibrary(host);
  if(!animate)return;
  if(mode==='domino'){dominoIn(host,host.getBoundingClientRect());return;}
  if(mode==='fresh'){
    /* E271 (user: entering a search looked like it hitched): the new results appeared all at once on the frame their
       covers finished decoding. Hold them invisible until the covers decode (at most 160 ms), then let them grow in from
       the centre outward, mirroring the wall that just left. The orbit keeps its own entrance. */
    if(host.classList.contains('field-orbit'))return;
    const cards=[...host.querySelectorAll('.field-plane > [data-member-id], .field-feature > [data-member-id]')];if(!cards.length)return;
    const inners=cards.map(c=>c.firstElementChild||c);inners.forEach(n=>{n.style.opacity='0';});
    const imgs=[...host.querySelectorAll('img')].slice(0,80);
    Promise.race([Promise.all(imgs.map(i=>i.decode?.().catch(()=>{}))),new Promise(r=>setTimeout(r,160))]).then(()=>requestAnimationFrame(()=>{
      const b=host.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;
      const dist=cards.map(c=>{const r=c.getBoundingClientRect();return Math.hypot(r.left+r.width/2-cx,r.top+r.height/2-cy);}),max=Math.max(1,...dist);
      inners.forEach((n,i)=>{n.style.opacity='';n.animate([{opacity:0,transform:'scale(.88)'},{opacity:1,transform:'none'}],{duration:420,delay:dist[i]/max*320,easing:'cubic-bezier(.22,.72,.24,1)',fill:'backwards'});});
    }));
    return;
  }
  const single=host.querySelector('.field-feature > [data-member-id]');
  if(oldSingle&&oldSingle.dataset.memberId===single?.dataset.memberId)return; /* E276.1: orbit -> orbit has no single on either side; undefined===undefined used to skip every orbit change */
  const bounds=host.getBoundingClientRect();
  const matching=(id,cards)=>cards.filter(({card})=>card.dataset.memberId===id).reduce((closest,{card,rect})=>{
    const distance=Math.hypot(rect.left+rect.width/2-bounds.left-bounds.width/2,rect.top+rect.height/2-bounds.top-bounds.height/2);
    return !closest||distance<closest.distance?{card,rect,distance}:closest;
  },null);
  if(single){
    animateFeatureCard(single,matching(single.dataset.memberId,wallCards)?.rect,bounds);
  }else if(host.classList.contains('field-orbit')){
    // E245.4: entering the orbit, covers that did not match scatter out of the window as ghosts; matches fly into place.
    const before=oldSingle?[{card:oldSingle,rect:oldRect}]:wallCards,kept=new Set();
    const cx0=bounds.left+bounds.width/2,cy0=bounds.top+bounds.height/2,far0=Math.max(innerWidth,innerHeight)*.55;let fresh=0;
    for(const card of host.querySelectorAll('.field-plane > [data-member-id]')){const from=matching(card.dataset.memberId,before);if(from){kept.add(from.card);flyInner(card,from.rect);continue;}
      /* E276 (user): a cover that comes back into the results flies in from outside onto the orbit */
      const inner=card.firstElementChild;if(!inner)continue;const r=card.getBoundingClientRect(),dx=r.left+r.width/2-cx0,dy=r.top+r.height/2-cy0,l=Math.hypot(dx,dy)||1;
      inner.animate([{transform:`translate(${dx/l*far0}px,${dy/l*far0}px) scale(1.05)`,opacity:0},{transform:'none',opacity:1}],{duration:640,delay:Math.min(240,fresh++*45),easing:'cubic-bezier(.16,.84,.3,1)',fill:'backwards'});}
    /* E276 (user): covers that drop out of a narrowing search fly outward off the window */
    if(wasOrbit)scatterGhosts(before.filter(x=>!kept.has(x.card)),bounds);
  }else if(wasOrbit&&!search.trim()){
    // leaving the orbit: orbit covers fly out, then the wall returns from the edges inwards like dominoes
    dominoIn(host,bounds);
  }else if(oldSingle){
    const match=matching(oldSingle.dataset.memberId,[...host.querySelectorAll('.field-plane > [data-member-id]')].map(card=>({card,rect:card.getBoundingClientRect()})));
    if(match)animateFeatureCard(match.card,oldRect,bounds);
    else host.querySelector('.field-plane')?.animate([{opacity:.35},{opacity:1}],{duration:250,easing:'ease-out'});
  }
}
function scatterGhosts(cards,bounds){
  if(!cards.length)return;const layer=document.createElement('div');layer.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';layer.style.clipPath=`inset(${Math.max(0,bounds.top)}px ${Math.max(0,innerWidth-bounds.right)}px ${Math.max(0,innerHeight-bounds.bottom)}px ${Math.max(0,bounds.left)}px)`; /* stay inside the library, never over the top bar */document.body.append(layer);
  const cx=bounds.left+bounds.width/2,cy=bounds.top+bounds.height/2,far=Math.hypot(innerWidth,innerHeight);let done=0;
  for(const {card,rect} of cards.slice(0,80)){const g=card.cloneNode(true);g.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;transform:none;opacity:1`;layer.append(g);
   const dx=rect.left+rect.width/2-cx,dy=rect.top+rect.height/2-cy,len=Math.hypot(dx,dy)||1,push=far*.55;
   g.animate([{transform:'none',opacity:1},{transform:`translate(${dx/len*push}px,${dy/len*push}px) scale(.85)`,opacity:0}],{duration:460+Math.random()*120,easing:'cubic-bezier(.55,0,.8,.3)',fill:'forwards'}).onfinish=()=>{if(++done>=Math.min(80,cards.length))layer.remove();};}
}
function dominoIn(host,bounds){
  const cx=bounds.left+bounds.width/2,cy=bounds.top+bounds.height/2,cards=[...host.querySelectorAll('.field-plane > [data-member-id]')].map(card=>{const r=card.getBoundingClientRect(),dx=r.left+r.width/2-cx,dy=r.top+r.height/2-cy;return {card,dx,dy,d:Math.hypot(dx,dy)};});
  const max=Math.max(1,...cards.map(c=>c.d));
  for(const {card,dx,dy,d} of cards){const inner=card.firstElementChild;if(!inner)continue;const len=d||1,out=Math.max(innerWidth,innerHeight)*.5;
   /* E272: a short settle from just outside instead of a long flight, no idle lead-in */const k=Math.min(70,out*.12);inner.animate([{transform:`translate(${dx/len*k}px,${dy/len*k}px) scale(.9)`,opacity:0},{transform:'none',opacity:1}],{duration:560,delay:(1-d/max)*380,easing:'cubic-bezier(.16,.84,.3,1)',fill:'backwards'});}
}
function flyInner(card,from){
  const inner=card.firstElementChild;if(!inner)return;const to=card.getBoundingClientRect();
  if(!from||!to.width){inner.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'none'}],{duration:420,easing:'cubic-bezier(.22,.72,.24,1)'});return;}
  const x=from.left+from.width/2-to.left-to.width/2,y=from.top+from.height/2-to.top-to.height/2,k=from.width/to.width;
  inner.animate([{transform:`translate(${x}px,${y}px) scale(${k})`},{transform:'none'}],{duration:560,easing:'cubic-bezier(.22,.72,.24,1)'});
}
function animateFeatureCard(card,from,bounds){
  const to=card.getBoundingClientRect(),base=getComputedStyle(card).transform;
  const scale=from?.width&&to.width?from.width/to.width:.68;
  const x=(from?.width?from.left+from.width/2:bounds.left+bounds.width/2)-to.left-to.width/2;
  const y=(from?.height?from.top+from.height/2:bounds.top+bounds.height/2)-to.top-to.height/2;
  const transform=base==='none'?'':base;
  card.animate([{transform:`translate(${x}px,${y}px) scale(${scale}) ${transform}`,opacity:.66},{transform:base,opacity:getComputedStyle(card).opacity}],{duration:330,easing:'cubic-bezier(.22,.72,.24,1)'});
}
let stopSimpleGrid=()=>{};
function showLibraryResults(grid,selecting){
  stopSimpleGrid();stopSimpleGrid=()=>{};
  const host=grid.parentElement,main=host.closest('.main');
  const wall=!selecting&&localStorage.getItem(LIBRARY_WALL_KEY)!=='off';
  host.classList.toggle('lib-field',wall);
  host.classList.toggle('lib-list',!wall);
  if(!wall)stopSimpleGrid=fitLibraryGrid(grid);
  host.classList.toggle('lib-selecting',selecting);
  main.classList.toggle('field-list',!wall);
  main.classList.toggle('field-selecting',selecting);
  const single=wall&&!!search.trim()&&grid.childElementCount===1&&grid.firstElementChild.hasAttribute('data-member-id');
  main.classList.toggle('field-single',single);
  if(single){
    stopField();grid.classList.add('field-feature');
    grid.firstElementChild.draggable=false;
    grid.querySelectorAll('img').forEach(img=>{img.draggable=false;});
    return;
  }
  if(wall){fieldify(grid,!!search.trim());return;}
  stopField();
  if(selecting)grid.querySelectorAll('[draggable],img').forEach(node=>{node.draggable=false;});
}

// E237 Tools → restore Japanese: list library games that ship Japanese data, check one, then apply or undo.
function japaneseRestore(){
 const w={zh:{title:'日文原版恢复',search:'搜索游戏',nomatch:'没有匹配的游戏',sub:'游戏自带日文数据时，把显示的文字换回日文。会先备份，可以随时还原。请先关闭游戏',pick:'选择游戏',none:'游戏库里没有找到带日文数据的游戏',check:'检测中…',apply:'恢复日文',undo:'还原',close:'关闭',working:'处理中…',
  st:{restorable:n=>'可以恢复：'+n.files+' 个文件，'+n.cells.toLocaleString()+' 处文字',applied:()=>'已经恢复为日文',already:()=>'已经是日文，不需要恢复',unsupported:()=>'这个游戏按语言分文件存放，暂不支持',none:()=>'没有找到日文数据，只能使用日文原版',missing:()=>'找不到游戏目录'},
  done:n=>'已恢复 '+n.applied+' 个文件',undone:n=>n.skipped.length?'已还原 '+n.restored+' 个，'+n.skipped.length+' 个文件被游戏更新改过，保留未动':'已还原 '+n.restored+' 个文件',errs:{GAME_RUNNING:'游戏正在运行，请先关闭游戏',NOTHING_TO_RESTORE:'没有需要恢复的内容',NOT_APPLIED:'这个游戏还没有恢复过'}},
  en:{title:'Restore Japanese original',search:'Search games',nomatch:'No matching game',sub:'When a game ships its Japanese text, switch the displayed text back to Japanese. Backed up first; undo any time. Close the game first',pick:'Game',none:'No game in the library ships Japanese data',check:'Checking…',apply:'Restore Japanese',undo:'Undo',close:'Close',working:'Working…',
  st:{restorable:n=>'Restorable: '+n.files+' files, '+n.cells.toLocaleString()+' strings',applied:()=>'Restored to Japanese',already:()=>'Already Japanese',unsupported:()=>'This game stores each language in separate files; not supported yet',none:()=>'No Japanese data found; use the Japanese release',missing:()=>'Game folder not found'},
  done:n=>'Restored '+n.applied+' files',undone:n=>n.skipped.length?'Undid '+n.restored+'; '+n.skipped.length+' files changed by a game update were left alone':'Undid '+n.restored+' files',errs:{GAME_RUNNING:'The game is running; close it first',NOTHING_TO_RESTORE:'Nothing to restore',NOT_APPLIED:'This game has not been restored'}},
  ja:{title:'日本語原版に戻す',search:'ゲームを検索',nomatch:'一致するゲームがありません',sub:'ゲームに日本語データが入っている場合、表示テキストを日本語に戻します。先にバックアップし、いつでも元に戻せます。先にゲームを閉じてください',pick:'ゲーム',none:'日本語データを含むゲームが見つかりません',check:'確認中…',apply:'日本語に戻す',undo:'元に戻す',close:'閉じる',working:'処理中…',
  st:{restorable:n=>'復元できます：'+n.files+' ファイル、'+n.cells.toLocaleString()+' 箇所',applied:()=>'日本語に戻してあります',already:()=>'すでに日本語です',unsupported:()=>'言語ごとにファイルが分かれているため、まだ対応していません',none:()=>'日本語データがありません。日本語版をお使いください',missing:()=>'ゲームフォルダが見つかりません'},
  done:n=>n.applied+' ファイルを戻しました',undone:n=>n.skipped.length?n.restored+' ファイルを戻しました。更新で変わった '+n.skipped.length+' ファイルはそのままです':n.restored+' ファイルを元に戻しました',errs:{GAME_RUNNING:'ゲームが起動中です。先に閉じてください',NOTHING_TO_RESTORE:'戻す内容がありません',NOT_APPLIED:'まだ戻していません'}}};
 const t=w[locale]||w.zh;
 const d=modal(`<header class="jr-head"><span class="jr-eyebrow">${({zh:'工具',en:'Tool',ja:'ツール'})[locale]||'工具'}</span><h2>${t.title}</h2><p class="settings-help">${t.sub}</p></header><p class="tool-key-note">${({zh:'在 Steam 买的、只显示中文 / 英文的游戏（比如 Key 社的 Summer Pockets），一定要先运行这个工具，否则 MeguLit 读到的是中文或英文，用不了',en:'Games bought on Steam that only show Chinese or English (such as Key’s Summer Pockets) must go through this tool first, otherwise MeguLit only gets the translated text',ja:'Steam 版で中国語・英語しか表示されないゲーム（Key の Summer Pockets など）は、先にこのツールを実行してください。実行しないと翻訳文しか取得できません'})[locale]||''}</p><div data-jr-body><p class="muted">${t.check}</p></div><div class="dialog-actions"><button type="button" class="secondary jr-close" data-jr-close>${t.close}</button><button type="button" class="secondary" data-jr-undo hidden>${t.undo}</button><button type="button" class="primary" data-jr-apply hidden>${t.apply}</button></div>`);
 d.classList.add('jr-dialog'); /* E271 (user: the window behind the tool card needs the same care) */
 d.showModal();d.querySelector('[data-jr-close]').onclick=()=>d.close();
 const body=d.querySelector('[data-jr-body]'),applyBtn=d.querySelector('[data-jr-apply]'),undoBtn=d.querySelector('[data-jr-undo]');let id='';
 const fail=e=>{const c=typeof e==='string'?e:e?.message;toast(t.errs[c]||errorMessage(e));};
 const show=async()=>{applyBtn.hidden=undoBtn.hidden=true;const status=body.querySelector('[data-jr-status]');status.dataset.state='checking';status.textContent=t.check;
  try{const r=await api('jp_restore_detect',{id});status.dataset.state=t.st[r.state]?r.state:'none';status.textContent=(t.st[r.state]||t.st.none)(r);applyBtn.hidden=r.state!=='restorable';undoBtn.hidden=r.state!=='applied';}catch(e){status.dataset.state='';status.textContent='';fail(e);}};
 const run=async(action,button,message)=>{applyBtn.disabled=undoBtn.disabled=true;const label=button.textContent;button.textContent=t.working;
  try{const r=await api(action,{id});toast(message(r));}catch(e){fail(e);}finally{button.textContent=label;applyBtn.disabled=undoBtn.disabled=false;show();}};
 applyBtn.onclick=()=>run('jp_restore_apply',applyBtn,t.done);undoBtn.onclick=()=>run('jp_restore_undo',undoBtn,t.undone);
 api('jp_restore_list').then(list=>{if(!list.length){body.innerHTML=`<p class="muted">${t.none}</p>`;return;}
  // E238 picker: a small searchable library (covers, title filter) instead of a long select
  const games=list.map(g=>({...g,...(model.games.find(m=>m.id===g.id)||{})}));
  body.innerHTML=`<input type="search" class="jr-search" placeholder="${t.search}" aria-label="${t.search}" autocomplete="off"><div class="jr-grid" role="listbox" aria-label="${t.pick}"></div><p data-jr-status class="settings-help" role="status"></p>`;
  const grid=body.querySelector('.jr-grid'),search=body.querySelector('.jr-search');
  const pick=gid=>{id=gid;grid.querySelectorAll('[role=option]').forEach(o=>o.setAttribute('aria-selected',String(o.dataset.id===gid)));show();};
  const draw=()=>{const q=search.value.trim().toLowerCase(),shown=games.filter(g=>!q||String(g.title).toLowerCase().includes(q));
   grid.innerHTML=shown.length?shown.map(g=>`<button type="button" role="option" class="jr-item" data-id="${esc(g.id)}" aria-selected="${g.id===id}"><span class="jr-art">${cover(g,'jr-cover')}<i class="jr-check" aria-hidden="true"></i></span><span class="jr-name">${esc(g.title)}</span></button>`).join(''):`<p class="muted">${t.nomatch}</p>`;
   grid.querySelectorAll('[role=option]').forEach(o=>o.onclick=()=>pick(o.dataset.id));};
  search.oninput=draw;id=games[0].id;draw();show();}).catch(fail);
}
function modal(html){const dialog=document.createElement('dialog');dialog.innerHTML=html;document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});dialog.showModal();return dialog;}
function gameDetail(id){if(!model.games.some(game=>game.id===id))return;gameOrigin=route==='home'?'home':route==='series'?'series':'library';selectedGameId=id;navigate('game');}

const libraryActions={
 zh:['移出游戏库','彻底删除本地记录','刷新游戏库后，仍安装的作品会重新出现。阅读和学习记录会保留','将清除此作品在 MeguLit 的阅读、关联例句和统计。游戏文件及存档会保留','隐藏作品','已隐藏。可在设置 → 学习与数据 → 游戏库恢复','请先关闭正在记录的游戏'],
 en:['Remove from library','Delete local records','If the game is still installed, refreshing the library brings it back with its records.','This clears reading history, linked examples and statistics in MeguLit. Game files and saves are kept.','Hide game','Hidden. Restore it in Settings → Study and data → Library.','Close the game before deleting its active reading records.'],
 ja:['ライブラリから除外','ローカル記録を完全に削除','ゲームが残っていれば、更新で記録と一緒に再表示されます','読書履歴、関連例文、統計を削除します。ゲームファイルとセーブは残ります','作品を非表示','非表示にしました。設定 → 学習・データ → ライブラリで復元できます','記録中のゲームを閉じてください']
};
function removeGame(id){
 const game=model.games.find(g=>g.id===id);if(!game)return;
 const [remove,purge,removeHint,purgeHint]=libraryActions[locale];
 const dialog=modal(`<h2>${text.removeGameTitle}</h2><p>${esc(game.title)}</p><div class="dialog-actions"><button class="secondary" data-cancel>${text.cancel}</button><button class="secondary" data-remove>${remove}</button><button class="primary" data-purge>${purge}</button></div>`);
 dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
 function confirm(permanent){
  dialog.close();
  const label=permanent?purge:remove;
  const next=modal(`<h2>${label}</h2><p>${esc(game.title)}</p><p>${permanent?purgeHint:removeHint}</p><div class="dialog-actions"><button class="secondary" data-cancel>${text.cancel}</button><button class="primary" data-confirm>${label}</button></div>`);
  next.querySelector('[data-cancel]').onclick=()=>next.close();
  next.querySelector('[data-confirm]').onclick=async event=>{const button=event.currentTarget;button.disabled=true;
   try{await api('remove_game',{id,permanent});next.close();model=await api('home');if(route==='game')navigate('library');else renderRoute();toast(text.removedGame);}
   catch(error){button.disabled=false;toast((error?.message||error)==='GAME_RECORDING_ACTIVE'?libraryActions[locale][6]:errorMessage(error));}
  };
 }
 dialog.querySelector('[data-remove]').onclick=()=>confirm(false);
 dialog.querySelector('[data-purge]').onclick=()=>confirm(true);
}
let contextMenu=null;
function closeContextMenu(){contextMenu?.remove();contextMenu=null;}
document.addEventListener('contextmenu',event=>{
  event.preventDefault();closeContextMenu();
  const card=event.target.closest('[data-game],[data-edit],[data-launch]');
  const id=card?.dataset.game||card?.dataset.edit||card?.dataset.launch||event.target.closest('.hero')?.querySelector('[data-launch]')?.dataset.launch;
  const items=id?[
    {label:text.continue,symbol:'play',run:button=>startGame(id,button)},
    {label:text.detail,symbol:'game',run:()=>gameDetail(id)},
    {label:text.editGame,symbol:'edit',run:()=>editGame(id)},
    {label:messages[locale].series.addTo,symbol:'layers',run:()=>seriesUI.chooseCollection([id])},
    {label:libraryActions[locale][4],symbol:'game',run:async()=>{await api('set_game_hidden',{id,hidden:true});model=await api('home');renderRoute();toast(libraryActions[locale][5]);}},
    {label:text.removeGame,symbol:'trash',danger:true,run:()=>removeGame(id)},
  ]:[{label:text.contextRefresh,symbol:'refresh',run:async()=>{await refreshLibrary();renderRoute();}}];
  const menu=contextMenu=document.createElement('div');menu.className='context-menu';menu.setAttribute('role','menu');
  menu.innerHTML=items.map((item,index)=>`<button role="menuitem" data-index="${index}" ${item.danger?'class="danger"':''}>${icon(item.symbol)}<span>${esc(item.label)}</span></button>`).join('');document.body.append(menu);
  const rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-rect.height-8))+'px';
  menu.querySelectorAll('button').forEach(button=>button.onclick=async()=>{const item=items[Number(button.dataset.index)];closeContextMenu();try{await item.run(button);}catch(error){toast(errorMessage(error));}});
  menu.querySelector('button')?.focus();
},true);
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.context-menu'))closeContextMenu();},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeContextMenu();else if(contextMenu&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();const buttons=[...contextMenu.querySelectorAll('button')];let index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}});
addEventListener('blur',closeContextMenu);addEventListener('resize',closeContextMenu);addEventListener('scroll',closeContextMenu,true);
function editGame(id){
  const game=model.games.find(g=>g.id===id);
  const dialog=modal(`<h2>${game?text.editGame:text.addGame}</h2><form id="game-form"><label class="form-label" for="game-title">${text.gameTitle}</label><input id="game-title" class="form-input" required maxlength="240" value="${esc(game?.title||'')}"><label class="form-label" for="game-exe">${text.executable}</label><div class="input-group"><input id="game-exe" class="form-input" required value="${esc(game?.executable||'')}"><button type="button" class="secondary" id="pick-exe" aria-label="${text.selectFile}">${({zh:'浏览…',en:'Browse…',ja:'参照…'})[locale]}</button></div>${game?`<label class="form-label" for="game-vndb">VNDB</label><input id="game-vndb" class="form-input" spellcheck="false" autocomplete="off" value="${esc(game.vndbId||'')}" placeholder="${({zh:'v12345 或 https://vndb.org/v12345，留空则自动匹配',en:'v12345 or https://vndb.org/v12345; leave empty to match automatically',ja:'v12345 または https://vndb.org/v12345（空欄で自動）'})[locale]}"><span class="form-label">${({zh:'封面',en:'Cover',ja:'カバー画像'})[locale]}</span><div class="image-picker"><img id="game-cover-preview" alt="" src="${esc(game.cover||'')}" ${game.cover?'':'hidden'}><button type="button" class="secondary" id="pick-cover">${({zh:'更换封面…',en:'Change cover…',ja:'画像を変更…'})[locale]}</button></div>`:''}<div class="dialog-actions"><button type="button" class="secondary" id="cancel-game">${text.cancel}</button><button class="primary" type="submit">${text.save}</button></div></form>`);
  dialog.querySelector('#cancel-game').addEventListener('click',()=>dialog.close());
  // A picked cover is saved at once, like a series cover; automatic metadata refresh keeps it.
  dialog.querySelector('#pick-cover')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const path=await invoke('pick_image');if(!path)return;const result=await api('game_cover',{id,path});const preview=dialog.querySelector('#game-cover-preview');preview.src=result.cover;preview.hidden=!result.cover;model=await api('home');renderRoute();toast(text.saved);}catch(error){toast(errorMessage(error));}finally{button.disabled=false;}});
  dialog.querySelector('#pick-exe').addEventListener('click',async()=>{try{const directory=game?(await api('game_original_executable',{id})).directory:undefined;const file=await invoke('pick_executable',{directory});if(file)dialog.querySelector('#game-exe').value=file;}catch{toast(text.serviceFailed);}});
  // The VNDB entry is sent only when it was edited; a new entry refreshes the game's metadata right away.
  dialog.querySelector('#game-form').addEventListener('submit',async event=>{event.preventDefault();try{const vndbInput=dialog.querySelector('#game-vndb'),vndb=vndbInput&&vndbInput.value.trim()!==(game?.vndbId||'')?vndbInput.value:undefined;const saved=await api('save_game',{id,title:dialog.querySelector('#game-title').value,executable:dialog.querySelector('#game-exe').value,vndb});dialog.close();model=await api('home');renderRoute();toast(text.gameSaved);if(saved?.vndbChanged)api('game_enrich',{id,locale,refresh:true}).then(async()=>{model=await api('home');renderRoute();}).catch(()=>{});}catch(error){toast(errorMessage(error));}});
}
async function history(token){
  const main=document.querySelector('#main');if(!['sessions','dialogue'].includes(subtab))subtab='sessions';
  main.innerHTML=heading(text.history,`<button class="text-button" data-history-font>${({zh:'字体与排版',en:'Font and spacing',ja:'フォントと行間'})[locale]}</button>`)+tabs(['sessions','dialogue'])+`<div id="history-content">${loading()}</div>`;bindTabs('history');main.querySelector('[data-history-font]').onclick=()=>{settingsSection='reader';navigate('settings');};
  const items=await api(subtab==='sessions'?'history':'dialogue');if(token!==pageToken)return;
  const target=main.querySelector('#history-content');
  target.innerHTML=historyHTML(items,{mode:subtab,locale,text,esc,icon,duration,datetime,number,games:model.games,cover,empty});attachGameActions(target);if(subtab==='dialogue')stopHistoryTranslations=mountHistoryTranslations({root:target,viewport:main,api,isCurrent:()=>token===pageToken,locale});
}
const tabs=names=>`<div class="tabs">${names.map(k=>`<button class="tab ${subtab===k?'active':''}" data-tab="${k}">${text[k]}</button>`).join('')}</div>`;
const LEARNING_TABS=['review','kana','kanagames','words','sentences','dictionary','trash','statistics'];
const ACCENT_DEFAULTS=['#ad1539','#9d314d','#7b5ba7','#347b91','#398775'];
function accentChipsHTML(prefs){return [...new Set([...(prefs.accentPresets||[]),...ACCENT_DEFAULTS])].map(color=>`<button type="button" class="swatch ${color===String(prefs.accent).toLowerCase()?'active':''}" data-color="${color}" style="--swatch:${color}" aria-label="${color}" title="${color.toUpperCase()}"></button>`).join('');}
/* E272 (user: the sub-tab bar should drop down, retract when leaving, and retract then drop again between pages):
   the bar of learning / history unrolls from under the top bar; leaving for another page rolls it up first. */
let tabsGroup=null;
const tabsMotion=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
const tabsFrames=[{clipPath:'inset(0 0 100% 0)',transform:'translateY(-12px)',opacity:.3},{clipPath:'inset(0 0 -40px 0)',transform:'none',opacity:1}];
function dropTabs(bar){if(tabsMotion())bar.animate(tabsFrames,{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}
async function retractTabs(next){const bar=document.querySelector('#main>.tabs');if(!bar||!tabsGroup||tabsGroup===next){return;}tabsGroup=null;if(!tabsMotion())return;
 await bar.animate([...tabsFrames].reverse(),{duration:170,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'}).finished.catch(()=>{});}
/* E272 (user: starting MeguLit should not end on a progress bar and an avatar; the home page needs an entrance): the
   backdrop settles, the top bar and the hero rise in, then the shelf cards one by one. Starts on the first painted frame
   so a window that is still hidden does not play it unseen. */
function bootEntrance(){const html=document.documentElement;if(!tabsMotion()){html.classList.remove('app-boot-pre');return;}
 document.querySelectorAll('#main .shelf .book').forEach((book,i)=>book.style.setProperty('--boot-i',String(Math.min(i,10))));
 const go=()=>{if(!html.classList.contains('app-boot-pre'))return;html.classList.remove('app-boot-pre');html.classList.add('app-boot');setTimeout(()=>html.classList.remove('app-boot'),2000);};
 const later=()=>requestAnimationFrame(()=>requestAnimationFrame(go));
 if(document.visibilityState==='hidden')document.addEventListener('visibilitychange',later,{once:true});else later();
 setTimeout(go,3000);}
function bindTabs(page){{const group=page==='statistics'?'learning':page,bar=document.querySelector('#main>.tabs');if(bar&&tabsGroup!==group)dropTabs(bar);tabsGroup=group;}document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>page==='learning'&&button.dataset.tab==='statistics'?navigate('statistics'):navigate(page==='statistics'?'learning':page,button.dataset.tab)));alignSubtabs(); /* align as soon as the bar exists, not after the page finishes loading (复习 jumped right once Anki answered) */}
function definitions(value){
  try{const d=JSON.parse(value);if(Array.isArray(d))return d.map(x=>typeof x==='string'?x:typeof x==='object'?x.gloss||x.definition||x.meaning||Object.values(x).filter(v=>typeof v==='string').join(' · '):'').filter(Boolean).join('\n');if(d&&typeof d==='object')return Object.values(d).flat().filter(v=>typeof v==='string').join('\n');}
  catch{}return String(value||'');
}
async function learning(token){
  if(!['review','kana','kanagames','words','sentences','dictionary','trash'].includes(subtab))subtab='review';
  const tab=subtab,slot=learningSlot(),target=document.createElement('div');
 const commit=()=>{slot.closest('.main').classList.toggle('review-page',tab==='review');slot.replaceChildren(target);};
  if(subtab==='dictionary'){dictionary(target);commit();return;}
  if(subtab==='kana'||subtab==='kanagames'){commit();try{const {mountKana}=await import('./kana/kana.js');if(token===pageToken)await mountKana(target,{api,invoke,toast,start:subtab==='kanagames'?'games':'index',openTab:tab=>navigate('learning',tab)});}catch(error){target.textContent=String(error?.message||error);}return;}
  if(subtab==='review'){await review(token,target);if(token===pageToken){enhanceSelects(target);commit();}return;}
  const [items,pending]=await Promise.all([api(subtab==='words'?'vocabulary':subtab==='trash'?'word_trash':'sentences'),subtab==='words'?api('unknown_words').catch(()=>[]):[]]);if(token!==pageToken)return;
  target.innerHTML=!items.length?empty(subtab==='words'?text.emptyWords:subtab==='trash'?text.emptyTrash:text.emptySentences,'learning'):`<div class="record-list">${items.map(item=>subtab==='sentences'?`<article class="record"><div class="record-meta"><span>${esc(item.title||'')}</span><span>${datetime(item.created_at)}</span></div><p>${esc(item.text)}</p>${item.translation?`<p class="muted">${esc(item.translation)}</p>`:''}</article>`:`<article class="record word-row"><div><div class="word-spelling">${esc(item.spelling)}</div><div class="word-reading">${esc(item.reading)}</div>${subtab==='words'?`<div class="word-def">${esc(definitions(item.definitions))}</div>`:`<div class="record-meta">${datetime(item.deleted_at)}</div>`}</div><div class="word-actions"><button class="icon-button" data-${subtab==='trash'?'restore':'delete'}="${item.id}" aria-label="${subtab==='trash'?text.restore:text.delete}">${icon(subtab==='trash'?'restore':'trash')}</button></div></article>`).join('')}</div>`;
  if(subtab==='words'){if(pending.length){const section=document.createElement('details');section.className='panel revisit-words';section.innerHTML=`<summary><span class="revisit-title">${{zh:'常查单词',en:'Frequently looked up',ja:'よく調べる単語'}[locale]}</span><small class="muted">${number(pending.length)} ${{zh:'个',en:'words',ja:'語'}[locale]}</small><svg class="revisit-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary><p class="settings-help">${{zh:'查过多次、还没标为已掌握的词。打开查词卡片或搜索词典时计数，2 秒内重复点同一个词只算一次',en:'Words you looked up often and have not marked as known. Counted when a lookup card opens or you search the dictionary; repeats within 2 seconds count once',ja:'何度も調べ、まだ覚えた印を付けていない語です。辞書カードを開くか検索したときに数え、2秒以内の重複は1回とします'}[locale]}</p><div class="revisit-list">${pending.map(word=>`<span class="revisit-chip"><b>${esc(word.surface)}</b><small>${number(word.lookups)}</small></span>`).join('')}</div>`;target.prepend(section);}}
  target.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',()=>confirmDelete(items.find(w=>w.id===Number(button.dataset.delete)))));
  if(subtab==='words')target.querySelectorAll('.word-row').forEach((row,index)=>{const word=items[index],select=document.createElement('select');select.setAttribute('aria-label',{zh:'掌握程度',en:'Mastery',ja:'習得度'}[locale]);const labels={zh:['新收录','学习中','熟悉','掌握','熟练'],en:['New','Learning','Familiar','Known','Mastered'],ja:['新規','学習中','見覚えあり','習得','熟知']}[locale];select.innerHTML=labels.map((label,status)=>`<option value="${status}" ${word.status===status?'selected':''}>${label}</option>`).join('');select.onchange=async()=>{select.disabled=true;try{await api('set_word_status',{id:word.id,status:Number(select.value)});word.status=Number(select.value);}catch(error){select.value=String(word.status);toast(errorMessage(error));}finally{select.disabled=false;}};row.querySelector('.word-actions').prepend(select);});
  target.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',async()=>{try{await api('restore_word',{id:Number(button.dataset.restore)});model=await api('home');renderRoute();toast(text.restoreDone);}catch(error){toast(errorMessage(error));}}));
  enhanceSelects(target);commit();
}
function confirmDelete(word){
  const dialog=modal(`<h2>${text.deleteTitle}</h2><p>${text.deleteHint}</p><p class="dialog-word">${esc(word.spelling)}</p><p>${esc(word.reading)}</p><div class="dialog-actions"><button class="secondary" id="cancel-delete">${text.cancel}</button><button class="primary" id="confirm-delete">${text.deleteConfirm}</button></div>`);
  dialog.classList.add('word-delete');
  dialog.querySelector('#cancel-delete').addEventListener('click',()=>dialog.close());
  dialog.querySelector('#confirm-delete').addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await api('delete_word',{id:word.id});dialog.close();model=await api('home');renderRoute();toast(text.deleteDone);}catch(error){event.currentTarget.disabled=false;toast(errorMessage(error));}});
}
function dictionary(target){
  const L={zh:{online:'MOJi 联网查词',local:'本地查词',play:'播放 MOJi 发音',audioFail:'发音暂时无法播放',notes:'MOJi 用户笔记',noNotes:'暂无笔记',likes:'赞',fail:'MOJi 暂时无法查询',login:'扫码登录 MOJi',logout:'退出登录',signed:'已登录 MOJi',anon:'未登录 · 匿名查询',scan:'用 MOJi 辞書 App「我的 → 扫一扫」扫码',scanned:'已扫描，请在手机上确认',expired:'二维码已过期',refresh:'刷新二维码',bind:'该账号需先在 MOJi App 绑定手机',cancel:'取消',back:'返回结果',examples:'例句',detailFail:'详情暂时无法打开',expiredSession:'MOJi 登录已过期，请重新扫码'},
    en:{online:'Search MOJi online',fail:'MOJi is temporarily unavailable',login:'Sign in to MOJi',logout:'Sign out',signed:'Signed in to MOJi',anon:'Not signed in · anonymous',scan:'Scan with the MOJi app (Me → Scan)',scanned:'Scanned, confirm on your phone',expired:'QR code expired',refresh:'Refresh QR code',bind:'Bind a phone number in the MOJi app first',cancel:'Cancel',back:'Back to results',examples:'Examples',detailFail:'Could not open the entry',expiredSession:'MOJi session expired, scan again'},
    ja:{online:'MOJi でオンライン検索',local:'ローカル辞書',play:'MOJi の発音を再生',audioFail:'発音を再生できません',notes:'MOJi ユーザーノート',noNotes:'ノートはありません',likes:'いいね',fail:'MOJi に接続できません',login:'MOJi にログイン',logout:'ログアウト',signed:'MOJi にログイン済み',anon:'未ログイン · 匿名検索',scan:'MOJi 辞書アプリ「マイページ → スキャン」で読み取る',scanned:'読み取り済み、スマホで確認してください',expired:'QR コードの期限切れ',refresh:'QR コードを更新',bind:'先に MOJi アプリで電話番号を登録してください',cancel:'キャンセル',back:'結果に戻る',examples:'例文',detailFail:'詳細を開けません',expiredSession:'MOJi のログインが切れました'}}[locale];
  let ticket=0,poll=0,lastItems=[],lastOnline=false;
  target.innerHTML=`<div class="moji-account" id="moji-account"></div><form class="lookup-form" id="lookup-form"><input type="search" id="lookup-input" autocomplete="off" spellcheck="false" placeholder="${text.lookupHint}" aria-label="${text.dictionary}" maxlength="100"><button type="submit" value="moji" class="primary">${L.online}</button><button type="submit" value="local" class="secondary">${L.local}</button></form><div id="lookup-results"></div>`;
  const account=target.querySelector('#moji-account'),results=target.querySelector('#lookup-results');
  /* v1.0.5：还没输入时，列出常查的词，点一下直接查 */
  api('unknown_words').then(list=>{if(!list?.length||!results.isConnected||results.children.length)return;const chips=document.createElement('div');chips.className='g-dict-chips';chips.innerHTML=`<span>${{zh:'你常查的',ja:'よく調べる語',en:'Often looked up'}[locale]}</span>`+list.slice(0,10).map(w=>`<button type="button" data-chip="${esc(w.surface)}">${esc(w.surface)}<small>${number(w.lookups)}</small></button>`).join('');chips.onclick=e=>{const c=e.target.closest('[data-chip]');if(!c)return;const input=target.querySelector('#lookup-input'),form=target.querySelector('#lookup-form');input.value=c.dataset.chip;(form.querySelector('button[type=submit]:not([value=local])')||form.querySelector('button[value=local]')).click();};target.querySelector('#lookup-form').after(chips);}).catch(()=>{});
  const stopPoll=()=>{clearTimeout(poll);poll=0;};
  const showStatus=state=>{stopPoll();account.innerHTML=state?.signedIn?`<span class="moji-state signed">${L.signed}${state.name?' · '+esc(state.name):''}</span><button type="button" class="text-button" data-moji-logout>${L.logout}</button>`:`<span class="moji-state">${L.anon}</span><button type="button" class="text-button" data-moji-login>${L.login}</button>`;
    account.querySelector('[data-moji-login]')?.addEventListener('click',startLogin);
    account.querySelector('[data-moji-logout]')?.addEventListener('click',async()=>{try{showStatus(await api('moji_logout'));}catch(error){toast(errorMessage(error));}});};
  async function startLogin(){
    stopPoll();account.innerHTML=`<div class="moji-qr-panel"><span class="spinner"></span></div>`;
    let code;try{code=await api('moji_login_start');}catch{toast(L.fail);showStatus(await api('moji_status').catch(()=>({})));return;}
    if(!account.isConnected)return;
    const {qrSvg}=await import('./qr.js'),deadline=Date.now()+code.expiresIn;
    account.innerHTML=`<div class="moji-qr-panel"><div class="moji-qr">${qrSvg(code.content)}</div><div class="moji-qr-side"><p class="moji-qr-hint" data-qr-hint>${L.scan}</p><div class="moji-qr-actions"><button type="button" class="secondary" data-qr-refresh hidden>${L.refresh}</button><button type="button" class="text-button" data-qr-cancel>${L.cancel}</button></div></div></div>`;
    const hint=account.querySelector('[data-qr-hint]'),panel=account.querySelector('.moji-qr-panel');
    account.querySelector('[data-qr-refresh]').onclick=startLogin;
    account.querySelector('[data-qr-cancel]').onclick=async()=>showStatus(await api('moji_status').catch(()=>({})));
    const expire=()=>{stopPoll();panel.classList.add('expired');hint.textContent=L.expired;account.querySelector('[data-qr-refresh]').hidden=false;};
    const tick=async()=>{
      if(!account.isConnected)return stopPoll();
      if(Date.now()>deadline)return expire();
      try{const r=await api('moji_login_poll',{qrcodeId:code.qrcodeId});if(!account.isConnected||!panel.isConnected)return;
        if(r.state==='signed-in')return showStatus(r);
        if(r.state==='expired')return expire();
        if(r.state==='bind'){stopPoll();hint.textContent=L.bind;return;}
        if(r.state==='scanned'){panel.classList.add('scanned');hint.textContent=L.scanned;}
      }catch{}
      poll=setTimeout(tick,3000);
    };
    poll=setTimeout(tick,3000);
  }
  const tags=w=>[...(w.partOfSpeech||[]),w.verbType,w.verbGroup].filter(Boolean).map(t=>`<span class="moji-tag">${esc(t)}</span>`).join('');
  const renderList=()=>{
    results.innerHTML=lastItems.length?`${lastOnline?'<small class="muted">MOJi 辞書</small>':''}<div class="record-list">${lastItems.map((w,i)=>{const link=lastOnline&&w.id;return `<article class="record${link?' moji-entry':''}"${link?` tabindex="0" role="button" data-moji-index="${i}"`:''}><div class="word-spelling">${esc(w.spelling)}</div><div class="word-reading">${esc(w.reading)}</div>${lastOnline&&tags(w)?`<div class="moji-tags">${tags(w)}</div>`:''}<div class="word-def">${esc(w.definition)}</div></article>`;}).join('')}</div>`:empty(text.noDefinition,'word');
    results.querySelectorAll('[data-moji-index]').forEach(card=>{const open=()=>openDetail(lastItems[Number(card.dataset.mojiIndex)]);card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};});
  };
  async function openDetail(item){
    const scroller=document.scrollingElement,scroll=scroller.scrollTop,request=++ticket;results.innerHTML=loading();
    let d;try{d=await api('moji_word',{id:item.id});}catch(error){if(request!==ticket)return;if(String(error?.message||error).includes('MOJI_SESSION_EXPIRED')){toast(L.expiredSession);showStatus({});}else toast(L.detailFail);renderList();return;}
    if(request!==ticket||!results.isConnected)return;
    const head={...item,...Object.fromEntries(Object.entries(d).filter(([,v])=>Array.isArray(v)?v.length:v))};
    const meanings=(d.meanings||[]).map(m=>`<li><div class="moji-meaning">${esc(m.zh||m.ja)}</div>${m.zh&&m.ja?`<div class="moji-meaning-ja" lang="ja">${esc(m.ja)}</div>`:''}${m.examples.length?`<details class="moji-ex"><summary>${L.examples} <b>${m.examples.length}</b></summary><ul class="moji-examples" aria-label="${L.examples}">${m.examples.map(x=>`<li><span lang="ja">${esc(x.ja)}</span>${x.zh?`<small>${esc(x.zh)}</small>`:''}</li>`).join('')}</ul></details>`:''}</li>`).join('')||`<li><div class="moji-meaning">${esc(d.excerpt||item.definition)}</div></li>`;
    results.innerHTML=`<article class="moji-detail"><button type="button" class="text-button moji-back" data-moji-back>← ${L.back}</button><header><div class="moji-head-row"><div class="word-spelling">${esc(head.spelling)}</div><button type="button" class="moji-play" data-moji-play aria-label="${L.play}" title="${L.play}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg></button></div><div class="word-reading">${esc(head.reading||[head.pron,head.accent].filter(Boolean).join('  '))}</div>${tags(head)?`<div class="moji-tags">${tags(head)}</div>`:''}</header><ol class="moji-meanings">${meanings}</ol><section class="moji-notes"><h3>${L.notes}</h3>${(d.notes||[]).map(n=>`<div class="moji-note mine">${n.title?`<div class="moji-note-title">${esc(n.title)}</div>`:''}<div class="moji-note-body">${esc(n.content)}</div></div>`).join('')}${(d.comments||[]).map(c=>`<div class="moji-note"><div class="moji-note-meta"><span>${esc(c.author)}</span><small class="muted">${esc(c.date)} · ${c.likes} ${L.likes}</small></div><div class="moji-note-body" lang="ja">${esc(c.content)}</div>${c.replies.length?`<div class="moji-note-replies">${c.replies.map(r=>`<div><span>${esc(r.author)}</span>：${esc(r.content)}</div>`).join('')}</div>`:''}</div>`).join('')}${!(d.notes||[]).length&&!(d.comments||[]).length?`<p class="muted">${L.noNotes}</p>`:''}</section></article>`;
    let audio=null;const play=results.querySelector('[data-moji-play]');
    play.onclick=async()=>{if(play.disabled)return;play.disabled=true;try{if(!audio){const r=await api('moji_audio',{id:item.id});audio=new Audio(r.audio);}audio.currentTime=0;await audio.play();}catch{toast(L.audioFail);}finally{play.disabled=false;}};
    results.querySelector('[data-moji-back]').onclick=()=>{ticket++;renderList();scroller.scrollTop=scroll;};
  }
  api('moji_status').then(state=>{if(account.isConnected&&!account.querySelector('.moji-qr-panel'))showStatus(state);}).catch(()=>showStatus({}));
  target.querySelector('#lookup-form').addEventListener('submit',async event=>{
    event.preventDefault();const query=target.querySelector('#lookup-input').value.trim();if(!query)return;
    const request=++ticket,online=event.submitter?.value!=='local';
    results.innerHTML=loading();
    try{
      let items,used=online;
      try{items=await api('dictionary',{query,source:online?'moji':'local',operationId:crypto.randomUUID()});}
      catch(error){if(!online)throw error;if(request===ticket)toast(L.fail);used=false;items=await api('dictionary',{query,source:'local',operationId:crypto.randomUUID()});}
      if(online&&used&&!items.length){const local=await api('dictionary',{query,source:'local',operationId:crypto.randomUUID()}).catch(()=>[]);if(local.length){items=local;used=false;}}
      if(request!==ticket||!results.isConnected)return;
      lastItems=items;lastOnline=used;renderList();
      api('home').then(next=>{if(request===ticket&&results.isConnected)model=next;}).catch(()=>{});
    }catch(error){if(request===ticket&&results.isConnected)results.innerHTML=empty(online?L.fail:text.serviceFailed,'word');}
  });
}
async function review(token,target){
  target.innerHTML=`<div class="tabs review-sources"><button class="tab active" data-review-source="anki">${text.ankiReview}</button><button class="tab" data-review-source="local">${text.localReview}</button></div><div id="review-content"></div>`;
  const content=target.querySelector('#review-content');
  target.querySelectorAll('[data-review-source]').forEach(button=>button.onclick=()=>{target.querySelectorAll('[data-review-source]').forEach(b=>b.classList.toggle('active',b===button));if(button.dataset.reviewSource==='anki')renderAnkiReview({target:content,api,text,esc,isCurrent:()=>token===pageToken&&button.classList.contains('active'),toast}).catch(error=>toast(errorMessage(error)));else localReview(token,content);});
  await renderAnkiReview({target:content,api,text,esc,isCurrent:()=>token===pageToken&&target.querySelector('[data-review-source="anki"]').classList.contains('active'),toast,quiet:true});
}
async function localReview(token,target){
  const words=await api('vocabulary');if(token!==pageToken)return;
  if(!words.length){target.innerHTML=empty(text.emptyWords,'learning');return;}
  let index=0,revealed=false;
  function draw(){const word=words[index];if(!word){target.innerHTML=empty(text.reviewDone,'check');return;}
    target.innerHTML=`<section class="panel review-card"><div class="muted">${index+1} / ${words.length}</div><h2>${esc(word.spelling)}</h2>${revealed?`<div class="word-reading">${esc(word.reading)}</div><div class="word-def">${esc(definitions(word.definitions))}</div>`:`<p class="muted">${text.reviewSub}</p>`}<div class="review-controls"><button class="primary" id="review-next">${revealed?text.next:text.showAnswer}</button></div></section>`;
    target.querySelector('#review-next').addEventListener('click',async()=>{if(revealed){await api('record_review',{id:word.id});index++;revealed=false;}else revealed=true;draw();});
  }draw();
}
const settingsScroll=new Map();
function rememberSettingsScroll(){const c=document.querySelector('#main .settings-content');if(c&&settingsSection)settingsScroll.set(settingsSection,c.scrollTop);}
function restoreSettingsScroll(section){const target=settingsScroll.get(section)||0;let tries=0;const step=()=>{const c=document.querySelector('#main .settings-content');if(c&&c.querySelector('form,section,.panel')){c.classList.remove('g-enter');void c.offsetWidth;c.classList.add('g-enter');if(target)c.scrollTo({top:target,behavior:'smooth'});return;}if(++tries<60)requestAnimationFrame(step);};requestAnimationFrame(step);}
async function settings(token){
  await renderSettings({main:document.querySelector('#main'),api,invoke,text,locale,esc,toast,heading,basicSettings,isCurrent:()=>token===pageToken,section:settingsSection,setSection:value=>{rememberSettingsScroll();try{localStorage.setItem('megulit-settings-section',value||'');}catch{}settingsSection=value;restoreSettingsScroll(value);},profile:settingsProfile,setProfile:value=>settingsProfile=value,onSaved:async result=>{const next=await api('home'),reload=!result?.scope||result.scope==='background-toggle';const image=reload?(next.preferences.homeBackground?await api('background'):''):undefined;model=next;setAppearance();if(reload)applyBackground(image);}});
  if(token===pageToken&&settingsSection)restoreSettingsScroll(settingsSection);
}
function basicSettings(main=document.querySelector('#main')){
  const prefs=model.preferences;
  const extra={zh:{theme:'明暗模式',dark:'深灰',black:'纯黑',light:'浅色',avatar:'头像',choose:'选择图片',home:'主页背景图片'},ja:{theme:'配色モード',dark:'ダーク',black:'ブラック',light:'ライト',avatar:'プロフィール画像',choose:'画像を選択',home:'ホーム背景画像'},en:{theme:'Color mode',dark:'Dark',black:'Black',light:'Light',avatar:'Avatar',choose:'Choose image',home:'Home background image'}}[locale];
  main.innerHTML=heading(text.settings)+`<form id="settings-form"><section class="panel"><h2 class="panel-title">${text.general}</h2>
  <label class="settings-row"><div class="settings-label">${text.language}</div><select name="language"><option value="zh" ${locale==='zh'?'selected':''}>简体中文</option><option value="ja" ${locale==='ja'?'selected':''}>日本語</option><option value="en" ${locale==='en'?'selected':''}>English</option></select></label>
  <label class="settings-row"><div><div class="settings-label">${text.username}</div><div class="settings-help">${text.usernameHint}</div></div><input name="username" maxlength="80" value="${esc(prefs.username)}"></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'顶部栏颜色',en:'Top bar colour',ja:'トップバーの色'})[locale]}</div><div class="settings-help">${({zh:'顶部横栏的底色，logo 周围的光会跟着变化',en:'Base colour of the top bar; the light around the logo follows it',ja:'トップバーの地色。ロゴ周りの光も追従します'})[locale]}</div></div><input type="color" name="barColor" value="${esc(prefs.barColor||'#1a1110')}"></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'首页光效',en:'Home glow',ja:'ホームの光'})[locale]}</div><div class="settings-help">${({zh:'取上次游玩封面的颜色，从顶部栏向下蔓延',en:'Colours from the last-played cover, spreading down from the top bar',ja:'前回のゲームの表紙の色がトップバーから広がります'})[locale]}</div></div><input type="checkbox" class="switch" name="glow" ${prefs.glow!==false?'checked':''}></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'光效速度',en:'Glow speed',ja:'光の速さ'})[locale]}</div><div class="settings-help">${({zh:'数值越大变化越快',en:'Higher is faster',ja:'大きいほど速く変化'})[locale]}</div></div><span class="setting-slider"><input type="range" name="glowSpeed" min="0.25" max="3" step="any" value="${Number(prefs.glowSpeed)||1}"><input type="number" data-basic-slider="glowSpeed" min="0.25" max="3" step="any" value="${Number(prefs.glowSpeed)||1}" aria-label="${({zh:'光效速度',en:'Glow speed',ja:'光の速さ'})[locale]}"></span></label>
  <label class="settings-row"><div><div class="settings-label">${({zh:'主页字体大小',en:'Home text size',ja:'ホームの文字サイズ'})[locale]}</div><div class="settings-help">${({zh:'只影响首页，1 为默认（100%）',en:'Home page only; 1 is the default (100%)',ja:'ホームのみ。1 が既定（100%）'})[locale]}</div></div><span class="setting-slider"><input type="range" name="homeFontScale" min="0.85" max="1.3" step="any" value="${Number(prefs.homeFontScale)||1}"><input type="number" data-basic-slider="homeFontScale" min="0.85" max="1.3" step="any" value="${Number(prefs.homeFontScale)||1}" aria-label="${({zh:'主页字体大小',en:'Home text size',ja:'ホームの文字サイズ'})[locale]}"></span></label>
  <label class="settings-row"><div><div class="settings-label">${text.closeToTray}</div><div class="settings-help">${text.closeHint}</div></div><input type="checkbox" class="switch" name="closeToTray" ${prefs.closeToTray?'checked':''}></label><label class="settings-row"><div><div class="settings-label">${({zh:'关闭窗口时询问',en:'Ask when closing the window',ja:'閉じるときに確認する'})[locale]}</div><div class="settings-help">${({zh:'点右上角关闭时，先问是收进托盘还是退出',en:'Ask whether to go to the tray or quit when you click close',ja:'閉じるボタンでトレイ格納か終了かを確認します'})[locale]}</div></div><input type="checkbox" class="switch" name="closeAsk" ${prefs.closeAsk!==false?'checked':''}></label></section>
  <section class="panel"><h2 class="panel-title">${text.appearance}</h2><div class="settings-row"><div class="settings-label">${text.accent}</div><div class="color-swatches"><span class="accent-chips" data-accent-chips>${accentChipsHTML(prefs)}</span><label class="accent-custom">${({zh:'自定义…',ja:'カスタム…',en:'Custom…'})[locale]}<input type="color" name="accent" data-color-action="saveAccent" aria-label="${text.accent}" value="${esc(prefs.accent)}"></label></div></div>
  <label class="settings-row"><div class="settings-label">${text.font}</div><input name="fontFamily" list="interface-fonts" placeholder="${text.systemFont}" value="${esc(prefs.fontFamily||'')}" maxlength="120"><datalist id="interface-fonts"><option value="Microsoft YaHei UI"><option value="Segoe UI"><option value="Yu Gothic UI"><option value="Meiryo"></datalist></label>
  <div class="settings-row"><span class="settings-label">${extra.home}</span><button type="button" class="setting-link" data-background-settings>${{zh:'调整背景',en:'Customize background',ja:'背景を調整'}[locale]} ${icon('arrow')}</button></div></section>
  </form>`;
  const form=main.querySelector('#settings-form');
  form.querySelectorAll('[name=username],[name=fontFamily],[name=themeMode]').forEach(input=>input.closest('.settings-row')?.classList.add('compact-setting'));
  const previewAppearance=()=>setAppearance({...model.preferences,accent:form.elements.accent.value,themeMode:form.elements.themeMode.value,fontFamily:form.elements.fontFamily.value});
  form.addEventListener('input',previewAppearance);form.addEventListener('change',previewAppearance);

  form.querySelectorAll('[data-basic-slider]').forEach(number=>{const range=form.elements.namedItem(number.dataset.basicSlider);range.addEventListener('input',()=>{range.value=String(Number(Number(range.value).toFixed(3)));number.value=range.value;});number.addEventListener('input',()=>{if(number.value!==''&&number.checkValidity()){range.value=number.value;range.dispatchEvent(new Event('input',{bubbles:true}));}});});

  const row=document.createElement('label');row.className='settings-row';row.innerHTML=`<span class="settings-label">${extra.theme}</span><select name="themeMode">${['dark','black','light'].map(mode=>`<option value="${mode}" ${prefs.themeMode===mode?'selected':''}>${extra[mode]}</option>`).join('')}</select>`;form.querySelectorAll('.panel')[1].querySelector('h2').after(row);
  form.querySelector('[data-background-settings]').onclick=()=>main.closest('.settings-layout').querySelector('[data-section=background]').click();
  for(const[slot,label]of []){
    const row=document.createElement('div');row.className='settings-row';row.innerHTML=`<span class="settings-label">${label}</span><div class="image-picker"><img alt="" hidden><button type="button" class="secondary">${extra.choose}</button></div>`;form.querySelector('.panel').append(row);
    api('asset_get',{slot}).then(image=>{if(row.isConnected&&image){row.querySelector('img').src=image;row.querySelector('img').hidden=false;}}).catch(()=>{});
    row.querySelector('button').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const path=await invoke('pick_image');if(path){await api('asset_set',{slot,path});row.querySelector('img').src=await api('asset_get',{slot});row.querySelector('img').hidden=false;toast(text.saved);}}catch(error){toast(errorMessage(error));}finally{button.disabled=false;}};
  }
  const bindAccentChips=()=>form.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{form.elements.accent.value=button.dataset.color;form.elements.accent.dispatchEvent(new Event('input'));form.elements.accent.dispatchEvent(new Event('change',{bubbles:true}));}));bindAccentChips();
  // The picker's "save to accent colours" keeps up to eight custom accents, newest first.
  form.elements.accent.addEventListener('tome-color-action',async event=>{const value=String(event.detail).toLowerCase(),list=[value,...(model.preferences.accentPresets||[]).filter(v=>v!==value)].slice(0,8);try{const saved=await api('save_preferences',{values:{accentPresets:list}});model.preferences.accentPresets=saved.accentPresets||list;form.querySelector('[data-accent-chips]').innerHTML=accentChipsHTML({...model.preferences,accent:form.elements.accent.value});bindAccentChips();}catch(error){toast(errorMessage(error));}});
  form.elements.accent.addEventListener('input',()=>{document.documentElement.style.setProperty('--accent',form.elements.accent.value);form.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===form.elements.accent.value));});
  const saveStatus=main.closest('.settings-content').parentElement.parentElement.querySelector('.settings-autosave-status');
  mountSettingsAutosave({form,locale,status:saveStatus,save:async values=>{const languageChanged=values.language!==model.preferences.language;model.preferences=await api('save_preferences',{values});setAppearance();if(languageChanged){shell();renderRoute();await invoke('set_tray_language',{language:locale});}}});
}
function learningSlot(){
 const main=document.querySelector('#main');
 if(main.dataset.page!=='learning'||!main.querySelector('#learning-content')){
  main.innerHTML=heading(text.learning)+tabs(LEARNING_TABS)+'<div id="learning-content">'+loading()+'</div>';
  main.dataset.page='learning';bindTabs('learning');
 }
 main.querySelectorAll(':scope > .tabs > [data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===subtab));
 return main.querySelector('#learning-content');
}
let statisticsSelection={range:'month',date:new Date().toLocaleDateString('en-CA')};
async function statistics(token){
 subtab='statistics';const main=learningSlot();main.closest('.main').classList.remove('review-page');
 const env={locale,text,esc,icon,duration,number,cover,gameById:id=>(model.games||[]).find(g=>g.id===id)};
 if(token!==pageToken)return;await mountStatistics(main,{api,env,selection:statisticsSelection,onSelection:selection=>{statisticsSelection=selection;}});
}

function loading(){return '<div class="loading-screen"><span class="spinner" aria-label="'+text.loading+'"></span></div>';}
/* v1.1.6 (user): the second-level tab bar starts under the first top tab (首页), on every page and size */
function alignSubtabs(){const bar=document.querySelector('#main>.tabs'),home=document.querySelector('.top-tabs .top-tab');if(!bar||!home)return;bar.style.setProperty('margin-left','0px','important');const first=bar.querySelector('.tab');if(!first)return;const textLeft=el=>el.getBoundingClientRect().left+(parseFloat(getComputedStyle(el).paddingLeft)||0),delta=textLeft(home)-textLeft(first);bar.style.setProperty('margin-left',Math.max(0,Math.round(delta))+'px','important'); /* the theme sets margin with !important */}
addEventListener('resize',()=>requestAnimationFrame(alignSubtabs));
async function renderRoute(){
  stopHistoryTranslations();stopHistoryTranslations=()=>{};
  const token=++pageToken,main=document.querySelector('#main');main.classList.toggle('home-page',route==='home');if(route!=='home'){stopShelf();stopShelf=()=>{};main.onscroll=null;if(route==='game'){const g=model.games.find(x=>x.id===selectedGameId);paintGlow(g?.cover||'');}else stopGlow();main.closest('.workspace')?.classList.remove('home-fade','fade-off');}if(route!=='library'){stopSimpleGrid();stopSimpleGrid=()=>{};stopField();main.classList.remove('searching','field-page','field-list','field-selecting','field-single');}main.classList.toggle('statistics-page',route==='statistics');if(route!=='learning'&&route!=='statistics')main.classList.remove('review-page');if(route!=='learning'&&route!=='statistics')delete main.dataset.page;main.scrollTop=0;
  try{
    if(route==='home')home();else if(route==='library')library();else if(route==='series')seriesUI.renderDetail(main,selectedSeriesId);else if(route==='game'){main.innerHTML=loading();await renderGamePage({main,id:selectedGameId,api,invoke,locale,text,esc,icon,cover,duration,datetime,relativeTime,number,definitions,isCurrent:()=>token===pageToken,onBack:()=>navigate(gameOrigin),onLaunch:startGame,onEdit:editGame,onRemove:removeGame,onOriginalChanged:async()=>{model=await api('home');if(token===pageToken)renderRoute();},toast});}else if(route==='history')await history(token);else if(route==='learning')await learning(token);else if(route==='settings')await settings(token);else if(route==='about'){main.innerHTML=aboutHTML(locale,esc);mountAbout(main,api,toast);}else if(route==='tools'){main.innerHTML=toolsHTML(locale,esc);main.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>b.dataset.tool==='0'?japaneseRestore():toast((grimoireWords[locale]||grimoireWords.zh).toolPending)));}else if(route==='statistics')await statistics(token);
    if(token===pageToken){enhanceSelects(main);dockPageTools(main);moveTabInk();alignSubtabs();{const group=route==='statistics'?'learning':route,view=group+':'+subtab;if(!main.querySelector(':scope>.tabs'))tabsGroup=null;if(main.dataset.lastRoute!==group){main.dataset.lastRoute=group;if(!document.documentElement.classList.contains('app-boot-pre'))pageEnter(main);}else if(main.dataset.lastView!==view&&(group==='learning'||group==='history')){subpageEnter(main.querySelector(group==='learning'?'#learning-content':'#history-content'));}main.dataset.lastView=view;}requestAnimationFrame(()=>setupMarquees(main));}
  }catch(error){if(token!==pageToken)return;main.innerHTML=empty(text.loadingFailed,'refresh')+`<button class="primary" id="retry">${text.retry}</button>`;main.querySelector('#retry').addEventListener('click',renderRoute);}
}
const navStack=[];let navIndex=-1;
const navEntry=()=>({route,subtab,game:selectedGameId,series:selectedSeriesId,origin:gameOrigin});
const sameEntry=(a,b)=>a&&b&&a.route===b.route&&(a.subtab||'')===(b.subtab||'')&&(a.route!=='game'||a.game===b.game)&&(a.route!=='series'||a.series===b.series);
function updateNavButtons(){document.querySelectorAll('[data-nav-step]').forEach(button=>{const target=navIndex+Number(button.dataset.navStep);button.disabled=target<0||target>=navStack.length;});}
function stepNavigation(step){const target=navIndex+step,entry=navStack[target];if(!entry)return;navIndex=target;selectedGameId=entry.game;selectedSeriesId=entry.series;gameOrigin=entry.origin;navigate(entry.route,entry.subtab,true);}
async function navigate(next,tab='',replay=false){if(next!=='learning'||tab!=='kana')invoke('kanji_go_hide').catch(()=>{});const ticket=++navigationTicket;if(!replay&&navIndex<0){navStack.push(navEntry());navIndex=0;}if(route==='settings'){rememberSettingsScroll();try{await leaveSettings();}catch{toast({zh:'设置保存失败，请稍后重试',en:'Could not save settings. Please retry',ja:'設定を保存できませんでした'}[locale]);return;}}await retractTabs(next==='statistics'?'learning':next);if(ticket!==navigationTicket)return;route=next;subtab=tab;if(!replay){const entry=navEntry();if(!sameEntry(navStack[navIndex],entry)){navStack.splice(navIndex+1);navStack.push(entry);if(navStack.length>60)navStack.shift();navIndex=navStack.length-1;}else navStack[navIndex]=entry;}updateNavButtons();document.querySelectorAll('[data-route]').forEach(button=>{if(button.dataset.route===route||(route==='game'||route==='series')&&button.dataset.route==='library'||route==='statistics'&&button.dataset.route==='learning')button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});renderRoute();}
async function start(){
  app.innerHTML=loading();
  try{
    const saved=await api('ui_state');
    for(const[key,value]of Object.entries(saved))if(localStorage.getItem(key)===null)localStorage.setItem(key,value);
    const recovered={};for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(/^(tome|tomoyo)-/.test(key)&&!/key|token|secret|password/i.test(key))recovered[key]=localStorage.getItem(key);}
    await api('preserve_ui',{values:recovered});
    model=await api('home');setAppearance();document.documentElement.classList.add('app-boot-pre');shell();await renderRoute();bootEntrance();
    /* v1.1.0: look for a new release once per start; silent unless there is one */
    if(!window.__megulitUpdateChecked){window.__megulitUpdateChecked=true;setTimeout(()=>checkForUpdates({api,invoke,version:VERSION,toast}),4000);}
    const callback=window.__TAURI_INTERNALS__?.transformCallback(response=>{playHomeMotion(response.payload);if(response.payload==='hidden'&&pendingHomeGame){const id=pendingHomeGame;pendingHomeGame='';api('focus_game',{id}).catch(error=>toast(errorMessage(error)));}});if(callback)await invoke('plugin:event|listen',{event:'overlay-home',target:{kind:'Any'},handler:callback});const healthCallback=window.__TAURI_INTERNALS__?.transformCallback(response=>{const state=response.payload;if(state.ready)readerNotice('');else if(state.error)readerNotice(state.error);});if(healthCallback)await invoke('plugin:event|listen',{event:'reader-health',target:{kind:'Any'},handler:healthCallback});const pendingCallback=window.__TAURI_INTERNALS__?.transformCallback(response=>{if(response.payload.type==='bindPending'&&document.hasFocus())toast(({zh:'等待游戏窗口。游戏已打开时，也可以用 Alt+T 手动绑定窗口',en:'Waiting for a game window. Use Alt+T to select a game window manually.',ja:'ゲームウィンドウを待機中です。Alt+T で手動選択できます'})[locale]);});if(pendingCallback)await invoke('plugin:event|listen',{event:'reader-event',target:{kind:'Any'},handler:pendingCallback});await invoke('window_action',{action:'ready'});const metadataCallback=window.__TAURI_INTERNALS__?.transformCallback(async()=>{try{model=await api('home');if(route==='library')renderGames();else if(route==='home')home();else if(route==='series')seriesUI.renderDetail(document.querySelector('#main'),selectedSeriesId);}catch{}});if(metadataCallback)await invoke('plugin:event|listen',{event:'library-updated',target:{kind:'Any'},handler:metadataCallback});window.__TOME_READY__=true;refreshLibrary({startup:true}).catch(()=>{});invoke('reader_open',{background:true}).then(()=>waitReader()).catch(error=>readerNotice(error.message||error)); 
  }
  catch(error){app.innerHTML=`<div class="loading-screen"><div>${text.loadingFailed}<button class="primary" id="startup-retry">${text.retry}</button></div></div>`;document.querySelector('#startup-retry').addEventListener('click',start);await invoke('window_action',{action:'ready'}).catch(()=>{});}
}
addEventListener('focus',()=>{refreshFocusedHome().catch(()=>{});});
start();
// E255: a settings row is a <label>; only the control itself should react, not the descriptive text
document.addEventListener('click',e=>{const row=e.target.closest?.('label.settings-row');if(!row)return;if(e.target.closest('input,select,textarea,button,a,.select-control,.switch,.toggle,[role=switch],.color-swatches,.setting-slider,.font-control'))return;e.preventDefault();},true);
// E261: even when a control's box is larger than what is drawn, only a click inside its visible size counts
document.addEventListener('click',e=>{const input=e.target.closest?.('label.settings-row input.switch,label.settings-row input[type=range]');if(!input||e.detail===0)return;const r=input.getBoundingClientRect(),h=input.type==='range'?20:30,top=r.top+(r.height-h)/2;if(e.clientY<top-2||e.clientY>top+h+2)e.preventDefault();},true);

// E248 (user: after quitting a game the home window came back with only the shelf painted, the rest see-through):
// when the window becomes visible or focused again, force one full repaint of the page.
(()=>{let pending=0;const repaint=()=>{if(document.visibilityState!=='visible'||pending)return;pending=requestAnimationFrame(()=>{const root=document.documentElement;root.style.opacity='0.999';pending=requestAnimationFrame(()=>{root.style.opacity='';pending=0;});});};
 document.addEventListener('visibilitychange',repaint);addEventListener('focus',repaint);addEventListener('pageshow',repaint);})();
