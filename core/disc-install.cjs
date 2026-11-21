// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const IMAGE=/\.(iso|mds|mdf|cue|bin|ccd|img|nrg)$/i;
const LIMITS=Object.freeze({roots:8,entries:20000,depth:5,installers:24,autorunBytes:65536});
function fail(code){const e=Error('DISC_'+code);e.code=e.message;throw e;}
function inside(root,file){const rel=path.relative(root,file);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function local(file,{directory=false,within}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||/[\0\r\n]/.test(file)||/^(?:\\\\|\/\/)/.test(file)||/^[\\/][?.][\\/]/.test(file))fail('UNSAFE_PATH');
 const full=path.resolve(file);let cursor=full;
 for(;;){let st;try{st=fs.lstatSync(cursor);}catch{fail('IMAGE_MISSING');}if(st.isSymbolicLink())fail('UNSAFE_PATH');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
 let st;try{st=fs.statSync(full);}catch{fail('IMAGE_MISSING');}if(directory?!st.isDirectory():!st.isFile())fail('UNSAFE_PATH');
 const real=fs.realpathSync(full);if(within&&!inside(fs.realpathSync(within),real))fail('UNSAFE_PATH');return real;
}
function companion(file,extension){const dir=path.dirname(file),stem=path.basename(file,path.extname(file));const found=fs.readdirSync(dir).find(n=>n.toLowerCase()===(stem+extension).toLowerCase());return found?local(path.join(dir,found),{within:dir}):'';}
function discText(data){
 const bom=data.length>1?(data[0]<<8)|data[1]:0;
 if(bom===0xfffe||bom===0xfeff){try{return new TextDecoder(bom===0xfffe?'utf-16le':'utf-16be',{fatal:true}).decode(data.subarray(2));}catch{fail('PAIR_MISSING');}}
 for(const encoding of ['utf-8','shift_jis'])try{return new TextDecoder(encoding,{fatal:true}).decode(data).replace(/^\ufeff/,'');}catch{}
 fail('PAIR_MISSING');
}
function selectImage(paths){
 if(!Array.isArray(paths)||!paths.length||paths.length>32)fail('IMAGE_TYPE');const selected=new Map();
 for(const input of paths){const original=local(input);if(!IMAGE.test(original))fail('IMAGE_TYPE');let image=original;const ext=path.extname(image).toLowerCase();
  if(['.mdf','.bin','.img'].includes(ext)){image=companion(image,{'.mdf':'.mds','.bin':'.cue','.img':'.ccd'}[ext]);if(!image)fail('PAIR_MISSING');}
  const descriptor=path.extname(image).toLowerCase();
  if(descriptor==='.mds'&&!companion(image,'.mdf')||descriptor==='.ccd'&&!companion(image,'.img'))fail('PAIR_MISSING');
  if(descriptor==='.cue'){
   if(fs.statSync(image).size>LIMITS.autorunBytes)fail('PAIR_MISSING');const text=discText(fs.readFileSync(image)),names=[...text.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+\S+\s*$/gmi)].map(m=>m[1]||m[2]);
   if(!names.length||names.length>32)fail('PAIR_MISSING');for(const n of names){if(path.isAbsolute(n)||/[\0\r\n:]/.test(n))fail('UNSAFE_PATH');local(path.resolve(path.dirname(image),n),{within:path.dirname(image)});}
  }
  const k=image.toLowerCase();if(!selected.has(k))selected.set(k,{image,pairedFrom:original===image?'':original});
 }
 if(selected.size!==1)fail('MULTIPLE_IMAGES');return [...selected.values()][0];
}
function rootsOf(roots){
 if(!Array.isArray(roots)||!roots.length)fail('NEED_INSTALL_ROOTS');if(roots.length>LIMITS.roots)fail('SCAN_LIMIT');const out=[];
 for(const root of roots){const dir=local(root,{directory:true});if(dir===path.parse(dir).root)fail('UNSAFE_PATH');if(!out.some(p=>inside(p,dir)))out.push(dir);}
 return out.filter((p,i)=>!out.some((q,j)=>j!==i&&inside(q,p)));
}
const SKIP=/^(?:save|savedata|saves|cache|logs?|screenshots|_commonredist|redist|directx|manual|ost|soundtrack|node_modules|\.git)$/i;
function snapshot(roots){
 const files=new Map();let count=0;
 function walk(dir,depth){let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{fail('SCAN_INCOMPLETE');}
  for(const e of entries){if(++count>LIMITS.entries)fail('SCAN_LIMIT');if(SKIP.test(e.name))continue;const file=path.join(dir,e.name);if(e.isSymbolicLink())fail('UNSAFE_PATH');
   if(e.isDirectory()){if(depth>=LIMITS.depth)fail('SCAN_LIMIT');walk(file,depth+1);}
   else if(e.isFile()&&/\.exe$/i.test(e.name)){let st;try{st=fs.statSync(file);}catch{fail('SCAN_INCOMPLETE');}files.set(file,{size:st.size,mtime:st.mtimeMs,ctime:st.ctimeMs});}
  }
 }
 for(const root of roots)walk(local(root,{directory:true}),0);return files;
}
function argv(command){
 if(typeof command!=='string'||command.length>2048||/[\0\r\n&|<>`%]/.test(command))return null;const out=[];let current='',quoted=false,started=false;
 for(const ch of command.trim()){if(ch==='"'){quoted=!quoted;started=true;}else if(/\s/.test(ch)&&!quoted){if(started){out.push(current);current='';started=false;}}else{current+=ch;started=true;}}
 if(quoted)return null;if(started)out.push(current);return out;
}
function discoverInstallers(mountRoot){
 const root=local(mountRoot,{directory:true}),found=[],seen=new Set();
 function add(relative,args,source){try{if(typeof relative!=='string'||path.isAbsolute(relative)||/[:\0\r\n]/.test(relative)||!/^.*\.exe$/i.test(relative))return;
   const file=local(path.resolve(root,relative),{within:root});if(/^(?:cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|reg|explorer)\.exe$/i.test(path.basename(file)))return;
   const key=file.toLowerCase();if(seen.has(key))return;seen.add(key);found.push({path:file,name:path.relative(root,file),args,source});}catch{}
 }
 const inf=fs.readdirSync(root).find(n=>n.toLowerCase()==='autorun.inf');
 try{if(inf){const file=local(path.join(root,inf),{within:root});if(fs.statSync(file).size<=LIMITS.autorunBytes){let data=fs.readFileSync(file),text=data[0]===255&&data[1]===254?data.subarray(2).toString('utf16le'):data.toString('utf8').replace(/^\ufeff/,'');let section='',opens=[];
   for(const line of text.split(/\r?\n/)){const s=line.trim();if(!s||/^[;#]/.test(s))continue;const h=/^\[([^\]]+)\]$/.exec(s);if(h){section=h[1].toLowerCase();continue;}const m=/^(open|shellexecute)\s*=\s*(.*)$/i.exec(s);if(section==='autorun'&&m)opens.push(m[2]);}
   // Discover the executable, but never inherit media-supplied unattended/silent switches.
   if(opens.length===1){const tokens=argv(opens[0]);if(tokens?.length)add(tokens[0],[],'autorun');}
  }}}catch{}
 let entries=0;function walk(dir,depth){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(++entries>LIMITS.entries)fail('INSTALLER_UNSAFE');if(e.isSymbolicLink())continue;const f=path.join(dir,e.name);if(e.isFile()&&/^(?:setup|install)\.exe$/i.test(e.name))add(path.relative(root,f),[],'fallback');else if(e.isDirectory()&&depth>0&&!SKIP.test(e.name))walk(f,depth-1);if(found.length>LIMITS.installers)fail('INSTALLER_UNSAFE');}}
 walk(root,2);return found;
}
class DiscInstall{
 constructor(deps){this.deps=deps;this.sessions=new Map();this.active=null;}
 view(s){return {id:s.id,state:s.state,busy:!!s.busy,image:s.image,pairedFrom:s.pairedFrom,installRoots:s.installRoots,installers:s.installers,candidates:s.candidates,imported:s.imported,mounted:!!s.mount,mountRoot:s.mount?.mountRoot||'',mountUnconfirmed:!!s.mount&&!s.mount.owned,error:s.error||'',warnings:s.warnings,keepMounted:s.keepMounted??null,driver:s.driver||null};}
 get(id){const s=this.sessions.get(id);if(!s)fail('SESSION_MISSING');return s;}
 notify(s){this.deps.changed?.(this.view(s));}
 job(s,state,fn){if(s.busy)fail('SESSION_BUSY');s.state=state;s.error='';s.busy=true;this.notify(s);s.pending=Promise.resolve().then(fn).catch(e=>{s.error=/^DISC_[A-Z_]+$/.test(e?.code||e?.message||'')?(e.code||e.message):'DISC_OPERATION_FAILED';s.state='error';}).finally(()=>{s.busy=false;this.notify(s);});return this.view(s);}
 prepare(request){
  if(this.active&&!['done','cancelled','need_install_roots'].includes(this.active.state))fail('SESSION_BUSY');const image=selectImage(request.paths),id=crypto.randomUUID();
  const s={id,...image,state:'ready_to_mount',installRoots:[],installers:[],candidates:[],imported:[],warnings:[],busy:false,mount:null};
  if(!Array.isArray(request.installRoots)||!request.installRoots.length)s.state='need_install_roots';else s.installRoots=rootsOf(request.installRoots);
  this.sessions.set(id,s);this.active=s;while(this.sessions.size>16)this.sessions.delete(this.sessions.keys().next().value);this.notify(s);return this.view(s);
 }
 async call(request){
  if(request.action==='disc_prepare')return this.prepare(request);const s=this.get(request.id);if(request.action==='disc_status')return this.view(s);if(s.busy)fail('SESSION_BUSY');
  if(request.action==='disc_mount'){
   if(s.state!=='ready_to_mount'||!s.installRoots.length)fail('STATE');if(request.consent!==true)fail('CONSENT_REQUIRED');s.consent=true;
   return this.job(s,'preparing_tools',async()=>{if((await this.deps.status()).protocolReady===false)fail('TOOL_PROTOCOL_UNCONFIRMED');await this.deps.ensureTools();const status=await this.deps.status();if(!status.driverReady){s.driver=status;s.state='awaiting_driver';return;}s.state='mounting';this.notify(s);try{s.mount=await this.deps.mount(s.image);}catch(e){if(e.mount)s.mount=e.mount;throw e;}if(!s.mount?.owned||!s.mount.deviceId||!s.mount.mountRoot)fail('MOUNT_UNCONFIRMED');s.state='finding_installer';this.notify(s);s.installers=discoverInstallers(s.mount.mountRoot);if(!s.installers.length)fail('INSTALLER_MISSING');s.state='ready_to_install';});
  }
  if(request.action==='disc_driver'){
   if(s.state!=='awaiting_driver'||!s.consent||request.confirmed!==true||request.mode!=='standard')fail('CONSENT_REQUIRED');return this.job(s,'installing_driver',async()=>{await this.deps.installDriver();const status=await this.deps.status();s.driver=status;if(!status.driverReady)fail('STANDARD_DRIVER_REQUIRED');s.state='ready_to_mount';});
  }
  if(request.action==='disc_install'){
   if(s.state!=='ready_to_install'||!s.consent)fail('STATE');const installer=s.installers.find(i=>i.path===request.installer);if(!installer)fail('INSTALLER_UNSAFE');
   return this.job(s,'preparing_install',async()=>{if(!await this.deps.verifyMount(s.mount))fail('MOUNT_CHANGED');local(installer.path,{within:s.mount.mountRoot});s.before=(this.deps.snapshot||snapshot)(s.installRoots);s.installer=await this.deps.launch(installer);s.state='installing';});
  }
  if(request.action==='disc_scan'){
   const manual=typeof request.folder==='string'&&request.folder.length>0;if(!['installing','choose_game',...(manual?['error']:[])].includes(s.state)||request.installed!==true||!manual&&!s.before)fail('STATE');
   return this.job(s,'scanning',async()=>{const roots=manual?rootsOf([request.folder]):s.installRoots,after=(this.deps.snapshot||snapshot)(roots);const changed=[];for(const [file,now]of after){const old=manual?null:s.before.get(file);if(!old||old.size!==now.size||old.mtime!==now.mtime||old.ctime!==now.ctime)changed.push(file);}
    s.candidates=(await this.deps.games(changed,roots)).map(g=>({...g,manualSelection:manual}));if(!s.candidates.length){s.warnings.push('DISC_NO_NEW_GAME');s.state='choose_game';return;}
    if(s.candidates.length===1&&!manual){const g=s.candidates[0],saved=await this.deps.importGame(g);s.imported.push({...g,id:saved.id});s.state='awaiting_unmount';}else s.state='choose_game';});
  }
  if(request.action==='disc_import'){
   if(s.state!=='choose_game')fail('STATE');const g=s.candidates.find(g=>g.executable===request.executable);if(!g)fail('GAME_INVALID');
   return this.job(s,'importing',async()=>{local(g.executable);const saved=await this.deps.importGame(g);s.imported.push({...g,id:saved.id});s.state='awaiting_unmount';});
  }
  if(request.action==='disc_finish'){
   if(!s.mount||typeof request.keepMounted!=='boolean')fail('STATE');
   if(request.keepMounted){s.keepMounted=true;s.state='done';this.notify(s);return this.view(s);}
   return this.job(s,'unmounting',async()=>{if(this.deps.installerRunning&&await this.deps.installerRunning(s.installer))fail('INSTALLER_RUNNING');if(!await this.deps.verifyMount(s.mount))fail('MOUNT_CHANGED');await this.deps.unmount(s.mount);s.mount=null;s.keepMounted=false;s.state='done';});
  }
  if(request.action==='disc_cancel'){if(s.mount){s.state='awaiting_unmount';s.warnings.push('DISC_INSTALLER_NOT_STOPPED');}else s.state='cancelled';this.notify(s);return this.view(s);}
  fail('ACTION');
 }
}
module.exports={DiscInstall,IMAGE,LIMITS,local,inside,selectImage,rootsOf,snapshot,argv,discoverInstallers,discText};
