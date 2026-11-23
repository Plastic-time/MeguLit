# The Seed

本机游戏库里每一部游戏的差分种子（店主 2026-11-21：全部作为 seed 发出去，以后有问题只改 seed）。用 `tools/diff-maker/seed-all.cjs` 一次离线生成，只读游戏库和日志，不开游戏。纯数据：只有哈希、公开编号、可读的游戏名 slug 和差分设置，没有本机路径或用户名

```
The Seed/<engine>/<slug>/game.json                  游戏层：core/game-diff.cjs 文档，layer game，key = 游戏身份，prints = pack / script / steam / vndb / title
The Seed/<engine>/<slug>/versions/<exeSha256>.json  版本层：layer version，key = exe 整文件 SHA-256，prints = exe / head / pe，只含版本层的键，不带 mode
```

- 游戏身份 key = relay 的 gidFor：SHA-256(`'game|'+种类+':'+指纹`)，种类取 pack → script → steam → vndb → title 里最强的一个（`core/game-print.cjs`）
- 同一个 exe 被几部游戏共用时（同一程序的不同发行），版本层只出一份，放在 slug 排第一的那部下面，其他游戏在 `builds` 里引用它

## 钉住当前生效值

每份 seed 的 settings 写出 `core/profiles/defaults.cjs` 里每个非空的行为键：这部游戏现在实际用的值（内核默认 ← 引擎差分 ← 现有 seed / 手写游戏差分），有运行样本的再盖上离线搜索量到的值。以后内核默认值改了，已经能用的游戏行为不变：做好了就是做好了。要改一部游戏，只改它自己的 seed

不钉的：`null`（内核决定，钉了也冻结不了什么，还会盖住下面的层）、`calibrate.*`（本机校准层）、`selfCheck.*`（自检闸门阈值）。verified 的 seed 排在本机校准之上，钉这些会让每个玩家的校准和闸门调参失效（店主 2026-11-21 认可）

看起来不像量测结果的值（例如文本框只有一个字框、贴顶、过高、出界）不写进 seed，只写进维护者的报告

## game.json 的 seed 字段（seed 格式的一部分，由 diff-layers 登记校验）

| 字段 | 含义 |
|---|---|
| `status` | `verified` / `owner-ok` / `read` / `skeleton`，见下 |
| `slug` | 可读的游戏名（罗马字或英文名），也是目录名 |
| `builds` | 和这部游戏一起用的 exe SHA-256（版本层文件名） |
| `seedFormat` | seed 格式版本，现为 1（不写 = 1） |
| `sourceLangs` | 游戏原文的语言，BCP 47，默认 `["ja"]`，例如 `["en","zh-Hans"]` |
| `match` | 可选：`{exe, titles, notTitles}`，可读的程序名和标题（汉化改名、库里标题不同时用来认游戏） |
| `ext` | 可选扩展区 `{<扩展名>: …}`：不认识的扩展客户端忽略 |

跟语言有关的设置放 `settings.lang.<bcp47>`：`annotation`（`ruby` 日文假名 / `ipa` 英文音标 / `pinyin` / `none`）、`pairing`（`script` / `patch` / `machine` / `none`）、`dictionary`、`fontFallback`。客户端按当前学习模式读的源语言取对应块，没有就用语言无关的设置；学习模式本身不进 seed。翻译配对数据（`megulit.lines`）按语言对分，带 `source` / `target`

向前兼容：不认识的顶层字段、扩展、设置键都忽略；认识的严格校验（`core/profiles/seed.cjs`，`validation/the-seed.test.cjs`）。完整接口见 `docs/diff-layers.md`「当前权威接口」

## 客户端语义

| status | 怎么用 |
|---|---|
| `verified` | 有样本且每个自检窗口在隐藏模式下全过线：直接用 |
| `owner-ok` | 店主确认能用，本机没样本（名单 `tools/diff-maker/owner-ok.json`）：直接用 |
| `read` | 有样本但隐藏没过线：直接读模式（原文留着，只显示译文） |
| `skeleton` | 只有身份 + 引擎 + 钉住的值：照这些值跑，自检闸门照常把关（不过线就退读模式） |

- 未签名；签名用 `tools/sign-profile.cjs`
- slug 表 `tools/diff-maker/slugs.json`；有手写游戏差分的用它的 key
- 重新生成：`node tools/diff-maker/seed-all.cjs`；按 status 分组的汇总表在维护者本机的输出目录，不进仓库

---

## English

The Seed holds MeguLit's built-in game diffs: per game a `game.json` (game layer, every build) and per exe a `versions/<exe SHA-256>.json` (version layer, that build only). They ship with GitHub main, live in `MeguLit/The Seed/` of the installer and come with hot updates; fixing a game means changing its seed only. Each file is a `megulit.game-diff` document (`core/game-diff.cjs`) with fingerprints from `core/game-print.cjs`; `game.json` adds `status` (`verified` / `owner-ok` used directly, `read` read mode, `skeleton` identity and pinned values with the self-check gate deciding), `slug` (its folder), `builds`, `seedFormat` (1), `sourceLangs` (BCP 47, default `["ja"]`) and optionally `match` (readable exe names and titles) and `ext` (an extension area). Language-dependent settings live in `settings.lang.<bcp47>` (`annotation` ruby / ipa / pinyin / none, `pairing`, `dictionary`, `fontFallback`); the client takes the block of the language it reads, else the language-free settings. Unknown fields, extensions and settings keys are ignored (forward compatible); known ones are checked strictly. Pure data: no code, no paths, no user names. Built-in seeds are official without a signature; diffs downloaded at run time to `data/The Seed/` must be signed. Full interface: `docs/diff-layers.md` ("当前权威接口")
