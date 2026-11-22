# 回想、分支图与只读规则分析

作品结构和玩家进度是两个独立对象。`The Seed/<engine>/<slug>/story.json` 只包含作品目录、节点、边、兼容内容指纹和静态标记规则。玩家的存档、当前变量值、已读列表、路径与游玩选择不进入 Seed 或规则 artifact

## 普通用户管道

`story_list` / `story_graph` / `story_image` 经 bridge 调用 `services/story-progress.cjs`。已有作品规则须同时匹配完整 EXE SHA-256 与声明的完整剧本档案 SHA-256，才用于解释个人进度。完整哈希与结构分析共用一个有界 worker 队列；首次返回 preparing，主服务不读大档案做哈希。已核对结果仅在 canonical 路径、dev、ino、size、mtime、ctime 全部相同的进程内 stat 证明下复用，内容变化立即撤销并重新核对。标题、VNDB 或文件名只用于提出作品候选，不能授权进度套用

缺少兼容规则时，`story-analysis.cjs` 自动排队一个有界 worker：识别引擎，复用已有 original-engines reader，有界读取结构，产生纯规则和待核候选。缓存写入本机 `data/story-rules/`，不含玩家进度。未确认候选不会自动成为结局完成规则。支持不足时返回可理解的未知状态

图像接口每次重新检查存档、规则版本、资源身份和当前允许集合。仅 `source=save` 的 CG 可使用制卡器的后台缩略图队列与单张图像渲染；封面、截图、运行时缓存和历史制卡结果不能作为解锁凭据。锁定节点响应不含原始名称、选择文本、图像路径或图片字节。主动显示路线只揭示已核路线上的文字，不授予图片访问

## 通用分析工具

```powershell
node tools/story-inspect.cjs <game.exe> <rules.json>
node tools/story-seed.cjs <game.exe> <game.json> <draft.json>
```

这两个工具读取游戏资源结构，不读取玩家存档。第二个工具输出待审 Seed 草稿和单独的候选标记文件。候选需经过内容版本与语义核对；不得把“某变量被设置为 1”直接称为“达成结局”

`megulit.story-rules` v1 是 Cardinal 的规则交接合同，包含 ruleVersion、引擎、完整内容身份、受约束 locator、格式标签、静态映射候选、置信度与证据摘要。locator 不能包含任意绝对路径、遍历路径、通配全盘扫描或可执行表达式。尚未接入独立投稿、签名发布或云查询；不能将这个本地合同称为已经实现的传火上传通道

独立校验入口为 `story-discovery.validateRules(document)` 和 `verifyArtifact(body, reference)`。纯引用只含 schema、version、ruleVersion、sha256、bytes、compat:{exe,script}，正文不超过 8MiB，字节数和 SHA 必须完全一致，兼容锚点必须存在于正文。外层签名和候选语义审核仍由 Cardinal 负责；此函数不是签名验证，也不会自动批准候选成为结局规则

## 当前引擎边界

| 层 | 支持 | 保留未知 |
| --- | --- | --- |
| KAG / KiriKiri | 复用语言设置模块的标准目录与字面量 Config.tjs 路径；KSD/KBAD 系统变量；CSV CG 目录；KAG/PSB 节点、选项与显式跳转 | 任意 TJS 表达式、脚本化 pose、尚未验证的 PIMG 完整渲染或结局语义 |
| YU-RIS | 复用 YPF/YSTB、CG 注册槽、YSSD 数组；资源声明与全局持久化字段的静态候选 | 未证明的坏结局或 EXTRA 完成规则、完整已读/选择历史、尚未验证的控制流 |
| 其他引擎 | 能继续复用现有 CG reader 的存档图片 | 没有可靠进度解码时显示“这部游戏暂时读不到进度” |

初始作品数据中，女装山脉展示的是已核实的部分路线摘要，千恋的结局完成映射仍未知，馆的 CG/完整结局目录不完整。所有未知总数以未知表示；不以目录中的零个已知记录宣称零个结局或完整通关

前端章节图使用可见节点裁切，只在输入时更新视口；不存在常驻动画循环。章节切换丢弃旧响应，切页销毁监听与计时器，失焦或离屏清除图片并撤销旧响应，恢复时重新读取本地进度。大图请求按作品串行，重试有上限

身份 worker 同时准备私有 CG 资源索引，避免首次可用响应在主服务同步扫描大型档案。索引和存档位置仅作进程内交接，不属于可分享的规则正文；主服务核对存档的 dev/ino/size/mtime/ctime，变化时立即用当前标记收窄旧集合，并由同一个 worker 队列刷新索引。索引交接前后存档不一致则丢弃；图片缓存与安全评级另行绑定当前源文件的 canonical 路径和 stat 身份，恢复旧 mtime 不能复用旧评级

队列最多等待 8 项，相同 proof 或 CG 索引任务合并；进程可用内存不足 512MiB 时不启动 worker。每个 worker 设 V8 old/young/code/stack 上限 192/16/16/4MiB 和 120 秒超时，V8 限制不等于完整 RSS / 外部分配上限。所有结果、异常与超时均先请求终止，再由实际 exit 释放唯一活动槽位；`story-analysis.stop()` 清空自己的等待项、关闭入队并等待活动 worker 退出，供 Runtime.stop 的 allSettled 调用。资源拒绝不会改走主线程同步 CG 扫描

analysis worker 不改变宿主 Node 进程的调度优先级。[Node os.setPriority 文档](https://nodejs.org/api/os.html#ossetprioritypid-priority) 说明 pid=0 操作当前进程，而 [worker_threads](https://nodejs.org/api/worker_threads.html) 的线程仍在同一进程内；因此不能把此调用当作线程独享的优先级设置。隔离子进程回归核对真实 analysis worker 完成前后 getPriority 不变。已有 card-wall warmRun 的旧设置位于 spawn 出来的专用制卡进程，此次未改

回想图像不依赖图片评级模型。当前存档确认且存在资源时使用既有后台缩略图队列；成人分类来自 story.json 的游戏分组、至少两类独立剧本证据或整作评级兜底。NSFW 开启时显示全部已解锁图片，关闭时只为标成成人的图片使用现有模糊遮罩，可临时查看单张。没有解锁来源不启动抽图，未知进度整页说明，不制造锁定清单。QA 可显式使用 cache-only，缺缓存返回资源受限，不伪造图片已准备好

规则正文的证据使用与 story.sources 相同的严格字段和值类型检查，全树拒绝个人状态键与地址等私有值。章节的原始全部边直接校验；无目标边或未知字段使整个正文无效，不经过过滤后再认证原件

## 更新方式

作品 JSON 随现有安装包和 App hotbundle 分发；独立 loader 每次读取当前文档，并验证 schema、内容身份和所有边引用。profile domains / auto-profile-feed 不接收 story 字段。独立作品投稿和跨用户规则晋级必须由受审的 Cardinal 合同另行接入

可消费的 story 与共享 rules 均要求非空完整 EXE builds 和非空完整剧本锚点，不接受仅 EXE 的退化规则。运行时再次独立拒绝空锚点或将同一 EXE 重复充当剧本的规则。Seed loader 还核对 story.gameKey 与相邻 game.json.key，并限制 story.builds 属于该作品声明的 builds 或 versions 文件；标题匹配不能放宽这个边界

## 一手上游评估

核对日期 2026-11-22；版本表示所读上游 manifest，不等同于 npm 已发布版本

| 候选 | 版本 / 许可证 | 采用范围与取舍 |
| --- | --- | --- |
| [CodeSpoof/extYuRis](https://github.com/CodeSpoof/extYuRis) | master；仓库未声明许可证，不复制其实现 | 只核对 YSVR / YSLB / YSTL 格式字段；运行时继续使用项目已有 YPF/YSTB 解码器，新增受限静态结构读取 |
| [KiriKiri Z](https://github.com/krkrz/krkrz) | master；主许可为 BSD 三条件式条款，附带第三方许可 | 保留现有 XP3、PSB、KSD reader；不运行 TJS，不重新嵌入引擎 |
| [Dagre](https://github.com/dagrejs/dagre) | manifest 3.1.4-pre / MIT | 通用有向图布局最合适的后续增强候选；当前树状章节无需完整图编辑框架，现有依赖中没有该包，新下载冻结期间不增加发布依赖 |
| [ELK.js](https://github.com/kieler/elkjs) | 0.13.0 / EPL-2.0 OR GPL-3.0-or-later | 端口、层级与复杂布线能力超过当前需求，worker 和包体成本较大，未引入 |
| [panzoom](https://github.com/anvaka/panzoom) | 9.4.4 / MIT | 比较暂停/恢复、销毁和缩放边界接口；当前原生 Pointer Events 控件已具备这些边界，没有引入动画与额外运行时依赖 |
| [@xyflow/system](https://github.com/xyflow/xyflow/tree/main/packages/system) | 0.0.84 / MIT | 不依赖 React，但仍需 d3 的若干模块及图编辑适配；本页只读查看，保留轻量 DOM/SVG 与可见节点裁切 |

实际复用已经进入产品：统一 KAG 保存目录 resolver、original-engines 的资源/剧本解码、CG 系统表解析、制卡器缩略图与图像渲染。没有借调研引入第二套存档反序列化实现
