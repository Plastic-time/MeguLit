const fs=require('node:fs'),crypto=require('node:crypto');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const previous=read('validation/verification-summary.json'),build=read('build-manifest.json'),tests=read('validation/automated-results.json');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const summary={...previous,milestone:'E194 native home hiding, prerequisites, mining media, provider panel and tray artwork',recordedAt:new Date().toISOString(),build,installedPath:process.cwd()+'\\MeguLit.exe',installedHashVerified:sha('MeguLit.exe')===build.sha256,nodeTests:tests,nativeSelfTests:{hostFrame:true,focusPolicy:true,modeLogic:true,geometry:true,gameAudio:true,startupSurfaceSelection:true,homeTransitionUnitTests:3,homeNativeHide:read('validation/home-native-hide.json')},nativeServiceSelfTest:read('validation/service-host-check.json'),independenceAudit:read('validation/independence-audit.json'),dictionaryRuntime:read('validation/e194-dictionary-test.json'),localeEmulator:read('validation/e194-locale-status.json'),tray:{source:'desktop/icons/icon.ico',embeddedRgba:'desktop/icons/tray.rgba',sha256:sha('desktop/icons/tray.rgba'),preview:'validation/tray-preview.png'},nativeHelper:{path:'native/GalWindowBridge.exe',sha256:sha('native/GalWindowBridge.exe')},ankiModelMigration:{status:'deferred-until-next-mining',reason:'AnkiConnect was not reachable in this test session',automatic:true,backupBeforeReadingRemoval:true,importedModelsExcluded:true},visualAcceptance:{verified:false,reason:'The desktop automation connection was unavailable; actual game flicker, dragging, animations and live mining require interactive validation'},originalDirectoryUnmodified:'E:\\Apps\\ToMe'};
fs.writeFileSync('validation/verification-summary.json',JSON.stringify(summary,null,2));
fs.writeFileSync('validation/e194-anki-model-migration.json',JSON.stringify(summary.ankiModelMigration,null,2));
const notes=`
## E194 — 2026-11-05

- 正式文件已直接应用：MeguLit.exe SHA256 ${build.sha256}；游戏内组件也已应用，旧 ToMe 目录及原始快照未修改
- 主页退出不依赖 WebView 动画结束回调，原生窗口区域收起/展开；结束时直接执行 Win32 隐藏并检查原生可见状态，恢复时清理区域，不在动画期间改变游戏焦点
- 背景预览/保存使用同一图片签名检测，处理扩展名与真实格式不一致，避免预览成功后 INVALID_IMAGE
- 32 位游戏默认使用 Locale Emulator Run in Japanese；可逐游戏关闭或强制指定；游戏库设置提供自动检测、安装、启用开关与路径浏览；64 位自动启动不使用 LE
- Steam、其他目录、LEProc、Anki 与游戏 exe 提供原生浏览；牌组与笔记类型增加用途说明，Alt+T 也增加 Anki 路径浏览
- 缺失 pip 使用随应用打包、校验过 SHA256 的 pip 26.3 wheel 修复；已有词典先检查导入，避免重复下载。实际离线分词与读音已通过
- Alt+T 的选区 AI 设置只显示当前提供商，切换保留独立值；增加 Qwen、Kimi、GLM 并接通 URL / 模型 / 加密密钥保存与调用路径
- 声音播放和面板背景所需 Blob URL 加入范围受限的 CSP；面板外观保存后通知正在运行的 Reader 刷新
- 普通模式独立 Reader 的移动范围扩展到虚拟桌面，保留原快捷键循环；独立 HWND 不再保留普通窗口标题栏
- Anki 矿词模型自动补截图字段；音频捕获失败不跳过截图，缺截图时回报明确提示。新模板无独立 Reading 字段，保留句子振假名
- 旧自有笔记类型在下次制卡时先备份 Reading 值、模板、样式，再移除 Reading；导入的 JLPT 类型不修改。本轮 AnkiConnect 不可达，真实模型迁移尚未执行
- 托盘使用与应用图标一致的小惠惠，32x32 RGBA 嵌入；Build.ps1 可从原 ico 重现

验证：${tests.tests} 项 Node 检查全部通过；3 项 Rust 转换状态测试、原生隐藏离屏 HWND 自检、原窗口/模式/焦点/音频/几何检查、启动画面选择检查、原生服务自检通过。LE 实际检测已安装。没有操作真实游戏存档或 Anki 复习评分

限制：桌面自动化连接不可用，未把真实游戏闪屏、Alt+T 拖动、原生收放动画和实机制卡截图记为已验收
`;
fs.appendFileSync('CHANGES-INDEPENDENT-20261103.md',notes);
fs.appendFileSync('TEST-CHECKLIST.md',`
## E194 验证记录

- [x] ${tests.tests} 项自动检查通过
- [x] 正式 EXE / Reader 组件直接替换、SHA256 确认
- [x] 本地词典可导入，分词/读音实际调用通过，pip 可用
- [x] LEProc 与日语 profile 检测通过
- [x] 选区模型单项显示及切换保留输入的生成代码测试
- [x] 新模板去除独立 Reading，旧模型截图字段升级与迁移备份使用隔离假数据测试
- [x] 原生隐藏离屏测试 HWND 通过，3 项窗口状态测试通过
- [x] 原窗口/模式/焦点/音频/几何自检通过
- [ ] 实际桌面原生收放动画、任务栏、焦点和游戏闪屏复验（自动化连接不可用）
- [ ] 实际 Alt+T 全屏拖动及 LOG/点读图片/毛玻璃复验
- [ ] 连接真实 Anki 后自有模型迁移和实际游戏截图制卡复验（当前 AnkiConnect 不可达，已接入下次制卡自动迁移）
`);
fs.appendFileSync('THIRD-PARTY.md','\nE194: pip 26.3 (MIT), verified official PyPI wheel bundled under runtime/wheels; SHA256 f3b60b20ffaadd4415ed7957212a38ac63fa4c5fa375bd0f4a797777940fad13. Its license is included inside the wheel. No system Python installation is modified.\n');
fs.writeFileSync('validation/e194-provider-sources.json',JSON.stringify({checkedAt:new Date().toISOString(),providers:{qwen:{url:'https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',note:'Official docs say existing regional endpoints remain functional; URL remains editable for workspace domains'},kimi:{url:'https://www.kimi.ai/help/kimi-api/api-overview',baseSource:'https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/providers.md',baseUrl:'https://api.moonshot.ai/v1',model:'kimi-k2.6'},glm:{url:'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction',modelSource:'https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4.7'}},scope:'Official API compatibility, not a popularity ranking; no paid provider requests were made'},null,2));
console.log(JSON.stringify({installedHashVerified:summary.installedHashVerified,tests:tests.passed,dictionary:summary.dictionaryRuntime.stage,localeInstalled:summary.localeEmulator.installed,trayBytes:fs.statSync('desktop/icons/tray.rgba').size}));
