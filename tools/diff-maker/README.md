# diff-maker：探针包 → 游戏差分草稿 + 回放夹具

拿到玩家一键上传的探针包，不下游戏、不开游戏，离线做出这部游戏（按 exe 哈希区分版本）的差分草稿、回放夹具和一份报告。

```
node tools/diff-maker/index.cjs <探针目录>... [--key <gameKey>] [--out <目录>] [--write-repo]
node tools/diff-maker/index.cjs trim <探针目录> <输出目录>
```

- 默认输出到 `H:\MeguLit-Work\diff-maker\out\<gameKey>-<hash12>\`：`diff-<hash12>.json`（差分草稿：未签名的 `megulit.game-diff`，key = `x-` + exe 完整 SHA-256）、`probe-<hash12>.replay.json`（回放）、`report.md` / `report.json`
- `--write-repo` 另外写进仓库：`validation/fixtures/games/<gameKey>/diff-<hash12>.json` 和 `probe-<hash12>.{replay.json,case.cjs,report.md}`。官方差分只有一个位置：relay 上的签名文档（`tools/game-diff.cjs sign` 后 `POST /api/auto-profile/official`），客户端缓存在 `data/profiles/remote/`
- `--key` 指定 gameKey；不给就用 `core/profiles` 认出的游戏（`games/<key>.cjs`），认不出是 `auto-<hash>`
- `trim` 把一个完整探针裁成只含工具读到的日志行、只含回放碰到的剧本行的小探针（仓库里的样本探针就是这样来的，不放整部剧本）

## 探针目录

```
manifest.json          probe-full 解包后的 manifest，至少要有：
                         title, detected（引擎）, exe:{name, hash, sha256?}, files:[{path}]
                         hash = services/probe-identity.cjs exeHash（大小 + 首尾 1 MiB 的 sha256）；没有就从 bin/<exe> 算
                         runtime:{from,to}（ISO，可选）：日志里属于这一局的时间段
scripts/lines.json     剧本台词（services/original-engines 的 original-text 索引 {lines:[...]}，或纯数组）
scripts/**/*.ks|txt    KAG 剧本：去掉标签的是台词，[link]/[glink text=]/[seladd text=] 是选项
scripts/data/*.json    RPG Maker MV/MZ：401/405 台词、102 选项，System.json 用语和数据库名字算 UI 词
runtime/hook-events.log + runtime/reader-host.log   钩子引擎（KiriKiri 等）的运行时样本，就是 MeguLit 自己写的日志
runtime/draws.jsonl    RPG Maker 插件的画字样本，一行一个：
                         {"t":"draw","at":ms,"cls":["Window_ChoiceList","Window_Command",...],"text":"..","rect":[x,y,w,h],"scene":".."}
                         {"t":"page","at":ms,"cls":[...]}        消息窗换页（之前的逐字画字合成一句）
                         {"t":"shown","at":ms,"cls":[...],"text":".."}   MeguLit 画出了这段（内嵌或旁注）
                         {"t":"choice","at":ms,"cls":[...],"items":[..],"shown":n}   选项 / 命令窗打开，n 项有 MeguLit 文字
runtime/info.json      一键诊断 info.json（可选，autoProfile 块）
```

运行时样本格式和上传归 auto-profile 会话（`docs/auto-profile.md`）；这里只读。

## 做了什么

1. **识别**：引擎按 manifest → 运行时样本（KiriKiri 钩子名 / RPG Maker 窗口类）→ 文件（.xp3、rpg_core.js / rmmz_core.js）；exe 哈希；`core/profiles` 认游戏
2. **回放序列**（`samples.cjs`）：自检事件用 `core/self-check.cjs` 同一套解析（回放 = 玩家电脑上跑过的）；每次画字带引擎身份 `{hook, cls, call, layer}`。OCR 行和内核选项捕捉标成内核来源，没有角色
3. **离线搜索**（`search.cjs`）：候选和预测规则就是 `core/auto-profile.cjs` 的（位置来源、page.effectFrames、choice.filters、隐藏 / 读模式），文本框由引擎首字框并集推出；整局按 20 句切自检窗口，所有窗口都过线才算过，选 cost 最低、改动最少的隐藏组合，一个都不过就是读模式
4. **绘制角色**：`core/draw-role.cjs` 按引擎差分 / 游戏差分里的 `draw.roleMap` 等规则分成协议的六种角色；没有规则或只靠基类定的身份，按它的文字在剧本里的归属提议角色写进差分 `draw.roleMap`，报告里列出请人确认
5. **产出**：差分草稿（已有手写游戏差分的，先并入它的设置，再盖上量到的值；只用 `defaults.cjs` 的键，否则报错）；回放夹具（`validation/helpers/diff-replay.cjs` 重放：判定、每个指标、每个画字身份的角色都必须和记录一致）；报告（每个指标的分数、每个键各取值的结果、角色表、剧本配对、需要人看的地方）

## 绘制角色

角色用画字协议的六种（docs/engine-draw-protocol.md）：`line` 台词（唯一可以隐藏 / 替换的）、`name` 名字、`choice` 选项、`button` 按钮、`menu` 菜单和列表、`system` 系统和装饰。处理方式由协议按角色固定：line 内嵌，其他都在旁边补注音和翻译、点击区域留给游戏。离线分析时按三组看：line = 台词，choice/button/menu = UI，name/system = 系统（`core/draw-role.cjs group`）

规则在 `draw.roleMap` / `draw.rolePatterns` / `draw.roleFallback`（defaults.cjs，值域在 domains.cjs）。身份顺序：调用方 `call:` → 类链 `class:`（自己的类在前，插件子类继承基类角色）→ 钩子 `hook:` → 层 `layer:` → rolePatterns → roleFallback。`draw.roleMap` 是开放字典：游戏差分只加 / 改条目，引擎的条目保留

- RPG Maker（`core/profiles/engines/rpgmaker.cjs`）：Window_Message / Window_ScrollText → line；Window_ChoiceList / NumberInput / EventItem → choice；Window_Command 及各命令 / 列表窗 → menu；Window_NameBox → name；帮助、金钱、地名、状态页、战斗日志 → system
- KiriKiri（`core/profiles/engines/kirikiri.cjs`）：TextRender 和消息层钩子、layer:msg → line；[link]/[glink]/selectLink、LinkButtonLayer → choice；[button]、ButtonLayer → button；CheckBox/Edit/SliderLayer → menu；Bitmap DrawText、layer:art → system

剧本归属提议：剧本选项 → choice，剧本 UI 词 → menu，剧本台词 → line

## 样例和测试

`validation/helpers/diff-maker/probes/`：千恋＊万花、ファタモルガーナの館（店主 incr9 测试版日志裁剪 + original-text 剧本里碰到的行）、`rpgm-sample`（自编的 RPG Maker MZ 小游戏，没有任何真实游戏文字）。

```
node --test validation/diff-maker.test.cjs
MEGULIT_GAMES=senren-banka,fata-morgana node --test validation/games-regression.test.cjs
```

改了工具、引擎差分的角色规则或样本后，重新生成：

```
node tools/diff-maker/index.cjs validation/helpers/diff-maker/probes/senren-banka validation/helpers/diff-maker/probes/fata-morgana --write-repo
node tools/diff-maker/index.cjs validation/helpers/diff-maker/probes/rpgm-sample --key rpgm-sample --write-repo
```
