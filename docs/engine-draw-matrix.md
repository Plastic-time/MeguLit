# 引擎画字函数盘点矩阵（2026-11-21）

新体系（店主 2026-11-21）：MeguLitHook 内核 + 每个引擎逆向「画字函数」（从引擎内部直接读状态）+ 每部游戏一份纯数据差分。这份矩阵是地基的盘点：每个主要引擎现在仓库里有什么、离「引擎内部读」还差什么、先做哪个。统一上报格式见 [engine-draw-protocol.md](engine-draw-protocol.md)

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
| KiriKiri 2 / Z（KAG3 processCh 路线） | krkrtext script.inc | 内 | 内（逐字） | 无（<20% 屏高的层直接丢） | 无（link 里的字混进台词） | 无 | 无（只有 opacity 0 隐藏 + 叠加层） | 无（KAG [ruby] 被一起隐藏，不上报） | 名字层按角色报；`inLink` 期间的字按 link 分组报 choice；ButtonLayer.caption 报 button；用 MessageLayer 自己的 drawText + rubySize/rubyOffset 画注音和中文（本分支做） | M | KAG3 源码（MessageLayer/KAGWindow 公开）、KirikiriTools（arcusmaximus，补丁 xp3 加载）、KrkrExtract、krkrz 源码 |
| KiriKiri Z（TextRender 插件，柚子社等） | krkrtext trDone | 内 | 内（getCharacters） | 无 | 无 | 无 | 无 | 无 | TextRender 自己栅格化：内嵌要在 render 前改字符串（包 TextRender.render 的参数）或改 textLayer；名字在另一个 TextRender 实例 | L | textrender.dll 无源码；参考 柚子社 汉化补丁的 TJS 覆盖做法 |
| Ren'Py | MeguLitRenpy.py | 内 | 内（Layout 字形） | 无（display_say 的 who 没报） | 无 | 无 | 无（alpha 0 隐藏） | 无（{rb}{rt} 没报） | 名字取 who；选项从 `renpy.exports.menu` / choice 屏的 focus 列表拿 rect；内嵌用 `config.say_menu_text_filter` + `{rb}{rt}` 标签，游戏自己排版 | S | Ren'Py 自带翻译框架（tl / replace_text / say_menu_text_filter）、unrpyc |
| RPG Maker MV / MZ | 只有 LunaHook `lunajspatch.js`（V8 字符串）；CDP 路线遇 canvas 关闭 | 外（字符串流） | 无 | 无 | 无 | 无 | 无（lunajspatch 能改 drawText 的字符串，但不分角色） | 无 | JS 层直接包 Window_Message（台词替换）/ Window_NameBox / Window_ChoiceList / Window_Command 系（只报 rect）；坐标 = PIXI worldTransform → canvas CSS → client px（本分支做） | S | rpg_windows.js / rmmz_windows.js（官方源码随游戏发布）、Translator++、MV/MZ 插件生态、lunajspatch.js |
| RPG Maker VX Ace / VX / XP | rgss.cjs 只读剧本 | 外（LunaHook RGSS 流） | 外（字形点） | 无 | 无 | 无 | 无 | 无 | RGSS30x.dll 导出 `RGSSEval`：注入 Ruby 包 Window_Message#process_normal_character / Window_ChoiceList，和 MV 同一套角色逻辑 | M | RGSS 默认脚本（Scripts.rvdata2 里）、rvpacker、MTool 的做法 |
| TyranoScript | text-paths-web（DOM） | 内 | 内（getClientRects） | 无（`.chara_name_area` 没按名字报） | 无（`.glink_button` 没报） | 无 | 无（CSS 透明隐藏） | 无（<ruby> 被跳过） | 名字容器、glink/button 按角色报 rect；内嵌 = 改 `.message_inner` 的 DOM（加 <ruby> 和中文行），浏览器就是游戏自己的渲染 | S | TyranoScript 源码（MIT）、tyrano 翻译插件 |
| Artemis | LunaHook（Artemis 钩子 + 内嵌） | 外（流） | 外（GPU 四边形 / 字形点） | 外（ctx2） | 外 | 无 | 外（LunaHook 写回字符串） | 无 | 引擎是 Lua：找到 lua_State 后调 Lua 包 `e:tag` 文本函数；或按 Artemis「散文件优先于 pfs」的加载规则放影子目录脚本（不碰游戏目录） | L | artemis 解包工具、LunaHook Artemis 钩子 |
| Unity | unitytext（BepInEx，Mono / IL2CPP） | 内（组件） | 内（TMP characterInfo / TextGenerator） | 无 | 无 | 无 | 无（alpha 0 隐藏） | 无 | 组件角色：按挂的 Button / Toggle / Selectable 判按钮，按框架（Utage / Naninovel / ADV 自研）判名字和选项；内嵌 = 改 TMP.text（加 `<size>` 行和 ruby 标签） | M | XUnity.AutoTranslator（文本替换、TMP 字体、各 UI 框架钩子）、BepInEx、Il2CppInterop |
| SiglusEngine | megulithook Siglus.cpp（LunaHook 内嵌 + ctx2） | 外（流，角色 1/2/3） | 外（字形点） | 外（ctx2=2） | 外（ctx2=3 混着系统串） | 无 | 外（写回 role=1 的流，游戏自己画） | 无 | 画字函数（文字精灵生成）要按版本找签名；选项和系统串要从 ctx2=3 里拆 | L | SiglusExtract、SiglusTools、LunaHook Siglus |
| BGI / Ethornell | megulithook BGI.cpp（内嵌 + 选项流） | 外（流） | 外（字形点） | 外（ctx2） | 外 | 无 | 外（写回） | 无 | 引擎画字函数（按版本签名）；BGI 选项是独立流已有 | L | BGIKit、LunaHook BGI |
| CatSystem2 | ISLAND 精确匹配画字钩子（ToMeIslandDraw.h，含 ruby、隐藏）；所有 CS2：CS2Draw.h 按特征码挂逐字合成（engine=cs2 DRAWRUN，draw.roles 才挂） | 内 | 内（字串表面坐标 + 字号 + 颜色） | 内（主人 RTTI 类 + 单行启发，猜测） | 内（按钮类，猜测） | 内（按钮类，猜测） | 无 | 内（ISLAND）/ 计数 rb= | 其他 CS2 版本只有 ISLAND 一部实物，要别的 cs2.exe 跑 MEGULIT_CS2_EXES 静态测试；表面 → 屏幕偏移进版本层差分 | L | LunaHook CatSystem（EmbedCS2 / cs2 锚点）、MSVC RTTI |
| YU-RIS | megulithook Yuris.cpp（内嵌 + 选项） | 外（流） | 外（字形点） | 外 | 外（独立选项流） | 无 | 外（写回） | 外（Yuris ruby 串） | YU-RIS 画字（ESC 码解析后的字形函数）签名；按钮多是图片 | L | YurisTools、yu-ris 解包 |
| AdvHD / WillPlus | LunaHook（只读流 + flush 延迟）；Euphoria HD 474 精确匹配画字 | 外 / 内（474） | 外（字形点）/ 内（474） | 外 | 外 | 无 | 无（只读） | 无 | 泛化 474 的画字钩子；AdvHD 的 .ws2 VM 文本函数 | L | AdvHDTools、ArcUnpacker、LunaHook WillPlus |
| Majiro | LunaHook | 外 | 外（GDI 字形点，Majiro 走 GetGlyphOutline） | 外 | 外 | 无 | 外（LunaHook 写回） | 无 | mjo VM 的文本操作码处理函数 | L | majiro-tools / mjotool |
| QLIE | LunaHook | 外 | 外（字形点） | 外 | 外 | 无 | 外 | 无 | Delphi 引擎，画字在 TQLIE 文本对象里；要按版本找 | L | QLIE 解包（qlie-tools）、LunaHook |
| Malie | LunaHook（内嵌） | 外 | 外（GPU 四边形） | 外 | 外 | 无 | 外 | 无 | Malie 自绘字体，画字函数在 exe 内；Camellia 密钥已有 | L | MalieTools、LunaHook Malie |
| Softpal / Pal | megulithook Pal.cpp（内嵌 + ruby + pal_sprite_v1 坐标通道） | 外（流） | 内（pal_sprite_v1 文字精灵） | 外 | 外 | 无 | 外（写回） | 外 | 精灵通道加角色字段；选项精灵 | M | SoftpalTools、LunaHook Pal |
| MAGES. | MagesEngine.cpp + mages/（SC3 解码含 ruby）；STEINS;GATE 精确匹配 | 内（SC3 串）| 内（SG）/ 外 | 外 | 外 | 无 | 内（SG） | 内（SC3 ruby） | 把 SG 的画字钩子泛化到其他 MAGES 作（按 exe 版本表）；选项是 SC3 SELECT | M | Committee of Zero 的 LanguageBarrier（MAGES 画字 + 字体 DLL 钩子，开源）、sc3tools |
| NScripter / ONScripter | LunaHook | 外 | 外（NScripter GDI 字形点；ONScripter 是 SDL_ttf → 无） | 无 | 外 | 无 | 外 | 无 | ONScripter-jh 是开源引擎，可按源码定位画字；原版 NScripter 闭源 | M（ONS）/ L（NS） | ONScripter-jh 源码、nscripter 解包 |
| LiveMaker | LunaHook | 外 | 外（GDI 字形点） | 无 | 外 | 无 | 外 | 无 | LSB 二进制 + Delphi 画字；pylivemaker 能读 LSB 定位文本节点 | L | pylivemaker |
| Escude | LunaHook | 外 | 外（字形点） | 外 | 外 | 无 | 外 | 无 | ESCR VM 文本函数 | L | EscudeTools、escude.cjs（本仓库读剧本） |
| CIRCUS | LunaHook | 外 | 外（GDI 字形点） | 外 | 外 | 无 | 外 | 无 | MES VM（31 个版本操作码表已在 circus.cjs）里的文本 / 选项操作码处理函数 | L | msg-tool、CircusTools |

通用开源（跨引擎）：LunaHook（大部分引擎的流钩子 + 内嵌写回）、Textractor（H-code 钩子）、VNTextPatch / VNTextProxy（arcusmaximus：GDI 引擎的内嵌替换 + 比例字体代理 DLL，Majiro / CIRCUS / LiveMaker / QLIE 这类 GDI 引擎内嵌最直接的参考）、XUnity.AutoTranslator（Unity）、GARbro（解包）

## 结论：先做哪个

收益 = 发行量 × 现在缺的程度 ÷ 难度

1. **KiriKiri processCh 路线**（7285 日文发行，已经在引擎内部，只差角色和内嵌）：已做（ecc1e0b7），默认关，等实机
2. **RPG Maker MV/MZ**（JS 层源码公开，现在坐标和角色全无，S）：已做（core/text-paths-rpgm.cjs），引擎差分默认开，等实机
3. TyranoScript（S，DOM 已在，只差角色和 DOM 内嵌）、Ren'Py（S，有官方翻译钩子）：同一套协议，下一批
4. Unity（M，组件已在内部，角色靠框架）
5. 其余（Siglus / BGI / YU-RIS / AdvHD / Majiro / QLIE / Malie / Escude / CIRCUS / LiveMaker / NScripter / Artemis）是 L：每个要逆向二进制画字函数、按版本签名。共同的捷径是 GDI 引擎走 VNTextProxy 那条「代理 GDI + 写回字符串」的路，角色继续用 LunaHook 的 ctx2，坐标继续用字形点；真正的「内」要一个引擎一个会话
