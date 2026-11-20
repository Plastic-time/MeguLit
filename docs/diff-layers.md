# 分层差分（game profiles）

MeguLitHook 是所有游戏共用的内核。会因游戏而异的行为全部写成**键**，每部游戏用一份冻结的设置对象运行，修一部游戏只改它自己的差分

## 层（后面盖前面，全部叠加）

| 层 | 来源 | layers 里的名字 |
|---|---|---|
| 内核 | `core/profiles/defaults.cjs` | `core` |
| 引擎差分 | `core/profiles/engines/<engine>.cjs` | `engine` |
| 仓库游戏差分 | `core/profiles/games/<gameKey>.cjs` | `game` |
| 共享自动 | relay 下发，relay 签名（多人校准一致） | `shared` |
| 本机校准 | `data/config/auto-profiles/<key>.json`（`core/auto-profile.cjs`） | `auto` |
| 下发官方 | relay 下发，维护者签名（探针 → 离线做出） | `official` |
| 本机退档 | 自检闸门在这台电脑上看到这个 exe 坏了（读模式） | `stepdown` |

- 本机退档永远在最上面：哪一层出问题，这台电脑都能退回读模式
- 数组整组替换，不合并；`null` 表示交给内核原有判断
- `profileFor({engine,exe,title,folder,steamAppId,exeSha256,shared,auto,official,stepDown})` → 冻结对象 `{gameKey,engine,exeSha256,layers,matched,rejected,...键}`；后四个是设置对象，由 `services/self-check-live.cjs inputOf` 从本机记录和 relay 下发里取
- `apply(profile,layer,name)` 在已有 profile 上再盖一层

## 键和值域

所有键登记在 `core/profiles/defaults.cjs`（默认值 = 旧行为），值域登记在 `core/profiles/domains.cjs`（app 和 relay 用同一份）。来自仓库外的每一层（共享、本机、官方、退档）进 `profileFor` 前都过 `domains.clean`：**有一个键或值不在值域里，这一层整层不用**（`profile.rejected` 记原因，trace 里能看到）；下发文档在验签前已经整份校验过（`core/game-diff.cjs validate`）。仓库文件在 `validation/games-regression.test.cjs` 里过同一份值域。新加分叉：先在 defaults 加键、在 domains 登记值域，再由需要的游戏设值

读取：
- core：`hook-native` / `gal-native` / `overlay-placement` 的 `this.profile`，`Profiles.get(this.profile,'page.holdMs',null)`
- 阅读层：`window.MeguLitProfile.get('placement.firstLineAnchor',null)`，变化时触发 `megulit-profile`
- HookBridge（原生）：`hide.engineTrial.{enabled,unconfirmedLines,clickMs,skipAside}`，启动时环境变量 `MEGULIT_PROFILE`，之后 `{"type":"profile","engineTrial":{...}}`（`native/HookBridge.cs ApplyProfile`，`--self-test` 含 `ProfileSelfTest`）。不设就是旧规则：试验开、连续 2 句未确认就关、一次点击 400 ms、名字牌和场景标签跳过

## 绘制角色

一套角色，以画字协议为准（docs/engine-draw-protocol.md）：引擎能报角色时直接在 `ToMe_CHARS` 里带 `role=line|name|choice|button|menu|system`（`draw.roles` 打开）；只知道自己身份（钩子名、窗口类、调用）时，由 `draw.roleMap` / `draw.rolePatterns` / `draw.roleFallback` 归到同样的六种角色（`core/draw-role.cjs`，引擎差分写本引擎的类，游戏差分只加自己的插件窗口）。只有 `line` 可以隐藏或替换

## 认游戏

- **唯一的 exe 键：exe 文件完整 SHA-256**，写作 `x-<64 位小写 hex>`，日志里显示前 8 位。一个哈希 = 一个版本：改名、换路径还是同一份，补丁、Steam 更新、汉化 exe 各是一份。按路径+大小+修改时间记在 `data/config/exe-hashes.json`，已知的 exe 开游戏不用再读文件（`core/auto-profile.cjs exeKey / exeKeySync`）
- 仓库游戏差分的 `match`：`exeSha256`（列出的哈希，+10）、`steamAppId` / `files`（+3）、程序名（独特名 +3，BGI.exe 这类通用名 +1）、标题（完全相同 +3，包含 +2）、同引擎 +1；引擎冲突直接排除，`notTitles` 排除 FD/续作，≥3 才算命中。标题和 Steam id 只用来找候选
- gameKey：仓库游戏文件名，没有就是 `auto-<hash>`（程序名 + 标题）
- 日志：`profile <gameKey> exe=<哈希前8位> layers=core+engine+game+…+official+stepdown engine=<engine> match=<依据>`；还没算出哈希时 `exe=-`

## 下发文档（`core/game-diff.cjs`）

```json
{
 "schema": "megulit.game-diff", "version": 1,
 "key": "x-<exe SHA-256，64 位小写 hex>",
 "source": "official",
 "mode": "hide",
 "settings": { "page": { "holdMs": 900 }, "hide": { "engineTrial": { "enabled": false } } },
 "exe": "SenrenBanka.exe", "engine": "kirikiri", "app": "1.4.21", "issuedAt": "2026-11-21T12:00:00Z",
 "signature": { "alg": "ed25519", "keyId": "k1", "value": "<base64>" }
}
```

- 只允许 `core/game-diff.cjs` 列出的字段；`mode:"read"` 必须同时有 `hide.textEffectsRead:true`
- 签名：Ed25519，签去掉 `signature` 后的规范 JSON（键排序）。`official` 只认维护者密钥 `services/adapter-pack-keys.json`；`auto`（共享）认 relay 密钥 `services/auto-profile-keys.json`，维护者密钥也认。私钥不进仓库，`tools/game-diff.cjs keygen/make/sign/check`
- 验签和值域在 `services/auto-profile-feed.cjs layer()`，每次从缓存读都重新检查

## 热更新

一个接口：`GET <relay>/api/auto-profile/<key>` → `{"schema":"megulit.game-diff-feed","version":1,"key":…,"diff":<签名文档>}`，404 表示这个 exe 没有差分。relay 每个 exe 只给一份：有官方给官方，否则给多人一致的共享自动差分（`relay/src/auto-profile.js`）

客户端（`services/auto-profile-feed.cjs refresh`）：开游戏、知道 exe 键后读本地缓存 `data/profiles/remote/<key>.json` 立即叠层，后台再拉（缓存 1 天，"没有" 6 小时），拉到通过验签的新文档就当场 `setGameProfile`，不用重启。只发 exe 键。`MEGULIT_RELAY_BASE=off` 时不请求。本机校准结果和退档按「共享适配」开关上报 `/api/auto-profile/report`

## 流程

用户一键探针上传 → 离线做出差分 + 回放夹具（`validation/fixtures/games/<gameKey>/`）→ 维护者签名 → `POST /api/auto-profile/official` 发布 → 客户端热更新 → 用户间按 exe 键共享去重。服务端和签名工具在 auto-profile 会话，离线做差分在 diff-maker 会话

## 测试

- `validation/games-regression.test.cjs`：每部游戏的 identity + `*.case.cjs` 回放；只改游戏差分时只跑那部，`MEGULIT_GAMES=key` 指定；扫描内核不许 `exe==='xxx.exe'`
- `validation/profile-layers.test.cjs`：接线
- `validation/profile-stack.test.cjs`：层顺序、值域整层拒绝、exe 键、HookBridge 键
- `validation/auto-profile-relay.test.cjs`、`validation/self-check-gate.test.cjs`：签名、下发、自检和退档
