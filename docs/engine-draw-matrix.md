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
| CatSystem2 | ISLAND 精确匹配画字钩子（ToMeIslandDraw.h，含 ruby）；其他 CS2 走 LunaHook + cs2 屏幕协议 | 内（ISLAND）/ 外 | 内（ISLAND）/ 外 | 外 | 外 | 无 | 无 | 内（ISLAND） | 把 ISLAND 的画字钩子按特征码泛化到其他 cs2.exe 版本 | L | CatSystem2 工具（cstl / cst 解包）、LunaHook CS2 |
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

## 其余原生引擎：静态普查（re-misc，2026-11-21）

只读店主本机的 exe / dll，没开游戏（`H:\MeguLit-Work\tools-re\census.py`：pefile + capstone，数导入表里文字 API 在代码中的 call 数，各节熵值，壳的特征）。按 The Seed 里的游戏数从多到少排，同数的按难度排。原始数据在 `tools-re\census-misc.jsonl` / `census-extra.jsonl`

| 引擎（seed 数） | 游戏 / 文件 | 画字所在模块 | 位数 | 文字 API 调用点 | 图形 | 壳 | LunaHook 现有 | 难度 |
|---|---|---|---|---|---|---|---|---|
| Spike Chunsoft（3） | ダンガンロンパ 1 / 2 / V3（Steam） | DR1_us.exe / DR2_us.exe / Dangan3Win.exe | x86 / x86 / x64 | 导入表里没有文字 API | D3D9（1/2）、D3D11（V3） | **SteamStub `.bind`**，V3 的 `.text` 熵 8.0 = 整段加密 | Chunsoft.cpp（x64，78 行） | 难：静态看不到代码，要先脱 SteamStub（Steamless 类工具，只读出一个解开的副本）再找自绘字库 |
| NScripter（2） | 月姬 v1.4 / v1.6 | Tsukihime.exe（两版同一 exe，400 KB） | x86 | TextOutA ×8、CreateFontA ×13 | GDI DIB（BitBlt / StretchDIBits） | 无 | Onscripter 系（对 NScripter 本体只有通用 GDI） | 易：GDI 画进 DIB，8 个调用点按笔位分出台词 / 名字 / 选项 |
| FVP（2） | いろとりどりのヒカリ（中文版）/ HD | Hikari.exe（中文版启动器 五彩斑斓的曙光.exe 只是外壳）/ irohika_HD.exe | x86 | GetGlyphOutlineA ×3、CreateFontA ×1 | D3D9 | 无 | FVP.cpp | 中：3 个字形调用点，字形进 D3D9 纹理，坐标在上层排版 |
| Nitroplus（2） | 沙耶の唄（Steam）/ みにくいモジカの子 | Mware.dll（Steam 版）/ 丑小鸭与文字祸.exe | x86 | Steam 版：Mware.dll 只有 D3D11，exe 只有 CreateFontW ×2；モジカ：没有可见导入 | D3D11 | モジカ：**Enigma Protector**（`.enigma1` 熵 7.91） | Nitroplus.cpp / Nitroplus2.cpp | 难：沙耶 Steam 是自绘字库（字形不走 GDI）；モジカ有壳，静态做不了 |
| Softpal（1） | 時計仕掛けのレイライン | dll\PAL.dll | x86 | **GetGlyphOutlineA ×1**、CreateFontA ×1 | GDI DIB | 无 | Pal.cpp（本仓库已改：内嵌 + ruby + pal_sprite_v1） | 易：唯一一个字形调用点，和 YU-RIS 一样做锚 |
| ReaLive / AVG32（1） | 涙 ～流星のザドル～（1997） | AVG3216D.EXE（222 KB） | x86 | TextOutA ×2、CreateFontIndirectA ×1 | GDI DIB | 无 | Reallive.cpp | 最易：2 个调用点，exe 小 |
| CMVS（1） | 青い鳥（Steam） | cmvs32.exe | x86（带 `_TEXT64` 节） | GetGlyphOutlineA ×2、CreateFontA ×4 | D3D11 | 无 | CMVS.cpp | 中：2 个字形调用点，D3D11 合成 |
| Musica / ぱれっと（1） | ましろ色シンフォニー | mashiroiro.exe | x86 | 只有 CreateFontA ×1（字形 API 不在导入表：运行时 GetProcAddress 或自绘） | DirectDraw | 无 | Palette.cpp | 中：先找动态取的 API |
| minori（1） | eden*（Steam 英文版） | eden_en.exe | x86 | GetGlyphOutlineA ×3、CreateFontA ×2 | D3D9 + DirectDraw | 无 | Minori.cpp | 中 |
| Leaf / AQUAPLUS（1） | WHITE ALBUM2 | WA2.exe | x86 | 没有任何 GDI 文字 API | D3D9 + D3DX（自绘字库） | 无 | Leaf.cpp | 难：和 MAGES 一样是字库图集，要找送字函数 |
| Innocent Grey（1） | 虚ノ少女 | Innocentsetup.exe（98 MB，资源打在 exe 里） | x86 | DrawTextW ×1、ExtTextOutW ×1、TextOutW ×1 | GDI | 无 | 无专用（通用 GDI） | 易：3 个 W 调用点 |
| BRUNS（1） | ダストマニア・グロテスク | gameplay.exe（121 KB 启动）+ umut.dll + libscr.dll | x86 | umut.dll 没有文字 API；libscr.dll TextOutW ×1（中文补丁的库） | GDI DIB | 无 | Bruns.cpp | 中：画字可能在中文补丁库里，原版走自绘 |
| AdvHD / WillPlus（1） | Under The Moon（seed 里是 ディスコード！，本机只有同引擎的 utmoon.exe） | utmoon.exe | x86 | GetGlyphOutlineA ×2、TextOutA ×3、CreateFontIndirectA ×1 | DirectDraw | 无 | WillPlus.cpp（本仓库另有 Euphoria HD 474 精确匹配） | 易 |

做的顺序（从易到难，每个引擎一个提交，交付照 YU-RIS 样板的 6 件套：JS 签名、原生签名头、夹具、静态签名测试、原生自检、运行时钩子 + 店主测试清单）：
1. ReaLive / AVG32 → 2. Softpal PAL.dll → 3. NScripter（月姬）→ 4. Innocent Grey → 5. AdvHD / WillPlus → 6. CMVS → 7. FVP → 8. minori → 9. Musica → 10. BRUNS → 11. Leaf WA2 → 12. Nitroplus（沙耶 Steam / モジカ）→ 13. Spike Chunsoft

后 4 个（Leaf、Nitroplus、Spike Chunsoft、BRUNS 原版）静态普查已经说明拿不到 GDI 调用点：自绘字库或加壳，要在运行中找送字函数或先脱壳，单靠静态做不出签名，做到时会先写清缺什么，不硬交

进度（feat/re-misc）：通用 GDI 画字点部件（native/megulithook/DrawSites.h + DrawSitesSig.h）已交付，签名已有 ReaLive / AVG32、Softpal（两条）、NScripter、Innocent Grey（MFC CDC 三条）、AdvHD、CMVS、FVP（两条）、minori、Musica、BRUNS、Nitroplus（沙耶 Steam）、NitroPlus 2003（沙耶原版），每条在店主本机文件上正好命中、在其他引擎文件里不命中。普查时漏看了「经寄存器调用」的情况：Musica、沙耶 Steam、Softpal 第二条都是这样找到的（签名的 SLOT 形式）。Leaf、Spike Chunsoft、モジカ 静态做不出，见 engine-draw-native.md 末尾

## 下一批（总指挥 2026-11-21）：本机样本

只读查了 E:\GAL、E:\Steam\steamapps\common、H:\、D:\（4 层深，按引擎特征文件 / exe 名：AI5WIN / AI6WIN、mes.arc、live.dll / .lsb、Rio.arc / Chip.arc、System40 / .ain、Escu:de 的 .bin 包、Kaguya 的 params.dat / LINKPACK / .alp）：

| 引擎 | 本机样本 | 结果 |
|---|---|---|
| Silky's（AI5WIN / AI6WIN） | 没有 | 跳过；要一部 Silky's 作品（例：ヴァルキリーコンプレックス、イエスタデイをうたって 之类 AI6WIN 版本）的 exe |
| LiveMaker | 没有 | 跳过；要一部 LiveMaker 作品（例：ミライ、ノラと皇女と野良猫ハート 之外的 LiveMaker 同人作）的 exe（游戏数据附在 exe 末尾） |
| Will（ADV 引擎，Rio.arc / Chip.arc） | Under The Moon（已签，advhd）；いじわるMyMaster（mymaster.exe 是 AlphaROM 加壳，导入表空，静态看不了） | 没有新签名；いじわるMyMaster 要运行中解开的镜像 |
| AliceSoft System4 | 没有 | 跳过；要一部 System 4.x 作品（例：ランス10、ドーナドーナ）的 System40.exe |
| Escu:de | 没有 | 跳过；要一部 Escu:de 作品（例：絶対階級学園、Re:BIRTHDAY SONG）的 exe |
| Kaguya（アトリエかぐや） | 没有 | 跳过；要一部かぐや作品的 exe |

顺带核对的：時計仕掛けのレイライン 2 的 PAL.dll 两条 Softpal 签名各正好命中一次（已进夹具，413e0cc5）；レイライン 3 是 KiriKiri。Air 的 avg32_cn.dll 导入了 TextOutA 但代码里没有对它 IAT 槽的引用（经别的跳板调用），新版 AVG32 要另看。

## 普查还没覆盖的引擎

| 引擎 | 本机样本 | 备注 |
|---|---|---|
| Silky's AI5WIN / AI6WIN、LiveMaker、AliceSoft System4、Escu:de、Kaguya | 无 | 见上表 |
| Majiro | 无 | GetGlyphOutline 路线，适合 DrawSites |
| QLIE | 无 | Delphi，画字在 TQLIE 文本对象 |
| Malie | 无 | 自绘字库，类似 MAGES |
| CIRCUS | 无 | MES VM，GDI 字形点 |
| EntisGLS（Entis） | 无 | |
| SystemNNN、ExHIBIT、Ikura GDL、rUGP（âge）、AGE System | 无 | |
| RealLive / AVG32 新版（Air 的 avg32_cn.dll） | 有（Air） | TextOutA 不经 IAT 直接调用，要先找跳板 |
| Leaf（WHITE ALBUM2）、Spike Chunsoft（ダンガンロンパ 1 / 2 / V3）、みにくいモジカの子 | 有 | 静态做不出，实机采集方案见 engine-draw-native.md |
| Unity Naninovel（夏色四叶草）、Unity（デスマッチラブコメ！） | 有 | 归 Unity 组件路线（unitytext），不是原生画字 |
| BGI、Siglus、MAGES、CatSystem2 | 有 | re-bgi / re-siglus / re-mages / re-cs2 在做 |
