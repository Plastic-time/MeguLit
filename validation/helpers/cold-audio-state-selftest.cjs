// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const compiler=process.argv[2];
assert.ok(compiler&&fs.existsSync(compiler),'pass an installed .NET Framework csc.exe');
const source=path.resolve(__dirname,'../../native/ColdCapture.cs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-audio-state-'));
try{
 for(const architecture of ['x86','x64']){
  const output=path.join(directory,`ColdCapture-${architecture}.exe`);
  const compiled=spawnSync(compiler,['/nologo',`/platform:${architecture}`,`/out:${output}`,source],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(compiled.status,0,[compiled.error?.message,compiled.signal,compiled.stdout,compiled.stderr].filter(Boolean).join('\n'));
  const checked=spawnSync(output,['--audio-selftest'],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(checked.status,0,[checked.error?.message,checked.signal,checked.stdout,checked.stderr].filter(Boolean).join('\n'));
  for(const evidence of ['fresh wrappers retain original: pass','endpoint identities: pass','restore readback failures: pass','shared sessions never owned: pass'])assert.ok(checked.stdout.includes(evidence),checked.stdout);
  const absent=spawnSync(output,['--audio-watch','2147483647','2147483647','1'],{windowsHide:true,encoding:'utf8',timeout:30000});
  assert.equal(absent.status,1,[absent.error?.message,absent.signal,absent.stdout,absent.stderr].filter(Boolean).join('\n'));
  assert.ok(absent.stderr.includes('process identity unavailable'),absent.stderr);
  process.stdout.write(`${architecture}: ${checked.stdout}`);
 }
}finally{fs.rmSync(directory,{recursive:true,force:true});}
