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

一个引擎一个逆向会话（Opus high），各自 worktree，交付：签名 + 静态签名测试（对店主本机 exe 命中一次）+ 原生自检 + 店主测试清单。顺序：YU-RIS（一个调用点，4 部游戏）→ BGI（素晴日）→ MAGES（泛化已有钩子）→ Siglus（VM 最复杂；签名 + 钩子已做）→ Unity（先解决引用包）
