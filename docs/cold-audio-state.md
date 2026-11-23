# Cold-run audio restoration

## Upstream review before this fix

- Microsoft Core Audio [`GetSessionInstanceIdentifier`](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getsessioninstanceidentifier) identifies a session instance independently of the COM wrapper. An endpoint ID plus this identifier replaces the wrapper-keyed snapshot
- Microsoft [`GetProcessId`](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessioncontrol2-getprocessid) documents `AUDCLNT_S_NO_SINGLE_PROCESS`. Its returned creator PID does not establish exclusive ownership. An unrelated shared session is left alone; a shared session reporting the target creator is rejected
- [NAudio](https://github.com/naudio/NAudio), MIT, exposes session instance identifiers and retains session/volume interfaces. Its current main branch requires .NET 9, while this helper is built with .NET Framework. This change uses the documented Windows interfaces already present in MeguLit; it does not copy or bundle NAudio source

## Incident and change

A real hidden-game guard copied from `ColdCapture.cs` logged an original `false`, followed by repeated `true` snapshots every enumeration. Fresh COM wrappers were treated as new sessions, so restoration could end by applying its own mute state. The earlier selftest reused one wrapper and missed this behavior

The guard now retains the first volume interface and original state for each endpoint/session instance. Later wrappers cannot replace that original. Restore requires a successful write and a matching `GetMute` readback; failed entries remain pending and produce an unconfirmed cleanup result

The Windows regression compiles the current C# source for both x86 and x64, instead of running a possibly stale checked-out binary. It exercises twenty fresh wrappers over the same state, distinct endpoints, read/write/readback failures, and shared-session ownership rules. It performs no live Core Audio calls

## Remaining acceptance limits

This fixes snapshot identity and restore acknowledgement. It does not prove complete discovery of every future session. Microsoft warns that [`GetSessionEnumerator`](https://learn.microsoft.com/en-us/windows/win32/api/audiopolicy/nf-audiopolicy-iaudiosessionmanager2-getsessionenumerator) alone may omit sessions received through notifications; notification tracking and actual process-lifecycle acceptance remain required before claiming complete cold-run audio safety

The QLIE incident's first snapshot did not record a session identity. Its final exact current-session recovery was read back as unmuted, but the association with that historical snapshot remains inferred. That run is not a passing end-to-end restoration test
