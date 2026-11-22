# Probe → desensitized structure → adapter packs

MeguLit never uploads game content. When a game does not read well, it is probed **on the user's PC**, a
**desensitized structure** goes up only after the user confirmed exactly what it contains, and the fix comes back as a
signed **adapter pack** that needs no app release.

```
library ──probe (idle worker)──► results ──problems──► desensitize + key candidates ──manifest──► user confirms
                                                                                                  │
   app ◄── sync (feed, 6 h) ◄── relay /api/adapters ◄── maintainer signs + publishes ◄── issue ◄──┘ /api/probe (chunks)
    │
    └─ rebuild the script index with the pack → before/after numbers → /api/adapters/report
       worse? → pack off for that game (rollback), read again without it
       not perfect? → new pack version or a probe request, next sync, no user action
```

| Piece | File |
|---|---|
| Probe one folder (all readers, one result) | `services/adapter-probe-core.cjs` |
| Library run (worker at idle priority, budget, cancel, resume) | `services/adapter-probe.cjs`, `services/adapter-probe-worker.cjs` |
| Desensitizer, verifier, key candidates | `services/desensitize.cjs` |
| Samples, bundle, manifest, chunked upload, follow-up consent | `services/adapter-sample.cjs` |
| Pack format, signatures, store, declarative reader, rollback | `services/adapter-packs.cjs`, `services/adapter-pack-keys.json` |
| Feed sync, rebuild, report, auto rollback, probe requests | `services/adapter-feed.cjs` |
| Service actions (`adapter_*`) | `services/adapter-actions.cjs` |
| UI hook (适配总览 button, upload dialog) | `web/adapter-probe-ui.js` |
| Relay endpoints | `relay/src/adapters.js`, `relay/migrations/0016_adapters.sql` |
| Maintainer tool | `tools/adapter-pack.cjs` |
| Tests | `validation/adapter-*.test.cjs` |

## Probe result

`probeGame()` runs every engine of `services/original-engines/scenes.cjs` plus System4/BGI against the folder and
records, per game: the anonymous fingerprint key, an inventory (file counts, extensions, archive names with every non-ASCII
character masked, the first 8 raw bytes of each archive as hex (never masked: a header is not text), the recognised format), every
engine that recognised something (scenes, lines, Japanese lines, error code, time), the detected engine, line counts,
lines per scene, and the step that failed:

| step | meaning |
|---|---|
| `ok` | a reader read Japanese lines |
| `unknown-pack` | archives no reader opens and no engine fingerprint matches |
| `unsupported-engine` | no reader opens the archives, but `services/engine-fingerprint.cjs` names the engine (detail = engine id: `unity`, `leaf`, `age`, …) from GARbro-style magics, file names and folder markers; resource-only files (Unity `.resS`/`.resource`, FSB5) never count as script archives |
| `decrypt-failed` | an engine knows the format but not the key (unsupported code, cx capture, decrypt errors) |
| `parse-failed` | a reader opened scenes but found no lines, or loose scripts nobody reads |
| `low-pairing` | read fine, but the Chinese script pairs below 98 % |
| `not-japanese` | the script read is not Japanese |
| `no-script` / `timeout` | nothing script-like / the game ran over its budget |

## Desensitization

Every natural-language character (kana, kanji, hangul, full-width letters, Latin-extended, English prose) is replaced
in place by a placeholder of the same class and the same encoded length in the file's encoding (Shift-JIS, GBK, UTF-8,
UTF-16LE). Offsets, opcodes, lengths, index tables, tags and ASCII commands are untouched. Opaque blocks (entropy
> 7.2 bit/byte: encrypted or compressed) are never uploaded; their place and entropy are listed, and xor / index-xor /
sub / zlib parameters derived from them on the PC (known plaintext, column frequency) go up instead. `verify()` must
pass for every sample (no original text character left at its offset, no text run in the output), and the whole bundle
is checked once more (`clean()`): outside the game titles shown in the manifest, it may hold no kana or kanji but
placeholders. The upload is the exact stored bundle whose sha256 the user saw.

## Pack format 1

```json
{
 "schema": "megulit.adapter-pack", "format": 1, "id": "my-engine", "version": 3,
 "minApp": "1.4.9", "maxApp": "2.0.0",
 "requires": ["container:table", "transform:xor", "transform:zlib", "grammar:lines", "match:files"],
 "match": {"files": [{"path": "data/script.dat", "minSize": 16, "magic": {"offset": 0, "hex": "4d47504b"}}],
           "exe": {"name": "Game.exe", "size": 123456, "head": "<sha256 of the first MiB>"}},
 "source": {"container": "table", "archives": ["data/script.dat"], "entries": "*.scn",
            "table": {"count": {"at": 4, "type": "u32le"}, "entriesAt": 8, "nameEncoding": "shift_jis",
                      "fields": [{"name": "name", "type": "cstr", "size": 32}, {"name": "offset", "type": "u32le"}, {"name": "size", "type": "u32le"}],
                      "offsetBase": "file", "indexTransforms": []}},
 "transforms": [{"op": "xor", "key": "5a"}, {"op": "zlib"}],
 "grammar": {"mode": "lines", "encoding": "shift_jis", "skip": "^[@;*]", "anchor": "^[@*]", "strip": ["\\[[^\\]]*\\]"], "name": "^【[^】]+】$"},
 "pairing": {"by": "order", "dropNames": true, "minChars": 1},
 "params": [{"target": "cx-scheme", "value": {"mask": 0, "offset": 0, "prolog": [], "odd": [], "even": []}}],
 "signature": {"alg": "ed25519", "keyId": "k1", "value": "<base64>"}
}
```

* **containers**: `loose` (globs in the game folder), `table` (declared index: `u8 u16le u16be u32le u32be cstr pstr8 pstr16 skip`),
  `xp3`, `pfs` (MeguLit's own readers).
* **transforms** (in order, per entry; `indexTransforms` for the index): `xor` (hex key, repeating), `xor-index`
  (`base + i*step*mult`), `add`, `sub`, `not`, `rol`, `ror`, `zlib`, `deflate-raw`, `lzss` (4 KiB window, 0xFEE),
  `skip`, `take`.
* **grammar**: `lines` (decode, then per line `skip` / `anchor` / `strip` / `text` (group 1) / `name` / `join`) or
  `strings` (bytecode: `opcode` hex, then `u8|u16le|u32le` length or `zero` terminated).
* **params**: extra entries for readers MeguLit already has (`cx-scheme` → `cx-filter.cjs`, `paz-scheme` → `paz.cjs`,
  `malie-scheme` → `malie.cjs`: `{title, cipher: "camellia" | "cfi", key: hex, align, rotate: [4 words] for cfi}`,
  `qlie-key` → `qlie.cjs`: `{gameKey: hex of 256 bytes}` (QLIE 3.0 packs with key.fkey whose exe has no IconKeyImage),
  `entis-key` → `entis.cjs`: `{password, archive?}` (NOA BSHF password when the exe has no IDR_COTOMI),
  `marble-key` → `marble.cjs`: `{key}` (cp932 text) or `{hex}`,
  `warc-scheme` → `shiinario.cjs`: a ShiinaRio WARC 1.2–1.7 title, one entry of `shiinario-schemes.json`'s `schemes`:
  `{Name, OriginalTitle, Version, EntryNameSize, CryptKey, HelperKey: ["0x…" ×5], Region, DecodeBin, ShiinaImage:
  {Common, CommonLength, Tail (base64), Length, Sha256}, ExtraCrypt: {$type, Seed, Key, DecodeTable, …}, GameMap:
  ["GAME.exe", …]}`; byte arrays are hex or `"@name"` of the shipped `SharedData` (`@CryptKey1`, `@Region1`,
  `@DecodeBin1`…), `Common` names a shipped `CommonImages` part (`Image1`, `Image2`), so a title usually needs only its
  tail, seed and keys. `tools/garbro-schemes.ps1 -Engine warc` prints entries in this shape. A pack scheme is tried
  before the shipped ones, and replaces a shipped one of the same `Name`). Readers try every candidate and keep the one whose
  scripts decode to text, so one pack can carry keys for many titles.
* Regular expressions: at most 300 characters, no backreferences or lookbehind, no quantified group that holds a
  quantifier or `|`; lines are cut at 4096 characters. Reads are capped (20 000 files, 64 MiB a file, 512 MiB a game,
  64 MiB inflated).
* Fields starting with `x-` are free (notes, tooling). Any other unknown field makes a format-1 pack invalid.

### Compatibility rules (do not break these)

1. A pack names its **format** and the **capabilities** it `requires`. An app skips (never fails on) a pack with a newer
   format, a capability it lacks, or an app version outside `minApp`–`maxApp`. The feed carries the same fields, so an
   old app does not even download it.
2. A new app reads every older format: add `MIGRATIONS[n]` in `adapter-packs.cjs` that lifts format n to n+1, keep the
   frozen fixture `validation/helpers/adapter-packs/format1-table-xor-zlib.json` passing, add one for the new format.
3. Adding a capability (a new transform, container, grammar) keeps format 1; changing what an existing one means is a
   new format.
4. A published version never changes (the relay refuses a different body for the same id+version). Fix → new version.
5. The adapter-pack runtime is part of the reader fingerprint (`original-text.cjs` READER): a runtime change re-reads the
   games packs serve; the pack file is one of a game's sources, so a new version re-reads that game.

### Safety and rollback

* Signatures: Ed25519 over the canonical JSON (sorted keys, no `signature`). Keys: `services/adapter-pack-keys.json`
  (public only). Rotate by adding a key, shipping it, signing with it, then marking the old one `"revoked": true`.
* A pack never runs code; every engine method catches; a pack that errors three times is rolled back.
* Per game: a new version that reads fewer lines (> 2 %), pairs worse (> 0.5 point) or reads nothing is turned off for
  that game folder and the game is read again without it (`state: rolled-back`, reported).
* Everywhere: `tools/adapter-pack.cjs withdraw <id> <version>` → the feed lists it as withdrawn → every app blocks it and
  goes back to the newest older version it has. Users can do the same per pack (`adapter_pack_rollback`).

## Maintainer workflow

```bash
node tools/adapter-pack.cjs keygen                      # once; private key goes to %USERPROFILE%\.megulit-signing
node tools/adapter-pack.cjs check my-pack.json
node tools/adapter-pack.cjs try my-pack.json "E:\GAL\Some Game"   # read it locally first
node tools/adapter-pack.cjs sign my-pack.json           # → my-pack.signed.json
set MEGULIT_ADAPTER_ADMIN_TOKEN=...                     # the relay secret ADAPTER_ADMIN_TOKEN
node tools/adapter-pack.cjs publish my-pack.signed.json
node tools/adapter-pack.cjs reports my-engine           # before/after from the apps; perfect = paired == total
node tools/adapter-pack.cjs probe-request req-2 <key>   # ask that game for a fresh probe (only consenting users send one automatically)
```

A completed probe upload enters the Seed evidence queue in the existing relay dashboard. See the [relay guide](../relay/README.md#e562-adapter-packs-and-desensitized-probes) for legacy issue disposition and the Markdown backlog API.

## Runtime findings (E596–E599)

Some archives can only be opened by the game itself: the key is derived at run time, or the index is encrypted with a
cipher no static key opens. The offline probe stops there (its sample sees 64 KB of head; it cannot see a key that only
exists in the running process). With the user's opt-in, MeguLit reads the running game's memory once and keeps the
structure that solves it.

```
game bound by the hook (reader.cjs) ──4 min──► runtime-harvest.cjs (opt-in, needed?) ──fork, low priority──►
  runtime-harvest-worker.cjs ── native/RuntimeHarvest.exe --pid (read-only stream) ──► runtime-harvest-scan.cjs
  + runtime-dump buffers (known plaintext) + the game's archives          ──► publicize ─► gate ─► data/adapter-probe/runtime/<id>.json
probe bundle (adapter-sample.cjs) ── games[].runtime, one manifest row per finding ── user confirms ──► relay ──► issue
maintainer: tools/adapter-pack.cjs from-runtime → draft (index container + key transform + grammar guess) → sign → publish
app: feed sync → rebuild offline → verdict solved / read / partial / failed → report (+ outcome on the findings)
```

| Piece | File |
|---|---|
| Read-only reader (no injection; query + read + wait rights only; budget, seconds, cancel by closing the pipe) | `native/RuntimeHarvest.cs` |
| Detectors, locators, stream parser | `services/runtime-harvest-scan.cjs` |
| Opt-in, triggers, privacy gate, store, `adapter_runtime_*` actions | `services/runtime-harvest.cjs`, `services/runtime-harvest-worker.cjs` |
| Findings → pack draft | `services/runtime-pack-draft.cjs`, `tools/adapter-pack.cjs from-runtime` |
| Tests (synthetic running game, live stand-in process, privacy detector) | `validation/runtime-harvest.test.cjs` |

**What it recovers** (generic; no detector knows an engine):

* cipher tables linked into a module (Blowfish pi, AES, Camellia, TEA delta, CRC32, MD5, zlib) with module + RVA and a
  code pattern that references them;
* Blowfish key schedules (self-consistency of the last S-box pairs, a 64-bit check random data never passes) and the
  pass phrase when a string in the image reproduces it; Camellia-128 schedules (rotation relations of KL, KA kept as an
  alternate); TEA / XTEA keys against known plaintext or an oracle (entry heads that decrypt to structure); XOR / add /
  index-XOR parameters from known plaintext;
* archive index tables: fixed-stride records whose offset/size fields tile one of the game's archives back to back (or
  block-aligned); stride, field layout, unpacked size, count field, names (masked), what each entry is after the key;
* opcode dispatch tables (≥ 48 pointers into one module's code);
* decoded script layouts: opcode before the length byte, length prefix, terminator, a text-free sample;
* for every find: module + RVA, or the module slot that points at a heap object, plus a byte pattern of the code that
  references it with the address wildcarded (`8b0d????????…`), so an adapter can find it again by pattern.

**What it cannot recover:** keys used once and wiped, stream ciphers whose state is not a table (RC4 state can be found
only with known plaintext), AES key schedules (tables are detected, keys are not searched yet), unsorted index tables
(hash-ordered), indexes the game never decodes as a whole (looked up per file), and anything in a region the budget
did not reach.

**Privacy.** Text samples pass `desensitize.sample()` (verify gate); names pass `maskString()`; every byte field (keys
included) passes `naturalLanguage()` (three kana in a row, kanji runs, GB2312 runs, UTF-16 CJK runs with kana, English
prose) and the finding is dropped if it reads as language; the bundle is checked once more as a whole. The test runs an
independent detector (every 2-character piece of the stand-in game's lines, in every encoding, in every field and every
decoded base64 / hex value) over the findings and the bundle; it fails on any hit. Desensitizing memory also
fixed a gap in `desensitize.cjs`: a UTF-16 line inside Shift-JIS bytecode was left as is (its bytes were "taken" by
misread Shift-JIS characters); such runs now win and remainders are replaced again.

**Schema.** `games[].runtime` = `{schema:'megulit.runtime-findings', version:1, collector, stats, modules, constants,
keys, indexes, dispatch, scripts, dropped}`; the bundle lists `features:['runtime-1']` and stays version 1 (additive:
older readers skip it). Packs: new capabilities `container:index`, `transform:blowfish|tea|xtea|camellia`,
`transform:xor-file`; an app without them skips such a pack (CAPABILITY) instead of misreading it. Reports may carry
`verdict` (solved ≥ 98 % pairing / read / partial / failed) and `origin` (runtime / probe); the relay keeps them with
the after numbers.

### Compressed samples and the re-scope (2026-11-14)

Desensitized data is mostly repeated placeholders, so samples now go up gzip-compressed (`sample(…,{compress:true})`,
part `{at,len,encoding,gzip,packed}`, read with `partBytes()`; width is kept, every offset is a file offset). Measured on
synthetic data: a Shift-JIS / UTF-16 script or bytecode ≈ 1/150, an index table of numbers + masked names ≈ 1/6, an
archive whose encrypted blocks were zero-filled ≈ 1/90. Limits are now: whole archive up to 16 MB, else 8 MB head + 8 MB
tail; whole scripts up to 16 MB; 8 samples per game; ≤ 2 MB **compressed** per sample (quartered until it fits), ≤ 8 MB
bundle (the relay limit), ≤ 64 MB read / 80 s per game on the user's PC. The manifest shows `raw` and `packed` per
sample. Plaintext index tables that did not fit the old 64 KB head now go up whole — no memory reading needed for them.

Memory reading stays for what a file sample cannot carry: keys that only exist at run time (high-entropy data is never
sampled), and the layout of an index the game decrypts in memory (on disk it is high-entropy, so a file sample has only
zeros there). Memory finds use the same path: script buffers and the index region are taken as large windows and go
through `desensitize.sample()` + `verify()` + compression like a file.

Desensitizing whole tables surfaced one more rule: two half-width-kana bytes between binary bytes are a number
(`0x03A6B010` = `10 B0 A6 03`), not text; such runs now count as text only when 3+ long with ASCII / NUL / text on both
sides, so index numbers stay intact.

## 适配贡献（2026-11-15，知情同意的剧本与程序代码上传）

读不好的游戏，光靠脱敏结构有时写不出适配。玩家同意后，MeguLit 会把这类游戏的剧本条目和启动程序的代码段传给维护者，维护者写好适配包（签名 JSON，6 小时内生效）或 JS 热更新发回。三条底线写在代码里，不能拿掉：

1. **知情同意**（`services/adapter-contrib.cjs` consentState / setConsent）
   - 公开版：默认关。开屏更新卡片的更新内容最下面有说明，主按钮变「同意并下一步」，点了才开；旁边「不参与」记为拒绝。没有更新时也会弹一张只有这段说明的卡片。
   - 封测版（x.y.z-beta.n）：默认开，但要先在卡片里显示过一次说明（`adapterContribNoticeAt`）才生效。
   - 设置 → 游戏库「后台上传读不好的游戏的剧本和启动程序」随时关；关掉会立刻删掉本地待传的包。没动过的开关保存设置时不会替玩家做决定。
2. **只碰游戏**（collect）
   - 只处理游戏库里登记、且探针判为读不好（`problems()`）的游戏；只读该游戏文件夹（真实路径校验，不跟随链接）。文件夹是盘符根、用户目录、桌面/文档/下载等时整个拒绝。
   - 只取：封包里的脚本条目（XP3 走 `xp3.cjs rawEntries`，加密条目原样）、散落的脚本文件、汉化补丁里的脚本、exe 的 PE 头 + 代码段 + .rdata/.data、KiriKiri .tpm 插件代码、读不开的脚本封包的索引窗口（头尾各 2 MB）、顶层文件大小与 exe 哈希。
   - 从不取：图片、语音、视频、字体（扩展名 + 文件头双重检查）、存档/截图目录、.rsrc、readme、文件夹外的任何东西。
   - 用户目录路径、用户名、电脑名在清单和每个数据块里都会打码。
3. **用完即删**
   - 客户端：relay 收齐所有分块后立刻删本地包；超过 7 天的残留包也删。
   - relay（`relay/src/contrib.js`）：维护者 `done` 后删该游戏所有分块；30 天自动过期删除；48 小时没传完的分块清掉（每 30 分钟的 cron）。

包格式 `.mgct.gz`：gzip("MGCT" 0x01, u32 清单长度, 清单 JSON, 数据块)。上限压缩后 24 MB，按 4 MB 分块，断点续传（`GET /api/contrib/status` 列出已收分块）。同一游戏（probe-identity）只收一份。

估算大小（压缩后）：exe 代码段 1–4 MB；KiriKiri/BGI 等明文剧本 1–6 MB；加密剧本封包基本不压缩，5–20 MB，超出 24 MB 时按优先级（exe → 补丁剧本 → 剧本 → 索引窗口）截断。

上传走现有 relay 域名（api.megulit.com / cn-api.megulit.com，客户端已自动选快的那个），国内可达；发回的适配包照旧走 cn-dl 镜像。

部署：`npx wrangler d1 migrations apply megulit-relay --remote`（新增 0018_contrib.sql），R2 用现有 `megulit-diagnostics` 桶，前缀 `contrib/`。

维护者工作台（`tools/contrib-workbench.cjs`，工作目录默认 `H:\MeguLit-Work\contrib`，拒绝放 C:）：

令牌用 `MEGULIT_ADMIN_TOKEN` 或 `MEGULIT_ADAPTER_ADMIN_TOKEN`（和 `tools/adapter-pack.cjs` 同一个 relay 密钥，设过一次就不用再设）。`<id>` 可以是上传 id、它的前 6 位以上、游戏 identity，或标题的一部分。api.megulit.com 连不上时自动改走 cn-api.megulit.com。每个包的文件夹里有 `SUMMARY.md`，开适配会话时从它读起。

```
node tools/contrib-workbench.cjs                    总览：relay 上有什么、本地有什么、下一步做什么
node tools/contrib-workbench.cjs sync               把收齐但还没下载的包全部取回并解开
node tools/contrib-workbench.cjs get <id>           取一个包：下载+校验+解包+剧本转 UTF-8+写 SUMMARY.md
node tools/contrib-workbench.cjs info <id>          这个包里有什么（按角色、按编码；日文最多的剧本排在前面）
node tools/contrib-workbench.cjs text <id>          剧本转成 UTF-8 放到 text/（Shift-JIS、UTF-16、UTF-8；编译/加密的留在 files/）
node tools/contrib-workbench.cjs done <id>          适配完成：relay 删包，本地副本一起删（--keep 保留本地）
node tools/contrib-workbench.cjs clean <id>|--all   删本地副本（--all：relay 已不再保存的全部删掉）
```

### Full probe upload — closed beta (2026-11-15)

Alongside the desensitized probe, a problem game's **full** script text + exe now goes up so the maintainer can reproduce
it and write a pack / hot-update on their own PC. Default on, no dialog, no switch (closed beta: everyone consented). A
consent gate is still owed before any public release.

- Client: `services/probe-full.cjs` `collect()` (runs in the probe worker, `adapter-probe.cjs fullInWorker`) pulls out,
  for a game not read well: the script entries only — a reader's decoded scenes, raw script entries of XP3 / NPK2 / PFS
  archives (encrypted ones as stored; the exe holds the filter), loose script files, and the 1 MiB head + tail of an
  archive no reader could list. Never images, voices, movies or fonts (by extension **and** magic). The game exe, other
  exes (a Chinese-patch exe) and the DLLs beside them are cut to a slim PE: section offsets kept, a big `.rsrc` and the
  overlay zeroed, so a disassembler opens it at the same addresses. Plus each PE's version resource, and every file's
  size + sha256 (archives over 1 GiB: size + first/last 4 MiB, marked `partial`). Each item is gzipped on its own; items
  go in priority order (exe, scenes, entries, loose, other exes/DLLs) until `PACKED_MAX` (48 MiB). Target 3–20 MB/game.
  Output `data/adapter-probe/full/<sha256>.mlfp`; `probe-auto.cjs fullOne` uploads it once per game identity and deletes
  it locally once the relay has it. `sweep()` drops local leftovers after 7 days.
- Relay: `relay/src/probe-full.js`, `POST /api/probe/full/start|complete`, `PUT /api/probe/full/part` — chunked
  (5 MiB parts) into **R2 as a multipart upload**, resumable (`start` returns the parts already stored; a dropped
  connection re-sends only the missing ones). One file per game identity; a game the relay already holds (or the
  maintainer marked done within 14 days) is answered `duplicate` and nothing is sent. Storage cap 8 GiB (`FULL_STORAGE`
  past it). Cron `cleanupProbeFull` drops ready files after 30 days, stale uploads after 3, tombstones after 14.
  Migration `0018_probe_full.sql` (`probe_full`, `probe_full_parts`). Upload goes to the same relay host as the other
  probes (raced `api.megulit.com` / EdgeOne `cn-api.megulit.com`), reachable from the mainland.
- Maintainer workbench: `node tools/probe-workbench.cjs list | get <id> | unpack <file> | done <id> | delete <id>`
  (needs `MEGULIT_ADAPTER_ADMIN_TOKEN`). `get` downloads to `MEGULIT_PROBE_WORK` (default `H:\MeguLit-Work\probe-full`,
  off C:/E:) and unpacks: `scripts/<reader>/…`, `archives/<archive>/<entry>`, `loose/…`, `index/<archive>#head|#tail`,
  `bin/<exe|dll>` (slim PEs), `manifest.json`, `versions.json`. `done` deletes it on the relay and stops apps resending;
  `delete` removes it and lets the game be sent again.
