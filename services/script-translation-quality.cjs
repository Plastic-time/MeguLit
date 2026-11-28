// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {translated}=require('./align-sample.cjs');

// Only count slots identified by a script instruction. Unclassified text can
// include names, menus, unused rows and further dialogue or choices.
function translationQuality(index,localLines){
 const {lines,roles}=index;
 if(typeof roles!=='string'||roles.length!==lines.length||!/[bc]/.test(roles))return null;
 const group=()=>({extracted:0,localPaired:Array.isArray(localLines)?0:null,workTotal:null});
 const body=group(),choice=group();
 for(let i=0;i<lines.length;i++){
  const counts=roles[i]==='b'?body:roles[i]==='c'?choice:null;
  if(!counts)continue;
  counts.extracted++;
  if(translated(localLines?.[i],lines[i]))counts.localPaired++;
 }
 return {basis:'identified-script-slots',body,choice};
}
// Options are queried independently of the moving dialogue cursor. When the
// capture provides only a label, all its possible slots must agree.
function choiceLookup(japanese,chinese,roles,identityRoles=roles){
 if(!chinese?.length)return ()=>({status:'none'});
 let labels;
 const classified=identityRoles&&/[bc]/.test(identityRoles);
 const key=text=>String(text||'').replace(/\s+/g,'');
 return function resolveChoice(text){
  if(!labels){
   labels=new Map();
   for(let i=0;i<japanese.length;i++){
    if(!japanese[i]||roles?.[i]==='i'||classified&&roles[i]!=='c')continue;
    const label=key(japanese[i]),value=translated(chinese[i],japanese[i])?chinese[i]:'';
    labels.set(label,!labels.has(label)||labels.get(label)===value?value:'');
   }
  }
  const translation=labels.get(key(text));
  return translation?{status:'exact',translation,source:'local-script'}:{status:'none'};
 };
}
// Count returned requests in the retained reader logs. These are observations
// of the resolver, independent of indexed coverage and of screen visibility.
function returnedSources(log,gameId,runtime,patch){
 if(!log||!runtime)return null;
 const result={basis:'reader-replies',body:{},choice:{}};
 const sources=new Set(['official','patch','script','filled','machine','mt','local','api','unknown','unavailable']);
 const {isKnownProvider}=require('../core/providers.cjs');
 let observed=false;
 for(const line of log.split('\n')){
  if(!line.includes('"translationReturned"'))continue;
  let row;try{row=JSON.parse(line);}catch{continue;}
  if(row.type!=='translationReturned'||row.game!==gameId||row.runtime!==runtime||row.patch!==patch||
   !['body','choice'].includes(row.role)||!sources.has(row.source))continue;
  const key=isKnownProvider(row.provider)?row.source+'/'+row.provider:row.source;
  result[row.role][key]=(result[row.role][key]||0)+1;
  observed=true;
 }
 return observed?result:null;
}
module.exports={translationQuality,choiceLookup,returnedSources};
