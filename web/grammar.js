/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 语法 (2026-11-11): N5 → N0 levels, N5 complete. Card list of lessons; a lesson is the explanation, real lines
   from your own galgames (game, the minute you read it, translation, the point highlighted), then a fill-in exercise
   cut from those lines that explains itself right after you answer. Progress: learned + accuracy per point. */
import {N5,LEVELS,GROUPS,blankOf,choicesFor} from './grammar-n5.js';
import {readTime} from './read-time.js';
export const grammarMessages={
 zh:{level:'等级',soon:'这一级的课程还在写，先把 N5 学扎实',done:'已学完',progress:'完成度',accuracy:'练习正确率',noAnswers:'还没做练习',back:'← 课程列表',meaning:'意思',form:'接法',uses:'常见用法',pitfalls:'容易错的地方',fromGames:'你玩过的游戏里',builtin:'通用例句',builtinHelp:'你读过的台词里还没找到这个语法，先看这几句',practice:'练习',check:'选一个填进空里',right:'答对了',wrong:'不对，正确答案是',next:'下一题',markDone:'标记为已学完',unmark:'取消已学完',anki:'加入 Anki',ankiDone:'已加入 Anki',ankiFail:'加入 Anki 失败',counting:'正在从读过的台词里找例句……',points:'个语法点',real:'句来自你的游戏',human:'汉化 / 官方译文',machine:'机器翻译',noTranslation:'暂无译文',finished:'这一组练完了',again:'再练一组',script:'剧本'},
 ja:{level:'レベル',soon:'このレベルの講座は準備中です。まずは N5 を固めましょう',done:'学習済み',progress:'達成度',accuracy:'練習の正答率',noAnswers:'まだ練習していません',back:'← 講座一覧',meaning:'意味',form:'接続',uses:'よくある使い方',pitfalls:'間違えやすい点',fromGames:'あなたが遊んだゲームから',builtin:'基本の例文',builtinHelp:'読んだセリフにはまだこの文法が見つかりません。まずはこちらを',practice:'練習',check:'空欄に入るものを選んでください',right:'正解',wrong:'残念、正解は',next:'次の問題',markDone:'学習済みにする',unmark:'学習済みを取り消す',anki:'Anki に追加',ankiDone:'Anki に追加しました',ankiFail:'Anki に追加できませんでした',counting:'読んだセリフから例文を探しています……',points:'項目',real:'文があなたのゲームから',human:'翻訳グループ／公式訳',machine:'機械翻訳',noTranslation:'訳文なし',finished:'このセットは終わりです',again:'もう一度',script:'シナリオ'},
 en:{level:'Level',soon:'Lessons for this level are on the way; get N5 solid first',done:'Learned',progress:'Progress',accuracy:'Exercise accuracy',noAnswers:'No exercises yet',back:'← All lessons',meaning:'Meaning',form:'How it attaches',uses:'Common uses',pitfalls:'Easy mistakes',fromGames:'From games you played',builtin:'Basic examples',builtinHelp:'Your lines do not show this point yet, so start with these',practice:'Practice',check:'Pick what fills the blank',right:'Correct',wrong:'Not quite, the answer is',next:'Next',markDone:'Mark as learned',unmark:'Unmark learned',anki:'Add to Anki',ankiDone:'Added to Anki',ankiFail:'Could not add to Anki',counting:'Looking for examples in the lines you read…',points:'points',real:'lines from your games',human:'Fan / official translation',machine:'Machine translation',noTranslation:'No translation',finished:'Set finished',again:'Another set',script:'script'}
};
const pct=v=>`${Math.round((Number(v)||0)*100)}%`;
const loc=(o,l)=>o?.[l]||o?.zh||'';
/* A line with the point highlighted. */
export function highlight(text,start,end,esc){const c=[...String(text||'')];return esc(c.slice(0,start).join(''))+'<mark class="gm-hl">'+esc(c.slice(start,end).join(''))+'</mark>'+esc(c.slice(end).join(''));}
/* Built-in lines in the same shape as real ones. */
export function builtinExamples(point){return point.builtin.map(b=>{const c=[...b.ja],h=[...b.hl],at=b.ja.indexOf(b.hl),start=at<0?0:[...b.ja.slice(0,at)].length;return {text:b.ja,start,end:start+h.length,translation:b.zh,translationSource:'',origin:'builtin',title:'',readAt:null};});}
/* Exercises: blanks cut from real lines first (only where the blank is one of the point's choices), built-in after. */
export function exercisesFor(point,real,count=4){
 const out=[];for(const e of [...(real||[]),...builtinExamples(point)]){if(out.length>=count)break;const b=blankOf(point,e.text,e.start,e.end);if(!point.choices.includes(b.answer))continue;if(out.some(x=>x.text===e.text))continue;
  out.push({...e,blankStart:b.start,blankEnd:b.end,answer:b.answer,choices:choicesFor(point,b.answer,[...e.text].length+out.length)});}
 return out;
}
function sourceLabel(e,w,locale){
 const parts=[];if(e.title)parts.push(e.title);if(e.origin==='script')parts.push(w.script);
 const t=readTime(e.readAt,locale,{by:e.readBy});if(t)parts.push(t);return parts.join(' · ');
}
function exampleHTML(e,i,{w,esc,locale,anki=true}){
 const tr=e.translation?`<p class="gm-tr">${esc(e.translation)}<small>${esc(e.translationSource==='group'||e.translationSource==='official'?w.human:e.translationSource==='machine'?w.machine:'')}</small></p>`:e.origin==='builtin'?'':`<p class="gm-tr gm-none">${esc(w.noTranslation)}</p>`;
 const src=sourceLabel(e,w,locale);
 return `<li class="gm-ex"><p class="gm-ja" lang="ja">${highlight(e.text,e.start,e.end,esc)}</p>${tr}${src||anki&&e.origin!=='builtin'?`<div class="gm-ex-meta"><span>${esc(src)}</span>${anki&&e.origin!=='builtin'?`<button type="button" class="gm-link" data-anki="${i}">${esc(w.anki)}</button>`:''}</div>`:''}</li>`;
}
export function listHTML(data,{locale,esc,level='N5'}){
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{},comp=data?.completion;
 const levels=`<div class="gm-levels" role="tablist">${LEVELS.map(l=>`<button type="button" role="tab" class="gm-level${l===level?' active':''}" data-level="${l}" aria-selected="${l===level}">${l}</button>`).join('')}</div>`;
 if(level!=='N5')return `${levels}<section class="gm-soon"><p>${esc(w.soon)}</p></section>`;
 const head=`<section class="gm-summary"><div><span class="gm-big">${comp?comp.learned:0}<small>/${N5.length}</small></span><span class="gm-cap">${esc(w.progress)} · ${pct(comp?.share)}</span></div><div class="gm-meter"><i style="width:${pct(comp?.share)}"></i></div><div class="gm-cap">${esc(w.accuracy)} · ${comp?.accuracy==null?esc(w.noAnswers):pct(comp.accuracy)}${data?.real?` · ${data.real} ${esc(w.real)}`:''}</div></section>`;
 const groups=Object.keys(GROUPS).map(g=>{const items=N5.filter(p=>p.group===g);return `<section class="gm-group"><h3>${esc(loc(GROUPS[g],locale))}</h3><div class="gm-cards">${items.map(p=>{const r=prog[p.id]||{},n=data?.examples?.[p.id]?.length||0;return `<button type="button" class="gm-card${r.learned?' learned':''}" data-point="${p.id}"><span class="gm-card-title">${esc(loc(p.title,locale))}</span><span class="gm-card-gist">${esc(loc(p.gist,locale))}</span><span class="gm-card-meta">${r.learned?`<b>${esc(w.done)}</b>`:''}${r.attempts?`<span>${pct(r.correct/r.attempts)}</span>`:''}${n?`<span>${n} ${locale==='en'?'lines':'句'}</span>`:''}</span></button>`;}).join('')}</div></section>`;}).join('');
 return `${levels}${data?.pending&&data?.counting?`<p class="gm-cap gm-status">${esc(w.counting)}</p>`:''}${head}${groups}`;
}
export function lessonHTML(point,data,{locale,esc}){
 const w=grammarMessages[locale]||grammarMessages.zh,real=data?.examples?.[point.id]||[],r=data?.progress?.[point.id]||{};
 const form=`<table class="gm-form"><tbody>${point.form.map(([a,b])=>`<tr><th>${esc(a)}</th><td lang="ja">${esc(b)}</td></tr>`).join('')}</tbody></table>`;
 const uses=`<ol class="gm-uses">${point.uses.map(u=>`<li><p>${esc(u.t)}</p><p class="gm-ja" lang="ja">${esc(u.ja)}</p><p class="gm-tr">${esc(u.zh)}</p></li>`).join('')}</ol>`;
 const examples=real.length?`<h3>${esc(w.fromGames)}</h3><ul class="gm-examples">${real.map((e,i)=>exampleHTML(e,i,{w,esc,locale})).join('')}</ul>`:`<h3>${esc(w.builtin)}</h3><p class="gm-cap">${esc(w.builtinHelp)}</p><ul class="gm-examples">${builtinExamples(point).map((e,i)=>exampleHTML(e,i,{w,esc,locale,anki:false})).join('')}</ul>`;
 return `<button type="button" class="gm-link gm-back" data-back>${esc(w.back)}</button><article class="gm-lesson"><header><h2>${esc(loc(point.title,locale))}</h2><p class="gm-gist">${esc(loc(point.gist,locale))}</p></header>
<section><h3>${esc(w.form)}</h3>${form}</section><section><h3>${esc(w.uses)}</h3>${uses}</section><section><h3>${esc(w.pitfalls)}</h3><ul class="gm-pitfalls">${point.pitfalls.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></section>
<section>${examples}</section><section class="gm-practice"><h3>${esc(w.practice)}</h3><div data-quiz></div></section>
<div class="gm-actions"><button type="button" class="${r.learned?'secondary':'primary'}" data-learned="${r.learned?'0':'1'}">${esc(r.learned?w.unmark:w.markDone)}</button></div></article>`;
}
export function quizHTML(point,q,{locale,esc,answered=null,index=0,total=1}){
 const w=grammarMessages[locale]||grammarMessages.zh,c=[...q.text],blank=`<span class="gm-blank">${answered==null?'＿＿':esc(q.answer)}</span>`;
 const line=esc(c.slice(0,q.blankStart).join(''))+blank+esc(c.slice(q.blankEnd).join(''));
 const src=sourceLabel(q,w,locale);
 const verdict=answered==null?'':`<div class="gm-verdict ${answered===q.answer?'ok':'bad'}"><b>${esc(answered===q.answer?w.right:`${w.wrong}「${q.answer}」`)}</b><p>${esc(loc(point.gist,locale))}</p>${point.pitfalls[0]?`<p class="gm-cap">${esc(point.pitfalls[0])}</p>`:''}${q.translation?`<p class="gm-tr">${esc(q.translation)}</p>`:''}<button type="button" class="primary" data-next>${esc(index+1<total?w.next:w.again)}</button></div>`;
 return `<p class="gm-cap">${esc(w.check)} · ${index+1}/${total}</p><p class="gm-ja gm-q" lang="ja">${line}</p>${src?`<p class="gm-cap">${esc(src)}</p>`:''}<div class="gm-choices">${q.choices.map(ch=>`<button type="button" class="gm-choice${answered!=null&&ch===q.answer?' right':''}${answered===ch&&ch!==q.answer?' wrong':''}" data-choice="${esc(ch)}"${answered!=null?' disabled':''} lang="ja">${esc(ch)}</button>`).join('')}</div>${verdict}`;
}
export async function mountGrammar(target,{api,locale,esc,toast,isCurrent=()=>true}){
 const w=grammarMessages[locale]||grammarMessages.zh;let data=null,level='N5',point=null,timer=0;
 const root=document.createElement('div');root.className='gm-page';target.replaceChildren(root);
 const load=async(count=true)=>{clearTimeout(timer);try{const next=await api('grammar_report',{count});if(!isCurrent())return;data=next;render();if(next.pending&&next.counting&&count)timer=setTimeout(()=>{if(isCurrent())load(true);},2000);}catch(error){if(isCurrent()&&!data){data={};render();toast?.(String(error?.message||error));}}};
 function render(){if(point){renderLesson();return;}root.innerHTML=listHTML(data,{locale,esc,level});
  root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{level=b.dataset.level;render();});
  root.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>{point=N5.find(p=>p.id===b.dataset.point);render();root.scrollIntoView?.({block:'start'});});}
 function renderLesson(){
  root.innerHTML=lessonHTML(point,data,{locale,esc});const real=data?.examples?.[point.id]||[];
  root.querySelector('[data-back]').onclick=()=>{point=null;render();};
  root.querySelector('[data-learned]').onclick=async event=>{const on=event.currentTarget.dataset.learned==='1';try{const r=await api('grammar_learned',{point:point.id,learned:on});data.progress={...data.progress,[point.id]:r};data.completion=completion(data.progress);renderLesson();}catch(error){toast?.(String(error?.message||error));}};
  root.querySelectorAll('[data-anki]').forEach(b=>b.onclick=async()=>{const e=real[Number(b.dataset.anki)];b.disabled=true;try{await api('grammar_anki',{point:point.id,title:loc(point.title,'zh'),gist:loc(point.gist,'zh'),example:e});b.textContent=w.ankiDone;}catch{b.disabled=false;toast?.(w.ankiFail);}});
  let qs=exercisesFor(point,real),i=0,answered=null;const box=root.querySelector('[data-quiz]');
  const draw=()=>{if(!qs.length){box.innerHTML=`<p class="gm-cap">${esc(w.finished)}</p>`;return;}box.innerHTML=quizHTML(point,qs[i],{locale,esc,answered,index:i,total:qs.length});
   box.querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{if(answered!=null)return;answered=b.dataset.choice;draw();try{const r=await api('grammar_answer',{point:point.id,correct:answered===qs[i].answer});data.progress={...data.progress,[point.id]:r};data.completion=completion(data.progress);}catch{}});
   box.querySelector('[data-next]')?.addEventListener('click',()=>{answered=null;i++;if(i>=qs.length){i=0;qs=[...qs.slice(1),qs[0]];}draw();});};
  draw();
 }
 root.innerHTML=`<p class="gm-cap gm-status">${esc(w.counting)}</p>`;
 await load(true);
 return ()=>clearTimeout(timer);
}
export function completion(prog){let learned=0,attempts=0,correct=0;for(const p of N5){const r=prog?.[p.id];if(r?.learned)learned++;attempts+=r?.attempts||0;correct+=r?.correct||0;}return {learned,total:N5.length,share:learned/N5.length,accuracy:attempts?correct/attempts:null};}
