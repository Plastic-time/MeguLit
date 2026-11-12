本次 beta 在 1.4.9-beta.8 上做了三轮检查与清理，功能效果不变：

- 修复：KiriKiri 游戏剧本里夹带的行内指令（字体、音高、语音同步，如 9-nine 的破折号行）不再挡住译文配对，这些台词会直接用游戏自带的中文，不再走机器翻译
- 修复：较早导入的汉化补丁现在也会显示配对统计（总数 / 已配对 / 未配对）
- 发布包不再带入仓库里已经删除的旧文件
- 代码整理：把 30 个挤成一行的超长模块按语句拆开，方便后续维护

仅在开发者本地测试过，可能还有没发现的问题，会持续跟进修复
---
Three rounds of checks and cleanup on top of 1.4.9-beta.8; features behave the same:

- Fix: inline commands inside KiriKiri scripts (font, pitch and voice-sync tags, e.g. the dash lines in 9-nine) no longer break translation pairing; those lines now use the game's own Chinese instead of machine translation
- Fix: Chinese patches imported earlier now show their pairing numbers too (total / paired / unpaired)
- The release package no longer carries files that were deleted from the repository
- Code tidy-up: 30 modules squeezed into very long single lines are split at statement boundaries

Only tested locally by the developer; there may be problems not found yet, and fixes will keep coming