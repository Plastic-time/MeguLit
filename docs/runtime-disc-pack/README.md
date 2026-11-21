# Optional disc-image runtime pack

`disc-mount` contract 1 installs files only into `runtime/wincdemu`, through RuntimePacks.ensure and the existing SHA-256 checked fast downloader
It is excluded from the default/full runtime download and never installs or starts a driver automatically
An installed pack means its files are present, not that the driver is ready

## Upstream identity and licenses

- Official downloads: https://wincdemu.sysprogs.org/portable/ and https://wincdemu.sysprogs.org/download/
- Official v4.1 release: https://github.com/sysprogs/WinCDEmu/releases/tag/v4.1
- PortableWinCDEmu-4.0.exe is the unmodified official 682840-byte asset, SHA-256 c11fd7daa78fb946512f0f7c9ad26247192a6d556819bc73fc22f09007321d6d
- WinCDEmu-4.1.exe is the unmodified official 1576544-byte installer, SHA-256 c47763631d20120057766f2f71f781bf958e22712da4ac933b21db0d615dc93c
- Both official EXE signatures verified Valid, signer Sysprogs OU on this machine; this is not a promise about future Windows trust policy
- batchmnt.exe and batchmnt64.exe are unchanged, unsigned upstream files extracted as data from that exact signed installer, 105984 and 130048 bytes respectively
- WinCDEmu and BazisLib: LGPL-3.0, not GPL-only; their original license remains separate from MeguLit's GPL-3.0-or-later
- STLPort retains its own permissive license
- The standard installer includes mkisofs; cdrtools 3.01a25 source and the upstream WinCDEmu MinGW patch are included, with GPL-2.0/CDDL/LGPL-2.1 notices retained
- WinCDEmu 4.0 source: 2dca49648e3ada1ce002982a597f2ef88a659aaf, official commit named WinCDEmu 4.0
- WinCDEmu 4.1 source: official tag 07e0924d51f6e7fdfb316143de810be085123c6d
- BazisLib: 7363a16ad27b8b79d1d13855befe686ad3abb534; STLPort-kernel: a0ad0144bc4bccd3d6990512415157b383870670
- Sources, upstream build instructions and original notices travel in this same archive; provenance.json fixes every packaged file and source archive hash
- Upstream does not publish an exact dependency lock or reproducible-build attestation for these binaries; the dependency snapshots are published sources, not a claim that rebuilding them reproduces the signed assets
- Upstream build prerequisites include WDK 7.x, WTL 8.0 and VS 2010–2015, provided separately by their respective owners
- The installer stub additionally refers to an external ssibase installer implementation not present in the published WinCDEmu repository; complete reproducible installer source closure is therefore **unverified**, and requires distribution review before publishing this candidate

## Separate driver families and commands

Official source references below are to the fixed v4.1 tag

- Standard command: `runtime/wincdemu/batchmnt.exe` (x86) or `batchmnt64.exe` (x64), PE manifest asInvoker
- Standard driver service: `BazisVirtualCDBus`, separate from portable `BazisPortableCDBus`
- Standard installation is an explicit user choice: the unchanged `WinCDEmu-4.1.exe` opens its normal interactive installer and UAC, never /UNATTENDED
- First installation can change Explorer integration, driver and associations as the upstream installer offers; explain this and let the user choose, never silently substitute it for portable installation
- Standard-driver RUNNING from a read-only service query is a prerequisite, not a native IOCTL health ACK
- `batchmnt [image] /wait:10000`: request a finite 10000 ms mount wait; do not use bare /wait, which maps to unsigned -1
- `batchmnt /check [image]`: ASCII drive-letter exit code 65–90 if found, 0 if not found; device IOCTL failure also becomes empty/0, so 0 alone does not prove absence or successful unmount
- `batchmnt /unmount [image]`: target the owned image only; the upstream routine returns 0 even when DisconnectDisk fails, so verify identity and postconditions separately
- `batchmnt /list`: printf list, but an IOCTL failure can also yield an empty list with success exit; cannot serve as sole driver health proof
- Never use /unmountall or /uninstall as automatic cleanup, because they affect other mounted media or system state

The portable EXE is not a drop-in replacement for independent batchmnt
Its real PE manifest requiresAdministrator on every launch, including queries
Its argument path uses AttachConsole/AllocConsole and freopen(CON), so pipe capture and hidden execution are not established
Its /install and /uninstall act on the portable service only
`VirtualCDClient(false,true)` returns immediately when the standard device-interface list is empty, before trying portable fallback
A portable-only installation therefore cannot be declared usable through standard batchmnt
No ACL changes, manifest edits, broker or driver-policy workaround are part of this pack

## Evidence, reproduction and remaining acceptance

`python docs/runtime-disc-pack/build.py INPUT_DIRECTORY OUTPUT_ZIP` uses pinned local downloads, never invokes any upstream executable
The exact installer BZSARC directory is verified as 64 records, 2032 bytes of UTF-16 names, and 4066614 bytes of file data
Every directory size is summed and checked against the whole decoded file-data section before selecting either batchmnt file; this is not PE carving
The raw LZMA sections are length-delimited without EOS, constrained by the exact installer hash, declaration bounds, output caps and final extracted hashes
Unknown installer bytes are rejected, not accepted as a new archive format

Mirror paths are explicitly `files/<archive-sha256>/<filename>`
Mainland order is cn-dl, dl, GitHub; elsewhere dl, cn-dl, GitHub
Only this pack bypasses release-tag mirror expansion; other packs keep their existing behavior
The downloader still probes sources and chooses measured throughput; order is its priority/tie-break input, not a promise to postpone GitHub probing

No upstream EXE, driver, installer, UAC, mount, game or GUI has been executed for pack preparation
Windows 11 compatibility, real driver IOCTLs, hidden console behavior, image mounting and a complete interactive installation remain unverified
J acceptance remains pending until those real checks and source-distribution review pass
