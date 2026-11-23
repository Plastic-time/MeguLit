'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');

test('settings reset and read progress leave no fixture directories behind',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-fixture-cleanup-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const env={...process.env,TMPDIR:temp,TMP:temp,TEMP:temp};
 delete env.NODE_TEST_CONTEXT;
 const child=spawnSync(process.execPath,['--test','--test-reporter=tap','settings-reset.test.cjs','read-progress.test.cjs'],{
  cwd:__dirname,windowsHide:true,env,encoding:'utf8'
 });
 if(child.error)throw child.error;
 assert.equal(child.status,0,child.stdout+child.stderr);
 assert.match(child.stdout,/^# pass [1-9]\d*$/m);
 const leftovers=fs.readdirSync(temp).filter(name=>/^(megulit-reset-|rp-)/.test(name));
 assert.deepEqual(leftovers,[]);
});
