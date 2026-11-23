# Local owner-test activation

The isolated test installation can enable implemented engine paths for an explicitly approved copy of a game without editing a Seed, changing public defaults, or calling the resulting settings official

This is a local diagnostic permission, not evidence that an engine works in a real game
The owner still checks names, dialogue, choices, ruby, translation, lookup, page clearing and restoration in the real UI

## References checked before implementation

| Reference | License | Decision |
| --- | --- | --- |
| [VS Code launch configurations](https://code.visualstudio.com/docs/debugtest/debugging-configuration) and [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) | [VS Code source MIT](https://github.com/microsoft/vscode/blob/main/LICENSE.txt) | Reuse the idea of an explicit local launch scope, executable and environment; no implementation copied |
| [VNR game manager, fixed d2b9bad6](https://github.com/Dangetsu/vnr/blob/d2b9bad6af9577f639ce47171d506c9fbf401984/Frameworks/Sakura/py/apps/reader/managers/gameman.py#L27-L37) | [GPL-3.0](https://github.com/Dangetsu/vnr/blob/d2b9bad6af9577f639ce47171d506c9fbf401984/License.txt) | Its path lookup can fall back to an executable MD5; that fallback cannot distinguish copies sharing an engine executable, so this implementation does not use it or copy its code |
| Existing `core/auto-profile.cjs`, `core/profiles/index.cjs` and signed feed | Repository license | Reuse `Profiles.apply`; do not pretend a calibration or signed remote profile grants this local permission |

## Manifest

The preparation tool writes `data/config/owner-tests.json` only in the isolated test root
It records a checked game catalog, not arbitrary downloaded configuration
The owner launches the prepared test shortcut and selects games normally in MeguLit; the owner does not edit JSON

```json
{
  "schema": "megulit.owner-tests",
  "version": 1,
  "root": "<absolute isolated installation>",
  "entries": [{
    "id": "neutral-fixture",
    "engine": "rpgmaker",
    "exe": "<absolute canonical game executable>",
    "sha256": "<complete executable SHA-256>",
    "files": [{"path": "data.dat", "bytes": 20, "sha256": "<complete content SHA-256>"}],
    "draw": {"roles": true, "embed": true},
    "capabilities": ["roles", "embed"]
  }]
}
```

`engine` uses the canonical profile engine ID
`files` must name real identifying script or resource content selected from the checked catalog, not a common runtime DLL or a readme
Files are nonempty, relative to the executable's directory, remain inside it and are read in full
At least one is required; an alias of the executable itself is rejected
The preparation owner must verify that the selected files actually identify the work; a SHA alone cannot establish their meaning

Only `roles`, `embed`, `embedTranslation`, `advhdInput`, `cmvsInput`, `fvpInput`, `minoriInput`, and `kemcoSprites` draw keys are accepted, with strict boolean values
An `*Input` flag belongs only to its corresponding engine and requires `diagnostic-input`
`kemcoSprites` belongs only to Unity
Capabilities are exactly `roles`, `embed`, `diagnostic-input`, `lua-input`; `lua-input` belongs only to Artemis
A flag absent from the actual loaded kernel defaults returns `UNIMPLEMENTED_SETTING`; the whitelist cannot conjure a pending engine implementation
Unknown keys, capabilities, duplicate entries or tokens, malformed arrays, unsafe paths and changed files fail closed
Nothing here adds an engine implementation that is missing

## Isolation and limits

All of these must hold before a grant is resolved or used

- `MEGULIT_ROOT` is the canonical manifest root, with `MEGULIT_SIDE_BY_SIDE=1` and `MEGULIT_OWNER_TESTS=1`
- `MEGULIT_RELAY_BASE=off`, saved `online.relayUrl` is empty, and `runtimeSampleShare`, `autoProfileShare`, `sharedAdaptation` are explicitly `false`
- `data`, `data/config`, `cache`, `logs`, any existing database and configuration sources remain inside the root without reparse paths; shared hard-linked state/config files are refused
- No `data/config/secrets.dpapi` or `data/secrets.dpapi` is present

Private mode separately suppresses MeguLit relay, runtime sample, general profile reports and adaptation sync, even if a user changes a sharing preference during the test
It does not suppress translation providers or dictionaries
The launcher must clear inherited provider credentials and old root overrides and use its own TEMP/TMP directory
This isolates MeguLit's data, settings, database, caches and logs
It does not isolate an external game's saves, registry or Steam Cloud; the game catalog must state whether a game uses its existing save or a separately verified fixture

The owner-test launcher enables signed flame reception, live updates and Seed submission. Only eligible calibration settings, executable hash, mode and an optional script fingerprint go to the report endpoint. Credit changes, scores, runtime packages and other production writes remain disabled. Import a game or open its details to query the two official relay hosts. The reviewed release query sends the executable SHA-256. The ordinary fallback also sends an available local script fingerprint and a cached ordinary artifact hash to check withdrawal. The client verifies the signed release and local executable and script identity, then stores the result under the isolated root's `data/The Seed`. The legacy fallback accepts an exact signed executable profile with unknown publication time and source.

For manual acceptance, use a game version with a known published release. Wait for the installed receipt in the game details, then launch from the isolated library and check the applied adaptation. Keep the isolated `logs/reader-host.log` if the profile differs. Both lookup routes must return the relay's `NOT_FOUND` response before the card says no adaptation is available. If the relay cannot answer, the card shows that the lookup failed and retries later.

Limits are 1 MiB manifest, 128 entries, 16 resources per entry, 2 GiB per file and 4 GiB total including the executable
Hashing uses at most two active file handles and 32 waiting hash operations, with 256 KiB buffers and a 45-second public deadline
Hash work is asynchronous; cancellation, supersession or stop prevents a late result from authorizing anything
An OS file operation already in flight may finish after the caller's deadline; its result is discarded and its handle is closed
Every identity includes device, inode, size, mtime and ctime, checked before and after reading and again before use
A changed stamp requires a new full hash, never a same-size/mtime cache hit

## Internal API

`core/owner-tests.cjs` returns opaque objects registered only in a module-private WeakMap
A JSON clone, remote profile or ordinary object cannot serve as a token
No RPC accepts a token, grant, manifest, alias or path-based permission

| Call | Result |
| --- | --- |
| `status(root)` / bridge `owner_test_status` | Private catalog, exact expected pins, requested capabilities and current local state; no token, no hashing, nothing in a normal root |
| `await resolve(root,{exe,engine,signal?})` | Opaque token or `null` |
| `await inspect(root,{exe,engine,signal?})` | Local status plus token, requested capabilities, settings, phase, active flag, reason and executable SHA |
| `allowed(token,{exe,engine,capability})` | Boolean after identity, privacy and safety checks |
| `bind(token,{pid,birth})` | Boolean; first real session identity is fixed, a different PID or birth revokes |
| `matches(token,{pid,birth})` | Boolean; mismatch revokes |
| `onRevoke(token,callback)` | Unsubscribe function |
| `revoke(token)` / `revokeFor(root,exe?)` | Invalidate permission and pending work, without deleting the manifest |
| `lookup(root,exe,engine)` / `identity(token,exe)` | Internal current-token lookup and its original checked executable |
| `await registerLaunch(token,{exe,engine,signal?})` | Register a checked owned Unity or Artemis shadow executable |
| `apply(profile,token,{exe,engine,prepared?})` | `Profiles.apply` with a visible `owner-test` layer, or the original base profile |

An unbound token lasts at most 60 seconds for launch preparation
The running profile needs a real PID and nonempty process birth from the native game/window query, not a replay flag
The trusted launcher/Reader supplies that session identity; the module does not invent one
Bound tokens check file/config changes and process liveness once per second
HookNative additionally compares every observed target PID/birth, and stop or game close revokes
This polling is not a synchronous ACK from a game and does not retract observations already emitted

The exact shadow executable must be under this root's `data/unity-shadow` or `data/artemis-shadow`, with identical full executable SHA and stable stamps
The original resource pins remain authoritative and continuously checked
At most four aliases belong to one token; stop invalidates all of them
An arbitrary other installation with the same executable SHA is not a shadow alias

RGSS adds `data/rgss-shadow` with a stricter registration contract. `registerLaunch` additionally requires `artifact`, the exact object returned by the RGSS module after verified-source copying and patching. A JSON clone or matching exe alone is insufficient. The original archive must be a checked grant resource; registration hashes the copied executable, DLL, startup INI, patched archive and marker, then keeps their identities in the token. No RPC accepts this artifact

On a native Reader bind, a registered opaque alias can identify its original catalog executable while binding the actual PID and process birth. A new birth rejects stale path replies and invalidates the prior session. This is identity lookup, not permission derived from a path or SHA

`inspect`/`describe` are private feedback data, not a new telemetry format
`ready` means local identity checks passed; `phase=prepared` has `active=false`, `checkReason=AWAITING_PROCESS`
`active=true` means a bound local permission is usable, not that a native hook installed or that a visible page was accepted
That last distinction must remain visible in the feedback UI

The safety step-down layer is never overruled
Stored gate records and the engine crash canary also prevent the owner-test layer, including during prelaunch capability checks
Repeated application unwraps the previous derived layer; revocation cannot accidentally preserve a previous owner-test `true`
No Seed, default, canary or gate file is rewritten by this module

## Checks and remaining acceptance

`validation/owner-tests.test.cjs` uses neutral files and the actual profile/HookNative/Reader entry points, with no game, browser, COM, injection or native drawing
It checks exact-copy separation, script changes, restored-mtime replacement, root/config/credential boundaries, reparse rejection, cancellation races, target lifetime, controlled aliases, default false, step-down/canary precedence, real sharing guards and revocation
Artemis and Unity must separately test their actual launch/session integration against this opaque API
The final deployed test launcher, manifest, exact games and real in-game output still require owner acceptance
