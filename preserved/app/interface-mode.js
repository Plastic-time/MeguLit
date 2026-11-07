(function installInterfaceMode(){
 'use strict';
 if(window.__tomoyoMode)return;
 let mode='normal',normalPath='/',readerPath='';
 try{mode=localStorage.getItem('tomoyo-interface-mode')==='translation'?'translation':'normal';normalPath=localStorage.getItem('tomoyo-normal-path')||'/';readerPath=localStorage.getItem('tomoyo-reader-path')||'';}catch{}
 const isReader=path=>/^\/media\/\d+\/?$/.test(path||'');
 // Every app start (including restarts) opens on the home page in normal mode; reloads within one run keep the mode.
 let fresh=false;try{fresh=!sessionStorage.getItem('tomoyo-run');sessionStorage.setItem('tomoyo-run','1');}catch{}
 if(fresh){mode='normal';normalPath='/';try{localStorage.setItem('tomoyo-interface-mode','normal');localStorage.setItem('tomoyo-normal-path','/');}catch{}if(isReader(location.pathname)){location.replace('/');return;}}
 function remember(){if(isReader(location.pathname)){readerPath=location.pathname;try{localStorage.setItem('tomoyo-reader-path',readerPath);}catch{}}}
 remember();
 function paint(){
  for(const node of [document.documentElement,document.body])if(node){node.classList.toggle('tomoyo-ui-normal',mode==='normal');node.classList.toggle('tomoyo-ui-translation',mode==='translation');node.classList.toggle('mini-mode',mode==='translation');}
  if(mode==='normal')for(const n of document.querySelectorAll('[data-tomoyo-transparent]'))n.removeAttribute('data-tomoyo-transparent');
  window.__tomoyoChinese?.applyTransparency?.();
 }
 // Client-side route change (SvelteKit handles same-origin <a> clicks), so switching modes never reloads the page
 // and never flashes a blank or half-built screen. A real navigation is only the fallback.
 function go(path){if(location.pathname===path)return;const a=document.createElement('a');a.href=path;a.style.display='none';(document.body||document.documentElement).append(a);a.click();a.remove();const until=Date.now()+1500;const check=()=>{if(location.pathname===path)return;if(Date.now()>until){location.assign(path);return;}setTimeout(check,60);};setTimeout(check,60);}
 // ── Mode transitions ──────────────────────────────────────────────────────────────────────────────────────────────
 // normal → translation: the main window squeezes down into the dialogue box, then the box sharpens in.
 // translation → normal: the box blurs away, then the main window unfolds upward from the bottom.
 // While a switch is in progress the page is covered (html.tome-mode-cover), so no intermediate page is ever shown.
 const root=()=>document.documentElement,reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 let transition=0,requestPending=0,coverTimer=0;
 function cover(on){root().classList.toggle('tome-mode-cover',on);clearTimeout(coverTimer);if(on)coverTimer=setTimeout(()=>{if(root().classList.contains('tome-mode-cover'))reveal(mode);},2600);}
 function frames(n){return new Promise(r=>{const step=()=>n--<=0?r():requestAnimationFrame(step);requestAnimationFrame(step);});}
 function visibleWindow(){return [...document.querySelectorAll('.sentence-window')].find(n=>n.getClientRects().length)||null;}
 async function ready(target,serial){const until=Date.now()+1600;while(Date.now()<until&&serial===transition){
   // Without a game the window first shrinks to the dialogue strip; showing the box before that flashed it at full size.
   const path=location.pathname,ok=target==='translation'?(!isReader(readerPath)||isReader(path))&&(!isReader(path)||(!!visibleWindow()&&document.body?.classList.contains('mini-mode')))&&(document.body?.classList.contains('tomoyo-gal-bound')||innerHeight<=320):(!isReader(path)||path===normalPath)&&!!document.querySelector('main');
   if(ok)break;await frames(1);}
  await frames(2);}
 function play(cls,ms,full){const r=root();r.classList.remove('tome-mode-in-normal','tome-mode-in-translation','tome-mode-out-normal','tome-mode-out-translation');void r.offsetWidth;r.classList.add(cls);if(full)r.classList.add('tome-region-full');return new Promise(done=>setTimeout(()=>{r.classList.remove(cls);if(full)r.classList.remove('tome-region-full');done();},reduced()?0:ms));}
 async function reveal(target){const serial=++transition;await ready(target,serial);if(serial!==transition)return;cover(false);await play(target==='translation'?'tome-mode-in-translation':'tome-mode-in-normal',target==='translation'?320:380,target==='translation');}
 // Alt+M (from the native hotkey via 'modeRequest', or pressed inside the window): play the leaving half first.
 async function requestToggle(){
  if(requestPending&&Date.now()-requestPending<1500)return;requestPending=Date.now();
  const from=mode,send=()=>{try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galToggleMode'}));}catch{}};
  document.querySelector('.tomoyo-cn-dialog[open]')?.dispatchEvent(new Event('cancel',{cancelable:true}));window.__tomoyoChinese?.closeBacklog?.();
  await play(from==='translation'?'tome-mode-out-translation':'tome-mode-out-normal',from==='translation'?200:260,from==='translation');
  cover(true);root().classList.add('tome-mode-hold');await frames(1);send();
  // If the switch never arrives (older window component), uncover again.
  setTimeout(()=>{root().classList.remove('tome-mode-hold');if(mode===from&&root().classList.contains('tome-mode-cover')){cover(false);}requestPending=0;},1400);
 }
 async function navigate(){
  if(mode==='translation'&&!isReader(location.pathname)){
   if(!isReader(readerPath))try{
    const invoke=window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
    const db=await invoke('plugin:sql|load',{db:'sqlite:immersion.db'});
    const rows=await invoke('plugin:sql|select',{db,query:'SELECT id FROM media ORDER BY id DESC LIMIT 1',values:[]});
    if(Number.isSafeInteger(rows?.[0]?.id))readerPath='/media/'+rows[0].id;
   }catch{}
   if(mode!=='translation')return;
   if(isReader(readerPath)){remember();go(readerPath);}
   else window.__tomoyoChinese?.learningStatus?.({learningMessage:'请先在普通 ToMe 界面添加并打开一部作品，再按 Alt+M'});
  }else if(mode==='normal'&&isReader(location.pathname)&&normalPath!==location.pathname)go(normalPath);
 }
 // Serialise and coalesce native changes: overlapping acknowledgements used to retry each other forever.
 const syncTaskbar=window.__tomeCreateTaskbarSync({initial:false,
  hidden:()=>mode==='translation',
  invoke:()=>{const internal=window.__TAURI_INTERNALS__;return internal?.invoke?hidden=>internal.invoke('plugin:window|set_skip_taskbar',{label:'main',value:hidden}):null;},
  notify:state=>{window.__tomeTaskbarState=state;}
 });
 function set(value,navigation=false){
  const next=value==='translation'?'translation':'normal';
  if(next!==mode&&next==='translation'){normalPath=location.pathname;try{localStorage.setItem('tomoyo-normal-path',normalPath);}catch{}}
  const changed=next!==mode;if(changed){cover(true);root().classList.remove('tome-mode-hold');requestPending=0;}
  mode=next;try{localStorage.setItem('tomoyo-interface-mode',mode);}catch{}
  syncTaskbar();remember();paint();window.dispatchEvent(new Event('resize'));if(navigation||mode==='translation'&&!isReader(location.pathname))navigate();
  if(changed&&document.body)reveal(mode);
 }
 function gameClosed(){
  normalPath='/';try{localStorage.setItem('tomoyo-normal-path','/');}catch{}
  document.querySelector('.tomoyo-cn-dialog[open]')?.dispatchEvent(new Event('cancel',{cancelable:true}));window.__tomoyoChinese?.closeBacklog?.();
  set('normal',true);go('/');
 }
 const nativeValues=new Map();
 function restoreSnapshot(settings){for(const [key,value]of Object.entries(window.__tomoyoNativePreferences||{}))if(settings[key]===undefined)settings[key]=value;return settings;}
 const keys=['mini_mode_enabled','mini_mode_enter_height','mini_mode_exit_height','mini_mode_transparency'];
 function manualSettings(settings){
  if(!settings||typeof settings!=='object')return settings;restoreSnapshot(settings);
  for(const key of keys){nativeValues.set(key,settings[key]);Object.defineProperty(settings,key,{enumerable:true,configurable:true,
    get:()=>key==='mini_mode_enabled'?mode==='translation':key==='mini_mode_transparency'?1:key==='mini_mode_enter_height'?(mode==='translation'?10000000:-1):(mode==='translation'?10000001:0),
    set:value=>nativeValues.set(key,value)});}
  return settings;
 }
 function restoreSettings(settings){const value={...settings};for(const key of keys)if(nativeValues.has(key))value[key]=nativeValues.get(key);return value;}
 function hook(){
  const internal=window.__TAURI_INTERNALS__;if(!internal?.invoke){setTimeout(hook,0);return;}
  syncTaskbar();
  const original=window.__tomoyoNativeInvoke||internal.invoke.bind(internal);
  window.__tomoyoInvoke=async(command,args={},...rest)=>{
   if(['tokenize_text','lookup_at_position','lookup_exact','scan_sentence'].includes(command)&&!window.__tomoyoChinese?.learningInstalled){
    const until=Date.now()+15000;while(!window.__tomoyoChinese?.learningInstalled){if(Date.now()>until)throw Error('Full 接口未安装，已阻止旧分词器代替运行');await new Promise(resolve=>setTimeout(resolve,20));}
    return window.__tomoyoInvoke(command,args,...rest);
   }
   if(command==='get_settings')return manualSettings(await original(command,args,...rest));
   if(command==='save_settings'&&args.settings){const settings={...args.settings};for(const key of keys)if(nativeValues.has(key))settings[key]=nativeValues.get(key);return original(command,{...args,settings},...rest);}
   return original(command,args,...rest);
  };
 }
 // Translation mode only shows the reader page through the window region; if anything routes away from it (a stray
 // back navigation, a home link), go back, otherwise dragging the menu exposes the library behind the dialogue box.
 setInterval(()=>{if(mode==='translation'&&isReader(readerPath)&&!isReader(location.pathname)&&!root().classList.contains('tome-mode-cover'))go(readerPath);},500);
 window.__tomoyoMode={set,requestToggle,go,gameClosed,isTranslation:()=>mode==='translation',get:()=>mode,prepareNativeSettings:manualSettings,restoreNativeSettings:restoreSettings};hook();
 // Named apart from ready(target,serial) above: two declarations of one name in this scope would make the later one
 // replace the earlier, so reveal() would skip waiting for the page and add another copy of these styles every switch.
 function installStyles(){
  const style=document.createElement('style');style.textContent=`html.tomoyo-ui-normal,body.tomoyo-ui-normal { background:var(--theme-background,#12213a)!important; opacity:1!important; backdrop-filter:none!important; } html.tomoyo-ui-translation,body.tomoyo-ui-translation { background:transparent!important; background-image:none!important; box-shadow:none!important; backdrop-filter:none!important; }
  /* While covered the window is fully transparent: no theme background (it showed as an empty dark window) and no
     stray child that sets its own visibility. */
  html.tome-mode-cover,html.tome-mode-cover body { background:transparent!important; background-image:none!important; }
  html.tome-mode-cover body,html.tome-mode-cover body * { visibility:hidden!important; }
  html.tome-mode-cover body * { animation-play-state:paused!important; }
  /* The main view squeezes into its bottom edge and unfolds from it. Only scale and opacity are animated (compositor,
     full frame rate); the theme background is on body alone meanwhile, so it unfolds with the content. */
  html.tome-mode-out-normal,html.tome-mode-in-normal { background:transparent!important; }
  html.tome-mode-out-normal body { transform-origin:50% 100%; will-change:scale,opacity; animation:tome-squeeze .24s cubic-bezier(.5,0,.75,0) both; }
  @keyframes tome-squeeze { from { scale:1 1; opacity:1; } 60% { opacity:1; } to { scale:1 .06; opacity:0; } }
  html.tome-mode-in-normal body { transform-origin:50% 100%; will-change:scale,opacity; animation:tome-unfold .34s cubic-bezier(.16,1,.3,1) both; }
  @keyframes tome-unfold { from { scale:1 .06; opacity:0; } 30% { opacity:1; } to { scale:1 1; opacity:1; } }
  html.tome-mode-in-normal body > * { animation:tome-unfold-content .34s cubic-bezier(.3,0,.2,1) both; }
  @keyframes tome-unfold-content { from { opacity:0; } 35% { opacity:0; } to { opacity:1; } }
  html.tome-mode-out-translation :is(.sentence-window,.tomoyo-native-mask) { transform-origin:50% 100%; animation:tome-box-out .18s cubic-bezier(.5,0,.75,0) both; }
  @keyframes tome-box-out { to { opacity:0; scale:1 .9; } }
  html.tome-mode-in-translation .sentence-window { transform-origin:50% 100%; animation:tome-box-in .3s cubic-bezier(.16,1,.3,1) both; }
  @keyframes tome-box-in { from { opacity:0; scale:1 .82; translate:0 6px; } to { opacity:1; scale:1 1; translate:0 0; } }
  @media (prefers-reduced-motion: reduce) { html[class*=tome-mode-] body, html[class*=tome-mode-] .sentence-window { animation:none!important; } }`;
  (document.head||document.documentElement).appendChild(style);paint();
 }
 if(document.documentElement)installStyles();else document.addEventListener('DOMContentLoaded',installStyles,{once:true});
 document.addEventListener('DOMContentLoaded',paint,{once:true});
})();
