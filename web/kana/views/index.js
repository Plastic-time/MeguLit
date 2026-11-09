/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: index (学习主页，数据来自本地学习记录) */
export function view(el,ctx){
const {store:S,data:D,go}=ctx,KEY=S.KEY;
const m=S.get(KEY.m,{}),boxes=S.get(KEY.b,{}),runs=S.get(KEY.r,[]),lessons=S.get(KEY.l,{}),now=Date.now();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lv=k=>m[k]||0;
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
const scriptName=next.script==='k'?'片假名':next.id.startsWith('d')?'浊音':'平假名';
const advice=due.length?`今天有 ${due.length} 个假名到了复习时间，先复习再学新课`:started?`学完 ${esc(next.title)} 后，到「行段识别 · 入门」里检验一下`:'从第一课 あ行 开始，每课五个假名，大约五分钟';
const grid='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや　ゆ　よらりるれろわ　　　をん';

el.className='v-index';
el.innerHTML=`<main class="page">
  <section>
    <div class="eyebrow">学习 · 初学之書<span class="kn-beta" title="五十音学习还在开发中，内容和功能会继续完善">Beta · 开发中</span></div>
    <h1>从五十音开始<span class="ja">はじめの一歩</span></h1>
    <p class="lede">先认得每一个假名，再在游戏里读出来。按章节推进，每一章都记得你走到哪里</p>

    <article class="folio">
      <div class="ribbon" aria-hidden="true"></div>
      <div class="folio-kana">${esc(nextUnknown)}</div>
      <div class="folio-body">
        <div class="eyebrow">${started?'继续上次':'第一课'}</div>
        <h2>${esc(next.title)} · ${scriptName}</h2>
        <p>${started?`这一课有 ${next.kana.filter(k=>lv(k)<2).length} 个假名还不熟悉`:'认识 → 辨认 → 回忆 → 混合，四步学完一行'}${confuseIn&&confuseIn.tip?`：${esc(confuseIn.g.join(' / '))} 容易混淆`:''}</p>
        <div class="folio-row">
          <button class="btn" data-go="lesson.html?id=${next.id}">${started?'继续学习':'开始学习'} →</button>
          <div class="bar"><i style="width:${Math.round(known/seionH.length*100)}%"></i></div>
          <small class="num">${known} / ${seionH.length}</small>
        </div>
      </div>
    </article>

    <div class="toc-head"><h3>目录</h3><span>基础 46 音 · 浊音 25 · 拗音 33</span></div>

    <button class="chapter" data-go="gojuon.html">
      <div class="roman">壱</div>
      <div><h4>五十音图<em>Gojūon</em></h4><p>平假名 / 片假名对照，点开每个假名看读音、例词与记忆提示</p>
        <div class="chips"><span class="chip">清音</span><span class="chip">浊音 · 半浊音</span><span class="chip">拗音</span><span class="chip">易混对比</span></div></div>
      <div class="meta"><b class="num">${known} / ${seionH.length}</b>已熟悉</div>
    </button>
    <button class="chapter" data-go="games.html">
      <div class="roman">弐</div>
      <div><h4>练习<em>Renshū</em></h4><p>三种小游戏，四档难度：入门、标准、进阶、挑战</p>
        <div class="chips"><span class="chip">行段识别</span><span class="chip">前后假名</span><span class="chip">平片转换</span></div></div>
      <div class="meta"><b class="num">${bestAcc?D.fmtPct(bestAcc):'—'}</b>最佳达成率</div>
    </button>
    <button class="chapter" data-go="records.html">
      <div class="roman">参</div>
      <div><h4>复习<em>Fukushū</em></h4><p>到期复习、错题再挑战与薄弱假名专项</p></div>
      <div class="meta"><b class="num">${due.length}</b>今日待复习</div>
    </button>
    <button class="chapter" data-go="kanji.html">
      <div class="roman">肆</div>
      <div><h4>汉字读音<em>Kanji</em></h4><p>在 MeguLit 里打开《漢字でGO!》官方网页（作者 Micelle · PLiCy，含广告），需要联网</p>
        <div class="chips"><span class="chip">外部网站</span><span class="chip">plicy.net</span></div></div>
      <div class="meta"><b style="font-size:14px;font-family:var(--sans)">打开 →</b></div>
    </button>
  </section>

  <aside>
    <div class="side">
      <h5>平假名熟悉度</h5>
      <div class="mastery">${[...grid].map(c=>c==='　'?'<span class="gap"></span>':`<span class="m${lv(c)}" title="${c}">${c}</span>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--raise)"></i>未学</span><span><i style="background:var(--raise-2)"></i>见过</span><span><i style="background:color-mix(in srgb,var(--gold-accent,#edb56e) 30%,transparent)"></i>熟悉</span><span><i style="background:var(--accent)"></i>掌握</span></div>
    </div>
    <div class="side">
      <h5>本周</h5>
      <div class="stats">
        <div><b class="num">${streak}</b><span>连续学习天数</span></div>
        <div><b class="num">${qWeek}</b><span>答题数</span></div>
        <div><b class="num">${avg?avg.toFixed(1)+'s':'—'}</b><span>平均答题</span></div>
        <div><b class="num">${bestStreak}</b><span>最长连对</span></div>
      </div>
    </div>
    ${weak.length?`<div class="side">
      <h5>薄弱假名</h5>
      <div class="weak">${weak.map(([k,n])=>`<button data-go="gojuon.html?k=${encodeURIComponent(k)}"><b>${esc(k)}</b><small>${n} 错</small></button>`).join('')}</div>
      <a class="link" href="play.html?g=conv&d=intro&only=${encodeURIComponent(weak.map(x=>x[0]).join(','))}">专项训练这 ${weak.length} 个 →</a>
    </div>`:''}
    <div class="side">
      <h5>下一步建议</h5>
      <div class="seal">${due.length?'復':started?'進':'壱'}</div>
      <p class="note">${advice}</p>
      ${due.length?`<a class="link" href="play.html?g=conv&d=intro&only=${encodeURIComponent(due.join(','))}">开始复习 →</a>`:''}
    </div>
  </aside>
</main>`;
 /* voice choice under the kana chart (user, 2026-11-09) */el.querySelector('.legend')?.after(ctx.voicePicker({note:false}));

}
