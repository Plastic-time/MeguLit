# Private Unity IL2CPP source path

The source-only plugin captures actual TextMeshPro and uGUI setter calls through HarmonyX's IL2CPP backend and delivers them to the existing HookNative and Reader path
It retains all original game rendering
It does not claim the previous observer's unverified character boxes, alpha hiding or ruby separation

## Source and runtime references

| Reference | License | Use |
| --- | --- | --- |
| [XUnity.AutoTranslator, fixed 08324a58](https://github.com/bbepis/XUnity.AutoTranslator/tree/08324a58dcb26b76fc08e0fb2121098164579e73/src/XUnity.AutoTranslator.Plugin.Core/Hooks) | MIT | Inspect actual TMP/UI setter signatures; no implementation copied |
| [BepInEx, fixed dbc82f0](https://github.com/BepInEx/BepInEx/tree/dbc82f0/Runtimes/Unity/BepInEx.Unity.IL2CPP) | LGPL-2.1 | Official be.793 binaries and BasePlugin/interop lifecycle |
| [Il2CppInterop 1.5.3](https://github.com/BepInEx/Il2CppInterop/tree/v1.5.3) | LGPL-3.0 | Official runtime and Harmony support, no source copied |
| Preserved LunaHook Unity engine source in this repository | GPL-3.0 | Read existing setters and fallback constraints, no new vendored code |

This follows the requested XUnity → BepInEx/Il2CppInterop → existing Luna research order
XUnity build proxies, Il2CppDumper DummyDll and old local test stubs are not compiler references or distributed game interop
The old package comment identifying Il2CppInterop as MIT was wrong and has been corrected
Full license texts accompany the private runtime stage

The pinned official archives are

| Flavour | Bytes | SHA-256 |
| --- | ---: | --- |
| `BepInEx-Unity.IL2CPP-win-x64-6.0.0-be.793+dbc82f0.zip` | 34339235 | `5b63d7d0e92a2448ccd13b738ff95ff1cc1026c6d718555d4df8e6c824953ac4` |
| `BepInEx-Unity.IL2CPP-win-x86-6.0.0-be.793+dbc82f0.zip` | 31443115 | `6eb35cec828f16836674231b2ab4ab1db6c9953b7a11b34b8c8badba14218ed2` |

Both came from `https://builds.bepinex.dev/projects/bepinex_be/793/` over ordinary HTTPS with a 40 MiB per-file cap
All 233 entries in each archive passed CRC, path, symlink and expanded-size checks before extraction
An incremental stage contains only the IL2CPP flavours, plugin and notices; the separately verified Mono runtime remains required by the existing pack marker

## Normal launch

1. The isolated installation has the official `il2cpp-x86` / `il2cpp-x64` flavours and actual `MeguLitUnityText.IL2CPP.dll` under `runtime/unity-text`
2. Its exact-game opaque owner grant permits `diagnostic-input`; no grant means no IL2CPP shadow/plugin launch even if an old rendering switch is on
3. `prepare` opens loopback, creates a fresh random session scope, builds an owned shadow, writes plugin/port/scope/config there and registers its exact EXE SHA with owner-tests
4. The existing native process query for that exact shadow path must report the actual launch child PID and birth before binding the grant
   This happens while waiting for a window, so the 60-second unbound grant does not expire during normal first-start generation
5. BepInEx generates and preloads the game's interop on first launch before plugins load, as described in its [IL2CPP installation guide](https://docs.bepinex.dev/master/articles/user_guide/installation/unity_il2cpp.html)
   This may take minutes and may download Unity base libraries; the user does not locate or copy interop DLLs
6. The compiled plugin reflects generated `TMPro.TMP_Text.text`, `TMP_Text.SetText(string,bool)` and `UnityEngine.UI.Text.text` and installs real postfix hooks
7. The plugin starts with capture off; its scope hello can enable capture only after HookNative's current PID/birth, opaque capability and session all agree
   It then reads text only on setter callbacks

Original game files are not patched by the launcher
The shadow's root regular files are independent copies, preserving source inode/ctime pins on the same volume
Root identity includes the canonical source path so two common same-size Unity EXEs cannot reuse each other's Data junction
Data directories remain junctions, so this is not save, registry or Steam Cloud isolation
The runtime/config/interop/logs are owned shadow files; first preparation reserves their size plus 256 MiB generation headroom and at least 10 GiB free
An old shared hard-link shadow is refused without unlinking it and invalidating original pins

## Source protocol and lifecycle

Wire lines use `ToMe_UNITY il2cpp1` followed by a private 128-bit scope, monotonic sequence, PID, UTC birth ticks, component pointer stream, `hello` / `full` / `clear`, and strict UTF-8 base64
Only `SOURCE <scope> 0|1` is sent to this plugin; it receives no HIDE, DRAW, WANT or embed commands
Input is limited to 4000 UTF-16 code units per setter, 256 queued records and 256 tracked component streams
Neither game tags nor a serialized `origin` value can manufacture the private in-process source authority

The source uses the existing UnityBox stabilization for typewriter growth and the newest NVL paragraph
Games that set a complete string once and animate visible-character counts can still expose future characters; this path has no visibility proof
Every held delivery checks authority again
Empty/blank setters retire that stream and cancel its held paragraph
Only the same currently displayed owned stream/sequence can clear Reader; a different later Luna source is preserved
Revocation, disconnect and stop clear owned pending state, disable capture and reject late source/deliver/emit callbacks
The plugin unpatches on network closure or unload, and never changes the game's renderer alpha or text
After this terminal stop, this minimum plugin requires a normal game relaunch for a new capture session

This is a generic setter path: component lifetime, visibility-only hiding, menu/backlog/choice ownership, speaker roles, coordinates, native ruby, native embed and translation placement are not proven by a setter callback
Menus and labels may be captured; dialogue selection still needs game-owned semantics or user acceptance
The existing KEMCO protocol/gate and ordinary Luna source route are retained independently
No Seed/default/official capability is promoted by this diagnostic path

## Build and verification

```powershell
./native/unitytext/Build-UnityText-IL2CPP.ps1 -Runtime <official-flavour-root> -OutputPath <owned-output>/MeguLitUnityText.IL2CPP.dll
```

The build references only the official flavour's `dotnet` and BepInEx core/Harmony/Interop assemblies
Both x86 and x64 official reference sets compile the same deterministic AnyCPU DLL
Its assembly references include actual BepInEx.Core 6, BepInEx.Unity.IL2CPP 6, Harmony 2.10.2 and Il2CppInterop.Runtime 1.5.3, with no generated Unity assembly reference

`validation/unity-il2cpp-source.test.cjs` exercises neutral fixtures through real opaque grants, launch preparation, shadow aliasing, fragmented socket input, HookNative and Reader
It checks Reader translation and point-lookup requests using an explicitly neutral provider/dictionary, clear/repeat, revoked queued text, malformed UTF-8 and identity/scope/replay rejection
The related owner, legacy Unity/KEMCO, text-path and Reader suites pass without skips

`validation/native/UnityIl2CppWireReplay.cs` is compiled with the production C# wire codec and talks to actual UnityTextPath over loopback, including three-byte fragments and stop acknowledgment
It is a neutral protocol executable, not a substitute Unity game, generated interop or proof that an IL2CPP hook installed
The source plugin itself is separately compiled against the actual official runtime

The complete local `manosaba.exe` x64 installation is an identified IL2CPP sample, not an accepted live result for this revision
No game, original save, formal installation, account, model, Anki or public runtime manifest was modified by this lane
Actual first-start interop success, Harmony hook installation, dialogue/choice/menu behavior, visible Reader, real translation and point lookup remain owner game tests
