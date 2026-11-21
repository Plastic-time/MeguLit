# The Seed

本机游戏库里每一部游戏的差分种子（店主 2026-11-21：全部作为 seed 发出去，以后有问题只改 seed）。用 `tools/diff-maker/seed-all.cjs` 一次离线生成，只读游戏库和日志，不开游戏。纯数据：只有哈希、公开编号、可读的游戏名 slug 和差分设置，没有本机路径或用户名

```
The Seed/<engine>/<slug>/game.json                  游戏层：core/game-diff.cjs 文档，layer game，key = 游戏身份，prints = pack / script / steam / vndb / title
The Seed/<engine>/<slug>/versions/<exeSha256>.json  版本层：layer version，key = exe 整文件 SHA-256，prints = exe / head / pe，只含版本层的键，不带 mode
```

- 游戏身份 key = relay 的 gidFor：SHA-256(`'game|'+种类+':'+指纹`)，种类取 pack → script → steam → vndb → title 里最强的一个（`core/game-print.cjs`）
- 同一个 exe 被几部游戏共用时（同一程序的不同发行），版本层只出一份，放在 slug 排第一的那部下面，其他游戏在 `builds` 里引用它

## 钉住当前生效值

每份 seed 的 settings 写满 `core/profiles/defaults.cjs` 的每一个键：这部游戏现在实际用的值（内核默认 ← 引擎差分 ← 现有手写游戏差分），有运行样本的再盖上离线搜索量到的值。以后内核默认值改了，已经能用的游戏行为不变：做好了就是做好了。要改一部游戏，只改它自己的 seed

看起来不像量测结果的值（例如文本框只有一个字框、贴顶、过高、出界）不写进 seed，只写进维护者的报告

## game.json 的 seed 字段（seed 格式的一部分，由 diff-layers 登记校验）

| 字段 | 含义 |
|---|---|
| `status` | `verified` / `owner-ok` / `read` / `skeleton`，见下 |
| `slug` | 可读的游戏名（罗马字或英文名），也是目录名 |
| `builds` | 和这部游戏一起用的 exe SHA-256（版本层文件名） |

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
