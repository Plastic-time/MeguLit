// SPDX-License-Identifier: GPL-3.0-or-later
// 收藏这一句: a button in the Alt+T menu header (and Ctrl+S while the overlay has focus) saves the line on screen,
// its translation and the current game to 学习 → 句子. Pressing it again on a saved line removes it. Works on every
// engine and in both layouts: it reads the line the reader drew (.sentence-text + .tomoyo-cn-output), so the
// ISLAND page layout and the normal overlay share the same path; the service decides which game it belongs to.
(function installSaveSentence(){
 'use strict';
 const b=window.__tomoyoChinese;if(!b){setTimeout(installSaveSentence,200);return;}if(b.saveSentenceInstalled)return;b.saveSentenceInstalled=true;
 const T={
  zh:{save:'收藏这一句',saved:'已收藏 · 点击取消',none:'当前没有台词',done:'已收藏到 学习 → 句子',removed:'已取消收藏',failed:'收藏失败：'},
  ja:{save:'この台詞を保存',saved:'保存済み · クリックで解除',none:'表示中の台詞がありません',done:'学習 → 文 に保存しました',removed:'保存を解除しました',failed:'保存に失敗しました：'},
  en:{save:'Save this line',saved:'Saved · click to remove',none:'No line on screen',done:'Saved to Learning → Sentences',removed:'Removed from saved sentences',failed:'Could not save: '}
 };
 const t=()=>T[window.__tomeI18n?.get?.()]||T.zh;
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const known=new Map();let pending='';
 /* text of a drawn line without its furigana */
 function plain(node){const chars=node.querySelectorAll('.char-token');if(chars.length)return Array.from(chars,c=>c.textContent).join('').trim();const copy=node.cloneNode(true);for(const r of copy.querySelectorAll('rt,rp'))r.remove();return copy.textContent.trim();}
 function visible(n){return n.getClientRects().length>0&&!n.closest('[hidden],.tomoyo-cn-dialog,.tome-backlog,.tomoyo-backlog');}
 function translationNear(node){let p=node.parentElement;for(let i=0;p&&i<4;i++,p=p.parentElement){const out=p.querySelector('.tomoyo-cn-output');if(out){if(['pending','error'].includes(out.dataset.state)||out.hidden)return '';const v=out.textContent.trim();return v==='翻译中…'?'':v;}}return '';}
 function current(){
  const lines=[...document.querySelectorAll('.sentence-text')].filter(visible);
  const live=lines.filter(n=>!n.closest('.tome-island-past'));
  const node=(live.length?live:lines).pop();
  const text=node?plain(node):String(b.sourceText||'').trim();
  return {text,translation:node?translationNear(node):''};
 }
 b.currentSentence=current;
 function paint(){
  const {text}=current(),saved=!!text&&known.get(text)===true,s=t();
  for(const button of document.querySelectorAll('[data-tome-save-sentence]')){button.disabled=!text||pending===text;button.classList.toggle('tome-sentence-saved',saved);button.setAttribute('aria-pressed',String(saved));button.textContent=(saved?'★ ':'☆ ')+(text?(saved?s.saved:s.save):s.none);button.title=text;}
 }
 let lastAsked='';
 function ask(){const {text}=current();if(text&&text!==lastAsked&&!known.has(text)){lastAsked=text;send({type:'sentenceState',text});}paint();}
 function toast(message){const n=document.createElement('div');n.className='tome-save-sentence-toast';n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),1800);}
 function toggle(){
  const {text,translation}=current();if(!text||pending)return;
  pending=text;const remove=known.get(text)===true;paint();
  send({type:remove?'sentenceDelete':'sentenceSave',text,translation,toggle:true});
 }
 b.toggleSaveSentence=toggle;
 b.sentenceState=(text,saved,error)=>{
  const wasPending=pending===text;if(wasPending)pending='';
  if(error){if(wasPending)toast(t().failed+error);paint();return;}
  known.set(String(text),!!saved);
  if(wasPending)toast(saved?t().done:t().removed);
  paint();
 };
 /* re-check when the main app deletes a sentence from 学习 → 句子 */
 addEventListener('tome-sentences-changed',()=>{known.clear();lastAsked='';ask();});
 function mount(){
  for(const header of document.querySelectorAll('.tomoyo-menu-header:not([data-tome-save-sentence-host])')){
   header.dataset.tomeSaveSentenceHost='1';
   const button=document.createElement('button');button.type='button';button.className='tome-save-sentence';button.dataset.tomeSaveSentence='';
   /* the header drags the menu: keep the press on the button */
   for(const type of ['pointerdown','mousedown'])button.addEventListener(type,e=>e.stopPropagation());
   button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle();});
   header.append(button);
  }
  ask();
 }
 const style=document.createElement('style');
 style.textContent='.tome-save-sentence{align-self:flex-start;margin-top:6px;padding:5px 12px;border-radius:999px;border:1px solid var(--mg-line,rgba(255,255,255,.25));background:transparent;color:inherit;font:inherit;font-size:12.5px;cursor:pointer;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tome-save-sentence:hover:not(:disabled){background:var(--mg-tint,rgba(255,255,255,.08))}.tome-save-sentence:disabled{opacity:.55;cursor:default}.tome-save-sentence.tome-sentence-saved{color:var(--mg-accent,#f2b950);border-color:currentColor}.tome-save-sentence-toast{position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2147483647;padding:8px 16px;border-radius:10px;background:rgba(20,20,24,.88);color:#fff;font-size:13px;pointer-events:none}';
 (document.head||document.documentElement).append(style);
 document.addEventListener('keydown',e=>{if(e.ctrlKey&&!e.altKey&&!e.shiftKey&&(e.key==='s'||e.key==='S')){const a=document.activeElement;if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a?.isContentEditable)return;e.preventDefault();toggle();}},true);
 const previous=b.onSourceText;b.onSourceText=function(text){const r=previous?.apply(this,arguments);ask();return r;};
 new MutationObserver(()=>{clearTimeout(mount.timer);mount.timer=setTimeout(mount,150);}).observe(document.documentElement,{subtree:true,childList:true});
 mount();
})();
