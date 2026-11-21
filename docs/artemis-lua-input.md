# Artemis Lua input candidate

The Buffer-only observer is now joined by an optional production PF8 shadow loader and bounded file transport
That path requires the separate local `owner-tests` authority module and root's isolated-app wiring; without that module/token it stays off
It does not complete Artemis glyph coordinates, Reader placement, hiding or translation rendering
No game seed or engine default enables it

## Explicit constructor

`core/artemis-observer.cjs` exports `prepare({enabled, exe, modules})`
`exe` must be a Buffer no larger than 16 MiB
`modules` supplies the caller's effective `system/msg/message.lua`, `system/msg/ui.lua` and `system/adv/select.lua` as Buffers no larger than 64 KiB each
Only literal boolean `enabled: true` prepares anything
An unknown EXE, modified module, missing module or accessor-valued module returns unsupported
Disabled preparation does not read the EXE or module fields

Three exact input sets are declared in `variants`
They are the local Amakano 3 trial, The Shell Part I original Lua, and its separately pinned existing MeguLit Japanese-text patch
For the latter, the actual source differs only at message.lua 225/436/532 and select.lua 509/709: `get_language(true)` becomes `"ja"`, with the existing comment marker
These do not identify all releases of either title
The formal Amakano 3 EXE is deliberately not accepted with trial Lua
The caller must resolve real archive override order before supplying effective module buffers
This constructor proves supplied bytes, not that a running game loaded those bytes

Successful preparation returns a Lua 5.1 chunk and provenance hashes
It writes no patch, game file, cache or control file
Evaluating that chunk returns `install(env, control, sink)`
Installation requires all six known methods to exist and the initial policy to be valid and enabled
This observer constructor itself has no automatic installation, global profile key, timer or external transport
The optional session below supplies file I/O and lifecycle control separately

`control()` must be a fast in-memory callback returning a table with own fields:

```lua
{ enabled = true, generation = 1 }
```

`enabled` must be a boolean and `generation` an integer from 0 through 2147483647
The controller must advance the generation on every permission, process, owner or session change, including an off/on transition between observations
Observed off, malformed policy, callback exception or decreasing generation retires the current generation
A later explicit larger generation can resume observation
The module does not itself establish PID, process birth, session ownership or a native permission acknowledgement
Those are required gates for any future production transport

The wrappers preserve original arguments, nil-containing return tuples and original Lua error objects
The game methods still run when observation is disabled or unsupported
`dispose()` stops observations and restores only methods that still point to this installation's wrappers, preserving a later owner's replacement
It is idempotent
No pending input is revived after disposal or a generation change

## Input events

The local callback receives `kind: 'artemis-input-v1'`, `stage: 'input'`, an exact variant identity and a generation
This is deliberately not `ToMe_CHARS`

| Role | Observed input | Boundary |
|---|---|---|
| line | First actual selected row returned by `getTextBlockFloat` inside `mw_textloop` with explicit `p.lang == 'ja'` | The selected row is copied before later mutation, not proof of completed typewriter output |
| name | Successful `message_name(text)` invocation | Image-only and novel branches still exist, so this does not prove visible name glyphs |
| choice | `ui_message` inside a successful `select_message`, using the `getMWID('select')` value actually returned to the game | Normal `.2` and hover `.3` variants remain separate, neither is declared visible or clickable |

The observer adds no extra call to `getMWID`
Generic UI and choices arriving after the selection invocation return are not observed as choices
Button/menu images and arbitrary UI fonts are not guessed into roles

Body text is limited to 2048 Unicode scalar values and 8192 UTF-8 bytes per row
A row has at most 256 dense positional items and optional `name` metadata
Supported source tokens are literal strings, `ruby`, `/ruby`, `rt2`, `font` and `/font`
Unknown commands, sparse arrays, metatables, malformed UTF-8, ASCII control bytes and dangling or nested ruby decline observation while leaving the original call intact
Ruby has at most 64 spans, base length 1 through 80 scalars and reading length 1 through 160 scalars
Spans index the input text including an explicit `rt2` newline
They must not be fed directly to the whitespace-compacted `ToMe_CHARS` ruby wire
The game may disable ruby display, so source markup is not a pixel visibility acknowledgement

Name input is capped at 256 scalars
Choice text is capped at 1024 scalars, layer IDs at 128 bytes, and one selection invocation at 64 events
An overflowing selection invocation emits no partial event group
There is no cross-invocation cache or retry queue
The sink is protected against Lua errors but is a trusted fast callback, not a sandbox for arbitrary blocking work

## What the checks prove

`validation/artemis-observer.test.cjs` uses synthetic Lua methods and data to exercise opt-in, UTF-8/scalar bounds, wrapped method call preservation, failure objects, nested calls, policy retirement, overflow and disposal
`validation/artemis-lua-replay.test.cjs` reads three small original Lua members from each exact local PFS, selects known actual function bodies, and invokes them with a synthetic engine and synthetic text
The original game source and dialogue are not committed
Each actual-Lua replay asserts identical ordered print-command inputs before and after observation, then checks semantic role events and off/on/dispose
These are Lua CLI tests, not game execution or image acceptance
The actual engine's coroutine/yield behavior across protected Lua calls has not been accepted, so the stand-in result does not authorize installing this wrapper in an arbitrary running Lua VM

`core/artemis-draw.lua` additionally restores the previous bilingual pass after a nested call and preserves all original return values and errors
The before receipt demonstrates a synthetic wrapper compatibility failure, not a reproduced failure in either commercial game
The existing actual The Shell bilingual-font/ruby replay remains a separate regression

No native C++ source or DLL changed in this candidate, so no replacement DLL is supplied
Lua 5.1 loads and executes the modules in the bounded CLI tests

## Production session and remaining gates

`core/artemis-session.cjs.prepare({root, exe, ownerTestGrant, ...})` rejects a plain JSON grant
It calls the separate `core/owner-tests.cjs.allowed` WeakMap authority, then independently validates actual EXE and effective Lua bytes
No global default, `draw.roles`, verified Seed or calibration record enables this path
`text-paths-launch.prepare` accepts the opaque `ownerTestGrant` parameter even when compositor mode is off
The root integrator supplies that validated token from the public local-test authority; this branch does not create an authorization manifest

The reader accepts one PF8 base plus at most 31 numbered patches in numeric order
Index budget is 1 MiB each and 4 MiB aggregate, at most 20,000 entries per index, three selected members at most 64 KiB each
Unknown directories, reparse points, duplicate case-folded entry paths, traversal, invalid ranges, unsupported PF6 and a full patch namespace fail closed
Loose `system` overrides are rejected rather than silently ignored

The launcher creates a unique `root/data/artemis-shadow/session-*` directory outside the source game
It copies executable/DLL bytes (64 MiB aggregate), verifies the copied EXE hash again, and independently copies resource files
It never junctions any directory or links/copies old saves or configuration
`savedata` is a new empty directory; the optional movie directory accepts at most 4096 flat files with known movie extensions
Movie `.dat` files require bounded ASF recognition: exact header GUID, complete object ranges/count, mandatory properties/extension/stream objects and the following matching Data object
Each header is at most 64 KiB and total movie probing is at most 1 MiB; this is container recognition, not codec or playback acceptance
The actual Shell `movie/op1.dat` passes that read-only recognizer; arbitrary DAT bytes remain unsupported
The layout follows Microsoft's [ASF file structure](https://learn.microsoft.com/en-us/windows/win32/medfound/asf-file-structure) and [30-byte header layout](https://learn.microsoft.com/en-us/windows/win32/api/wmcontainer/nf-wmcontainer-imfasfcontentinfo-parseheader)
Total copies are capped at 4 GiB, including executables, archives and movies
Before copying, the actual shadow volume must have room for those bytes, a 1 MiB patch/protocol allowance, and a further 10 GiB free margin
The 256 KiB streaming copy uses a 45-second monotonic deadline and rechecks permission and destination free space every 500 ms
Both file handles close on failure; an incomplete owned shadow is reported and kept for explicit later handling
It never silently relocates the shadow to another drive when the target volume is short of space
Resource hardlinks are deliberately not used: the actual opaque-authority joint replay proved that creating a Windows hardlink changes the source fingerprint ctime and correctly revokes that token
This is a fresh isolated run, not continuation of the original progress
The original installation must remain preserved, and root must use a separate game test copy
The observed Lua `s.savepath` must equal this owned directory or literal relative `savedata` before any wrapper can install
That is a runtime guard, not proof that all native game persistence has been isolated; actual save-path behavior is still unaccepted

The last numbered private PF8 appends a lazy boot tail to all three verified modules
That avoids assuming their include order and retries installation only on ordinary name/body/choice method calls
Complete patched actual modules compile under Lua 5.1 in the regression
The patch writer is the existing MeguLit PF8 writer; original archives are not rewritten
The new shadow EXE must also pass `owner-tests.registerLaunch` before preparation can return

`connect()` queries the real unique shadow EXE with existing `GalWindowBridge --process-status`, then binds the opaque token to actual PID and UTC .NET start ticks
It never latches an earlier Reader target
The existing native query is hidden and bounded by its 8-second timeout; no game/helper is launched by the tests
Each active 500 ms poll revalidates this process generation and local grant before renewing the control file and consuming events
This experimental path's query overhead has not been measured in a game

Control is an atomic, complete line with random 128-bit session nonce, generation, renewal counter and explicit on/off
Lua checks its actual `e:now()` heartbeat age (4 seconds maximum), save path and the complete control line on each observation
It only writes a private JSONL file: at most 2 MiB total, 64 KiB per event, 256 KiB consumed per poll and 320 KiB partial-line buffering
Node decodes streaming UTF-8, validates role/scalar/ruby limits, nonce and generation, and never publishes CHARS, hide, embed or pixel visibility evidence
A brief Windows read/delete-sharing collision retains the last complete heartbeat for at most 3 seconds; it does not publish partial control
After a delayed renewal a new generation retires older buffered input
The installed status proves only wrapper installation and the save-path guard, not rendering or hidden text

Only exact currently bound PID/start/session input can call the real HookNative source path
Names use its existing speaker-name parser; choice normal/hover inputs remain semantic diagnostics without fake rectangles
Accepted body ruby is converted from explicit codepoint spans to the existing exact/whitespace-compacted `sourceRuby` cache and the real Reader ruby consumer
The actual consumer regression covers an 80-codepoint base and 160-codepoint reading including supplementary characters
Only values owned by this session are cleared on rejection or stop; a rejected queued row restores the preceding accepted row's ruby
Private Symbol plus WeakMap authority is checked at source, deliverSource and emitSource; stale stopped/rebound input is rejected even in an existing delayed callback
All three gates also reject a private delivery immediately when HookNative no longer wants binding, before teardown has finished
Unauthenticated use of the reserved origin is rejected, never treated as permission
Artemis-tagged NVL/page input is deliberately rejected before it can enter queues that discard that authority
Ordinary fallback and the existing Unity three-gate behavior remain separate

`stop()` immediately revokes authority, increments generation and writes off, cancels its timer, and awaits initial/pending native queries
It never terminates the game
Off-write failure raises `READER_STOP_INCOMPLETE` and keeps a subsequent stop retry possible
Off readback is not a native ACK: Lua wrappers become inert on their next control read, with the bounded heartbeat as crash fallback
The existing crash canary is retained for this path
Private input files remain local to the owned shadow and are not uploaded
HookNative also requests and awaits this actual session's stop independently of its own stored grant field
The launch token can already be bound before Reader's asynchronous profile lookup populates that field, so revoking only the hook's field would miss that window
The existing all-settled helper/draw cleanup and retryable failure state are preserved

Remaining gates:

1. Root must integrate the public `owner-tests` module and shared isolated-app wiring; a private joint replay already uses its fixed `499dc63d` implementation for actual resolve/registerLaunch/allowed/bind/revoke, with only the OS process query controlled
2. Actual engine boot/include order, coroutine/yield behavior, native persistence paths and shutdown must be checked in a complete isolated game copy
3. Actual per-glyph layout or a fully verified layer transform, clipping and parent hierarchy, not a configured font rectangle or an ASCII classifier byte pattern
4. Actual Reader placement, name/ruby, choices and menu behavior, followed by ten hidden/readable/translated lines and page cleanup

The local x64 EXEs have no PE export directory
The short UTF-8 classifier prefix seen in upstream hooks matches eight places across six `.pdata` functions in each Amakano 3 EXE
It is not a unique layout or role signature
The old D3D11 black-frame route is not retried

## Five-minute owner checklist after a real deployment

Use the isolated owner-test application with the explicit local `lua-input` grant and a complete separately deployed game copy
An ordinary MeguLit launch or a server Seed does not enable the loader
Keep this checklist pending until root has assembled and verified that exact deployment
Use a complete known installation, not the EXE-only formal sample or the trial's intentionally omitted audio/video files

1. Read ten ordinary Japanese lines, including a line with native ruby, and verify whole text, names and lookup locations
2. Open one choice screen, hover both options, verify one logical option per item and the actual translation while preserving native click targets
3. Open and close backlog, settings and title menus, checking that UI text is not hidden or treated as dialogue
4. Advance, skip and return from a menu, checking no old text, name, ruby or translated layer remains
5. Disable the feature and leave the reading window, checking original presentation and sound are restored

Record actual program/build hashes and which installed version was tested
Until then this branch is an input-source session candidate, not an engine-complete or live-passed claim
