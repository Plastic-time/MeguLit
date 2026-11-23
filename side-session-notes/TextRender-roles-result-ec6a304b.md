# KiriKiri Z TextRender 一级候选

基线7a41ff9a9c3632c9f143f01b455085c1d6e4a854，分支codex/engine-complete-kirikiri-textrender
开始2026-11-22 06:48:29 JST；源码审计至07:03:29后才新增产品改动；90分钟上限08:18:29
保留接手的3文件84+/9-，未清理丢弃；仅本路producer、相关回放和此报告，未改共同core、cfg parser、rubyWire、Seed、CI或其它引擎

## 有序源码审计

GPL源码仅阅读思路，没有复制新增第三方实现；没有下载包、clone仓库或磁盘展开游戏内容

| 顺序 | 固定来源／file／revision | 许可与本路采用边界 |
| --- | --- | --- |
| 1 LunaTranslator/LunaHook | a744a80fc2b99ea5852d4da2bd157afdc9e628f0，src/NativeImpl/LunaHook/LunaHook/engine32/KiriKiri.cpp:1053–1194 | GPL3，仅参考；TextRender render输入串截取/格式过滤不等于逐字角色或ruby跨度 |
| 2 VNR镜像 | Dangetsu/vnr master仓库与License.txt可读；旧kirikiri.cc/h猜测路径404，Frameworks tree请求被web工具restricted URL拒 | 页面许可GPL3；源码rev未核定，未采用源码，不换入口/工具绕过被拒tree，此项缺证据 |
| 3 XUnity.AutoTranslator | 08324a58dcb26b76fc08e0fb2121098164579e73，src/XUnity.AutoTranslator.Plugin.Core/TextTranslationInfo.cs | MIT；Unity组件适用，TJS不适用，无复制 |
| 4 Textractor | df5b830d1757a66aa162f8081e99d42c9bd50488，texthook/engine/engine.cc KiriKiri段 | GPL3，仅参考；字形API上游不是完整TextRender角色／span接口 |
| 5 GARbro-crsky | 009c09de1ba67754d9aa8a580a7b2e21a1831cd6，ArcFormats/KiriKiri/ArcXP3.cs | MIT，只读archive/entry格式参考，未新增复制或执行解包 |
| 5 KirikiriTools | 9590c3cce4733e1f048cd407bfb57e8ce71f1f95，KirikiriDescrambler/Program.cs、Descrambler.cs | MIT；该CLI会覆盖文件，所以不执行；只参考原有格式说明 |
| 6 KAG3原版 | krkrz/kag3 1f3ab309106d210e3169bbbe0fb4e066ae463b42，data/system/MessageLayer.tjs blobf4b060b502a6a732794b32892ee4f2d0561f60c0，ButtonLayer.tjs blob2226f0d57a5df4230d8e30cca7bc0188783a7a3e，README.md blobf437d1957cf783d0cf068e8e5524b6af6c615095 | W.Dee／contributors，文件及README标明改変・配布自由；仅参考setRuby/currentRuby、link分行、caption→Butt_caption，不把KAG3字段套到不同TextRender版本 |
| 补充 TextRender替代实现 | 3c1u/TextRender 2fe2957148df30e70a2271f4ba7cfcdbc8e0fdc9，textrender.cc blob5738ffc321347f06acee410f22ee2a7337ab4501，LICENSE.MIT blob612e0109fa121436370b94c6bf40a2b97fc99d38 | MIT/Apache2可选，仅阅读；WIP中ruby仍TODO，不当千恋DLL字段证据 |
| 本机TJS元数据格式参考 | Kirikiroid2 d1c2b1259423542c893e0b65eaeb46c848848f2b，src/core/tjs2/tjsByteCodeLoader.cpp、tjsInterCodeGen.cpp/h，根LICENSE | 根BSD式许可，仅用于独立只读元数据审计；未执行TJS／游戏，未复制到产品 |

原krkrz/krkr2目录tree也遇web restricted URL，未换工具重试该tree；随后从已知独立kag3仓库读取明确文件，未下载或clone
RPG lunajspatch/RPGMakerTrans不适用于TextRender，此路不扩展RPG引擎

Primary来源链接：
- https://github.com/HIllya51/LunaTranslator/blob/a744a80fc2b99ea5852d4da2bd157afdc9e628f0/src/NativeImpl/LunaHook/LunaHook/engine32/KiriKiri.cpp
- https://github.com/Dangetsu/vnr/blob/master/License.txt
- https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/texthook/engine/engine.cc
- https://github.com/krkrz/kag3/blob/1f3ab309106d210e3169bbbe0fb4e066ae463b42/data/system/MessageLayer.tjs
- https://github.com/krkrz/kag3/blob/1f3ab309106d210e3169bbbe0fb4e066ae463b42/data/system/ButtonLayer.tjs
- https://github.com/3c1u/TextRender/blob/2fe2957148df30e70a2271f4ba7cfcdbc8e0fdc9/textrender.cc

## 本机证据

已有千恋安装：SenrenBanka.exe SHAfd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3，textrender.dll SHA7c12d13d68a3237b21db4af0840cb223ef86a3a64a652b2325e4ea906eab23ee
只读既有缓存的TextRender.tjs14628B SHA63d9887aa13fe3b09e5c2410fe53403a449a60f781ebf8a7399b722a6e16ef91，MessageLayer.tjs120624B SHA34f0354e2a7b9db6a62989449aea6021591def23699c734e3f62172fcc41a31d，均与移交相符
独立元数据审计完整消费两个TJS2100文件31／292个对象；drawCh确认读取ruby对象或数组，drawRuby7参数读取x/y/size/text，但没有底字start/len的确定合同
因此不猜字段、不发送native ruby wire；root/KAG的rubyWire及共同parser/HookNative/Reader接线由其owner维护
元数据工具首轮误把object size当包含8字节header，边界失败；对照现有writer核定不包含header后两个文件完整边界通过，此为工具错误，不是产品缺陷
未重新下载、磁盘解包、运行游戏或把缓存目录当新安装／新版本证明

## 最终改变

- 接手修复保留：同几何换文本去重key包含正文；每个消息层持有自身glyph快照；空／blank／超4000项布局退休旧页；显式空name清名字；link按各行hotspot选字，K<layer>组准确退休
- 新增：消息层隐藏、null／异常布局、当前owner切换均退休准确旧line、恢复原opacity；空快照重复到达只清一次
- 混合link缓冲区保持游戏原样可见，不接管为正文；显式clear旧正文proof，glyph快照仅供选项producer使用，等新正文layout再恢复隐藏
- 选项发送实际逐字rects和行间换行，经既有parser与rowsOf得到分行字框，不把union空隙作为阅读区
- roles关闭只清TextRender自己的N/K组，重开即使文字相同也重新发送；不修改KAG的L组或公共ButtonLayer producer
- 发出／隐藏正文前按native ReportFunction的28000 UTF16上限拒绝超长记录，恢复显示并允许下一有效快照恢复，避免native丢弃记录后仍隐藏游戏
- 无旧原调用路径删除或降级；name原函数与TextRender.done原返回路径保留，KAG processCh/公共控制区未改；新数据替换本层旧缓存

## 验证及保留失败

- 接手基线3相关文件28/28 fail0 skip0
- 三种源函数反例hidden/null-result/owner-switch：旧代码均保留旧record不报clear；候选均清除并恢复opacity
- 中途新增多行测试31/32，唯一失败为VM报告夹具未模拟native ReportFunction的newline→U001F；补齐已有transport行为后通过，未放宽parser或删除断言
- 最终6个相关文件56/56 fail0 skip0；覆盖实际HookNative.charRects→HiddenGate→OverlayPlacement的gone，以及选项经parseChars→rowsOf不覆盖行间空隙
- 全仓1546 tracked JS/CJS/MJS逐文件nodecheck已通过；变动的3个JS/CJS随后按内容SHA复核，详见外部syntax收据
- 32/64位Krkr DLL有界C盘编译通过；raw literal各段仍低于8190宽字符限制；没有运行创建WS_VISIBLE窗口的native host，编译不等于原生运行门或游戏验收
- git diff --check通过；未改CI或跳测试

## 七格与边界

| 拿字 | 坐标 | 名字 | 选项 | 按钮菜单 | 内嵌 | 游戏注音 |
| --- | --- | --- | --- | --- | --- | --- |
| 内，既有getCharacters正文 | 内，glyph x/y/cw/size；选项回放到逐字框，实机原点仍待验 | 内，processName*与nameLayer，空值退休；图片姓名无 | 内，hotspot内字与选择态；混合缓冲不接管正文 | 内仅既有ButtonLayer.caption，图片菜单无，本路无新通用producer | 内仅既有MessageLayer.drawText注音／中文附绘，非原render输入替换，本路仅回放 | 无端到端producer；真实ruby对象存在，底字范围未知 |

一级候选仅限上述静态／回放范围，并非七格全完成；默认roles/embed不启，未增加任何seed/allowlist
二级待root分配slot：确切exe／插件／最终DLL身份、10句隐藏日文、名字／多行choices／文本button、真实点读DOM与译文ACK、翻页／OP退休、声音／退出恢复
root串行fetch/rebase最新main后重测／推送；本路仅提交独立候选，不直接push、不开PR
若与KAG同改script.inc，按函数区域合并，保留其cfg/rubyWire/processCh区，禁止整文件覆盖

## 资源与经验

本路新增下载0B、磁盘展开游戏内容0B、游戏启动0；没有后台常驻进程，也不删除别路文件／被拒对象
H初检9.83GiB时严格冻结；后root通知恢复11.33仍不新下载，近期C约30.2／E13.84／H11.32GiB
通用经验已追加本WT忽略的ENGINE-ADAPTATION-NOTES.md：clear要验证到真实消费者gone；共享TextRender link缓冲不可只报hidden0或整体透明；native wire上限要在隐藏前检查；脚本VM回放要保留native newline编码步骤