// SPDX-License-Identifier: GPL-3.0-or-later
// Keeps a left sidebar on the dictionary / log / statistics / settings / review pages, so switching between them
// changes the content on the right instead of feeling like a separate window with only a back button.
(function installNavShell(){
 'use strict';
 if(window.__tomeNavShell)return;
 if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',installNavShell,{once:true});return;}
 window.__tomeNavShell=true;
 const ICON={
  home:'<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  statistics:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  dictionary:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  log:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 8v4l3 2"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  about:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'
 };
 const ITEMS=[['/statistics','statistics'],['/','home'],['/dictionary','dictionary'],['/log','log'],['/settings','settings']];
 const LABEL={zh:{add:'添加游戏',pause:'暂停阅读',play:'启动',home:'主页',statistics:'统计',dictionary:'词典',log:'阅读记录',settings:'设置',about:'关于'},en:{add:'Add game',pause:'Pause reading',play:'Launch',home:'Home',statistics:'Statistics',dictionary:'Dictionary',log:'History',settings:'Settings',about:'About'},ja:{add:'ゲームを追加',pause:'一時停止',play:'起動',home:'ホーム',statistics:'統計',dictionary:'辞書',log:'履歴',settings:'設定',about:'情報'}};
 const SHELL=/^\/(dictionary|log|settings|statistics|review)(\/|$)/,HOME=p=>p==='/'||p==='',MEDIA=p=>/^\/media\/\d+\/?$/.test(p);
 const style=document.createElement('style');style.textContent=`
 html.tome-rail-on .side-nav,html.tome-rail-on .logo{display:none!important}
 /* Home library grid: spans the whole page and fills each row exactly. The minimum follows the window width (vw), so
    the column count changes late and the stretch between counts stays small; row changes are animated below. */
 .grid.svelte-1uha8ag{max-width:none!important;grid-template-columns:repeat(auto-fill,minmax(clamp(150px,14vw,230px),1fr))!important;justify-content:start}
 /* Game scanning and manual additions live in Home settings / Game library. */
 .toolbar.svelte-1uha8ag>.action-button.primary.tiny{display:none!important}
 .tome-rail a.avatar{overflow:hidden;padding:0}
 .tome-rail a.avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%}
 .tome-rail-time{font-size:11px;font-variant-numeric:tabular-nums;color:var(--theme-textSecondary,#999);margin-top:-2px}
 /* The page's own back button (the one right before the page title) is hidden by CSS, so it never flashes. */
 .action-button.primary.small:is(:has(+ h1),:has(+ h2),:has(+ * h1),:has(+ * h2)),.tome-hide-back{display:none!important}
 .tome-history{display:inline-flex;align-items:center;gap:2px;margin-right:6px;flex:none}
 .tome-history button{all:unset;box-sizing:border-box;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;color:var(--theme-text,#eee);cursor:pointer;transition:background .12s,color .12s}
 .tome-history button:hover:not(:disabled){background:color-mix(in srgb,var(--theme-text,#eee) 10%,transparent)}
 .tome-history button:disabled{color:color-mix(in srgb,var(--theme-text,#eee) 25%,transparent);cursor:default}
 .tome-history svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
 .tome-rail .sep{width:22px;height:1px;background:var(--theme-border,#333);margin:2px 0}
 .tome-rail{position:fixed;top:3rem;left:1rem;z-index:100;display:flex;flex-direction:column;gap:.5rem;align-items:center}
 .tome-rail a{position:relative;display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:var(--theme-surface,#1b1b1f);color:var(--theme-textSecondary,#aaa);border:1px solid transparent;text-decoration:none;transition:background .15s,color .15s,border-color .15s}
 .tome-rail a:hover{color:var(--theme-text,#eee);background:color-mix(in srgb,var(--theme-text,#eee) 10%,var(--theme-surface,#1b1b1f))}
 .tome-rail a[aria-current=page]{color:var(--theme-primary,#e0495a);border-color:var(--theme-primary,#e0495a);background:color-mix(in srgb,var(--theme-primary,#e0495a) 14%,var(--theme-surface,#1b1b1f))}
 .tome-rail svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
 .tome-rail a::after{content:attr(data-tip);position:absolute;left:56px;white-space:nowrap;padding:4px 9px;border-radius:7px;font-size:12px;background:var(--theme-surface,#1b1b1f);color:var(--theme-text,#eee);border:1px solid var(--theme-border,#333);opacity:0;pointer-events:none;transform:translateX(-4px);transition:opacity .12s,transform .12s}
 .tome-rail a:hover::after{opacity:1;transform:none}
 /* No focus ring on the rail (Shift counts as keyboard use, and Chromium's ring also wrapped the hidden tooltip box):
    keyboard focus shows the tooltip instead. */
 .tome-rail a:focus,.tome-rail a:focus-visible{outline:none!important}.tome-rail a:focus-visible::after{opacity:1;transform:none}
 html.tome-has-rail body{padding-left:72px!important;box-sizing:border-box}
 body.mini-mode .tome-rail,body.tomoyo-ui-translation .tome-rail{display:none!important}
 html.tome-has-rail body.mini-mode,html.tome-has-rail body.tomoyo-ui-translation{padding-left:0!important}
 @media (max-width:325px),(max-height:372px){.tome-rail{display:none}}`;
 (document.head||document.documentElement).appendChild(style);
 // Reading session state from the original media sidebar (its timer shows while a session runs).
 function session(){const nav=document.querySelector('.side-nav');if(!nav)return {playing:false,time:''};const t=[...nav.querySelectorAll('*')].find(e=>!e.children.length&&/^\d{1,2}:\d{2}:\d{2}$/.test(e.textContent.trim()));return {playing:!!t,time:t?t.textContent.trim():''};}

 // Explorer-style back / forward arrows, placed in the page header where the red back button was.
 const backButtons=()=>[...document.querySelectorAll('.action-button.primary.small')].filter(btn=>{if(btn.closest('.side-nav,.tome-rail,.modal,dialog'))return false;const n=btn.nextElementSibling;return !!n&&(n.matches('h1,h2')||!!n.querySelector('h1,h2'));});
 function arrows(){const g=document.createElement('div');g.className='tome-history';g.dataset.noI18n='';
  const mk=(dir,d)=>{const b=document.createElement('button');b.type='button';b.dataset.dir=dir;b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+d+'"/></svg>';b.onclick=e=>{e.preventDefault();dir==='back'?history.back():history.forward();};return b;};
  g.append(mk('back','M15 5l-7 7 7 7'),mk('forward','M9 5l7 7-7 7'));return g;}
 function syncArrows(){
  for(const btn of backButtons())if(!btn.previousElementSibling?.classList.contains('tome-history'))btn.before(arrows());
  const nav=window.navigation,lang=window.__tomeI18n?.get?.()||'zh',tips={zh:['后退','前进'],en:['Back','Forward'],ja:['戻る','進む']}[lang]||['后退','前进'];
  for(const g of document.querySelectorAll('.tome-history')){const [b,f]=g.querySelectorAll('button');b.disabled=nav?!nav.canGoBack:history.length<2;f.disabled=nav?!nav.canGoForward:false;b.title=tips[0];f.title=tips[1];b.setAttribute('aria-label',tips[0]);f.setAttribute('aria-label',tips[1]);}
 }
 let arrowQueued=false;new MutationObserver(()=>{if(arrowQueued)return;arrowQueued=true;queueMicrotask(()=>{arrowQueued=false;syncArrows();});}).observe(document.documentElement,{childList:true,subtree:true});
 // Animate responsive row changes without changing the grid's layout or stretching cover art.
 function installLibraryMotion(page){
  const groups=[page,...page.querySelectorAll(':scope > .controls-row,:scope > .grid,:scope > .media-header,:scope > .layout-header,:scope > .stat-grid,:scope > .layout-grid,.media-header .title-block,.media-header .title-row,.media-header .media-stats,.main-charts > .chart-grid')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),jobs=new Map();let previous=new Map(),rows='',width=0,stopped=false;
  const offset=node=>{const v=getComputedStyle(node).translate.split(/\s+/);return {x:parseFloat(v[0])||0,y:parseFloat(v[1])||0};};
  function measure(){
   if(stopped||!page.isConnected)return;
   const next=new Map(),signatures=[];
   for(const group of groups){
    const box=group.getBoundingClientRect();
    let first=null,count=0;
    for(const item of group.children){
     const rect=item.getBoundingClientRect();if(!rect.width||!rect.height)continue;const shift=offset(item);
     const pos={x:rect.left-box.left-shift.x,y:rect.top-box.top-shift.y};next.set(item,pos);
     if(first===null)first=pos.y;if(Math.abs(pos.y-first)<4)count++;
    }
    signatures.push(count);
   }
   const newWidth=page.clientWidth,newRows=signatures.join(':'),resized=width!==0&&Math.abs(width-newWidth)>.5;
   const wrapped=resized&&rows!==newRows;
   const enabled=!reduced.matches&&!document.body.classList.contains('tomoyo-ui-translation');
   for(const [node,animation]of jobs)if(!next.has(node)||!enabled){animation.cancel();jobs.delete(node);}
   if(enabled)for(const [node,pos]of next){
    const old=previous.get(node),active=jobs.get(node);if(!old||(!wrapped&&!(resized&&active)))continue;
    if(Math.abs(old.x-pos.x)<.5&&Math.abs(old.y-pos.y)<.5)continue;
    const current=active?offset(node):{x:0,y:0},dx=old.x+current.x-pos.x,dy=old.y+current.y-pos.y;
    active?.cancel();jobs.delete(node);if(Math.abs(dx)<.5&&Math.abs(dy)<.5)continue;
    const animation=node.animate([{translate:dx+'px '+dy+'px'},{translate:'0px 0px'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
    jobs.set(node,animation);animation.finished.then(()=>{if(jobs.get(node)===animation)jobs.delete(node);},()=>{});
   }
   previous=next;rows=newRows;width=newWidth;
  }
  const resize=new ResizeObserver(measure);resize.observe(page);for(const group of groups)resize.observe(group);
  reduced.addEventListener('change',measure);measure();
  return ()=>{stopped=true;resize.disconnect();reduced.removeEventListener('change',measure);for(const job of jobs.values())job.cancel();jobs.clear();};
 }
 let motionPage=null,motionContent=null,motionPath='',stopMotion=null;
 function syncLibraryMotion(){const page=document.querySelector('main.page.home,main.analytics-layout'),content=page?.querySelector(':scope > .grid,:scope > .media-header,:scope > .layout-grid');if(page===motionPage&&content===motionContent&&motionPath===location.pathname)return;stopMotion?.();motionPage=page;motionContent=content;motionPath=location.pathname;stopMotion=page?installLibraryMotion(page):null;}
 let rail=null,avatarSrc='';try{avatarSrc=sessionStorage.getItem('tome-avatar')||'';}catch{}
 // The profile picture lives in the original home sidebar; reuse it for the statistics button.
 // Only the home page's sidebar shows the user's own picture; a work's detail page puts that work's cover there, which
 // used to replace the avatar (user, 2026-11-02). Any cover remembered earlier is overwritten on the next home visit.
 function rememberAvatar(){if(!HOME(location.pathname))return;const img=document.querySelector('.side-nav img.profile-cover, .side-nav img');const src=img?.getAttribute('src');if(src&&src!==avatarSrc){avatarSrc=src;try{sessionStorage.setItem('tome-avatar',src);}catch{}}}
 // About lives on the home page (the original "?" button); go home first when needed, then press it.
 function openAbout(){const press=()=>{const btns=document.querySelectorAll('.side-nav .nav-actions button');const q=btns[btns.length-1];if(q){q.click();return true;}return false;};
  if(HOME(location.pathname)&&press())return;const a=document.createElement('a');a.href='/';a.style.display='none';document.body.append(a);a.click();a.remove();
  let n=0;const t=setInterval(()=>{if((HOME(location.pathname)&&press())||++n>40)clearInterval(t);},100);}
 // "Add game" is the home toolbar's red + button (hidden there); go home first when needed, then press it.
 function openAdd(){const press=()=>{const b=document.querySelector('.toolbar.svelte-1uha8ag>.action-button.primary.tiny');if(b){b.click();return true;}return false;};
  if(HOME(location.pathname)&&press())return;const a=document.createElement('a');a.href='/';a.style.display='none';document.body.append(a);a.click();a.remove();
  let n=0;const t=setInterval(()=>{if((HOME(location.pathname)&&press())||++n>40)clearInterval(t);},100);}
 function build(){rail=document.createElement('nav');rail.className='tome-rail';rail.setAttribute('aria-label','ToMe navigation');rail.dataset.noI18n='';
  for(const [href,key] of ITEMS){const a=document.createElement('a');a.href=href;a.dataset.key=key;a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[key]+'</svg>';if(key==='about')a.onclick=e=>{e.preventDefault();openAbout();};if(key==='add')a.onclick=e=>{e.preventDefault();openAdd();};rail.append(a);}
  document.body.append(rail);}
 function update(){
  if(!document.body)return;const path=location.pathname,show=SHELL.test(path)||HOME(path)||MEDIA(path);
  syncLibraryMotion();
  document.documentElement.classList.toggle('tome-has-rail',SHELL.test(path));document.documentElement.classList.toggle('tome-rail-on',show);rememberAvatar();
  syncArrows();
  if(!show){rail?.remove();rail=null;return;}
  if(!rail||!rail.isConnected)build();
  const lang=window.__tomeI18n?.get?.()||'zh',labels=LABEL[lang]||LABEL.zh;
  // The reading timer (shown while a session runs) sits at the end of the rail.
  rail.querySelector('a[data-key=play]')?.remove();let tl=rail.querySelector('.tome-rail-time');
  if(show){if(!tl){tl=document.createElement('div');tl.className='tome-rail-time';rail.append(tl);}const st=session();if(tl.textContent!==st.time)tl.textContent=st.time;}else tl?.remove();
  const av=rail.querySelector('a[data-key=statistics]');if(avatarSrc&&av&&av.dataset.src!==avatarSrc){av.dataset.src=avatarSrc;av.classList.add('avatar');av.innerHTML='';const im=document.createElement('img');im.src=avatarSrc;im.alt='';av.append(im);}
  for(const a of rail.querySelectorAll('a')){const href=a.getAttribute('href'),on=href==='/'?HOME(path):href.startsWith('/')&&(path===href||path.startsWith(href+'/'))||(href==='/statistics'&&path.startsWith('/review'));const k=a.dataset.key==='play'&&a.dataset.icon==='pause'?'pause':a.dataset.key;a.dataset.tip=labels[k];a.setAttribute('aria-label',labels[k]);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 }
 for(const fn of ['pushState','replaceState']){const orig=history[fn];history[fn]=function(...args){const r=orig.apply(this,args);queueMicrotask(update);return r;};}
 addEventListener('popstate',update);addEventListener('tome-language-change',update);
 // SvelteKit sometimes swaps the whole body subtree; re-attach the rail when that happens.
 new MutationObserver(()=>{if(SHELL.test(location.pathname)&&(!rail||!rail.isConnected))update();}).observe(document.documentElement,{childList:true,subtree:false});
 if(document.body)update();else document.addEventListener('DOMContentLoaded',update,{once:true});
 setInterval(update,1000);
})();
