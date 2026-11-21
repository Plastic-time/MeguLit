# Unity KEMCO message components: static boundary

This task uses an existing Raging Loop deployment, never executes the game, and does not modify its files
The first change retires published TMP/uGUI pages when their component/text vanishes
The second adds an independently requested, read-only KEMCO sprite observer for the exact original assembly below
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

The read-only observer pins the original assembly's exact length and SHA-256, then its field types and Message.Mes(string,bool) method
It reads MainScene.message/nameMessage and dialogList/Button.Text through explicit references, preserves row order, excludes child shadows and ruby, and uses parentObject identity as the page generation
It does not accept the installed patched assembly or a different release merely because its classes have the same names
No seed, allowlist entry, hide or embed capability is added

## Read-only opt-in contract

UnityTextPath.drawConfig({kemcoSprites:true}) appends the exact token kemcoSprites=1 to DRAW
False, missing or non-boolean values retain the previous DRAW wire bytes
The Mono plugin defaults off and accepts only one exact token; missing, malformed or duplicate tokens turn this observer off
The new branch independently checks an exact roles=1 token for names and choices; the observer flag alone does not grant those roles
The profile default and HookNative provider wiring are separately owned integration work, not part of this candidate
IL2CPP support is not added

The observer samples at most ten times per second after frame completion
It requires one active MainScene, at most 32 rows, 256 roots per row and 2048 roots in total
Each body root must have the exact parent reference, a unique nonzero instance id, and one valid Unicode scalar in its own TextMesh
Only an ordered visible prefix is reportable: an invisible suffix may be the game's typewriter, but visible text after a gap rejects the page
Empty rows do not certify an intentional blank line
The exact fields are resolved once per plugin lifetime after assembly identification; an unsupported assembly stays unsupported
File hashing reads exactly 361472 bytes plus an EOF check, not an unbounded stream

Geometry comes from the root Renderer bounds projected through the only enabled, screen-target camera whose culling mask includes that root
No-camera, multiple-camera, unknown material colour, behind-camera, nonfinite bounds, viewport cropping and partial screen cropping cannot supply a complete rectangle
Zero-alpha TextMesh/shared material, disabled renderers, inactive objects and completely parked bounds are not observed as visible
Reading sharedMaterial avoids instantiating a material
This is renderer/camera metadata, not a pixel-occlusion or shader-ink proof
Bounds can include unused glyph space; no claim is made about cover objects, postprocessing, arbitrary shaders or actual native mouse hit testing

Names are read from the distinct nameMessage object, not guessed from the body text
Choices come only from retained enabled Button components and their own Text GameObjects, capped at 16 after a bounded 32-item dialog list
Their text bounding boxes are observations, not proof that a pointer click would succeed or that all offered choices were captured
Choice collection finishes its identity/count checks before publishing any of the new set

All records use the existing ToMe_CHARS protocol with hidden=0
This observer never sets text, alpha, renderer enabled state, input, saves or game files
It does not manufacture hookSource: old Luna TextMesh setter streams can still compete with full-page sources
Current-source arbitration, complete text/translation pairing, DOM acknowledgement and any hide operation need a separate reviewed design before runtime acceptance

Every received DRAW request advances this observer's permission epoch, even an off request followed immediately by on
Sending a fresh observation checks that epoch under the same lock as control updates
Old page identities are retired before a new epoch, changed parent, invalid snapshot, disconnect or destruction
Reset records are best-effort ordered socket messages, not a reader acknowledgement
An observation already queued before revocation can remain in transport; this is not an immediate remote-stop acknowledgement
Already published geometry is deduplicated, and the same sentence on a different parent gets a fresh line id

## Evidence package and remaining gate

1. Identity: exact original SHA/length plus runtime field/method schema checks
2. Input/layout evidence: the managed IL locations above, independent body/name/button references, and explicit shadow/ruby exclusion
3. Producer: bounded read-only KemcoRead/KemcoBox and KemcoSpriteSnapshot, with no renderer mutation
4. Replay: actual helper compiled into a small console; synthetic row, scalar, clipping, prefix, duplicate, budget, page retirement, role and permission cases; real protocol parser checks its wire output
5. Default-off: strict optional control token; old wire retained without true opt-in; no automatic seed or native hook allowance
6. Runtime acceptance: incomplete, no Raging Loop process was started in this task

Existing Tsuki/Higurashi recordings remain separate real-recording regressions, not KEMCO healthy baselines
The Mono plugin compiles using real Unity 5 and BepInEx 5.4.23.6 reference assemblies
The six related suites pass 31/31 without skips; these are local pure/console/socket tests, not game or GUI tests
The helper's synthetic visibility boxes do not certify the actual Unity camera/material implementation
Before live work the current plugin must be supplied in the on-demand runtime pack and a fresh shadow, original assembly selected, actual audio snapshot guard completed, and a game slot acquired
Then verify at least ten actual full lines, source ownership, name/choice separation, ruby, point lookup, translated choices and no stale page after close/menu
No such live check or source-arbitration acceptance is recorded here

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
