'use strict';
/* 2026-11-19 (アマカノ2 / CatSystem2 "挂上以后卡卡的"): the game thread waits for the bridge's embed answer. The replay itself is
   native/megulithook/selftest/embedwait.cpp (run.cmd); this checks that the hook and the bridge keep using it. */
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('native cache uses exact complete binary input rather than a lossy 64-bit text identity',()=>{
 const h=read('native/megulithook/MeguLitEmbedWait.h'),e=read('native/megulithook/embed_util.cc');
 assert.match(h,/std::unordered_map<std::string, Entry> map;/);
 assert.match(h,/inline std::string Key\(UINT64 addr, UINT64 ctx, UINT64 ctx2, const void \*data, size_t len\)[\s\S]*?key\.append\(static_cast<const char \*>\(data\), len\);\s*return key;/);
 assert.match(e,/static std::string textkey\(const ThreadParam &tp, const void \*data, size_t len\)\s*\{\s*return MeguLitEmbed::Key\(tp\.addr, tp\.ctx, tp\.ctx2, data, len\);/);
 assert.equal((e.match(/translatecache\.Find\(textkey\(tp, buff\.data, buff\.size\)/g)||[]).length,1,'the preflight cache read uses the stream and all raw bytes');
 assert.match(e,/auto key = textkey\(tp, buff->data, buff->size\);/,'writeback uses the same identity');
 assert.equal((e.match(/textkey\(/g)||[]).length,3,'no cache read or write without the stream');
 assert.doesNotMatch(e,/checktranslatedok/,'the text-only lookup is gone (upstream calls it only from texthook.cc, which MeguLit replaced)');
 assert.doesNotMatch(e,/\btexthash\s*\(/,'the lossy prefix-discarding hash is no longer used');
 const replay=read('native/megulithook/selftest/embedwait.cpp');
 assert.match(replay,/CheckCacheIdentity\(\);/,'the existing dual-architecture native replay executes the collision regression');
 assert.match(replay,/MeguLitEmbed::Key\(0x401000, stream, 0, text\.data\(\)/,'the replay keys its cache like embed_util.cc');
 assert.match(replay,/three contexts with the selected line ask the bridge themselves/,'#696 review: the replay warms the selected stream, then three contexts with its line');
});
test('hook: the answer event exists before the line goes out, every answer is cached per generation, only waiting streams clear the answer buffer',()=>{
 const h=read('native/megulithook/MeguLitEmbedWait.h');
 assert.match(h,/const ULONGLONG UnchangedTtlMs = 500;/);
 assert.match(h,/bool unchanged = answer\.empty\(\);/);
 const e=read('native/megulithook/embed_util.cc');
 assert.match(e,/static_assert\(offsetof\(CommonSharedMem, hash\) == 16/);
 assert.match(e,/int MeguLitEmbedArm\(HookParam &hp, TextBuffer &buff, const ThreadParam &tp\)\s*\{\s*if \(!check_embed_able\(tp\)\)\s*return -1;/,'a stream that is not selected returns before anything else');
 assert.match(e,/ZeroMemory\(commonsharedmem->text[^;]*;[^\n]*\n[^\n]*\n\s*MeguLitEmbed::Arm\(/,'the buffer is cleared and the event made just before the line goes out');
 assert.match(e,/translatecache\.Put\(key, generation, GetTickCount64\(\), translate\);\s*if \(\(translate\.size\(\) == 0\)\)\s*return false;/,'an empty answer is cached too');
 const t=read('native/megulithook/texthook.cc');
 assert.match(t,/int armed = MeguLitEmbedArm\(hp, buff, tp\);/);
 assert.match(t,/if \(armed > 0 \|\| armed == -2\)\s*buffer->type &= \(~EMBED_ABLE\);/,'never strips EMBED_ABLE from a stream that is not selected');
 assert.doesNotMatch(t,/checktranslatedok\(buff\)/);
 for(const f of ['build-x86.cmd','build-x64.cmd'])assert.match(read('native/megulithook/'+f),/MeguLitEmbedWait\.h texthook\.cc/,f);
 const r=read('native/megulithook/selftest/run.cmd');
 assert.match(r,/embedwait\.exe" --old >nul\r?\n if not errorlevel 1 \(echo FAIL/,'the replay must fail on the old waiting');});
test('bridge: hide waits at most 100 ms, no fixed sleep before the answer, generation bumped on every state change, log off the hot path',()=>{
 const b=read('native/HookBridge.cs');
 assert.match(b,/const uint HideWaitMs=100;/);
 assert.doesNotMatch(b,/Thread\.Sleep\(8\)/);
 assert.match(b,/GlyphLine\(text\);GlyphDrain\(8\);try\{Luna_EmbedCallback\(tp,text,text\);\}/);
 assert.match(b,/MemoryMappedFile\.OpenExisting\("EMBED_SHARED_MEM"\+Pid\);EmbedView=EmbedMem\.CreateViewAccessor\(16,8\);/);
 assert.match(b,/static void OnEmbedAnswer\(string text,ThreadParam tp\)\{SyncEmbedGeneration\(\);/);
 assert.match(b,/Heartbeat\(\);SyncEmbedGeneration\(\);Thread\.Sleep\(40\);/);
 for(const k of ['Selected','ReplacementEnabled','TranslateMode','MarksMode','GlyphAll','SkipHeld','EngineDialogHidden','HookTarget.ChineseText','c.hideOnly'])assert.ok(b.includes('static string EmbedStateKey(){')&&b.slice(b.indexOf('static string EmbedStateKey(){')).split('\n')[0].includes(k),k);
 assert.match(b,/static void Diagnostic\(string value\)\{DiagQueue\.Enqueue\(/);});

test('the hook reports how long the game thread waited for answers (histogram in the hook diagnostics every 30 s)',()=>{
 const s=require('node:fs').readFileSync(require('node:path').join(__dirname,'../native/megulithook/embed_util.cc'),'utf8');
 assert.match(s,/Msg::Log\("MeguLit embed waits ms <5:%d <20:%d <50:%d <100:%d <500:%d >=500:%d timeout:%d"/);
 assert.match(s,/InterlockedCompareExchange\(&MeguLitWaitReported, now, last\) == last/,'one thread reports per period');
});
