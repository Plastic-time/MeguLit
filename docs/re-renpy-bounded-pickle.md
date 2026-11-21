# Explicit bounded pickle data primitive

`original-engines/renpy-pickle-bounded.cjs` is unregistered and does not replace the existing RPYC reader. It accepts an already decompressed Buffer, never a path. It neither imports Python modules nor invokes constructors, reductions, state methods, persistent IDs or extension handlers

`decode(buffer, {limits, classes})` returns `{value, protocol, counts, bytesRead}`. The default class allowlist contains only `renpy.ast.Say`, `Translate` and `TranslateSay`; a caller can explicitly supply up to 64 inert `renpy.ast` class identities. This is an identity allowlist, not proof that an AST class is supported by a narrative extractor

Supported data uses protocol 2–5 binary operands, strict UTF-8 unicode, opaque byte strings, finite safe integers/floats, booleans/None, tuples, lists, dictionaries, memo references, allowlisted globals, empty-argument NEWOBJ, and dictionary/slot BUILD state. Protocol 4 frames cannot split an operand. Framed and unframed sections may coexist as permitted by pickle framing; STOP must consume the entire input. Protocol-specific operands reject under an earlier declared protocol

Tuples and lists become `{kind, items}` records, dictionaries become `{kind:'dict', entries:Map}`. Python objects become `{kind:'instance', className, state:Map}`; writable state cannot replace their identity or prototype. Dictionary and merged slot-state duplicates reject. Memo aliases and cycles remain inert graph references: consumers must not recursively serialize or traverse them without their own edge/depth and semantic-cycle policy

Every cursor read checks remaining input and frame boundaries. Required line terminators must exist. Opcode, stack, memo, created-node, stored-edge, aggregate-string/byte and per-item budgets are finite. Overrides can only lower the exported defaults. Missing stack/MARK/memo operands and unsupported opcodes throw fixed `RENPY_PICKLE_*` codes with byte offsets, without including source dialogue

The limits account for logical data and operations, including memo-recall pushes, container edges and merged state edges. They do not claim an operating-system RSS limit or exact JavaScript object overhead. There is no decompression in this module. A future framing caller must independently cap compressed and decompressed input before calling it

Reductions (including copy-reg reconstructors), protocol-0 text operands, sets, arbitrary Python globals, out-of-band buffers and unknown opcode forms are intentionally unsupported. Actual Ren'Py compiler compatibility has not been established. Synthetic byte fixtures and ordinary CPython pickling are useful controls, but neither proves a specific Ren'Py SDK can be read

No AST traversal, language selection, canonical-ID calculation, translation pairing, RPA discovery, scene registration or game modification is provided here. Those steps require a separately validated schema and real compiler-produced oracle. This primitive must not be used to turn a partial graph into a claimed complete narrative

Validation: `node --test validation/renpy-pickle-bounded.test.cjs`
