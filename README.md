<div align="center">

<img src="docs/assets/logo.png" width="520" alt="MeguLit">

**Read the game, keep the game.**
Windows 上的 Galgame 阅读与日语学习工具

[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-8b1e2d)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-3b2124)
![Status](https://img.shields.io/badge/status-active%20development-e0a84b)
[![Sponsor](https://img.shields.io/badge/%E2%99%A1-Sponsor-c8323c)](https://github.com/sponsors/ilynthn)

[简体中文](#zh) · [English](#en) · [日本語](#ja) · [♡ 赞赏 / Support](#support)

</div>

> [!WARNING]
> 还在积极开发中，功能、数据格式、界面随时可能变
>
> Still in active development. Things may change.
>
> 開発中です。機能や画面は変わることがあります

---

<a id="zh"></a>

## 简体中文

### 为什么做这个

我想靠 Galgame 学日语，结果发现现有的工具都在逼我二选一：要么老老实实玩原版，遇到不认识的词就切出去查；要么在旁边外挂一个窗口，游戏里的原文照样显示，两份字摆在眼前，看着很难受

两个我都不想要，所以干脆自己做了一个。基本是和 AI 一起 vibe coding 出来的，每天自己在用，哪里难受就改哪里

MeguLit 想做的事情就一句话：**游戏还是那个游戏，只是你能读懂了**。原文、翻译、注音、查词、AI 讲解、生词本、Anki 复习，都在游戏旁边完成，不用来回切窗口

界面有简体中文、English、日本語三种。学日语的中文/英文用户是主要对象，反过来用日语学中文或英文也可以，以后还会加别的语言

### 现在能做什么

> 写「能用」的，是我真的拿游戏玩过的；「实验中」是代码接上了，但只在部分引擎上跑通，或者只过了自动测试，实机可能翻车

| 功能 | 状态 | 说明 |
|---|---|---|
| 抓取游戏文本 | 能用 | 基于 LunaHook，自动挑文本流，不对可以手动换 |
| 阅读层 | 能用 | Alt+T 呼出菜单；每部作品单独记样式，可以对着游戏画面调字体、颜色、位置 |
| 打字机效果 | 能用 | 逐字出现，等待符跟着文字走 |
| 假名注音 | 能用 | 游戏自带 ruby 优先，没有再用词典和上下文判断；复杂排版还在磨 |
| 点读查词 | 能用 | 点一下查单词，拖一段查短语，离线词典；点读不会让剧情往下走 |
| 实时翻译 | 能用 | DeepL、Bing、Google、Gemini、DeepSeek、Sakura、Ollama、OpenAI 兼容接口等；密钥加密存在本地 |
| AI 讲解 | 能用 | 选中词或整句，让 AI 讲语法和语境 |
| 生词本 | 能用 | 单词、例句、回收站，还有阅读统计 |
| Anki | 能用 | 走 AnkiConnect 制卡，截图带上阅读层，例句配游戏原声；没配音的旁白用本地 TTS 补；复习调度交给 Anki |
| 游戏库 / 启动器 | 能用 | 扫文件夹和 Steam，自动认日文原版 EXE，可按作品开 Locale Emulator，系列作品会归到一起 |
| 备份恢复 | 能用 | 一键完整备份，恢复失败自动回滚 |
| 内嵌替换 | 实验中 | 把游戏里的原文直接换掉。部分引擎会报错甚至闪退，不建议开 |
| 本地模型与 TTS | 实验中 | 需要本地显卡环境，测得还不够 |
| 开场字幕、章节标题 | 计划中 | |
| 更多学习语言 | 计划中 | |

### 最近在忙什么（2026 年 10–11 月）

- 整个宿主重写了一遍。早期是挂在别的前端上的叠加层，现在换成了自己的 Tauri / WebView2 程序、SQLite 数据库和常驻服务
- 点读终于不会推进剧情了：用低级鼠标 Hook 把点击拦下来再交给阅读层。顺手把打字机改成 rAF，不再掉帧
- 注音贴着汉字走，字体、字距、换行、DPI 变了也不会歪；以前会把异体读音用错，修了
- 内嵌替换会分辨台词和脚本控制串，不再顺手把资源名清空导致游戏报错

### 难在哪

做久了才发现，麻烦的不是功能本身，而是每个引擎都不按常理出牌：

- **能读不能写**：很多引擎只给只读的文本流。能写的那条，又常常和脚本、资源名、历史记录共用一个函数，一写就崩
- **只能做通用规则**：给单个游戏打补丁很快，可游戏太多了，修复必须对一类引擎都成立
- **重复和漏句**：同一句被重绘好几次、多条候选流、注音排版，都会造成重复或者漏掉。可有些台词就是故意重复的，不能一刀切去重
- **点一下就跳剧情**：不少游戏直接轮询鼠标状态，你点的是阅读层，游戏也以为你点了它
- **注音排版**：不能撑开行距，要对齐汉字，还要扛住描边、混排、逐字显示和高 DPI
- **游戏自己的 LOG**：内嵌替换后，游戏的历史记录可能也跟着被换掉

### 接下来

- [x] 主流引擎上点读、拖选不推进剧情（实机验过）
- [x] 注音偏移和行距彻底分开
- [x] 词卡在点击位置旁边弹出
- [x] 主界面设全局文字样式，新游戏自动继承
- [ ] 把脚本控制串、名字变量挡在阅读和学习数据之外
- [ ] 按引擎能力判断能不能安全内嵌，找脚本执行之后的绘制入口
- [ ] 靠引擎事件或行 ID 区分「重绘」和「真的又说了一遍」
- [ ] 保住游戏原生 LOG 里的原文
- [ ] 开场、章节标题、独立字幕
- [ ] 可复现的公开构建和发布包
- [ ] 更多学习语言，以及轻小说和 Galgame 以外的游戏

### 安装

去 [Releases](https://github.com/ilynthn/MeguLit/releases/latest) 下载 `MeguLit-v1.0.0-win-x64.zip`（不到 10 MB），解压后运行 `MeguLit.exe`

第一次启动会弹出安装窗口，二选一：

- **精简版**：下载约 107 MB，能用阅读层、翻译和查词。注音分词词典和语音引擎以后可以在「设置 → 语音 / 词典」里补装
- **完整版**：下载约 565 MB，一次装齐全部组件，需要预留约 1.8 GB 磁盘

本地翻译模型比较大，不在这两个包里，需要的话在设置里按需下载

需要 Windows 10/11 x64 和 Microsoft Edge WebView2 Runtime。想用 Anki 功能，还得自己装 Anki 和 AnkiConnect

### 从源码构建

```powershell
.\Build.ps1 -Check
```

要准备 Rust（Tauri）、Node.js 和 .NET Framework 的 C# 编译器。完整步骤等构建流程能稳定复现了再补

<details>
<summary>开源前检查清单</summary>

- [ ] 第三方依赖许可证：Rust crates（`desktop/Cargo.lock`）、Node.js 运行时、WebView2 Loader、pip 等，见 [THIRD-PARTY.md](THIRD-PARTY.md)
- [ ] LunaHook 为 GPL：分发二进制时附上对应源码及修改，保留版权与许可声明
- [ ] JMdict / 词典数据：保留 EDRDG 署名与 CC BY-SA 许可
- [ ] 美术与字体：确认来源和再分发权限
- [ ] 敏感信息：不提交日志、数据库、缓存、API 密钥、本地路径、个人游戏记录和回滚 EXE
- [ ] 构建可复现：锁版本、记工具链、写清从干净环境构建的步骤
- [ ] 不分发任何游戏文件

</details>

### 致谢

没有这些项目就没有 MeguLit：

- [LunaHook](https://github.com/HIllya51/LunaHook)：文本 Hook
- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) / EDRDG：日语词典数据
- [SudachiDict](https://github.com/WorksApplications/SudachiDict)：分词词典
- [Tauri](https://tauri.app/)：桌面宿主
- [Anki](https://apps.ankiweb.net/) 和 AnkiConnect
- [Tomoyo](https://github.com/46daishi/tomoyo)：最早的参考和灵感

### 许可证

GPL-3.0-or-later，见 [LICENSE](LICENSE)。第三方组件按各自的许可证

---

<a id="en"></a>

## English

### Why this exists

I wanted to learn Japanese by playing visual novels, and every tool I tried made me pick one: play the original game and alt-tab to a dictionary every other line, or float a separate window next to it while the game keeps showing its own text underneath, which is just uncomfortable to look at.

I didn't want either, so I built my own, mostly by vibe coding with AI. I use it every day and fix whatever annoys me.

The idea fits in one line: **it's still the same game, you just get to understand it.** Original text, translation, furigana, dictionary, AI explanations, a word list and Anki review all sit next to the game, so you never have to leave it.

The UI comes in Simplified Chinese, English and Japanese. It's mainly for Chinese and English speakers learning Japanese, but it works the other way round too, and more languages are coming.

### What works today

> "Works" means I've actually used it while playing. "Experimental" means it's wired up but only runs on some engines, or has only passed automated tests.

| Feature | Status | Notes |
|---|---|---|
| Text capture | Works | LunaHook under the hood; picks a text stream for you, and you can switch it |
| Reader overlay | Works | Alt+T menu; styles saved per game and tuned against the game screen |
| Typewriter effect | Works | Text appears letter by letter, the wait marker follows it |
| Furigana | Works | In-game ruby first, then dictionary and context; tricky layouts still being polished |
| Click-to-look-up | Works | Click a word or drag across a phrase; offline dictionary; clicks never advance the story |
| Live translation | Works | DeepL, Bing, Google, Gemini, DeepSeek, Sakura, Ollama, OpenAI-compatible APIs and more; keys encrypted locally |
| AI explanations | Works | Ask about the grammar and context of a word or a whole line |
| Word list | Works | Words, sentences, trash bin, reading stats |
| Anki | Works | Cards via AnkiConnect with a screenshot of the game + overlay and the original voice line; unvoiced narration gets local TTS; Anki handles scheduling |
| Library & launcher | Works | Folder and Steam scan, Japanese EXE detection, per-game Locale Emulator, series grouping |
| Backup & restore | Works | Full backup, rolls back if a restore fails |
| Embedded replacement | Experimental | Swaps the text inside the game itself. Can error or crash on some engines, so leave it off unless you're curious |
| Local models & TTS | Experimental | Needs a local GPU setup, lightly tested |
| Opening credits, chapter titles | Planned | |
| More learner languages | Planned | |

### The hard parts

The features aren't the hard part. Engines are:

- **Readable but not writable.** Many engines only expose read-only text. The writable stream often shares a function with scripts, resource names or the backlog, and writing to it crashes the game.
- **Fixes have to be general.** Patching one game is quick, but there are far too many games, so every fix has to hold for a whole family of engines.
- **Duplicates and missing lines.** Redraws, competing streams and ruby layouts cause both. Some lines really are repeated on purpose, so naive dedup is out.
- **Clicks leaking into the game.** Lots of games poll the mouse directly, so clicking the overlay also clicks the game.
- **Furigana layout.** It can't push lines apart, and it has to stay on its kanji through outlines, mixed scripts, typewriter reveal and high DPI.

### Roadmap

- [x] Click and drag lookup without advancing the story on major engines (tested in real games)
- [x] Furigana offset fully separated from line spacing
- [x] Lookup card pops up next to the click
- [x] Global text style from the main window, inherited by new games
- [ ] Keep script control strings and name variables out of reading and study data
- [ ] Judge embed safety per engine; find draw hooks that run after the script
- [ ] Tell a redraw from a line that's really said twice
- [ ] Keep the original text in the game's own backlog
- [ ] Openings, chapter titles, standalone subtitles
- [ ] Reproducible public builds and release packages
- [ ] More learner languages, plus light novels and games beyond visual novels

### Install

Grab `MeguLit-v1.0.0-win-x64.zip` (under 10 MB) from [Releases](https://github.com/ilynthn/MeguLit/releases/latest), unzip it and run `MeguLit.exe`.

On first launch a setup window asks you to pick one:

- **Lite**: about 107 MB. Reader overlay, translation and lookup work. The furigana dictionaries and voice engine can be added later under Settings → Speech / Dictionary.
- **Full**: about 565 MB, everything at once. Leave about 1.8 GB of disk space.

Local translation models are large and not in either pack; download them in Settings if you want them.

You'll need Windows 10/11 x64 and the Microsoft Edge WebView2 Runtime. For the Anki features, install Anki and AnkiConnect yourself.

### Build from source

```powershell
.\Build.ps1 -Check
```

Needs Rust (Tauri), Node.js and the .NET Framework C# compiler. Full steps will come once the build is reproducible.

### Thanks

[LunaHook](https://github.com/HIllya51/LunaHook) · [JMdict / EDRDG](https://www.edrdg.org/jmdict/j_jmdict.html) · [SudachiDict](https://github.com/WorksApplications/SudachiDict) · [Tauri](https://tauri.app/) · [Anki](https://apps.ankiweb.net/) & AnkiConnect · [Tomoyo](https://github.com/46daishi/tomoyo), where it all started

### License

GPL-3.0-or-later, see [LICENSE](LICENSE). Third-party components keep their own licenses.

---

<a id="ja"></a>

## 日本語

### つくった理由

ギャルゲーで日本語を勉強したかったのに、どのツールも「原作のまま遊んで、わからない単語は別ウィンドウで調べる」か「別ウィンドウを横に出す（でもゲームの原文もそのまま表示されていて、見ていてつらい）」かの二択でした

どちらも嫌だったので、自分で作ることにしました。ほとんど AI と一緒に Vibe Coding で作っていて、毎日自分で使いながら、気になったところを直しています

やりたいことはひとつだけ。**ゲームはそのまま、でも読めるようになる。** 原文、翻訳、ふりがな、辞書、AI 解説、単語帳、Anki 復習を、ゲームの横で全部済ませられます

UI は簡体字中国語・英語・日本語に対応。中国語・英語話者の日本語学習がメインですが、日本語話者が中国語や英語を学ぶのにも使えます

### いまできること

> 「使える」は実際にゲームで使っているもの、「実験的」は一部のエンジンでしか動かないか、自動テストしか通っていないものです

| 機能 | 状態 | 備考 |
|---|---|---|
| テキスト取得 | 使える | LunaHook ベース。ストリームは自動選択、手動切り替えも可 |
| 読書レイヤー | 使える | Alt+T でメニュー。作品ごとにスタイル保存、画面に合わせて調整 |
| タイプライター表示 | 使える | |
| ふりがな | 使える | ゲーム内ルビ優先、なければ辞書と文脈から |
| クリック辞書 | 使える | クリックで単語、ドラッグでフレーズ。オフライン辞書。クリックしても物語は進まない |
| リアルタイム翻訳 | 使える | DeepL、Bing、Google、Gemini、DeepSeek、Sakura、Ollama、OpenAI 互換 API など |
| AI 解説 | 使える | 単語や一文の文法・文脈を説明 |
| 単語帳 | 使える | 単語、例文、ゴミ箱、読書統計 |
| Anki | 使える | AnkiConnect 経由。スクショと原作ボイス付き、ボイスのない地の文はローカル TTS |
| ライブラリ・ランチャー | 使える | フォルダ・Steam スキャン、日本語版 EXE 判別、作品ごとの Locale Emulator、シリーズまとめ |
| バックアップ | 使える | 復元に失敗したら自動ロールバック |
| 埋め込み置換 | 実験的 | ゲーム内の文字を直接置き換える。エンジンによってはエラーやクラッシュあり |
| ローカルモデル・TTS | 実験的 | ローカル GPU 環境が必要 |
| オープニング・章タイトル | 予定 | |
| 学習言語の追加 | 予定 | |

### 難しいところ

- 書き込めるテキストストリームが、スクリプトやバックログと同じ関数を使っていることが多く、書き込むと落ちる
- 修正は特定の作品向けではなく、エンジン単位で通用するものにしたい
- 再描画による重複と取りこぼし。ただし、わざと繰り返される台詞は残したい
- マウスを直接見ているゲームでは、オーバーレイへのクリックがゲームにも届いてしまう
- ふりがなは行間を広げず、縁取りや高 DPI でも漢字の上にきちんと揃えたい

### インストール

[Releases](https://github.com/ilynthn/MeguLit/releases/latest) から `MeguLit-v1.0.0-win-x64.zip`（10 MB 未満）をダウンロードして展開し、`MeguLit.exe` を起動してください

初回起動時にセットアップ画面が出ます：

- **軽量版**：約 107 MB。読書レイヤー・翻訳・辞書が使えます。ふりがな辞書と音声エンジンは後から「設定 → 音声 / 辞書」で追加できます
- **完全版**：約 565 MB。すべて一度に入れます。空き容量は約 1.8 GB 必要です

Windows 10/11 x64 と Microsoft Edge WebView2 Runtime が必要です。Anki 機能を使うには Anki と AnkiConnect を入れてください

```powershell
.\Build.ps1 -Check
```

ソースからビルドするには Rust（Tauri）、Node.js、.NET Framework の C# コンパイラが必要です

### 謝辞

[LunaHook](https://github.com/HIllya51/LunaHook) · [JMdict / EDRDG](https://www.edrdg.org/jmdict/j_jmdict.html) · [SudachiDict](https://github.com/WorksApplications/SudachiDict) · [Tauri](https://tauri.app/) · [Anki](https://apps.ankiweb.net/) & AnkiConnect · [Tomoyo](https://github.com/46daishi/tomoyo)（すべての始まり）

### ライセンス

GPL-3.0-or-later。[LICENSE](LICENSE) を参照してください

---


<a id="support"></a>

## ♡ Support MeguLit

<div align="center">

和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了……(›´ω`‹ )

如果 MeguLit 为你的日语学习带来了一点帮助，欢迎赞助一点厄里斯，支持项目继续开发！

**每一份支持，都能让这场冒险走得更远 ヾ(≧▽≦*)o**

</div>

### 国内赞赏

<div align="center">
<img src="docs/assets/sponsor/support-card.png" width="720" alt="支付宝 / 微信赞赏码">
</div>

### International Support

<div align="center">

The battle against the Bug Demon King's army goes on, but my adventuring funds are running dangerously low... (›´ω`‹ )

If MeguLit has made your Japanese learning journey a little easier, consider tossing a few Eris into the adventurer's coin pouch!

Your support helps keep MeguLit free, open-source, and growing, one update at a time.

**Every little bit helps this adventure go a little further ヾ(≧▽≦*)o**

[![♡ Sponsor on GitHub](https://img.shields.io/badge/%E2%99%A1%20Sponsor%20on%20GitHub-c8323c?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ilynthn)

</div>

---

<div align="center">
<sub>Made by <a href="https://github.com/ilynthn">ilynthn</a> with love, caffeine, and a concerning number of bugs ✦</sub>
</div>
