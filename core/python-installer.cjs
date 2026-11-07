'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
const wheelName='pip-26.3-py3-none-any.whl',wheelSha='f3b60b20ffaadd4415ed7957212a38ac63fa4c5fa375bd0f4a797777940fad13';
async function ensurePip(python,root){
 try{await run(python,['-m','pip','--version'],{windowsHide:true,timeout:15000});return;}catch{}
 const wheel=path.join(root,'runtime','wheels',wheelName);
 if(!fs.existsSync(wheel)||createHash('sha256').update(fs.readFileSync(wheel)).digest('hex')!==wheelSha)throw Error('PYTHON_INSTALLER_MISSING: reinstall the bundled Python installer');
 // Use pip's verified wheel directly; no system Python or get-pip script is required.
 const code="import runpy,sys;sys.path.insert(0,sys.argv.pop(1));runpy.run_module('pip',run_name='__main__')";
 await run(python,['-c',code,wheel,'install','--no-index','--no-deps','--disable-pip-version-check',wheel],{windowsHide:true,timeout:90000,maxBuffer:1024*1024});
 await run(python,['-m','pip','--version'],{windowsHide:true,timeout:15000});
}
async function dictionariesReady(python,folder){
 if(!fs.existsSync(path.join(folder,'sudachidict_full/resources/system.dic')))return false;
 try{await run(python,['-c',"import sys;sys.path.insert(0,sys.argv[1]);import sudachipy,sudachidict_full,fugashi,unidic_lite",folder],{windowsHide:true,timeout:15000});return true;}catch{return false;}
}
module.exports={ensurePip,dictionariesReady,wheelName,wheelSha};
