# Current flame receipt UI

This local candidate keeps the existing game-detail first-player card and its first/off/thanks actions. It adds compact received/installing/install-failed views, with no game launch, database write, progress collection or new dependency. Backend integration and real receipt installation remain separate acceptance steps

## Receipt contract

Only `state: received` with a complete receipt can say installed

```js
{ state: 'received', key: '<64 lowercase hex>', receipt: {
  version: 1, status: 'installed', verified: true,
  key: '<same top-level key>', hash: '<64 lowercase hex>',
  revision: 1, serverTime: '2026-11-22T00:00:00Z',
  credit: { torchNo: 0, name: 'actual received name' },
  cardinalRev: '8'
} }
```

The backend owns signature verification, compatibility binding and completed atomic installation. The UI validates the DTO shape; it does not independently verify a signature. `serverTime` means the trusted publication/passing time of the currently installed flame, never a local fetch/install time. Null or invalid times stay unknown. Credit is optional and never borrowed from the legacy top-level credit. ID zero is valid; neither a name nor a founder identity is invented

Legacy received without a valid receipt says only that data was received and installation is unconfirmed. Installing and failed states show no contributor or publication claim. All three languages share this distinction. Details expose only public content hash, revision and optional Cardinal revision, never personal progress

## Lifecycle

Received and hidden use a 60-second cache poll; existing actionable states use 20 seconds. Errors back off up to 120 seconds. Hidden, blurred, disconnected or stale pages do not poll. Only one request is in flight. The existing API transport cannot abort IPC; generation guards discard late replies instead

Unchanged semantic state leaves the DOM intact. A focused card defers replacement, preserving signature drafts, keyboard focus and expanded details. Leaving the card applies the latest pending state. `dispose()` clears timers/listeners, invalidates replies and removes the card. Route cleanup must call it immediately; detached-page self-cleanup is a fallback

## Mature implementation review

The user requested this research while the candidate was in progress; the following review was completed before sealing it. No upstream source was copied and no package was added

| Primary source | License / reuse decision |
| --- | --- |
| [Tauri updater guide](https://v2.tauri.app/plugin/updater/) and [JS reference](https://v2.tauri.app/reference/javascript/updater/) | Reuse the distinction between available/downloaded/installed and the optional server publication date. Download Finished is not proof of installation. The upstream plugin workspace includes [MIT](https://github.com/tauri-apps/plugins-workspace/blob/v2/LICENSE_MIT) and [Apache-2.0](https://github.com/tauri-apps/plugins-workspace/blob/v2/LICENSE_APACHE-2.0) licenses. No plugin import is needed for a Seed receipt view |
| [VS Code notification UX](https://code.visualstudio.com/api/ux-guidelines/notifications/) and [notification model source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/common/notifications.ts) | Reuse in-context status, disposable lifecycle and no-change update suppression. Code-OSS source is [MIT](https://github.com/microsoft/vscode/blob/main/LICENSE.txt). Importing the workbench notification stack would add unrelated infrastructure |
| [Chrome page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api) and [MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) | Use the built-in APIs rather than a dependency. Visibility and focus are separate signals. These links are reference documentation, not bundled third-party code |

## Validation and limits

`node --test validation/seed-receipt-ui.test.cjs validation/first-player.test.cjs validation/nsfw.test.cjs`: 24/24, no skips. The old service tests preserve the baseline; they do not prove the new backend receipt path

`node validation/seed-receipt-browser.cjs`: 16 DOM assertions and 48 screenshots, all passing, no captured browser errors. It uses the actual UI modules with synthetic API DTOs, a local HTTP fixture, controlled timers and explicit hidden/focus policy controls. Native headless focus is enabled through CDP for actual input-focus events. An earlier fixture run lacked native headless focus and failed the leave-input assertion; enabling test-page focus resolved that fixture condition, without changing the production visibility gate

Coverage includes current-winner replacement, unchanged DOM identity, legacy unconfirmed state, ID zero, anonymous 壹/贰/叁, malformed time/credit escaping, privacy arguments, hidden/blur pause, late-response rejection, active draft preservation, dispose and old sign/edit/withdraw/share actions

Screenshots: `H:/MeguLit-Work/night-shots/seed-receipt/{zh,ja,en}-{1280,440}-{first,off,thanks,received,installing,install-failed,unconfirmed,unknown}.png`, with `report.json`. All screenshots check horizontal overflow. Representative received/thanks screenshots were visually inspected. These are isolated component screenshots, not live game or full-app installation evidence. NSFW behavior was not changed; existing NSFW tests passed, but no physical R18 veil interaction is claimed

Changed-target Impeccable detect returned `[]`. Source syntax and diff whitespace checks passed. A read-only process check after the harness found zero Edge processes scoped to this task

The subsequent normal cleanup command for this task's `profile-*` directories was rejected by automatic review with `blocked by policy` before process creation. Its path checks, deletion and disk query did not run. Those profile directories remain pending; no alternate cleanup is attempted

## Root-owned integration

`seed-receipt-ui.integration.patch` contains the proposed stylesheet and immediate route-disposal wiring. It is intentionally not applied to the shared app/index/game-detail owners. Rebase the proposal onto their current files, preserving any existing cleanup aggregation. The backend should use its locked DTO and enqueue/cache path, rather than turn a UI poll into an unbounded network/install loop
