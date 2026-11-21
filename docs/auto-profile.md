# 游戏差分全自动生成

店主定的最终模型（2026-11-21）：

1. **每个 exe 一份差分**：key = 游戏程序文件的 SHA-256（64 位小写十六进制）。同名不同版本（补丁、Steam 更新、汉化 exe）各自一份；改名的同一个文件还是同一份。不用标题，不含路径
2. **两种来源**：官方差分（我们根据一键上传的探针：脚本 + exe + 运行时样本，离线做出）优先；玩家本机自动校准的结果只给还没有官方差分的 exe 兜底
3. **只能是数据**：只允许 `core/profiles/defaults.cjs` 登记过的键，值必须在 `core/profiles/domains.cjs` 的值域内（枚举、布尔、数值区间、矩形、安全正则列表）。服务端入库前过滤，客户端收到后再验
4. **签名只在我们本机**：Ed25519，私钥只在本机签发工具 `tools/sign-profile.cjs` 里，路径走环境变量 `MEGULIT_PROFILE_KEY`，绝不进仓库，relay 上也没有。relay 被攻破也造不出客户端认的差分
5. **热更新**：开游戏按 exe 哈希拉差分，有就叠成 profile 的 auto 层，不重装不重编
6. **玩家之间共享**：同一 exe 收到多份校准，按一致性和分数去重，只保留一份
7. **冻结和夹具**：仓库里做好的游戏差分有回放夹具，`games-regression` 全过才能改内核；`domains.cjs` 缺键时 `auto-profile-relay` 测试会失败。客户端闸门退档时自动上报原因进修复队列，并触发自动探针

分工：服务端、探针运行时样本、签名工具在本分支；客户端加载 / 验签 / 热更新由 diff-layers 会话基于 `core/game-diff.cjs`、`core/profiles/domains.cjs`、`core/auto-profile.cjs exeKey` 做。本分支里 `services/auto-profile-feed.cjs` + `services/self-check-live.cjs` 是一份能用的参考实现（层顺序如下），合并时以 diff-layers 为准。

分层（`core/profiles`）：

```
内核默认 defaults.cjs ← 引擎差分 engines/<id>.cjs ← 仓库游戏差分 games/<gameKey>.cjs ← auto 层（下面四选一）
```

auto 层按顺序取第一个有的：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 本机退档 | 闸门在这台电脑上看到这个 exe 坏了：读模式，谁说的都不听 |
| 2 | 官方差分 | relay 下发，我们签名 |
| 3 | 本机校准 | `data/config/auto-profiles/<key>.json` |
| 4 | 共享自动差分 | relay 下发，≥2 人一致，我们签名 |

有官方差分或共享结论是读模式时，本机不再录制校准。「重新校准」删掉本机差分，这一局不看 relay，只按本机重测。key 按路径+大小+修改时间记在 `data/config/exe-hashes.json`，首次算哈希是异步流式读。

两个开关（`data/config/library.json`，默认都开，玩家可在设置里关；店主 2026-11-21：「这两个可以都开了 我已经和他们说了 全答应了」）：

| 键 | 管什么 |
|---|---|
| `autoProfileShare` | 上传本机校准/退档结果（同时还要「共享适配」`sharedAdaptation` 开着；拉取下发的差分不算上传，一直开） |
| `runtimeSampleShare` | 收集运行时样本（含游戏窗口截图），以及探针带上 / 单独补传样本 |

## 自检闸门 `core/self-check.cjs`

数据来源就是 MeguLit 本来写的日志：`HookNative.trace`（hook-events.log）和阅读层上报的条目（reader-host.log）。所以拿店主的日志回放，结果和他电脑上跑的一样。

每 20 句钩子台词（`source chars=N sequence=K`）算一个窗口，窗口结束时打分：

| 指标 | 怎么算 | 默认阈值 |
|---|---|---|
| hideVisible | hookVisual stage=hidden、valid 的句子里，扫描区仍识别到日文的比例 | > 25%（至少检查 4 句） |
| dropRate | core 放弃的钩子行 / (台词 + 丢句)。b64cb137 起 core 把找不到页面位置的行「drawn off the page layer, delivered from the hook text」补送给阅读层，记为 redrawn（补画，不算丢句）；「already read, skipped」不算；旧日志的「drawn nowhere ... dropped」仍算丢句 | > 15% |
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

`key` = exe 的 SHA-256（64 位十六进制）。不含路径。

```json
{
  "schema": 1,
  "key": "3f9a…（64 位）",
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

relay、客户端、签名工具共用这一个纯函数文件，签名的字节处处一致：

```json
{
  "schema": "megulit.game-diff", "version": 1,
  "key": "<64 hex exe SHA-256>", "source": "official|auto", "mode": "hide|read",
  "settings": { "只含 domains.cjs 允许的键和值": true },
  "exe": "fata_jp.exe", "engine": "krkr", "app": "", "issuedAt": "ISO",
  "agree": 3, "reporters": 4, "cost": 0.2,
  "signature": { "alg": "ed25519", "keyId": "p1", "value": "<base64，签 canonical(去掉 signature 的文档)>" }
}
```

- 客户端信任 `services/profile-keys.json` 里的公钥（现在为空：空着时客户端不接受任何下发差分）
- settings 需要过滤才能通过的文档整份拒收；mode=read 必须带 `hide.textEffectsRead=true`；多余字段拒收
- 验不过就当没有：坏掉或被投毒的 relay 最多让玩家拿不到差分

## 签名工具 `tools/sign-profile.cjs`（只在我们本机跑）

环境变量：`MEGULIT_PROFILE_KEY`（私钥 PEM 路径，必须在仓库外，否则拒绝）、`MEGULIT_PROFILE_KEY_ID`（默认 `p1`）、`MEGULIT_ADMIN_TOKEN`（relay 维护者令牌）。

| 命令 | 作用 |
|---|---|
| `keygen <仓库外目录>` | 生成密钥对：私钥写成 PEM，打印要加进 `services/profile-keys.json` 的公钥条目 |
| `key <game.exe>` | 算 exe 的差分 key |
| `make <exeHash> <settings.json> [--mode] [--exe] [--engine]` | 做一份官方差分（只留值域内的键，丢掉的打在 stderr） |
| `sign <diff.json>` | 签一份 |
| `picks <relay> <输出目录> [--upload]` | 拉 relay 上等签名的自动挑选结果，逐个校验、签名、写文件，`--upload` 传回 relay |
| `check <signed.json>` | 按客户端规则验形状、值和签名 |

## 指纹和两层（`core/game-print.cjs`）

「传火不能只靠 exe 哈希」：差分分两层，按指纹从精确到宽松匹配。

| 层 | 指纹（按顺序） | 说明 |
|---|---|---|
| 版本层（一个 exe 构建） | `exe` 全文件 SHA-256 → `head` 首尾各 64 KB + 大小 → `pe` 文件版本 + 链接时间戳（`1.2.0.0@5f3a1b2c`） | 重签名/小补丁的同一构建也能命中 |
| 游戏层（所有构建） | `exe`（已归到这个游戏的构建）→ `pack` 最大封包首尾各 1 MB + 大小 → `script` 剧本指纹（调用方给） → `steam` appid → `vndb` id → `title` 归一化标题的 SHA-256 | 新版本、汉化版、改名版都能拿到 |
| 引擎 | `engine` | 仓库里的引擎差分，不走服务端 |

`check(prints)` 只放过格式正确的值（哈希 64 位 hex、steam 数字、vndb `v\d+`、pe 版本@8 位 hex）。全是哈希、id、版本号，没有路径和名字。`prints(exe, {title, steamAppId, vndb, script, engine})` 同步读文件，探针 worker 和 diff-maker 用；运行时样本 `sample.json.prints`、探针 manifest `prints` 都带。

游戏身份 key（game layer key）：报告里第一个已经登记过的游戏指纹所属的游戏；都没登记过就用最强的那个指纹派生（`sha256('game|'+kind+':'+value)`），然后把它的所有游戏指纹和 exe 都登记到这个游戏（先到先得），这样只带 Steam id 的另一个构建也会并进来。官方游戏层差分上传时，它的 `prints` 定义这个游戏。

## 服务端 `relay/src/auto-profile.js`

路由前缀 `/api/game-profile`（`/api/profile/<id>` 已经是社区个人主页）。迁移 `relay/migrations/0022_auto_profiles.sql`：

- `auto_profile_reports`：每个 exe、每个上报者（IP 哈希）一行，新覆盖旧，每个 exe 最多 50 行；带 `gid`（归到的游戏）和 `prints`
- `auto_profile_picks`：每层每个 key 的一致最佳结果（未签名，带下一个 `rev`），等我们签
- `game_diffs`：每层每个 key 每种来源一份我们签好的文档（`official` / `auto`），官方优先
- `diff_prints`：指纹 → 层 key（`exe/head/pe` → 版本层，`exe/pack/script/steam/vndb/title` → 游戏层）
- `auto_profile_queue`：修复队列，每个 exe 一行（带 gid、prints、`note`=客户端 reason）；`kind` = `broken`（自检退档）或 `newVersion`（reason 以「同游戏新版本」开头：head/pe/游戏层命中的下发差分第一个窗口没过线，这个构建要补自己的版本层；游戏层官方差分上传时不会关掉它）
- `profile_runtime`：单独补传的运行时样本（R2 `profile-runtime/<key>.json.gz`）

| 接口 | 谁 | 说明 |
|---|---|---|
| `POST /api/game-profile/report` | 客户端 | `{version:1, profile:<autoProfile.profile>, prints?:{head,pe,pack,script,steam,vndb,title}}`，每 IP 每小时 30 次；同时归到版本层（exe）和游戏层（gid）；`source:'gate'` 进修复队列 |
| `GET /api/game-profile?exe=&head=&pe=&pack=&script=&steam=&vndb=&title=[&have=<rev>&haveGame=<rev>]` | 客户端 | `{schema:'megulit.game-diff-feed', version:2, key, match, versionLayer:{match,key,diff}\|null, gameLayer:{match,key,diff}\|null, diff:<两层里更好的那份>}`；`match` 是找到它的那个指纹；两层各自官方优先；`have`/`haveGame` 都是最新时 304；都没匹配 404 |
| `GET /api/game-profile/<exeHash>` | 客户端 | 同上，只带 exe |
| `POST /api/game-profile/runtime` | 客户端 | `{version:1, key, identity?, prints?, sha256, data:<base64 gzip 运行时包>}`，≤3 MB，每 IP 每小时 6 次 |
| `GET /api/game-profile/picks` | 我们 | 等签名的挑选结果（两层，未签名文档，带 rev） |
| `POST /api/game-profile/signed` | 我们 | `{diff}`；auto 必须正好是该层该 key 的当前挑选，否则 409；official 登记它的 prints 并关掉队列项 |

`rev` 每层每个 key 跨官方和自动一条线只增：自动挑选的 rev = 已下发的最大 rev + 1；官方差分必须带 `rev` 且大于已下发和待签挑选里最大的，否则 409 `{error:"REV_NOT_NEWER", min}`（客户端用 have/haveGame 比 rev 判断 304，同号就会拿不到新文档）。官方差分要盖过客户端内置 The Seed 时，rev 还要高于内置那份（docs/diff-layers.md「当前权威接口」）。
| `POST /api/game-profile/withdraw` | 我们 | `{key, layer?, source?}` |
| `GET /api/game-profile/queue[?all=1]` / `POST …/queue/close` | 我们 | 修复队列 |
| `GET /api/game-profile/runtime/list` / `…/runtime/get?key=` | 我们 | 补传的运行时样本 |

「我们」= `Authorization: Bearer ADAPTER_ADMIN_TOKEN`。relay 没有任何私钥。

差分文档多了三个字段：`layer`（`version`/`game`，默认 version）、`prints`（这一层的指纹）、`rev`（同一层同一 key 每次新挑选 +1，客户端用它判断要不要更新）。

自动挑选（最近 180 天）：版本层用这个 exe 的报告，游戏层用归到这个游戏的所有构建的报告；相同 mode+settings 算一组；超过半数是读模式且至少 2 人 → 读模式；否则在 ≥2 人一致的隐藏组里取平均代价最低的；只有 1 人报过的永远不挑。读取不写 D1。

部署（等店主说再做）：
1. 本机 `node tools/sign-profile.cjs keygen <仓库外目录>`，公钥条目加进 `services/profile-keys.json`（随下个版本发）
2. `wrangler d1 migrations apply megulit-relay --remote`，然后 `wrangler deploy`
3. 定期本机跑 `sign-profile.cjs picks https://cn-api.megulit.com <目录> --upload`；官方差分 `make <key> <settings.json> --layer game --prints prints.json` → `sign` → POST `signed`

## 运行时样本 `services/runtime-sample.cjs`

`runtimeSampleShare` 没被关掉时收集（默认开）。首个自检窗口（前 20 句）里收集，存 `data/runtime-samples/<key>/`：

| 文件 | 内容 |
|---|---|
| `sample.json` | 下面的结构化样本 |
| `hook-events.log` | 这个窗口的 hook-events 原始行（自检和校准的输入，diff-maker 直接拿来跑 `predict/calibrate`） |
| `reader-host.log` | 这个窗口的 reader-host 原始行（不含 hostFrame） |
| `engine-draw.log` | `logs/engine-draw.log`（feat/engine-draw 的 ToMe_CHARS 记录）里这个窗口时段（开始前 5 秒到保存时）的行，≤1.5 MB |
| `shot-1..3.jpg` | 第 3、10、18 句时各一张，`GalNative.sceneShot` 只截游戏自己的客户区（不含 MeguLit 图层和桌面），JPEG，每张 ≤600 KB |

两份日志写盘前过 `diagnostics.scrub`（用户名、用户目录、邮箱）。

```json
{
  "schema": "megulit.runtime-sample", "version": 1, "key": "<64 hex>", "exe": "fata_jp.exe", "engine": "krkr", "app": "1.4.21",
  "createdAt": "ISO", "client": [804, 604], "shots": 3,
  "prints":  { "exe": "…", "head": "…", "pe": "1.0.0.0@5f3a1b2c", "pack": "…", "steam": "303310", "title": "…", "engine": "krkr" },
  "lines":   [{ "at": 0, "seq": 5, "chars": 18, "name": "綾" }],
  "boxes":   [{ "at": 0, "line": 1, "x": 220, "y": 488, "w": 20, "h": 22 }],
  "choices": [{ "at": 0, "raw": 3, "shown": 0 }],
  "aux":     [{ "at": 0, "texts": ["を私呼ぶを私声…"] }],
  "drops":   [{ "at": 0, "chars": 16 }],
  "redrawn": [{ "at": 0, "chars": 9 }],
  "hide":    [{ "at": 0, "seq": 1, "visible": true }]
}
```

怎么上传：
- 还没有完整探针的游戏：下一次自动探针（`probe-full.cjs`）把这些文件打进 `.mlfp`，item kind `runtime`（`runtime/sample.json`、`runtime/hook-events.log`、`runtime/reader-host.log`）和 `shot`（`runtime/shot-N.jpg`）
- relay 已有这个 identity 的完整探针：`probe-auto.runtimeOnly` 只补传样本（gzip 包 `{schema:'megulit.runtime-bundle', version:1, key, files:[{name, kind, sha256, data(base64)}]}`），不重传脚本和 exe；同一份样本只传一次

## 测试

`validation/self-check-gate.test.cjs`：用店主 incr9 日志（裁剪后放在 `validation/helpers/selfcheck-replay/`）回放

- ファタモルガーナの館（22:51–22:53Z）：第 1 个窗口丢句率 23% 超线 → 退档；校准里所有隐藏组合都不过线 → 读模式
- 千恋＊万花（22:53:42Z 之后）：窗口全部过线，校准保持隐藏重画
- 在线服务：首次校准写盘、读模式带原因、重新校准、已存的隐藏差分运行中退档

`validation/auto-profile-relay.test.cjs`：Worker 进程内跑（D1 用 node:sqlite，R2 用 Map），覆盖值域表完整、私钥只能在仓库外、单人不挑、relay 不签名且未签不下发、本机工具签名后客户端验签通过、篡改/别的密钥/错 key 被拒、非当前挑选 409、最低代价胜出、读模式要过半、危险正则和未知键被滤、官方优先/撤回/只能我们传、退档进修复队列且官方差分关单、客户端四级优先级、两个开关默认开、可关、运行时样本（日志脱敏、只补传一次）

`validation/fata-effects-replay.test.cjs`（海馆新 core 夹具）：自检在同一批 trace 上丢句率 0，补送行记为补画
