// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');

const [file,...args]=process.argv.slice(2);
if(process.platform!=='win32'||!file||!path.isAbsolute(file)){
 console.error('Usage on Windows: node tools/run-isolated.cjs <absolute executable path> [arguments]');
 process.exit(2);
}

const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-test-desktop-'));
try{
 const compiler=path.join(process.env.SystemRoot,'Microsoft.NET','Framework64','v4.0.30319','csc.exe');
 const launcher=path.join(work,'RunOnTestDesktop.exe');
 const options={windowsHide:true,stdio:'inherit'};
 const build=spawnSync(compiler,['/nologo','/out:'+launcher,path.join(__dirname,'RunOnTestDesktop.cs')],options);
 if(build.error)throw build.error;
 if(build.status!==0)throw new Error('Test desktop launcher compilation failed');
 const run=spawnSync(launcher,[String(process.pid),file,...args],options);
 if(run.error)throw run.error;
 process.exitCode=run.status??2;
}finally{
 fs.rmSync(work,{recursive:true,force:true});
}
