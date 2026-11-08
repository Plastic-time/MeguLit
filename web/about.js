// SPDX-License-Identifier: GPL-3.0-or-later
// About page: what MeguLit is, version, links, credits, and the support (sponsor) codes.
export const VERSION='1.0.3';
const REPO='https://github.com/ilynthn/MeguLit';
const SPONSOR='https://github.com/sponsors/ilynthn';
export const aboutLabel={zh:'关于',en:'About',ja:'について'};
const w={
 zh:{tag:'Read the game, keep the game.',intro:'在 Galgame 里读日语的小魔导书 ✦\n点一下就查词，读完顺手做成 Anki 卡片，爆裂魔法级的学习效率！',version:'版本',license:'许可证',author:'作者',links:'链接',repo:'GitHub 仓库',issues:'反馈问题',releases:'下载更新',made:'用 AI 一起 vibe coding 出来的个人项目，每天自己在用，哪里难受就改哪里',credits:'致谢',creditsText:'LunaHook（文本 Hook）· JMdict / EDRDG（日语词典）· SudachiDict 与 UniDic（分词与注音）· Tauri（桌面宿主）· Anki 与 AnkiConnect · AivisSpeech（语音合成）· Tomoyo（最早的灵感来源）',support:'支持 MeguLit',supportText:'和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了……(›´ω`‹ )\n如果 MeguLit 为你的日语学习带来了一点帮助，欢迎赞助一点厄里斯，支持项目继续开发！',supportStrong:'每一份支持，都能让这场冒险走得更远 ヾ(≧▽≦*)o',cn:'国内赞赏',alipay:'支付宝',wechat:'微信赞赏',intl:'海外用户',intlText:'可以通过 GitHub Sponsors 赞助，支持信用卡和 PayPal',sponsorBtn:'打开 GitHub Sponsors',thanks:'谢谢你 ♡'},
 en:{tag:'Read the game, keep the game.',intro:'A tiny grimoire for reading Japanese in visual novels ✦\nClick a word to look it up, turn lines into Anki cards. Explosion-level study power!',version:'Version',license:'License',author:'Author',links:'Links',repo:'GitHub repository',issues:'Report an issue',releases:'Downloads',made:'A personal project, vibe coded together with AI. I use it every day and fix whatever bugs me.',credits:'Thanks',creditsText:'LunaHook (text hooks) · JMdict / EDRDG (dictionary) · SudachiDict & UniDic (tokenizing & readings) · Tauri (desktop host) · Anki & AnkiConnect · AivisSpeech (speech) · Tomoyo (where it all started)',support:'Support MeguLit',supportText:'The fight against the Bug Demon King\'s army goes on, and the adventuring funds are running low… (›´ω`‹ )\nIf MeguLit made your Japanese a little easier, consider tossing a few Eris into the coin pouch.',supportStrong:'Every bit helps this adventure go a little further ヾ(≧▽≦*)o',cn:'From mainland China',alipay:'Alipay',wechat:'WeChat',intl:'Everywhere else',intlText:'Sponsor through GitHub Sponsors (credit card or PayPal).',sponsorBtn:'Open GitHub Sponsors',thanks:'Thank you ♡'},
 ja:{tag:'Read the game, keep the game.',intro:'ギャルゲーで日本語を読むための小さな魔導書 ✦\nクリックで辞書、そのまま Anki カードへ。爆裂魔法級の学習効率です！',version:'バージョン',license:'ライセンス',author:'作者',links:'リンク',repo:'GitHub リポジトリ',issues:'不具合を報告',releases:'ダウンロード',made:'AI と一緒に Vibe Coding で作っている個人プロジェクトです。毎日自分で使いながら直しています',credits:'謝辞',creditsText:'LunaHook（テキストフック）· JMdict / EDRDG（辞書）· SudachiDict・UniDic（形態素解析・読み）· Tauri（デスクトップホスト）· Anki・AnkiConnect · AivisSpeech（音声合成）· Tomoyo（すべての始まり）',support:'MeguLit を応援する',supportText:'Bug 魔王軍との戦いはまだ続いていて、冒険資金はそろそろ底をつきそうです……(›´ω`‹ )\nMeguLit が日本語の勉強に少しでも役立ったら、エリスを少し投げてもらえると開発が続けられます',supportStrong:'ひとつひとつの応援が、この冒険を少し先へ進めてくれます ヾ(≧▽≦*)o',cn:'中国国内から',alipay:'Alipay',wechat:'WeChat',intl:'海外から',intlText:'GitHub Sponsors から支援できます（クレジットカード・PayPal 対応）',sponsorBtn:'GitHub Sponsors を開く',thanks:'ありがとうございます ♡'}
};
export function aboutHTML(locale,esc){
 const t=w[locale]||w.zh;
 const link=(url,label)=>`<button type="button" class="about-link" data-open="${esc(url)}">${esc(label)}<span aria-hidden="true">↗</span></button>`;
 return `<section class="about-page">
  <header class="about-hero">
   <img class="about-logo" src="assets/sponsor/logo.png" alt="MeguLit">
   <p class="about-tag">${esc(t.tag)}</p>
   <p class="about-intro">${esc(t.intro).replace(/\n/g,'<br>')}</p>
  </header>
  <div class="about-grid">
   <dl class="about-facts">
    <div><dt>${esc(t.version)}</dt><dd>v${VERSION}</dd></div>
    <div><dt>${esc(t.license)}</dt><dd>GPL-3.0-or-later</dd></div>
    <div><dt>${esc(t.author)}</dt><dd>魚魚棟 · ilynthn</dd></div>
   </dl>
   <div class="about-links"><h3>${esc(t.links)}</h3>${link(REPO,t.repo)}${link(REPO+'/issues',t.issues)}${link(REPO+'/releases',t.releases)}</div>
  </div>
  <p class="about-made">${esc(t.made)}</p>
  <section class="about-support">
   <h2>${esc(t.support)}</h2>
   <p class="about-support-text">${esc(t.supportText).replace(/\n/g,'<br>')}</p><p class="about-support-strong">${esc(t.supportStrong)}</p>
   <div class="about-pay">
    <div class="about-cn"><h3>${esc(t.cn)}</h3>
     <div class="about-qrs">
      <figure><div class="about-qr"><img src="assets/sponsor/alipay.png" alt="${esc(t.alipay)}"></div><figcaption>${esc(t.alipay)}</figcaption></figure>
      <figure><div class="about-qr"><img src="assets/sponsor/wechat.png" alt="${esc(t.wechat)}"></div><figcaption>${esc(t.wechat)}</figcaption></figure>
     </div>
    </div>
    <div class="about-intl"><h3>${esc(t.intl)}</h3><p>${esc(t.intlText)}</p>
     <button type="button" class="primary about-sponsor" data-open="${SPONSOR}">♡ ${esc(t.sponsorBtn)}</button>
     <p class="about-thanks">${esc(t.thanks)}</p>
    </div>
   </div>
  </section>
  <section class="about-credits"><h3>${esc(t.credits)}</h3><p>${esc(t.creditsText)}</p></section>
 </section>`;
}
export function mountAbout(main,api,toast){
 main.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>api('open_source',{url:b.dataset.open}).catch(()=>toast&&toast('…'))));
}
