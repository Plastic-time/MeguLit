# 游戏差分全自动生成（本地部分）

目标：几万部 galgame 不靠手写差分。每台电脑首次游玩时自动校准一份「游戏差分」，随一键诊断上传，服务端聚合后下发给其他玩家。任何指标不过线就退回读模式，保证不出现漏句、没选项、日文没了这类坏状态。

分层（`core/profiles`，diff-layers 会话维护）：

```
内核默认 defaults.cjs ← 引擎差分 engines/<id>.cjs ← 游戏差分 games/<gameKey>.cjs ← 本机自动差分 data/config/auto-profiles/<key>.json
```

本机自动差分是数据，不是代码，只能写 defaults.cjs 里已有的键；按「新量到的值盖过旧存的」排在最后。

## 自检闸门 `core/self-check.cjs`

数据来源就是 MeguLit 本来写的日志：`HookNative.trace`（hook-events.log）和阅读层上报的条目（reader-host.log）。所以拿店主的日志回放，结果和他电脑上跑的一样。

每 20 句钩子台词（`source chars=N sequence=K`）算一个窗口，窗口结束时打分：

| 指标 | 怎么算 | 默认阈值 |
|---|---|---|
| hideVisible | hookVisual stage=hidden、valid 的句子里，扫描区仍识别到日文的比例 | > 25%（至少检查 4 句） |
| dropRate | `hook line drawn nowhere on the page, dropped` / (台词 + 丢句) | > 15% |
| repeatRate | 阅读层同一句（≥6 字）在窗口内画了第二次 | > 10% |
| choiceMismatch | `choice options filtered A -> B` 里 A≥2 且 B<2 的次数 | ≥ 2 次 |
| positionPx | 引擎上报第一个字框的 top 与阅读层第一个字 top（换算到游戏客户区）之差的中位数 | > max(96, 3×字高)，至少 5 个样本 |
| pairRate | 字形配对 paired/(paired+orphan)；有汉化补丁行时再取补丁行/台词 | < 80%（至少 6 句） |

阈值在 `self-check.cjs` 的 `DEFAULTS`，对应 profile 的 `selfCheck.*`，引擎差分或游戏差分可以覆盖。

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

`key` = 手写游戏差分的 gameKey（如 `fata-morgana`），没有就是 `exe-` + sha1(小写程序名) 前 12 位。不含路径。

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

## 服务端聚合（之后另开会话）

建议规则，供服务端会话参考：

- 按 `key` 聚合；同一 `exe` 不同 `key` 的以 `key` 为准
- 只聚合 `version` ≥ 当前最低支持版本的记录
- `mode=read` 的票数超过一半，下发读模式；否则取 `pass` 的 `settings` 里出现最多的一组
- 下发的差分仍是同一格式，客户端当作「本机自动差分」那一层；本机再校准出的结果覆盖下发的（新量到的盖过旧的）

## 测试

`validation/self-check-gate.test.cjs`：用店主 incr9 日志（裁剪后放在 `validation/helpers/selfcheck-replay/`）回放

- ファタモルガーナの館（22:51–22:53Z）：第 1 个窗口丢句率 23% 超线 → 退档；校准里所有隐藏组合都不过线 → 读模式
- 千恋＊万花（22:53:42Z 之后）：窗口全部过线，校准保持隐藏重画
- 在线服务：首次校准写盘、读模式带原因、重新校准、已存的隐藏差分运行中退档
