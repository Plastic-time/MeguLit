# Reader replay（整套阅读层无头回放）

一部游戏的验收：把店主的真实日志（或探针 / 运行时样本包、冷测试录制）按时间喂给 MeguLit 的整条链，在真阅读页面上量店主看到的东西。

## 跑的是什么

```
日志 / 样本包 ──> GalWindowBridge 假进程 stdout ─┐
                 HookBridge 假进程 stdout ───────┤
                                                 v
 services/runtime.cjs -> bridge.cjs dispatch -> services/reader.cjs -> core/gal-native.cjs
   -> core/hook-native.cjs (+ overlay-placement, engine-draw 控制文件) -> 'reader-event'
   -> web/reader/index.html（module-list 全部模块，无头 Edge）
```

只假进程 / 系统边界：两个原生桥（stdout = 日志里的记录，stdin 被收下：`hitRegions` 就是点击区域的真值）、pid→exe、翻译服务（固定中文）、分词运行时（不装，绝不下载）。中间一行不替身。

日志带不出新构建会让游戏怎么做时，用模型，代码里都标 `MODEL`：

- KiriKiri 脚本在 core 开着隐藏时把对白行报成 `hidden=1`，关掉时报 `hidden=0`（`scenario.adaptiveHidden=false` 可关）
- 点击时游戏是否清页：下一句起在同行或更上 = 换页，脚本自己的 `st.clearSent` 上报（仅控制文件有 `#clearline` 时）
- OCR 艺术字：日志只留拼起来的文字，同一短语重复 k 次视为 k 行

KiriKiri 那一侧（`tools/reader-replay/krkr-model.cjs`）：从 `native/krkrtext/KrkrText.cpp` 的 MakeCtlPath 和 `script.inc` 的 `st.ctl / clearSent / choicePage / uiDraw` 原样取出，机械地 TJS→JS 后去读 core 真写出来的控制文件，不往脚本里直接塞配置。

## 文件

| 文件 | 作用 |
|---|---|
| `tools/reader-replay/driver.cjs` | 一次回放（一个子进程，`MEGULIT_ROOT` 指向临时根）：`node driver.cjs <scenario.json> <out.json>`，环境变量 `MEGULIT_REPLAY_DATA`（含 `config/` 的设置目录）、`MEGULIT_REPLAY_WORK`、`MEGULIT_PLAYWRIGHT`、`MEGULIT_REPLAY_KEEP` |
| `tools/reader-replay/from-logs.cjs` | 日志 → 时间线：`extract(logsDir, fromIso, toIso)`、`attachSteps(game, t)`、`timeline(ex, game, {actions})` |
| `web/reader/replay-probe.js` | 页面里量：每个可见日文字的位置 / 颜色 / pointer、中文行、各 `.sentence-window`、选项层、body class |
| `tools/reader-replay/krkr-model.cjs` | 控制文件的脚本侧 |
| `validation/fixtures/games/<game>/acceptance.case.cjs` | 这部游戏的验收（games-regression 会跑；`MEGULIT_FATA_ACCEPT=0` 跳过；`MEGULIT_FATA_ACCEPT_OUT=<file>` 写逐条结果） |

### scenario.json

```json
{"game":{"pid":42452,"started":"…","hwnd":"…","sha":"<exe sha256>","title":"…","process":"fata_jp","exe":"D:/Games/…",
         "layout":{"clientWidth":804,"clientHeight":604,"clientX":462,"clientY":264,"readerX":535,"readerY":782,…},
         "stream":{"id":"575310:0:0","name":"Krkr2wcs","code":"…"}},
 "steps":[{"t":1795232137000,"gwb":{…}},{"t":…,"hb":{"type":"hookChars","line":"ToMe_CHARS …"}},
          {"t":…,"page":"()=>{…}"},{"t":…,"mark":"click@…"},{"t":…,"choicePage":"…"}],
 "maxGap":1500,"sampleEvery":90}
```

`out.json`：`samples`（每个 mark 和每 `sampleEvery` 毫秒一份页面测量，带当时的 `hitRegions`）、`hookEvents`、`readerHost`、`hbSent`（core 发给 HookBridge 的）、`control`（控制文件内容）、`krkr`（脚本侧读到的 cfg、清页次数、选项页判定）、`errors`。

## 两种宿主（店主 2026-11-21）

最终要在用户电脑上跑：用户的 MeguLit 用自己的阅读层（隐藏的 WebView 实例，不显示）把运行时样本 / 冷测试录制重放一遍，按 DOM 级断言给种子候选打分，只回传分数（不传截图）。所以分两层：

- 页面侧（`web/reader/`，随 web 热更新）：`replay-probe.js` 量页面（`window.__replayProbe()`），断言也要放到这里（下一步 `web/reader/replay-checks.js`，纯函数：样本序列 → 逐条结果），不依赖 Playwright 或仓库外工具
- 驱动侧：开发时是 `tools/reader-replay/driver.cjs`（无头 Edge + 假原生桥）；App 里是 services 侧驱动（同样把样本包的记录当两个原生桥的输出喂给 GalNative / HookNative，把 'reader-event' 发给隐藏阅读层，按时间轴取 `__replayProbe()`），两者共用 `from-logs.cjs` 的时间线格式

## 通用断言（每部游戏都该过）

日文行在游戏的位置、可点（在 hitRegions 里）；中文在日文下、日文 y 不被顶动；推进不闪（不画补画层、离开的句子不回来）；连推 20 句不丢功能、不让开隐藏；不进读模式；一句只有一个渲染者；画面上没有不可点或非游戏色的日文；校准后日文 1 秒内还在、不重启 / 不换流。

现在这些断言写在海馆的 `acceptance.case.cjs` 里。下一步（未做）：抽到 `tools/reader-replay/checks.cjs`，加一个 `tools/reader-replay/run.cjs <seed 目录> <日志或样本包>`，读 seed 的 profile、按 docs/auto-profile.md / docs/cold-test.md 的样本包格式建时间线，跑通用断言 + seed 旁 `acceptance.case.cjs` 的游戏专属断言，输出逐条结果，给 diff-maker / 冷测试 / 服务器判 verified 用。

## 两行页（page.engineRows）

core/overlay-placement.cjs `rows()`：引擎按行报坐标的游戏，一句在没清页（引擎的清页上报）且起始在已有行下方时并入同一页，否则开新页；页经 textPlacePage 交给阅读层的页模型（每句在自己的格子上，旧行是带 ruby 的克隆、可点读）。true = 每句都走页（海馆），null（默认）= 只有叠行时才组页、单行时回到行模型，false = 不组页。判定写进 hook-events（`placement page: … goes on the page under … / starts a new page / cleared by the game`）。非 KiriKiri 的夹具：validation/fixtures/games/baldr-sky/two-row-page.case.cjs

## 海馆（第一个用户）

店主 2026-11-21 日志（`validation/fixtures/games/fata-morgana/owner-20261121/`）三段并行：dialogue 03:35:30–03:36:45（20+ 句、校准、女仆选项页）、art 03:31:50–03:32:32（聖なるかな）、advance 02:56:30–02:58:20（02:57 录屏那段推进）。
