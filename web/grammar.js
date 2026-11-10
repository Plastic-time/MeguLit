/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 语法 (2026-11-11): N5 → N0 levels, N5 complete, made to be played with (user: 要可互动):
   - 日语核心体系总览: a map of nine nodes; click to open one, its N5 points light up once learned, a point opens its lesson
   - 活用演示台: pick a verb or adjective, switch ます／て／ない／た, only the ending moves and is marked
   - 助词放置: drag or tap a particle into the gap; the right one lights the line and shows its translation
   - real galgame lines: tap or hover the highlighted grammar for an explanation, 朗读 reads the line aloud
   - exercises: instant feedback; a wrong answer shows how it attaches and gives another line of the same kind
   Every line from a game says the game and the minute it was read. */
import {N5,LEVELS,GROUPS,blankOf,choicesFor} from './grammar-n5.js';
import {MAP,POINT_NODES,nodeOf} from './grammar-map.js';
import {WORDS,FORMS,FORM_LABEL,conjugate} from './conjugate.js';
import {readTime} from './read-time.js';
export const grammarMessages={
 zh:{level:'等级',soon:'这一级的课程还在写，先把 N5 学扎实',done:'已学完',progress:'完成度',accuracy:'练习正确率',noAnswers:'还没做练习',back:'← 课程列表',form:'接法',uses:'常见用法',pitfalls:'容易错的地方',fromGames:'你玩过的游戏里',builtin:'通用例句',builtinHelp:'你读过的台词里还没找到这个语法，先看这几句',practice:'练习',check:'选一个填进空里',right:'答对了',wrong:'不对，正确答案是',next:'下一题',retry:'再练一句同类台词',markDone:'标记为已学完',unmark:'取消已学完',anki:'加入 Anki',ankiDone:'已加入 Anki',ankiFail:'加入 Anki 失败',counting:'正在从读过的台词里找例句……',real:'句来自你的游戏',human:'汉化 / 官方译文',machine:'机器翻译',noTranslation:'暂无译文',finished:'这一组练完了',script:'剧本',map:'日语核心体系总览',mapLead:'先看全局：一句日语由哪几块拼成，每个 N5 语法点在哪一块。点开一块看看',mapOpen:'打开体系地图',onMap:'在体系地图上',learnedOf:'已学',conj:'活用演示台',conjLead:'选一个词，切换变形，只有词尾会动',pickWord:'选一个词',reading:'读音',particles:'助词放置',particlesLead:'把助词拖进空位，或者先点助词再点空位',placeHere:'放这里',notHere:'放不进这里：',speak:'朗读',speakFail:'朗读需要语音引擎（设置 → 语音）',explain:'点开看解释',close:'关闭',correctForm:'正确的接法',lit:'句子亮了'},
 ja:{level:'レベル',soon:'このレベルの講座は準備中です。まずは N5 を固めましょう',done:'学習済み',progress:'達成度',accuracy:'練習の正答率',noAnswers:'まだ練習していません',back:'← 講座一覧',form:'接続',uses:'よくある使い方',pitfalls:'間違えやすい点',fromGames:'あなたが遊んだゲームから',builtin:'基本の例文',builtinHelp:'読んだセリフにはまだこの文法が見つかりません。まずはこちらを',practice:'練習',check:'空欄に入るものを選んでください',right:'正解',wrong:'残念、正解は',next:'次の問題',retry:'同じ種類のセリフでもう一問',markDone:'学習済みにする',unmark:'学習済みを取り消す',anki:'Anki に追加',ankiDone:'Anki に追加しました',ankiFail:'Anki に追加できませんでした',counting:'読んだセリフから例文を探しています……',real:'文があなたのゲームから',human:'翻訳グループ／公式訳',machine:'機械翻訳',noTranslation:'訳文なし',finished:'このセットは終わりです',script:'シナリオ',map:'日本語の全体マップ',mapLead:'まず全体像から。文がどんな部品でできていて、N5 の文法がどこにあるか。ブロックを開いてみましょう',mapOpen:'全体マップを開く',onMap:'マップ上の位置',learnedOf:'学習済み',conj:'活用ラボ',conjLead:'語を選んで形を切り替えると、語尾だけが動きます',pickWord:'語を選ぶ',reading:'読み',particles:'助詞パズル',particlesLead:'助詞を空欄にドラッグ、または助詞→空欄の順にタップ',placeHere:'ここに置く',notHere:'ここには入りません：',speak:'読み上げ',speakFail:'読み上げには音声エンジンが必要です（設定 → 音声）',explain:'タップで解説',close:'閉じる',correctForm:'正しい接続',lit:'文が光りました'},
 en:{level:'Level',soon:'Lessons for this level are on the way; get N5 solid first',done:'Learned',progress:'Progress',accuracy:'Exercise accuracy',noAnswers:'No exercises yet',back:'← All lessons',form:'How it attaches',uses:'Common uses',pitfalls:'Easy mistakes',fromGames:'From games you played',builtin:'Basic examples',builtinHelp:'Your lines do not show this point yet, so start with these',practice:'Practice',check:'Pick what fills the blank',right:'Correct',wrong:'Not quite, the answer is',next:'Next',retry:'Another line of the same kind',markDone:'Mark as learned',unmark:'Unmark learned',anki:'Add to Anki',ankiDone:'Added to Anki',ankiFail:'Could not add to Anki',counting:'Looking for examples in the lines you read…',real:'lines from your games',human:'Fan / official translation',machine:'Machine translation',noTranslation:'No translation',finished:'Set finished',script:'script',map:'Map of Japanese grammar',mapLead:'The big picture first: the parts a Japanese sentence is built from, and where each N5 point sits. Open a block',mapOpen:'Open the map',onMap:'On the map',learnedOf:'learned',conj:'Conjugation lab',conjLead:'Pick a word and switch forms; only the ending moves',pickWord:'Pick a word',reading:'Reading',particles:'Particle puzzle',particlesLead:'Drag a particle into the gap, or tap a particle then the gap',placeHere:'Place here',notHere:'Does not fit here: ',speak:'Read aloud',speakFail:'Reading aloud needs the voice engine (Settings → Voice)',explain:'Tap for the explanation',close:'Close',correctForm:'How it attaches',lit:'The line lights up'}
};
const PARTICLES=['は','が','を','に','で','へ','と','も','の'],PARTICLE_POINT={'は':'wa','が':'ga','を':'wo','に':'ni','で':'de','へ':'he','と':'to','も':'mo','の':'no'};
const CONJ_POINTS={masu:['godan','ichidan','suru','kuru'],te:['godan','ichidan','suru','kuru'],nai:['godan','ichidan','suru','kuru'],ta:['godan','ichidan','suru','kuru'],iadj:['i'],naadj:['na']};
const CONJ_FORM={masu:'masu',te:'te',nai:'nai',ta:'ta',iadj:'nai',naadj:'nai'};
const pct=v=>`${Math.round((Number(v)||0)*100)}%`;
const loc=(o,l)=>o?.[l]||o?.zh||'';
const motion=()=>typeof matchMedia!=='function'||!matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointById=id=>N5.find(p=>p.id===id);
/* A line with the point highlighted; the highlight is a button that opens the explanation. */
export function highlight(text,start,end,esc,pointId=''){const c=[...String(text||'')];return esc(c.slice(0,start).join(''))+`<mark class="gm-hl"${pointId?` role="button" tabindex="0" data-explain="${esc(pointId)}"`:''}>`+esc(c.slice(start,end).join(''))+'</mark>'+esc(c.slice(end).join(''));}
export function builtinExamples(point){return point.builtin.map(b=>{const h=[...b.hl],at=b.ja.indexOf(b.hl),start=at<0?0:[...b.ja.slice(0,at)].length;return {text:b.ja,start,end:start+h.length,translation:b.zh,translationSource:'',origin:'builtin',title:'',readAt:null};});}
/* Exercises: blanks cut from real lines first (only where the blank is one of the point's choices), built-in after. */
export function exercisesFor(point,real,count=4){
 const out=[];for(const e of [...(real||[]),...builtinExamples(point)]){if(out.length>=count)break;const b=blankOf(point,e.text,e.start,e.end);if(!point.choices.includes(b.answer))continue;if(out.some(x=>x.text===e.text))continue;
  out.push({...e,blankStart:b.start,blankEnd:b.end,answer:b.answer,choices:choicesFor(point,b.answer,[...e.text].length+out.length)});}
 return out;
}
/* Gap sentences for the particle puzzle: lines whose blank is a particle. */
export function particleGaps(point,real,count=3){return exercisesFor(point,real,count).filter(q=>PARTICLES.includes(q.answer));}
export function sourceLabel(e,w,locale){const parts=[];if(e.title)parts.push(e.title);if(e.origin==='script')parts.push(w.script);const t=readTime(e.readAt,locale,{by:e.readBy});if(t)parts.push(t);return parts.join(' · ');}
const trLabel=(e,w)=>e.translationSource==='group'||e.translationSource==='official'?w.human:e.translationSource==='machine'?w.machine:'';
function exampleHTML(e,i,{w,esc,locale,pointId,anki=true}){
 const tr=e.translation?`<p class="gm-tr">${esc(e.translation)}<small>${esc(trLabel(e,w))}</small></p>`:e.origin==='builtin'?'':`<p class="gm-tr gm-none">${esc(w.noTranslation)}</p>`;
 const src=sourceLabel(e,w,locale),ankiBtn=anki&&e.origin!=='builtin'?`<button type="button" class="gm-link" data-anki="${i}">${esc(w.anki)}</button>`:'';
 return `<li class="gm-ex"><p class="gm-ja" lang="ja">${highlight(e.text,e.start,e.end,esc,pointId)}</p>${tr}<div class="gm-ex-meta"><span>${esc(src)}</span><span class="gm-ex-actions"><button type="button" class="gm-link" data-speak="${esc(e.text)}">${esc(w.speak)}</button>${ankiBtn}</span></div></li>`;
}
/* ---- map ---- */
function nodeStats(node,prog){const pts=N5.filter(p=>nodeOf(p.id)===node.id||POINT_NODES[p.id]?.includes(node.id));return {pts,learned:pts.filter(p=>prog?.[p.id]?.learned).length};}
export function mapHTML(data,{locale,esc,open=''}){
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{};
 const nodes=MAP.map(n=>{const s=nodeStats(n,prog),isOpen=n.id===open;return `<li class="gm-node${isOpen?' open':''}${s.learned?' lit':''}${s.pts.length&&s.learned===s.pts.length?' full':''}" data-node="${n.id}"><button type="button" class="gm-node-head" aria-expanded="${isOpen}" data-toggle="${n.id}"><span class="gm-node-no">${esc(n.no)}</span><span class="gm-node-title">${esc(loc(n.title,locale))}</span><span class="gm-node-count">${s.pts.length?`${s.learned}/${s.pts.length}`:''}</span></button><p class="gm-node-line">${esc(loc(n.line,locale))}</p>${isOpen?`<div class="gm-node-body"><p>${esc(loc(n.body,locale))}</p>${n.demo.map(d=>`<p class="gm-ja gm-demo" lang="ja">${esc(d.ja)}</p><p class="gm-tr">${esc(d.zh)}</p>`).join('')}${s.pts.length?`<div class="gm-chips">${s.pts.map(p=>`<button type="button" class="gm-chip${prog[p.id]?.learned?' lit':''}${nodeOf(p.id)===n.id?'':' side'}" data-point="${p.id}">${esc(loc(p.title,locale).split(' —— ')[0])}</button>`).join('')}</div>`:''}</div>`:''}</li>`;}).join('');
 return `<button type="button" class="gm-link gm-back" data-back>${esc(w.back)}</button><section class="gm-map"><header><h2>${esc(w.map)}</h2><p class="gm-cap">${esc(w.mapLead)}</p></header><ol class="gm-nodes">${nodes}</ol></section>`;
}
/* ---- list ---- */
export function listHTML(data,{locale,esc,level='N5'}){
 const w=grammarMessages[locale]||grammarMessages.zh,prog=data?.progress||{},comp=data?.completion;
 const levels=`<div class="gm-levels" role="tablist">${LEVELS.map(l=>`<button type="button" role="tab" class="gm-level${l===level?' active':''}" data-level="${l}" aria-selected="${l===level}">${l}</button>`).join('')}</div>`;
 if(level!=='N5')return `${levels}<section class="gm-soon"><p>${esc(w.soon)}</p></section>`;
 const head=`<section class="gm-summary"><div><span class="gm-big">${comp?comp.learned:0}<small>/${N5.length}</small></span><span class="gm-cap">${esc(w.progress)} · ${pct(comp?.share)}</span></div><div class="gm-meter"><i style="width:${pct(comp?.share)}"></i></div><div class="gm-cap">${esc(w.accuracy)} · ${comp?.accuracy==null?esc(w.noAnswers):pct(comp.accuracy)}${data?.real?` · ${data.real} ${esc(w.real)}`:''}</div></section>`;
 const overview=`<button type="button" class="gm-overview" data-map><span class="gm-overview-kicker">${esc(w.map)}</span><span class="gm-overview-nodes">${MAP.map(n=>`<i class="${nodeStats(n,prog).learned?'lit':''}" title="${esc(loc(n.title,locale))}">${esc(n.no)}</i>`).join('')}</span><span class="gm-cap">${esc(w.mapLead)}</span></button>`;
 const groups=Object.keys(GROUPS).map(g=>{const items=N5.filter(p=>p.group===g);return `<section class="gm-group"><h3>${esc(loc(GROUPS[g],locale))}</h3><div class="gm-cards">${items.map(p=>{const r=prog[p.id]||{},n=data?.examples?.[p.id]?.length||0,node=MAP.find(m=>m.id===nodeOf(p.id));return `<button type="button" class="gm-card${r.learned?' learned':''}" data-point="${p.id}"><span class="gm-card-node">${esc(node.no)} · ${esc(loc(node.title,locale))}</span><span class="gm-card-title">${esc(loc(p.title,locale))}</span><span class="gm-card-gist">${esc(loc(p.gist,locale))}</span><span class="gm-card-meta">${r.learned?`<b>${esc(w.done)}</b>`:''}${r.attempts?`<span>${pct(r.correct/r.attempts)}</span>`:''}${n?`<span>${n} ${locale==='en'?'lines':'句'}</span>`:''}</span></button>`;}).join('')}</div></section>`;}).join('');
 return `${levels}${data?.pending&&data?.counting?`<p class="gm-cap gm-status">${esc(w.counting)}</p>`:''}${head}${overview}${groups}`;
}
/* ---- widgets ---- */
export function conjHTML(pointId,{locale,esc,wordIndex=null,form=null}){
 const w=grammarMessages[locale]||grammarMessages.zh,types=CONJ_POINTS[pointId]||['godan','ichidan','suru','kuru','i','na'],words=WORDS.filter(x=>types.includes(x.type));
 const entry=words[wordIndex??0]||words[0],f=form||CONJ_FORM[pointId]||'masu',c=conjugate(entry,f),r=conjugate({...entry,word:entry.reading},f);
 const reading=entry.type==='kuru'&&f!=='dict'?c.reading:r.stem+r.ending;
 return `<section class="gm-widget gm-conj" data-conj><h3>${esc(w.conj)}</h3><p class="gm-cap">${esc(w.conjLead)}</p><div class="gm-word-picks" role="listbox" aria-label="${esc(w.pickWord)}">${words.map((x,i)=>`<button type="button" class="gm-pick${x===entry?' active':''}" data-word="${i}" aria-selected="${x===entry}" lang="ja">${esc(x.word)}</button>`).join('')}</div>
<div class="gm-conj-stage" aria-live="polite"><p class="gm-conj-word" lang="ja"><span class="gm-stem">${esc(c.stem)}</span><span class="gm-ending">${esc(c.ending)}</span></p><p class="gm-conj-reading" lang="ja">${esc(reading)}</p><p class="gm-cap gm-conj-rule">${esc(c.rule||entry.zh)}${entry.note?` · ${esc(entry.note)}`:''}</p></div>
<div class="gm-forms" role="tablist">${FORMS.map(x=>`<button type="button" role="tab" class="gm-form-btn${x===f?' active':''}" data-form="${x}" aria-selected="${x===f}">${esc(loc(FORM_LABEL[x],locale))}</button>`).join('')}</div></section>`;
}
export function particleHTML(point,real,{locale,esc}){
 const w=grammarMessages[locale]||grammarMessages.zh,gaps=particleGaps(point,real);if(!gaps.length)return '';
 return `<section class="gm-widget gm-particles" data-particles><h3>${esc(w.particles)}</h3><p class="gm-cap">${esc(w.particlesLead)}</p><div class="gm-palette">${PARTICLES.map(p=>`<button type="button" class="gm-tile" draggable="true" data-tile="${p}" lang="ja">${p}</button>`).join('')}</div>
<ol class="gm-gaps">${gaps.map((q,i)=>{const c=[...q.text];return `<li class="gm-gap-line" data-gap="${i}"><p class="gm-ja" lang="ja">${esc(c.slice(0,q.blankStart).join(''))}<button type="button" class="gm-slot" data-slot="${i}" aria-label="${esc(w.placeHere)}">＿</button>${esc(c.slice(q.blankEnd).join(''))}</p><p class="gm-tr gm-gap-tr" hidden>${esc(q.translation||'')}</p><p class="gm-cap gm-gap-msg" aria-live="polite"></p>${sourceLabel(q,w,locale)?`<p class="gm-cap">${esc(sourceLabel(q,w,locale))}</p>`:''}</li>`;}).join('')}</ol></section>`;
}
export function lessonHTML(point,data,{locale,esc}){
 const w=grammarMessages[locale]||grammarMessages.zh,real=data?.examples?.[point.id]||[],r=data?.progress?.[point.id]||{};
 const nodes=(POINT_NODES[point.id]||[]).map(id=>MAP.find(n=>n.id===id)).filter(Boolean);
 const form=`<table class="gm-form"><tbody>${point.form.map(([a,b])=>`<tr><th>${esc(a)}</th><td lang="ja">${esc(b)}</td></tr>`).join('')}</tbody></table>`;
 const uses=`<ol class="gm-uses">${point.uses.map(u=>`<li><p>${esc(u.t)}</p><p class="gm-ja" lang="ja">${esc(u.ja)}</p><p class="gm-tr">${esc(u.zh)}</p></li>`).join('')}</ol>`;
 const examples=real.length?`<h3>${esc(w.fromGames)}</h3><ul class="gm-examples">${real.map((e,i)=>exampleHTML(e,i,{w,esc,locale,pointId:point.id})).join('')}</ul>`:`<h3>${esc(w.builtin)}</h3><p class="gm-cap">${esc(w.builtinHelp)}</p><ul class="gm-examples">${builtinExamples(point).map((e,i)=>exampleHTML(e,i,{w,esc,locale,pointId:point.id,anki:false})).join('')}</ul>`;
 const widget=CONJ_POINTS[point.id]?conjHTML(point.id,{locale,esc}):point.group==='particle'?particleHTML(point,real,{locale,esc}):'';
 return `<button type="button" class="gm-link gm-back" data-back>${esc(w.back)}</button><article class="gm-lesson"><header><div class="gm-onmap"><span class="gm-cap">${esc(w.onMap)}</span>${nodes.map((n,i)=>`<button type="button" class="gm-chip${i?' side':' lit'}" data-map="${n.id}">${esc(n.no)} · ${esc(loc(n.title,locale))}</button>`).join('')}</div><h2>${esc(loc(point.title,locale))}</h2><p class="gm-gist">${esc(loc(point.gist,locale))}</p></header>
<section><h3>${esc(w.form)}</h3>${form}</section><section><h3>${esc(w.uses)}</h3>${uses}</section>${widget}<section><h3>${esc(w.pitfalls)}</h3><ul class="gm-pitfalls">${point.pitfalls.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></section>
<section>${examples}</section><section class="gm-practice"><h3>${esc(w.practice)}</h3><div data-quiz aria-live="polite"></div></section>
<div class="gm-actions"><button type="button" class="${r.learned?'secondary':'primary'}" data-learned="${r.learned?'0':'1'}">${esc(r.learned?w.unmark:w.markDone)}</button></div></article>`;
}
export function quizHTML(point,q,{locale,esc,answered=null,index=0,total=1,retry=false}){
 const w=grammarMessages[locale]||grammarMessages.zh,c=[...q.text],ok=answered===q.answer,blank=`<span class="gm-blank${answered==null?'':ok?' ok':' bad'}">${answered==null?'＿＿':esc(q.answer)}</span>`;
 const line=esc(c.slice(0,q.blankStart).join(''))+blank+esc(c.slice(q.blankEnd).join(''));
 const src=sourceLabel(q,w,locale);
 const verdict=answered==null?'':ok?`<div class="gm-verdict ok"><b>${esc(w.right)}</b><p>${esc(loc(point.gist,locale))}</p>${q.translation?`<p class="gm-tr">${esc(q.translation)}</p>`:''}<button type="button" class="primary" data-next>${esc(w.next)}</button></div>`
  :`<div class="gm-verdict bad"><b>${esc(`${w.wrong}「${q.answer}」`)}</b><p class="gm-cap">${esc(w.correctForm)}</p><table class="gm-form gm-form-mini"><tbody>${point.form.slice(0,3).map(([a,b])=>`<tr><th>${esc(a)}</th><td lang="ja">${esc(b)}</td></tr>`).join('')}</tbody></table>${point.pitfalls[0]?`<p class="gm-cap">${esc(point.pitfalls[0])}</p>`:''}${q.translation?`<p class="gm-tr">${esc(q.translation)}</p>`:''}<button type="button" class="primary" data-retry>${esc(w.retry)}</button></div>`;
 return `<p class="gm-cap">${esc(w.check)} · ${index+1}/${total}${retry?' · '+esc(w.retry):''}</p><p class="gm-ja gm-q" lang="ja">${line}</p>${src?`<p class="gm-cap">${esc(src)}</p>`:''}<div class="gm-choices">${q.choices.map(ch=>`<button type="button" class="gm-choice${answered!=null&&ch===q.answer?' right':''}${answered===ch&&!ok?' wrong':''}" data-choice="${esc(ch)}"${answered!=null?' disabled':''} lang="ja">${esc(ch)}</button>`).join('')}</div>${verdict}`;
}
export function completion(prog){let learned=0,attempts=0,correct=0;for(const p of N5){const r=prog?.[p.id];if(r?.learned)learned++;attempts+=r?.attempts||0;correct+=r?.correct||0;}return {learned,total:N5.length,share:learned/N5.length,accuracy:attempts?correct/attempts:null};}
/* ---- page ---- */
export async function mountGrammar(target,{api,locale,esc,toast,isCurrent=()=>true}){
 const w=grammarMessages[locale]||grammarMessages.zh;let data=null,level='N5',view='list',point=null,openNode='',timer=0,audio=null;
 const root=document.createElement('div');root.className='gm-page';target.replaceChildren(root);
 const load=async(count=true)=>{clearTimeout(timer);try{const next=await api('grammar_report',{count});if(!isCurrent())return;data=next;if(view==='list'||view==='map')render();if(next.pending&&next.counting&&count)timer=setTimeout(()=>{if(isCurrent())load(true);},2000);}catch(error){if(isCurrent()&&!data){data={};render();toast?.(String(error?.message||error));}}};
 const enter=()=>{if(!motion())return;root.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});};
 const go=next=>{view=next;render();enter();root.scrollIntoView?.({block:'start'});};
 function render(){if(view==='lesson'&&point)return renderLesson();if(view==='map')return renderMap();
  root.innerHTML=listHTML(data,{locale,esc,level});
  root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{level=b.dataset.level;render();});
  root.querySelector('[data-map]')?.addEventListener('click',()=>{openNode='';go('map');});
  root.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>{point=pointById(b.dataset.point);go('lesson');});}
 function renderMap(){
  root.innerHTML=mapHTML(data,{locale,esc,open:openNode});
  root.querySelector('[data-back]').onclick=()=>go('list');
  root.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{openNode=openNode===b.dataset.toggle?'':b.dataset.toggle;renderMap();const body=root.querySelector('.gm-node.open .gm-node-body');if(body&&motion())body.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:200,easing:'ease-out'});});
  root.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>{point=pointById(b.dataset.point);go('lesson');});
  const focus=root.querySelector('.gm-node.open');if(focus){focus.scrollIntoView?.({block:'nearest'});if(motion())focus.animate([{boxShadow:'0 0 0 0 transparent'},{boxShadow:'0 0 0 3px color-mix(in srgb,var(--g-gold,#edb56e) 35%,transparent)'},{boxShadow:'0 0 0 0 transparent'}],{duration:900,easing:'ease-out'});}
 }
 /* tap or hover the highlighted grammar → a small explanation */
 function explain(mark){
  root.querySelector('.gm-pop')?.remove();const p=pointById(mark.dataset.explain);if(!p)return;
  const pop=document.createElement('div');pop.className='gm-pop';pop.setAttribute('role','dialog');pop.innerHTML=`<b>${esc(loc(p.title,locale))}</b><p>${esc(loc(p.gist,locale))}</p><p class="gm-cap" lang="ja">${esc(p.form[0][0])} · ${esc(p.form[0][1])}</p>`;
  const host=mark.closest('.gm-ex')||mark.parentElement;host.style.position='relative';host.appendChild(pop);
  const a=mark.getBoundingClientRect(),h=host.getBoundingClientRect();pop.style.left=Math.max(0,Math.min(a.left-h.left,h.width-260))+'px';pop.style.top=(a.bottom-h.top+6)+'px';
  if(motion())pop.animate([{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'none'}],{duration:150,easing:'ease-out'});
 }
 async function speak(text,button){button.disabled=true;try{const r=await api('speech_preview',{text:String(text).slice(0,200)});audio?.pause();audio=new Audio(URL.createObjectURL(new Blob([Uint8Array.from(atob(r.data),c=>c.charCodeAt(0))],{type:'audio/wav'})));await audio.play();}catch{toast?.(w.speakFail);}finally{button.disabled=false;}}
 function bindConj(){const box=root.querySelector('[data-conj]');if(!box)return;let wordIndex=0,form=CONJ_FORM[point.id]||'masu';
  const redraw=(animate)=>{const box=root.querySelector('[data-conj]');if(!box)return;const old=box.querySelector('.gm-ending')?.textContent;box.outerHTML=conjHTML(point.id,{locale,esc,wordIndex,form});const next=root.querySelector('[data-conj]');bindConjButtons(next);
   const end=next.querySelector('.gm-ending');if(animate&&motion()&&end&&end.textContent!==old)end.animate([{opacity:0,transform:'translateY(.4em)',filter:'blur(2px)'},{opacity:1,transform:'none',filter:'none'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});};
  const bindConjButtons=b=>{b.querySelectorAll('[data-word]').forEach(x=>x.onclick=()=>{wordIndex=Number(x.dataset.word);redraw(true);});b.querySelectorAll('[data-form]').forEach(x=>x.onclick=()=>{form=x.dataset.form;redraw(true);});};
  bindConjButtons(box);}
 function bindParticles(real){const box=root.querySelector('[data-particles]');if(!box)return;const gaps=particleGaps(point,real);let held=null;
  const tiles=box.querySelectorAll('[data-tile]');
  const hold=t=>{held=t;tiles.forEach(x=>x.classList.toggle('held',x.dataset.tile===t));};
  const place=(slot,t)=>{const i=Number(slot.dataset.slot),q=gaps[i],line=slot.closest('.gm-gap-line'),msg=line.querySelector('.gm-gap-msg');if(!q||line.classList.contains('done'))return;
   if(t===q.answer){slot.textContent=t;slot.disabled=true;line.classList.add('done');line.querySelector('.gm-gap-tr').hidden=!q.translation;msg.textContent=w.lit;if(motion())line.animate([{backgroundColor:'color-mix(in srgb,var(--g-gold,#edb56e) 22%,transparent)'},{backgroundColor:'transparent'}],{duration:900,easing:'ease-out'});}
   else{const other=pointById(PARTICLE_POINT[t]);msg.textContent=w.notHere+`「${t}」`+(other?' —— '+loc(other.gist,locale):'');if(motion())slot.animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:240});}
   hold(null);};
  tiles.forEach(t=>{t.onclick=()=>hold(held===t.dataset.tile?null:t.dataset.tile);t.ondragstart=e=>{e.dataTransfer?.setData('text/plain',t.dataset.tile);hold(t.dataset.tile);};});
  box.querySelectorAll('[data-slot]').forEach(s=>{s.onclick=()=>{if(held)place(s,held);};s.ondragover=e=>{e.preventDefault();s.classList.add('over');};s.ondragleave=()=>s.classList.remove('over');s.ondrop=e=>{e.preventDefault();s.classList.remove('over');place(s,e.dataTransfer?.getData('text/plain')||held);};});}
 function renderLesson(){
  root.innerHTML=lessonHTML(point,data,{locale,esc});const real=data?.examples?.[point.id]||[];
  root.querySelector('[data-back]').onclick=()=>go('list');
  root.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>{openNode=b.dataset.map;go('map');});
  root.querySelector('[data-learned]').onclick=async event=>{const on=event.currentTarget.dataset.learned==='1';try{const r=await api('grammar_learned',{point:point.id,learned:on});data.progress={...data.progress,[point.id]:r};data.completion=completion(data.progress);renderLesson();}catch(error){toast?.(String(error?.message||error));}};
  root.querySelectorAll('[data-anki]').forEach(b=>b.onclick=async()=>{const e=real[Number(b.dataset.anki)];b.disabled=true;try{await api('grammar_anki',{point:point.id,title:loc(point.title,'zh'),gist:loc(point.gist,'zh'),example:e});b.textContent=w.ankiDone;}catch{b.disabled=false;toast?.(w.ankiFail);}});
  root.querySelectorAll('[data-speak]').forEach(b=>b.onclick=()=>speak(b.dataset.speak,b));
  root.querySelectorAll('[data-explain]').forEach(m=>{m.onclick=e=>{e.stopPropagation();explain(m);};m.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();explain(m);}};m.onmouseenter=()=>explain(m);m.onmouseleave=()=>setTimeout(()=>{if(!root.querySelector('.gm-pop:hover'))root.querySelector('.gm-pop')?.remove();},120);});
  root.onclick=e=>{if(!e.target.closest('.gm-pop,[data-explain]'))root.querySelector('.gm-pop')?.remove();};
  bindConj();bindParticles(real);
  /* practice: a wrong answer shows how it attaches, then another line of the same kind */
  const pool=exercisesFor(point,real,10);let order=pool.slice(0,4),rest=pool.slice(4),i=0,answered=null,retry=false;const box=root.querySelector('[data-quiz]');
  const draw=()=>{if(!order.length){box.innerHTML=`<p class="gm-cap">${esc(w.finished)}</p>`;return;}box.innerHTML=quizHTML(point,order[i],{locale,esc,answered,index:i,total:order.length,retry});
   box.querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{if(answered!=null)return;answered=b.dataset.choice;draw();const blank=box.querySelector('.gm-blank');if(blank&&motion())blank.animate(answered===order[i].answer?[{transform:'scale(1.15)'},{transform:'none'}]:[{transform:'translateX(-3px)'},{transform:'translateX(3px)'},{transform:'none'}],{duration:220});try{const r=await api('grammar_answer',{point:point.id,correct:answered===order[i].answer});data.progress={...data.progress,[point.id]:r};data.completion=completion(data.progress);}catch{}});
   box.querySelector('[data-next]')?.addEventListener('click',()=>{answered=null;retry=false;i=(i+1)%order.length;draw();});
   box.querySelector('[data-retry]')?.addEventListener('click',()=>{const missed=order[i],next=rest.shift()||order.find((q,k)=>k!==i&&q.text!==missed.text)||missed;rest.push(missed);order.splice(i+1,0,next);answered=null;retry=true;i=i+1;draw();});};
  draw();
 }
 root.innerHTML=`<p class="gm-cap gm-status">${esc(w.counting)}</p>`;
 await load(true);
 return ()=>clearTimeout(timer);
}
