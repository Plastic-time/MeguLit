# 分层差分（game profiles）

MeguLitHook 是所有游戏共用的内核。会因游戏而异的行为全部写成**键**，每部游戏用一份冻结的设置对象运行，修一部游戏只改它自己的差分

## 层（后面盖前面，全部叠加）

| 层 | 来源 | layers 里的名字 |
|---|---|---|
| 内核 | `core/profiles/defaults.cjs` | `core` |
| 引擎差分 | `core/profiles/engines/<engine>.cjs` | `engine` |
| 仓库游戏差分 | `core/profiles/games/<gameKey>.cjs` | `game` |
| 共享自动·游戏层 | relay 下发，多人校准一致，我们签名 | `shared-game` |
| 共享自动·版本层 | 同上，只对这个 exe | `shared` |
| 本机校准 | `data/config/auto-profiles/<key>.json`（`core/auto-profile.cjs`） | `auto` |
| 下发官方·游戏层 | relay 下发，我们签名，对这部游戏所有版本 | `official-game` |
| 下发官方·版本层 | relay 下发，我们签名，只对这个 exe | `official` |
| 本机退档 | 自检闸门在这台电脑上看到这个 exe 坏了（读模式） | `stepdown` |

- 本机退档永远在最上面：哪一层出问题，这台电脑都能退回读模式
- 数组整组替换，不合并；`null` 表示交给内核原有判断
- `profileFor({engine,exe,title,folder,steamAppId,vndb,exeSha256,match,sharedGame,shared,auto,officialGame,official,stepDown})` → 冻结对象 `{gameKey,engine,exeSha256,match,layers,matched,rejected,...键}`；后六个是设置对象，由 `services/self-check-live.cjs inputOf` 从本机记录和 relay 下发里取
- `apply(profile,layer,name)` 在已有 profile 上再盖一层

## 键和值域

所有键登记在 `core/profiles/defaults.cjs`（默认值 = 旧行为），值域登记在 `core/profiles/domains.cjs`（app 和 relay 用同一份）。来自仓库外的每一层（共享、本机、官方、退档）进 `profileFor` 前都过 `domains.clean`：**有一个键或值不在值域里，这一层整层不用**（`profile.rejected` 记原因，trace 里能看到）；下发文档在验签前已经整份校验过（`core/game-diff.cjs validate`）。仓库文件在 `validation/games-regression.test.cjs` 里过同一份值域。新加分叉：先在 defaults 加键、在 domains 登记值域，再由需要的游戏设值

读取：
- core：`hook-native` / `gal-native` / `overlay-placement` 的 `this.profile`，`Profiles.get(this.profile,'page.holdMs',null)`
- 阅读层：`window.MeguLitProfile.get('placement.firstLineAnchor',null)`，变化时触发 `megulit-profile`
- HookBridge（原生）：`hide.engineTrial.{enabled,unconfirmedLines,clickMs,skipAside}`，启动时环境变量 `MEGULIT_PROFILE`，之后 `{"type":"profile","engineTrial":{...}}`（`native/HookBridge.cs ApplyProfile`，`--self-test` 含 `ProfileSelfTest`）。不设就是旧规则：试验开、连续 2 句未确认就关、一次点击 400 ms、名字牌和场景标签跳过

## 绘制角色

一套角色，只看画字协议（docs/engine-draw-protocol.md）：引擎差分在 `ToMe_CHARS` 记录里带 `role=line|name|choice|button|menu|system`（`draw.roles` 打开时上报），内核和 diff-maker 都只认这个字段，不再按钩子名 / 窗口类在 profile 里另配规则。只有 `line` 可以隐藏或替换；`draw.embed` / `draw.embedTranslation` 控制台词由游戏自己画

## 认游戏（多级匹配）

补丁、破解、汉化、不同发行版都会改 exe，只认哈希会全部失配，所以按指纹从精确到宽松认（`core/game-print.cjs`，app、探针、diff-maker、relay 共用同一套算法和 `check()` 规则；只有哈希、id 和版本号，没有路径和名字）：

| 级别 | 指纹 | 属于 |
|---|---|---|
| ① | `exe` exe 文件完整 SHA-256（`core/auto-profile.cjs exeKey`，按路径+大小+修改时间缓存在 `data/config/exe-hashes.json`） | 版本层 |
| ② | `head` exe 首尾 64 KB + 大小的 SHA-256；`pe` 文件版本 + PE 链接时间（`1.2.0.0@5f3a1b2c`） | 版本层 |
| ③ | `pack` 最大封包首尾 1 MB + 大小；`script` 剧本指纹；`steam`；`vndb`；`title` 标题哈希 | 游戏层 |
| ④ | `engine` | 仓库引擎差分 |

仓库游戏差分的 `match` 也按这条链：`exeSha256` 算 ①，程序名、`steamAppId` / `files`、标题、同引擎算 ③（引擎冲突直接排除，`notTitles` 排除 FD/续作，≥3 才算命中）

日志：`profile <gameKey> match=exe|head|pe|game:<pack|script|steam|vndb|title|name…>|engine|none exe=<哈希前8位> layers=… engine=…`；还没算出哈希时 `exe=-`

## 版本层和游戏层

`core/profiles/domains.cjs` 给每个键标了 `layer`（`layerOf` / `split`）：

- **版本层**（`layer:'version'`）：只对某个 exe 有效：原生钩子相关、exe 专属开关。现在是 `draw.embed`、`draw.embedTranslation`、`hide.engineTrial.*`；以后的钩子地址、特征码偏移类键都标成版本层
- **游戏层**（`layer:'game'`）：对这部游戏所有版本有效：文本框位置、特效帧、选项过滤、隐藏方式、自检阈值、排版

下发文档带 `layer`：`version`（key = exe SHA-256，可以含任何键：这个 exe 自己量出来的；只含版本层键时 `mode` 可以不写，交给游戏层）、`game`（key = 游戏身份 64 hex，只能含游戏层键，`prints` 说明这部游戏的指纹）。客户端：**版本层只在 ①② 命中时用（① 命中时必须是这个 exe 的 key）；游戏层在任何一级命中都用**；④ 只有仓库引擎差分

## 候选和自检

只有 ① 是确定的（游戏层由这个 exe 自己的 ① 找到也算）。② ③ 命中时下发差分只是**候选**：照常叠上去，本机自检闸门照常跑，同时第一个窗口照常录制。第一个窗口不过线就不用这份（记在 `data/The Seed/<exe>.rejected.json`，relay 换了新的才再试），退回本机校准（就用这个窗口）或读模式，并带指纹上报（原因「同游戏新版本：下发差分（match=…）第一个窗口未过线」，进修复队列，补上这个 exe 的版本层）

## 下发文档（`core/game-diff.cjs`）

```json
{
 "schema": "megulit.game-diff", "version": 1,
 "key": "<版本层：exe SHA-256；游戏层：游戏身份>，64 位小写 hex",
 "layer": "version",
 "prints": { "exe": "…", "head": "…", "pe": "1.2.0.0@5f3a1b2c" },
 "rev": 3,
 "source": "official",
 "mode": "hide",
 "settings": { "hide": { "engineTrial": { "enabled": false } } },
 "exe": "SenrenBanka.exe", "engine": "kirikiri", "app": "1.4.21", "issuedAt": "2026-11-21T12:00:00Z",
 "signature": { "alg": "ed25519", "keyId": "k1", "value": "<base64>" }
}
```

- 只允许 `core/game-diff.cjs` 列出的字段；`mode:"read"` 必须同时有 `hide.textEffectsRead:true`；`rev` 只增
- 签名：Ed25519，签去掉 `signature` 后的规范 JSON（键排序）。官方差分和共享自动差分都由我们在本机签（`tools/sign-profile.cjs`，私钥路径走环境变量 `MEGULIT_PROFILE_KEY`，放在仓库里会被拒绝），relay 不持私钥；公钥只有一个文件 `services/profile-keys.json`（为空时不接受任何下发）。适配包继续用自己的 `services/adapter-pack-keys.json`
- 验签和值域在 `services/auto-profile-feed.cjs layer()`，每次从缓存读都重新检查；游戏层 key 不是 exe，验签时不要求 key===exe

## 热更新

一个接口：`GET <relay>/api/game-profile?exe=&head=&pe=&pack=&script=&steam=&vndb=&title=&engine=&have=<版本层 rev>&haveGame=<游戏层 rev>`（`auto-profile-feed.cjs query`，有什么带什么；`/api/profile/<id>` 是社区个人主页，所以叫 game-profile）。回复：

```
200 {schema:'megulit.game-diff-feed', version:2, key, match,
     versionLayer:{match:'exe'|'head'|'pe', key, diff}|null,
     gameLayer:{match:<任一指纹>, key, diff}|null,
     diff:<两层里更好的那份，给旧客户端>}
304 两层都已是最新   404 哪一级都没有
```

（`versionLayer` / `gameLayer` 不叫 `version` / `game`：`version` 已经是回复格式号。）服务端（`relay/src/auto-profile.js`）按 exe 聚合版本层、按游戏身份聚合游戏层，每层有官方给官方，否则给多人一致、我们签过的共享自动差分

客户端：开游戏、知道 exe 键后读本地缓存立即叠层，后台算指纹再拉（缓存 1 天，"没有" 6 小时），拉到通过验签的新文档就当场 `setGameProfile`，不用重启

**The Seed**：用户电脑上存放下发差分（传火数据）的文件夹叫 `data/The Seed/`（路径带空格），每个 exe 一份 `<exe SHA-256>.json`（relay 的整份回复，含两层）和被拒候选的 `<exe SHA-256>.rejected.json`。日志和文档里都这么称呼

上传（店主 2026-11-21 定为默认开，用户设成 false 才关）：校准结果和退档上报要 `library.json autoProfileShare` 不为 false 且「共享适配」开着，带顶层 `prints`；运行时样本（游戏客户区截图、去隐私的日志）要 `runtimeSampleShare` 不为 false

## 流程

用户一键探针上传 → 离线做出差分 + 回放夹具（`validation/fixtures/games/<gameKey>/`）→ 本机签名（`tools/sign-profile.cjs`）→ `POST /api/game-profile/signed` 发布 → 客户端热更新 → 用户间按 exe 和游戏身份共享去重。服务端和签名工具在 auto-profile 会话，离线做差分在 diff-maker 会话

## 测试

- `validation/games-regression.test.cjs`：每部游戏的 identity + `*.case.cjs` 回放；只改游戏差分时只跑那部，`MEGULIT_GAMES=key` 指定；扫描内核不许 `exe==='xxx.exe'`
- `validation/profile-layers.test.cjs`：接线
- `validation/profile-stack.test.cjs`：层顺序、值域整层拒绝、exe 键、HookBridge 键
- `validation/auto-profile-relay.test.cjs`、`validation/self-check-gate.test.cjs`：签名、下发、自检和退档
