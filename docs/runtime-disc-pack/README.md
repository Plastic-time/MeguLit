# Optional disc-image support

When requested, MeguLit downloads the unmodified [WinCDEmu 4.1 installer from its publisher](https://github.com/sysprogs/WinCDEmu/releases/tag/v4.1) directly to `runtime/wincdemu/WinCDEmu-4.1.exe`. No MeguLit mirror or runtime release hosts the installer. The downloader verifies all 1,576,544 bytes against SHA-256 `c47763631d20120057766f2f71f781bf958e22712da4ac933b21db0d615dc93c`; the driver action verifies the file again. First-time driver installation opens the official interactive installer after explicit consent and Windows UAC.

Mount operations use the publisher's batchmnt installed in the WinCDEmu program folder. MeguLit checks standard Program Files locations, the WinCDEmu uninstall registration for custom installations and older private runtime directories. Only x86/x64 utility bytes matching the official 4.1 release are accepted. A driver-ready installation can mount without fetching the installer again. Removing the optional download removes its application-local files; the system driver can be managed through Windows.

The earlier `build.py` and locally repacked ZIP were private test fixtures pending review of the installer stub's source. They are not used by the public download flow.

## Separate driver families and commands

Official source references below are to the fixed v4.1 tag

- Standard command: installed `batchmnt.exe` (x86) or `batchmnt64.exe` (x64), PE manifest asInvoker
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
