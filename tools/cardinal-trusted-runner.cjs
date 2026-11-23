// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),Runner=require('../services/cardinal-trusted-runner.cjs');
function argumentsFor(args){
 const positional=[],flags=new Map();for(let i=0;i<args.length;i++){const a=args[i];if(a.startsWith('--')){if(!['--key-store','--reviewer-id','--vault'].includes(a)||flags.has(a)||!args[i+1]||args[i+1].startsWith('--'))throw Error('TRUSTED_REVIEW_SIGNING_CONFIG');flags.set(a,args[++i]);}else positional.push(a);}
 const signing=flags.size?{store:flags.get('--key-store'),id:flags.get('--reviewer-id'),vault:flags.get('--vault')}:undefined;if(signing)Runner.reviewerSigner(signing);
 return {positional,signing};
}
async function main(args){
 const parsed=argumentsFor(args);args=parsed.positional;
 if(args.length===0||args.length===1&&args[0]==='status')return Runner.status();
 if(args.length!==5||args[0]!=='run')return {state:'awaiting-trusted-run',reason:'usage: run <request.json> <trusted-host-policy.json> <review-output.json> <status-output.json>',signed:false};
 const [,requestFile,policyFile,reviewFile,statusFile]=args;const request=Runner.readJSON(requestFile,Runner.MAX_REQUEST),policy=Runner.readJSON(policyFile);if(path.resolve(reviewFile)===path.resolve(statusFile))throw Error('output collision');
 for(const f of [reviewFile,statusFile]){const parent=fs.realpathSync(path.dirname(f)),state=fs.realpathSync(policy.stateRoot),relative=path.relative(state,parent);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||fs.existsSync(f))throw Error('output outside state or exists');}
 const controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{const result=await Runner.runHost(request,policy,{signal:controller.signal,signing:parsed.signing});if(result.state==='reviewed')Runner.atomic(reviewFile,result.review);const output={...result};delete output.review;Runner.atomic(statusFile,output);return output;}
 finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main(process.argv.slice(2)).then(value=>{process.stdout.write(JSON.stringify(value)+'\n');process.exitCode=value.state==='reviewed'?0:2;}).catch(()=>{process.stdout.write(JSON.stringify({state:'awaiting-trusted-run',reason:'TRUSTED_INPUT_OR_OUTPUT_UNAVAILABLE',signed:false})+'\n');process.exitCode=2;});
module.exports={main,argumentsFor};
