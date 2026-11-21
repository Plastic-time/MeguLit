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

### MAGES.（已做：画字层，2026-11-21，feat/re-mages）
- 现有：`native/megulithook/MagesEngine.cpp`、`MeguLitSg.cpp`、`native/mages/`（SC3 串解码含注音；STEINS;GATE 按 PE 时间戳精确匹配的串钩子 + 内嵌）。这些都是「读 SC3 字符串」，不是画字
- 加壳：店主本机 5 个 Steam 版 Game.exe 都是 SteamStub 3.1（`.bind` 段，`.text` 加密）。静态分析用 `tools/engine-sigs/steamstub.cjs` 在内存里解开（自己实现的 XOR 头 + AES-256-CBC，和 Steamless 输出逐字节一致），不写游戏文件。运行时 SteamStub 先解密再跑游戏，钩子看到的是明文代码
- 画字（静态逆向，5 个 exe 都核对过；名字和 LanguageBarrier 一致）：
  - **对话页**：引擎把每个文字窗口的字放在一个静态「页」数组里（10 页，步长 0x3C + 30×S；S = 2000，比翼恋理 7000）。每页头 0x3C 字节（+0xC = 字数），后面是逐字数组：fontNumber、charColor、outlineColor（int）、glyphCol/Row（u8，字码 = Row×64 + Col = SC3 字符码，字库每行 64 格 32 px）、原宽高（u8）、charDisplayX/Y、显示宽高（i16，设计坐标 1280×720）、标志字节（选项号）、…、不透明度
  - **drawDialogue / drawDialogue2(font, page, opacity)**：逐字三遍（描边 + 本体）调 **drawGlyph**(纹理, 源 x y w h, 目标 x0 y0 x1 y1, 颜色, 不透明度)，坐标乘引擎自己的缩放（`.rdata` 里的 1.5 → 1920×1080）
  - **提交函数（commit）**：把排版缓冲（字数、u16 字码、每字 16 字节信息）追加进第 page 页。排版缓冲保留了 SC3 控制码当标记：0x8001 名字开始、0x8002 名字结束（排版函数里按这对标记把名字挪到名字框，已在代码里确认）
  - **两个清页函数**：memset 页数组、字数归零
  - **谁写哪页**（顺着 SC3 指令表 01 0C / 01 12 / 01 14 找到，对照 impacto 的 opcode 表）：Mes → 当前窗口页（台词 + 名字）；**Sel → 第 7 页**（选项，标志字节 = 选项号）；**SysSel → 第 5 + 窗口页**（系统选项）。5 个 exe 完全相同
- 签名（按结构，不按整段字节；`tools/engine-sigs/mages-draw.cjs` 和 `native/megulithook/MagesDrawSig.h` 同一算法）：
  - drawDialogue：`push ebp; mov ebp,esp; sub esp,0C|10; push ebx` 后 24 字节内 `imul r, <页号>, stride`（stride 能整除出 S），紧跟 `cmp dword [r + pages+0xC], 0; je` → 页表地址、步长、字数；必须正好两个，且各有三处 `call X … add esp,2Ch` 指向同一个 X = drawGlyph；第一个 `movss xmm1,[abs]` = 缩放
  - commit：函数头 16 字节内 `cmp [count], eax; jbe`，0x60 内 `movzx edx, word [eax*2+codes]` 和 `mov ecx, info`，函数体里有 stride 和 `inc dword [r + pages+0xC]`；必须正好一个
  - 清页：`imul r, <页号>, stride; push S; (push 0 | push reg); lea eax, [r + glyphCol]`
  - 两种编译形态（SG / LBP：`8b 7d 0c … 69 db`；SG0 / CC / MDE：`69 5d 0c`）都命中，每个 exe 各部件只命中一次
- 版本层：每个 exe 的地址表（模块偏移）写进 `The Seed/mages/<游戏>/versions/<exe sha256>.json` 的 `settings.draw.engineTable`（新键 `draw.engineTable`，默认 null = 只靠签名）：drawDialogue、drawGlyph、commit、clear、pages、stride、chars、scale、layoutCount/Codes/Info、selPage 7、sysSelPage 5、charset（SG = sghd、SG0 / CC = default、LBP = sglbp、MDE = sgmde）、canvas 1920×1080。内核把它写成控制文件一行 `#table mages …`，DLL 用签名找，和表不一致就不挂
- 运行时（`native/megulithook/MagesDraw.h`，两个 MAGES 入口都调 `MagesDraw::Arm`：STEINS;GATE 精确适配和上游 MAGES 引擎；同一进程只武装一次）：
  - 默认不挂：控制文件出现 `roles=1`（这部游戏 seed 里 `draw.roles: true`）才装钩子；看守线程每 2 s 查一次
  - commit 前后：前面抄排版缓冲（字码、跳过标记），后面读新加进页的字（字码、框 ×缩放、颜色、标志）→ `ToMe_DRAWRUN engine=mages ev=add page= seq= role=line|choice|system from= n= codes=`（字码含标记）+ `ToMe_DRAWBOX … rects= color= flag=`
  - 清页 → `ev=clear page= seq=`；drawDialogue 第一次画这页 → `ev=show`；drawDialogue 以外的 drawGlyph（菜单、回想、手机……）按调用点成段，内容变了才记一行 `ev=glyph site=<rva> box= size= color=`
  - 返回值、寄存器、栈原样（pre 门 + 返回跳板），游戏看不到区别
- 内核（`core/mages-draw.cjs`，第二批已接进实时流）：`parse` + `PageTracker`（一页在两次清页之间 = 一个单位 page:seq；名字来自 0x8001/0x8002 标记；注音见下）+ `MagesLive`（实时：DLL 记录 → ToMe_CHARS，每个 page:seq 一个固定行号，文字变长就是同一行再报一次；清页或页重新开始时同一行号报一次空记录（协议里的「离开」）；名字 role=name `N:<页>`；选项每页一个 UI 快照（`C:<号>` / `Y<页>:<号>`），清页时空快照）。链路：MagesDraw.h → hook-diagnostics 行 → HookBridge `EngineInfo`（`hookEngineDraw`，自检里有一条）→ `HookNative.magesDraw` → `charRects` → hookCharRects / hookDrawUi。`core/text-paths.cjs` 登记 `engine=mages`
- **画布 → 窗口（静态，5 部一致）**：呈现函数在 Present(NULL,NULL,NULL,NULL) 前，把 16:9 的场景画进后备缓冲：宽铺满、高 = (宽 >> 4) × 9、垂直居中（(高 − 那个) × 0.5）；Present 再把后备缓冲整个拉伸到客户区。所以画布 1920×1080 在客户区的位置 = [0, (bh − h16)/2 × ch/bh, cw, h16 × ch/bh]（`viewport()`，写进 ToMe_CHARS 的 vx..vh）：16:10 全屏上下黑边、超宽屏上下被裁（vy < 0）、后备缓冲和窗口形状不同就被拉伸。后备缓冲尺寸是两个 u16 全局（签名：宽 → `shr 4` → `lea ×9` → 高 → `×0.5` → Present；JS `backbuffer()` / C++ `FindBackbuffer`），DLL 在每页第一帧和每 120 帧读一次，连同游戏窗口客户区报 `ev=view bb= client=`（变了才报）；读不到后备缓冲就按客户区，读不到客户区就交给内核按比例放
- **菜单调用点角色表（推断）**：drawDialogue 以外调用 drawGlyph 的函数里，直接调用次数最多的那个（5 部都是 9 个参数：SG 0x45bc0、SG0 0x62f30、CC 0x73010、LBP 0x4b200、MDE 0x699e0）= LanguageBarrier 的 drawSingleTextLine（系统菜单用）→ role menu；其余（手机、邮件、回想、TIPS、链接高亮）→ role system。根据是参数个数 + 调用次数，不是游戏里的名字。版本层 `menuText: [起, 止]`，`MagesLive.glyphRole(site)`。`ev=glyph` 只有框没有字，所以暂不送进阅读层（只给探针 / diff-maker 用）
- **注音标记（静态核实）**：5 部的 SC3 文本解析器（填排版缓冲的函数）对**每一个** < 0x20 的控制字节先写 `0x8000 + 字节` 进排版缓冲，再按 32 项跳转表分派；0x0A、0x0B 两个分支都推进排版下标（标记保留），并置 / 清同一个局部标志；字形路径看到这个标志为 1 时照样写字形，只是不计入这一行的字数。所以 0x8009 / 0x800A / 0x800B 会作为标记到达 commit，0x800A 和 0x800B 之间的字是排好的注音字（测试逐个 exe 核对）。仍是**推断**的只有一点：0x09 是「注音底字开始」（SC3 / impacto 的 STT_RubyBaseStart；0x09 分支只保留标记）
- **CHAOS;CHILD「一句拆成两句、排版对不上」**：原因是**推断**（没开游戏验证）：串钩子挂在 SC3 解析器上，一句里有等待（SC3 0x03 / 0x0E 等）时会分几次送出，所以一句被拆。画字层上，这几次都是往同一页 commit，中间没有清页；`MagesLive` 给同一 page:seq 同一个行号，后面几段是同一行变长再报，清页时这一行报一次空。回放测试 `validation/engine-draw-mages-live.test.cjs`：三段 commit → 行号都是 1、文字依次变长、清页一次空记录、下一句是行 2；再喂给 OverlayPlacement，看到的是一行在变长，不是两句
- 验证：
  - `validation/engine-draw-sig-mages.test.cjs`：5 个夹具片段、近似字节不命中、店主 5 个 exe（有就跑，SHA-256 对上）整段只命中一次且等于版本层表、Sel/SysSel 的 commit 调用形态、运行时日志回读、控制文件行
  - `native/megulithook/selftest/magesdraw.cpp`：同样的片段给 C++ 匹配器（41 项）
  - `native/megulithook/selftest/magesgate.cpp`：真 MinHook 挂在仿引擎函数上，跑 commit / 两段 commit / 清页 / 选项 / 菜单，检查返回值、栈、记录；输出就是 `validation/fixtures/engine-sigs/mages-draw-log.txt`
- 没做：内嵌（方案见下，未接）；`ev=glyph` 的文字解码（菜单字要从源坐标反推字码，描边和本体各画一遍，等探针日志再定）
- **内嵌替换方案（只写方案，未接）**：
  1. 位置：commit 之前（MagesDraw 已经在 commit 入口拿到排版缓冲）。台词那一页（Mes）在 commit 前把排版缓冲里这一句的字形换掉，不动 SC3 脚本、不动 VM
  2. 做法 A（推荐）：在解析器入口（SG 的 0x4496a0，`sc3 串, 2, 8, 0, &out`）换输入串：日文本身不变，只在汉字后插 SC3 注音 `09 底字 0A 读音 0B`（引擎自己排注音），中文作为第二段追加在 `00`（换行）之后；串用 SC3 字码编码，**中文字形必须在字库图集里**：先用这一版的字码表查（没查过，不知道够不够），缺的字用 `core/mages-font.cjs` 补字库（替换 FONT 纹理里没用到的格子，并把这些格子写进字码表）
  3. 做法 B（不补字库）：只插注音（日文字库够用），中文仍由阅读层画在对话框外（`emb=1`）
  4. 行数上限：每页 S 个字、每个窗口的行数（排版参数表，SG 在 0x16f4bc4，按窗口号），放不下就降到只注音；写进版本层（`draw.embed*`）
  5. 配对：commit 记录里报 `emb=1/2`（MagesLive 带上），阅读层按协议少画；回放测试照 KiriKiri 的做法加「替换后整句只画一次」
  6. 风险：现有 SG 的 `EmbedMAGES_SteinsGate`（sgBlank）已经在同一解析器入口改串，两者必须二选一（按 seed 的 draw.embed 互斥），否则会重复改

#### 店主测试清单（MAGES）
1. 在 The Seed 里给 STEINS;GATE（或 CHAOS;CHILD / STEINS;GATE 0 / 两部外传）的游戏差分设 `"draw":{"roles":true}`（版本层的 engineTable 已经有了），或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，内容 `#cfg roles=1`）
2. 开游戏，新游戏推 5 句（有名字的句子至少 1 句），出一次选项，开一次系统菜单
3. 看 `logs\hook-diagnostics.log`：
   - 有 `ToMe_DRAWRUN engine=mages on: drawDialogue=…`（地址应和版本层表一致）
   - 每句有 `ev=add page=0 …`（或别的窗口页）和 `ToMe_DRAWBOX`；有名字的句子 codes 里有 `8001…8002`
   - 推到下一句前有 `ev=clear page=…`；选项出现时有 `ev=add page=7 … role=choice`，DRAWBOX 的 flag 是 0、1、2…
   - CHAOS;CHILD：一句里有停顿的句子，同一 `seq` 下有多条 `ev=add`（from 递增），中间没有 clear
   - 有 `ev=view bb=<后备缓冲> client=<客户区>`：窗口化 / 全屏各切一次，数值跟着变
   - 阅读层：有停顿的句子在 MeguLit 里只出现一行（不再拆成两行），清字时跟着消失；名字和选项旁边有注音 / 中文，点选项照常
4. 游戏照常显示、不卡、不崩 = 过
5. 不过时发：`hook-diagnostics.log` 全文；没有 `on:` 只有 `off: …` 那行 = 这个版本签名或表没对上，连同 exe 路径发来

### Unity（7 部）——Mono 已做
- 分布（静态看游戏目录）：Mono = Doki Doki Literature Club Plus、ひぐらし、月に寄りそう乙女の作法、夏色四叶草 Summer Clover；IL2CPP = 逆転検事 1&2（GK12，il2cpp_data）、魔法少女ノ魔女裁判（manosaba）；haisha-fengyun 本机未找到
- 做了（`native/unitytext/MeguLitUnityText.cs`，Mono 插件）：
  - 角色：对白以外的可见文字按组件判断：Utage `AdvUguiSelection` / Naninovel `ChoiceHandlerButton` / 任何 `*Choice*`、`*Selection*` → choice；Utage 消息窗里名字字段指向的文字、Naninovel `AuthorNamePanel` / `AuthorNameText`、物体名含 name / speaker / author 的短文字 → name；`Button` / `Toggle` / `*Button` → button。只报屏幕框（`id=U<role>:<n>`），不改不藏
  - 内嵌：对白组件直接换成替换文字：TextMeshPro 在基字后用 `<space><voffset=1em><size=50%>` 把注音居中放到基字上方，中文作为 `<size=80%>` 第二段（溢出 70%，再溢出不画）；uGUI Text 富文本没有上移，只加中文（`<size=字号×0.8>`）。游戏自己的标签和换行保留；按游戏字数走的打字机走完后把 maxVisibleCharacters 放开；记录只报日文、带 emb；内嵌时不隐藏
  - 控制：套接字新增 `DRAW roles= embed= zh=`、`EMB <句> TAB <注音> TAB <中文>`（重连时重发），插件发 `ToMe_UNITY ask <句>`
- 验证：用 ひぐらし 自带的 Managed（Unity 5，mscorlib 2.0）+ 仓库外的 BepInEx 桩（`H:\MeguLit-Work\deps\bepinex-stub`，不发布）编译通过；`validation/engine-draw-unity.test.cjs` 把插件里的 `Build` 抽出来编成小程序跑（注音位置、标签保留、uGUI）+ 节点侧协议
- 真编译（2026-11-21）：`Build-UnityText.ps1` 用官方 BepInEx 5.4.23.6 core（GitHub BepInEx/BepInEx release v5.4.23.6，总指挥经店主同意下载到 `H:MeguLit-Workdeps\bepinex-5.4.23.6`，不进仓库；zip SHA-256 x64 6c57a714…0755、x86 a4024daf…622d）+ ひぐらし 的 Managed，x86 / x64 两份 core 都编过；输出 24576 字节，SHA-256 C833BDE2…7F28（只是验证，正式包在发布构建里出）
- 没做：IL2CPP 插件（`MeguLitUnityText.IL2CPP.cs`，逆転検事 1&2、魔法少女ノ魔女裁判）同样的改动——要 BepInEx 6 在游戏里跑一次生成 interop 程序集才能编，需要开游戏，等店主测试时一起做

### Artemis（THE SHELL Part I–III）——游戏自己的双语排版，已做
- 整个 ADV 层是 pfs 里的 Lua；MeguLit 已有的 E591（`core/artemis-language.cjs`）用「游戏最后读的 `.pfs.NNN` 覆盖 Lua 文件」把正文切成日文。THE SHELL 每个文本块同时带 ja / en / tw / cn，日文里有引擎自己的注音 `{"ruby", text=…}`，引擎本身就有双语排版：`message_control` 在 `init.game_sublangview == "on"` 且有副语言时，先在 adv 层画主语言，再在 `adv_sub` 层画副语言并放到主语言正下方
- 做法：同一个补丁档里，在 `system/image/boot.lua`（它在 msg/message.lua、msg/lang.lua 之后读，所以包到的都是游戏自己的函数）末尾追加 `core/artemis-draw.lua`：
  1. 副语言 = 这一版的中文轨（cn，或 tw），打开 `game_sublangview`
  2. `mw_textloop` 不看传进来的语言（这一版副语言那一遍会又画日文）：副语言那一遍 `getTextBlockFloat` 取 `p[cn]`
  3. 游戏的字体表里没有 `sub01`，开机 `setMWFont` 就会 `sub01 は登録されていないfont設定です` 然后空指针停住：缺 `subNN` 时用 `advNN` 的中文那一份（cn = font06 Noto Serif SC），字号 80%，不带注音
  - 每个包装都回落到游戏自己的函数；不写游戏存档、设置
- 触发：这部游戏的差分 `draw.embed: true`（且 `draw.embedTranslation` 不为 false）时，「日文原版恢复」（`jp_restore_apply` → `core/japanese-restore.cjs` → `artemis-language.apply(dir,{bilingual:'cn'})`）生成的补丁档带上这段；这一版没有中文轨或没有 boot.lua 就只做原来的日文修正。撤销同 E591（删掉那个补丁档）
- 测试 `validation/engine-draw-artemis.test.cjs`：用店主同意下载、总指挥编好的 Lua 5.1.5（`H:\MeguLit-Work\deps\lua\bin\lua51.exe`），把 THE SHELL Part I 自己的 msg/message.lua、msg/lang.lua、msg/ui.lua、image/boot.lua 和字体表（只读，从游戏的 pfs 里读，MeguLit 自己的补丁档跳过，不写游戏目录）加上 E591 修改和这段，在替身引擎里跑：
  - 开机路径：`get_fontdata("sub01")` 得到 Noto Serif SC 30px、无注音；`adv01` 不变（思源宋体 38px、注音 14）；`set_textfont("sub01", …adv_sub, "adv")` 跑通并给 adv_sub 层设上中文字体
  - 游戏真实的一句（0001_00006，带「櫻羽 / おうば」注音）：adv 层画日文 + 注音标签，adv_sub 层画中文，adv_sub 的 top = 主文本高度
  - 对照：去掉这段，同样的游戏 Lua 在 `set_textfont("sub01")` 处报错停住
- 没做：Lua 里没有通往 MeguLit 的通道，Artemis 的位置 / 角色仍走外面（字形点 / GPU）

#### 店主测试清单（THE SHELL）
1. 给 THE SHELL（Part I 先）的游戏差分（The Seed）设 `"draw":{"embed":true}`
2. 如果之前做过「日文原版恢复」，先在同一处撤销（游戏目录里 MeguLit 加的 `TheShell.pfs.0NN` 会被删掉），再点一次「日文原版恢复」
3. 开游戏：能正常开机进标题 = 第一关过（不过：开机停住或黑屏，发 `.megulit-japanese\manifest.json` 和游戏目录文件列表）
4. 开新游戏推 5 句：对话框里日文（带游戏自己的注音）在上，官方中文在正下方，小一号；中文不缺字
5. 长句看中文有没有超出对话框底部；超了把截图发来（字号 / 位置以后进版本层差分调）

## 样板：YU-RIS（已做，其他原生引擎照这个写）

| 部分 | 文件 | 写法 |
|---|---|---|
| 签名（参考实现） | `tools/engine-sigs/yuris-draw.cjs` | 按结构匹配，不按整段字节：`call <blitter>; add <累加器>, eax; movzx; movzx eax,[r+表]; inc eax; movsx edx,al; add`，再从调用前 0x90 字节里推出「累加器存进哪个栈槽」= 字的 x，x+4 = y。不同编译版本寄存器不同（euphoria HD：`[esp+3c]`→`[esp+28]`；其他三部：`ebx`→`[esp+20]`），结构一样 |
| 签名（原生） | `native/megulithook/YurisDrawSig.h` | 和 JS 同一个算法，纯字节匹配、不调 Windows，能单独编译测 |
| 夹具 | `validation/fixtures/engine-sigs/yuris-draw.json` + `native/megulithook/selftest/yurisdraw-snippets.h` | 每个已知版本取调用点前 0xa0 到后 0x30 的字节（店主本机 exe，只读）+ 整文件 SHA-256 + 期望值 |
| 静态签名测试 | `validation/engine-draw-sig-yuris.test.cjs` | 夹具上一条命中、槽位和 blitter 对；近似但不对的字节不命中；本机有这个 exe（SHA-256 一致）时整段代码只命中一次，没有就跳过 |
| 原生自检 | `native/megulithook/selftest/yurisdraw.cpp`（`selftest/run.cmd` 里跑） | 同样的夹具字节给 C++ 匹配器，结果必须和 JS 一致 |
| 运行时钩子 | `native/megulithook/YurisDraw.h`（`Yuris::attach_function` 末尾 `YurisDraw::Arm`） | 默认不挂：看到控制文件 `roles=1`（这部游戏 seed 里 `draw.roles`）才在调用点装 MinHook；每次画字读 EAX（字）和调用方栈上的 x / y，一段文字一条 `ToMe_DRAWRUN engine=yuris run= n= x0 y0 x1 y1 size= text=`（hook-diagnostics.log；单条 500 字节上限）。只匹配到不是正好一处就不挂 |
| 内核 | `core/hook-native.cjs` drawSync | 这部游戏的差分开了 draw.* 就立刻写控制文件（不等第一句） |

坐标是窗口文字画布上的像素，不是屏幕：下一步由探针 / diff-maker 用 DRAWRUN 和已有的字形点 / GPU 位置配出每部游戏「画布 → 屏幕」的偏移写进版本层差分，角色由 DRAWRUN 的文字和 hook 流的 ctx2（台词 / 名字 / 其他）对上。内嵌仍走现有写回

### 店主测试清单（YU-RIS）
1. 在 The Seed 里给 euphoria（或 女装山脈 / サイコロジック）的游戏差分设 `"draw":{"roles":true}`，或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，内容 `#cfg roles=1`）
2. 开游戏推 5 句、出一次选项
3. 看 `logs\hook-diagnostics.log`：有一行 `ToMe_DRAWRUN engine=yuris on: call ...`，之后每句有 `ToMe_DRAWRUN engine=yuris run=` 带这句的文字；名字和选项也各有自己的 run
4. 游戏照常显示、不卡、不崩 = 过。没有 `on:` 行而有 `off: N dialogue loop matches` = 这个版本签名没对上，把那行和 exe 发来

## 建议的推进方式

一个引擎一个逆向会话（Opus high），各自 worktree，交付：签名 + 静态签名测试（对店主本机 exe 命中一次）+ 原生自检 + 店主测试清单。顺序：YU-RIS（一个调用点，4 部游戏）→ BGI（素晴日）→ MAGES（已做：对话页 + 提交函数，5 部 Steam 版）→ Siglus（VM 最复杂）→ Unity（先解决引用包）
