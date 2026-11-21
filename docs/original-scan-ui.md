# Game-folder scan UI

`web/original-scan.js` is an independent ES module, with its local styles in `original-scan.css`
It is not registered in app.js in this candidate
The shared Japanese-restore modal owns the detail-page and Tools entries

## Controller contract

`createOriginalScanController({api,onChange,onApplied,onRefreshError,schedule,unschedule,pollMs})`
uses the documented `jp_restore_scan`, `jp_restore_scan_status`, `jp_restore_scan_cancel`,
`jp_restore_apply` and `jp_restore_undo` commands
Polling defaults to400ms and accepts integer300–500ms
Only the selected library id, returned job id and confirmed scan token are sent to scan/restore
No client folder path is accepted by this flow

Call `selectGame(id)` before changing the modal's selected game
It returns false while an operation is owned, and clears old preview/token when selection succeeds
`scan()` resolves only after a terminal worker DTO
`requestRestore()` shows a separate confirmation; only `confirm()` sends the restore request
`runExisting(action,{id})` supports existing synchronous apply/undo results and the new asynchronous embedded undo
The modal must route its legacy write buttons through this method

Cancellation is requested, then confirmed by a terminal DTO
An active job survives status/transport errors, and retry queries the same id
Restore and undo do not expose cancel and `canClose()` remains false until a terminal response
`dispose()` refuses a write, or awaits confirmed scan termination while suppressing late view callbacks
Incomplete scan cleanup returns false and reports a fixed error rather than claiming the child stopped

`mountOriginalScan(container,options)` combines the real controller and DOM view
`onState` runs synchronously during mounting, so it must not dereference an uninitialized returned handle
`onApplied` is for detect/home refresh after a confirmed write, not proof of reader/game acceptance
Refresh failure does not relabel a completed write as failed

## Integration requirements

Add the stylesheet and mount once in the shared modal, outside its replaceable body
Gate Close, Escape, backdrop and any programmatic close while writing
Await successful dispose before completing a requested scan close
Guard import previews/applies, Steam language changes and automatic-restore undo with the same modal busy state
Disable scan during these legacy operations too, including late file-picker callbacks
Capture the game id across detect/import awaits and discard stale results
Do not infer universal format support from the ability to try a read-only scan

The preview verifies adapter, source hashes, token and count consistency
It explains available local translations and missing translations separately
No estimated progress percentage is fabricated when the backend provides only phase/file/bytes
Paths are rendered through textContent and unknown errors are localized fixed messages

## Verification boundary

`node --test validation/original-scan-ui.test.cjs` exercises production controller methods with controlled async transport and scheduler
It checks presentation, malformed results, explicit confirmation, busy ownership, cancellation timing,
late results, retry, synchronous/asynchronous undo, source/token invalidation and cleanup uncertainty
This is not a real worker, DOM layout, packaged app, file transaction, reader or game test
Backend implementation and actual app registration are separate review gates
