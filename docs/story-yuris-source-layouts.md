# YU-RIS script source metadata

The source table can have either a 16-byte or 20-byte record trailer. The previous discovery reader accepted only 20 bytes, so the local Josou YU-RIS 0x1c2 table stopped at its second record and returned no source names

Research before this correction: CodeSpoof/extYuRis, commit 68d29ae4520868abc386b83afd8d50f40eea53bf, YstlDef.go, describes the newer 20-byte fields. Its repository declares no license, so no implementation is copied. The older 16-byte layout is also documented in the original investigation at https://github.com/regomne/chinesize/issues/21 and directly confirmed by all 116 local records consuming exactly 7,589 bytes

The independent reader tries only these two finite layouts, requires a unique complete parse, validates lengths and unique IDs, and returns only source basenames. Unknown, truncated or ambiguous layouts stay unknown. It does not run scripts or read/write player progress. The synthetic fixtures contain no game data

This fixes source naming only. It does not prove a branch transition, ending flag or CG-to-scene relationship
