# Cardinal live acceptance on Windows

Run with the project Node version on the isolated host. Use the prepared request and administrator-owned host policy described in [the runner protocol](cardinal-trusted-runner.md). The policy selects the collector from the integration branch by absolute executable path, SHA-256 and structured args. Install its audited build outside the checkout and host roots. Configure the collector to expose its owned WebView2 debugger on one dedicated loopback port. Each signed report must include the actual CDP page id as top-level `readerTargetId`.

The inspected preparation at `F:/MeguLit-Work/release-1423/cardinal-live` includes install, game, helpers and prior evidence. Its capture.cjs uses port 9487 and manipulates a game. Do not execute it alongside this driver. Its preflight and recordings are historical diagnostics. Reserve an idle dedicated machine or game slot, using its existing shared stateRoot and slots=1. Never allocate a fresh state root to bypass a busy game or retained slot. If another workflow owns the game outside the runner, wait for its owner to release it.

```powershell
node --test validation/cardinal-live-acceptance.test.cjs validation/cardinal-trusted-runner.test.cjs
node tools/cardinal-live-acceptance.cjs H:/TrustedConfig/request.json H:/TrustedConfig/policy.json 9487 --key-store C:/ExistingMaintainerStore --reviewer-id configured-reviewer --vault C:/TrustedTools/KeyVault.exe
```

The example paths stand for existing provisioned inputs. Omit the final three flags for the existing host PEM configuration. No key initialization is part of this workflow. The production runner pins and spawns the collector, sends three independent challenges sequentially and applies its normal validation and cleanup barriers. The acceptance observer only reads the local debugging endpoint. For each capture it requires the Tauri Reader location, ready flag, native bridge, visible source and translation, bound game PID and birth, and an independently sampled pair present in the signed acknowledgements for that page. The collector must keep a translated line visible long enough for polling. The runner validates the complete set of at least 30 lines. The observer cross-checks at least one displayed pair in each run. Native job, audio restoration and isolation are collector attestations. The driver separately checks the Windows game PID and birth after collector exit.

Exit 0 requires a verified on-disk reviewer signature. The printed acceptance directory under stateRoot holds status.json and, on review, review.json. Exit 2 means acceptance failed. Inspect status.json when available and respect blocked.json. No relay call is made by the live driver.

## Enhanced scheduler integration

Run only against a disposable loopback worker and dedicated test database with exactly one eligible pending job and no competing hosts. Seed that job with an existing fresh test proposal and its matching signed profile, review and publisher-signed release, using test trust. Arrange the scanner to return infected for the same artifact. The blocked publish is a real request and could succeed on a broken implementation, hence the disposable deployment. Use a local test bearer in ENHANCED_HOST_TOKEN. No keys or token are passed to a collector.

Prepare scheduler-test.json with these fields (replace the object placeholders with the actual signed documents):

```json
{
  "base":"http://127.0.0.1:8787",
  "disposable":true,
  "jobId":"seeded-test-job-id",
  "profile":{}, "review":{}, "release":{},
  "expired":{"status":409,"field":"error","value":"LEASE_LOST"},
  "unready":{"status":422,"field":"error","value":"TORCH_MALWARE_INFECTED"},
  "unpublished":{"status":422,"field":"error","value":"TORCH_MALWARE_INFECTED"}
}
```

```powershell
node tools/cardinal-scheduler-acceptance.cjs H:/DisposableTest/scheduler-test.json
```

Allow slightly over five minutes on a worker sharing the host clock. The driver races two claims, renews once, proves exclusivity past the original expiry, rejects the old receipt before and after reacquisition, repeats a valid receipt and compares proposals, then checks the ready and publish denial codes. A signature or proposal mismatch fails the test. Use fresh disposable state for each repeat. The fast clock unit test checks driver behavior only. Actual worker, scanner and real-game runs require separate evidence.
