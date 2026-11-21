# Artemis and local owner-test integration

Base: `ef27d4f17976223a27899687ab5ca16047e75929`
Merged candidate: `98be029524fdd1e86996f14f44b4678ef8d4ec40`
The base already contains the separate fixed owner-test module; it is not cherry-picked again
That module's Git blob is identical to `499dc63d964c9ec76ed56bdc5a8b8ed6c709a594`

## Preserved shared behavior

The launch conflict keeps the global library-only gate first, then permits the exact opaque Artemis Lua capability independently of compositor mode
The existing RGSS title/profile helper, RGSS owner callback and source path, Unity launch-alias registration, and web/menu path remain intact
The shared HookNative merge adds the Artemis private-source gates alongside Unity's gates without replacing root's native-ruby ownership or asynchronous all-settled teardown
At the first `ef28965a` checkpoint, Reader, Runtime, bridge, owned-exit, RGSS/Unity providers, profile defaults and setup sources were unchanged from the base
The base's rebuilt-adapter selection and `UNIFIED1` owner-launch configuration remain unchanged
The root result index retains all existing engine reports

## Two actual integration failures and corrections

1. The launch session can bind before Reader's asynchronous profile callback stores the token on HookNative
   With an empty hook token field, the actual `stop(false)` returned while the session still accepted another body line
   `before-stop-window.log` preserves the failing production-method replay
   HookNative now requests the actual Artemis session's stop independently, immediately revoking its token and awaiting it with all other existing cleanup branches
   A failed off-file write still waits for the owned Node helper to close, keeps the session reference, and permits a subsequent stop retry
2. Before stop is called, an already-held private source could pass delivery/emit after `wanted` became false
   The actual sequence advanced from 1 to 2 in `before-wanted-gate.log`
   The source, delivery and emit gates now receive the trusted current binding-wanted boolean; this only applies to authenticated/reserved Artemis input
   Ordinary and Unity sources keep their existing rules

The integration tests use the actual authority module, actual launch preparation, actual HookNative source/delivery/emit/stop and real filesystem copies
Only the game-process query is controlled with this owned Node process PID and a synthetic start string
No game or native query helper is started
The teardown test starts only a bounded, hidden, pipe-connected Node helper owned by the test

## Validation scope

The combined set covers Artemis Lua CLI replays, actual owner/launch/stop methods, RGSS Ruby producer and full private corpus, Tyrano synthetic headless DOM and retained actual-capture/menu replays, native-ruby consumption, Unity source gates, library-only mode, retryable teardown and owned-helper exit
The existing installer scope/resize sources are unchanged and retain root's separately recorded validation; these PowerShell suites are not rerun here
Evidence is under `H:/MeguLit-Work/night-1423/artemis-owner-integration/`, with before logs preserved separately from corrected and final results

No game, visible host, Reader, installer, UAC, COM, audio muter, native DLL build, main push or CI run occurs in this integration
Headless browser fixtures close through their test teardown
The resource-copy gates are exercised with synthetic task directories and exact small effective Lua members, not a complete new multi-gigabyte game deployment
The 4 GiB aggregate limit and destination-volume free-space margin are conservative refusal gates, not proof that a particular complete installation fits or boots
Final game boot, coroutine/yield compatibility, all native persistence, physical lookup, actual ruby/choice/menu experience, coordinates and hiding remain unaccepted
See `docs/artemis-lua-input.md` for the deployment prerequisites and five-minute owner checklist

## Subsequent Unity source integration

Only `25c402939ede693cb6718e274ce8e6071055cb4c` is cherry-picked; its parent owner-test work is already present
The three shared source gates retain Unity IL2CPP, existing KEMCO and Artemis private authority independently
IL2CPP input takes its explicit source-only bypass before page/coordinate routing; Artemis and KEMCO retain their existing ADV/NVL refusal
The actual shared launcher keeps RGSS preparation/ownership and Artemis's compositor-independent opaque capability alongside Unity's diagnostic capability
The bridge adds only native exact-shadow process observation matched to the owned launcher child's PID, before binding; protocol hello is not a binding authority
Reader, Runtime, owned-exit, RGSS provider, profile defaults, installer scope/resize and unified owner-launch selection remain unchanged from the base

The IL2CPP stop entry now returns its actual stop promise to HookNative's existing all-settled teardown, rather than dropping socket-close waiting
A neutral EventEmitter socket exercises actual session/HookNative methods without a game or native host
It also reproduces an old rejected stop promise permanently preventing retry after a later close; the rejected promise is now cleared for cleanup retry, while the source stays terminally stopped and its grant revoked
Both before and after logs are retained
The imported Unity transport tests explicitly stop their unrelated native-bridge polling timer so a slow fixture cannot attempt native startup with its intentionally incomplete layout
All source, Reader and lifecycle assertions remain in place; no game has been used as the fixture

## Real Shell movie preflight

CPU's read-only deployment inventory exposed that the real sole movie is `movie/op1.dat`, not one of the old extension whitelist entries
Its first 64 bytes identify an ASF container
The new read-only shadow plan requires the exact bounded header/object/data framing described in `docs/artemis-lua-input.md`, rather than allowing all DAT files
The actual plan contains ten files totaling 1,261,248,214 bytes; executable/DLL bytes are 9,383,848 of that total
The movie header has eight objects, 5697 header bytes and 5777 probe bytes including its prefix and Data header
No real movie payload is decoded, copied, launched or displayed in this preflight
Synthetic ASF-framing positive controls and fake/truncated/range/reserved/data/budget negatives are separate from that real header evidence

## Final local checks

- Twenty-four relevant test files: 192 passed, 0 failed, 0 skipped
- All 1703 tracked JS/CJS/MJS files freshly passed Node syntax checking; final source hashes are compared again in the receipt
- The fixed real-authority private joint replay passed nine checks on the final session source
- Imported Unity C# wire/plugin/build and pack-tool sources are byte-for-byte the fixed `25c40293` candidate; its previously built official-runtime plugin is reused as owner evidence, not claimed as a new compilation here
- The real Shell plan and current destination-volume margin pass read-only preflight; no complete game shadow or live acceptance is claimed

Final SHA and per-file hashes are recorded in `H:/MeguLit-Work/night-1423/artemis-owner-integration/final-receipt.json`
