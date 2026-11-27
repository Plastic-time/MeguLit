# HANDOFF：谁在做什么

多人（RRFZ、魚魚棟的 Claude 会话、其他 agent）同时在修 MeguLit，为了不撞车、不重复修，所有人共用这一份登记表。

## 规矩
1. **开工前先看这里**：要做的问题在下表里已经有人认领、状态不是「完成」，就别做，换一条
2. **开工就登记**：在「进行中」表里加一行，写清谁、做什么、对应 issue、分支，再开始写代码
3. **做完就挪走**：合并（或放弃）的当天，把这一行从「进行中」删掉，在 `HANDOFF-done.md` 最上面加一行：`- 日期 · 谁 · 做什么 · issue · PR`（放弃写「放弃」和原因）。HANDOFF 只留正在做的
4. agent 也照做：每个任务开始前读这份文件，开工时自己往里写一行，结束时更新
5. 一条只认领一次；认领超过 3 天没动静的，可以在群里问一声再接手
6. **代码不要直接 push 进 main**（包括 RRFZ、魚魚棟的 Claude 会话、其他 agent）：推自己的分支 → 开 PR → CI 通过、确认没问题 → **squash 合并**
7. **HANDOFF.md 例外，可以直接 push 进 main**：认领、改状态、写「修了啥」都直接改直接推，第一时间让大家看到，不用等 PR。只改这一个文件，别夹带代码
8. **撞车时 RRFZ 优先**：RRFZ 已经在做的，或者他想接手的，直接在那一行把「谁」改成他、状态写一句，Claude 会话看到就停手，不争、不覆盖他的改动
9. **适配好一部游戏就登记**（所有人，包括 RRFZ、魚魚棟的 Claude 会话、其他 agent）：某部游戏的某个发行版本适配好了（验收过，seed 已合并或 PR 已开），马上在下面「已适配的游戏」表里加一行。**用 VNDB 作品号（v 开头）认游戏，用发行版本认版本**（平台 / 版本名，例如 Steam 版、DL 版、DVD 版、HD リマスター、汉化硬盘版；查得到就附 VNDB 发行号 r 开头），不用 exe 哈希去重（打补丁、免 DVD、汉化都会改 exe）。**开始适配前先查这张表**：同作品同发行版已在表里的不要再做；同作品不同发行版也别从零做，先拿已有的 seed 跑，游戏层一般能直接用，只补版本层
10. **所有游戏适配都走 MeguLit-Adapter**（`node tools/megulit-adapter.cjs <游戏目录>`）：不再写一次性的适配脚本。每适配一部学到的东西（新的引擎特征、隐藏方式、版本指纹、踩的坑）都写回适配器的引擎层或规则表（`tools/megulit-adapter/engines.cjs`、`plan.cjs`、`checkpoints.cjs`，剧本格式写回 `services/original-engines/`），这部游戏自己的设置只进 The Seed
11. **状态栏只写一句话**：在做 / 等 CI / 等合并 / 暂停：原因。过程、根因、实测细节写进 PR 正文（AGENTS.md 本来就要求「问题 / 改动 / 验证」），不写在这里
12. **开工前查重**：先在 `HANDOFF-done.md` 和已合并的 PR（`gh pr list --state merged --search <关键词>`）里搜要做的问题或游戏；issue 已关并写了修复 PR 的，不再重做

## 已适配的游戏

按「VNDB 作品号 + 发行版」去重，不按 exe 哈希。状态：verified = 官方验收过；owner-ok = 店主确认能用；read = 能用但只能读模式、待修；进行中 = PR 已开未合并

| 游戏 | VNDB | 发行版 | 引擎 | 状态 | 谁 | PR / seed |
|---|---|---|---|---|---|---|
| 千恋＊万花 | v19073 | 待补 | KiriKiri | verified | 魚魚棟 | kirikiri/senren-banka |
| ファタモルガーナの館 | v12402 | 待补 | KiriKiri | owner-ok | 魚魚棟 | kirikiri/fata-morgana |
| 死に逝く君、館に芽吹く憎悪 | v19233 | 汉化硬盘版 | KiriKiri | read | 魚魚棟 | kirikiri/shiniyuku-kimi |
| CHAOS;CHILD | v14018 | 待补 | MAGES | verified | 魚魚棟 | mages/chaos-child |
| STEINS;GATE | v2002 | 待补 | MAGES | read | 魚魚棟 | mages/steins-gate |
| 素晴らしき日々～不連続存在～ | v3144 | 待补 | BGI | verified | 魚魚棟 | bgi/subahibi |
| 沙耶の唄 | v97 | Steam 版（待核实） | Nitroplus | verified | 魚魚棟 | nitroplus/saya-no-uta |
| 女装山脈 | v6589 | 待补 | YU-RIS | owner-ok | 魚魚棟 | yuris/josou-sanmyaku |
| オルフレール | v15563 | 待补 | KiriKiri | 进行中（冷测试连续 5 局通过） | 魚魚棟 · Claude | PR #1291 |
| Monochrome Empire | v26413 | 待补 | YU-RIS2 | 进行中（选项被隐藏，卡在原生 hook） | 魚魚棟 · Claude | PR #1291 |
| ハミダシクリエイティブ | v27449 | パッケージ版 | Artemis | 进行中 | 魚魚棟 · Claude | artemis/hamidashi-creative（MeguLit-Adapter） PR #1303 |
| アイキス3 sexy | v32132 | 豪華版 DVD（r84077）+ Ver.1.03 | NeXAS | 进行中（skeleton：选项被字形隐藏吃掉、句首「漏出，未修） | 魚魚棟 · Claude | nexas/ai-kiss-3-sexy（MeguLit-Adapter） PR #1304 |

## 进行中

| 谁 | 做什么 | issue | 分支 | 开始 | 状态 |
|---|---|---|---|---|---|
| 魚魚棟 · Claude | 实机验证 ファタモルガーナの館、千恋＊万花、ISLAND 的第一个选项在阅读层上有中文，出不来的修；PostMessage 推进 + WGC 截图做成适配器实机验证步骤 | — | fix/choice-live | 11-27 | 进行中 |
| 魚魚棟 · Claude | 适配 OZMAFIA!!（YU-RIS）、ハミダシクリエイティブ（常轨脱离Creative，Artemis）：走 MeguLit-Adapter 实机验证，每部一个 seed PR | #1107 #1133 | claude/ozmafia-joki | 11-27 | 常轨脱离 #1303 修原文隐藏中；OZMAFIA 找资源中 |
| 魚魚棟 · Claude | 制服カノジョ3（制服女友3，Unity/TMP）：原文漏出 <space=> 等 TMP 标签且同句重复；回 log 后原文没藏干净、台词消失 | #1248 | fix/unity-tmp-space-backlog | 11-27 | 等 CI + 测试员实测（PR #1309） |
| 魚魚棟 · Claude | YU-RIS 引擎层：正文 N 倍逐字重复去重、正文线程选择 | — | engine-yuris | 11-26 | 暂停（已提交） |
| 魚魚棟 · Claude | 模拟器实验：Switch 模拟器（Eden/Ryubing）里读对话文本 + 换成等长空白隐藏原文、选项照常；样本 一部 Switch 乙游 + 海猫 Switch 版（DS 下… | — | exp/emulator-hook | 11-27 | 暂停：磁盘（E 盘剩余空间不足；adapt 下的 swit… |
| 魚魚棟 · Claude | 适配 アイキス3 sexy（NeXAS，包装版 + 1.03），走 MeguLit-Adapter；写回：光盘自动安装 + GIGA 更新、NeXAS 存档、截图只认本游戏、每游… | #1109 | adapt/aikiss3-sexy | 11-27 | #1304 修选项隐藏中 |

