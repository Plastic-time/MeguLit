# Musica ordinary body hook candidate

This candidate reads one version's complete message body through ordinary Luna `NewHook`, and remains off unless all private gates pass
It has not passed game attachment or Reader acceptance

## Exact pair

| Item | Value |
| --- | --- |
| Executable | `mashiroiro.exe`, 1126400 bytes, I386 |
| EXE SHA256 | `05f51cfe00436c91c6a0102fb79d8e9d751b6ec88795b164b4640d953842f050` |
| Scenario | adjacent `scr.dat`, 6134556 bytes |
| Scenario SHA256 | `638c5c40d0856105f21a8ac50cca3b6159e831a2361699db108eacfe28f8ee78` |
| PE timestamp | `1255905404` |
| Mapped image size | `1150976` |
| Message execute RVA | `0x6749b` |

The installed EXE differs from its `.bak`, whose SHA256 is `665e636eac116cd0857bc99acebc6fbcb296f4a477a42946eb760050aaa854b2`
The backup is not authorized by this candidate
Neither filename nor the backup proves an official Japanese release

## Static body contract

The `.message` command registration at VA `0x449b76` constructs the object through `0x467338`
The constructor assigns vtable `0x4a22d0`, whose `+4` is parser `0x467423` and `+8` is execute `0x46749b`
The parser requires four 16-byte strings, maps index 0 to integer ID, index 1 to voice at object `+0x44`, index 2 to name at `+0x24`, and index 3 to body at `+0x34`

The execute method is thiscall with `ECX=message object` and no stack arguments, ending in plain `ret`
It passes ID, voice, name, body and flags to `0x41ca46`, which returns with `ret 0x14`
That method copies body into engine `+0xeb0`, name into `+0xec4` and voice into `+0xed4`
This directly associates the selected input with the message body before drawing
The generic VM dispatcher and final rendering target have not been closed by this work

The engine's old MSVC string stores allocator at `+0`, pointer at `+4`, byte length at `+8`, and capacity at `+0xc`
It is not a modern SSO string and is not itself a `char*`
The callback reads only the body, checks the exact object vtable, copies at most 8000 bytes, requires a terminal NUL and stable metadata, and decodes strict CP932 into at most 4000 UTF-16 units
It preserves formatting escapes and refuses invalid input or oversized UTF-8 output rather than clipping it
It does not label speaker, choice, position, ruby or hidden status

## Private activation

All four variables must be inherited by the target game process before injection

```text
MEGULIT_OWNER_TESTS=1
MEGULIT_SIDE_BY_SIDE=1
MEGULIT_MUSICA_BASIC=05f51cfe00436c91c6a0102fb79d8e9d751b6ec88795b164b4640d953842f050
MEGULIT_MUSICA_EXE=<canonical absolute expected executable path>
```

The engine matcher verifies complete EXE and scenario SHA256, unchanged handle identity and file stamps during hashing, canonical expected EXE identity, PE metadata, execute/parser bytes, relocated constructor/vtable pointers and the `.message` token
This is a startup identity check, not continuous protection against resource changes after attachment
An absent gate performs no file hashing and leaves ordinary engine matching unchanged
The engine is not certain, so failed authorization or failed `NewHook` continues the existing list

The callback uses ordinary `USING_STRING | NO_CONTEXT | CODEC_UTF8`, with a custom body reader and no embed/writeback
It clears output on failure, checks private opt-in again, rejects guard/noaccess pages without consuming their guard, and handles access exceptions
It creates no second observer API or permission poller
Normal Luna detachment owns hook lifetime

Root must add only these four exact keys to the private target-process launch path, matching its catalog game and this pair
This candidate does not edit the shared launcher, HookBridge, HookNative or Reader
The private launcher must also retain `MEGULIT_UNIFIED_ADAPTERS=1` to select the unified runtime

## Source investigation

| Source | Fixed revision | License | Use |
| --- | --- | --- | --- |
| [VNTranslationTools](https://github.com/arcusmaximus/VNTranslationTools) | `36fbe909d02f2e9bb187443e03e2df595f56bfec` | MIT | README confirms Musica `.sc` format support |
| [GARbro](https://github.com/morkt/GARbro/blob/master/ArcFormats/Musica/ArcPAZ.cs) | `b09ee4570ccb1daf6ac56710ee8934dc0b8baeb0` | MIT | Archive format cross-check against existing `paz.cjs` |
| [Textractor](https://github.com/Artikash/Textractor) | `df5b830d1757a66aa162f8081e99d42c9bd50488` | GPL-3.0 | Existing ordinary hook API and local preserved engine survey |
| [LunaTranslator](https://github.com/HIllya51/LunaTranslator) | local preserved attribution `a744a80f`, release 12.1.3.11 | GPL-3.0 | Existing runtime already used by this project |

No external engine implementation was copied in this change
The bounded investigation found no ready-made exact Musica body entry; this is not a claim about all upstream history
Restricted VNR model-directory access and two restricted source-link clicks were stopped without alternate-path retries

## Verification and remaining acceptance

`node --test validation/musica-basic.test.cjs` checks portable byte pins, relocation, every pinned byte mutation, wrong shapes, full-hash refusal and build registration
`tools/engine-sigs/musica-basic.cjs <exe> <scr.dat>` independently checks the exact installed pair without running it
`native/megulithook/selftest/musica-basic.cpp` includes the production header and uses controlled `ENGINE`, `TextBuffer` and `NewHook` API doubles
Its buffer capacity is deliberately 4096 bytes to test overflow rejection
The fixture exercises hash/path checks, mapped pins, default-off behavior, CP932 trail-backslash decoding, malformed data, page boundaries, guard preservation and concurrent readers
The fixture does not patch a game, execute the target method or prove original ABI/FP preservation by Luna's hook core

Root still needs to compile the unified x86 DLL, pin its bytes and source, add the private launch keys, and perform ordinary body-stream attachment in an isolated game copy
Then record at least 10 body advances into the real Reader, compare actual text against visible dialogue, stop cleanly and verify sound restoration
Names, choices, ruby, translation, point reading, replacement/hiding, position and page cleanup remain unaccepted until measured individually
No seven-field or complete-language claim follows from the three small static scenario entries
