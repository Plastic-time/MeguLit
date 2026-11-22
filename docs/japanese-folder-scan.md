# Japanese script scanning

The detail-page and Tools restore dialogs share a built-in folder scanner. It reports the detected format, whether it found Japanese dialogue in the scripts it could read, and whether it can restore the files. The only writable adapter handles verified Utage compiled scenario books with Japanese and Chinese columns. Applying its result requires separate confirmation, creates backups, and supports undo

The read-only pass reuses the engine registry's names and file signatures, the Naninovel localization document reader, and the existing loose-script parsers for Ren'Py, KiriKiri, Artemis, TyranoScript, and RPG Maker MV/MZ. It skips runtime capture and archive readers that require external tools or unbounded unpacking. It caps enumeration at 4,096 entries, evidence at 128 files, diagnostic reads at 64 MiB, and UnityFS expansion at 128 MiB. The worker supports cancellation and has a 60-second outer timeout. The UI identifies partial results when a limit or parsing failure cuts the scan short

## Reuse decision

This review was completed after the initial implementation. Future adapters must compare existing implementations before implementation

| Candidate | License and fixed source | Decision |
| --- | --- | --- |
| AssetStudio v0.16.47 | [MIT source](https://github.com/Perfare/AssetStudio/tree/v0.16.47) | Cross-check SerializedFile object tables and offsets; no program or new source copied |
| UnityPy af1503d42776da0fcbd166e73497ed6064c3a060 | [MIT source](https://github.com/K0lb3/UnityPy/tree/af1503d42776da0fcbd166e73497ed6064c3a060) | Read/write reference and possible independent verifier; retain the existing Node reader without adding a Python runtime |
| AssetRipper 1.3.12 | [GPL-3.0 release](https://github.com/AssetRipper/AssetRipper/releases/tag/1.3.12) | Optional offline inspection candidate; not bundled or claimed tested against this game |
| Utage | [Official localization documentation](https://madnesslabo.net/utage/?page_id=4268) | Column semantics only; its Asset Store licensing does not make its paid source an open-source dependency |

The implementation reuses MeguLit's UnityFS/SerializedFile/Utage readers, atomic writes, and original-text → HookNative → Reader translation chain. No additional third-party source or binary is bundled by this change

## Transaction and UI contract

`services/embedded-japanese-jobs.cjs` owns bounded child workers and canonical-directory reservations. Start requests have a nonce registered before any asynchronous operation. A lost reply is recovered by querying that nonce. An unknown request must be atomically retired before the UI releases uncertain write ownership

The receipt table holds at most 4096 entries per service lifetime. Reaching capacity permanently seals new nonce registration for that lifetime. Existing receipts and workers remain usable. Recovery of an unknown nonce returns a stable, request-bound `retiredByCapacity` terminal receipt without allocating more entries; a late start or nonce-bearing legacy write remains blocked. No retired receipt is evicted to make room. The UI permits closing after that proof and asks for an application restart before another scan; it never restarts or resends a write automatically

Restore and undo cannot be cancelled while writing. They use original hashes, backups, atomic replacement and readback. An incomplete rollback keeps its recovery journal and blocks game launch until recovery. A new restore nonce using an already-applied token still returns the full `applied`, `cells`, `patch`, and `localIndex` result contract

Local translations retain source row, speaker and voice identity. Ambiguous Japanese with different translations is not guessed without sequence context. Missing translations use the existing fallback. Package hashing and decompression happen in bounded background jobs, not on every displayed line

## Verification scope

Regression coverage includes read-only scans, row identity, serialized offsets and UnityFS rebuilding, byte-identical undo, rollback, stale sources, canonical-directory aliases, launch/write exclusion, lost replies, cancellation, capacity sealing and local Reader translations without an online call

The installed Steam `manosaba_game` sample previously returned `EMBEDDED_UNSUPPORTED`. Its IL2CPP assembly list identifies Naninovel. The new scan checked 23 non-debug UnityFS localization bundles, read 398 script documents with dialogue, and counted 33,873 Japanese dialogue entries and 33,728 Chinese translations in the corresponding localization blocks. The SHA-256 hashes of all 23 bundles and the assembly list matched before and after scanning. The read-only result supplies no restore token. This sample reproduces the former generic result independently of the unidentified game in the screenshot

The synthetic Hoshizora-shaped Utage fixture exercises a base book and its compiled scenario patch. It produces a restore token only after the Japanese text, row identity, speaker and voice match, and restores the exact original hashes on undo

The headless integration harness uses the actual dialog functions, UI module, persistent bridge, child workers and synthetic resources. It does not execute a game. Successful resource reconstruction and a matching undo hash do not prove that a particular game chooses the restored language at runtime, preserves its voice playback, or renders a clickable Japanese overlay; those remain separate game acceptance checks
