// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed (传火计划): one pure-data seed per game version, shared by everyone who plays. One copy of the words, used by the
   home banner, the About section and the intro dialog. Reading seeds, the automatic upload and hot updates ship with the next
   big version, so the copy says "coming" and never "works now". The counts come from web/the-seed-stats.json (tools/gen-seed-stats.cjs). */
export const SEED_URL='https://github.com/ilynthn/MeguLit/tree/main/The%20Seed';
const W={
 zh:{name:'The Seed · 传火计划',kicker:'传火计划',line:'每部游戏一份几 KB 的差分，玩过的人播下，下一个人直接开花',
  lead:'以前我们一直想用一套通用术式适配所有游戏，结果修好一个，另一个的魔力回路就炸了，来回七八遍都没收拾干净',
  lead2:'所以换个做法：MeguLit 的内核和各引擎的画字函数管大框架，每个游戏、每个版本单独一份差分，这就是 The Seed',
  homage:'名字致敬《刀剑神域》里的 The Seed；共享的思路致敬当年大家在论坛上互相贴的 Textractor 钩子码',
  points:[['几 KB 的纯数据','没有代码，也不会带你电脑上的路径和个人信息'],
   ['互不打扰','每个游戏只动自己那份。做好了的就是做好了，以后更新也不会被连累'],
   ['认得出版本','认 exe、封包、剧本指纹、Steam / VNDB 编号，补丁版、汉化版、不同发行版都能找到自己那颗'],
   ['坏了先退一步','玩的时候一直在自检，丢句、没选项、原文没藏住就先退回读模式并上报，我们把那份差分修好，热更新送到大家手上'],
   ['默认共享运行样本','只用来修差分，不含个人信息；上线后可以在设置里关掉']],
  soon:'读取、自动回传和热更新会在下一个大版本解封，现在先把第一批种子放在 GitHub 上',
  count:(g,v)=>`已种下 ${g} 部游戏、${v} 个版本`,github:'去 GitHub 看看',close:'关闭',openAria:'打开 The Seed 介绍'},
 en:{name:'The Seed',kicker:'Project Spark',line:'One small diff per game. Whoever plays plants it; the next player opens a tuned game',
  lead:"For a long time we tried to fit every game with one universal spell. Fix one game and another one's magic circuit blew up; seven or eight rounds later it still was not sorted out",
  lead2:"So we changed the approach: MeguLit's core and each engine's text-drawing code handle the big picture, and every game, every version gets its own diff. That is The Seed",
  homage:'The name is a nod to The Seed in Sword Art Online; the sharing idea is a nod to the Textractor hook codes people used to post for each other on forums',
  points:[['A few KB of plain data','No code, and nothing from your PC: no paths, no personal info'],
   ['No one disturbs anyone','Each game only touches its own diff. What works stays working, and later updates will not break it'],
   ['Knows the version','Matches the exe, archive, script fingerprint and Steam / VNDB ID, so patched, fan-translated and other releases each find their own seed'],
   ['If it breaks, it steps back','It checks itself while you play; dropped lines, missing choices or an original that is not hidden send it back to reading mode and report. We fix that diff and a hot update brings it to everyone'],
   ['Run samples shared by default','Used only to fix diffs, no personal info; once it ships you can turn it off in Settings']],
  soon:'Reading, the automatic upload and hot updates unlock with the next big version; the first seeds are on GitHub now',
  count:(g,v)=>`${g} games, ${v} versions planted`,github:'See it on GitHub',close:'Close',openAria:'Open the introduction to The Seed'},
 ja:{name:'The Seed · 伝火計画',kicker:'伝火計画',line:'ゲームごとの数 KB の差分。遊んだ人が蒔き、次の人はそのまま咲いた状態で遊べる',
  lead:'これまでは一つの汎用の術式で全部のゲームに合わせようとしていました。でも一本直すと別の一本の魔力回路が吹き飛んで、七、八回繰り返しても収拾がつきませんでした',
  lead2:'そこでやり方を変えました。MeguLit のコアと各エンジンの描画関数が大枠を担当し、ゲームごと・バージョンごとに差分を一つ持ちます。これが The Seed です',
  homage:'名前は『ソードアート・オンライン』の The Seed から。共有の発想は、かつて皆が掲示板で貼り合った Textractor のフックコードへのオマージュです',
  points:[['数 KB のデータだけ','コードはなく、PC のパスや個人情報も入りません'],
   ['お互いに干渉しない','各ゲームは自分の差分だけを触ります。動いているものは動いたまま、今後の更新でも壊れません'],
   ['バージョンを見分ける','exe、アーカイブ、スクリプトの指紋、Steam / VNDB の ID で判別し、パッチ版・翻訳版・別の販売版もそれぞれの種を見つけます'],
   ['壊れたら一歩退く','遊んでいる間ずっと自己点検し、行の欠落・選択肢なし・原文が隠れていない場合は読み取りモードに戻って報告します。差分を直し、ホットアップデートで皆さんに届けます'],
   ['実行サンプルは既定で共有','差分の修正にだけ使い、個人情報は含みません。公開後は設定でオフにできます']],
  soon:'読み込み・自動送信・ホットアップデートは次の大型バージョンで解禁します。最初の種は今 GitHub にあります',
  count:(g,v)=>`${g} 本のゲーム、${v} バージョン分を種まき済み`,github:'GitHub で見る',close:'閉じる',openAria:'The Seed の紹介を開く'}
};
export const seedWords=locale=>W[locale]||W.zh;
let stats=null;
export const seedStats=()=>stats||(stats=fetch('the-seed-stats.json').then(r=>r.json()).catch(()=>({games:0,versions:0})));
const ASSET='assets/the-seed-egg.webp';
const heroHTML=()=>`<div class="seed-hero"><img src="assets/the-seed-banner.webp" alt="" loading="lazy"></div>`;
/* the home banner: the egg from the banner picture plus live text in the reader's language; the whole thing is one button */
export function seedBannerHTML(locale,esc){
 const t=seedWords(locale);
 return `<button type="button" class="seed-banner" data-seed-open aria-label="${esc(t.openAria)}"><span class="seed-pic" aria-hidden="true"><img src="${ASSET}" alt=""></span><span class="seed-txt"><b>The Seed</b><em>${esc(t.kicker)}</em><small>${esc(t.line)}</small></span><i class="seed-go" aria-hidden="true">→</i></button>`;
}
/* the intro body shared by the About section and the dialog; the nod to Sword Art Online and Textractor lives only at the bottom of About */
export function seedBodyHTML(locale,esc){
 const t=seedWords(locale);
 return `<p class="seed-lead">${esc(t.lead)}</p><p class="seed-lead2">${esc(t.lead2)}</p>
  <dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <p class="seed-soon">${esc(t.soon)}</p>`;
}
const countText=(locale,s)=>s&&s.games?seedWords(locale).count(s.games,s.versions):'';
/* the About section: a full-width band under the three columns; the nod sits last, small */
export function seedAboutHTML(locale,esc){
 const t=seedWords(locale);
 const points=`<dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
 return `<section class="ab-sec ab-seed"><h2>${esc(t.name)}</h2>
  <div class="seed-band"><div class="seed-band-l">${heroHTML()}<p class="seed-lead">${esc(t.lead)}</p><p class="seed-lead2">${esc(t.lead2)}</p></div>
  <div class="seed-band-r">${points}<p class="seed-soon">${esc(t.soon)}</p><p class="seed-count" data-seed-count></p><button type="button" class="seed-link" data-open="${SEED_URL}">${esc(t.github)}<i aria-hidden="true">↗</i></button></div></div>
  <p class="seed-homage">${esc(t.homage)}</p></section>`;
}
export function fillSeedCount(root,locale){
 const el=root.querySelector('[data-seed-count]');if(!el)return;
 seedStats().then(s=>{const text=countText(locale,s);el.textContent=text;el.hidden=!text;});
}
/* the short dialog behind the home banner */
export function openSeedDialog({api,locale,esc,toast}){
 document.querySelector('dialog.seed-panel')?.close();
 const t=seedWords(locale),dialog=document.createElement('dialog');
 dialog.className='game-dialog seed-panel';
 dialog.innerHTML=`${heroHTML()}<div class="seed-panel-body"><h2>${esc(t.name)}</h2>${seedBodyHTML(locale,esc)}
  <p class="seed-count" data-seed-count></p>
  <div class="seed-actions"><button type="button" class="secondary" data-seed-github>${esc(t.github)} ↗</button><button type="button" class="primary" data-seed-close>${esc(t.close)}</button></div></div>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 fillSeedCount(dialog,locale);
 dialog.querySelector('[data-seed-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-seed-github]').onclick=()=>api('open_source',{url:SEED_URL}).catch(()=>toast&&toast('…'));
 dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
 dialog.showModal();
}
