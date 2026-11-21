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

### BGI / Ethornell —— 素晴日 HD 已做（re-bgi，2026-11-21）
- 现有：`native/megulithook/BGI.cpp`（LunaHook 字符串钩子 + 内嵌写回）
- 画字（素晴日 HD，Ghidra 12.2 反编译 + capstone，只读）：TextOutA/W、GetGlyphOutlineA 全在字形缓存函数 0x4342b0 里（只把一个字画进缓存位图，没有屏幕坐标），不能当锚。真正的排版在 0x43b350：一次把整段文字（消息窗、名字、选项、菜单的文字精灵都走它）排成一条「字节点」链，0x43acd0 再把整条链画进文字精灵的位图，然后 0x43d590 释放整条链
  - 字节点 0x48 字节：+0x10 x、+0x14 y（文字精灵画布像素）、+0x18/+0x1c 同一坐标、+0x20 字形图、+0x38 注音串、+0x40 标志（0x80000000 = 标记节点）、+0x44 下一个
  - 每个字挂链时（0x43d3eb 起）先写 x/y，再 `call 0x43d550`（取字距）、再 `mov [prev+0x44], node`；这时 ebx = 节点，字码在 `[esp+0x30]`（BGI 自己的码：<0x100 单字节，否则 SJIS 双字节 hi<<8|lo），前一个节点在 `[esp+0xa0]`，文字颜色是排版函数的参数 `[ebp+0x2c]`
  - 一段文字的第一个字挂在链头后面，链头在调用者（0x43acd0）的栈上，不是堆节点：靠这个判断「新的一段」，中间插的标记节点不会把一段拆开
- 角色：这一层没有窗口对象。BGI 的消息窗、名字、选项都由系统脚本（sysprg.arc）通过同一组 VM 系统调用建文字精灵，再进同一个排版函数，所以在原生层只能拿到「是哪一条调用链排的」：记录带 `via=<排版的返回地址>,<上一层>,<再上一层>`（相对镜像的 RVA）。哪条 via 是台词 / 名字 / 选项是这部游戏版本层差分里的数据 `draw.viaRoles`（`"<rva>,<rva>=name"`，前缀匹配），内核写进控制文件的 `#role` 行，DLL 匹配上才带 `role=`。via 的实际值要店主实机跑一次 DRAWRUN 才知道（静态推不出哪个系统调用对应哪个脚本函数，这是猜测风险最大的一步，所以不猜）
- 清屏 / 换页：BGI 每次排版都把整个文字精灵重画，所以「一段排完」= 这个精灵的内容被整体换掉；链释放时（0x43d590）报 `end`。精灵本身什么时候被隐藏 / 销毁（真正的清屏）没在这一层，没做（需要再往文字精灵对象上逆，静态没找到稳的锚）
- 记录（hook-diagnostics.log，同 YU-RIS 一样是 DRAWRUN，不进 ToMe_CHARS、不改任何显示）：
  ```
  ToMe_DRAWRUN engine=bgi on: link <addr> node=3 ch=[esp+30] prev=[esp+a0] color=[ebp+2c] free=<addr>
  ToMe_DRAWRUN engine=bgi run=N row=K n=<字数> x0= y0= x1= y1= size=<行内最大字距> color=aarrggbb via=<rva>,<rva>,<rva> [role=R] text=<UTF-8，120 字节截断>
  ToMe_DRAWRUN engine=bgi end run=N rows=K
  ```
  一行一条（同一 y 为一行），x0 / x1 是这一行第一个 / 最后一个字的原点，size 是行内相邻字原点的最大间距（≈字号 + 字距，不是字体高度）
- ユースティア：见下面「ユースティア 的壳」

#### 6 件套（BGI）
| 部分 | 文件 |
|---|---|
| 签名（参考实现） | `tools/engine-sigs/bgi-draw.cjs`：挂链调用点 = `call` 前紧挨着 `mov [N+0x18],r; mov [N+0x1c],r`，前 0x30 字节内有 `mov [N+0x10],r` 和 `mov [N+0x14],r`，之间正好一个 `push`；`call` 后 0x30 字节内 `mov r,[esp+P] … mov [r+0x44],N`；往前 0x1400 字节内最近的 `cmp dword [esp+S],0x8140` 给字码槽（+4 = 那个 push）、`mov r,[ebp+C] … or r,0xff000000` 给颜色参数。释放函数 = `mov r1,[r0+0x44]; test r1,r1; je; [push edi]; mov r2,r1; mov r3,[r2+0x38]; mov r1,[r1+0x44]`，前 8 字节内有 `push ebp; mov ebp,esp` |
| 签名（原生） | `native/megulithook/BgiDrawSig.h`（同一个算法，纯字节） |
| 夹具 | `validation/fixtures/engine-sigs/bgi-draw.json` + `native/megulithook/selftest/bgidraw-snippets.h`：调用点前 0x900 到后 0x40、释放函数头 0x30 字节；素晴日 HD 的 BGI.exe / BGI_patch.exe / BGI-CHS.exe 这三段字节完全一样，三个 SHA-256 都登记 |
| 静态签名测试 | `validation/engine-draw-sig-bgi.test.cjs`（夹具命中 + 槽位；去掉 x 写入 / 多一个 push / 没有 0x8140 比较 / 没有挂链都不命中；本机三个 exe 整段代码各一处挂链、一处释放；draw.viaRoles 写进控制文件） |
| 原生自检 | `native/megulithook/selftest/bgidraw.cpp`（`selftest/run.cmd` 里跑，同样的字节给 C++ 匹配器） |
| 运行时钩子 | `native/megulithook/BgiDraw.h`（`BGI::attach_function` 找到 BGI 文字钩子后 `BgiDraw::Arm`）。默认不挂：控制文件 `roles=1` 才在挂链调用点和释放函数头装 MinHook；挂链点不是正好一处就不挂（`off: N glyph link matches`）。新键 `draw.viaRoles`（版本层，默认 `[]`）经 `core/engine-draw.cjs` 写成控制文件的 `#role` 行 |

#### 店主测试清单（BGI，素晴日 HD）
1. 在 `The Seed/bgi/subahibi/game.json` 把 `draw.roles` 改成 `true`（或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`，UTF-16LE，内容 `#cfg roles=1`）
2. 开游戏，新游戏推 5 句（有名字的句子）、走到第一个选项、开一次系统菜单
3. 看 `logs\hook-diagnostics.log`：
   - 有一行 `ToMe_DRAWRUN engine=bgi on: link ... node=3 ch=[esp+30] prev=[esp+a0] color=[ebp+2c] free=...` = 钩子装上了
   - 之后每句台词有 `run=N row=0..` 带这句每一行的文字，最后一行 `end run=N rows=K`；名字、选项、菜单文字各有自己的 run，`via=` 不同
4. 游戏照常显示、不卡、不崩 = 过
5. 把日志里 台词 / 名字 / 选项 各一条的 `via=` 发来：写进版本层差分 `draw.viaRoles`（如 `"via前两段=name"`），下一次同样的行就带 `role=`
6. 不过时发：hook-diagnostics.log 全文（尤其 `ToMe_DRAWRUN engine=bgi` 开头的行）；有 `off: N glyph link matches` 说明这个 exe 版本签名没对上，把那行和 exe 的 SHA-256 发来

#### ユースティア 的壳
- 不是商业壳（没有 Themida / VMProtect / ASProtect / SecuROM / StarForce 等任何特征串）：入口 0x455fd3 是一段 Sleep 延时循环（100 次），然后跳到最后一节 0xc9a000 的自写多层自解密壳：每层先算一遍校验（rcl 混淆），再用常量 `xor [esi],k1; add [esi],k2` 逐 dword 解下一层（第一层 k1=0x163ead5 k2=0x30eee628，0x1000 字节），夹花指令。原 .text（0x401000 起 0x143000 字节）和 3.6 MB 的数据段都是解开后才有。导入表只有 17 个每库一个的假导入（真导入在运行时重建）。BGI.OLD 和 BGI.exe 只差密文里 3 个字节（汉化补丁改的）
- 静态脱壳（没做成）：用 speakeasy（Mandiant 的 Windows 模拟器，只模拟 CPU，不开游戏，脚本 `H:\MeguLit-Work\re-bgi\unpack2.py`）从入口跑壳，停在第一次回到 .text 时转储。第一层（延时 + 校验 + 0x1000 字节 xor/add）跑通，接着进入解开的 0x63f91f 一带：第二层是混淆寻址的代码（`mov edi,[ebp+0x7a2b6b0]`，ebp 是算出来的 0xf8bf1014），unicorn 在这里写宿主内存出错（19 次，都在 0x5d1a3b / 0x63f91f），1500 秒内没回到 .text。结论：第二层像带反模拟的变形壳，继续静态硬脱要一层层写模拟补丁，成本远大于收益
- 运行时不受影响：`BgiDraw::Arm` 在 BGI 文字钩子装好之后扫的是**内存里已经解开**的镜像（各节都带可执行属性），所以 ユースティア 实机会照常找签名。ユースティア 是 2011 年的 BGI，排版代码和 2018 年的素晴日 HD 是否同一结构**没有验证（猜测：链表结构相同，寄存器 / 栈槽可能不同，签名按结构匹配能吸收这部分）**；对不上时 DRAWRUN 会报 `off: N glyph link matches`，不挂任何钩子
- 需要实机做的：店主按下面清单开 ユースティア（`The Seed/bgi/aiyoku-no-eustia/game.json` 设 `draw.roles: true`），看 hook-diagnostics.log 有没有 `engine=bgi on:`；没有就把 `off:` 那行发来

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
