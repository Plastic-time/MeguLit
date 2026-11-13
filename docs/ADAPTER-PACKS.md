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
character masked, the first 8 bytes of each archive as hex with bytes ≥ 0x80 masked, the recognised format), every
engine that recognised something (scenes, lines, Japanese lines, error code, time), the detected engine, line counts,
lines per scene, and the step that failed:

| step | meaning |
|---|---|
| `ok` | a reader read Japanese lines |
| `unknown-pack` | archives no reader opens |
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
* **params**: extra entries for readers MeguLit already has (`cx-scheme` → `cx-filter.cjs`, `paz-scheme` → `paz.cjs`).
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

A probe upload opens a GitHub issue labelled `adapter-probe` with the summary and a 30-day download link of the bundle.
