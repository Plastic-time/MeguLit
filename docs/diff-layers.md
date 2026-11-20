# 分层差分（game profiles）

MeguLitHook 是所有游戏共用的内核。会因游戏而异的行为全部写成**键**，每部游戏用一份冻结的设置对象运行，修一部游戏只改它自己的差分

## 层（后面盖前面）

| 层 | 来源 | layers 里的名字 |
|---|---|---|
| 内核 | `core/profiles/defaults.cjs` | `core` |
| 引擎差分 | `core/profiles/engines/<engine>.cjs` | `engine` |
| 仓库游戏差分 | `core/profiles/games/<gameKey>.cjs` | `game` |
| 官方下发差分 | `data/profiles/remote/<exeSha256>.json`（签名，热更新） | `remote` |
| 本机校准 | `data/config/auto-profiles/<gameKey>.json`（`core/auto-profile.cjs`） | `auto` |

- `auto` 只在这个 exe 版本**没有**官方差分时生效；有了官方差分，本机校准留着，但不再参与合并
- 数组整组替换，不合并；`null` 表示交给内核原有判断
- `profileFor({engine,exe,title,folder,steamAppId,exeSha256,remote,auto})` → 冻结对象 `{gameKey,engine,exeSha256,remoteVersion,layers,matched,rejected,...键}`
- `apply(profile,layer,name)` 在已有 profile 上再盖一层（规则同上）

## 键

所有键登记在 `core/profiles/defaults.cjs`（默认值 = 旧行为），类型和值域登记在 `core/profiles/schema.cjs`。任何一层（仓库文件、下发文档、本机校准）只能写登记过的键，`schema.validate` 逐键检查类型和值域，**有一个键不合法整份拒绝**（下发文档记 `profile remote rejected: …`，仓库文件让 `validation/games-regression.test.cjs` 失败）。新加分叉：先在 defaults 加键、在 schema 登记类型，再由需要的游戏设值

读取：
- core：`hook-native` / `gal-native` / `overlay-placement` 的 `this.profile`，`Profiles.get(this.profile,'page.holdMs',null)`
- 阅读层：`window.MeguLitProfile.get('placement.firstLineAnchor',null)`，变化时触发 `megulit-profile`
- HookBridge（原生）：`hide.engineTrial.*`，启动时环境变量 `MEGULIT_PROFILE`，之后 `{"type":"profile","engineTrial":{...}}`（`native/HookBridge.cs ApplyProfile`，`--self-test` 含 `ProfileSelfTest`）

## 认游戏

- **主键：exe 的 SHA-256**（一个哈希 = 一个版本）。启动时算一次，缓存在 `cache/exe-sha256.json`，按路径记、大小或 mtime 变了就重算（`core/profiles/remote.cjs exeHash`）
- 官方差分按哈希存取，和文件名、路径无关：改名、盗版换壳不改 exe 内容时照样命中；Steam 版和 DL 版 exe 不同就是两个版本，各有各的差分
- 仓库游戏差分的 `match`：`exeSha256`（列出的哈希，+10）、`steamAppId` / `files`（+3）、程序名（独特名 +3，BGI.exe 这类通用名 +1）、标题（完全相同 +3，包含 +2）、同引擎 +1；引擎冲突直接排除，`notTitles` 排除 FD/续作，≥3 才算命中。标题和 Steam id 只用来找候选
- gameKey：仓库游戏文件名 → 官方差分里的 `gameKey` → `auto-<hash>`（程序名 + 标题）
- 日志：`profile <gameKey> exe=<哈希前8位> layers=core+engine+game+remote engine=<engine> remote=v<版本> match=<依据>`；还没算出哈希时 `exe=-`

## 官方下发差分格式

```json
{
 "schema": "megulit.profile", "format": 1,
 "exeSha256": "<64 位小写十六进制>",
 "version": 3,
 "gameKey": "senren-banka",
 "engine": "kirikiri",
 "settings": { "page": { "holdMs": 900 }, "hide": { "engineTrial": { "enabled": false } } },
 "createdAt": "2026-11-21T12:00:00Z",
 "note": "可选说明",
 "signature": { "alg": "ed25519", "keyId": "k1", "value": "<base64>" }
}
```

- 只允许上面这些顶层字段，整份 ≤ 64 KB
- 签名和适配包完全相同：Ed25519，签名内容是去掉 `signature` 后的规范 JSON（键排序，`services/adapter-packs.cjs canonical`）；公钥在 `services/adapter-pack-keys.json`，私钥不进仓库；签名用 `core/profiles/remote.cjs sign(doc, privateKey, keyId)` 或 `services/adapter-packs.cjs sign`
- `version` 是整数，只增不减；客户端只存比本地更新的版本
- 每次读盘都重新验签和校验，被改过的文件不用

## 热更新

开游戏、算出哈希后，后台请求一次 `GET <relay>/api/profile/<exeSha256>[?have=<本地版本>]`（`services/profile-sync.cjs`，每个哈希每次运行最多一次，6 小时内不重复）：

| 回复 | 客户端 |
|---|---|
| 200 + 签名文档 | 校验通过且更新 → 写入 `data/profiles/remote/`，当场 `setGameProfile` 生效，不用重启 |
| 304 | 本地已是最新 |
| 404 / 204 | 这个版本没有官方差分 |
| 其他 / 超时 | 不变，记 trace |

只发送 exe 哈希，不带任何用户信息。`MEGULIT_RELAY_BASE=off` 时不请求

## 流程

用户一键探针上传 → 离线做出差分 + 回放夹具（`validation/fixtures/games/<gameKey>/`）→ 签名 → relay 发布 `/api/profile/<exeSha256>` → 客户端热更新 → 用户间按 exe 哈希共享去重。服务端和签名工具在 auto-profile 会话（`feat/auto-profile-*`）

## 测试

- `validation/games-regression.test.cjs`：每部游戏的 identity + `*.case.cjs` 回放；只改游戏差分时只跑那部，`MEGULIT_GAMES=key` 指定；扫描内核不许 `exe==='xxx.exe'`
- `validation/profile-layers.test.cjs`：接线
- `validation/profile-remote.test.cjs`：类型校验、签名、存取、哈希缓存、层顺序、热更新、HookBridge 键
