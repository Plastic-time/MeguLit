# XP / VX Ace 正文候选，不是实机通过

2026-11-22 第二轮，工作树 `H:/MeguLit-Work/wt/engine-rgss`，分支 `codex/engine-complete-rgss`

## 时间与范围

08:29–08:32 先查成熟实现，08:32 按主线程要求暂停 XP/Ace、优先修 VX。08:46 恢复源码阅读，09:02 时钟核对后才开始 XP/Ace 功能编辑；VX 修复时间不计入十五分钟门。审计 metadata 在私有 `H:/MeguLit-Work/reports/engine-rgss-round2-20261122-0828/xp-ace-audit.json`

重新核对 E:/GAL、E:/Steam/steamapps/common、H:/MeguLit-Work/samples 与既有 E/H 工作区，完整 RGSS 样本仍只有已固定的 VX《魔女の家》。arc_unpacker 的 55 字节 rgssad、98 字节 rgss3a 是格式测试夹具，不是完整 XP/Ace 游戏。本轮不下载新游戏，不改现有游戏文件

只有私有 RubyInstaller 4.0.10，没有原版 RGSS1 Ruby 1.8、RGSS3 Ruby 1.9.2。因而本轮产出严格限于候选脚本、格式变换与 API/消费链回放，没有给 XP/Ace 开生产启动权限，没有将文件名声明当成 DLL 验证

## 实际实现

- `core/rgss-variants.cjs` 把 DLL 名与 Scripts 扩展名的声明对应到 XP/VX/Ace，返回 `verified:false`，冲突直接拒绝，不读或信任 DLL 内容
- `core/rgss-page.cjs` 默认入口固定 RGSS2；XP/Ace 只能显式调用 `candidatePageScript`。候选在包装窗口或触及 Win32API 前检查 Ruby 1.8/1.9 世代，Ruby 4 自动启动被拒绝。未替换或伪造 `RUBY_VERSION`
- XP 不要求不存在的 Bitmap.clear_rect、Graphics.width/height、Window.openness。无尺寸查询时仅候选标准 640×480。正文根据 choice_start/choice_max 排除标准 32 像素行中的内联选项，超出四行或页中改变的选择状态拒绝整页；pause 或有效选项 active 时才提交已绘制正文
- Ace 使用窗口当前 padding，而不是 VX 的固定 16。它的 Window_Message 可以直接继承 Window_Base；正文完成可来自 pause，或本消息窗口持有、反向指回该窗口、可见且激活的 Window_ChoiceList。选项、菜单不作为正文输出
- 保留 Ruby 1.8 语法，force_encoding/bytesize 仅在 respond_to? 后使用。发送缓存为 binary，使 Ruby 1.9 下 partial-send 的字节偏移不按 UTF-8 字符计数。Ace 候选脚本第一行显式 UTF-8，只支持此编码候选
- `patchArchiveV3` 仅替换目标的加密 payload 并修正索引 size/后续 offset，不改名字、file key、其他加密内容、顺序或额外间隙。限制归档 64 MiB、索引 16 MiB/20000 项、名字 1024 字节、替换 8 MiB，拒绝索引侵入、重叠、截断和错误目标。没有接到生产副本准备
- 原受限 Marshal patchMain 已能保留 `I"` 字符串编码 ivar 与 symbol links，本轮用显式 UTF-8 名称、US-ASCII packed-string 元数据夹具及 Ruby Marshal 消费检查，未重写其他脚本或元数据

角色坐标仍是逻辑字体单元，hidden=0；名字、内嵌、游戏 ruby、自定义位图搬运/独立 Sprite、非标准 XP 窗口布局与其他文本编码不在候选证明内

## 实际阅读的成熟源码

均只用于 API/加载/格式参考，没有复制第三方实现；不引入新的 vendor 文件

| 来源与固定提交 | 实际阅读 | 决定 |
|---|---|---|
| [RPGMakerTrans](https://github.com/dreamsavior/rpgmakertrans/tree/796aa941d14131093d92b389d2ce627e55f4e027)，GPL3 | rbpatcher/rubyscripts/main.rb、socketcall.rb、patcher.rb 的载入、Scripts 三列/Zlib、字符串和网络段；blob d7d434db / d779be20 / 1e128669 | 属于离线 Ruby patcher，require_relative/force_encoding/阻塞 TCPSocket 不移植到 RGSS1 帧回调 |
| [mkxp](https://github.com/Ancurio/mkxp/tree/6a875b30d20728cf67f3690bef4c006790f4d682)，GPL2 系列 | README、Window1/WindowVX、Graphics、Bitmap、viewport binding、WindowVX padding 与 contents offset；blob 99fceab4 / d25c0436 / 5a807a13 / e8be9a89 / 362845df / 05d629d2 | 区分 XP 缺失接口、Ace padding；现代 MRI 兼容层不是原版 VM 的证明，不复制 GPL2 实现 |
| [taroxd/RGSS](https://github.com/taroxd/RGSS/tree/371dc12c7f3ed71a7136846f91b56edf950caffd)，MIT | rgss3/fast_message.rb 的 Window_Message/input_pause/Fiber 流程，blob c820ed3c；core helper 只读相关 def_after | 沿用游戏已有 pause 完成信号，不改变 Fiber 调度 |
| [Bernd Hagen XP script](https://github.com/BerndHagen/RPG-Maker-XP-Script-Library/blob/a93c71262cb8e0d30f6578139e76d326f838774f/04-Typewriter-Message-System/Window_Message.rb)，仓库 MIT | 104–184、286–325 等消息绘制与选择激活段，blob f21f8eae；LICENSE 5b731b1a | 仅核对 32*y 绘字、choice_start、完成后 active/pause，不复制引擎基础脚本 |
| [Galv Visual Novel Choices 1.9](https://galvs-scripts.com/galvs-visual-novel-choices/) | 作者页面的 Window_ChoiceList start/refresh/activate、message_window 与 padding | 证明选项分窗与逐字 draw_text_ex 不能冒充已分组正文，不复制或下载 demo |
| [RPGMakerDecrypter](https://github.com/uuksu/RPGMakerDecrypter/blob/465c88c304cac0b1516a3fbfb0b2a87fb0517736/RPGMakerDecrypter.RGSSAD/RGSSADv3.cs)，MIT | RGSSADv3.cs 全部索引/名字解密，blob 1b09c1b4；LICENSE 5e2bb901 | 与仓库已有只读格式交叉核对，自写仅 payload splice writer |

另核对 [Ace 官方 Ruby 1.9.2 说明](https://www.rpgmakerweb.com/products/rpg-maker-vx-ace)、[Ruby 1.8.6 String](https://ruby-doc.org/core-1.8.6/String.html)、[Ruby 1.9.1 String](https://ruby-doc.org/core-1.9.1/String.html) 以及 [Ruby-core magic comment 讨论](https://archive.ruby-lang.org/ruby-core/12040)。lunajspatch 已确认是 MV/MZ JavaScript，不能替代 Ruby RGSS

## 检查与未完成项

新增 `validation/rgss-candidates.test.cjs` 9 项全过，无跳过。候选测试先断言 Ruby 4 的启动检查拒绝且没有任何 Win32API 调用，随后在明确的函数级回放里手动安装包装、喂合成窗口。未把现代 Ruby 冒充原版 VM。XP/Ace 的两页 transcript 都进入实际 RgssTextPath 与 HookNative.emitSource，未启动 native helper、游戏或 Reader GUI

v3 检查首/中/末成员增长与缩短、奇数字节、原 Buffer 不变、其他加密字节不变、索引名字/key 不变，以及截断/重叠/错误目标/预算拒绝。Marshal 消费检查编码元数据与非 Main 字节保留

另用 XP 裸字符串 Marshal/v1 及 Ace 编码字符串 Marshal/v3，串起归档读取、Main 前缀写入、归档重新读取和现代 Ruby eval 数据回放；候选拒绝自动安装，原 Main 标记仍执行，Win32API 调用数为零。这仍是合成归档和宿主替身，不是游戏加载器验收

主测试需显式设置 `MEGULIT_RUBY` 为私有 4.0.10；完整 VX 相关回归还需 `MEGULIT_RGSS_SAMPLE` 为保留的 majonoie1_09a。最终相关日志、语法 manifest 与提交收据在同一 round2 私有报告目录，收尾追加最终计数

下一步仍需要完整 XP/Ace 样本、对应原版 Ruby/DLL 与实际 Main/消息类核对，才能讨论将其加入窄 allowlist 和副本启动。本轮没有实机通过、没有完成完整七项、没有修改 E 测试安装目录或 CI
