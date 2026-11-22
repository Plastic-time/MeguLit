# Private publisher launcher

DC4UP's bundled instructions select `DC4UP_dstart.exe`, while the hook and library entry must target `DC4UP.exe`. The existing DRM detector returns no plan for this publisher launcher. A library `launchVia` field alone is deliberately not executable authority

## Local authorization

The isolated owner's manifest can request `launch: "publisher-launch"` and `launcher: "DC4UP_dstart.exe"`. This policy currently accepts only engine `circus`, the sole capability `publisher-launch`, and no enabled draw settings. The launcher must be a different EXE basename in the game's own directory, with an exact full SHA and byte count in `files`. At least one additional pinned resource is required

All existing private-root, sharing-off, relay-off, original EXE SHA, resource SHA, path, reparse, timestamp/inode, cancellation, stepdown and canary checks remain. `publisherLaunch(token, {exe, engine})` returns a plan only for a real opaque token. A copied object, arbitrary metadata or environment flags alone cannot supply it. No seed, native default, version allowlist or official profile is changed

Bridge starts that verified launcher with literal empty arguments and its own directory as cwd. Japanese locale uses the existing locale launcher. An administrator manifest is rejected. The existing readiness helper waits up to 90 seconds for the exact library EXE, never the launcher's PID. Its unverified/null-PID fallback is rejected here. Reader preparation occurs after the child is ready, and authorization is checked again before binding

Stopping the tracked session aborts pending verification, revokes the token and prevents a late Reader bind. It does not kill the game or publisher launcher. No cleanup by executable basename is introduced. The ordinary existing-process focus path remains available for this basic stream

## DC4UP deployment proposal

Keep `games.executable` as the full path to `DC4UP.exe` and `original.library.engine` as `circus`. Do not change the library EXE to dstart. Use the exact sample pins in `validation/fixtures/engine-sigs/circus-stock-runtime.json`, plus the pinned dstart file in that fixture. Root's private proposal includes the launcher, NAMES.DAT and both measured MES resources

This selects the existing Circus2_1 basic string hook. There is no new role, coordinate, ruby, hide or embed authorization. Actual launcher startup, child selection, installed-hook diagnostics and Reader text must still be checked by the owner. No game was started by this implementation's tests

## Prior art

Before changing the launch path, the official [Playnite game-action documentation](https://api.playnite.link/docs/manual/library/games/gameActions.html) and [GameAction API](https://api.playnite.link/docs/api/Playnite.SDK.Models.GameAction.html) were checked. They separate an explicit file action and working directory from process tracking. Playnite's [MIT license](https://github.com/JosefNemec/Playnite/blob/master/LICENSE.md) permits reuse, but no Playnite code was copied. This implementation reuses MeguLit's existing launcher/readiness route and local opaque authorization

## Regression scope

The new tests use real Owner verification and the actual Bridge launch function with neutral files. Only process/locale/platform services are controlled. They verify the selected file, arguments, cwd, exact child query, Reader ordering, no bare-game repair/fallback, identity changes, cancellation, unsafe elevation, missing child confirmation and three-language failure feedback. These are console regressions, not live attachment acceptance
