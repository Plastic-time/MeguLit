# 引擎家族：哪些引擎能一起解决（2026-11-14）

查重的结论：引擎之间差别比想象的小。拆开看，一个读取器只有四块：**容器**（归档索引）、**变换**（解密 / 解压）、**文本模型**（剧本里台词怎么存）、**编码**（SJIS / GBK）。这四块现在都在共享工具包 `services/original-engines/kit.cjs` 里（E573），所以剩下的引擎按「文本模型」分家族做，一个家族一套代码，每个引擎只是一份参数表。

## 查重结果（50 个现有读取器）

| 重复的东西 | 份数 | 现在 |
|---|---:|---|
| SJIS / GBK 判定 | 12 | `kit.codepage` / `kit.decoder` |
| 假名判断正则 | 24 | `kit.KANA` / `kit.hasKana` |
| 按偏移读文件 | 25 | `kit.readAt` / `head` / `tail` |
| LZSS 解压 | 3（适配包、AST、AQUAPLUS） | `kit.lzss`，窗口 / 起点 / 填充 / 标志位顺序 / 长度位都是参数 |
| 字节 / dword 异或循环 | 18 | `kit.xor` / `kit.xorDword` / `kit.rol` |
| 归档索引解析 | 每个引擎一份 | `kit.table(file, spec)`，声明式：魔数、数量、定长 / 长度前缀 / C 串名、名字加密、偏移基准、大小取下一项 |
| scenes / archives / sources 样板 | 每个引擎一份 | `kit.engine({...})` |
| 通用假名扫描 | 2（GARbro 兜底、AST） | `kit.decodeRuns` |

已改用 kit：Majiro、Softpal、System-NNN、Liar、AST、GARbro 兜底、适配包运行时。老读取器（BGI、YU-RIS、CatSystem2 等）行为已被实机验证过，暂不动，以后改到哪个顺手迁哪个。

## 家族

### A. 字符串表 / 指针表型（`kit.stringTable` / `kit.pointerTable`）
台词集中存在一张表里，脚本按序号引用。按表顺序或按引用顺序出行即可，**不需要每个作品的完整指令表**，最稳。
- 已有：Liar（codeX RScript）、System-NNN、Softpal、AliceSoft System4（AIN MSG）、HuneX（ctd）、AQUAPLUS（KCAP）
- 待做：Yuka（.yks 数据段）、CMVS（.ps3 字符串段）、LC-ScriptEngine（.snx 字符串表，待确认）

### B. 操作码流 + 内联字符串型（`kit.opcodeWalk`）
文字直接跟在操作码后面。只要一张「操作码 → 操作数宽度」表，遍历器共用；同一家族的不同版本只是换表。
- 已有：Majiro、BGI、FVP、AdvHD、AVG32、RealLive
- 待做 **Silky 家族**：Silky's（.mes）、AI5WIN、AI6WIN —— 同一作者的工具共用一个 silky_mes 基类，操作码 1 字节，0x0A（压缩假名串）/ 0x0B / 0x33 带字符串，AI6WIN 只是另一张表 → 一个读取器 + 三张表
- 待做（调研中）：Ikura GDL（ISF）、Lucifen、KaGuYa、NEKOPACK、Tmr-Hiro、Escude（ACPX，同作者有工具）

### C. 解包后是明文脚本（`kit.lineGrammar`）
归档一解开就是带标签的文本，差别只在注释符、命令前缀、名字写法、ruby 写法 —— 都是 lineGrammar 的参数。
- 已有：KiriKiri、TyranoScript、NScripter、Artemis、Ren'Py（.rpy）
- 待做：QLIE（.s，组 3）、EAGLS（解密后明文）、Interheart（待确认）
- 这一类大多能直接做成**适配包**（容器 + 变换 + 行语法），不用发版

### D. 事件命令型（RPG Maker 家族）
台词是事件命令 401（显示文字）、102（选项）。MV/MZ 存 JSON，XP / VX / VX Ace 存 Ruby Marshal 进 rgssad 归档，**命令语义完全相同** → 共用一个事件遍历器，只加 RGSSAD 解包和 Marshal 解码。
- 已有：MV / MZ（rpgmaker.cjs）
- 待做：XP（.rgssad / .rxdata）、VX（.rgss2a / .rvdata）、VX Ace（.rgss3a / .rvdata2）

### E. 按作品密钥的归档（复用 GARbro 的方案库）
剧本格式不难，难在每部作品一个密钥。GARbro 的 `Formats.dat` 已经收了这些密钥；MeguLit 已经这样做过 KiriKiri cx（cx-schemes.json）和 Musica PAZ（paz-schemes.json）。同一做法：把对应引擎的方案导出成 JSON，读取器按目录匹配，新作品的密钥用适配包 `params` 下发。
- 适用：ShiinaRio（组 2）、Malie（组 2）、CMVS（cpz 归档）、ExHIBIT（.rld 密钥）、EAGLS（若有按作品密钥）

### F. 框架型（不是 VN 引擎）
Unity、Godot、Unreal、DxLib、Adobe AIR：剧本格式由各作品自己定，按框架内的 VN 插件做（Unity 已按 Naninovel / Utage / 各厂分开），不按引擎做。

### G. 没有公开资料，需要实物
AST 剧本、SaiSys、SystemC、Diesel、PIX STUDIO、SakanaGL、rUGP（âge 自研，体量大）、Rejet、DDSystem、Otomate / Aksys 移植。先只做检测。

## 分工（按家族，不按引擎）

| 家族 | 谁 |
|---|---|
| D（RPG Maker XP/VX/VX Ace）、B 里的 Silky 家族 | 本会话 |
| A 待做 + B 其余（调研结果决定） | engine-readers-d / engine-readers-e，按调研笔记重新分 |
| E 按作品密钥 | 与组 2（ShiinaRio、Malie）合用一套 GARbro 方案导出 |
| C 明文型 | 优先做成适配包 |
