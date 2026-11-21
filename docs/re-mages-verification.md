# MAGES 静态候选验证（2026-11-22）

本轮只验证已知五份 x86 Steam 样本并修复签名扫描器边界，不启用游戏差分，不代表实机验收

## 本机身份与静态结果

五份 `Game.exe` 都为 PE machine `0x14c` / optional-header magic `0x10b`，完整 SHA 与既有 fixture/version table 一致
SteamStub 仅在内存中解密，代码经 stdin 送入 console 扫描器，不执行目标代码，不写回游戏目录

| fixture slug | 完整 exe SHA-256 | 明文代码字节 |
| --- | --- | ---: |
| steins-gate | cbbc5dab18edc344d05c01d4d08819fbc0a68a78741956831752986009b69e16 | 742122 |
| steins-gate-0 | 21c63116db4792bc8461192429af0d6243c6135e9c09b7ba607a5ea8b0ff091e | 1341114 |
| chaos-child | 51aeae59786ed60a519411e035b324bbc10f1bd49490a607fab69a3741133bd4 | 1201050 |
| steins-gate-linear-bounded-phenogram | 29d8b394d720a517ded1b6d3bd2371241bc51009ee84e066404c4d4fc4e136ae | 766058 |
| steins-gate-my-darlings-embrace | a6dcce350d4c406ed78978da125575fb36bf97cf76a3fd980fb2554f0ffb88fb | 1225514 |

JS 结果逐项等于既有版本表，C++ 生产签名器分别编为 x86/x64 console 程序，对五份完整明文代码的 dialogue/glyph/commit/clear/pages/stride/charset capacity/scale/backbuffer 匹配结果均与 JS 一致
这里的 x64 是**扫描程序的宿主位数**，目标仍为 x86
Mes/Sel/SysSel 及 ruby 标记的既有真实 exe 静态测试全部实际运行，没有跳过
菜单角色仍是原有调用次数推断，未升级为实机核实

`mages-sample.cjs` 要求完整 SHA 与 x86 PE 头同时符合，作为离线证据准入，不替代 runtime 权限策略
旧测试遇到不同 SHA 静默返回并显示通过，现明确 skip 并显示实际 SHA/原因
独立 `verify-mages-samples.cjs` 遇到缺失、不同 SHA、错误头、非 x86 或匹配失败均非零退出，不能产生全通过收据

## 扫描边界修复与证据

- commit 中末尾不完整的绝对地址、呈现链中截断的高度地址、glyph 调用后不完整的 `add esp,2Ch` 必须在剩余字节内完整存在才读取
- JS 旧源在两个相同反例上均抛 `ERR_OUT_OF_RANGE`，修复后不抛且已有完整签名保持不变
- 原生 fixture 将输入尾部紧贴 `PAGE_NOACCESS` 数据页，不安装钩子、不执行输入字节，旧生产签名头在三个反例上均失败，新头全部通过，x86/x64 host 各自复核
- 五个原始 snippet、近似阴性、stride、presentation 检查仍各 host 51/51；新增边界各 3/3
- Node 相关四套共 38/38、0 skip；改动 JS 均过 nodecheck，diff check 通过

重现，先把 TEMP/TMP 指向自有 H 盘 scratch，再从仓库运行

```powershell
node --test --test-concurrency=2 validation/mages-sample-identity.test.cjs validation/engine-draw-sig-mages.test.cjs validation/engine-draw-mages-live.test.cjs validation/engine-draw-opt-in.test.cjs
cmd /c native\megulithook\selftest\run-mages-static.cmd <scratch-output> <Steam-common-directory>
```

runner 为独立静态入口，未改共享 `selftest/run.cmd`、CI 或 native 注册
root 若需接入手工检查，可在自己的串行集成中调用该入口，不将本机五个样本变成普通 CI 的前置条件

## 有界离线资源采样

五份 `USRDIR/script.mpk` 索引都可读，逐项核对 packed 区间落在文件内
每份仅选 12 个不大于 1MiB 的 SC3 资源，压缩输出同样限制为 1MiB，按**固定 exe 表**指定 charset 解码

| slug | MPK条目 | 采样内含假名行 | 采样内姓名行 | 未知字码 |
| --- | ---: | ---: | ---: | ---: |
| steins-gate | 190 | 3395 | 957 | 14 |
| steins-gate-0 | 178 | 3544 | 1335 | 0 |
| chaos-child | 216 | 2092 | 1021 | 0 |
| steins-gate-linear-bounded-phenogram | 125 | 3000 | 1363 | 7 |
| steins-gate-my-darlings-embrace | 86 | 4297 | 1364 | 10 |

这是 O 层采样，含假名行与姓名行的统计不是互斥类别，不能据此推导全文覆盖、当前游戏语言、运行时姓名/选项身份或配对成功
未知字码保留为限制，没有宣称无损全文解码
收据仅存文件/资源 hash 与计数，不新增游戏正文副本

## MAGES64 独立缺口

已核实本轮五份样本全部 x86，已有夹具与 engineTable 没有任何 x64 版本
已查看的 Steam 常用目录与既存 GAL 标题清单没有识别出可固定身份的 MAGES64 样本，这不代表全磁盘不存在

`MagesEngine.cpp` 的 `_WIN64` 分支已有 SC3 **字符串** hook（`ff2` / `ff` / `dohooksinternal`），不能说整个 MAGES64 没有实现
它不提供本轮对话页画字签名、字框/角色或隐藏证明
`MagesDraw.h` 的 x64 `Arm` 是 no-op；原注释“MAGES ships 32-bit only”错误，现改为本实现只覆盖五份 x86 fixture
未把反汇编注释中的标题/RVA当真实样本，也未从 x86 页步长或 ABI 猜造 x64 签名

下一门：取得单一真实 x64 exe 与其实际文字模块身份（若文字在 DLL，需该 DLL 的 SHA/PE 头）→ 查壳与模块→固定画字入口/页结构/调用 ABI→独立 fixture/签名/返回门→最后由 root 分配实机 slot
当前状态 `BLOCKED_NO_IDENTIFIED_X64_DRAW_SAMPLE`，不新增 x64 runtime、seed、开关或宽泛签名

## 默认与实机边界

五份 seed 的 `draw.roles=false` 保持不变，opt-in 测试通过
复用权限候选 `b3437326490d906887b59acfc1d3f094fac05a84` 和 night-ci 整合 `e18df86440a2f9d97b8a9770cdee4c33beba3bf9`，不重复其 253 项或将其当本轮新成绩
本候选基于 main `ba00434c9961035ef625ebccd773de508c7122c6`，需 root 在串行集成时保留 b343 权限修复

首阶段没有 DLL 构建或游戏启动，后续实际启动记录见下一节
旧六行 live-chain fixture 是仿引擎回放；page observer 输出 `hidden=false` 并透传原画字，实际隐藏需要宿主完整路径另有证据
10句以上隐藏/点读/真实译文ACK/翻页无残留仍未验收，不能因本报告开启任何游戏 allowlist
实机 slot 与精确计划写在外部 `engine-progress/mages.md`；main 合并重测和推送只由 root 执行

未删除代码或降低既有运行路径，只替换了静默通过的证据判断并给扫描读操作补边界

## 04:14 后续：私有 DLL 已编，真实启动仍阻断

root 分配 slot3 后，分支补入既有 430f/a255/b343，分别对应本分支 ba5ff476 / 92417737 / 0a2740da
与 e18 对照，MAGES 权限头除本轮修正的 x64 注释外一致，未再跑旧 253 项
`selftest/run.cmd` 的冲突只保留本基线并加入 MAGES 入口，没有导入其它候选引擎的调用
依赖合入后相关 Node 再验证 38/38、0 skip

私有 `LunaHook32.dll` 实际完整编译成功，按 runtime 名复制为 `MeguLitHook32.dll`
SHA-256 `e99f3fb05d2512f9cb00c591e70ffd1c988a4d8ed04d8a58568d86cc09f6dbe0`，native build tree 195586917B，在 512MiB 预算内
源码来自既有本机 LunaHook tree 的私有复制，再由本分支 build-x86 覆盖，944 个实际源文件逐项存 SHA，不能将整份 DLL 称为 root 最新完整整合源码
root 固定的 HookBridge `7d190514ea0c087b0c5e5448ea36208b3e6772e950bd9197decd8912807e6e4d` 实际 `--probe` 通过，九个 host exports 可用；尚无实际游戏注入

| 实际启动 | 所有权与隔离 | 观察 |
| --- | --- | --- |
| PID3872 | 私有 save-root 副本，roles=0 | snapshot guard 在 session PID 查询拒绝；未发 start-muter，未进入正文采集 |
| PID46876 | 同一副本；只改 save-root 函数与对应 relocation，原件未写 | HidDesk 截图为 Steam `Application load error 3:0000065432` |
| PID41672 | 第二种副本只改保存 namespace 数据，原始 .text/relocation 逐字节不变 | HidDesk 截图仍是同一 Steam 错误 |

两种副本的字框签名表均与原始 exe 一致，来源与精确 hash 在外部 manifest
启动失败的具体根因未确认，不据这个通用错误断言是 MAGES hook、DRM 校验或某个路径问题
没有修改授权检查或继续尝试绕过该错误，也没有移动原用户存档、改其 junction 或 DACL
第二种方法新建的独立 Documents namespace junction 只指向自有 H 盘 save，已正常仅 unlink，不覆盖用户既有目录

原 snapshot 工具实际返回的 HRESULT 已经只读确认是 `0x0889000D`，官方定义为跨进程 session 的 `AUDCLNT_S_NO_SINGLE_PROCESS`
这是单 PID 采集合同需要独立处理的状态，不能直接把所有非负 HRESULT 当作可安全静音的单 PID session
来源：[Microsoft GetProcessId 文档](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getprocessid)
共享 guard 未改；后两次使用生产 `ColdCapture.cs` 的私有 trace 编译，只增加原 mute/静音/恢复读回记录，fake 自检通过
游戏停在启动错误前，未创建被本路捕获的音频 session，实际没有 snapshot/mute 记录，不能把 guard exit0 称为音频验收通过

全部 owner 游戏与控制器/guard 已退出，slot3 已释放，原存档 11 个文件逐项 SHA 未变
角色开关从未置1，未进行选项、正文或清页采集，也没有有效 I/G/H/D/U 新证据
静态 roles=0 文件已写但引擎没有进入可测场景，因此同样不是有效的实机默认关闭负控

私有副本清理整条命令被自动审核以 `blocked by policy` 拒绝，连前置预检也未执行，未换工具或父目录重试
两个自有游戏副本及其只读使用的 USRDIR junction 保留，不能递归清理到原游戏资源
精确目标、已成功完成的退出/unlink、未执行的删除与证据路径都在外部 `engine-progress/mages.md`

## root 的接线与下一门

1. 保留原有 b343/e18 权限修复，合入本轮 80bbe74f 与最终文档/private opt-in；不必重复 cherry-pick 本分支的三个依赖副本
2. 完整 Reader 必须取 root 40e 组合的 `HookNative`/Rust，并核固定 Rust/HTML hash；本分支的 `HookNative`/Rust 更旧，不以它拼装 final。`core/mages-draw.cjs` 与 root 40e 一致，无需改共享接收分派
3. 当前 C# `hookEngineDraw(engine=mages)` → `HookNative.magesDraw` → `MagesLive` → `charRects` 的生产链已存在。不能用绕过中间环节的回调声称实际 Reader 通过
4. 测试 profile 的 engineTable 需使用版本层**完整表**，包含 `engine=mages`、`charset=default`、page/canvas 等，不只传 `M.table()` 的地址摘要。已补独立 preflight，确认默认 `#cfg roles=0` 与完整 `#table mages` 同时生成；此前实际启动从未启用 roles
5. 先解决合法启动与原存档隔离能同时成立的目标入口，再领取 slot；现有两种私有副本均未进入正文。没有这个入口，不继续改 Steam 保护或移动用户数据
6. 之后才能跑默认 off → 精确私有 SHA opt-in → 10句/姓名/选项/清页/off-on；原文隐藏与实际 DOM/译文 ACK 需另有完整证据，observer 自身的 `hidden=false` 不可改成假确认

本轮实际停止点是 `BLOCKED_PRIVATE_COPY_STARTUP`，而非适配完成；MAGES64 的独立样本缺口保持不变
