// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Observer=require('./artemis-observer.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Error(code);};
const MAX_INDEX=1024*1024,MAX_OUTPUT=2*1024*1024;
const AUTH=Symbol('artemis-input-authority'),authorities=new WeakMap();
function isTaggedSource(m){return !!(m&&m[AUTH]);}
function shouldBlock(session,message,owner,origin=message?.origin){
 const mark=message&&message[AUTH];
 if(!mark&&origin!=='artemis-lua-input')return false;
 const proof=mark&&typeof mark==='object'&&authorities.get(mark);
 if(!proof||session!==proof.session||session.stopped||!session.on||session.generation!==proof.generation||!session.permission())return true;
 const age=performance.now()-proof.at;
 return !Number.isFinite(age)||age<0||age>500||owner?.pid!==proof.owner.pid||owner?.started!==proof.owner.started||session.owner?.pid!==proof.owner.pid||session.owner?.started!==proof.owner.started;
}
function allowed(grant,exe){try{return require('./owner-tests.cjs').allowed(grant,{exe,engine:'artemis',capability:'lua-input'})===true;}catch{return false;}}
function regular(file,max){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)fail('ARTEMIS_FILE');return s;}
function exactRead(file,size,offset=0){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(size);if(fs.readSync(fd,b,0,size,offset)!==size)fail('ARTEMIS_TRUNCATED');return b;}finally{fs.closeSync(fd);}}
function names(dir,max=4096){const handle=fs.opendirSync(dir),out=[];try{let entry;while((entry=handle.readSync())){if(out.length>=max)fail('ARTEMIS_DIRECTORY_BUDGET');out.push(entry.name);}return out;}finally{handle.closeSync();}}
function effectiveModules(dir){
 const entries=names(dir),bases=entries.filter(n=>/\.pfs$/i.test(n));
 if(bases.length!==1)fail('ARTEMIS_ARCHIVES');
 const base=bases[0],files=[base,...entries.filter(n=>n.toLowerCase().startsWith(base.toLowerCase()+'.')&&/\.\d{3}$/.test(n)).sort((a,b)=>+a.slice(-3)-+b.slice(-3))];
 if(files.length>32)fail('ARTEMIS_ARCHIVES');
 const wanted=new Set(Object.keys(Observer.variants[0].modules)),modules={};let total=0;
 for(const name of files){
  const file=path.join(dir,name),size=regular(file,32*1024**3).size,h=exactRead(file,7);
  if(h.toString('ascii',0,3)!=='pf8')fail('ARTEMIS_ARCHIVES');
  const n=h.readUInt32LE(3);total+=n;if(n<4||n>MAX_INDEX||total>4*MAX_INDEX||n+7>size)fail('ARTEMIS_INDEX');
  const index=exactRead(file,n,7),key=crypto.createHash('sha1').update(index).digest(),count=index.readUInt32LE(0);let p=4;
  if(count>20000)fail('ARTEMIS_INDEX');
  const seen=new Set();
  for(let i=0;i<count;i++){
   if(p+4>n)fail('ARTEMIS_INDEX');const len=index.readUInt32LE(p);p+=4;
   if(!len||len>1024||p+len+12>n)fail('ARTEMIS_INDEX');
   const raw=index.subarray(p,p+len),entry=new TextDecoder('utf-8',{fatal:true}).decode(raw).replace(/\\/g,'/').toLowerCase();p+=len;
   if(entry.startsWith('/')||entry.split('/').some(x=>!x||x==='.'||x==='..')||entry.includes(':')||seen.has(entry))fail('ARTEMIS_INDEX');seen.add(entry);
   const offset=index.readUInt32LE(p+4),length=index.readUInt32LE(p+8);p+=12;
   if(offset<7+n||offset+length>size)fail('ARTEMIS_INDEX');
   if(wanted.has(entry)){if(length>65536)fail('ARTEMIS_MODULES');const b=exactRead(file,length,offset);for(let j=0;j<b.length;j++)b[j]^=key[j%20];modules[entry]=b;}
  }
 }
 const used=files.map(n=>/\.(\d{3})$/.exec(n)?.[1]).filter(Boolean).map(Number),slot=Math.max(-1,...used)+1;
 if(slot>999)fail('ARTEMIS_NO_SLOT');
 return {base,files,modules,patch:base+'.'+String(slot).padStart(3,'0')};
}
function luaString(s){return '"'+Buffer.from(s,'utf8').reduce((s,b)=>s+'\\'+String(b).padStart(3,'0'),'')+'"';}
function bootTail(prepared,{nonce,control,output}){
 let t=fs.readFileSync(path.join(__dirname,'artemis-session.lua'),'utf8');
 for(const[k,v]of Object.entries({KEY:luaString('__MeguLitArtemis_'+nonce),NONCE:luaString(nonce),CONTROL:luaString(control.replace(/\\/g,'/')),OUTPUT:luaString(output.replace(/\\/g,'/')),SAVE:luaString(path.join(path.dirname(control),'savedata').replace(/\\/g,'/')),OBSERVER:prepared.script}))t=t.replace('@'+k+'@',()=>v);
 return Buffer.from('\n'+t,'utf8');
}
/* Copies preserve the source fingerprint: even creating a hardlink changes its Windows ctime. */
async function shadowFiles(dir,shadow,archiveNames,{validate=()=>true,deadline=performance.now()+45000}={}){
 const plan=[];let copied=0,total=0;
 const add=(from,to,s)=>{if(!s.isFile()||s.isSymbolicLink())fail('ARTEMIS_FILE');total+=s.size;if(total>4*1024**3)fail('ARTEMIS_COPY_BUDGET');plan.push({from,to,bytes:s.size});};
 for(const name of names(dir)){
  const from=path.join(dir,name),s=fs.lstatSync(from);
  if(s.isSymbolicLink())fail('ARTEMIS_REPARSE');
  if(s.isDirectory()){if(!['savedata','.megulit-japanese','movie'].includes(name.toLowerCase()))fail('ARTEMIS_DIRECTORY');continue;}
  if(archiveNames.includes(name))add(from,path.join(shadow,name),s);
  else if(/\.(exe|dll)$/i.test(name)){copied+=s.size;if(copied>64*1024**2)fail('ARTEMIS_COPY_BUDGET');add(from,path.join(shadow,name),s);}
 }
 const movies=path.join(dir,'movie');
 if(fs.existsSync(movies)){
  const dest=path.join(shadow,'movie');fs.mkdirSync(dest);
  for(const name of names(movies)){
   const from=path.join(movies,name),s=regular(from,32*1024**3);
   if(!/\.(ogv|ogg|mp4|wmv|avi|mpg|mpeg)$/i.test(name))fail('ARTEMIS_MOVIE');add(from,path.join(dest,name),s);
  }
 }
 const free=()=>{const s=fs.statfsSync(shadow,{bigint:true});return s.bavail*s.bsize;},floor=10n*1024n**3n;
 // Leave room for the bounded three-member patch, manifest and initial protocol files as well
 if(free()-BigInt(total)-1024n**2n<floor)fail('ARTEMIS_DISK_BUDGET');
 let lastCheck=-Infinity;const check=()=>{const now=performance.now();if(now>deadline)fail('ARTEMIS_COPY_TIMEOUT');if(now-lastCheck>500){lastCheck=now;if(!validate())fail('ARTEMIS_SESSION_REVOKED');if(free()<floor)fail('ARTEMIS_DISK_BUDGET');}};
 const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
 for(const item of plan){
  check();const before=fs.statSync(item.from,{bigint:true});let input,output;
  try{
   input=await fs.promises.open(item.from,'r');output=await fs.promises.open(item.to,'wx');const opened=await input.stat({bigint:true});if(stamp(opened)!==stamp(before)||Number(opened.size)!==item.bytes)fail('ARTEMIS_IDENTITY_CHANGED');
   const buffer=Buffer.allocUnsafe(256*1024);let count=0;
   for(;;){check();const r=await input.read(buffer,0,Math.min(buffer.length,item.bytes-count+1),null);if(!r.bytesRead)break;count+=r.bytesRead;if(count>item.bytes)fail('ARTEMIS_IDENTITY_CHANGED');let at=0;while(at<r.bytesRead){const w=await output.write(buffer,at,r.bytesRead-at,null);if(!w.bytesWritten)fail('ARTEMIS_COPY_WRITE');at+=w.bytesWritten;}}
   if(count!==item.bytes||stamp(await input.stat({bigint:true}))!==stamp(before)||stamp(fs.statSync(item.from,{bigint:true}))!==stamp(before))fail('ARTEMIS_IDENTITY_CHANGED');
  }finally{const closed=await Promise.allSettled([input?.close(),output?.close()]);const failed=closed.find(r=>r.status==='rejected');if(failed)throw failed.reason;}
 }
 if(!validate())fail('ARTEMIS_SESSION_REVOKED');
 fs.mkdirSync(path.join(shadow,'savedata'));
 return {linked:0,copied,resourceBytes:total-copied,totalCopied:total};
}
class ArtemisSession{
 constructor({root,exe,shadow,identity,nonce,grant,canary=null,trace=()=>{}}){Object.assign(this,{root,exe,shadow,identity,nonce,grant,canary,trace});this.control=path.join(shadow,'megulit-artemis.ctl');this.output=path.join(shadow,'megulit-artemis.jsonl');this.generation=1;this.sequence=0;this.offset=0;this.partial='';this.decoder=new TextDecoder('utf-8',{fatal:true});this.owner=null;this.onSource=()=>false;this.onSemantic=()=>{};this.onStatus=()=>{};this.query=null;this.on=false;this.stopped=false;this.publish();}
 publish(){
  const now=performance.now();if(this.on&&this.lastPublish!==undefined&&now-this.lastPublish>3500)this.generation++;
  const text=`MeguLitArtemis1 ${this.nonce} ${this.generation} ${++this.sequence} ${!this.stopped&&this.on?1:0}\n`,tmp=this.control+'.tmp';fs.writeFileSync(tmp,text,{flag:'w'});
  try{fs.renameSync(tmp,this.control);}catch(e){
   /* A short CRT read can deny DELETE sharing. Keep the last complete heartbeat, never publish a partial file. */
   if(!this.stopped&&this.on&&['EACCES','EPERM','EBUSY'].includes(e.code)&&this.lastPublish!==undefined&&now-this.lastPublish<3000&&fs.existsSync(this.control))return false;
   throw e;
  }
  this.lastPublish=now;return true;
 }
 permission(){return !this.stopped&&(!this.canary||this.canary.allowed('artemis'))&&allowed(this.grant,this.exe);}
 async verify(){
  const found=await require('../services/game-process.cjs').gameProcesses(this.root,path.join(this.shadow,path.basename(this.exe)));
  if(this.stopped)return false;
  if(!Array.isArray(found)||found.length!==1||!Number.isSafeInteger(found[0].pid)||found[0].pid<=0||!/^\d{15,19}$/.test(String(found[0].started||'')))return false;
  const owner={pid:found[0].pid,started:String(found[0].started)};
  if(this.owner&&(this.owner.pid!==owner.pid||this.owner.started!==owner.started))return false;
  this.owner=owner;return true;
 }
 connect(){if(this.stopped)return Promise.resolve(false);if(this.connecting)return this.connecting;this.connecting=this.beginConnect();this.connecting.catch(()=>{});return this.connecting;}
 async beginConnect(){
  if(this.stopped||this.connected)return false;
  if(!this.permission()||!await this.verify())return false;
  if(require('./owner-tests.cjs').bind(this.grant,{pid:this.owner.pid,birth:this.owner.started})!==true)return false;
  this.unsubscribe=require('./owner-tests.cjs').onRevoke?.(this.grant,()=>{this.stop();})||null;
  if(this.stopped||!this.permission())return false;
  this.connected=true;this.on=true;this.generation++;this.canary?.arm('artemis');this.publish();
  this.timer=setInterval(()=>{if(this.query)return;this.query=this.tick().catch(e=>{try{this.onStatus(e.message);}catch{}this.stop();}).finally(()=>{this.query=null;});this.query.catch(()=>{});},500);this.timer.unref?.();return true;
 }
 async tick(){
  if(!this.permission()||!await this.verify())fail('ARTEMIS_SESSION_REVOKED');
  if(this.stopped)return;if(!this.permission())fail('ARTEMIS_SESSION_REVOKED');this.publish();this.consume();
 }
 consume(){
  if(!this.on||this.stopped)return;
  let size;try{size=regular(this.output,MAX_OUTPUT).size;}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(size<this.offset||size-this.offset>256*1024)fail('ARTEMIS_TRANSPORT_BUDGET');
  if(size===this.offset)return;const b=exactRead(this.output,size-this.offset,this.offset);this.offset=size;
  const text=this.decoder.decode(b,{stream:true});this.partial+=text;
  if(Buffer.byteLength(this.partial)>320*1024)fail('ARTEMIS_TRANSPORT_BUDGET');
  let at;while((at=this.partial.indexOf('\n'))>=0){const line=this.partial.slice(0,at);this.partial=this.partial.slice(at+1);if(Buffer.byteLength(line)>65536)fail('ARTEMIS_TRANSPORT_BUDGET');this.accept(JSON.parse(line));}
 }
 accept(m){
  if(!this.permission()||!this.on||!this.owner||m?.nonce!==this.nonce||m.generation!==this.generation||!['line','name','choice','status'].includes(m.role)||typeof m.text!=='string'||Buffer.byteLength(m.text)>8192||/[\u0000-\u0009\u000b-\u001f\u007f\ud800-\udfff]/u.test(m.text)||m.role!=='line'&&m.text.includes('\n'))return false;
  const length=[...m.text].length;if(length>(m.role==='line'?2048:m.role==='name'?256:1024))return false;
  if(!Array.isArray(m.ruby)||m.ruby.length>64)return false;
  let end=0;for(const r of m.ruby){if(!Array.isArray(r)||r.length!==3||!Number.isInteger(r[0])||!Number.isInteger(r[1])||r[0]<end||r[1]<1||r[1]>80||r[0]+r[1]>length||typeof r[2]!=='string'||![...r[2]].length||[...r[2]].length>160||/[\x00-\x1f\x7f\ud800-\udfff]/u.test(r[2]))return false;end=r[0]+r[1];}
  const owner={...this.owner};
  this.canary?.alive('artemis');
  if(m.role==='status'){if(m.text!=='installed'||m.ruby.length)return false;this.onStatus('Lua input wrappers installed; save path checked; no pixel/hide ACK');return true;}
  if(m.role!=='line'){this.onSemantic({...m,owner});return true;}
  if(!m.text.trim())return false;
  const message={text:m.text,artemisRuby:m.ruby.map(r=>r.slice()),origin:'artemis-lua-input',sourceName:'Artemis Lua input',sourceCode:'HU:ARTEMIS_INPUT',artemisOwner:owner},mark={};
  message[AUTH]=mark;authorities.set(mark,{session:this,generation:this.generation,owner,at:performance.now()});
  return this.onSource(message)===true;
 }
 hide(){} want(){} drawConfig(){} drawEmbed(){}
 exited(code){this.canary?.exited('artemis',code);return this.stop();}
 stop(){
  if(this.stopping)return this.stopping;
  let finish,failed;this.stopping=new Promise((resolve,reject)=>{finish=resolve;failed=reject;});const stopping=this.stopping;stopping.catch(()=>{if(this.stopping===stopping)this.stopping=null;});
  this.stopped=true;this.on=false;this.generation++;clearInterval(this.timer);
  this.unsubscribe?.();this.unsubscribe=null;
  try{require('./owner-tests.cjs').revoke(this.grant);}catch{}
  let error;try{this.onStop?.();}catch(e){error=e;}try{this.publish();}catch(e){error=error||e;}
  const pending=[this.query,this.connecting];Promise.allSettled(pending).then(()=>{this.owner=null;this.grant=null;if(error)failed(Object.assign(Error('READER_STOP_INCOMPLETE'),{cause:error}));else finish();});return this.stopping;
 }
}
async function prepare({root,exe,ownerTestGrant,shadowRoot,steamAppId=null,canary=null,trace=()=>{}}){
 if(!allowed(ownerTestGrant,exe))return null;
 const dir=path.dirname(exe);regular(exe,16*1024**2);
 const executable=fs.readFileSync(exe),assets=effectiveModules(dir),prepared=Observer.prepare({enabled:true,exe:executable,modules:assets.modules});
 if(prepared.state!=='prepared'||!allowed(ownerTestGrant,exe))return null;
 const parent=path.resolve(shadowRoot||path.join(root,'data','artemis-shadow')),relative=path.relative(fs.realpathSync(dir),parent);
 if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))fail('ARTEMIS_SHADOW_LOCATION');
 let ancestor=parent;while(!fs.existsSync(ancestor)){const next=path.dirname(ancestor);if(next===ancestor)fail('ARTEMIS_SHADOW_LOCATION');ancestor=next;}
 const canonical=path.relative(fs.realpathSync(dir),fs.realpathSync(ancestor));if(!canonical||!canonical.startsWith('..'+path.sep)&&canonical!=='..'&&!path.isAbsolute(canonical))fail('ARTEMIS_SHADOW_LOCATION');
 fs.mkdirSync(parent,{recursive:true});const shadow=fs.mkdtempSync(path.join(parent,'session-')),nonce=crypto.randomBytes(16).toString('hex');
 try{
  const stats=await shadowFiles(dir,shadow,assets.files,{validate:()=>allowed(ownerTestGrant,exe)}),control=path.join(shadow,'megulit-artemis.ctl'),output=path.join(shadow,'megulit-artemis.jsonl'),tail=bootTail(prepared,{nonce,control,output});
  if(hash(fs.readFileSync(path.join(shadow,path.basename(exe))))!==prepared.provenance.exe||!allowed(ownerTestGrant,exe))fail('ARTEMIS_IDENTITY_CHANGED');
  const files=Object.entries(assets.modules).map(([name,data])=>({name:name.replace(/\//g,'\\'),data:Buffer.concat([data,tail])}));
  const patch=require('./artemis-language.cjs')._internal.pf8(files);fs.writeFileSync(path.join(shadow,assets.patch),patch,{flag:'wx'});
  if(/^\d+$/.test(String(steamAppId||'')))fs.writeFileSync(path.join(shadow,'steam_appid.txt'),String(steamAppId),{flag:'wx'});
  fs.writeFileSync(path.join(shadow,'megulit-artemis-manifest.json'),JSON.stringify({version:1,source:dir,exe:prepared.provenance.exe,identity:prepared.identity,modules:prepared.provenance.members,patch:assets.patch,patchSha256:hash(patch),isolatedSave:'savedata',...stats}));
  if(await require('./owner-tests.cjs').registerLaunch(ownerTestGrant,{exe:path.join(shadow,path.basename(exe)),engine:'artemis'})!==true)fail('ARTEMIS_LAUNCH_GRANT');
  const session=new ArtemisSession({root,exe,shadow,identity:prepared.identity,nonce,grant:ownerTestGrant,canary,trace});
  return {path:'artemis',exe:path.join(shadow,path.basename(exe)),args:[],env:steamAppId?{SteamAppId:String(steamAppId),SteamGameId:String(steamAppId)}:{},cwd:shadow,session,connect:()=>session.connect()};
 }catch(e){trace('artemis-shadow-incomplete',{shadow,code:e.message});throw e;}
}
module.exports={prepare,ArtemisSession,isTaggedSource,shouldBlock,_internal:{effectiveModules,bootTail,shadowFiles,allowed}};
