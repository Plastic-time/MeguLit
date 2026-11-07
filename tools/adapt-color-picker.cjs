// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// The shared colour picker (Alt+T panels and the home page). Applied to the read-only
// snapshot copy by prepare-reader.cjs; every anchor must match exactly once.
function replaceOnce(text,anchor,next,label){if(text.split(anchor).length!==2)throw Error('COLOR_PICKER_ANCHOR_'+label);return text.replace(anchor,next);}
function adaptColorPicker(text){
 // Home has no reader i18n bridge; follow the page language instead.
 text=replaceOnce(text,"(window.__tomeI18n?.get?.()||'zh')","(window.__tomeI18n?.get?.()||document.documentElement.lang||'zh')",'LANG');
 text=replaceOnce(text,"recent:'最近使用'}","recent:'最近使用',saveAccent:'保存到强调色'}",'ZH');
 text=replaceOnce(text,"recent:'Recent'}","recent:'Recent',saveAccent:'Save to accent colours'}",'EN');
 text=replaceOnce(text,"recent:'最近使った色'}","recent:'最近使った色',saveAccent:'アクセントカラーに保存'}",'JA');
 // History row only: newest first, eight per row, the oldest drops off.
 text=replaceOnce(text,"const chips=recent();list.title=chips.length?t('recent'):'';for(const value of chips.length?chips:PRESETS){","const chips=recent();list.title=chips.length?t('recent'):'';list.hidden=!chips.length;for(const value of chips){",'HISTORY');
 // Optional page action under the picker, e.g. the home accent row's "save" button.
 text=replaceOnce(text,"<div class=\"tome-color-swatches\"></div>';","<div class=\"tome-color-swatches\"></div><button type=\"button\" class=\"tome-color-action\" hidden></button>';",'ACTION_HTML');
 text=replaceOnce(text,"  if(!('EyeDropper' in window))drop.hidden=true;","  if(!('EyeDropper' in window))drop.hidden=true;\n  const action=$('.tome-color-action');if(input.dataset.colorAction){action.hidden=false;action.textContent=t(input.dataset.colorAction)||input.dataset.colorAction;action.onclick=()=>{const value=fromHsv(h,s,v);remember(value);opened=value;input.dispatchEvent(new CustomEvent('tome-color-action',{detail:value,bubbles:true}));const done=action.textContent;action.textContent='✓ '+done;setTimeout(()=>{if(action.isConnected)action.textContent=done;},1200);};}",'ACTION_BIND');
 // A hidden input (wrapped in a button-like label) anchors the window to its label.
 text=replaceOnce(text,"r=anchor.getBoundingClientRect(),menu=","r=(b=>b.width||b.height||!anchor.parentElement?b:anchor.parentElement.getBoundingClientRect())(anchor.getBoundingClientRect()),menu=",'ANCHOR');
 // Home tokens as fallbacks so the window follows the home theme too.
 const tokens={surface:'surface',text:'text',textSecondary:'muted',border:'line',primary:'accent'};
 text=text.replace(/var\(--theme-(surface|textSecondary|text|border|primary),/g,(m,k)=>`var(--theme-${k},var(--${tokens[k]},`).replace(/var\(--theme-(surface|textSecondary|text|border|primary),var\(--(\w+),([^)]*)\)/g,(m,k,t,f)=>`var(--theme-${k},var(--${t},${f}))`);
 text=replaceOnce(text," .tome-color-swatches{display:grid;"," .tome-color-swatches[hidden]{display:none!important}\n .tome-color-panel .tome-color-action{height:30px;border-radius:9px;text-align:center;font-size:12px;font-weight:600;color:#fff;background:var(--theme-primary,var(--accent,#e0495a))}\n .tome-color-action[hidden]{display:none!important}\n .tome-color-swatches{display:grid;",'CSS');
 return text;
}
module.exports={adaptColorPicker};
