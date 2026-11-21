# Softpal host input and bounded write-back

This change hardens the existing Pal engine callback without adding a hook, flag, game seed or drawing rule
It is not an acceptance result for Leyline, hiding, translation or point lookup

## Confirmed route

The existing upstream-derived `InsertNewPal1Hook` scans the main executable for its argument-2 text routine
The installed 423936-byte PE32 LeyLine.exe, SHA256 `9a502090106c713c6a7ee1b9ca2cfb57eb3c6ef375c9d2006ae89dbe356ffb77`, has exactly one matching executable-section window at RVA `0x25390`
Its entry bytes are `558bec83ec78a14ce0440033c58945f8`
A branch-following walk from this entry contains 528 distinct instructions, no overlapping instruction boundaries and no unresolved branch
The routine advances its `[ebp+0xc]` byte pointer and reaches the delay-import call to PalFontDrawText at VA `0x42594c`, followed by caller cleanup `add esp,0x18`
The host routine itself has a plain `ret` at `0x425a0d`, and all twelve found direct caller sites have `add esp,0x28`: ten caller-cleaned stack arguments, argument 2 is the raw text pointer
The host routine and PAL export are different ABIs; the PAL export has six caller-cleaned arguments

The twelve direct-call byte candidates also lie on instruction boundaries reachable from nine nearby prologue-root CFGs
Those local roots do not establish reachability from the process entry point, narrative role or runtime execution
The legacy return-site heuristic still classifies only some callers; no new name/choice classification is claimed
No claim is made that every caller receives a whole sentence or that menus/history are excluded

The host hook is an existing route and does not need a new inline hook inside unloadable PAL.dll
This avoids introducing the new DLL observer's unresolved module-lifetime requirement
It does not resolve or retract that observer's `BLOCKED_MODULE_LIFETIME` status

The exact-file static receipts and scripts are in `H:/MeguLit-Work/night-1423/softpal-host-input`
Earlier PAL evidence remains in `softpal` and `softpal-lifetime-host` under the same private scratch root
This local path is evidence location, not a runtime dependency

## Existing write-back defects and correction

The old four-byte suffix check read before a short input, as a protected-page negative control demonstrates
The old callbacks shared `trimmedText` and `trimmedSize` between threads; interleaving two callbacks could target another input or derive a negative suffix length
The old `strcpy` could write beyond the only known capacity, the original NUL-terminated span

`PalTextBounds.h` now owns the bounded split and replacement rules
The Pal callback copies at most 32768 bytes plus one terminating-byte check into a per-thread fixed snapshot
Malformed, unreadable, empty or over-limit inputs are rejected without exposing a partial source to embedding
The snapshot includes the original pointer, byte sequence and color-wrapper span
After the embed wait, write-back consumes this snapshot once and requires the same pointer and unchanged original bytes
It preserves the color prefix and suffix, rejects embedded NUL, overlap and growth beyond the original body, and terminates within the original span
An unsafe or stale answer logs `ToMe_PAL_EMBED rejected reason=unsafe-or-stale-span` without source text
It does not log or acknowledge a successful hide

A single per-thread slot intentionally rejects a stale outer answer after a nested callback has replaced the pending snapshot
There is no unbounded callback stack or cross-thread shared pointer
The equality check is not an atomic ownership protocol against an unrelated game thread concurrently modifying the same buffer; such a protocol has not been established
Longer translated text remains unchanged in the game and requires a separate allocation/ownership design before native in-game replacement can be supported safely
No clipping, encoding change or truncated translation is introduced

Only the Pal engine implementation and its copied helper change; all other engine callbacks and default profiles remain as before
The existing unsafe callback code is removed rather than retained as fallback
The PalFontDrawText glyph-position hooks are unchanged and are not treated as full-input evidence

## Reproduction and regression scope

Set `MEGULIT_TEST_OUT` to an owned temporary directory, then run `native/megulithook/selftest/pal-text-bounds.cmd`
This compiles and runs a small x86 console with `/W4 /WX`, not a game or a full hook DLL
It checks short input at a protected-page boundary, original-span canaries, wrappers, growth/NUL/alias rejection, capacity and maximum sizes, stale identity, single consumption and 16000 concurrent replacements
The test also preserves the old suffix-read and strcpy negative controls
The normal native self-test runner includes this regression, and `build-x86.cmd` copies the new header into the engine directory
Directory-based native freshness tracking already includes it

A separate private replay compiles the exact old and candidate `before`/`after` source functions with inert context and transport stubs
It shows the old cross-thread interleaving and growth mutation and verifies both disappear while a normal wrapped replacement remains unchanged
That replay is not a MinHook ABI, FX, live game or visual validation
No trampoline or calling-convention implementation changes in this patch

## Required live checks

Use the same executable SHA and record the selected writable `Pal` stream separately from glyph/sprite streams
Verify body, narration, name and choice behavior, including at least ten hidden lines, a repeated character, a color wrapper and a page change
Confirm the Japanese reader line is actually visible and clickable, its translation is present, and old lines do not linger
Confirm a growth rejection preserves the game input and is not reported as a successful native translation or hide
Compare read/off modes, history/menu and a restored original line, and retain the actual hook/reader logs and screenshots
Until these checks pass, this is an engine memory-safety candidate and a static input-route result, not completed adaptation
