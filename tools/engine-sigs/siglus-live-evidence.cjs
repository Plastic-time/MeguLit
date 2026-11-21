/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
/* Evidence inventory only: a complete inventory still needs a person to inspect
   the actual game/screens/DOM/ACK correspondence, and cannot enable any hook */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const fixtures=require('../../validation/fixtures/engine-sigs/siglus-draw.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sha=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function inspect(manifest,readArtifact){
 const missing=[],used=new Set(),fail=message=>missing.push(message);
 if(manifest?.schema!==1||manifest?.engine!=='siglus')fail('Siglus schema 1 required');
 const fixture=Object.hasOwn(fixtures.games,manifest?.game)?fixtures.games[manifest.game]:null;
 if(!fixture||manifest.exeSha256!==fixture.sha256)fail('exact fixture exe identity required');
 if(manifest?.captureKind!=='real-game')fail('real-game capture required; static/replay/template cannot qualify');
 if(!/^[0-9a-f]{40}$/.test(manifest?.build?.commit||'')||!sha(manifest?.build?.hook32Sha256)||!sha(manifest?.build?.meguLitSha256))fail('final source/Hook32/MeguLit hashes required');
 if(manifest?.slot?.allocatedByRoot!==true||![1,2,3,4].includes(manifest?.slot?.number))fail('root-allocated slot required');
 function ref(id,label){
  if(typeof id!=='string'||!id){fail(label+' evidence required');return;}
  const artifact=manifest.artifacts?.[id];
  if(!artifact||typeof artifact.path!=='string'||!sha(artifact.sha256)){fail(label+' artifact identity required');return;}
  if(used.has(id))return;used.add(id);
  if(typeof readArtifact!=='function'){fail('artifact reader required');return;}
  try{const bytes=readArtifact(artifact.path);if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>32*1024*1024||hash(bytes)!==artifact.sha256)fail(id+' artifact missing/oversized/hash mismatch');}
  catch(error){fail(id+' artifact unreadable: '+error.message);}
 }
 for(const role of ['line','name','choice'])ref(manifest?.roles?.[role],role);
 for(const check of ['defaultOff','optIn','revoked','ruby','pageClear','audioRestored','processClosed'])ref(manifest?.checks?.[check],check);
 const lines=Array.isArray(manifest?.lines)?manifest.lines:[],unique=new Set();
 for(const [i,line]of lines.entries()){
  const text=typeof line.japanese==='string'?line.japanese.replace(/\s/g,''):'';
  if(!/[\u3040-\u30ff]/u.test(text)||unique.has(text))fail('line '+i+' needs unique Japanese text');unique.add(text);
  if(typeof line.sourceId!=='string'||!line.sourceId)fail('line '+i+' source identity required');
  for(const field of ['hidden','dom','lookup','translationAck','advanced'])ref(line[field],'line '+i+' '+field);
 }
 if(lines.length<10||unique.size<10)fail('at least 10 unique Japanese lines required');
 return {schema:1,kind:'evidence-inventory',readyForHumanReview:missing.length===0,liveAccepted:false,missing,
  limits:['Hashes and declared capture metadata cannot authenticate real gameplay','A person must verify role/text/coordinates, hidden originals, actual lookup and rendered translation ACK correspondence','No seed allowlist, runtime permission or release gate is changed']};
}
function inspectFile(file){
 const directory=path.dirname(path.resolve(file)),root=fs.realpathSync(directory);
 return inspect(JSON.parse(fs.readFileSync(file,'utf8')),relative=>{
  if(path.isAbsolute(relative))throw Error('artifact path must be relative to manifest');
  const resolved=fs.realpathSync(path.resolve(directory,relative)),within=path.relative(root,resolved);
  if(within.startsWith('..'+path.sep)||within==='..'||path.isAbsolute(within))throw Error('artifact outside evidence directory');
  const stat=fs.statSync(resolved);if(!stat.isFile()||stat.size>32*1024*1024)throw Error('bounded artifact file required');
  return fs.readFileSync(resolved);
 });
}
module.exports={inspect,inspectFile};
if(require.main===module){try{const report=inspectFile(process.argv[2]);process.stdout.write(JSON.stringify(report,null,2)+'\n');if(!report.readyForHumanReview)process.exitCode=1;}catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}}
