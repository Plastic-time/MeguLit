# Library scans preserve current configuration

The scan's normalized Library state contains only scan and setup fields. Writing that state over library.json discarded privacy, NSFW, harvesting, cold-test and future settings. In the isolated owner installation, the missing sharing=false fields made Owner correctly reject authorization with SHARING

Library.read and load retain their existing normalized public shape. Library.write now reads the latest JSON object from the same file and merges only fields managed by Library. Unknown keys and settings outside that normalized state remain unchanged. A malformed file, null, array or other non-object JSON value causes write to return false without replacing the file. A missing first-run file can still be created

Scan results own games, scanVersion and notGal. Shared setup/preferences are compared with this instance's saved baseline, so an unchanged cached preference cannot overwrite a newer Settings.save value. After a successful write the instance refreshes these shared fields and its small preference baseline. The baseline does not serialize the game list or notGal map

Library.settings explicitly marks steamPath, folders and setupDone as intentional edits. This lets a user select a value equal to an older snapshot after another settings writer changed the file. No other preference becomes an explicit edit. Scan and settings file operations are synchronous within the existing application process; this patch does not add a cross-process transaction or change scan-result ownership

Owner privacy checks are unchanged. Preserving sharing=false allows the isolated root to remain eligible. Preserving an actual sharing=true leaves that root ineligible. This fix cannot reconstruct flags already lost by an older version; the private installation owner must restore the intended configuration separately

The regression suite uses real files, Library.scan/write, Settings.save and actual Owner.status/inspect. It verifies two scan/write rounds, changes during scan completion, later stale-instance writes, unknown fields, explicit edit intent, invalid JSON preservation, first-run creation and strict rejection of sharing=true. No app, game, native helper, GUI or network operation is used
