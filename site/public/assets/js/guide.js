// SPDX-License-Identifier: GPL-3.0-or-later
// The usage guide: what "working" looks like (calibrate, then see the original replaced), first run, translation
// choices, look-up and study, shortcuts, reporting a problem. One source for the notice's guide pane and the
// "Get started" section. Shortcuts and menu names follow the app (Alt+T menu, Alt+H inline/overlay, Alt+M home, L log;
// Alt+T → 校准 → 校准当前句; settings-guides.js for the translation choices).

const T = (zh, ja, en) => ({ zh, ja, en });
const k = s => `<kbd>${s}</kbd>`;

export const OK = T(
  `<b>怎样才算适配成功？</b>开游戏，推进到有对话的地方 → 按 ${k('Alt')} + ${k('T')} 打开菜单，点「校准」→「校准当前句」→ 再推进几句。看到游戏文本框里的原文被<b>完整替换</b>成译文（注音在上），就成功了`,
  `<b>ちゃんと動いているかの確認</b>：ゲームを起動してセリフまで進める → ${k('Alt')} + ${k('T')} でメニューを開き「校正」→「現在の文を校正」→ さらに数行進める。ゲームのテキスト枠の原文が<b>きれいに置き換わって</b>いれば成功です`,
  `<b>How to tell it works:</b> start the game and reach a line of dialogue → press ${k('Alt')} + ${k('T')}, choose Calibrate → Calibrate current line → advance a few more lines. When the game's own text box shows the line <b>fully replaced</b> (readings on top), you're set`,
);

export const STEPS = [
  {
    t: T('第一次玩', 'はじめて遊ぶ', 'First run'),
    d: T(
      ['解压后运行 <code>MeguLit.exe</code>，选好放游戏的文件夹', '点作品，再点「启动游戏」，建议用窗口模式玩', '阅读层会自己接上；按 ' + k('Alt') + ' + ' + k('T') + ' 打开菜单'],
      ['解凍して <code>MeguLit.exe</code> を起動し、ゲームのフォルダを選ぶ', '作品を選んで「ゲーム起動」。ウィンドウモードがおすすめ', '読書レイヤーは自動でつながります。' + k('Alt') + ' + ' + k('T') + ' でメニュー'],
      ['Unzip and run <code>MeguLit.exe</code>, then pick the folder with your games', 'Choose a game and press Launch; windowed mode works best', 'The reading layer attaches by itself; ' + k('Alt') + ' + ' + k('T') + ' opens the menu'],
    ),
  },
  {
    t: T('校准', '校正', 'Calibrate'),
    d: T(
      ['推进到有对话的地方，按 ' + k('Alt') + ' + ' + k('T') + ' →「校准」→「校准当前句」', '提示「尚未收到正文」时，再推进一句，会自动校准', '再推进几句：原文被完整替换成译文，就是成功了', '还是不行：菜单里「窗口绑定（高级）」手动选游戏窗口，或者一键反馈给我们'],
      ['セリフまで進めて ' + k('Alt') + ' + ' + k('T') + ' →「校正」→「現在の文を校正」', '「本文をまだ受け取っていません」と出たら、もう一行進めると自動で校正されます', 'さらに数行進めて、原文がきれいに置き換われば成功', 'うまくいかない時はメニューの「ウィンドウ割り当て（詳細）」で手動で選ぶか、ワンクリックで報告を'],
      ['Reach a line of dialogue, then ' + k('Alt') + ' + ' + k('T') + ' → Calibrate → Calibrate current line', 'If it says no text yet, advance one more line and it calibrates by itself', 'Advance a few lines: when the original is fully replaced, it works', 'Still not right? Bind the game window by hand under Window binding (advanced), or send a report'],
    ),
  },
  {
    t: T('翻译怎么选', '翻訳の選び方', 'Which translation'),
    d: T(
      ['<b>有汉化或官方中文：零延迟翻译</b>，日文一出人工译文立刻出现，免费不联网（设置 → 翻译里打开）', '其余句子三选一：', '<b>免费机翻</b>：不用设置，质量一般', '<b>API 翻译</b>：质量最好，要 API Key，按字数付少量钱（比如 DeepSeek）', '<b>本地模型</b>：免费离线，要 6 GB 以上显存'],
      ['<b>翻訳パッチや公式中国語版があれば：ゼロ遅延翻訳</b>。人の訳が即表示、無料・オフライン（設定 → 翻訳でオン）', 'それ以外は 3 つから選ぶ：', '<b>無料翻訳</b>：設定不要、品質そこそこ', '<b>API 翻訳</b>：最高品質、API キーと少額の利用料（例：DeepSeek）', '<b>ローカルモデル</b>：無料・オフライン、VRAM 6 GB 以上'],
      ['<b>Have a fan or official translation? Zero-latency</b>: the human translation appears instantly, free and offline (Settings → Translation)', 'For everything else, pick one:', '<b>Free MT</b>: no setup, fair quality', '<b>API</b>: best quality, needs an API key, a little per character (DeepSeek, for one)', '<b>Local model</b>: free and offline, needs 6 GB+ VRAM'],
    ),
  },
  {
    t: T('查词和学习', '辞書と学習', 'Look up and study'),
    d: T(
      ['点台词里的词，看读音和意思；拖选一段可以查整句', '一键做成 Anki 卡片，带截图、例句和原声', '学习页：五十音、语法、生词复习，读了多少都有统计'],
      ['セリフの単語をクリックで読みと意味。ドラッグで一文まとめて', 'ワンクリックで Anki カード（スクショ・例文・音声つき）', '学習ページ：五十音、文法、単語の復習。読んだ量も記録'],
      ['Click a word in the line for its reading and meaning; drag across to look up a phrase', 'One click makes an Anki card with the screenshot, the line and the voice', 'Study page: kana, grammar, word review, and stats on what you read'],
    ),
  },
  {
    t: T('常用快捷键', 'ショートカット', 'Shortcuts'),
    d: T(
      [k('Alt') + ' + ' + k('T') + ' 开关菜单', k('Alt') + ' + ' + k('H') + ' 一键开关内嵌和全部 MeguLit 显示（对比游戏原文）', k('Alt') + ' + ' + k('M') + ' 显示 / 隐藏 MeguLit 主页', '菜单里按 ' + k('L') + ' 打开日志'],
      [k('Alt') + ' + ' + k('T') + ' メニューの開閉', k('Alt') + ' + ' + k('H') + ' 埋め込みと MeguLit の表示を一括オン／オフ（原文と比べる）', k('Alt') + ' + ' + k('M') + ' MeguLit ホームの表示／非表示', 'メニューで ' + k('L') + ' を押すとログ'],
      [k('Alt') + ' + ' + k('T') + ' opens and closes the menu', k('Alt') + ' + ' + k('H') + ' turns inline text and all of MeguLit\'s display on or off (to compare with the game)', k('Alt') + ' + ' + k('M') + ' shows or hides the MeguLit home', 'In the menu, ' + k('L') + ' opens the log'],
    ),
  },
  {
    t: T('遇到问题', '困ったときは', 'Something wrong?'),
    d: T(
      ['软件里「关于 → 一键上传问题反馈」，写一句原因，日志会一起发过来', '也可以在官网顶部点「问题反馈」', '本版本仅在开发者本地运行测试过，有问题请告诉我们，会持续跟进修复'],
      ['アプリの「について → 不具合をまとめて送る」。一言書けばログも一緒に届きます', 'サイト上部の「フィードバック」からも送れます', 'このバージョンは開発者の手元でのみ確認しています。問題があれば知らせてください。引き続き修正します'],
      ['In the app: About → Report a problem; write a line and the logs come along', 'Or use Feedback at the top of this site', 'This version has only been tested on the developer\'s machine; tell us what goes wrong and we\'ll keep fixing it'],
    ),
  },
];

export const LABEL = {
  guide: T('使用教程', '使い方', 'How to use'),
  prev: T('上一步', '前へ', 'Back'),
  next: T('下一步', '次へ', 'Next'),
  done: T('开始玩吧', '始めよう', 'Let\'s play'),
  more: T('使用教程', '使い方を見る', 'How to use'),
  adv: T('装好之后', 'インストールのあと', 'After installing'),
};

export const pick = (o, lang) => o[lang] || o.zh;

// a list of steps as cards (for the Get started section)
export function guideCards(host, lang) {
  host.replaceChildren(...STEPS.map((s, i) => {
    const li = document.createElement('li');
    li.className = 'gd-card';
    li.innerHTML = `<h3><span class="gd-no">${String(i + 1).padStart(2, '0')}</span></h3><ul></ul>`;
    li.querySelector('h3').append(pick(s.t, lang));
    li.querySelector('ul').innerHTML = pick(s.d, lang).map(x => `<li>${x}</li>`).join('');
    return li;
  }));
}
