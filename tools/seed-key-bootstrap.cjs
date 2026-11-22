// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),S=require('../services/maintainer-signing.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
function args(argv){const commands=['plan','init','public','sign'];let command='plan',at=0;if(argv[0]&&!argv[0].startsWith('--')){command=argv[0];at++;}if(!commands.includes(command))fail('SIGNING_USAGE');const options={};for(;at<argv.length;at+=2){const k=argv[at],v=argv[at+1];if(!['--store','--key-id','--role','--scope','--vault','--input','--trust','--out'].includes(k)||!v||v.startsWith('--')||Object.hasOwn(options,k))fail('SIGNING_USAGE');options[k]=v;}return {command,options};}
function read(file){if(typeof file!=='string'||!path.isAbsolute(file))fail('SIGNING_INPUT_PATH');const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>S.MAX_INPUT)fail('SIGNING_INPUT_LIMIT');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function run(argv){
 const {command,options:o}=args(argv),settings={store:o['--store'],id:o['--key-id'],role:o['--role']};
 if(command==='plan')return S.plan(settings);
 if(!settings.store||!settings.id||!o['--vault']||command==='init'&&!settings.role)fail('SIGNING_USAGE');
 const vault=S.createVault(o['--vault']);
 if(command==='init')return S.initialize({...settings,vault});
 if(command==='public')return S.exportPublic({...settings,vault});
 if(!settings.role||!o['--scope']||!o['--input'])fail('SIGNING_USAGE');
 const signed=await S.signDocument(read(o['--input']),{...settings,vault,scope:o['--scope'],trust:o['--trust']?read(o['--trust']):undefined});
 if(o['--out']){if(!path.isAbsolute(o['--out']))fail('SIGNING_OUTPUT_PATH');fs.writeFileSync(o['--out'],JSON.stringify(signed,null,2),{flag:'wx'});return {signed:true,written:true,output:o['--out']};}return signed;
}
if(require.main===module)run(process.argv.slice(2)).then(result=>process.stdout.write(JSON.stringify(result,null,2)+'\n')).catch(e=>{process.stderr.write((/^(?:SIGNING_|TORCH_)[A-Z_]+$/.test(e?.code||'')?e.code:'SIGNING_FAILED')+'\n');process.exitCode=1;});
module.exports={run};
