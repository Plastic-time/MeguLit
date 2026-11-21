# Explicit single-node state normalization

`services/original-engines/renpy-node-state.cjs` is an unregistered pure-data helper
It neither reads a file/Buffer payload nor imports Ren'Py, and is not connected to a reader, wire pipeline or the old VM

`normalizeNode(node, {profile, limits})` accepts one completed inert bounded-decoder instance under the explicit profile `renpy-8.4.0.25071206`
Only exact Node, Say, Label, Translate, TranslateSay and EndTranslate identities are supported
The wire tag must be `tuple:none,dict`, and state must be a genuine Map
Other compatible decoder state shapes are outside this writer subset
The profile and wire tag declare the schema to apply, they do not authenticate the producer/compiler

The result is `{node, state, fields, provenance, metadata}`
`node` and `state` are original references, `fields` is a new derived Map, and `provenance` is a new Map with one record per derived field
No input record or state entry is modified
Returned references can contain raw text and cycles, this is not a redacted copy

Each provenance record has these fixed keys

```text
{present, origin: 'wire' | 'slot-default', declaredBy,
 sourceFile: 'renpy/ast.py' | 'renpy/cslots.pyx', sourceLine, descriptor}
```

Special line fields always have wire provenance
Ordinary fields missing from state use only the fixed descriptor default, with presence retained separately from explicit null/false
Source lines identify the declaration and descriptor, the common default rule comes from fixed `cslots.pyx:314–343,419–457`
No constructor, setter, property, equality/hash method, `get_children`, `chain` or translation lookup runs

## Fixed fields

| Class | Ordinary fields, including inherited fields |
| --- | --- |
| Node | filename, _name, name_version, name_serial, next |
| Say | Node fields plus who, who_fast, what, with_, interact, attributes, arguments, temporary_attributes, rollback, identifier, explicit_identifier |
| Label | Node fields plus block, parameters, hide |
| Translate | Node fields plus identifier, alternate, language, block, after |
| TranslateSay | Say fields plus alternate, language |
| EndTranslate | Node fields only |

All six require explicit `linenumber` as uint32 and `col_offset` as uint16, including legitimate zero
Neither missing field is synthesized
`name_version` and `name_serial` have descriptor default zero and accept uint32 values
Numeric checks require integer-valued JavaScript Numbers within bounds, without string/bool coercion or negative zero
They do not recover the pickle opcode's original numeric type

Other ordinary descriptor defaults are null except `interact=true`, `explicit_identifier=false`, `hide=false` and Say-family `rollback='normal'`
`who_fast` has descriptor default null, not false
Explicit false and nullable-field null remain distinct from omission through provenance
Bool-only fields reject null as an unsupported value instead of replacing it with a default

Rollback accepts `normal`, `never` and `force` only for Say and TranslateSay
It is a ClassVar or unannotated class constant on the other supported classes, so serialized rollback there rejects
Unknown fields and computed properties such as `name`, `statement_start`, TranslateSay `block/after`, ClassVar fields and `__version__` reject
No computed name or group identifier is invented

## Conservative values and shallow references

Filename, what, identifier and language accept null or bounded strings
Empty what and identifier are preserved as node data, not silently removed
A group extractor must separately enforce its nonempty-text/ID subset
Language null is default source metadata, never a Japanese-language assertion

Who accepts null or bounded simple ASCII speaker tokens with optional dotted identifiers, retaining who_fast separately
This is a conservative subset of expression-capable engine data, not a resolved speaker name
With_, attributes, temporary_attributes, arguments, parameters and alternate currently accept null only
Non-null values fail explicitly without evaluation or silent replacement

`_name` accepts null, bounded string, or an exact inert three-item tuple containing string, uint32, uint32
The tuple reference and backing version/serial fields stay unchanged
This does not implement the full official `tuple[Any, ...]` union or execute Node.name truthiness/fallback/setter behavior
Other name forms are unsupported, not evidence of a corrupt game

Label and Translate block must be an actual dense bounded inert list, including an empty list
Missing/null block has a known descriptor default but is outside this helper's supported container subset, it is not replaced by `[]`
Array item descriptors must be own data slots
Child values, classes and states are not visited or validated, the original list is retained without filtering
The next layer must validate every child itself before claiming a typed tree or coverage

Next and Translate after accept null or a shallow completed inert instance reference
Reference shape checks do not normalize the target state or establish that it is a supported Node subclass
References, self-cycles, unknown referenced classes and cross-document membership remain unverified
No traversal follows next or after, and no original statement or occurrence is deduplicated

## Limits and failures

`LIMITS` is `{fields:20, stringBytes:16384, totalStringBytes:65536, blockItems:50000}`
Overrides may lower positive integer limits, never raise them
The fields cap bounds both the derived Map and the number of new six-key provenance records
The other fixed result/metadata records have constant size

`metadata.counts` reports `{fields, stringBytes, blockItems}` for this call
String bytes count UTF-8 value occurrences in derived fields, including restored rollback and the first string of the limited _name tuple
The block count is only the shallow list length
Fixed schema/provenance labels are bounded by the field cap and are not included in value-string bytes
An aggregate extractor must independently charge input graph edges/objects/depth and all of its output allocations and strings
These local counts are not a whole-graph or serialized-output budget

Fixed `RENPY_NODE_STATE_*` errors contain no input text, filename, expression or unknown key
An optional error field identifies only a known schema field
Failure returns no partial normalization and uses no fallback/default schema for an unknown profile
The input contract is bounded-decoder inert data, not arbitrary same-process JavaScript proxies or modified builtins

Technical metadata explicitly leaves compiler identity, graph, child semantics, same-document membership, cycles, language and body coverage unverified
The helper does not provide groups, ordering, translation pairing, actual RPYC compatibility, original-text hiding, point lookup, translation acknowledgements or health-score/upload acceptance

## Primary and validation

The fixed source commit is `8881389241074a3095dfe7b91c8b6bb0df018f02`
`ast.py` is 85626 bytes, SHA256 `319ef8a18b3b0ce426240c738405dc90d52d89861e3694c6ef04a2227271aefc`
`cslots.pyx` is 14917 bytes, SHA256 `ba401f82f1de176c1a34e86afe5f61eb87f151a4c0b762519b3a9374f6e9b9ba`
The named writer state is from cslots 223–249, unsigned line/column storage from 83/86, and field inheritance/defaults from 419–457
The six class declarations and field lines are Node 254/261–282, Say 853/854–864, Label 1093/1096–1098, Translate 2734/2751–2755, TranslateSay 2838/2846–2847, and EndTranslate 2975
Translation and continuation behavior are documented separately, the normalizer does not simulate them

`node --test validation/renpy-node-state.test.cjs` uses synthetic inert records and a neutral bounded-decoder roundtrip
It imports no SDK/game module and reads no RPYC, archive or actual game text
