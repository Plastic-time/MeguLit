# 自动接火与版本历史候选

本候选把签名适配数据安装到应用自己的 `data/The Seed`，不改游戏文件、存档或用户外观偏好
`receipt.verified` 表示数据签名和安装绑定通过，不代表点读、隐藏、翻译或 Cardinal 实机验收通过

## 先查成熟实现

2026-11-22 实现过程中收到新规则后暂停，先查了以下一手材料，再继续实现

| 候选 | 许可证与使用方式 | 取舍 |
| --- | --- | --- |
| [TUF JavaScript](https://github.com/theupdateframework/tuf-js) | [MIT](https://github.com/theupdateframework/tuf-js/blob/main/LICENSE)，本候选未复制代码或增加依赖 | 可用于完整仓库更新协议；现有 MeguLit game-diff 是另一套 wire format，TUF 客户端不能代替评分审核、署名和数据库事务 |
| [TUF 规范](https://theupdateframework.github.io/specification/v1.0.36/) | 只参考版本单调、摘要绑定和回退检查 | 本候选保留既有签名链并补版本检查，未实现 TUF 的根密钥轮换、阈值角色、到期 timestamp/snapshot；不能声称符合 TUF 或完全防 freeze |
| [SLSA 验证指南](https://slsa.dev/spec/v1.2/verifying-artifacts) | 只参考受信签署者和产物身份绑定，未复制实现 | 公开客户端数值不是可信证明；本协议要求独立审核者签名，且绑定实际 profile 摘要、exe 和完整脚本容器摘要 |

## 可信边界

旧 `/api/cardinal/score` 和 `cardinal_status` 保持原有行为，只能提供待审核线索
其客户端自报高分、IP 票数和旧版 `verified` 状态不能调用本协议改变 winner

新协议有三份 Ed25519 签名，私钥均不在本候选或历史文件内

1. 原 game-diff 签名，仍走 `game-diff.validate` 和现有 profile 公钥
2. 独立审核收据签名，必须来自 `CARDINAL_REVIEW_PUBLIC_KEYS`，客户端安装侧使用 `services/torch-review-keys.json`
3. 离线 publisher 对完整 release 的签名，仍由现有维护者 profile 公钥验证

审核者必须自己确认真实生产 Cardinal 结果的来源，不能把玩家上传的 JSON 重新签一下就叫验证
本候选不提供把任意客户端 JSON 自动变成审核签名的工具，也未部署可信审核 runner
审核收据严格复用当前 `core/cardinal/upload.cjs.eligible`，要求当前评分 revision、live-display 配对、泄露观测、choice 可靠、实测 timeline 和有效 timing proof；另要求 DOM ACK、完整覆盖、至少 30 句和 3 个受信报告，mean ≥ 0.9、floor ≥ 0.6
三个报告的去重和受信执行来源由审核者负责，签名收据只带汇总，不公开用户游玩轨迹

晋升必须比当前 mean 更高、floor 不降低，评分 revision、policy、公开测试 cohort 和 exe/script 身份完全相同
cohort 应是公开测试环境分组的摘要，不能用设备 ID 或用户身份生成
不可比硬件吞吐不能靠换一个 cohort 赢过当前版本

`storyRules` 当前只接受 `null`，未下载、缓存或分发内容
后续纯引用合同由 story owner 固定后串行加入，不能把未知 schema、个人 flag 值或存档混入 profile

## 发布与历史

`propose` 只生成待离线签名的 proposal，不改变当前 winner
`preparedAt` 是 server 生成 proposal 的时间，七天后不能发布
publisher 签名后，`publish` 再检查当前 head、审核基线、单调 revision、签名、兼容身份和撤销集合
SQLite/D1 batch 用 head 条件插入历史并交换 winner，两个并发请求只有一个能成功
历史记录只追加，不执行更新或删除旧 release

真正的发布时间在成功发布事务中由 server 的当前时间写入 `published_at`
公共响应返回 `publication:{hash,at}`，客户端要求它绑定当前 release hash
它与可修改的公开姓名一样属于受信 server/TLS 的元数据，不在离线 release 签名里；不能把 `preparedAt`、fetch 时间或本机安装时间拿来代替

历史内只保存稳定 `torchNo`，当前公开名字从 `torch_credits` 动态读取，改名和撤署名不改旧签名产物
`torchNo=0` 只允许维护者 official profile，未知名字仍为 null
回滚明确选择已发布旧 release hash，并给出 `compatibility-regression`、`reader-regression`、`withdrawn-review` 或 `operator-choice` 原因
回滚是一个新的、更高 publication revision；旧协议、身份不符、签名无效、已撤销的目标拒绝
已发布过的 profile 不得被普通晋升重放，必须走显式回滚

仓库导出位置是 `The Seed/history/v1/<exeSHA>/`

- `<releaseHash>.json`：原始 canonical release，文件 SHA-256 等于文件名，内含原签名 profile 正文和它的摘要
- `<releaseHash>.publication.json`：server 记录的对应实际发布时间，已存在的记录不覆盖
- `revoked.json`：已知撤销 profile 摘要集合，只增不减
- `current.json`：当前 winner、单调 revision 和是否已撤销

导出保留旧文件，拒绝省略已有历史或清除已知撤销；先写新历史，最后交换 pointer
中途失败可能留下未被旧 pointer 引用的合法新文件，重试会校验已有内容，不删文件
`checkRepositoryHistory` 独立验证每个文件、精确 schema、全链、签名、目标、发布时间、pointer 和撤销状态
当前只支持本协议及当前审核 revision；密钥轮换后的历史验证政策尚未扩展，失败时保留原文件并停止导出

导出是私有 staging 到仓库数据的候选同步工具，没有 GitHub 写入或自动发布权限链
本轮没有把真实历史复制进仓库，也没有改生产数据库

## 接收和卡片

`services/torch-receive.cjs` 提供 `enqueue(root,ids)`、`receive(root,id)`、`status(root,id)`、`installed(root,key)`、`stop(root)` 和 `resume(root)`
后台队列每 root 串行一次，重复 id 合并，bulk 默认一分钟冷却
`priority:'user'` 将显式导入或当前卡片请求提到队首；已有运行中的同 id 不重复，遇到本任务 bulk fetch 会先取消它再接用户请求
bulk 复用 `background-budget.wait` 的真实 idle gate，运行中每两秒复查；批间 yield，不另造焦点 scheduler
产品资源门检查可用内存至少 256 MiB、应用根及实际 exe/脚本所在文件系统各至少 16 MiB；测量失败则延后，散列中每 16 MiB 复查资源/取消
不会假设用户有 C/E/H 三盘；本轮夜间验证另外遵守三盘各 10 GiB、内存 4 GiB 的机器运行限制
最多排队 5000 个 id，bulk 队列期限 30 分钟、显式用户请求两分钟，活动中断最多重排三次；满队时用户请求可挤掉一个旧 bulk
当前服务端没有可靠应用焦点状态，导入按用户明确意图处理，卡片请求由现有前端 visible/focus 生命周期约束，不能声称服务端独立验证了焦点
每个任务六十秒总期限，支持外部取消，exe 和脚本各不超过 2 GiB，逐块散列，不读成大 Buffer
停止会取消本任务的读流与 fetch、清待办并等待自身任务收尾；恢复必须显式调用 `resume`

新 release 仅匹配完整 exe SHA 和签名指定的完整脚本容器 SHA
`scriptFile` 只允许本游戏根内最多四层相对脚本容器名，拒绝绝对路径、UNC、`..`、ADS 和重解析链接
目前容器扩展名白名单不含 `.ain`，未知容器保持不安装，不能据此宣称全部引擎已支持
缓存快速身份同时记录 dev/ino、大小和 mtime/ctime；整文件散列在安装时验证，不能代替持续重新散列或声称抵抗任意文件系统篡改
单个容器的完整 hash 不证明整个游戏的全部文件相同，审核者必须为该版本选对身份容器
安装时真正散列内容；后续 loader 每次重验签名、审核 revision、内置版本及本地文件 stat/路径，不把 stat 快速检查说成持续全量散列

请求回来后重新读游戏行、确认未移除/换 exe、核对本地文件未变，再用一个临时文件原子替换 cache
profile、release、来源和本地身份在同一个 JSON 内，不会出现新 profile 配旧 receipt
签名错误、超时、磁盘写失败会保留旧 cache；明确收到 410 撤销时隔离旧 profile，并保留旧 revision 防重放
普通旧 feed 不能覆盖已验证新 winner 或隔离记录，迟到的旧响应不能覆盖更高 revision

只有三重验证和本地精确身份通过的已发布自动 profile，才派生为现有 `official` 优先级
原签名 `profile.source` 保持不动，未审核 legacy auto 不升级权限
每次 loader 都检查派生权限，不接受 cache receipt 布尔值代替审核
不同于更高内置版本的旧配置不能安装；用户偏好和原有 opt-in gate 保留，任何新 `draw.roles/embed/*Input=true` 都拒绝分发
安装数据不会自动启动游戏、挂钩、切 read 模式或执行代码

旧协议 exact exe 的签名 profile 仍能自动接收，非 exact 仍是待 self-check 的候选
已存在的真实签名 cache 也算已安装数据；不能确认的公开来源和发布时间为 null，`cardinalRev:null`，不冒充新协议审核通过

卡片返回 `received.receipt`：

```js
{version:1,status:'installed',verified:true,key,hash,serverTime,
 credit:{torchNo,name}|null,revision,cardinalRev}
```

`serverTime` 是当前 winner 的 server 发布时间或 null
当前已安装火优先于本机曾上传旧火的 `thanks`，旧首传/关闭共享/感谢状态保留
兼容旧显示来源时 `received.receipt` 为 null，不凭旧 top-level credit 声称已安装
修正了来源卡原有查询不存在的 `games.engine` 列的问题，实际 engine 来自 `original.library.engine`

## 集成和未完成项

root 独占 shared 接线：手动保存/更新游戏、原 exe 选择和可见聚焦卡片刷新调用 `enqueue(...,{priority:'user'})`，library_scan 完成默认 bulk；Runtime 停止/重建调用 stop/resume；Worker 注册 torchReleaseRoute
`core/profiles/seed.cjs` 必须明确忽略保留的 history 目录，原 seed 验证只对 history 分流到独立严格审计；在此之前只能向私有 staging 导出
新迁移 `0027_torch_releases.sql` 只是候选，未在任何生产 DB 执行

启用前仍须 root 审查共享接线、部署迁移、配置相互一致的受信公钥，并把真实受信 Cardinal 审核 runner 接入 propose → 离线签名 → publish
当前 review 公钥为空，新发布协议默认拒绝，旧签名 feed 可继续使用
全流程纯数据/真实 SQLite/真实 Ed25519 测试不等于游戏实机、DOM 物理点读、评分上传或发布验收
健康 20+ 句、可靠分数、上传 2xx、故障降分及原音频恢复仍沿用原 Cardinal 发布关口，本候选没有替这些缺口签字

离线工具：

```text
node tools/torch-release.cjs sign <server-proposal.json> > <signed-release.json>
node tools/torch-release.cjs export <admin-history-export.json> <private-staging>/The Seed
```

签名复用已有 `MEGULIT_PROFILE_KEY` 和 `MEGULIT_PROFILE_KEY_ID`，私钥路径仍须在仓库外
两个命令都不会联网发布或推 GitHub
