# Ren'Py producer checkpoint, 2026-11-22

范围仅为 Ren'Py 引擎层 producer、其 inert host 和回放测试
工作树 `H:/MeguLit-Work/wt/engine-level1-release`，分支 `codex/engine-complete-renpy-roles-ruby`，基线 `7a41ff9a9c3632c9f143f01b455085c1d6e4a854`
未修改 `core/text-paths.cjs`、`core/hook-native.cjs`、seed、CI、正式安装、游戏或存档，未启动游戏、未下载或展开新样本
提交只交给总控串行整合，不自行 push 或开 PR
通用经验已写本工作树被 gitignore 的 ENGINE-ADAPTATION-NOTES.md，跟踪副本为 side-session-notes/ENGINE-ADAPTATION-NOTES-renpy.md

## 真实审计时间和取舍

JST 06:51:43 开始，07:06:42 再次核对工作树仍 clean，07:06:49 结束审计后才开始功能写入，实际门槛 15 分 6 秒
时间来自 clock 工具，包含源码阅读、接口与边界推演、既有回放基线核对，不宣称每一秒都在读文件

| 顺序 | 项目、文件、版本、许可 | 本次采用与排除 |
|---|---|---|
| 1 | LunaTranslator/LunaHook `a744a80fc2b99ea5852d4da2bd157afdc9e628f0`，`resource/renpy_hook_text.py`、`engines/python/python.cpp`、`python2.cpp`、`python3.cpp`，GPL-3.0 | 只参考运行时 Python/Text 与字符串钩子的思路，没有 name/menu/glyph-ruby 的直接证据，不复制代码 |
| 2 | [VNR `d2b9bad6` enginecontroller.cc](https://github.com/Dangetsu/vnr/blob/d2b9bad6/Frameworks/Sakura/cpp/plugins/vnragent/engine/enginecontroller.cc) 与 [enginesettings.h](https://github.com/Dangetsu/vnr/blob/d2b9bad6/Frameworks/Sakura/cpp/plugins/vnragent/engine/enginesettings.h)，交接标注 GPL-3.0 | 直接阅读两文件，只有 Scenario/Name/Other 与 signature 分流，不能作为 Ren'Py widget 或 ruby 证据，不复制代码；本次 COPYING URL 404，未把该 URL 当许可证据 |
| 3 | XUnity.AutoTranslator `08324a58dcb26b76fc08e0fb2121098164579e73`，README 的 Unity/plugin/text framework 范围和 LICENSE，MIT | 不适用于 CPython，未照搬 Unity 对象钩子 |
| 4 | Textractor `df5b830d1757a66aa162f8081e99d42c9bd50488`，`texthook/engine/engine.cc:16947`、`match64.cc:186`，GPL-3.0 | 旧 `PyUnicodeUCS2_Format` 只取字符串，不能证明 glyph 角色或坐标，不复制代码 |
| 5 | [unrpyc README](https://github.com/CensoredUsername/unrpyc) 与 [LICENSE](https://github.com/CensoredUsername/unrpyc/blob/master/LICENSE)，本次只读网页 master，未固定提交，MIT | compiled script 的还原不能替代屏幕 render 或角色证据，不采用实现 |
| 5 补充 | SExtractor `8d8d976fd04ae54e7c677705af937273d04a376a` 的 `src/extract_RenPy.py`，GPL-3.0；VNTranslationTools `36fbe909d02f2e9bb187443e03e2df595f56bfec` 的 `VNTextPatch.Shared/Scripts/RenpyScript.cs`，MIT | 分别为文本行处理和 rpy 引号区间，不采用为实时 glyph 角色证据 |
| 6 | Luna 同版本 `resource/lunajspatch.js` 的 Window_Message 与 Tyrano 路线，GPL-3.0 | RPG Maker/JS 运行时，不适用于 CPython，不复制代码 |
| 7 | KAG3 MessageLayer/ruby/link 路线 | 引擎不适用；猜测的 krkrz/kag3 URL 404，未声称读到原版、不伪引用或移植 |
| 主要接口 | 本机官方 Ren'Py `8.4.0.25071206`，`renpy/character.py` 的 display_say/show_display_say、`exports/menuexports.py` 的 display_menu/MenuEntry、`display/screen.py` 的 get_widget/get_screen、`text/text.py` 的 TextSegment、Layout、paragraph_glyphs、TEXT/TAG/rt/art/rb，文件头 MIT | 按接口独立实现，标准 say 只认实际 who widget，标准 menu 只认 screen items 的 action 与 caption |
| ruby 定义 | [renpy/renpy `b9a733f8a3b8ed7675292509ef61f88b09589b1c` textsupport.pxd](https://github.com/renpy/renpy/blob/b9a733f8a3b8ed7675292509ef61f88b09589b1c/renpy/text/textsupport.pxd) 与 [textsupport.pyx](https://github.com/renpy/renpy/blob/b9a733f8a3b8ed7675292509ef61f88b09589b1c/renpy/text/textsupport.pyx)，Tom Rothamel，MIT | 核实 NONE/BOTTOM/TOP/ALT 为 0/1/2/3、place_ruby 的连续底字和前一个普通字符语义、linebreak 对 ruby 的处理、place_vertical 的同对象切片，不复制实现 |

上游固定提交不是本机发行版的版本标识，不能把它混写为本机 8.4 的源码 commit
本机可读源码指纹如下，原始路径 `E:/GAL/MeguLit-adapt-renpy-fixture-20261122/renpy/`

| 文件 | SHA-256 |
|---|---|
| character.py | 57bb26cc2e226b195c97cd9ec8b3553489e5735dcb35cbde812ce1c0f8b24db6 |
| exports/menuexports.py | 635dc2b51a9b208c0ceac4a6159311e690234ec8350535cf25c89d735e7dda55 |
| text/text.py | 3d1b1c20bfa1521277f6dea2760e6620dcea17ffd53c6b734a5f04fd1af60587 |
| vc_version.py | 51029b06dafc04e60018341f074cba47fff84a392073da9752a122cbabf0003b |

## 最终行为

- 删除 rows 中按 ascent 均值猜 ruby 上下层的旧逻辑，TOP 和 ALT 都不进正文或字框
- 从 `Layout.paragraph_glyphs` 的真实顺序取得读音，通过 glyph 对象 identity 对到屏幕行的逐字 rect，保持重复汉字、空格、补充平面字符和换行的码位索引
- 原段没有换行删掉的空格时可完整对应；底字 glyph 缺失或不连续时不猜 span，省略的非底字空格仍能隔开两段 BOTTOM
- ruby metadata 限定运行时版本元组 `8,4,0,25071206`；无 paragraph_glyphs、RTL 或竖排不产 metadata，其他版本未验证
- 记录在可选 emb 后、text 前追加 `ruby=start:len:UTF16hex[|...]`，没有有效 ruby 时旧字段格式不变；最多 64 spans、8192 token 字符、reading 160 码位、base 1..80，拒绝越界、重叠、控制字符、坏 surrogate
- 原生读音在 opt-in 内嵌去空白时显式换算下标，工具生成的其他读音不伪标为游戏原生读音
- 说话人转旁白时清空 N 组名字一次，名字仍由实际 `say/who` widget 身份确认；标准 menu 的空 label 与 None 标题不进入可选项，重复 caption 仍按 action 分开
- roles/embed 默认关闭，保留已有 wrapper 和所有调用参数、游戏自己的 menu 返回值、恢复逻辑与 hide 权限

没有改通用按钮/系统菜单分类，没有扩展到自定义 screen 或 Reader 侧注音合成

## 验证和已知整合前置

基线四个 Ren'Py 测试文件 11/11 Node subtests 通过
最终五文件命令如下，12/12 Node subtests 通过，fail 0

```powershell
$env:MEGULIT_TEST_TMP='H:\MeguLit-Work\night-1423\test-tmp'
node --test validation/renpy-producer.test.cjs validation/renpy-control.test.cjs validation/renpy-page.test.cjs validation/engine-draw-renpy.test.cjs validation/renpy-live-replay.test.cjs
```

control.py 24/24 断言，含 widget/decoy、菜单 alias、重复 caption、权限撤销与内嵌恢复、新增旁白清名字与空 label
producer.py 20 个布局场景、9 个 wire 边界和内嵌后原生读音/emb 字段顺序验证
Python 四文件 AST 检查通过，两个改动 CJS 的 node --check 通过，git diff --check 通过
未改原生 C++ 或二进制，未重编、不发测试包，没有新增实机结果

必须先整合共同 parser 才能收共享消费者测试
在基线 `core/text-paths.cjs` 下执行以下测试，实际为 1 pass / 1 fail，失败是旧正则不接受新增 ruby 字段，未放宽测试或改 core

```powershell
node --test --test-name-pattern="Ren'Py" validation/text-paths.test.cjs
```

总控应先合共同 ruby-v1 parser/HookNative 提交，再串行合本提交、fetch 最新 main 并重测上述六文件与相关共享回放、检查语法后推送
本分支不能单独作为可发布的完整修复，也没有宣称所有检查全绿

## 七格静态能力与实机边界

“内”表示生产端来自引擎内部的数据或调用路径，“外”为外置覆盖；它不代表本轮新实机验收

| 拿字 | 坐标 | 名字 | 选项 | 菜单 | 内嵌 | 注音 |
|---|---|---|---|---|---|---|
| 内，既有 glyph 路线 | 内，既有 glyph/Render 路线 | 内，标准 say/who | 内，标准 choice/action | 无，通用按钮/系统菜单未做 | 内，既有 opt-in Text.set_text | 内，8.4.0.25071206 glyph producer；共同消费者待合 |

已有自写 12 句 fixture 的 capture 回放通过，只证明那份记录仍被当前旧协议解析，不是本次新 producer 的实机运行
商业作品、自定义 screen、未知版本、实际 glyph 点读、Reader 端 native ruby 接收均未做本轮实机验证

店主后续验证：标准 ADV 名字切到旁白时旧名字消失；标准 menu 两项可正常选择且标题不成为 choice；连续相同汉字的第二处注音落在第二处；`{rt}`、`{art}` 不混入正文；关闭 embed 恢复原文，关闭 roles 清名字/选项
失败时交 `logs/engine-draw.log` 和 `logs/hook-diagnostics.log`，标记具体句子、版本与是否使用自定义 screen

资源记录：06:52 左右 H 9.80 GiB 触发下载/展开冻结；07:10 实测 C30.24/E13.84/H11.32 GiB，本会话没有清理，未推测回升原因，仍未下载或展开新数据
