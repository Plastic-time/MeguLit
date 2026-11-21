// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawnSync}=require('node:child_process');
test('the documented CPU DOM smoke still resolves to the migrated driver and retains both checks',()=>{
 const root=path.join(__dirname,'..'),doc=fs.readFileSync(path.join(root,'docs/perf-cpu-plan.md'),'utf8'),command=/`node (services\/cardinal\/driver\.cjs) (tools\/reader-replay\/scenarios\/cpu-idle-smoke\.json) <H盘输出\.json>`/.exec(doc);assert.ok(command);assert.equal(doc.includes('tools/reader-replay/driver.cjs'),false);
 const driver=path.join(root,command[1]),check=spawnSync(process.execPath,['--check',driver],{encoding:'utf8',windowsHide:true});assert.equal(check.status,0,check.stderr);
 const scenario=JSON.parse(fs.readFileSync(path.join(root,command[2]),'utf8'));assert.equal(scenario.steps.length,2);for(const step of scenario.steps)assert.doesNotThrow(()=>new vm.Script('('+step.page+')'));
 assert.match(scenario.steps[0].page,/CPU_READER_PASS/);assert.match(scenario.steps[1].page,/CPU_DRIFT_PASS/);assert.match(fs.readFileSync(driver,'utf8'),/if\(step\.page\)await page\.evaluate/);
});
