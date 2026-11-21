# BGI diagnostic validation candidate, 2026-11-22

This candidate restores the BGI-specific permission work from `8c774853e923d7b354d42236c8235eee444ec52a` onto `ba00434c9961035ef625ebccd773de508c7122c6`, without inheriting its FVP ancestors or enabling any seed

## Scope and status

The engine layer remains a diagnostic observer, disabled by default
It emits `ToMe_DRAWRUN`, with UTF-8 text truncated to 120 bytes per diagnostic row
It does not emit `ToMe_CHARS`, hide original text, establish screen-space boxes, classify script roles automatically, or acknowledge a rendered translation
`end` means a temporary glyph chain was freed after drawing into a sprite bitmap; it does not prove that sprite was removed from the screen

`ReadControl` now decodes the actual UTF-16LE control file, requires one exact `roles=1` token in its first complete ASCII cfg line, and refreshes permission continuously after installation
Revocation, unreadable files and map changes clear pending rows and old role metadata
Original link/free execution continues, including observation exceptions
Already submitted logger output cannot be recalled, so polling/revocation is not a synchronous shutdown ACK

The change removes the previous byte-stripping cfg parser and one-time watcher authorization
The existing text hooks and signature matcher remain because this diagnostic observer does not replace their extraction or embedding behavior
No legacy sprite hook is installed by this candidate

## Rechecked local identities

All reads were static, without launching a game or executing its entry point

| Sample | SHA-256 | Result |
|---|---|---|
| 素晴らしき日々 HD / BGI.exe | `f52f44c9a30cf061c286b6a16f4560802e307309c9610e08169f29ce9da94bf1` | One link at VA `0x43d40d`, advance `0x43d550`, free `0x43d590` |
| Same installation / BGI_patch.exe | `f9f03e1ff648c5ea23facc0aa41a2c704e1978d534b9768c5ad879ae1da0d1e6` | Same link/free bytes; `.enigma1/.enigma2` sections and unbacked static import-name RVA; not a proven active module |
| Same installation / BGI-CHS.exe | `6eda794baf07d25092b640f8221ac93da810c144abd9f5d06832868187f97488` | Same static result; these are not three independent BGI layout versions |
| 穢翼のユースティア / BGI.exe | `17a4dc70dcc6dfa2b11c8cb48a5f846aac3c7e58cced04e8a1303115a4343add` | No link/free signature in on-disk executable sections; runtime image not inspected |
| Same installation / BGI.OLD | `624572870920d5b5d9e3792ffb3288da691e536bc4f6366fe71a7da7891a9f4f` | Same absence; previous unpacking failure is not retried |

Known layout ABI: node `EBX`, code `[ESP+0x30]`, previous node `[ESP+0xa0]`, color `[EBP+0x2c]`
Node `+0x10/+0x14` are sprite-canvas coordinates; the imported TextOut/GetGlyphOutline routines populate glyph caches and cannot establish per-page coverage

The legacy `fix/bgi-sprite-text` scanner was compiled separately from pinned commit `7169097a6828c2c7c77d9093b8fc607638caf346`
Its five synthetic checks plus three real-file checks pass on the original BGI.exe, including RVA `0x39f0` string in EAX and `0x3eb0` string in arg3
The scan also returns `0x3af80`/arg2, so a scanner match alone cannot assign dialogue/name/choice roles
It maps the executable as an image resource and does not run the executable
The old branch's unconditionally installed sprite stream and bridge integration are not imported

## Minimal real ten-sentence preparation

Only 226,996 archive bytes were read, from existing `data01000.arc` and `data01101.arc`
The first archive contains system text and is excluded from the sentence set
The opening quotation in scene `1-1_0710_dream` is kept separate from subsequent narration

`data01101.arc` SHA-256: `4eff96b9c25855baeeb244a5e3273e8d60b7def8c9ce2a55fbb7ccf411c0ea13`
Decoded scene: 16,694 bytes, SHA-256 `53ed19e77aec20bb1d312a2ef10b7afd17324ceb7a89489ef0fecacf7d63bd7a`
The first ten complete-punctuation Japanese candidates use reader operand indices `63,64,71,73,90,94,95,96,99,100`
These are offline operands in reader order; actual execution order and role identity still need observation
This bounded preparation is not an assertion that every operand is a live page or that the entire Japanese track is valid

Live prerequisites, coordinated by the root session:

1. Assign a hidden-desktop slot and an isolated runtime with a freshly built/hash-recorded Hook DLL, MeguLit, translation source and click lookup enabled
2. Confirm the actual executable path, in-memory module and original Japanese display; do not infer them from the presence of BGI.exe beside Chinese launchers
3. Start with default-off, then an explicit temporary opt-in for this exact build; never alter the user's original files or saves
4. Record the opening sprite quotation separately; match the ten narration candidates to actual page screenshots, full source and lookup DOM, translation ACK, and the absence of residual original/previous-page text
5. Collect at least one named utterance, a real choice, a menu and return to dialogue; derive `viaRoles` only from these observed examples, not from string length or guessed native callers
6. Exercise repeated glyphs, two rows, a completed page, clear/hide, off/on and menu return; collect client/DLL/control/log hashes with screenshots and DOM records

No game was started during the first static candidate
The later root-authorized hidden attempt is recorded below
There is a product gap before full five-gate acceptance can pass: diagnostic rows alone cannot supply precise screen boxes, real sprite clear events, or the full hidden-Japanese/lookup/translation path

## Root-authorized bounded hidden attempt, 04:07–04:16 JST

Slot2 was acquired with CreateNew and released after the owned process exited
No download or extraction was performed
A private x86 Hook tree built successfully through 278 Ninja steps, using parallelism 2; its BGI header SHA-256 exactly matches this branch's header

- Candidate `MeguLitHook32.dll`: 2,211,328 bytes, SHA-256 `6b68096d8a8c8485de07e543e9de6df47cc40645d9a598107da7d146486622a3`
- Compiled BGI header SHA-256: `059f4673fd451757d68c6660a2a53f28bd017d5e46504e5422ee4c37c57d54a7`
- Private physical allocation, including build tree, rig and game copies: 204,771,345 bytes, below the 512 MiB limit
- Private BGI.exe/gdb/hvl were copied; 56 existing arc/font resources were linked, without copying the game or changing original archive attributes
- The original small-file pre/post hash census is unchanged, including BGI.exe/gdb/hvl
- `draw.roles=false`, `draw.embed=false`, no new allowlist or permanent seed changes

The existing MuteProc executable was compared with a private optimize-disabled build of its source
All reflected types, fields, method/constructor flags, attributes, IL bytes and local signatures match exactly
This establishes a much narrower binary/source correspondence than a filename or neighboring source file; it does not establish real audio recovery

HidDesk launched a private fail-closed borderless launcher on the hidden desktop
The launcher loads the existing borderless DLL before resuming the game; its private change terminates the owned suspended child if that load fails
The actual private BGI process was bound by PID, executable path and UTC creation ticks
It displayed **“Direct3D initialization failed. Do you want to try again?”**, captured in `live/shots/launch-error.png`
No intro, dialogue, name or choice was reached, and no foreground fallback or repeat Direct3D startup was attempted

The independent audio guard also failed before ready, reporting `session pid`
Its final event is `released`, `captureOnly=true`, `muterStopped=true`, `muteConfirmed=false`, `restored=false`, `safe=false`
No muter was started and no audio mute write was performed; this is not an audio restoration pass
The owned BGI process was then stopped and exit confirmed; no Guard or MuteProc remains, and slot2 no longer exists
The HookBridge and newly built MeguLitHook32 DLL were not attached to this game, so the run supplies no actual I/G or H/D/U evidence

The orchestration runner also exposed a closed-stdin/EPIPE error; its attempt and guard evidence remain intact rather than being replaced with a successful-looking log
Any future runner needs a persistent command channel, stdin error handling and process/guard startup failure supervision before another authorized game run

### Concrete production gaps for root integration

1. `HookBridge.EngineInfo` forwards DRAWRUN only for MAGES; BGI currently remains a diagnostic log string, with no BGI draw event consumed by hook-native
2. `core/text-paths.cjs` does not admit `bgi` in its engine set; registering it before real full-text, box and lifecycle support would only turn an unsupported diagnostic into a misleading rendering claim
3. Add a BGI-owned conversion layer only after native records provide full untruncated text, glyph bounds, sprite identity, sprite screen origin and actual visibility/destruction/page clear; temporary chain free cannot supply those events
4. Establish real via-role mappings for dialogue/name/choice/menu from the exact running build before version-level data is enabled
5. Only after that evidence should root wire BGI records to the shared reader and demonstrate hidden Japanese, dictionary DOM lookup, translation ACK and old-page removal with the ten real candidates

The audio helper's `HR` currently treats every nonzero GetProcessId return as an error
Microsoft documents a nonzero multi-process-session status for that API, but the actual failing HRESULT was not logged here, so it remains only a possible cause
Root's audio owner should add HRESULT diagnostics and validate the session contract; this BGI candidate does not modify the shared helper or relax its refusal behavior

## Validation and root integration

- `selftest/run-bgi-permission.cmd`: production control 42/42; actual E8 MinHook link/free gate 46/46; signature x86 and x64 host each 9/9
- The gate adds ten synthetic two-row pages with repeated characters, one flush per row/page, no duplicated end on extra free, exact original call counts and preserved ABI, plus pending-state invalidation when role metadata changes
- These synthetic pages are not ten real game sentences
- Six relevant suites (BGI signature/opt-in, label embed, old scripts, dialogue and old hide): 38/38, no skips; signature/opt-in are the 18-test subset
- Run with TMP/TEMP pointing to a task directory on H and MEGULIT_VS set to the local VS2022 developer batch file
- Root may wire `cmd /c "%~dp0run-bgi-permission.cmd" || exit /b 1` into `native/megulithook/selftest/run.cmd`; this candidate deliberately leaves that shared registration unchanged
- Rebuild the final Hook DLL after root integration and rerun relevant checks; ordinary CI has `ci:false` for this native entry and is not evidence of a final DLL build

No seed, allowlist, CI, production install, original game/save or other engine was changed
Five-gate status: real role separation incomplete; relevant replay passed; default-off/explicit opt-in passed; real ten-sentence hidden lookup/translation/clear incomplete; latest-main integration/push belongs to root
