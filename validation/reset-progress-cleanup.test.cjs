'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');

test('settings reset and read progress leave no fixture directories behind',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fixture-cleanup-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const env={...process.env,TMPDIR:temp,TMP:temp,TEMP:temp};
 delete env.NODE_TEST_CONTEXT;
 const output=execFileSync(process.execPath,['--test','--test-reporter=tap','settings-reset.test.cjs','read-progress.test.cjs'],{
  cwd:__dirname,windowsHide:true,env,encoding:'utf8'
 });
 assert.match(output,/^ok \d+ - reset keeps only the latest five backups/m);
 assert.match(output,/^ok \d+ - the count is cached by fingerprint/m);
 const leftovers=fs.readdirSync(temp).filter(name=>/^(megulit-reset-|rp-)/.test(name));
 assert.deepEqual(leftovers,[]);
});
