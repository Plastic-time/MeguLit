# Installer copy: old → new

All strings live in `I18N` at the top of `scene.js` (zh first, English second, `?lang=en`). Error codes and hosts are not shown; they go into "复制日志".
Decorative big caps stay English on purpose (WHERE, ALL SET, INSTALL LOCATION, MEGU / LIT background type). Chinese carries the meaning.

| 状态 | 旧文案 | 新文案（zh） | 新文案（en） |
| --- | --- | --- | --- |
| 步骤条 | 准备 · Prepare / 位置 · Location / 下载 · Download / 安装 · Install / 完成 · Done | 开始 / 位置 / 下载 / 安装 / 完成 | Start / Location / Download / Install / Done |
| 欢迎牌 | 安装 · INSTALL | 先把东西备齐 | Getting things ready |
| 位置牌 | 装到哪里 · 选一个位置 | 你想装在哪儿 | Where should it live? |
| 选位置 标题 | 装到哪里 | 装在哪儿 | Where to? |
| 换位置按钮 | 更改 Browse | 换一个 | Change |
| 磁盘空间 | 所在磁盘可用 182 GB · 需要约 1.4 GB | 这块盘还剩 182 GB，装完大约占 1.4 GB | 182 GB free on this drive, needs about 1.4 GB |
| 磁盘不够 | 所在磁盘空间不够：需要约 X，只剩 Y，换一个空间大一点的盘吧 | 这块盘只剩 Y，装不下（要 X），换一个盘吧 | Only Y free here and it needs X. Pick another drive. |
| 快捷方式 | 桌面快捷方式 Desktop shortcut | 放一个桌面快捷方式 | Desktop shortcut |
| 开始菜单 | 开始菜单 Start menu | 加到开始菜单 | Start menu entry |
| 安装按钮 | 开始安装 Install | 开始安装 | Install |
| 位置页说明 | 运行组件正在后台下载，这会儿选好位置就行；全部来自各项目官方原版文件，逐个校验 SHA-256。 | 东西已经在后台下了，你慢慢挑位置。都是各项目官方的原版文件，下完会逐个校验，被改过的不会装。 | The download already started in the background, so take your time. Every file is the original from its project and gets checked before anything is installed. |
| 测速 标题 | 正在选最快的源 | 先找条最快的路 | Finding the fastest route |
| 测速 说明 | 同时给 GitHub 和国内镜像测速，挑最快的几个一起下 | GitHub 和国内镜像一起测速，挑最快的几条同时下。 | Testing GitHub and the mirrors at the same time, then using the quickest few. |
| 下载中 标题 | 正在下载 语音引擎 | 在下「语音引擎」 | Downloading voice engine |
| 下载中 说明 | 来源 cn-dl.megulit.com 等 3 个源 · 每块碎片是一个真实的下载分段 | 现在走的是 cn-dl.megulit.com 等 3 条线。底下那条细线，每一格都是一段真实在下的数据。 | Pulling from cn-dl.megulit.com and 2 more. Each tick in the thin line below is one real piece of the download. |
| 换线重试 | （没有） | 有一条线卡住了，已经自动换线重试。 | One route stalled, so it switched and is trying again. |
| 剩余时间 | 约剩 3 秒 / 约剩 1 分 20 秒 | 还要 3 秒左右 / 还要 1 分 20 秒左右 | about 3 s left / about 1 min 20 s left |
| 测速中（速度位） | 测速中 | 测速中 | testing |
| 校验 | 正在校验 X… / Verifying | 在核对「X」是不是原版，几秒钟的事。 | Making sure X is the original. Takes a few seconds. |
| 解包安装 | 正在安装 / 解压 X 到 路径 | 在装了 / 把「X」解压到 路径。 | Installing / Unpacking X into path. |
| 组件名 | 基础组件 / 注音分词词典 / 语音引擎 | 基础组件 / 注音词典 / 语音引擎 | core files / furigana dictionary / voice engine |
| 完成 标题 | 装好了 | 装好了 | All set |
| 完成 按钮 | 启动 MeguLit Launch | 打开 MeguLit | Open MeguLit |
| 下载出错 标题 | 下载中断了 · Download interrupted | 下载断了 | The download stopped |
| 下载出错 正文 | 所有下载源都连不上（cn-dl…、dl…、github.com 均无响应） | 试了好几条线，都连不上。多半是网络断了，或者被代理拦住了。 | Every route failed to answer. Usually that is the network or a proxy. |
| 下载出错 下一步 | 先点「重试」：会重新测速、换最快的源，已下好的碎片保留。还是不行就复制日志发给我们，或到官网手动下载整包。 | 先点「重试」，已经下好的部分不会重下。还不行就点「复制日志」发给我们，或者去官网手动下整包。 | Hit Retry first, what is already downloaded is kept. If it still fails, copy the log and send it to us, or grab the full package from the site. |
| 安装出错 标题 | 安装没有完成 · Install did not finish | 没装完 | Could not finish installing |
| 安装出错 正文 | 解压失败：…文件被其他程序占用 | 有些文件被别的程序占着，覆盖不了。 | Another program has some of the files open. |
| 安装出错 下一步 | 关掉占用的程序、腾出磁盘空间后点「重试」；组件已经下载好，不会重下。 | 先把开着的 MeguLit 关掉，杀毒软件的扫描也停一下，再点「重试」。东西已经下好了，不会重下。 | Close any running MeguLit and pause your antivirus scan, then hit Retry. Nothing gets downloaded twice. |
| 出错按钮 | 重试 Retry / 复制日志 Copy log / 手动下载 | 重试 / 复制日志 / 手动下载 | Retry / Copy log / Download manually |
| 复制后 | 已复制 Copied | 已复制 | Copied |
| 关闭确认 | 还在下载 Download in progress / 现在关掉也没关系：已经下好的碎片会保留，下次打开接着下。 | 还没下完 / 现在关也行，已经下好的会留着，下次打开接着下。 | Still downloading / You can close it now. What is downloaded is kept and picks up next time. |
| 关闭确认按钮 | 继续下载 Keep going / 关闭 Close | 继续下 / 先关掉 | Keep going / Close for now |
| 窗口按钮提示 | 最小化 Minimize / 关闭 Close | 最小化 / 关闭 | Minimize / Close |
