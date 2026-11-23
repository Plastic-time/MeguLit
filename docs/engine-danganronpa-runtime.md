# DR1 PC source candidate

This is an ordinary LunaHook UTF-16 source stream, named `DanganronpaPcText`, with no embedding flags. It adds no DRAWRUN/CHARS geometry, role classification or replacement path. The exact PC LIN `0x02` handler's complete source reaches the existing HookBridge output handler, HookNative and Reader. It is not a PSP hook or the unrelated Chunsoft company hook

Default `draw.spikechunsoftInput` is false, version scoped. Every public Seed remains unchanged/off. The native engine is registered in the x86 engine collection, but installs no text hook unless the control file explicitly says `spikechunsoftInput=1`, the executable is exact, and the three Japanese resource files have their exact hashes. No detached watcher is added; a connected session must start with its private grant already prepared. Root's glue flushes the control file before bridge startup. After withdrawal, restart the game to obtain a new private grant

## Exact private entry

Engine: `spikechunsoft`; capability: `diagnostic-input`; draw: `{spikechunsoftInput:true}`

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| DR1_us.exe | 3459728 | 9debd9f6aed2339e540aa9526ea3f16f38ad91c19ad9a842a5b0b2fab21303e3 |
| dr1_data_jp.wad | 1283334650 | 338d0c440b9f576070d4fbd33390c837475a18062ea0ac536684c851126d3b03 |
| dr1_data_keyboard_jp.wad | 90245979 | db3d0394e821a885e6a73bc71d156674503b5017e7021286bf071b0cf6942c99 |
| drlanguage.txt | 8 | be4ee906d3efecfc34a94a6cd378633a67f7f35d5abbc3f498715ac5dcbee54f |

Measured source helper RVA `0x50c00`, permitted return RVA `0x48d3d`, opcode dispatcher `0x4e169`, opcode handler table `0x2953a8`. The callback checks current opcode `0x7002`, consumed big-endian text ID, and equality between argument zero and the script state's indexed text pointer. Only measured CLT colour tags and a leading BOM are removed; line breaks remain. Bad pointers, oversized strings, invalid UTF-16 and unexpected CLT grammar are dropped whole. Source text and game arguments are never rewritten. In-memory verification handles relocation of the dispatch table operand

## Root integration

No shared HookNative, Reader, bridge or owner API file is overwritten by this branch

`tools/engine-sigs/danganronpa-root-glue.cjs` exports pure transforms `hookSource(currentHookNativeText)` and `ownerSource(currentOwnerApiText)`. Root should apply them to its own current files, inspect the diff, then run the replay. Anchors must be unique; repeated application fails. The incremental changes are:

- Add `spikechunsoftInput` to owner API's accepted draw key set; its existing engine-specific Input/diagnostic capability checks remain in force
- Handle the reserved ordinary hook source with `danganronpa-pc-source.receive` before normal `sourcePage`; unrelated Luna streams retain their current path
- Gate source, deferred delivery and final emission on the opaque grant, exact bound process/birth, profile, and source receipt. Origin strings alone grant nothing
- Flush the explicit input control before starting HookBridge, and retain that transport when only this input flag is enabled
- On owner revocation, clear only the source belonging to this engine. Preserve a later unrelated Luna source

Root's real owner API and HookNative were tested through these in-memory transforms, with no shared source writes. The actual source hashes are in `root-owner-replay.json`. Stop/retry/nativeRuby/Artemis/Unity logic is preserved by the incremental transform. Root remains the only deployment owner and must rebuild its unified DLL after merging

## Automated evidence

Evidence directory: `H:/MeguLit-Work/night-1423/dangan-runtime`

- Exact installed DR1 binary: unique dispatcher and helper signatures; DR2/V3 are negative controls
- Private x86 DLL compiled in this task's own native tree; root must compile the final merged DLL
- Native callback selftest uses LunaHook's actual hook_context/HookParam/TextBuffer types and a relocated, non-executing copy of the actual EXE image. It tests opt-in/off, wrong caller/opcode/pointer, bounds, UTF-16 and withdrawal
- Actual JP WAD entry `Dr1/data/us/script/e00_001_000.lin`, 11916 bytes, SHA `d1a05e2c35b67d3882ef328f33260f883a5e7c96c53c1dbe3e530526fc52c79e`: four verified text references at file offsets 113, 129, 197 and 211 drive the production callback. This is a static-resource replay, not a game runtime tape
- The four callback outputs pass through the real compiled HookBridge OnOutput handler to standard hookSource JSON, then root's actual opaque API and transformed HookNative into the actual Reader service/immersion model. History, revoked input and missing authority are refused; withdrawal clears the private source
- Actual deployed test Reader webpage in headless Edge: four complete Japanese DOM sources, standard translation requests, explicit substitute translation visible, clear event removes the source, no page exceptions. Source checkout bootstrap failed because generated local-font.js is absent; the deployed resource closure was used explicitly. No dummy script replaces it

No game has been started for these proofs. No final gameplay, translation quality, clickable dictionary card or in-game geometry/hiding acceptance is claimed

## Coverage and owner checklist

| Capability | This candidate |
| --- | --- |
| DR1 exact PC complete source | Implemented; runtime game delivery awaits owner |
| Speaker name | Missing; speaker byte is not promoted to a name |
| Choice/menu roles | Missing; LIN text input alone does not classify them |
| Native coordinates/ruby | Missing |
| Hide/embed/writeback | Missing; original rendering is retained |
| DR2 | Not enabled; its second text branch is still unclassified |
| V3 | Excluded; separate x64/WRD family and encrypted code |

After root integrates/deploys and enables only the exact private entry: launch DR1 Japanese, start a new game and advance at least ten lines. Confirm `DanganronpaPcText` appears and Japanese follows in Reader; test translation and word lookup, then open/close a game menu and return. Report stale text, skipped lines, mixed choices/names, layout and lookup issues individually. Toggle off to confirm no further private text arrives. Send hook-diagnostics.log and hook-events.log plus the DLL/EXE receipt if it fails. Do not mark the game ready before root's actual DLL and private metadata are in place

## Source audit, in order

No external GPL implementation is copied into the new adapter. Existing MeguLit runtime APIs are reused, and the PC addresses/fields are measured from the local executable

1. LunaTranslator/LunaHook: preserved build tree revision `f72381db9d8b63e9192221b01cbad1cb90c4048a`, and current upstream revision `7772ec7bb186bd3773bb534dcbc8655a4a364150`, GPL-3.0. `src/NativeImpl/LunaHook/LunaHook/engine64/Chunsoft.cpp` targets かまいたちの夜×3; `emulators/ppsspp_1.cpp` contains Danganronpa PSP hooks. Neither supplies this PC path. Current tree/file receipt: `luna-current-source-audit.json`
2. Dangetsu/vnr revision `d2b9bad6af9577f639ce47171d506c9fbf401984`, GPL-3.0, `Frameworks/Sakura/cpp/plugins/vnrhook/src/engine/engine.cc` and `match.cc`: no Danganronpa/DR1_us/DR2_us match in the inspected engine implementation/registration files
3. Artikash/Textractor revision `df5b830d1757a66aa162f8081e99d42c9bd50488`, GPL-3.0, `texthook/engine/engine.cc` and `match32.cc`: no same-game PC match in those inspected files

Earlier MeguLit candidate `c4e1e72e` supplies measured executable excerpts and the input-chain evidence. Its unregistered diagnostic logger and adapted GPL LIN parser are not imported. Existing MeguLit `spike-wad.cjs` is reused unchanged for read-only resource extraction. New production code is the exact PC source adapter and its private receipt gate; no old runtime logic is removed or demoted
