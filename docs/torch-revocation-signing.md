# Offline torch revocation signing

The dashboard can export an unsigned revocation template. A maintainer signs
it locally with an existing authorized Ed25519 key, then explicitly imports
the signed document into the authenticated dashboard. The web page receives
no private key. The CLI neither contacts the relay nor uploads anything.

The template has exactly four fields:

```json
{
  "schema": "megulit.torch-revocation",
  "version": 1,
  "profileHash": "<64 lowercase hex characters>",
  "reason": "compatibility-failed"
}
```

`profileHash` is the SHA-256 of the canonical **complete signed profile** in
the existing trusted release, not the EXE hash or outer release hash. Check
the exported template against that release before signing. Allowed reasons
are the existing relay values `compatibility-failed`, `review-withdrawn` and
`signature-revoked`. The command rejects extra fields, an existing signature,
malformed hashes and inputs larger than 4096 bytes before reading a key.

Use the same existing key parameters as `tools/sign-profile.cjs`:

- `MEGULIT_PROFILE_KEY`: existing private-key PEM outside the repository
- `MEGULIT_PROFILE_KEY_ID`: its configured public-key ID (existing default `p1`)

No new key generation or configuration is performed by this command:

```text
node tools/torch-release.cjs sign-revocation revocation-unsigned.json
```

Stdout is only the canonical signed JSON. Exit 0 means that the local signature
round-trip verified against the public key derived from the selected private
key. It does **not** mean the server trusts that key or that a revocation has
been submitted. The relay still requires its matching, nonrevoked
`TORCH_RELEASE_PUBLIC_KEYS` entry and independently checks the exact signed
document. A wrong/unconfigured signer is rejected there.

On PowerShell, preserve UTF-8 without a BOM when saving stdout (Windows
PowerShell's plain `>` may instead write UTF-16):

```powershell
$signed = & node .\tools\torch-release.cjs sign-revocation .\revocation-unsigned.json
if ($LASTEXITCODE -ne 0) { throw 'Offline revocation signing failed' }
[IO.File]::WriteAllText(
  [IO.Path]::GetFullPath('.\revocation-signed.json'),
  $signed,
  [Text.UTF8Encoding]::new($false)
)
```

Import `revocation-signed.json` using the dashboard's explicit signed-revoke
action. It sends the existing authenticated `POST /api/torch-release/revoke`;
normal soft deletion is not a substitute. Read back history/status afterward.
The accepted revocation stops future trusted-release lookup while keeping
signed history intact. This workflow does not claim that it can erase a
previously installed builtin profile from an offline client.

Local tests use temporary, generated neutral Ed25519 keys only. They execute
the actual CLI and pass its output to the real relay handler over an in-memory
SQLite fixture, including missing auth, wrong trust, lookup refusal and
unchanged signed history. No production key, network or remote database is
used by the tests.
