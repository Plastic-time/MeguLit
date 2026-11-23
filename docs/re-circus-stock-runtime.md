# DC4UP: existing ordinary Luna hook

The complete official DC4UP sample matches the **existing stock Circus c3 ordinary string hook**. No replacement hook, native header, engine registration, default or shared JavaScript change is needed for this candidate. The remaining step is actual game/Reader acceptance; static matches and the console recorder do not claim live attachment

## Fixed sample and publisher startup

The full-package deployment receipt is maintained by the sample owner, not by this branch. This audit independently pins these local files; full hashes and original code fragments are in `validation/fixtures/engine-sigs/circus-stock-runtime.json`

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| DC4UP.exe, actual x86 hook target | 908800 | `3644133cfe341e31233ebd460050cb1fd73005c7ef228f0831eeb269bfcfc9a2` |
| DC4UP_dstart.exe, publisher launcher | 479232 | `b0a705ff51c96d238ad82f7812bd8a473ecd363231dd256e3b71a7ff927edb9e` |
| Advdata/GRP/NAMES.DAT | 42244 | `8fba5c6976adfacd44cfa376caf4e743e1336ae07c06f6889d4e8106587cbfdc` |
| Advdata/MES/advmenu.mes | 2534 | `e5ee556fcb89bc927b8e5675bc8b8e0459fd605b4cc883d4db93997dc7ebd0f8` |
| Advdata/MES/dc4_sen20181213b.mes | 9140 | `1898566f645949ebbd0b66cd605cd48d7389677d4adc8da82a37b75ec3002bc5` |

The publisher's bundled instructions, decoded as CP932, name **DC4UP_dstart.exe** as the launch entry. That launcher contains the DC4UP.exe child name, sets a working directory and calls a helper with CreateProcessA; the retained byte ranges cover the child-name reference and launch calls. This is static launch evidence, not an observed child process

The sample remains adv32/MES marker B9 / script version 166. CIRCUS is a publisher label, not proof that other CIRCUS titles share this hook. No CMVS or Artemis coverage is claimed

## Research before implementation

All three primary sources were inspected at fixed revisions before adding the dedicated evidence tests. No new upstream GPL implementation was transplanted into product code

| Source | Fixed revision and file | Result |
| --- | --- | --- |
| LunaTranslator | [Circus.cpp](https://github.com/HIllya51/LunaTranslator/blob/7772ec7bb186bd3773bb534dcbc8655a4a364150/src/NativeImpl/LunaHook/LunaHook/engine32/Circus.cpp), `7772ec7bb186bd3773bb534dcbc8655a4a364150` | Matches the repository's preserved file after line-ending normalization; c3 handles the observed SetStr entry |
| VNR | [circus.cc](https://github.com/Dangetsu/vnr/blob/d2b9bad6af9577f639ce47171d506c9fbf401984/Frameworks/Sakura/cpp/plugins/vnragent/engine/model/circus.cc), `d2b9bad6af9577f639ce47171d506c9fbf401984` | Older ScenarioHook pattern, not this sample's c3 path |
| Textractor | [engine.cc](https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/texthook/engine/engine.cc), `df5b830d1757a66aa162f8081e99d42c9bd50488` | Older Circus1/2 entry; does not provide the matching c3 variant |

License details and the existing-code reuse boundary are in `third-party-circus-stock-runtime.md`

## Why stock attaches to this exact sample

1. The Windows case-insensitive `AdvData/GRP/NAMES.DAT` fingerprint is present, so the existing Circus detector sets c2 true
2. `native/megulithook/enginecollection32.cpp` already registers `new Circus`; the ordinary engine scan calls its attach function independently of draw roles/input diagnostics
3. The older `3C 24 75` signature has zero hits in the exact executable. Therefore the old InsertCircusHook2 does not preempt c3, and the old EmbedCircus ScenarioHook also has no such match
4. c3 finds its overflow literal and first PUSH reference at RVA 0x428CE, resolves the aligned setter at RVA **0x42890**, and requests **Circus2_1** through normal NewHook
5. Its ordinary parameters are `offset=4` (x86 stack[1]), `type=32` (USING_STRING from the repository's real constants), and the existing filter callback. It is not an embed/draw-role hook

The full engine-priority scan was not executed in a real process. A preceding detector, loaded-module state or runtime initialization could still affect actual attachment; confirm the Circus engine/installed hook in the user's diagnostic log

The second error-string reference, RVA 0x429E0, belongs to the wide setter. The selected narrow setter has the actual 260-byte bound and ret 4. No arbitrary GetGlyphOutline cache point is used to claim complete-string capture

Real message code calls the narrow setter from separate name/body contexts:

| Meaning in the static message path | CALL RVA | Return RVA / expected relative ctx |
| --- | --- | --- |
| Name operand | 0x32256 | 0x3225B |
| Body operand | 0x32315 | 0x3231A |

Current texthook normalizes return addresses by module allocation base. These are diagnostic expectations for this exact binary, not hardcoded runtime selection, screen roles or evidence that those calls executed. Other UI/history calls also reach the setter

## Existing loader and Reader route

The actual private test deployment was read without starting the app or writing E:

| Selected component | Observed SHA-256 |
| --- | --- |
| runtime/megulithook/MeguLitHook32.dll | `43024ab9a1e7a9c5ced06b1e68d3c880da0cc2bb23568db166a9052230567820` |
| runtime/megulithook/MeguLitHost64.dll | `886b2e8d4286c20992eaf1eeaed273c25d8c5aadee516012fe71a2ae8315779e` |
| native/HookBridge.exe | `7a6d13a063c7d0f45a1169954a84221b7e393832d197f8485070c635141079c1` |
| native/HookInjector32.exe | `8d1d069bc8f3ebdb3f49ff23c8eadb3111f12c77d0c19f8313aca838d9589ba3` |

The deployed Hook32 contains the stock hook name, search literal and wide detector fingerprint. HookNative still requires the three Luna files under runtime/hook before spawning the bridge. HookBridge then chooses runtime/megulithook, prefers **MeguLitHost64.dll** there, selects the x86 Hook32/Injector32, and validates the bound PID/birth/window before injection. Looking only for LunaHost64.dll in megulithook would give a false missing-host result

The unchanged source route is ordinary NewHook → LunaHost OnCreate/OnOutput → selected/enabled `hookSource` → HookNative sourcePage/source → GalNative → Reader reader-event → hook-reader UI. Registration and binary marker presence alone do not prove that this route received text in a real process

Default codepage is 932. Multiple setter contexts can create several identically named streams; selection, language/resource filtering, remembered context and enabled/bound state still matter. If automatic selection chooses a name/menu stream, the user should select the Circus2_1 stream that advances with Japanese body text. Do not force an address or switch into read mode automatically

## Replays performed

- Dedicated Node checks cover exact source identity, stock detector/registration, original setter and call-site bytes, existing host/Reader source route, publisher launcher evidence, loader choice and identity negatives
- A narrow x86 console compiles the repository's **unchanged c3 function** into a self-owned image-search stand-in, using real constants. Normal and literal-erased fallback modes each request Circus2_1 once at RVA 0x42890 / offset 4 / type 32
- The NewHook-reject control returns false; a blank image makes no NewHook request
- This console's NewHook is a recorder. It does **not** call MinHook, execute the game image, execute the real filter, inject a process or produce a real Reader event. Search helpers implement only the bounded stand-in contracts needed by this exact sample
- The read-only sample/deployment audit pins the executable, real scripts, fingerprint, launcher/instructions and deployment hashes, and reports gameStarted/minhookInstalled/readerOutputObserved as false

Reproduce the dedicated Node checks with a task-owned H: temporary directory:

```powershell
$env:MEGULIT_TEST_TMP='<this-worktree>/.local-circus-runtime'
node --test validation/circus-stock-runtime.test.cjs
node validation/helpers/circus-stock-audit.cjs '<full-sample-directory>' 'E:/MeguLit-Test-1421'
```

For the console, create `.local-circus-runtime`, generate its source using `validation/helpers/circus-stock-console.cjs`, and compile it with the existing VS tools as x86, C++17, UTF-8 and a console subsystem. Run it against the pinned DC4UP.exe with `normal`, `fallback`, `newhook-fail` and `blank`. All output belongs in that local directory. No full Hook DLL or shared selftest suite is required

## Root handoff and owner acceptance

The existing owner catalog still says `CIRCUS_BRAND_NOT_PROOF_OF_OLD_CIRCUS_SIGNATURE_BASIC_FALLBACK_CANDIDATE`. Root can replace that uncertainty with **exact stock matcher verified / live pending**, retaining the pinned EXE/scripts and the actual child-process target. This branch does not change shared catalog/importer/launch logic or private metadata

No new candidate hook exists, so no new three-environment permission route or owner grant is introduced. Stock basic text does not require an advanced draw.roles/embed grant. All advanced defaults remain unchanged, and nothing is enabled in an official seed

Suggested hidden slot: slot4 only if root assigns it; no slot was claimed and no game was started by this branch. Corrected startup plan: use the publisher launcher with its own directory as cwd, then bind the actual DC4UP.exe child. No foreground start, DirectX installer, save manipulation or sample deletion is part of this work

Final foreground checklist for the user:

1. Open the private MeguLit test build and the publisher launcher; verify binding selects the DC4UP.exe child, not dstart
2. Reach a Japanese story page and confirm the installed/selected stream is Circus2_1; inspect the advancing body context rather than a name/menu stream
3. Advance at least ten lines, including narration and named dialogue; verify the Reader receives the current Japanese text once and keeps working after menu/history return
4. Retain hook diagnostics and Reader logs if attachment, selection or text delivery fails, including actual module/DLL identities and process birth

This ordinary text preparation does not certify original-text hiding, click boxes, choice roles, translation rendering, ruby placement, final foreground playability or the full five acceptance gates. Root alone integrates the branch and performs any final native build/deployment/main push
