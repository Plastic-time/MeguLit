# diff-maker：探针包 → 版本层 + 游戏层差分草稿 + 回放夹具 + 报告

拿到玩家一键上传的探针（解包目录或 `.mlfp`），不下游戏、不开游戏，离线做出未签名的差分草稿、台词替换数据、回放夹具和报告。签名用 `tools/sign-profile.cjs`，发布、下发、客户端加载归 diff-layers（`docs/diff-layers.md`）；画字角色协议归 engine-draw（`docs/engine-draw-protocol.md`）

```
node tools/diff-maker/index.cjs <探针目录|probe.mlfp>... [--key <gameKey>] [--runtime <bundle.json.gz>] [--out <目录>] [--write-repo]
node tools/diff-maker/index.cjs trim <探针目录> <输出目录>
```

## 两层（店主 2026-11-21：传火不能只靠 exe 哈希）

| 层 | 文件 | 按什么认 | 装什么 |
|---|---|---|---|
| 版本层 | `version-<exeSha256>.json` | `core/game-diff.cjs build({layer:'version'})`，key = exe 整文件 SHA-256，prints = exe / head / pe | `core/profiles/domains.cjs` 里 layer 为 version 的键（这个构建的引擎钩子：hide.engineTrial.*、draw.embed…）；不带 mode，读模式是游戏层的事 |
| 游戏层 | `game-<gameKey>.json` | `build({layer:'game'})`，key = 游戏身份（relay gidFor：SHA-256('game\|'+种类+':'+指纹)，pack → script → steam → vndb → title 最强的一个），prints = 这些游戏指纹 | 其余所有键：布局、特效、选项、隐藏方式；同一作品别的 exe 构建按指纹认到这个游戏就能用 |
| 台词数据 | `lines-<gameKey>.json` | 同游戏层（按剧本） | engine-draw 替换数据 `[{k, ruby:[[start,len,"よみ"]], zh}]` |

- 指纹按 `core/game-print.cjs`（exe、head、pe；pack、script、steam、vndb、title；engine）；探针 manifest.prints / 运行时样本里带的优先；看起来不像量测结果的值（文本框只有一个字框、贴顶、过高、出界）不写进差分，只进报告
- 剧本指纹（报告用）：original-text 的源哈希，没有时剧本每行去空白后的 SHA-256
- 主封包：名字像剧本的封包（scn/script/scenario…），否则最大的封包；RPG Maker 用 data/System.json
- 默认输出到 `H:\MeguLit-Work\diff-maker\out\<gameKey>-<sha8>\`：上面三份 + `probe-<sha8>.replay.json`、`report.md`、`report.json`
- `--write-repo` 写夹具 `validation/fixtures/games/<gameKey>/probe-<sha8>.{version.json,game.json,lines.json,replay.json,case.cjs,report.md}`（lines 只放回放碰到的句子）
- `--runtime` 把 relay 补传的运行时包（`megulit.runtime-bundle`，gzip JSON）放进探针的 runtime/
- `trim` 把完整探针裁成只含工具读到的日志行、只含回放碰到的剧本行的小探针（剧本指纹保留完整剧本的值）

## 探针目录

```
manifest.json          probe-full 的 manifest：title, detected（引擎）, exe（路径，或 {name, sha256}）, files:[{path,size,sha256}], vndb, steamAppId
                         exe 的 SHA-256 取 manifest.exe.sha256，否则取 files[] 里 exe 那一项（probe-full 整文件哈希 exe；bin/ 里是瘦身 PE，不拿来算）
                         .mlfp 直接给也行：用 services/probe-full.cjs unpack 解到 H:\MeguLit-Work\diff-maker\unpacked\
                         runtime:{from,to}（ISO，可选）：日志里属于这一局的时间段
scripts/lines.json     剧本台词 + 游戏 ruby（original-text 索引 {lines:[...], ruby:[[[原文,读音],...]|null,...]}）
scripts/patch.json     和 lines.json 逐行对齐的译文（original-text patch 索引 {lines:[...]}）；行数不同视为没对齐，不用
scripts/**/*.ks|txt    KAG 剧本：去掉标签的是台词，[link]/[glink text=]/[seladd text=] 是选项
scripts/data/*.json    RPG Maker MV/MZ：401/405 台词、102 选项，System.json 用语和数据库名字算 UI 词
runtime/hook-events.log + runtime/reader-host.log   MeguLit 自己的日志（自检事件；探针里是首个自检窗口的原始行）；.mlfp 解包在 other/runtime/ 也认
runtime/sample.json、runtime/shot-*.jpg   auto-profile 的运行时样本和截图（读进 report.json）
runtime/*.log          其余日志里的 ToMe_CHARS 行（engine-draw 记录，可带时间戳前缀）
runtime/info.json      一键诊断 info.json（可选）
```

## 做了什么

1. **识别**：引擎按 manifest → engine-draw 记录的 engine= / KiriKiri 钩子 → 文件（.xp3、rpg_core.js / rmmz_core.js）；exe 完整 SHA-256；`core/profiles` 认游戏
2. **回放序列**（`samples.cjs`）：自检事件用 `core/self-check.cjs` 同一套解析；engine-draw 记录原样保留（夹具里存原始 ToMe_CHARS 行）
3. **离线搜索**（`search.cjs`）：候选和预测规则是 `core/auto-profile.cjs` 的（位置来源、page.effectFrames、choice.filters、隐藏 / 读模式），文本框由引擎首字框并集推出；整局按 20 句切自检窗口，全部过线才算过，选 cost 最低、改动最少的；一个都不过就是读模式
4. **画字角色**（`roles.cjs`，engine-draw 协议的消费方）：`line` 台词（唯一可替换/隐藏）；`choice` `button` `menu` UI（旁注，点击区不动）；`name` `system` 系统（旁注）。UI 项按 (role, id, text) 去重；非 line 记录被隐藏或带 emb 算违规；每个角色的文字在剧本里的归属，对不上的列进「需要人看」。解析用 `core/text-paths.cjs parseChars`（engine-draw 合进来之前用同格式的本地解析，合并后删）
5. **台词替换数据**（`scripts.cjs`）：剧本每句 → `{k, ruby, zh}`，ruby 来自游戏自己的 ruby，zh 来自对齐的汉化补丁；没有的句子不出
6. **产出**：草稿只用 `defaults.cjs` 的键（否则报错），已有手写游戏差分的先并入它的设置；夹具 case（`validation/helpers/diff-replay.cjs`）重放：判定、每个指标、每个角色的记录数 / 去重数 / emb / 违规都必须和记录一致，替换数据格式合法

## 样例和测试

`validation/helpers/diff-maker/probes/`：千恋＊万花、ファタモルガーナの館（店主 incr9 测试版日志裁剪 + original-text 剧本里碰到的行；旧日志没有 engine-draw 记录）、`rpgm-sample`（自编的 RPG Maker MZ 小游戏，按 engine-draw 协议的 rpgm 记录，没有任何真实游戏文字）

```
node --test validation/diff-maker.test.cjs
MEGULIT_GAMES=senren-banka,fata-morgana node --test validation/games-regression.test.cjs
```

改了工具或样本后重新生成：

```
node tools/diff-maker/index.cjs validation/helpers/diff-maker/probes/senren-banka validation/helpers/diff-maker/probes/fata-morgana --write-repo
node tools/diff-maker/index.cjs validation/helpers/diff-maker/probes/rpgm-sample --key rpgm-sample --write-repo
```

## The Seed（批量种子）

```
node tools/diff-maker/seed-all.cjs [--root <MeguLit 安装>]... [--out "H:\MeguLit-Work\The Seed"] [--seed "<仓库>/The Seed"] [--owner-ok <owner-ok.json>] [--only <标题片段>]
```

只读两个安装（默认 `E:\MeguLit-Test-1421`、`E:\MeguLit`）的游戏库、original-text 剧本索引、game-launch.log 和 hook-events / reader-host 日志，按启动记录切出每部游戏最新一局（够 selfCheck.minLines 句的），跑同一套离线搜索。除了程序不在本机的，每部都写进仓库 `The Seed/<engine>/<slug>/`（结构、status、钉住当前生效值、客户端语义见 `The Seed/README.md`）：
- 有样本且隐藏全过线 → `verified`；有样本没过线 → `read`；没样本但在 `owner-ok.json` → `owner-ok`；其余 → `skeleton`
- slug 从 `slugs.json` 取，没有就用手写游戏差分的 key 或英文标题
- 每部的报告、身份、替换数据（含补丁译文，不进仓库）和按 status 分组的汇总在 `<out>`
