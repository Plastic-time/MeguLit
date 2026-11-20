# 游戏差分全自动生成（本地部分）

目标：几万部 galgame 不靠手写差分。每台电脑首次游玩时自动校准一份「游戏差分」，随一键诊断上传，服务端聚合后下发给其他玩家。任何指标不过线就退回读模式，保证不出现漏句、没选项、日文没了这类坏状态。

分层（`core/profiles`，diff-layers 会话维护）：

```
内核默认 defaults.cjs ← 引擎差分 engines/<id>.cjs ← 游戏差分 games/<gameKey>.cjs ← 本机自动差分 data/config/auto-profiles/<key>.json
```

本机自动差分是数据，不是代码，只能写 defaults.cjs 里已有的键（`profileFor({...input, auto})`，未知键丢弃，layers 末尾 `+auto`）。

**顺序定为本机校准层 > 仓库游戏差分**：本机是在这台电脑、这份游戏拷贝上实测出来的，按「新量到的值盖过旧存的」排最上。手写游戏差分修了某个问题之后，本机旧校准如果仍是读模式，玩家点 Alt+T「重新校准」即可重测；服务端下发的差分也是这一层，本机再校准的结果覆盖它。

接入：`services/reader.cjs applyGameProfile` 先算不带 auto 的 profile，取 `gameKey`，读 `data/config/auto-profiles/<gameKey>.json`，有就 `profileFor({...input, auto: settings})` 交给 `GalNative.setGameProfile`；校准完成、闸门退档、重新校准时 `services/self-check-live.cjs` 再调一次 setGameProfile，内核照常经 `Profiles.get(this.profile, ...)` 读。

内核读取的键：`hide.textEffectsRead`（读模式）、`placement.firstLineAnchor`（positionSource=glyph → `glyph`，ocr → `box`；engine 是内核默认首选，不写）。`calibrate.*`、`page.effectFrames` 目前只存盘和上传，内核还没有分支读它们。

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

`key` = profile 的 gameKey：手写游戏差分的 key（如 `fata-morgana`），没有游戏差分的是 profileFor 给的 `auto-<hash>`（程序名+标题）。不含路径。

```json
{
  "schema": 1,
  "key": "fata-morgana",
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

## 服务端汇总和下发（relay/src/auto-profile.js）

现有 Worker（D1，免费额度），迁移 `relay/migrations/0021_auto_profiles.sql`，表 `auto_profile_reports`：每个游戏每个上报者（IP 哈希）一行，新的覆盖旧的。

| 接口 | 说明 |
|---|---|
| `POST /api/auto-profile/report` | `{version:1, profile:<上面 autoProfile.profile 那块>}`，每 IP 每小时 30 次；`settings` 只留可调键（calibrate.* / page.effectFrames / hide.textEffectsRead / placement.firstLineAnchor / choice.filters，坏 RegExp 丢掉），mode=read 强制 `hide.textEffectsRead=true` |
| `GET /api/auto-profile/<gameKey>` | `{schema:'megulit.auto-profile', version:1, key, mode, settings, agree, reporters, cost, at}`；没有一致结果时 404 |

挑选规则（只看最近 180 天）：
- 相同 mode+settings（规范化 JSON）的算一组
- 超过半数上报者是读模式、且至少 2 人 → 下发读模式
- 否则在 ≥2 人一致的隐藏组里取平均代价最低（分最高）的，人数多者优先
- 只有 1 人报过的结果永远不下发

写入成本：每次上报 1 行 upsert + 1 行限流；读取不写 D1（全局 IP 限流兜底）。

客户端 `services/auto-profile-feed.cjs`：
- 校准完成、闸门退档后自动上报；受「共享适配」开关控制（和适配记录同一个开关）
- 开游戏时同步读本地缓存 `data/config/auto-profiles-feed/<gameKey>.json`，后台刷新（有结果缓存 24 小时，404 缓存 6 小时）
- **本机校准优先**：本机有 `auto-profiles/<gameKey>.json` 就不用下发的；没有时下发的隐藏结果作为 auto 层，本机照常录制校准，校准完成后覆盖；下发的是读模式就直接读模式、不再录制
- 「重新校准」跳过下发结果，只按本机重测

部署（等店主说再做）：`wrangler d1 migrations apply megulit-relay --remote`，然后 `wrangler deploy`

## 测试

`validation/self-check-gate.test.cjs`：用店主 incr9 日志（裁剪后放在 `validation/helpers/selfcheck-replay/`）回放

- ファタモルガーナの館（22:51–22:53Z）：第 1 个窗口丢句率 23% 超线 → 退档；校准里所有隐藏组合都不过线 → 读模式
- 千恋＊万花（22:53:42Z 之后）：窗口全部过线，校准保持隐藏重画
- 在线服务：首次校准写盘、读模式带原因、重新校准、已存的隐藏差分运行中退档

`validation/auto-profile-relay.test.cjs`：Worker 进程内跑（D1 用 node:sqlite），覆盖单人不下发、两人一致下发、同 IP 一行、最低代价胜出、读模式要过半、键过滤、坏请求；客户端上报/缓存/本机优先/下发读模式/共享开关关闭不上报
