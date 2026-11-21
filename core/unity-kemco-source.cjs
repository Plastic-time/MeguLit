// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {randomBytes}=require('node:crypto'),{performance}=require('node:perf_hooks');
const SHA='c4d74235dc06d19630d8b826e49bd3d047c09bc03e8d8badeb0d60dd71dd7314';
const PREFIX='ToMe_UNITY kemco2 ',AUTH=Symbol('kemco-source-authority'),TTL=500,MAX_BYTES=8223;
function validOwner(o){return !!o&&Number.isInteger(o.pid)&&o.pid>0&&o.pid<=2147483647&&typeof o.started==='string'&&/^[1-9]\d{9,18}$/.test(o.started)&&BigInt(o.started)<=3155378975999999999n;}
function sameOwner(a,b){return validOwner(a)&&validOwner(b)&&a.pid===b.pid&&a.started===b.started;}
function isTaggedSource(message){return !!(message&&message[AUTH]);}
function shouldBlock(path,message,owner){
 if(typeof path?.blockSource!=='function')return isTaggedSource(message);
 try{return path.blockSource(message,owner)===true;}catch{return isTaggedSource(message);}
}
class UnityKemcoSource{
 constructor({onSource=()=>{},now=()=>performance.now(),scope=()=>randomBytes(16).toString('hex')}={}){this.onSource=onSource;this.now=now;this.newScope=scope;this.enabled=false;this.scope='';this.seq=0;this.current=null;}
 configure(on,{force=false}={}){on=on===true;if(on===this.enabled&&!force)return;this.enabled=false;this.current=null;this.peerOwner=null;this.seq=0;this.scope='';if(on){const scope=this.newScope();if(!/^[a-f0-9]{32}$/.test(scope))throw Error('UNITY_KEMCO_SCOPE');this.scope=scope;this.enabled=true;}}
 reconnect(){this.configure(this.enabled,{force:true});}
 command(){return this.enabled?'KEMCO '+this.scope+'\n':'';}
 active(){const c=this.current,t=this.now();if(!this.enabled||!c||!Number.isFinite(t)||t<c.at||t-c.at>=TTL){this.current=null;return false;}return true;}
 block(message,owner){const mark=message&&message[AUTH];if(mark)return !this.active()||mark!==this.current.token||!sameOwner(owner,this.current.owner);return this.active()&&this.current.accepted===true&&sameOwner(owner,this.current.owner);}
 accept(line){if(typeof line!=='string'||!line.startsWith(PREFIX))return false;
  if(line.length>12000){if(this.enabled&&line.startsWith(PREFIX+this.scope+'\t'))this.current=null;return true;}
  const fields=line.slice(PREFIX.length).split('\t');if(!this.enabled||fields[0]!==this.scope)return true;
  const reject=()=>{this.current=null;return true;};
  if(line.length>12000||fields.length!==8)return reject();
  const [scope,seqText,pageText,kind,sha,pidText,started,encoded]=fields,seq=Number(seqText),page=Number(pageText),at=this.now(),owner={pid:Number(pidText),started};
  if(!/^[1-9]\d{0,15}$/.test(seqText)||!Number.isSafeInteger(seq)||seq<=0||!Number.isFinite(at))return reject();
  if(seq<=this.seq)return true;
  if(!/^-?\d{1,10}$/.test(pageText)||!Number.isInteger(page)||String(page)!==pageText||page< -2147483648||page>2147483647||sha!==SHA||!['full','pending','gone'].includes(kind))return reject();
  if(!validOwner(owner)||String(owner.pid)!==pidText||this.peerOwner&&!sameOwner(this.peerOwner,owner))return reject();
  this.peerOwner=owner;
  this.seq=seq;
  if(kind!=='full'){if(encoded!==''||kind==='gone'&&page!==0)return reject();this.current=null;return true;}
  if(page===0||encoded.length>10964||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))return reject();
  let bytes,text;try{bytes=Buffer.from(encoded,'base64');if(bytes.length===0||bytes.length>MAX_BYTES||bytes.toString('base64')!==encoded)return reject();text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{return reject();}
  const scalars=[...text],newlines=scalars.filter(c=>c==='\n').length;
  if(newlines>31||scalars.length-newlines>2048||/\p{Cc}/u.test(text.replace(/\n/g,'')))return reject();
  const same=this.active()&&this.current.page===page&&this.current.text===text&&sameOwner(this.current.owner,owner);
  if(same){this.current.at=at;return true;}
  const token={},message={text,origin:'unity-kemco',sourceName:'KEMCO Message',sourceCode:'KEMCO:UNITY',hookActive:true,kemcoPage:page,unityOwner:Object.freeze(owner)};
  message[AUTH]=token;const proposed=this.current={page,text,at,token,owner,accepted:false};
  let accepted=false;try{accepted=this.onSource(message)===true;}catch{}
  if(this.current===proposed){if(accepted)proposed.accepted=true;else this.current=null;}return true;
 }
}
module.exports={UnityKemcoSource,PREFIX,SHA,TTL,sameOwner,isTaggedSource,shouldBlock};
