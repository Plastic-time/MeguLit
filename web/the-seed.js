// SPDX-License-Identifier: GPL-3.0-or-later
/* The Seed (传火计划): one pure-data seed per game version, shared by everyone who plays. One copy of the words, used by the
   home banner, the About section and the intro dialog. Reading seeds, the automatic upload and hot updates ship with the next
   big version, so the copy says "coming" and never "works now". The counts come from web/the-seed-stats.json (tools/gen-seed-stats.cjs). */
export const SEED_URL='https://github.com/ilynthn/MeguLit/tree/main/The%20Seed';
const W={
 zh:{name:'The Seed · 传火计划',kicker:'传火计划',pill:'The Seed',line:'每部游戏一颗几 KB 的种子，玩过的人播下，下一个人直接开花',
  lead:'一个人留下的种子，交给所有人自由传开，长出无数个世界',
  homage:'名字致敬《刀剑神域》里的 The Seed，做法致敬当年大家在论坛上一行一行分享的 Textractor 钩子码',
  points:[['几 KB 的纯数据','每部游戏、每个版本一颗：文本框在哪、怎么藏原文、选项和按钮怎么认、注音和译文怎么排。只有哈希、公开编号和设置，没有代码，没有本机路径和个人信息'],
   ['游戏之间互不影响','改哪部只动哪部；已经能用的效果会被钉住，以后怎么更新都不会被带坏'],
   ['认得出不同版本','按 exe、封包、剧本指纹、Steam / VNDB 编号多级识别，补丁版、汉化版、重发版都能找到自己的种子'],
   ['坏了会自己退','运行时一直自检，丢句、没选项、原文没藏住就退回读模式并自动上报'],
   ['默认共享运行样本','只用来改进种子，不含个人信息；上线后可以在设置里关掉']],
  soon:'读取种子、自动回传和热更新随下一个大版本上线，现在先把第一批种子公开在 GitHub 上',
  count:(g,v)=>`已公开 ${g} 部游戏、${v} 个版本的种子`,github:'在 GitHub 查看种子',more:'了解更多',close:'关闭',openAria:'打开 The Seed 介绍'},
 en:{name:'The Seed',kicker:'Project Spark',pill:'The Seed',line:'One small seed per game. Whoever plays plants it; the next player opens a game already tuned',
  lead:'One person leaves a seed, everyone is free to carry it on, and countless worlds grow',
  homage:'The name is a nod to The Seed in Sword Art Online; the way of working is a nod to the Textractor hook codes people used to swap line by line on forums',
  points:[['A few KB of plain data','One per game version: where the text box is, how to hide the original, how choices and buttons are recognised, how furigana and translation are laid out. Only hashes, public IDs and settings: no code, no local paths, no personal data'],
   ['Games never affect each other','A fix for one game touches only that game; effects that already work are pinned, so later updates cannot break them'],
   ['It tells versions apart','Matched by exe, archive, script fingerprint and Steam / VNDB ID, so patched, fan-translated and re-released builds each find their own seed'],
   ['If it breaks, it steps back','MeguLit keeps checking itself; dropped lines, missing choices or an original that is not hidden send it back to reading mode and report automatically'],
   ['Run samples are shared by default','Used only to improve seeds, with no personal data; once it ships you can turn it off in Settings']],
  soon:'Reading seeds, the automatic upload and hot updates arrive with the next big version; the first seeds are public on GitHub now',
  count:(g,v)=>`${g} games and ${v} versions have a public seed`,github:'See the seeds on GitHub',more:'Learn more',close:'Close',openAria:'Open the introduction to The Seed'},
 ja:{name:'The Seed · 伝火計画',kicker:'伝火計画',pill:'The Seed',line:'ゲームごとの小さな種。遊んだ人が蒔き、次の人はそのまま咲いた状態で遊べる',
  lead:'一人が残した種を、みんなの手で自由に広げ、数えきれない世界を育てる',
  homage:'名前は『ソードアート・オンライン』の The Seed へのオマージュ、やり方はかつて皆が掲示板で一行ずつ共有した Textractor のフックコードへのオマージュです',
  points:[['数 KB のデータだけ','ゲームのバージョンごとに一つ：テキストボックスの位置、原文の隠し方、選択肢やボタンの見分け方、ふりがなと訳文の並べ方。ハッシュ、公開 ID、設定だけで、コードも PC のパスも個人情報も入りません'],
   ['ゲーム同士は影響しない','直すのはそのゲームだけ。すでに動いている効果は固定され、今後の更新で壊れません'],
   ['バージョンを見分ける','exe、アーカイブ、スクリプトの指紋、Steam / VNDB の ID で判別し、パッチ版・翻訳版・再販版もそれぞれの種を見つけます'],
   ['壊れたら自分で退く','常に自己点検し、行の欠落・選択肢なし・原文が隠れていない場合は読み取りモードに戻って自動で報告します'],
   ['実行サンプルは既定で共有','種の改善にだけ使い、個人情報は含みません。公開後は設定でオフにできます']],
  soon:'種の読み込み・自動送信・ホットアップデートは次の大型バージョンで公開します。最初の種は今 GitHub で公開中です',
  count:(g,v)=>`${g} 本のゲーム、${v} バージョン分の種を公開中`,github:'GitHub で種を見る',more:'詳しく見る',close:'閉じる',openAria:'The Seed の紹介を開く'}
};
export const seedWords=locale=>W[locale]||W.zh;
let stats=null;
export const seedStats=()=>stats||(stats=fetch('the-seed-stats.json').then(r=>r.json()).catch(()=>({games:0,versions:0})));
const ASSET='assets/the-seed-egg.webp';
/* zh uses the banner picture as is; other languages get the egg and the title in their own language */
const heroHTML=(locale,esc)=>locale==='zh'||!W[locale]?`<div class="seed-hero"><img src="assets/the-seed-banner.webp" alt="" loading="lazy"></div>`:`<div class="seed-hero live"><img src="${ASSET}" alt=""><span class="seed-live"><b>The Seed</b><em>${esc(W[locale].kicker)}</em></span></div>`;
/* the home banner: the egg from the banner picture plus live text in the reader's language; the whole thing is one button */
export function seedBannerHTML(locale,esc){
 const t=seedWords(locale);
 return `<button type="button" class="seed-banner" data-seed-open aria-label="${esc(t.openAria)}"><span class="seed-pic" aria-hidden="true"><img src="${ASSET}" alt=""></span><span class="seed-txt"><b>${esc(t.pill)}</b><em>${esc(t.kicker)}</em><small>${esc(t.line)}</small></span><i class="seed-go" aria-hidden="true">→</i></button>`;
}
/* the intro body shared by the About section and the dialog */
export function seedBodyHTML(locale,esc){
 const t=seedWords(locale);
 return `<p class="seed-lead">${esc(t.lead)}</p><p class="seed-homage">${esc(t.homage)}</p>
  <dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
  <p class="seed-soon">${esc(t.soon)}</p>`;
}
const countText=(locale,s)=>s&&s.games?seedWords(locale).count(s.games,s.versions):'';
/* the About section: "band" is a full-width block under the three columns, "col" a compact block at the top of the middle column with the five points folded away */
export function seedAboutHTML(locale,esc,mode='band'){
 const t=seedWords(locale),col=mode==='col';
 const points=`<dl class="seed-points">${t.points.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
 const head=`<p class="seed-lead">${esc(t.lead)}</p><p class="seed-homage">${esc(t.homage)}</p>`;
 const foot=`<p class="seed-soon">${esc(t.soon)}</p><p class="seed-count" data-seed-count></p><button type="button" class="seed-link" data-open="${SEED_URL}">${esc(t.github)}<i aria-hidden="true">↗</i></button>`;
 if(col)return `<section class="ab-sec ab-seed" data-mode="col"><h2>${esc(t.name)}</h2>${heroHTML(locale,esc)}${head}<details class="seed-fold"><summary>${esc(t.more)}</summary>${points}</details>${foot}</section>`;
 return `<section class="ab-sec ab-seed" data-mode="band"><h2>${esc(t.name)}</h2>
  <div class="seed-band"><div class="seed-band-l">${heroHTML(locale,esc)}${head}</div>
  <div class="seed-band-r">${points}${foot}</div></div></section>`;
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
 dialog.innerHTML=`${heroHTML(locale,esc)}<div class="seed-panel-body"><h2>${esc(t.name)}</h2>${seedBodyHTML(locale,esc)}
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
