# Enhanced Seed queue and trusted host

The coordinator applies migration 0039 after 0038 and updates the main relay, scan gateway and scan host together. The Dashboard uses the existing authenticated ordinary-policy endpoint and revision. Pausing invalidates all outstanding leases immediately. Uploads continue to accumulate. Existing published releases remain available through the usual changes and lookup APIs.

The calibration report endpoint returns an additional `enhanced:{id,state}` for non-gate reports without an ordinary payload and full calibrations with a known engine and script. Restricted private ordinary reports retain their existing path. The task stores the normalized settings, EXE, reported engine/script when available, issuing time and original contributor number. Identical uploads share the report item ID. Administrative deletion fences that task.

## Local trusted scheduler

Run `node tools/enhanced-seed-queue-host.cjs <HTTPS-relay-origin> <absolute-private-host-config.json>` under the prepared host identity. The JSON contains `policy` (the existing trusted-host policy object) and `samples` (a local array of `{exe,identity}` using the relative executable and full identity described in [the collector contract](cardinal-trusted-runner.md)). The scheduler requires exactly one matching local sample. No raw capture, local paths or sample inventory are uploaded.

Set a separate shared `ENHANCED_HOST_TOKEN` in the Worker and on that host. Use the existing external publisher/reviewer PEM providers or the existing DPAPI store with `ENHANCED_KEY_STORE`, `ENHANCED_VAULT`, `ENHANCED_PUBLISHER_ID` and `ENHANCED_REVIEWER_ID`. The process claims work every 15 seconds when idle and renews a five-minute lease every minute during collection. It constructs the signed candidate locally and calls `services/cardinal-trusted-runner.cjs:runHost` with a verified current release. The independent collector implements the runner's pinned executable protocol. Only the signed profile and signed standard review leave the host. Missing samples, incomplete measurement and unsigned outcomes retain the existing winner.

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
