// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Root calls receive before the standard source path and shouldBlock at each deferred source boundary. */
const NAME='DanganronpaPcText',ENGINE='spikechunsoft',ORIGIN='danganronpa-pc',AUTH=Symbol('DR1-PC-source');
const sessions=new WeakMap();
const tagged=m=>!!m&&(/^DanganronpaPc/.test(String(m.sourceName||''))||m.origin===ORIGIN||!!m[AUTH]);
function allowed(h,owner=ownerAPI()){
 try{return h?.disposed!==true&&!h?.stopPending&&!h?.stopError&&h?.wanted!==false&&h?.profile?.engine===ENGINE&&h.profile.draw?.spikechunsoftInput===true&&h.target?.pid>0&&
  owner.allowed(h.ownerTestGrant,{exe:h.profileInput?.exe,engine:ENGINE,capability:'diagnostic-input'})===true&&
  owner.matches(h.ownerTestGrant,{pid:h.target.pid,birth:h.target.started})===true;}catch{return false;}
}
function ownerAPI(){try{return require('./owner-tests.cjs');}catch{return null;}}
function shouldBlock(h,m,origin,owner=ownerAPI()){
 if(!tagged(m)&&origin!==ORIGIN)return false;const mark=m?.[AUTH];
 return !mark||m.sourceName!==NAME||m.origin!==ORIGIN||mark.token!==h?.ownerTestGrant||mark.serial!==h?.serial||
  mark.pid!==h?.target?.pid||mark.birth!==h?.target?.started||!allowed(h,owner);
}
function receive(h,m,name,owner=ownerAPI()){
 if(!tagged(m))return false;
 if(m?.sourceName!==NAME||m.origin==='history'||!allowed(h,owner)||typeof m.text!=='string'||!m.text.trim()||m.text.length>4000)return true;
 const old=sessions.get(h),target=h.target;
 if(old&&old.pid===target.pid&&old.birth===target.started&&old.token!==h.ownerTestGrant)return true;
 sessions.set(h,{pid:target.pid,birth:target.started,token:h.ownerTestGrant});
 const source={...m,origin:ORIGIN};source[AUTH]=Object.freeze({token:h.ownerTestGrant,serial:h.serial,pid:h.target.pid,birth:h.target.started});
 h.source(source,name);return true;
}
function clear(h){
 if(h?.state?.hookSourceOrigin!==ORIGIN)return false;
 h.lastSource='';h.lastSourceAt=0;try{h.notify({hookSource:'',hookSpeaker:'',hookActive:false,receivedText:false,hookSourceOrigin:'danganronpa-revoked',hookSequence:(h.state.hookSequence||0)+1});return true;}
 catch{try{h.trace?.('Danganronpa private source clear notification failed');}catch{}return false;}
}
module.exports={NAME,ENGINE,ORIGIN,tagged,receive,shouldBlock,allowed,clear};
