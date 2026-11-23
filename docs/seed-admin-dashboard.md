# The Seed dashboard management candidate

This adds a management section to the existing relay `/dashboard` HTML. It uses the existing dashboard presentation and public statistics; it does not introduce a second daemon, package, startup entry or independent management website

## Review before implementation

The existing `relay/src/dashboard.js` already reads `/api/probe/stats` and shows Seed/Cardinal aggregates. Its GPL-3.0-or-later source is reused directly. [Prometheus HTTP API documentation](https://prometheus.io/docs/prometheus/latest/querying/api/) was consulted for the distinction between successful data, partial errors and unknown state; no Prometheus source or dependency was copied. [Node HTTP documentation](https://nodejs.org/api/http.html) was checked while considering a local observer, but that standalone-server scope was superseded and no server from it is included

Visual plan: preserve the existing black/gold operator console, use a single full-width management section, and keep the list beside evidence/actions on desktop. Below 800 px the detail follows the list. Scoped 14 px Chinese UI type and a brighter muted color keep long provenance text readable without changing the public dashboard. No new polling or animation loop is added

## API consumed

- `GET /api/seed-admin/overview`: workflow counts, optional observed upload aggregates, usage coverage and fixed repository snapshot coverage
- `GET /api/seed-admin/items?state=&limit=30&cursor=`: artifact/version rows and `nextCursor`
- `GET /api/seed-admin/item?id=`: current item and independent management `audit[]`
- `POST /api/seed-admin/queue`: `id`, `expectedRevision`, `reason`, `action: prioritize|move`, optional `beforeId`
- `POST /api/seed-admin/status`: `id`, `expectedRevision`, `reason`, `state`
- `POST /api/seed-admin/delete`: `id`, `expectedRevision`, `reason`

All endpoints are same-origin and use the existing admin Bearer contract. A token is only retained in a closure, removed from its input on connection, and cleared on disconnect/pagehide. It is never persisted, put in a URL, logged or included in request bodies. Unauthenticated page load makes no admin request

The former `passed` workflow state is labelled **旧人工标记（非质量结论）** for historical filtering, and is not offered as a writable quality approval. Adaptation quality, Cardinal comparison and distribution belong to the automatic pipeline; the administrator only records independent malware review. A read-only quality section renders current Cardinal reliability, trusted-release receipt and publication state. No independent comparison evidence is invented when the API does not provide it. Signed publication is separate from these historical administrative states

Upload identifier counts are not real-person counts. Overview separates **收到上传次数**, **不同 Seed 产物数**, **被采用的 Seed** and **采用会话**. Missing historical event values remain unknown/no data. Public counts and repository annotations are not trusted execution or installation evidence

Queue controls require `queueLane: version-retest`, active pending/reviewing state, explicit queue capability, and an unpublished item. BeforeId choices are other active permitted jobs in that same lane, including different games and versions. It is a global ordering anchor, never a replacement for the selected job's identity. The server must independently enforce lane/CAS/anchor validity. `queueScope: exe-current-seed-retest` explicitly says that the current runner retests the EXE's currently available seed, not a specifically requested historical seed revision

Every administrative mutation needs a nonempty single-line reason of at most 200 UTF-16 code units and an explicit confirmation naming the game/version. The view requires an acknowledgement with auditId/item revision, followed by a fresh GET containing that exact auditId, action, beforeRevision, afterRevision and newState. Another administrator's revision alone cannot confirm the operation. Unknown writes are not retried and disable further writes until refresh. Revision conflicts read current details but require a new human action. A 401 clears authorization; a 404 is an unconnected/unknown interface, never an empty production dataset; a 503 explicitly reports interface/database not ready

Deleted filtering and capability-gated `/restore` return only to pending with the same CAS/audit proof; they do not modify a signed winner. Repository deletion is labelled remote tombstoning and explicitly preserves GitHub/builtin data

## Offline signed revocation

Only a published `trusted-release` with `capabilities.revoke`, exact `revokeProfileHash` and `revokeKey` displays the revocation importer. It exports an unsigned fixed template, and accepts pasted/file JSON up to 8 KiB. Exact keys, schema/version, target profile hash, allowed reason and bounded Ed25519 signature shape are checked before the request. The page never reads a private key or generates a signature

The existing protocol `POST /api/torch-release/revoke` must confirm revoked; `GET /api/torch-release/history?exe=` must contain the exact hash in `revoked`, and the authenticated item must read back `publicationStatus: revoked`. Acknowledgement without that evidence remains unconfirmed and pauses writes. Public-key setup, deployment and server verification are not bypassed. History response reading is capped at the protocol's 8 MiB; other admin responses at 1 MiB

The companion offline CLI candidate supplies `node tools/torch-release.cjs sign-revocation <unsigned-template.json>` using an existing private key outside the repository. Its integration is a root-owned prerequisite; the dashboard does not invoke it. Save its output as UTF-8 or paste JSON, avoiding PowerShell 5's default UTF-16 redirection. A successful local signature does not establish server trust or deployment. Management audit history remains separate from signed release history

## Uploader breakdown

The foldout explicitly loads `GET /api/seed-admin/uploaders?limit=20&cursor=` and displays only safe aliases/current public names, accepted-upload event counts, distinct artifacts and artifact links. Artifact continuation uses the separate `artifactsCursor` parameter and is checked against the uploader id. Following more uploader pages retains already expanded artifact pages. Truncated or missing continuation is disclosed rather than called complete

Artifact links call the existing authenticated detail handler using itemId. Unknown titles remain unknown. Empty new-ingest history does not become historical zero; coverage start and the non-person identifier scope are shown. Refresh clears withdrawn public names from the view. Disconnect clears uploader data along with credentials

## Independent malware review

An explicit **读取病毒检查记录** action calls authenticated `GET /api/seed-admin/malware?id=`. No scanner or review runs automatically. Returned `identity.hash` is a server-derived exact artifact binding; settings-only identity is explicitly insufficient to authorize a later signed profile. The malware review revision is independent of the administrative item revision and starts at zero

The administrator supplies scanner name/version/definitions version, actual scan completion time and a bounded single-line evidence summary. Local datetime input is converted to UTC ISO; no completion time or clean verdict is fabricated. Paths, emails and control text are refused in the summary. **病毒检查通过**, **发现风险** and **重新待查** submit clean/infected/pending respectively; pending sends no invented scanner result

Before writing, a fresh malware GET must still match the shown identity hash and review revision. A mutation sends exactly id/expectedRevision/verdict/scanner/scannedAt/evidenceSummary. Success requires the acknowledgement plus another GET with the same identity, exact review revision/state/scanner/time/evidence and the matching auditId/itemId/beforeRevision/afterRevision/newState. Conflicts read the current record for manual reconsideration; ambiguous writes pause further operations rather than auto-retry. This UI cannot make an artifact clean by changing the old passed state or bypass the automatic quality gates

Long item/uploader lists have bounded independent scrolling. Desktop detail is sticky and internally scrollable; below 800 px it returns to normal document flow. This preserves reachable actions without forcing a narrow screen to scroll through every loaded artifact before reaching detail

## Validation scope

`node --test validation/dashboard-seed-admin.test.cjs` executes the actual exported client against neutral DOM/network boundaries. It covers authentication, safe text rendering, reason/confirmation, CAS, queue anchors, mutation GET readback, transport ambiguity, revision conflicts, published deletion refusal, bounded responses, logout and stale replies

Related public dashboard/Seed tests remain unchanged. A private headless harness renders the actual `DASHBOARD_HTML` and client at four widths, uses a local contract fixture and closes its browser/server. The fixture overview and list derive from the same dataset, and the neutral artifact digest is computed from actual fixture bytes. These are UI/contract checks, not a production D1 integration test or deployment approval

No production admin request, deletion, publisher signature, live release, key configuration or deployment was performed
