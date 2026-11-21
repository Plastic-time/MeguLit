# 原生引擎的画字函数：缺口和方案（2026-11-21）

总指挥这一批：Siglus（CLANNAD、Summer Pockets）、BGI（素晴日、ユースティア）、YU-RIS（euphoria、女装山脉、サイコロジック）、MAGES（STEINS;GATE 系、CHAOS;CHILD）、Unity（The Seed 里 7 部）。目标同前：从画字函数 / 组件拿 文字 + 坐标 + 名字框 + 选项 + 按钮角色，台词内嵌，UI 只报框。协议见 [engine-draw-protocol.md](engine-draw-protocol.md)

这一份只有静态结论（只读店主的游戏文件，`H:\MeguLit-Work\tools-re\probe_draw.py` / `around.py`，pefile + capstone），没有开游戏。脚本层引擎（KiriKiri / RPG Maker / Tyrano / Ren'Py）能在引擎自己的脚本里读，原生引擎没有这一层，每个都要反汇编到画字函数，各要一个独立的逆向会话（Opus high），所以先把每个引擎的入口和方案定下来

## 静态普查（店主本机的 exe）

GDI `DrawSites` 诊断只接受控制文件首个完整 `#cfg` 行里唯一、精确的 `roles=1` 字段，默认关闭
观察器整个进程生命周期约每 2 秒复查一次权限，删除文件、读取失败或 `roles=0` 会停止读取与输出，并丢弃尚未输出的 run；重新开启从新 run 开始
撤权与读取共用锁，撤权完成后不会继续读取先前调用的参数；已安装的跳板保留，原游戏调用继续原样执行，避免运行中卸钩
这是只读诊断的权限边界，不授予原文隐藏、译文替换、角色或屏幕坐标能力；各游戏仍需独立实机验收
GDI gate 在调用观察器前保存 x87/SSE 状态并清方向标志，观察器返回或受保护异常后还原，再继续原 API
真实 MinHook 小型回放检查栈、整数寄存器、DF/CF、XMM0/XMM7、x87 值与控制字、MXCSR，也覆盖观察器先破坏浮点状态再抛异常；它不证明 AVX 上半部或完整游戏显示行为

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

权限回归：BGI 现在只接受 UTF-16LE 首条完整 `#cfg` 行（支持 transport 的 BOM），`roles=1` 必须是唯一且精确的 token，正文伪 cfg、重复键、截断及畸形宽字符均不能授权
watcher 安装后继续每两秒刷新；撤权、控制文件缺失或读取失败会丢弃 pending row/end 与角色映射，重开只记录新文字，原 link/free 始终透传
`#role` 行保留 `draw.viaRoles` 的六种角色、1..8 位小写 hex RVA、最多六段前缀合同，并只读取数据行前的有效 metadata
在途日志可能已交给 logger，撤权不是撤回已发送日志的确认；权限代次避免在 logger 内发生 off-on 后，旧调用重建 pending 数据
`selftest/run-bgi-permission.cmd` 使用真实 JS transport 文件、生产 ReadControl 和小型真 MinHook 调用点/free 回放；它是 native-builds `ci:false` 下的本地自检，不代表真实游戏验收或普通 CI 已跑 native gate

1. 在 `The Seed/bgi/subahibi/game.json` 把 `draw.roles` 改成 `true`（或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`，UTF-16LE，首行内容 `#cfg roles=1` 并以换行结束）
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

### SiglusEngine（已做：签名 + 钩子 + 自检，2026-11-21，feat/re-siglus）
- 现有：`native/megulithook/Siglus.cpp`（LunaHook，ctx2 1/2/3，内嵌写回 role=1 的流；CLANNAD 曾因写 role=3 的 VM 通用串崩，见 `native/EmbedTextPolicy.cs`）；`native/siglus/` 是旧的独立构建，不再用
- 静态逆向（只读店主的 CLANNAD 1.1.134.0 和 Summer Pockets 1.1.137.0 两个 exe，pefile + capstone，脚本在 `H:\MeguLit-Work\tools-re\siglus\py`；函数名是我们起的，exe 没有符号）：
  - GetGlyphOutlineW ×2 只是字形缓存（第一次见到某个字才调），不是画字的地方
  - 每个文字区（mwnd 里的 msg，0x1c0 字节；mwnd+0x228 是 msg 数组，mwnd+0xc34 是名字窗的 msg）有一个字表 `std::vector<moji>`（msg+0x1ac，moji 0x3b4 字节：+0 类型、+4 字码、+8 字号、+0xc 颜色号、+0x18 x、+0x1c y，文字区自己的像素）。**所有文字区的每个字都走同一个 push_back**——这就是画字函数
  - 排版主循环 msg::add_msg（只有它做「」『』（ 的括号判断，靠这个定位）把字填进栈上的 moji 再 push；注音排版（mwnd.ruby 结束时）、名字窗（mwnd.namae）、mwnd.sel / selmsg 的选项项、global.selbtn 的选项项各有自己的 push 调用点。调用点前面的字节两个版本完全一样，按它分角色；add_msg 自己的调用方（mwnd.print / 名字写进消息里 / 回想页）再从 push 时的 [ebp+4] 分
  - 角色对 VM 命令：switch 表的分支号就是 SiglusSceneScriptUtility `const.py` 的元素号（mwnd.print 4、sel 5、ruby 12、selmsg 50–52、namae 62/63；global.selbtn 76/77/126/128）
  - 注音：mwnd.ruby(str) 记下读音（msg+0x14c 的 wstring）和起点（msg+0x180/0x184），之后的字照常排；ruby() 结束时排版函数从起点到笔位（msg+0xe0，字的 x = 笔位 + msg+0xe8）把读音逐字 push 到上方（错误串「ルビの対象の文字列が空です」「ルビの途中で改行されています」都在它里面）
  - 清屏 / 换页：msg::clear（清读音状态、纯文本、字表）
- 6 件套：
  | 部分 | 文件 |
  |---|---|
  | 签名（参考实现） | `tools/engine-sigs/siglus-draw.cjs`：括号判断 → add_msg 起点 → 字数计算里的字表偏移 → 那一个 print push → push_back 的全部调用点按尾部字节分 print / ruby×2 / name / msgsel / selbtn（数目不对或有认不出的调用点就不认）→ 注音函数头里的字段偏移 → add_msg 的调用方（line / namemsg / backlog×2）→ msg::clear 的函数头。没有任何写死的地址 |
  | 签名（原生） | `native/megulithook/SiglusDrawSig.h`，同一算法，纯字节 |
  | 夹具 | `validation/fixtures/engine-sigs/siglus-draw.json`（两个 exe 各 10 段窗口、4000 字节 + 整文件 SHA-256 + 期望值）+ `native/megulithook/selftest/siglusdraw-snippets.h` |
  | 静态签名测试 | `validation/engine-draw-sig-siglus.test.cjs`：夹具上两个版本的函数、调用点、角色、偏移全对；两版地址不同而字段一样；近似字节（括号判断、注音调用点、clear 头、多一个认不出的 push）都不认；本机有 exe 时整段代码给出同样结果 |
  | 原生自检 | `selftest/siglusdraw.cpp`（同一批窗口给 C++ 匹配器）+ `selftest/siglusdraw-gate.cpp`（真 Gate + 真 MinHook 挂在替身 push_back / clear 上，按引擎的调用方式回放一页：台词 + 注音、换行、名字窗、消息里的名字、选项、清屏、回想；验证被挂函数仍拿到自己的参数和寄存器），都在 `selftest/run.cmd` |
  | 运行时钩子 | `native/megulithook/SiglusDraw.h`（`Siglus::attach_function` 成功后 `SiglusDraw::Arm`）：默认不挂，控制文件 `roles=1`（这部游戏 seed 的 `draw.roles`）才在 push_back 和 msg::clear 入口装 MinHook。每个文字区的一行一条 `ToMe_DRAWRUN engine=siglus run= role=line|name|choice|system id=<来源>:<字表地址> n= x0 y0 x1 y1 size= color= [ruby=起:长:读音|…] text=`，清屏一条 `ToMe_DRAWRUN engine=siglus clear id=<字表地址>`（hook-diagnostics.log）。签名没对上写 `off: <原因>` 不挂 |
- 屏幕坐标（第二批，2026-11-21）：
  - 【已核实】msg::frame（CLANNAD 0x5dcd30 / SP 0x5dce80，`ret 0x24`，9 个参数）每帧对每个文字区调一次；mwnd::frame 把 mwnd 的 msg 数组逐个传进来，第 8、9 个参数是这块文字区的偏移（由 mwnd+0x148 / +0x14c 等字段算出，【推测】是窗口位置），第 1 个参数是一个参数块，+0x14 / +0x18 是 float 的 x / y（【推测】父精灵 / 窗口动画的位移）；它算可点字框时用 `(int)param.x + moji.x + 参数8`（`cvttss2si [esi+0x14]; add [moji+0x18]; add [ebp+0x24]`），moji 精灵位置也是 moji.x + 参数8 挂在同一个父精灵下
  - 【推测】这个和就是游戏逻辑画面的坐标（Gameexe `#SCREEN_SIZE`：CLANNAD 1280×960、SP 1920×1080），依据是引擎拿同一个和做鼠标命中框；到窗口客户区还要按实际窗口大小缩放
  - 钩子：msg::frame 入口（可选，签名找不到就不挂、其余照常）。每块文字区的原点稳定 3 帧且变了才报一条 `ToMe_DRAWRUN engine=siglus origin id=<字表地址> ox= oy=`（开窗动画滑动时只报落定的位置），之后这块区域的 run 都带 `ox= oy=`，屏幕 x = x0 + ox
  - 【推测，未查】竖排时引擎把参数8 再减第一个字的字号（`[ebp-0x20]` 那段），只在全局竖排标志 = 1 时走；两部都是横排
  - 选项项（msgsel / selbtn）不是 msg，不走 msg::frame，这一版没有它们的屏幕原点（run 里不带 ox/oy）
- 颜色（第二批）：
  - 【已核实】颜色号 → RGB：引擎的查表函数（CLANNAD 0x5b26b0 / SP 0x5b27f0）= `table[clamp(号, 0, n-1)]`，表是全局 `vector<uint32>`（CLANNAD 0xbac4c0 / SP 0xbad4c0），每项 0xFFRRGGBB，由 Gameexe `#COLOR_TABLE.NNN = r, g, b` 填（解析在 0x69165d，构表在 0x680d10，没写的号是黑色）。签名找到查表函数时 run 带 `rgb=rrggbb`
  - 【已核实】add_msg 选色只有三个来源：mwnd.color 命令（msg+0xfc，-1 = 没设）→ `#CONFIG.MESSAGE_CHRCOLOR.ONOFF` 开时的角色色组（msg+0x164/168/16c，开关是配置项，不是已读）→ 窗口默认（msg+0x24/28/2c = `#MWND.MOJI_COLOR` 等）；moji::frame 只在链接悬停 / 按下时换色（`NORMAL / HIT / PUSH . COLOR`）。这两段代码都不读已读标志
  - 【推测】所以这两部游戏已读 / 未读的字同色（已读只影响快进），阅读层不需要做已读变色；店主测试时对比一句已读和未读的截图确认
  - 两部的 Gameexe（用仓库的 `services/original-engines/siglus-key.cjs` + exe 里的密钥解开，只读）：
    - CLANNAD：`#MWND.MOJI_COLOR = 0`（000 = 255,255,255 白字）、`SHADOW_COLOR = 255` / `FUCHI_COLOR = 255`（255 = 0,0,0 黑影 / 黑边）；其余 001 255,100,100、002 80,255,80、003 100,100,255、004 255,200,200、005 180,255,180、006 220,220,255、050 128,80,90、051 128,128,128、100 255,116,88、101 0,43,152、102 179,14,14、254 255,255,200；MESSAGE_CHRCOLOR 关
    - Summer Pockets：`#MWND.MOJI_COLOR = 0`（255,255,255）、`SHADOW_COLOR = 1` / `FUCHI_COLOR = 1`（0,0,0）；其余 002 255,0,0、003 100,255,100、004 0,0,255、005 255,255,100、006 255,0,255、010 20,150,200、011 52,75,105、020 0,95,104、050 54,46,43、051 4,63,7、100 144,59,79、101 87,99,100、102 写了两次（129,141,142 后 42,73,160；解析按行写进同一格，【推测】后一行生效）、103 87,99,100、104 129,141,142、110 175,183,189、111 89,99,105、200 88,115,121
- 内嵌替换接入点（第二批，只定位，没接）：
  - 【已核实】台词的必经之路：mwnd::add_msg（mwnd.print）先把原句追加进全局字串 `[0xbac458]+0x2fc`（【推测】回想 / 记录用），再调 `msg::add_msg(const wstring& 句子, wstring* 溢出)`（CLANNAD 0x5ddaa0，调用点 0x5de2f8）；add_msg 自己排版、自动换行，写到文字区底（笔位 y ≥ msg+0x130）时把剩下的字存进「溢出」参数返回（已核实）；mwnd::add_msg 看到溢出非空就调 0x64e880（已核实），【推测】由它等翻页后经 `___over_flow_print`（mwnd 元素 57，已核实它也进 mwnd::add_msg）接着排
  - 【已核实】注音是 msg 上的三步：开始 = 引擎自己的 wstring::assign 把读音写进 msg+0x14c、置 msg+0x1a6 = 1（mwnd.ruby(str) → 0x5d8c20）；中间的字照常 add_msg；结束 = 注音排版函数 R（mwnd.ruby() → 0x64f0a0 → 0x5de7a0）。换行 = add_msg 里遇到 0x0a 调的 0x5de520；字号 = msg+0xf0（mwnd.size 改的就是它）
  - 建议（最稳的点）：在 msg::add_msg 入口、且返回地址是 mwnd.print 那个调用点（`A_LINE`，钩子已经能认）时换字——
    1. 只换台词：名字（namemsg / 名字窗）、选项、回想走别的调用点，天然不受影响
    2. 那份全局字串在这之前已经写好原文（已核实顺序），【推测】回想、记录和语音对应都还是日文原句；已读判定按场景位置不按字串，换字不影响（推测）
    3. 排版、换行、溢出换页全由引擎自己做，长句自动进下一页
    4. 做法【推测，未验证】：不改调用方的字符串，在钩子里按段调原函数——日文段直接调原 add_msg；带注音的底字前后包「开始 / 结束注音」（用引擎的 assign 写读音，不自己写字符串内存）；中文段前调一次换行、把 msg+0xf0 临时改小、调原 add_msg、再改回。所有段都传同一个溢出指针
  - 风险【推测】：现有 LunaHook Siglus 写回在更早的 VM 字符串上替换，两条路同时开会换两次，接入时要二选一；中文加进同一块文字区会更早溢出换页（这正是想要的行为，但要店主看一次长句）；把读音写进 msg+0x14c 必须用引擎的 assign（读音超过 7 个字会分配堆内存）
- 没做：按钮 / 系统菜单（Siglus 的系统菜单多是图片按钮，不走 moji，【推测】）；竖排注音（现在只按 x 配底字）

#### 店主测试清单（SiglusEngine：CLANNAD、Summer Pockets）
1. 在 The Seed 里给这部游戏的游戏差分（`The Seed/siglus/clannad/game.json` 或 `summer-pockets/game.json`）把 `"draw":{"roles":false}` 改成 `true`；或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE 或 UTF-8，内容 `#cfg roles=1`）
2. 开游戏，开新游戏推 5 句（带一句有注音的、一句有名字的），出一次选项，开一次回想（backlog）再关掉
3. 看 `logs\hook-diagnostics.log`：
   - 有一行 `ToMe_DRAWRUN engine=siglus on: push … add_msg … clear …`
   - 每句台词有 `role=line id=print:…` 的 run，文字 = 这一行；有注音的那句带 `ruby=起:长:读音`，读音的假名不进 text
   - 名字有 `role=name`（名字窗 `id=name:`，写在消息里的 `id=print:`）；选项每项一条 `role=choice`；回想页是 `role=system`
   - 翻页时有 `clear id=…`，id 和台词 run 的 id 冒号后一样
   - 对话框出现后有一条 `origin id=… ox= oy=`；台词 run 带 `rgb=ffffff ox= oy=`。拿 x0+ox、y0+oy 对一下截图里这句第一个字的位置（按窗口和 #SCREEN_SIZE 的比例缩放）：对得上 = 屏幕原点的推测成立
   - 截一句已读（再读一次）和一句未读的对话框：字色一样 = 「Siglus 没有已读变色」的推测成立
4. 游戏照常显示、推进不卡、不崩、日志不刷屏（同一句不会每帧重复出现，`origin` 只在窗口挪动后出现）= 过
5. 不过时发：`hook-diagnostics.log`（含 `on:` 或 `off:` 那一行）、`hook-events.log`、exe 版本；`off: push count differs` 之类 = 这个版本签名没对上

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
- 版本层：每个 exe 的地址表（模块偏移）写进 `The Seed/mages/<游戏>/versions/<exe sha256>.json` 的 `settings.draw.engineTable`（新键 `draw.engineTable`，默认 null = 只靠签名）：drawDialogue、drawGlyph、commit、clear、pages、stride、chars、scale、layoutCount/Codes/Info、selPage 7、sysSelPage 5、charset（SG = sghd、SG0 / CC = default、LBP = sglbp、MDE = sgmde）、canvas 1920×1080。内核把它写成控制文件一行 `#table mages …`，DLL 用结构签名找；原生只核对表里的 drawDialogue、drawGlyph、commit、pages、stride，clear 等字段仍由签名确定，不是原生整文件 SHA 校验。核对字段不一致就不挂
- 运行时（`native/megulithook/MagesDraw.h`，两个 MAGES 入口都调 `MagesDraw::Arm`：STEINS;GATE 精确适配和上游 MAGES 引擎；同一进程只武装一次）：
  - 默认不挂：仅完整首行 `#cfg` 中唯一的精确 `roles=1` 授权。读实际 UTF16LE（BOM / 无 BOM）控制文件，也保留 ASCII / UTF8 BOM；正文伪 cfg、roles=10、重复键、截断首行不授权。地址表只读正文前的完整元数据，坏表不当作无表。看守线程安装后仍每 2 s 复查，失权 / 不可读 / 文件缺失 / 表不一致就撤销观察，清掉 pending、show、菜单去重和视口缓存；原钩子保留，原调用继续透传。后续授权使用新 epoch，页 seq 不复用旧单位。每个控制刷新另有请求序号，含 off→off；Find / Install 日志重入后的旧请求不能重发旧授权，也不能用外层异常覆盖更新请求的结果
  - commit 前后：前面抄排版缓冲（字码、跳过标记），后面读新加进页的字（字码、框 ×缩放、颜色、标志）→ `ToMe_DRAWRUN engine=mages ev=add page= seq= role=line|choice|system from= n= codes=`（字码含标记）+ `ToMe_DRAWBOX … rects= color= flag=`
  - 清页 → `ev=clear page= seq=`；drawDialogue 第一次画这页 → `ev=show`；drawDialogue 以外的 drawGlyph（菜单、回想、手机……）按调用点成段，内容变了才记一行 `ev=glyph site=<rva> box= size= color=`
  - 每个线程 8 个独立 TLS 返回槽，各有 after-thunk；commit / clear 的原函数不持共享锁，撤权不抹在途真实返回地址，返回后只处理同一授权 epoch 的快照。递归超过 8 槽直接透传；原函数异常越过 after-thunk 的槽不猜测回收，该线程槽耗尽后只透传，直到线程退出。假引擎门验证原结果、GPR、flags / DF、ESP、x87 / MXCSR / XMM；这是微型原生回放，尚非这轮真实游戏验收
  - 撤权是轮询观察边界，不是同步关闭 ACK：已越过最终检查并进入 logger 的一次记录仍可完成；不承诺撤权调用返回后日志已完全静默。若部分 hook 安装失败，保持权限关闭、保留 trampoline 并阻止盲目重试，不卸载仍可能在途的门
- 内核（`core/mages-draw.cjs`，第二批已接进实时流）：`parse` + `PageTracker`（一页在两次清页之间 = 一个单位 page:seq；名字来自 0x8001/0x8002 标记；注音见下）+ `MagesLive`（实时：DLL 记录 → ToMe_CHARS，每个 page:seq 一个固定行号，文字变长就是同一行再报一次；清页或页重新开始时同一行号报一次空记录（协议里的「离开」）；名字 role=name `N:<页>`；选项每页一个 UI 快照（`C:<号>` / `Y<页>:<号>`），清页时空快照）。链路：MagesDraw.h → hook-diagnostics 行 → HookBridge `EngineInfo`（`hookEngineDraw`，自检里有一条）→ `HookNative.magesDraw` → `charRects` → hookCharRects / hookDrawUi。`core/text-paths.cjs` 登记 `engine=mages`
- **画布 → 窗口（静态，5 部一致）**：呈现函数在 Present(NULL,NULL,NULL,NULL) 前，把 16:9 的场景画进后备缓冲：宽铺满、高 = (宽 >> 4) × 9、垂直居中（(高 − 那个) × 0.5）；Present 再把后备缓冲整个拉伸到客户区。所以画布 1920×1080 在客户区的位置 = [0, (bh − h16)/2 × ch/bh, cw, h16 × ch/bh]（`viewport()`，写进 ToMe_CHARS 的 vx..vh）：16:10 全屏上下黑边、超宽屏上下被裁（vy < 0）、后备缓冲和窗口形状不同就被拉伸。后备缓冲尺寸是两个 u16 全局（签名：宽 → `shr 4` → `lea ×9` → 高 → `×0.5` → Present；JS `backbuffer()` / C++ `FindBackbuffer`），DLL 在每页第一帧和每 120 帧读一次，连同游戏窗口客户区报 `ev=view bb= client=`（变了才报）；读不到后备缓冲就按客户区，读不到客户区就交给内核按比例放
- **菜单调用点角色表（推断）**：drawDialogue 以外调用 drawGlyph 的函数里，直接调用次数最多的那个（5 部都是 9 个参数：SG 0x45bc0、SG0 0x62f30、CC 0x73010、LBP 0x4b200、MDE 0x699e0）= LanguageBarrier 的 drawSingleTextLine（系统菜单用）→ role menu；其余（手机、邮件、回想、TIPS、链接高亮）→ role system。根据是参数个数 + 调用次数，不是游戏里的名字。版本层 `menuText: [起, 止]`，`MagesLive.glyphRole(site)`。`ev=glyph` 只有框没有字，所以暂不送进阅读层（只给探针 / diff-maker 用）
- **注音标记（静态核实）**：5 部的 SC3 文本解析器（填排版缓冲的函数）对**每一个** < 0x20 的控制字节先写 `0x8000 + 字节` 进排版缓冲，再按 32 项跳转表分派；0x0A、0x0B 两个分支都推进排版下标（标记保留），并置 / 清同一个局部标志；字形路径看到这个标志为 1 时照样写字形，只是不计入这一行的字数。所以 0x8009 / 0x800A / 0x800B 会作为标记到达 commit，0x800A 和 0x800B 之间的字是排好的注音字（测试逐个 exe 核对）。仍是**推断**的只有一点：0x09 是「注音底字开始」（SC3 / impacto 的 STT_RubyBaseStart；0x09 分支只保留标记）
- **CHAOS;CHILD「一句拆成两句、排版对不上」**：原因是**推断**（没开游戏验证）：串钩子挂在 SC3 解析器上，一句里有等待（SC3 0x03 / 0x0E 等）时会分几次送出，所以一句被拆。画字层上，这几次都是往同一页 commit，中间没有清页；`MagesLive` 给同一 page:seq 同一个行号，后面几段是同一行变长再报，清页时这一行报一次空。回放测试 `validation/engine-draw-mages-live.test.cjs`：三段 commit → 行号都是 1、文字依次变长、清页一次空记录、下一句是行 2；再喂给 OverlayPlacement，看到的是一行在变长，不是两句
- 验证：
  - `validation/engine-draw-sig-mages.test.cjs`：5 个夹具片段、近似字节不命中、店主 5 个 exe（有就跑，SHA-256 对上）整段只命中一次且等于版本层表、Sel/SysSel 的 commit 调用形态、运行时日志回读、控制文件行
  - `native/megulithook/selftest/magesdraw.cpp`：同样的片段给 C++ 匹配器（41 项）
  - `native/megulithook/selftest/magesgate.cpp`：真 MinHook 挂在仿引擎函数上，跑 commit / 两段 commit / 清页 / 选项 / 菜单，检查返回值、栈、记录；输出就是 `validation/fixtures/engine-sigs/mages-draw-log.txt`
  - `native/megulithook/selftest/run-mages-permission.cmd`：真实 JS transport 文件经 production ReadControl 的正反例；`mages-permission.cpp` 两线程错序返回、独立 marker 快照、12 层递归、原函数 SEH / C++ 异常、遗弃槽耗尽、observer 异常 / 重入、original 暂停时 off/on、持续 poll、不可读 / 缺失 / 恢复；commit、四个 clear、两个 dialogue 与 glyph 的实际 MinHook / cdecl / FX 门。手动 `selftest/run.cmd` 已调用，native-builds 中 megulithook 的 `ci:false` 不变，普通 CI 不编跑这些原生门
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

### Unity IL2CPP（原生钩子：角色 + 组件 + 清空，2026-11-21，feat/re-il2cpp）
- 样本（店主本机，只读）：魔法少女ノ魔女裁判（manosaba，GameAssembly.dll x64，metadata v31，Naninovel：GIGA Creation 定制）、海沙风云（x64，metadata v24，Fungus）。逆転検事 1&2（GK12）的 IL2CPP 代码并进了 GK12.exe，整个 exe 加了壳（段名全空、熵 ≈ 8，没有 il2cpp 导出），按规矩不碰这类保护，**跳过**
- 静态：官方 Il2CppDumper v6.7.46（Perfare，`H:\MeguLit-Work\deps\il2cppdumper`，zip SHA-256 f5fc60df…dea2）导出两部的 script.json / dump.cs（放在 `H:\MeguLit-Work\re-il2cpp\dump`，不进仓库）
- 拿字：LunaHook 的 Unity 引擎本来就按名字（il2cpp API）挂了 TMP_Text / TextMeshPro set_text、TextMeshProUGUI.SetText、UI.Text set_text，文字已经是从引擎里读的，不需要地址，也不分版本
- 缺的是角色。做法：在这几个 setter 的回调里，从入口沿 x64 展开信息（GameAssembly 的 .pdata，`RtlVirtualUnwind`）往上走调用帧，**第一帧落在某个框架方法里就按那个方法定角色**；方法范围 = 每个方法起点到下一个方法起点（运行时用 il2cpp API 列出所有类的所有方法指针；离线就是 Dumper 的 script.json）。规则按名字写，同一框架的游戏和版本通用（`native/megulithook/Il2cppDrawRoles.h` = `tools/engine-sigs/il2cpp-text.cjs` RULES，测试逐条比对）：
  - Naninovel：`RevealableText.SetTextValue / set_Text`、打印面板 `SetMessages / AddMessage / AppendText / RevealMessages` → line；`AuthorName*Panel.set_Text`、`RevealableTextPrinterPanel.SetAuthorNameText` → name；`ChoiceHandlerButton.*` → choice
  - Fungus：`Writer.Write` 和它的协程 `<Write>d__N.MoveNext` → line；`SayDialog.SetCharacterName` → name；`MenuDialog.AddOption` → choice
  - 其他调用者 → system（菜单、回想、手机、调试）
- 静态核实的细节：Naninovel 的 `RevealableText.set_Text` 和 `SetTextValue` 都以尾跳结束（`jmp rax`），所以 TMP setter 入口的返回地址已经在打印面板里，规则里加了面板方法；Fungus 的 `TextAdapter.set_Text` 也尾跳到 TMP / UI.Text，返回地址直接是 Writer 或 SayDialog
- 运行时（`native/megulithook/Il2cppDraw.h`，LunaHook unity.cpp 的 MeguLit 副本 `UnityEngine.cpp` 里接入，build-x86/x64.cmd 覆盖拷贝）：
  - 默认不挂：控制文件出现 `roles=1`（这部游戏 seed 里 `draw.roles: true`）才在看守线程里 attach IL2CPP 域、列方法、建范围；之后每次 setter 调用记一行
  - `ToMe_DRAWRUN engine=unity ev=text role=line|name|choice|system kind=tmp|ugui obj=<组件> site=<规则方法 rva> n= text=` / `ev=clear role= kind= obj=`（空串 = 这个组件被清空）；同一组件同一文字只记一次
  - 读串和内嵌写回都照旧（CSHARP_STRING 仍然设着，读法用 LunaHook 自己的 `commonsolvemonostring`）；32 位 IL2CPP 只用返回地址一帧
- 验证：`validation/engine-draw-sig-il2cpp.test.cjs`（规则两边一致、两部夹具的范围和分类、店主 GameAssembly 的导出 / .pdata 函数起点 / metadata 版本、运行时日志解析）；`selftest/il2cppdraw.cpp`（规则和范围，x86 + x64）；`selftest/il2cppgate.cpp`（假 il2cpp API 列真函数，真 x64 回溯：Write → 适配器 → setter = line，SetCharacterName = name，直接调用 = system，清空一次）；私有树编过 LunaHook32/64.dll
- 没做：框（TMP 字形位置要 canvas + 相机，走 BepInEx IL2CPP 插件更合适）；把记录接进内核（和 YU-RIS 一样先进诊断日志，等探针日志配好再接）；Utage 等其他框架的规则（本机没有样本）

#### 店主测试清单（Unity IL2CPP）
1. 在 The Seed 里给 魔法少女ノ魔女裁判（或 海沙风云）的游戏差分设 `"draw":{"roles":true}`，或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，内容 `#cfg roles=1`）
2. 开游戏，新游戏推 5 句（有名字的句子至少 1 句），出一次选项，开一次系统菜单
3. 看 `logs\hook-diagnostics.log`：
   - 有 `ToMe_DRAWRUN engine=unity on: methods=<很多> ranges=<十几>`
   - 台词是 `ev=text role=line`，名字是 `role=name`，选项是 `role=choice`，菜单是 `role=system`
   - 换句时同一个 obj 有 `ev=clear` 或新的 `ev=text`
4. 游戏照常、不卡、不崩，原来的取词 / 内嵌照常 = 过
5. 不过时发：`hook-diagnostics.log` 全文；有 `off: …` 那行一起发

### NeXAS（GIGA）——本机没有样本，跳过
- 找过：E:\GAL、E:\Steam、D/F/H 盘、MeguLit 游戏库：没有 NeXAS 的 exe 或 `PAC\0` 封包（本机的 `PAC ` 封包是 Softpal / Amuse，不是 NeXAS）；H 盘只有一份 BALDR HEART 汉化工具说明，没有游戏本体
- 缺：BALDR SKY（Steam 741140 或 GOG）、BALDR HEART、BALDR FORCE EXE、或其他 GIGA / NeXAS 作品任一部（要 exe + Script.pac / Visual.pac）

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

### CatSystem2（ISLAND 已做，按引擎特征码，2026-11-21）
- 静态结论（只读 `ISLAND.exe`，SHA-256 474cc11d…05f1；`ISLAND_CHS.exe` 是同一份代码、同一地址，只是汉化补丁，不算第二个版本）。本机只有这一部 CatSystem2，别的版本没有实物：下面「其他版本」都是**猜测**，要店主拿别的 CS2 游戏的 exe 跑一次静态测试（`MEGULIT_CS2_EXES`）或者实机日志才算数
- 画字结构：每个字先排成一条「字记录」（ISLAND：步长 0x50，+4 SJIS 字码、+8 填色 RGB、+0xc 描边 RGB、+0x10 x、+0x14 y、+0x1c 字号、+0x34 字形缓存对），再由「逐字合成」把一条记录画到字串表面的原点上，合成里调字体对象的虚函数 1（`kcFontImage_Win` / `_FT`）取字形
  - origin 形（消息窗，`kcTaskStringPlaneNv` 等的更新 → 0x545980）：`x = rec.x + 字形偏移 + ox`，钩子点 0x545aa2
  - direct 形（`kcTaskStringPlane2` 的框，0x543b90，旧钩子说的「语音居中行」直接画那条路）：`x = rec.x + 字形偏移`，原点 0，钩子点 0x543d06
- 签名（`tools/engine-sigs/cs2-draw.cjs` / `native/megulithook/CS2DrawSig.h`，同一算法）：认 `mov eax,[rec+X]; add eax,[esp+bx]; (add eax,[esp+ox];) mov [..],eax; mov eax,[rec+X+4] ...`，前面 0x100 字节内要有 `push [rec+S]; movzx eax,word [rec+C]; push eax; … call [reg+4]`（取字形），颜色从再往前的三连 `movzx byte [rec+K+2/+1/+0]` 读出；字段偏移、记录寄存器、栈槽全从代码里读，不写死地址；被替换的 7 字节里不能有跳转落点。整个 ISLAND 代码段只命中这两处。顺带数两个 LunaHook 记录过跨版本稳定的锚点（剧本文字拷贝 `call; mov esi,buf; mov ecx,eax; sub esi,eax` 0x503aeb，见 LunaHook EmbedCS2 注释里的 Grisaia 1/3、果つることなき未来ヨリ；光栅化跳空格 `cmp r16,0x20 … mov r32,0x8140` 0x53e1fc）
- 角色：钩子点往上扫栈，第一个 vtable 属于已知文字类（或其子类，走 MSVC RTTI 的类层次）的对象就是这段字的主人。ISLAND 里静态确认主人的 this 被下层函数 push 存在栈上（0x4fc2c0 → 0x545700 push edi；0x4fb470 → 0x544220 push edi）。类名是 CS2 框架的（kc*），跨版本应该不变（猜测，ISLAND 一部为证）：
  - `kcTaskStringPlane` / `2` / `Nv` → line；其中「单行、≤12 字、没有句读」且不是上一句台词那块字串板的 → name（**猜测**：有的版本名字和台词可能在同一块板上）
  - `kcFEScriptObjButton` / `kcTaskButton` → ≥6 字 choice，否则 button（**猜测**：选项走不走按钮类要看店主日志的 `cls=`）
  - `kcFEScriptObjString` / `NvString` / `StrTable`、`kcFEScriptObjLogString`、`kcTaskMesList`（回想）→ system；找不到主人 → system、`cls=?`
- 换页 / 清屏：同一个主人从（不晚于）它这页第一条记录重新排、而且文字变了 → `page`（启发式；窗口隐藏没有通用点，ISLAND 仍由精确适配器的 ToMe_DIALOG 报）
- 注音：比这段最大字号小 30% 以上的字是假名注音，只计数 `rb=`，不进文字和框（游戏的注音读法随剧本文字已经拿到：ToMeIslandDraw RubyPairs / LunaHook EmbedCS2）
- 运行时：`native/megulithook/CS2Draw.h`。`CatSystem::attach_function`（所有 CS2）和 `ToMeIslandDraw::Install`（ISLAND 精确适配器）末尾各 `CS2Draw::Arm` 一次（只装一次）；默认不挂，控制文件 `roles=1` 才装 MinHook，只读，不改游戏的画字。一段一条：
  `ToMe_DRAWRUN engine=cs2 run= shape=origin|direct role= cls= owner= rec= n= rb= x0 y0 x1 y1 size= color=rrggbb text=`；`ToMe_DRAWRUN engine=cs2 page owner= cls=`；同一段重画只记一次。origin 形正好一处、direct 形最多一处才挂，否则 `off: N origin / M direct composers`
- 坐标是字串表面像素（记录 x/y + 原点；x1/y1 = 最后一个字的笔位 + 字号），不是屏幕；表面在屏幕上的位置（ISLAND：主人 +0x44c/+0x450）每部游戏由探针 / diff-maker 配进版本层差分
- 没做：一段的最后一个字要等下一段开始才记（和 YU-RIS 一样）；UTF-8 新版 CS2（LunaHook `CatSystem2new`，2019 年后的 cs2.exe）记录里的字码可能是 UTF-16，没有实物没法确认（猜测）；ISLAND 精确适配器（隐藏、换页、语音行）不动，泛化的这一层只上报

#### 店主测试清单（CatSystem2）
1. 在 The Seed 里给 ISLAND（或任何 CatSystem2 游戏）的游戏差分设 `"draw":{"roles":true}`，或临时写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（内容 `#cfg roles=1`）
2. 开游戏推 5 句（要有一句带名字、一句语音居中行）、出一次选项、开一次回想
3. 看 `logs\hook-diagnostics.log`：有 `ToMe_DRAWRUN engine=cs2 on: origin …` 一行（ISLAND 还有一行 `on: direct …`），`classes=` 大于 0
4. 每句有 `ToMe_DRAWRUN engine=cs2 run=… role=line cls=kcTaskStringPlane… text=<这句>`；名字那行 `role=name`；选项 `role=choice`（或 button）带选项文字；回想 `role=system`；翻页时有 `page`
5. 游戏照常显示、不卡、不崩 = 过。没有 `on:` 而有 `off: …composers` = 这个版本签名没对上，把那行和 exe 发来；角色不对（比如名字报成 line、选项 cls=?）就把那几行 `run=` 发来，按 `cls=` 改映射

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

权限回归：运行时只接受 UTF-16LE 首条完整 ASCII `#cfg` 行，支持 transport 的 BOM，且必须只有一个精确的 `roles=1` token
安装与观察分开；安装后仍每 2 秒检查控制文件，关闭、缺失、读失败或畸形授权会在同一把锁内清空未输出文字、连续指针和坐标状态
恢复权限会开启新 epoch，日志回调中的重入 off-on 不能使旧缓冲复活；原 blitter 始终透传，观察器保存 GPR、flags、ESP 和 FXSAVE 状态
已经交给 logger 的记录无法收回，2 秒轮询及临界区完成前也不算同步撤权 ACK；这里没有增加这样的 ACK 协议
`selftest/run-yuris-permission.cmd` 用真实 JS transport 文件、生产读取函数和实际 MinHook CALL 点回放验证这些边界，两架构签名仍用原有实字节夹具
它已接入手动 `selftest/run.cmd`，普通 CI 不编译这份 Windows 原生 gate；上述自检不代表真实游戏验收，也没有新增 seed 或允许名单

1. 获得该游戏版本的实测授权后，才临时开启版本差分中的 `draw.roles`，或写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，首行 `#cfg roles=1`，必须以换行结束）
2. 开游戏推 5 句、出一次选项
3. 看 `logs\hook-diagnostics.log`：有一行 `ToMe_DRAWRUN engine=yuris on: call ...`，之后每句有 `ToMe_DRAWRUN engine=yuris run=` 带这句的文字；名字和选项也各有自己的 run
4. 游戏照常显示、不卡、不崩 = 过。没有 `on:` 行而有 `off: N dialogue loop matches` = 这个版本签名没对上，把那行和 exe 发来
5. 在一段文字尚未输出时关闭 roles，等待轮询确认日志不再新增；恢复后只应看到新文字，不能带回关闭前的半句，再检查锁定或暂时移走控制文件时同样停止观察

## 建议的推进方式

一个引擎一个逆向会话（Opus high），各自 worktree，交付：签名 + 静态签名测试（对店主本机 exe 命中一次）+ 原生自检 + 店主测试清单。顺序：YU-RIS（一个调用点，4 部游戏）→ BGI（素晴日）→ MAGES（已做：对话页 + 提交函数，5 部 Steam 版）→ Siglus（VM 最复杂；签名 + 钩子已做）→ Unity（先解决引用包）

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

**注意：字形缓存（re-bgi 在素晴日 BGI 上确认的情况）**：很多引擎的 GetGlyphOutline / TextOut 调用点在「字形缓存」函数里，一个字只在第一次进缓存时画一次（画在缓存位图的 0,0），之后再显示同一个字不再调用。这种点的记录只有「这次新进缓存的字」，拼不出整句，也没有画布坐标。DrawSites 适合的是每次显示都调用、带笔位的点（AVG32 的 TextOutA 每个字都画进文字 DIB）。AdvHD 与 CMVS 的本机版本已静态确认缓存命中绕过旧点，输入诊断见下节。其余 GetGlyphOutline 签名（Softpal、FVP、minori、Musica、沙耶两版）以及 NScripter 的字形小图都还没确认是不是缓存：实机看同一个字在第二句里还出不出现就知道。是缓存的，就要像 re-bgi 那样往上找排版函数（BGI 的字节点链）再签，GDI 点只留作「字形 → 例程」的旁证

### 给其他逆向会话：GDI 类引擎直接加签名，不要各写一套钩子
BGI、Siglus 等只要画字最终经过 TextOut / ExtTextOut / DrawText / GetGlyphOutline（A 或 W），就复用 DrawSites：
1. **找点**：`node tools/engine-sigs/draw-sites.cjs <exe或dll>` 不带签名时没输出；先用 `node tools/engine-sigs/slot-refs.cjs <文件>` 看这个 API 的 IAT 槽**所有**引用（`FF 15 槽` 是直接调用，`8B xx 槽` 是先装进寄存器，后者要用 SLOT 形式），再对每个点反汇编看是哪一个例程
2. **写一行签名**（`native/megulithook/DrawSitesSig.h` 表里，前面写注释：游戏、文件、地址、例程是什么）：`{ "id", "模块（空=exe）", "API", "调用前的字节，版本间会变的写 ??", 应命中次数, frame }`
   - 直接调用：模式就是 `FF 15` 前面的字节
   - 经寄存器：模式里放 `SLOT`（那 4 字节必须是该 API 的 IAT 槽），站点是模式后紧跟的 `call reg`；MinHook 会连后面一条指令一起搬，别签在跳转目标前
   - frame：例程有 EBP 帧写 1；没有帧写「从 API 第一个参数到例程返回地址的字节数」= 序言的栈深（SEH、sub esp、压的寄存器）+ 4×API 参数个数，用例程在两个不同栈深读同一个参数来核对；不知道写 0（没有 via / fargs）
3. **夹具**：在 `validation/fixtures/engine-sigs/draw-sites-files.json` 加 `{"id","name","path"}`（店主本机文件，只读），跑 `node tools/engine-sigs/draw-sites-fixture.cjs`，生成 JSON 夹具和 `selftest/drawsites-snippets.h`
4. **测**：`node --test validation/engine-draw-sig-sites.test.cjs`（正好命中 count 次、在普查里别的引擎文件中不命中；新引擎的文件也加进 OTHERS）+ `native/megulithook/selftest/run.cmd`（C++ 匹配器 + 运行时门）
5. **店主测试清单**：照上面 AVG32 那条写，行里是 `engine=<id>`
运行时不用改：`DrawSites::Arm()` 在 checkengine 开头对所有签名都找一遍，DLL 晚加载也会重找；64 位见下（x64 门在做）。签名的 id 就是记录里的 engine=，同一引擎多条用 `<引擎>-<用途>`

### ReaLive / AVG32（涙 ～流星のザドル～）
- 点：AVG3216D.EXE 0x413880，例程 0x413730（把一串字画进文字 DIB，一字一次 `TextOutA(hdc, x - 滚动, y, 字, 1|2)`，有 EBP 帧，5 个调用者）。x / y 就是画布笔位
- 另一个 TextOutA（0x41f888）在设置对话框里，不签
- 新版 AVG32（Air 中文版 air_cn.exe）：exe 是 UPX 压缩的，所以普查里看着「导入了 TextOutA 却没有引用」；用官方 UPX 4.2.4（H:\MeguLit-Work\deps）只读解出一个副本（H:\MeguLit-Work
e-copiesir_cn.upx-unpacked.exe，游戏目录不动），同一条签名在 0x4186a4 正好命中一次，是同一个例程。运行时 UPX 会把真正的导入表在内存里原样重建，但 PE 头只列 UPX 自己的几个导入，所以 DrawSites 在头里找不到槽时改按值找（`call [X]` 里 X 的内容等于 TextOutA 的真实地址）。旁边 7 KB 的 avg32_cn.dll 是中文补丁（另一种压缩壳），不画字
- 店主测试清单：
  1. 写 `%TEMP%\MeguLit\draw\<游戏pid>.txt`（UTF-16LE，内容 `#cfg roles=1`），或在 The Seed 里给这部游戏的差分设 `"draw":{"roles":true}`
  2. 开游戏推 5 句、出一次选项
  3. `logs\hook-diagnostics.log` 里先有 `ToMe_DRAWRUN engine=avg32 found: 1 site(s) of TextOutA` 和 `on: site 0`，之后每句有 `ToMe_DRAWRUN engine=avg32 site=0 ... text=` 带这句的文字；名字和选项各自 via 不同
  4. 游戏照常显示、不卡、不崩 = 过。只有 `off: N sites match` = 这个版本签名没对上，把那行和 exe 发来

### Softpal（時計仕掛けのレイライン）
- 点：dll\PAL.dll 0x10008295（`call [IAT]`）和 0x1000897c（另一个字形例程，先 `mov esi, [IAT]` 再 `call esi`），都是 `GetGlyphOutlineA(hdc, 字, GGO_GRAY8, &gm, 0, NULL, &mat)` 量尺寸那次，两条签名 `softpal` / `softpal-2`。都有 EBP 帧（第一次提交时漏了第二个，以为字体类型 4 不走 GDI）
- 没有笔位：位置已经由 Pal.cpp 的 pal_sprite_v1 文字精灵给出，这里补的是「哪段字从哪个例程画出来」（via）
- 店主测试清单：同 AVG32，行里是 `engine=softpal`，`x0=-1`
- 第二部（時計仕掛けのレイライン -残影の夜が明ける時-）的 PAL.dll 两条签名也各正好命中一次，已进夹具；第三部（陽炎に彷徨う魔女）是 KiriKiri，不归这里

### NScripter（月姬 v1.4 / v1.6，两版是同一个 exe）
- 已核实的点：同一 SHA-256 的两份 Tsukihime.exe，字形例程 `0x40eb20` 是 thiscall、10 个栈参数，`ret 0x28`，第一个参数是完整输入字串，有 5 个调用者。现有签名只覆盖 **mode 1** 的 `0x40eefe`，通过 `TextOutA(hdc, x, 0, 字, 2)` 画进字形小图；mode 2 走 `0x40ef87` 等 5 个描边调用，mode 0 走 `0x40f061` / 条件 `0x40f085`，均未签。另 5 个 TextOutA（0x41878a、0x41cb2e、0x41d28d、0x430b31、0x43fad3）在别的例程里，角色也未核实
- 栈修正：3 次 SEH push 共 `0x0c`、局部 `0xfc4`、4 个寄存器共 `0x10`，序言深度为 `0xfe0`。再加 5 个 API 参数 `0x14`，返回地址距 API 首参为 `0xff4`，原 `0xff8` 会把输入字串指针误当返回地址，并使 `fargs` 偏一项。JS 从同一原生签名头读取 frame；真实序言夹具、独立栈模拟和原生 gate 回归检查返回地址及 4 个参数
- 坐标与编码限制：x / y 是字形小图位置；`fargs` 前四项为字串、paint 值和字形尺寸，不能当成页面笔位。第 5 个参数参与从 0 开始的横向步进，页面原点与合成变换、台词/名字/选项角色仍未知。样本 `CreateFontA` 的 charset 为 `0x86`，脚本有中文编码证据；通用 DrawSites 的 CP932 解码不能据此称为本样本已验证。没有启用 seed，没有新增完整输入 observer，也未完成实机验收
- 后续验收清单：先静态追踪调用者的页面合成坐标和角色，再进入全局单游戏实测队列；隐藏桌面验证重复字、模式和角色覆盖。未证明前不写角色或页面坐标，不把一次签名命中当完整逆向

### Innocent Grey（虚ノ少女）：MFC 的 CDC 文字包装
- 点：Innocentsetup.exe 里 MFC 的 CDC::TextOutW（0x41adc7）、CDC::ExtTextOutW（0x41a849）、CDC::DrawTextW（0x41a808），三个都是把参数原样转给 GDI、DC 取 `[ecx+4]` 的薄包装，有 EBP 帧
- 程序经 CDC 画的字都从这里过（游戏自己的界面也是），via 是调用 CDC 的那个游戏例程，用它分台词 / 名字 / 菜单。这段是 MFC 自带代码，别的 MFC 程序也会命中，所以签名名叫 mfc-*，不叫游戏名
- 店主测试清单：同 AVG32，行里是 `engine=mfc-textoutw` / `mfc-exttextoutw` / `mfc-drawtextw`；推一句后看哪个 via 带着台词

### AdvHD / WillPlus（Under The Moon；seed 里的 ディスコード！ 同引擎，本机没有它的 exe）
- 旧点：utmoon.exe 0x40f5d9，只记录完整字符串例程 0x40f2a0 内的缓存未命中字形；0x40f613 是真正栅格化那次，0x40ff0b / 0x40ff3a / 0x40fff0 是 TextOutA 描边。已有 23 个直接调用点，尚未证明涵盖全部文字路径或区分正文、名字、菜单
- 例程没有 EBP 帧：sub esp,0xb8 + 4 个寄存器 + 7 个 API 参数，返回地址在第一个参数上方 0xe4（frame=0xe4）。via = 调用者（台词 / 名字 / 选项 / 菜单各是不同的调用点），没有笔位（x=-1），fargs 里有例程的参数
- ディスコード！ 的 exe 版本不同，签名对不上时会写 `off:`，拿到 exe 再补一条
- 店主测试清单：同 AVG32，行里是 `engine=advhd`
- 输入诊断：`AdvhdDraw.h` 在 0x40f2a0 入口记录 EAX 高度、11 个原始栈参数及 arg7 完整 NUL 字节串。只认可 SHA256 `688b22b4619338fe6db648183e38582e17063e6706c7c11b132124f039ce1dda`、598016 字节、唯一入口及 RVA 0xf2a0；`draw.advhdInput` 默认 false、属于版本层，不依赖 `draw.roles`。它只写 `ToMe_ADVHD_INPUT` 诊断日志，不向 reader 交付正文，不隐藏、不嵌入，保留旧 GDI 路径。ABI、测试命令与六件套剩余门槛见 [re-advhd-input.md](re-advhd-input.md)

### CMVS（青い鳥，Steam）
- 点：cmvs32.exe 0x46145e，字形例程 0x4613b0（EBP 帧，2 个调用者）里每个字一次 `GetGlyphOutlineA(hdc, 字, GGO_GRAY4, &gm, 0, NULL, &mat)`（0x4614b7 是栅格化那次，不签）。字形进 D3D11 纹理，没有笔位，via / via2 是调用者
- 店主测试清单：同 AVG32，行里是 `engine=cmvs`
- 缓存限制已静态确认：0x414010 命中时绕过上述 GDI 点，0x461b20 的度量缓存、0x461bb0 的已有字形参数、0x43abb0 的节点位图也存在复用路径，不能据旧点重组完整画面文字
- 新增 `CmvsDraw.h` 只诊断两个全文绘制入口 0x464850 / 0x465720，二者均为 ECX=this、arg1 完整串、arg2 结构、callee ret8。SHA256 `3a2ec3af6a16a4f36d72faf9e7cb14e2bcc883fbf22fb31da5d69434cc53727e`、1061728 字节、两个唯一 RVA 必须全部验证；`draw.cmvsInput=false` 默认关闭，不授予角色、屏幕坐标、隐藏、嵌入或 reader 原文能力，没有 seed 开启。0x463810 测量入口是负例，不能当作绘制。详见 [re-cmvs-input.md](re-cmvs-input.md)

### FVP（いろとりどりのヒカリ 中文版 Hikari.exe / HD 版 irohika_HD.exe，两个是同一套布局）
- 点：字形例程（Hikari 0x430d10 / HD 0x432790 附近）按第三个参数走两条路：只要 `GetGlyphOutlineA(.., GGO_METRICS, ..)`（Hikari 0x430d6f），或 GGO_BITMAP 先量再画（画那次 Hikari 0x430e2c）。各签一条：`fvp` 和 `fvp-bitmap`
- 例程没有 EBP 帧（ebp 当普通寄存器存第一个参数）：返回地址在 API 第一个参数上方 0x28 / 0x2c。中文版的启动器 五彩斑斓的曙光.exe 只是外壳，钩子在 Hikari.exe
- 字形进 D3D9 纹理，没有笔位；via 是调用者，fargs 是例程参数
- 店主测试清单：同 AVG32，行里是 `engine=fvp` 或 `engine=fvp-bitmap`

### minori（eden*，Steam 英文版）
- 点：eden_en.exe 0x5192ee，字形例程 0x519190（EBP 帧，3 个调用者）里每个字栅格化那次 `GetGlyphOutlineA`（之前 0x5191d8 的量尺寸不签）。字形进 D3D9，没有笔位，via / via2 是调用者
- 这是英文版：台词是英文，日文版 exe 不同，拿到再补签名
- 店主测试清单：同 AVG32，行里是 `engine=minori`

### Musica / ぱれっと（ましろ色シンフォニー）
- 点：mashiroiro.exe 0x459d40。GetGlyphOutlineA 在导入表里，但不是 `call [IAT]`：字形例程 0x459d0b（EBP 帧，2 个调用者）先 `mov edi, [IAT]`，再 `push eax; call edi`，整个程序只此一处。签名用 SLOT 记号（模式里那 4 字节必须是这个 API 的 IAT 槽，站点是紧跟的 `call reg`）；MinHook 会把后面那条 `cmp eax, 1` 一起搬进跳板
- 本机这个 exe 是打过中文补丁的（和 mashiroiro.exe.bak 不同），签名两边结构一样，正式适配时也查原版
- 没有笔位，via / via2 是调用者
- 店主测试清单：同 AVG32，行里是 `engine=musica`

### BRUNS（ダストマニア・グロテスク）
- 点：libscr.dll 0x1011cc5e。gameplay.exe 只有 121 KB，umut.dll 里没有任何文字 API；画字在 libscr.dll 的例程 0x1011ca50（1 个调用者）：建一个 Shift-JIS 字体（CreateFontW）后用 TextOutW 把整串字画进位图
- 例程没有 EBP 帧（SEH + 0x7c 局部 + 4 个寄存器 + 安全 cookie，深 0x9c），返回地址在 API 第一个参数上方 0xb0。x / y 是位图里的位置，fargs 是例程参数
- 本机这份带中文补丁（libchs.dll、解体插入新书中文版.exe），libscr.dll 是否原版自带要拿日文原版对一下；签名只认这个文件
- 店主测试清单：同 AVG32，行里是 `engine=bruns`

### Nitroplus（沙耶の唄 Steam 版）
- 点：Saya_Steam.exe 0x460f87。普查时导入表看着只有 CreateFontW，其实 GetGlyphOutlineW 也在导入表里，只是经寄存器调用：字形例程 0x460d90（EBP 帧，1 个调用者）`push edi; mov edi, [IAT]; call edi`，全程序只此一处（SLOT 形式）。字形进 Mware.dll 的 D3D11 纹理，没有笔位
- 2003 年原版（system.dll，GetGlyphOutlineA ×2、TextOutA ×7，seed 里归 nitropak）和 みにくいモジカの子（Enigma 壳）不在这一条里
- 店主测试清单：同 AVG32，行里是 `engine=nitroplus`

### NitroPlus 2003 原版（沙耶の唄，seed 里的 nitropak）
- 点：system.dll 0x100350cf（saya.exe 只有 44 KB，引擎在 system.dll），字形例程 0x10034fc0 每个字一次 `GetGlyphOutlineA(hdc, 字, GGO_GRAY4, &gm, 0, NULL, &mat)`（0x100351cf 是栅格化那次，不签）
- 例程没有 EBP 帧（SEH + 0xbc 局部 + 4 个寄存器，深 0xd8），返回地址在 API 第一个参数上方 0xf4。system.dll 里另外 7 个 TextOutA（0x100355c0、0x1003a892…）是别的例程，先不签
- 店主测试清单：同 AVG32，行里是 `engine=nitropak`

### Majiro 旧版（ナルキッソス 姫子エピローグ）

本轮是静态逆向与独立原生回放，未启动游戏，未开启任何 seed。样本来自店主授权的浮士德生肉来源，`Narci_himeko.exe` 的 SHA256 是 `45c8a1b5ea39a552629e637e4435b9fa9639978f40f3c164a24867c739d70075`，`scenario.arc` 是 MajiroArcV3.000。当前只有一个版本，不能宣称跨版本覆盖

完整字符串画字函数在 `0x41a660`，cdecl 五参数依次为字体对象、目标、CP932 字符串、输出框和标志。字体对象的 `+0x48/+0x4c` 是画布笔位，`+0x28` 是字号，`+0x38` 只记录为原始 paint 值，其颜色语义还没证明。函数把笔位写入输出框，调用者再按返回宽度推进 x。已定位调用点 `0x41a1b5`、`0x41a29b`、`0x41f554`

这个函数内部有六个 TextOutA 调用，分别处于字形缓存未命中、描边等路径。缓存命中会绕过它们，所以观察完整函数入口。签名要求序言局部栈尺寸、第三参数文本偏移、第一参数字体偏移、字号和输出框笔位写入同时相符，运行时整个映像必须恰好命中一次，否则不装钩子。地址只用于证据，运行时不用固定 RVA

六件套如下

1. `tools/engine-sigs/majiro-draw.cjs`，只读 PE 可执行节，报告候选入口和布局
2. `native/megulithook/MajiroDrawSig.h`，同一套纯结构匹配
3. `validation/fixtures/engine-sigs/majiro-draw.json` 和原生 `majirodraw-snippet.h`，原 exe 的 512 字节、SHA256、入口和参数证据
4. `validation/engine-draw-sig-majiro.test.cjs`，原 exe 唯一命中、损坏布局拒绝、重复命中保留给运行时拒绝、22 个本机其他引擎程序不命中
5. `native/megulithook/selftest/majirodraw.cpp` 与 `run-majiro.cmd`，32/64 位原生签名自检，完整 selftest 入口会调用它
6. `native/megulithook/selftest/majirodraw-gate.cpp`，32 位真实 MinHook 门回放和 64 位空实现，检查五参数、输出副作用、返回宽度、EBX/ESI/EDI、缓存命中也上报、实际调用者和笔位变化

运行时观察层 `native/megulithook/MajiroDraw.h` 读取整串、画布笔位、字号、原始 paint、返回宽度和调用者 RVA，写 `ToMe_DRAWRUN engine=majiro`，保留原函数参数、输出和返回值

默认只扫描，不挂钩子。进程的 draw 控制文件精确包含 `#cfg ... roles=1` 才安装，`roles=0/10` 均不安装。`engine-draw-opt-in.test.cjs` 已包含这个新观察层，没有 seed 获准开启。安装后 watcher 继续每两秒读取控制文件并原子缓存开关。改成 roles=0、删除或无法读取控制文件后，最迟下一次轮询停止捕获和上报，已装 detour 只调用原函数；roles=1 恢复后重新上报，无需反复移钩。绘制函数只读缓存，不访问文件。真实 watcher 门回放覆盖 1→0→1→删除文件，ABI 清理测试另算，不能用手动禁钩冒充产品关闭

它现在只输出诊断，不上报确定角色的 `ToMe_CHARS`，也不隐藏或替换原文

授权只接受第一条完整 ASCII `#cfg` 行中的唯一 `roles=1` token，UTF-16LE 可带 BOM，也保留旧 ASCII/UTF-8 BOM 控制文件；正文中的伪配置、重复键、错误高字节和不完整首行均不授权。真实 JS transport 文件和生产 `RolesAsked()` 经原生自检直接核对。权限关闭再开启会改变 epoch，原函数返回后和转换完成、提交日志前均核对 epoch；下一次绘制仍正常记录。这是轮询式开关，不是同步关闭 ACK，已经通过最终权限检查的在途调用仍可能完成日志，未声称完整 DLL 或真实游戏已验收

后续实机采集须经游戏适配单队列排期，先 MuteProc 再 HidDesk run，并在 finally 关闭自己启动的进程和恢复静音。临时允许名单和 seed 开关只为这一部游戏建立。推进至少 20 句，重复出现相同字验证缓存命中仍完整，分别记录正文、名字、选项、菜单和 ruby，截图与 DRAWRUN 对齐以确定画布原点和角色调用者。观察层开启、关闭都回放原始句序，确认其他游戏不受影响。补第二个 Majiro 版本后才谈泛化；现在不把原生 stand-in 回放当成游戏实测

### 静态做不出签名的（写清缺什么，不硬交）
| 引擎 / 游戏 | 静态看到的 | 缺什么 | 下一步 |
|---|---|---|---|
| Leaf / AQUAPLUS：WHITE ALBUM2（WA2.exe） | 导入表和代码里没有任何 GDI 文字 API，也没有经寄存器的调用；字是 fnt.pak / fon.pak 里的预渲染字库图集，D3D9 + d3dx9_41 画四边形。游戏目录里另有一个 d3d9.dll（中文补丁带的代理） | 送字函数（从剧本串取字 → 查图集 → 出四边形）在哪，只能运行中看 | 位置已经能走现有的层 4 GPU 字形四边形（native/gpuhide）；台词 / 名字 / 选项要在实机里对四边形的纹理坐标找图集查表函数，再出签名 |
| Spike Chunsoft：ダンガンロンパ 1 / 2（DR1_us.exe / DR2_us.exe） | SteamStub 只包了一层：`.text` 熵 6.66，磁盘上就是明文（re-mages 的 tools/engine-sigs/steamstub.cjs 解不出头 = 没加密代码）。没有任何 GDI 文字 API（GDI32 只导入 BitBlt 等 5 个）；DR1 静态链接了 FreeType（sfnt / glyph-dict / FontBBox 等字符串），字用 FreeType 栅格化后经 SDL2 + OpenGL 贴图 | DrawSites 用不上（没有 GDI 调用点）。要找的是 FreeType 的 FT_Load_Glyph / FT_Render_Glyph 在 exe 里的位置和调用它的排版函数 | 照 MAGES 的路子单开一个逆向：用 FreeType 模块表（"truetype" / "sfnt" / "smooth" 等模块名串引用的类结构）定位 FT_Load_Glyph，再往上找排版函数出签名 |
| Spike Chunsoft：ニューダンガンロンパV3（Dangan3Win.exe，x64） | SteamStub + `.text` 熵 8.0（整段加密），GDI32 只导入 GetStockObject，D3D11 | 64 位 SteamStub 解码（steamstub.cjs 只做 x86）；画字同样不走 GDI，64 位 DrawSites 对它没用 | 先给 steamstub.cjs 加 x64 头格式解出代码，再和 1 / 2 一样找字形栅格化函数 |
| Nitroplus：みにくいモジカの子 | **Enigma Protector**（`.enigma1` 熵 7.91），导入表只剩壳自己的几个 | 运行中解开的内存镜像 | 只能实机里用 runtimedump 一类的方式取解开后的镜像；静态不做 |

这四个在静态这一步交不出 6 件套。签名表里没有它们，DrawSites 在这些游戏里什么都不挂

#### 实机采集方案（等店主说「你来测」再跑，不开游戏之前只写方案）
**WHITE ALBUM2（WA2.exe，Leaf，fnt.pak 字库图集 + D3D9）**
1. 照常经 MeguLit 启动，开 LunaHook Leaf 文本钩子（拿当前句的字符串和它在内存里的地址）+ 层 4 GPU 字形四边形记录（native/gpuhide，拿每个字的屏幕框和纹理坐标）
2. 记下 fnt.pak / fon.pak 被读进来后建成的纹理：钩 IDirect3DDevice9::CreateTexture / D3DXCreateTextureFromFileInMemory（d3dx9_41），记录纹理指针和尺寸；游戏目录里的 d3d9.dll 代理先看一眼是谁的（中文补丁？），必要时临时改名让系统 d3d9 生效
3. DrawPrimitiveUP / DrawIndexedPrimitiveUP 时绑定的是字库纹理的那几次：抓 4 层返回地址（栈回溯），按调用点分组 → 候选「画字形四边形」函数
4. 对 LunaHook 给出的字符串地址下硬件读断点（第一字节），第一个读它的函数是排版 / 送字函数；记录它的参数（笔位、窗口号）
5. 结果：送字函数和画字形函数的 RVA、参数布局、调用栈，写进夹具，再按 DrawSites 的写法出静态签名（WA2 不走 GDI，签名要另做一种「函数入口」形式，届时补进表格式）
**ダンガンロンパ 1 / 2（DR1_us.exe / DR2_us.exe，Abstraction 自己的引擎，静态 FreeType + SDL2 + OpenGL）**
结论（2026-11-21，静态）：exe 里有整套 FreeType（truetype / cff / type1 / smooth / autofitter / psaux 模块名都在），字体在 font.pak；导入 glTexSubImage2D，字形增量写进一张纹理图集 = 有字形缓存。FT_Load_Glyph 一层和 BGI 的 GDI 点一样只在字第一次进缓存时调用、没有坐标，所以不在那一层签名；要找的是排版 / 送字函数。exe 里没有可用的字符串锚点，也没有 GDI 调用点，静态从零找风险太高，改在实机上定位：
1. 经 MeguLit 启动 DR1（或 DR2），开 LunaHook 拿当前句的字符串和内存地址
2. 钩 glTexSubImage2D（opengl32）：每次往字库纹理写字形时抓 6 层返回地址 → 字形缓存函数和它的调用者
3. 钩 glDrawArrays / glDrawElements，在绑定的是字库纹理时抓调用栈 → 画字四边形的函数
4. 对 LunaHook 给出的字符串第一字节下硬件读断点：第一个读它的函数是排版 / 送字函数，记录参数（笔位、窗口、字号）
5. 第 2–4 步交叉得到排版函数的 RVA 和参数布局，取调用点前后字节进夹具，再照 MAGES 的六件套出静态签名（DR1 / DR2 各一份，结构应一致）
V3（x64）不在这一步。

**みにくいモジカの子（丑小鸭与文字祸.exe，Enigma Protector）**
1. 游戏启动到标题画面（Enigma 此时已解开代码），用 native/runtimedump 一类的方式只读取出主模块内存镜像（ReadProcessMemory，整段 SizeOfImage），存到 H:\MeguLit-Work
2. 镜像里 IAT 已被填成真实地址或 Enigma 的转发桩：把每个槽的目标对照 gdi32 / user32 导出表解析回 API 名（转发桩要跟一跳）
3. 同时用一个临时 GDI 钩子（GetGlyphOutline / TextOut / ExtTextOut）记录调用者返回地址，换算成镜像 RVA → 画字点
4. 在镜像上用 slot-refs / draw-sites 找这些点的模式；Enigma 会把部分 API 调用改成跳到它自己的桩，签名要能认这种「call 桩」形式，届时补进表格式
5. 镜像不进仓库，只进夹具字节（调用点前后几十字节）+ 主程序 SHA-256
