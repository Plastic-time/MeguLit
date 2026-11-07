// SPDX-License-Identifier: GPL-3.0-or-later
// Translation text box before a game window is locked: the empty box shows a sample line in the current game-text style (font, size, colour, outline), in the interface
// language. Once a game window is bound the empty box stays invisible over the game.
(function installBoxPreview(){
 'use strict';
 if(!document.documentElement||!document.body||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installBoxPreview,{once:true});return;}
 const b=window.__tomoyoChinese;if(b.boxPreviewInstalled)return;b.boxPreviewInstalled=true;
 const TEXT={zh:{ja:'ゲームのセリフを待っています……',tr:'等待游戏对话文本……'},en:{ja:'ゲームのセリフを待っています……',tr:'Waiting for game dialogue…'},ja:{ja:'ゲームのセリフを待っています……',tr:''}};
 const style=document.createElement('style');style.textContent=`
 body.tomoyo-ui-translation .sentence-placeholder{margin:0!important;padding:0!important;font-size:0!important;line-height:0!important;color:transparent!important;text-align:left!important;user-select:none;pointer-events:none;width:100%}
 body.tomoyo-ui-translation .sentence-placeholder::before,body.tomoyo-ui-translation .sentence-placeholder::after{display:block;white-space:pre-wrap;text-align:left;paint-order:stroke fill;-webkit-font-smoothing:antialiased;opacity:.78;animation:tome-wait-breathe 2.8s ease-in-out infinite}
 body.tomoyo-ui-translation .sentence-placeholder::before{content:var(--tome-wait-ja,"");font-family:var(--tomoyo-gal-jp-font,"MS Gothic",sans-serif);font-size:var(--tomoyo-gal-jp-size,26px);font-weight:var(--tomoyo-jp-weight,400);letter-spacing:var(--tomoyo-gal-jp-spacing,0);line-height:var(--tomoyo-gal-line-height,1.8);color:var(--tomoyo-gal-color,#fffaf2);-webkit-text-stroke:var(--tomoyo-jp-stroke,0px) var(--tomoyo-jp-stroke-color,#fff)}
 body.tomoyo-ui-translation .sentence-placeholder::after{content:var(--tome-wait-tr,"");margin-top:var(--tomoyo-gal-gap,6px);font-family:var(--tomoyo-gal-cn-font,"Microsoft YaHei",sans-serif);font-size:var(--tomoyo-gal-cn-size,22px);font-weight:var(--tomoyo-cn-weight,400);letter-spacing:var(--tomoyo-gal-cn-spacing,0);line-height:1.65;color:var(--tomoyo-gal-color,#fffaf2);-webkit-text-stroke:var(--tomoyo-cn-stroke,0px) var(--tomoyo-cn-stroke-color,#fff)}
 body.tomoyo-gal-zh-only .sentence-placeholder::before,body.tomoyo-gal-ja-only .sentence-placeholder::after{display:none}
 body.tomoyo-gal-bound .sentence-placeholder{visibility:hidden!important}
 @keyframes tome-wait-breathe{0%,100%{opacity:.78}50%{opacity:.5}}
 /* Without a game the window itself is a slim dialogue strip (GalWindowBridge sizes it): give it a quiet panel to grab. */
 body.tomoyo-ui-translation:not(.tomoyo-gal-bound) .sentence-window{box-sizing:border-box!important;border-radius:14px!important;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent)!important;background:color-mix(in srgb,var(--theme-surface,#18181b) 80%,transparent)!important;cursor:grab;transition:border-color .15s,background-color .15s}
 body.tomoyo-ui-translation:not(.tomoyo-gal-bound) .sentence-window:hover{border-color:color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent)!important}
 body.tome-float-dragging .sentence-window,body.tome-float-dragging .sentence-window *{cursor:grabbing!important}`;
 document.head.append(style);
 let decos=[],queued=false;
 const lang=()=>window.__tomeI18n?.get?.()||'zh';
 const cssString=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 function text(){const t=TEXT[lang()]||TEXT.zh,r=document.documentElement.style;const ja=cssString(t.ja),tr=cssString(t.tr);if(r.getPropertyValue('--tome-wait-ja')!==ja)r.setProperty('--tome-wait-ja',ja);if(r.getPropertyValue('--tome-wait-tr')!==tr)r.setProperty('--tome-wait-tr',tr);}
 function target(){return [...document.querySelectorAll('.sentence-window')].find(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none')||null;}
 // The side brackets were dropped (the strip has its own panel now); only the sample line is kept up to date.
 function update(){queued=false;text();for(const d of document.querySelectorAll('.tome-box-deco'))d.remove();}
 function schedule(){if(!queued){queued=true;requestAnimationFrame(update);}}
 new MutationObserver(records=>{if(records.every(r=>r.target?.classList?.contains?.('tome-box-deco')))return;schedule();}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 addEventListener('resize',schedule);addEventListener('tome-language-change',schedule);setInterval(schedule,700);schedule();
 // Dragging the strip: past a 4 px threshold the native side takes over and moves the window with the cursor until the
 // button is released. A word under the pointer does not get the click that ends a drag.
 const floating=()=>document.body.classList.contains('tomoyo-ui-translation')&&!document.body.classList.contains('tomoyo-gal-bound');
 let press=null,dragged=false;
 document.addEventListener('pointerdown',e=>{press=null;if(e.button!==0||!floating())return;const win=e.target?.closest?.('.sentence-window');if(!win||e.target.closest('.lookup-tooltip,.tomoyo-selection-card,.tomoyo-cn-dialog,.tome-backlog,a,button,input,select,textarea'))return;press={x:e.screenX,y:e.screenY};dragged=false;},true);
 document.addEventListener('pointermove',e=>{if(!press||dragged)return;if(!(e.buttons&1)){press=null;return;}if(Math.hypot(e.screenX-press.x,e.screenY-press.y)<4)return;dragged=true;document.body.classList.add('tome-float-dragging');const dpr=Number(devicePixelRatio)||1;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'galFloatDrag',x:Math.round(press.x*dpr),y:Math.round(press.y*dpr)}));}catch{}},true);
 const release=()=>{press=null;document.body.classList.remove('tome-float-dragging');setTimeout(()=>{dragged=false;},0);};
 document.addEventListener('pointerup',release,true);addEventListener('blur',release);
 document.addEventListener('click',e=>{if(dragged){e.preventDefault();e.stopImmediatePropagation();}},true);
})();
