# RGSS 的有界观察通道

2026-11-22，默认路径只支持《魔女の家》免费 VX 1.09a 的固定版本，默认关闭；隔离私测另开放已核实 XP Egomaniacs 1.04 与 Ace Soprano 1.01 的正文加载路径，见下方增量报告

已核对完整游戏归档和实际 Ruby 类，完成副本加载、正文与选项分流、权限撤销回放。还没有在原版 RGSS 运行时或真实 Reader 中验收，不能据此宣布 XP、VX、VX Ace 全部适配完成

## 版本与加载路径

版本哈希见 [rgss-vx.json](../validation/fixtures/engine-draw-rgss-vx.json)。启动同时要求主程序、RGSS202J.dll 和压缩脚本表都匹配，其他版本返回普通启动路径

必须先有 `preferences.ownTextOutput=true` 或 `gal-preferences.textRenderer=compositor`，并且这部游戏的最终差分精确含 `draw.roles=true`。`embed=true` 不授予观察权限。RGSS 引擎差分的 roles 和 embed 都是 false，没有开启游戏 seed

隔离私测现在通过 [opaque owner-test grant](owner-tests.md) 准备权限，不在 auto-profiles 中伪造 calibration。RGSS 副本登记要求模块实际生成的对象、原始归档资源 pin 及副本文件完整核对，Reader 通过已登记的 opaque 身份找回原 catalog，实际 PID/birth 保持不变，详见 [接线回放](../side-session-notes/RGSS-vx-grant-result.md)

`services/bridge.cjs` 在直接启动或日文环境启动前准备完整副本。副本包含普通文件，没有硬链接或目录联接。每个原安装路径复用自己的副本，后续启动只更新带有当前 token 的归档，不重复覆盖副本内的存档和设置。归档、exe、DLL 或启动字段被改动时拒绝复用，不覆盖未知文件

再次启动先检查副本进程，仍在运行就聚焦现有游戏，不改写运行中的归档。原目录已有存档只在首次复制，后续新存档留在副本。测试结束前要保留副本，不能当临时文件删除。关闭观察后普通启动仍使用原目录，若要继续副本进度，需先核对和迁移存档，本轮不自动覆盖原存档

观察脚本加在副本归档 `Data/Scripts.rvdata` 的唯一 `Main` 段之前，原 Main 字节接在后面。Main 后只允许空段或精确的 `exit`，不会移动、删除其他脚本。散装 `Data/Scripts.rvdata` 会覆盖归档时拒绝此路线，避免改了归档却没有加载它

游戏仍按原 Game.ini 加载同一个归档成员，观察脚本随正常脚本流程执行。没有 DLL 注入、任意线程 RGSSEval 或对原目录的写入。日文环境重试也使用副本，启动失败会关掉监听，成功后监视实际游戏 PID

## 记录内容

| 项目 | 本轮行为 |
|---|---|
| 正文 | 观察实际 Window_Message.contents 的 Bitmap.draw_text；保留空格和游戏换行 |
| 正文来源 | 已绘制正文且 Window_Message.pause 为 true 时提交一次来源；通过当前 body、连接、PID、代次和 Reader 身份检查后进入 emitSource |
| 坐标 | Window 笔位、contents 偏移、viewport 原点与滚动，再按 text_size 的前缀宽度计算压缩后的字体单元；是 Graphics 逻辑坐标，非墨迹像素验收 |
| 选项 | 该样本真实的 Window_Choice，保留 draw_item 的索引与选中状态 |
| 菜单、系统文本 | Window_Selectable 和 Window_Help 的文字框，作为 UI 注释记录 |
| 名字框 | 没有独立可靠证据，不按短字符串或括号猜名字 |
| 内嵌、游戏 ruby | 没有实现，保留 Reader 处理；所有记录 hidden=0，不确认原文隐藏 |

这条来源不会垄断或禁用已有 LunaHook 来源。未进入 pause 的自动推进文本仍只有绘制观察，不能把它写成完整消息来源。独立 Sprite、blt 搬运的文字、任意插件类、特效遮挡和实际窗口缩放都没有泛化证明

通用文字隐藏不属于这个观察器。首次观察验收应先关“隐藏游戏原文”，确认游戏原文和 Reader 文本后，再单独检查已有隐藏功能，不能把 hidden=0 改成 1 来通过验收

## 通信与关闭

游戏用 Win32API 建立非阻塞 localhost TCP，通过 select 的零超时检查连接完成。Graphics.update 不写文件、不等待网络。部分发送在后续帧继续，原 draw_text、clear、dispose、update 的返回值和异常保持原样

HELLO 携带随机 token 和声明 PID，父端将 PID 与当前 Hook 游戏绑定核对。这是本机协作通道，不是操作系统提供的 TCP 对端 PID 认证。父端仅接收当前代次的记录

最多 128 个窗口、每窗口 40 个 UI 文字框、每正文 1000 个字体单元，收发缓冲限制 64 KiB，最多四条连接。关闭 roles、断线或换 PID 会立即清掉父端缓存并拒绝旧记录；Ruby 在下一次收到 CFG 时停止采集。重新开启后需要游戏重绘已经清掉的内容

`clear`、`clear_rect`、contents 替换、窗口隐藏和 dispose 会退休相应绘制记录。UI 按窗口分组和快照行号更新，短选项列表覆盖长列表。关闭仅清理观察坐标和 UI，不删除阅读历史

## 验证

```powershell
$env:MEGULIT_RUBY='H:/MeguLit-Work/deps/rgss-ruby-validation-20261122/runtime/rubyinstaller-4.0.10-1-x64/bin/ruby.exe'
$env:MEGULIT_RGSS_SAMPLE='H:/MeguLit-Work/samples/rgss-majonoie-vx-20261122/game/majonoie1_09a'
node --test validation/engine-draw-rgss.test.cjs
```

本机 VX 17 项通过，无跳过，包含实际 HookNative、生产 launch 聚焦旧副本、正常库启动经 opaque grant 准备副本并绑定 Reader 的无进程回放，以及超预算页面拒绝。完整样本检查遍历 446 个归档成员，核对 129 段脚本，确认只有 Main 增加前缀；复用保留新存档和设置；原目录 441 个文件前后哈希一致。既有只读剧本解析得到 118 个场景、1324 条文本

Ruby 回放使用私有 RubyInstaller 4.0.10 和合成 RGSS API，没有执行游戏脚本。这证明包装和协议逻辑，不证明 RGSS 的 Ruby 1.8、Win32API、DirectX 或真实画面已经通过

## 给总测试包的验收单

保留完整样本和原 ZIP，不发布游戏文件。总测试包通过自己的 owner-tests manifest 为原 exe 路径核对哈希 `771017ca0f9d18978a906d00cd4236c8e9f974f3c7388173492ed8f92901a7e8`、完整 Game.rgss2a，并请求 roles 权限及 `draw.roles=true, draw.embed=false`。旧 calibration 模板不部署，不能覆盖用户已有差分或生产数据库

1. 通过测试包导入上述原 Game.exe，先关隐藏游戏原文，再由 MeguLit 启动。记录实际副本路径，之后在副本内产生的存档要保留
2. 标题菜单必须能操作，注释对应原有菜单，不出现正文伪台词。日志应有 `text-paths-rgss` 和 `text path rgss: observer on owner=`，仅生成副本不算加载成功
3. 进入游戏推进至少 20 句，等待翻页提示后核对正文、换行、点读和译文；`engine-draw.log` 中应有 `engine=rgss hidden=0`，Reader 来源应标记 `rgss`
4. 遇到选项时核对完整选项、选中状态和译文，点击必须仍由游戏处理。菜单和选项不能作为正文来源
5. 翻页、打开关闭菜单、改变窗口大小，确认旧坐标和旧选项退出。坐标需与截图逐项对照，不能只看日志数量
6. 临时关闭该游戏的 draw.roles，确认 Reader 不再接收新观察，旧记录被清掉。重开后推进或重绘；再关闭游戏，确认连接退出
7. 名字、内嵌和游戏 ruby 记为本轮不支持。XP、Ace 和其他 VX 版本继续走原有剧本/LunaHook 路径，不算本轮通过

保留测试包根目录的 `logs/game-launch.log`、`logs/hook-events.log`、`logs/engine-draw.log` 和 `logs/reader-host.log`。本轮没有启动游戏、Reader、HidDesk 或 CU，没有任何实机通过结论

## 源码参考

审计顺序为 LunaTranslator/LunaHook、Dangetsu/vnr、Textractor、dreamsavior/rpgmakertrans、仓库 preserved lunajspatch。前四者按 GPL3 仅作概念与边界参考，没有复制新代码；lunajspatch 属于 JS MV/MZ，不能用于 Ruby RGSS

VNR 的 RGSS 实现在 vnragent，vnrhook 忽略 rgss3a 不代表整个项目不支持。Textractor 的 VX H 码说明位于 WolfRPG 注释内，不能当坐标实现。导出 RGSSEval 也不能证明任意线程调用安全

## 第一阶段 XP / VX Ace 正文候选记录

09:14 封存阶段新增 `candidatePageScript({generation:1|3,...})`、只做声明核对的 `declaredVariant` 和有界 `patchArchiveV3`。当时没有开放 XP/Ace 游戏加载。后续完整样本带来的隔离私测增量见文末；生产默认及既有只读剧本解析仍独立工作

| 世代 | 原运行时 | 候选处理 | 当前证据 |
|---|---|---|---|
| XP / RGSS1 | Ruby 1.8 | 缺少 clear_rect 时不包装它；没有 Graphics 尺寸接口时只按标准 640×480；正文剔除 choice_start 后的 32 像素选项行，异常或页中改变的选项状态拒绝整页；pause 或有效选项激活时提交正文 | 无完整游戏，无原版 Ruby，只有 Ruby 4 合成接口与生产消费链回放 |
| VX / RGSS2 | Ruby 1.8 | 固定完整样本走上文的副本与 opaque grant 路线 | 完整文件静态核对和回放，原版 Ruby 与游戏 UI 仍待验 |
| VX Ace / RGSS3 | Ruby 1.9.2 | 读取实际 padding，正文完成信号可来自本 Window_Message 所有且可见、激活的 Window_ChoiceList；显式 UTF-8 候选前缀，有界 RGSSAD v3 脚本替换保留其他成员的加密字节与编码元数据 | 无完整游戏，无原版 Ruby，只有 Ruby 4 合成接口、Marshal 消费与生产消费链回放 |

XP/Ace 只观察正文，不输出选择项、菜单、名字、内嵌或游戏 ruby。非标准 XP 分辨率且无可查询尺寸、修改行高/页数的插件、不同文本编码和其他自定义绘制仍未验证。Ace 前缀只面向 UTF-8 脚本，不能宣称支持任意 Main 编码

候选在安装包装或调用 Win32API 前检查 Ruby 世代，Ruby 4 会拒绝自动安装。测试没有改写 `RUBY_VERSION`：先断言拒绝，再显式调用单独方法，在合成 API 上回放，不能把这一步写成“原版 VM 通过”

```powershell
node --test validation/rgss-candidates.test.cjs
```

显式设置上述私有 `MEGULIT_RUBY` 后新增 9 项通过，包含两页正文到实际 RgssTextPath/HookNative、XP 选项排除和状态改变拒绝、Ace 实际 padding/选项所有权、v3 增长/缩短/异常归档，以及 Marshal 编码 ivar 和 symbol link 保留。合成归档到 Main 的数据链还核对了错误 Ruby 世代拒绝安装后，原 Main 仍执行。缺失该环境时 Ruby 检查会明确跳过，不算游戏通过

固定源码、阅读时间门与剩余缺口见 [候选报告](../side-session-notes/RGSS-xp-ace-candidate-result.md)。Ace 使用 Ruby 1.9.2 的依据为 [官方产品说明](https://www.rpgmakerweb.com/products/rpg-maker-vx-ace)，1.8/1.9 字符串 API 分别核对 [Ruby 1.8.6](https://ruby-doc.org/core-1.8.6/String.html) 与 [Ruby 1.9.1](https://ruby-doc.org/core-1.9.1/String.html)

## 完整 XP/Ace 样本后的隔离私测增量

后续已取得真实完整样本，仅在严格 EXE/DLL/INI/归档或散装 Scripts/Main 源哈希、opaque roles grant 与原隔离环境均通过时，允许 Egomaniacs 1.04 / Soprano 1.01 进入正常 private 准备与普通副本加载。生产默认不变，不按 DLL 名称开放家族。Lumina 压缩动态 loader 无可靠 Main，继续拒绝

37 项相关验证通过，含生产 Bridge.launch 无进程回放、全部原文件保护和正文/清页消费链。一次 XP 隐藏启动因音频 Guard 的 `session pid` 失败停止，未证明原版 Ruby/WinSock 或正文实机通过，没有重试。详细版本、部署合同、日志与限制见 [XP/Ace 私测加载报告](../side-session-notes/RGSS-xp-ace-runtime-result.md)
