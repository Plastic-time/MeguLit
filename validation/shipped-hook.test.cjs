'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
// E345: a hook DLL shipped with MeguLit replaces the runtime pack's copy, keeping the old one.
test('shipped hook build replaces the installed one once',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'hook-')),native=path.join(base,'native'),rt=path.join(base,'runtime','megulithook');
 fs.mkdirSync(path.join(native,'megulithook'),{recursive:true});fs.mkdirSync(rt,{recursive:true});
 fs.writeFileSync(path.join(native,'megulithook','MeguLitHook32.dll'),'new');fs.writeFileSync(path.join(rt,'MeguLitHook32.dll'),'old');
 HookNative.syncShippedHook(native);
 assert.equal(fs.readFileSync(path.join(rt,'MeguLitHook32.dll'),'utf8'),'new');assert.equal(fs.readFileSync(path.join(rt,'MeguLitHook32.dll.previous'),'utf8'),'old');
 assert.ok(!fs.existsSync(path.join(rt,'MeguLitHook64.dll')),'only files that ship are touched');
 fs.rmSync(base,{recursive:true,force:true});
});
