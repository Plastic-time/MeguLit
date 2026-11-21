# Artemis Lua input candidate

This candidate has no production loader or transport
It does not complete Artemis glyph coordinates, Reader placement, hiding or translation rendering
No game seed or engine default enables it

## Explicit constructor

`core/artemis-observer.cjs` exports `prepare({enabled, exe, modules})`
`exe` must be a Buffer no larger than 16 MiB
`modules` supplies the caller's effective `system/msg/message.lua`, `system/msg/ui.lua` and `system/adv/select.lua` as Buffers no larger than 64 KiB each
Only literal boolean `enabled: true` prepares anything
An unknown EXE, modified module, missing module or accessor-valued module returns unsupported
Disabled preparation does not read the EXE or module fields

Two exact input sets are declared in `variants`
They are the local Amakano 3 trial and The Shell Part I original Lua versions, not all releases of either title
The formal Amakano 3 EXE is deliberately not accepted with trial Lua
The caller must resolve real archive override order before supplying effective module buffers
This constructor proves supplied bytes, not that a running game loaded those bytes

Successful preparation returns a Lua 5.1 chunk and provenance hashes
It writes no patch, game file, cache or control file
Evaluating that chunk returns `install(env, control, sink)`
Installation requires all six known methods to exist and the initial policy to be valid and enabled
There is no automatic installation, global profile key, timer, filesystem I/O or network I/O

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
Both actual-Lua replays assert identical ordered print-command inputs before and after observation, then check semantic role events and off/on/dispose
These are Lua CLI tests, not game execution or image acceptance
The actual engine's coroutine/yield behavior across protected Lua calls has not been accepted, so the stand-in result does not authorize installing this wrapper in an arbitrary running Lua VM

`core/artemis-draw.lua` additionally restores the previous bilingual pass after a nested call and preserves all original return values and errors
The before receipt demonstrates a synthetic wrapper compatibility failure, not a reproduced failure in either commercial game
The existing actual The Shell bilingual-font/ruby replay remains a separate regression

No native C++ source or DLL changed in this candidate, so no replacement DLL is supplied
Lua 5.1 loads and executes the modules in the bounded CLI tests

## Remaining integration gates

1. A normal nonblocking way to install the verified Lua module in the actual process, with effective archive/module identity and explicit consent
2. An owned process/session-bound transport with generation validation at consumption, bounded queues and confirmed shutdown
3. Actual per-glyph layout or a fully verified layer transform, clipping and parent hierarchy, not a configured font rectangle or an ASCII classifier byte pattern
4. Actual Reader placement, name/ruby, choices and menu behavior, followed by ten hidden/readable/translated lines and page cleanup

The local x64 EXEs have no PE export directory
The short UTF-8 classifier prefix seen in upstream hooks matches eight places across six `.pdata` functions in each Amakano 3 EXE
It is not a unique layout or role signature
The old D3D11 black-frame route is not retried

## Five-minute owner checklist after a real deployment

The new observer cannot currently be checked merely by launching MeguLit because it has no production loader
Keep this checklist pending until the integration gates above have been met
Use a complete known installation, not the EXE-only formal sample or the trial's intentionally omitted audio/video files

1. Read ten ordinary Japanese lines, including a line with native ruby, and verify whole text, names and lookup locations
2. Open one choice screen, hover both options, verify one logical option per item and the actual translation while preserving native click targets
3. Open and close backlog, settings and title menus, checking that UI text is not hidden or treated as dialogue
4. Advance, skip and return from a menu, checking no old text, name, ruby or translated layer remains
5. Disable the feature and leave the reading window, checking original presentation and sound are restored

Record actual program/build hashes and which installed version was tested
Until then this branch is an input-observer proposal, not an engine-complete or live-passed claim
