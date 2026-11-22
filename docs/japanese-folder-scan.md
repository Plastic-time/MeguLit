# Japanese script scanning

The detail-page and Tools restore dialogs share a built-in folder scanner. It reports the detected format, whether it found Japanese dialogue in the scripts it could read, and whether it can restore the files. The only writable adapter handles verified Utage compiled scenario books with Japanese and Chinese columns. Applying its result requires separate confirmation, creates backups, and supports undo

The read-only pass reuses the engine registry's names and file signatures, the Naninovel localization document reader, the Siglus DBS table reader, and the existing loose-script parsers for Ren'Py, KiriKiri, Artemis, TyranoScript, and RPG Maker MV/MZ. It skips runtime capture and archive readers that require external tools or unbounded unpacking. It caps enumeration at 4,096 entries, evidence at 128 files, diagnostic reads at 64 MiB, and total expansion at 128 MiB. The worker supports cancellation and has a 60-second outer timeout. The UI identifies partial results when a limit or parsing failure cuts the scan short

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

## CLANNAD local translation source

The old local-source record showed 107,178 indexed entries, 176 translation candidates, and 94 of 100 sampled matches. Its only selected table was `.megulit-japanese/dat/text22.dbs`, which holds interface text. The sample measured the pairing of those settings entries

The installed `SceneZH.pck` contains 228 compiled scenes and 212 `seen*.ss` source scripts. Its language constants select Japanese column 0 or Simplified Chinese column 2. The scene code resolves a message by serial number in column 500 and looks up the string in the selected language column. `GameexeZH.dat` names the external `textNN` databases. The direct `siglus-pck` dialogue reader returned 60 inline lines and no Chinese dialogue candidates for this package. The `siglus` adapter correctly takes precedence when there is a readable `dat` layout

Each of the 106,885 numbered story-table slots with both language columns in the installed `dat` had identical values in columns 0 and 2. The included Japanese patch copy had the same comparison result. The 92,886 comparable slots in the MeguLit backup were also identical. The speaker column is separate. The checked local copies contained no confirmed Simplified Chinese story text to pair

The folder scan now reports 96,208 Japanese entries across 20 readable story tables and zero local Chinese story translations. The zero-latency dialog reports 107,062 source slots, including 106,769 story slots and 293 settings slots. It verifies 174 Traditional Chinese settings pairs, excluding two formatting-only differences. The dialog shows the selected table and reports zero usable story pairs. The before-and-after SHA-256 hashes matched for the 73 inspected files, including the two root language files, configuration, backup manifest, and tables in the install and both local copies

### Installed script verification, 2026-11-22

Windows Prefetch for the 18:44 CLANNAD run lists the release's `SiglusEngine_Steam.exe`, `ds.ini`, `SceneZH.pck`, `GameexeZH.dat`, and all 23 numbered `dat/textNN.dbs` files. The opening line uses serial 20. The cassette choices use 2410 and 2420. Each of those rows contains identical Japanese in columns 0 and 2 of the installed table, the Japanese patch, and the pre-restore backup. All 15 backup entries match the journal's original and installed digests. The separate Japanese patch ZIP contains 27 DBS files identical to the extracted patch

Rebuilding the index in an isolated profile identified 101,489 dialogue slots and 654 choice slots from script instructions. Both groups had zero verified Chinese translations. All 174 local pairs came from the backup interface table `text22.dbs`. When other copies contain complementary translations, the Siglus reader now combines rows verified by the serial and Japanese cell, retaining the earlier source for an already translated slot. A regression test covers partially overlapping tables, a mismatched serial's Japanese text, independent choice lookup and the contributing source list

### Naninovel shadow launch

Steam's process log and the game's Unity Player log confirm the 17:03 Manosaba session launched the shadow executable. Its `manosaba_Data` junction resolves to the Steam installation. Direct script detection on that shadow previously returned no engine. The verified junction now resolves the same 23 localization bundles and the same script fingerprint as the Steam folder. The latest autosave records `Act01_Chapter01/Act01_Chapter01_Adv01`. Rebuilding from the shadow alone yielded 33,753 paired rows out of 34,368 indexed entries, and the Reader returned the translation in the bundle for `0101Adv01_Narrative001` from that scenario with source `patch` and the machine fallback disabled

All 99 inspected files across the two games retained their SHA-256 hashes after these checks. The evidence establishes the earlier launch paths and the offline provider result. On-screen rendering in a session running the updated reader remains unverified
