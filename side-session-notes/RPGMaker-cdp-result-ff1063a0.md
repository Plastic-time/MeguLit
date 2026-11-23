# RPG Maker MV/MZ 引擎候选

- owner：本聊天（从MAGES转交，非继续MAGES），不创建其它agent/chat
- 开始：2026-11-22 06:48:32.067 JST；90分钟截止08:18:32；最晚08:08收束
- 开源有序审计06:48:32.067至07:03:33之后；实际首次功能写入前工具时钟07:05:07.941，超过15分钟，期间只有读源码、找样本与报告修改
- branch codex/engine-complete-rpgm-mv-mz，基线7a41ff9a9c3632c9f143f01b455085c1d6e4a854
- 源码WT：C:/Users/Megumin/Downloads/MeguLit-Work/wt/engine-rpgm，创建前路径不存在，未覆盖既有路径或dirty
- 初检C30.59/E13.84/H9.83GiB，可用内存10.54GiB；H<10，禁止下载、解包和新游戏；C仅源码checkout，未开游戏
- 已完整读HANDOFF-TO-NIGHT-REPAIR，安全拒绝保持停止，不触碰MAGES被拒清理、CS2被拒路线或旧UI工具

## 审计顺序与初步事实

1. LunaTranslator/LunaHook：本机a744a80fc2b99ea5852d4da2bd157afdc9e628f0；已读resource/lunajspatch.js、engine32/RPGMaker.cpp（后者不是MV/MZ JS路径）、engines/v8/v8.cpp95-220实际资源加载
   - lunajspatch.js通过Window_Message.startMessage/allText及Window_Base/Bitmap.drawText抓文字，未报告逐字坐标或明确name/choice角色
   - 许可GPL-3.0，本轮仅参考API入口/状态流程，不复制其代码
2. VNR镜像 Dangetsu/vnr，d2b9bad6af9577f639ce47171d506c9fbf401984：实际读 Frameworks/Sakura/cpp/plugins/vnrhook/src/engine/match.cc，673-677将RGSS3标为IGNORE，未找到MV/MZ脚本坐标实现；License.txt GPL3，仅参考判别边界
3. XUnity.AutoTranslator，本机08324a58dcb26b76fc08e0fb2121098164579e73：README和MIT许可确认Unity/BepInEx/IPA插件；MV/MZ的NW.js Canvas不适用，不移植
4. Textractor，本机df5b830d1757a66aa162f8081e99d42c9bd50488：实际读 texthook/engine/match64.cc 的InsertV8Hook及engine.cc中x86 V8路径；Write/WriteToFlat是字符串观察，不携逐字位置或name/choice角色；GPL3，仅参考入口
5. 脚本/资源工具：SExtractor 8d8d976fd04ae54e7c677705af937273d04a376a 的src/extract_RPGMV.py 1-165（GPL3），JSON事件命令/键提取；GARbro-crsky 009c09de1ba67754d9aa8a580a7b2e21a1831cd6 的Experimental/RPGMaker/ImageRPGMV.cs 1-75（MIT头），是图像解码，不提供live文字坐标；均未复制
6. 本仓库preserved/source/lunahoook-adapted/.../resource/lunajspatch.js与本机Luna版本字节一致，SHA256 29ae017e3214d09c487774a3d152c57c6ebc3d8bc0e5f643f4e333ee9ddbb66c；V8.cpp从JSSOURCE资源装入，单改JS文件不会更新已编译DLL。RPGMakerTrans实际仓库dreamsavior/rpgmakertrans 796aa941d14131093d92b389d2ce627e55f4e027，读README.md、rpgmakertrans/README.txt和workers/rbpatcher/rubyscripts/matcher.rb；GPL3，面向2k/XP/VX/VXAce事件/Ruby，不是MV/MZ运行时方案，仅参考事件来源概念

补充官方API：rpgtkoolmv/corescript 182e31449707ba7e406db0485c44c2a9d11e2dcd（MIT）实际读Bitmap.js/Window.js/Window_Message.js及LICENSE；只参考Canvas maxWidth收缩、contents sprite frame、分页生命周期，没有复制源码。MZ官方Window.js在线源码确认_clientArea已减origin、_contentsSprite frame从0开始，不能把MV的scroll偏移重复套到MZ

全部有序审计步骤在功能修改前完成；本轮没有复制新的第三方代码，无需新增THIRD-PARTY条目

关键只读来源：[MV Bitmap.js固定版本](https://github.com/rpgtkoolmv/corescript/blob/182e31449707ba7e406db0485c44c2a9d11e2dcd/js/rpg_core/Bitmap.js)、[MV Window.js固定版本](https://github.com/rpgtkoolmv/corescript/blob/182e31449707ba7e406db0485c44c2a9d11e2dcd/js/rpg_core/Window.js)、[MZ官方Window.js](https://developer.rpgmakerweb.com/rpg-maker-mz/Window.js.html)、[VNR match.cc固定版本](https://github.com/Dangetsu/vnr/blob/d2b9bad6af9577f639ce47171d506c9fbf401984/Frameworks/Sakura/cpp/plugins/vnrhook/src/engine/match.cc)、[RPGMakerTrans README固定版本](https://github.com/dreamsavior/rpgmakertrans/blob/796aa941d14131093d92b389d2ce627e55f4e027/rpgmakertrans/README.txt)

## 实际产品接线与实现

- core/text-paths-web.cjs直接require并注入core/text-paths-rpgm.cjs导出的RPGM_SCRIPT
- services/bridge.cjs165的ownTextOutput/compositor授权 → core/text-paths-launch.cjs识别NW.js并加loopback CDP → text-paths-web.cjs attachPage同时注入PAGE_SCRIPT/RPGM_SCRIPT → HookNative.attachTextPath/drawSync发送draw配置，回报走WebTextPath.report/formatChars/HookNative.charRects，未只改未加载副本
- RPGM_SCRIPT原有消息/角色/ruby/中文实现，这轮修其权限和生命周期：profile roles/embed从true改为false，默认没有timer/函数包装；只认Utils MV/MZ和所需API，显式draw.roles或draw.embed后才安装，API缺失不半安装，二次注入不重复包
- 坐标改为contents sprite仿射四角+实际source frame+canvas CSS/DPR；MZ已在父clientArea扣origin，不重复扣；是font cell不是像素墨迹。Canvas maxWidth收缩、center/right对齐和buffered run prefix宽度进入逐字坐标；无法确定geometry时拒报且最多3条诊断，原游戏调用继续
- 分页（含未pause页）flush/原行号空清/新页；注音的全句codepoint索引跨页延续；terminate/替换消息/关闭开关清记录；250ms跟随已完成页变换，父节点隐藏、窗口关闭或场景离开清记录；UI选项缩短沿用UiTracker组快照，隐藏父节点/关闭/撤权清组
- 撤销embed立即清hold、恢复尚未绘制的原textState及字号，停止新ruby/中文；已经绘制的像素仍由游戏下一次清页消失，没有用重绘替换游戏状态。未实际应用注音或中文时不再误报emb。replacement最多64项，ask最多256项，ruby最多64 span且限制索引/重叠/读音，文本4000预算保持协议可解析
- 原生V8 lunajspatch JSSOURCE没有修改或重编译；它已有的字符串替换仍可能与CDP同进程共存，本轮没有实机证明两路不会相互影响，不能称所有MV/MZ插件兼容

## 进度

功能修改前样本核对：E:/GAL、E:/Steam/steamapps/common、H:/MeguLit-Work/samples未找到loose rpg_core.js/rmmz_core.js或RPG项目标记；正式库58条非removed记录只读检查也未找到MV/MZ脚本或NW邻接标记；不写DB。仓库rpgm-sample/manifest.json明确synthetic made-up game，不能充当真实样本

当前无游戏启动，无下载/解包；本机真实正文证据仍缺，一级验收不能宣称满足，后续实现与自动回放仅作为候选交接

## 七格能力与明确缺口

|拿字|坐标|名字|选项|按钮菜单|内嵌|注音|
|---|---|---|---|---|---|---|
|内（Bitmap，VM）|内（font cell，VM）|内（标准MZ）；无（MV非标准插件）|内（文字choice，VM）|内（commandName/_data.name，VM）；图片/自绘无|内（生成内容，VM）|无（游戏原生ruby）；内（生成读音绘制，VM）|

全部“内”仅代码路径与VM回放证明，未有真实本机MV/MZ正文/签名证据，不能标一级完成，也未做二级实机。MZ buffered run是模拟，不是完整MZ发布游戏；MV名字插件、sourceRuby、RTL、字符聚类/自定义栅格器、图片按钮、自绘菜单与任意插件均未验

## 验证与交接

- RPGM专门回放18/18（全部stand-in），含默认off/严格boolean/未知引擎/API缺失/原函数返回异常/仿射与scroll/maxWidth/12页/ruby跨页/撤权/UI缩短/隐藏/场景替换/坏几何/有界输入/大页与MZ补充平面字符
- 07:13最终相关11个suite合跑94项：93通过、0失败、1跳过（无本机RPG/WOLF）；完整日志rpgm-validation.log（本WT ignored）
- 额外profile layers/所有engine/game字段域/内核隔离消费3/3；kernel/seed权限2/2；合计99项98通过1因无真实样本跳过。这不是全仓全测试，也不是main CI green
- 总控最新main7a41的CI44952624968失败中，RPGM旧exact draw expected缺kemcoSprites:false：本候选保留完整断言补该字段，未删除/skip原断言；另逐个engine profile消费完整默认draw对象并验证opt-in隔离/坏值负控。profile-stack/profile-match/profile-layers/the-seed/unity-kemco-opt-in均已纳入合跑；不修其它legacy CI、不触发第四rerun、不改CI配置
- Node v22.22.3：全部1546个tracked .js/.cjs/.mjs逐个node --check，0失败；测试最后新增负控后再次单独node --check验证该文件；git diff --check通过
- 末检07:11 C30.25/E13.84/H11.32GiB；本聊天无常驻node/编译/游戏进程，未获取实机槽、未启动游戏、没有游戏/存档/正式DB变更。没有下载/解包/新游戏，也未重试任何被拒安全路线
- ENGINE-ADAPTATION-NOTES.md已写本WT本地笔记，受现有ignore规则排除，未强加到git；没有复制新第三方代码，因此没有新增THIRD-PARTY条目
- 只提交引擎候选，不push/不PR/不改main/不改CI/不带AI署名；root如整合应在最新main复测，并保留“缺本机正文、未达一级”状态，不能以本轮自动回放代替真实样本门槛
