# Import a single Japanese Nitroplus archive

The two failure reports came through **Import from Japanese release**. A direct `nss.npa` had no accepted type. Putting the same file in a ZIP then sent the selection through the unpack-and-match-full-directory path, which needs evidence from multiple files

## Supported input

Select an unencrypted N2System `NPA\x01` archive containing readable `.nss` scripts, or a ZIP containing that one file. The same dialog can search the game folder and up to two levels below it, checking at most 1,500 directory entries and eight candidates. Discovery opens a preview when it finds one distinct verified replacement. Multiple verified replacements require a manual choice

The selected EXE must reference the archive by name. The importer binds the confirmation to hashes of that EXE, the installed archive and the chosen Japanese archive. It compares member names, exact non-script members, script commands, message labels, speaker controls and dialogue structure. Matching code must contain game-specific asset references. It checks the presence of Japanese dialogue and records the corresponding Chinese dialogue from the installed archive

The preview lists one replacement and counts Japanese, paired and unpaired rows. Encrypted input, unsupported layouts, missing evidence or a different script structure get specific errors. A ZIP that also contains other files must be extracted separately for a full-folder import

## Transaction and verification

The original archive and Chinese pair index are verified and stored beside the journal before the authorized archive is swapped. The importer reads back the installed file. Undo checks both the current archive and its backup by SHA-256. A failed rollback leaves the journal available and disables the local provider if the archive, selected EXE or pair index falls out of sync

The Reader loads the verified pair index for that EXE. Its per-game pairing takes effect even with the global local-pairs setting off and respects the English target setting. The fixture passed the original NPA reader, the production import bridge and the actual Reader hook translation. Tests exercised both input forms, local discovery, ambiguity, missing preview confirmation, byte-for-byte undo, a failed readback and a game file changed by an external update. No installed commercial Nitroplus game was executed in this check

## Language status

On the installed `manosaba_game`, the old quick path returned `already` while the Steam manifest reported `english`. A local setting indicated Japanese, and the file scan separately found Japanese source text and Chinese localization in Naninovel scripts. The new quick result is `language-setting`, which says the setting indicates Japanese and the displayed dialogue is pending launch verification. When a Unity locale key has no verified Japanese value or usable switch, the quick result is `language-unverified`

Saved script indexes and history cannot promote the quick result into a claim about the selected launcher. The import dialog reports disk verification separately from observed game dialogue. The reported screenshot did not identify a title, and this installation is an independent reproduction of the status ambiguity
