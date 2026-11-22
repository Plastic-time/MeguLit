# Private Steam test launch

This path exists only for an explicit local owner-test entry with
`launch: "private-steam"`. It requires the existing exact-root, side-by-side,
sharing-off, relay-off, executable SHA and resource SHA checks. It does not
change public profiles, Seed data, engine defaults or ordinary Steam launches

## Launch and permission

`services/bridge.cjs` resolves the opaque owner-test token and calls
`core/owner-steam-direct.cjs`. Preparation is registered with the existing
Runtime stop lifecycle before asynchronous work begins. Stop aborts and waits
for that preparation; a late result cannot start or bind the Reader

The helper creates a fresh `data/steam-shadow/session-*` directory under the
same test root. Selected top-level executable, library, configuration and
archive files are ordinary independent copies. Python bootstrap files and WAD
archives are included. No hardlinks are created. Known top-level save and log
files are excluded; top-level save/config directories are empty independent
directories

Other resource directories remain directory junctions to the source. This is
**not game-save isolation**: nested save locations, Steam Cloud, Documents,
registry state and external application-data locations remain game-specific
and must be reported separately. Preparation does not read personal save
bodies or write source files. Running a game can still write through a
referenced directory

Limits are 4,096 top-level entries, 2 GiB per copied file, 6 GiB in aggregate,
45 seconds and at least 10 GiB free on the target volume after planned bytes
plus a 1 MiB reserve. Copying uses 256 KiB chunks and checks source fd/path
identity before and after, including device, inode, size, ctime and mtime.
Cancellation, disk and grant checks also run while copying. Incomplete owned
directories are retained for diagnostics, so repeated preparations consume
space and may require normal reviewed cleanup

`Owner.registerLaunch(token, {exe, engine, kind: "steam-direct", signal})`
accepts only a one-link, same-SHA executable directly within a fresh-shaped
`data/steam-shadow/session-*` path. Its source grant and resource/configuration
stamps must remain valid. This does not confer process authority yet

The bridge launches the alias directly with the existing startProcess helper
and the private app's environment, including its equal TEMP/TMP values. It
does not use a Steam URI, adopt a sibling process or fall back to the original
path. Existing source processes must be closed and restarted from the test
library. Elevation and shell-open are unsupported for this private policy

After a visible-window result, `prepared.confirm(pid)` queries the exact alias
through the real game-process service and binds its PID and UTC process-birth
identity. `Owner.confirmLaunch` is an internal opaque-token operation, not an
RPC permission. Until confirmation, prepared and externally attached profiles
remain off even when the caller requests a prepared owner-test layer

`Owner.sourceFor(root, alias, {pid, birth})` maps only that confirmed process
back to the original catalog executable. Reader library/profile/learning
selection uses the original identity while native binding still uses the
actual alias PID. Stop, replacement, resource/config changes or a different
birth invalidate that association. Existing step-down and canary checks retain
their final veto

The ordinary same-root desktop mutex remains in force. This change does not
namespace the native PID control protocol between different MeguLit roots.
Do not bind both a production and a test MeguLit to the same game process

## Evidence and owner acceptance

The new tests exercise actual ordinary copies, opaque token APIs, the actual
bridge launch function, its Runtime stop lifecycle and the Reader bound
callback. OS process queries and process starts are controlled fixtures; no
game, Steam, GUI or native injector is executed. Metadata-only boundary cases
do not claim to copy several GiB within the deadline

Before owner acceptance, the deployment owner must add the optional policy to
the intended exact local manifest entries and deploy the changed source. The
user then starts the game from the isolated test library, checks the reported
active capabilities, advances real dialogue and tests the requested text
features. A budget-ready plan is not game acceptance or release approval

## References and reuse

The existing project `steamDirect` path, Artemis bounded independent-copy
preparation and owner-test authority were reviewed first. This helper reuses
the project's APIs and lifecycle rather than introducing a new scheduler or
elevated broker. Project code is GPL-3.0-or-later; no third-party implementation
was copied

Official behavior references:

- [Steamworks initialization and SteamAPI_RestartAppIfNecessary](https://partner.steamgames.com/doc/api/steam_api#SteamAPI_RestartAppIfNecessary)
- [Windows GetTempPathW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-gettemppathw)
- [Node os.tmpdir](https://nodejs.org/api/os.html#ostmpdir)

The private direct process inherits the private launch environment. A game
created by an already-running Steam process or an existing external process
has no demonstrated inheritance from that private launch, so it cannot be
substituted for the confirmed alias
