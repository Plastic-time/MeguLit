/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: index (学习主页). 2026-11-11 rebuilt from scratch in the megu-edit look (user: 推翻现有排版，
   全部重新设计; 假名游戏 merged in): a HUD strip, a black stage with the lesson to continue, a lesson rail, the kana board
   as the centre (click a kana: hear it, set 未学/见过/熟悉/掌握), the three practice games inline, review and kanji. */
export function view(el,ctx){
const {store:S,data:D}=ctx,KEY=S.KEY;
const m=S.get(KEY.m,{}),boxes=S.get(KEY.b,{}),runs=S.get(KEY.r,[]),lessons=S.get(KEY.l,{}),now=Date.now();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lv=k=>m[k]||0;
const LV=['未学','见过','熟悉','掌握'];
const seionH=D.SEION_LIST,known=seionH.filter(k=>lv(k)>=2).length;
const next=D.LESSONS.find(l=>!lessons[l.id])||D.LESSONS[0],started=Object.keys(lessons).length>0;
const nextUnknown=next.kana.find(k=>lv(k)<2)||next.kana[0];
const confuseIn=next.kana.map(k=>D.confusables(k)).find(Boolean);
const due=Object.entries(boxes).filter(([,v])=>v.due<=now).map(([k])=>k);
const week=runs.filter(r=>now-r.id<7*S.DAY),qWeek=week.reduce((s,r)=>s+r.log.length,0);
const tWeek=week.flatMap(r=>r.log.map(l=>l.t)),avg=tWeek.length?tWeek.reduce((a,b)=>a+b,0)/tWeek.length:0;
const days=new Set(runs.map(r=>new Date(r.id).toDateString()).concat(Object.values(lessons).map(t=>new Date(t).toDateString())));let streak=0;for(const d=new Date();days.has(d.toDateString());d.setDate(d.getDate()-1))streak++;
const bestStreak=week.reduce((b,r)=>Math.max(b,r.best||0),0);
const wk={};week.forEach(r=>r.log.filter(l=>!l.ok).forEach(l=>{wk[l.show]=(wk[l.show]||0)+1;}));
const weak=Object.entries(wk).sort((a,b)=>b[1]-a[1]).slice(0,4);
const bestAcc=runs.filter(r=>!(r.only&&r.only.length)&&r.log.length).reduce((b,r)=>Math.max(b,D.achievement(r.log).pct),0);
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const hira=D.LESSONS.filter(l=>l.id.startsWith('h'));
const grid='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや　ゆ　よらりるれろわ　　　をん';
const GAMES=[['pos','行段识别','き → か行 · い段','看到假名，说出它在哪一行、哪一段'],['seq','前后假名','？き？ → か · く','按五十音顺序，说出前一个和后一个'],['conv','平片转换','か ⇄ カ','平假名和片假名互相认']];
const DIFFS=[['intro','入门'],['std','标准'],['adv','进阶'],['chal','挑战']];

el.className='v-index mg';
el.innerHTML=`<main class="mg-page">
 <header class="mg-hud">
  <span class="mg-tag"><i></i>megulit · kana lab</span>
  <span class="mg-hud-stats"><span><b>${streak}</b>连续天数</span><span><b>${qWeek}</b>本周答题</span><span><b>${avg?avg.toFixed(1)+'s':'—'}</b>平均用时</span><span><b>${bestStreak}</b>最长连对</span></span>
  <span class="mg-tag mg-beta" title="五十音学习还在开发中">beta</span>
 </header>

 <section class="mg-stage" aria-label="继续学习">
  <div class="mg-stage-kana" aria-hidden="true"><span class="mg-ghost">${esc(nextUnknown)}</span><b>${esc(nextUnknown)}</b></div>
  <div class="mg-stage-copy">
   <p class="mg-kicker">${started?'continue':'first lesson'} · ${esc(next.script==='k'?'片假名':next.id.startsWith('d')?'浊音':'平假名')}</p>
   <h1 data-type>${esc(next.title)}</h1>
   <p class="mg-sub">${started?`这一课还有 ${next.kana.filter(k=>lv(k)<2).length} 个假名不熟`:'认识 → 辨认 → 回忆 → 混合，四步学完一行，大约五分钟'}${confuseIn&&confuseIn.tip?` · ${esc(confuseIn.g.join(' / '))} 容易混`:''}</p>
   <div class="mg-row"><button class="mg-cta" data-go="lesson.html?id=${next.id}">${started?'继续':'开始'} <span aria-hidden="true">→</span></button>
    <div class="mg-barcode" aria-label="${known} / ${seionH.length} 已熟悉">${seionH.map(k=>`<i class="${lv(k)>=3?'m3':lv(k)>=2?'m2':''}"></i>`).join('')}</div><small class="mg-num">${String(known).padStart(2,'0')}<em>/${seionH.length}</em></small></div>
  </div>
  <span class="mg-corner tl"></span><span class="mg-corner br"></span>
 </section>

 <nav class="mg-rail" aria-label="课程">${hira.map((l,i)=>{const done=!!lessons[l.id],cur=l.id===next.id;return `<button class="mg-lesson${done?' done':''}${cur?' cur':''}" data-go="lesson.html?id=${l.id}" style="--i:${i}"><em>${ROMAN[i]||i+1}</em><b>${esc(l.kana[0])}</b><small>${esc(l.title)}</small></button>`;}).join('')}<button class="mg-lesson more" data-go="gojuon.html"><em>+</em><b>カ</b><small>片假名 · 浊音 · 拗音</small></button></nav>

 <section class="mg-board">
  <div class="mg-board-grid">
   <header><span class="mg-tag"><i></i>平假名熟悉度</span><span class="mg-legend">${LV.map((t,i)=>`<span><i class="m${i}"></i>${t}</span>`).join('')}</span></header>
   <div class="mastery" role="grid" aria-label="平假名熟悉度，点格子查看">${[...grid].map(c=>c==='　'?'<span class="gap"></span>':`<button type="button" class="m${lv(c)}" data-mk="${c}" title="${c} · ${LV[lv(c)]}" aria-label="${c} ${D.romaOf(c)} ${LV[lv(c)]}">${c}</button>`).join('')}</div>
  </div>
  <aside class="mg-board-side">
   <div class="mk-card" data-mk-card hidden></div>
   <div class="mg-board-empty" data-mk-empty><b>あ</b><p>点左边任意一个假名：听发音、标熟悉度、看笔顺</p></div>
   <div class="mg-voice"></div>
  </aside>
 </section>

 <section class="mg-practice" id="practice" aria-label="练习">
  <header><span class="mg-tag"><i></i>练习 · renshū</span><span class="mg-diffs" role="radiogroup" aria-label="难度">${DIFFS.map(([id,t],i)=>`<button type="button" role="radio" aria-checked="${i===0}" class="${i===0?'on':''}" data-diff="${id}">${t}</button>`).join('')}</span><small class="mg-num">最佳达成率 ${bestAcc?D.fmtPct(bestAcc):'—'}</small></header>
  <div class="mg-games">${GAMES.map(([id,name,sample,desc],i)=>`<button class="mg-game" data-game="${id}" style="--i:${i}"><em>${ROMAN[i]}</em><span class="mg-sample" lang="ja">${esc(sample)}</span><b>${name}</b><small>${desc}</small><span class="mg-go" aria-hidden="true">play →</span></button>`).join('')}</div>
  <button class="mg-link" data-go="games.html">看每种玩法的规则和难度 →</button>
 </section>

 <section class="mg-extra">
  <button class="mg-tile${due.length?' hot':''}" data-go="${due.length?`play.html?g=conv&d=intro&only=${encodeURIComponent(due.join(','))}`:'records.html'}"><em>复习 · fukushū</em><b class="mg-num">${due.length}</b><small>${due.length?'个假名到了复习时间，先复习再学新课':'今天没有到期的假名'}</small></button>
  ${weak.length?`<button class="mg-tile" data-go="play.html?g=conv&d=intro&only=${encodeURIComponent(weak.map(x=>x[0]).join(','))}"><em>薄弱假名</em><b lang="ja">${weak.map(([k])=>esc(k)).join(' ')}</b><small>专项训练这 ${weak.length} 个</small></button>`:''}
  <button class="mg-tile" data-go="gojuon.html"><em>五十音图 · gojūon</em><b lang="ja">あ ア</b><small>平片对照、浊音、拗音、易混对比</small></button>
  <button class="mg-tile" data-go="kanji.html"><em>汉字读音 · kanji</em><b lang="ja">漢</b><small>打开《漢字でGO!》官方网页（Micelle · PLiCy，含广告，需联网）</small></button>
 </section>
</main>`;
el.querySelector('.mg-voice')?.append(ctx.voicePicker({note:false}));

/* practice: pick a difficulty, then a game starts right here (the old 假名游戏 tab) */
let diff='intro';
el.querySelectorAll('[data-diff]').forEach(b=>b.onclick=()=>{diff=b.dataset.diff;el.querySelectorAll('[data-diff]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-checked',String(x===b));});beat(b);});
el.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>{beat(b);ctx.go(`play.html?g=${b.dataset.game}&d=${diff}&s=h`);});

/* megu-edit motion (2026-11-11): focus-pull entrance, the lesson title typed with a ▮ block, the barcode rising,
   single-frame invert + push on a click; only on load or a click, none with reduced motion */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches,EXPO='cubic-bezier(.16,1,.3,1)';
function beat(b){if(calm||!b)return;b.animate([{filter:'invert(1)'},{filter:'invert(1)'},{filter:'none'}],{duration:70,easing:'steps(1,end)'});b.animate([{transform:'scale(1.08)'},{transform:'none'}],{duration:480,easing:EXPO});}
if(!calm){
 el.querySelector('.mg-stage-kana b')?.animate([{filter:'blur(14px)',opacity:0,transform:'scale(1.4) rotate(-6deg)'},{filter:'none',opacity:1,transform:'none'}],{duration:760,easing:EXPO});
 el.querySelector('.mg-ghost')?.animate([{transform:'translate(-40px,0) scale(1.1)',opacity:0},{transform:'none',opacity:.08}],{duration:1100,easing:EXPO,fill:'backwards'});
 el.querySelectorAll('.mg-lesson,.mg-game,.mg-tile,.mg-board>*').forEach((c,i)=>c.animate([{opacity:0,transform:'translateY(18px)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'none'}],{duration:520,delay:160+Math.min(i,16)*40,easing:EXPO,fill:'backwards'}));
 el.querySelectorAll('.mg-barcode i').forEach((b,i)=>b.animate([{transform:'scaleY(0)'},{transform:'none'}],{duration:320,delay:420+i*14,easing:EXPO,fill:'backwards'}));
 el.querySelectorAll('.mastery button').forEach((b,i)=>b.animate([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'none'}],{duration:360,delay:300+i*10,easing:EXPO,fill:'backwards'}));
 const h=el.querySelector('[data-type]');if(h){const c=[...h.textContent];let n=0;h.textContent='▮';const tick=()=>{n++;h.textContent=c.slice(0,n).join('')+(n<c.length?'▮':'');if(n<c.length)setTimeout(tick,45);};setTimeout(tick,260);}
}
/* old 假名游戏 tab links land on the practice block */
if(ctx.params?.focus==='practice'){const p=el.querySelector('#practice');setTimeout(()=>{p?.scrollIntoView?.({block:'start',behavior:calm?'auto':'smooth'});beat(p);},200);}

/* 2026-11-11 (user: the familiarity chart should be usable): a cell opens a card to hear it and set 未学/见过/熟悉/掌握 */
const card=el.querySelector('[data-mk-card]'),empty=el.querySelector('[data-mk-empty]');let open='';
const drawCard=k=>{const l=lv(k),w=D.wordOf?D.wordOf(k):null;card.hidden=false;empty.hidden=true;
 card.innerHTML=`<div class="mk-head"><b class="mk-kana">${esc(k)}</b><div><span class="mk-roma">${esc(D.romaOf(k))}</span><small>${esc(D.toKata(k))}${w&&w[0]?' · '+esc(w[0])+(w[1]?'（'+esc(w[1])+'）':''):''}</small></div><button type="button" class="mk-say" data-mk-say aria-label="发音">▶ 发音</button></div>
<div class="mk-levels" role="radiogroup" aria-label="熟悉度">${LV.map((t,i)=>`<button type="button" role="radio" class="mk-lv l${i}${i===l?' on':''}" aria-checked="${i===l}" data-mk-lv="${i}">${t}</button>`).join('')}</div>
<button type="button" class="mk-go" data-go="gojuon.html?k=${encodeURIComponent(k)}">看笔顺和例词 →</button>`;
 card.querySelector('[data-mk-say]').onclick=()=>ctx.speech.say(k);
 card.querySelectorAll('[data-mk-lv]').forEach(b=>b.onclick=()=>{m[k]=+b.dataset.mkLv;S.put(KEY.m,m);const cell=el.querySelector(`[data-mk="${k}"]`);if(cell){cell.className='m'+m[k]+' sel';cell.title=k+' · '+LV[m[k]];beat(cell);}drawCard(k);});
 if(!calm)card.animate([{opacity:0,filter:'blur(6px)',transform:'translateX(12px)'},{opacity:1,filter:'none',transform:'none'}],{duration:360,easing:EXPO});};
el.querySelectorAll('[data-mk]').forEach(b=>b.onclick=()=>{const k=b.dataset.mk;beat(b);el.querySelectorAll('[data-mk]').forEach(x=>x.classList.toggle('sel',x===b&&open!==k));if(open===k){open='';card.hidden=true;empty.hidden=false;return;}open=k;drawCard(k);ctx.speech.say(k);});
}
