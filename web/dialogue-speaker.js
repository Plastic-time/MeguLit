// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: mark each line as narration or with the speaker's name, and let me correct it in case it was missed
   or wrong). Every dialogue record gets a speaker label in its header: a name written before the opening bracket
   (名前「…」) is taken as the speaker, a bracketed line without a name is a spoken line, anything else is narration.
   Click the label to correct it; the correction is kept for that line on this computer (empty restores the guess). */
const KEY='megulit.speakers.v1';
const W={zh:{narr:'旁白',line:'台词',edit:'点击修改说话人',ph:'说话人（留空恢复）'},ja:{narr:'地の文',line:'セリフ',edit:'クリックで話者を修正',ph:'話者（空欄で元に戻す）'},en:{narr:'Narration',line:'Line',edit:'Click to correct the speaker',ph:'Speaker (empty to reset)'}};
const words=()=>W[(document.documentElement.lang||'zh').slice(0,2)]||W.zh;
const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}');}catch{return {};}};
const save=m=>{try{localStorage.setItem(KEY,JSON.stringify(m));}catch{}};
function guess(text){const t=String(text||'').trim(),w=words();const m=t.match(/^([^\s「『（(【\[]{1,12})\s*[「『（(]/);if(m)return {name:m[1],kind:'name'};if(/^[「『（(]/.test(t))return {name:w.line,kind:'line'};return {name:w.narr,kind:'narr'};}
function paint(art){const id=art.dataset.historyId,head=art.querySelector('header');if(!id||!head)return;
 const g=guess(art.querySelector('.dialogue-source')?.textContent),own=load()[id];
 let b=head.querySelector('.dlg-speaker');if(!b){b=document.createElement('button');b.type='button';b.className='dlg-speaker';head.insertBefore(b,head.querySelector('time'));}
 b.textContent=own||g.name;b.dataset.kind=own?'name':g.kind;b.dataset.own=own?'1':'';b.title=words().edit;}
function edit(b){const art=b.closest('article.history-dialogue'),id=art?.dataset.historyId;if(!id)return;
 const inp=document.createElement('input');inp.className='dlg-speaker-input';inp.maxLength=24;inp.placeholder=words().ph;inp.value=b.dataset.own?b.textContent:(b.dataset.kind==='name'?b.textContent:'');b.replaceWith(inp);inp.focus();inp.select();
 let done=false;const finish=keep=>{if(done)return;done=true;const m=load(),v=inp.value.trim();if(keep){if(v)m[id]=v;else delete m[id];save(m);}inp.replaceWith(b);paint(art);};
 inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});inp.addEventListener('blur',()=>finish(true));}
document.addEventListener('click',e=>{const b=e.target.closest?.('.dlg-speaker');if(b){e.preventDefault();e.stopPropagation();edit(b);}},true);
const sweep=root=>root.querySelectorAll?.('article.history-dialogue').forEach(paint);
new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches('article.history-dialogue'))paint(n);else sweep(n);}}).observe(document.documentElement,{subtree:true,childList:true});
sweep(document);
