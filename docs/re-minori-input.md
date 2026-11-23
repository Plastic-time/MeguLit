# minori 单一英文版输入观察器

这是默认关闭的原始输入诊断候选，限定一个英文版可执行文件。没有开启游戏 seed 或允许名单，没有提供日文适配、正文角色、页面、屏幕坐标、隐藏或嵌入能力

## 版本与真实 ABI

样本 `E:/Steam/steamapps/common/eden/eden_en.exe`，2,267,992 bytes，SHA256 `7b0f4be87c1296e62b7425d2ee3470e337e51921c4e28adba67d4a3cfed50fc3`，PE32 x86。入口为 RVA `0x10d4b0`，47 字节完整函数在可执行节中唯一。安装还要求相同映像的 CTextDrawer vtable、+3c 输入入口、+08 绑定入口、+50 renderer，以及复制 helper 的长度/SSO 布局字节一致

调用约定是 ECX=node，栈上一个 **MSVC byte-string 对象指针**，原函数 `ret 4`。最初的裸 NUL `char*` 假设已被真实 `402ff0` 与调用点证据否定，未编译或运行这个错误假设的观察器。fixture 中保留了纠正过程和实际字节

`402ff0` 读取输入对象 +10 的长度与 +14 的容量；容量小于16时使用内联16字节区，否则从对象首 DWORD 取得堆指针。`50d4b0` 将其复制到 node+0c 的字符串对象，再按目标 SSO 状态设置 node+28 的 cursor，并清 node+08。NA 调用点直接传局部字符串对象的地址，不能对它做 strlen

观察器在原复制前读取，不在返回后访问可能已被复制操作重用或释放的别名输入。只接受长度不超过32768、长度不超容量、SSO 容量为15且末字节为 NUL 的对象；在复制前后复核长度、容量、堆指针与末尾 NUL。输入中的 embedded NUL 保留为 raw bytes，不把对象字节数解释为 renderer 最终显示的字符数。不可读或不一致即拒绝采集，原调用和原参数继续传递

这不是原子多线程快照：头部复核不能证明另一个线程从未改写字节后又恢复。记录只表示本次受界限保护的前置读取，不表示原复制已成功、文本已显示或属于正文

## 权限与日志

`draw.minoriInput` 为版本层布尔键，默认 false。它只建立现有诊断控制通道，独立于 draw.roles/draw.embed，不产生替换表请求，也不发送 ToMe_CHARS、角色或 reader 正文源

控制文件沿现有 UTF-16LE BOM 协议，路径为 `%TEMP%/MeguLit/draw/<pid>.txt`。只接受完整第一行 `#cfg ... minoriInput=1`，拒绝缺失 BOM、错行、重复 key、非ASCII首行、近似值和不完整换行。roles=1 或 embed=1 本身不安装这个观察器

完整 SHA、大小、唯一 RVA 和布局 pin 通过后，watcher 每2秒复查权限；显式开启前不创建 detour。关闭后保留 detour/trampoline，仅透传原调用。每次开/关转换递增权限代次，旧 snapshot 不因再次开启而恢复；每个日志块检查代次，函数退出后没有保存待重放快照

`ToMe_MINORI_INPUT begin` 包含 run、epoch、phase=pre、build=en、入口、caller RVA、node、cursorBefore、对象指针、容量、字节数及 FNV-1a 64-bit checksum；data 按 offset 记录 raw hex，end 给出完整字节数。FNV 仅用于本机诊断完整性核对，不是无碰撞的文本身份、安全校验或 Cardinal 成功证据

已经进入 Msg::Log 的调用可能在撤权后完成，因此控制文件的关闭不是 in-flight 排空 ACK。缺块、缺 end、代次不符的记录必须视为不完整，不能拼成健康输入。现有 HookBridge info 回调会把日志排入本机 hook-diagnostics.log，该日志有1 MiB阈值，可能停止追加；本候选没有放宽其容量或上传原始文本

## 原调用与生命周期

gate 保存 flags、全部 GPR、FXSAVE 状态，清 DF 并为 observer 设置常规 x87/MXCSR 环境，之后全部恢复，tail-jump 原 trampoline。原函数自行执行 ret4 和返回值，观察器不伪造成功

采集的 SEH、logger 的 C++/SEH fault 均被隔离，TLS 重入标志有 finally 清理。实际 MinHook stand-in 让 logger 改写 XMM0/XMM7、x87 与 MXCSR，再核对原调用参数/GPR/flags/ESP/返回值和选定浮点状态；不是对所有指令集扩展状态作无限保证

CreateHook 失败会关闭后续安装尝试；EnableHook 错误也关闭观察并保留可能被在途调用引用的 trampoline，不把错误当成绝对未打补丁后立即释放。正常撤权不物理移钩。当前 main.cc 的 SafeToUnload 返回 false，DLL 留驻；本候选依赖该生命周期策略，没有宣称自己的轮询线程可以随意卸载。fixture 的显式 Disable/Remove 只在自有调用线程已 join 后进行，不作为生产关闭的实现

## 六件套与复现

| 项目 | 文件与已验证内容 |
| --- | --- |
| 默认关闭原生 observer | MinoriInput.h：仅前置字节对象输入，不写游戏内存 |
| JS / native pin | minori-input.cjs / MinoriInputSig.h：完整 SHA、大小、唯一入口 RVA、复制 helper 和 vtable 布局 |
| 独立真实字节 fixture | minori-input.json / minoriinput-snippet.h：入口、ret4、helper 长度/容量/SSO、两个 typed 调用点 |
| 静态与跨引擎回归 | engine-draw-sig-minori.test.cjs：逐字节变异/截断/歧义、真实 PE 和既有异引擎阴性、默认/版本层/能力隔离 |
| 原生签名与控制合同 | minoriinput.cpp：同源 matcher 对独立 PE 字节、布局与严格首行权限反例，x86/x64 |
| 实际 MinHook 门 | minoriinput-gate.cpp：SSO/heap/空/embedded NUL/上限/alias、坏对象/heap、异常/重入、真实 watcher 撤权/重开、旧代次、安装失败与 x64 no-op |

纯 Node：`node --test validation/engine-draw-sig-minori.test.cjs validation/engine-draw.test.cjs validation/engine-draw-opt-in.test.cjs validation/native-hook-inputs.test.cjs`

小型原生门：设置 TEMP/TMP 为自有 scratch 目录，运行 `native/megulithook/selftest/run-minori.cmd`。可选设置 MEGULIT_MINORI_SAMPLE 指向真实 eden_en.exe 以只读核对文件 SHA，不会执行它。输出在 TEMP/megulit-minori，只编本观察器的签名程序、实际 stand-in 和 x64 no-op，不运行其它 UI 或 shot 测试

两个架构 build copy 规则和现有 native source freshness 已包含新头文件；run.cmd 串入独立小门。megulithook 在 native-builds.json 仍为 ci:false，普通 CI 不编译 Hook DLL。当前仅本地局部构建，没有重编或替换正式 DLL/Tauri，没有游戏或日本语轨实测

剩余：真实游戏里的输入频率、吞吐与日志丢块、调用者角色、所有字符串分支、实际页面/日文/ruby/菜单/OP 与最终可见画面。资源恢复且排入唯一游戏队列后才能验收这些；未知项保持未知，不据 stand-in 开启 seed 或扩大渲染权限
