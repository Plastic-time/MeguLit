// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed (传火计划): one pure-data seed per game version, shared by everyone who plays. One copy of the words, used by the
   home banner, the About section and the intro dialog. Reading seeds, the automatic upload and hot updates ship with the next
   big version, so the copy says "coming" and never "works now". The counts come from web/the-seed-stats.json (tools/gen-seed-stats.cjs). */
export const SEED_URL='https://github.com/ilynthn/MeguLit/tree/main/The%20Seed';
const W={
 zh:{name:'The Seed · 传火计划',kicker:'传火计划',line:'每部游戏一份几 KB 的差分',
  lead:'以前想用一套通用术式适配所有游戏，修好一个，另一个的魔力回路就炸了。所以改成每个游戏、每个版本单独一份差分，这就是 The Seed',
  homage:'名字致敬《刀剑神域》里的 The Seed；共享的思路致敬当年大家在论坛上互相贴的 Textractor 钩子码',
  points:[['几 KB 纯数据','没有代码，不带路径和个人信息'],
   ['互不影响','每个游戏只动自己那份，做好的就是做好了'],
   ['认得出版本','认 exe、封包、剧本指纹、Steam / VNDB 编号'],
   ['坏了先退一步','退回读模式并上报，修好后热更新送到大家手上'],
   ['共享运行样本','默认开，只用来修差分，可以在设置里关']],
  soon:'读取、自动回传、热更新下一个大版本上线',next:'下一步：The Seed',tag:'megulit · the seed',
  count:(g,v)=>`已种下 ${g} 部游戏、${v} 个版本`,github:'去 GitHub 看看',close:'关闭',openAria:'打开 The Seed 介绍'},
 en:{name:'The Seed',kicker:'Project Spark',line:'One small diff per game',
  lead:"We used to try fitting every game with one universal spell: fix one game and another one's magic circuit blew up. So now every game, every version gets its own diff. That is The Seed",
  homage:'The name is a nod to The Seed in Sword Art Online; the sharing idea is a nod to the Textractor hook codes people used to post for each other on forums',
  points:[['A few KB of data','No code, no paths, no personal info'],
   ['No cross-talk','Each game only touches its own diff; what works stays working'],
   ['Knows the version','Matches exe, archive, script fingerprint and Steam / VNDB ID'],
   ['Breaks, steps back','Falls back to reading mode and reports; a hot update brings the fix'],
   ['Shared run samples','On by default, used only to fix diffs, can be turned off in Settings']],
  soon:'Reading, automatic upload and hot updates arrive with the next big version',next:'Next: The Seed',tag:'megulit · the seed',
  count:(g,v)=>`${g} games, ${v} versions planted`,github:'See it on GitHub',close:'Close',openAria:'Open the introduction to The Seed'},
 ja:{name:'The Seed · 伝火計画',kicker:'伝火計画',line:'ゲームごとの数 KB の差分',
  lead:'以前は一つの汎用の術式で全部のゲームに合わせようとして、一本直すと別の一本の魔力回路が吹き飛んでいました。そこで、ゲームごと・バージョンごとに差分を一つ持つ形にしました。これが The Seed です',
  homage:'名前は『ソードアート・オンライン』の The Seed から。共有の発想は、かつて皆が掲示板で貼り合った Textractor のフックコードへのオマージュです',
  points:[['数 KB のデータだけ','コードなし、パスも個人情報も入りません'],
   ['お互い干渉しない','各ゲームは自分の差分だけを触り、動いたものは動いたまま'],
   ['バージョンを見分ける','exe、アーカイブ、スクリプトの指紋、Steam / VNDB の ID で判別'],
   ['壊れたら一歩退く','読み取りモードに戻って報告し、直したらホットアップデートで届けます'],
   ['実行サンプルの共有','既定でオン。差分の修正にだけ使い、設定でオフにできます']],
  soon:'読み込み・自動送信・ホットアップデートは次の大型バージョンで公開',next:'次へ：The Seed',tag:'megulit · the seed',
  count:(g,v)=>`${g} 本のゲーム、${v} バージョン分を種まき済み`,github:'GitHub で見る',close:'閉じる',openAria:'The Seed の紹介を開く'}
};
export const seedWords=locale=>W[locale]||W.zh;
let stats=null;
export const seedStats=()=>stats||(stats=fetch('the-seed-stats.json').then(r=>r.json()).catch(()=>({games:0,versions:0})));
const ASSET='assets/the-seed-egg.webp';
const heroHTML=()=>`<div class="seed-hero"><img src="assets/the-seed-banner.webp" alt="" loading="lazy"></div>`;
/* the home entry: a small pill under the top bar, the egg, the name, one line and an arrow; the whole pill is one button */
export function seedBannerHTML(locale,esc){
 const t=seedWords(locale);
 return `<button type="button" class="seed-banner" data-seed-open aria-label="${esc(t.openAria)}"><span class="seed-pic" aria-hidden="true"><img src="${ASSET}" alt=""></span><span class="seed-txt"><b>The Seed</b><small>${esc(t.line)}</small></span><i class="seed-go" aria-hidden="true">→</i></button>`;
}
/* the intro body shared by the About section and the dialog; the nod to Sword Art Online and Textractor lives only at the bottom of About */
export function seedBodyHTML(locale,esc){
 const t=seedWords(locale);
 return `<p class="seed-lead">${esc(t.lead)}</p>
  <dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <p class="seed-soon">${esc(t.soon)}</p>`;
}
const countText=(locale,s)=>s&&s.games?seedWords(locale).count(s.games,s.versions):'';
/* the About section: a full-width band under the three columns, two layouts to pick from (window.__seedLayout 1 or 2); the nod sits last, small */
export function seedAboutHTML(locale,esc){
 const t=seedWords(locale),lay=window.__seedLayout==='2'?'2':'1';
 const points=`<dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
 const foot=`<div class="seed-foot"><span class="seed-soon">${esc(t.soon)}</span><span class="seed-count" data-seed-count></span><button type="button" class="seed-link" data-open="${SEED_URL}">${esc(t.github)}<i aria-hidden="true">↗</i></button></div>`;
 return `<section class="ab-sec ab-seed" data-lay="${lay}"><h2>${esc(t.name)}</h2>
  <div class="seed-band"><div class="seed-band-l">${heroHTML()}</div><div class="seed-band-r"><p class="seed-lead">${esc(t.lead)}</p>${points}</div></div>
  ${foot}
  <p class="seed-homage">${esc(t.homage)}</p></section>`;
}
export function fillSeedCount(root,locale){
 const el=root.querySelector('[data-seed-count]');if(!el)return;
 seedStats().then(s=>{const text=countText(locale,s);el.textContent=text;el.hidden=!text;});
}
/* one page of the start flow (notice, The Seed, tutorial): the same top line, title, scrolling body and button row as the other two */
export function seedPageHTML(locale,esc,{kicker='传火计划',tag='',left='',right=''}={}){
 const t=seedWords(locale);
 return `<div class="dev-notice-top"><span>${esc(t.kicker)}</span><span data-page-no>${esc(tag||t.tag)}</span></div>
 <h2>${esc(t.name)}</h2>
 <div class="dev-notice-scroll seed-scroll">${heroHTML()}${seedBodyHTML(locale,esc)}<p class="seed-count" data-seed-count></p></div>
 <div class="dev-notice-actions">${left}${right}</div>`;
}
export const seedSeen=()=>{try{return localStorage.getItem('megulit.seedIntroSeen')==='1';}catch{return false;}};
export const markSeedSeen=()=>{try{localStorage.setItem('megulit.seedIntroSeen','1');}catch{}};
/* the dialog behind the home pill: same container and button row as the start flow */
export function openSeedDialog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-panel')?.close();
 const t=seedWords(locale),dialog=document.createElement('dialog');
 dialog.className='game-dialog dev-notice seed-flow seed-panel';
 dialog.innerHTML=seedPageHTML(locale,esc,{left:`<button type="button" class="text-button" data-seed-github>${esc(t.github)} ↗</button>`,right:`<button type="button" class="secondary" data-ok>${esc(t.close)}</button>`});
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 fillSeedCount(dialog,locale);markSeedSeen();
 dialog.querySelector('[data-ok]').onclick=()=>dialog.close();
 dialog.querySelector('[data-seed-github]').onclick=()=>api('open_source',{url:SEED_URL}).catch(()=>toast&&toast('…'));
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.showModal();
}
