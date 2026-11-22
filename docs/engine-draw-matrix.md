# 引擎画字函数盘点矩阵（2026-11-21）

新体系（店主 2026-11-21）：MeguLitHook 内核 + 每个引擎逆向「画字函数」（从引擎内部直接读状态）+ 每部游戏一份纯数据差分。这份矩阵是地基的盘点：每个主要引擎现在仓库里有什么、离「引擎内部读」还差什么、先做哪个。统一上报格式见 [engine-draw-protocol.md](engine-draw-protocol.md)

## 两级验收（2026-11-22）

一级要求：本机样本静态区分正文、名字和选项，或样本签名唯一命中；回放夹具和相关测试全绿，全部受版本控制的 JS/CJS/MJS 通过 `node --check`；新增钩子默认不挂且 `engine-draw-opt-in` 通过；合入最新 `origin/main` 后重测再推送

二级实机核实单独排队，不阻塞一级；静态完成不代表隐藏、点读、翻译或清页已实机通过，也不授权开启任何游戏 seed

| 引擎 / 本轮范围 | 一级状态 | 静态证据与回放 | 二级 |
|---|---|---|---|
| Softpal / 既有 Pal 输入回调的有界写回 | 静态完成、待实机 | 本机 LeyLine.exe SHA `9a502090…56ffb77`，既有 host 签名在可执行节唯一命中 RVA `0x25390`；`pal-text-bounds` 原生 27 项、相关 Node 回放与 opt-in 全过；无新增钩子、flag 或 seed | 同版本正文、名字、选项、隐藏十句、点读、译文、翻页与增长拒绝待核实 |
| Unity Mono / KEMCO 原版消息组件诊断 | 静态完成、待实机 | 本机原版 Assembly-CSharp SHA `c4d74235…1dd7314`；八个字段类型及唯一 `Message.Mes(string,bool):string` 静态核对；44 项回放与 opt-in、完整 Mono 插件编译通过；`kemcoSprites:false`，无 seed 开启 | 补丁版 DLL 不在支持范围；完整页来源、名字选项、旧页退休及实际 Reader 待核实；不授予隐藏或 IL2CPP 能力 |
| Siglus / 两个固定 x86 版本的诊断权限与 ABI | 静态完成、待实机 | CLANNAD `1.1.134.0`、Summer Pockets `1.1.137.0` 的完整样本与 fixture 对应；Node 28 项及 x86 控制/真实 MinHook、x86/x64 签名回放通过；默认关闭 | 角色与实际屏幕、隐藏十句、点读、译文、清页及撤权待核实 |
| MAGES / 五个固定 x86 Steam 版本的诊断权限与签名边界 | 静态完成、待实机 | 五份完整 exe 的静态匹配与 x86/x64 扫描器一致；边界、权限及真实 MinHook 回放通过；roles 默认关闭；仅覆盖现有版本表 | 私有副本启动报 Steam `3:0000065432`，待合法可运行入口；不是 MAGES64 或实际隐藏完成 |
| BGI / 素晴日 HD 诊断权限与页面回放 | 静态完成、待实机 | 本机 BGI.exe 的 link/free 签名各唯一命中；18 项 Node 回放、控制及真实 MinHook 门回放通过；默认不挂；不导入旧版无条件 sprite hook | 隐藏桌面 D3D 创建设备失败；ユースティア磁盘签名未命中，未宣称该版本完成 |
| Ren'Py / 8.4 标准 say/menu 的原生脚本修复 | 静态完成、待实机 | 本机自写日文 8.4 样本的名字、正文、选项分开，实际引擎记录可回放；生产脚本控制/还原及相关 22 项测试通过；无 seed 开启 | 仅标准屏幕白盒样本，不代表 Flowers 或任意商业作品；实际 Reader 显示、物理点读和选项译文待核实；混合 RPYC canonical 提取未满足本轮一级，不携带 |
| Majiro / 姫子固定输入签名、权限与消息记录 | 静态完成、待实机 | 本机固定 exe 签名唯一；50 个 MJO 全量严格遍历的 12773 条 message 与未分类 literal 分开；默认 off、权限撤销和原生门回放通过 | 运行时正文/名字/选项、真实画布和 hide/lookup/translation/clear 待核实；literal 不猜作名字或选项 |

KiriKiri 分两条跟踪：普通 KAG3 `processCh` 的角色与内嵌实现已在 main，相关回归本轮 34/34，但完整本机一级证据尚未在本轮签收；柚子社等 `TextRender` 路线的角色、内嵌、清页另需核实，不随 KAG3 一起标完成

实机步骤维护在本机 `H:/MeguLit-Work/night-1423/live-check-queue.md`，每次一级推送的完整 SHA 记入夜间进度

## 状态：已进 main（2026-11-21，4f1cb363），默认不挂

下面各引擎的画字钩子都已合进 main。默认全部不挂：只有这部游戏的 seed 打开 `draw.roles`（MeguLit 写出控制文件 `#cfg roles=1`）才装钩子；现在没有任何游戏 seed 打开它。这一点由 `validation/engine-draw-opt-in.test.cjs` 钉住：钩子只在 `Install()` 里装，`Install()` 只在 roles=1 检查之后调，启动时 `Arm()` 从不挂钩；内核默认不写控制文件；seed 要开得先加进测试里的允许名单

AdvHD、CMVS 与 FVP 输入诊断分别使用独立、默认 false 的 `draw.advhdInput` / `draw.cmvsInput` / `draw.fvpInput`，不授予上段角色或渲染能力，也没有 seed 开启，详见下表及诊断文档

| 引擎 | 部件（native/megulithook） | 状态 |
|---|---|---|
| ReaLive / AVG32（涙、Air） | DrawSites（GDI 画字点）签名 `avg32` | 已进 main，默认不挂 |
| Softpal（レイライン 1 / 2） | DrawSites `softpal`、`softpal-2` | 已进 main，默认不挂 |
| NScripter（月姬 v1.4 / v1.6，同一 exe） | DrawSites `nscripter`（mode 1 字形点） | 默认不挂；页面坐标、角色、mode 0/2 和样本编码尚未验收 |
| Innocent Grey（虚ノ少女） | 旧 `mfc-*` 是补丁安装器界面；游戏实际为 Himorogi/Script/D3D9Font | 私测普通流默认关闭；三次未注入隐藏基线均先在 Himorogi+5a2c 崩溃，无 live 正文；服务回放通过，见 re-iga-runtime.md，不授予画字角色 |
| AdvHD / WillPlus（Under The Moon） | DrawSites `advhd`；AdvhdDraw 输入诊断 | 默认不挂；诊断钉住单一 exe，仅完整原始输入，不授予正文角色、隐藏或嵌入能力 |
| CMVS（青い鳥） | DrawSites `cmvs`；CmvsDraw 双入口输入诊断 | 默认不挂；两个全文绘制入口必须一起通过版本与签名校验，仅原始输入，不支持角色、屏幕坐标或渲染 |
| FVP（いろとりどりのヒカリ / HD） | DrawSites `fvp`；FvpDraw 原始追加诊断 | 默认不挂；两个版本各自 exact pin 单入口，仅追加 raw bytes，不覆盖缓存重绘或正文角色，见 [FVP 诊断交付](re-fvp-input.md) |
| FVP（ヒカリ 中文版 / HD） | DrawSites `fvp`、`fvp-bitmap` | 已进 main，默认不挂 |
| minori（eden 英文版） | DrawSites `minori` | 已进 main，默认不挂 |
| Musica（ましろ色シンフォニー） | DrawSites `musica` | 已进 main，默认不挂 |
| BRUNS（ダストマニア） | DrawSites `bruns` | 已进 main，默认不挂 |
| Nitroplus（沙耶 Steam / 2003 原版） | DrawSites `nitroplus`、`nitropak` | 已进 main，默认不挂 |
| YU-RIS（euphoria 等 4 部） | YurisDraw.h | 已进 main，默认不挂 |
| SiglusEngine（CLANNAD、Summer Pockets） | SiglusDraw.h | 已进 main，默认不挂 |
| MAGES（STEINS;GATE 系、CHAOS;CHILD） | MagesDraw.h | 已进 main，默认不挂 |
| CatSystem2 | CS2Draw.h | 已进 main，默认不挂 |
| BGI（素晴日 HD） | BgiDraw.h（排版字节点链，不用 DrawSites） | 已进 main，默认不挂；ユースティア 要实机扫解开后的镜像 |
| Unity IL2CPP（魔法少女ノ魔女裁判、海沙风云） | Il2cppDraw.h（LunaHook Unity 引擎里看文字 setter，自己不建钩子） | 已进 main，默认不观察 |
| WHITE ALBUM2、ダンガンロンパ 1 / 2 / V3、みにくいモジカの子 | 无 | 没做：静态做不出，实机采集方案见 engine-draw-native.md |
| Silky's、LiveMaker、System4、Escu:de、Kaguya 等 | 无 | 没做：本机没有样本 |

AdvHD 的本机样本已静态确认缓存命中会绕过旧 GetGlyphOutline 点，新输入诊断在缓存判断之前，尚未游戏实测，见 [AdvHD 诊断交付](re-advhd-input.md)。其余 GetGlyphOutline 类签名和 NScripter 字形小图仍需确认缓存覆盖，见 engine-draw-native.md「注意：字形缓存」

CMVS 本机版本同样确认字形、度量与节点缓存会绕过旧点；双入口只交付全文输入诊断，缓存节点重绘覆盖仍未验收，见 [CMVS 诊断交付](re-cmvs-input.md)

## Majiro 本轮交付

旧版 Majiro 六件套已随 `aa22ae6e` 合入 main，双架构 DLL 编译及完整原生自检通过。`MajiroDraw.h` 在字体缓存判断之前观察完整字符串，签名只在本机姫子样本命中一次，22 个其他引擎程序均未命中。默认不挂，没有游戏 seed 开启。真实游戏坐标、角色、注音和译文效果尚未验收，不能据此写“适配完成”。详细证据及下一步见 [engine-draw-native.md](engine-draw-native.md) 的 Majiro 节

## 图例

- **内**：引擎内部读。在引擎自己的脚本层 / 画字函数里拿到（KAG 的 processCh、Ren'Py 的 Layout、RPG Maker 的 Window_Message、TMP 的 characterInfo、ISLAND 的画字调用）。知道是谁在画、画的是什么角色
- **外**：从外面猜。字符串钩子（LunaHook 的流 + ctx2 角色）、GDI/GetGlyphOutline 字形点（①）、假 GPU 字形四边形（层 4）、OCR、按文本长相分类。能拿到，但角色和位置是推出来的
- **无**：现在拿不到
- 难度：S 一两天以内 / M 一周内 / L 要逆向二进制、每个版本不同 / XL 要实物且没公开资料

## 现有部件（native / core）

| 部件 | 是什么 | 层级 |
|---|---|---|
| `native/krkrtext`（MeguLitKrkr32.dll + `script.inc`） | 在游戏线程用 Scripts.eval 跑 TJS，包 KAG MessageLayer.processCh / clear、showLineBreak / showPageBreak、TextRender.done；逐字坐标、颜色、已读、字体；隐藏 = opacity 0 画 | 内 |
| `native/renpytext` + `native/MeguLitRenpy.py` | 在游戏 Python 里包 display_say 和 render_screen，从 Layout 读字形；隐藏 = 该 Text 的 Render alpha 0 | 内 |
| `native/unitytext`（BepInEx 5 插件，Mono + IL2CPP 两版） | 不钩函数，每帧看 TMP_Text / uGUI Text，按 WANT 文本挑对白组件，读 mesh 字框；隐藏 = alpha 0 | 内（组件级，角色靠猜） |
| `core/text-paths-web.cjs` | NW.js / Electron 游戏开 CDP，页面脚本找 DOM 消息容器，getClientRects 逐字；隐藏 = CSS 透明。Canvas 引擎（RPG Maker MV/MZ、PixiJS）只报 `canvas` 然后关掉 | 内（DOM 引擎）/ 无（Canvas） |
| `native/megulithook`（MeguLitHook32，LunaHook 改） | 字符串钩子 + LunaHook 内嵌（Siglus / BGI / YU-RIS / Pal / MAGES 等写回字符串，游戏自己画）；ctx2 报流角色 1 台词 / 2 名字 / 3 其他（`native/EmbedTextPolicy.cs`）；ISLAND（ToMeIslandDraw.h）、STEINS;GATE（MeguLitSg.cpp）、Euphoria HD 474 是按 exe 精确匹配的画字钩子 | 外（流）/ 内（三个精确匹配） |
| `native/fontprobe`、`native/gpuhide` | ① GDI 字形点、层 4 假 GPU 字形四边形，给不走以上路径的引擎找位置和隐藏 | 外（API） |
| `native/runtimedump` | 运行中读出解密后的剧本、语音、CG（KiriKiri TVPCreateStream 等），给离线配对和差分制作 | 内（文件，不是画字） |
| `preserved/source/lunahoook-adapted` | LunaHook 原始源码（含 `lunajspatch.js`：NW.js 游戏的 V8 注入，RPG Maker MV 的 Window_Message / drawText 包装、Tyrano） | 参考 |

## 矩阵

列：拿字 / 坐标 / 名字框 / 选项 / 按钮与菜单角色 / 内嵌替换 / 注音（游戏 ruby）

| 引擎 | 现有 | 拿字 | 坐标 | 名字 | 选项 | 按钮菜单 | 内嵌 | 注音 | 做到「内」还缺什么 | 难度 | 开源可复用 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| KiriKiri 2 / Z（KAG3 processCh 路线） | krkrtext script.inc；默认关闭，生产函数回放 | 内 | 内（逐字，真实屏幕待验） | 内（短层几何启发式，非通用确证） | 内（显式inLink/choice frame优先，不混正文） | 内（ButtonLayer文字caption）；图片菜单无 | 内（既有drawText附绘，撤权还原回放） | 内（当前body ruby→wire→真实Reader）；UI ruby无 | 商业版本10句、名字/选项/图片菜单及实际点读译文待店主；非七格全完成 | M | 固定文件/版本/许可见 side-session-notes/KAG-ruby-result-7ff69e9a.md |
| KiriKiri Z（TextRender 插件，柚子社等） | krkrtext trDone；默认关闭，生产函数回放 | 内（getCharacters） | 内（glyph逐字框/分行）；实机原点待验 | 内（processName/nameLayer，空值退休） | 内（hotspot内字/选择态，混合层保持可见） | 内（既有文字ButtonLayer）；图片菜单无 | 内（既有MessageLayer附绘，非render输入替换） | 无（底字范围未知，无端到端producer） | 本机实际点读/选项译文/清页/OP待店主，静态不是实机 | L | 固定文件/版本/许可见 side-session-notes/TextRender-roles-result-ec6a304b.md |
| Ren'Py | MeguLitRenpy.py | 内 | 内（Layout 字形） | 内（实际 say/who widget，仅隔离 8.4 fixture） | 内（store.menu 与 action 身份，仅隔离 fixture） | 未验证 | 内（Text.set_text，撤权恢复原切片；隔离 fixture） | 内（替换 ruby 标签；非原游戏 ruby 全覆盖） | 真实 Reader 已收 10 句、译文和本地词卡 DOM，但隐藏桌面 front=Foreign 阻止屏上显示，物理点读/选项译文/用户真实游戏仍待验；默认关闭，详见 [实测边界](re-renpy-live.md) | S | Ren'Py 自带翻译框架、unrpyc |
| RPG Maker MV / MZ | CDP实际注入 `core/text-paths-rpgm.cjs`；默认不包函数，明确draw.roles/embed才安装；**候选；MZ本机静态正文已核，MV单EXE正文仍缺** | 内（Window_Message内容Bitmap，VM回放） | 内（字体格四角、PIXI仿射/frame、CSS/DPR；非字形墨迹，待实机） | 内（标准MZ Window_NameBox）；无（MV非标准名字插件） | 内（Window_ChoiceList文字项/选中态，VM回放） | 内（Window_Command的_list及数据项name；图片按钮/自绘菜单无） | 内（本窗口追加中文/注音，超时或未实际应用回阅读层；VM回放） | 无（游戏原有ruby未读）；内（生成读音绘制，VM回放） | MZルイーゼ真实reader提取2238正文/203选项，未运行；MV包装尚未读到目录正文；二级核分页、缩放滚动、点读、名字与选项及插件兼容；原生lunajspatch资源未改/未重编译 | S | 有序审计版本及许可见分支result.md；MV官方corescript和MZ官方Window.js仅参考API，未复制第三方代码 |
| RPG Maker VX Ace / VX / XP | rgss.cjs 只读剧本；固定魔女の家 VX 1.09a 增加默认关闭的副本观察 | 内（固定 VX Window_Message；pause 时提交来源，回放通过）/ 其他版本仍外 | 内（字体单元逻辑坐标，非墨迹验收） | 无 | 内（固定 VX Window_Choice，回放通过） | 内（Selectable/Help 文字框，回放通过） | 无 | 无 | 固定 exe/DLL/脚本表匹配，原 Main 前缀加载；原版 Ruby、Win32API 与真实 Reader 待验。XP/Ace 仅正文候选与 Ruby 4 API 回放，未开放游戏加载，完整七项未完成，见 [范围与验收](engine-rgss.md) | M | LunaHook/VNR 仅概念参考；真实 VX 插件类与完整归档静态核对，无新第三方代码复制 |
| TyranoScript | text-paths-web（DOM，静态/替身单测） | 内（当前消息层，过滤未显现字和描边副本） | 内（Range.getClientRects，DPR/换行） | 内（`.chara_name_area` / 配置名字区） | 内（`.glink_button` / event-tag glink/link） | 图片按钮未覆盖；旧 text-class 兼容保留 | 内（DOM ruby+中文，撤权恢复；混合链接不替换） | 保留原生 ruby、字典不覆盖；未把原生读音传给 Reader | 无本机样本，实际隐藏、点读、译文、清页待店主；七格不计全内，见 [限定报告](engine-tyrano/result.md) | S | TyranoScript 自定义条款（不是本体 MIT）；Luna GPL 仅思路参考，无新复制 |
| Artemis | LunaHook（Artemis 钩子 + 内嵌） | 外（流） | 外（GPU 四边形 / 字形点） | 外（ctx2） | 外 | 无 | 外（LunaHook 写回字符串） | 无 | 引擎是 Lua：找到 lua_State 后调 Lua 包 `e:tag` 文本函数；或按 Artemis「散文件优先于 pfs」的加载规则放影子目录脚本（不碰游戏目录） | L | artemis 解包工具、LunaHook Artemis 钩子 |
| Unity | unitytext（BepInEx，Mono / IL2CPP） | 内（组件） | 内（TMP characterInfo / TextGenerator） | 无 | 无 | 无 | 无（alpha 0 隐藏） | 无 | 组件角色：按挂的 Button / Toggle / Selectable 判按钮，按框架（Utage / Naninovel / ADV 自研）判名字和选项；内嵌 = 改 TMP.text（加 `<size>` 行和 ruby 标签） | M | XUnity.AutoTranslator（文本替换、TMP 字体、各 UI 框架钩子）、BepInEx、Il2CppInterop |
| SiglusEngine | megulithook Siglus.cpp（LunaHook 内嵌 + ctx2）+ SiglusDraw.h（画字签名，默认关） | 内（moji push_back，seed draw.roles 开） | 内（文字区像素 + msg::frame 屏幕原点 ox/oy，推测是 #SCREEN_SIZE 坐标） | 内（名字窗 / 消息里的名字） | 内（mwnd.sel / selmsg / selbtn 的项） | 无（系统菜单是图片按钮） | 外（写回 role=1 的流，游戏自己画） | 内（mwnd.ruby 的读音 + 底字范围） | 选项项的屏幕原点；内嵌（接入点已定位：msg::add_msg 的 mwnd.print 调用，按段调原函数 + 引擎 ruby 开始/结束）；颜色号 → RGB 已做（rgb=） | L | SiglusSceneScriptUtility（元素号）、SiglusExtract、LunaHook Siglus |
| BGI / Ethornell | megulithook BGI.cpp（内嵌 + 选项流） | 外（流） | 外（字形点） | 外（ctx2） | 外 | 无 | 外（写回） | 无 | 引擎画字函数（按版本签名）；BGI 选项是独立流已有 | L | BGIKit、LunaHook BGI |
| CatSystem2 | ISLAND 精确匹配画字钩子（ToMeIslandDraw.h，含 ruby、隐藏）；所有 CS2：CS2Draw.h 按特征码挂逐字合成（engine=cs2 DRAWRUN，draw.roles 才挂） | 内 | 内（字串表面坐标 + 字号 + 颜色） | 内（主人 RTTI 类 + 单行启发，猜测） | 内（按钮类，猜测） | 内（按钮类，猜测） | 无 | 内（ISLAND）/ 计数 rb= | 其他 CS2 版本只有 ISLAND 一部实物，要别的 cs2.exe 跑 MEGULIT_CS2_EXES 静态测试；表面 → 屏幕偏移进版本层差分 | L | LunaHook CatSystem（EmbedCS2 / cs2 锚点）、MSVC RTTI |
| SiglusEngine | megulithook Siglus.cpp（LunaHook 内嵌 + ctx2） | 外（流，角色 1/2/3） | 外（字形点） | 外（ctx2=2） | 外（ctx2=3 混着系统串） | 无 | 外（写回 role=1 的流，游戏自己画） | 无 | 画字函数（文字精灵生成）要按版本找签名；选项和系统串要从 ctx2=3 里拆 | L | SiglusExtract、SiglusTools、LunaHook Siglus |
| BGI / Ethornell | megulithook BGI.cpp（内嵌 + 选项流） | 外（流） | 外（字形点） | 外（ctx2） | 外 | 无 | 外（写回） | 无 | 引擎画字函数（按版本签名）；BGI 选项是独立流已有 | L | BGIKit、LunaHook BGI；2026-11-21 re-bgi：排版字节点链钩子 `BgiDraw.h`（素晴日 HD，逐行 DRAWRUN：画布坐标 / 颜色 / via 调用链，角色靠版本层 `draw.viaRoles`；ユースティア 加壳，见 engine-draw-native.md） |
| CatSystem2 | ISLAND 精确匹配画字钩子（ToMeIslandDraw.h，含 ruby）；其他 CS2 走 LunaHook + cs2 屏幕协议 | 内（ISLAND）/ 外 | 内（ISLAND）/ 外 | 外 | 外 | 无 | 无 | 内（ISLAND） | 把 ISLAND 的画字钩子按特征码泛化到其他 cs2.exe 版本 | L | CatSystem2 工具（cstl / cst 解包）、LunaHook CS2 |
| YU-RIS | megulithook Yuris.cpp（内嵌 + 选项） | 外（流） | 外（字形点） | 外 | 外（独立选项流） | 无 | 外（写回） | 外（Yuris ruby 串） | YU-RIS 画字（ESC 码解析后的字形函数）签名；按钮多是图片 | L | YurisTools、yu-ris 解包 |
| AdvHD / WillPlus | LunaHook（只读流 + flush 延迟）；Euphoria HD 474 精确匹配画字 | 外 / 内（474） | 外（字形点）/ 内（474） | 外 | 外 | 无 | 无（只读） | 无 | 泛化 474 的画字钩子；AdvHD 的 .ws2 VM 文本函数 | L | AdvHDTools、ArcUnpacker、LunaHook WillPlus |
| Majiro | LunaHook + MajiroDraw.h（旧版完整字符串画字观察层） | 内（传入画字函数的 CP932 整串，静态与回放） | 内（font 笔位，画布坐标，待实机） | 外 | 外 | 无 | 外（既有 LunaHook 写回） | 无 | 真机区分角色、坐标原点和 paint 含义；第二版本；接入实时角色协议 | L | LunaHook Majiro、majiro-tools / mjotool、VNTranslationTools |
| QLIE | LunaHook | 外 | 外（字形点） | 外 | 外 | 无 | 外 | 无 | Delphi 引擎，画字在 TQLIE 文本对象里；要按版本找 | L | QLIE 解包（qlie-tools）、LunaHook |
| Malie | LunaHook（内嵌） | 外 | 外（GPU 四边形） | 外 | 外 | 无 | 外 | 无 | Malie 自绘字体，画字函数在 exe 内；Camellia 密钥已有 | L | MalieTools、LunaHook Malie |
| Softpal / Pal | megulithook Pal.cpp（内嵌 + ruby + pal_sprite_v1 坐标通道） | 外（流） | 内（pal_sprite_v1 文字精灵） | 外 | 外 | 无 | 外（写回） | 外 | 精灵通道加角色字段；选项精灵 | M | SoftpalTools、LunaHook Pal |
| MAGES. | MagesEngine.cpp + mages/（SC3 解码含 ruby）；STEINS;GATE 精确匹配；**MagesDraw.h（对话页 + 提交函数，5 部 Steam 版，签名 + 版本层表，默认不挂）** | 内（对话页字码）| 内（页数组 ×缩放，1920×1080 画布）| 内（0x8001/0x8002 标记）| 内（Sel 第 7 页 / SysSel 第 5+w 页，标志字节 = 选项号）| 外（菜单走 drawGlyph 调用点，角色表待探针）| 内（SG）| 内（SC3 ruby；画字层注音标记为推断）| 画布 → 屏幕偏移、接进 hook-native 实时流、内嵌 | M | Committee of Zero 的 LanguageBarrier、impacto（opcode 表、页结构）|
| NScripter / ONScripter | LunaHook | 外 | 外（NScripter GDI 字形点；ONScripter 是 SDL_ttf → 无） | 无 | 外 | 无 | 外 | 无 | ONScripter-jh 是开源引擎，可按源码定位画字；原版 NScripter 闭源 | M（ONS）/ L（NS） | ONScripter-jh 源码、nscripter 解包 |
| LiveMaker | LunaHook | 外 | 外（GDI 字形点） | 无 | 外 | 无 | 外 | 无 | LSB 二进制 + Delphi 画字；pylivemaker 能读 LSB 定位文本节点 | L | pylivemaker |
| Escude | LunaHook | 外 | 外（字形点） | 外 | 外 | 无 | 外 | 无 | ESCR VM 文本函数 | L | EscudeTools、escude.cjs（本仓库读剧本） |
| CIRCUS | LunaHook | 外 | 外（GDI 字形点） | 外 | 外 | 无 | 外 | 无 | MES VM（31 个版本操作码表已在 circus.cjs）里的文本 / 选项操作码处理函数 | L | msg-tool、CircusTools |

通用开源（跨引擎）：LunaHook（大部分引擎的流钩子 + 内嵌写回）、Textractor（H-code 钩子）、VNTextPatch / VNTextProxy（arcusmaximus：GDI 引擎的内嵌替换 + 比例字体代理 DLL，Majiro / CIRCUS / LiveMaker / QLIE 这类 GDI 引擎内嵌最直接的参考）、XUnity.AutoTranslator（Unity）、GARbro（解包）

## 结论：先做哪个

收益 = 发行量 × 现在缺的程度 ÷ 难度

1. **KiriKiri processCh 路线**（7285 日文发行，已经在引擎内部，只差角色和内嵌）：已做（ecc1e0b7），默认关，等实机
2. **RPG Maker MV/MZ**（S）：CDP候选实现见core/text-paths-rpgm.cjs，默认关；VM回放覆盖坐标、角色、分页和撤权，但缺本机真实正文，不能标一级完成；游戏原有ruby读取也未完成
3. TyranoScript（S，DOM 已在，只差角色和 DOM 内嵌）、Ren'Py（S，有官方翻译钩子）：同一套协议，下一批
4. Unity（M，组件已在内部，角色靠框架）
5. 其余（Siglus / BGI / YU-RIS / AdvHD / Majiro / QLIE / Malie / Escude / CIRCUS / LiveMaker / NScripter / Artemis）是 L：每个要逆向二进制画字函数、按版本签名。共同的捷径是 GDI 引擎走 VNTextProxy 那条「代理 GDI + 写回字符串」的路，角色继续用 LunaHook 的 ctx2，坐标继续用字形点；真正的「内」要一个引擎一个会话

## 其余原生引擎：静态普查（re-misc，2026-11-21）

只读店主本机的 exe / dll，没开游戏（`H:\MeguLit-Work\tools-re\census.py`：pefile + capstone，数导入表里文字 API 在代码中的 call 数，各节熵值，壳的特征）。按 The Seed 里的游戏数从多到少排，同数的按难度排。原始数据在 `tools-re\census-misc.jsonl` / `census-extra.jsonl`

| 引擎（seed 数） | 游戏 / 文件 | 画字所在模块 | 位数 | 文字 API 调用点 | 图形 | 壳 | LunaHook 现有 | 难度 |
|---|---|---|---|---|---|---|---|---|
| Spike Chunsoft（3） | ダンガンロンパ 1 / 2 / V3（Steam） | DR1_us.exe / DR2_us.exe / Dangan3Win.exe | x86 / x86 / x64 | 导入表里没有文字 API | D3D9（1/2）、D3D11（V3） | **SteamStub `.bind`**，V3 的 `.text` 熵 8.0 = 整段加密 | Chunsoft.cpp（x64，78 行） | 难：静态看不到代码，要先脱 SteamStub（Steamless 类工具，只读出一个解开的副本）再找自绘字库 |
| NScripter（2） | 月姬 v1.4 / v1.6 | Tsukihime.exe（两版同一 exe，400 KB） | x86 | TextOutA ×8、CreateFontA ×13 | GDI DIB（BitBlt / StretchDIBits） | 无 | Onscripter 系（对 NScripter 本体只有通用 GDI） | 只核实 mode 1 字形点和栈布局；页面笔位与台词 / 名字 / 选项角色未证明 |
| FVP（2） | いろとりどりのヒカリ（中文版）/ HD | Hikari.exe（中文版启动器 五彩斑斓的曙光.exe 只是外壳）/ irohika_HD.exe | x86 | GetGlyphOutlineA ×3、CreateFontA ×1 | D3D9 | 无 | FVP.cpp | 中：3 个字形调用点，字形进 D3D9 纹理，坐标在上层排版 |
| Nitroplus（2） | 沙耶の唄（Steam）/ みにくいモジカの子 | Mware.dll（Steam 版）/ 丑小鸭与文字祸.exe | x86 | Steam 版：Mware.dll 只有 D3D11，exe 只有 CreateFontW ×2；モジカ：没有可见导入 | D3D11 | モジカ：**Enigma Protector**（`.enigma1` 熵 7.91） | Nitroplus.cpp / Nitroplus2.cpp | 难：沙耶 Steam 是自绘字库（字形不走 GDI）；モジカ有壳，静态做不了 |
| Softpal（1） | 時計仕掛けのレイライン | dll\PAL.dll | x86 | **GetGlyphOutlineA ×1**、CreateFontA ×1 | GDI DIB | 无 | Pal.cpp（本仓库已改：内嵌 + ruby + pal_sprite_v1） | 易：唯一一个字形调用点，和 YU-RIS 一样做锚 |
| ReaLive / AVG32（1） | 涙 ～流星のザドル～（1997） | AVG3216D.EXE（222 KB） | x86 | TextOutA ×2、CreateFontIndirectA ×1 | GDI DIB | 无 | Reallive.cpp | 最易：2 个调用点，exe 小 |
| CMVS（1） | 青い鳥（Steam） | cmvs32.exe | x86（带 `_TEXT64` 节） | GetGlyphOutlineA ×2、CreateFontA ×4 | D3D11 | 无 | CMVS.cpp | 中：2 个字形调用点，D3D11 合成 |
| Musica / ぱれっと（1） | ましろ色シンフォニー | mashiroiro.exe | x86 | 只有 CreateFontA ×1（字形 API 不在导入表：运行时 GetProcAddress 或自绘） | DirectDraw | 无 | Palette.cpp | 中：先找动态取的 API |
| minori（1） | eden*（Steam 英文版） | eden_en.exe | x86 | GetGlyphOutlineA ×3、CreateFontA ×2 | D3D9 + DirectDraw | 无 | Minori.cpp | 中 |
| Leaf / AQUAPLUS（1） | WHITE ALBUM2 | WA2.exe | x86 | 没有任何 GDI 文字 API | D3D9 + D3DX（自绘字库） | 无 | Leaf.cpp | 难：和 MAGES 一样是字库图集，要找送字函数 |
| Innocent Grey（1） | 虚ノ少女 | 虚ノ少女.exe（231936B）+ plugin/Himorogi.dll、Script.dll、D3D9Font.dll | x86 | 字体插件 GetGlyphOutlineW ×3；EXE 无正文文字 API | D3D9 | 普通 PE | 私测 IGA_Text 候选 | 原 MFC 三点属于补丁安装器，不能证明正文 |
| BRUNS（1） | ダストマニア・グロテスク | gameplay.exe（121 KB 启动）+ umut.dll + libscr.dll | x86 | umut.dll 没有文字 API；libscr.dll TextOutW ×1（中文补丁的库） | GDI DIB | 无 | Bruns.cpp | 中：画字可能在中文补丁库里，原版走自绘 |
| AdvHD / WillPlus（1） | Under The Moon（seed 里是 ディスコード！，本机只有同引擎的 utmoon.exe） | utmoon.exe | x86 | GetGlyphOutlineA ×2、TextOutA ×3、CreateFontIndirectA ×1 | DirectDraw | 无 | WillPlus.cpp（本仓库另有 Euphoria HD 474 精确匹配） | 易 |

做的顺序（从易到难，每个引擎一个提交，交付照 YU-RIS 样板的 6 件套：JS 签名、原生签名头、夹具、静态签名测试、原生自检、运行时钩子 + 店主测试清单）：
1. ReaLive / AVG32 → 2. Softpal PAL.dll → 3. NScripter（月姬）→ 4. Innocent Grey → 5. AdvHD / WillPlus → 6. CMVS → 7. FVP → 8. minori → 9. Musica → 10. BRUNS → 11. Leaf WA2 → 12. Nitroplus（沙耶 Steam / モジカ）→ 13. Spike Chunsoft

后 4 个（Leaf、Nitroplus、Spike Chunsoft、BRUNS 原版）静态普查已经说明拿不到 GDI 调用点：自绘字库或加壳，要在运行中找送字函数或先脱壳，单靠静态做不出签名，做到时会先写清缺什么，不硬交

进度（feat/re-misc，已进 main 4f1cb363，默认不挂）：通用 GDI 画字点部件（native/megulithook/DrawSites.h + DrawSitesSig.h）已交付，签名已有 ReaLive / AVG32、Softpal（两条）、NScripter、Innocent Grey（MFC CDC 三条）、AdvHD、CMVS、FVP（两条）、minori、Musica、BRUNS、Nitroplus（沙耶 Steam）、NitroPlus 2003（沙耶原版），每条在店主本机文件上正好命中、在其他引擎文件里不命中。普查时漏看了「经寄存器调用」的情况：Musica、沙耶 Steam、Softpal 第二条都是这样找到的（签名的 SLOT 形式）。Leaf、Spike Chunsoft、モジカ 静态做不出，见 engine-draw-native.md 末尾

## 下一批（总指挥 2026-11-21）：本机样本

只读查了 E:\GAL、E:\Steam\steamapps\common、H:\、D:\（4 层深，按引擎特征文件 / exe 名：AI5WIN / AI6WIN、mes.arc、live.dll / .lsb、Rio.arc / Chip.arc、System40 / .ain、Escu:de 的 .bin 包、Kaguya 的 params.dat / LINKPACK / .alp）：

| 引擎 | 本机样本 | 结果 |
|---|---|---|
| Silky's（AI5WIN / AI6WIN） | 没有 | 跳过；要一部 Silky's 作品的 exe |
| LiveMaker | 没有 | 跳过；要一部 LiveMaker 作品的 exe（游戏数据附在 exe 末尾） |
| Will（ADV 引擎，Rio.arc / Chip.arc） | Under The Moon（已签，advhd）；いじわるMyMaster（mymaster.exe 是 AlphaROM 加壳，导入表空，静态看不了） | 没有新签名；いじわるMyMaster 要运行中解开的镜像 |
| AliceSoft System4 | 没有 | 跳过；要一部 System 4.x 作品的 System40.exe |
| Escu:de | 没有 | 跳过；要一部 Escu:de 作品的 exe |
| Kaguya（アトリエかぐや） | 没有 | 跳过；要一部かぐや作品的 exe |

顺带核对的：時計仕掛けのレイライン 2 的 PAL.dll 两条 Softpal 签名各正好命中一次（已进夹具，413e0cc5）；レイライン 3 是 KiriKiri。Air 的 avg32_cn.dll 导入了 TextOutA 但代码里没有对它 IAT 槽的引用（经别的跳板调用），新版 AVG32 要另看。

## 普查还没覆盖的引擎

| 引擎 | 本机样本 | 备注 |
|---|---|---|
| Silky's AI5WIN / AI6WIN、LiveMaker、AliceSoft System4、Escu:de、Kaguya | 无 | 见上表 |
| Majiro | ナルキッソス 姫子エピローグ，Narci_himeko.exe，MajiroArcV3.000 | 完整字符串画字 0x41a660 的结构签名 + 默认关闭观察层 + 32/64 位独立回放已完成；只有一版样本，未实机，不开 seed |
| QLIE | 无 | Delphi，画字在 TQLIE 文本对象 |
| Malie | 无 | 自绘字库，类似 MAGES |
| CIRCUS | 无 | MES VM，GDI 字形点 |
| EntisGLS（Entis） | 无 | |
| SystemNNN、ExHIBIT、Ikura GDL、rUGP（âge）、AGE System | 无 | |
| RealLive / AVG32 新版（Air） | 有（Air） | 已做（07c599da）：air_cn.exe 是 UPX 压缩，不是绕 IAT；解压副本上原有 avg32 签名正好命中一次，运行时按值找 IAT 槽 |
| Leaf（WHITE ALBUM2）、Spike Chunsoft（ダンガンロンパ 1 / 2 / V3）、みにくいモジカの子 | 有 | 静态做不出，实机采集方案见 engine-draw-native.md |
| Unity Naninovel（夏色四叶草）、Unity（デスマッチラブコメ！） | 有 | 归 Unity 组件路线（unitytext），不是原生画字 |
| BGI、Siglus、MAGES、CatSystem2 | 有 | re-bgi / re-siglus / re-mages / re-cs2 在做 |

## 两部 Unity 走 unitytext 还缺什么（静态，2026-11-21）

unitytext（`native/unitytext/MeguLitUnityText.cs`，BepInEx 5 Mono 插件）看的是 TextMeshPro `TMP_Text` 和 uGUI `UnityEngine.UI.Text` 组件；隐藏 = 组件 alpha 0，内嵌 = 换组件的文字

| 游戏 | Unity / 运行时 | 文字组件 | 缺什么 |
|---|---|---|---|
| 夏色四叶草 Summer Clover（官方中文版 1.10） | 2020.3.48f1，Mono（MonoBleedingEdge，Managed 齐全，可直接用 BepInEx 5 Mono 插件） | Naninovel：`NaninovelTMProText` / `RevealableTMProText`（都是 TMP_Text 的子类，插件现有的 TMP 路线能看到） | 1. 这是官方中文版：游戏画的是中文，要先看 Naninovel 的本地化里有没有日文（Naninovel 按 locale 切换脚本），没有就没有日文原文可读；2. Naninovel 的逐字显示是 `TextRevealer` 每帧改顶点颜色，不是 maxVisibleCharacters：插件的「打字机走完放开 maxVisibleCharacters」和「alpha 0 隐藏」可能被它每帧覆盖，要在实机里看一次；角色识别已有 Naninovel `ChoiceHandlerButton` / `AuthorNamePanel` |
| デスマッチラブコメ！（KEMCO，Steam） | 2019.2.15f1，Mono | 没有 TextMeshPro；Assembly-CSharp 里是 `MESBOX_WINDOW`、`messageSprite`、`fontSprite`、`TextMesh`、`RUBY` / `rubyObject` / `CalculateRubysize`：对白很可能是引擎自己用字体精灵（或旧的 3D `TextMesh`）拼出来的，带自己的注音 | 1. 插件不认 `TextMesh`（旧 3D 文字）和精灵拼字，需要在 Build 里加 `UnityEngine.TextMesh` 一类，或者对精灵拼字的游戏走另一条（读 `MessageText` / `MessageBuffer` 的字符串 + 精灵的屏幕位置），哪一种要实机看对白挂的是什么组件；2. 目录里有「汉化补丁备份\DMLC汉化补丁.zip」：现在装的是中文补丁，要用备份恢复日文原版文件再测 |

两部都不需要 IL2CPP，现有 Mono 插件能装；静态这一步没有可交的代码，缺的都要实机确认（组件类型、Naninovel 逐字显示和 alpha 的冲突）
