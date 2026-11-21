# KAG and RenPy native ruby integration

This checkpoint joins the shared ruby-v1 parser with the limited RenPy producer and the Reader consumer. Original engine reports remain separate in side-session-notes/KAG-ruby-result-7ff69e9a.md and side-session-notes/RenPy-ruby-result-9b23220c.md. Neither report was overwritten by the other

Reader.drawEmbed now gives the current HookNative sourceRuby triples to exampleRuby. The consumer keeps native occurrence positions ahead of dictionary readings. services/example-ruby copies given bases up to80 codepoints and readings up to160 codepoints. Copying stops at the prefix limit and preserves supplementary characters. Ordinary repeated, unpositioned readings keep their previous behavior

The actual old boundary,79 kana followed by𠮷, previously ended with a lone high surrogate after the80 UTF16 unit slice. The new service and actual Reader reply retain the complete reading. A separate80-codepoint base and160-codepoint reading control verifies both upper boundaries

First integration regression ran18 files with95 tests,95 passed,0 failed,0 skipped. The new consumer tests run production KAG track/chars through the existing explicit TJS syntax adapter, shared parser, HookNative, EngineDraw and actual Reader.drawEmbed. They represent ReportFunction newline serialization in the fixture without executing its DLL. The RenPy case runs the production Python producer against inert glyph objects and verifies every emitted record through the actual parser before the repeated-base case reaches Reader. Dictionary, cached translation and transport are controlled, with no network or game

The separate C research reader-ruby-contract.cjs passed without its proposal transformation against this actual Reader. Previously it failed on the unchanged Reader by returning dictionaryじつ at both native occurrences

No defaults, seeds or hook allowlists were enabled. KAG's earlier hookSource event may precede the later CHARS ruby snapshot. Native ruby for KAG name/choice/button items, actual game pixels and DOM acknowledgments remain unverified. The RenPy producer is limited to the declared8.4 glyph schema. Inert object replays and a prior isolated capture do not establish this producer's commercial-game acceptance

The KAG private x86/x64 DLLs were already built from unchanged native source. No rebuild was needed for this Reader-only step. TextRender integration changes native/script.inc and therefore requires one final combination build
