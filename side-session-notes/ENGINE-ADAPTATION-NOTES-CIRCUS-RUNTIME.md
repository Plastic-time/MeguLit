# CIRCUS ordinary runtime notes

2026-11-22, baseline 25b466ff, codex/engine-circus-runtime

- Layer: dedicated tests/evidence/docs for an existing ordinary stock hook; no product/native/core/Reader/bridge/default/seed change
- Identify the exact file and real detector before treating a publisher as an engine family. Full DC4UP has Advdata/GRP/NAMES.DAT and stock c3's actual setter, while the older Circus2 pattern has zero hits
- Follow short-circuit attachment: old InsertCircusHook2 fails, c3 requests Circus2_1 at RVA42890 with stack[1]/USING_STRING. Do not add another hook to the same string path
- Name and body share a hook label but have distinct return contexts. Current texthook uses module-relative contexts; absolute static VAs should not be saved as universal stream identities
- Publisher startup is DC4UP_dstart.exe; the bound hook target is DC4UP.exe. The launcher is not the engine module to scan
- The chosen runtime's host is MeguLitHost64.dll. Missing LunaHost64.dll in that directory is not a missing-host failure; HookNative's earlier runtime/hook prerequisites are separate
- A console with a NewHook recorder proves matching and requested parameters, not MinHook installation, ABI preservation, a live game stream or Reader display. Keep those receipt fields false
- Old code/data removed: none. No replacement was added because the existing ordinary hook already matches this exact sample. Root may update its private readiness description, while live foreground/advanced gates remain pending
