# Japanese script scanning

The detail-page and Tools restore dialogs share a built-in folder scanner. Scanning is read-only. Applying a verified result requires a separate confirmation, makes backups, and can be undone. The current adapter supports verified Utage compiled scenario books with original Japanese and Chinese columns; other layouts return unsupported

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

The headless integration harness uses the actual dialog functions, UI module, persistent bridge, child workers and synthetic resources. It does not execute a game. Successful resource reconstruction and a matching undo hash do not prove that a particular game chooses the restored language at runtime, preserves its voice playback, or renders a clickable Japanese overlay; those remain separate game acceptance checks
