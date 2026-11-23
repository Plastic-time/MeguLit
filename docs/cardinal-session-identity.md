# Cardinal 排队任务的配置归属

入队时记录旧 source/seedRev，但 driver 在空闲后才复制当前配置，会把后来收到的火或新校准配置用于旧任务

本改动在 `kick` 固定 derived profile 摘要、source/seedRev、公开作品上下文、非密钥 replay 配置清单，以及 exe 和实际脚本来源的文件身份，获得空闲许可后才完整读取 exe/脚本做 SHA-256

driver 使用同一清单复制配置，复制前、逐文件读取时、复制后分别验证，源文件有变化或隔离副本内容不符就延期；回放完成后父进程还会复验，评分前再查配置，旧 score 文件不覆盖，也不上传

第一句之前恢复绑定时使用的 engine/title/VNDB 元数据，调用既有 Reader.applyGameProfile，然后验证实际 GalNative.profile 摘要，结束时再核一次；不能确认同一 profile 时返回 `CARDINAL_IDENTITY_PROFILE`，不凭目标配置文件存在就说已用上

原有 HookNative、Reader、bridge 和自动后台调度接口未修改，哈希仍在既有后台许可/取消范围内；子进程还没启动时取消或文件校验失败只延期，不制造 browser cleanup barrier，已启动回放的退出确认规则保留

## 来源与边界

- 脚本集合始终使用原文引擎 `ENGINES[engine].sources` 的完整清单，torch release 的 exe/engine/scriptFile/script 只为清单内对应文件附加 expected hash，不能缩减集合；引擎没有可靠集合、集合为空或 locator 不在集合内时延期，不按最大压缩包猜脚本
- 没有可靠来源、越界、reparse、输入过大或来源消失都会明确延期；不改变游戏适配数据，不写游戏文件或个人存档
- 原始输入只在本地做哈希，proof 只含相对文件名、字节数、摘要、文件身份及公开作品上下文，不含脚本文本或配置值
- 配置仅取 replay 使用的 JSON，跳过 secrets/account/credentials/token/API key/backup/temp/lock 等名称；auto-profiles 与旧 feed 子目录只取当前 exe 的文件，主数据库、学习记录和游戏存档不在清单中
- 单配置文件最多 16 MiB、总配置 32 MiB、清单最多 4096 项；单次 exe+script 验证最多 2 GiB，异步哈希每块检查取消和 30 秒期限，文件系统 I/O 并非实时保证
- 未携带 sessionIdentity 的旧手动 CLI 日志回放保留原语义；生产 `services/cardinal.cjs` 每个任务都必须通过新身份流程，没有以 replay/manual 参数跳过检查的路径
- 入队前已经混用多个版本的会话仍不能仅凭本项判为可信，本项绑定入队时的输入，并不替代全会话 provenance、真实 DOM/时钟证据或可信审核 runner

`doc.identity` 是本地关联信息，原有上传 `SCORE_FIELDS` 未扩展；这些摘要不能把玩家裸分变成 trusted review，空公钥、新协议路由、实际健康 20 句与真实上传关口保持原状态

## 验证

新夹具使用 H 盘小型普通 exe 文本文件、真实 KS/config 文件与实际生产队列/copyData 边界，未启动游戏、浏览器或原生钩子

覆盖队列换火/改配置、脚本与 exe 改变、新脚本加入、copy 期间源变化、隔离副本损坏、越界 proof、没有脚本来源、未变正控、实际 derived profile 不符、回放中改配置、哈希前失败与实际 driver 启动前拒绝

旧两个 service/transport 单元测试通过单独 helper 显式隔离新文件 I/O 边界，原有时钟、DOM、排队和上传断言全部保留；新 identity 测试不使用此 mock

相关检查：`node --test --test-concurrency=4 validation/cardinal*.test.cjs`

这些是文件边界和受控 transport 单元验证，不是健康游戏评分、真实浏览器体验或线上发布验收
