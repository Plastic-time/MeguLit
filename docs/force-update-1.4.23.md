# 1.4.23 强制更新交付与验收

本次只提交代码和离线测试，未部署 relay、未推送、未发版、未生成 beta、未替换正式或隔离安装
版本号文件保持 1.4.22，改动预留给下一次正式版 1.4.23
`relay/wrangler.toml` 中 `FORCE_UPDATE_ENABLED = "false"`、`MIN_APP_VERSION_OVERRIDE = ""`

## 行为

- `GET /api/update/policy` 返回 `latest`、`minVersion`、`message`，正式 release 降序去重，排除 draft、prerelease
- 同一版本线按最新 patch 减 2 保留三个版本；跨版本线取第三个正式 release；合法手动覆盖不能高于 latest
- 例如发布 1.4.23 后默认允许 1.4.21 / 1.4.22 / 1.4.23，1.4.20 及更低强更并拒收上传
- 开关关闭不做上传门禁、不读取请求体，最低版本返回 null；客户端拉不到 policy 时不强更，离线可以用
- 启动立即开始检查，更新居中并阻塞首次启动队列；关掉普通更新后才显示正在开发中 → The Seed → 教程 → 初始文件夹
- 设置内手动检查保留右下角；如果被服务器判定必须更新，则升级为居中强更
- 强更初始只有立即更新，原生 modal 捕获焦点，Esc/遮罩不放行；下载失败仍保留 modal，可重试或打开官方 release 页
- 点击强更会重新获取 latest，跳过旧的 found 和小包选择，不逐版升级；绕过客户端 release 缓存，relay 支持 no-cache 刷新元数据
- 国内强更分组下载：cn-dl / dl 先试，其次代理，GitHub 最后兜底；每组沿用现有下载器的断点续传和 SHA-256 校验
- 下载就绪后调用原有 update_install，再 app_exit_for_update；真正安装和重启仍由原有 PowerShell 更新脚本负责，本次没有运行安装器
- 三语提示包含「稍等一下，更新通常很快就好～下载完成后会自动安装、重启 MeguLit，再回来陪你」，保留游戏库、记录、设置说明

## 已装旧版的能力边界

重跑 `node tools/audit-force-update-history.cjs` 可输出 tag commit、blob、代码行和能力检查
本次完整结果在 `H:\MeguLit-Work\force-update\legacy-evidence.json`

| 版本 | 能否仅靠服务器开关在原安装上强制弹窗 | 证据性质 |
|---|---|---|
| 1.4.16 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.16 / 4ecfedb6 |
| 1.4.17 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.17 / d49d2062 |
| 1.4.18 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.18 / 358aad00 |
| 1.4.19 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.19 / 1ea29bda |
| 1.4.20 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.20 / 3014336b |
| 1.4.21 | 推测不能，未找到该版 release tag 或可证明原始出处的完整源码 | 推测，不能用邻版代替查证 |
| 1.4.22 | 不能，仍是可关闭的普通更新提示 | 查代码确认，v1.4.22 / 5aa90569 |

六个可核对 tag 的 `web/update-notice.js` 都有 data-upd-close、稍后和 close，没有 minVersion / UPDATE_REQUIRED / info.required 的消费分支
`web/feedback-ui.js` 只把 site_updates 作为公告列表，内容经过转义；服务器公告可以提醒，不能取消旧版关闭按钮或注入代码
`services/update.cjs` 的 latest 只取固定 release 元数据，没有下载并运行服务器弹窗代码的入口，新增 force 字段不起作用

六版均有热更新入口，但 `services/hot-update.cjs` 的 fits 要求当前版本等于 hot.from、已装摘要前缀等于 hot.fromDigest；asset 只取找到的第一个热包
所以它是可用的有条件升级路径，不是“所有 1.4.16–1.4.22 立即强更”的保证
本次没有制作、上传热包，也没有改旧版公告；1.4.23 将来能否提供兼容热包，还取决于那次全部合并的 native / HTML 变化，不能提前承诺
从装入本次代码的 1.4.23 起才具有原生强更能力；服务器上传拒收则对所有能识别版本的旧安装直接有效

## 上传门禁与旧版收到拒绝后的行为

- relay 在所有业务写入前检查 feedback、diagnostics、probe 及子路由、adapters、contrib、Cardinal、game-profile、torch、旧 adaptation 上传
- 版本来源依次为 x-megulit-version、app / appVersion、profile.version、反馈 page=app/x.y.z
- 无版本的 full-probe part/complete 可按 upload 查询 probe_full.app，防止最低版本提高前创建的上传继续写入
- 低版本返回 HTTP 426 + UPDATE_REQUIRED + policy + Retry-After: 86400，不运行业务 D1/R2/GitHub/刻碑或使用统计写入
- 六版反馈服务的 page 均携带 UI 传入的版本，收到 426 返回失败且不自动重试；probe、full-probe、contrib 均携带版本头，4xx 立即结束该次发送
- probe-auto 的后台重试仍会在 15 分钟起、指数退避至最长 24 小时后再试，不会紧循环刷请求；旧版可见“上传失败”等普通错误，不能被返回值变成强更 UI
- 新版 relay-gate 会补版本头，记录 426，并在本进程阻止后续相关上传继续打网络；页面检查信号后显示强更，policy / release 读取不受阻

### 尚需店主决定的无版本请求

无版本、无可靠 upload 记录的请求不具备可证明的发送版本
例如旧版 game-profile/credit 仅有 key/name，feedback 的空 page 可能来自网站或第三方工具，裸 probe/has?seen=1 也不携带发送者版本
本次保留这些不可判定请求的原有处理，没有擅自全拒；这意味着不能声称所有无版本旧请求已拦住
若要改为「缺版本也拒绝」，需店主另外确定兼容网站、维护工具和旧请求的范围，再加 VERSION_REQUIRED 门禁
probe/has 的 seen=1 是旧有的计数副作用，并非本次上传门禁；无法从它猜出发送版本

## 测试与截图

只用 node 执行更新、policy、门禁、队列和 DOM 事件回归；没有启动 MeguLit.exe、游戏或安装器
截图使用 `H:\MeguLit-Work\force-update\shot-server.cjs`：实际 update-notice 组件与 CSS，API 完全模拟，背景是仓库已有首页截图，属于离线 UI 夹具，不是当前正式安装截图

- `H:\MeguLit-Work\force-update\forced-zh-dark.png`
- `H:\MeguLit-Work\force-update\forced-downloading.png`
- `H:\MeguLit-Work\force-update\forced-failed.png`
- `H:\MeguLit-Work\force-update\forced-en-dark.png`
- `H:\MeguLit-Work\force-update\forced-ja-light.png`
- `H:\MeguLit-Work\force-update\forced-narrow.png`
- `H:\MeguLit-Work\force-update\ordinary-center.png`
- `H:\MeguLit-Work\force-update\manual-corner.png`

每张的页面错误、按钮、尺寸、API 调用在 `screenshots.json`，测试结果在 `final-tests.log`

2026-11-22 验证结果：相关完整集合 92/92 通过，最后的门禁健壮性与界面改动再做范围回归 65/65 通过，两者有重叠，不相加；变更 JS/CJS 均通过 node --check，git diff --check 通过
范围回归详情在 `H:\MeguLit-Work\force-update\final-scoped-tests.log`；8 张截图的 pageerror 均为空、没有横向溢出，窗口居中与手动右下角位置已核对
真正安装/重启和正式版 UI 尚待店主操作，未把 Node 替身结果当成真机通过

## 店主实际验收清单

等 1.4.23 正式发布且国内镜像可下载，再另行授权开启开关，当前不要部署或开启

1. 测试 policy：latest=1.4.23 / minVersion=1.4.21 时，低版本启动先出现强更，没有稍后，Esc/遮罩不能跳过；正常版本启动可选稍后，之后才轮到首次启动介绍
2. 点击立即更新：看到最新 release 的真实进度、校验、自动安装和重启，重开后版本为 1.4.23，游戏库和设置保留
3. 暂时断网：全新启动拉不到 policy 时不强制；已显示强更后下载失败保持拦截，可重试和手动下载
4. 设置里手动检查：普通结果在右下角；中/英/日及浅色、窄窗口可读
5. 在门禁开启的测试 relay 上发低版本 feedback/probe/Cardinal/传火上传：426，业务存储和记账不增长；1.4.21 及更高按原规则处理
6. 不通过时提供 logs/update.log、当前版本、policy 返回内容、错误截图；上传门禁额外给路由、状态码和版本字段，不提供密钥
