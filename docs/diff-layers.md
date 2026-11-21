# 分层差分（game profiles）

MeguLitHook 是所有游戏共用的内核。会因游戏而异的行为全部写成**键**，每部游戏用一份冻结的设置对象运行，修一部游戏只改它自己的差分


## 当前权威接口（2026-11-21，其他会话只照这一节做）

这一节是唯一准绳；和它不一致的旧说法（`core/profiles/identity.cjs`、`scope`/`game` 字段、`megulit.seed`、`x-` 前缀、`/api/auto-profile/…`、`files` 指纹）都已作废

**指纹**（`core/game-print.cjs prints()/check()`，app、探针、diff-maker、relay 同一份）：
- 版本层：`exe` 整文件 SHA-256（64 hex）、`head` 首尾 64 KB + 大小的 SHA-256、`pe` 文件版本 + PE 链接时间（`1.2.0.0@5f3a1b2c`）
- 游戏层：`pack` 最大封包首尾 1 MB + 大小、`script` 剧本指纹、`steam` appid、`vndb`（`v1234`）、`title` 折叠标题的 SHA-256
- 另有 `engine`（引擎 id，只用来选仓库引擎差分）

**键**：`core/profiles/defaults.cjs` 登记默认值（= 旧行为），`core/profiles/domains.cjs` 登记值域和所属层（`layer:'version'|'game'`，`layerOf`/`split`）。任何来源的差分只能用登记过的键，值必须在值域内，否则整层不用

**文档**（`core/game-diff.cjs`）：`{schema:'megulit.game-diff', version:1, key, layer:'version'|'game', prints, rev, source:'official'|'auto', mode:'hide'|'read', settings, exe, engine, app, issuedAt, agree?, reporters?, cost?, signature?}`
- 版本层 key = exe SHA-256，可以放任何键，`mode` 可省；游戏层 key = 游戏身份（relay `gidFor`），只能放游戏层键
- `mode:'read'` 必须带 `hide.textEffectsRead:true`；`rev` 只增

**The Seed 文件**（仓库内置，官方，不签名）：
- `The Seed/<engine>/<slug>/game.json`：游戏层文档 + seed 字段 `seedFormat`（seed 格式版本，现为 1，不写 = 1）、`status`（`verified` / `owner-ok` / `read` / `skeleton`）、`slug`（= 目录名）、`builds`（exe SHA-256 列表，版本文件可以在别的游戏目录下：一个 exe 被几部共用时版本层只有一份）、`sourceLangs`（游戏原文的语言，BCP 47，默认 `["ja"]`，例如 `["en","zh-Hans"]`）、可选 `match {exe, titles, notTitles}`（可读的程序名和标题，汉化改名时用）、可选 `ext {<扩展名>: …}`（扩展区）
- 向前兼容：客户端不认识的顶层字段、`ext` 里不认识的扩展、settings 里不认识的键都忽略（`seed.cjs check()` 的 `ignored`），认识的字段和键严格校验；`seedFormat` 比自己新也照样读
- `The Seed/<engine>/<slug>/versions/<exe SHA-256>.json`：版本层文档，文件名 = key
- settings 钉住每个键的当前生效值：做好了就是做好了，内核默认改了它也不变
- 客户端语义：`verified` / `owner-ok` 直接用（官方游戏层）；`read` 直接读模式（官方游戏层）；`skeleton` 只给身份 + 钉住值，放在本机校准下面，自检闸门照常把关（不过线退读模式）

**语言**（2026-11-21，为英文学习模式和多语言译文留的接口）：
- 跟语言有关的设置放 `settings.lang.<bcp47>`：`{annotation: 'ruby'|'ipa'|'pinyin'|'none', pairing: 'script'|'patch'|'machine'|'none', dictionary: <id>, fontFallback: [字体名]}`（`core/profiles/domains.cjs langMap`，块里不认识的字段忽略）；游戏层键；各层按语言、按字段叠加
- 客户端按「当前学习模式读的源语言」取块：`Profiles.forLang(profile, 'en')`（`zh-Hans` 找不到时退到 `zh`），没有就用语言无关的公共设置
- 现有 55 份 seed 已迁：`seedFormat:1`、`sourceLangs:["ja"]`、`settings.lang.ja.annotation:"ruby"`；没有这些字段的旧 seed 照样能读
- 配对数据按语言对分：`megulit.lines` 带 `source` / `target`（BCP 47），一部游戏可以有多份（ja→zh-Hans、en→zh-Hans、en→ja）
- 学习模式（jp-learning / en-learning）是客户端维度，不进 seed；seed 只描述游戏和它的语言

**层顺序**（全部叠加，后面盖前面）：内核 ← 引擎差分 ← 仓库游戏文件 / skeleton seed ← 共享自动·游戏层 ← 共享自动·版本层 ← 本机校准 ← 官方·游戏层（内置 seed 或下发，rev 更高的下发覆盖内置）← 官方·版本层（同上）← 本机退档

**认游戏**：①`exe` → ②`head`/`pe` → ③`pack`/`script`/`steam`/`vndb`/`title`（加上 seed `builds`、`match` 名字）→ ④`engine`。版本层只在 ①② 用（① 时 key 必须是这个 exe），游戏层任一级都用；② ③ 命中的下发差分是候选，第一个自检窗口不过线就拒用并上报。trace：`profile <gameKey> match=exe|head|pe|game:<依据>|engine|none exe=<前8位> layers=… engine=…`

**接口**（relay，`relay/src/auto-profile.js`）：
- `GET /api/game-profile?exe=&head=&pe=&pack=&script=&steam=&vndb=&title=&engine=&have=<版本层rev>&haveGame=<游戏层rev>` → `200 {schema:'megulit.game-diff-feed', version:2, key, match, versionLayer:{match,key,diff}|null, gameLayer:{match,key,diff}|null, diff}` / `304` 都最新 / `404` 都没有
- `POST /api/game-profile/report {version:1, profile:{…}, prints?}`：校准和退档上报（`autoProfileShare` 默认开，用户设 false 才关，另需「共享适配」）；reason 以「同游戏新版本」开头的 gate 上报进修复队列 `kind=newVersion`，其余 `broken`
- `POST /api/game-profile/runtime`：运行时样本（`runtimeSampleShare` 默认开）
- `POST /api/game-profile/signed {diff, …}`：我们本机签过的文档

**签名**：Ed25519，签去掉 `signature` 的规范 JSON；只在我们本机签（`tools/sign-profile.cjs`，私钥走 `MEGULIT_PROFILE_KEY`），relay 不持私钥；客户端公钥 `services/profile-keys.json`（官方和自动同一组）。内置 The Seed 不签名

**本机文件**：下发缓存 `data/The Seed/<exe SHA-256>.json`（relay 整份回复）和 `<exe SHA-256>.rejected.json`（被拒候选）；本机校准 `data/config/auto-profiles/`；exe 哈希缓存 `data/config/exe-hashes.json`

## 层（后面盖前面，全部叠加）

| 层 | 来源 | layers 里的名字 |
|---|---|---|
| 内核 | `core/profiles/defaults.cjs` | `core` |
| 引擎差分 | `core/profiles/engines/<engine>.cjs` | `engine` |
| 仓库游戏差分（需要代码的极少数情况） | `core/profiles/games/<gameKey>.cjs` | `game` |
| 共享自动·游戏层 | relay 下发，多人校准一致，我们签名 | `shared-game` |
| 共享自动·版本层 | 同上，只对这个 exe | `shared` |
| 本机校准 | `data/config/auto-profiles/<key>.json`（`core/auto-profile.cjs`） | `auto` |
| 官方·游戏层 | 内置 `The Seed/<engine>/<gameId>/game.json`（`seed-game`），或 relay 下发、我们签名、rev 更高的（`official-game`） | `seed-game` / `official-game` |
| 官方·版本层 | 内置 `The Seed/…/versions/<exe>.json`（`seed`），或 relay 下发、rev 更高的（`official`） | `seed` / `official` |
| 本机退档 | 自检闸门在这台电脑上看到这个 exe 坏了（读模式） | `stepdown` |

- 本机退档永远在最上面：哪一层出问题，这台电脑都能退回读模式
- 数组整组替换，不合并；`null` 表示交给内核原有判断
- `profileFor({engine,exe,title,folder,steamAppId,vndb,exeSha256,match,sharedGame,shared,auto,officialGame,official,stepDown})` → 冻结对象 `{gameKey,engine,exeSha256,match,layers,matched,rejected,...键}`；后六个是设置对象，由 `services/self-check-live.cjs inputOf` 从本机记录和 relay 下发里取
- `apply(profile,layer,name)` 在已有 profile 上再盖一层

## The Seed（内置游戏差分）

仓库根目录 `The Seed/` 是正式产物：随 GitHub main 发布，安装包里在 `MeguLit/The Seed/`（只多一个子目录），热更新也带（`services/hot-update.cjs`、`Release.ps1`）。以后改游戏只改它的 seed。格式见上面「当前权威接口」，生成工具 `tools/diff-maker/seed-all.cjs`（diff-maker 分支，待合），加载 `core/profiles/seed.cjs`，校验 `validation/the-seed.test.cjs`

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
