# MAGES 本轮第三方补充（2026-11-22）

本轮没有联网获取或复制新的第三方实现，所有新测试、身份工具与 stdin 扫描入口为本仓库自有代码，沿用 GPL-3.0-or-later 标识

查看并复用的固定本地来源均来自仓库基线 `ba00434c9961035ef625ebccd773de508c7122c6`

| 来源 | 固定 git blob | 本轮用途及许可证边界 |
| --- | --- | --- |
| `preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/engines/mages/mages.cpp` | `1a8ff0275576a330072ba61eee13c06cd11e2f54` | 只读区分上游 SC3 字符串 hook 与画字 hook；仓库 THIRD-PARTY.md 声明 LunaHook GPL-3.0；未新复制源码 |
| `native/megulithook/MagesEngine.cpp` | `76363af74d13c7b91917b9e02ea19832eb9d6599` | 本地 LunaHook 改编，核对 x64 分支已存在；未改该引擎实现 |
| `native/megulithook/MagesDrawSig.h` | `e5717af1bfaa6de1079671c68a93e440b33f50d8` | 既有 GPL-3.0-or-later 自有扫描器，本次只补字节范围检查 |
| `tools/engine-sigs/mages-draw.cjs` | `24e7367bb259edad21d294c4591411a3f45cc5d9` | 既有 GPL-3.0-or-later JS 扫描器，对称边界修复 |
| `tools/engine-sigs/steamstub.cjs` | `d1d53f42b6398efc74b63587da3df5c6e25cb470` | 既有独立 x86 内存解码器，仅调用，未改或复制 Steamless 源码 |

上游项目指向仓库已有声明：LunaHook / LunaTranslator `https://github.com/HIllya51/LunaTranslator`
LanguageBarrier 与 impacto 的角色/结构判断来自既有 engine-draw-native.md 历史记录，本轮没有重取上游源或补造授权结论
新增全代码匹配收据不能替代这些历史语义判断的实机证明

后续私有 DLL 构建复用本机既有 `night-1423/hooktree/src` 与 ATL，未联网获取新实现，LunaHook 的 GPL 许可证一并复制到自有 build tree
实际复制/覆盖后的944份源文件 SHA、生成构建信息与最终 DLL hash 在外部 `mages-live/combined-inputs.json`，不以产品 commit 名字替代这份组合源码事实
音频诊断读取 Microsoft 官方 `IAudioSessionControl2::GetProcessId` 返回值定义，仅引用 API 事实，没有复制外部代码
https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getprocessid
