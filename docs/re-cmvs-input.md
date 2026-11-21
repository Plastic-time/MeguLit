# CMVS 双入口原始输入诊断

本次只交付本机青い鳥单一 exe 的诊断能力，没有游戏 seed 开启，没有角色、屏幕坐标、隐藏、嵌入或 reader 原文支持，也没有完成游戏实测

## 版本与输入契约

样本为 cmvs32.exe，x86，1061728 字节，SHA256 `3a2ec3af6a16a4f36d72faf9e7cb14e2bcc883fbf22fb31da5d69434cc53727e`。两个全文绘制入口 RVA 分别为 `0x64850`、`0x65720`，必须同时唯一命中预期地址并通过完整文件 SHA/大小校验，任意一项缺失或歧义都拒绝整个新诊断能力

实际入口均把 ECX 存为 this，把 `[ebp+8]` 保存为全文指针，另有一个结构参数。它们接收两个栈参数并以 `ret 8` 由 callee 收栈，分别有 7 / 3 处实际 call 指向字形节点绘制下游。0x463810 同样读取全文，但属于测量路径，被保留为签名负例

真实 prologue、ret、NUL 循环、各入口 caller 及缓存分支在 `validation/fixtures/engine-sigs/cmvs-draw.json`。本机静态递归 CFG 确认了调用者归属，未使用旧游戏在 LunaHook 注释里的绝对地址。现存 CMVS.cpp 的 h2 首模式在本样本有六处候选，额外字符合成 guard 仅匹配 0x464850 内的一处，这为该入口提供独立线索，不能当作运行时 hook 已启用的证据

Gate 保存 flags、所有 GPR 与 FXSAVE 状态，读取原始 ECX 和两个栈参数后恢复，tail-jump 到原函数，保持原始 callee 收栈和 EAX 返回值。测试用两种真实 ECX/ret8 假引擎分别经过真正 MinHook，logger 还会改写 XMM/x87，以检查恢复

## 开关与日志

`draw.cmvsInput` 是版本层布尔键，默认 false，通过控制文件的 `cmvsInput=1` 独立启用，不依赖 `draw.roles`。EngineDraw.active 只允许写这个控制，不改变旧角色、隐藏、嵌入、自动路由或 reader 正文来源

只有两处 detour 都启用成功才开始采集。任意位置 Create 或 Enable 失败都会关闭采集并阻止本进程重试，尝试停用已创建项，同时保留所有已经获得的 trampoline，失败处理不调用 RemoveHook 或清空原函数指针
第一处创建失败时通常没有 trampoline；第二处创建失败时保留第一处，两个入口均创建后启用失败则保留两处，不能把缺失的 original 当作可调用入口
控制刷新使用 CMVS 独立递归锁和请求序号；安装状态日志里的再次撤权请求不会被外层旧授权覆盖，异常通过独立保护层释放控制锁
输入观察器和原函数不使用该控制锁

控制授权只接受首条完整 `#cfg` 行，使用 UTF-16LE（可选 BOM），该行码元必须是可打印 ASCII，`cmvsInput=1` 必须唯一且精确匹配
正文子串、后续 cfg、重复 flag、截断或无换行、错误宽字符、UTF-16BE、raw ASCII、不可读及缺失文件均不能授权
raw ASCII 与某些非 ASCII UTF-16 字节可相同，因此不再将剥 NUL 后的任意字节解释为授权；现有 transport 使用 UTF-16LE

`ToMe_CMVS_INPUT begin` 包含 run、入口 RVA、caller RVA、原始 this 和两个栈参数；`data` 按 offset 分块输出完整原始 hex；`end` 给出字节数，三者都带权限 epoch。接受完整 NUL 串的上限为 32768 字节，空串可记录，不可读或超限输入直接拒绝，不把残段当完整文本，也不猜编码或剥离引擎控制串

watcher 仍每两秒尝试刷新权限；实际 on/off 转换推进原子票据，复制后、begin、每块 data 与 end 前复核同一代次
begin/data 内 off-on 会终止旧块的后续输出，新的输入用新代次；缺少 end 或跨 run/epoch 的碎片不得拼成完整文本
这不是同步关闭 ACK：已进入的 logger 可以完成，最后复核与进入 logger 之间没有原子撤权屏障，阻塞日志或安装工作也可能延长刷新时间
测试用 watcher 停止事件会撤权后退出，生产 watcher 仍随进程存续

日志走现有 HookBridge info 诊断通道，普通 reader 路由不识别这个前缀。`hook-diagnostics.log` 有 1 MiB 上限，回放须按 run/offset/字节数确认 begin/data/end 完整，缺块不能当作有效证据

## 缓存与能力边界

- 字形缓存命中会从 0x4613fa 直接走 ret，绕过旧 GetGlyphOutlineA 点
- 度量缓存或已有字形参数还能绕过更低层字形生成函数
- 0x43abb0 可复用已有节点位图，0x437a70 存在独立链表遍历与绘制路径，全文入口不保证每次节点重绘都会再调用
- this+0x98 / +0x9c 参与画布 pen，后续仍有比例与目标变换。尚未证明屏幕坐标或正文角色，因此本诊断不输出坐标和角色

本次读取的是完整原始输入，并非已经排版或显示的全部文字。Ruby、控制串、名字、菜单和选项都需要后续实机分类，缓存重绘完整覆盖也仍未验收

## 六件套检查

| 件 | 当前交付 | 仍缺 |
|---|---|---|
| native observer | 精确版本、两个入口整体校验、默认关闭、仅原始输入 | 真游戏注入与全路径覆盖 |
| JS/native 签名 | 同源实际字节、两个唯一 RVA、完整 SHA/大小 | 其他 exe 版本独立取证 |
| 实字节 fixture | prologue、参数载入、ret8、循环、caller、缓存分支与测量负例 | 真实截图/tape 配对 |
| JS 回归 | 变异/截断/歧义/缺入口、实际本机文件、版本层、根 The Seed 含 versions 禁开、roles0 隔离与 Fata 接线 | 实机文本与画面 |
| native gate | 两个实际 thiscall/ret8、原始结果/GPR/flags/ESP/FPU、XMM0/7、CW/MXCSR、异常、输入边界/真实 detour 重入/off-on、跨线程 held logger、两个创建/启用失败位置、x64 no-op | 完整 DLL 构建、隐藏桌面安装 |
| 文档/测量步骤 | 输入契约与缓存限制清楚记录 | 角色、屏幕变换、编码与渲染验收 |

普通 CI 运行 JS 回归。`megulithook/selftest/run.cmd` 调用新增的 `run-cmvs.cmd`，但该 native 部件在 `native-builds.json` 为 `ci:false`，本地原生 gate 通过不等于 CI 已构建或游戏已验收，本次不改 CI 配置

## 局部复现与后续实机清单

设置 TEMP/TMP 到工作盘，运行 `node --test --test-concurrency=2 validation/engine-draw-sig-cmvs.test.cjs` 与 `native\megulithook\selftest\run-cmvs.cmd`。可选 `MEGULIT_CMVS_SAMPLE` 只读核验实际 exe 的 SHA，另写同大小错 SHA 小文件作为负例，不运行样本，不替换 DLL

空间恢复并获排队实机机会后，先构建隔离 DLL，再在隐藏桌面核对重复字句、Ruby、名字、选项、菜单和历史页；重组完整诊断记录并与截图对照，另外追踪已有节点重绘时全文入口是否触发。证明 caller 角色与屏幕变换之后，再单独决定角色或渲染能力，不能提前开 seed
