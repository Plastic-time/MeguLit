# LiveMaker 有界离线解析核心

本候选提供显式调用的 VF archive、LSB117 和 TpWord105 解析核心。没有加入 registry READERS 或 scenes.ENGINES，没有目录扫描、自动下载、游戏 hook、seed 或 pack 变更。用户 #729 只有脱敏 save.dat 摘要，缺 exe/footer/LSB 原始证据，本候选不能宣称该作已经适配

## 来源与版本

格式依据 [pylivemaker ceeb12911c571fe6da77107bb0eaf7eb29594612](https://github.com/pmrowla/pylivemaker/tree/ceeb12911c571fe6da77107bb0eaf7eb29594612)，作者 Peter Rowlands 与 tinfoil，GPL-3.0-or-later。主源 archive.py 的 VF/offset/CRC、lsb/command.py 的 TextIns 命令、lsb/core.py 的表达式与 lsb/novel.py 的 TpWord 布局用于本次移植

validation/fixtures/livemaker 只包含上游公开 tests/data 的两个微型归档和两个教程 LSB，逐文件 URL 来源、SHA256 和长度在 manifest.json，许可全文保存在 COPYING。test.exe 是70 bytes 的 MZ+归档测试容器，不是真实游戏 PE，从不执行。没有复制或读取用户存档 save.dat

## 显式 API

```js
const LiveMaker = require('../services/original-engines/livemaker.cjs');
const a = LiveMaker.archive(fileOrBuffer);
try {
  for (const e of a.entries.filter(e => /\.lsb$/i.test(e.name))) {
    const result = LiveMaker.parse(e.read());
    // result contains static file-order text, not the game's current displayed text
  }
} finally {
  a.close();
}
```

archive 的文件形式只打开明确提供的单个文件，有限位置读，保留同一 fd；fstat 元数据变化则拒绝继续读取。调用方必须 finally close。Buffer 形式同样有界，调用方不得把可变 Buffer 当原子快照。文件元数据复核也不是对并发原地 ABA 改写的绝对证明，CRC 仅为格式校验，不是安全身份

默认最大单文件2GiB、索引1MiB、4096 entries、单名称1024 bytes、单条压缩8MiB、解压16MiB，整个 archive 实例累计读取64MiB、返回解压64MiB。重复 read 计入累计预算，失败解压占用其输出配额；传入 limits 只能收紧这些值。解压使用 maxOutputLength 并要求消费完整压缩条目，拒绝 zlib 尾部多余数据。它们是同步计算/字节上限，不声称任意 OS 文件 I/O 都有墙钟超时

支持 VF100/101/102 目录、单文件或 MZ 尾部 archiveOffset+lv 附加包、NONE/ZLIB 与原始压缩字节 CRC32。Pro ENCRYPTED/ENCRYPTED_ZLIB、非零 encrypt flag、跨卷高偏移明确返回 unsupported，未实现猜 key 或泛化 unscramble。未知版本、ZIP/其它 magic、坏 footer、重叠/逆序/越界 offset、路径穿越/绝对路径/保留设备名/大小写重复、非法 CP932、校验失败都抛出带 LIVEMAKER_ 前缀 code 的错误，不落盘解包

索引可列出未支持的加密条目，其 read 必须拒绝，调用方不能把这些条目省略后声称全游戏完整读取。dat 可以没有末尾 footer，上游 test.dat 的完整 payload 恰在62 bytes结束，最后6 bytes 为可省略的 lv footer；测试明确保留这一合法前缀

## 严格脚本范围

parse 只接受 LSB117、64×22参数表；逐条消费实际命令头和相应参数，最后必须刚好到文件末尾。支持的命令为 If/Elseif/Else、Label、Jump、Call、Exit、Wait、Calc、VarNew、TextIns；其它命令立即拒绝整段，不返回前面已经提取的半份 lines。表达式只验证已知序列化布局，不执行代码、函数、变量或外部脚本

TextIns 按声明长度解析 TpWord105，并验证其后四个表达式。TpWord 只支持 char、div、return、indent/undent、event；变量 glyph、图片与其它未知 glyph 拒绝。CP932 字符逐 glyph 解码，校验 decorator/link/condition 索引，保留 decorator/ruby/condition/link/event 元数据。LINE 保持块内换行，PAGE/PAUSE/CLEAR 和已知结构边界结束文本块；末尾有效文字也会 flush，避免上游 no-final-break 的丢尾现象

结果为静态文件顺序文本与 command/line/glyph provenance。它不计算路径条件、动态变量、当前 display、页面坐标、角色或翻译配对，不保证所有条件分支会在一次游戏中显示。只有 TextIns 自身的 mute 标记会排除该段输出，不模拟控制流或父层 mute。姓名事件仅保留为 nameLabel，不作原生角色识别承诺；图片菜单和动态菜单尚未支持

## 验证与接线门槛

运行 `node --test validation/livemaker.test.cjs`，只进行本模块和官方微型 fixture 的纯 Node 测试。含真实完整教程的11条命令→6段 CSV oracle、主脚本20条命令→0正文、所有脚本前缀截断、未知末命令不返回先前正文、未知 glyph/版本、路径/索引、校验、解压 bomb/累计预算、句尾与姓名受控单位、显式文件 fd 清理与变化检查；所有合成单位明确不是健康实机

目前不能直接给 registry/scenes 加映射。现有 scenes.detect 只要一段可读就选 reader，read 又会吞单段 parse 错误；若简单接入，会让部分未知 LSB 静默缺失。下一步应在实际游戏样本上证明 exe index、所有 LSB/版本/模式与总预算，并设计整个游戏的未知命令/缺卷显式失败状态，然后才实现 scenes/sources/archives 接口和 registry 映射，保留这个严格 core，不降级成通用扫字

没有游戏、GUI、COM、native/fullbuild、remote 或 CI 操作；#729 实机与实际脚本仍未验收
