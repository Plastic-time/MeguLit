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

一个引擎一个逆向会话（Opus high），各自 worktree，交付：签名 + 静态签名测试（对店主本机 exe 命中一次）+ 原生自检 + 店主测试清单。顺序：YU-RIS（一个调用点，4 部游戏）→ BGI（素晴日）→ MAGES（泛化已有钩子）→ Siglus（VM 最复杂）→ Unity（先解决引用包）

## GDI 画字点：其余原生引擎的通用部件（re-misc）

普查见 [engine-draw-matrix.md](engine-draw-matrix.md)「其余原生引擎」。用 GDI 画字（TextOut / ExtTextOut / DrawText / GetGlyphOutline）的引擎，画字都集中在一两个调用点。YU-RIS 是一个引擎一套钩子；这里改成一个通用部件 + 每个引擎一条签名，新引擎只加一行签名、夹具和测试清单

| 部分 | 文件 | 写法 |
|---|---|---|
| 签名表 + 匹配（原生） | `native/megulithook/DrawSitesSig.h` | 一条签名 = 模块（空 = 游戏 exe）+ API + 调用前的字节（`??` 是版本间会变的字节）+ 应命中次数 + frame。匹配：模块导入表里该 API 的 IAT 槽 → 代码里所有 `call dword ptr [槽]`（FF 15）→ 调用前字节对上。命中数不正好等于 count 就不用。纯字节、不调 Windows |
| 签名（参考实现） | `tools/engine-sigs/draw-sites.cjs` | 直接读上面那个头文件里的表（只有一份），同一个算法，自己解析 PE 导入表 |
| 夹具 | `validation/fixtures/engine-sigs/draw-sites-files.json`（店主本机文件清单）→ `tools/engine-sigs/draw-sites-fixture.cjs` 生成 `draw-sites.json` + `native/megulithook/selftest/drawsites-snippets.h` | 每个命中点取调用前 0x40 到调用后 0x10 的字节 + IAT 槽 + 整文件 SHA-256（只读） |
| 静态签名测试 | `validation/engine-draw-sig-sites.test.cjs` | 夹具上每条只在调用处命中一次；换一个 IAT 槽或改一个字节就不命中；本机有这个文件（SHA-256 一致）时整个模块正好命中 count 次、位置和夹具一致；签名在普查里其他引擎的文件中一次都不命中 |
| 原生自检 | `selftest/drawsites.cpp`（同样的夹具字节给 C++ 匹配器）+ `selftest/drawsites-gate.cpp`（运行时门：照 MinHook 在调用点的方式驱动，参数已压栈 → 桩 → 门 → 跳板做原调用；查 API 拿到的参数、返回值、游戏寄存器都不变，记录的文字 / 笔位 / via 对） | `selftest/run.cmd` 里跑 |
| 运行时钩子 | `native/megulithook/DrawSites.h`（`enginecontrol.cpp` checkengine 开头 `DrawSites::Arm()`，不管 LunaHook 匹配到哪个引擎） | 所有签名在各自模块里找一遍；默认不挂：控制文件 `%TEMP%\MeguLit\draw\<pid>.txt` 出现 `roles=1`（这部游戏 seed 的 `draw.roles`）才在每个命中点装 MinHook。每次调用读栈上的 API 参数，按「同一点 + 同一调用者 + 同一行、x 递增」连成一段，一段一条 `ToMe_DRAWRUN engine=<id> site=<k> via=<rva>/<rva> run= n= x0 y0 x1 y1 size= fargs=<4 个 hex> text=`（hook-diagnostics.log）；没字 250 ms 就把最后一段写出。只有 x86（64 位编译时为空） |

字段：x / y 是引擎文字画布（DC）上的笔位，不是屏幕；GetGlyphOutline 点没有笔位（-1）。via = 包着调用点的函数的返回地址（和再上一层），用来分台词 / 名字 / 选项例程；frame=1 按 EBP 帧读，frame≥8 表示这个函数没有 EBP 帧，返回地址在 API 第一个参数上方固定字节处。fargs = 这个函数前 4 个参数（不少引擎把笔位当参数传给字形例程）。角色和「画布 → 屏幕」偏移和 YU-RIS 一样，由探针 / diff-maker 用这些记录和 hook 流配出，写进版本层差分

现在的签名（每个都在店主本机文件上正好命中 count 次，在其他引擎的文件里不命中）：

### ReaLive / AVG32（涙 ～流星のザドル～）
- 点：AVG3216D.EXE 0x413880，例程 0x413730（把一串字画进文字 DIB，一字一次 `TextOutA(hdc, x - 滚动, y, 字, 1|2)`，有 EBP 帧，5 个调用者）。x / y 就是画布笔位
- 另一个 TextOutA（0x41f888）在设置对话框里，不签
- 店主测试清单：
  1. 写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，内容 `#cfg roles=1`），或在 The Seed 里给这部游戏的差分设 `"draw":{"roles":true}`
  2. 开游戏推 5 句、出一次选项
  3. `logs\hook-diagnostics.log` 里先有 `ToMe_DRAWRUN engine=avg32 found: 1 site(s) of TextOutA` 和 `on: site 0`，之后每句有 `ToMe_DRAWRUN engine=avg32 site=0 ... text=` 带这句的文字；名字和选项各自 via 不同
  4. 游戏照常显示、不卡、不崩 = 过。只有 `off: N sites match` = 这个版本签名没对上，把那行和 exe 发来

### Softpal（時計仕掛けのレイライン）
- 点：dll\PAL.dll 0x10008295，字形例程里唯一的 `GetGlyphOutlineA(hdc, 字, GGO_GRAY8, &gm, 0, NULL, &mat)`（量尺寸那次；字体类型 4 走引擎自己的栅格化，不经过这里）。有 EBP 帧
- 没有笔位：位置已经由 Pal.cpp 的 pal_sprite_v1 文字精灵给出，这里补的是「哪段字从哪个例程画出来」（via）
- 店主测试清单：同 AVG32，行里是 `engine=softpal`，`x0=-1`

### NScripter（月姬 v1.4 / v1.6，两版是同一个 exe）
- 点：Tsukihime.exe 0x40eefe，字形例程 0x40eb20（thiscall，第一个参数是字串，5 个调用者）每个字 `TextOutA(hdc, x, 0, 字, 2)` 画进字形小图；0x40f061 / 0x40f085 是它带条件的额外描边 / 阴影遍，不签。另外 5 个 TextOutA（0x41878a、0x41cb2e、0x41d28d、0x430b31、0x43fad3）在别的例程里，等实机记录看清是什么再签
- 例程没有 EBP 帧：序言 0xfe4 字节（SEH + 0xfc4 局部 + 4 个寄存器）加 5 个 API 参数，返回地址在 API 第一个参数上方 0xff8（签名 frame=0xff8）。x / y 是字形小图里的位置，页面上的笔位是例程自己的参数之一，看 `fargs=`
- 店主测试清单：同 AVG32，行里是 `engine=nscripter`；看 `fargs=` 里哪一项随每个字递增（那就是笔位 x）

### Innocent Grey（虚ノ少女）：MFC 的 CDC 文字包装
- 点：Innocentsetup.exe 里 MFC 的 CDC::TextOutW（0x41adc7）、CDC::ExtTextOutW（0x41a849）、CDC::DrawTextW（0x41a808），三个都是把参数原样转给 GDI、DC 取 `[ecx+4]` 的薄包装，有 EBP 帧
- 程序经 CDC 画的字都从这里过（游戏自己的界面也是），via 是调用 CDC 的那个游戏例程，用它分台词 / 名字 / 菜单。这段是 MFC 自带代码，别的 MFC 程序也会命中，所以签名名叫 mfc-*，不叫游戏名
- 店主测试清单：同 AVG32，行里是 `engine=mfc-textoutw` / `mfc-exttextoutw` / `mfc-drawtextw`；推一句后看哪个 via 带着台词

### AdvHD / WillPlus（Under The Moon；seed 里的 ディスコード！ 同引擎，本机没有它的 exe）
- 点：utmoon.exe 0x40f5d9，通用字形例程 0x40f2a0（23 个调用者，引擎画的所有字都经过它）里每个字一次 `GetGlyphOutlineA(hdc, 字, GGO_GRAY8, &gm, 0, NULL, &mat)`；0x40f613 是真正栅格化那次，0x40ff0b / 0x40ff3a / 0x40fff0 是 TextOutA 描边，不签
- 例程没有 EBP 帧：sub esp,0xb8 + 4 个寄存器 + 7 个 API 参数，返回地址在第一个参数上方 0xe4（frame=0xe4）。via = 调用者（台词 / 名字 / 选项 / 菜单各是不同的调用点），没有笔位（x=-1），fargs 里有例程的参数
- ディスコード！ 的 exe 版本不同，签名对不上时会写 `off:`，拿到 exe 再补一条
- 店主测试清单：同 AVG32，行里是 `engine=advhd`
