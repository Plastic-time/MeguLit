// SPDX-License-Identifier: GPL-3.0-or-later
// Custom background for ToMe's own pages (home, works, settings) in normal mode: a picture of the user's choice with
// blur, dimming and saturation, and optional frosted-glass panels over it. Translation mode stays transparent.
// The picture is copied to config\background.* by the launcher; the effect settings live in localStorage.
(function installBackground(){
 'use strict';
 const b=window.__tomoyoChinese;if(!b?.v4Request){setTimeout(installBackground,200);return;}if(b.backgroundInstalled)return;b.backgroundInstalled=true;
 const KEY='tome-background';
 const defaults={blur:0,dim:35,saturate:100,glass:true,glassBlur:14,glassAlpha:55};
 let cfg={...defaults};try{cfg={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{}
 let image='';
 // The Alt+T menu over the game: same picture, its own effect values.
 // Used by every panel over the game (Alt+T menu, backlog, lookup card). The picture follows the home picture unless
 // the user picks one for these panels on the home settings page (custom); the Alt+T menu no longer edits it.
 const GAME_KEY='tome-menu-background',gameDefaults={blur:16,dim:40,saturate:110,alpha:62,custom:false,radius:18,border:8,glassBlur:18,glassDim:0,glassSaturate:100,surfaces:{menu:'image',log:'image',card:'image'}};
 let gameImage='';
 let gcfg={...gameDefaults};try{gcfg={...gameDefaults,...JSON.parse(localStorage.getItem(GAME_KEY)||'{}')};}catch{}
 // The Alt+T menu, backlog and lookup card each have their own six values (user, 2026-11-03: the menu's opacity changed
 // the other two). Old saves held one shared set: each panel starts from it.
 const PANELS=['menu','log','card'],PANEL_KEYS=['blur','dim','saturate','alpha','radius','border','glassBlur','glassDim','glassSaturate'];
 {const old=gcfg.panels||{},next={};for(const p of PANELS){next[p]={};for(const k of PANEL_KEYS){const v=Number(old[p]?.[k]??gcfg[k]??gameDefaults[k]);next[p][k]=Number.isFinite(v)?v:gameDefaults[k];}}gcfg.panels=next;}
 const T={
  zh:{glassDim:'毛玻璃变暗',glassSaturate:'毛玻璃饱和度',gameTitle:'游戏内面板',gameText:'Alt+T 菜单、对话记录和点读窗口的背景；默认使用主页背景图片',custom:'游戏内面板单独使用一张图片',sourceHome:'图片：跟随主页背景（可在 ToMe 主页设置中单独更换）',sourceCustom:'图片：游戏内面板单独图片（在 ToMe 主页设置中更换）',radius:'圆角',surfaces:'面板背景',menuSurface:'Alt+T 菜单',logSurface:'对话记录',cardSurface:'点读弹窗',modeImage:'背景图',modeGlass:'毛玻璃',modeBoth:'背景图 + 毛玻璃',modePlain:'纯色',glassBlur:'毛玻璃模糊',glassTip:'毛玻璃由 ToMe 实时读取面板背后的画面（游戏、桌面或其他窗口）再模糊；毛玻璃的模糊、变暗和饱和度在各面板分区里单独调，背景模糊等只作用于背景图',border:'边框亮度',alpha:'面板不透明度',picture:'背景图片',title:'主页背景',text:'换成自己的图片，并可加模糊、变暗和毛玻璃面板；文本框翻译模式不受影响',pick:'选择图片',adjust:'调整显示区域',cropTitle:'调整显示区域',cropHint:'拖动方框选择显示区域，滚轮或滑块缩放；主页已实时预览',zoom:'缩放',ok:'确认',cancel:'取消',clear:'恢复默认',blur:'背景模糊',dim:'背景变暗',saturate:'饱和度',glass:'毛玻璃面板（侧栏、作品卡片、菜单）',glassBlur:'毛玻璃模糊',glassAlpha:'毛玻璃不透明度',none:'未设置背景图片',set:'已设置背景图片'},
  en:{glassDim:'Darken glass',glassSaturate:'Glass saturation',gameTitle:'In-game panels',gameText:'Background of the Alt+T menu, backlog and lookup card; uses the home picture by default',custom:'Use a separate picture for in-game panels',sourceHome:'Picture: follows the home background (a separate one can be set on the home settings page)',sourceCustom:'Picture: separate in-game picture (change it on the home settings page)',radius:'Corner radius',surfaces:'Panel background',menuSurface:'Alt+T menu',logSurface:'Backlog',cardSurface:'Lookup card',modeImage:'Picture',modeGlass:'Frosted glass',modeBoth:'Picture + frosted glass',modePlain:'Plain colour',glassBlur:'Glass blur',glassTip:'Frosted glass: ToMe reads whatever is behind the panel live (game, desktop or other windows) and blurs it. Glass blur, darkening and saturation are set per panel below; background blur and the like only affect the picture',border:'Border brightness',alpha:'Panel opacity',picture:'Background picture',title:'Home background',text:'Use your own picture, with blur, dimming and frosted-glass panels; translation mode is not affected',pick:'Choose picture',adjust:'Adjust visible area',cropTitle:'Adjust visible area',cropHint:'Drag the frame to choose the visible area; zoom with the wheel or slider. The home page previews it live',zoom:'Zoom',ok:'Confirm',cancel:'Cancel',clear:'Restore default',blur:'Background blur',dim:'Darken background',saturate:'Saturation',glass:'Frosted-glass panels (sidebar, work cards, menu)',glassBlur:'Glass blur',glassAlpha:'Glass opacity',none:'No background picture',set:'Background picture set'},
  ja:{glassDim:'すりガラスを暗く',glassSaturate:'すりガラスの彩度',gameTitle:'ゲーム内パネル',gameText:'Alt+T メニュー・ログ・辞書カードの背景。既定ではホーム背景の画像を使います',custom:'ゲーム内パネルに別の画像を使う',sourceHome:'画像：ホーム背景と同じ（ホームの設定で個別に変更できます）',sourceCustom:'画像：ゲーム内パネル専用（ホームの設定で変更）',radius:'角の丸み',surfaces:'パネルの背景',menuSurface:'Alt+T メニュー',logSurface:'ログ',cardSurface:'辞書カード',modeImage:'背景画像',modeGlass:'すりガラス',modeBoth:'背景画像＋すりガラス',modePlain:'単色',glassBlur:'すりガラスのぼかし',glassTip:'すりガラスは ToMe がパネルの後ろ（ゲーム・デスクトップ・ほかのウィンドウ）をリアルタイムで読み取ってぼかします。すりガラスのぼかし・暗さ・彩度は下の各パネルで個別に調整でき、背景のぼかしなどは背景画像だけに効きます',border:'枠の明るさ',alpha:'パネルの不透明度',picture:'背景画像',title:'ホーム背景',text:'好きな画像に変更し、ぼかし・暗さ・すりガラスのパネルを加えられます。字幕の翻訳モードには影響しません',pick:'画像を選択',adjust:'表示範囲を調整',cropTitle:'表示範囲を調整',cropHint:'枠をドラッグして表示範囲を選び、ホイールかスライダーで拡大します。ホームにそのままプレビューされます',zoom:'拡大',ok:'確定',cancel:'キャンセル',clear:'既定に戻す',blur:'背景のぼかし',dim:'背景を暗く',saturate:'彩度',glass:'すりガラスのパネル（サイドバー・作品カード・メニュー）',glassBlur:'すりガラスのぼかし',glassAlpha:'すりガラスの不透明度',none:'背景画像は未設定',set:'背景画像を設定済み'}};
 const t=k=>((T[window.__tomeI18n?.get?.()]||T.zh)[k]||T.zh[k]);

 const layer=document.createElement('div');layer.id='tome-bg';layer.setAttribute('aria-hidden','true');
 const style=document.createElement('style');style.textContent=`
  #tome-bg{position:fixed;inset:-40px;z-index:-1;pointer-events:none;background-position:center;background-size:cover;background-repeat:no-repeat;display:none}
  html.tome-has-bg #tome-bg{display:block}
  .tome-crop{position:fixed;z-index:2147483000;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:16px;background:var(--theme-surface,#18181b);color:var(--theme-text,#eee);border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent);box-shadow:0 24px 60px rgba(0,0,0,.5);font-size:13px;animation:tome-crop-in .16s ease-out}
  @keyframes tome-crop-in{from{opacity:0;transform:translateY(-6px)}}
  .tome-crop header{display:flex;align-items:center;justify-content:space-between;cursor:grab;user-select:none;font-weight:700;font-size:14px}
  .tome-crop header button{all:unset;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:18px;color:var(--theme-textSecondary,#aaa)}.tome-crop header button:hover{background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent);color:var(--theme-text,#eee)}
  .tome-crop-stage{position:relative;overflow:hidden;border-radius:10px;align-self:center;min-width:200px;min-height:120px;background:#000;touch-action:none}
  .tome-crop-stage img{display:block;width:100%;height:100%;object-fit:fill;user-select:none;-webkit-user-drag:none;pointer-events:none}
  .tome-crop-stage i{position:absolute;box-sizing:border-box;border:2px solid #fff;border-radius:4px;box-shadow:0 0 0 9999px rgba(0,0,0,.55),0 0 0 1px rgba(0,0,0,.4);cursor:grab}.tome-crop-stage i.tome-dragging{cursor:grabbing}
  .tome-crop-zoom{display:flex;align-items:center;gap:12px}.tome-crop-zoom input{flex:1;min-width:0;accent-color:var(--theme-primary,#e0495a)}.tome-crop-zoom output{min-width:44px;text-align:right;font-variant-numeric:tabular-nums;color:var(--theme-textSecondary,#aaa)}
  .tome-crop small{color:var(--theme-textSecondary,#999);line-height:1.5;max-width:520px}
  .tome-crop footer{display:flex;justify-content:flex-end;gap:8px}.tome-crop footer button{padding:8px 18px;border-radius:9px;border:1px solid var(--theme-border,#34343b);background:transparent;color:var(--theme-text,#eee);font:inherit;font-weight:600;cursor:pointer}
  .tome-crop footer button[data-ok]{background:var(--theme-primary,#e0495a);border-color:transparent;color:#fff}
  body.tomoyo-ui-translation #tome-bg{display:none!important}
  html.tome-has-bg body:not(.tomoyo-ui-translation),html.tome-has-bg body:not(.tomoyo-ui-translation) main.page{background:transparent!important}
  html.tome-has-bg:has(body:not(.tomoyo-ui-translation)){background:var(--theme-background,#0d0d0f)}
  html.tome-glass body:not(.tomoyo-ui-translation) .side-nav,html.tome-glass body:not(.tomoyo-ui-translation) .page .card,html.tome-glass body:not(.tomoyo-ui-translation) .tomoyo-cn-dialog{background:color-mix(in srgb,var(--theme-surface,#121218) calc(var(--tome-glass-alpha,.55)*100%),transparent)!important;-webkit-backdrop-filter:blur(var(--tome-glass-blur,14px)) saturate(1.2);backdrop-filter:blur(var(--tome-glass-blur,14px)) saturate(1.2);border-radius:14px}
  html.tome-glass body:not(.tomoyo-ui-translation) .page .card{padding:8px}
  .settings-content>.tome-bg-panel{display:none}.settings-content.tome-bg-selected>:not(.tome-bg-panel){display:none!important}.settings-content.tome-bg-selected>.tome-bg-panel{display:block!important}
  /* Same rows as the app's own settings pages: label on the left, control on the right, thin divider between. */
  .tome-bg-menu{display:flex;flex-direction:column;gap:1.1rem}
  .tome-bg-menu .setting-label{display:flex;flex-direction:column;gap:2px;min-width:0}
  .tome-bg-menu .tome-bg-hint{font-size:12px;color:var(--theme-textSecondary,#91919f);line-height:1.6}
  .tome-bg-menu .tome-bg-actions{display:flex;gap:8px;align-items:center;flex:none}
  .tome-bg-menu .tome-bg-actions button{appearance:none;background:var(--theme-surface,#18181b);color:inherit;border:2px solid var(--theme-border,#2a2a2e);border-radius:8px;padding:5px 14px;font:500 14.4px/1.4 inherit;cursor:pointer;transition:border-color .15s,background .15s}
  .tome-bg-menu .tome-bg-actions button:hover{border-color:var(--theme-primary,#df435e)}
  .tome-bg-menu .tome-bg-actions button:focus-visible{outline:2px solid var(--theme-primary,#df435e);outline-offset:2px}
  .tome-bg-menu .tome-bg-range{display:flex;align-items:center;gap:12px;flex:0 1 320px;min-width:140px}
  .tome-bg-menu input[type=range]{flex:1;min-width:0;margin:0;accent-color:var(--theme-primary,#df435e)}
  .tome-bg-menu output{min-width:3.4em;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--theme-textSecondary,#a5a5b2)}
  @media(max-width:650px){.tome-bg-menu .setting-row{flex-wrap:wrap}.tome-bg-menu .tome-bg-range{flex-basis:100%}}
  /* In-game menu: the picture is blurred once in its own layer (no backdrop-filter, which re-blurs every frame over
     the whole transparent overlay and made other video stutter); a tint on top sets the panel opacity. */
  html body.tomoyo-ui-translation .tomoyo-cn-dialog{background:transparent!important;isolation:isolate}
  .tomoyo-cn-dialog{--tome-p-glass-blur:var(--tome-menu-glass-blur,18px);--tome-p-glass-bright:var(--tome-menu-glass-bright,1);--tome-p-glass-sat:var(--tome-menu-glass-sat,1);--tome-p-alpha:var(--tome-menu-alpha,.62);--tome-p-image:var(--tome-menu-image,none);--tome-p-radius:var(--tome-menu-radius,18px);--tome-p-border:var(--tome-menu-border,.08)}
  .tome-backlog{--tome-p-glass-blur:var(--tome-log-glass-blur,18px);--tome-p-glass-bright:var(--tome-log-glass-bright,1);--tome-p-glass-sat:var(--tome-log-glass-sat,1);--tome-p-alpha:var(--tome-log-alpha,.62);--tome-p-image:var(--tome-log-image,none);--tome-p-radius:var(--tome-log-radius,18px);--tome-p-border:var(--tome-log-border,.08)}
  .tomoyo-selection-card{--tome-p-glass-blur:var(--tome-card-glass-blur,18px);--tome-p-glass-bright:var(--tome-card-glass-bright,1);--tome-p-glass-sat:var(--tome-card-glass-sat,1);--tome-p-alpha:var(--tome-card-alpha,.62);--tome-p-image:var(--tome-card-image,none);--tome-p-radius:var(--tome-card-radius,18px);--tome-p-border:var(--tome-card-border,.08)}
  .tome-menu-bg{position:absolute;inset:0;z-index:-1;border-radius:inherit;overflow:hidden;pointer-events:none;background:var(--theme-surface,#121218);opacity:var(--tome-p-alpha,.62)}
  .tome-menu-bg>i{position:absolute;inset:0;background-position:center;background-size:cover;background-image:var(--tome-p-image,none);will-change:transform}
  body:not(.tomoyo-ui-translation) .tome-menu-bg{display:none}
  /* The backlog and the lookup card use the same layer as the Alt+T menu, each with its own values. */
  body.tomoyo-ui-translation .tome-backlog,body.tomoyo-ui-translation .tomoyo-selection-card{background:transparent!important;isolation:isolate}
  /* The backlog fades its children in with an animation that fills forwards, which pinned this layer at opacity 1: the
     log's own panel opacity (26%) showed fully opaque (user, 2026-11-03). The layer keeps its opacity setting instead. */
  .tome-backlog>.tome-menu-bg{animation:none!important}
  /* While the backlog is dragged its page blur (backdrop-filter over ToMe's own text) is re-run over the whole
     transparent overlay every frame, which made the drag stutter (user, 2026-11-03); it returns on release. */
  body.tomoyo-ui-translation .tome-backlog.tome-log-dragging{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
  /* Glass panels show an opaque live picture (below), which covers ToMe's own text under them: no page blur needed,
     which also removes the backlog's backdrop-filter cost (E148). */
  html:is([data-tome-log-surface=glass],[data-tome-log-surface=both]) body.tomoyo-ui-translation .tome-backlog{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
  body.tomoyo-ui-translation :is(.tomoyo-cn-dialog,.tome-backlog,.tomoyo-selection-card){border-radius:var(--tome-p-radius,18px)!important;border-color:rgba(255,255,255,var(--tome-p-border,.08))!important}
  /* Per-surface background: picture (default), frosted glass (blurred game frame), both, or plain tint. */
  /* Frosted glass (E148): the bridge reads what is really behind the panels (game, desktop, other windows) and sends a
     small picture; this layer scales, blurs, darkens and positions it on the GPU, like the home page's glass. The tint
     (::after) sets how dark the panel looks. */
  .tome-menu-bg>b{position:absolute;inset:-40px;display:none;background-repeat:no-repeat;filter:blur(var(--tome-p-glass-blur,18px)) brightness(var(--tome-p-glass-bright,1)) saturate(var(--tome-p-glass-sat,1))}
  html:is([data-tome-menu-surface=glass],[data-tome-menu-surface=both]) .tomoyo-cn-dialog>.tome-menu-bg>b,html:is([data-tome-log-surface=glass],[data-tome-log-surface=both]) .tome-backlog>.tome-menu-bg>b,html:is([data-tome-card-surface=glass],[data-tome-card-surface=both]) .tomoyo-selection-card>.tome-menu-bg>b{display:block}
  html[data-tome-menu-surface=glass] .tomoyo-cn-dialog>.tome-menu-bg,html[data-tome-menu-surface=both] .tomoyo-cn-dialog>.tome-menu-bg,html[data-tome-log-surface=glass] .tome-backlog>.tome-menu-bg,html[data-tome-log-surface=both] .tome-backlog>.tome-menu-bg,html[data-tome-card-surface=glass] .tomoyo-selection-card>.tome-menu-bg,html[data-tome-card-surface=both] .tomoyo-selection-card>.tome-menu-bg{opacity:1;background:transparent}
  html[data-tome-menu-surface=glass] .tomoyo-cn-dialog>.tome-menu-bg::after,html[data-tome-menu-surface=both] .tomoyo-cn-dialog>.tome-menu-bg::after,html[data-tome-log-surface=glass] .tome-backlog>.tome-menu-bg::after,html[data-tome-log-surface=both] .tome-backlog>.tome-menu-bg::after,html[data-tome-card-surface=glass] .tomoyo-selection-card>.tome-menu-bg::after,html[data-tome-card-surface=both] .tomoyo-selection-card>.tome-menu-bg::after{content:"";position:absolute;inset:0;background:var(--theme-surface,#121218);opacity:calc(var(--tome-p-alpha,.62) * .6)}
  html[data-tome-menu-surface=glass] .tomoyo-cn-dialog>.tome-menu-bg>i,html[data-tome-menu-surface=plain] .tomoyo-cn-dialog>.tome-menu-bg>i,html[data-tome-log-surface=glass] .tome-backlog>.tome-menu-bg>i,html[data-tome-log-surface=plain] .tome-backlog>.tome-menu-bg>i,html[data-tome-card-surface=glass] .tomoyo-selection-card>.tome-menu-bg>i,html[data-tome-card-surface=plain] .tomoyo-selection-card>.tome-menu-bg>i{display:none}
  html[data-tome-menu-surface=both] .tomoyo-cn-dialog>.tome-menu-bg>i,html[data-tome-log-surface=both] .tome-backlog>.tome-menu-bg>i,html[data-tome-card-surface=both] .tomoyo-selection-card>.tome-menu-bg>i{opacity:.55}
  .tome-bg-surfaces{display:flex;flex-direction:column;gap:10px;margin-top:16px}.tome-bg-surfaces>h5{margin:0;font-size:11.5px;font-weight:700;color:var(--theme-textSecondary,#7a7c82)}
  .tome-bg-surfaces .setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.tome-bg-surfaces select{min-width:190px}
  /* Home settings page: the same dark rounded select with a chevron as in the Alt+T menu, not the native white box (user, 2026-11-03). */
  body:not(.tomoyo-ui-translation) .tome-bg-surfaces select{-webkit-appearance:none;appearance:none;min-height:36px;padding:7px 34px 7px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 14%,transparent);background:color-mix(in srgb,var(--theme-surface,#18181b) 78%,transparent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;color:var(--theme-text,#e8e9ec);font:inherit;font-size:13px;cursor:pointer;transition:border-color .15s,box-shadow .15s;outline:none}
  body:not(.tomoyo-ui-translation) .tome-bg-surfaces select:hover{border-color:color-mix(in srgb,var(--theme-text,#eee) 26%,transparent)}
  body:not(.tomoyo-ui-translation) .tome-bg-surfaces select:focus-visible{border-color:var(--theme-primary,#e0495a);box-shadow:0 0 0 3px color-mix(in srgb,var(--theme-primary,#e0495a) 22%,transparent)}
  body:not(.tomoyo-ui-translation) .tome-bg-surfaces select option{background:var(--theme-surface,#18181b);color:var(--theme-text,#e8e9ec)}
  .tome-bg-grid .setting-label,.tome-bg-surfaces .setting-label{white-space:nowrap}
  .tomoyo-cn-dialog .tome-bg-grid{align-items:start}.tomoyo-cn-dialog .tome-bg-grid>.setting-row{display:flex!important;flex-direction:column;align-items:stretch;justify-content:flex-start!important;gap:6px;height:auto!important;min-height:0!important;padding:6px 0!important}.tomoyo-cn-dialog .tome-bg-grid>.setting-row>*{flex:none!important;min-height:0!important}
  .tome-game-bg{margin:0 0 22px}.tome-bg-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}.tome-bg-grid>.setting-row{display:block}.tome-bg-grid .tome-bg-range{display:flex;align-items:center;gap:8px}.tome-bg-grid .tome-bg-range input{flex:1;min-width:0}.tome-game-bg>h4{margin:4px 0;font-size:11.5px;font-weight:700;color:var(--theme-textSecondary,#7a7c82)}
  .tome-bg-panels{display:flex;flex-direction:column;gap:6px;margin-top:12px}.tome-bg-panels>details{border:1px solid rgba(127,127,127,.18);border-radius:10px;padding:0 12px}
  .tome-bg-panels>details>summary{cursor:pointer;padding:8px 0;font-size:12.5px;font-weight:700;list-style:none;display:flex;align-items:center;gap:8px;outline:none}.tome-bg-panels>details>summary::-webkit-details-marker{display:none}
  .tome-bg-panels>details>summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s;opacity:.7}.tome-bg-panels>details[open]>summary::before{transform:rotate(45deg)}
  .tome-bg-panels>details>.tome-bg-grid{padding-bottom:10px}`;
 document.head.append(style);document.body.prepend(layer);

 // Visible area of the home picture (user, 2026-11-02): crop = {x,y,zoom}. x/y are background-position percentages and
 // zoom scales the cover size, so x/y in 0..100 always keep the screen covered. The layer is the viewport plus 40px on
 // each side (blur bleed); the crop window maps the same numbers back onto the picture.
 let natural=null,naturalFor='',preview=null;
 // x/y map the picture's free travel (beyond the window plus the blur margin m) to 0..100 on each axis; at zoom 1 the
 // picture just covers window+margin on its tight axis. (Before, the 40px bleed was always covered, so the frame stopped
 // short of the edges and looked movable where it was not.)
 const geometry=(size,crop)=>{const c={x:50,y:50,zoom:1,...crop},m=Math.min(40,Math.ceil((Number(cfg.blur)||0)*2)),vw=innerWidth,vh=innerHeight,W=vw+80,H=vh+80,s=Math.max((vw+2*m)/size[0],(vh+2*m)/size[1])*Math.max(1,c.zoom),dw=size[0]*s,dh=size[1]*s,ox=(40-m)-(dw-vw-2*m)*c.x/100,oy=(40-m)-(dh-vh-2*m)*c.y/100;
  return {c,s,dw,dh,W,H,ox,oy,frame:{left:(40-ox)/dw,top:(40-oy)/dh,width:innerWidth/dw,height:innerHeight/dh}};};
 function place(src,crop){const c={x:50,y:50,zoom:1,...crop};layer.style.backgroundPosition=c.x+'% '+c.y+'%';const exact=src&&natural&&naturalFor===src?geometry(natural,c):null;if(exact){layer.style.backgroundSize=Math.ceil(exact.dw)+'px '+Math.ceil(exact.dh)+'px';layer.style.backgroundPosition=exact.ox+'px '+exact.oy+'px';return;}
  if(!src||!natural||naturalFor!==src){layer.style.backgroundSize='cover';if(src&&naturalFor!==src){naturalFor=src;natural=null;const im=new Image();im.onload=()=>{if(naturalFor!==src)return;natural=[im.naturalWidth,im.naturalHeight];paint();};im.src=src;}return;}
  const g=geometry(natural,c);layer.style.backgroundSize=Math.ceil(g.dw)+'px '+Math.ceil(g.dh)+'px';}
 addEventListener('resize',()=>{if(natural)paint();});
 // Crop window: a window of its own (like the colour window). Picking a picture previews it on the page at once; nothing
 // is saved until Confirm, and Cancel (×, Esc) puts the previous picture and area back.
 let cropBox=null;
 function cropWindow(src,crop,onOk){
  cropBox?.__cancel?.();
  const box=document.createElement('div');box.className='tome-crop';box.dataset.noI18n='';box.setAttribute('role','dialog');cropBox=box;
  box.innerHTML='<header><span></span><button type="button" data-x>×</button></header><div class="tome-crop-stage"><img alt=""><i></i></div><label class="tome-crop-zoom"><span></span><input type="range" min="1" max="4" step="0.01"><output></output></label><small></small><footer><button type="button" data-cancel></button><button type="button" data-ok></button></footer>';
  const $=q=>box.querySelector(q),stage=$('.tome-crop-stage'),img=$('img'),frame=$('i'),zoom=$('input'),out=$('output');
  $('header span').textContent=t('cropTitle');$('.tome-crop-zoom span').textContent=t('zoom');$('small').textContent=t('cropHint');$('[data-cancel]').textContent=t('cancel');$('[data-ok]').textContent=t('ok');$('[data-x]').setAttribute('aria-label',t('cancel'));
  let c={x:50,y:50,zoom:1,...crop},size=null;const clamp=v=>Math.max(0,Math.min(100,v));
  const draw=()=>{preview={src,crop:{...c}};paint();zoom.value=String(c.zoom);out.textContent=Math.round(c.zoom*100)+'%';if(!size)return;const g=geometry(size,c).frame;
   frame.style.left=g.left*100+'%';frame.style.top=g.top*100+'%';frame.style.width=g.width*100+'%';frame.style.height=g.height*100+'%';};
  // Frame position (fraction of the picture) back to background-position percentages.
  const moveTo=(left,top)=>{const g=geometry(size,c),m=Math.min(40,Math.ceil((Number(cfg.blur)||0)*2)),fx=g.dw-innerWidth-2*m,fy=g.dh-innerHeight-2*m;const ox=40-left*g.dw,oy=40-top*g.dh;c.x=fx>0.5?clamp(((40-m)-ox)/fx*100):50;c.y=fy>0.5?clamp(((40-m)-oy)/fy*100):50;draw();};
  // Clicking anywhere on the picture centres the frame there and keeps dragging from that point.
  stage.addEventListener('pointerdown',e=>{if(!size||e.target===frame)return;const r=stage.getBoundingClientRect(),g=geometry(size,c).frame;moveTo((e.clientX-r.left)/r.width-g.width/2,(e.clientY-r.top)/r.height-g.height/2);frame.dispatchEvent(new PointerEvent('pointerdown',{clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,bubbles:true}));});
  const finish=ok=>{if(cropBox!==box)return;cropBox=null;box.remove();removeEventListener('keydown',key,true);preview=null;if(ok)onOk({x:Math.round(c.x*10)/10,y:Math.round(c.y*10)/10,zoom:Math.round(c.zoom*100)/100});paint();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};addEventListener('keydown',key,true);box.__cancel=()=>finish(false);
  $('[data-x]').onclick=$('[data-cancel]').onclick=()=>finish(false);$('[data-ok]').onclick=()=>finish(true);
  zoom.oninput=()=>{const g=size&&geometry(size,c).frame;c.zoom=Number(zoom.value);if(g){const n=geometry(size,c).frame;moveTo(g.left+(g.width-n.width)/2,g.top+(g.height-n.height)/2);}else draw();};
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom.value=String(Math.max(1,Math.min(4,c.zoom*(e.deltaY<0?1.08:1/1.08))));zoom.oninput();},{passive:false});
  frame.addEventListener('pointerdown',e=>{if(!size)return;e.preventDefault();try{frame.setPointerCapture(e.pointerId);}catch{}const r=stage.getBoundingClientRect(),g=geometry(size,c).frame,sx=e.clientX,sy=e.clientY;frame.classList.add('tome-dragging');
   const move=ev=>moveTo(g.left+(ev.clientX-sx)/r.width,g.top+(ev.clientY-sy)/r.height),up=()=>{frame.classList.remove('tome-dragging');frame.removeEventListener('pointermove',move);frame.removeEventListener('pointerup',up);};frame.addEventListener('pointermove',move);frame.addEventListener('pointerup',up);});
  const head=$('header');head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();try{head.setPointerCapture(e.pointerId);}catch{}const r=box.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
   const move=ev=>{box.style.left=Math.max(8,Math.min(ev.clientX-dx,innerWidth-r.width-8))+'px';box.style.top=Math.max(8,Math.min(ev.clientY-dy,innerHeight-r.height-8))+'px';},up=()=>{head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',up);};head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);});
  img.onload=()=>{size=[img.naturalWidth,img.naturalHeight];const maxW=Math.min(520,innerWidth-80),maxH=Math.min(320,innerHeight-260),k=Math.min(maxW/size[0],maxH/size[1]);stage.style.width=Math.round(size[0]*k)+'px';stage.style.height=Math.round(size[1]*k)+'px';
   box.style.left=Math.max(8,(innerWidth-box.offsetWidth)/2)+'px';box.style.top=Math.max(8,(innerHeight-box.offsetHeight)/2)+'px';draw();};
  document.body.append(box);img.src=src;draw();
 }
 function paint(){
  const root=document.documentElement;
  root.classList.toggle('tome-glass',!!(preview||image)&&cfg.glass);
  const shown=preview?preview.src:image,crop=preview?preview.crop:cfg.crop;root.classList.toggle('tome-has-bg',!!shown);
  layer.style.backgroundImage=shown?'url("'+shown+'")':'';place(shown,crop);
  // Dimming is a dark overlay drawn over the picture; blur and saturation are filters on the picture itself.
  layer.style.filter=image?'blur('+cfg.blur+'px) saturate('+cfg.saturate+'%) brightness('+(100-cfg.dim)+'%)':'';
  root.style.setProperty('--tome-glass-blur',cfg.glassBlur+'px');root.style.setProperty('--tome-glass-alpha',String(cfg.glassAlpha/100));
  for(const p of PANELS){const v=gcfg.panels[p];root.style.setProperty('--tome-'+p+'-glass-blur',(Number(v.glassBlur)||0)+'px');root.style.setProperty('--tome-'+p+'-glass-bright',String(1-(Number(v.glassDim)||0)/100));root.style.setProperty('--tome-'+p+'-glass-sat',String((Number.isFinite(Number(v.glassSaturate))?Number(v.glassSaturate):100)/100));root.style.setProperty('--tome-'+p+'-alpha',String(v.alpha/100));root.style.setProperty('--tome-'+p+'-radius',v.radius+'px');root.style.setProperty('--tome-'+p+'-border',String(v.border/100));}root.style.setProperty('--tome-panel-glass',(Number(gcfg.glassBlur)||0)+'px');for(const k of ['menu','log','card'])root.dataset['tome'+k[0].toUpperCase()+k.slice(1)+'Surface']=['image','glass','both','plain'].includes(gcfg.surfaces?.[k])?gcfg.surfaces[k]:'image';renderMenuImage();
 }
 // The in-game menu's picture is rendered once, small and already blurred/dimmed (a blurred picture needs no detail),
 // and used as a plain image: opening the menu no longer decodes the full picture and runs a live blur, which made the
 // background appear only after the menu was already open.
 // Each panel has its own blur/dim/saturation; panels with equal values share one rendered picture.
 const panelImages=new Map(),panelKeys={};let menuTimer=0;
 function renderMenuImage(){const image=gcfg.custom&&gameImage?gameImage:imageHome(),root=document.documentElement;
  const want={};for(const p of PANELS){const v=gcfg.panels[p];want[p]=image?image.length+'|'+image.slice(-64)+'|'+v.blur+'|'+v.dim+'|'+v.saturate:'';}
  if(PANELS.every(p=>panelKeys[p]===want[p]))return;clearTimeout(menuTimer);
  for(const p of PANELS)if(!want[p]){panelKeys[p]='';root.style.setProperty('--tome-'+p+'-image','none');}
  const drop=()=>{const used=new Set(Object.values(panelKeys));for(const [k,url] of panelImages)if(!used.has(k)){URL.revokeObjectURL(url);panelImages.delete(k);}};
  if(!image){drop();return;}
  menuTimer=setTimeout(async()=>{try{const img=new Image();img.src=image;await img.decode();
   for(const p of PANELS){const key=want[p];let url=panelImages.get(key);
    if(!url){const v=gcfg.panels[p],w=640,h=Math.max(1,Math.round(img.naturalHeight*w/img.naturalWidth)),blur=v.blur*.8,pad=Math.ceil(blur*2);
     const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.filter='blur('+blur+'px) saturate('+v.saturate+'%) brightness('+(100-v.dim)+'%)';ctx.drawImage(img,-pad,-pad,w+pad*2,h+pad*2);
     const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.9));if(!blob)continue;url=URL.createObjectURL(blob);const pre=new Image();pre.src=url;await pre.decode().catch(()=>{});panelImages.set(key,url);}
    panelKeys[p]=key;root.style.setProperty('--tome-'+p+'-image','url("'+url+'")');}
   drop();}catch{}},120);}
 const imageHome=()=>image;
 function save(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch{}paint();}
 async function load(){try{image=(await b.v4Request('backgroundGet',{})).image||'';}catch{image='';}try{gameImage=(await b.v4Request('backgroundGet',{slot:'game'})).image||'';}catch{gameImage='';}paint();refreshMenu();refreshGameMenu();}

 // Section in the menu's Misc tab, built when the menu is open (same approach as the game-folder section).
 let menu=null;
 function refreshMenu(){if(!menu)return;for(const node of menu.querySelectorAll('[data-bg-copy]')){const text=t(node.dataset.bgCopy);if(node.textContent!==text)node.textContent=text;}menu.querySelector('[data-bg-state]').textContent=image?t('set'):t('none');const adj=menu.querySelector('[data-bg-adjust]');if(adj)adj.hidden=!image;for(const input of menu.querySelectorAll('[data-bg-key]')){const k=input.dataset.bgKey;if(input.type==='checkbox')input.checked=!!cfg[k];else input.value=cfg[k];const out=input.parentElement.querySelector('output');if(out)out.textContent=cfg[k]+(k==='blur'||k==='glassBlur'?' px':'%');}}
 function buildMenu(misc){
  menu=document.createElement('section');menu.className='tome-bg-menu';menu.dataset.noI18n='';
  const el=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
  const row=(copy,control,hint)=>{const r=el('div','setting-row svelte-1u31gb4'),l=el('div','setting-label svelte-1u31gb4'),s=el('span');s.dataset.bgCopy=copy;s.textContent=t(copy);l.append(s);if(hint)l.append(hint);r.append(l,control);return r;};
  const state=el('small','tome-bg-hint');state.dataset.bgState='';
  const actions=el('div','tome-bg-actions');
  const pick=el('button');pick.type='button';pick.dataset.bgCopy='pick';pick.textContent=t('pick');
  pick.onclick=async()=>{try{const file=await window.__TAURI_INTERNALS__.invoke('plugin:dialog|open',{options:{multiple:false,directory:false,filters:[{name:'Image',extensions:['png','jpg','jpeg','webp','gif','bmp']}]}});if(typeof file!=='string'||!file)return;const peek=await b.v4Request('backgroundPeek',{path:file});cropWindow(peek.image,{x:50,y:50,zoom:1},async crop=>{try{await b.v4Request('backgroundSet',{path:file});image=peek.image;cfg.crop=crop;save();refreshMenu();}catch(e){state.textContent=String(e.message||e);}});}catch(e){state.textContent=String(e.message||e);}};
  const adjust=el('button');adjust.type='button';adjust.dataset.bgCopy='adjust';adjust.dataset.bgAdjust='';adjust.textContent=t('adjust');adjust.onclick=()=>{if(image)cropWindow(image,cfg.crop,crop=>{cfg.crop=crop;save();});};
  const clear=el('button');clear.type='button';clear.dataset.bgCopy='clear';clear.textContent=t('clear');clear.onclick=async()=>{try{await b.v4Request('backgroundClear',{});}catch{}image='';cfg={...defaults};save();refreshMenu();};
  actions.append(adjust,pick,clear);
  const slider=(k,min,max)=>{const box=el('div','tome-bg-range');const i=el('input');i.type='range';i.min=min;i.max=max;i.step=1;i.dataset.bgKey=k;i.oninput=()=>{cfg[k]=Number(i.value);save();refreshMenu();};box.append(i,el('output'));return row(k,box);};
  // The app's own switch: only the switch toggles, the label text does not.
  const sw=el('label','switch svelte-1u31gb4'),gi=el('input','svelte-1u31gb4');gi.type='checkbox';gi.dataset.bgKey='glass';gi.onchange=()=>{cfg.glass=gi.checked;save();};sw.append(gi,el('span','switch-track svelte-1u31gb4'));
  const desc=el('small','tome-bg-hint');desc.dataset.bgCopy='text';desc.textContent=t('text');
  const pic=row('picture',actions,desc);pic.querySelector('.setting-label').append(state);
  menu.append(pic,slider('blur',0,40),slider('dim',0,85),slider('saturate',0,200),row('glass',sw),slider('glassBlur',0,40),slider('glassAlpha',10,95));
  misc.append(menu);buildGameMenu(menu);refreshMenu();
 }
 // The Alt+T menu's own section in its Misc tab: picture (shared) and the menu's effect values.
 // inGame: the Alt+T menu's copy (effects only; the separate picture is chosen on the home settings page).
 function buildGameMenu(misc,inGame=false){
  const box=document.createElement('section');box.className='tome-bg-menu tome-game-bg';box.dataset.noI18n='';
  const el=(tag,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;return n;};
  const h=el('h4');h.dataset.bgCopy='gameTitle';const desc=el('small','tome-bg-hint');desc.dataset.bgCopy='gameText';const state=el('small','tome-bg-hint');state.dataset.bgState='';
  const actions=el('div','tome-bg-actions'),pick=el('button'),clear=el('button');pick.type=clear.type='button';pick.dataset.bgCopy='pick';clear.dataset.bgCopy='clear';
  pick.onclick=async()=>{try{const file=await window.__TAURI_INTERNALS__.invoke('plugin:dialog|open',{options:{multiple:false,directory:false,filters:[{name:'Image',extensions:['png','jpg','jpeg','webp','gif','bmp']}]}});if(typeof file!=='string'||!file)return;await b.v4Request('backgroundSet',{path:file,slot:'game'});gcfg.custom=true;saveGame();await load();}catch(e){state.textContent=String(e.message||e);}};
  clear.onclick=async()=>{try{await b.v4Request('backgroundClear',{slot:'game'});}catch{}gameImage='';gcfg={...gcfg,custom:false};saveGame();};
  actions.append(pick,clear);
  const row=(copy,control)=>{const r=el('div','setting-row svelte-1u31gb4'),l=el('div','setting-label svelte-1u31gb4'),s=el('span');s.dataset.bgCopy=copy;l.append(s);r.append(l,control);return r;};
  const slider=(p,k,min,max)=>{const range=el('div','tome-bg-range'),i=el('input');i.type='range';i.min=min;i.max=max;i.step=1;i.dataset.gamePanel=p;i.dataset.gameKey=k;i.oninput=()=>{gcfg.panels[p][k]=Number(i.value);saveGame();};range.append(i,el('output'));return row(k,range);};
  // The app's own switch: on = a separate picture for in-game panels, off = follow the home picture.
  const sw=el('label','switch svelte-1u31gb4'),ci=el('input','svelte-1u31gb4');ci.type='checkbox';ci.dataset.gameKey='custom';ci.onchange=()=>{gcfg.custom=ci.checked;saveGame();};sw.append(ci,el('span','switch-track svelte-1u31gb4'));
  const pic=row('picture',actions);pic.querySelector('.setting-label').append(state);h.after(desc);
  // The same six sliders for each panel, in a group that expands (user, 2026-11-03).
  const grid=el('div','tome-bg-panels');for(const [p,copy] of [['menu','menuSurface'],['log','logSurface'],['card','cardSurface']]){const group=el('details'),sum=el('summary'),g=el('div','tome-bg-grid');sum.dataset.bgCopy=copy;g.append(slider(p,'blur',0,40),slider(p,'dim',0,85),slider(p,'saturate',0,200),slider(p,'alpha',20,100),slider(p,'radius',0,28),slider(p,'border',0,40),slider(p,'glassBlur',0,40),slider(p,'glassDim',0,85),slider(p,'glassSaturate',0,200));group.append(sum,g);grid.append(group);}
  // Each in-game panel picks its own background: picture, frosted glass, both, or a plain tint (user, 2026-11-02).
  const surf=el('div','tome-bg-surfaces'),surfHead=el('h5');surfHead.dataset.bgCopy='surfaces';const surfTip=el('small','tome-bg-hint');surfTip.dataset.bgCopy='glassTip';surf.append(surfHead,surfTip);
  for(const [k,copy] of [['menu','menuSurface'],['log','logSurface'],['card','cardSurface']]){const select=el('select');select.dataset.gameSurface=k;for(const [v,c] of [['image','modeImage'],['glass','modeGlass'],['both','modeBoth'],['plain','modePlain']]){const o=new Option('',v);o.dataset.bgCopy=c;select.add(o);}select.onchange=()=>{gcfg.surfaces={...gameDefaults.surfaces,...gcfg.surfaces,[k]:select.value};saveGame();};surf.append(row(copy,select));}
  if(inGame){const source=el('small','tome-bg-hint');source.dataset.gameSource='';box.append(h,desc,source,grid,surf);misc.prepend(box);}
  else{box.append(h,desc,row('custom',sw),pic,grid,surf);misc.append(box);}refreshGameMenu();
 }
 function refreshGameMenu(){for(const box of document.querySelectorAll('.tome-game-bg')){for(const select of box.querySelectorAll('[data-game-surface]')){const v=gcfg.surfaces?.[select.dataset.gameSurface]||'image';if(select.value!==v)select.value=v;}for(const node of box.querySelectorAll('[data-bg-copy]')){const text=t(node.dataset.bgCopy);if(node.textContent!==text)node.textContent=text;}const st=box.querySelector('[data-bg-state]');if(st)st.textContent=gameImage?t('set'):t('none');const acts=box.querySelector('.tome-bg-actions');if(acts)acts.hidden=!gcfg.custom;const src=box.querySelector('[data-game-source]');if(src)src.textContent=gcfg.custom&&gameImage?t('sourceCustom'):t('sourceHome');
  for(const input of box.querySelectorAll('[data-game-key]')){const k=input.dataset.gameKey;if(input.type==='checkbox'){input.checked=!!gcfg[k];continue;}const v=gcfg.panels[input.dataset.gamePanel]?.[k];if(document.activeElement!==input)input.value=v;input.parentElement.querySelector('output').textContent=v+(k==='blur'||k==='radius'||k==='glassBlur'?' px':'%');}}}
 function saveGame(){try{localStorage.setItem(GAME_KEY,JSON.stringify(gcfg));}catch{}paint();refreshGameMenu();}
 b.backgroundPanel=()=>{const host=document.createElement('div');buildMenu(host);return host.firstElementChild;};
 // Runs as soon as the settings page or menu appears (the 600 ms timer alone made the 主页背景 tab pop in late).
 const tick=()=>{for(const old of document.querySelectorAll('.tomoyo-cn-dialog .tome-bg-menu:not(.tome-game-bg)'))old.remove();
  const dialog=document.querySelector('.tomoyo-cn-dialog[open]');
  if(dialog){if(!dialog.querySelector(':scope>.tome-menu-bg')){const layer=document.createElement('div');layer.className='tome-menu-bg';layer.setAttribute('aria-hidden','true');layer.append(document.createElement('b'),document.createElement('i'));dialog.prepend(layer);}
   const misc=dialog.querySelector('[data-menu-category=misc]');if(misc&&!misc.querySelector('.tome-game-bg'))buildGameMenu(misc,true);}
  const page=document.querySelector('.settings-page'),content=page?.querySelector('.settings-content'),nav=page?.querySelector('.settings-tabs');if(!content||!nav)return;
  let tab=nav.querySelector('[data-tome-bg-tab]');if(!tab){tab=document.createElement('button');tab.type='button';tab.dataset.tomeBgTab='';tab.dataset.noI18n='';tab.className=nav.querySelector('button')?.className||'';tab.classList.remove('active');tab.onclick=()=>{content.classList.remove('tome-about-selected','tomoyo-learning-selected');nav.classList.remove('tome-about-selected');content.classList.add('tome-bg-selected');tab.classList.add('active');if(!content.querySelector(':scope>.tome-bg-panel')){const panel=document.createElement('section');panel.className='tome-bg-panel';panel.append(b.backgroundPanel());content.append(panel);}};nav.append(tab);nav.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('[data-tome-bg-tab]')){content.classList.remove('tome-bg-selected');tab.classList.remove('active');}});}
  if(tab.textContent!==t('title'))tab.textContent=t('title');
 };setInterval(tick,600);let tickQueued=false;new MutationObserver(()=>{if(tickQueued)return;tickQueued=true;setTimeout(()=>{tickQueued=false;tick();},0);}).observe(document.body,{childList:true,subtree:true});

 function menuLayer(dialog){if(dialog?.classList?.contains('tomoyo-cn-dialog')&&!dialog.querySelector(':scope>.tome-menu-bg')){const layer=document.createElement('div');layer.className='tome-menu-bg';layer.setAttribute('aria-hidden','true');layer.append(document.createElement('b'),document.createElement('i'));dialog.prepend(layer);}}
 // Added when the menu is shown, before its first frame (a timer used to add it up to 0.6 s later).
 for(const name of ['show','showModal']){const original=HTMLDialogElement.prototype[name];HTMLDialogElement.prototype[name]=function(){menuLayer(this);const result=original.apply(this,arguments);requestAnimationFrame(()=>glassReport());return result;};}
 // Backlog panel and lookup card are appended to body: give each the same background layer as soon as it appears.
 const panels=()=>{for(const n of document.querySelectorAll('body>.tome-backlog,body>.tomoyo-selection-card'))if(!n.querySelector(':scope>.tome-menu-bg')){const l=document.createElement('div');l.className='tome-menu-bg';l.setAttribute('aria-hidden','true');l.append(document.createElement('b'),document.createElement('i'));n.prepend(l);}};
 // Glass panels (user, 2026-11-03): the menu can be dragged anywhere on the desktop, so the bridge puts a live
 // Windows-blurred window under each glass panel; a captured game frame (E87/E95) showed the game even over the desktop.
 // Reported every animation frame while one is open (dragging and the open/close animations move it by transform).
 let glassKey='',glassFrame=0;
 const glassPanels=()=>[...document.querySelectorAll('.tomoyo-cn-dialog[open]>.tome-menu-bg,.tomoyo-cn-dialog[data-leaving]>.tome-menu-bg,.tome-backlog[data-open]>.tome-menu-bg,.tome-backlog[data-leaving]>.tome-menu-bg,body>.tomoyo-selection-card>.tome-menu-bg')].filter(l=>{const k=l.parentElement.matches('.tomoyo-cn-dialog')?'menu':l.parentElement.matches('.tome-backlog')?'log':'card';return ['glass','both'].includes(document.documentElement.dataset['tome'+k[0].toUpperCase()+k.slice(1)+'Surface']);});
 const glassReport=()=>{const scale=Number(devicePixelRatio)||1,list=document.body.classList.contains('tomoyo-ui-translation')?glassPanels().map(l=>l.parentElement).filter(p=>p.checkVisibility?.({visibilityProperty:true})!==false&&getComputedStyle(p).display!=='none'):[];
  // Each panel has its own corner radius (separate settings since 2026-11-03), so every rectangle carries it.
  // ...and its own glass blur (scaled like CSS px), darkening and saturation (user, 2026-11-03).
  // A panel at opacity 0 (the first frame of its opening) is reported too, so the per-frame loop starts with the
  // animation instead of up to 120 ms later; the bridge keeps the glass hidden at alpha 0.
  // The open/close animations scale and fade the panel (the menu unfolds from its centre line): the glass shows the
  // visible box at the panel's current opacity, and reads the full, unscaled box from the start, so the area being read
  // does not change every frame of the animation (user, 2026-11-03: glass covered the unfold and flashed).
  const rects=list.map(p=>{const r=p.getBoundingClientRect(),v=gcfg.panels[p.matches('.tomoyo-cn-dialog')?'menu':p.matches('.tome-backlog')?'log':'card'],fw=Math.max(r.width,p.offsetWidth||0)+96,fh=Math.max(r.height,p.offsetHeight||0)+96,cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2,op=Math.max(0,Math.min(1,parseFloat(getComputedStyle(p).opacity)));return {x:Math.round(r.left*scale),y:Math.round(r.top*scale),width:Math.round(r.width*scale),height:Math.round(r.height*scale),fx:Math.round((cx-fw/2)*scale),fy:Math.round((cy-fh/2)*scale),fw:Math.round(fw*scale),fh:Math.round(fh*scale),alpha:Math.round((Number.isFinite(op)?op:1)*100),radius:Math.round((parseFloat(getComputedStyle(p).borderTopLeftRadius)||0)*scale),blur:Math.round((Number(v.glassBlur)||0)*scale),dim:Number(v.glassDim)||0,saturate:Number.isFinite(Number(v.glassSaturate))?Number(v.glassSaturate):100};}).filter(r=>r.width>2&&r.height>2).slice(0,16);
  const radius=rects[0]?.radius||0,key=JSON.stringify(rects);
  if(key!==glassKey){glassKey=key;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galGlass',rects,radius}));}catch{}}
  placeGlass(list);
  if(rects.length&&!glassFrame)glassFrame=requestAnimationFrame(()=>{glassFrame=0;glassReport();});};
 // The latest picture from the bridge: x/y/w/h in device px relative to the overlay's client area (= this page).
 let glassArea=null,glassUrl='';
 b.glassFrame=m=>{if(!m||m.clear||!m.image){glassArea=null;glassUrl='';}else{glassArea=m;glassUrl='url("data:image/jpeg;base64,'+m.image+'")';}placeGlass(glassPanels().map(l=>l.parentElement));};
 // Lines the picture up with the screen behind each glass panel. The layer sits 40 px outside the panel's unscaled box
 // (the open animation scales the panel around its centre, and the picture with it).
 function placeGlass(list){const scale=Number(devicePixelRatio)||1;for(const p of list){const layer=p.querySelector(':scope>.tome-menu-bg>b');if(!layer)continue;
   if(!glassArea){if(layer.style.backgroundImage)layer.style.backgroundImage='';continue;}
   const r=p.getBoundingClientRect(),w=p.offsetWidth||r.width,h=p.offsetHeight||r.height,left=(r.left+r.right)/2-w/2-40,top=(r.top+r.bottom)/2-h/2-40;
   const size=(glassArea.w/scale)+'px '+(glassArea.h/scale)+'px',pos=(glassArea.x/scale-left)+'px '+(glassArea.y/scale-top)+'px';
   if(layer.style.backgroundImage!==glassUrl)layer.style.backgroundImage=glassUrl;if(layer.style.backgroundSize!==size)layer.style.backgroundSize=size;if(layer.style.backgroundPosition!==pos)layer.style.backgroundPosition=pos;}}
 setInterval(glassReport,120);window.__tomeGlassReport=glassReport; // style probing hides panels and needs their glass gone at once
 new MutationObserver(()=>{panels();requestAnimationFrame(()=>glassReport());}).observe(document.body,{childList:true});
 // Opening a panel starts the glass reports on its first frame (the 120 ms timer alone missed the start of the unfold).
 new MutationObserver(()=>requestAnimationFrame(()=>glassReport())).observe(document.body,{subtree:true,attributes:true,attributeFilter:["data-open","data-leaving","open"]});panels();
 addEventListener('tome-language-change',()=>{refreshMenu();refreshGameMenu();});
 load();
})();
