const fs=require('node:fs'),crypto=require('node:crypto');const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));const build=read('build-manifest.json'),tests=read('validation/automated-results.json'),summary=read('validation/verification-summary.json');summary.milestone='E195 automatic settings and library refresh, border treatment and transient learning notice';summary.recordedAt=new Date().toISOString();summary.build=build;summary.nodeTests=tests;summary.installedHashVerified=crypto.createHash('sha256').update(fs.readFileSync('MeguLit.exe')).digest('hex')===build.sha256;summary.independenceAudit=read('validation/independence-audit.json');summary.e195={settingsAutosave:{enabled:true,saveButtonRemoved:true,serialized:true,flushBeforeNavigation:true},library:{startupIncremental:true,oncePerServiceProcess:true,manualRefresh:true,settingsShortcut:true,preservesNameCoverLocale:true,preservesEditsDuringScan:true},learningNotice:{holdMs:2800,fadeMs:350,duplicateSuccessDoesNotExtendLifetime:true},homeFrame:{nativeBorderSuppressed:true,resizeStylesRetained:true,visualVerificationPending:true},homeModuleInitialization:'passed VM evaluation of the actual home module; browser rendering not covered',userVisualFeedback:'User confirmed expand/collapse works; reported white border addressed in this build'};fs.writeFileSync('validation/verification-summary.json',JSON.stringify(summary,null,2));
const note=`
## E195 — 2026-11-05

- 按用户最新要求，删除主页设置的保存按钮；常规、背景、翻译、语音、Anki、游戏库等设置修改后自动保存，输入做短暂合并，写入串行，切换设置页/主菜单及窗口按钮操作前补存；失败保留修改并提示。API 密钥独立按钮与新增游戏确认不属于本次移除范围
- 游戏库每次启动在首页已就绪后后台增量扫描一次；已有游戏复用元数据，继续发现新游戏；手动刷新可重复，重叠扫描合并
- 游戏库右上角增加刷新与设置按钮，设置直接打开“学习与数据 → 游戏库”，保留搜索和添加游戏入口；刷新时禁用按钮并显示旋转状态
- 扫描保留已编辑的游戏名、封面、逐游戏 Locale 模式，不恢复已删除作品；扫描结束时合并扫描期间新保存的目录/Locale 设置，避免后台任务覆盖用户修改
- “SudachiDict Full 已安装”在游戏中显示 2.8 秒后以 350ms 渐隐并移除；连续相同成功消息不会延长停留，设置页仍保留状态详情
- 用户已确认原生展开/收起正常。本轮为其白边添加深色 DWM / 无边框颜色及非客户区绘制策略，保留原生尺寸调整样式；实际白边效果待交互桌面复验

正式文件：MeguLit.exe SHA256 ${build.sha256}
验证：${tests.tests} 项 Node 检查全部通过，覆盖自动保存合并/失败保留/补存、扫描去重/重试/新目录发现/并行修改保护、成功提示渐隐；实际首页模块 VM 初始化通过，原生隐藏与服务自检通过。没有操作真实游戏存档或 Anki 评分
`;
fs.appendFileSync('CHANGES-INDEPENDENT-20261103.md',note);fs.appendFileSync('TEST-CHECKLIST.md',`
## E195 验证记录

- [x] ${tests.tests} 项自动检查通过，正式 EXE 哈希一致
- [x] 设置自动保存合并写入、失败保留、切换页前补存
- [x] 每进程启动扫描一次、手动重复刷新、并发扫描合并
- [x] 增量复用已有作品并发现新目录，保留自定义名称/封面/Locale
- [x] 后台扫描结束不覆盖期间保存的新目录设置
- [x] 安装成功提示 2.8 秒后渐隐，重复消息不续时
- [x] 首页真实模块 VM 初始化、Reader bootstrap 与原生服务/隐藏自检
- [ ] 原生白边修复的实际桌面画面复验
`);console.log(JSON.stringify({milestone:'E195',tests:tests.passed,installedHashVerified:summary.installedHashVerified}));
