'use strict';
/* P0 2026-11-21: a runtime-dump pack below contract 3 (the recursing build users still had from 2026-11-13) is never loaded */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const N=p=>fs.readFileSync(path.join(__dirname,'..','native',p),'utf8');
test('stale runtime-dump pack is treated as absent; the source build is contract 4',()=>{
 const cs=N('HookBridge.cs');
 assert.match(cs,/internal const int MinDumpContract=4;/);
 assert.match(cs,/int c=PackContract\(pack\);if\(c>=MinDumpContract\)return f;/);
 assert.match(cs,/below "\+MinDumpContract\+" \(known crash or startup hang\)/);
 assert.match(N('runtimedump/RuntimeDump.cpp'),/int MeguLitDumpVersion\(\) \{ return 4; \}/);
 assert.match(N('runtimedump/pack.ps1'),/contract=4;/);
});
