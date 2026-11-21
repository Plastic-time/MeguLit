// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Local, narrow preservation checks. These do not certify complete script grammar.
const NEKO=Buffer.from('NEKOSDK_ADVSCRIPT2'),SHOW=Buffer.from('5b8365834c83588367955c8ea65d','hex');
const ENTIS=Buffer.from('Entis\x1a','latin1'),COTOPHA=Buffer.from('Cotopha Image file');
const LIMITS=Object.freeze({nekoBytes:2<<20,nekoRecords:4096});
function inspect(buffer){
 if(buffer.subarray(0,6).equals(ENTIS)&&buffer.subarray(16,16+COTOPHA.length).equals(COTOPHA))return buffer.length>=64?{kind:'entis-csx-header',checks:[{at:0,len:64}]}:{kind:'entis-csx-header',checks:[],reason:'STRUCTURE_UNSUPPORTED'};
 if(!buffer.subarray(0,NEKO.length).equals(NEKO))return {kind:null,checks:[]};
 const plan={kind:'nekosdk-advs2',checks:[{at:0,len:NEKO.length}]};
 if(buffer.length>LIMITS.nekoBytes)return {...plan,reason:'STRUCTURE_BUDGET'};
 let cursor=NEKO.length,records=0;
 for(let at=buffer.indexOf(SHOW,cursor);at>=0;at=buffer.indexOf(SHOW,cursor)){
  if(++records>LIMITS.nekoRecords)return {...plan,reason:'STRUCTURE_BUDGET'};
  if(at<4)return {...plan,reason:'STRUCTURE_UNSUPPORTED'};
  const size=buffer.readUInt32LE(at-4);
  if(size!==SHOW.length&&size!==SHOW.length+1||at+size>buffer.length||size===SHOW.length+1&&buffer[at+SHOW.length]!==0)return {...plan,reason:'STRUCTURE_UNSUPPORTED'};
  plan.checks.push({at:at-4,len:4+size});cursor=at+size;
  for(let i=0;i<2;i++){
   if(cursor+4>buffer.length)return {...plan,reason:'STRUCTURE_UNSUPPORTED'};
   const length=buffer.readUInt32LE(cursor);plan.checks.push({at:cursor,len:4});cursor+=4;
   if(length<1||length>buffer.length-cursor||buffer[cursor+length-1]!==0)return {...plan,reason:'STRUCTURE_UNSUPPORTED'};
   plan.checks.push({at:cursor+length-1,len:1});cursor+=length;
  }
 }
 return records?plan:{...plan,reason:'STRUCTURE_UNSUPPORTED'};
}
function compare(plan,original,parts){
 for(const check of plan.checks){
  const part=parts.find(p=>check.at>=p.at&&check.at+check.len<=p.at+p.bytes.length);
  if(!part)return 'STRUCTURE_UNSUPPORTED';
  if(!original.subarray(check.at,check.at+check.len).equals(part.bytes.subarray(check.at-part.at,check.at-part.at+check.len)))return 'STRUCTURE_CHANGED';
 }
 return null;
}
module.exports={LIMITS,inspect,compare};
