# The Seed

第一批游戏差分种子：开发者本机已经能用的游戏，用 `tools/diff-maker/seed-all.cjs` 一次离线生成。纯数据，只有哈希、编号和差分设置，没有本机路径、用户名或游戏文字

```
The Seed/<engine>/<gameId>/game.json                  游戏层：布局、特效、选项、角色、隐藏方式；key = 游戏身份，prints = pack / script / steam / vndb / title
The Seed/<engine>/<gameId>/versions/<exeSha256>.json  版本层：这一个 exe 专属的键；key = exe 整文件 SHA-256，prints = exe / head / pe
```

- 都是 `core/game-diff.cjs` 的文档（`layer` 为 game / version），未签名；签名用 `tools/sign-profile.cjs`
- 只收有运行样本、且每个自检窗口都在隐藏模式下过线的游戏；没样本的骨架和读模式草稿不进这里
- 重新生成：`node tools/diff-maker/seed-all.cjs`（只读游戏库和日志，不开游戏）
