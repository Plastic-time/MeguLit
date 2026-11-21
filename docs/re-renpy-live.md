# Ren'Py 8.4 isolated runtime checkpoint

This checkpoint repairs the existing injected Python reader and tests it with a selfwritten Japanese project on Ren'Py 8.4.0.25071206
It does not certify Flowers Blooming at the End of Summer, its script language, or arbitrary Ren'Py games

## Changed behavior

- The first complete control header accepts the existing ASCII/UTF-8 and UTF-16LE transports, rejects malformed or duplicate flags, and revokes permissions on missing or unreadable files
- Revocation restores only text still owned by MeguLit, including its original raw-text slice bounds, and retries failed restoration without overwriting newer engine text
- Replacement clears the old raw-text slice before Ren'Py parses ruby tags, then requests a later interaction redraw when restoring the original
- Speaker roles use the actual `say` screen's `who` widget identity
- Choice roles follow `store.menu`, including its pre-injection alias, and match actual screen actions to caption widgets
- No seed, allowlist, or profile default enables these roles or replacement

The wrappers preserve the original engine calls and keep the existing body/glyph route
Custom screens without these identities remain unclassified
The control file and writer queue are not a synchronous native drain or render acknowledgement

## Evidence layers

| Layer | Observed result | Limit |
|---|---|---|
| Actual script in an inert host | 22 checks pass; the same fixture against `40e72e7a` has 16 failures and 6 passes | Not an engine run |
| Captured native transport replay | 12 distinct Japanese lines, glyph rectangles, name/choice identities, direct hide and reset records parse with the existing production parser | A replay of an isolated project |
| Actual isolated engine | Software renderer shows ruby and Chinese replacement; raw text and slice bounds restore; direct hide event removes body pixels and reset restores them; two real choices continue the script | Direct native event testing, separate from Reader visibility policy |
| Actual MeguLit Reader | Fresh host built from `40e72e7a`, candidate Python script, independent data; 10 distinct body lines reach the real Reader and Chinese DOM; actual local lookup creates a Chinese word card | Programmatic DOM click, not a physical glyph hit |
| Native Reader placement | Bound HWND and PID match the real SDL window; the existing windows interface confirms the identity | `front=3`, meaning Foreign, leaves context/shown false in this hidden desktop; physical Reader overlay and point lookup remain unaccepted |

The software fixture uses a Chinese-capable font for the replacement test
This does not prove font availability or ruby spacing in another project
Google produced a wrong sense for one synthetic sentence, so translation delivery is proved but translation quality is not accepted
The actual Reader read-mode choice text reached the source as two lines; per-choice translated overlays were not accepted

The real game sample remains read-only
Only the open runtime and launcher were copied into a separate project, with new scripts, private saves and process-local `RENPY_DISABLE_SOUND=1`
No audio session mute state was changed

## Reproduce the bounded checks

```powershell
node --test --test-concurrency=2 validation/renpy-control.test.cjs validation/renpy-live-replay.test.cjs validation/engine-draw-renpy.test.cjs validation/renpy-page.test.cjs
```

This selection has 11 tests, no skips, including the 22-case production-script check
`validation/helpers/renpy-live-capture.cjs` records the runtime version, candidate and direct-event scope
Private screenshots, combined host input hashes and Reader logs are retained in the overnight evidence directory

## Remaining acceptance

1. Use a working normal desktop test environment and confirm the real bound client rectangle through the native placement event
2. Confirm native Reader visibility without changing foreground gates, then hit an actual Japanese glyph and inspect the Chinese word card on screen
3. Check at least ten lines, a page transition, both choices, name isolation and translation quality through the complete Reader path
4. Revoke permissions while embedded and confirm the original remains visible after the Reader stops, with no stale role or replacement data
5. Repeat on an actual user game and its custom screens, keeping language and script provenance explicit

No SDK/compiler identity, original-game script coverage, full-screen reader acknowledgement, health score or upload acceptance follows from this checkpoint
