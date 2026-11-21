# Tyrano V5 / スイートドールズルーム hidden checks — 2026-11-22

This follows the bounded `4d97b64e` DOM candidate after root deployed the complete sample at 07:50 JST. It supersedes that report's historical "no sample" finding for this title only. It does not change any seed, native allowlist, installed application, or final user acceptance gate. The follow-up commit changes only the explicit Tyrano menu ownership guard, adds validation/evidence metadata, and documents the checks. It must be cherry-picked independently; do not reapply the old whole-file `stop()` implementation or replace root's newer awaited restoration/removeScript lifecycle.

## Sample and execution identity

- Deployment receipt: `H:/MeguLit-Work/night-1423/sample-deployment/tyrano-sweetdolls-jp-20261122-receipt.json`
- Original executable: `H:/MeguLit-Work/samples/tyrano-sweetdolls-jp-20261122/sweetdollsroom_f1.01/sweetdollsroom.exe`, x64, SHA256 `387ece151f2357cdac80063f29a6dd9a3f64ed633b30bfa021d941075c7659d2`
- Tyrano `version:500`; actual `resources/app/tyrano/plugins/kag/kag.js` SHA256 `9126a5115f6b7b1e5544c58b71de7a32698296b921be344c5e1a7079724e32e7`; package uses Electron, 960×640 content window. `main.js` constructs a window without fullscreen/kiosk. `configSave=file` writes beside the executable, so the original package was **never executed**
- Each run used an independently hashed full 420-file copy with no symlinks/junctions. All 420 original paths/hashes remained identical after both runs, including absence of new save files in the original deployment. Copies are retained for the owner
- Entry was the existing production `core/text-paths-launch.prepare({enabled:true})` owner-switch path, returning `path:web` and normal loopback CDP switches. No alternative injection, forced seed, new native permission, foreground shim, game-state jump or scenario alteration was used
- Extra launch arguments were only independent Chromium `--user-data-dir` and startup `--mute-audio`; no system mixer/MuteProc mutation was performed. This records the control/command line, not a separate acoustic measurement
- Atomic slot1 lock included owner PID/start ticks, exact game PID/start ticks/path. RAM stayed above 4 GiB and C/E/H each above 10 GiB. Both games exited, both owner processes released slot1; exact-path process inventory afterwards found 0 owned sample processes

Actual V5 sources confirmed `getMessageInnerLayer()` resolves current layer/page, `stat.is_adding_text` exists, and the game's `system/message_window.ks` creates `chara_name_area`. V5 does not need the newer `chara.getCharaNameArea()` helper because the real configured class is present. `kag.menu.displayLog()` owns a separate `kag.layer.getMenuLayer()` and leaves the original message DOM underneath it.

## Real hidden-desktop observations

Run 1, 07:58–08:02 JST: production page script reported `ok`. Default-off first-line screenshot shows original Japanese; the same line after opt-in has `hidden=1`, 37 source characters and 37 glyph rectangles, and the original Japanese disappears while the image menu remains. The source line enters real `WebTextPath → HookNative → HiddenGate → OverlayPlacement` messages. Ten further different complete Japanese lines were captured through normal hidden PostMessage clicks, including the speaker name. These ten are separate from partial typewriter updates. The capture has 194 parsed records, roles `line/name`, and at least ten exact page retirements. Turning hiding off restores original Japanese in the screenshot.

Run 1 also found a **negative case**: history is a visible 960×640 `layer_menu`, but the prior producer kept its underlying dialogue hidden record and did not retire its placement. This is an actual DOM/core-chain defect; no full Reader screen was launched, so no claim is made that a physical Reader overlay was observed over the history page.

Fix: when Tyrano's own connected, nonempty `getMenuLayer()` is visible, `pick()` yields no dialogue owner; normal cleanup restores the game DOM and sends an exact body clear. UI snapshots clear while the menu owns the page. A throwing menu getter refuses hiding. Closing the menu allows the actual current message/name to be acquired again. Other DOM engines without Tyrano ownership retain their existing route.

Run 2, 08:04–08:07 JST, with the final producer SHA256 `bbfb9687563dda50e8d175221ff548628f19f613fa3b743fbc3fbbe23f81dbe1`: four complete lines led to a named dialogue. Opening history produced `hidden=0, n=0` for that exact body and an empty name snapshot, and the production placement emitted `gone:true`. The separate real DOM proof records menu `display:block` and `bodyHidden:false`. Clicking the game's Back control returned menu `display:none`, a new current dialogue identity, `hidden=1`, and the name snapshot. Final hide/roles withdrawal restored Japanese; the script received page restoration ACK before process shutdown. Source hashes and slot release were checked again.

## Durable evidence and validation

`validation/fixtures/engine-draw/tyrano-sweetdolls-v5.json` commits executable/producer identities, ten line hashes/counts/viewport data, artifact hashes, the original negative case, and the menu-fix identities. It contains no game scripts, assets or dialogue corpus. `validation/engine-draw-tyrano-live.test.cjs` replays local actual records through the real prototype chain and verifies the captured menu/return proof. Missing local evidence explicitly skips the artifact tests; this machine executes them.

Evidence directories:

- `H:/MeguLit-Work/night-1423/tyrano-sweetdolls-hidden-20261122/`: `source-and-copy.json`, `source-after.json`, `launch.json`, `records.json`, `placements.json`, `menu-before-fix.json`, `logs/session.jsonl`, `logs/chars.jsonl`, `logs/advance.jsonl`, `shots/03-default-off-dialogue.png`, `shots/04-hidden-dialogue.png`, `shots/line-01-hidden.png` through `line-10-hidden.png`, `shots/05-restored-dialogue.png`
- `H:/MeguLit-Work/night-1423/tyrano-sweetdolls-hidden-20261122-menu/`: same lifecycle/raw record files, `menu-after-fix.json`, `menu-closed-fixed.json`, `shots/07-before-menu-fixed.png`, `shots/08-menu-fixed.png`, `shots/09-menu-closed-fixed.png`, `shots/10-final-restored.png`

Both producers were the task's isolated worktree, not a claim that root's whole integrated application build was run. Root retains its newer asynchronous CDP shutdown implementation. The new source guard must be combined with that lifecycle during serial integration.

Final checks: 82/82 related tests passed, zero failures/skips (17 DOM contracts, 3 capture/manifest tests, 6 RPG Maker, 56 shared text/style); the existing standalone DOM script also passed. All 1548 JS/CJS/MJS scripts passed `node --check`, list SHA256 `275aebbc9967d1db92ceb6182c91483eac246c08f992cd5196beb81cfbc98367`. Receipts: `H:/MeguLit-Work/tyrano-followup-tests.log`, `tyrano-followup-legacy-dom.log`, `tyrano-followup-syntax-receipt.json`. The fixture directory has the repository's blanket generated-fixture ignore; only the 5598-byte hash/metadata fixture is staged explicitly, never the local captures, game source/assets or ignored adaptation history.

## Coverage still for the owner

The publisher states this game has no choices/branches; no real choice coverage is claimed. Image-only buttons were used through their original events but are not reconstructed as text. This run did not supply synthetic Chinese/ruby as live translation evidence. Original ruby → Reader wire conversion remains outside this candidate. No CU, foreground action, full Reader/Foreign retry, physical point lookup, actual Chinese card, translated paragraph or final experience acceptance was performed. The actual core placement messages are evidence of that chain only.

Root should deploy its combined incremental build and record its SHA, then the owner should start the original complete sample normally, confirm names/original text, enable only this game's intended settings, advance the opening ten lines, open/close Log, stop reading and confirm original text returns. Check actual Japanese lookup, Chinese card/translation and alignment in Reader. Send the exact step/time and screenshot plus `engine-draw.log`, `hook-events.log`, `hook-diagnostics.log`, `reader-host.log` when present. A second game with glink choices is still needed for real option acceptance; keep the synthetic DOM choice tests as unit evidence only.
