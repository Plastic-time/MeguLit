# TyranoScript DOM candidate — 2026-11-22

Follow-up after the complete V5 sample arrived: [SweetDolls hidden-desktop observations and menu ownership fix](sweetdolls-hidden-20261122.md). The original report below preserves its earlier scope/time boundary; the follow-up has actual sample identities, ten complete lines, a discovered/fixed menu defect, cleanup proof and the remaining owner acceptance items.

Scope: `core/text-paths-web.cjs` and its existing DOM/CDP validation, based on origin/main `7a41ff9a9c3632c9f143f01b455085c1d6e4a854`. No game-specific seed or allowlist is enabled. No game or MeguLit process has been launched. Static/unit evidence is not live acceptance.

## Source audit

Task and complete-document audit began 07:17:45 JST. Read the complete `docs/engine-draw-native.md`, `docs/engine-draw-matrix.md`, and the actual ignored `E:/Apps/MeguLit-Git/ENGINE-ADAPTATION-NOTES.md` (609 lines, 62501 .NET characters), not an empty replacement. Ordered upstream review ran from 07:21 JST until after 07:36:33 JST; product implementation began only afterward, meeting the actual 15-minute source-audit interval.

| Order | Repository / fixed revision / file | License and decision |
|---|---|---|
| 1 | [HIllya51/LunaTranslator](https://github.com/HIllya51/LunaTranslator/blob/a744a80fc2b99ea5852d4da2bd157afdc9e628f0/src/NativeImpl/LunaHook/LunaHook/resource/lunajspatch.js), `a744a80fc2b99ea5852d4da2bd157afdc9e628f0`, lines 164–221 | GPL-3.0; concept reference only, no new GPL implementation copied. Confirms separate text/chara_ptext/glink ownership and original-function return preservation. Reuse MeguLit's existing CDP page path instead of adding another hook or translation bridge |
| 2 | [Dangetsu/vnr](https://github.com/Dangetsu/vnr/blob/d2b9bad6af9577f639ce47171d506c9fbf401984/License.txt), `d2b9bad6af9577f639ce47171d506c9fbf401984` | GPL-3.0; no relevant result for Tyrano/glink in repository search. Earlier Frameworks tree restriction remains respected. No copied code and no claim of exhaustive unavailable-tree review |
| 3 | [bbepis/XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator/tree/08324a58dcb26b76fc08e0fb2121098164579e73), `08324a58dcb26b76fc08e0fb2121098164579e73`, `LICENSE`, `src/XUnity.AutoTranslator.Plugin.Core/TextTranslationInfo.cs` | MIT; Unity component translator, no Tyrano DOM owner found. Not applicable; no transplanted Unity hook |
| 4 | [Artikash/Textractor](https://github.com/Artikash/Textractor/tree/df5b830d1757a66aa162f8081e99d42c9bd50488), `df5b830d1757a66aa162f8081e99d42c9bd50488`, `LICENSE`, local texthook/extensions/include search | GPL-3.0; no Tyrano/glink owner identified. String extraction is not DOM layout proof; no copied implementation |
| 5 | [crskycode/GARbro](https://github.com/crskycode/GARbro/tree/009c09de1ba67754d9aa8a580a7b2e21a1831cd6), `009c09de1ba67754d9aa8a580a7b2e21a1831cd6`, `LICENSE`, `ArcFormats`; [satan53x/SExtractor](https://github.com/satan53x/SExtractor/tree/8d8d976fd04ae54e7c677705af937273d04a376a), `src/extract_RPGMV.py` | GARbro MIT; SExtractor GPL-3.0. Archive/script extraction is not runtime DOM ownership, and RPGMV JSON parser is not Tyrano; no copied code |
| 6 | Existing Luna `lunajspatch.js` RPG Maker route and MeguLit `core/text-paths-rpgm.cjs` / `validation/engine-draw-rpgm.test.cjs` | RPG Maker engine contracts differ; preserve its existing producer, only exercise shared CDP transport. KAG native TextRender is a separate route and is not modified |
| 7 | [ShikemokuMK/tyranoscript](https://github.com/ShikemokuMK/tyranoscript/commit/4868f30bca2d9bfdfd8239d9d1471e0ce7381730), `4868f30bca2d9bfdfd8239d9d1471e0ce7381730`; files listed below | **Custom TyranoScript terms, not MIT for the engine**: `LICENCE.txt` prohibits redistribution of TyranoScript itself and certain mobile-conversion commercialization; third-party credits contain separate MIT notices. Read interfaces/DOM structure only; no engine source/assets redistributed, and tests use independently authored structural stand-ins |

Pinned primary contract evidence:

- `tyrano/plugins/kag/kag.js`: `getMessageInnerLayer` lines 1996–2005 resolves current layer/page; `getMessageCurrentSpan` 2012–2020; `chara.getCharaNameArea` 3094–3099 resolves the configured name element; `stat.is_adding_text` line 282
- `tyrano/plugins/kag/kag.tag.js`: `showMessage` 1085–1200 prebuilds nested char spans; `buildMessageHTML` 1364–1440 creates ruby and initially transparent chars; `buildTextShadowChar` / `buildTextStrokeChar` 1482–1561 duplicate text into `.stroke.entity`, `.fill.entity`, and `.dummy`; `makeOneCharVisible` / `addOneChar` / `finishAddingChars` 1927–2061 drive visibility and completion; `glink.start` 7205/7249 can change `.glink_button` to `.button_graphic`; 7303–7307 records event tag `glink`
- `tyrano/plugins/kag/kag.tag_ext.js`: `chara_ptext.start` 2020–2055 writes the configured name element rather than supplying body text
- `tyrano/plugins/kag/kag.event.js`: `addEventElement` lines 12–21 sets `data-event-tag`, including glink/link/button ownership
- `LICENCE.txt` lines 1–15: engine-specific terms; no whole-engine MIT inference from bundled-library credits

The browser rejected the upstream fixed-revision kag directory URL as restricted. Do not retry that directory through another tool. Known primary files already fetched remain the evidence; the rejection is separately recorded for root.

## Baseline findings proved without a game

An independent headless DOM diagnostic at `H:/MeguLit-Work/tyrano-source-audit.cjs` demonstrated the pre-change producer reports an opacity-zero char and decoration copies, leaves `.megulit-ruby` / `.megulit-zh` after embed=false, and sends no empty body record when the game clears its message element. Existing `engine-draw-dom.test.cjs` passes but did not cover these conditions.

Existing RPG Maker baseline: 5/6 passes, one failure because the expected default-profile object predates `kemcoSprites:false`; this is an assertion drift, not a Tyrano rendering regression.

## Samples / live boundary

Bounded file inventory of `E:/GAL`, `E:/Steam/steamapps/common`, `H:/samples`, and `H:/MeguLit-Work/samples`, plus the installed library's Tyrano engine entries, found no usable local Tyrano runtime/sample. No download, installation, seed edit, game launch, Reader launch, foreground input, or HidDesk run was performed. Root owns the incremental package and user testing list. A missing sample is explicit, not a passed live check.

## Final implementation and verification

The existing producer now uses current-message ownership, visible canonical glyphs, ancestor visibility, and a shared text-budget guard. A disappearing/replaced page sends an exact empty record for the prior line. UI emits glyph rectangles and clears its snapshots on withdrawal; no game clicks are intercepted. `draw.roles` and `draw.embed` remain false for Tyrano by default, with no seed change.

Embedding checks the active read switch, current owner, engine typewriter flag and actual glyph visibility. Native ruby wins over supplied dictionary ruby. Only MeguLit-owned nodes are unwrapped/removed when the mode changes, reading stops, the owner/page changes, or the CDP session stops. Original game nodes and click handlers are retained. Late old-page replacements do not write into a new page. Chinese remains in the message element at the existing 80% / overflow 70% / omit policy.

Removed/degraded behavior: no more counting stroke/dummy copies as body text; no typewriter completion inferred only from a 300ms DOM pause when Tyrano provides its state; no fallback to a different visible message when the actual current-layer getter fails; no whole-layer hiding/embedding for mixed link/name content; no lingering addon nodes or UI snapshots after withdrawal. Generic DOM fallback remains for engines without Tyrano runtime ownership, and is separately checked for node/event preservation. RPG Maker rendering is unchanged; two stale expected profile objects now include its already-existing `kemcoSprites:false` default.

Not implemented or claimed: image-button OCR/text reconstruction; original-game ruby wire conversion into Reader ruby data; arbitrary canvas engines; full commercial Tyrano compatibility; actual hidden rendering, point lookup, translation, clean pages or final experience acceptance. The compatibility selector `.tyrano_button_text` remains but is not proof of an upstream image-button contract. Existing scenario-reader comment claiming engine MIT was identified but not changed in that separately owned file.

Final validation: **77/77** related Node tests (15 Tyrano DOM, 6 RPG Maker, 56 shared text/style), **0 skipped / 0 failed**, plus the existing standalone `engine-draw-dom.test.cjs` passed. The Tyrano file explicitly skips when Playwright is absent; this run had it and executed all 15 cases. The real producer-to-placement empty-line regression passed. Protocol-budget and split-surrogate failures preserve original game text instead of claiming hidden proof.

Syntax: **1547/1547** tracked JS/CJS/MJS plus the new test were checked (`H:/MeguLit-Work/tyrano-syntax-receipt.json`, list SHA256 `d642398641429568d8219f4260b2c877a3514185a1a93479362a0b813458585d`); subsequent final boundary edits were checked again with `node --check` on the two edited scripts. `git diff --check` passed. Logs: `H:/MeguLit-Work/tyrano-related-tests.log`, `H:/MeguLit-Work/tyrano-legacy-dom.log`. No native binary changed, so no native/full application build is required for this incremental JS candidate. Default-off is asserted by the Tyrano profile/DOM test; the entire native opt-in suite was not rerun because its separate restricted CS2 route remains stopped, without deleting or weakening that suite.

Handoff is a limited local branch commit only, with exact SHA in the external candidate receipt; no push, PR, main mutation or installed-app deployment. Root integrates serially and owns the combined incremental test package. The actual ignored adaptation history received an append-only experience entry; no short history replacement was force-added.

## User testing list (root to include in the combined incremental package)

Prerequisite: a complete, lawfully usable Tyrano NW.js/Electron game, executable/runtime/scenarios kept together; record exact executable SHA, engine version, and current MeguLit test-package SHA. No sample was installed or removed in this task. Root supplies the combined package/config; do not paste guessed game coordinates or enable unrelated seeds.

1. Start normally through MeguLit with this game's default draw switches off. Confirm original dialogue/name/options and game clicks are unchanged. Record a baseline of at least ten lines, including repeated words and ruby if present
2. In the isolated per-game test configuration, enable `draw.roles` with normal reading active. Confirm names and glink options are distinct, wrapped option rows track their actual glyphs under window resize/DPI changes, invisible/closed choices disappear, and clicks still select the game's original options. Image-only buttons are an explicit unsupported item
3. Exercise normal game-text hiding without DOM embedding. Advance through slow typewriter text, repeated characters, identical consecutive lines, a page clear, menu/history, and message-window hide/show. Expect no future transparent characters, decoration duplicates, old-page ghost line or lost original UI; stop reading and expect original game text immediately restored
4. Enable `draw.embed` for that game only. Wait for the typewriter to finish; native ruby must stay intact and take precedence over dictionary spans, Chinese must appear below Japanese only when it fits. Advance before a translation arrives, then wait: no previous-page Chinese/ruby may appear on the new page. Disable embedded Chinese and then embedding/reading: only MeguLit additions disappear, native ruby/name/choices continue to work
5. Check actual Japanese point lookup, Chinese card, translation and screen alignment in Reader. These are user acceptance items, not proved by the DOM tests. Save the first failing scene/step and screenshot rather than counting an empty or hidden-desktop frame as success
6. On failure provide executable/version/hash and combined package hash, the timestamp and exact step, `logs/engine-draw.log`, `logs/hook-events.log`, `logs/hook-diagnostics.log` and `logs/reader-host.log` when present, plus the screenshot or one-click diagnostics package. Root owns reproduction/deployment coordination
