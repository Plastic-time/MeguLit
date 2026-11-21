# 安装器隔离验收准备

本轮只准备代码、行为夹具和无头动画证据，实际安装与前台体验由店主验收，最终候选由夜间 root 统一提供

## 现有实现与参考

- 复用 `setup/setup-runtime.ps1` 的真实下载、续传、SHA 校验、robocopy、tar 解包和完成逻辑，皮肤仍由 `setup/setup-web.ps1` 驱动 `setup/ui-web`，不启用 PREVIEW、demo 或假安装状态
- 既有 `validation/setup-flow.test.cjs` 使用 HidDesk 与本地夹具包验证真实窗口，既有下载 driver 通过 AST 提取生产函数进行无窗口测试，本轮沿用后者测试边界，没有运行 setup-flow/watchdog 或创建原生窗口
- 实现前核对 [Microsoft 路径与命名规则](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file)、[FileAttributes.ReparsePoint](https://learn.microsoft.com/en-us/dotnet/api/system.io.fileattributes) 与 [robocopy 参数](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy)，使用本机已有 PowerShell/.NET、NTFS 属性及 `/XJ`，无新依赖或第三方代码复制

## 固定环境与运行方式

双击入口：`H:/MeguLit-Work/night-1423/installer-owner-test/启动隔离安装测试.cmd`

| 目录 | 用途 |
| --- | --- |
| `source` | root 放入最终安装源，必须是同一候选的真实 exe、setup 与程序文件，不能拿当前分支的旧 main 当新版 |
| `installed/MeguLit` | 安装器复制程序及解包 runtime 的默认目标，编辑或 picker 只允许 `installed` 内的路径 |
| `staging/packs` | 真组件包下载与续传，取消时保留，安装成功后沿用原流程清理 |
| `env/temp`、`env/local`、`env/roaming` | 独立 TEMP/TMP/LOCALAPPDATA/APPDATA |
| `profile/user`、`profile/webview2` | 独立 USERPROFILE/HOME 和 WebView2 数据 |
| `log` | 每次启动的 JSON 收据、JSONL 事件、UI 日志与私测锁 |

启动器建立全新的子进程环境白名单，不继承 API key、token、代理或旧 setup 覆盖项，只直接调用候选 `setup-runtime.ps1`，不会启动主程序

启动前核 C/E/H 各至少 10 GiB、可用内存至少 4 GiB，并以程序副本 + 三组件压缩包 + 全部展开大小加 10% 计算 H 盘峰值，另留 10 GiB；私测安装器的空间需求也保留 10 GiB 余量

私测入口要求显式 `MEGULIT_SETUP_TEST` 和 `MEGULIT_SETUP_TEST_ROOT` 及隔离目录配置，缺项在任何日志、Forms 或 WebView2 初始化之前终止

`TEST_ROOT` 是可复用的私测配置项，通用安装脚本不硬编码本机盘符；店主启动器不接受根目录参数，固定使用上表的 H 盘根目录

目标、写探针、picker 建目录、源/目标复制、暂存、解包、runtime 替换与清理入口检查路径区域和已有路径的 reparse 属性，拒绝 UNC/设备路径、盘根、相邻前缀、路径穿越、流名和 Windows 路径别名

解包前只允许 ZIP 中 `runtime/` 内的普通目录或文件，拒绝链接、路径穿越和流名；源/目标目录树中的 reparse point 拒绝处理，避免 robocopy 或清理沿链接出界

这是一项 opt-in 文件路径护栏，未更改普通安装流程、Windows 设置、安全策略或 ACL，也不充当防御同权限其他进程恶意并发改路径的系统沙箱

测试模式依旧禁快捷方式、卸载注册项与安装后自动 relaunch，两个系统集成函数自身也有 testLog 早退防护，WebView2 数据保留在私测目录便于查看日志

## root 最终落地合同

本分支与候选合并后，由 root 将最终真实安装源放入 `source`，把 `tools/installer-owner-test` 的启动文件复制到固定测试根目录

`root-payload-manifest.json` 格式见 `tools/installer-owner-test/root-payload-manifest.example.json`，初始 `ready:false`，最终必须包含：

- `schemaVersion:1`、布尔 `ready:true`
- 真实最终构建的完整 40 位 `candidateCommit`，以及 exe FileVersion 对应的 `packageVersion`，不强写未发布版本号
- `files` 列出 `source` 中每个文件的正斜线相对路径、字节数 `size`、逐文件 `sha256`，包含新的 scope helper、真实 UI/视频和 WebView2 DLL

清单与实际文件必须双向精确一致，含用户 data、凭据、密钥或本地数据库的源会被拒绝，exe 版本也必须匹配；这是 root 对构建来源的声明，并不以版本号代替 commit 构建证据

root 放入完成后先运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File H:\MeguLit-Work\night-1423\installer-owner-test\launch-installer-test.ps1 -ValidateOnly
```

`-ValidateOnly` 只验证文件与资源门，不启动安装器，普通双击也会先做同样校验

暂不新下载大包，已有完整组件包复用须由 root 与唯一下载 owner 协调，复制至暂存后核对 `setup/runtime.json` 中的完整 size/SHA，再生成原安装器所需的 `.ok` 标记，不得拿空文件或伪 marker 冒充组件包

## 店主一次实际验收

1. 双击入口，确认能看见开场、欢迎、选位置、下载/复用组件、安装和完成动效，所有阶段都来自同一次真实安装交互
2. 默认装到 H 盘隔离目标，也可在该 `installed` 区域内改位置；输入 `E:\MeguLit`、用户目录或测试根外位置时应拒绝，不应产生写探针、复制或解包
3. 按安装后核对 `log/events-*.jsonl` 的 confirmed/copy-start/downloaded/unpacked/installed 及退出码，移动安装成功为 3；退出码 3 在 testLog 下不会自动启动 MeguLit
4. 在下载中取消再开可续传，关闭完成页后不新增正式快捷方式、卸载键，也不启动程序；未安装完成时退出码为 1，属于原安装器取消语义
5. 出问题交整个 `log` 目录，保留 `source`、`installed`、`staging` 与 `profile`；动画截图只证明视频渲染，不能替代此安装验收

相关无 GUI 检查：`node --test validation/setup-scope.test.cjs validation/setup-resize.test.cjs`

`capture-animation.cjs` 只载入真实仓库 UI 与 MP4，未接安装 host、未模拟下载/安装完成，浏览器强制无头且 finally 关闭；截图与 receipt 位于 `log/animation-ui-only`
