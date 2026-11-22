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

Workflow state `passed` says **本版本核查通过**, separate from `published` saying **已签名下发**. Upload identifier counts are not real-person counts. Missing adoption data says **客户端回报采用会话：暂无数据**. Public counts and repository annotations are not trusted execution or installation evidence

Queue controls require `queueLane: version-retest`, active pending/reviewing state, explicit queue capability, and an unpublished item. BeforeId choices are other active permitted jobs in that same lane, including different games and versions. It is a global ordering anchor, never a replacement for the selected job's identity. The server must independently enforce lane/CAS/anchor validity. `queueScope: exe-current-seed-retest` explicitly says that the current runner retests the EXE's currently available seed, not a specifically requested historical seed revision

Every mutation needs a nonempty bounded reason and an explicit confirmation naming the game/version. The view waits for both a mutation acknowledgement with auditId and a fresh GET showing a later revision before claiming success. Unknown writes are not retried and disable further writes until refresh. Revision conflicts read current details but require a new human action. A 401 clears authorization; a 404 is an unconnected/unknown interface, never an empty production dataset

Published artifacts offer no direct delete or fake revoke button. Repository deletion is labelled remote tombstoning and explicitly preserves GitHub/builtin data. Signed publication/revocation/history validation remain the existing independent protocol and are not implemented by this UI. Management audit history is not presented as signed release history

## Validation scope

`node --test validation/dashboard-seed-admin.test.cjs` executes the actual exported client against neutral DOM/network boundaries. It covers authentication, safe text rendering, reason/confirmation, CAS, queue anchors, mutation GET readback, transport ambiguity, revision conflicts, published deletion refusal, bounded responses, logout and stale replies

Related public dashboard/Seed tests remain unchanged. A private headless harness renders the actual `DASHBOARD_HTML` and client at four widths, uses a local contract fixture and closes its browser/server. The fixture overview and list derive from the same dataset, and the neutral artifact digest is computed from actual fixture bytes. These are UI/contract checks, not a production D1 integration test or deployment approval

No production admin request, deletion, publisher signature, live release, key configuration or deployment was performed
