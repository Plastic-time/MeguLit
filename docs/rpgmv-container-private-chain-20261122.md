# RPG Maker MV packed identity and actual private Reader chain

Follow-up began **2026-11-22 09:09:52 JST**, with root's deadline at 10:00. Proposed files/schema were written before implementation to `H:/MeguLit-Work/night-1423/engine-progress/rpgmv-container-contract.md`. This continues candidate `3d0f8ec614e2c5c1574850ff93cc91d9e015134d` on its own branch/worktree, based on root's `5cbcb64d`. Root already has newer integration work; apply the follow-up diff serially, retaining newer owner/launch/lifecycle changes

The prior single-EXE grant blocker is now resolved for one explicitly supported container type. This is a local private-test permission, never an official seed or public allowlist entry. No E drive files, original saves, main branch, CI, installer or formal/test deployment were written by this follow-up

## Narrow identity contract

An entry may add exactly:

```json
"container": {
  "type": "nwjs-evb-rpgmaker-v1",
  "structureSHA256": "7d6b6c59058dff6c0fc2eb0d34248eb293f4c9f6e87e69082ca0c58f48b0b052",
  "entries": 759
}
```

Only engine **rpgmaker**, that exact type, and `files:[]` use this contract. Unknown types, other engines and mixed container/ordinary-resource entries fail. Ordinary entries still require at least one actual resource and still reject the executable or same inode as a resource. Full executable SHA256 remains mandatory and is verified before container inspection. The fields are independent of CPU's proposed `launch:'private-steam'`; this patch does not implement or change that field

The production inspector reuses the existing GPL EVB reader through a new **metadata-only** `listInline` API; old `list/read/aplib` behavior is retained for existing callers/formats. It validates NW compiler/runtime evidence inside the PE, then one EVB header within a bounded `.enigma1` prefix, inline node metadata, UTF-16 names, traversal/duplicates, counts/depth, exact reads, forward payload ranges and unchanged file identity. Limits: 64 KiB PE/header-prefix reads, 8192-byte nodes, 512-character names, 32 levels, 16384 nodes, 8 MiB cumulative metadata reads, and 2 GiB member sizes. It skips member payloads without decoding or writing them

Real required member paths are `package.json`, `www/js/rpg_core.js`, `www/js/rpg_windows.js`, `www/js/rpg_managers.js`, `www/js/main.js`, and `www/data/System.json`. The independent structure SHA covers metadata plus actual member paths/offsets/original/stored lengths; full EXE SHA covers all payload bytes. This is not a ZIP parser and makes no ZIP CRC verification claim or invented checksum claim. ZIP and other EVB layouts fail this type

The original canonical executable path, private root/configuration gates, opaque token, real child PID/birth binding, canary/stepdown checks and stamp/manifest/payload-change revocation remain authoritative. A prepared grant does not activate the default profile. Non-private/default mode, mismatched isolated environments/roots and the correctly isolated private environment are covered by existing/new negative tests; production sharing/relay routes stay disabled

## Actual normal chain

Original and independent full copy: x86 **234004480 bytes**, SHA256 **33a22315571262b88e13f896492b33b5f21ad37ef6f0d69507698415443b75e9**. Original was not executed. Private copy: `H:/MeguLit-Work/night-1423/rpgmv-creatures-singleexe/private-game/Creatures.exe`; isolated state: the sibling `isolated` directory, including new local DB/config/cache/logs/TEMP. No production DB/credentials, junctions or hard links were introduced

Final corrected run, **09:33:03–09:35:51 JST**:

1. Real `services/library.reconcile` imported/updated the canonical copy in the isolated catalog, game ID `game-67b32964-676b-4428-b6d4-60873919fa53`
2. Full EXE/container validation prepared an opaque grant with `active:false`; the ordinary layered profile still had `draw.roles=false`, `draw.embed=false`
3. Real `services/bridge.launch` business flow selected the normal web preparation and debugger arguments. The OS-facing start used HidDesk, producing actual child **PID30568**, birth ticks **639309043858557605**, exact canonical private-copy path, port **10365**
4. Normal `Reader.applyGameProfile` reused the grant; `HookNative.setOwnerTestGrant` bound that actual child identity and applied only this private roles permission. CDP installed the APIs and the real engine reported `patched:true`, `roles:true`, `embed:false`
5. Normal Enter input through CDP advanced gameplay after the title/scroll intro. No game-state jump, script edit or synthetic dialogue was used
6. **12 completed regular message pages** passed through actual CDP → WebTextPath → HookNative → **Reader.event**. Three speakers were extracted: 酒場の娘, センターの戦士, 酒場の主人. There were **11 page clears plus the terminal clear**, **zero Reader interface errors**. The final paused source remained live for about **32 seconds**, then emptied after awaited CDP restoration
7. Hook shutdown acknowledged; the exact child exited; original/copy hashes still matched; slot1 was released at **09:35:51**. Final path-specific inventory found **zero** remaining game processes and no owned slot

Runtime: NW **0.12.3**, Chromium **41.0.2272.76**, CDP **1.1**, RPG Maker **MV 1.1.0**, Pixi **v2.2.9**. Actual state showed frame updates, focus/visibility and an 816×624 canvas. The earlier white PrintWindow image is not visual acceptance

The harness adapts only OS boundaries: HidDesk start/window enumeration, native UI/audio output logging, and a no-op external game-event service. Launch business logic, container hashing, normal profile/grant binding, CDP, HookNative source handling, Reader event/UI tracking and local catalog are real. The HookNative OS polling timer is disabled because the headless interface harness has no native host. **Full MeguLit frontend/native overlay, point lookup, Chinese card and translation were not run**

The private catalog import supplies its verified `engine:'rpgmaker'` metadata. The global folder scanner was not changed to infer this engine from a monolithic executable; this is not a claim that an arbitrary bare folder import now auto-detects every packed MV game

## Actual bug fixed

The first live message was correctly captured, then falsely cleared while the real message window remained open. Actual scene inspection and the shipped Pixi source show that **Pixi 2 DisplayObjectContainer.renderable=false does not suppress its children**. Scene_Map, WindowLayer and Window_Message all use that state. The previous traversal therefore pruned live dialogue and every menu

The engine now permits that flag only for actual **MV + Pixi 2 DisplayObjectContainer instances**. Hidden/transparent ancestors still retire records; modern runtimes retain their previous renderable behavior. A regression fixture covers legacy scene/layer/windows and real visibility changes. The corrected real run proves four title-menu entries, normal menu retirement and persistent dialogue. The scroll intro remains system/UI box text, not a demonstrated per-character dialogue source; no choice screen was reached

`rpgm-source.cjs` deduplicates geometry updates, preserves repeated text on later pages, and ties clears to the current document owner/line/source sequence. Only a current private roles grant, matching PID/birth, active HookNative intent and current RPG Maker roles profile can deliver source. Stopped/revoked/foreign-owner callbacks cannot activate it or clear a later external source. A final current-profile rejection guard was added after the real capture; its positive/negative paths are replay-tested

## Evidence, validation and integration

Actual capture: `validation/fixtures/rpgmaker/creatures-nw012-owner-20261122.json` contains **30 raw protocol records, 12 expected sources, three speakers, 12 Reader clears, final paused state and zero errors**. Its replay uses production WebTextPath → normal launch attachment → HookNative → Reader.event; it does not fabricate live or visual acceptance

Durable evidence under `H:/MeguLit-Work/night-1423/rpgmv-creatures-singleexe/`: `container-launch.json`, `container-state.json`, `container-errors.json`, `logs/container-session.jsonl`, `logs/hook-interface.jsonl`, `logs/reader-interface.jsonl`, and `isolated/logs/{game-launch,engine-draw,hook-events}.log`. Session logs retain the earlier read-only probe errors and pre-fix false clears; use the final run timestamps/fixture above for corrected evidence. `container-launch.json` records dirty source execution from parent candidate; final source is pinned by the follow-up commit/receipt, not by a fabricated binary-build claim

Related checks: **133/133**, zero failures/skips, `H:/MeguLit-Work/rpgmv-container-final-tests.log`. All **1700** JS/CJS/MJS files passed syntax checking (`H:/MeguLit-Work/rpgmv-container-syntax.log`); subsequently changed source/test files were loaded by the final replay and related run. No native rebuild is needed for this JavaScript-only diff

Root serial merge points: add the optional container key/validation/verification/status to the **latest** `owner-tests.cjs`, preserving CPU launch fields and newer lifecycle code. Insert the web/RPGM source branch at the beginning of the existing launch `onSource` callback, retaining newer Unity/RGSS ownership logic. In web stop, preserve awaited restoration/removal/timeout and the post-ACK terminal source retirement. Do not replace these files wholesale with this older branch base

Remaining owner checklist: integrate the fixed source into root's current isolated package; import the private manifest, launch normally, verify names/body/menu/clear plus repeated text; then actual foreground alignment, Japanese point lookup, Chinese card/translation, choices when encountered, and original restoration after stop/revocation. Keep embed off until separately tested. Supply EXE/build hashes, timestamps/screenshots and engine-draw/hook-events/hook-diagnostics/reader-host logs for failures. Full engine/visual acceptance remains pending

Experience for root's central adaptation notes: legacy Pixi container flags describe the container's own renderability; do not prune its descendants without verifying that runtime's renderer. A whole-file hash plus bounded, independently derived resource structure can identify a single container without a fake extra resource. Preserve private identity and active-profile checks through the source callback, not only at prelaunch
