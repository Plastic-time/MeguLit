# MeguLit 引擎覆盖普查（2026-11-13）

MeguLit 对一款游戏的支持分三层：

- **检测**：`core/library.cjs` 从游戏目录认出引擎（决定库里显示的引擎名和 hook 选择）。认不出就是「未知引擎」
- **读取**：`services/original-engines/*`（经 `scenes.cjs`）或 `services/original-text.cjs` 的旧适配层读出剧本，用于零延迟双语配对
- **Hook**：LunaHook 与 `native/` 下的专用桥在游戏运行时取文本

## 数据来源

- 发行数：VNDB 引擎表（https://vndb.org/r/engines）与 kana API 计数。「日文 Win」= 含日语、Windows 平台的发行；「公司」= 其中制作/发行方是公司（VNDB producer type=co，商业作品的近似）；「公司 2016+」= 2016 年起的公司发行。同一作品的多个版本各算一次，所以是相对规模，不是作品数
- 格式：GARbro `docs/supported.html`（235 个品牌/引擎条目）、各引擎的开源工具源码（见各读取器文件头和 THIRD-PARTY.md）
- Hook 列：✅ = library 里 `hook:true`（LunaHook 有该引擎的专用 hook）；◎ = MeguLit 自己的内嵌桥；⚪ = 走通用 hook，首次游玩时确认（`hook:null`）。本轮没有实机启动游戏，hook 列不是本轮实测结果

## 图例

- 检测：✅ 原有　🆕 本轮新增或修正　❌ 认不出（显示未知引擎）
- 读取：✅ 自有读取器（零延迟配对）　🆕 本轮新增　🟡 只有 GARbro 兜底（按需下载 GARbro 解包，再做通用假名扫描：行是近似的，不保证和汉化一一配对）　❌ 读不了

## 覆盖表

| 引擎 | 日文 Win | 公司 | 公司 2016+ | 检测 | 读取 | Hook | 备注 |
|---|---:|---:|---:|---|---|---|---|
| KiriKiri / KAG | 7285 | 3158 | 1606 | ✅ | ✅ xp3（明文 / 按作品 cx 过滤 / 运行中读出）、散 .ks、多语言 xp3 | ◎ MeguLitKrkr 桥 + ✅ | Yuzusoft 等强加密 xp3 走运行中读出 |
| Unity（Utage / Naninovel / 各厂自研） | 1412 | 810 | 785 | ✅ | ✅ naninovel / unity-text / higurashi / capcom-msg / vgprompter（按框架） | ⚪ Mono/IL2CPP | 通用 Unity 剧本无统一格式，按框架逐个做 |
| YU-RIS | 852 | 480 | 318 | ✅ | ✅ ypf / YSTB | ✅ |  |
| System-NNN | 390 | 371 | 111 | 🆕（spt\ + nya\/init\） | 🆕 systemnnn.cjs：spt dword 异或、PRINT/SELECT 按命令顺序（引擎源码公开） | ⚪ | 乙女社 Mio 用 |
| Artemis | 495 | 347 | 330 | ✅ | ✅ pfs pf6/pf8、.ast、多语言 | ✅ |  |
| BGI / Ethornell | 337 | 329 | 195 | ✅ | ✅（旧适配层 bgi.cjs） | ✅ |  |
| ShiinaRio | 333 | 301 | 42 | ✅（WARC 魔数） | ✅ shiinario.cjs：WARC 1.1 原生，1.2+ 经 GARbro 方案库（127 作）解出 *_T.WAR，TXT 逐行 | ✅ | 加密 WARC 的原生解密未做（E579） |
| CatSystem2 | 264 | 236 | 108 | ✅ | ✅ scene.int（含 cnscene.int） | ✅ |  |
| SiglusEngine | 223 | 222 | 154 | ✅ | ✅ Steam .dbs 多语言表、Scene.pck 内附源码 | ✅ |  |
| codeX RScript（Liar-soft） | 211 | 211 | 91 | 🆕（"LB" .xfl 归档） | 🆕 liar.cjs：scr.xfl（可嵌套）+ .gsc 字符串表 | ⚪ | 就是 Liar-soft 引擎（Liar、raiL、Studio Ubai、SUKARADOG） |
| RealLive | 220 | 207 | 21 | ✅ | ✅ Seen.txt | ✅ |  |
| Majiro | 265 | 205 | 21 | ✅ 扩展（任何名字的 MajiroArc） | 🆕 majiro.cjs：MajiroArcV1–V3 + .mjo 字节码精确遍历 | ✅ |  |
| Malie | 205 | 204 | 82 | ✅（已知密钥能开 data*.dat） | ✅ malie.cjs：LIB/LIBU/LIBP 原生，43 个作品密钥（Camellia/CFI）+ 适配包 malie-scheme，EXEC 消息表逐行 | ✅ | Karin（乙女）用（E578） |
| NeXAS (Giga) | 199 | 197 | 147 | ✅ 扩展（script.pac 且非 Softpal） | ✅ nexas.cjs：PAC（Huffman 索引、LZSS/Huffman/zlib/zstd）+ .bin 串表逐行 | ✅ | 未经实物（E577） |
| QLIE | 203 | 180 | 57 | ✅ | 🆕 qlie.cjs：pack 1.0–3.1 全部密码 + 1PC 解压 + .s 语法（E581） | ✅ | 3.0+key.fkey 的游戏密钥先取 exe 的 TFORM1，取不到用适配包 qlie-key |
| NScripter / ONScripter | 2079 | 142 | 19 | ✅ | ✅ 0.txt / nscript.dat | ✅ |  |
| AST | 155 | 141 | 0 | 🆕（无扩展名 ARC1/ARC2） | 🟡 ast.cjs：归档按规格做实（名字异或、LZSS+异或），剧本无公开资料 → 通用文本扫描 | ⚪ | 老作品（2016 后 0）；剧本语法需实物 |
| Entis GLS | 139 | 133 | 30 | 🆕 | 🆕 entis.cjs：NOA + ERISA-N + BSHF（口令取 exe 的 IDR_COTOMI）+ csx Talk/Mess/AddSelect（E582） | ✅ | csx 语法未经实物验证 |
| AliceSoft System4 / System 3.x | 143 | 127 | 27 | 🆕 | ✅ .ain（旧适配层）；🆕 alicesoft.cjs：System 3.5–3.9 的 SA.ALD + SCO 精确遍历、System39.ain；.afa 只列表（E583） | ✅ / ⚪ 3.x | System4 的 .afa/.ald 不再交给 GARbro |
| KaGuYa | 124 | 124 | 54 | 🆕 扩展（message.dat / params.dat 头、WFL1 / LINK 归档） | 🆕 kaguya.cjs：message.dat ver4（分组表）+ 早期分块格式；WFL1 / LINK3–6 里的 message.dat 也能找到 | ⚪ |  |
| Marble | 140 | 124 | 0 | 🆕 | 🆕 marble.cjs：mbl 两种索引 + 口令自动推断 + NUL 串语法（E584） | ⚪ |  |
| Ikura GDL | 124 | 123 | 2 | 🆕 | 🆕 ikura.cjs：无扩展名 SM2MPX10 / DRS 归档 + ISF 指令流（PM 0xFF 文本，按版本变换）；带 SECRETFILTER 的作品报告“需要密钥” | ⚪ | 公开资料；SECRETFILTER 作品要每作品密钥 |
| AdvHD / WillPlus | 124 | 123 | 103 | ✅ | ✅ Rio.arc .wsc | ✅ |  |
| Ren'Py | 945 | 120 | 108 | ✅ | ✅ .rpy；🆕 无源码时读 .rpyc / .rpa，编译版 tl 按 translate id 配对 | ◎ MeguLitRenpy 桥 + ✅ | 商业/Steam 版多只带 rpyc+rpa，原来读不到 |
| Softpal ADV | 119 | 119 | 82 | 🆕 修正（PAL.dll 在 dll\ 下原来认不出） | 🆕 softpal.cjs：data.pac + SCRIPT.SRC/TEXT.DAT（实机文件验证 33102 行） | ✅ |  |
| AVG32 | 111 | 110 | 0 | ✅（归为 RealLive） | ✅ TXT/SEEN.TXT | ✅ |  |
| ExHIBIT | 104 | 98 | 56 | 🆕（.rld，含 rld\ 子目录） | 🆕 exhibit.cjs：rld 自描述指令（0x1C 台词 / 0x15 选项），明文或已知种子（rld-seeds.json） | ⚪ | 2016 后仍有 56 个公司发行；未知种子报告“需要种子” |
| Bruns | 165 | 88 | 6 | 🆕 | ✅ scene/*.bso | ⚪ | 原来有读取器但库里是未知引擎 |
| SaiSys | 80 | 80 | 0 | ❌ | ❌ | ⚪ |  |
| TyranoScript | 4052 | 75 | 74 | 🆕 扩展（app.asar 读索引、package.nw） | 🆕 tyrano.cjs：散文件 / app.asar / package.nw / exe 尾部 zip | ✅（V8：nwjs/electron） | 原来被 kirikiri 读取器当 KAG 读，#名字 当正文 |
| Yuka | 66 | 66 | 2 | 🆕 | 🆕 yuka.cjs：.ykc + .yks 元素表遍历（StrOut / NameOut 的字符串常量）；选项无公开资料 | ⚪ |  |
| MAGES. | 60 | 60 | 51 | ✅ | ✅ script.mpk SC3（日版） | ◎ MAGES 内嵌 + ✅ |  |
| DxLib | 62 | 58 | 21 | ✅ | 🟡 GARbro（.dxa） | ✅ |  |
| Silky's | 57 | 55 | 52 | 🆕 | 🆕 silky.cjs：Silky .arc / IFL + .mes 操作码遍历（E576） | ⚪ |  |
| EAGLS | 53 | 53 | 16 | 🆕（含 Script\SCPACK） | 🆕 eagls.cjs：SCPACK.pak+.idx（默认密钥或由全 0 尾部自动求解）、.dat 隔字节 EAGLS_SYSTEM 流异或、#说话人 + 引号字面量 | ✅ | AdvSys 变体（136000 起 "ADVSYS"）未做 |
| Musica (PAZ) | 54 | 53 | 25 | 🆕 | ✅ scr.dat / *.paz（paz.cjs） | ✅ | 原来有读取器但库里是未知引擎 |
| Seraph | 63 | 53 | 0 | 🆕（ArchPac.dat） | 🟡 seraph.cjs：ScnPac.dat 偏移表 + 自有 LZ / zlib 按规格做实，剧本语法无公开资料 → 通用文本扫描（行近似，按位置配对） | ⚪ | 需实物确认剧本语法 |
| SystemC | 53 | 52 | 33 | ❌ | ❌ | ⚪ | 2016 后 33 |
| RPG Maker | 752 | 46 | 44 | ✅ | ✅ MV/MZ JSON；🆕 XP/VX/VX Ace：RGSSAD + Ruby Marshal，与 MV 共用消息遍历（E574） | ⚪ MV/MZ；✅ VX/XP |  |
| CMVS (Purple) | 44 | 44 | 26 | 🆕 | 🆕 cmvs.cjs：CPZ5 / CPZ6 索引四层解密（7 种 MD5 变体自动试，cmvs-schemes.json）+ PS2A 字节旋转 / 2KB LZSS + push 字符串；CPZ7 只检测并提示需实物 | ✅ |  |
| Lucifen | 48 | 44 | 4 | 🆕 | 🆕 lucifen.cjs：SCRIPT.LPK（两套已知方案，lucifen-schemes.json；trie 索引、LZSS、条目加密）+ SOB0 / SOB2 重定位表取台词与选项 | ⚪ |  |
| Tmr-Hiro ADV | 40 | 39 | 29 | 🆕（.pac 索引自洽即认） | 🆕 tmrhiro.cjs：.pac（v1/v2）+ srp 指令流（半字节互换、“姓名,正文”、选项） | ⚪ | .pac 无魔数；TextScript（无扩展名）无可靠识别特征未做 |
| FVP (FAVORITE) | 36 | 36 | 22 | 🆕 | ✅ <名>.hcb | ✅ | 原来有读取器但库里是未知引擎 |
| Godot | 61 | 35 | 35 | 🆕 | ❌ | ⚪（LunaHook64 有 Godot2_x64） |  |
| rUGP (âge) | 34 | 33 | 7 | 🆕 | ❌ | ⚪ |  |
| Interheart FPK | 33 | 33 | 0 | 🆕（.fpk 索引自洽即认） | 🟡 interheart.cjs：.fpk 三种索引 + FPK 2.00 + ZLC2 按规格做实，剧本语法无公开资料 → 通用文本扫描 | ⚪ | 需实物确认剧本语法 |
| SakanaGL | 32 | 32 | 32 | 🆕（sakanagl.dll） | ❌ | ✅（LunaHook 有 sakanagl hook） | 2016 后 32 |
| Diesel Engine | 31 | 31 | 27 | ❌ | ❌ | ⚪ |  |
| AI5WIN / AI6WIN (elf/Silky) | 31 | 31 | 11 | 🆕（AI5WIN/AI6WIN.exe） | 🆕 silky.cjs：AI6WIN 完整；AI5WIN 归档 + 通用扫描（E576） | ⚪ |  |
| LC-ScriptEngine | 41 | 30 | 0 | ✅ 扩展（lcsebody*.lst） | 🆕 lcse.cjs：.lst 索引 + 数据包（单字节密钥按长度反推）+ SNX 指令流 / 长度前缀串表 | ✅ |  |
| NEKOPACK / NekoSDK | 30 | 30 | 10 | 🆕（NekoSDK 单列） | 🆕 nekosdk.cjs：NEKOPACK4 .pak、0xCACACA .dat + ADVSCRIPT2 对白（选项无资料）；NekoPack 1–3 仍走 GARbro | ⚪ | NekoPack 1–3（名字只存哈希、流加密）是另一套引擎 |
| PIX STUDIO | 28 | 28 | 27 | ❌ | ❌ | ⚪ |  |
| GLib2 | 27 | 27 | 0 | 🆕 | ❌ | ⚪ |  |
| ISM | 37 | 21 | 5 | 🆕 | 🟡 GARbro（.isa） | ⚪ |  |
| Cyberworks (C,system) | 39 | 19 | 10 | ✅ | 🟡 GARbro（Arc0N.dat） | ⚪ |  |
| AGES Mk2 | 20 | 19 | 19 | ❌ | ❌ | ✅（LunaHook64 Ages7） |  |
| Luca System（Prototype 新移植） | 16 | 14 | 14 | 🆕 | ❌ | ⚪ | Kanon/AIR/Summer Pockets RB Steam |
| Pajamas / PJADV | 16 | 14 | 6 | ✅ 扩展（任何名字的 GAMEDAT 包） | 🟡 GARbro（.dat） | ⚪ |  |
| LiveMaker | 1747 | 12 | 3 | 🆕 扩展（vff 归档魔数） | 🟡 GARbro（vff） | ✅ | 乙女同人第二大引擎（532 款），LSB 二进制未做 |
| Nitroplus（NPA/NPK/PAK/N4） | 12 | 12 | 0 | ✅ | ✅ npk / pak / N4；NPA 只检测 | ✅ |  |
| CatSystem3 | 12 | 12 | 12 | ❌ | ❌ | ⚪ | 2016 后 12 |
| Unreal Engine 4/5 | 13 | 10 | 10 | 🆕 | ❌ | ⚪（LunaHook64 有 UE4/5） |  |
| Light.vn | 161 | 9 | 9 | ✅ | ❌（.vndat 带密码 zip） | ✅ |  |
| Innocent Grey (IGA) | 8 | 7 | 1 | 🆕 | ✅ script.iga | ✅ | 原来有读取器但库里是未知引擎 |
| Rejet Engine | 7 | 7 | 0 | ❌ | ❌ | ⚪ | 乙女 |
| Valkyria | 6 | 6 | 2 | ✅ | ❌ | ✅ |  |
| Wolf RPG | 208 | 5 | 5 | ✅ | ✅ Data/*.mps、CommonEvent.dat、明文 .wolf | ✅ |  |
| Leaf / AQUAPLUS | 5 | 5 | 5 | ✅ | ✅ KCAP script.pak | ✅ |  |
| HuneX | 1 | 1 | 1 | 🆕 | ✅ .hfa 多语言 ctd 表 | ⚪ | 原来有读取器但库里是未知引擎；乙女移植常见 |
| Adobe AIR / Flash | — | — | — | 🆕 | ❌ | ⚪ | 老乙女同人常见（43 款） |
| Kaleido ADV Workshop | — | — | — | ❌ | ❌ | ⚪ | MAGES/Spike 新移植 |
| DDSystem | — | — | — | ❌ | ❌ | ⚪ | Daisy2（乙女） |
| Escude | — | — | — | ✅ | 🟡 GARbro（script.bin ACPX） | ✅ |  |
| minori (PAZ) | — | — | — | ✅ | ✅ scr.paz | ✅ |  |
| Spike Chunsoft WAD | — | — | — | ✅ | ✅ .lin | ⚪ |  |

排序：按「公司」列从高到低（商业作品的近似规模）。同人为主的引擎（Tyrano、LiveMaker、NScripter、Ren'Py）看「日文 Win」列

## 原来认不出、库里会显示「未知引擎」的

本轮之前 `engineOf()` 返回空的，按影响排序：

1. **MeguLit 能读却认不出**（最冤）：FVP（FAVORITE）、Innocent Grey IGA、Musica PAZ（ぱれっと）、Bruns、HuneX、Softpal（PAL.dll 在 `dll\` 下时）。本机 `E:\GAL` 的 いろとりどりのヒカリHD、虚ノ少女、ましろ色シンフォニー、ダストマニア、時計仕掛けのレイライン 实测都是这种情况，本轮已补
2. **本轮补上检测**（仍走通用 hook 或 GARbro）：System-NNN、CMVS、EAGLS、Ikura GDL、Silky's / AI5WIN / AI6WIN、KaGuYa、Lucifen、Yuka、Luca System、NEKOPACK、Marble、rUGP、Seraph、ISM、GLib2、ExHIBIT、SakanaGL、Godot、Unreal、Adobe AIR / Flash；PJADV / Pajamas 扩到任何文件名的 GAMEDAT 包，LiveMaker 加 vff 归档魔数
3. **仍然认不出**（没有公开格式资料或没有可靠特征文件）：SaiSys、SystemC、Tmr-Hiro ADV、Diesel、PIX STUDIO、AGES Mk2、CatSystem3、Kaleido ADV Workshop、Rejet Engine、DDSystem、Otomate / Idea Factory 的 PC 移植、honeybee、Interheart FPK

## 乙女（otome）专节

数据：VNDB 标签 Otome Game（g542，7112 部作品）下含日语的 Windows 发行共 3900 个。按引擎：

| 引擎 | 乙女发行 | MeguLit |
|---|---:|---|
| 未标注 | 1397 | 多为商业乙女，见下 |
| KiriKiri | 577 | ✅ |
| LiveMaker | 532 | 🟡 只有 GARbro 兜底（LSB 剧本未做） |
| TyranoScript | 478 | 🆕 本轮补上 |
| NScripter | 258 | ✅ |
| YU-RIS | 67 | ✅ |
| Ren'Py | 63 | ✅（本轮补上无源码版） |
| RPG Maker | 62 | ✅ MV/MZ |
| Unity | 60 | 按框架 |
| Comic Maker 1/2/3 | 114 | ❌ 老同人工具 |
| Adobe AIR / Flash | 47 | 🆕 只检测 |
| System-NNN | 24 | 🆕 读取（E570） |
| BGI | 11 | ✅ |
| Malie | 6 | ✅ |
| Artemis | 5 | ✅ |

按厂商（含 Switch / Vita / PSP 移植到 PC 的版本）：

| 厂商 | PC 版引擎 | MeguLit |
|---|---|---|
| Otomate / Idea Factory（ジャコウノリラ、片恋いコントラスト 的 PC 版） | VNDB 未标注，自研引擎，无公开格式 | ❌ 需要实物（至少目录文件清单） |
| Idea Factory International（Steam：Amnesia: Memories） | Artemis | ✅ |
| Aksys / IFI 的 Steam 移植（Collar×Malice、Café Enchanté、Olympia Soirée、Piofiore、Cupid Parasite） | VNDB 未标注 | ❌ 未知，需目录清单判断；若是 Unity 则走 Unity 通用层 |
| Rejet（ALICE=ALICE、BAD MEDICINE、剣が君） | Rejet Engine（自研） | ❌ |
| HuneX / dramatic create（Steam Prison、Arcana Famiglia Rinato、明治東亰恋伽 新版） | HuneX 引擎（.hfa）或 Unity | ✅ HFA 已有读取器（本轮补检测）；Unity 版按框架 |
| honeybee / honeybee black（あやかしごはん、DYNAMIC CHORD、Blackish House） | 未标注 | ❌ 需要实物 |
| QuinRose（アリス シリーズ） | KiriKiri（部分）+ 自研 QuinRose Engine | KiriKiri 版 ✅，自研 ❌ |
| Operetta Due（越えざるは紅い花、幸ノ天秤） | YU-RIS、KiriKiri | ✅ |
| Daisy2（絶対階級学園、三国恋戦記） | DDSystem | ❌ |
| Karin Entertainment（絶対迷宮グリム、断罪のマリア） | Malie | ✅ malie.cjs（EXEC 在 exe 资源里也读） |
| Vitamin（イジって★プリンセス 等） | 未标注 | ❌ 需要实物 |
| Takuyo（怪盗アプリコット 等，2000 年代） | GSS / 未标注 | ❌ |
| Tiaramode（Butlers、Brothers、Royals） | BGI | ✅ |
| SPRAY（鬼畜眼鏡、学園ヘヴン BL） | RealLive / Siglus / AVG32 | ✅ |
| Mio（浅き夢見し） | System-NNN | 🆕 检测 + 读取（E570，未经实物验证） |
| Kirue | YU-RIS / LiveMaker | ✅ / 🟡 |
| Primula（大正×対称アリス） | 未标注 | ❌ 需要实物 |
| 道玄坂ラボ（手机移植） | 未标注，部分 Kaleido / KiriKiri | ❌ 大多未知 |
| ROSEVERTE | Unity（重制版）/ Adobe AIR（旧版） | Unity 按框架；AIR ❌ |
| Princess Crown、Imaginary Garden、Mr.Escapism 等同人乙女 | KiriKiri / LiveMaker / Tyrano / NScripter | KiriKiri、Tyrano、NScripter ✅；LiveMaker 🟡 |

**结论**：同人乙女的主力引擎里 KiriKiri、TyranoScript、NScripter 已能读，LiveMaker 是最大的缺口（532 个发行）。商业乙女反而是最大的盲区：Otomate PC 版、Aksys/IFI 的 Steam 移植、honeybee、Vitamin、Primula、Rejet、Daisy2 在 VNDB 上都没有引擎标注，也没有公开格式资料，只能从实物判断

## 缺口排名（剩余）

打分：价值 = 2016 年后公司发行 ×2 + 公司发行总数 + 乙女/同人加权；难度 = 归档是否按作品加密、剧本是否有公开资料、有没有可对照的实物

| 排名 | 引擎 | 价值依据 | 难度 | 下一步 |
|---|---|---|---|---|
| 1 | NeXAS | 197 公司 / 147 近年（最多的未读引擎） | 中：GARbro 已能解 .pac，剧本 .bin 是 SJIS 串表 | 写 .bin 解析，接在 GARbro 解包之后；需一个实物确认 .bin 布局 |
| 2 | ~~System-NNN~~ | 371 公司 / 111 近年，乙女 Mio | 已做（E570）：引擎源码公开 | 有实物可验证 |
| 3 | QLIE | 180 / 57 | 低：GARbro 解 pack 后 .s 是明文脚本 | 给 GARbro 兜底加 QLIE .s 语法（不需实物也能做，配对质量提升明显） |
| 4 | Malie | 204 / 82，乙女 Karin | 高：lib 按作品 Camellia 密钥（GARbro 有），exec.dat 字符串表 | GARbro 解包 + exec.dat 串表解析；需实物 |
| 5 | ~~codeX RScript~~ | 211 / 91 | 已做（E571）：就是 Liar-soft，.xfl + .gsc 有公开工具 | 有实物可验证 |
| 6 | LiveMaker | 1747 发行、乙女 532（公司只有 12） | 高：vff 归档 + LSB 二进制（pylivemaker 有完整规格，GPL-3.0） | 按 pylivemaker 移植 LSB 文本提取；同人免费作品多，验证容易 |
| 7 | ExHIBIT | 98 / 56 | 中：.rld 脚本 XOR | 需实物 |
| 8 | ShiinaRio | 301 / 42 | 高：WARC 按作品加密 | GARbro 兜底已可用，暂不自写 |
| 9 | Silky's / KaGuYa / Entis / CMVS / SakanaGL / Diesel / PIX / Tmr-Hiro | 各 30–130 | 中到高 | 逐个需实物 |
| 10 | 商业乙女自研引擎（Otomate PC、Aksys/IFI 移植、Rejet、DDSystem、honeybee） | 用户点名的乙女 | 未知 | 需要实物；先给目录文件清单即可判断引擎 |

## 本轮实现

- 🆕 **Majiro** 读取器（`majiro.cjs`）：MajiroArcV1–V3、加密/明文 .mjo、按操作数表精确遍历字节码；GBK 汉化补丁按场景配对
- 🆕 **Ren'Py 无源码版**（`renpy-rpyc.cjs` + `scenes.cjs`）：.rpyc / .rpa（RPA-2.0/3.x），自写 pickle 解码（不执行代码）；编译版 tl 按 translate id 配对，字符串表按原文配对
- 🆕 **TyranoScript** 读取器（`tyrano.cjs`）：散文件、Electron app.asar、NW.js package.nw、exe 尾部 zip；名字行、ruby、代码块、块注释；不再被 KiriKiri 读取器误读
- 🆕 **Softpal ADV** 读取器（`softpal.cjs`）：data.pac + SCRIPT.SRC / TEXT.DAT 解密；本机 時計仕掛けのレイライン 只读实测 33102 行
- 🆕 **检测表**：补齐 6 个「能读却认不出」的引擎，新认 25 个引擎
- 🆕 **GARbro 兜底白名单**：QLIE、ShiinaRio、Entis、AliceSoft、Marble、rUGP 的归档原来连兜底都进不去
- 测试：`validation/e565-engine-readers.test.cjs`，合成夹具 `validation/helpers/engine-fixtures.cjs`（按规格写的编码器：MajiroArc/mjo、zip、asar、pickle、rpyc、rpa、Softpal PAC + TEXT.DAT 加密）

为什么没走适配包：适配包（`services/adapter-packs.cjs`）是按游戏匹配的声明式数据（容器 + 变换 + 正则/串表语法），适合「已有引擎读取器、某款游戏换了密钥或布局」。新引擎需要字节码遍历（Majiro）、pickle 解码（Ren'Py）、成对文件解密（Softpal）、zip/asar 容器（Tyrano），超出包格式能力（例如 Majiro 的 1024 字节 XOR 密钥超过包的 512 位十六进制上限），所以做成内置模块。以后这些引擎里个别作品的变体可以用适配包补

## 需要实物才能完成的

- **必须有实物**：AST（剧本语法）、Malie、ExHIBIT、Rejet Engine、DDSystem、Otomate / Idea Factory PC 版、Aksys/IFI Steam 移植、honeybee、Vitamin、Primula、Kaleido ADV Workshop、SakanaGL、Luca System。其中商业乙女几项**只要目录文件清单**（`dir /s /b` 的输出，不用游戏本体）就能先判断引擎
- **有实物更稳**：NeXAS（确认 .bin 布局）、CMVS（新版 cpz7）、LiveMaker（验证 LSB 提取）
- **按规格实现、还没碰过真游戏**：Majiro、TyranoScript（asar / NW.js 版）、Ren'Py 编译版、System-NNN、codeX RScript（Liar-soft）。任何一款都可以；Tyrano 和 Ren'Py 有大量免费作品
