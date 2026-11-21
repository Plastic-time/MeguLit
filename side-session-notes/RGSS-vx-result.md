# RGSS XP / VX / VX Ace 有界适配审计

- owner：本聊天，从RPGM MV/MZ转RGSS；不创建agent/chat，不push/main/PR/CI，不重试被拒路线
- 任务开始2026-11-22 07:18:02.996 JST；90分钟截止08:48:03，最晚08:38收束
- 新工作树H:/MeguLit-Work/wt/engine-rgss，创建前路径不存在；branch codex/engine-complete-rgss；fresh fetch origin/main为7a41ff9a9c3632c9f143f01b455085c1d6e4a854，与既有空分支同基线，无覆盖或reset
- 旧RPGM工作树clean，HEAD ff1063a074b9bcd8fcddbc06fbd5d18240e0272f，保留不动
- 初检H61.25/C30.24/E13.84GiB；不写正式游戏/存档/DB，未启动游戏。新部署要求和H>10GiB门满足后，07:26从作者明确链接的Freem免费完整VX版取得独立样本，见下；不登录、不付款、不绕过年龄/安全验证
- 实际有序源码阅读从07:18:38前开始，保守功能修改门设07:34:05；在此之前仅只读调查与报告，不写功能，不伪造15分钟用时
- 先读docs/engine-draw-native.md/matrix；真实历史笔记E:/Apps/MeguLit-Git/ENGINE-ADAPTATION-NOTES.md 609行、109110字节、SHA256 3f80107f0cc1567321c14b6178d0822194c4c1a375ccfb98c5ac3ecaa56ffa0e，分段读完整，未用短版覆盖/force-add

## 有序开源审计

1. LunaTranslator/LunaHook本机a744a80fc2b99ea5852d4da2bd157afdc9e628f0，GPL3，实际读src/NativeImpl/LunaHook/LunaHook/engine32/RPGMakerRGSS3.cpp及.h：ScenarioHook观察UTF8参数对象、临时指针替换后还原；ChoiceHook/OtherHook读其他文字，名字使用【】启发式，不携可靠屏幕坐标/游戏ruby。RGSS300/301还有GetGlyphOutlineW触发兜底。engine32/RPGMaker.cpp实际是game.dat+PSL文件，不是RGSS，不能按名字误用。仅参考状态/ABI风险，无复制
2. VNR实际镜像Dangetsu/vnr d2b9bad6af9577f639ce47171d506c9fbf401984，License.txt GPL3；实际读Frameworks/Sakura/cpp/plugins/vnragent/engine/model/rgss.cc 494-730及attach实现，blob0dbf2fd257ab73200fad59a0655d297597469eff；也是UTF8 HookArgument、行拆分、名字启发、临时替换/恢复。vnrhook的match.cc忽略rgss3a不等于整个VNR无RGSS，实现位于vnragent。仅参考概念，不复制
3. Textractor本机df5b830d1757a66aa162f8081e99d42c9bd50488，GPL3；实际读texthook/engine/match32.cc721-725：RGSS3归ignore；engine.cc8950-8989的VX/TRGSSX说明位于WolfRPG注释内，不能当可靠RGSS内部角色/坐标实现。match.cc为通用入口。没有可直接移植的可靠内部坐标代码，仅参考覆盖边界
4. RPGMakerTrans实际仓库dreamsavior/rpgmakertrans 796aa941d14131093d92b389d2ce627e55f4e027，README声明GPL3；实际读rpgmakertrans/README.txt（XP/VX/Ace静态patch、UTF8与titlebar区别）和librpgmakertrans/workers/rbpatcher/rubyscripts/matcher.rb（blob27209aef9a034d144133c6c53b21089debf59284，事件页/common/troop与terms/name字段schema）。它是离线数据翻译，并未解决实际绘制窗口/坐标。仅参考数据来源，不复制
5. 本仓库preserved/source/lunahoook-adapted/NativeImpl/LunaHook/LunaHook/resource/lunajspatch.js69-150及210-225：Utils.RPGMAKER_NAME触发JS Window_Message/Bitmap包装，是MV/MZ NW.js；不用于RGSS1-3 Ruby运行时，不能拿此脚本假接线

## 本机样本与当前接线

- E:/GAL、H:/MeguLit-Work/samples、E:/Steam/steamapps/common文件名扫描，尚未找到RGSS1/2/3 DLL、rgssad/rgss2a/rgss3a、Scripts.rxdata/rvdata/rvdata2或RPG项目文件；不将repository synthetic fixtures当真样本
- E:/yume只有lsd存档与截图，不是RGSS证据；Enterbrain Common Files目录未发现安装
- services/original-engines/rgss.cjs现有只读RGSSAD1/3+Ruby Marshal reader，复用rpgmaker事件解析。validation/e574-rgss.test.cjs的5项是人工构造fixture，不是实物
- 07:34:12.684功能前时钟已超过保守15分钟门。至此未写功能，只有读源码/只读数据解析、独立样本部署与报告；继续按实际Ruby脚本确认加载路径，不走任意后台线程RGSSEval

## 实际完整VX样本

- 作者页https://majonoie.karou.jp/a2.html明确链接https://www.freem.ne.jp/dl/win/4149，实际文件majonoie1_09a.zip，40599420字节，SHA256 189d986515c98a61c95f3d07b97c6af0d7afb273c2a5f72c282e7129654282f4
- 独立部署H:/MeguLit-Work/samples/rgss-majonoie-vx-20261122/game/majonoie1_09a；441文件、43703591展开字节，每个ZIP成员完整读过CRC；路径穿越/符号链接/超预算预检查，无覆盖旧路径；保留原ZIP和source.json，不删游戏
- Game.exe 135168字节 SHA256 771017ca0f9d18978a906d00cd4236c8e9f974f3c7388173492ed8f92901a7e8；RGSS202J.dll 855040字节 SHA256 ac186c2e0103ddf208aafe027065284ee5bebaa4be791a4a3594e349a32103bf；Game.rgss2a 18240237字节 SHA256 a316e9007e736ca8b1380c868248bbd6c83ea0c70c80a79a52d8e7ea4ac3c4aa
- Game.ini实际Library=RGSS202J.dll、Scripts=Data\\Scripts.rvdata、RTP空；DLL的PE导出有RGSSEval/RGSSGameMain/RGSSInitialize2，但代码并非直接可读简单ABI，未把导出名当线程安全证明
- 只读既有reader：归档446成员，118个事件场景，共1324条文本。另用限定数组/整数/字符串类型的Marshal解析器在内存读129段Ruby，inflate累计862327字节，每成员<8MiB/累计<32MiB；没有Marshal.load/eval或执行游戏代码
- 真实Window_Message继承Window_Selectable，另有“メッセージ表示フルグレードアップVX”和“選択肢拡張”覆盖；实际选项类Window_Choice，不是MV/MZ或Ace的Window_ChoiceList，故不可搬旧类名假覆盖。Main最后通过$scene启动，Main源码SHA256 1ddd3591fc3025e4f09646cc0bae0e411a7770c6ecf6dc5c4babe2cc2a3e806c
- 额外补充taroxd/RGSS 371dc12c7f3ed71a7136846f91b56edf950caffd的misc/rgss_player.cpp及LICENSE.txt（MIT）仅参考初始化→RGSSEval→GameMain顺序；doyaGu/RGSSPlayer 1f731de7538120d11305ddb087b238b02bcc3189的RGSS.c/.h/macros.h/README只读API对照，许可未确立不复用；没有复制新第三方代码
- 备选Mogeko作者站TLS主机证书不匹配、itch页有年龄输入，均未绕过；使用无该验证的作者明确链接免费VX样本。没有任何实际游戏/Reader/隐藏桌面/CU启动，最终体验由店主验收，若需要隐藏检查另按root槽协调

## 候选实现与复核

- `core/rgss-scripts.cjs` 仅解析受限 Marshal 数据并替换 Main 的压缩字符串，保留其他对象、元数据和原 Main 字节；`core/text-paths-rgss.cjs` 只允许固定 exe/DLL/脚本表三哈希，复制完整普通文件到独立副本，拒绝散装脚本覆盖、未知脚本/版本与目录联接
- 自写 Ruby 观察器在实际 Main 之前随游戏正常脚本流程加载，观察最终 Bitmap 绘字和真实 Window_Message/Window_Choice；pause 时通过同一代次 body 提交来源，进入生产 HookNative.emitSource，无后台线程 RGSSEval、无源文件写入
- 默认无观察脚本、端口或副本，owner switch 加 roles 精确 true 才准备。WinSock 非阻塞、部分发送、token/绑定 PID/代次、关停清理、实际 game PID、显式日文环境与快速退出重试的同副本路径已接线
- 当前15项独立 RGSS 测试全过，含真实 HookNative 无进程调用、12页、空格/压缩宽度/viewport滚动/局部清理/contents更换、短UI列表、原返回/异常、撤权、连接换代和完整语料。超预算页面整页拒绝，源提交还须精确匹配当前body的base64，避免被拒的新绘制记录提升旧文本
- 完整真实归档446成员逐一比较，除 Scripts 成员外445个成员内容一致；129脚本除Main加前缀外全部一致；原441文件前后SHA一致。Main后实际还有仅含exit的脚本段，现保留且明确允许这一种终止段，任意其他后置逻辑仍拒绝
- RubyInstaller4.0.10私有运行时仅用于合成RGSS API回放，不是原版Ruby1.8/Win32API/DirectX验收。坐标是字体单元与逻辑坐标，非墨迹像素；名字、内嵌、游戏ruby、XP/Ace和其他VX版本均未完成，不宣称完整一级或全引擎适配
- 完整范围与20句用户验收单在`docs/engine-rgss.md`，固定证据在`validation/fixtures/engine-draw-rgss-vx.json`。游戏与ZIP保留，不修改E测试安装目录，由root统一部署
- 私有报告目录`H:/MeguLit-Work/reports/engine-rgss-20261122-0718`含只供测试包合并的diagnostic-profile-template.json、static-evidence.json和notes-append.json，不写生产DB/现有用户差分
- 已向真实历史笔记`E:/Apps/MeguLit-Git/ENGINE-ADAPTATION-NOTES.md`追加1856字节，append前后前缀逐字节一致，保留各任务新增历史，没有短版覆盖或force-add笔记
- root通知main已正常推25b466ff，08:05前已fetch确认`25b466ffb46318b192d91cf8dc88e160329ab9df`；先提交本候选，再rebase和重测，CI没有发起第四轮
- 08:06实际rebase到25b466ff完成，代码候选06ff20f936e5814849be0ba28dd3640fd38827be；仅矩阵和result索引冲突，保留主线MV/KAG等全部既有报告，RGSS本报告移到side-session-notes独立保存
- 08:08主线后首轮18套182/182，无失败无跳过，日志`H:/MeguLit-Work/reports/engine-rgss-20261122-0718/related-after-rebase.tap`；全部1554受版本控制JS/CJS/MJS语法0失败，逐文件hash见同目录syntax-after-rebase.json。最后预算修正涉及的文件另做fresh语法检查及最终相关回归，待后续封存条目
