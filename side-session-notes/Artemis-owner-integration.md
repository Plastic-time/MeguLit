# Artemis and local owner-test integration

Base: `ef27d4f17976223a27899687ab5ca16047e75929`
Merged candidate: `98be029524fdd1e86996f14f44b4678ef8d4ec40`
The base already contains the separate fixed owner-test module; it is not cherry-picked again
That module's Git blob is identical to `499dc63d964c9ec76ed56bdc5a8b8ed6c709a594`

## Preserved shared behavior

The launch conflict keeps the global library-only gate first, then permits the exact opaque Artemis Lua capability independently of compositor mode
The existing RGSS title/profile helper, RGSS owner callback and source path, Unity launch-alias registration, and web/menu path remain intact
The shared HookNative merge adds the Artemis private-source gates alongside Unity's gates without replacing root's native-ruby ownership or asynchronous all-settled teardown
Reader, Runtime, bridge, owned-exit, RGSS/Unity providers, profile defaults and setup sources are unchanged from the base
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
