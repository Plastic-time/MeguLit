# Seed review queue and trusted host

The coordinator applies migration 0039 after 0038 and updates the main relay, scan gateway and scan host together. The Dashboard uses the existing authenticated ordinary-policy endpoint and revision. Pausing invalidates all outstanding leases immediately. Uploads continue to accumulate. Existing published releases remain available through the usual changes and lookup APIs.

The calibration report endpoint returns an additional `enhanced:{id,state}` for non-gate reports without an ordinary payload and full calibrations with a known engine and script. Restricted private ordinary reports retain their existing path. The task stores the normalized settings, EXE, reported engine/script when available, issuing time and original contributor number. Identical uploads share the report item ID. Administrative deletion fences that task.

## Local trusted scheduler

Run `node tools/enhanced-seed-queue-host.cjs <HTTPS-relay-origin> <absolute-private-host-config.json>` under the prepared host identity. The JSON contains `policy` (the existing trusted-host policy object) and `samples` (a local array of `{exe,identity}` using the relative executable and full identity described in [the collector contract](cardinal-trusted-runner.md)). The scheduler requires exactly one matching local sample. No raw capture, local paths or sample inventory are uploaded.

Set a separate shared `ENHANCED_HOST_TOKEN` in the Worker and on that host. Use the existing external publisher/reviewer PEM providers or the existing DPAPI store with `ENHANCED_KEY_STORE`, `ENHANCED_VAULT`, `ENHANCED_PUBLISHER_ID` and `ENHANCED_REVIEWER_ID`. Empty queues and transport failures back off from two seconds to one minute. During collection the host renews its five-minute lease every minute. It constructs the signed candidate locally and calls `services/cardinal-trusted-runner.cjs:runHost` with a verified current release. The independent collector implements the runner's pinned executable protocol. Only the signed profile and signed standard review leave the host. Missing samples, incomplete measurement and unsigned outcomes retain the existing winner.

### Windows service

Deploy the host checkout under an operator-controlled service directory as `app`, with Node 22+ at `runtime/node.exe`. Compile the existing SCM wrapper from PowerShell in the checkout. These commands assume the service directory already exists and is writable only by administrators.

```powershell
$serviceRoot = 'C:\ProgramData\MeguLitEnhancedSeed'
$source = (Resolve-Path relay/scan-service/windows-service.cs).Path
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /define:ENHANCED_SEED /reference:System.ServiceProcess.dll "/out:$serviceRoot/host.exe" $source
sc.exe create MeguLitEnhancedSeed binPath= ('"' + $serviceRoot + '\host.exe"') start= auto obj= 'NT SERVICE\MeguLitEnhancedSeed'
sc.exe failure MeguLitEnhancedSeed reset= 86400 actions= restart/5000/restart/15000/restart/60000
```

Place the private service configuration at `private/enhanced-host.json`. In addition to the policy object and sample inventory, set `base` to the relay origin, `tokenFile` to an absolute path to a protected bearer file, and `queueLock` to the exclusive file shared by all game tests on this machine. Configure `reviewer` and `publisher` with their respective DPAPI `id`, `store` and `vault` under the actual service identity. Grant that identity read/execute access to the host tools and read access to its private configuration, bearer and keys. Give it write access to its state and shared lock directory. Keep all private material outside the checkout and all player deployment, state and sample directories. Inventory is per locally available game build. Incoming player calibrations need no per-report request file.

An empty host inventory (`samples: []`) can authenticate, claim a job and confirm its retry while awaiting the first verified collector. It also defers saved proposals. In this configuration the host does not need a collector, signing provider, or game slot. Registering an accepted sample and collector requires reloading the private configuration by restarting the service. The service writes its last poll state and the latest confirmed missing-sample retry of the current process to `enhanced-host-status.json` in its state directory.

Start with `Start-Service MeguLitEnhancedSeed`. The service invokes the same queue CLI as foreground mode. Closing the panel has no effect on SCM. For a local drain, create an empty `paused` file in the policy state directory. The host finishes active work and stops claiming until the marker is removed. Dashboard pause invalidates leases immediately. Stopping the service closes its control pipe and aborts the current operation. After a crash, Windows releases this host's exclusive queue file, and the relay retains the job until its lease expires. Keep any collector cleanup barrier intact until the host has verified game isolation and cleanup.

## Relay contract for other hosts

Send JSON via POST to `/api/enhanced-seed/<action>` using the scoped host bearer. Requests except claim include the job ID and opaque lease. The policy route and catalog continue to require administrator credentials.

| Action | Request additions | Successful response |
|---|---|---|
| claim | Empty object | `{job:null}` or `{job:{id,lease,expires,candidate,proposal}}`, expires in Unix seconds |
| renew | None | `{ok:true}` |
| retry | None | `{ok:true}`, reclaimable after 60 seconds |
| receipt | Signed profile and signed review under `profile` and `review` | `{proposal}` after signatures, identity, settings, credit and quality comparison pass |
| ready | None | `{proposal}` after checking the current head and obtaining an exact signed-profile scan |
| publish | Signed proposal under `release` | Existing Torch publication response |

Read the current release from `GET /api/torch-release?exe=<key>`. Without Torch history, an existing active version-layer feed with different settings holds the job for baseline review. A first reviewed release with no competing settings uses the normal initial promotion. Resume a stored proposal at ready. The enhanced scan endpoint scans the canonical **signed profile bytes** with ClamAV and returns their SHA-256, verdict, scanner/database versions and timestamp. The Worker records the exact malware identity and rechecks it during publication. Changes to the winner, a lost lease, deletion, revocation or a pause prevent stale completion. A successful history insertion closes matching tasks and inserts the existing client change event in one transaction. Reconcile an interrupted publish response through lookup/history. Never generate another signature simply because the acknowledgment was lost.

Dashboard host status reports an authenticated claim or renewal within five minutes. Scanner status comes independently from its health endpoint. Queue totals count live pending rows, including leased rows. Offline hosts leave their tasks pending.
### Isolated receiving player

`node tools/seed-peer-receive.cjs watch <parent-directory> <inventory.json>` creates a fresh player directory and subscribes through the same background Seed entry used by the desktop service. Each inventory row has a unique `id`, an absolute `exe` path, an `engine`, and an optional `scripts` array of paths relative to that executable. The driver copies those files, registers the copies in its own library, and enables only private-mode Seed reception. The panel and games stay closed. The first output line gives the player directory.

`status.json` records the live endpoint, process, key fingerprints, initial cursor, first completed replay cursor, and latest cursor. `receipts.jsonl` records the local receiver result when a matching change is processed. A received artifact is rechecked by a separate offline process using shipped keys, actual local files, and the Reader's profile-selection code at a controlled boundary. Compare the signed settings with the applied values. An initial replay of a historical artifact demonstrates reception only. A new reviewed release additionally needs the matching upload, host review, publication hash and receiver evidence. To repeat an offline check, run `node tools/seed-peer-receive.cjs offline <player-directory> <id>`. Create an empty `STOP` file in that player directory to close its subscription.

For enrolled live collectors, set the queue CLI's `policy` to the absolute path of the same private JSON policy referenced by the collector's `policyFile`. Set the collector's `requestFile` to `current-request.json` under that policy's state directory. With the game queue locked, the host verifies the signed candidate and atomically writes the local request before starting the collector. The saved request is an authorized input. The collector produces a separate signed result after measurement. Set `captureRoot` in the policy to the actual volume directory used for live scratch copies and evidence when it differs from the reader and state directories.
