<div align="center">

<img src="docs/assets/logo.png" width="480" alt="MeguLit">

<h3>Read the game, keep the game.</h3>

在 Galgame 里读日语的小魔导书 ✦

[![Version](https://img.shields.io/github/v/release/ilynthn/MeguLit?style=flat-square&label=version&color=e0a84b)](https://github.com/ilynthn/MeguLit/releases/latest)
[![Platform](https://img.shields.io/badge/Windows%2010%20%2F%2011-x64-3b2124?style=flat-square)](#zh-install)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-8b1e2d?style=flat-square)](LICENSE)
[![Sponsor](https://img.shields.io/badge/%E2%99%A1-Sponsor-c8323c?style=flat-square)](https://github.com/sponsors/ilynthn)

**[下载 v1.1.5](https://github.com/ilynthn/MeguLit/releases/latest)** &nbsp;·&nbsp; [简体中文](#zh) &nbsp;·&nbsp; [English](#en) &nbsp;·&nbsp; [日本語](#ja) &nbsp;·&nbsp; [常见问题](#faq) &nbsp;·&nbsp; [更新日志](https://github.com/ilynthn/MeguLit/releases) &nbsp;·&nbsp; [♡ 赞赏](#support)

<br>

<img src="docs/screenshots/home.jpg" width="900" alt="MeguLit 首页">

</div>

<br>

> [!WARNING]
> 还在积极开发中，功能、数据格式和界面随时可能变 &nbsp;·&nbsp; Still in active development &nbsp;·&nbsp; 開発中です

<br>

<a id="zh"></a>

# 简体中文

<a id="zh-new"></a>

## ✦ v1.1 新内容

| | |
|---|---|
| **自动更新** | 每次启动检查新版本，有就直接在后台下载。卡片上写着版本号、更新内容、安装包变大还是变小，进度条是真实的。下载完先校验，再由你选「重启并更新」或「稍后」。只换程序文件，游戏库、学习记录和设置都保留 |
| **默认背景** | 自带浅色、深色两张背景，跟着主题自动切换；设了自己的图片就用你的 |
| **学习统计** | 魔导书 × 毛玻璃风格重做。日历、本月读的书、字数走势、阅读时段、星期分布、阅读手感、常查的词，每一块都能单独切换年 / 月 / 周 / 日 |
| **空页面** | 句子、单词、回收站、历史为空时，告诉你这里会出现什么、怎么让它出现；词典首页列出你常查的词 |
| **v1.1.2** | 修好「重启并更新」：更新脚本改由 Windows 启动，不会再随 MeguLit 一起退出 · 更新卡片写明安装包具体大了 / 小了多少 MB |
| **v1.1.1** | 关闭游戏后主页停在半透明的问题从根上修好 · 本地模型缺运行组件时自动下载，阅读层直接写明原因，不再只显示「翻译暂不可用」 |
| **修复** | 部分电脑上「无法检查游戏是否已运行」导致游戏启动不了（Steam 游戏多见）· 关闭游戏后主窗口变半透明 · 多语言版游戏把日文、简中、繁中整串显示出来 · 日文原文还原认不出中日文路径下正在运行的游戏 · Rance02 匹配不到 VNDB |

> [!NOTE]
> v1.1.0 和 v1.1.1 的自动更新有 bug：点「重启并更新」后打开的还是旧版本。请手动下载 v1.1.5 覆盖安装一次，从 v1.1.2 开始就能正常自动更新了

<br>

## 为什么做这个

想靠 Galgame 学日语，可现有的工具都逼人二选一：要么玩原版，遇到生词就切出去查；要么在旁边外挂一个窗口，游戏里的原文照样显示，两份字叠在眼前

MeguLit 想做的只有一件事：**游戏还是那个游戏，只是你能读懂了**。原文、翻译、注音、查词、AI 讲解、生词本、Anki 复习，都在游戏旁边完成，不用来回切窗口

界面有简体中文、English、日本語。主要面向学日语的中文 / 英文用户，反过来用日语学中文或英文也可以

<br>

## 功能预览

### 游戏库

<div align="center">
<img src="docs/screenshots/library-search.gif" width="820" alt="游戏库搜索">
<br><sub>每打一个字母，不相关的封面就散开，剩下的排到中间</sub>
</div>

<br>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/library.jpg" alt="游戏库"></td>
<td width="50%"><img src="docs/screenshots/game-detail.jpg" alt="作品详情"></td>
</tr>
<tr>
<td><sub><b>游戏库</b> · 扫描文件夹和 Steam，系列作品自动归到一起</sub></td>
<td><sub><b>作品详情</b> · 简介、各站评分、阅读记录、关联单词和收藏的句子</sub></td>
</tr>
</table>

1. 第一次打开时选好放游戏的文件夹，MeguLit 会自动找出日文原版 EXE
2. 点封面进入作品详情，点「启动游戏」。需要转区的游戏可以单独开 Locale Emulator
3. 游戏启动后阅读层自动接上，按 <kbd>Alt</kbd> + <kbd>T</kbd> 呼出菜单

### 阅读层

浮在游戏上面，不抢焦点，点它也不会让剧情往下走

- **点一下**查单词，**拖一段**查短语，离线词典
- 注音优先用游戏自带的 ruby，没有再用词典和上下文
- 翻译支持 DeepL、Bing、Google、Gemini、DeepSeek、Sakura、Ollama 和 OpenAI 兼容接口，密钥加密存在本地
- 选中词或整句，让 AI 讲语法和语境
- 每部作品单独记字体、颜色和位置

### 历史

<table>
<tr>
<td width="50%"><img src="docs/screenshots/history.jpg" alt="阅读会话"></td>
<td width="50%"><img src="docs/screenshots/dialogue.jpg" alt="对话记录"></td>
</tr>
<tr>
<td><sub><b>阅读会话</b> · 每次玩了多久、读了多少字</sub></td>
<td><sub><b>对话记录</b> · 读过的每一句原文和译文</sub></td>
</tr>
</table>

### 学习

<table>
<tr>
<td width="50%"><img src="docs/screenshots/anki.jpg" alt="Anki 复习"></td>
<td width="50%"><img src="docs/screenshots/words.jpg" alt="单词本"></td>
</tr>
<tr>
<td><sub><b>Anki 复习</b> · 直接用 Anki 的卡片和调度，评分写回 Anki</sub></td>
<td><sub><b>单词本</b> · 查过的词、读音、释义和掌握程度</sub></td>
</tr>
</table>

<img src="docs/screenshots/stats.jpg" width="100%" alt="学习统计">

<img src="docs/screenshots/stats-trend.jpg" width="100%" alt="字数走势与阅读时段">

<p align="center"><sub><b>学习统计</b> · 阅读字数、时长、查词、日历、每部作品的阅读量、字数走势、阅读时段和星期分布</sub></p>

<table>
<tr>
<td width="50%"><img src="docs/screenshots/empty-state.jpg" alt="空页面"></td>
<td width="50%"><img src="docs/screenshots/tools.jpg" alt="工具"></td>
</tr>
<tr>
<td><sub><b>空页面</b> · 告诉你这里会出现什么、怎么让它出现</sub></td>
<td><sub><b>工具</b> · 日文原版恢复、修复内嵌替换</sub></td>
</tr>
</table>

- 在阅读层查词时点「制卡」，会带上游戏截图和原声；没配音的旁白用本地 TTS 补
- Anki 需要自己安装 Anki 和 AnkiConnect，MeguLit 可以一键装好 AnkiConnect

<br>

<a id="zh-kana"></a>

## 五十音

给零基础的人：先认得每一个假名，再到游戏里把它读出来

<img src="docs/screenshots/kana-home.jpg" width="100%" alt="五十音主页">

**学习 → 五十音 → 开始学习**。主页记住你学到哪一课，右边是平假名熟悉度

<table>
<tr>
<td width="50%"><img src="docs/screenshots/kana-lesson.jpg" alt="一课"></td>
<td width="50%"><img src="docs/screenshots/kana-chart.jpg" alt="五十音图"></td>
</tr>
<tr>
<td><sub><b>一课四步</b> · 认识 → 辨认 → 回忆 → 混合。笔顺、字源、例词，还有<b>你自己玩过的游戏里</b>含这个假名的台词</sub></td>
<td><sub><b>五十音图</b> · 平 / 片假名，清音、浊音、拗音；点格子看笔顺、发音要点和易混字</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-games.jpg" alt="假名游戏"></td>
<td><img src="docs/screenshots/kana-play-choice.jpg" alt="行段识别"></td>
</tr>
<tr>
<td><sub><b>假名游戏</b> · 三种玩法、四档难度，规则都写在面板上</sub></td>
<td><sub><b>行段识别</b> · 先按辅音字母选行，再按元音选段</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-results.jpg" alt="结算"></td>
<td><img src="docs/screenshots/kana-records.jpg" alt="学习手帐"></td>
</tr>
<tr>
<td><sub><b>结算</b> · 达成率、判定、答题轨迹和错题分析，一键错题再挑战</sub></td>
<td><sub><b>学习手帐</b> · 熟悉度、到期复习（1 → 3 → 7 → 21 天）、个人最佳</sub></td>
</tr>
</table>

<details>
<summary><b>玩法、难度和评分规则</b></summary>

<br>

| 玩法 | 怎么玩 |
|---|---|
| 行段识别 | 看到「き」，答出 か行 · い段。键盘先按 <kbd>k</kbd> 再按 <kbd>i</kbd> |
| 前后假名 | 按 あいうえお…わをん 的顺序说出前一个和后一个，空位直接跳过 |
| 平片转换 | 看平假名写片假名，反过来也一样。可以用日语输入法（<kbd>F7</kbd> / <kbd>F6</kbd>），也可以按 <kbd>K</kbd> 打开屏幕假名键盘 |

| 难度 | 规则 |
|---|---|
| 入门 | 只考学过的假名，不限时，每题可看提示 |
| 标准 | 全部清音，每题限时，整局 3 次提示 |
| 进阶 | 加入浊音、拗音和易混字，限时更短 |
| 挑战 | 总计 90 秒，错 3 次结束，没有提示 |

- 每道题是一个音符：普通假名算 TAP，最容易认错的几组（シ / ツ、ソ / ン、ぬ / め、ね / れ / わ…）算 **BREAK**，分量是 5 倍
- 答得快是 CRITICAL PERFECT，稍慢 PERFECT，再慢 GREAT；用了提示算 GOOD，答错或超时算 MISS
- 基础 100% 加 BREAK 奖励最多 1%，**满分 101.0000%**，评级从 SSS+ 到 D

快捷键：<kbd>Enter</kbd> 下一个，<kbd>Space</kbd> 发音，<kbd>←</kbd> <kbd>→</kbd> 切换假名，答题时按 <kbd>1</kbd>–<kbd>4</kbd>

</details>

<img src="docs/screenshots/kanji.jpg" width="100%" alt="汉字读音">

<sub><b>汉字读音</b> · 学完假名可以玩《漢字でGO!》。MeguLit 只是在窗口里原样打开 PLiCy 上的官方页面（作者 Micelle，含广告），<b>不是 MeguLit 的一部分</b>；不想在 MeguLit 里玩，可以点「在浏览器打开」</sub>

<br><br>

<a id="zh-install"></a>

## 安装

> [!IMPORTANT]
> **游戏剧情必须是日文原文**。MeguLit 读的是游戏正在显示的台词，剧情被汉化后读到的就不是日文。只汉化了菜单、剧情仍是日文的游戏不受影响；汉化版可以先试试「工具 → 日文原版恢复」

1. 去 [Releases](https://github.com/ilynthn/MeguLit/releases/latest) 下载 `MeguLit-v1.1.5-win-x64.zip`（约 18 MB），解压后运行 `MeguLit.exe`
2. 第一次启动会弹出安装窗口，二选一
   - **完整版**：下载约 565 MB，一次装齐注音词典和 AivisSpeech 语音引擎，需要约 1.8 GB 空间（推荐）
   - **精简版**：下载约 107 MB，能用阅读层、翻译和查词，其余组件以后在设置里补装
3. 选好放游戏的文件夹，等游戏库扫描完
4. 点一部作品 →「启动游戏」，**用窗口模式玩**
5. 零基础的话，先去 学习 → 五十音

装过旧版：用新文件覆盖旧的 MeguLit 文件夹即可，组件和数据都保留

需要 Windows 10 / 11 x64 和 Microsoft Edge WebView2 Runtime。本地翻译模型比较大，不在安装包里，需要时在设置里下载

<br>

<a id="faq"></a>

## 常见问题

<details open>
<summary><b>全屏玩的时候翻译显示不全，或者文字跑到了桌面上</b></summary>

<br>

请把游戏切到**窗口模式**。全屏（独占全屏）现在有 bug：游戏会盖住其他所有窗口，阅读层没法稳定地画在游戏上面。窗口模式下效果最好，窗口拉大一点也没关系

</details>

<details>
<summary><b>点「启动游戏」提示「无法检查游戏是否已运行」</b></summary>

<br>

v1.1.0 已经修复。旧版本在部分电脑上（多半是杀毒软件拦了进程查询）会这样，更新就好

</details>

<details>
<summary><b>读到的是乱码，或者根本不是日文</b></summary>

<br>

剧情必须是日文原文。汉化版先试试「工具 → 日文原版恢复」

</details>

<details>
<summary><b>更新会不会弄丢我的数据</b></summary>

<br>

不会。自动更新只替换程序文件，`data`、`logs`、`cache`、`runtime`、`models` 都不碰。旧的 `MeguLit.exe` 还会留一份 `MeguLit.rollback-update.exe`

</details>

<details>
<summary><b>Anki 连不上</b></summary>

<br>

先打开 Anki，并装好 AnkiConnect（MeguLit 里可以一键安装）。端口 8765 被别的程序占用也会连不上

</details>

<details>
<summary><b>某个游戏读不到文字</b></summary>

<br>

不同引擎差别很大。请在 [Issues](https://github.com/ilynthn/MeguLit/issues) 留下游戏名，最好附上 MeguLit 的 `logs` 文件夹

</details>

<br>

## 现在能做什么

| 功能 | 状态 | 说明 |
|---|:---:|---|
| 抓取游戏文本 | ✅ | 基于 LunaHook，自动挑文本流，不对可以手动换 |
| 阅读层 · 注音 · 点读 | ✅ | 游戏自带 ruby 优先；点读不推进剧情 |
| 实时翻译 · AI 讲解 | ✅ | 多家翻译和大模型接口，密钥加密存在本地 |
| 生词本 · Anki | ✅ | 单词、例句、回收站；制卡带截图和原声 |
| 游戏库 · 启动器 | ✅ | 扫文件夹和 Steam，自动认日文原版 EXE |
| 学习统计 | ✅ | 年 / 月 / 周 / 日，每块单独切换 |
| 自动更新 · 备份恢复 | ✅ | 只换程序文件；备份恢复失败自动回滚 |
| 五十音 | Beta | 25 课、五十音图、三个小游戏、学习手帐 |
| 内嵌替换 | 实验中 | 部分引擎会报错甚至闪退 |
| 本地模型与 TTS | 实验中 | 需要本地显卡环境 |

## 接下来

- [ ] **第四个假名小游戏：太鼓风节奏游戏**，随机用你装的 Galgame 的 BGM，检测 BPM 和鼓点，跟着节奏认假名
- [ ] 五十音学习的英文、日文界面
- [ ] 按引擎判断能不能安全内嵌；区分「重绘」和「真的又说了一遍」
- [ ] 保住游戏原生 LOG 里的原文；开场、章节标题、独立字幕
- [ ] 联网排行榜：阅读量、生词数、连续打卡天数
- [ ] 更多学习语言，以及 Galgame 以外的游戏

## 从源码构建

```powershell
.\Build.ps1 -Check
```

需要 Rust（Tauri）、Node.js 和 .NET Framework 的 C# 编译器

## 致谢

[LunaHook](https://github.com/HIllya51/LunaHook)（文本 Hook）· [JMdict / EDRDG](https://www.edrdg.org/jmdict/j_jmdict.html)（词典）· [SudachiDict](https://github.com/WorksApplications/SudachiDict)（分词）· [KanjiVG](https://kanjivg.tagaini.net/)（© Ulrich Apel，CC BY-SA 3.0，笔顺）· [AivisSpeech](https://aivis-project.com/)（语音）· [Tauri](https://tauri.app/) · [Anki](https://apps.ankiweb.net/) & AnkiConnect · [Tomoyo](https://github.com/46daishi/tomoyo)（最早的灵感）

推荐游戏：[漢字でGO!](https://plicy.net/GamePlay/155561)（Micelle · PLiCy），只是推荐，与 MeguLit 无关

GPL-3.0-or-later，见 [LICENSE](LICENSE)；第三方组件按各自许可证，见 [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="en"></a>

# English

**A small grimoire for reading Japanese inside visual novels.** The game stays the same game; you just get to understand it. Original text, translation, furigana, lookups, AI explanations, a word list and Anki review all happen next to the game, with no alt-tabbing.

### New in v1.1

| | |
|---|---|
| **Auto update** | Checks for a new release on every start and downloads it in the background, with the version, notes, size change and real progress. Only program files are replaced |
| **Default backgrounds** | A light and a dark one that follow the theme |
| **Statistics** | Redesigned; every panel switches between year / month / week / day |
| **v1.1.2** | "Restart and update" now really updates: Windows starts the update script, so it no longer exits with MeguLit |
| **v1.1.1** | Home no longer stays half transparent after a game closes · a local model with no runtime downloads it by itself and the overlay says why |
| **Fixes** | Launch failing with "could not check whether the game was running" · window staying half transparent after a game closes · multilingual builds showing every language track |

The updater in v1.1.0 and v1.1.1 reopens the old version, so download v1.1.2 by hand once; from v1.1.2 on it updates itself.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/library-search.gif" alt="Library search"></td>
<td width="50%"><img src="docs/screenshots/stats.jpg" alt="Statistics"></td>
</tr>
<tr>
<td><img src="docs/screenshots/kana-lesson.jpg" alt="Kana lesson"></td>
<td><img src="docs/screenshots/kana-results.jpg" alt="Kana results"></td>
</tr>
</table>

### Install

1. Download `MeguLit-v1.1.5-win-x64.zip` (about 18 MB) from [Releases](https://github.com/ilynthn/MeguLit/releases/latest), unzip it and run `MeguLit.exe`
2. Pick **Full** (about 565 MB, furigana dictionaries and the AivisSpeech voice engine) or **Lite** (about 107 MB)
3. Choose your game folder, pick a game and press *Launch*. Press <kbd>Alt</kbd> + <kbd>T</kbd> for the overlay menu

The game's story text must be the original Japanese. Needs Windows 10 / 11 x64 and the WebView2 Runtime.

### FAQ

- **Translations cut off, or text on the desktop in fullscreen?** Play in **windowed mode**. Exclusive fullscreen has a bug where the overlay cannot stay on top of the game.
- **"Could not check whether the game was running"?** Fixed in v1.1.0.
- **Does an update delete my data?** No. Only program files are replaced.

GPL-3.0-or-later · [LICENSE](LICENSE) · [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="ja"></a>

# 日本語

**ギャルゲーの中で日本語を読むための小さな魔導書。** ゲームはそのまま、でも読めるようになる。原文、翻訳、ふりがな、辞書、AI 解説、単語帳、Anki 復習を、ゲームの横で全部済ませられます

### v1.1 の新機能

| | |
|---|---|
| **自動アップデート** | 起動のたびに新しいバージョンを確認し、裏でダウンロード。バージョン、更新内容、サイズの増減、実際の進捗を表示。プログラムだけを置き換えます |
| **デフォルト背景** | ライト / ダークのテーマに合わせて切り替わる 2 枚 |
| **学習統計** | 作り直し。パネルごとに年 / 月 / 週 / 日を切り替え |
| **v1.1.2** | 「再起動して更新」で実際に更新されるよう修正 |
| **v1.1.1** | ゲーム終了後にホームが半透明のまま残る問題を根本修正 · ローカルモデルの実行環境がない場合は自動でダウンロード |
| **修正** | 「ゲームが起動中か確認できません」で起動できない問題 · 終了後にウィンドウが半透明になる問題 · 多言語版で全言語の文が出る問題 |

v1.1.0 と v1.1.1 の自動更新には不具合があるため、今回だけ手動で v1.1.2 をダウンロードしてください。v1.1.2 からは自動で更新されます

<table>
<tr>
<td width="50%"><img src="docs/screenshots/kana-home.jpg" alt="五十音"></td>
<td width="50%"><img src="docs/screenshots/kana-records.jpg" alt="学習手帳"></td>
</tr>
</table>

### インストール

1. [Releases](https://github.com/ilynthn/MeguLit/releases/latest) から `MeguLit-v1.1.5-win-x64.zip`（約 18 MB）をダウンロードして展開し、`MeguLit.exe` を起動
2. 初回セットアップで **完全版**（約 565 MB）か **軽量版**（約 107 MB）を選択
3. ゲームフォルダを選び、作品を選んで「ゲーム起動」。<kbd>Alt</kbd> + <kbd>T</kbd> でメニュー

シナリオ本文は日本語原文である必要があります。Windows 10 / 11 x64 と WebView2 Runtime が必要です

### よくある質問

- **フルスクリーンで翻訳が欠ける・文字がデスクトップに出る**：**ウィンドウモード**で遊んでください。排他フルスクリーンには不具合があります
- **「ゲームが起動中か確認できません」**：v1.1.0 で修正済みです
- **アップデートでデータは消える？**：消えません。プログラムだけを置き換えます

GPL-3.0-or-later · [LICENSE](LICENSE) · [THIRD-PARTY.md](THIRD-PARTY.md)

<br>

---

<a id="support"></a>

<div align="center">

# ♡ Support MeguLit

和 Bug 魔王军的战斗还在继续，冒险经费倒是快见底了……(›´ω`‹ )

如果 MeguLit 为你的日语学习带来了一点帮助，欢迎赞助一点厄里斯，支持项目继续开发！

**每一份支持，都能让这场冒险走得更远 ヾ(≧▽≦*)o**

<br>

<img src="docs/assets/sponsor/support-card.png" width="680" alt="支付宝 / 微信赞赏码">

<br><br>

MeguLit is free, open source, and built in my spare time.<br>
If it helped you read a few more lines in Japanese, a small sponsorship keeps the updates coming.

[![Sponsor on GitHub](https://img.shields.io/badge/Sponsor%20on%20GitHub-c8323c?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/ilynthn)

<sub>Every Eris counts ♡</sub>

</div>

---

<div align="center">
<sub>Made by <a href="https://github.com/ilynthn">ilynthn</a> with love, caffeine, and a concerning number of bugs ✦</sub>
</div>
