# Disc installation backend checkpoint

This is an incomplete local checkpoint, not release-ready or live-tested
No actual image mounting, driver/UAC/installer/game execution occurred during this implementation
Only syntax/diff checks were run before the user's priority switch; regression fixtures and integration review are pending

## Files and ownership

- core/disc-install.cjs: local-path/image pairing checks, bounded directory snapshots, autorun executable discovery and workflow state machine
- core/disc-runtime.cjs: normal standalone batchmnt adapter and mount-volume ownership verification interface, explicit standard-driver path
- services/disc-install.cjs: persistent manager, direct LEProc installer launch, existing library candidate selection/import callback
- services/bridge.cjs: disc_ dispatch before opening the bridge database; imports delegate to existing save_game

All backend requests require a persistent runtime and return a polled session DTO
Long commands schedule a promise and immediately return busy:true; disc_status polls until busy:false

## Bridge contract

| Action | Inputs / behavior |
| --- | --- |
| disc_prepare | paths array plus installRoots array of existing explicit parent directories; no mount/download/installer side effect |
| disc_status | id |
| disc_mount | id, consent:true; package preparation, driver gate, owned mount, installer discovery |
| disc_driver | id, confirmed:true, mode:'standard'; explicitly chosen interactive standard installer, normal Windows UAC, no silent flags |
| disc_install | id, installer exactly matching returned installer.path; snapshot before direct LEProc launch, no game hook/launch path |
| disc_scan | id, installed:true; explicit user completion, directory difference; optional folder is user-selected manual fallback, never claimed as newly installed |
| disc_import | id, executable exactly matching returned candidate; delegates existing save_game |
| disc_finish | id, keepMounted boolean; false checks owned image/volume identity before unmount, true preserves mount |
| disc_cancel | id; never kills installer; mounted sessions remain awaiting_unmount, otherwise cancelled |

DTO keys: id/state/busy/image/pairedFrom/installRoots/installers/candidates/imported/mounted/mountRoot/mountUnconfirmed/error/warnings/keepMounted/driver
installers: {path,name,args,source}; args intentionally empty to avoid media-supplied silent switches
candidates: {executable,title,dir,engine,manualSelection}; imported also includes id
All locations are local to the app UI, not uploaded

States: need_install_roots, ready_to_mount, preparing_tools, awaiting_driver, installing_driver, mounting, finding_installer, ready_to_install, preparing_install, installing, scanning, choose_game, importing, awaiting_unmount, unmounting, done, cancelled, error
done.keepMounted=true is retained media, not a successful unmount

## Pending before merge/use

1. Write meaningful pure filesystem/state/adapter fake tests, then test actual bridge/import coupling
2. Confirm runtime-pack contract/name and exact official WinCDEmu-4.1.exe, batchmnt.exe and batchmnt64.exe files with pack owner
3. Validate exact standard-driver service name/state and locale-neutral sc output contract; current implementation queries BazisVirtualCDBus and requires RUNNING
4. Root must validate real standalone CLI and mountvol volume identity on a small ISO; no runtime acceptance is claimed
5. Current provider never falls back to administrator-only portable CLI or alters ACL/manifest/security policy
6. Standard driver install is an explicit user choice, not implicit replacement of the preferred portable edition; UI must explain the interactive standard installer/UAC and possible association options
7. Existing Japanese-import direct/archive disc paths still need handoff instead of core/disc-image.cjs toIso; no changes to that older path were made in this checkpoint
8. Implement/select image backing-file identity checks across preview/download/mount, and review snapshot completeness/reparse/autorun fallback behavior and all session retry/cancel/error paths
9. Review uncertain-mount handling: retain a possible mount after failure, never unmount a device whose owned volume identity cannot be confirmed
10. No UI/driver/installer/game/COM or full build was run, and no feature push should occur until these gates close

## Primary constraints already established

Official source in the private night-disc-pack evidence shows:

- PortableWinCDEmu 4.0 requires administrator and opens its own console; it is not the ordinary hidden batchmnt backend
- standalone batchmnt mount args are [image, '/wait:10000']; never provide a drive letter, /unmountall or an infinite bare /wait
- /check returns ASCII A..Z for a mounted image, but zero can also mean a failed device-list IOCTL
- /unmount exit0 alone is not confirmation; require disappearance of the exact owned volume GUID as well
- regular-driver absence returns early in VirtualCDClient, so tryBothDrivers=true does not prove portable-only fallback
- current adapter snapshots existing mountvol mappings, requires a new GUID/drive for ownership, verifies image plus GUID before unmount, and refuses already-mounted images

No original image conversion is part of the new backend
This checkpoint is intentionally not pushed to main
