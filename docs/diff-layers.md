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
| 下发官方·游戏层 | relay 下发，我们签名，对这部游戏所有版本有效 | `official-game` |
| 下发官方·版本层 | relay 下发，我们签名，只对这个 exe 有效 | `official` |
| 本机退档 | 自检闸门在这台电脑上看到这个 exe 坏了（读模式） | `stepdown` |

- 本机退档永远在最上面：哪一层出问题，这台电脑都能退回读模式
- 数组整组替换，不合并；`null` 表示交给内核原有判断
- `profileFor({engine,exe,title,folder,steamAppId,vndb,exeSha256,match,shared,auto,officialGame,official,stepDown})` → 冻结对象 `{gameKey,engine,exeSha256,layers,matched,rejected,...键}`；后四个是设置对象，由 `services/self-check-live.cjs inputOf` 从本机记录和 relay 下发里取
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

补丁、破解、汉化、不同发行版都会改 exe，只认哈希会全部失配，所以按下面的顺序认，越靠前越精确（`core/profiles/identity.cjs` 收集，只发哈希和公开 id，不发路径）：

| 级别 | 依据 | trace 里的 match |
|---|---|---|
| ① exe | exe 文件完整 SHA-256（`core/auto-profile.cjs exeKey`，按路径+大小+修改时间缓存在 `data/config/exe-hashes.json`） | `exe` |
| ② 二进制 | 探针的「大小+首尾 1 MiB」哈希（`services/probe-identity.cjs exeHash`）、PE 时间戳 | `bin` |
| ③ 游戏身份 | 主封包指纹（data.xp3、Scene.pck 等封包的文件名+大小，和探针身份同一套封包集合）、Steam appid、VNDB id、标题哈希 | `game:files` / `game:steam` / `game:vndb` / `game:title` |
| ④ 引擎 | 引擎 id（仓库引擎差分） | `engine` |

仓库游戏差分的 `match` 也按这条链：`exeSha256` 算 ①（+10），程序名、`steamAppId` / `files`、标题、同引擎算 ③（引擎冲突直接排除，`notTitles` 排除 FD/续作，≥3 才算命中）

日志：`profile <gameKey> match=exe|bin|game:<依据>|engine|none exe=<哈希前8位> layers=… engine=…`；还没算出哈希时 `exe=-`

## 版本层和游戏层

每个键属于一层，登记在 `core/profiles/domains.cjs`（`tier`，`tierOf` / `split`）：

- **版本层**（`tier:'version'`）：只对某个 exe 有效：原生钩子相关、exe 专属开关。现在是 `draw.embed`、`draw.embedTranslation`、`hide.engineTrial.*`；以后的钩子地址、特征码偏移类键都登记成版本层
- **游戏层**（默认）：对这部游戏所有版本有效：文本框位置、特效帧、选项过滤、隐藏方式、自检阈值、排版

下发文档带 `scope`：`version`（只含版本层键，key = exe SHA-256）、`game`（只含游戏层键，带 `game` 游戏标识，key = SHA-256 of `megulit.game|<game>`）、不写 = `exe`（两层都有，只对这个 exe，旧文档）。客户端：**版本层只在 ①② 命中时用；游戏层在 ①②③ 任一命中就用**；④ 只有仓库引擎差分

## 候选和自检

只有 ① 是确定的。② ③ 命中时下发差分只是**候选**：照常叠上去，本机自检闸门照常跑，同时第一个窗口照常录制。第一个窗口不过线就不用这份（记在 `data/profiles/remote/<key>.rejected.json`，relay 换了新的才再试），退回本机校准（就用这个窗口）或读模式，并上报（原因「同游戏新版本：下发差分（match=…）第一个窗口未过线」，进修复队列，补上这个 exe 的版本层）

## 下发文档（`core/game-diff.cjs`）

```json
{
 "schema": "megulit.game-diff", "version": 1,
 "key": "<exe SHA-256，64 位小写 hex>",
 "source": "official",
 "mode": "hide",
 "settings": { "page": { "holdMs": 900 }, "hide": { "engineTrial": { "enabled": false } } },
 "exe": "SenrenBanka.exe", "engine": "kirikiri", "app": "1.4.21", "issuedAt": "2026-11-21T12:00:00Z",
 "signature": { "alg": "ed25519", "keyId": "k1", "value": "<base64>" }
}
```

- 只允许 `core/game-diff.cjs` 列出的字段；`mode:"read"` 必须同时有 `hide.textEffectsRead:true`
- 签名：Ed25519，签去掉 `signature` 后的规范 JSON（键排序）。官方差分和共享自动差分都由我们在本机签（`tools/sign-profile.cjs`，私钥路径走环境变量 `MEGULIT_PROFILE_KEY`，放在仓库里会被拒绝），relay 不持私钥；公钥只有一个文件 `services/profile-keys.json`（为空时不接受任何下发）。适配包继续用自己的 `services/adapter-pack-keys.json`
- 验签和值域在 `services/auto-profile-feed.cjs layer()`，每次从缓存读都重新检查

## 热更新

一个接口：`GET <relay>/api/game-profile/<exe SHA-256>?bin=&pe=&files=&steam=&vndb=&title=&engine=`（`identity.cjs query`，有什么带什么）。回复 version 2：`{"schema":"megulit.game-diff-feed","version":2,"key":…,"match":"exe|bin|game:<依据>","diffs":[<签名文档>…]}`（版本层 + 游戏层，最多 4 份）；version 1 `{diff}` 当作 ① 精确命中的单份文档。404 表示哪一级都没有（`/api/profile/<id>` 是社区个人主页，所以前缀是 game-profile）。服务端（auto-profile 会话，`relay/src/auto-profile.js`）：按 exe 聚合版本层，按游戏身份聚合游戏层；按 ①→②→③ 找，回第一个命中的级别；同一级有官方给官方，否则给多人一致、我们签过的共享自动差分。探针要带 ②③ 需要的指纹（`identity.cjs identityOf` 的同一套字段）

客户端（`services/auto-profile-feed.cjs refresh`）：开游戏、知道 exe 键后读本地缓存 `data/profiles/remote/<key>.json` 立即叠层，后台再拉（缓存 1 天，"没有" 6 小时），拉到通过验签的新文档就当场 `setGameProfile`，不用重启。只发 exe 键。`MEGULIT_RELAY_BASE=off` 时不请求

上传（都默认关）：校准结果和退档要 `library.json autoProfileShare` 加「共享适配」；运行时样本要 `runtimeSampleShare`

## 流程

用户一键探针上传 → 离线做出差分 + 回放夹具（`validation/fixtures/games/<gameKey>/`）→ 本机签名（`tools/sign-profile.cjs`）→ `POST /api/game-profile/signed` 发布 → 客户端热更新 → 用户间按 exe 键共享去重。服务端和签名工具在 auto-profile 会话，离线做差分在 diff-maker 会话

## 测试

- `validation/games-regression.test.cjs`：每部游戏的 identity + `*.case.cjs` 回放；只改游戏差分时只跑那部，`MEGULIT_GAMES=key` 指定；扫描内核不许 `exe==='xxx.exe'`
- `validation/profile-layers.test.cjs`：接线
- `validation/profile-stack.test.cjs`：层顺序、值域整层拒绝、exe 键、HookBridge 键
- `validation/auto-profile-relay.test.cjs`、`validation/self-check-gate.test.cjs`：签名、下发、自检和退档
