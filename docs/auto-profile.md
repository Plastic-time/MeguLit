# 游戏差分全自动生成

店主定的最终模型（2026-11-21）：

1. **每个 exe 一份差分**：key = `x-` + 程序文件 SHA-256 的前 40 位十六进制。同名不同版本（补丁、Steam 更新、汉化 exe）各自一份；改名的同一个文件还是同一份。不用标题，不含路径
2. **两种来源**：
   - 官方差分：维护者根据一键上传的探针（脚本 + exe + 运行时样本）离线做出，用维护者密钥签名
   - 自动差分：玩家本机首次游玩自动校准的结果，服务端汇总后用 relay 自己的密钥签名
   - 官方优先，自动校准只给还没有官方差分的 exe 兜底
3. **只能是数据**：只允许 `core/profiles/defaults.cjs` 登记过的键，值必须在 `core/profiles/domains.cjs` 的值域内（枚举、布尔、数值区间、矩形、安全正则列表）。服务端入库前过滤，客户端收到后再验一遍；签名覆盖整份文档，改一个值就验不过
4. **热更新**：开游戏按 exe 哈希读本地缓存，后台拉新的，拉到就立刻叠成 profile 的 auto 层，不需要重装或重编
5. **玩家之间共享**：同一 exe 收到多份校准，按一致性和分数去重，只保留一份下发
6. **冻结和夹具**：仓库里已经做好的游戏差分（`core/profiles/games/<key>.cjs`）有回放夹具，`games-regression` 全过才能改内核；`domains.cjs` 缺键时 `auto-profile-relay` 测试会失败。客户端闸门退档时自动上报原因进修复队列，并触发自动探针（带运行时样本）

分层（`core/profiles`）：

```
内核默认 defaults.cjs ← 引擎差分 engines/<id>.cjs ← 仓库游戏差分 games/<gameKey>.cjs ← auto 层（下面四选一）
```

auto 层按顺序取第一个有的：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 本机退档 | 闸门在这台电脑上看到这个 exe 坏了：读模式，谁说的都不听 |
| 2 | 官方差分 | relay 下发，维护者签名 |
| 3 | 本机校准 | `data/config/auto-profiles/<key>.json` |
| 4 | 共享自动差分 | relay 下发，relay 签名，≥2 人一致 |

有官方差分或共享结论是读模式时，本机不再录制校准。「重新校准」删掉本机差分，这一局不看 relay，只按本机重测。

接入：`services/reader.cjs applyGameProfile` → `services/self-check-live.cjs start`。key 已知（`data/config/exe-hashes.json` 按路径+大小+修改时间记住）时同步叠层；首次算哈希是异步流式读，算完再 `setGameProfile`。

## 自检闸门 `core/self-check.cjs`

数据来源就是 MeguLit 本来写的日志：`HookNative.trace`（hook-events.log）和阅读层上报的条目（reader-host.log）。所以拿店主的日志回放，结果和他电脑上跑的一样。

每 20 句钩子台词（`source chars=N sequence=K`）算一个窗口，窗口结束时打分：

| 指标 | 怎么算 | 默认阈值 |
|---|---|---|
| hideVisible | hookVisual stage=hidden、valid 的句子里，扫描区仍识别到日文的比例 | > 25%（至少检查 4 句） |
| dropRate | `hook line drawn nowhere on the page, dropped` / (台词 + 丢句) | > 15% |
| repeatRate | 阅读层同一句（≥6 字）在窗口内画了第二次 | > 10% |
| choiceMismatch | `choice options filtered A -> B` 里 A≥2 且 B<2 的次数 | > 1 次 |
| positionPx | 引擎上报第一个字框的 top 与阅读层第一个字 top（换算到游戏客户区）之差的中位数 | > max(96, 3×字高)，至少 5 个样本 |
| pairRate | 字形配对 paired/(paired+orphan)；有汉化补丁行时再取补丁行/台词 | < 80%（至少 6 句） |

阈值在 `core/profiles/defaults.cjs` 的 `selfCheck.*`（`self-check.cjs` 的 `DEFAULTS` 是同值兜底），引擎差分或游戏差分可以覆盖。位置偏差用引擎上报的首字框坐标（`placement placed: ... first box`）。

每个窗口写一行 hook-events.log：

```
selfCheck window=1 lines=20 hide=0.25 drop=0.231 repeat=0 choice=1 pos=- pair=0.958 over=dropRate
```

以及 reader-host.log `{"type":"layoutDiagnostic","kind":"selfCheck","what":"window",...}`。`what` 还有 `stored` / `calibrated` / `stepDown`。

任何一项超线：隐藏重画 → 读模式（`GalNative.textEffects(true, reason)`，原文留着，只显示译文），按游戏存下来，下次启动直接读模式。Alt+T 的「隐藏游戏原文」下面显示原因和「重新校准」按钮；点了会删掉存的差分，下一个窗口重新录制校准。

## 首次游玩自动校准 `core/auto-profile.cjs`

没有存过差分的游戏，第一个窗口的事件就是录制。离线枚举候选组合，用同一套指标预测打分：

| 键 | 候选 |
|---|---|
| `calibrate.positionSource` | 录制里有样本的来源：`engine` / `glyph` / `ocr`（没样本的不能选） |
| `calibrate.textBox` | 引擎首字框的并集 `{x,y,w,h,client:[w,h]}`（推导，不枚举） |
| `page.effectFrames` | `null` / `true` |
| `choice.filters` | 内核默认 / `[]` |
| `calibrate.hideMethod` | `hide` / `read`（兜底） |

预测规则（就是内核拿到这个键会怎么做）：

- `effectFrames=true`：伴随游戏特效帧的丢句不再丢，但那些帧是游戏自己画的，算作原文可见
- `choice.filters=[]`：被过滤的选项全显示；原始候选是特效帧时，显示的是乱码选项，仍算不一致
- 录制里没测到的位置来源不能选

所有隐藏组合里选「全部过线且代价最小、改动最少」的一组；没有一组过线就是读模式。全程被动测量，不弹窗、不额外闪原文。

## 存储格式 `data/config/auto-profiles/<key>.json`

`key` = `x-` + exe SHA-256 前 40 位。不含路径。

```json
{
  "schema": 1,
  "key": "x-3f9a…（40 位）",
  "engine": "krkr",
  "exe": "fata_jp.exe",
  "version": "1.4.21",
  "at": "2026-11-21T09:00:00.000Z",
  "source": "calibration",
  "mode": "read",
  "reason": "有台词没有画到阅读层（漏句）",
  "settings": {
    "calibrate": { "positionSource": null, "textBox": { "x": 220, "y": 488, "w": 130, "h": 22, "client": [804, 604] }, "hideMethod": "read" },
    "page": { "effectFrames": null },
    "hide": { "textEffectsRead": true }
  },
  "score": { "metrics": { "hideVisible": null, "dropRate": null, "repeatRate": null, "choiceMismatch": 0, "positionPx": null, "pairRate": null }, "cost": 0, "lines": 20 },
  "candidates": [ { "params": { "hideMethod": "hide", "positionSource": "engine", "effectFrames": null, "filters": "kernel" }, "pass": false, "cost": 3.25, "over": ["dropRate"], "metrics": {} } ],
  "gate": null
}
```

- `source`：`calibration`（首次校准）或 `gate`（运行中闸门退档）
- `gate`：闸门退档时 `{window, over, metrics}`，并带 `previous: {mode, source, at}`
- `settings`：一层游戏差分，键路径和 `core/profiles/defaults.cjs` 一致；`calibrate.*` 和 `selfCheck.*` 两组键由本会话提议加进 defaults

## 上传格式（一键诊断 info.json）

`services/diagnostics.cjs` 在 info.json 里加 `autoProfile`：

```json
"autoProfile": {
  "schema": 1,
  "profile": { "key": "...", "engine": "...", "exe": "...", "version": "...", "at": "...", "source": "...", "mode": "hide|read",
               "reason": "...", "settings": {}, "score": {}, "gate": null, "candidates": [ "最多 4 个" ] },
  "windows": [ { "window": 1, "lines": 20, "metrics": {}, "over": [], "pass": true } ]
}
```

`windows` 是当前在跑的这局最近 10 个窗口（诊断时游戏开着才有）。整份 info.json 照旧过 `scrub`。

## 签名差分文档 `core/game-diff.cjs`

relay、客户端、维护者工具共用这一个纯函数文件，签名的字节处处一致：

```json
{
  "schema": "megulit.game-diff", "version": 1,
  "key": "x-<40 hex>", "source": "official|auto", "mode": "hide|read",
  "settings": { "只含 domains.cjs 允许的键和值": true },
  "exe": "fata_jp.exe", "engine": "krkr", "app": "", "issuedAt": "ISO",
  "agree": 3, "reporters": 4, "cost": 0.2,
  "signature": { "alg": "ed25519", "keyId": "k1|r1", "value": "<base64，签 canonical(去掉 signature 的文档)>" }
}
```

- 官方：必须由 `services/adapter-pack-keys.json` 里的维护者密钥签
- 自动：由 `services/auto-profile-keys.json` 里的 relay 密钥签（维护者密钥也认）
- settings 需要过滤才能通过的文档整份拒收；mode=read 必须带 `hide.textEffectsRead=true`；多余字段拒收
- 客户端验不过就当没有，坏掉或被投毒的 relay 最多让玩家拿不到差分

维护者工具 `tools/game-diff.cjs`：`keygen`（生成 relay 密钥：私钥给 `wrangler secret put AUTO_PROFILE_SIGNING_KEY`，公钥写进 `services/auto-profile-keys.json`）、`key <exe>`、`make <key> <settings.json>`、`sign <diff.json> <key.pem> <keyId>`、`check <signed.json>`。

## 服务端（relay/src/auto-profile.js）

迁移 `relay/migrations/0021_auto_profiles.sql`：

- `auto_profile_reports`：每个 exe、每个上报者（IP 哈希）一行，新覆盖旧，每个 exe 最多留 50 行
- `game_diffs`：每个 exe 每种来源一份签好的文档（`official` / `auto`）
- `auto_profile_queue`：修复队列，每个 exe 一行

| 接口 | 说明 |
|---|---|
| `POST /api/auto-profile/report` | `{version:1, profile:<autoProfile.profile>}`，每 IP 每小时 30 次；settings 按值域过滤；`source:'gate'` 的同时进修复队列 |
| `GET /api/auto-profile/<x-key>` | `{schema:'megulit.game-diff-feed', version:1, key, diff}`；有官方给官方，否则给自动；都没有 404 |
| `POST /api/auto-profile/official` | 维护者（`ADAPTER_ADMIN_TOKEN`）上传签好的官方差分；同时关掉该 exe 的队列项 |
| `POST /api/auto-profile/official/withdraw` | 撤回官方，回到自动 |
| `GET /api/auto-profile/queue[?all=1]` | 修复队列：exe、引擎、超线指标、上报人数、时间 |
| `POST /api/auto-profile/queue/close` | 关掉一项 |

自动差分挑选（最近 180 天）：相同 mode+settings 算一组；超过半数是读模式且至少 2 人 → 读模式；否则在 ≥2 人一致的隐藏组里取平均代价最低的；只有 1 人报过的永远不下发。结果变了才重新签名写入（多一次 upsert）。没设 `AUTO_PROFILE_SIGNING_KEY` 时不下发任何自动差分。读取不写 D1。

部署（等店主说再做）：
1. `node tools/game-diff.cjs keygen`，私钥 `wrangler secret put AUTO_PROFILE_SIGNING_KEY`，公钥加进 `services/auto-profile-keys.json`（随下个版本发）
2. `wrangler d1 migrations apply megulit-relay --remote`
3. `wrangler deploy`

客户端 `services/auto-profile-feed.cjs`：校准完成、退档后上报（受「共享适配」开关）；缓存 `data/config/auto-profiles-feed/<key>.json`（有结果 24 小时，404 六小时）。

## 运行时样本（探针用，`services/runtime-sample.cjs`）

首个自检窗口（前 20 句）里收集，存 `data/runtime-samples/<key>/`，下一次自动探针（`probe-full.cjs`）打进包里：item kind `runtime`（`runtime/sample.json`）和 `shot`（`runtime/shot-N.jpg`）。

```json
{
  "schema": "megulit.runtime-sample", "version": 1, "key": "x-…", "exe": "fata_jp.exe", "engine": "krkr", "app": "1.4.21",
  "createdAt": "ISO", "client": [804, 604], "shots": 3,
  "lines":   [{ "at": 0, "seq": 5, "chars": 18, "name": "綾" }],
  "boxes":   [{ "at": 0, "line": 1, "x": 220, "y": 488, "w": 20, "h": 22 }],
  "choices": [{ "at": 0, "raw": 3, "shown": 0 }],
  "aux":     [{ "at": 0, "texts": ["を私呼ぶを私声…"] }],
  "drops":   [{ "at": 0, "chars": 16 }],
  "hide":    [{ "at": 0, "seq": 1, "visible": true }]
}
```

- `lines`：前 40 句的序号、字数、当时名字框里的名字（`hooks.state.hookSpeaker`）
- `boxes`：引擎上报的首字框（游戏客户区像素），`client` 是客户区尺寸
- `choices`：选项事件（引擎/钩子给的数 → 阅读层画出的数）
- `aux`：旁路流文本（特效帧在这里），`drops`：画不出被丢的句子，`hide`：隐藏检查结果
- 截图：第 3、10、18 句时各一张，`GalNative.sceneShot` 只截游戏自己的客户区（不含 MeguLit 图层和桌面），JPEG，每张 ≤600 KB，最多 3 张

## 测试

`validation/self-check-gate.test.cjs`：用店主 incr9 日志（裁剪后放在 `validation/helpers/selfcheck-replay/`）回放

- ファタモルガーナの館（22:51–22:53Z）：第 1 个窗口丢句率 23% 超线 → 退档；校准里所有隐藏组合都不过线 → 读模式
- 千恋＊万花（22:53:42Z 之后）：窗口全部过线，校准保持隐藏重画
- 在线服务：首次校准写盘、读模式带原因、重新校准、已存的隐藏差分运行中退档

`validation/auto-profile-relay.test.cjs`：Worker 进程内跑（D1 用 node:sqlite，WebCrypto Ed25519），覆盖值域表完整、单人不下发、两人一致下发且客户端验签通过、篡改/错误密钥/错 key 被拒、最低代价胜出、读模式要过半、危险正则和未知键被滤、官方优先/撤回/只认维护者密钥、退档进修复队列且官方差分关单、无签名密钥不下发、客户端四级优先级、共享开关关闭不上报、运行时样本
