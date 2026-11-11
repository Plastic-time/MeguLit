/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E458 使用教程: the steps shown in the start notice (page 2) and in the top bar 指南 panel.
   Hotkeys follow web/reader/modules/settings.js (Alt+T menu, Alt+H overlay on/off). [[...]] becomes a <kbd>. */

export const SUCCESS = {
  zh: { head: '怎样才算适配成功？', steps: ['开游戏，推进到有对话的地方', '按 [[Alt+T]] 打开菜单，在「校准」页做一次校准', '再推进几句，看到游戏原文被 MeguLit 完美替换，就成功了'], tail: '只看到菜单或悬浮字幕还不算，一定要先校准一次。' },
  ja: { head: '対応できたかどうかの目安', steps: ['ゲームを起動して、会話のある場面まで進める', '[[Alt+T]] でメニューを開き、「校正」ページで一度校正する', 'さらに数行進めて、原文が MeguLit にきれいに置き換わっていれば成功'], tail: 'メニューが出ただけではまだです。まず一度校正してください。' },
  en: { head: 'How do you know it works?', steps: ['Start the game and play until there is dialogue', 'Press [[Alt+T]] to open the menu and run Calibrate once', 'Advance a few more lines: when the game’s own text is cleanly replaced by MeguLit, you are set'], tail: 'Seeing the menu is not enough yet. Calibrate once first.' },
};

export const GUIDE = {
  zh: { title: '使用教程', sections: [
    { h: '第一次玩', steps: ['在「游戏库」里启动游戏（还没有就先添加）', '从「新游戏」开始，别直接读档', '推进几句对话，让 MeguLit 抓到文本'] },
    { h: '校准', steps: ['按 [[Alt+T]] 打开菜单，进入「校准」页', '按提示点「校准当前句」，等它对上当前这句', '关掉菜单再推进几句，确认游戏原文被替换', '对不上：在菜单里重新选文本流，或拖动文本框到原文位置；想暂时看原版画面按 [[Alt+H]]'] },
    { h: '翻译', steps: ['去「设置 → 翻译」选一种', '零延迟翻译：有汉化补丁的游戏会自动对上，最快', '免费机翻：不用配置，联网即可', 'API 翻译：填 DeepSeek 等的密钥，质量更好', '本地模型：下载后离线使用'] },
    { h: '查词和学习', steps: ['单击日文单词，弹出查词卡', '拖选一段：加入 Anki，或收藏句子', '在「学习」页复习收藏的词和句子'] },
    { h: '常用快捷键', keys: [['Alt+T', '开关菜单（校准、翻译、外观）'], ['Alt+H', '一键开关内嵌和全部 MeguLit 覆盖']] },
    { h: '遇到问题', steps: ['去「关于」页点「一键上传问题反馈」，写一句原因，日志会一起发过来'] },
  ] },
  ja: { title: '使い方', sections: [
    { h: 'はじめて遊ぶとき', steps: ['「ライブラリ」からゲームを起動（なければ先に追加）', 'セーブをロードせず「はじめから」で始める', '数行進めて、MeguLit にテキストを拾わせる'] },
    { h: '校正', steps: ['[[Alt+T]] でメニューを開き、「校正」ページへ', '案内どおり「現在の文を校正」を押して、今の文に合うのを待つ', 'メニューを閉じて数行進め、原文が置き換わるか確認', '合わないとき：メニューでテキストストリームを選び直すか、テキスト枠を原文の位置へドラッグ。元の画面を見たいときは [[Alt+H]]'] },
    { h: '翻訳', steps: ['「設定 → 翻訳」で選ぶ', 'ゼロ遅延翻訳：翻訳パッチがあれば自動で対応、いちばん速い', '無料機械翻訳：設定不要、ネット接続だけ', 'API 翻訳：DeepSeek などのキーを入れる、品質が高い', 'ローカルモデル：ダウンロード後はオフラインで使える'] },
    { h: '辞書と学習', steps: ['日本語の単語をクリックすると辞書カード', 'ドラッグで選択して Anki に追加、または文を保存', '「学習」ページで保存した単語と文を復習'] },
    { h: 'よく使うショートカット', keys: [['Alt+T', 'メニューの開閉（校正・翻訳・外観）'], ['Alt+H', '埋め込みと MeguLit の表示をまとめてオン／オフ']] },
    { h: '困ったときは', steps: ['「について」ページの「不具合をまとめて送る」から、原因をひとこと。ログも一緒に届きます'] },
  ] },
  en: { title: 'How to use', sections: [
    { h: 'First time', steps: ['Start the game from the Library (add it first if needed)', 'Begin with New Game rather than loading a save', 'Advance a few lines so MeguLit can pick up the text'] },
    { h: 'Calibrate', steps: ['Press [[Alt+T]] and open the Calibrate page', 'Follow the hint and calibrate the current line', 'Close the menu, advance a few lines and check the game text is replaced', 'Not lining up? Pick another text stream in the menu, or drag the text box onto the original; press [[Alt+H]] to see the untouched game'] },
    { h: 'Translation', steps: ['Choose one in Settings → Translation', 'Zero-latency: lines up automatically when the game has a translation patch; fastest', 'Free machine translation: no setup, just online', 'API translation: add a DeepSeek (or similar) key for better quality', 'Local model: download once, then works offline'] },
    { h: 'Look-up and study', steps: ['Click a Japanese word for its lookup card', 'Drag over a passage to add it to Anki or save the sentence', 'Review saved words and sentences on the Learning page'] },
    { h: 'Shortcuts', keys: [['Alt+T', 'Open or close the menu (calibrate, translation, look)'], ['Alt+H', 'Turn embedding and every MeguLit overlay on or off']] },
    { h: 'Something wrong?', steps: ['Open About and use Report a problem: one sentence is fine, the logs come along'] },
  ] },
};

const pick = (table, locale) => table[locale] || table.zh;
const kbd = (text, esc) => esc(text).replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>');

export function successHTML(locale, esc) {
  const s = pick(SUCCESS, locale);
  return `<section class="guide-success"><h3>${esc(s.head)}</h3><ol>${s.steps.map(x => `<li>${kbd(x, esc)}</li>`).join('')}</ol><p>${esc(s.tail)}</p></section>`;
}

export function guideHTML(locale, esc) {
  const g = pick(GUIDE, locale);
  return `<div class="guide-steps">${g.sections.map((s, i) => `<section class="guide-section"><h3><span class="guide-no">${String(i + 1).padStart(2, '0')}</span>${esc(s.h)}</h3>${s.keys
    ? `<dl class="guide-keys">${s.keys.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
    : `<ol>${s.steps.map(x => `<li>${kbd(x, esc)}</li>`).join('')}</ol>`}</section>`).join('')}</div>`;
}
