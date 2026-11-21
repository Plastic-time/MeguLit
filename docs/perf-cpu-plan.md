# MeguLit 打开后 CPU 温度高：原因调查和降耗方案

> 2026-11-21 调查。**只读代码得出，没有开过 MeguLit，没有任何实测数字。** 凡是「省多少」都是估计，写明了依据；第 4 节给了怎么量。
> 状态词：**已核实** = 我读到了代码并确认它在空闲时会跑；**推测** = 合理但没有完整追到；**未知** = 读代码判断不了。

## 0. 一句话结论

没有哪一个地方在「死循环烧 CPU」。热量是**几件事叠起来**：

1. 首页和游戏库一直在动、还铺了很多层毛玻璃（`backdrop-filter`），显卡每一帧都在重算模糊，而且**没有任何「窗口没人看就停」的总开关**；
2. 阅读窗口（reader）在启动时就被偷偷建好，里面十来个 100–700 毫秒的定时器，加上原生的 GalWindowBridge 一直在转，哪怕没有游戏；
3. 启动后几分钟内一批后台任务叠在一起（库扫描、脚本预热、语音扫描、Anki 自启、更新/探针），以及「闲时冷测试」会在后台真的把游戏跑起来。

WebView2 的启动参数没有问题（没有关 GPU、没有关后台节流，已核实）。

## 1. 先看懂：MeguLit 由哪几个进程组成

| 进程 | 干什么 | 什么时候在跑 |
|---|---|---|
| `MeguLit.exe`（Tauri 外壳，Rust） | 开窗口、托盘、单实例 | 一直 |
| `msedgewebview2.exe`（多个） | 真正画界面的浏览器内核：首页窗口 + 阅读窗口各一套，另有一个 GPU 进程 | 一直 |
| `node.exe`（`services/server.cjs`） | 后端，所有「服务」都在这里；只有一个常驻进程，前端调用只是写管道，不会每次新开进程（已核实，`desktop/src/broker.rs:16-19`） | 一直 |
| `GalWindowBridge.exe` 等原生助手 | 盯着游戏窗口、画覆盖层 | 阅读窗口连上后就在（见 2.2） |
| 子进程/线程（探针、冷测试、Anki、PowerShell） | 后台任务 | 看下面的触发条件 |

判断「是谁在热」最简单：任务管理器按 CPU 排序，看是 `msedgewebview2`（界面/GPU）、`node.exe`（后端）、`GalWindowBridge`（原生），还是 `Anki`/`ColdCapture`/游戏本身。**这一步决定先修哪一条**，见第 4 节。

## 2. 原因，按可能性排序

### 2.1 首页/游戏库的持续动画 + 毛玻璃（界面进程和 GPU）——最可能

| # | 位置 | 做什么 | 状态 |
|---|---|---|---|
| A1 | `web/home-tv.css:158` | 首页后面常驻一整块全窗口 `backdrop-filter: blur`。上面任何东西动，整窗模糊都要重算 | 已核实存在；影响大小为推测 |
| A2 | `web/app.css:47`、`web/unify.css`（19 处）、`web/card-wall.css:128,227` | 每张游戏卡、统计卡、侧栏都带 `backdrop-filter` | 已核实存在 |
| A3 | `web/home-depth.js:41-64` | 首页视差「呼吸」：`requestAnimationFrame` 永远在重排下一帧，从不进入休眠，哪怕速度已经为 0；窗口隐藏时会停（`:60`），但**窗口可见却没人动**时不停 | 已核实 |
| A4 | `web/library-drift.js:100-148` + `:52` | 游戏库「多轨」视图：每帧给每张封面算物理并写样式；每张封面还自带随深度变化的 `filter: blur(…)`，同时又在不停位移，GPU 每帧重新栅格化。**整个文件没有 `document.hidden` 判断**（已 grep 核实）。只有进入「多轨」视图才会跑（默认视图是「墙」`web/app.js:54`，墙的循环是按需的，空了就停 `web/card-wall.js:59`） | 已核实（循环和 blur）；是否影响用户取决于用的视图 |
| A5 | `web/grimoire.js:266-272` | 轨道视图的无限 `requestAnimationFrame`，同样没有隐藏判断 | 子调查读到，我未逐行复核 |
| A6 | `web/dict-idle.js:65,105` | 词典页：最多 110 个字符精灵的全屏 canvas，每帧做 O(n²) 重叠计算；不检查 `document.hidden`。只在打开词典页时跑 | 子调查读到 |
| A7 | `web/rite-stage.js:321`、`web/element-fx.js:91` | 隐藏时**重新排下一帧**而不是停（只跳过绘制）；`ctx.filter=blur` 走软件路径 | 子调查读到；仅在对应特效显示时 |

**共同缺口（已核实）：** 没有全局「暂停动画」机制。`web/fx-prefs.js`、`web/fx-settings.js` 只管单个特效的开关和强度；没有「窗口失焦」「用户 N 秒没动」「电池」的概念。窗口被别的窗口完全盖住时，WebView2 自己会降帧，但「窗口还露着一点」或「游戏在前台、MeguLit 在旁边」时一直满帧。

### 2.2 阅读窗口启动时就被建好，里面一堆定时器 + 原生桥一直在转——很可能

- 已核实：`web/app.js:1336` 在启动时 `invoke('reader_open',{background:true})`，阅读窗口（又一整套 WebView2）在没有游戏时就被创建（隐藏）。
- 已核实：阅读窗口里的前端代码有大量常驻定时器，**都不看 `document.hidden`**：`web/reader/modules/inject.js:215`（100 ms）、`wait-marker.js:34`（150 ms）、`background.js:315`（600 ms）和 `:386`（120 ms）、`color-picker.js:90`（400 ms + 整个 body 的 `MutationObserver`）、`polish.js:145`（400 ms）、`box-preview.js:31`（700 ms）、`gal.js:800`（1 s）。
- **未知：** 这个隐藏的 WebView2 会不会被浏览器当成「后台页」自动把定时器降到 1 秒一次。Chromium 在页面不可见时会这么做，但 Tauri 隐藏窗口是否把可见性通知给 WebView2，读代码判断不了（`desktop/src` 里没有显式设置）。**如果没有降频，这是白白的持续唤醒。**
- 已核实：阅读窗口连上后，`native/GalWindowBridge.cs:856-859` 的主循环无游戏时每秒约 10 次、绑定游戏后每秒约 62 次（拖动时 125 次），每次都做窗口查找、`GetAsyncKeyState`、前台窗口检测。单次很便宜，**不是主要热源**，但它让这个进程永远不进入深睡。游戏绑定后的 62 Hz 里 `Scene.Tick/GameUi.Tick` 每次花多少，没有追到（**未知**）。
- 已核实：原生里没有忙等（没有裸 `while(true)` 空转）；合成器（`native/compositor/Compositor.cpp:1213`）是事件驱动，只在绑定游戏并选了合成器模式时才启动，空闲不跑。
- 已核实：没有任何原生助手设置进程优先级（`SetPriorityClass` 零命中）。只有部分子进程被降优先级（`adapter-probe.cjs:45` 等）。
- 小项：`desktop/src/single_instance.rs:138` 每 200 ms 读一次命令文件，整个生命周期都在（已核实，开销很小，但永远不让线程睡深）。

### 2.3 启动后几分钟的后台任务叠加 + 冷测试（后端 node 进程、子进程）——较可能，且是「一阵一阵热」

全部在 `services/server.cjs:20-33` 起，已核实它们存在；各自的默认值见表。

| # | 任务 | 何时 | 代价 | 状态 |
|---|---|---|---|---|
| B1 | **闲时冷测试** `services/cold-test.cjs:22,185-203` | 启动 10 分钟后，之后每 2 分钟检查；条件：10 分钟无键鼠、接电源、非全屏、没有绑定游戏、整机 CPU<35%、剩余 ≥2 GB（`core/cold-test/conditions.cjs:8-15`）。默认开（`coldTest!==false`，`cold-test.cjs:28`） | 满足条件时在**隐藏桌面**真的启动一部库里的游戏并截图，每部最长 6 分钟，每天最多 30 分钟 / 4 部。**不看 MeguLit 窗口是否可见**：打开 MeguLit 后离开电脑，就会有一部游戏在你看不到的地方吃 CPU/GPU | 触发条件和默认值已核实；游戏本身的负载为推测 |
| B2 | **Anki 自动启动** `core/anki-process.cjs:171,157,107` | 每次启动 1.5 秒后，若 Anki 没开就启动它；隐藏模式下还开一个 PowerShell，每 ~30 ms 循环 30 秒，并每 400 ms 再开 PowerShell 去隐藏窗口 | PowerShell 启动 + 30 秒小忙循环；Anki 本身常驻 | 代码已核实；默认开启（`ankiAutoStart`）来自子调查，我只核到了配置项存在 |
| B3 | **库扫描** `web/library-refresh.js:6` → `core/library.cjs:213` | 每次启动一次 | 同步 `readdirSync/statSync` 扫所有游戏目录和 Steam 库，会**堵住 node 事件循环**；之后还可能对大文件做整文件 SHA-256（`services/library.cjs:6`） | 已核实（调用时机为推测） |
| B4 | **脚本预热** `services/script-prewarm.cjs:11-25` | 启动 45 秒后，一个线程走遍**所有**游戏读/补丁脚本，每个 1.6–3 秒（旧的/缺失的），完成后触发前端重取库 | 持续数分钟，200 部游戏更久 | 已核实 |
| B5 | **语音扫描** `services/game-voice.cjs:188` | 启动 30 秒起，每部过期的游戏起一个线程，间隔 20 秒；200 部约 67 分钟 | 低强度但很长 | 已核实 |
| B6 | **后台跑游戏取脚本** `services/kirikiri-cold.cjs:47-55`、`voice-cold.cjs`（`scriptColdRun!==false`） | 对部分 KiriKiri/语音不可读的游戏 | 最小化静音**启动游戏**，每部最长 120 秒 | 已核实存在；是否命中用户的库为推测 |
| B7 | **探针+上传** `services/probe-auto.cjs:21,127-131` | 启动 10 分钟后、每 6 小时；整库探针每周一次，低优先级子进程 | 文件 IO 重 | 已核实 |
| B8 | 适配包同步 `services/adapter-feed.cjs:121` | 3 分钟后，每 6 小时 | 网络+偶发重活 | 已核实 |
| B9 | 前端定时器 | `web/app.js:1367` 每 60 s；`web/class-remind.js:36` 每 10 分钟读全表算统计 | 轻；后者历史大了会重 | 已核实 |

确认**不存在**的：没有 `fs.watch`；没有周期性 tasklist/WMI 扫描；没有本地模型/OCR/词典在开机预热；Rust 端没有轮询循环；种子统计只在「关于」页取。

## 3. 方案

原则（都不降低可见质量）：窗口没人看就暂停；没在玩游戏就降频；后台重活让位于前台；事件驱动代替轮询；动画只动 `transform/opacity`，不动 `filter`/`box-shadow`/`backdrop-filter`。

### P0 · 一个总开关：「界面不活跃」状态（最大的一条）

- **做什么：** 新增 `web/idle-gate.js`，导出 `document.documentElement.dataset.ui = 'active' | 'idle' | 'hidden'`，并发 `ui-state` 事件。`hidden` = `document.hidden` 或窗口最小化；`idle` = 窗口失焦、或可见但 30 秒没有指针/键盘/滚动。回到 active 立即恢复（第一帧不延迟）。
- **接入哪里：**
  - CSS：`[data-ui="idle"] .stage-cover, [data-ui="idle"] .home-glass :is(…)` 去掉 `backdrop-filter`（改成不透明的接近色，`home-tv.css:158`、`app.css:47`、`unify.css`、`card-wall.css`）；`[data-ui!="active"] *{animation-play-state:paused}` 暂停所有无限 CSS 动画（`home-tv.css:106`、`leaderboard.css:379`、`unify.css:898,1156` 等）。
  - JS：`home-depth.js:41-64`、`library-drift.js:143`、`grimoire.js:266`、`dict-idle.js:65`、`rite-stage.js:321`、`element-fx.js:91` 都改成订阅 `ui-state`，非 active 时**取消**下一帧（不是重排），回 active 再启动。
- **预期：** 这是最可能的主因，空闲时 GPU 与界面进程占用预计能降一个数量级（**估计**：从「持续有帧」到「0 帧」；实际数字要量）。有人在用时不变，所以质量不降。
- **注意：** 「失焦也暂停」在玩游戏时尤其有效（MeguLit 在游戏旁边或被盖住）；若担心失焦时丢掉用户想要的氛围，可以只在「失焦 + 窗口被遮挡/最小化」时去掉模糊，动画仍暂停——这个取舍需要店主定。

### P1 · 把库的「多轨」视图和首页视差做成「会睡觉」

- **做什么：** `library-drift.js:100-148` 的 `frame()` 在所有封面速度小于阈值（落定）时停掉循环，指针或数据变化时再唤醒；`home-depth.js:41-64` 同理（速度为 0 且偏移回到目标时不再排下一帧）。`library-drift.js:52` 的 `filter: blur` 改成：静止的封面不模糊，运动中才用；或预先把远景封面做成一张已模糊的缩略图（`blurOf(z)` 档位固定，每档一张缩略图）。
- **预期：** 多轨视图空闲从 60 Hz 全量重算降到 0；运动时质量不变。
- **验证：** 见第 4 节，对比多轨视图静止 1 分钟的 `msedgewebview2` GPU 进程占用。

### P2 · 阅读窗口：没有游戏时不要存在，或者让它睡着

- **做什么，二选一：**
  1. **首选：** 不在启动时建阅读窗口。`web/app.js:1336` 的启动预建改为在「点开始游戏」时建（`app.js:384` 本来就有）。代价是第一次进游戏要多等一次窗口创建，需要店主确认能不能接受；也可以退而求其次：保持预建，但给阅读窗口加一个「无游戏时休眠」：`web/reader/modules/*.js` 里那十来个 `setInterval` 统一换成一个 `idleSetInterval(fn, ms)` 包装，在 `document.hidden` 或阅读器未绑定游戏时不触发。
  2. 同时让 Tauri 在隐藏阅读窗口时调用 WebView2 的 `IsVisible=false`（`desktop/src/main.rs` 的 `reader` 窗口 hide 处），让 Chromium 把它当后台页降频。**这条是否已被自动处理，读代码判断不了（未知），要先在运行时确认**（第 4 节第 3 项），再决定要不要做。
- **文件：** `desktop/src/main.rs:151-165`（建窗口）、`web/app.js:384,1336`、`web/reader/modules/{inject,wait-marker,background,color-picker,polish,box-preview,gal}.js`。
- **预期：** 没有游戏时少掉一整个 WebView2 渲染进程的 ~10 个周期唤醒（**估计**：每秒几十次唤醒）。
- **GalWindowBridge：** `native/GalWindowBridge.cs:856-859` 无游戏时把 `Thread.Sleep(100)` 拉长到 250–500 ms，并且无目标时只响应命令事件；有游戏时保持 16 ms 不动（不影响点读体验）。`ReaderPointerGate.cs:97`（250 ms）同理。预期收益小，作为 P2 的顺带项。
- **single_instance：** `desktop/src/single_instance.rs:138` 改成命名事件等待，去掉 5 Hz 读文件。收益很小，顺带。

### P3 · 启动后的后台任务：错峰 + 低优先级 + 让位于前台

- **做什么：**
  1. 新增 `services/background-budget.cjs`：统一的「后台许可」判断——窗口可见且有输入的 N 秒内、或有游戏绑定、或 CPU>某值时，B3–B8 的**重活**延后（不是放弃）。接入 `script-prewarm.cjs`、`game-voice.cjs:188`、`probe-auto.cjs`、`adapter-feed.cjs`，让它们都把起始延迟改成「许可后再等」。
  2. 所有后台工作线程/子进程统一用低优先级：线程用 `os.setPriority` 让 node 主进程之外的 worker 所在进程降级；子进程 `spawn` 都加 `BELOW_NORMAL`/`IDLE`（已有的 `adapter-probe.cjs:45`、`card-wall.cjs:163` 可抄）。原生助手进程启动后调用 `SetPriorityClass(BELOW_NORMAL)` 并在需要精确响应的线程里用 `THREAD_PRIORITY_ABOVE_NORMAL` 补回。
  3. `core/library.cjs:135-157`、`services/library.cjs:6` 的同步扫描/哈希改成分批 + `setImmediate` 让出事件循环，或挪进 worker。
  4. `web/class-remind.js:36` 取到的 `reader_level` 在后端缓存，历史表没变化就不重算（`services/leaderboard.cjs:113`）。
- **预期：** 启动后头 10 分钟的峰值降低、持续时间拉长但不再叠加；总工作量不变，质量不变。

### P4 · 冷测试要在「真的没人」时才跑

- **做什么：** `core/cold-test/conditions.cjs:8-15` 的闲置判定保持 10 分钟无输入，再增加：MeguLit 窗口不可见（最小化或在托盘）；整机 CPU 门槛从 35% 降到 20%；在设置里把「闲时冷测试」从默认开改为默认询问一次（`library.coldTest`，`cold-test.cjs:28`）。游戏进程用 `IDLE` 优先级启动（`cold-test-worker.cjs:150`）。
- **预期：** 去掉「人走开了，机器突然开始烧」的场景。**这个默认值改动涉及产品决策，需要店主定**（它是为 The Seed 收集数据的功能，直接关掉会影响数据来源）。
- **B2 Anki：** `core/anki-process.cjs:107,157` 的 30 秒 PowerShell 循环改成 10 秒、间隔 150 ms，或用窗口事件（`SetWinEventHook`）代替轮询；`ankiAutoStart` 改为「用户需要制卡时再起」。同样需要店主确认。

## 4. 怎么验证（由店主在自己电脑上做；我不开 MeguLit）

先定位，再改，再量。**每一条改动都需要前后各量一次。**

1. **找出热的是谁（不改任何东西）：** 任务管理器 → 详细信息 → 按 CPU 排序，打开 MeguLit，在首页放着不动 3 分钟，记下 `msedgewebview2.exe`（带 GPU/渲染标记的那几个）、`node.exe`、`GalWindowBridge.exe`、`MeguLit.exe` 各自的 CPU 和「GPU」列。再切到游戏库的「多轨」视图静止 1 分钟，再记一次。
2. **命令行量一次：** 在 PowerShell 里运行下面这条，每 5 秒打印一次这些进程的累计 CPU 秒（两次相减 ÷ 5 = 平均占用核数）：

```powershell
while($true){Get-Process MeguLit,node,GalWindowBridge,msedgewebview2 -ErrorAction SilentlyContinue | Group-Object Name | ForEach-Object{ "{0,-18} {1,8:N1}s" -f $_.Name, ($_.Group | Measure-Object CPU -Sum).Sum }; "---"; Start-Sleep 5}
```

3. **确认阅读窗口是否被降频（决定 P2 第 2 条要不要做）：** 同样放着不动，观察启动前后「没有游戏」时 `msedgewebview2` 进程数和总 CPU。关掉 `web/app.js:1336` 的预建（本地临时试）看差多少，差得小就说明浏览器已经在降频，P2 只需要做最便宜的几项。
4. **冷测试是不是它：** 看有没有 `ColdDesk.exe`、`ColdCapture*.exe` 或游戏进程在你离开后出现；日志在 MeguLit 的 `logs/` 目录。想排除：把 `library.json` 里 `"coldTest": false` 设上，再离开 15 分钟对比。
5. **GPU 占用：** 任务管理器「性能」→ GPU，对比 P0/P1 前后同一页面静止时的 GPU 引擎占用，以及风扇/温度（HWiNFO 之类）。
6. **自动测试（改完后我会跑，不需要开 MeguLit）：** 相关的 `validation/*.test.cjs`（库、冷测试条件 `core/cold-test/conditions.cjs`、前端模块的 node 单测），以及每个新增的 idle-gate 逻辑加纯函数单测（给定「隐藏/失焦/静止 30 秒」输出正确状态）。
7. **通过标准：** 首页静止 3 分钟，`msedgewebview2` 总 CPU 接近 0%、GPU 引擎接近 0%；进入游戏后的点读体验、动画观感和改之前一致（P0 恢复必须在第一帧）。不过的话，把第 2 步的输出和 `logs/` 发回来。

## 5. 建议的实施顺序

1. **先量（第 4 节 1–3 项）**，因为 2.1 和 2.2 谁是主因要靠实测；
2. P0 + P1（只改前端，风险最低，收益最可能最大）；
3. P2（阅读窗口）——先做不改产品行为的包装定时器那一版；
4. P3；
5. P4 需要店主对「冷测试默认开关」和「Anki 自动启动」两个产品默认值拍板。

## 6. 这份调查没有覆盖的

- 没有任何实测数据，所有「预期」都是估计。
- 本地模型/OCR/语音合成在**游戏运行时**的负载不在范围内（问题是「打开 MeguLit 后」）。
- `Scene.Tick`、`GameUi.Tick`、`HookVerifier.Tick` 在绑定游戏后每 16 ms 的实际成本没有追到。
- 用户有没有设置环境变量 `MEGULIT_WEBVIEW_ARGS`（会覆盖 WebView2 参数，`desktop/src/main.rs:500-504`）不知道，值得问一句。

## 2026-11-21 实现与复查边界

- 聚焦且可见时保留原有呼吸、漂浮、景深与玻璃效果；失焦/隐藏暂停装饰帧与本模块拥有的 GSAP 补间，回焦从原进度恢复。不会因为聚焦静止30秒而降画质
- 预建 reader 保留，未绑定时10项常驻轮询不分配原生 interval；绑定恢复，gameClosed 清理。设置撤销、弹层就绪等待、语音状态等有明确结束条件的交互计时不依赖绑定
- GalWindowBridge 无目标250ms；绑定16ms、拖动8ms不变。无实测温度/整机 CPU 降幅数字
- 自动预热、延后语音扫描、适配包同步与自动探针使用真实闲置许可；每游戏/适配包/上传收集阶段复查。worker 通过 IPC 向持有玩家状态的主服务申请许可，自动恢复也走相同门槛。手动发起的扫描/同步仍立即处理
- 当前正在执行的一个读档/重建/网络请求会完成再检查下一项，未引入强制中断以免损坏索引；本轮没有改冷测试默认开关或 Anki 自启默认值
- 自动化验收：`validation/cpu-idle.test.cjs` 与 `cpu-background-budget.test.cjs`，加原有 reader/适配/语音回归；可选真实 DOM 复查复用 `node services/cardinal/driver.cjs tools/reader-replay/scenarios/cpu-idle-smoke.json <H盘输出.json>`，输出 errors 必须为空且 console 包含 CPU_READER_PASS、CPU_DRIFT_PASS（3次失焦/回焦）
- 5分钟测量清单和只读脚本见 `H:\MeguLit-Work\night-1423\cpu-5min-checklist.md`、`measure-cpu-5min.ps1`；必须同库同画质做前后对照，不能把DOM调度通过当成温度改善已测
