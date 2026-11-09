// SPDX-License-Identifier: GPL-3.0-or-later
(function installWaitMarker(){
 'use strict';if(!document.body||!window.__tomoyoChinese?.galStatus){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installWaitMarker,{once:true});else setTimeout(installWaitMarker,50);return;}const b=window.__tomoyoChinese;if(b.inlineWaitMarker)return;b.inlineWaitMarker=true;
 let image=null,png='',lastFrame=0,lastAt=0,source='',aspect=1;
 const canonical=text=>(b.splitDialogue?.(String(text||'')).text||String(text||'')).trim();
 source=canonical(b.hookSourceText||b.sourceText||'');
 function clear(){png='';if(image){image.remove();image=null;}}
 function visible(node){return !!node&&getComputedStyle(node).visibility!=='hidden'&&!!node.getClientRects().length&&getComputedStyle(node).display!=='none';}
 function target(){
  if(!document.body?.classList.contains('tomoyo-ui-translation')||document.body.classList.contains('tomoyo-cover-hidden')||document.querySelector('.tome-backlog[data-open]'))return null;
  const readers=[...document.querySelectorAll('.sentence-window')].filter(visible);
  // The original marker belongs after the original (Japanese) line; the translation is only used when no Japanese line shows.
  for(const reader of readers){const current=reader.querySelector('.tome-island-pair.tome-island-current')||reader.querySelector('.tome-island-pair');if(current){const ja=current.querySelector('.sentence-text');if(visible(ja))return ja;}const ja=reader.querySelector('.sentence-text');if(visible(ja)&&ja.textContent.trim())return ja;const cn=reader.querySelector('.tomoyo-cn-output:not([data-state=error])');if(visible(cn)&&cn.textContent.trim())return cn;}
  return null;
 }
 function place(){
  const parent=target();if(!png||!parent||performance.now()-lastAt>450){if(image?.isConnected)image.remove();return;}
  if(!image){image=document.createElement('img');image.className='tome-inline-wait';image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;}
  if(image.getAttribute('src')!=='data:image/png;base64,'+png)image.src='data:image/png;base64,'+png;
  image.style.width=aspect+'em';if(image.parentNode!==parent||parent.lastChild!==image)parent.append(image);
 }
 b.waitMarkerFrame=frame=>{
  if(!Number.isSafeInteger(frame?.id)||frame.id<=lastFrame)return;lastFrame=frame.id;
  if(frame.clear){clear();return;}
  if(!source||canonical(frame.source)!==source)return;
  if(typeof frame.png!=='string'||frame.png.length>100000||!/^[A-Za-z0-9+/]+=*$/.test(frame.png)||!Number.isFinite(frame.width)||!Number.isFinite(frame.height)||frame.width<1||frame.height<1||frame.width>110||frame.height>110)return;
  png=frame.png;aspect=Math.min(2,Math.max(.5,frame.width/frame.height));lastAt=performance.now();place();
 };
 function setSource(text){const next=canonical(text);if(next!==source){source=next;clear();}}
 const onSource=b.onSourceText;b.onSourceText=text=>{setSource(text);return onSource?.(text);};
 const previous=b.galStatus;b.galStatus=m=>{if(typeof m.hookSource==='string')setSource(m.hookSource);if(m.hookSource===null||m.hookActive===false||m.type==='gameClosed'){source='';clear();}previous(m);place();};
 const style=document.createElement('style');style.textContent='.tome-inline-wait{display:inline-block!important;position:static!important;height:1em!important;max-width:none!important;max-height:none!important;margin:0 0 0 .05em!important;padding:0!important;border:0!important;vertical-align:-.12em!important;object-fit:contain!important;pointer-events:none!important;user-select:none!important;-webkit-text-stroke:0!important;filter:none!important;background:transparent!important;box-shadow:none!important}body:not(.tomoyo-ui-translation) .tome-inline-wait{display:none!important}';document.head.append(style);
 new MutationObserver(records=>{if(records.some(r=>r.target!==image&&![...r.addedNodes,...r.removedNodes].every(n=>n===image)))place();}).observe(document.body,{childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',place);setInterval(place,150);
})();
