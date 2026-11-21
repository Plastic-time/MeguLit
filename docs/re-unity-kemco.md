# Unity KEMCO message components: static boundary

This task uses an existing Raging Loop deployment, never executes the game, and does not modify its files
The current small code change only retires published TMP/uGUI pages when their component/text vanishes
It does not implement KEMCO TextMesh replacement and does not resolve or certify the user's Raging Loop symptoms

## Exact local identities

- ragingloop.exe: 639488 bytes, SHA-256 85a50ee88e05e28d8767913b06ee4af4b09b91073972320331e8d2a472313a1d
- Original backup Assembly-CSharp.dll: 361472 bytes, SHA-256 c4d74235dc06d19630d8b826e49bd3d047c09bc03e8d8badeb0d60dd71dd7314
- Installed patched Assembly-CSharp.dll: 353792 bytes, SHA-256 0248f91418cc84385e2085ec4c5796cea7c80bdf23e506caaa4bc80a51d3ed09
- Parent's existing resources receipt reports Unity 2018.3.10f1, 112 TextAssets per resource, 34 message scripts and 39850 original versus 39834 patched parsed lines
- Those totals are offline counts, not story-route order, paired coverage or runtime acceptance

## Managed control-flow evidence

Read through Mono.Cecil metadata/IL only, without loading or calling game methods
The following offsets refer to methods in the exact original Assembly-CSharp.dll

- MainScene.Operate IL_034f/0365 loads MainScene.message then calls Message.Mes, while IL_038a loads a separate MainScene.nameMessage before calling the same method with charaName
- MainScene.SelectButton takes (count, strings, limited): ordinary choices use strings[i]; limited choices use strings[2*i] as display text and strings[2*i+1] as the condition
- MainScene.Program removes the # command marker, finds the outer parentheses and String.Split(','); it does not parse Python, JSON or general quoted CSV
- Choice objects are retained in MainScene.dialogList as concrete Button GameObjects, and their Button.Text GameObject is separate from the clickable sprite
- A locked choice can destroy Button.Text and set Button.Enabled=false before its fade; do not report it as a visible clickable option based on script presence
- Message.Mes IL_002c stores MessageText, IL_004c..0063 destroys old parentObject, IL_006e stores a new parent, IL_009a clears messageSprite, IL_00a5 clears rubyArray, then creates each character and finally IL_05a2 stores LastMes
- Message.Mes IL_0416..0427 calls Game.NewText for one character and stores the root GameObject; IL_04cc..04d9 appends that exact root into the row's messageSprite list
- Game.NewText IL_00ee obtains a legacy UnityEngine.TextMesh, IL_0105/0111 sets its text, IL_018f clones the TextMesh, IL_01a1 parents the clone and IL_01ac makes it black as an offset shadow
- Therefore a general FindObjectsOfType<TextMesh> scan duplicates each body glyph and mixes text roles; read the exact root list, never concatenate descendants
- Message.Script IL_0351..035d separately retains ruby TextMeshes in Ruby.fontSprite; the child shadow and ruby cannot be treated as body characters
- Message.Type only declares none=0/MainText=1, insufficient by itself to distinguish a name from a choice or menu

## Existing producer gap

MeguLitUnityText.Scan only enumerates TMP_Text and UnityEngine.UI.Text
Its existing generic component scoring and setters cannot discover this per-character Message/TextMesh family
The Luna Unity hook list does contain TextMesh.set_text, but that sees individual characters and their shadow copies, not a full ordered Message page
Fixing offline #Select parsing or increasing TextAsset counts alone cannot provide the runtime body, role and clear lifecycle

A future default-off KEMCO adapter should pin both assembly identity and exact field/method schema
It should read MainScene.message/nameMessage and dialogList/Button.Text through explicit references, preserve row order, separate ruby, and use parentObject identity as the page generation
A layout snapshot must be bounded, dense, duplicate-free and complete before supplying glyph rectangles; failed bounds or unknown class layouts must remain unsupported
Hide only the body root renderers and their known shadows, recording every original enabled state and restoring it on revoke/disconnect/change of owner
No new seed, allowlist entry, shared default, runtime observer or hide capability is enabled by this report

## Small existing-plugin correction

A previously published TMP/uGUI page is now retired with one existing ToMe_CHARS empty hidden=0 record using that exact old line id
Retirement happens on current-component replacement/disappearance, no remaining glyphs, or plugin destruction
The local publication flag is separate from the geometry dedup key, because embedding can invalidate that key while an old page is still published
Resetting lastText after the clear lets the same sentence on a newly observed page acquire a new line id
Core OverlayPlacement already interprets this record as textPlace gone, preserving the anchor rather than drawing old text again
Socket delivery on teardown is best effort; enqueueing a clear is not proof the reader observed it

Validation: actual production ClearPublished method compiled into a tiny console harness, then its real wire output parsed by core/text-paths and replayed through core/overlay-placement
Existing Tsuki/Higurashi recordings and Unity embedding/control tests are also preserved
Full Mono plugin compiles against existing Unity 5 reference assemblies and real BepInEx 5.4.23.6 references; this compile is not Unity execution
No driver, COM, GUI, game, hidden desktop, translation UI or native input was executed
Hidden ten-line lookup/translation/residual checks remain incomplete, as do healthy Cardinal and all Unity IL2CPP acceptance
