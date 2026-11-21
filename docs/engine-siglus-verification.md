# Siglus verification candidate, 2026-11-22

This candidate reuses the reviewed permission lifecycle from `676d3451` and the
x86 relative-address correction from `45f0f9f4`. It does not enable a game

## Scope and real samples

Only Siglus runtime headers, independent selftests and read-only verification
tools change. No seed, shared core, CI, other engine, game data or save changes

| File version | Bytes | SHA-256 | Static outcome |
|---|---:|---|---|
| CLANNAD 1.1.134.0 | 9570304 | 116a1b6ab5902bb6dc49e25086b1ef6f07d941dbb090b497fb7a158e997dea2d | Complete code section matches fixture |
| Summer Pockets 1.1.137.0 | 9605120 | c9c5d963570f417620a445828c8c66a12718430726e81ad8b7e5d2f4fd0f392a | Complete code section matches fixture |

Both files are x86 PE32. Their `.text` entropy is approximately 6.56, signatures
are visible on disk, and none of the checked UPX/SteamStub/VMProtect/Enigma/
Themida section names is present. These indicators do not prove that a file has
no protection. A loaded game module has not been inspected in this run

`tools/engine-sigs/siglus-sample-audit.cjs` accepts explicit file paths, reads
without modifying the samples and requires an exact fixture hash as well as
matching function/role/offset results. A structurally matching unknown hash is
reported as `not-qualified`, rather than promoted to a known build

## Native verification and retained failure

`native/megulithook/selftest/run-siglus-permission.cmd` runs only Siglus console
selftests. Set `TEMP` and `TMP` to a task directory before running it

The expanded original-call fixture promotes the earlier independent peer's
executed-logger checks into a portable repo test. It learns the actual Push
caller's return address, verifies logger counters, deliberately corrupts
XMM0/7, x87/CW and MXCSR, and tests normal, C++ exception and SEH paths. Clear
and Frame exception paths also execute the corruption before throwing. Original
arguments, GPR/flags, stack cleanup and return values remain checked

Two added checks start without a control file and with `roles=0`: no detour is
installed, no observation log is emitted, and the original Push still runs

The first expanded run failed with checked fixture error 32 while its watcher
was reading the control file. The historical helper used a share-zero writer
directly on the live file. Product `KrkrTransport` writes a sibling then renames
it, while the native reader permits read/write/delete sharing. The test helper
now follows that replacement model, checks every write/flush/replace result and
fails explicitly on any error. No polling delay, retry or weakened assertion
was added. That first failure is retained outside the repo alongside the final
log; the product headers remain byte-identical to the reviewed candidates

Final targeted results: production control 25/25; actual MinHook gate 73/73;
signature selftests 23/23 on each x86/x64 host; four Node files 17/17, no skips
An x64-host signature test is not x64-game runtime support

## Default off and integration

`validation/siglus-default-off.test.cjs` checks the default profile, explicit
control serialization and every Siglus game/version seed. Native tests check
actual detour installation and ongoing revocation, including idle paths

The shared manual runner is intentionally untouched. Root can add this line
when integrating the isolated candidate:

```bat
call "%~dp0run-siglus-permission.cmd" || exit /b 1
```

If the local native staging branch already supplied 676/45f, retain its identical
headers and integrate only the additional test/tool changes. Do not apply the
same product patch twice

No old product logic was deleted: the original engine functions must keep
running and installed trampolines must survive permission revocation. Existing
text/embedding routes remain outside this diagnostic candidate

## Real-game evidence still required

This run started no game, MeguLit, browser or audio helper, and built no complete
Hook DLL. `ToMe_DRAWRUN engine=siglus` is diagnostic output; this candidate adds
no Siglus DRAWRUN-to-reader producer. Existing MAGES routing is not Siglus routing

The following remain open:

- A final isolated Hook32/MeguLit build and hashes, then a root-allocated slot
- Real Japanese language/data identity, including the existing CLANNAD #695
  name-column repair and the unresolved reported hang, owned separately
- Loaded-module identity and actual body/name/choice correspondence
- Verified screen origins and client scaling; choice items currently lack the
  `msg::frame` origin path
- Real hidden originals, clickable Japanese DOM and actual translation render
  acknowledgements on at least ten distinct Japanese lines
- Advance/clear/menu/ruby/read-style behavior and no stale page or duplicate row
- Off/on behavior, orderly exit, sound/config restoration and latest-main retest

Copy `validation/fixtures/siglus-live-evidence.template.json` to the capture
directory before testing. Each line links hidden screenshot, DOM, actual lookup,
render ACK and advanced-page artifacts; role and lifecycle checks link artifacts
too. Record SHA-256 for every referenced file

```text
node tools/engine-sigs/siglus-live-evidence.cjs <capture-directory>/manifest.json
```

The inventory checker rejects missing, duplicate, non-Japanese or under-ten
line inventories, mismatched identities, unallocated slots and missing/changed
artifacts. Its output always has `liveAccepted:false`; even a complete inventory
only becomes ready for human review. Metadata and hashes cannot authenticate
real gameplay, and this tool never changes an allowlist or permission

## Adaptation note for the shared notes file

Windows control-file fixture writers must follow the real transport's atomic
sibling replacement, not open the watched file with share mode zero. A checked
error 32 identifies a fixture sharing failure; preserve it and inspect the
writer/reader contract before drawing a product revocation conclusion. Default
off needs a pre-install native check as well as a JSON/profile snapshot
