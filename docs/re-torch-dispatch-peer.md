# Shared torch receiver wiring peer review

Target reviewed: `7d1b859c54bcbb62125ca7b761913052f53e83e2`, root `night-ci` staging, 2026-11-22

This fixture executes the complete actual CommonJS bridge/runtime sources in isolated VM contexts and the complete actual ESM Worker router through `SourceTextModule`
It does not copy dispatch/stop/router implementations
DB, receiver and downstream route dependencies are controlled substitutes; filesystem executable validation is synthetic
The real `LibraryScans` class is loaded from the target tree
No database, relay, game, audio or actual receive/install operation is performed

## Result

14/14 tests passed, zero skips, Node 22.22.3, 128 MiB heap, 5-second per-file test deadline
Source syntax and `git diff --check` passed
No wiring defect found within this finite scope

- `save_game`: explicit existing id, no-id matched UPDATE and no-id INSERT each enqueue only after successful DB write; each write failure rejects and closes DB without enqueue
- Each successful save uses `{force:true,priority:'user'}`
- `game_original_executable`: a thrown mutation cannot enqueue; success explicitly uses force/user
- `first_player`: failed DB open cannot enqueue, but after open it deliberately enqueues user work before `state()` reads the card; a state-read error can therefore follow an enqueue, independently of save/mutation guarantees
- `library_scan`: successful reconcile and successful id query precede receiver enqueue; either failure prevents enqueue; no priority override is passed, preserving receiver bulk default
- Runtime construction invokes receiver `resume`; actual `stop()` awaits its Promise, prevents subsequent runtime calls, and completes later cleanup stages despite reader/Anki failure
- When receiver stop itself rejects while another cleanup remains pending, `stop()` still waits for that cleanup and completes later stages; receiver's first error is retained rather than replaced by a later service error
- Actual Worker `default.fetch` routes `/api/torch-release` and `/api/torch-release/current` to its imported handler, passing the same request/env and router helpers; adjacent `/api/torch-releasex` returns 404 without calling it

## Exact source identity

SHA256 of complete UTF-8 source bytes read by the VM

| File | SHA256 |
| --- | --- |
| services/bridge.cjs | b92aa67592140b0d8c2795afb9c42594495263aa22a8d393a9e54797388405d8 |
| services/runtime.cjs | 48c3edd371eb1bf13fd1604768fe55ac477c032ca73baf218f99f6bb6e4636ac |
| relay/src/worker.js | d4d302fe0f2957d3c9f03c4716c5945715859310c39c472d1328ac121b9efb06 |
| services/library-scan.cjs (real loaded dependency) | 28a9bf023ffb76fd9c61a400e61a614ba335e0e48c48aa1a6e1d00064131971a |

## Reproduce

Set `MEGULIT_PEER_SOURCE_ROOT` to the tree containing the source identity above, then run

```powershell
$env:MEGULIT_PEER_SOURCE_ROOT='H:/MeguLit-Work/wt/night-ci'
node --max-old-space-size=128 --experimental-vm-modules --test-timeout=5000 --test validation/torch-dispatch-peer.test.cjs
```

The test emits the actual source hashes so a later changed tree is distinguishable
It intentionally requires the source-root variable instead of silently testing this older peer branch

## Limits

These tests prove call ordering, priority arguments, finite fault propagation and actual router registration under controlled dependencies
They do not prove SQLite transactional atomicity, receiver internal cancellation/resume safety, live HTTP signature/install correctness, publication/deployment or game acceptance
The receiver owner is separately fixing its P1 lifecycle case; this review neither substitutes for that test nor modifies receiver production code
`originalExecutable` is an external mutation seam here, so its internal transaction details are outside scope
Only representative router paths are exercised, not every HTTP method or downstream handler behavior
