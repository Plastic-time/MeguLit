# 原生 IGA 私测正文流候选

范围仅为原版 2013 虚ノ少女的一个固定 x86 构建，非 The Shell Artemis 重制版

现有 `services/original-engines/iga.cjs` 只读资源读取器继续复用，新增 `IgaText.h` 的普通 Luna `NewHook` 接口，不新增 observer 协议、不修改共享 HookBridge / HookNative / Reader，不更改公众 Seed

实际游戏 EXE SHA256 `6fca9f7106f5fd57ac1471f403c72ca14d6de74150a5f310f5138e932f6f501a`，231936B。`plugin/Script.dll` SHA256 `89ea50edd61314a06a2d0b8ffb1f66c8a3e2fe058ae10c4301bc11cde536a5d3`，502784B。其函数 RVA 0x8440 接收 ECX 中的 CP932 NUL 字串，转换后向字体层派发 AddText。调用者含逐字绘制，普通 Luna 保留 caller context 分流并由原有缓冲合句，尚需真实运行确认句子完整性

默认不装 hook：只有目标进程同时继承 `MEGULIT_IGA_TEXT=1`、`MEGULIT_OWNER_TESTS=1`、`MEGULIT_SIDE_BY_SIDE=1` 三个明确私测开关，EXE、六个插件、script.iga、system.iga 的长度与完整 SHA256 全对，实际加载插件路径一致，83 字节入口签名在代码节唯一且 RVA 一致时才安装。三个开关缺任一个或不等于字符串 1 均不安装，native 自检逐项验证。签名中的两处 PE relocation 操数允许随装载基址改变，其他指令变化拒绝。哈希不是跨版本支持声明

只读 `USING_STRING`、CP932、ECX 输入，不设置 embed 标志、不写回、不隐藏、不输出 ToMe_CHARS。名字/选项/屏幕坐标/原生注音/翻页语义均未实现，不能以此声称可完整游玩。停止与重连仍走已有 Luna 生命周期

上游按 LunaTranslator/LunaHook → VNR → Textractor 调查，再核 GARbro / vn_re / arc_unpacker：固定版本分别为 `a744a80fc2b99ea5852d4da2bd157afdc9e628f0`、`d2b9bad6af9577f639ce47171d506c9fbf401984`、`df5b830d1757a66aa162f8081e99d42c9bd50488`、`009c09de1ba67754d9aa8a580a7b2e21a1831cd6`、`cce0798ad2771034cee74d1ea92d70efd2a4d27d`、`456834ecf2e5686813802c37efd829310485c57d`。Luna/VNR/Textractor/arc_unpacker GPL 只参考思路，未复制代码；GARbro/vn_re MIT，未新增复制，继续使用仓库已有 IGA 读取器，因此不新增第三方实现归属

验证命令：`node --test validation/iga-text.test.cjs validation/engine-draw-opt-in.test.cjs validation/unify-hook-runtime.test.cjs`；`native/megulithook/selftest/run-iga.cmd` 支持私有 `MEGULIT_IGA_SAMPLE` 与 `MEGULIT_IGA_OUT`。自检包括真实九个身份 pin、同尺寸错误 SHA、重定位、截断、变异、歧义、实际进程环境默认关闭和错误 EXE 不装 hook

本机运行证据单独存放 `H:/MeguLit-Work/night-1423/iga-runtime/`，不将样本路径、存档或正文日志打入公共 Seed

## 隐藏启动基线受阻，未取得 live 正文

统一 x86 DLL 由 root 从固定 native 源构建，2361344B，SHA256 `a1a99296957eef971f79ca314dad1263310f8aba8b74896224aa38d3ffbbb21f`，真实 HookBridge ABI probe 9 exports、source-frame 和 runtime-choice 自检通过。三重环境门标记在 DLL 中以 UTF-16LE 存储，不能只搜 ASCII 后断言缺失

09:19–09:24 仅在普通复制的隔离游戏上用 HidDesk，依次检查原日文 EXE 名、同 SHA 的 ASCII EXE 别名、还原原配置后收窄改动，三次均在自己的 hook 注入之前崩溃。Application Error 1000 均为 `Himorogi.dll` RVA `0x5a2c`，异常 `0xc0000005`。WER 三份模块列表都没有 MeguLitHook/LunaHook，Script/字体插件也尚未加载。静态对应代码在未检查的对象指针上取 vtable；隐藏桌面图形初始化不兼容是推断，并未由 HRESULT 或前台对照证实，不把它归因于 hook

三次后停止实机尝试，未转前台、未改系统区域或系统设置、未加图形代理。现有目录未找到 LEProc，不下载额外兼容工具。三个进程均已退出，自己的 slot1 已核 owner 后释放；副本 config 和原目录全部 16 文件前后 SHA 核对一致。未调用 Windows 音量 mute/unmute API，未写原游戏或原存档

固定 c23d0b89 的 core/services 480 文件采用 git archive 独立副本，全部与归档原字节相同，按 Git 文本换行归一后 blob 480/480 对应。原始 blob 比对有 CRLF 导出差异的失败收据保留，未据此谎称逐字节等于 Git blob

另用该固定版本的真实 HookNative 与 Reader.event，输入从本机 IGA 资源解析的十句文本，回放分片 UTF-8 JSON 管道，十句均到达 Reader；合作停止等待 helper EOF/exit、Reader 收到 null 清空、旧 helper 迟到数据被 serial fence 拒绝、新会话同句重新进入均通过。这里 helper/event bus 是本地测试替身，不是游戏进程、真实注入、游戏清页、前端点读、译文或隐藏验收

最终状态：静态/原生/加载合同与服务回放通过；真实挂 hook、正文完整性及前台体验仍未验证。下一步由店主在正常桌面先确认同版本基线能启动，再从私测正常入口绑定并观察 IGA_Text 正文流，不开启隐藏/内嵌
