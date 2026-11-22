# Local maintainer signing key bootstrap

`tools/seed-key-bootstrap.cjs` adds an offline DPAPI-backed signing route without changing the existing trusted-key lists or PEM tools
The default command is a read-only plan and generates nothing
Only explicit `init` creates a key; this change does not initialize real maintainer keys or configure production bindings

The existing protocol has three signatures and two authorities

| Role | Explicit signing scopes | Exported binding suggestions |
| --- | --- | --- |
| `publisher` | `profile`, `release`, `revocation` | `PROFILE_PUBLIC_KEYS`, `TORCH_RELEASE_PUBLIC_KEYS`, both the same public key |
| `reviewer` | `review` | `CARDINAL_REVIEW_PUBLIC_KEYS`, a separate public key |

This preserves the current `tools/torch-release.cjs` and client `auto-profile-feed.keys()` trust model
No new global profile-only role, trust import, deployment, registry setting or DACL change is introduced
The two roles use distinct IDs/files and a role cannot sign the other's document type
Roles and scope restrictions are local tool policy, not an extra field inserted into signed wire documents

## Storage and signing

`native/KeyVault.cs` already implements `--vault seal/open` with `ProtectedData` and `DataProtectionScope.CurrentUser`
`core/secrets.cjs` already uses a bounded hidden child process with stdin/stdout for this protocol
The new service reuses that native protocol in a dedicated store, without reading any account/API secret store or changing those existing files

An Ed25519 key is generated in Node memory
PKCS#8 DER is passed to the trusted native helper through its private stdin pipe for DPAPI sealing
Only the DPAPI ciphertext plus public metadata is written to `<key-id>.dpapi.json`
No private PEM is written, no private key is put in argv/environment, and native plaintext stdout is captured by the parent pipe rather than inherited by the terminal
Native errors are reduced to fixed codes and stderr is not echoed

The encrypted payload binds its ID, role, public key and creation timestamp to the public envelope
Opening or exporting verifies those fields and derives the public key from the decrypted private key before returning a public bundle
Signing uses an in-memory KeyObject and the existing `game-diff.canonical` bytes
The DER buffer is cleared after use; JavaScript strings, runtime key objects, OS paging and process dumps are not guaranteed to be zeroized

The native helper must be trusted by the operator
CurrentUser DPAPI protects at rest under the Windows account; it does not isolate the key from another process already running as that same account
This follows [Microsoft's documented CurrentUser scope](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=netframework-4.8.1)
KeyObject/DER and Ed25519 signing use the [Node crypto API](https://nodejs.org/api/crypto.html)

Dedicated stores must be absolute local paths outside all detected Git checkouts, with no reparse ancestors
Key IDs cannot traverse directories or use Windows reserved device names
Existing key files are single-link regular files, size bounded and read through a stable handle
`init` uses exclusive creation and never replaces an existing key or corrupt record
A repeated valid ID/role returns the same public key without rewriting its ciphertext; a changed role, unreadable key or damaged ciphertext fails closed
Two concurrent initializers converge on the first complete key file, or refuse an incomplete file without replacing it
An interrupted exclusive write may leave an incomplete ciphertext file; it must be retained and examined rather than silently regenerated

## Commands for an operator to review and run later

These are templates, not actions performed by this change
Choose a dedicated store outside the repository and an existing trusted `KeyVault.exe`
No command writes a public trust file, Cloudflare binding, account or production configuration

```powershell
node tools/seed-key-bootstrap.cjs
node tools/seed-key-bootstrap.cjs plan --store <absolute-dedicated-store> --key-id seed-publisher-v1 --role publisher

node tools/seed-key-bootstrap.cjs init --store <absolute-dedicated-store> --key-id seed-publisher-v1 --role publisher --vault <absolute-KeyVault.exe>
node tools/seed-key-bootstrap.cjs init --store <absolute-dedicated-store> --key-id seed-reviewer-v1 --role reviewer --vault <absolute-KeyVault.exe>

node tools/seed-key-bootstrap.cjs public --store <absolute-dedicated-store> --key-id seed-publisher-v1 --vault <absolute-KeyVault.exe>
node tools/seed-key-bootstrap.cjs public --store <absolute-dedicated-store> --key-id seed-reviewer-v1 --vault <absolute-KeyVault.exe>
```

Public output includes `keyId`, `roles`, an SPKI SHA-256 fingerprint, the existing `{id,alg,publicKey}` entry, binding suggestions and `trustApplied:false`
An operator can save this public output and decide which trust lists to configure after checking the fingerprints
Initialization/export also prompts for backup: preserve a normal independent copy of the encrypted key file together with the Windows profile/DPAPI recovery material
Ciphertext alone is not a portable key backup or a recovery mechanism for a lost Windows profile
The tool neither exports plaintext private keys nor modifies Windows recovery settings
Use a new explicit ID for rotation; it does not overwrite the old key or automatically revoke old public trust

Signing is also explicit and never calls the network

```powershell
node tools/seed-key-bootstrap.cjs sign --store <absolute-dedicated-store> --key-id seed-publisher-v1 --role publisher --scope profile --vault <absolute-KeyVault.exe> --input <absolute-profile.json> --out <new-absolute-signed-profile.json>
node tools/seed-key-bootstrap.cjs sign --store <absolute-dedicated-store> --key-id seed-reviewer-v1 --role reviewer --scope review --vault <absolute-KeyVault.exe> --input <absolute-review.json> --out <new-absolute-signed-review.json>
node tools/seed-key-bootstrap.cjs sign --store <absolute-dedicated-store> --key-id seed-publisher-v1 --role publisher --scope release --vault <absolute-KeyVault.exe> --input <absolute-proposal.json> --trust <absolute-explicit-trust.json> --out <new-absolute-release.json>
```

`--trust` contains the existing `profileKeys`, `reviewKeys`, `releaseKeys` arrays
Release signing verifies the nested signed profile and review and candidate hash, then applies the existing complete release checker before returning anything
No implicit self-trust is added
Profile, review and revocation shapes use the current protocol validators
This utility does not fabricate Cardinal evidence, establish an honest review from raw scores, decide eligibility, scan files, publish or change a winner
Those steps remain with their existing trusted producers and release protocol

## In-memory adapter

```javascript
const {createVault,createSigner}=require('../services/maintainer-signing.cjs');
const sign=createSigner({
  store:dedicatedStore,id:'seed-publisher-v1',role:'publisher',scope:'release',
  vault:createVault(trustedKeyVaultExe),trust:explicitPublicTrust
});
const release=await require('./torch-release.cjs').signProposal(proposal,{sign,keys:explicitPublicTrust});
```

The callback decrypts only for that signing operation and returns a signed public document
It never returns a private KeyObject or PEM path
The existing `signProposal` and `signRevocation` dependency contracts work without modifying their shared files
Use the corresponding explicit `scope` for the other document kinds

## Validation boundary

`validation/seed-key-bootstrap.test.cjs` compiles the existing, unmodified KeyVault source into fresh neutral temporary directories
It exercises actual Windows DPAPI, real Ed25519 signatures and the current profile/review/release/revocation validators
It tests default zero writes, repeat initialization, role/scope refusal, encrypted metadata substitution, ciphertext damage, no plaintext file, repository/reparse/hardlink rejection, CLI output filtering and exclusive signed output
All generated keys are neutral test keys and their dedicated directories are removed after testing
The native cases are Windows-specific; they are skipped on other operating systems
No real maintainer key or existing user secret was read or initialized, and no binding was registered by these tests
