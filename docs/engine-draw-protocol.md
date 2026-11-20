# 画字上报协议（engine-draw，2026-11-21）

每个引擎差分从引擎内部读到「这次画了什么、画在哪、是什么角色」，都用同一种记录报给内核；内核只认这一种格式，不知道引擎怎么读的。读法在引擎差分里（`native/krkrtext/script.inc`、`core/text-paths-web.cjs` 的 RPG Maker 段……），协议在 `core/text-paths.cjs`

## 记录：ToMe_CHARS（向后兼容的扩展）

```
ToMe_CHARS engine=<e> line=N hidden=0|1 sw=W sh=H vx= vy= vw= vh= n=K rects=x,y,w,h;... [color=rrggbb] [read=0|1] [role=R] [id=I] [box=x,y,w,h] [sel=0|1] [emb=0|1|2] text=...
```

旧字段不变（见 `core/text-paths.cjs` 头注释）。新字段都可选，顺序固定，缺省 = 旧行为：

| 字段 | 值 | 含义 |
|---|---|---|
| `role` | `line` `name` `choice` `button` `menu` `system` | 这段字在游戏里是什么。缺省 `line` |
| `id` | `[A-Za-z0-9:._-]{1,32}` | UI 项在屏上的稳定标识（同一个按钮反复上报用同一个 id），台词不需要 |
| `box` | `x,y,w,h` | 这一项的整块区域（按钮的点击区、选项的整行），游戏屏幕像素。UI 项可以只有 box、没有逐字 rects（`n=0 rects=`） |
| `sel` | `0` `1` | 光标当前在这一项上 |
| `emb` | `0` `1` `2` | 游戏自己画了 MeguLit 的替换：0 没有；1 画了日文 + 注音（中文还要阅读层画）；2 日文 + 注音 + 中文都画了 |

`engine` 新增 `rpgm`（RPG Maker MV/MZ 的 JS 层）

**UI 快照**：同一组 UI 项（组 = `role` + `id` 里 `:` 前的部分，没有 `:` 就只按 `role`）一次一起报，共用一个 `line` 号；更大的 `line` 号替换这一组旧的项；空快照（`text=` 为空、`box=0,0,0,0`、`id=<组>:`）清空这一组。KiriKiri：`L<层>:<link>` 是选项、`B<n>` 是按钮

## 角色怎么用（阅读层）

| role | 替换 | 阅读层做什么 |
|---|---|---|
| `line` | 可以 | `emb=2`：什么都不画（游戏画了）；`emb=1`：只画中文；`emb=0`：照旧（隐藏 + 画 / 只读模式画译文） |
| `name` | 不替换 | 名字旁边补注音（游戏 ruby 优先），说话人给配对和配音用 |
| `choice` `button` `menu` | **永远不替换、不隐藏** | 在 box 旁边补注音和中文，点击区域原样留给游戏（阅读层不接鼠标） |
| `system` | 不替换 | 同上，只补注音和中文；对话框外的说明、帮助窗 |

内核 `core/hook-native.cjs`：`role` 不是 `line` 的记录不进 HiddenGate、不当台词，发 `hookDrawUi` 事件；`services/reader.cjs` 经 `core/engine-draw.cjs` UiTracker 转成 art-text 项（`web/reader/modules/art-text.js`：每行一个隐形可查词的副本 + 旁边的译文，不接鼠标）。`line` 记录照旧发 `hookCharRects`；`emb` 经 overlay-placement 的 `textPlace {visible, embedded}` 到阅读层，`emb=2` 时阅读层连中文行也不画（`megulit-game-embedded`）。`draw.embed` 开着时，没带 `emb` 的台词由内核发 `hookDrawEmbed` 向阅读层要注音（`example-ruby`：游戏 ruby → 词典）和译文（剧本 → 兜底链），回 `drawEmbedReply` 写进引擎的替换表

## 替换数据（MeguLit → 引擎）

一条替换 = 原句（去空白的日文）→ 要画的东西：

```
{ k: "原句去空白", ruby: [[start, len, "よみ"], ...], zh: "中文译文" }
```

- `start` / `len` 按 `k` 的字符（码位）下标；读音来源：游戏 ruby → 上下文 / 词典（不用分词器生读）
- 只有 `role=line` 用；没有这句的数据时引擎照旧画原文，报 `emb=0`，阅读层兜底
- 数据可以晚到：引擎在这句的点击等待期间收到就当场补画（KiriKiri），或下一次画这句时用上
- 投递方式按引擎：
  - web / rpgm：CDP `window.__megulitText.embed([...])`、`window.__megulitText.config({roles,embed})`
  - KiriKiri：控制文件 `%TEMP%\MeguLit\draw\<pid>.txt`（UTF-8），DLL 发现修改时间变了才重读：
    ```
    #cfg roles=1 embed=1 zh=1
    原句去空白<TAB>start:len:よみ|start:len:よみ<TAB>中文（换行写成 U+001F）
    ```
    没有这个文件 = 旧行为

## Profile 键（`core/profiles/defaults.cjs`，默认 = 旧行为）

- `draw.roles`（false）：引擎差分按角色上报；关着时名字 / 选项照旧（不报或混进台词）
- `draw.embed`（false）：台词内嵌替换
- `draw.embedTranslation`（true）：内嵌时中文也让游戏画（false = 只画注音，中文给阅读层）

## 各引擎现状（本分支）

| 引擎 | 读法（引擎差分） | 角色 | 内嵌 | 默认 |
|---|---|---|---|---|
| KiriKiri（KAG processCh 路线） | `native/krkrtext/script.inc` | name（<20% 屏高的层）、choice（`inLink`，id `L<层>:<link>`）、button（`ButtonLayer.caption`，id `B<n>`） | 点击等待时 MessageLayer 自己的 drawText 画注音 + 中文，`emb=1/2` | 关（引擎差分 kirikiri 未开，给某部游戏开就在它的游戏差分里设 `draw`） |
| KiriKiri（TextRender 插件） | 未做 | — | — | — |
| RPG Maker MV/MZ | `core/text-paths-rpgm.cjs`（随 web 路线注入页面） | name（Window_NameBox）、choice（Window_ChoiceList）、menu（标题 / 菜单 / 选项 / 存档 / 其他 Selectable）、button（其他 Window_Command）、system（Window_Help），id `W<窗口>:<项>` | 消息最多等 1.2 s 要替换；到了就主字号 85%、注音 45%、中文作为后续行（80%，放不下 70%，再放不下不画，`emb=1`）；没到就照原样，阅读层兜底 | 开（引擎差分 `core/profiles/engines/rpgmaker.cjs`；只在 画进游戏画面 开、web 路线运行时生效） |

## 和离线差分（diff-maker）的约定

差分制作读探针上传的 `ToMe_CHARS` 记录：按 `role` 分台词和 UI；UI 项按 `(role, id, text)` 去重；`box` 用来在截图上框出按钮。差分里给台词的替换数据就是上面的 `{k, ruby, zh}` 列表
