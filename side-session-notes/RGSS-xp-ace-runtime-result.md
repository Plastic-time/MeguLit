# RGSS XP / Ace 精确样本私测加载增量

2026-11-22 09:38 起，基线 `8b846a7542bb547f317d27445dba1bb79a106045`，独占工作树 `H:/MeguLit-Work/wt/rgss-xp-ace-runtime`，分支 `codex/rgss-xp-ace-runtime`

功能提交 `aa5adda6c15d0a23e633d45e5b70b8d9345d99c4`，正文替换退休修正 `ea049d9c0cef1fd1e09354e7e849cbc31fc16385`，额外 pin 负控 `7867504180b1176f7584921fbab7715c1f839c7b`，按此顺序收取。旧 `0a798503` 分支保持封存。仅六个功能/验证文件的小增量，不重复 VX/CPU 旧提交，不改 Bridge、owner-tests、旧 VM 夹具、Seed、E 安装目录或 CI

## 结果与证据边界

XP Egomaniacs 体験版1.04 和 Ace《いと深き大地の底》1.01 已接正常隔离私测准备：真实 opaque grant、严格文件身份、普通副本、实际加载的 Scripts 入口、现有 WinSock 协议、HookNative 正文与清页。全部原文件/非目标归档成员保护和消费链回放通过

原版 Ruby/WinSock 与游戏正文实机验证没有通过。本轮只尝试一次 XP 隐藏启动，现有音频 Guard 在初始 session PID 枚举时拒绝，未启动 muter；游戏按实际路径/PID/birth 核对退出、槽位释放。没有重试该拒绝路线，没有继续另一部游戏。不能把“副本能生成”或“进程已启动”写成正文已接上

## 完整样本与选择

收据基目录 `H:/MeguLit-Work/night-1423/sample-deployment`，均实际读取 receipt 与 reader-evidence，并重新核源文件/脚本表

| 样本 | 原版文件结构 | 本轮决定 |
|---|---|---|
| Egomaniacs 体験版1.04，`rgss-xp-egomaniacs-jp-20261122` | RGSS104J.dll，Data/Scripts.rxdata 位于 160699563 字节 Game.rgssad；只读 reader 57 场景、10829 正文；实际最后一段为 Main-Extend | 精确哈希下允许 XP 私测加载；完整普通副本 1696 文件、348750574 字节 |
| いと深き大地の底1.01，`rgss-ace-soprano-jp-20261122` | System/RGSS301.dll，散装 Data/Scripts.rvdata2，真正 Main 执行 `rgss_main { SceneManager.run }`；20 场景、831 正文、218 选项 | 精确哈希下允许 Ace 私测加载；普通副本 458 文件、73915726 字节 |
| Lumina 体験版0.02，`rgss-ace-lumina-jp-20261122` | 标准正文 0；Scripts 仅有一个无名压缩 eval loader，没有可靠最终 Main，外部 rpack/custom DLL 数据 | 不加入 allowlist，真实 grant 也返回 RGSS_PRIVATE_EXE_NOT_VERIFIED，不猜解或绕过 loader |

完整文件审计在 `H:/MeguLit-Work/night-1423/rgss-xp-ace-runtime-20261122-0938/*-audit.json`，原始包与原部署文件不改

最终另按三份原收据重新核对全部 2230 个原部署文件 SHA：XP 1700、Soprano 458、Lumina 72，全部相同，见 `source-preserved.json`。XP 实际运行目录只占包中 1696 文件，不能与完整包的 1700 混写

### 固定身份

| 字节 SHA-256 | XP Egomaniacs 1.04 | Ace Soprano 1.01 |
|---|---|---|
| EXE | be7d4f41d9df0945faf82738e14f42523e6b8869829fb379b9c4d97aac9eb899 | 123de8dbcbad471029171892be78b21e2cfb0bf52d5fee8f2bb5447066ee9fd4 |
| RGSS DLL | beb9c9a6ce5ceaa9d562e2906d4be7027a85a1c937266daaae743f272b296cf3 | 27647690ed16218cd988dd71069fdca67207515b2a2df775be361f0198ab6876 |
| INI | d51d39d698787020c5f9acbd04fe78083f114c8d5a09279466f08fe018fb77ea | 21761999f8aa223bc2b9ae8a5715a419e3d8a23766cb0c6d65157a262018e5e3 |
| 完整归档 / 散装 Scripts | c26fc4af172daf412ececd8390ea697bdb51e875b5c7532c4621fc66df306fd4 | 8790fda9bc08cb8923103c877afa2e774c9fac87612f33f807add24719157513 |
| Scripts 原始 Marshal | c358d43f3ccc3a74be211cd66397fb42b85edc86330ce55157370b35171b66f4 | 8790fda9bc08cb8923103c877afa2e774c9fac87612f33f807add24719157513 |
| 实际 Main 源 | 77b58119081a81648e6e4fe7248c194c13dfcc4042d4eee294de6b604e373567 | 55ee198afc668e88c72bf08205a581d27f583d9c125ce7f3d18e017006370da6 |

完整 pin 在 `core/rgss-private-samples.cjs`。不按相同 EXE/DLL、文件名、归档扩展名或 title 单独放行，未伪造 official Seed

## 实现合同

- `plan(exe,{ownerTestGrant})` 在非 VX 世代进入独立私测模块。真实 opaque roles grant、严格 draw.roles=true、原三项私测环境与隔离配置均由现有 owner API 检查。没有 grant 的普通/官方差分不能启用新样本
- 每次准备/复制前重新核 EXE、DLL、INI、完整数据文件与 Scripts SHA，INI 的 Library/Scripts 必须与已核路径一致。XP 散装覆盖、Ace 同目录混入归档均拒绝
- 默认 `patchMain` 仍只认 Main。非标准 Main-Extend 还必须给出精确源 SHA，保持唯一末段/尾部只有空段或 exit 的限制。只替换该段压缩字符串，保留其余脚本/Marshal 元数据和原 Main 后缀
- XP 复用现有 v1 archive writer；Soprano 在副本原有的 Data/Scripts.rvdata2 中写入前缀，不伪造新 archive 或 loose override。artifact 的原数据 pin 指向真实 Game.rgssad / Scripts.rvdata2，复用既有 WeakMap proof 与严格副本文件登记
- 普通文件复制、不做 hardlink/junction；源目录、用户原存档和设置不写。复用副本保留已有新存档/设置，未知归档或启动字段改动仍拒绝覆盖。新已核私测最多 512 MiB/5000 文件，VX 原上限仍 256 MiB；复制前另核目标盘完成复制和补丁后至少 10 GiB，空闲 RAM 至少 4 GiB。没有新 scheduler
- 真实私测 roles grant 可在全局 compositor/ownTextOutput 都未打开时准备新路径，生产默认、library-only、canary、step-down 保持原约束
- 新样本返回 observeProcess，使用既有正常 launcher 的实际 child PID/进程查询 birth 绑定 grant，不信 Ruby HELLO 来创建授权，不延长 TTL。停止/撤权关监听并 revoke
- Reader 尚未采用同一 grant/wanted=true 时 owner=0，不能提交 source 或几何记录。首次尚未绑定时不发送假关配置去破坏 Ruby 的有限未发布页缓存；采用之后才发有效 CFG。每次 source 仍核 token、当前代次、实际 PID/birth、精确当前 body、Reader 所有权与 grant
- 清页只撤当前 RGSS 自己提交且 sequence 相同的正文；不会清掉后来外部 Luna 的来源。history/menu 返回时相同 body 可以重新提交，不被旧去重集合吞掉

## 原游戏 API 核对

本轮直接读取完整样本的真实脚本，没有复制游戏代码进产品

XP 的 Window_Message draw_text 以可变字体/行高逐字绘制，native pause 之外另持 Sprite_Pause。真实 `text_end` 把 `@contents_showed=true`、`@text=''`，因此仅对固定脚本组合使用该完成条件，不能沿用标准 XP pause 判断。`rubi_draw` 的游戏原绘制/返回值照常执行，仅在它执行期间跳过观察，避免读音混入正文；history 窗显示时退休正文。此自定义样本的内联选择整页保守拒绝，名字/ruby 元数据与菜单不扩充

Ace Soprano 的真实 Window_Message 直接继承 Window_Base，创建 @choice_window；Window_ChoiceList 反向持有 @message_window。沿用既有候选的实际 padding、pause 或本消息窗所有且可见 active 选项窗完成条件，未重写 Fiber 调度

旧成熟参考和十五分钟阅读门见 [上一阶段候选报告](RGSS-xp-ace-candidate-result.md)。本轮在已有设计上核真实类/实际末段，不把 Ruby 4 回放当原版 VM。所有记录 hidden=0，没有游戏内嵌、名字、游戏 ruby 或完整七项声明

## 自动验证

```powershell
$env:MEGULIT_RGSS_PRIVATE_RECEIPTS='H:/MeguLit-Work/night-1423/sample-deployment'
$env:MEGULIT_RUBY='H:/MeguLit-Work/deps/rgss-ruby-validation-20261122/runtime/rubyinstaller-4.0.10-1-x64/bin/ruby.exe'
node --test validation/rgss-private-samples.test.cjs validation/rgss-candidates.test.cjs validation/e574-rgss.test.cjs validation/owner-tests.test.cjs
```

aa5adda6 的 36/36、0 fail、0 skip 保存为 `related-green.tap`。追加同 line 替换退休与“真 opaque grant 不能覆盖已改 INI/DLL/Scripts 或混入归档”的负控后，最终 37 项封存为 `related-sealed.tap`。新增 7 项包括两部完整实际文件经生产 Bridge.launch 的依赖注入回放（替身 OS 启动、raw catalog 未开 draw）、原文件/非目标归档加密字节保护、普通副本及独立进度、精确 Main 源与权限拒绝、真实 HookNative 采用 grant/来源/清页/恢复/后来外部来源保护、Lumina 拒绝和 Egomaniacs 消息状态 API 回放

联合 22 个测试文件 `related-first.tap` 保留 170/171、0 skip 的原日志，唯一失败是基线旧 VX focus VM 没有 owner-tests 依赖。该文件和 Bridge/owner-tests 在本分支未改。主线程已告知该项在 62ade/813fbc56 修复，并在后续 root 联合中通过；本分支不借用或重做此修复，不把 170/171 写成全绿

全部 1728 个受控 JS/CJS/MJS 在 aa5adda6 后重新执行 node --check，0 cache、0 failure，完整逐文件 SHA 见 `syntax.json`。后续仅变化的 text-paths-rgss 与 private-samples 测试两文件另 fresh 检查，其余 1726 个 SHA 相同；最终 manifest 为 `syntax-sealed.json`。没有将继承检查冒充重新全量执行

## 一次隐藏启动与具体阻断

私有 runner 证据目录 `H:/MeguLit-Work/night-1423/rgss-xp-ace-runtime-20261122-0938/xp-live-1795308570902`

- 实际进程 17676，实际 birth `639309053797347697`，路径为自己生成的 XP shadow。现有 observeProcess 接受该 OS 身份，4% governor 报 `job=True/True`，只占 slot1，没有切到用户前台
- 启动前 C/E/H 均高于 10 GiB、空闲 RAM 高于 4 GiB；Enterbrain 注册表根不存在，INI Windowmode=0，未改用户注册表/原 INI，也没有发全屏快捷键
- Guard 在 `GetProcessId` 初始枚举阶段报 `unsafe: session pid`，随后 captureOnly=true、muterStopped=true、runCompleted=false。没有 ready/mute-confirmed，也没有 muter-started；原因的 HRESULT 未记录，不能猜成某个特定兼容问题
- 没有记录 WinSock 安装成功或完整正文来源，不能推断原版 Ruby 接口通过。没有绕过 Guard，没有重试或转去另一游戏
- 09:49:41 关闭前再核自己的 PID/path/birth，确认游戏已退出，slot1 已释放；没有残留 MuteProc。历史 runner 一度把“无 muter 因而可清理”写成 audioSafe，已追加 audit-correction 和 acceptance-correction.json，明确 audio/runtime acceptance=false，保留原日志不抹掉失败

本轮不修改 Guard 或构建 native DLL。下一步由主线程独立处理音频枚举错误，再通过正常私测入口确认 Ruby 安装、20 句正文、翻页/history/关闭/撤权与实际 Reader 点读/译文。前台最终验收由店主执行，不能从自动检查补写通过

## 交给主线程

依次收 aa5adda6、ea049d9c、78675041，再收后续报告提交，并在最新 root Bridge/CPU birth 合同上重测。私有 `owner-test-entries.json` 含两部原 exe 的完整 EXE、INI、DLL 与数据资源 SHA；Soprano 另提供真正包含 140 条解析文本的 `Data/Map001.rvdata2` 作为作品内容 pin（51027 字节，SHA `62cf2013191c782783c0e5812ecd9f6b88dce31ad4c87d1d1bf9bff7300c3e09`），不只用共用运行库或 Scripts 来表达作品身份。只有主线程将它们加入隔离测试 manifest/库，不能部署成 calibration 或正式 Seed

原完整样本与本轮普通副本保留。后续若在副本产生游戏存档，仍要保留并核对迁移，不自动覆盖原目录。旧分支不动，不 push/main/PR，不改 E 包/CI/native 构建或别人进程
