# Offline release-step runner

`tools/seed-release-runner.cjs` automates an already evidenced candidate's release steps
It is not a trusted Cardinal game runner, an antivirus scanner, or a review signer
Missing trusted review remains `awaiting-trusted-run`; a valid review alone never implies a clean malware decision

## Reuse checked first

The official [tuf-js](https://github.com/theupdateframework/tuf-js) implementation is MIT licensed and provides a mature TUF update client
It does not produce MeguLit's custom live-review receipt or operate its three-signature publication protocol
No external code or dependency was copied
This tool instead reuses `core/torch-release.cjs`, the existing external-key provider in `tools/sign-profile.cjs`, and `tools/torch-release.cjs` signing/history/export validation

## Default and execute

```text
node tools/seed-release-runner.cjs --profile <signed-profile.json> --review <trusted-signed-review.json>
```

Default is dry-run: signature/hash checks and a plan only, with no network, key access, export or signing
Omitting review returns `awaiting-trusted-run` after validating the original signed profile
An arbitrary client score, `cardinal_status.verified`, `passed`, or `clean:true` is not accepted as a review

```text
node tools/seed-release-runner.cjs --profile <signed-profile.json> --review <trusted-signed-review.json> --base <configured-HTTPS-relay-origin> --export-seed <private-staging>/The Seed --execute
```

Execute uses the already configured `MEGULIT_ADMIN_TOKEN`, `MEGULIT_PROFILE_KEY` and `MEGULIT_PROFILE_KEY_ID`
The private key remains outside the repository and is not opened before a clean gate has been read
The tool creates no keys and installs no trust configuration
Profile/release public keys and review public keys remain the existing configured services files; empty/untrusted keys fail closed

Only HTTPS origins are accepted, except loopback HTTP for local integration
Credentials are not placed in URLs; redirects are rejected, responses are bounded, and network calls have deadlines

## Exact protocol and virus-only decision

The original profile and independent trusted review must have valid configured signatures and an exact candidate hash
Current winner and every server proposal are checked against that candidate, review, previous hash, publication revision and promotion reason
The tool creates a pending proposal, then finds its actual admin proposal artifact and reads `/api/seed-admin/malware?id=`
If no gate is available or it is not clean, the tool returns `awaiting-malware-gate` or `malware-blocked` without signing or publishing
It never writes the malware endpoint, clears a verdict, edits `passed`, or creates a trusted review

Malware acceptance requires schema/version, actual item ID, kind/layer/key/revision/settings and exact signed profile hash, plus a self-consistent identity-record hash and clean scanner metadata
The virus subject is the complete signed profile hash, not the proposal's `preparedAt`
Repeated proposals for the same profile/publication revision can share one catalog item whose stored wrapper is older
Consequently its actual `bodyHash` is checked as part of that item's identity, but is not falsely required to equal a freshly generated wrapper hash
The new server proposal/pending hash, signed profile/review and final signed release are independently verified exactly
`originItemId` may refer to an earlier valid scan of the same exact signed profile; the server remains responsible for rechecking the origin item and atomic clean-revision guard

After signing through the existing publisher provider, the tool re-reads the gate and stops if its identity or review revision changed
The new 0029 server must also enforce the clean gate in the publication transaction; client inspection alone is insufficient
Missing 0029/API returns an unavailable/waiting result and does not authorize publication

The existing protocol signs and verifies all three documents; the tool refuses a publisher callback that substitutes a different proposal
Publication is confirmed from exact signed history and current winner before export
A lost publication reply is reconciled through history, never by blindly retrying the publication POST
Re-running an already current exact profile/review only verifies and exports its existing history
Export failure does not erase a successful server publication; a later run can resume by checking that exact existing winner

## Integration and limitations

This is one finite candidate invocation, not a daemon or a new dashboard service
The coordinator must connect the virus-approved job/event or a bounded scheduler to `run()` using existing credentials
There is no additional human quality-approval step in this tool
There is also no invented trusted reviewer: obtaining three real trusted reports and their review signature remains the separate unimplemented trusted-runner boundary
No automatic rollback, Git push, repository release or application deployment is added

Dependencies are the existing 0027/0028 routes plus the independently delivered 0029 malware API/publish guard
The dedicated test suite can use `SEED_RUNNER_RELAY_TARGET` to pin that sealed dependency while this narrow runner branch remains based on the coordinator's 283e822b source
All integration fixtures use an owned loopback Worker, SQLite, temporary neutral signing keys and an explicitly synthetic scanner verdict; they are not antivirus or game acceptance evidence

## Optional existing DPAPI store

The CLI may use all three options together: `--key-store <absolute-existing-store> --publisher-id <configured-publisher-id> --vault <absolute-KeyVault.exe>`
Without them it keeps the existing external PEM provider
Partial or relative-path configuration is rejected
The module is dynamically loaded only when signing is reached after the real clean gate, never during dry-run or while waiting
It calls the independently delivered `services/maintainer-signing.cjs` with `createSigner({store,id,role:'publisher',scope:'release',vault:createVault(vault),trust:keys})`
That module and the already configured store/vault are required for this optional mode; this tool creates no store, keys or configuration
The adapter test injects a neutral in-memory signer through the same lazy factory and actual localhost publication chain, without executing KeyVault or accessing a real store

The approved canonical proposal is retained separately from a cloned signing input
A callback that changes its input in place cannot change the approved comparison or authorize publication of another otherwise valid and clean proposal
