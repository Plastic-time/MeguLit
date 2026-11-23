# KAG and RenPy native ruby integration

This checkpoint joins the shared ruby-v1 parser with the limited RenPy producer and the Reader consumer. Original engine reports remain separate in side-session-notes/KAG-ruby-result-7ff69e9a.md and side-session-notes/RenPy-ruby-result-9b23220c.md. Neither report was overwritten by the other

Reader.drawEmbed now gives the current HookNative sourceRuby triples to exampleRuby. The consumer keeps native occurrence positions ahead of dictionary readings. services/example-ruby copies given bases up to80 codepoints and readings up to160 codepoints. Copying stops at the prefix limit and preserves supplementary characters. Ordinary repeated, unpositioned readings keep their previous behavior

The actual old boundary,79 kana followed by𠮷, previously ended with a lone high surrogate after the80 UTF16 unit slice. The new service and actual Reader reply retain the complete reading. A separate80-codepoint base and160-codepoint reading control verifies both upper boundaries

First integration regression ran18 files with95 tests,95 passed,0 failed,0 skipped. The new consumer tests run production KAG track/chars through the existing explicit TJS syntax adapter, shared parser, HookNative, EngineDraw and actual Reader.drawEmbed. They represent ReportFunction newline serialization in the fixture without executing its DLL. The RenPy case runs the production Python producer against inert glyph objects and verifies every emitted record through the actual parser before the repeated-base case reaches Reader. Dictionary, cached translation and transport are controlled, with no network or game

The separate C research reader-ruby-contract.cjs passed without its proposal transformation against this actual Reader. Previously it failed on the unchanged Reader by returning dictionaryじつ at both native occurrences

No defaults, seeds or hook allowlists were enabled. KAG's earlier hookSource event may precede the later CHARS ruby snapshot. Native ruby for KAG name/choice/button items, actual game pixels and DOM acknowledgments remain unverified. The RenPy producer is limited to the declared8.4 glyph schema. Inert object replays and a prior isolated capture do not establish this producer's commercial-game acceptance

The KAG private x86/x64 DLLs were already built from unchanged native source. No rebuild was needed for this Reader-only step. TextRender integration changes native/script.inc and therefore requires one final combination build

## Combined TextRender and RPG Maker candidate

TextRender ec6a304b and RPG Maker ff1063a0 were applied after the Reader checkpoint. Their original reports are preserved in side-session-notes/TextRender-roles-result-ec6a304b.md and side-session-notes/RPGMaker-cdp-result-ff1063a0.md. Only result.md conflicted. Native source and test changes merged without replacing another engine's functions

A final producer audit found a ruby-induced transport regression. The real KAG chars function emitted a29149-unit record for1500 small glyphs plus64 valid readings. Without the optional ruby it was21602 units and passed the existing native limit. KAG now omits only the optional ruby field when it would exceed the28000-unit native transport cap. The body and emb marker remain intact. The embed acknowledgment applies the same check. A body already over the native cap remains subject to the existing native rejection; this change neither truncates it nor claims KAG has a new restoration acknowledgment. TextRender retains its separate trClear/opacity restoration behavior

All new opt-ins remain disabled. No game, native visible host, hidden game or computer-use session was started during this integration. No installed game was deleted. The final game experience remains for the owner to verify; hidden checks being permitted does not make any missing check pass

Suggested owner checks after root deploys one identified test build:

- KAG:10 lines across page clears, native ruby and repeated characters, a short-layer choice and a text button; compare one original name, switch embed off and verify the game restores normal text
- TextRender:10 lines, a multiline choice, name to narration, hidden message-window and OP transitions; confirm no old page returns and every option stays readable and clickable. Game-native ruby is still missing from this producer
- RenPy8.4: name to narration, two actual menu actions, repeated-base ruby, alt-ruby omission from body, embed/roles on then off. Custom screens and commercial-game coordinates remain unverified
- RPG Maker: a real MV/MZ project's body,12-page progression, names/choices/menu, point lookup and generated ruby; test transforms and switch off. No real local MV/MZ body sample has been established, and native game-ruby capture is absent

These steps require actual visible Japanese, point lookup and translated options. The unit replay results do not certify those outcomes

Final combined validation after the optional-field budget fix ran26 files with171 tests:170 passed,0 failed and1 skipped. The unchanged skip is "RPG Maker / WOLF games on this PC are read", with no local RPG Maker or WOLF game. This is not an all-green real-game acceptance result

All1549 tracked JS/CJS/MJS files passed node --check on Node22.22.3. After the last native-budget regression, one changed JS test was checked again;1548 identical files reused their same-Node content-hash results. Four Python files passed ast.parse without generating bytecode. Maximum native raw-literal piece is7221 wide units, below8190. git diff --check passed

The final combined native source compiled for x86 and x64 in the private C research directory, without loading either DLL. x86 SHA256cb3cb8307f954f8909e7785113ee9c12f43807385f90b1177c8b9f23f97a045c; x64 SHA256aa2d786dcc053a24f74677b5b16a69cf234dcbb078ee923e4d3bacbb74c254bf. These supersede the earlier combination binaries. Root owns deployment of the matching code, Python producer and DLL pair into the unified isolated test directory

## Owner handoff checkpoint, 2026-11-22 08:02 JST

The owner now accepts all final game experience checks. HidDesk preparation may continue, but a hidden frame or unit replay never counts as that acceptance. The combined candidate was checked against freshly fetched origin/main 7a41ff9a: 18 directly affected suites passed 99/99, with zero failures and skips. This is feature validation, not a fourth CI-repair attempt or a claim that repository CI is green

A complete official MZ sample is now deployed locally. The unchanged production rpgmaker reader/detector read 108 JSON resources from Luise: 2238 body records, 203 choice records and 1783 speaker-field occurrences. JSON byte offsets were read back against the source. Those are script records, not observed rendered frames or counts of distinct characters. The separately downloaded MV sample is one packed executable; no directory script extraction or runtime success is claimed for it

The unified isolated test installation has matching KAG DLLs, Python producer and Reader consumer. Its per-game activation is still being prepared: the ordinary hide switch alone does not grant draw.roles/embed, and these defaults stay off. Shared-executable version seeds cannot provide a title-specific private grant, so no such unsafe grant was published. Missing activation, native TextRender ruby, image menus and unknown RenPy versions remain explicit gaps
