# Majiro 本轮第三方补充

本轮没有下载新第三方代码，未从上游复制实现

- 现有 opcode 表和对象头来自本仓库 `services/original-engines/majiro.cjs`，基线 `ba00434c`，其来源说明为 AtomCrafty/MajiroTools，MIT，精确路径 `src/MajiroLib/Script/Disassembler.cs`、`Opcode.cs`、`Crc.cs`，仓库 `https://github.com/AtomCrafty/MajiroTools`
- 现有归档读取器的来源说明为 morkt/GARbro，MIT，精确路径 `ArcFormats/Majiro/ArcMajiro.cs`，仓库 `https://github.com/morkt/GARbro`，本轮只复用已有 JS 读取器
- 只读对照的 LunaHook 适配保留在 `preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engine32/Majiro.cpp`，本仓库最后变更 `e46db5937a0d32156110c2ef8b073a6ea1ad0521`，vendored `version.txt` 为 `12.1.3`，GPL-3.0，既有归属见 `THIRD-PARTY.md`，项目 `https://github.com/HIllya51/LunaTranslator`，未据 font split 猜测角色
- 本轮真门回放复用 `native/shared/minhook`，MinHook 1.3.3，Tsuda Kageyu，BSD 2-Clause，许可证仍在 `native/shared/minhook/LICENSE.txt`

以上未声称新的上游 commit 或上游当前版本，固定的是本轮实际读取的本仓库源码
新增结构化读取器与合成测试为本项目实现，使用 GPL-3.0-or-later
