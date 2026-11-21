# Cardinal（阅读层回放打分）

Cardinal 回答一个问题：这份种子在玩家机器上到底好不好。玩家的 MeguLit 在后台把这局的最近 N 句放进一个隐藏阅读层重放一遍，按玩家实际看到的东西打 7 项分，分数存本机，开了「共享适配」就传到 relay；服务器按多人的分数把自动差分升成已核实（relay/src/cardinal.js）。

## 跑的是什么

```
磁带（这局两个原生桥说过的话）/ 店主日志 / 运行时样本
   └─ core/cardinal/timeline.cjs ─> 时间轴
        GalWindowBridge 假进程 stdout ─┐
        HookBridge 假进程 stdout ──────┤
                                       v
 services/runtime.cjs -> bridge.cjs dispatch -> services/reader.cjs -> core/gal-native.cjs
   -> core/hook-native.cjs (+ overlay-placement, engine-draw 控制文件) -> 'reader-event'
   -> web/reader/index.html（module-list 全部模块，隐藏阅读层）
   -> web/reader/replay-probe.js 每 sampleMs 量一次页面
   -> core/cardinal/checks.cjs + score.cjs 打分
```

只假进程 / 系统边界：两个原生桥（stdout = 时间轴上的记录，stdin 被收下：`hitRegions` 就是点击区域的真值）、pid→exe、翻译服务（固定中文：不联网、不花 API 额度）、分词运行时（不装，绝不下载）。中间一行不替身（教训 9：回放必须跑完整条链）。

隐藏阅读层 = 无头 Microsoft Edge（`services/cardinal/cdp.cjs`，Node 自带 WebSocket 直接走 DevTools 协议，不用 Playwright，不下载任何东西），和 App 的 WebView2 是同一个 Chromium。不开窗口，用户资料目录是临时的，跑完整个进程树一起关、目录删掉。驱动进程（`services/cardinal/driver.cjs`）低于正常优先级，Edge 继承它。回放有自己的临时 MeguLit 根目录（只拷玩家的 `data/config`，不拷 secrets / 账号 / 学习库），relay 关掉，两个上传开关关掉，所以回放里发生的任何事（包括读模式切换）都只是被量的对象，碰不到玩家正在跑的阅读层、游戏和任何模式。

连接和单次 CDP 请求都有超时；启动浏览器后若目标发现、WebSocket 连接或页面初始化失败，会关闭连接、终止该子进程树并等待子进程 close，再清本次创建的临时 profile。显式传入 userDataDir 的目录由调用方拥有，不删除。close 可重复调用，卡住的 Browser.close 会转为有界终止；进程没关掉或自有 profile 清理失败会明确报错，driver 将其记入 errors，不能作为可靠票上传

## 什么时候跑（services/cardinal.cjs）

- 游戏会话结束（`gameClosed`）：一定跑
- 自动校准完成（self-check-live 第一个窗口记完校准）、或者已校准的游戏自检完成第一个窗口：最多每 `cardinal.minIntervalMin` 分钟一次
- 一次只跑一个，最多等待 8 个不同游戏；同 root/版本 SHA 的等待任务只保留最新一份，其他游戏按 FIFO 处理。满队列返回 `deferred / queue full` 并记 trace，不假称已排队，后续有效 kick 可重试。回放进程里不会再触发 Cardinal（`MEGULIT_CARDINAL_REPLAY=1`）
- 少于 10 句不跑
- 机器忙（回放每步开始比预定晚，95 分位超过 `cardinal.maxLagMs`，默认 80ms）：这次量的是机器不是种子，只存本机、标 `unreliable`、不上传，以会话结束那次为准。实测单跑 p95 约 16ms，5 个回放同时跑 49–184ms

磁带（`core/cardinal/tape.cjs`）：GalNative / HookNative 收到的每条桥记录（除了心跳、指针 / 层记账、截图，单条超 64 KB 不要）都记在内存里，保留 `cardinal.lines` + 20 句，冲出去的 attach 记录（ready / bound / layout / hookProcess / hookThreads）留作头。不落盘、不上传；回放时给子进程写一份临时副本，跑完删掉。新的游戏进程 = 新磁带。

结果：`data/The Seed/cardinal/<exe sha256>.json` = `{record, why, applies, below, detail, ms, errors, sent}`。hook-events.log 写 `cardinal replay …` / `cardinal scored key=… total=… …`。

## 七项分（core/cardinal/score.cjs，纯函数）

| 分 | 看什么 | 怎么算 |
|---|---|---|
| row (1) | 日文行在、可点（在 hitRegions 里、pointer 不是 none） | 合格句 / 句 |
| stable (2) | 位置稳：日文行 y 不抖（≤ stablePx）、中文不压到日文上（≤ cnOverlapPx） | 合格句 / 句 |
| clean (3) | 没有白字 / 不可点 / 非本行颜色的日文、没有补画层、离开的句子不回来、一句只有一个渲染者、一句不画两遍 | 可见日文覆盖率 × (1 − 坏样本率) × (1 − (回来 + 多渲染者) / 句) |
| clear (4) | 清屏 / 换页对：游戏清了页之后旧句不在；没清页时旧句只能在自己那一行（两行页），不能和当前句挤在同一行 | 合格换句 / 换句 |
| choice (5) | 窗口桥在画面上找到了选项（choice ocr found），阅读层在 choiceMs 内拿到并显示、点得到（或者游戏自己画选项：KiriKiri 选项框）；core 拿名字 / 旁白去找、什么都没找到的不算选项 | 合格 / 选项次数 |
| pair (6) | 显示出来的日文句有中文行 | 有中文 / 显示的句 |
| leak (7) | 原文漏出：桥自己的隐藏检查读到日文、隐藏开着时游戏把对白画成可见、隐藏被关 / 让开 / 读模式期间显示的句 | 1 − 最大比例 |

每项 0–1。没东西可看的项（没出选项、只有一句）记 1，不进 total。total = 适用项的加权平均，上限是应显示正文的稳定样本里实际显示日文的比例；菜单和正在显示选项的样本不计入这个比例。该比例同时写入本机 detail.visibility，整页无日文时总分为 0，不能因为无字可检查而获得“干净、稳定、清页”的加分。合并多局时也保留这一上限。

修订 3 另按桥已送出的非跳读日文源句计算 `detail.sourceCoverage`。源句未在 DOM 中持续出现、hookSource 消失或采样全丢，都留在预期分母；总分还受已观察源句比例限制。没有观察到正文时总分为 0，不能再把缺失数据当成全部合格

修订 4 同时核对正文的内容和顺序。打字过程可显示正确前缀，但这一源句的稳定样本中必须出现完整正文，两个字只能完成本来就两个字的句子。只看 line 字形，忽略中文行、姓名旁路、选项和 ruby 读音。probe 记录字形节点自己的文本，避免把 ruby 子节点读音混进底字，正文上限 4000 字符与 native source 上限一致

新 driver 为每条 hookSource 写 `sourceEpisodes`，含输入 step/line/text 和实际投递时的 elapsed at，评分只用本次投递至下次投递之间的 DOM。每条输入 hookSource 必须恰好对应一条同文本、同 step/line 的投递记录，at 有限、非负且单调，缺失、重复、乱序均标不可靠。输入 epoch 时间不与压缩回放时钟混用。旧观察没有投递映射时，只能按 hookSource 跃迁顺序单次消费样本组，标 `detail.timeline.reliable=false`；服务只存本机，不上传这种兼容评估。重复台词没有新的样本组就缺测，不能复用上一轮

规则全在 profile 里：`core/profiles/defaults.cjs` 的 `cardinal.*`（rev、lines、maxGapMs、sampleMs、minIntervalMin、weights.*、thresholds.*），值域登记在 `core/profiles/domains.cjs`，所以官方签名差分能按游戏调权重和阈值，热更新，不改代码。改了规则就把 `cardinal.rev` 加一（记录里的 `cardinalRev`）。这里只有数字，没有任何用户偏好（字体、颜色、字号、位置）。

## 上传（services/auto-profile-feed.cjs reportScore）

`POST /api/cardinal/score`，body 就是这条记录（字段名服务器定死，不许改）：

```json
{"schema":"megulit.cardinal-score","version":1,"key":"<exe sha256>","seedRev":"v1.g6","source":"official",
 "app":"1.4.23","lines":60,"scores":{"row":1,"stable":1,"clean":1,"clear":1,"choice":1,"pair":1,"leak":1},"total":1,"cardinalRev":"1","at":"<ISO>"}
```

- 开关：和校准上传同一个（共享适配 `sharedAdaptation` + `autoProfileShare`），关了就只存本机
- 没送到的分数保留 `sent:false` 和本机 `upload.state/status`，跟着下一次校准 `report()` 重试；送达后才标 `sent:true`
- 回放报错但仍有部分样本，标 `unreliable`、只存本机；完全没 DOM 样本或驱动拒绝，记本机 `failed.errors`，不上传。队列继续处理下一次会话，`idle()` 等当前及所有等待作业完成
- 不带任何身份：没有用户名、路径、机器、Steam、IP 之类的字段
- source：official = 我们的差分（relay 官方或内置 The Seed）；auto = 玩家共识差分、本机校准或本机降级；none = 什么差分都没有。seedRev = 生效差分的版本层 `v<rev>` / 游戏层 `g<rev>`（如 `v1.g6`），只有本机校准时为 null

## 开发用

| 文件 | 作用 |
|---|---|
| `services/cardinal/run.cjs` | `replay(scenario, {data, work, low, timeoutMs, keep})`：起一个驱动子进程，超时整棵进程树一起杀 |
| `services/cardinal/driver.cjs` | `node driver.cjs <scenario.json> <out.json>`；环境变量 `MEGULIT_REPLAY_DATA`（含 `config/` 的目录）、`MEGULIT_REPLAY_WORK`、`MEGULIT_REPLAY_KEEP`、`MEGULIT_CARDINAL_LOW`、`MEGULIT_CARDINAL_BROWSER`（指定浏览器） |
| `core/cardinal/timeline.cjs` | `fromTape(rows, game)`；日志：`extract(logsDir, fromIso, toIso)`、`attachSteps(game, t)`、`timeline(ex, game, {actions})` |
| `core/cardinal/checks.cjs` | 每部游戏都要过的断言（海馆验收 1 2 3 4 5 8 9 10 原样搬来）+ clear / choice / leak |
| `web/reader/replay-probe.js` | 页面里量：每个可见日文字的位置 / 颜色 / pointer、中文行（盒子 + 文字实际范围 ink + 字号：中文字体内容区比字号高，压没压到日文按字身算）、各 `.sentence-window`、选项层、body class |
| `tools/reader-replay/krkr-model.cjs` | 从日志重建时间轴时 KiriKiri 控制文件的脚本侧（只在仓库里，磁带用不到） |
| `tools/cardinal.cjs` | 命令行：`--tape <jsonl>` 或 `--logs <dir> --from --to`，`--game <json>`、`--data <dir>`、`--out <file>` |
| `validation/fixtures/games/<game>/acceptance.case.cjs` | 一部游戏的验收：通用断言用 checks.cjs，游戏专属断言留在这里 |
| `validation/cardinal.test.cjs` | 打分、规则走 profile、磁带、记录字段、上传开关、后台跑不碰模式（不开浏览器） |

### 时间轴的来源

- 磁带：`{t, gwb|hb}` 一行一条；旧的 `MEGULIT_HOOK_RECORD` 录音 `{t, m}` 也能直接用（按类型分给两个桥，缺 attach 时补一个 1280×720 的游戏）。磁带就是游戏做过的事，所以 `models:false`
- 店主日志 / 运行时样本（`data/runtime-samples/<key>/` 同名三个文件）：对白原文只在 engine-draw.log（KiriKiri ToMe_CHARS）里有，hook-events.log 只记字数，所以日志重建只适用于 engine-draw 游戏；KiriKiri 文字渲染路径的 `line=100000+n` 在窗口里没有消息层行时算对白（千恋＊万花）

日志带不出新构建会让游戏怎么做时，用模型（只在从日志重建时开），代码里都标 `MODEL`：

- KiriKiri 脚本在 core 开着隐藏时把对白行报成 `hidden=1`，关掉时报 `hidden=0`（`scenario.adaptiveHidden=false` 可关）
- 点击时游戏是否清页：下一句起在同行或更上 = 换页，脚本自己的 `st.clearSent` 上报（仅控制文件有 `#clearline` 时）
- OCR 艺术字：日志只留拼起来的文字，同一短语重复 k 次视为 k 行

### scenario.json

```json
{"game":{"pid":42452,"started":"…","hwnd":"…","sha":"<exe sha256>","title":"…","process":"fata_jp","exe":"D:/Games/…",
         "layout":{"clientWidth":804,"clientHeight":604,"clientX":462,"clientY":264,"readerX":535,"readerY":782,…},
         "stream":{"id":"575310:0:0","name":"Krkr2wcs","code":"…"}},
 "steps":[{"t":1795232137000,"gwb":{…}},{"t":…,"hb":{"type":"hookChars","line":"ToMe_CHARS …"}},
          {"t":…,"page":"()=>{…}"},{"t":…,"mark":"click@…"},{"t":…,"choicePage":"…"}],
 "maxGap":1500,"sampleEvery":90,"models":true,"tailMs":0}
```

`out.json`：`lag`（回放落后：stepP95 / stepMax / sampleP95 / sampleMax）、`samples`（每个 mark 和每 `sampleEvery` 毫秒一份页面测量，带当时的 `hitRegions`）、`hookEvents`、`readerHost`、`hbSent`（core 发给 HookBridge 的）、`choiceOffers`（core 给阅读层的选项，带撤下的时间 until）、`hidden`（隐藏开着时对白记录可见的行数）、`control`（控制文件内容）、`krkr`、`errors`。

## 两行页（page.engineRows）

core/overlay-placement.cjs `rows()`：引擎按行报坐标的游戏，一句在没清页（引擎的清页上报）且起始在已有行下方时并入同一页，否则开新页；页经 textPlacePage 交给阅读层的页模型（每句在自己的格子上，旧行是带 ruby 的克隆、可点读）。true = 每句都走页（只有海馆 seed 开），null = 只有叠行时才组页、单行时回到行模型，false（内核默认，一个游戏的修复不改别的游戏）= 不组页。判定写进 hook-events（`placement page: … goes on the page under … / starts a new page / cleared by the game`）。非 KiriKiri 的夹具：validation/fixtures/games/baldr-sky/two-row-page.case.cjs

## 海馆（第一个用户）

店主 2026-11-21 日志（`validation/fixtures/games/fata-morgana/owner-20261121/`）三段并行：dialogue 03:35:30–03:36:45（20+ 句、校准、女仆选项页）、art 03:31:50–03:32:32（聖なるかな）、advance 02:56:30–02:58:20（02:57 录屏那段推进）。12 条验收用 Cardinal 跑（`MEGULIT_FATA_ACCEPT_OUT=<file>` 写逐条结果和三段的 Cardinal 分数）。

真实会话的 pair 分数使用 Reader 已输出的日文与实际缓存成功的译文计数，允许迟到译文回填；回放提供者的固定译文只用于布局，不作为实际配对证据。此计数留在本机，上传仍只有七项分数。

## 后台资源与退出确认

产品自动 `kick` 先经 `background-budget.wait` 等真正空闲，再登记自己的 `background-games.track`，按 release 函数身份仅排除自身，重新检查输入、供电、全屏、CPU、播放状态和其它后台任务。用户启动游戏或低频复查发现不再空闲时取消；driver 的 `close` 和进程树停止均确认后才可重试，最多三次活动中断，之后明确 deferred，等下次 kick

显式 CLI 回放直接调用 runner；调度单元测试显式 `manual:true`，不借测试注入默默绕过产品空闲门

runner 不以 `exit` 代替 `close`。正常退出还须 driver 写入 `cleanupComplete:true`；缺确认、浏览器关闭失败、目录清理失败或进程树停止失败，都会保留自有目录并在本机 `data/The Seed/cardinal/blocked.json` 记录 PID、路径与原因，暂停自动队列及后续 kick。核查进程与自有目录后再由维护者正常恢复，不自动删除标记或不断新开浏览器。非 Windows 强停缺少可靠的树退出确认，保守进入同一阻塞状态

`validation/cardinal-background.test.cjs` 只做进程/传输边界故障注入，不启动 Edge；真实隐藏阅读层及游戏验收另行排队
