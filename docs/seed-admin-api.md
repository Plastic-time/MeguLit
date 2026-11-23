# Seed administration candidate

This is a local source candidate, not a deployed control plane. It reuses the
existing relay Bearer `ADAPTER_ADMIN_TOKEN`, the existing automatic-profile
queue and the offline-signed torch release protocol. No signing key is added
to the worker or dashboard.

## References and boundaries

The implementation follows our existing `auto-profile.js`, `cardinal.js` and
`torch-release.js` boundaries. Cloudflare documents atomic D1 prepared-statement
[`batch()`](https://developers.cloudflare.com/d1/worker-api/d1-database/) and
the [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
No external application code was copied. Existing project code remains
GPL-3.0-or-later.

Migrations 0023–0026 are prerequisites. Deploying this candidate requires the
additive 0027 and 0028 migrations and verification of their tables before
switching routes. Missing tables fail closed; they do not produce a healthy
empty catalog or bypass a tombstone. Nothing in this work executes a remote
migration or deployment. The current production-schema receipt reported by
the coordinator lacks both 0027 and 0028.

## API

All `/api/seed-admin/*` routes require the existing Bearer token. GET routes:

- `/overview`: state counts, nullable accepted-upload and adoption-session
  counts, coverage start and fixed repository snapshot provenance
- `/items?state=&limit=1..100&cursor=<id>`: `{items,nextCursor}`
- `/item?id=<id>`: `{item,audit}`

POST routes `/queue`, `/status`, `/delete`, `/restore` require
`{id,expectedRevision,reason}`. Reasons are nonempty, at most 200 UTF-16 code
units, and contain no control characters. Initial revision is 1. A queue
request additionally has `action:'prioritize'|'move'` and, for move, `beforeId`.
A status request has `state:'pending'|'reviewing'|'needs-change'|'passed'`.
Success is `{ok:true,item,auditId}`. Revision conflicts return 409. Mutations
and audit insertion are one atomic D1 batch. A failed audit cannot leave an
unaudited state or order change.

Item identity includes source kind, layer, key, seed revision, settings hash,
profile hash and repository source path/blob. Identical EXE keys in different
repository artifacts remain separate items. `revision` is the admin CAS
revision; `seedRev` is the seed revision. `author` is a stable public torch
number plus its current public name, never a stored private reporter identity.
Name withdrawal is reflected on subsequent reads.

The global `version-retest` lane permits cross-game ordering of active,
unpublished report/pick/repository version artifacts. The real existing
`/api/game-profile/retest` consumes that order. Its old runner accepts EXE keys,
not a particular seed hash: `queueScope:'exe-current-seed-retest'` explicitly
does **not** claim that a selected historical artifact is the one replayed.
Equal legacy ranks without a representable insertion position return 409
`SEED_ORDER_REBALANCE_REQUIRED`; they are not silently reordered incorrectly.

An operator's `passed` state is human bookkeeping only. It does not write
Cardinal verification, issue a signature or replace a torch winner. Legacy
client votes are labeled unreliable for trusted promotion; only a release
whose existing three signature/review checks succeed is shown as trusted.

## Removal and signed revocation

Soft deletion preserves source data and audit, excludes that artifact from
future delivery and queueing, and blocks re-upload/signing of the same exact
configuration until explicit audited restore. Feed, signing and trusted
release publication also check tombstones. SQL-level guards close the race
between prechecks and publication/deletion. For safety, ordinary delete
cannot race past an active signed document at the same layer/key; this
conservative condition can require resolving a sibling signed version first.

Published versions return 409 `SIGNED_REVOCATION_REQUIRED` on ordinary delete.
For a verified trusted release, item fields `revokeProfileHash` and `revokeKey`
identify the signed-revocation target. `capabilities.revoke` means that the
existing authenticated `/api/torch-release/revoke` can accept a **valid offline
signed** revocation; it does not permit the dashboard to sign or fabricate it.
After that endpoint verifies and stores the document, item
`publicationStatus:'revoked'` and public lookup refusal reflect it. History
remains append-only. Legacy signed profiles do not acquire this capability.
The existing `/api/torch-release/history?exe=` supplies historical context;
`core/torch-release.cjs` and `tools/torch-release.cjs` remain the signing/export
protocol references. No new private-key service or signing command is invented.

Deleting a fixed repository catalog entry does not remove a GitHub file or
remotely erase already-installed builtin seeds. The repository catalog is a
snapshot, not a live GitHub synchronization claim. It contains the exact 56
game and 54 version files at its declared commit, excluding story/history.
Regeneration uses `node tools/gen-seed-admin-catalog.cjs <commit>` and validates
Git blob identity; no game payload or personal progress enters the catalog.

## Adoption receipts

`POST /api/seed/usage` accepts exactly the agreed
`megulit.seed-usage` version 1 body: `eventId`, `exeSha256`, canonical complete
signed-document `seedHash`, `layer`, `seedKey`, numeric `revision`, `engine`,
and UTC millisecond ISO `at`. It verifies an existing, nonwithdrawn, signed
document, configured public keys, exact identity and tombstone/revocation
state. Game-layer documents without a signed `prints.exe` identity cannot be
bound from unsigned lookup metadata and are refused by this narrow first
version. It stores no install ID, path, display name or raw IP.

Exact event retries return `{ok:true,eventId,accepted:true,duplicate:true}`;
reusing an event ID with different data returns 409. New accepted events
return that object with `duplicate:false`. A million-event hard cap and the
existing per-reporter rate limiter bound intake. Counts mean client-reported
adoption sessions, not independently observed use, people or installations.
GET/downloads never count. Missing historical events remain null with a
coverage start; newly accepted submissions count as upload requests, including
accepted submission retries, not reconstructed historical unique uploads.
Distinct reporter tags are explicitly upload identifiers, never human counts.

## New-ingest uploader breakdown

Overview also returns nullable `newIngestDistinctArtifacts` (distinct `item_id`
among actual accepted upload events). `uploadCount` counts accepted upload
events, including accepted resubmission requests. Neither value reconstructs
the historical uploads overwritten by the legacy reports table.

Authenticated `GET /api/seed-admin/uploaders?limit=1..50&cursor=` returns
`{uploaders,nextCursor,coverageSince,scope}`. Scope is
`accepted-new-ingest-identifiers-not-people`. Each uploader row contains:

- `id`: server-secret HMAC identifier; `alias`: a short anonymous display code
- `publicNames`: current, validated public credit names, with a truncation flag
- `uploadCount`, `distinctArtifacts`
- up to 20 `artifacts`, plus `artifactsTruncated` and `artifactsCursor`

Artifact rows contain `itemId,key,layer,seedRev,title,engine,uploadCount` and
link to the existing authenticated item detail. A missing title stays null;
no work title is inferred from a shared EXE key. To read more artifacts, use
`GET /api/seed-admin/uploaders?artifactsCursor=&limit=1..50`, whose response is
`{id,artifacts,nextCursor,coverageSince,scope}`. Its next cursor is supplied
again as `artifactsCursor`, not the top-level uploader cursor.

Raw reporter tags, salted IP hashes, paths and emails are not exposed as
uploader identities. Pagination cursors encrypt their internal keyset position
with AES-GCM and a purpose-bound authenticated payload; identifiers use a
separately derived HMAC key. The existing server `HASH_SALT`, or the configured
admin token when no salt is present, is the secret material. Rotation invalidates
old cursors/aliases. These are identifiers, not an assertion that one IP scope
is one human. Public name withdrawal is read on every request.

Empty new-ingest history returns `uploaders:[]` and nullable overview counts,
not fabricated historical zeroes. A 50-uploader first-page fixture takes 12 D1
statements; related artifact/credit lookup is page-scoped SQL, not per-uploader
queries. Artifact pagination covers the complete finite event set without
claiming that the initial 20 links are exhaustive.

## Capacity and validation

Source rows are capped at 500 per community table/group set; exceeding that
limit returns an explicit unavailable error, not a truncated complete count.
The serialized synchronization set is capped at 4 MiB, each item at 128 KiB,
and each bound JSON chunk at 1 MiB in UTF-8. `json_each` upserts and page-scoped
credit/upload/usage/score queries keep statement count bounded; the 500-report
plus 110-repository, 100-item first-page fixture uses 15 D1 statements with a
276099-byte largest bound string. These are local SQLite/D1 API fixtures, not
evidence of a deployed worker or a real Cardinal game run.

Overview `usage.distinctSeeds` counts different complete signed-document hashes
with accepted adoption events; `usage.count` counts sessions. Both remain null
until an event exists. Repeat sessions and exact retry events do not inflate
the distinct Seed count; neither measure asserts unique players.
