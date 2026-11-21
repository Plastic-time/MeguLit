# Explicit decoded Ren'Py root validation

`services/original-engines/renpy-compiled-root.cjs` is an unregistered pure-data helper
It does not read a Buffer payload, file, archive or network source, and is not connected to READERS, probe, the wire pipeline or the old VM

`validateRoot(value, {profile, limits})` consumes an inert value already produced by the bounded decoder
The only accepted explicit profile is `renpy-8.4.0.25071206`
The declaration selects a fixed schema, it does not authenticate the compiler or infer a language

The root must be an exact inert tuple of length two, containing a dictionary and an ordered statement list
Metadata requires exactly these three keys

| Key | Accepted subset |
| --- | --- |
| `version` | Number `5003000`, with no coercion |
| `key` | Exact string `unlocked` or a nonempty Buffer of at most 4096 bytes |
| `deferred_parse_errors` | Empty inert `defaultdict` with normalized `factory: 'list'` and genuine Map entries |

The fixed writer creates these keys at `script.py:802–805`, serializes `(data, stmts)` before and after static transforms at 837–845, and writes slots 1 and 2 at 850–852
The source is 37203 bytes, SHA256 `897ec29559b1b1b7ab7249f2efccf43c0bf9ce660728d5ed06b8db4e10cef68b`, matching official commit `8881389241074a3095dfe7b91c8b6bb0df018f02`
Its `script_version` assignment refers to `renpy.script_version`
The matching `renpy/__init__.py:143` declares `script_version: int = 5003000`, source SHA256 `6012e18b2e8b5c4569cce598b9bf9fdbe2aef188bd88c2a9c1d410a7aa1a350d`, Git blob `42facca2b1020582e49c8be4b9983ffff563ae07`

The helper deliberately accepts a narrower subset than the official loader
Extra or missing metadata, a different version, nonempty deferred errors and unsupported container types return fixed unsupported errors
These failures do not establish that a game or its metadata is corrupt
An empty statement list can pass root validation and still provides no narrative content

The bounded decoder normalizes the explicitly permitted `builtins.list` or `__builtin__.list` reduction to the inert string `list`
Callers must explicitly enable that decoder feature themselves, this helper neither invokes a factory nor changes any decoder flag

Statement validation checks a finite dense top-level list, completed instance records, exact simple `renpy.ast` class-name shape, genuine state Maps and the bounded decoder's existing `stateShape` tags
Opaque PyCode records retain their existing separate state kind and tuple-arity tags
No statement state entries, `next`, `after`, child blocks, Python source or PyExpr values are traversed
Unknown shape-valid classes and repeated statement references remain in their original positions, with none skipped or promoted to Say
Structural aliases, cycles, class schemas, group identity, defaults and complete translation coverage remain the future extractor's responsibility

The result contains the original `root`, `data` and `stmts` references plus technical `metadata`
Those original references naturally still contain the key value, the result is not a redacted copy
Technical metadata includes only key kind/byte count, version, statement count, the declared profile and explicit false compiler-identity, AST-semantics and body-coverage claims
It contains no inferred language, group text, completeness rate or duplicated raw key
The input is not modified

Limits are 50000 top-level statement occurrences and 4096 key bytes, including the eight bytes in `unlocked`
Caller overrides may lower positive limits, never raise them
The helper does not copy or rebudget the semantic graph, its input contract requires a value already bounded by the decoder
It does not promise side-effect safety for arbitrary same-process JavaScript objects, proxies or modified builtins
Basic record, array and genuine-Map checks produce fixed `RENPY_COMPILED_ROOT_*` errors without input text, keys or incidental property-access errors for supported inert input shapes

Tests use a neutral bounded-decoder roundtrip and synthetic inert records
They do not establish real RPYC, compiler, SDK, full AST, narrative extraction, original-text hiding, point lookup, translation acknowledgement or health-score/upload acceptance

Validation: `node --test validation/renpy-compiled-root.test.cjs`
