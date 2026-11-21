// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),{StringDecoder}=require('node:string_decoder');
const R=require('../services/original-engines/rgss.cjs'),Codec=require('./rgss-scripts.cjs'),{pageScript}=require('./rgss-page.cjs'),TP=require('./text-paths.cjs');
const DLLS=new Set(['ac186c2e0103ddf208aafe027065284ee5bebaa4be791a4a3594e349a32103bf']);
const SCRIPT_TABLES=new Set(['ba4a87812cd7a758c99db81dae4530f50ce2fddff135a3cef8ecb2962309a355']);
const EXES=new Set(['771017ca0f9d18978a906d00cd4236c8e9f974f3c7388173492ed8f92901a7e8']);
const plans=new WeakSet(),artifacts=new WeakMap();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function launchProfile({root,exe,profile,title=''}){
 if(profile.layers&&profile.draw)return profile;
 if(fs.statSync(exe).size>4<<20)throw Error('RGSS_EXE_NOT_VERIFIED');
 const P=require('./profiles/index.cjs'),auto=require('./auto-profile.cjs'),key=hash(fs.readFileSync(exe)),stored=auto.load(root,key);
 return P.profileFor({engine:'rgss',exe,exeSha256:key,folder:path.dirname(exe),title,auto:stored?.source==='gate'?undefined:stored?.settings,stepDown:stored?.source==='gate'?stored.settings:undefined});
}
function relative(name){const n=String(name||'').replace(/\\/g,'/');if(!n||/^[\/]|:|\0/.test(n)||n.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('RGSS_UNSAFE_INI_PATH');return n;}
function plan(exe){
 const dir=path.dirname(exe),iniFile=path.join(dir,'Game.ini');if(fs.statSync(iniFile).size>65536)throw Error('RGSS_INI_BUDGET');const ini=fs.readFileSync(iniFile,'latin1'),get=k=>new RegExp('^'+k+'[ \t]*=[ \t]*([^\r\n]+)','im').exec(ini)?.[1]?.trim();
 const library=relative(get('Library')),scripts=relative(get('Scripts'));
 const dll=path.join(dir,library);if(!/^RGSS2\d\d[JE]?\.dll$/i.test(path.basename(library))||fs.statSync(dll).size>4<<20||!DLLS.has(hash(fs.readFileSync(dll))))throw Error('RGSS_DLL_NOT_VERIFIED');
 if(fs.statSync(exe).size>4<<20||!EXES.has(hash(fs.readFileSync(exe))))throw Error('RGSS_EXE_NOT_VERIFIED');
 if(!/^Data\/Scripts\.rvdata$/i.test(scripts))throw Error('RGSS_SCRIPTS_NOT_VERIFIED');
 if(fs.existsSync(path.join(dir,scripts)))throw Error('RGSS_LOOSE_SCRIPTS_OVERRIDE');
 const archive=path.join(dir,path.basename(exe,path.extname(exe))+'.rgss2a');if(fs.statSync(archive).size>64<<20)throw Error('RGSS_ARCHIVE_BUDGET');
 const header=fs.openSync(archive,'r');const b=Buffer.alloc(8);try{fs.readSync(header,b,0,8,0);}finally{fs.closeSync(header);}
 if(b.toString('hex')!=='5247535341440001')throw Error('RGSS_ARCHIVE_VERSION');
 const entry=R.list(archive)?.find(e=>e.name.toLowerCase()===scripts.toLowerCase());if(!entry||entry.size>8<<20)throw Error('RGSS_SCRIPTS_MISSING');
 const original=R.read(archive,entry);if(!SCRIPT_TABLES.has(hash(original)))throw Error('RGSS_SCRIPT_TABLE_NOT_VERIFIED');Codec.scriptTable(original);const result={dir,exe,archive,entry,original,library,scripts};plans.add(result);return result;
}

function shadowPath(exe,shadowRoot){return path.join(shadowRoot,'rgss-'+hash(Buffer.from(fs.realpathSync(exe).toLowerCase())).slice(0,24));}
function regular(file){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)throw Error('RGSS_SHADOW_FILE_CHANGED');return st;}
function markerAt(shadow){const file=path.join(shadow,'megulit-rgss-shadow.json');if(regular(file).size>8192)throw Error('RGSS_SHADOW_MARKER');const m=JSON.parse(fs.readFileSync(file,'utf8'));if(m.version!==1||!Number.isSafeInteger(m.sourceFiles)||m.sourceFiles<1||m.sourceFiles>5000||!Number.isSafeInteger(m.sourceBytes)||m.sourceBytes<1||m.sourceBytes>256<<20)throw Error('RGSS_SHADOW_MARKER');return m;}
function existingShadow({exe,shadowRoot}){try{const shadow=shadowPath(exe,shadowRoot),st=fs.lstatSync(shadow);if(!st.isDirectory()||st.isSymbolicLink())return null;const m=markerAt(shadow);return m.sourceExe===fs.realpathSync(exe)?path.join(shadow,path.basename(exe)):null;}catch{return null;}}

function makeShadow({source,shadowRoot,port,token}){
 if(!plans.has(source))throw Error('RGSS_SOURCE_REQUIRED');
 fs.mkdirSync(shadowRoot,{recursive:true});const base=fs.realpathSync(source.dir),container=fs.realpathSync(shadowRoot);
 if(container===base||container.startsWith(base+path.sep))throw Error('RGSS_SHADOW_INSIDE_GAME');
 const shadow=shadowPath(source.exe,container),sourceExe=fs.realpathSync(source.exe),originalArchive=fs.readFileSync(source.archive),sourceArchiveSha256=hash(originalArchive),archiveName=path.basename(source.archive);
 const patched=Codec.patchMain(source.original,pageScript({port,token})),archive=Codec.patchArchiveV1(originalArchive,source.entry,patched);
 const reused=fs.existsSync(shadow);let sourceFiles=0,sourceBytes=0;
 if(reused){
  const st=fs.lstatSync(shadow);if(!st.isDirectory()||st.isSymbolicLink())throw Error('RGSS_SHADOW_CHANGED');const m=markerAt(shadow);
  if(m.sourceExe!==sourceExe||m.sourceArchiveSha256!==sourceArchiveSha256)throw Error('RGSS_SHADOW_SOURCE_CHANGED');sourceFiles=m.sourceFiles;sourceBytes=m.sourceBytes;
  for(const name of [path.basename(source.exe),source.library,'Game.ini',archiveName])regular(path.join(shadow,name));
  if(!EXES.has(hash(fs.readFileSync(path.join(shadow,path.basename(source.exe)))))||!DLLS.has(hash(fs.readFileSync(path.join(shadow,source.library))))||hash(fs.readFileSync(path.join(shadow,archiveName)))!==m.patchedArchiveSha256)throw Error('RGSS_SHADOW_CHANGED');
  const ini=fs.readFileSync(path.join(shadow,'Game.ini'),'latin1'),get=k=>new RegExp('^'+k+'[ \\t]*=[ \\t]*([^\\r\\n]+)','im').exec(ini)?.[1]?.trim();
  if(relative(get('Library'))!==source.library||relative(get('Scripts'))!==source.scripts||fs.existsSync(path.join(shadow,source.scripts)))throw Error('RGSS_SHADOW_STARTUP_CHANGED');
 }else{
 const files=[];let total=0;
 function walk(dir,depth){if(depth>12)throw Error('RGSS_COPY_DEPTH');for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('RGSS_COPY_LINK');if(e.isDirectory())walk(f,depth+1);else if(e.isFile()){total+=fs.statSync(f).size;if(total>256<<20||files.length>=5000)throw Error('RGSS_COPY_BUDGET');files.push(f);}}}
 walk(base,0);fs.mkdirSync(shadow);
 for(const f of files){const target=path.join(shadow,path.relative(base,f));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f,target,fs.constants.COPYFILE_EXCL);}
 sourceFiles=files.length;sourceBytes=total;
 }
 fs.writeFileSync(path.join(shadow,archiveName),archive);
 const marker={version:1,sourceExe,sourceArchiveSha256,patchedArchiveSha256:hash(archive),sourceFiles,sourceBytes},file=path.join(shadow,'megulit-rgss-shadow.json'),temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(marker,null,2),{flag:'wx'});fs.renameSync(temp,file);
 const result={shadow,exe:path.join(shadow,path.basename(source.exe)),reused,files:sourceFiles,bytes:sourceBytes},files=[path.basename(source.exe),source.library,'Game.ini',archiveName,'megulit-rgss-shadow.json'].map(name=>{const file=path.join(shadow,name);return {file,bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))};});
 artifacts.set(result,{sourceExe,sourceArchive:fs.realpathSync(source.archive),container,exe:result.exe,files});return result;
}

function launchArtifact(artifact,{exe,sourceExe,shadowRoot}){const a=artifacts.get(artifact);if(!a||a.sourceExe!==sourceExe||a.exe!==exe||a.container!==shadowRoot)return null;return {sourceArchive:a.sourceArchive,files:a.files.map(f=>({...f}))};}

class RgssTextPath{
 constructor({onChars=()=>{},onStatus=()=>{},onSource=()=>false,owner=()=>0,ownerBirth=()=>''}={}){this.onChars=onChars;this.onStatus=onStatus;this.onSource=onSource;this.owner=owner;this.ownerBirth=ownerBirth;this.birth='';this.token=crypto.randomBytes(16).toString('hex');this.roles=false;this.generation=0;this.body=new Map();this.ui=new Map();this.sources=new Set();this.sockets=new Set();this.stopped=false;}
 async listen(){this.server=net.createServer(s=>this.accept(s));this.server.unref();await new Promise((resolve,reject)=>{this.server.on('error',reject);this.server.listen(0,'127.0.0.1',resolve);});this.port=this.server.address().port;this.timer=setInterval(()=>this.sync(),100);this.timer.unref();return this.port;}
 accept(socket){
  if(this.stopped||this.sockets.size>=4){socket.destroy();return;}this.sockets.add(socket);socket.setNoDelay(true);const decoder=new StringDecoder('utf8');let pending='',pid=0;
  const deadline=setTimeout(()=>{if(!pid)socket.destroy();},2000);deadline.unref();
  socket.on('data',data=>{pending+=decoder.write(data);if(Buffer.byteLength(pending)>65536){socket.destroy();return;}
   let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);
    if(!pid){const m=/^HELLO ([a-f0-9]{32}) ([1-9]\d{0,9})$/.exec(line);if(!m||m[1]!==this.token){socket.destroy();return;}pid=Number(m[2]);clearTimeout(deadline);if(this.socket)this.socket.destroy();this.socket=socket;this.pid=pid;this.birth='';this.lastSync='';this.sync();}
    else if(this.socket===socket)this.report(line,pid);
   }});
  socket.on('error',()=>{});socket.on('close',()=>{clearTimeout(deadline);this.sockets.delete(socket);if(this.socket===socket){this.socket=null;this.clear();}});
 }
 sync(){if(!this.socket||this.stopped)return;const value=Number(this.owner()),owner=Number.isSafeInteger(value)&&value>0?value:0,birth=String(this.ownerBirth()||'');if(!owner&&!this.lastSync)return;if(this.birth&&owner===this.pid&&birth!==this.birth){this.clear();this.generation++;this.socket.destroy();return;}const on=this.roles&&owner===this.pid,key=owner+'|'+birth+'|'+on;if(on)this.birth=birth;if(key===this.lastSync)return;
  this.lastSync=key;this.clear();this.generation++;this.socket.write('CFG '+this.generation+' '+(on?'1':'0')+'\n');this.onStatus('observer '+(on?'on':'off')+' owner='+owner+' generation='+this.generation);}
 drawConfig(cfg){const roles=cfg?.roles===true;if(roles!==this.roles){this.roles=roles;this.clear();this.lastSync='';this.sync();}if(cfg?.embed===true&&!this.embedNoted){this.embedNoted=true;this.onStatus('RGSS: internal embed/ruby is unavailable; reader fallback remains active');}}
 report(line,pid){
  if(this.stopped||!this.roles||Number(this.owner())!==pid||String(this.ownerBirth()||'')!==this.birth)return;
  const source=/^S ([1-9]\d{0,9}) ([1-9]\d{0,9}) ([A-Za-z0-9+/=]{1,8000})$/.exec(line);
  if(source){if(Number(source[1])!==this.generation)return;const rec=this.body.get(Number(source[2])),key=rec&&rec.line+'|'+rec.text;if(!rec||!rec.text||Buffer.from(rec.text).toString('base64')!==source[3]||this.sources.has(key))return;
   if(this.onSource({text:rec.text,line:rec.line,generation:this.generation,pid})===true){this.sources.add(key);if(this.sources.size>128)this.sources.delete(this.sources.values().next().value);}return;}
  const m=/^G ([1-9]\d{0,9}) (ToMe_CHARS .*)$/.exec(line);if(!m||Number(m[1])!==this.generation)return;
  const rec=TP.parseChars(m[2]);if(!rec||rec.engine!=='rgss'||rec.hidden||rec.emb||!Number.isSafeInteger(rec.line)||rec.line<1||rec.line>0x7fffffff||rec.rects.length>1000||rec.viewport.some(n=>n!==0)||![rec.sw,rec.sh].every(n=>Number.isFinite(n)&&n>0&&n<=16384))return;
  if(rec.rects.some(r=>r.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||r[2]<=0||r[3]<=0))return;
  if(rec.role){if(!['choice','menu','system'].includes(rec.role)||!/^W\d+:\d*$/.test(rec.id||'')||!rec.box||rec.box.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||rec.text&&(rec.box[2]<=0||rec.box[3]<=0))return;
   const group=rec.role+'|'+rec.id.split(':')[0];if(rec.text){if(this.ui.size>=128&&!this.ui.has(group))return;this.ui.set(group,rec);}else this.ui.delete(group);
  }else if(rec.text){if(this.body.size>=128&&!this.body.has(rec.line))return;this.body.set(rec.line,rec);}else this.body.delete(rec.line);
  this.onChars(m[2]);
 }
 clear(){for(const rec of this.body.values())this.onChars(TP.formatChars({...rec,text:'',rects:[],hidden:false}));for(const rec of this.ui.values())this.onChars(TP.formatChars({...rec,text:'',rects:[],box:[0,0,0,0],id:rec.id.split(':')[0]+':',hidden:false}));this.body.clear();this.ui.clear();this.sources.clear();}
 hide(){} want(){} drawEmbed(){} exited(){}
 watch(pid,{alive=p=>{try{process.kill(p,0);return true;}catch(e){return e.code==='EPERM';}},every=1000}={}){clearInterval(this.exitTimer);if(!Number.isSafeInteger(pid)||pid<=0)return;this.exitTimer=setInterval(()=>{if(!alive(pid))this.stop();},every);this.exitTimer.unref();}
 stop(){if(this.stopped)return;this.stopped=true;this.clear();clearInterval(this.timer);clearInterval(this.exitTimer);for(const s of this.sockets)s.destroy();this.sockets.clear();this.server?.close();}
}
module.exports={plan,makeShadow,existingShadow,launchProfile,launchArtifact,RgssTextPath};
