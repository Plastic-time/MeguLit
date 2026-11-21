# 原生引擎的画字函数：缺口和方案（2026-11-21）

总指挥这一批：Siglus（CLANNAD、Summer Pockets）、BGI（素晴日、ユースティア）、YU-RIS（euphoria、女装山脉、サイコロジック）、MAGES（STEINS;GATE 系、CHAOS;CHILD）、Unity（The Seed 里 7 部）。目标同前：从画字函数 / 组件拿 文字 + 坐标 + 名字框 + 选项 + 按钮角色，台词内嵌，UI 只报框。协议见 [engine-draw-protocol.md](engine-draw-protocol.md)

这一份只有静态结论（只读店主的游戏文件，`H:\MeguLit-Work\tools-re\probe_draw.py` / `around.py`，pefile + capstone），没有开游戏。脚本层引擎（KiriKiri / RPG Maker / Tyrano / Ren'Py）能在引擎自己的脚本里读，原生引擎没有这一层，每个都要反汇编到画字函数，各要一个独立的逆向会话（Opus high），所以先把每个引擎的入口和方案定下来

## 静态普查（店主本机的 exe）

| 游戏 | exe | 位数 | 文字 API 调用点（导入表 → 代码里的 call 数） | 图形 |
|---|---|---|---|---|
| CLANNAD | SiglusEngine_Steam.exe | x86 | GetGlyphOutlineW ×2、GetGlyphOutlineA ×1、TextOutW ×1、ExtTextOutW/A ×1、GetTextExtentPoint32W ×2、CreateFontW ×4 | d3d9 |
| 素晴らしき日々 HD | BGI.exe | x86 | TextOutA ×3、TextOutW ×2、GetGlyphOutlineA ×2、CreateFontA ×3 | d3d9 |
| 穢翼のユースティア | BGI.exe | x86 | 导入表里一个文字 API 都没有：壳（运行时才解开），静态看不到 | — |
| euphoria / euphoria HD / 女装山脈 / サイコロジック | 各自 exe | x86 | **只有一个 TextOutA 调用点**（euphoria 0x43663a）、CreateFontIndirectA ×1 | d3d9 |
| STEINS;GATE / STEINS;GATE 0 / CHAOS;CHILD | Game.exe | x86 | 没有任何 GDI 文字 API：MAGES 用自己的字库图集，字形是 D3D9 四边形 | d3d9 + d3dx9_43 |

## 每个引擎

### YU-RIS（最容易，先做）
- 现有：`native/megulithook/Yuris.cpp`（LunaHook，含内嵌写回和选项流）
- 画字：整个引擎只在一处用 TextOutA 把字画进字形缓存（一字一次），之后用 D3D9 贴到屏幕。字形缓存里没有屏幕坐标；坐标在调用它的「排版 / 送字」函数里（笔位 x、y、字号）
- 方案：
  1. 用 TextOutA 唯一调用点做锚，静态找到它所在函数和上一层调用者（这个 exe 不用帧指针，函数头要按调用关系反推，`around.py` 的帧指针找法在这里失败）；在上层函数取笔位 + 字号，按协议报逐字框（`engine=yuris`，需先在 `core/text-paths.cjs` ENGINES 登记）
  2. 角色：同一个上层函数按「当前写入的窗口」区分。YU-RIS 的名字框和选项是脚本里不同的文字窗口（YSTB 变量），窗口编号随笔位一起读
  3. 内嵌：现有写回已经让游戏画我们的字。要日文 + 注音 + 中文都由游戏画，写回串改成「日文（带 YU-RIS 的注音标记）+ 换行 + 中文」，行数上限由窗口行数决定（写进版本层差分，按 exe 哈希）
- 验证：静态签名测试（对店主的 4 个 exe 各命中一次）+ 店主实机

### BGI / Ethornell
- 现有：`native/megulithook/BGI.cpp`（LunaHook，按 ctx2 报 台词 / 名字 / 其他，内嵌写回）
- 画字：TextOutA/W ×5、GetGlyphOutlineA ×2；字形点（①）已经能在 GetGlyphOutlineA 拿到每个字的位置，但不知道角色
- 方案：在 BGI 的「消息送字」函数（BGI.cpp 现在挂的那个，参数里有窗口对象）旁边同时记窗口编号，然后在 GetGlyphOutlineA 那条路线上把字形点按当前窗口打上角色（名字窗 / 消息窗 / 选项窗）。这是「从外面猜」的升级版：位置来自 API，角色来自引擎自己的窗口
- 注意：ユースティア 的 BGI.exe 是壳，签名要在解壳后（运行时）找，只能实机验证；素晴日 HD 不是壳，先做它

### SiglusEngine
- 现有：`native/megulithook/Siglus.cpp` 和 `native/siglus/Siglus.cpp`（LunaHook，ctx2 1/2/3，内嵌写回 role=1 的流；CLANNAD 曾因写 role=3 的 VM 通用串崩，见 `native/EmbedTextPolicy.cs`）
- 画字：GetGlyphOutlineW ×2（字形缓存）+ d3d9
- 注音不是行内标记：Siglus 的 ruby 是 VM 命令（`global.ruby(str)`、`mwnd.ruby(int)`，`H:\MeguLit-Work\oss\SiglusSceneScriptUtility\src\siglus_ssu\const.py`），所以内嵌注音要在送字前调用引擎自己的 ruby 命令，不能把标记塞进字符串
- 方案：
  1. 坐标：挂 mwnd 的「加一个字」函数（它知道当前窗口和格子位置），比 GetGlyphOutlineW 更准（后者只在字形第一次进缓存时调用）
  2. 角色：mwnd 编号 + 选项窗（sel）+ 名字（mwnd.name）
  3. 内嵌：写回中文作为第二段 + 调 ruby 命令；行数上限进版本层差分
- 风险最高：VM 结构按版本变，CLANNAD Steam 和 Summer Pockets 各要签名

### MAGES.
- 现有：`native/megulithook/MagesEngine.cpp`、`MeguLitSg.cpp`、`native/mages/`（SC3 串解码含注音，STEINS;GATE 精确匹配的画字钩子）
- 画字：不走 GDI。字库是图集，每个字是一个 D3D9 四边形；层 4（假 GPU，`native/gpuhide`）已经能看到这些四边形的位置
- 方案：把 STEINS;GATE 那个精确匹配的画字钩子泛化：MAGES 各作共用 SC3 VM，送字函数的参数里有字形索引和屏幕位置；按 exe 版本表（版本层差分）登记各作的函数地址，角色来自 SC3 的窗口命令（名字框是单独的 `NameBox` 区）。内嵌：SC3 串本来就支持注音标记（`native/mages/readString.cpp` 已能解），写回「日文带注音 + 中文」即可，前提是字库图集里有中文字形（没有就用 `core/mages-font.cjs` 补字库）
- 参考：Committee of Zero 的 LanguageBarrier（开源，正是 MAGES 的画字 + 字库钩子）

### Unity（7 部）
- 现有：`native/unitytext`（BepInEx 5 插件，Mono + IL2CPP；按组件读 TMP / uGUI 的逐字框，alpha 0 隐藏）
- 方案（插件内，C#）：
  1. 角色：组件往上找 `UnityEngine.UI.Button` / `Toggle` / `Selectable` → button / choice；框架识别（Utage `AdvUguiMessageWindow` / `AdvUguiSelection`，Naninovel `TextPrinter` / `ChoiceHandler`，各厂自研按类名）→ line / name / choice
  2. 内嵌：台词组件直接改 `TMP_Text.text`（`<size>` 第二段中文 + TMP 的 `<voffset><size>` 注音，或 XUnity.AutoTranslator 的做法）；uGUI Text 同理
  3. 上报：沿用控制套接字，多发带 role 的 ToMe_CHARS
- 阻塞：本机没有 BepInEx 5.4.23 core 和 Unity 5/2017 Managed 引用（`Build-UnityText.ps1` 需要 `MEGULIT_UNITY_MANAGED` / `MEGULIT_BEPINEX_CORE`），编不了也测不了；需要店主同意下载 BepInEx 引用包，或在有引用的机器上编

## 建议的推进方式

一个引擎一个逆向会话（Opus high），各自 worktree，交付：签名 + 静态签名测试（对店主本机 exe 命中一次）+ 原生自检 + 店主测试清单。顺序：YU-RIS（一个调用点，4 部游戏）→ BGI（素晴日）→ MAGES（泛化已有钩子）→ Siglus（VM 最复杂）→ Unity（先解决引用包）
