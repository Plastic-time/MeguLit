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

## 角色怎么用（阅读层）

| role | 替换 | 阅读层做什么 |
|---|---|---|
| `line` | 可以 | `emb=2`：什么都不画（游戏画了）；`emb=1`：只画中文；`emb=0`：照旧（隐藏 + 画 / 只读模式画译文） |
| `name` | 不替换 | 名字旁边补注音（游戏 ruby 优先），说话人给配对和配音用 |
| `choice` `button` `menu` | **永远不替换、不隐藏** | 在 box 旁边补注音和中文，点击区域原样留给游戏（阅读层不接鼠标） |
| `system` | 不替换 | 同上，只补注音和中文；对话框外的说明、帮助窗 |

内核 `core/hook-native.cjs`：`role` 不是 `line` 的记录不进 HiddenGate、不当台词，发 `hookDrawUi` 事件；`line` 记录照旧发 `hookCharRects`（带 `emb`）

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

## 和离线差分（diff-maker）的约定

差分制作读探针上传的 `ToMe_CHARS` 记录：按 `role` 分台词和 UI；UI 项按 `(role, id, text)` 去重；`box` 用来在截图上框出按钮。差分里给台词的替换数据就是上面的 `{k, ruby, zh}` 列表
