# Seed adoption receipts

The client reports a Seed adoption session after a bound native game emits a live source line and the running profile includes the verified signed Seed layer. Downloading a document, finding a cache file, or receiving an install receipt does not create a usage event.

These are client-reported adoption sessions. The relay cannot independently prove gameplay or infer a person count. The client sends no account ID, install ID, PID, process birth, executable path, game text, or save data.

## Request and acknowledgement

`POST /api/seed/usage` accepts exactly these client fields:

```json
{
  "schema": "megulit.seed-usage",
  "version": 1,
  "eventId": "<random UUID v4, stable for retries>",
  "exeSha256": "<SHA-256 of the bound executable>",
  "seedHash": "<SHA-256 of canonical full signed profile document>",
  "layer": "version",
  "seedKey": "<signed document key>",
  "revision": 1,
  "engine": "kirikiri",
  "at": "2026-11-22T01:00:00.000Z"
}
```

`layer` is `version` or `game`. `seedHash` includes the document signature and uses `core/game-diff.cjs` canonical JSON. `seedKey` and `revision` are the signed profile document's values, not the enclosing Torch release revision. The relay resolves the work from its verified catalog and checks the supplied executable association. The client does not guess a work title or send a local library ID.

Success requires HTTP 2xx and JSON containing `ok: true`, `accepted: true`, and the exact request `eventId`. A boolean `duplicate` may also be present. A generic 2xx, missing fields, `ok: false`, malformed JSON, or another event ID leaves the event pending.

## Adoption checks

`auto-profile-feed.documentsFor` retains signed document provenance in a private WeakMap, rechecks the signature, and refuses a copied or changed layer. Torch provenance also rechecks the current installed cache and its existing executable/script binding. The usage module does not change feed precedence, rollback protection, or revocation behavior.

The Reader, native bound state, and self-check session must agree on executable, PID and process birth. The self-check session captures PID and birth at creation, which rejects the interval where Reader has a new PID but still holds the old executable/profile. PID and birth only contribute to the local deduplication hash.

The actual running profile must equal `Profiles.profileFor(live.inputOf(session))` and contain the corresponding official or shared layer. Version attribution requires an exact executable match. A game layer additionally needs its signed exact executable or matching script, pack, Steam, or VNDB print. Weak title/head/PE candidates, a local gate step-down, owner-test overrides, unsigned documents and overridden bundled slots do not count.

Unsigned repository-bundled Seeds remain unknown to this metric. Their supply and remote withdrawal need separate handling. A usage HTTP 4xx only stops the affected event and never deletes the player's profile.

## Local queue and privacy gates

`data/The Seed/usage.json` holds at most 128 records and 128 KiB. Each record contains the minimal request, a hashed local session key, a delivery stage and an attempt timestamp. The local key hashes executable hash, PID, process birth and Seed hash. It is never uploaded. Sent/stopped records may be evicted for a new session, so deduplication covers the retained queue rather than an unlimited history.

An event and its attempt marker must be atomically saved before POST. Failed writes prevent sending. Transport errors, HTTP 408/425/429 and 5xx remain pending. Other 4xx, including 409 digest conflicts and revoked/deleted 404/410, stop that event. A later qualifying live source retries the same event ID after at least 30 seconds. Each trigger attempts at most eight events, including when all queue slots are pending. A full pending queue defers a new event until another trigger frees space.

Reader only schedules a coalesced `setImmediate`; it does not await storage or network. There is no resident retry interval or startup pump. Profile/session changes before the callback invalidate that trigger. Network requests have a five-second timeout per endpoint.

Sharing disabled, shared adaptation disabled, private owner-test mode, Cardinal replay mode, an explicit `MEGULIT_RELAY_BASE=off`, or an inactive/unbound Reader prevents new records and sends. The off environment value takes precedence over a saved online URL for this reporting path. These gates are rechecked before each send. An already dispatched request cannot be recalled.

## Verification

`validation/seed-usage.test.cjs` uses temporary inert executable/script files, generated signing keys and mocked HTTP responses. It exercises signed legacy and Torch adoption, stale bindings, profile changes, gate exclusions, queue limits, acknowledgement validation, retry identity, fatal HTTP responses and Reader source wiring. It does not launch a game or submit a production event.
