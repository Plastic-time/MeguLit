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
    { h: '查词', steps: ['右键（或左键单击）字幕里的日文单词，弹出查词卡；点卡上的喇叭听读音', '拖选一段：查整句、加入 Anki，或收藏句子', '卡上的「AI 归纳义项」「上下文解释」会结合这一句告诉你在这里是什么意思'] },
    { h: '学习页', steps: ['复习：连上 Anki 后在这里直接复习卡片；右上角「Anki 设置」可选翻面或下一张时自动播放读音、例句', '五十音：平假名、片假名的发音和书写练习', '语法：先选自己的日语水平，按课学；例句来自你读过的台词', '单词：收藏过的单词，带 JLPT 等级；点开看释义、例句和原声', '句子：收藏过的句子，点 ▶ 播放游戏原声或朗读', '读过的词：游戏里出现过的词，按出现次数排；会的可以标「已掌握」', '词典：直接搜单词；回收站：删掉的词可以在这里找回', '学习统计：每天读了多少字、多久、学了多少词'] },
    { h: '常用快捷键', keys: [['Alt+T', '开关菜单（校准、翻译、外观）'], ['Alt+H', '一键开关内嵌和全部 MeguLit 覆盖']] },
    { h: '遇到问题', steps: ['去「关于」页点「一键上传问题反馈」，写一句原因，日志会一起发过来'] },
  ] },
  ja: { title: '使い方', sections: [
    { h: 'はじめて遊ぶとき', steps: ['「ライブラリ」からゲームを起動（なければ先に追加）', 'セーブをロードせず「はじめから」で始める', '数行進めて、MeguLit にテキストを拾わせる'] },
    { h: '校正', steps: ['[[Alt+T]] でメニューを開き、「校正」ページへ', '案内どおり「現在の文を校正」を押して、今の文に合うのを待つ', 'メニューを閉じて数行進め、原文が置き換わるか確認', '合わないとき：メニューでテキストストリームを選び直すか、テキスト枠を原文の位置へドラッグ。元の画面を見たいときは [[Alt+H]]'] },
    { h: '翻訳', steps: ['「設定 → 翻訳」で選ぶ', 'ゼロ遅延翻訳：翻訳パッチがあれば自動で対応、いちばん速い', '無料機械翻訳：設定不要、ネット接続だけ', 'API 翻訳：DeepSeek などのキーを入れる、品質が高い', 'ローカルモデル：ダウンロード後はオフラインで使える'] },
    { h: '辞書', steps: ['字幕の日本語の単語を右クリック（または左クリック）すると辞書カード。スピーカーで読みを再生', 'ドラッグで選択して、文ごとの検索・Anki への追加・文の保存', 'カードの「AI で意味を整理」「文脈の説明」で、この文での意味がわかります'] },
    { h: '学習ページ', steps: ['復習：Anki とつなぐとここで直接復習。右上の「Anki 設定」で裏面表示や次のカードで読み・例文を自動再生', '五十音：ひらがな・カタカナの発音と書き取り', '文法：まず自分のレベルを選んで課ごとに。例文は読んだセリフから', '単語：保存した単語（JLPT レベル付き）。開くと意味・例文・ボイス', '文：保存した文。▶ でゲームのボイスか読み上げを再生', '読んだ単語：ゲームに出てきた単語を回数順に。覚えたものは「習得済み」に', '辞書：単語を直接検索。ゴミ箱：削除した単語を戻せます', '学習統計：毎日読んだ文字数・時間・覚えた単語'] },
    { h: 'よく使うショートカット', keys: [['Alt+T', 'メニューの開閉（校正・翻訳・外観）'], ['Alt+H', '埋め込みと MeguLit の表示をまとめてオン／オフ']] },
    { h: '困ったときは', steps: ['「について」ページの「不具合をまとめて送る」から、原因をひとこと。ログも一緒に届きます'] },
  ] },
  en: { title: 'How to use', sections: [
    { h: 'First time', steps: ['Start the game from the Library (add it first if needed)', 'Begin with New Game rather than loading a save', 'Advance a few lines so MeguLit can pick up the text'] },
    { h: 'Calibrate', steps: ['Press [[Alt+T]] and open the Calibrate page', 'Follow the hint and calibrate the current line', 'Close the menu, advance a few lines and check the game text is replaced', 'Not lining up? Pick another text stream in the menu, or drag the text box onto the original; press [[Alt+H]] to see the untouched game'] },
    { h: 'Translation', steps: ['Choose one in Settings → Translation', 'Zero-latency: lines up automatically when the game has a translation patch; fastest', 'Free machine translation: no setup, just online', 'API translation: add a DeepSeek (or similar) key for better quality', 'Local model: download once, then works offline'] },
    { h: 'Look-up', steps: ['Right-click (or left-click) a Japanese word on the subtitles for its lookup card; the speaker plays the reading', 'Drag over a passage to look up the whole line, add it to Anki or save the sentence', 'AI sense summary and Context explanation on the card tell you what it means in this very line'] },
    { h: 'Learning page', steps: ['Review: with Anki connected, review your cards here; Anki settings (top right) can play the word or example by itself after turning a card or on the next one', 'Kana: hiragana and katakana sounds and writing practice', 'Grammar: pick your level first, then go lesson by lesson; examples come from lines you have read', 'Words: words you saved, with their JLPT level; open one for meanings, examples and the voice', 'Sentences: sentences you saved; ▶ plays the game voice or reads it aloud', 'Words read: words from your games by how often they appeared; mark the ones you know as mastered', 'Dictionary: search any word; Trash: get deleted words back', 'Statistics: characters and time read each day, and words learned'] },
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
