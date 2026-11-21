# 闲时冷测试（The Seed 传火）

店主没法把所有游戏都买来测，所以让愿意的用户电脑在闲着的时候，替我们测一下他自己库里的游戏：在一块看不见的桌面上悄悄打开、静音推进几十句、录一段运行样本、给这部游戏的种子打分、结果回传，把 skeleton 种子一点点测成确认好的种子

接口以 `docs/diff-layers.md` 顶部「当前权威接口」为准，这里只写冷测试自己的东西

## 店主定的规则（2026-11-21）

- 默认开，设置里能关（`library.json coldTest`，设成 false 才关）
- 说明里写清楚：会在后台打开你库里的游戏；Steam 版会算一点游戏时长，个别游戏可能解锁成就。Steam 游戏不绕开
- 只在空闲、插着电、没有全屏应用或游戏、CPU 不忙时跑；每部游戏有时间上限，每天有总量上限；一动键鼠立刻中止
- 隐藏桌面：用户屏幕和任务栏上什么都看不到，不抢焦点，全程静音
- 存档：开测前快照，测完和中止时原样还回去；找不到存档位置的游戏不测
- 只录一次，候选组合离线打分，不反复开游戏
- 截图：每次都在本机打分。过线只上传分数、指纹、差分，截图不出本机；没过线或在边缘才附 2 到 3 张缩小的客户区截图；开关（`coldTestShots`）关了一张都不传
- 隐藏桌面画不出画面（D3D 全屏黑屏）算「没结论」，不算失败，留给被动样本补
- 选游戏：先修复队列要求补测的，再 skeleton、read；verified 不测；同一台电脑同一部游戏测过就不重复

## 组成

| 文件 | 做什么 |
|---|---|
| `core/cold-test/conditions.cjs` | 能不能开始、什么时候必须停、今天还剩多少时间（纯函数） |
| `core/cold-test/pick.cjs` | 下一部测哪个（纯函数），`retestOf()` 读 relay 的补测表 |
| `core/cold-test/saves.cjs` | 找存档位置、快照（先写日志）、还原、崩溃后补还原、扫没保护到的写入 |
| `core/cold-test/score.cjs` | 一份录制、所有候选组合离线打分，种子自己的分，结论，截图策略；diff-maker 的离线搜索也用这里的 `windows/evaluate/paramsOf` |
| `core/cold-test/drive.cjs` | 游戏里怎么操作（状态机，轮询） |
| `services/cold-test.cjs` | 调度、开关、说明文案、状态文件、上报、截图包 |
| `services/cold-test-run.cjs` + `cold-test-worker.cjs` | 一次运行，在单独的 node 进程里：ColdDesk 开游戏，HookNative 接上（日志写进运行目录），驱动，截图，收尾 |
| `native/ColdDesk.cs` | 隐藏桌面 + Job 对象 + 静音 + PostMessage 输入 + 客户区截图 + 键鼠中止 + Steam 重启拦截；`status` 读空闲/电源/全屏/CPU |
| `relay/src/auto-profile.js` | `GET /api/game-profile/retest`；上报 `source:'cold'` |

## 什么时候跑

`services/server.cjs` 启动 10 分钟后开始，每 2 分钟看一次（`conditions.check`）：

| 条件 | 默认 | 读法 |
|---|---|---|
| 无键鼠输入 | 10 分钟 | `GetLastInputInfo` |
| 插着电 | 电池时不跑；台式机（没电池）算插着 | `GetSystemPowerStatus` |
| 没有全屏 | 全屏游戏/演示/忙碌时不跑 | `SHQueryUserNotificationState` 2/3/4 |
| 没在玩游戏 | MeguLit 绑定了游戏就不跑 | `reader.gamePid` |
| CPU 不忙 | 整机 ≤ 35 % | `GetSystemTimes` 1 秒 |
| 空间 | MeguLit 所在盘 ≥ 2 GB | `statfs` |
| 每部上限 | 6 分钟 | |
| 每天上限 | 30 分钟、4 部 | `data/config/cold-test.json days` |

上限可用 `library.json coldTestLimits {idleMinutes, cpuBusy, perGameMinutes, dailyMinutes, dailyGames, minFreeMb}` 覆盖（没有界面，调试用）

运行中 ColdDesk 每 100 ms 看一次 `GetLastInputInfo`：变了就立刻结束整个 Job（游戏进程树），再输出 `{"type":"input"}`。ColdDesk 自己的输入是 PostMessage，不改 `GetLastInputInfo`，所以只会被真人触发。插拔电源、出现全屏也会结束

## 测哪部

`pick.candidates`：

1. retest：relay 修复队列里这部游戏（exe 哈希或游戏身份）要求补测，且比这台电脑上次测得新
2. skeleton
3. read
4. 还没有种子的

不测：verified / owner-ok（除非修复队列点名）、这台电脑测过的（结论 pass/edge/fail/inconclusive）、被这台电脑封掉的（找不到存档、Steam 重启、还原出错、有没保护到的写入）、exe 不在、正在运行。被用户打断的（stopped）以后再试

种子状态由 `core/profiles profileFor().seedStatus` 给出（按 exe、名字、标题、Steam 认）

## 存档保护

`saves.locate()` 找：
- 游戏目录：`savedata` / `save` / `saves` / `userdata` …一层；RPG Maker `www/save`；Ren'Py `game/saves`；目录里的散存档（`*.sav` `*.ksd` `*.kdt` `save*.dat`…）和小设置文件（`*.ini` `*.cfg`）
- 用户目录：`%APPDATA%`、`%LOCALAPPDATA%`、`LocalLow`、`Documents`（含 `My Games`）、`Saved Games` 下一层或两层（厂商/游戏），名字和 exe 名、标题、Unity 产品名对得上
- 引擎预测（还不存在也算，还原 = 删掉）：Unity `LocalLow/<公司>/<产品>`（`<exe>_Data/app.info`），Ren'Py `%APPDATA%/RenPy/<config.save_directory>`，KiriKiri `savedata`

只有设置文件、没有任何存档位置的游戏（例如存注册表的）不测

快照在 `data/cold-test/snap/<id>/`：先写 `journal.json` 再复制，上限 512 MB。还原：存在过的目录整份换回（时间戳保留，按内容哈希核对）；预测出来、原本不存在的目录删掉；游戏目录里的散文件写回，运行中新出现的散文件删掉（exe、dll、封包、媒体文件永远不碰）。还原成功删快照；失败留着快照、日志标 `failed`，这部游戏封掉。MeguLit 中途崩溃：下次启动先把所有未完成的快照还原

还原后 `sweep()` 扫一遍用户目录里名字像这部游戏、在运行期间被写过、却不在保护范围内的目录：只记录不动，这部游戏以后不再冷测

## Steam

不绕开 Steam。游戏目录有 `steam_api(64).dll` 时：
- 要求 Steam 客户端在运行，否则这次跳过（以后再试）
- 没有 `steam_appid.txt` 时，运行期间临时写入这部游戏自己的 AppID（Valve 给开发者的机制：游戏不再经 Steam 重启到用户桌面，但仍然连着 Steam 客户端，照常算时长和成就），测完删掉；本来就有的不动
- 不知道 AppID 的不测
- 仍被 Steam 重启的（SteamStub 壳）：ColdDesk 发现同名进程在 Job 外重新出现，把它的窗口挪到屏幕外并结束，输出 `relaunched`，这部游戏封掉

## 一次运行

`cold-test-worker.cjs` 单独进程（HookNative 的静态状态不碰用户正在玩的游戏）：

1. `ColdDesk run <exe> --seconds N`：建 `MeguLitColdDesk` 桌面，挂起创建进程，放进 Job（`KILL_ON_JOB_CLOSE`，放不进去就不跑），恢复；窗口出现后发激活消息（有些游戏失焦会暂停）
2. 窗口出现后接 HookNative：`layout.logs = 运行目录`，`hookAutoStart`，profile = 这部游戏的分层 profile（含种子）
3. `drive.cjs` 每 250 ms 一步：
   - boot：等窗口（90 秒没有就结束 `no-window`）
   - intro：轮流 点击 / Enter / Esc（只在前 15 秒）/ Ctrl；engine-draw 报出「はじめから / New Game / スタート」按钮就点它，「つづきから / ロード / Continue」永远不点；25 秒截一张判断黑屏，40 秒还是黑屏且没台词就结束 `black`；120 秒没台词结束 `no-lines`
   - advance：第一句起按住 Ctrl（PostMessage，每 2 秒补一次），点击 + Enter 轮流推进；出选项 0.6 秒后点第一个选项（不知道位置就 Enter）；第 3、15、30 句各截一张
   - end：60 句够了、到时间、45 秒没新句、黑屏
4. 结束：`kill` → Job 结束整棵进程树 → 关桌面

运行目录 `data/cold-test/runs/<key>-<time>/`：`hook-events.log`、`engine-draw.log`、`shot-*.jpg`（只截客户区，960 宽 JPEG），`run.json`。保留最近 6 次

限制（隐藏桌面没有真键盘）：用 `GetAsyncKeyState` 读 Ctrl 的引擎快进不了，只靠点击推进；只认真键盘的游戏会 `stalled`，照样用已有的句子打分

## 打分

`score.cjs`：运行目录的日志 → `core/self-check.cjs` 同一套解析 → `core/auto-profile.cjs candidates()` 的每个组合（定位来源、特效帧、选项过滤、隐藏/读模式）在录制的每个自检窗口上预测 → 最好的隐藏组合。种子自己的设置也打一遍分（`seed.pass/over`）

冷测试没有阅读层，量得到的只有钩子侧指标（漏句、选项，有 engine-draw 时还有位置）；`measured` 列出这次实际量到的

| 结论 | 条件 | 上传 |
|---|---|---|
| pass | 有隐藏组合每个窗口都过线，最差指标 < 阈值的 80 % | 分数、指纹、差分 |
| edge | 过线，但某个指标 ≥ 阈值的 80 % | 同上 + 2–3 张截图 + 日志 |
| fail | 没有隐藏组合过线（读模式） | 同上 + 2–3 张截图 + 日志 |
| inconclusive | 被中止 / Steam 重启 / 黑屏且没台词 / 少于 8 句 | 不上传 |

## 上报

- 分数、指纹、差分：`POST /api/game-profile/report`，`profile.source:'cold'`，`profile.cold {verdict, near, measured, seed}`，顶层 `prints`（`core/game-print.cjs`）。开关：共享适配 + `autoProfileShare`（同被动样本）。这台电脑还没有本机校准时，冷测试结果也存成本机校准（`data/config/auto-profiles/<exe>.json`，真玩时自检闸门照常把关）
- 截图 + 日志（只在 fail / edge）：`POST /api/game-profile/runtime`，bundle `source:'cold'`，`cold.json` + `hook-events.log` + `engine-draw.log`（`diagnostics.scrub` 去隐私）+ 最多 3 张截图（取首、中、尾）。开关：`runtimeSampleShare`；`coldTestShots` 关了不带截图
- 补测表：`GET /api/game-profile/retest` → `{schema:'megulit.cold-retest', version:1, items:[{key, game, at}]}`，修复队列里没关的行，只有哈希。客户端缓存 6 小时（`data/config/cold-test-retest.json`）

## 本机文件

| 文件 | 内容 |
|---|---|
| `data/config/cold-test.json` | `tested`（每个 exe 的结论）、`blocked`（封掉的原因）、`days`（每天用了多少）、`log`（最近 60 条） |
| `data/cold-test/snap/` | 未完成的存档快照（正常情况下是空的） |
| `data/cold-test/runs/` | 最近 6 次运行的日志和截图（只在本机） |

`status(root)` 给设置页和诊断用：开关、正在测哪部、今天用量、测过/封掉多少、还原失败数

## 测试

`validation/cold-test.test.cjs`（不开游戏、不开 MeguLit.exe）：条件、选游戏、存档快照/还原/崩溃恢复/预测目录/封掉、两份回放夹具（`validation/helpers/cold-test/`，店主 incr9 日志：ファタモルガーナの館 fail、千恋＊万花 pass）、edge 和没结论、截图策略、驱动状态机、假 ColdDesk 的运行和中止、服务端到端（假运行）、relay 补测表和 `cold` 来源
