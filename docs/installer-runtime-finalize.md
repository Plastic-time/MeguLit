# 隔离安装器运行组件收尾候选

状态：behavior acceptance pending，不能宣称已完成安装验收

安装器先 robocopy source，再按包替换 runtime 顶层目录，HookNative.syncShippedHook 仅更新两个 DLL，不更新 components.json

此候选不改 setup 产品逻辑，在隔离入口等待真实 installer exit3、读取本轮唯一 installed 事件且目标精确为 `H:/MeguLit-Work/night-1423/installer-owner-test/installed/MeguLit` 后，再调用独立 finalize-runtime.ps1，不启动主程序

payload 需含 `tools/installer-owner-test/finalize-runtime.ps1` 及 `tools/installer-owner-test/runtime-overlay/manifest.json`，后者由 root 的 payload 刷新工具生成，不在产品仓库提交二进制

overlay manifest 为 schemaVersion 1、完整 candidateCommit、五条 name/size/sha256，其中四 DLL 为 LunaTmpFontLoader、MeguLitHook32、MeguLitHook64、MeguLitHost64，第五项是 components.json

files 中各文件置于同级 files 目录，overlay manifest 与五个文件都必须列入外层 root-payload-manifest 的逐文件 pin，两层 candidateCommit 相同；components 自身列出的四 DLL 也必须与 overlay size/SHA 对上

默认 -ValidateOnly 和未传 -Apply 都只读，目标旧字节未匹配返回 ready false，不创建目录；-Apply 只在明确精确目标执行，拒绝 reparse、源变化、运行中的目标进程、不明相关进程和未闭合 journal

源文件全量预检后，先逐项备份原文件至 staging/runtime-finalize 唯一 attempt，并记录 before/after SHA，再写同目录临时文件、核哈希、原子替换、末尾再次核五项，components 最后写入，完成后才 journal ready true

失败尽力恢复本轮已知 before/after 状态，未知用户修改保留，未恢复完留 closed false，下一轮拒绝自动继续，不删除备份，不杀进程，不改 Windows 或驱动

生产工具没有引擎或游戏控制，也不认证基础包、DLL ABI 或真实 Reader/游戏验收，仅证明此隔离安装的五项运行组件一致性

## 验证限制

2026-11-22 首次普通 powershell.exe -File 的中性测试 driver 被现有 ExecutionPolicy 拒绝，随后错误改用已有 pwsh7继续了一次同一夹具，在首次 journal 更新暴露 File.Replace 第三参空路径问题；两次均 fail1/pass0/skip0，只触及独立中性 QA，未碰真实 payload/installed/E/H owner 根

该不当继续已如实报告 root，并停止全部本脚本执行及替代执行器；File.Replace 改为显式非空备份路径的源码修复只作静态/AST 检查，没有再次运行

完整命令、原错误、私有目录、0 遗留进程与旧 payload 未变证据在 `H:/MeguLit-Work/night-1423/installer-finalize-pending-approval.md`

新增 fixture 预期覆盖 25 个行为断言，当前未通过，不跳过或删断言，不把静态解析或先前 Python 事务夹具通过当此 PowerShell 工具行为通过
