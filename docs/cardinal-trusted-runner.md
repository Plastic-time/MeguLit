# Trusted Cardinal host runner

`tools/cardinal-trusted-runner.cjs` is a local host entry point for the machine review stage. It does not upload, propose a release, publish, register a key, scan a game for viruses, or change CI and quality defaults. After host infrastructure exists, collection, scoring, comparison and review signing run without a person judging adaptation quality.

## Current state

The repository does not contain a complete trusted live collector. Running this command reports the gap and exits 2:

```powershell
node tools/cardinal-trusted-runner.cjs status
```

The status is `awaiting-trusted-run`, with `signed:false` and `TRUSTED_LIVE_COLLECTOR_UNAVAILABLE`.

Three existing routes were inspected:

| Source | What it measures | Why it cannot issue this review |
| --- | --- | --- |
| `native/ColdCapture.cs` | Scene extraction in an owned hidden job with audio restoration | No Reader DOM or live translation acknowledgements |
| `services/cold-test-run.cjs` | Real native hook observations, cold game driving and screenshots | The hook callback discards Reader events; there is no reading layer |
| `services/cardinal/driver.cjs` | Headless Reader DOM driven by fake GWB/HB processes and a recorded timeline | Offline replay, not a concurrently running game |

`core/owner-tests.cjs` grants local diagnostic capabilities. Its permission does not prove adaptation quality or trusted execution. The runner does not convert an owner-test grant, a player vote, cached translation, old score file or fixture result into a review.

## Running on a prepared host

```powershell
node tools/cardinal-trusted-runner.cjs run request.json trusted-host-policy.json H:/TrustedState/review.json H:/TrustedState/status.json
```

Both output paths must be new files inside the configured state root. A failed or incomplete run writes only the status. Existing files are not intentionally replaced. A successful run writes a standard signed `megulit.torch-review` and a small status summary. The release publisher remains a separate stage.

The host policy is administrator-controlled configuration installed outside the downloaded request and game directories. Treat its file permissions, binary allowlist and capture public keys as part of the trusted host. Downloaded clients must never choose this policy, its keys or the collector executable. There is no report-import, skip-verification or replay-acceptance command.

The request has these fields:

```json
{
  "schema": "megulit.cardinal-trusted-request",
  "version": 1,
  "exe": "game.exe",
  "identity": {"exe": "<hash>", "script": "<hash>", "scriptFile": "data.xp3", "engine": "kirikiri"},
  "candidate": "<existing signed version-layer profile object>",
  "baseline": null,
  "torchNo": 0
}
```

`exe` is relative to the private sample root. `baseline` is null for an initial candidate, otherwise the complete existing signed release. `torchNo:0` requires an official candidate. A newer candidate must have a higher profile revision. Baseline signatures, identity, public cohort, current Cardinal revision and policy must be comparable. The later relay publication stage must still check the current head atomically.

The host policy uses `schema:"megulit.cardinal-trusted-host"`, `version:1` and these fields:

| Field | Requirement |
| --- | --- |
| `appRoot`, `sampleRoot`, `stateRoot` | Existing absolute, disjoint directories without symlink ancestors; use an isolated app and a private disposable sample |
| `profileKeys`, `reviewKeys` | Existing active Ed25519 public key entries using the current `id/alg/publicKey` format; reviewer and publisher keys differ |
| `reporters` | At least three distinct active capture public keys; IDs and key bytes are unique and do not reuse publisher or review keys |
| `cohort` | Public strings `suite`, `environment`, `version`; the canonical hash becomes the review cohort; never put a person or device ID here |
| `slots` | Integer 1 through 4; state files are shared by all runners on this host |
| `budgetMs` | Integer 1000 through 360000 per report; reports run sequentially |
| `collector` | Fixed external `.exe`, exact SHA-256, structured `args` array and the capabilities below |

The collector must be installed outside the repository and all three roots. Its capability list must include `native-live`, `dom-ack`, `monotonic-timeline`, `owned-job`, `audio-restore`, `save-isolation`, `network-isolation` and `parent-watchdog`. Declaring these strings does not implement them. Only an audited collector with those actual properties belongs in the host allowlist. No such binary was installed or accepted in this change.

The private sample must have OS-enforced save and network isolation. A directory copy alone cannot stop a game writing AppData, the registry, Steam data or network saves. The collector must fail before launch when isolation, an owned job or audio restoration cannot be guaranteed. The runner does not snapshot or change the user's original save locations, and it does not manufacture isolation from a JSON boolean.

## Collector transport

The runner verifies the collector binary before and after every report. It spawns that exact file without a shell, sends one JSON line on stdin and reads one bounded JSON response from stdout. The response limit is 16 MiB. The child receives a small environment containing Windows paths, the state directory as TEMP/TMP and `MEGULIT_RELAY_BASE=off`. Signing-key and token environment variables are not inherited. The collector itself must enforce network isolation.

Each request uses `schema:"megulit.trusted-capture-request"`, version 1, a fresh random `challenge`, the selected `reporter`, exact profile/config/identity digests, the actual composed profile, private paths and the time budget. The collector must apply this profile to the actual controlled Reader, then independently read its effective profile and configuration back. Echoing requested hashes is insufficient. No private paths or raw observations enter the published review.

The response uses `schema:"megulit.trusted-capture"`, version 1, and contains:

- The exact challenge and reporter ID, `source:"native-live-dom"` and a fresh UUID `runId`
- `identity`, `candidateHash`, `appliedProfileHash`, `configHash`, `identityDigest` matching the bound run
- `process` with positive `pid`, nonzero process `birth`, and true `owned/jobAssigned/hiddenDesktop/privateCopy/savesIsolated/networkBlocked/parentWatchdog`
- `cleanup` with true `treeExited/audioRestored/ownershipReleased`, bound to this challenge
- `run:{name,steps,o}` using the existing Cardinal observation schema; `o.models` is false, and every source episode adds the exact `pid` and `birth`
- One `domAcks` record per source with `line/episode/sourceKey/at/translation` and true `observed/paired/enabled/visible`
- A standard Ed25519 `signature` from the requested capture reporter over canonical JSON excluding `signature`

The raw capture signature allows the larger local transport limit. The final review still obeys the existing 128 KiB Torch protocol. The signed collector is responsible for actual native provenance, concurrent live DOM sampling and OS ownership. Host administration must audit it, rather than treating arbitrary signed JSON as a measurement device.

## Automatic checks

The host reuses `services/cardinal/identity.cjs` for complete engine script inventory, actual executable/script hashing, applied profile identity, public configuration manifests and pre/post verification. A supplied script locator must be a member of that complete inventory. Missing engine support, drift, links, absent keys or unsupported collectors leave the request awaiting a trusted run.

Every report needs one matching native bound process, at least 30 complete non-history non-OCR source lines and a measured delivery timeline. DOM acknowledgements must be distinct, source matched, on the measured clock and associated with a sampled visible translation. Cached text availability alone fails. The runner reconstructs live pairing, then calls the existing `Score.score`, `Timing.check` and `Upload.eligible`. Source, content and visibility coverage must each be 1.

Three separate registered reporter keys and three unique run IDs must pass. These are trusted reports, not three people or devices. The host computes line-weighted mean and minimum report total. `torch-review` validation enforces mean at least 0.9, floor at least 0.6, current revision/policy, reliable live display and timing. Applied Cardinal rules must equal the current defaults, so a candidate cannot loosen its own grading rules. A custom ruleset awaits a separately defined comparable policy instead of silently passing. Every report's timing is checked; the wire format retains the first report's valid timing proof. The existing promotion rule requires strictly higher mean and no lower floor than the verified baseline. No review key is read before these checks pass.

The existing external review key is supplied only on the host through `MEGULIT_CARDINAL_REVIEW_KEY` and `MEGULIT_CARDINAL_REVIEW_KEY_ID`. Its public key must already be present in `reviewKeys`. The PEM must live outside the repository, app, sample and state roots. The tool never creates, exports or registers a private key. It verifies the final signature and refuses a signer that changes measured fields.

## Ownership and stop behavior

Slots are exclusive `wx` files. A leftover slot is never reclaimed by looking up its PID, which could have been reused. A signed cleanup acknowledgement must refer to the current challenge. Missing or invalid cleanup keeps the slot and writes `blocked.json`; another run stops at that barrier. There is no automatic barrier-clear or alternate-tool retry command.

Resource checks require at least 4 GiB free RAM and 10 GiB free on each of C/E/H. They run during preparation, between reports and every two seconds while a collector is alive. Abort or timeout asks the owned ChildProcess to stop, reusing `core/owned-exit.cjs`; it waits for actual exit and never discovers or kills an arbitrary PID. Forced or unproven cleanup blocks subsequent runs. The external collector must reuse the existing native job/parent ownership and audio snapshot/readback safeguards, close the game tree, restore audio and acknowledge completion before exiting.

The source review documents an existing audio limitation: enumeration alone does not prove discovery of future audio sessions. This runner does not resolve that native limitation or mark it accepted. The collector must satisfy it before host installation. No Windows foreground interaction is required by the runner.

## Verification boundary

The neutral tests generate ephemeral signing keys in memory. Positive fixture signatures are test artifacts and are not registered production reviews. The programmatic fixture boundary requires capture, resource and signer replacements together, so an injected collector cannot accidentally fall through to the production key loader. The CLI exposes none of these overrides. Tests exercise the host validator, signature roles, digest binding, automatic comparison, corrupt evidence rejection, persistent cleanup barriers and bounded transport. Harmless Node children check stdin/stdout, environment stripping, cooperative ownership cleanup, resource cancellation and the CLI awaiting path. They launch no game, change no saves and call no real audio API.

The current machine status was exercised and remains awaiting a real trusted collector. No real review key was opened, no trusted live game report was obtained and no release was published. The missing work is an audited native-game plus actual Reader collector with complete isolation and audio ownership, followed by real host acceptance. The runner is ready to refuse incomplete evidence; it does not claim that missing collector is implemented.

## Existing DPAPI reviewer store

An already configured CurrentUser DPAPI reviewer can be selected explicitly without a PEM:

```text
node tools/cardinal-trusted-runner.cjs run request.json trusted-host-policy.json H:/TrustedState/review.json H:/TrustedState/status.json --key-store C:/ExistingMaintainerStore --reviewer-id configured-reviewer --vault C:/TrustedTools/KeyVault.exe
```

All three options are required together, with absolute store/vault paths and an existing reviewer ID in host-policy reviewKeys
The store must remain outside the repository, App, sample and state roots
No option skips capture, imports a finished score, configures trust, initializes a key, or signs an arbitrary input document
Without these options the existing external PEM path and its safe missing-key failure remain unchanged

The adapter dynamically loads the existing services/maintainer-signing.cjs only after all three signed capture reports, cleanup, eligibility, comparison and final identity checks succeed
It uses createSigner({store,id,role:'reviewer',scope:'review',vault:createVault(vault),trust:policy})
The signing input is cloned from a separately retained canonical measured review; even an in-place signer mutation is rejected against the original snapshot
Status, unavailable collectors and invalid capture evidence do not read/decrypt a key or invoke KeyVault
This adds no dependency, live collector or actual trusted game result
Tests use the existing explicitly synthetic full capture/resource/signer boundary and neutral ephemeral keys; no real DPAPI file, KeyVault process or game was used

## External collector diagnostics

Build the external executable and its private dependencies in a new host tools directory with
`tools/build-cardinal-collector.ps1 -OutputDirectory F:/TrustedTools/Cardinal`.
Keep this entire directory administrator-controlled, including the native stdout tap and WebView2 assemblies.

- `CardinalCollector.exe --probe` opens a neutral WebView2 on a unique private desktop and reads its visible challenge text over CDP
- `CardinalCollector.exe --reader-probe F:/fresh-app --cdp-port 49279` starts the actual MeguLit desktop reader. Use a fresh F-drive copy containing the trusted desktop executable, its matching native GalWindowBridge, runtime Node, services and core, without player data or cache. Keep the parent's stdin pipe open during the diagnostic. EOF cancels the job
- The Reader diagnostic opens the Reader through its host command, reads readiness and visible translation from its page, and checks a real native bridge ready record from the same job. It obtains the pipe client identity from Windows and verifies the service and bridge image paths. An empty Reader returns a null translation
- The configured IPv4 loopback port is exclusively bound and released before launch. The collector checks the actual listening PID, process creation ticks and job membership again at observation. The Reader page ID must match the WebSocket target path. `readerTargetId` is required in the trusted report signature payload
- The default stdin entry fails before launch. For the isolated KiriKiri game path, the host can configure collector arguments `--isolated-game <absolute-F-drive-game.exe> <pinned-exe-sha256> <control-IPv4>`. Use the host's existing single-game lease. The collector verifies the request against the pinned executable, checks TCP and filesystem isolation in the same temporary AppContainer, and copies the game assets into a fresh directory with an empty writable savedata directory. Source paths with reparse points are rejected
- The game starts suspended on the private desktop. The existing job owns it before resume. The audio guard reports the number of sessions whose original mute state it read back during cleanup. Zero sessions provide no audio evidence
- This path returns unsigned failures until real source episodes, matching visible translations, profile readback and reporter signing are implemented and verified. Client code must keep the collector outside the trusted live allowlist. On this host the pinned Fata Morgana JP executable fails in CreateProcess with Win32 623 before the game gets a PID

## Enhanced-seed host adapter

The persistent Windows service uses the [enhanced queue CLI](enhanced-seed-queue.md) and generates requests from incoming calibrations and its host sample inventory. For a one-shot run with previously prepared request files, run `node tools/enhanced-seed-host.cjs <local-config.json>` once per scheduler tick on an authorized host. The administrator configuration contains the relay origin in `base`, a local trusted `policy` file, a list of local signed-candidate request file paths in `requests`, and the shared single-game queue's exclusive file path in `queueLock`. Use this adapter only with a queue that uses exclusive file creation and deletion. The optional `reviewer` and `publisher` objects specify existing DPAPI `store`, `id` and `vault` values for their respective roles.

The host checks its idle reading, resource limits and cleanup barrier, then takes the queue lock before claim. One invocation processes at most one job. A missing sample retries, a running measurement renews every 90 seconds, and renewal failure aborts the run. An existing proposal can resume at the malware gate. The adapter compares the signed profile and review, candidate identity, baseline and exact ready proposal before invoking an existing publisher. It compares the published hash to the locally verified signed release. A host without a publisher leaves the receipt available for a publishing host.

Only the host HTTP client receives `ENHANCED_HOST_TOKEN`. The collector receives the trusted runner's restricted environment. No endpoint, host credential, game sample or signing key is configured by building the diagnostic program.
