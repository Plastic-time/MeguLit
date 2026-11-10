/* SPDX-License-Identifier: GPL-3.0-or-later */
/* E383 Built-in tutorials at the top of Settings pages (user 2026-11-10: many people do not know what an API key, credits
   or a local model are, or that the voice engine has to be downloaded; the help must sit in Settings, not appear only
   when something fails). One folding card per page, open until the reader folds it; buttons do the step for them. */

const T = (zh, en, ja) => ({ zh, en, ja });

/* Steps are plain text; a link marker (link + colon + id in braces) becomes a button that opens that page, an act marker a button that runs an action. */
const LINKS = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  siliconflow: 'https://cloud.siliconflow.cn/account/ak',
  bailian: 'https://bailian.console.aliyun.com/',
  gemini: 'https://aistudio.google.com/apikey',
  anki: 'https://apps.ankiweb.net/',
  ankiconnect: 'https://ankiweb.net/shared/info/2055492159',
  site: 'https://megulit.com',
};
const LINK_LABEL = {
  deepseek: T('打开 DeepSeek 开放平台', 'Open the DeepSeek platform', 'DeepSeek を開く'),
  siliconflow: T('打开硅基流动', 'Open SiliconFlow', 'SiliconFlow を開く'),
  bailian: T('打开阿里云百炼', 'Open Alibaba Bailian', 'Alibaba Bailian を開く'),
  gemini: T('打开 Google AI Studio', 'Open Google AI Studio', 'Google AI Studio を開く'),
  anki: T('下载 Anki', 'Download Anki', 'Anki をダウンロード'),
  ankiconnect: T('AnkiConnect 插件页', 'AnkiConnect add-on page', 'AnkiConnect のページ'),
  site: T('打开官网', 'Open megulit.com', '公式サイトを開く'),
};
const ACTIONS = {
  voice: T('一键下载语音引擎', 'Download the voice engine', '音声エンジンをダウンロード'),
  reading: T('一键下载注音词典', 'Download the reading dictionary', '読み仮名辞書をダウンロード'),
  ankiCheck: T('检查 Anki 连接', 'Check the Anki connection', 'Anki との接続を確認'),
};

const GUIDES = {
  translation: {
    title: T('翻译怎么选？第一次用先看这里', 'Which translation? Start here', '翻訳の選び方（はじめての方へ）'),
    blocks: [
      {
        head: T('零延迟翻译是什么？', 'What is zero-latency translation?', 'ゼロ遅延翻訳とは？'),
        steps: [
          T('游戏装了汉化补丁，或者自带官方中文时，MeguLit 会提前读出整部剧本，把每句日文和汉化组或官方的中文对好', 'When a game has a fan translation patch or an official Chinese version, MeguLit reads the whole script in advance and pairs every Japanese line with its human Chinese translation', 'ゲームに中国語パッチや公式中国語がある場合、MeguLit は事前に台本を読み込み、日本語の各文と人による中国語訳を対応づけます'),
          T('玩的时候游戏显示日文，下面立刻出现对应的人工译文，不用等翻译引擎，也不花钱、不用联网', 'While you play, the game shows Japanese and the matching human translation appears instantly: no waiting for an engine, no cost, no network', 'プレイ中は日本語が表示され、対応する人の訳がすぐに出ます。翻訳エンジンを待たず、費用もネットも不要です'),
          T('没自动找到汉化？在作品页「汉化脚本 · 零延迟双语」里点「手动选择」，选你手上的汉化补丁或汉化版游戏的文件就行', 'No translation found automatically? On the game page, under Translation script · zero-latency bilingual, click Choose manually and pick the translation patch or a file of the translated game you have', '自動で見つからない場合は、作品ページの「翻訳スクリプト · ゼロ遅延」で「手動で選択」を押し、手元の翻訳パッチや翻訳版ゲームのファイルを選んでください'),
          T('在「翻译」页打开「零延迟翻译（汉化脚本）」即可；作品页「技术资料」里能看到这部作品支不支持。只有极少数对不上的句子才会交给下面选的翻译方式', 'Turn on Zero-latency translation on this page; the game page technical details say whether a game supports it. Only the rare line that does not match goes to the translation method chosen below', 'このページで「ゼロ遅延翻訳」をオンにします。対応状況は作品ページの技術情報で確認できます。対応しない少数の文だけが下で選んだ翻訳方式に回ります'),
        ],
      },
      {
        head: T('三种方式，按需选一个', 'Three ways, pick one', '3 つの方式から 1 つ選ぶ'),
        steps: [
          T('「免费在线机翻」：什么都不用设置，打开就能用。质量一般，适合先试试', 'Free online MT: nothing to set up, works right away. Fair quality, good for a first try', '無料オンライン翻訳：設定不要ですぐ使えます。品質はそこそこ。まずはお試しに'),
          T('「API 翻译」：用 AI 大模型翻译，质量最好，最懂 Galgame 的语气。要先在 AI 平台注册，拿一个 API Key，按字数付很少的钱', 'API translation: an AI model translates, best quality and the best feel for galgame dialogue. You sign up on an AI platform, get an API key and pay a little per character', 'API 翻訳：AI モデルが翻訳。品質が一番よく、ゲームの口調も自然です。AI サービスに登録して API キーを取得し、文字数に応じて少額を支払います'),
          T('「本地模型」：用你自己的显卡翻译，免费、断网也能用。需要 6 GB 以上显存的独立显卡', 'Local model: your own graphics card translates, free and offline. Needs a graphics card with 6 GB of video memory or more', 'ローカルモデル：自分の GPU で翻訳。無料でオフラインでも使えます。VRAM 6 GB 以上の GPU が必要です'),
        ],
      },
      {
        head: T('API Key 和余额是什么？', 'What are an API key and credits?', 'API キーやクレジットとは？'),
        steps: [
          T('API Key 是 AI 平台发给你的一串密码，MeguLit 用它替你调用 AI 翻译，平台按用量从你的余额里扣钱', 'An API key is a password-like string the AI platform gives you. MeguLit uses it to ask the AI to translate, and the platform charges your balance by usage', 'API キーは AI サービスが発行するパスワードのような文字列です。MeguLit はこれで AI に翻訳を頼み、使った分だけ残高から引かれます'),
          T('「余额」就是你在平台上充的钱，或者平台送的免费额度。翻译按字数计费，读一整部游戏一般只要几块钱；很多平台新用户还送免费额度', 'Credits or balance is the money you top up, or the free allowance you get. Translation is billed by characters; a whole game usually costs very little, and many platforms give new users free credit', 'クレジット・残高はチャージした金額や無料枠のことです。文字数課金で、1 本読み切っても多くの場合わずかな金額です。新規登録で無料枠がもらえることも多いです'),
          T('API Key 只保存在你电脑上（加密），不要发给别人', 'The key is stored only on your PC, encrypted. Never share it', 'キーはこの PC にだけ暗号化して保存されます。他人に渡さないでください'),
        ],
      },
      {
        head: T('国内推荐：DeepSeek（5 步搞定）', 'Recommended in China: DeepSeek (5 steps)', 'おすすめ：DeepSeek（5 ステップ）'),
        steps: [
          T('点下面按钮打开 DeepSeek 开放平台，用手机号注册登录 {link:deepseek}', 'Open the DeepSeek platform and sign up {link:deepseek}', 'DeepSeek を開いて登録 {link:deepseek}'),
          T('左侧「充值」，先充 10 元就够用很久', 'Top up a small amount under Top up', '「チャージ」で少額を入金'),
          T('左侧「API keys」→「创建 API key」，名字随便填，复制生成的那串字符（只显示一次）', 'API keys → Create API key, then copy the key (it is shown once)', '「API keys」→「作成」でキーをコピー（表示は一度だけ）'),
          T('回到这一页：「翻译方式」选「API 翻译」，服务选「DeepSeek」，把 Key 粘贴到「API Key」，点保存', 'Back here: set the method to API translation, the service to DeepSeek, paste the key into API Key and save', 'このページで「API 翻訳」→「DeepSeek」を選び、キーを貼り付けて保存'),
          T('开一个游戏试试，译文出来就成功了。报错 401 = Key 填错；402 或「余额不足」= 要充值；429 = 太快或额度用完，稍等再试', 'Start a game. 401 means a wrong key, 402 or insufficient balance means top up, 429 means too fast or out of quota', 'ゲームで確認。401＝キー誤り、402・残高不足＝チャージ、429＝速すぎ／上限'),
        ],
      },
      {
        head: T('其他可选平台', 'Other platforms', 'その他のサービス'),
        steps: [
          T('硅基流动：新用户送免费额度，模型多 {link:siliconflow}', 'SiliconFlow: free credit for new users, many models {link:siliconflow}', 'SiliconFlow：新規無料枠あり {link:siliconflow}'),
          T('通义千问（阿里云百炼）：用阿里云账号就能开通 {link:bailian}', 'Qwen (Alibaba Bailian): sign in with an Alibaba Cloud account {link:bailian}', 'Qwen（Alibaba Bailian） {link:bailian}'),
          T('海外用户：Google Gemini 有免费额度 {link:gemini}', 'Outside China: Google Gemini has a free tier {link:gemini}', '海外の方：Google Gemini は無料枠あり {link:gemini}'),
        ],
      },
      {
        head: T('本地模型怎么装', 'Setting up a local model', 'ローカルモデルの導入'),
        steps: [
          T('「翻译方式」选「本地模型」，下面先点「下载并安装」本地服务程序（约 37 MB）', 'Set the method to Local model, then click Download and install for the local server (about 37 MB)', '「ローカルモデル」を選び、ローカルサーバーを「ダウンロードしてインストール」（約 37 MB）'),
          T('再挑一个模型下载：6–8 GB 显存选「GalTransl v4 4B」，12 GB 以上可以选 14B，质量更高', 'Then download a model: GalTransl v4 4B for 6–8 GB of video memory, a 14B model with 12 GB or more', 'モデルを選んでダウンロード：VRAM 6–8 GB なら GalTransl v4 4B、12 GB 以上なら 14B'),
          T('下载完点「使用此模型」。翻译时会自动启动，不用管它。国内会自动走 MeguLit 的国内线路和镜像下载', 'Click Use this model. It starts by itself when needed. In China, downloads go through MeguLit\'s own mirror', '「このモデルを使う」を押せば完了。必要なときに自動で起動します'),
        ],
      },
    ],
  },
  speech: {
    title: T('朗读和跟读：先装语音引擎', 'Read-aloud: install the voice engine first', '読み上げ：まず音声エンジンを入れる'),
    blocks: [
      {
        head: T('一键安装', 'One-click install', 'ワンクリックで導入'),
        steps: [
          T('朗读、跟读用的是 AivisSpeech 语音引擎，第一次要下载约 290 MB（装好后约 850 MB）。国内会自动从 MeguLit 国内镜像下载，很快 {act:voice}', 'Read-aloud uses the AivisSpeech engine, a one-time download of about 290 MB (850 MB installed). In China it comes from MeguLit\'s own mirror {act:voice}', '読み上げには AivisSpeech エンジンを使います。初回のみ約 290 MB をダウンロード（展開後約 850 MB） {act:voice}'),
          T('装好后，查词卡片和句子旁的朗读按钮就能出声；跟读就是听一遍再自己念一遍', 'After that, the speaker buttons on word cards and lines play audio; to shadow, listen once and repeat it aloud', '導入後は単語カードや文の再生ボタンで音声が流れます。シャドーイングは聞いてから自分で繰り返すだけです'),
        ],
      },
      {
        head: T('换声音、调速度', 'Voices and speed', '声と速さ'),
        steps: [
          T('下面「语音角色」可以选声音、点「试听」；想要更多声音点下载，每个约 250 MB，只下你点的那个', 'Pick a voice under Voice character and press Preview. More voices are about 250 MB each, downloaded only when you choose one', '「話者」で声を選び「試聴」。追加の声は 1 つ約 250 MB、選んだものだけ取得します'),
          T('朗读太快就把语速调到 0.8–0.9；显卡出问题或没声音时，关掉「用显卡合成」改用 CPU', 'Too fast? Set speed to 0.8–0.9. If audio fails, turn off GPU synthesis to use the CPU', '速すぎるときは速度 0.8–0.9。音が出ないときは GPU 合成をオフに'),
        ],
      },
    ],
  },
  dictionary: {
    title: T('查词和注音需要什么？', 'What lookups and furigana need', '辞書と読み仮名に必要なもの'),
    blocks: [
      {
        head: T('两样东西', 'Two pieces', '2 つの部品'),
        steps: [
          T('MOJi 联网查词：不用装，联网就能查', 'MOJi online lookup: nothing to install, works online', 'MOJi オンライン辞書：インストール不要'),
          T('注音分词词典：给汉字标假名、把句子切成词，约 190 MB，只需装一次。国内自动走国内镜像 {act:reading}', 'Reading dictionary: adds furigana and splits sentences into words, about 190 MB, installed once {act:reading}', '読み仮名・分かち書き辞書：約 190 MB、一度だけ導入 {act:reading}'),
        ],
      },
    ],
  },
  anki: {
    title: T('连上 Anki，生词自动做成卡片', 'Connect Anki to turn words into cards', 'Anki と連携して単語カードを作る'),
    blocks: [
      {
        head: T('4 步连上', '4 steps', '4 ステップ'),
        steps: [
          T('安装 Anki 电脑版并打开 {link:anki}', 'Install Anki for desktop and open it {link:anki}', 'Anki デスクトップ版を入れて起動 {link:anki}'),
          T('Anki 菜单「工具」→「插件」→「获取插件」，输入代码 2055492159，确定后重启 Anki {link:ankiconnect}', 'In Anki: Tools → Add-ons → Get Add-ons, enter 2055492159, then restart Anki {link:ankiconnect}', 'Anki の「ツール」→「アドオン」→「アドオンを取得」でコード 2055492159 を入力し再起動 {link:ankiconnect}'),
          T('保持 Anki 开着（MeguLit 也能在后台帮你打开它）', 'Keep Anki running (MeguLit can also start it in the background)', 'Anki は起動したままに（MeguLit がバックグラウンドで起動することもできます）'),
          T('点这里检查连接，显示「Anki 已连接」就好了 {act:ankiCheck}', 'Check the connection; it should say connected {act:ankiCheck}', '接続を確認 {act:ankiCheck}'),
        ],
      },
    ],
  },
  online: {
    title: T('联网功能说明', 'About the online features', 'オンライン機能について'),
    blocks: [
      {
        head: T('都连 MeguLit 自己的服务器，国内能用', 'All on MeguLit\'s own server, works in China', 'すべて MeguLit のサーバー経由'),
        steps: [
          T('排行榜：默认关闭。打开后只上传阅读时长、字数这些数字，不上传你读的内容；名字和头像可以随时改或删', 'Leaderboard: off by default. When on, only totals like reading time are uploaded, never what you read; name and avatar can be changed or removed any time', 'ランキング：初期状態はオフ。数字だけを送り、読んだ内容は送りません'),
          T('账号：用邮箱收验证码登录，不用密码；登录后可以开云端同步，换电脑接着用', 'Account: sign in with an email code, no password; then turn on cloud sync to continue on another PC', 'アカウント：メールのコードでログイン。クラウド同期で別の PC でも続きから'),
          T('共享适配：你调好的游戏设置会匿名分享给其他人，不含个人信息，不想分享可以关', 'Shared adaptation: your tuned game settings are shared anonymously, with no personal data; you can turn it off', '共有設定：調整したゲーム設定を匿名で共有。オフにもできます'),
          T('更多说明和下载见官网 {link:site}', 'More on the website {link:site}', '詳しくは公式サイトへ {link:site}'),
        ],
      },
    ],
  },
};

const STORE = 'megulit-guide-folded';
function folded() { try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { return {}; } }
function remember(section, value) { try { const all = folded(); all[section] = value; localStorage.setItem(STORE, JSON.stringify(all)); } catch { /* storage unavailable */ } }

export function guideSections() { return Object.keys(GUIDES); }
export function guideText(section, locale = 'zh') {
  const g = GUIDES[section]; if (!g) return '';
  const pick = v => v[locale] || v.zh;
  return [pick(g.title), ...g.blocks.flatMap(b => [pick(b.head), ...b.steps.map(pick)])].join('\n');
}

export function mountGuide({ content, section, locale = 'zh', esc, api, toast, actions = {} }) {
  const g = GUIDES[section]; if (!g || !content) return () => {};
  const pick = v => v[locale] || v.zh;
  const step = text => esc(pick(text)).replace(/\{(link|act):([a-zA-Z]+)\}/g, (_, kind, id) => kind === 'link'
    ? `<button type="button" class="guide-chip" data-guide-link="${esc(id)}">${esc(pick(LINK_LABEL[id] || T(id, id, id)))} ↗</button>`
    : `<button type="button" class="guide-chip guide-act" data-guide-act="${esc(id)}">${esc(pick(ACTIONS[id] || T(id, id, id)))}</button>`);
  const card = document.createElement('details');
  card.className = 'panel settings-guide';
  card.open = !folded()[section];
  card.innerHTML = `<summary><span class="guide-badge">${esc(pick(T('教程', 'Guide', 'ガイド')))}</span>${esc(pick(g.title))}</summary>`
    + g.blocks.map(b => `<div class="guide-block"><h3>${esc(pick(b.head))}</h3><ol>${b.steps.map(s => `<li>${step(s)}</li>`).join('')}</ol></div>`).join('');
  card.addEventListener('toggle', () => remember(section, !card.open));
  card.querySelectorAll('[data-guide-link]').forEach(button => button.addEventListener('click', () => {
    const url = LINKS[button.dataset.guideLink]; if (!url) return;
    api('open_source', { url }).catch(() => toast && toast(url));
  }));
  card.querySelectorAll('[data-guide-act]').forEach(button => button.addEventListener('click', async () => {
    const run = actions[button.dataset.guideAct]; if (!run) return;
    button.disabled = true;
    try { await run(button); } finally { button.disabled = false; }
  }));
  content.prepend(card);
  return () => card.remove();
}
