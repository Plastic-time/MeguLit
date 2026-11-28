'use strict';
/* 2026-11-28: pack-manifest.cjs moved the "runtime-dump" line in front of "archives-legacy" without a comma, so pack.ps1
   failed on the current setup/runtime.json. The entry is now replaced where it is, or added after "archives". */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const script=path.join(__dirname,'..','native','runtimedump','pack-manifest.cjs');
const write=(dir,packs)=>{const f=path.join(dir,'runtime.json');fs.writeFileSync(f,['{','    "packs":  {',...packs,'              }','}'].join('\r\n'));return f;};
const run=f=>execFileSync(process.execPath,[script,f,'10','20','AB','https://example.invalid/p.zip']);
test('runtime-dump entry is replaced in place, other entries and line endings kept',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-pack-manifest-'));
 try{
  const f=write(dir,['                  "archives":  {"size":  1},','                  "archives-legacy":  {"size":  2},','                  "runtime-dump":  {"size":3,"contract":3},','                  "disc-mount": {"size": 4}']);
  run(f);const raw=fs.readFileSync(f,'utf8'),j=JSON.parse(raw);
  assert.deepStrictEqual(Object.keys(j.packs),['archives','archives-legacy','runtime-dump','disc-mount']);
  assert.strictEqual(j.packs['runtime-dump'].contract,4);assert.strictEqual(j.packs['runtime-dump'].sha256,'AB');
  assert.strictEqual(j.packs['archives-legacy'].size,2);assert.ok(!/[^\r]\n/.test(raw));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('runtime-dump entry is added after archives, last or not',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-pack-manifest-'));
 try{
  for(const rest of [[],['                  "disc-mount": {"size": 4}']]){
   const f=write(dir,[(rest.length?'                  "archives":  {"size":  1},':'                  "archives":  {"size":  1}'),...rest]);
   run(f);const j=JSON.parse(fs.readFileSync(f,'utf8'));
   assert.deepStrictEqual(Object.keys(j.packs),['archives','runtime-dump',...(rest.length?['disc-mount']:[])]);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
