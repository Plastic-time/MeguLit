// SPDX-License-Identifier: GPL-3.0-or-later
// 学习 → 句子: saved lines with a filter (all / saved by hand / kept when adding cards), the words added from each
// line (click one to look it up), and a remove button. A word on the words page can open its line here (focus).
const L={
 zh:{all:'全部',manual:'手动收藏',auto:'加卡时自动留下',autoTag:'加卡时留下',words:'从这句加过的词',lookup:'查词：',none:'这个筛选下还没有句子',remove:'取消收藏',play:'播放（有游戏原声时播原声）',missing:'这句还没有收藏到句子页（这个词是在句子收藏功能之前加的）',game:'打开作品'},
 ja:{all:'すべて',manual:'手動で保存',auto:'カード追加時に自動保存',autoTag:'カード追加時',words:'この文から追加した語',lookup:'辞書で調べる：',none:'この条件の文はまだありません',remove:'保存を解除',play:'再生（ゲーム音声があれば原音）',missing:'この文はまだ保存されていません（文の保存機能より前に追加した語です）',game:'作品を開く'},
 en:{all:'All',manual:'Saved by hand',auto:'Kept when adding cards',autoTag:'From a card',words:'Words added from this line',lookup:'Look up: ',none:'No sentences for this filter yet',remove:'Remove',play:'Play (the game voice when there is one)',missing:'This line is not in Sentences yet (the word was added before sentence saving existed)',game:'Open the game'}
};
let filter='all',focus='';
export function focusSentence(text){focus=String(text||'');filter='all';}
export async function mountSentences(target,{api,locale,esc,toast,errorMessage,empty,emptyLabel,readTime,datetime,icon,isCurrent,rerender,lookup,openGame}){
 const s=L[locale]||L.zh;
 const all=await api('sentences');if(!isCurrent())return;
 const want=focus;focus='';
 if(!all.length){target.innerHTML=empty(emptyLabel,'learning');if(want)toast(s.missing);return;}
 const count=k=>k==='all'?all.length:all.filter(x=>(x.source||'manual')===k).length;
 const items=filter==='all'?all:all.filter(x=>(x.source||'manual')===filter);
 const bar=`<div class="sentence-filter" role="tablist">${['all','manual','auto'].map(k=>`<button type="button" role="tab" class="tab${filter===k?' active':''}" aria-selected="${filter===k}" data-sentence-filter="${k}">${esc(s[k])} <small class="muted">${count(k)}</small></button>`).join('')}</div>`;
 const row=item=>`<article class="record sentence-record" data-sentence-id="${item.id}"><div class="record-meta"><span>${item.game_id&&item.title?`<button type="button" class="link-button" data-sentence-game="${esc(item.game_id)}" title="${esc(s.game)}">${esc(item.title)}</button>`:esc(item.title||'')}${(item.source||'manual')==='auto'?` · <span class="sentence-source">${esc(s.autoTag)}</span>`:''}</span><span>${esc(readTime(item.created_at,locale))||datetime(item.created_at)}</span></div><p>${esc(item.text)}</p>${item.translation?`<p class="muted">${esc(item.translation)}</p>`:''}${item.words?.length?`<div class="sentence-words"><span class="muted">${esc(s.words)}</span>${item.words.map(w=>`<button type="button" class="sentence-word" data-lookup="${esc(w.spelling)}" title="${esc(s.lookup+w.spelling)}">${esc(w.spelling)}${w.reading&&w.reading!==w.spelling?`<small>${esc(w.reading)}</small>`:''}</button>`).join('')}</div>`:''}<div class="word-actions sentence-actions"><button type="button" class="icon-button" data-sentence-play="${item.id}" aria-label="${esc(s.play)}" title="${esc(s.play)}">▶</button><button class="icon-button" data-sentence-delete="${item.id}" aria-label="${esc(s.remove)}" title="${esc(s.remove)}">${icon('trash')}</button></div></article>`;
 target.innerHTML=bar+(items.length?`<div class="record-list">${items.map(row).join('')}</div>`:`<div class="empty-state"><p>${esc(s.none)}</p></div>`);
 target.querySelectorAll('[data-sentence-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.sentenceFilter;rerender();}));
 target.querySelectorAll('[data-sentence-play]').forEach(b=>b.addEventListener('click',async()=>{const item=all.find(x=>String(x.id)===b.dataset.sentencePlay);if(!item)return;b.disabled=true;try{await (await import('./sentence-voice.js')).playSentence(api,item.text,b);}catch(error){toast(errorMessage(error));}finally{b.disabled=false;}}));
 target.querySelectorAll('[data-sentence-delete]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await api('sentence_delete',{id:Number(b.dataset.sentenceDelete)});rerender();}catch(error){b.disabled=false;toast(errorMessage(error));}}));
 target.querySelectorAll('[data-lookup]').forEach(b=>b.addEventListener('click',()=>lookup(b.dataset.lookup)));
 target.querySelectorAll('[data-sentence-game]').forEach(b=>b.addEventListener('click',()=>openGame(b.dataset.sentenceGame)));
 if(want){const hit=all.find(x=>x.text===want);const node=hit&&target.querySelector(`[data-sentence-id="${hit.id}"]`);if(node){node.classList.add('sentence-focus');requestAnimationFrame(()=>node.scrollIntoView({block:'center'}));}else toast(s.missing);}
}
