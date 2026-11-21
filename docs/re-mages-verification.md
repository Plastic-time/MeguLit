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

本轮没有完整 DLL 构建/部署或游戏启动
旧六行 live-chain fixture 是仿引擎回放；page observer 输出 `hidden=false` 并透传原画字，实际隐藏需要宿主完整路径另有证据
10句以上隐藏/点读/真实译文ACK/翻页无残留仍未验收，不能因本报告开启任何游戏 allowlist
实机 slot 请求及精确计划写在外部 `engine-progress/mages.md`，待 root 分配；main 合并重测和推送也只由 root 执行

未删除代码或降低既有运行路径，只替换了静默通过的证据判断并给扫描读操作补边界
