// SPDX-License-Identifier: GPL-3.0-or-later
// 收藏句子: the shared save path for the drag-selection lookup card (v4.js adds the button there). It saves the whole
// line the selection sits in, that line's translation, and the game the reader is attached to (decided by the
// service). Same on every engine and in both layouts: the line is the one the reader drew (.sentence-text).
// Every Anki card also keeps its line (source auto); the service does that and v4.js shows the hint via markSaved.
(function installSaveSentence(){
 'use strict';
 const b=window.__tomoyoChinese;if(!b){setTimeout(installSaveSentence,200);return;}if(b.saveSentenceInstalled)return;b.saveSentenceInstalled=true;
 const T={
  zh:{save:'☆ 收藏句子',saved:'★ 已收藏',savedTitle:'已收藏到 学习 → 句子，点击取消',saveTitle:'把这一整句和译文收藏到 学习 → 句子',removed:'已取消收藏',failed:'收藏失败：',also:'已同时收藏句子'},
  ja:{save:'☆ 文を保存',saved:'★ 保存済み',savedTitle:'学習 → 文 に保存済み。クリックで解除',saveTitle:'この文と訳文を 学習 → 文 に保存',removed:'保存を解除しました',failed:'保存に失敗しました：',also:'文も保存しました'},
  en:{save:'☆ Save sentence',saved:'★ Saved',savedTitle:'Saved to Learning → Sentences; click to remove',saveTitle:'Save this whole line and its translation to Learning → Sentences',removed:'Removed',failed:'Could not save: ',also:'Sentence saved too'}
 };
 const t=()=>T[window.__tomeI18n?.get?.()]||T.zh;
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const known=new Map(),waiting=new Map();
 function plain(node){const chars=node.querySelectorAll('.char-token');if(chars.length)return Array.from(chars,c=>c.textContent).join('').trim();const copy=node.cloneNode(true);for(const r of copy.querySelectorAll('rt,rp'))r.remove();return copy.textContent.trim();}
 function translationNear(node){let p=node.parentElement;for(let i=0;p&&i<4;i++,p=p.parentElement){const out=p.querySelector('.tomoyo-cn-output');if(out){if(['pending','error'].includes(out.dataset.state)||out.hidden)return '';const v=out.textContent.trim();return v==='翻译中…'?'':v;}}return '';}
 /* the translation drawn beside the line whose text is `text` */
 function translationOf(text){const want=String(text||'').replace(/\s+/g,'');for(const node of document.querySelectorAll('.sentence-text'))if(plain(node).replace(/\s+/g,'')===want)return translationNear(node);return '';}
 function request(type,text,translation){
  text=String(text||'').trim();if(!text)return Promise.reject(Error('INVALID_SENTENCE'));
  return new Promise((resolve,reject)=>{const list=waiting.get(text)||[];list.push({resolve,reject});waiting.set(text,list);send({type,text,translation:translation??translationOf(text)});setTimeout(()=>{const l=waiting.get(text);const i=l?l.findIndex(x=>x.resolve===resolve):-1;if(i>=0){l.splice(i,1);reject(Error('TIMEOUT'));}},10000);});
 }
 b.sentenceState=(text,saved,error,created)=>{
  text=String(text);if(!error)known.set(text,!!saved);
  const p=(waiting.get(text)||[]).shift();if(p)error?p.reject(Error(error)):p.resolve({saved:!!saved,created:!!created});
  for(const f of listeners)try{f(text);}catch{}
 };
 const listeners=new Set();
 const api={
  t,translationOf,
  isSaved:text=>known.get(String(text||'').trim()),
  state:text=>request('sentenceState',text,''),
  save:(text,translation)=>request('sentenceSave',text,translation),
  remove:text=>request('sentenceDelete',text,''),
  markSaved:text=>{known.set(String(text||'').trim(),true);for(const f of listeners)try{f(text);}catch{}},
  onChange:f=>{listeners.add(f);return()=>listeners.delete(f);}
 };
 b.savedSentences=api;
 /* the main app deleted one from 学习 → 句子 */
 addEventListener('tome-sentences-changed',()=>{known.clear();for(const f of listeners)try{f('');}catch{}});
})();
