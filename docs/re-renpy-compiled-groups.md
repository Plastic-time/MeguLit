# Explicit compiled canonical groups: narrow inert subset

`services/original-engines/renpy-compiled-groups.cjs` is deliberately unregistered
It has no file/path reader, archive discovery, network, compiler, renderer or game attachment
Callers must supply graphs already produced by the bounded inert decoder and declare the exact profile
Do not pass arbitrary SDK instances, Proxies, getters or a modified builtins environment as a substitute for that input contract

```js
const {extractCanonical, PROFILE} = require('../services/original-engines/renpy-compiled-groups.cjs');
const result = extractCanonical({
  profile: PROFILE,
  documents: [{sourceId: 'caller-order-1', root: boundedDecodedRoot}],
  limits: {groups: 100}
});
// result.scenes is a canonical input for the separate existing pairTrack API
```

The single profile is `renpy-8.4.0.25071206`
Every root passes the actual `validateRoot`, then every structural node passes the actual `normalizeNode`
These helpers remain independent stages: metadata shape is not node semantics, and a normalized block is not proof that its children are supported
This module does not enable either helper globally or change parser/reader defaults

## Accepted structure

Documents retain the explicit caller order; each root top-level list and Label.block retains its list order
Each document must contain at least one supported canonical group

- A Label may contain supported Labels or groups, with hide=false and parameters=None
- A Translate must have language=None, alternate=None and a nonempty block of exact Say nodes
- That Translate must be immediately followed by one exact EndTranslate in the same parent list, consumed as its local terminal
- A TranslateSay is a single canonical leaf group with language=None and alternate=None; it must not be followed by an orphan terminal
- All other nodes, bare Say/Node, Python, named languages, orphan/repeated/cross-parent markers and mixed or unknown children reject the whole result

Those marker conditions are a deliberately narrow writer subset, not a claim about every legal Ren'Py file
The extractor does not relabel default-language None as Japanese, infer language from text, run a fallback or support named-language pairing
Existing parseLoose/pairTrack remain separate explicit APIs

Every accepted Say must have literal nonempty, non-whitespace, well-formed string what with no NUL
It is copied verbatim, including whitespace, markup, escapes and interpolation tokens; none are evaluated or normalized
Speakers are None with who_fast=false, or an ASCII simple/dotted token with who_fast=true
The token grammar and reserved statement exclusions match the existing pairTrack speaker subset
Missing who_fast normalizes to None in the helper and remains unsupported here; it is never silently made false

with_, attributes, arguments and temporary_attributes must be None; interact=true, explicit_identifier=false and rollback='normal'
Plain Say.identifier must be None; TranslateSay.identifier supplies its explicit group ID
Nondefault values are rejected rather than discarded, including values with side effects the subset does not model
An empty what or an explicit identifier may be legal elsewhere in the engine and is simply outside this subset

IDs use the same ASCII simple grammar as pairTrack: `[A-Za-z_][A-Za-z0-9_]{0,159}`
The entire string must match, including rejecting trailing line separators
IDs must be unique across all document occurrences, checked before insertion; no hash/suffix regeneration or value-based deduplication occurs
Node._name and filename never become a group ID, source path or disk operation
Source IDs are caller-declared opaque bounded labels, not discovered filesystem names

## Ownership and references

Structural node, state Map, list wrapper and items-array aliases/cycles reject, including reuse across documents
The accessed root/metadata containers are also owned once; sharing these containers across documents rejects conservatively
The same stored key bytes in distinct Buffers are allowed across documents; a different lock value rejects without logging that value

next/after references may point only to structurally declared nodes in the same document
They never emit text or define order
After structural collection, an iterative union-graph audit of declared child and control references rejects cycles, dangling or cross-document references
The reference audit is bounded by the global node/edge limits; it does not recurse on a control-flow chain
The depth limit bounds declared structural nesting, while maximum reference-audit stack size is bounded by the owned node count
Valid engine loops, shared nodes or external continuation references can therefore be unsupported here
No visited-node deduplication is used to hide duplicate structural occurrences

## Output and provenance

`result.scenes` contains `{name, groups}` with `{id, says}` and literal `{who,text}` Say values compatible with pairTrack
Additional source records identify caller sourceId, explicit structural path, exact class and copied helper field provenance
Translate groups also identify their consumed terminal path
Field provenance is the helper's fresh derived Map and records, not the original input state Map; no raw Node, filename, _name, key or root is returned
Changing returned text/provenance does not restore or mutate an input engine object

The result only describes the fully accepted structure of the provided documents in their declared order
It does not establish cross-file story order, installed-game completeness, compiler identity, text language, point reading or visual/ACK success
`canonicalLanguage` is null; compilerIdentityVerified, languageVerified, gameFullTextVerified, pointReadVerified and ackVerified are false
Empty documents and every unsupported/error case throw without returning a partial scene list

## Budgets

All exported LIMITS are fixed ceilings, and overrides may only lower positive safe-integer values
They bound documents, owned objects, logical edges, structural depth, groups, Says, Says/group, line/speaker/source bytes, cumulative text/field string bytes, and output objects/edges/bytes
Metadata's top-level list and each normalized node retain their own existing local limits as well

Input object accounting covers accessed root containers, unique structural nodes/state Maps, list wrappers/arrays and supported name tuples/arrays
Logical edges charge record values, Map key/value slots and array elements; intrinsic Array.length and prototype internals are not graph edges
Counts include fixed API-envelope bookkeeping rather than walking the optional limits control record as payload
String accounting includes every normalized field's value string bytes, descriptor-default strings and caller source IDs; it does not pretend to rescan all unrelated decoder objects
Text bytes additionally charge each copied what and speaker token

Output budgets include temporary normalizer Maps/field-provenance records and graph-audit bookkeeping, using conservative per-field fixed charges, plus literal text/IDs/source IDs and path lengths
The bounded fixed charges describe this module's resource contract, not measured V8/RSS allocation bytes
Actual process memory still depends on the already bounded input graph, engine/runtime overhead and the caller's process limit
Structural depth is checked before child descent; reference-cycle checks use an iterative bounded graph traversal

## Primary and validation scope

Fixed official source commit: `8881389241074a3095dfe7b91c8b6bb0df018f02`

- ast.py SHA256 `319ef8a18b3b0ce426240c738405dc90d52d89861e3694c6ef04a2227271aefc`: Node254–374; Say853–911; Label1093–1130; Translate2734–2819; TranslateSay2838–2884; EndTranslate2975–3006
- cslots.pyx SHA256 `ba401f82f1de176c1a34e86afe5f61eb87f151a4c0b762519b3a9374f6e9b9ba`: named state207–249, legacy reader251–288, defaults309–396, ClassVar/inheritance399–466
- translation/__init__.py SHA256 `fd6259e5a5f8f6ff6410314a1dc54f89c9b4f8bff148448ebd380d3dfd17c6df`: group classification164–182, continuation188–206, creation374–382, combination384–418 and local marker removal472–479
- Current root metadata contract uses writer's tuple(data,stmts), exact profile version5003000 and the explicit three-key metadata subset; the historical empty-data restriction is obsolete

The normalizer restores only schema-proven descriptor defaults, and requires fixed writer stateShape `tuple:none,dict` and explicit line/column fields
Unknown keys/classes remain unsupported; six-class semantics are not implied by the larger inert class allowlist
This canonical-only subset is not an adapter for an actual mixed chapter
Tests use small neutral in-memory inert records and the actual helpers/pairTrack, without loading Ren'Py, Python, real RPYC/RPA, games, or user text
