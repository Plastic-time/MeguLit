# diff-maker：探针包 → 未签名差分草稿 + 回放夹具 + 报告

拿到玩家一键上传的探针包，不下游戏、不开游戏，离线做出这部游戏（按 exe 完整文件 SHA-256 区分版本）的差分草稿、台词替换数据、回放夹具和报告。签名用 `tools/game-diff.cjs sign`；下发格式、下发目录、客户端加载归 diff-layers（`docs/diff-layers.md`）；画字角色协议归 engine-draw（`docs/engine-draw-protocol.md`）

```
node tools/diff-maker/index.cjs <探针目录>... [--key <gameKey>] [--out <目录>] [--write-repo]
node tools/diff-maker/index.cjs trim <探针目录> <输出目录>
```

- 默认输出到 `H:\MeguLit-Work\diff-maker\out\<gameKey>-<sha8>\`：
  - `<exeSha256>.json` 差分草稿 `{schema:"megulit.profile",format:1,exeSha256,gameKey,engine,settings,note}`，没有 signature
  - `<exeSha256>.lines.json` 台词替换数据 `{schema:"megulit.lines",format:1,exeSha256,lines:[{k,ruby:[[start,len,"よみ"]],zh}]}`（k = 原句去空白，start/len 按 k 的码位）
  - `probe-<sha8>.replay.json`、`report.md`、`report.json`（探针来源、exe 名、标题、候选、角色统计都在这里，不进草稿）
- `--write-repo` 另外写夹具 `validation/fixtures/games/<gameKey>/probe-<sha8>.{replay.json,diff.json,lines.json,case.cjs,report.md}`（lines.json 只放回放碰到的句子）
- `--key` 指定 gameKey；不给就用 `core/profiles` 认出的游戏，认不出是 `auto-<hash>`
- `trim` 把完整探针裁成只含工具读到的日志行、只含回放碰到的剧本行的小探针（仓库样本就是这样来的，不放整部剧本）

## 探针目录

```
manifest.json          probe-full 解包后的 manifest，至少要有：
                         title, detected（引擎）, exe:{name, sha256}, files:[{path}]
                         sha256 = exe 整个文件的 SHA-256；没有就从 bin/<exe> 算；都没有报错
                         runtime:{from,to}（ISO，可选）：日志里属于这一局的时间段
scripts/lines.json     剧本台词 + 游戏 ruby（original-text 索引 {lines:[...], ruby:[[[原文,读音],...]|null,...]}）
scripts/patch.json     和 lines.json 逐行对齐的译文（original-text patch 索引 {lines:[...]}）；行数不同视为没对齐，不用
scripts/**/*.ks|txt    KAG 剧本：去掉标签的是台词，[link]/[glink text=]/[seladd text=] 是选项
scripts/data/*.json    RPG Maker MV/MZ：401/405 台词、102 选项，System.json 用语和数据库名字算 UI 词
runtime/hook-events.log + runtime/reader-host.log   MeguLit 自己的日志（自检事件）
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
