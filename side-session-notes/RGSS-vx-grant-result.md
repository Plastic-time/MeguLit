# VX 私测权限与 Reader 身份接线

2026-11-22 第二轮，先修 VX 正常启动，再继续 XP/Ace 候选

VX 第一轮可 cherry 的顺序是 `06ff20f9`、`ff175fda`、`c616be67`、`6762a93a`、`84c6920e`，最后一笔只补报告。主线程已收这些改动，本轮不重复推送

本分支以 `84c6920e` 为基础，CPU 原提交 `499dc63d` cherry 后为 `7ddfb46e`，只解决与 VX 启动 helper 的冲突。主线程已有 CPU 联合提交时，应仅取它之后的 VX 增量，不重复 cherry CPU

## 修正

- 准备阶段对 RGSS 的正常解析结果调用 `owner-tests.apply(...prepared:true)`，只有真实 opaque grant 才叠加私测权限，默认配置和 Seed 不变
- `plan` 产生的已验证源对象、`makeShadow` 完成的副本对象分别在模块私有 WeakSet/WeakMap 登记。RGSS 的 `registerLaunch` 必须收到实际副本对象，普通 JSON、同形 clone 和根目录内随意复制的同 SHA exe 均不登记
- 原始 Game.rgss2a 必须是 grant 已完整核对的资源之一。登记还完整核对副本 exe、DLL、Game.ini、带观察脚本的归档与自有 marker，并持续检查其文件身份
- Reader 在实际 `exePath(pid)` 返回后，仅通过当前 opaque grant 把登记路径映回原 exe，查回原 catalog 和 profile。保留真实窗口的 PID/birth，不用原 exe 的路径猜另一个运行进程
- 同一 PID 的 birth 改变也会重新处理。旧异步路径回填核对 PID、birth 和当前原生窗口状态，不能覆盖新的 catalog；RGSS TCP 当前 owner 的 birth 改变会拒旧记录并断开旧连接
- HookNative 上报实际生效的 profile，日志和界面能看到 `owner-test` 层。撤权后恢复原配置，观察与来源关闭

`services/launch-path.cjs` 仍对普通调用只做 realpath。只有 Reader 传入真实绑定上下文时，才允许从已登记的 RGSS、Unity、Artemis opaque alias 还原身份，不按 SHA 扫描或猜测路径

## 回放与边界

新增用真实完整 VX 文件准备副本，再调用未修改的生产 Reader.event/applyGameProfile 与 HookNative 的依赖注入回放。它证明从 raw catalog、全关默认配置、prepared grant、副本、actual-path 查询、原 catalog、bound grant 到正文来源这条链可以接通。原生 helper/进程路径查询是合成输入，没有启动游戏、Reader GUI 或 RGSS Ruby

初次 Reader 回放的 VM realm 与 opaque API 的严格 plain-object 检查冲突，现使用 CommonJS 同 realm 的依赖注入加载器，保留所有断言和严格检查。不是放宽 token 规则

当前 RGSS 17 项与 CPU owner-tests 17 项合计 34 项通过，无跳过，真实 Ruby 4 私有路径和完整 VX 样本均显式提供。它们仍不是 Ruby 1.8 或实机验收

旧 `diagnostic-profile-template.json` 仅保留为第一轮历史证据，不部署到 auto-profiles；本轮使用 CPU 的 opaque 私测 manifest，不把权限伪装成 calibration 或官方 Seed。测试目录由主线程唯一部署，本任务不写 E 测试安装目录

## XP/Ace 审计状态

08:29 至 08:32 先读 RPGMakerTrans、lunajspatch、taroxd/RGSS 与 mkxp 的相关 API、加载与版本边界；随后按主线程新优先级暂停 XP/Ace，修上面的 VX 缺口。VX 工作时间不计入 XP/Ace 的十五分钟阅读

现有 H/E 样本只找到完整 VX 游戏。arc_unpacker 的 55/98 字节 rgssad/rgss3a 是测试夹具，不算 XP/Ace 样本。禁止为这一轮下载新游戏，原版 Ruby 1.8/1.9 验证环境也尚缺

RPGMakerTrans 的网络 Ruby 是离线 patcher，使用较新 Ruby 的 require_relative/force_encoding 和阻塞 socket，不能直接搬进 RGSS1 游戏帧。lunajspatch 检查 JS Utils.RPGMAKER_NAME，是 MV/MZ。mkxp 明确区分 RGSS1 无 Graphics.width/height、RGSS3 的 padding 和窗口接口；它的现代 MRI 兼容层也不能证明原版 Ruby 1.8/1.9
