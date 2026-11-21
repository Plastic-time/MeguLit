# AdvHD 单版本完整输入诊断

这次交付用于补齐缓存之前的原始输入证据，没有游戏 seed 开启，也没有宣称 Under The Moon 或其他 AdvHD 游戏已经适配完成

## 固定样本与 ABI

本机 utmoon.exe 为 x86、598016 字节，SHA256 为 `688b22b4619338fe6db648183e38582e17063e6706c7c11b132124f039ce1dda`，完整字符串入口 RVA 为 `0xf2a0`。JS 和 native 都要求完整文件身份、唯一签名与预期 RVA 一致，未知版本不安装此钩子

实际入口字节和 23 个调用点保存在 `validation/fixtures/engine-sigs/advhd-draw.json`。入口 EAX 是高度输入，另有 11 个栈参数，arg7 为 NUL 结尾文本，23 个调用者均以 `add esp,0x2c` 收栈，函数使用普通 `ret`。成功主路径返回最大纵向范围减去 arg4，是高度而非文字宽度

Gate 保存 flags、全部 GPR 和 FXSAVE 状态，再读取入口 EAX 与原始栈，恢复之后 tail-jump 到原函数，所以不覆盖原函数 EAX 返回值。假引擎使用同一实际 ABI 和真正 MinHook，测试还让 logger 改写 XMM/x87，检查恢复结果

## 开关与诊断格式

`draw.advhdInput` 是版本层布尔键，默认 false，写入控制文件为 `advhdInput=1`。它独立于 `roles`；设置此键只建立诊断控制通道，不开启旧角色记录、隐藏、嵌入、自动路由或 reader 正文源。正式允许某部游戏开启仍要先加入 opt-in 允许名单并按游戏顺序实测，本次没有添加允许名单或 seed

控制文件只接受完整首行 `#cfg ... advhdInput=1`，UTF-16LE 可带 BOM 或沿用无 BOM 格式。只允许 ASCII 首行、唯一精确授权键及完整 LF/CRLF；正文中的 cfg、重复键、非零高字节、窄字节和未完成首行都不能授权

`ToMe_ADVHD_INPUT begin` 带调用者 RVA、EAX 高度和 11 个原始栈参数，`data` 按 offset 分块记录原始 hex，`end` 标记完整字节数；三类记录同时携带权限 epoch。只接受可读且不超过 32768 字节的完整 NUL 串，超过上限直接拒绝，不能将残段当完整输入。未证明文本编码，诊断不会猜解码

记录沿现有 HookBridge info 诊断通道进入 `hook-diagnostics.log`，该日志有 1 MiB 上限。回放必须按 run/epoch/offset/字节数核对 begin 与 end，日志容量或传输造成的缺块不能当成完整输入证据

安装后的 watcher 仍每 2 秒检查授权；关闭后保留原 trampoline 并透传。每次开关递增权限代次，采集前后、每个 data 和 end 前都检查同一代次，因此 logger 中关闭再开启也不会恢复旧 snapshot。已经越过最终检查进入 logger 的调用仍可完成，这不是撤权排空 ACK，也不能召回已写日志

采集和 logger 的 C++/SEH 异常被隔离，TLS guard 用 finally 释放；控制刷新异常会关闭观察。CreateHook 失败锁定后续尝试，EnableHook 失败关闭观察并保留可能正在被原调用引用的 trampoline，禁止立即 RemoveHook 后盲目重试。沿用 DLL 驻留生命周期，未新增随意卸载能力

arg3/arg4 在本机例程内参与画布位置计算，但尚未建立屏幕变换。原始参数不是已验收屏幕坐标，23 个调用者也没有被硬编码成正文、名字或选项

## 六件套与剩余门槛

| 交付 | 当前证据 | 剩余门槛 |
|---|---|---|
| 原生 observer | 缓存判断之前的完整输入；无角色、隐藏、嵌入输出 | 隐藏桌面游戏实测、全部文字分支覆盖 |
| JS / native 签名 | 同源 37 字节签名、完整 SHA 与 RVA pin、拒绝歧义 | 其他版本必须独立取证 |
| 真实字节 fixture | 实际 prologue、arg7 load、23 call/cleanup、缓存分支和返回路径 | 调用者角色、目标 surface 与字体语义 |
| 静态回归 | 真字节栈偏移推导、逐字节变异、截断、其他引擎负例、版本层与能力隔离 | 真实游戏 tape 与画面配对 |
| 原生 gate | 真 MinHook、EAX+11words、返回值、GPR/flags/ESP/XMM/x87、坏指针与日志异常、x64 no-op | 实际 DLL 重编与隐藏桌面安装验证 |
| 文档与测量方法 | 缓存漏字路径、输入契约、日志边界和复现命令 | 正文角色、屏幕坐标、注音和译文实测后再谈适配验收 |

## 可重复的局部检查

在仓库根设置 TEMP/TMP 到 H 盘，运行 `node --test --test-concurrency=2 validation/engine-draw-sig-advhd.test.cjs validation/engine-draw.test.cjs validation/engine-draw-opt-in.test.cjs`，再运行 `native\megulithook\selftest\run-advhd.cmd`

AdvHD 原生脚本已接到 `megulithook/selftest/run.cmd`，但该部件在 `native-builds.json` 标为 `ci:false`，普通 CI 不编译或执行此原生 gate。本次是本地真实双架构验证，CI 运行的是 JS 回归，没有修改 CI 配置

若设置 `MEGULIT_ADVHD_SAMPLE` 为实际 utmoon.exe 路径，原生 gate 会额外只读核验完整 SHA，并生成一个同大小错 SHA 的小测试文件作为负例。该测试不运行样本，输出只在 TEMP 的 `megulit-advhd` 及当前测试 PID 的诊断控制文件；不替换 DLL 或正式安装目录

后续实机检查应从全新隐藏桌面进程记录重复字句，重组 begin/data/end 确认字符串完整，再与游戏截图和原文配对。屏幕坐标、角色和渲染效果都尚未经过这一步

权限回归使用同一实际 MinHook fixture：旧 `51171e55` 为 50 项中 12 项失败，修后 50/50；包含错误控制文件、begin/首个 data 中撤权再开启、真实持续 watcher、独占控制文件不可读、logger 破坏浮点状态后的 SEH 和后续恢复。双架构签名各 77 项、x64 no-op 均通过；不把控制台假引擎当作真实游戏
