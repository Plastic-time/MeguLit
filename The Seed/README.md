# The Seed

**中文** · [English](#english)

The Seed 是 MeguLit 内置的「游戏差分」：每部游戏、每个 exe 版本各一份几 KB 的纯数据文件，告诉 MeguLit 这部游戏的文字该怎么隐藏、放在哪、选项怎么认。它随 GitHub main 发布、随安装包放在 `MeguLit/The Seed/`，热更新也会带上新的 seed

MeguLitHook 是所有游戏共用的内核；它上面每个引擎一层「引擎差分」，每部游戏一层「游戏差分」。修一部游戏只改它自己的 seed，不会影响别的游戏。完整设计见 [docs/diff-layers.md](../docs/diff-layers.md)

## 目录

```
The Seed/
  <engine>/                       引擎 id：kirikiri、bgi、siglus、yuris、rpgmaker……
    <gameId>/                     游戏 id：原名罗马字或英文名的 slug，例如 senren-banka
      game.json                   游戏层：对这部游戏所有版本有效
      versions/
        <exe SHA-256>.json        版本层：只对这一个 exe 有效
```

## game.json（游戏层）

```json
{
 "schema": "megulit.seed", "version": 1, "layer": "game",
 "id": "senren-banka", "engine": "kirikiri",
 "title": { "ja": "千恋＊万花", "zh": "千恋万花" },
 "prints": { "steam": "1144400", "title": "<标题哈希>" },
 "match": { "exe": ["SenrenBanka.exe"], "titles": ["Senren Banka"], "notTitles": [] },
 "rev": 1,
 "mode": "hide",
 "settings": { "placement": { "drawWhileBlanking": true } },
 "note": "为什么这样设"
}
```

- `prints`：游戏层指纹（`core/game-print.cjs`）：`pack` 主封包、`script` 剧本、`steam`、`vndb`、`title` 标题哈希。不能放 exe 指纹
- `match`：按程序名和标题认游戏（汉化改名、盗版换壳时用）
- `settings`：只能用 `core/profiles/defaults.cjs` 里登记过、并且在 `core/profiles/domains.cjs` 标成游戏层的键，值必须在值域内
- `mode`：`hide`（隐藏原文，MeguLit 画）或 `read`（原文留着，只显示译文；必须同时设 `hide.textEffectsRead: true`）

## versions/&lt;exe SHA-256&gt;.json（版本层）

```json
{
 "schema": "megulit.seed", "version": 1, "layer": "version",
 "key": "<exe 文件完整 SHA-256，64 位小写>",
 "prints": { "exe": "<同 key>", "head": "<首尾 64 KB 哈希>", "pe": "1.2.0.0@5f3a1b2c" },
 "exe": "SenrenBanka.exe",
 "rev": 1,
 "settings": {},
 "note": ""
}
```

- 文件名就是 `key`；只对这个 exe 有效，可以放任何键（这个 exe 自己的值）
- 原生钩子、exe 专属开关只能放在这里

## 规则

- 纯数据：不放代码、路径、用户名、邮箱。`validation/the-seed.test.cjs` 会扫整个目录检查格式、值域、指纹格式和隐私
- `rev` 只增：改了就加 1。下发的官方差分 rev 更高时会覆盖内置 seed
- 内置 seed 随代码发布，视为官方，不签名；运行时从服务器下发到用户电脑 `data/The Seed/` 的差分必须验签

## 怎么贡献

1. 一键上传探针（MeguLit 里的「共享适配」），或者在 issue 里附上日志
2. 维护者用 `tools/diff-maker` 离线做出差分草稿和回放夹具（`validation/fixtures/games/<gameId>/`）
3. 草稿审过后写进 `The Seed/<engine>/<gameId>/`，跑 `node --test validation/the-seed.test.cjs validation/games-regression.test.cjs`
4. 提交到 main，下个版本或热更新带给所有人

---

## English

The Seed is MeguLit's built-in set of game diffs: one small data file per game and one per exe build, telling MeguLit how to hide this game's text, where to place it and how to read its choices. It ships with GitHub main, lives in `MeguLit/The Seed/` of the installer and comes with hot updates

MeguLitHook is the kernel shared by every game; above it each engine has an engine diff and each game a game diff. Fixing one game means changing its own seed, never another game. The design: [docs/diff-layers.md](../docs/diff-layers.md)

## Layout

```
The Seed/<engine>/<gameId>/game.json                  game layer: every build of the game
The Seed/<engine>/<gameId>/versions/<exe SHA-256>.json  version layer: one exe
```

`gameId` is a stable slug of the original title in romaji or its English name (`senren-banka`); `game.json` carries the title (`ja` original, `zh` common Chinese name)

## Files

- **game.json**: `schema "megulit.seed"`, `version 1`, `layer "game"`, `id`, `engine`, `title {ja, zh}`, `prints` (game prints only: `pack`, `script`, `steam`, `vndb`, `title`), `match {exe, titles, notTitles}`, `rev`, `mode` (`hide` / `read`), `settings` (game-layer keys only), `note`
- **versions/&lt;sha&gt;.json**: `schema`, `version`, `layer "version"`, `key` (the exe's full SHA-256, also the file name), `prints` (`exe`, `head`, `pe`), `exe` (file name only), `rev`, `mode`, `settings` (any key: this exe's own values; native hook and exe-only switches go here only), `note`

Only keys registered in `core/profiles/defaults.cjs` with a value inside its domain (`core/profiles/domains.cjs`) are allowed. No code, no paths, no user names: `validation/the-seed.test.cjs` checks the whole folder. `rev` only goes up; a downloaded official diff with a higher `rev` replaces the built-in seed. Built-in seeds are official without a signature; diffs downloaded at run time to `data/The Seed/` must carry a valid signature

## Contributing

1. Upload a probe from MeguLit (shared adaptation), or attach logs to an issue
2. A maintainer runs `tools/diff-maker` offline for a draft and its replay fixture (`validation/fixtures/games/<gameId>/`)
3. The reviewed draft goes to `The Seed/<engine>/<gameId>/`; run `node --test validation/the-seed.test.cjs validation/games-regression.test.cjs`
4. Committed to main, it reaches everyone with the next release or hot update
