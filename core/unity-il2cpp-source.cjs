// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {randomBytes}=require('node:crypto');
const {UnityBox}=require('./unity-source.cjs');
const {sameOwner}=require('./unity-kemco-source.cjs');
const PREFIX='ToMe_UNITY il2cpp1 ',AUTH=Symbol('unity-il2cpp-source');
function tagged(m){return !!m?.[AUTH];}
function shouldBlock(path,m,owner){
 if(!tagged(m)&&m?.origin!=='unity-il2cpp')return false;
 try{return typeof path?.blockIl2CppSource!=='function'||path.blockIl2CppSource(m,owner)!==false;}catch{return true;}
}
class UnityIl2CppSource{
 constructor({onSource=()=>false,onClear=()=>{},canUse=()=>false,scope=randomBytes(16).toString('hex'),holdMs=3000,quickHoldMs=350}={}){
  if(!/^[a-f0-9]{32}$/.test(scope))throw Error('UNITY_IL2CPP_SCOPE');
  Object.assign(this,{onSource,onClear,canUse,scope});this.seq=0;this.enabled=false;this.streams=new Map();
  this.box=new UnityBox(Date.now,(text,payload)=>{if(!this.block(payload,payload.unityOwner))try{this.onSource({...payload,text});}catch{}},holdMs,quickHoldMs);
 }
 usable(){try{return !!this.peer&&this.canUse(this.peer)===true;}catch{return false;}}
 refresh(){const on=!this.stopped&&this.usable();if(!on&&this.enabled)this.reset();this.enabled=on;return this.command();}
 command(){return 'SOURCE '+this.scope+' '+(this.enabled?1:0)+'\n';}
 reset(){for(const s of this.box.streams.values())this.box.cancel(s);this.box.streams.clear();this.streams.clear();try{this.onClear({unityOwner:this.peer,all:true});}catch{}}
 disconnect(){this.enabled=false;this.reset();this.peer=null;this.seq=0;}
 stop(){this.stopped=true;this.disconnect();}
 block(m,owner){const token=m?.[AUTH];return !token||this.stopped||!this.enabled||!this.usable()||!sameOwner(owner,this.peer)||this.streams.get(m.il2cppStream)!==token;}
 accept(line){
  if(typeof line!=='string'||!line.startsWith(PREFIX))return false;
  const f=line.slice(PREFIX.length).split('\t');if(f[0]!==this.scope)return true;
  if(this.stopped||line.length>22000||f.length!==7)return true;
  const [,sq,pid,birth,stream,kind,encoded]=f,seq=Number(sq),owner={pid:Number(pid),started:birth};
  if(!/^[1-9]\d{0,15}$/.test(sq)||!Number.isSafeInteger(seq)||seq<=this.seq||!/^[1-9]\d{0,9}$/.test(pid)||String(owner.pid)!==pid||!sameOwner(owner,owner)||!/^[a-f0-9]{1,16}$/.test(stream)||!['hello','full','clear'].includes(kind))return true;
  if(this.peer&&!sameOwner(this.peer,owner))return true;
  if(kind==='hello'){
   if(this.peer||stream!=='0'||encoded!=='')return true;
   this.peer=Object.freeze(owner);this.seq=seq;this.refresh();return true;
  }
  if(!this.peer||stream==='0'||!this.enabled||!this.usable())return true;
  if(encoded.length>21336||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return true;
  let text;try{const bytes=Buffer.from(encoded,'base64');if(bytes.length>16000||bytes.toString('base64')!==encoded)return true;text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return true;}
  if(text.length>4000||/\p{Cc}/u.test(text.replace(/[\n\r\t]/g,''))||kind==='clear'&&text!==''||kind==='full'&&!text)return true;
  this.seq=seq;
  const clean=kind==='full'?require('./hook-native.cjs').cleanSource(text,'Unity IL2CPP setter','IL2CPP:'+stream+':JIT:UNITY'):'';
  if(kind==='clear'||!clean.trim()){
   const state=this.box.streams.get(stream);if(state)this.box.cancel(state);this.box.streams.delete(stream);this.streams.delete(stream);
   try{this.onClear({unityOwner:this.peer,il2cppStream:stream});}catch{}return true;
  }
  if(!this.streams.has(stream)){
   if(this.streams.size>=256){const old=this.streams.keys().next().value,state=this.box.streams.get(old);if(state)this.box.cancel(state);this.box.streams.delete(old);this.streams.delete(old);}
   this.streams.set(stream,{});
  }
  const m={text,origin:'unity-il2cpp',sourceName:'Unity IL2CPP setter',sourceCode:'IL2CPP:'+stream+':JIT:UNITY',unityBoxed:true,unityOwner:this.peer,il2cppStream:stream,hookActive:true};m[AUTH]=this.streams.get(stream);
  this.box.feed(stream,clean,m);
  return true;
 }
}
module.exports={UnityIl2CppSource,PREFIX,shouldBlock,tagged};
