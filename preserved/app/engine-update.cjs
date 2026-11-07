// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
// Apply only at launcher startup, before spawning an engine. A locked old engine
// stays in place; no process is terminated and the staged update remains retryable.
function installPendingEngine(folder,note=()=>{},io=fs){
 const target=path.join(folder,'ToMe.exe'),candidate=path.join(folder,'ToMe.pending.exe'),manifest=path.join(folder,'ToMe.pending.json');
 if(!io.existsSync(candidate)||!io.existsSync(manifest))return false;
 let changed=false,backup='',originals=[],next=target+'.next';
 const atomic=(file,bytes)=>{io.writeFileSync(file+'.tmp',bytes);io.renameSync(file+'.tmp',file);};
 try{
  const update=JSON.parse(io.readFileSync(manifest,'utf8')),bytes=io.readFileSync(candidate);
  if(update.schema!==1||update.hiddenStartup!==true||! /^[a-f0-9]{64}$/.test(update.sha256)||hash(bytes)!==update.sha256||bytes[0]!==0x4d||bytes[1]!==0x5a)throw Error('invalid staged engine');
  backup=path.join(folder,'backup-startup-'+Date.now()+'-'+process.pid);io.mkdirSync(backup,{recursive:true});
  for(const suffix of ['', '.ver', '.native.json']){
   const file=target+suffix,exists=io.existsSync(file);originals.push({file,exists,backup:path.join(backup,path.basename(file))});
   if(exists)io.copyFileSync(file,path.join(backup,path.basename(file)));
  }
  io.copyFileSync(candidate,next);io.renameSync(next,target);changed=true;
  if(hash(io.readFileSync(target))!==update.sha256)throw Error('installed engine hash mismatch');
  atomic(target+'.native.json',JSON.stringify({schema:1,hiddenStartup:true,sha256:update.sha256,source:'source/hidden-startup',deployedAt:new Date().toISOString(),backup},null,2));
  atomic(target+'.ver',update.sha256);
  // Removing the descriptor commits the update; a leftover payload is harmless.
  io.unlinkSync(manifest);try{io.unlinkSync(candidate);}catch{}
  note('Installed staged native engine; backup '+backup);return true;
 }catch(error){
  if(changed)try{for(const original of originals){if(original.exists)atomic(original.file,io.readFileSync(original.backup));else if(io.existsSync(original.file))io.unlinkSync(original.file);}}catch(rollback){note('Staged engine rollback requires backup '+backup+' ('+(rollback.code||'write failed')+')');}
  note('Staged engine update deferred ('+(error.code||error.message)+')');return false;
 }finally{for(const file of [next,target+'.tmp',target+'.native.json.tmp',target+'.ver.tmp'])try{if(io.existsSync(file))io.unlinkSync(file);}catch{}}
}
module.exports={installPendingEngine};
