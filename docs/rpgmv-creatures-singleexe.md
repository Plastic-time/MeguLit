# Creatures MV single-executable runtime path — 2026-11-22

Task began 08:28:47 JST, with a 90-minute deadline at 09:58:47. The actual 15-minute source audit completed after 08:43:47; product implementation and real launches began afterward. New isolated branch/worktree: `codex/rpgmv-creatures-singleexe`, `H:/MeguLit-Work/wt/rpgmv-creatures`. Started from fetched origin/main `25b466ffb46318b192d91cf8dc88e160329ab9df`, then fast-forwarded to root's clean integrated `5cbcb64d1b74a001816d3abe04a77b1b76e9bff6` to retain the awaited CDP restore/removeScript/timeout lifecycle and real `owner-tests` API. No main/CI/PR work.

## Source audit and boundary

The complete official Windows deployment is one x86 `Creatures.exe`, 234004480 bytes, SHA256 `33a22315571262b88e13f896492b33b5f21ad37ef6f0d69507698415443b75e9`. Root's deployment receipt records ZIP/file CRC and SHA256 verification and RPG Maker MV 1.1.0 markers. The original executable has not been run or modified by this task.

Read-only PE/header inspection finds normal mapped `.text/.rdata` and separate `.enigma1/.enigma2` sections. In `.rdata`, actual compiler paths include `win32_nw12/node-webkit/.../nw/src/shell_main.cc`, `nw.exe.pdb`, and the Chromium `remote-debugging-port` switch. There is no adjacent ICU/NW/runtime folder. Enigma section names alone are not sufficient to infer DRM or a specific container mode. No unpacker, unpacked executable, protection bypass, dump, modified game script, repackaging or DLL substitution is used.

Primary sources reviewed:

- [NW.js package/distribution documentation](https://docs.nwjs.io/For%20Users/Package%20and%20Distribute/), pinned `nwjs/nw.js` revision `47a32c0e6639fb0b19ec07b8a603dcadfdfea167`, `docs/For Users/Package and Distribute.md` blob `8612e6a420e63bcf754019cb6d91ec374ec0dbbb`: loose files and appended ZIP packaging are supported, with native runtime resources ordinarily distributed alongside. MIT license, pinned `LICENSE` blob `d4eeb0918b403ac4212959de2d84420cd25c3fd7`. Documentation concepts only; no third-party implementation copied
- [NW.js official remote debugging](https://docs.nwjs.io/For%20Users/Debugging%20with%20DevTools/), same fixed revision, `docs/For Users/Debugging with DevTools.md` blob `bc6dd6739e3217c4895a833e8e4aadd975de135c`: standard `--remote-debugging-port` is the intended runtime entry. SDK/current-version qualifications are not evidence that every legacy binary supports all modern protocol methods. Actual runtime capability checks are still required
- Official old tag `nw-v0.12.3` resolves to `591068bf6df8e37350b539745d0d289dc54c433f`; its `LICENSE` was read. Guessed source paths returned 404. The subsequent tag-directory web request was restricted and not retried through a different listing tool. No claimed full old-source/protocol audit
- [Enigma Virtual Box vendor overview](https://www.enigmaprotector.com/en/aboutvb.html): files can be virtualized in memory without extraction to disk. Hence do not assume or force a self-extract-to-TEMP mode. Vendor documentation reference only; no unpacker downloaded/executed and no protector handling added
- [nwutils/nwjs-packager](https://github.com/nwutils/nwjs-packager/commit/6fe6d18f7a21f81540d2b893603c5e0ac974eb3b), pinned README and MIT LICENSE: established package/installer distribution tools exist, but they are not evidence that changing/rebuilding this publisher's single executable is necessary or authorized. No packaging tool was run
- [Official Creatures Windows package](https://rpgmakerofficial.com/product/mv/special/creatures_win.html) and [official game collection](https://rpgmakerofficial.com/product/mv/game/index.html): Windows, Mac and an official browser play entry are published. No alternate open-directory Windows download was found in this bounded review. No other game/package was downloaded, and the browser/Mac edition is not substituted as proof that this Windows executable works
- Existing MeguLit `services/original-engines/evb.cjs` is a read-only virtual-file reader (existing GPL, reference only). Calling its metadata `list()` on this sample returns null because the first `EVB\0` occurrence is inside mapped data rather than the later packaging section. That is not proof of no virtual file system; no payload reader/decompressor was called
- Existing LunaTranslator pin `a744a80fc2b99ea5852d4da2bd157afdc9e628f0`, `src/NativeImpl/LunaHook/LunaHook/engines/v8/v8.cpp`, checks the main module as well as node.dll/nw.dll, so neighboring DLLs are not a universal requirement. GPL concept reference only, no new copying or native-hook route

Existing launch/CDP/RPG Maker/owner API baseline: 53/53 related tests passed, zero skips/failures (`H:/MeguLit-Work/rpgmv-creatures-baseline-tests.log`).

## Explicit activation gap

The integrated `core/owner-tests.cjs` is authoritative: inspect/resolve verifies the isolated root, exact executable/resource hashes, then a real token is bound to PID/birth and applied. Current `entryShape` requires a nonempty resource `files` array, while `inspectInner` rejects a resource that is the executable itself. The official package has only the executable. A dummy file or copied EXE resource fingerprint is not a legitimate substitute. Root/CPU owner must provide supported single-container authorization or an explicit API update; this task does not forge `official`/`verified` seed status or weaken that module.

Independent full unchanged copy: `H:/MeguLit-Work/night-1423/rpgmv-creatures-singleexe/private-game/Creatures.exe`. Its hash matches the original; both are retained. The isolated root has sharing disabled, no credentials/production DB and no owner manifest. `grant-request.json` is explicitly a request, not a grant. No message/Bitmap hooks or claimed Reader source acceptance.

## Implementation / verification

### Product changes

- `core/nw-runtime.cjs` recognizes an integrated legacy NW runtime by four independent Chromium/NW compiler/runtime strings inside a bounded PE `.rdata` read (64 KiB header, 16 MiB section budget). It rejects malformed/truncated offsets, non-x86/x64 PE images, arbitrary overlay strings, and Enigma/name-only guesses. It does not extract files or grant drawing. Existing adjacent runtime detection remains first
- `core/cdp-report.cjs` uses the modern binding normally; only a missing-method response selects an ES5 page queue with a 200 ms host drain. The queue and payload sizes are bounded; overflow clears it and requests original rendering. Access denial and other protocol errors remain errors
- `core/text-paths-web.cjs` falls back to runtime evaluation/reinstallation on document creation when legacy preload methods are absent. A page becomes attached only after both APIs acknowledge installation. Failed attachments close their transport; live transports remain owned until stop. Root's awaited restoration, preload removal, idempotent stop and timeout remain intact. Legacy `wasThrown` now also rejects script installation/restoration
- `core/text-paths-rpgm.cjs` splits Unicode locally without `Array.from`; page global built-ins are untouched. No profile, seed, allowlist, owner-test API or game logic changes

### Actual default-off runtime evidence

Normal `text-paths-launch.prepare` on the unchanged private executable returned `web`, using only standard remote-debugging switches plus the test harness's mute/user-data options. Runtime metadata identifies NW **0.12.3**, Node **1.2.0**, V8 **3.32.7**, Chrome **41.0.2272.76**, CDP **1.1**, RPG Maker **MV 1.1.0**. Actual probes report `-32601` for `Runtime.addBinding` and `Page.addScriptToEvaluateOnNewDocument`; `Array.from` is absent

With the compatibility implementation, the normal `prepared.connect()` reported `attached:true`, one game page, `ok` and `canvas`. The extension background target was excluded. Using the existing owned CDP transport, actual state at 08:55:27 and 08:55:44 was `Scene_Title`, both API globals present, `__megulitRpgm.state().patched === false`, `roles:false`, `embed:false`, and `Array.from` still undefined. This is actual prepare → CDP script installation evidence, **not message capture or Reader evidence**

Sessions used atomic slot1 ownership, exact PID/path/start ticks, and checked RAM plus C/E/H before each launch. Final game PID45500 (start ticks639309021220909686), helperPID68740, port13285. At 08:55:44 stop received a restoration acknowledgement, the exact owned game exited, original SHA256 remained unchanged, and slot1 was released at 08:55:45. No owned game/slot remains

Baseline PrintWindow output was white even though the engine reported `Scene_Title`; it does not prove rendered title/game visibility. A second simultaneous CDP probe connection failed; the successful later state observation reused the product's owned connection instead. No desktop/foreground or failed D3D/Foreign retry was used

Artifacts under `H:/MeguLit-Work/night-1423/rpgmv-creatures-singleexe/`: `copy-receipt.json`, `launch.json`, `cdp-metadata.json`, `runtime-probe.json`, `default-off-injected-state.json`, `logs/session.jsonl`, and `shots/01-default-off-title.png`. `launch.json` records the dirty producer SHA256 at execution; the final legacy stop-error check was added afterward and independently replay-tested

### Automated checks

- 123/123 related tests, zero failures/skips: `H:/MeguLit-Work/rpgmv-creatures-final-tests.log` (legacy/modern CDP, reload, denial, bounded overflow, strict install/stop errors, NW recognition, RPG Maker, Tyrano, DOM, default-off, library mode and owner API)
- All 1697 tracked/unignored JavaScript/CJS/MJS files passed `node --check`: `H:/MeguLit-Work/rpgmv-creatures-syntax.json`; later modified test files also parsed and executed in the final related run
- `git diff --check` clean; no native change, full build, installer, Etest or formal install update

### Remaining normal chain and owner acceptance

The single-container grant gap must be resolved by the CPU/owner API maintainer before activation: a supported explicit single-container manifest mode should pin the actual whole EXE and retain isolation/hash/token/PID/birth/revocation checks. Do not add a dummy resource, copied-EXE resource, fake official seed or raw `roles:true` workaround

After that grant exists, bind and apply it through the normal API, connect the actual HookNative/Reader pipeline, then capture at least ten complete Japanese messages through normal input. Check message/name/choice separation where the sample actually exposes them, typewriter, repeated text, page/menu clear, original hide/restore, and revocation/stop. Native ruby, actual Japanese point lookup, Chinese card/translation and final foreground alignment remain unverified. Supply exact EXE/build hashes, timestamps, screenshots, `engine-draw.log`, `hook-events.log`, `hook-diagnostics.log`, `reader-host.log` and this task's CDP/session logs for failures

Root should integrate this fixed local branch serially and retain its newer lifecycle code if additional changes arrived. This candidate does not declare the full task complete or request publication
