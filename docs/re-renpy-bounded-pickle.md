# Explicit bounded pickle data primitive

`original-engines/renpy-pickle-bounded.cjs` is unregistered and does not replace the existing RPYC reader. It accepts an already decompressed Buffer, never a path. It neither imports Python modules nor invokes constructors, reduction callables, state methods, persistent IDs or extension handlers

`decode(buffer, {limits, classes, allowDefaultDict:false, allowPyCodeState:false, allowPyExpr:false, allowRevertableDict:false})` returns `{value, protocol, counts, bytesRead}`. The default class allowlist contains only `renpy.ast.Say`, `Translate` and `TranslateSay`; a caller can explicitly supply up to 64 inert `renpy.ast` class identities. This is an identity allowlist, not proof that an AST class is supported by a narrative extractor

By default both GLOBAL and STACK_GLOBAL require the exact module token `renpy.ast` and a simple class-name token. Qualified names through a parent module are conservatively rejected; concatenated spelling alone is not an identity proof. Unicode data retains a leading U+FEFF literally, rather than treating each string as a file with a removable BOM

Supported data uses protocol 2–5 binary operands, strict UTF-8 unicode, opaque byte strings, finite safe integers/floats, booleans/None, tuples, lists, dictionaries, memo references, allowlisted globals, empty-argument NEWOBJ, and dictionary/slot BUILD state. Protocol 4 frames cannot split an operand. Framed and unframed sections may coexist as permitted by pickle framing; STOP must consume the entire input. Protocol-specific operands reject under an earlier declared protocol

Tuples and lists become `{kind, items}` records, dictionaries become `{kind:'dict', entries:Map}`. Python objects become `{kind:'instance', className, state:Map}`; writable state cannot replace their identity or prototype. Dictionary and merged slot-state duplicates reject. Memo aliases and cycles remain inert graph references: consumers must not recursively serialize or traverse them without their own edge/depth and semantic-cycle policy

Every cursor read checks remaining input and frame boundaries. Required line terminators must exist. Opcode, stack, memo, created-node, stored-edge, aggregate-string/byte and per-item budgets are finite. Overrides can only lower the exported defaults. Missing stack/MARK/memo operands and unsupported opcodes throw fixed `RENPY_PICKLE_*` codes with byte offsets, without including source dialogue

The limits account for logical data and operations, including memo-recall pushes, container edges and merged state edges. They do not claim an operating-system RSS limit or exact JavaScript object overhead. There is no decompression in this module. A future framing caller must independently cap compressed and decompressed input before calling it

Reductions are unsupported by default. The explicit boolean `allowDefaultDict:true` adds only the exact globals `collections/defaultdict`, `builtins/list` and `__builtin__/list` as frozen inert metadata. It permits REDUCE only with the exact defaultdict identity and a tuple containing zero arguments, one None, or one of those exact list globals. The output is `{kind:'defaultdict', factory:null|'list', entries:Map}`. No Python callable or factory runs, no prototype gains a default handler, and reading a missing Map key never inserts a value

SETITEM and SETITEMS accept this explicit record with the same supported key types, duplicate-key rejection and two stored edges per entry as ordinary dictionaries. The fixed factory tag is metadata, like a record's kind or instance className, rather than an additional graph reference. Tuple argument edges and all pushes, strings, memo entries and operations still consume their existing budgets. Cycles remain inert references and require the same consumer traversal policy

The option must be a boolean; invalid values throw RENPY_PICKLE_DEFAULTDICT_OPTION. Other globals still throw GLOBAL. A different callable or non-tuple REDUCE arguments throw REDUCE; excess arguments throw REDUCE_ARGS and an unsupported factory throws REDUCE_FACTORY. These codes retain the normal RENPY_PICKLE_ prefix and offsets. Empty-argument NEWOBJ remains restricted to the explicit `renpy.ast` class allowlist, so the newly admitted defaultdict/list metadata cannot become instances. BUILD state rules are unchanged

Outside the explicit defaultdict and PyExpr subsets, reductions (including copy-reg reconstructors), protocol-0 text operands, sets, arbitrary Python globals, out-of-band buffers and unknown opcode forms remain unsupported. Actual Ren'Py compiler compatibility has not been established. Synthetic byte fixtures and ordinary CPython pickling are useful controls, but neither proves a specific Ren'Py SDK can be read

No AST traversal, language selection, canonical-ID calculation, translation pairing, RPA discovery, scene registration or game modification is provided here. Those steps require a separately validated schema and real compiler-produced oracle. This primitive must not be used to turn a partial graph into a claimed complete narrative

Validation: `node --test validation/renpy-pickle-bounded.test.cjs`

The small committed CPython fixtures have an adjacent optional producer using only standard-library pickle and neutral synthetic classes. Tests consume the fixed bytes without requiring Python. The recorded Python version and opcode sets describe these controls; they do not pin or emulate a Ren'Py compiler release

`validation/fixtures/renpy-defaultdict-cpython.json` adds six fixed controls from ordinary CPython `collections.defaultdict(None|list)` pickling under protocols 2, 4 and 5, using only neutral alpha/empty keys and integer lists. The same optional producer accepts `--defaultdict` to generate them. No real game bytes or source dialogue are committed. These controls validate the narrow inert container representation, not a game's complete graph or narrative

## Explicit opaque PyCode state

`allowPyCodeState:true` is a separate strict-boolean option, off by default. It does not add a class identity: `classes` must also explicitly contain `renpy.ast.PyCode`. BUILD for that exact identity then accepts only a tuple of four through seven fields, with tag exactly 1. Other classes retain their existing dictionary/slot rules. With the option off, a PyCode BUILD rejects with PYCODE_STATE_DISABLED; the class cannot receive generic state as a workaround

The observed bundled `ast.py` is SHA256 `319ef8a18b3b0ce426240c738405dc90d52d89861e3694c6ef04a2227271aefc`, 85,626 bytes. Its own PyCode getstate at lines 89–90 writes tag/source/location/mode/py/hashcode/col_offset. Setstate at lines 92–126 accepts four through seven fields and supplies py=2, hashcode=None and col_offset=0 when absent. Its tag pattern is a wildcard, while this reader intentionally supports only the observed writer tag 1. This evidence belongs to PyCode's own methods and does not authenticate a supplied file's compiler version

The supported subset requires a string source, an exact two-element location tuple of string filename and nonnegative safe-integer line number, and mode `exec`, `eval`, `single` or `hide`. The last mode is directly observed at `ast.py:1170`; accepting its tag does not execute hidden Python. Py is only 2 or 3; hashcode is only None or a safe unsigned 32-bit integer; col_offset is a nonnegative safe integer. These type and value restrictions are a conservative reader contract, not a claim that the permissive original method enforces them. With `allowPyExpr:true`, source may additionally be the exact inert wrapper described below; it remains a wrapper reference, never an implicit string or Say. Other non-string source forms reject, including an ordinary `renpy.ast.PyExpr` instance

The instance retains its exact class identity, adds `stateKind:'pycode-opaque'`, and stores a Map with writerTag, source, filename, linenumber, mode, py, hashcode and col_offset. Source and filename are opaque data, never filesystem paths or Say text. No Python setstate, compilation, hash32 calculation, PyExpr import, bytecode generation or all_pycode append occurs. A missing hash stays null instead of imitating the engine's hash calculation. Repeat BUILD still rejects

The new stored eight-entry Map consumes one additional logical node and sixteen stored edges. Input tuple edges, stack/mark pushes, unicode bytes and other existing work still consume their normal budgets. Fixed field-name strings and the stateKind tag are bounded metadata, not input-string bytes; this is not a claim of exact heap/RSS accounting. Errors are fixed RENPY_PICKLE_PYCODE_* codes with offsets and no source contents

`validation/fixtures/renpy-pycode-cpython.json` contains twelve ordinary CPython controls: protocols 2/4/5 crossed with four through seven tuple fields from a neutral fake class's __getstate__. The optional producer accepts `--pycode`. These bytes are synthetic, contain no real game source, and do not prove Ren'Py compiler, cslots, AST layout or narrative compatibility. No scene extraction or automatic registration is added

## Explicit opaque PyExpr reduction

The independent strict boolean `allowPyExpr:true` permits only the exact GLOBAL or STACK_GLOBAL tokens `renpy.astsupport` / `PyExpr`, and REDUCE with a tuple of three through six arguments. It neither changes `CLASSES` nor permits this metadata through NEWOBJ, BUILD, list mutation or dictionary mutation. Other callables and reductions still reject; `allowDefaultDict` remains independent

The primary contract is fixed official `renpy/astsupport.pyx` at commit `8881389241074a3095dfe7b91c8b6bb0df018f02`, 5,555 bytes, SHA256 `14209f465f863ca37600169af226d8de2e919e85f2b20a77f9e18ae147b11597`, Git blob `0b229290a66b8c754a6f636cd519bde806e610e9`. Lines 69–81 define a str subclass and its own six-argument reduction; lines 113–164 support three through six constructor arguments with defaults py=2, hashcode=None and column=0. The source alone does not establish `__module__`. The chosen identity separately matches previously observed payload token hashes: module length16/SHA256 `6ba512e103142e1afc6c51ae68cc7b52b9d89f851fce32427c899f00496d772b`, name length6/SHA256 `f6c225bfca9296aec26b2f8b7f7c2fb484be02226691647b0db6e63fabf34b03`. This is a limited observed identity, not authentication of a compiler or all historical aliases

The inert result is `{kind:'pyexpr', className:'renpy.astsupport.PyExpr', text, filename, linenumber, py, hashcode, column}`. Text and filename must be strings; linenumber is a safe uint32, py is exactly 2 or 3, hashcode is None or a safe uint32, and column is a safe uint16. These checks intentionally do not reproduce arbitrary Cython coercion. Missing hash stays null, even when a PyCode state refers to the wrapper; neither layer derives hash32 or copies a hash from the other

The wrapper is an ordinary record, not a String subclass or callable. There is no `str()`/constructor/tp_new invocation, Python import, global all_pyexpr mutation, compilation or expression evaluation. Source, filenames and expression conditions stay opaque data; they are never paths to read, dialogue, choice translations or permission to scan string literals for narrative text

Its one new record is counted by the normal push/node budget, with twelve stored edges for six data fields. The argument tuple retains its three through six edges and all input strings, pushes, memo references and operations retain their existing budgets. Fixed kind/className/field-name metadata does not add input-string bytes. Memo aliases preserve the wrapper's identity. Invalid options, argument shape and fields throw fixed `RENPY_PICKLE_PYEXPR_*` errors with offsets, never source text

`validation/fixtures/renpy-pyexpr-cpython.json` holds twelve ordinary CPython controls from a neutral fake str subclass whose `__reduce__` returns this exact identity and three through six arguments, under protocols 2/4/5. The optional producer accepts `--pyexpr`. It does not import a game or SDK, run a reduction while decoding, or establish actual compiler compatibility

The official fixed `cslots.pyx` source has now also been obtained: 14,917 bytes, SHA256 `ba401f82f1de176c1a34e86afe5f61eb87f151a4c0b762519b3a9374f6e9b9ba`, Git blob `646e07fdc7a3ead45a28cf032a303c783838ed0c`. The old source-availability gap is closed; the decoder still does not restore profile-specific descriptor defaults, interpret Node properties/children, select languages or provide an ordered AST/narrative extractor. Acquiring the source does not make those unimplemented semantics complete

## BUILD wire provenance

A completed instance BUILD also records `stateShape` outside writable state. Generic shapes are `dict`, `none`, and the four `tuple:none,none`, `tuple:none,dict`, `tuple:dict,none`, `tuple:dict,dict` combinations. An unbuilt instance has no shape. The already accepted top-level None state remains an empty Map tagged `none`; it is not relabeled as a dictionary or claimed to be emitted by a particular writer

Opaque PyCode records `pycode:tuple4` through `pycode:tuple7`. These fixed tags retain the consumed BUILD container and part kinds without preserving another copy of the graph. They are bounded metadata, like className/stateKind, and do not change the logical input-node, stored-edge or input-string-byte counts

Equal merged Maps can now be distinguished before applying a profile-specific rule such as requiring the verified cslots writer's `(None, slots_dict)` form. State entries named stateShape cannot overwrite this metadata. The tags do not authenticate the writer, restore descriptor defaults, identify which dictionary supplied each merged key, or prove semantic AST compatibility

## Explicit inert RevertableDict

The independent strict boolean `allowRevertableDict:true` admits only the exact GLOBAL or STACK_GLOBAL tokens `renpy.revertable` / `RevertableDict`. It is off by default, does not change `CLASSES`, and does not grant List, Set, DefaultDict, parent-module qualified names or aliases. Other feature flags do not grant this identity

The fixed primary source is bundled `revertable.py`, 17,349 bytes, SHA256 `aaf21f22649db2d999fcba865a62f4950eb1a8a16e6b7d03b0cf3af49738e426`, Git blob `4991d6f6354d9b090ca952d96fbc61f36c784cea`, matching official commit `8881389241074a3095dfe7b91c8b6bb0df018f02`. Lines 250–308 define a dict subclass with rollback-aware initialization and mutations, but no own pickle/state methods. The chosen identity separately matches the already observed module length16/SHA256 `34e77e74c474247995dfee948fd8931d58ac0da65129cbd7a978edda8accabec` and name length14/SHA256 `8bc67c639db187b0dc44f95d12d62806416dea50c7af1033f0d32fc3545b1199`. Neither source nor token identity authenticates a compiler

Only empty-tuple NEWOBJ creates `{kind:'revertable-dict', className:'renpy.revertable.RevertableDict', entries:Map, state:null}`. No dict subclass, Python constructor, mutation wrapper, weakref, rollback log, copyreg reconstructor or module import runs. This flag does not enable REDUCE, NEWOBJ_EX or another class's constructor path. The wrapper is a dictionary data record, not a narrative AST node or an allowed opaque PyCode source

SETITEM and SETITEMS use the same finite key subset, duplicate-key rejection and two stored edges per entry as the existing inert dictionaries. Missing keys do not insert values. Memo aliases and cycles remain graph references, requiring a separate bounded traversal policy from consumers

Optional BUILD accepts only one ordinary inert dictionary of string-key instance attributes. Attributes are copied into a separate Map, never applied to wrapper fields or prototypes; arbitrary names such as `_clean`, `kind`, `entries`, `state`, `stateShape` and `__proto__` have no behavior. No attribute-name guess restricts the data to an engine callback. Repeat BUILD, None, tuple/slot state, numeric attribute keys and other state shapes reject. This is a deliberate subset, not a claim those shapes are impossible under every Python producer

Without BUILD, state remains null and stateShape is absent. With accepted attributes, state becomes the copied Map and the existing fixed provenance tag is `stateShape:'dict'`. Other classes retain their prior BUILD, PyCode and stateShape rules

The wrapper's normal push charges one node, and its entries Map charges one additional node before allocation. Its entries and state data fields charge two stored edges in total; later BUILD replaces the already charged null state reference and charges one new attributes Map node. Each entry in the incoming attribute dictionary and copied state Map retains its own two-edge cost. Constant kind/className/field-name metadata adds no input-string bytes. All operand strings, tuples, memo recalls, operations and input bytes retain existing limits

`validation/fixtures/renpy-revertable-dict-cpython.json` contains twelve controls: protocols 2/4/5 crossed with empty, entries, instance attributes and memo-cycle shapes. Their producer uses an ordinary neutral dict subclass in a synthetic module, only `pickle.dumps` and `pickletools`; it does not import or construct the engine class, call pickle.loads or read game bytes. These controls establish the NEWOBJ/SETITEM(S)/dict-BUILD subset for that serializer, not RenPy compiler compatibility or complete AST support. The adjacent optional producer accepts `--revertable-dict`

Validation: `node --test validation/renpy-revertable-dict.test.cjs`
