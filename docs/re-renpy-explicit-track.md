# Explicit Ren'Py translation-track primitive

`services/original-engines/renpy-track.cjs` is an unregistered offline module. It does not change scenes, probe, import, source-language selection, seeds or the running game. It does not establish support for issue 744

`parseLoose({language, sources: [{name, buffer}], limits})` accepts only caller-supplied Buffers, decoded as strict UTF-8. `name` is provenance, never a path to read. There is no filesystem discovery, Python execution, network access, ChineseScore, or inference from directory names. Every input Translate header must match the explicit language exactly; `None` is not a translated track

The supported subset is `translate Language identifier:` with four-space-indented literal double-quoted Say statements, optionally prefixed by a simple speaker identifier (including dotted identifiers). A group retains its identifier, declared statement order, speaker fields, source name and header line. Literal quote/backslash and n/r/t escapes are supported. Expressions, attributes, transitions, nested flow, alternate syntax, unknown escapes and ambiguous grammar reject the entire call

`translate Language strings:`, `python:` and `style name:` are recorded as excluded blocks. Their contents are not executed or promoted to Say text. UI-only inputs produce no body groups; pairing rejects them. Unknown top-level declarations reject rather than silently becoming source metadata. The module does not evaluate or select config.default_language

`pairTrack({language, canonical, track, limits})` accepts canonical scenes shaped as `{name, groups: [{id, says: [{who, text}]}]}`. Canonical IDs must already come from a trustworthy original-script parser; this primitive cannot authenticate invented IDs or infer them from English text. Speakers use explicit `null` for narration

Every translated ID must match exactly one canonical group, all canonical groups must be covered, and no extra or duplicate ID is allowed. Group sizes and speaker positions must match. Output follows canonical scene/group order and each translation group's declared Say order. Repeated English text is never used as an identity. Partial coverage fails rather than padding or borrowing another occurrence

This verifies structural correspondence, not translation meaning or language quality. Reordered meanings spoken by the same speaker cannot be detected from these structural fields. No native/compositor or in-game display observation is provided

Hard budgets are 64 supplied sources, 1 MiB per buffer, 4 MiB aggregate input, 40,000 physical lines per buffer, 100,000 aggregate physical lines, 16 KiB per physical line/text, 256 bytes per ASCII speaker token, 10,000 blocks, 40,000 Say statements, 64 Says per group, and 4 MiB aggregate body text plus speaker tokens. Pairing independently budgets both canonical and translated groups/Says/text together. Caller overrides may lower these limits, never raise them. Excluded blocks still consume byte/line/block budgets

Both parsing and direct pairing enforce the speaker cap and aggregate accounting. Every Say array must have an own element at every index; holes or prototype-supplied elements reject with RENPY_TRACK_SPARSE_SAYS before mapping. No sparse array can be accepted as an empty group member or escape as an incidental TypeError

Failures throw fixed `RENPY_TRACK_*` codes, with source/line provenance where available and no dialogue text in the error. Parsing and pairing return no partial result on failure

Compiled .rpyc and .rpa are not supported by this module. Existing renpy-rpyc.translations uses Maps that can collapse duplicate IDs, so it is not reused as evidence of complete groups. A future compiled path must preserve and validate occurrences before using this pairing contract

Any future integration must handle scanRunning's early SCRIPT_NOT_JAPANESE rejection before originalLines adoption, share an explicit verified language-track rule with probe, and include selected track inputs in freshness. Do not route Japanese through the Chinese patchLines API or automatically select a folder named Japanese

Validation: `node --test validation/renpy-track.test.cjs`

Repository test dialogue is synthetic. The real upstream Japanese patch can be checked separately with an explicit local Buffer, reporting counts only; no real game dialogue is embedded in these fixtures
