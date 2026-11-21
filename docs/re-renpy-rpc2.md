# Explicit RPC2 framing primitive

`services/original-engines/renpy-rpc2.cjs` is unregistered and Buffer-only. It does not read files, scan folders, select languages, decode pickle/AST, read RPA, accept legacy whole-file zlib, or change existing readers. It does not establish support for issue 744

Call `readSlot({buffer, profile, slot: 2, source, limits})`. The default slot is 2; selecting slot 1 requires an explicit request. Missing slot 2 throws RENPY_RPC2_UNSUPPORTED_SLOT2 and never falls back to slot 1. Slot existence is not canonical-ID or AST evidence

Supported declared little-endian writer profiles are:

- `renpy-6.99.12.4.2187`, official commit `e60f170f7f5c152b4f656b5fe94ccc7ed4b2c3d2`, [script.py](https://github.com/renpy/renpy/blob/e60f170f7f5c152b4f656b5fe94ccc7ed4b2c3d2/renpy/script.py#L459)
- `renpy-8.4.0.25071206`, official commit `8881389241074a3095dfe7b91c8b6bb0df018f02`, [script.py](https://github.com/renpy/renpy/blob/8881389241074a3095dfe7b91c8b6bb0df018f02/renpy/script.py#L693)
- `renpy-8.5.3.26051504`, official commit `39895c1e017f0b36ffea2447d97eccd69d76ee1c`, [script.py](https://github.com/renpy/renpy/blob/39895c1e017f0b36ffea2447d97eccd69d76ee1c/renpy/script.py#L752)

These describe framing, not the user's SDK identity. The writers reserve three 12-byte directory records after the ten-byte magic. This primitive requires the whole 46-byte header, positional slot-1/slot-2 records, unique supported slots, a zero terminator and zero remaining reservation, positive packed lengths, ranges outside the complete directory, no overlap/gaps, contiguous payloads, and exactly a separate 16-byte source-digest trailer. Other layouts are rejected rather than guessed

The 8.4 profile is caller-declared, with the same framing checks and limits. A bundled runtime's version string does not select it, prove which compiler produced a supplied file, or establish AST compatibility. The official 8.4 annotated tag resolves through `5af2b9fb4e537c6ba5855292ef10d6caf53abf7c` to the pinned commit above; the fetched `script.py` is 37,203 bytes with SHA256 `897ec29559b1b1b7ab7249f2efccf43c0bf9ce660728d5ed06b8db4e10cef68b`

The retained 8.4 excerpts cover `write_rpyc_header`, `write_rpyc_data`, `read_rpyc_data` and `load_appropriate_file`. They show the reserved directory, slot positioning, compression and external digest reading. They do not retain the top-level magic literal or the digest-append statement, so those two source lines are not separately asserted as reviewed 8.4 evidence. The ten-byte magic is directly observed in the bounded local file; the earlier fixed 6.x/8.5 sources establish the same magic and directory layout. This remains a declared framing profile, not compiler or full-story certification

The trailer is returned as unverified metadata. The older writer hashes source text; the newer one also includes its RPYC magic. This module has neither the source nor that verification context and does not authenticate the digest, game, selected profile, payload meaning or provenance claimed by the caller. SHA256 fields identify the actual supplied input and each packed/expanded slot

Every declared slot is separately inflated with Node zlib maxOutputLength and info.engine.bytesWritten. All streams must consume exactly their declared packed bytes; truncated streams, junk and concatenated streams reject. No slots are concatenated. Even an unselected malformed/over-budget slot rejects the whole call. Errors return no partial result

Return fields include the selected expanded `buffer`, `slot`, declared `profile`, caller's logical `source`, writer commit, input hash, each slot's offsets/lengths/hashes, byte accounting, and the unverified trailer. No pickle fields or canonical claims are added

Hard limits: 4 MiB input, 36 directory bytes, 2 MiB packed bytes per slot, 4 MiB expanded bytes per slot, 8 MiB expanded bytes across all declared slots. Overrides may only lower them. `source` is at most 512 code units and is never used as a path. Unknown profiles, formats, slots and limits throw fixed RENPY_RPC2_* codes

Empty expanded zlib streams are framing-valid, without implying AST support. If an earlier slot exhausts the aggregate budget, remaining slots are conservatively rejected before inflation, even if a later stream might expand to zero; Node does not accept a zero maxOutputLength. Callers needing to validate another slot must leave budget headroom

Accounting covers supplied input length, fixed directory bytes and logical expanded bytes across every inflated slot. It does not count all V8 objects, digest implementation memory, zlib's native working state or temporary output chunks, and is not a whole-process RSS limit. Input subarrays are views, not packed-data copies; the selected output is returned directly. No output from other slots is exposed. Hashing reads bounded bytes without concatenating payloads

Official old and new writers put pre-transform AST in slot 1 and post-transform AST in slot 2; their loaders prefer 2 then 1. This primitive deliberately provides no semantic fallback and does not certify that a slot-2 pickle actually contains identifiers

Tests use synthetic headers and real zlib streams, not compiler-produced RPYC. They cover independent slots/provenance, missing slot 2, unverified digest, truncated/duplicate/misplaced directory entries, range overlap/gaps, packed truncation/junk/concatenated streams, unselected-slot validation, all byte budgets and the exact expansion-cap positive boundary

Validation: `node --test validation/renpy-rpc2.test.cjs`
