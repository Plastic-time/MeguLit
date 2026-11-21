# KAG processCh / ruby-v1 checkpoint

Owner: codex/engine-complete-kirikiri-kag, inherited clean7a41ff9a. No main/remote push, game launch, save write or new resource unpack/download

## Ordered upstream research

Actual ordered research ran 2026-11-21 21:46:55 to 22:02:33 UTC, 15 minutes 38 seconds before the first production edit. The reads below preceded that edit

| Order | Actual source/revision/license | Finding / reuse decision |
|---|---|---|
|1 LunaHook|H:/MeguLit-Work/oss/LunaTranslator, a744a80fc2b99ea5852d4da2bd157afdc9e628f0, engine32/KiriKiri.cpp, local LICENSE GPL3|KAGParser functions329..434 are disabled; string route loses role/coordinates and newer filters strip ruby. Existing embed paths preserve selected tags but do not expose KAG currentRuby lifetime. Ideas only, no new GPL implementation copied|
|2 VNR family|mireado/ITHVNR fixed d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c, vnr/vnrhook/src/engine/engine.cc675..812, primary raw source read. Family GPL3 per sokcuri/ITHVNR README; guessed mirror root/LICENSE404, not falsely verified|Same disabled KAGParser string hooks, fixed split and ruby-loss limitations; no replacement for live KAG MessageLayer geometry. No code copied|
|3 XUnity|Not applicable to native TJS/KAG runtime|No Unity Mono/IL2CPP component boundary exists here; no dependency imported or unrelated source claimed reviewed|
|4 Textractor|H:/MeguLit-Work/oss/Textractor df5b830d1757a66aa162f8081e99d42c9bd50488, texthook/engine/engine.cc699..813, local LICENSE GPL3|Same KAGParser disabled section; string hooks cannot certify names/link/ruby coordinate semantics. Ideas only|
|5 Archive/tooling|GARbro b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0 ArcFormats/KiriKiri/ArcXP3.cs, morkt MIT; KirikiriTools9590c3cce4733e1f048cd407bfb57e8ce71f1f95, MIT|Reuse current repo XP3 reader under explicit member/aggregate memory bounds; archive reader does not infer message roles. KirikiriTools exporter/stream patch is not needed for ruby; no new binary/source imported|
|6 KAG3 / TJS|Official krkrz/kag3 MessageLayer master page confirms fields/currentRuby but is unpinned. Fixed1f3 tree page returned restricted URL and was not retried. Actual local Fata MessageLayer/ButtonLayer/MainWindow verified exact hashes below. TJS interpreter Kirikiroid2 d1c2b1259423542c893e0b65eaeb46c848848f2b, tjsInterCodeExec.cpp2494..2511/2931..2946|Actual KAG currentRuby is one-shot, consumed/cleared in original processCh; must snapshot before calling original and bind only to successfully advanced glyph. TJS has charAt but no charCodeAt; unary# reads the first UTF16 code unit. Reference behavior only, no code copied|

Primary links read: [Luna](https://github.com/HIllya51/LunaTranslator/blob/a744a80fc2b99ea5852d4da2bd157afdc9e628f0/src/NativeImpl/LunaHook/LunaHook/engine32/KiriKiri.cpp), [VNR](https://raw.githubusercontent.com/mireado/ITHVNR/d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c/vnr/vnrhook/src/engine/engine.cc), [KAG3 unpinned](https://github.com/krkrz/kag3/blob/master/data/system/MessageLayer.tjs). The blocked fixed tree is not proof of fetched fixed source

## Existing baseline and defects

Own baseline rerun: text-paths + engine-draw-krkr + engine-draw,36pass/0fail/0skip. Existing tests passing do not cover the defects below

Private actual production-function replay C:/Users/Megumin/Downloads/MeguLit-Work/kag-research/old-role-proof.cjs: message height60 in720screen, roles1, inLink0 produces role=name/hidden=true and no choice. Even inLink-1 produces name/hidden=true although uiDraw keeps that name visible. The first two private harness attempts lacked __t/send stubs; corrected harness then reproduced both facts. No real TJS/pixel claim

Reader drawEmbed currently calls exampleRuby with{text} and no sourceRuby. Caching native ruby alone cannot claim Reader/embed completion; root has the proposed narrow shared backend patch. Existing exampleSpans explicitly uses pair[2] as whitespace-free codepoint occurrence, mapping through actual original string offsets

## Actual existing sample source evidence

Bounded memory-only reads total 628918 B. MessageLayer155676B SHAa696edc424e4a178edccd821066d4fc2559dfcecda894937ab93d79235f73904; ButtonLayer13302B SHA20fa0557581ecdcda4e1ec1490150353ef35e8f1b9b999a24a7aed0575770ca4; MainWindow420004B SHA4f6ee7431cb0ca8e7df196e0fb32a59dfaad194fcdd959c94cdfeae85dc77422; scenario/badend2.ks39936B SHA6ce046597f56f8ff128a1eb78f0e860281141a19699628773172b14959ebc167. No whole member written to disk. Each<8MiB, aggregate<32MiB

The actual production parseKs returned 164 lines, 156 with Japanese kana, 3344 body codepoints and 465 anchors for that scenario. Counts establish a local body sample. They do not establish runtime roles, coordinates or successful hiding. Sample exe fata_jp.exe3658478B SHA17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42

MessageLayer1365 derives inLink;1434..1461 draws currentRuby then clears it,2678..2681 setRuby assigns the next glyph's reading. Actual rubyOffset/rubySize are used by the original engine. ButtonLayer caption is backed by Butt_caption, not a guessed label. MainWindow ruby tag calls current.setRuby and optional back-page companion

## Implemented compatibility contract

Wire ruby-v1 is optional after emb/before text: ruby=start:len:UTF16hex[|...]. Codepoint indices exclude newline and match exact rect indices. Spans must be ordered and cannot cross a newline. Up to64spans,8192token chars, reading160codepoints, base length1..80. Any malformed/overlap/duplicate/surrogate/control/range breaks the entire parsed record. No-ruby bytes stay unchanged. No authority for hiding is added

KAG owns parser + HookNative.charRects + KAG producer; TextRender owner only writes its producer and can reuse st.rubyWire with [[start,len,reading],...]. It returns a complete optional field with a leading space. RenPy producer and Reader are root-owned. No UI/story file changed here

HookNative retains only the current owned native episode. It deletes its exact and whitespace-free keys by value identity on an empty ruby record, another native line, PID/birth change or stop. UI records never enter this body cache. The compact start is calculated with the same Unicode whitespace rule used by exampleSpans. Ruby is cached before engineDrawLine requests replacement

KAG snapshots currentRuby before original processCh, then attaches it only after actual cursor advance. Explicit link/choice-frame membership precedes the 20% height heuristic. A name that the game kept drawing reports hidden=0. Embedding skips replacement ruby overlapping a game ruby span so the native reading is not drawn twice

Control parsing now requires the first line to be exact #cfg with finite boolean roles/embed/zh fields. The writer's advhdInput boolean is accepted and ignored by KAG. Duplicate, malformed and later #cfg headers fail closed. Disabling, missing or invalid control drops pending embedding and restores its owned backup. This tests the actual producer control reader, not a claim about arbitrary outside modification

## Validation and limitations

Twelve relevant suites passed 71/71, no skips. Nine new actual producer/parser/cache tests cover old bytes, malformed/bounded Unicode, repeated bases, whitespace mapping, PID/birth/stop cleanup, small links, one-shot currentRuby, control revocation and duplicate native ruby. Existing opt-in, RenPy stand-in and KAG placement regressions passed. Initial fixture runs caught a test string quoting error, missing choicePage setup, an accidental default argument and an old hidden-count source assertion. Those failures were corrected and remain in the private transcript

Both DLLs compiled into the private C research directory. x86 SHA81d908d22363cd0386500354532f4f33e5b616f103ed6288bd86f36261781bfe; x64 SHA868cdeb23261948bddd6c85a44ffadc05a711126b35824e207d548116c5d7b0c. Build outputs total1814829B. The old x86 setup path was absent; the existing VsDevCmd x86 environment worked. Maximum raw literal piece6631 wide units, below8190. Compilation validates C++ literals, not execution by a real TJS engine. Production TJS functions were tested through the explicitly documented syntax adapter. The original selftest host creates a window and was not executed

Root has a private Reader patch and actual drawEmbed/exampleRuby/exampleSpans contract fixture at C:/Users/Megumin/Downloads/MeguLit-Work/kag-research/reader-source-ruby.patch and reader-ruby-contract.cjs. The unchanged Reader returns dictionaryじつ for both repeated日 occurrences; the one-call proposal returns the game'sひ andにち. The real dictionary/cache/transport are controlled by the fixture, with no network. The default invocation is expected to fail until root integrates that call. Services/example-ruby still truncates incoming base/reading at40/80 UTF16 units. A reading with79 kana then an astral codepoint demonstrably ends in a lone high surrogate. Root owns that separate narrow fix

ToMe_KRKR end currently precedes ToMe_CHARS. This work proves current ruby availability for the later embedding request, not that an earlier hookSource event carried it. UITracker does not yet consume native ruby for names/buttons/choices. No game was started, no DLL loaded, no pixels hidden or DOM acknowledgment observed. No seed/default/allowlist was enabled. These gaps are release gates, not completed cells

Capability status: text and coordinates use internal KAG fields with a local body sample; small-layer name identity remains a geometry-based heuristic; link and text-button caption roles use explicit engine fields. Native body ruby capture, wire and cache have function replays. Full Reader integration is pending root. Native ruby on UI items, picture menus, vertical text, other forks and all live rendering remain unverified
