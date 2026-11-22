/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Cardinal (docs/cardinal.md): loaded into the hidden reader by services/cardinal/driver.cjs (headless Edge, no Playwright, hot-updatable with web/). What the owner sees, measured on the reader page: every Japanese glyph drawn (where, colour, can it be clicked), the
   translation rows, the choice layer, the body state. Japanese = a run with kana/kanji. */
(function(){
 'use strict';
 const JP=/[぀-ヿ㐀-鿿]/;
 function opacity(el){let o=1;for(let n=el;n&&n.nodeType===1;n=n.parentElement){const cs=getComputedStyle(n);if(cs.display==='none')return 0;o*=parseFloat(cs.opacity||'1');}return o;}
 function shown(el){const cs=getComputedStyle(el);if(cs.visibility!=='visible')return false;const r=el.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;if(opacity(el)<0.05)return false;
  const fill=cs.webkitTextFillColor||cs.color;if(/rgba\([^)]*,\s*0\)$/.test(fill)||fill==='transparent')return false;return true;}
 function plainText(el){if(!el)return '';let text='';const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(!node.parentElement?.closest('rt'))text+=node.nodeValue||'';return text.slice(0,4000);}
 const rgb=c=>{const m=/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c||'');return m?[+m[1],+m[2],+m[3]]:null;};
 const R=r=>({x:Math.round(r.left*10)/10,y:Math.round(r.top*10)/10,w:Math.round(r.width*10)/10,h:Math.round(r.height*10)/10});
 /* leaf text holders: a node whose own text nodes carry Japanese */
 function glyphHolders(){const out=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let t;
  while((t=walker.nextNode())){const s=t.nodeValue;if(!s||!JP.test(s))continue;const el=t.parentElement;if(!el||el.closest('rt,script,style,#reader-status,[hidden]'))continue;let holder=out.find(x=>x.el===el);if(!holder){holder={el,text:''};out.push(holder);}holder.text+=s;}return out;}
 function kindOf(el){/* an option's Chinese line sits inside the option: Chinese, not the option's Japanese */if(el.closest('.megulit-choice-cn'))return 'zh';/* an option itself (web/reader/modules/choice-overlay.js), not a container that only says options are up (megulit-choices-up, -covers-line) */if(el.closest('.megulit-choice,.megulit-choice-jp,.megulit-choice-layer'))return 'choice';if(el.closest('.tomoyo-cn-row,.tomoyo-cn-output,.megulit-zh,.megulit-choice-cn,.tomoyo-learning-notice'))return 'zh';if(el.closest('.tome-first-run,.tomoyo-menu,.tome-menu,[role="dialog"]'))return 'ui';if(el.closest('#megulit-place-extras'))return 'extra';if(el.closest('.megulit-art-text,[class*="art-text"]'))return 'art';if(el.closest('.sentence-text'))return 'line';if(el.closest('.tome-page-lines'))return 'page';return 'other';}
 window.__replayProbe=function(){
  const b=window.__tomoyoChinese||{};const glyphs=[];
  for(const {el,text} of glyphHolders()){if(!shown(el))continue;const cs=getComputedStyle(el),r=el.getBoundingClientRect();
   const hit=el.closest('.megulit-choice,.megulit-choice-cn')?'choice':cs.pointerEvents!=='none'?'auto':'none';
   glyphs.push({text:text.slice(0,4000),kind:kindOf(el),...(el.closest('.megulit-old-line,.tome-page-lines')?{retained:true}:{}),cls:(el.className&&String(el.className).slice(0,80))||el.tagName,parentCls:String(el.parentElement?.className||'').slice(0,80),rect:R(r),color:rgb(cs.webkitTextFillColor&&cs.webkitTextFillColor!=='currentcolor'?cs.webkitTextFillColor:cs.color),pointer:hit,opacity:Math.round(opacity(el)*100)/100});}
  const cn=[...document.querySelectorAll('.tomoyo-cn-row')].filter(shown).map(e=>{/* ink: the glyph boxes of the row's text nodes, not the row's box with its line height */let ink=null;try{const rs=[];const tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let tn;while((tn=tw.nextNode())){if(!tn.nodeValue.trim())continue;const rg=document.createRange();rg.selectNodeContents(tn);rs.push(...[...rg.getClientRects()].filter(r=>r.width>0&&r.height>0));}if(rs.length){const t=Math.min(...rs.map(r=>r.top)),b=Math.max(...rs.map(r=>r.bottom)),l=Math.min(...rs.map(r=>r.left)),r2=Math.max(...rs.map(r=>r.right));ink=R({left:l,top:t,width:r2-l,height:b-t});}}catch{}return {text:e.textContent.slice(0,80),rect:R(e.getBoundingClientRect()),ink,fontSize:parseFloat(getComputedStyle(e.querySelector('.tomoyo-cn-output')||e).fontSize)||null};});
  const sentence=[...document.querySelectorAll('.sentence-window')].map(w=>{const s=w.querySelector('.sentence-text'),f=s?.querySelector('.char-token');return {cls:String(w.className).slice(0,160),shown:shown(w)||!!(s&&shown(s)),text:(s?.textContent||'').slice(0,80),textTop:s?Math.round(s.getBoundingClientRect().top*10)/10:null,firstGlyphTop:f?Math.round(f.getBoundingClientRect().top*10)/10:-1,fontSize:s?parseFloat(getComputedStyle(s).fontSize):null};});
  const choices=[...document.querySelectorAll('.megulit-choice')].map(e=>{const jp=e.querySelector('.megulit-choice-jp'),cn=e.querySelector('.megulit-choice-cn');return {text:e.textContent.slice(0,80),sourceText:plainText(jp),translation:plainText(cn),translationShown:!!cn&&shown(cn),translationRequired:b.isEnabled?.()!==false&&b.isTranslationVisible?.()!==false,pointer:getComputedStyle(e).pointerEvents,shown:shown(e),rect:R(e.getBoundingClientRect())};});
  let prefs={};try{prefs=b.galPreferences?.()||{};}catch{}
  return {body:String(document.body.className),glyphs,cn,sentence,choices,
   hookSource:typeof b.hookSourceText==='string'?b.hookSourceText.slice(0,4000):null,
   readMode:prefs.hookProfile==='read'&&prefs.hookHide!==true?true:false,hookProfile:prefs.hookProfile,hookHide:prefs.hookHide,display:prefs.display,
   fx:typeof b.textEffectsCount==='function'?b.textEffectsCount():null};
 };
})();
