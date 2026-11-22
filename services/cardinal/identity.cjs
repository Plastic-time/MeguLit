/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const canonical=require('../../core/game-diff.cjs').canonical;
const FILE_MAX=16*1024**2,CONFIG_MAX=32*1024**2,SCRIPT_MAX=2*1024**3,FILES_MAX=4096;
const PRIVATE=/secrets?|accounts?|credentials?|tokens?|api[-_]?keys?|backup|\.tmp$|\.lock$/i;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const hashObject=value=>digest(canonical(value));
const HEX=/^[0-9a-f]{64}$/;
const safeRelative=v=>typeof v==='string'&&v.length<=1024&&!/[\\:\x00-\x1f]/.test(v)&&v.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p));
function validate(v){if(!v||v.schema!==1||!HEX.test(v.key)||typeof v.exeStamp!=='string'||typeof v.engine!=='string'||!v.context||typeof v.context.engine!=='string'||v.context.engine.length>80||typeof v.context.title!=='string'||v.context.title.length>512||typeof v.context.vndb!=='string'||v.context.vndb.length>40||!HEX.test(v.candidate?.profileHash)||!['none','auto','official'].includes(v.candidate.source)||!Array.isArray(v.config?.entries)||v.config.entries.length>FILES_MAX||!Array.isArray(v.scripts)||!v.scripts.length||v.scripts.length>FILES_MAX)fail('CARDINAL_IDENTITY_SHAPE');
 const seen=new Set();for(const e of v.config.entries){if(!safeRelative(e.path)||PRIVATE.test(e.path)||!(e.path.startsWith('config/')||['preferences.json','ui-state.json','window-state.json','The Seed/'+v.key+'.json'].includes(e.path))||!Number.isSafeInteger(e.bytes)||e.bytes<0||e.bytes>FILE_MAX||!HEX.test(e.sha256)||seen.has(e.path))fail('CARDINAL_IDENTITY_SHAPE');seen.add(e.path);}
 if(hashObject(v.config.entries)!==v.config.digest)fail('CARDINAL_IDENTITY_SHAPE');seen.clear();for(const e of v.scripts){if(!safeRelative(e.path)||typeof e.stamp!=='string'||e.expected!==null&&!HEX.test(e.expected)||seen.has(e.path)||e.sha256!==undefined&&!HEX.test(e.sha256))fail('CARDINAL_IDENTITY_SHAPE');seen.add(e.path);}}
function stamp(file){const s=fs.lstatSync(file,{bigint:true});if(!s.isFile()||s.isSymbolicLink())fail('CARDINAL_IDENTITY_FILE');return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}
function noLinks(file){let here=path.resolve(file);for(;;){const s=fs.lstatSync(here);if(s.isSymbolicLink())fail('CARDINAL_IDENTITY_LINK');const parent=path.dirname(here);if(parent===here)return;here=parent;}}
function relative(base,file){const r=path.relative(base,file);if(!r||r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))fail('CARDINAL_IDENTITY_PATH');return r.split(path.sep).join('/');}
function checkedRead(file,max){noLinks(file);const before=stamp(file),fd=fs.openSync(file,'r');try{const s=fs.fstatSync(fd);if(s.size>max)fail('CARDINAL_IDENTITY_LIMIT');const buffer=Buffer.alloc(s.size+1);let used=0;while(used<buffer.length){const n=fs.readSync(fd,buffer,used,buffer.length-used,null);if(!n)break;used+=n;}if(used!==s.size||stamp(file)!==before)fail('CARDINAL_IDENTITY_CHANGED');return {bytes:buffer.subarray(0,used),stamp:before};}finally{fs.closeSync(fd);}}
function configManifest(data,key){const entries=[];let total=0,visited=0;
 function add(file){const r=relative(data,file),{bytes}=checkedRead(file,FILE_MAX);total+=bytes.length;if(total>CONFIG_MAX||entries.length>=FILES_MAX)fail('CARDINAL_IDENTITY_LIMIT');entries.push({path:r,bytes:bytes.length,sha256:digest(bytes)});}
 function walk(dir,depth=0){if(depth>8)fail('CARDINAL_IDENTITY_LIMIT');noLinks(dir);for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(++visited>FILES_MAX*2)fail('CARDINAL_IDENTITY_LIMIT');if(PRIVATE.test(e.name))continue;const file=path.join(dir,e.name),r=relative(data,file);if(e.isSymbolicLink())fail('CARDINAL_IDENTITY_LINK');if(e.isDirectory()){if(/(?:^|\/)(auto-profiles|auto-profiles-feed)$/.test(r)){const wanted=path.join(file,key+'.json');if(fs.existsSync(wanted))add(wanted);}else walk(file,depth+1);}else if(e.isFile()&&e.name.endsWith('.json'))add(file);}}
 const config=path.join(data,'config');if(fs.existsSync(config))walk(config);
 for(const name of ['preferences.json','ui-state.json','window-state.json','The Seed/'+key+'.json']){const file=path.join(data,name);if(fs.existsSync(file))add(file);}
 entries.sort((a,b)=>a.path.localeCompare(b.path));return {entries,digest:hashObject(entries)};
}
function scriptSources(root,game,engine){const dir=path.dirname(game.exe),cache=path.join(root,'data','The Seed',game.sha+'.json');
 if(fs.existsSync(cache)){const value=JSON.parse(checkedRead(cache,FILE_MAX).bytes.toString('utf8'));const identity=value.torchRelease?.review?.identity;
  if(identity){if(identity.exe!==game.sha||identity.engine!==engine||!require('../../core/torch-release.cjs').identity(identity))fail('CARDINAL_IDENTITY_CANDIDATE');return [{file:path.join(dir,identity.scriptFile),expected:identity.script}];}}
 const sources=require('../original-engines/scenes.cjs').ENGINES[engine]?.sources;
 if(typeof sources!=='function')fail('CARDINAL_IDENTITY_NO_SCRIPT');
 const files=sources(dir);if(!Array.isArray(files)||!files.length||files.length>FILES_MAX)fail('CARDINAL_IDENTITY_NO_SCRIPT');return [...new Set(files.map(file=>path.resolve(file)))].map(file=>({file,expected:null}));
}
function capture({root,game,profile,source,seedRev,context={}}){noLinks(game.exe);const data=path.join(root,'data'),base=fs.realpathSync(path.dirname(game.exe));
 const scripts=scriptSources(root,game,profile.engine).map(({file,expected})=>{noLinks(file);return {path:relative(base,fs.realpathSync(file)),stamp:stamp(file),expected};}).sort((a,b)=>a.path.localeCompare(b.path));
 const value={schema:1,key:game.sha,engine:profile.engine,context:{engine:String(context.engine||profile.engine),title:String(context.title??game.title??''),vndb:String(context.vndb||'')},exeStamp:stamp(game.exe),candidate:{profileHash:hashObject(profile),source,seedRev},config:configManifest(data,game.sha),scripts};validate(value);return value;
}
function unchanged(captured,{data,game}){validate(captured);if(captured.key!==game.sha||stamp(game.exe)!==captured.exeStamp||configManifest(data,game.sha).digest!==captured.config.digest)fail('CARDINAL_IDENTITY_CHANGED');
 const base=fs.realpathSync(path.dirname(game.exe)),selected=scriptSources(path.dirname(data),game,captured.engine).map(({file,expected})=>({path:relative(base,fs.realpathSync(file)),expected})).sort((a,b)=>a.path.localeCompare(b.path));
 if(hashObject(selected)!==hashObject(captured.scripts.map(({path,expected})=>({path,expected}))))fail('CARDINAL_IDENTITY_CHANGED');
 for(const script of captured.scripts){const file=path.join(path.dirname(game.exe),script.path);noLinks(file);if(stamp(file)!==script.stamp)fail('CARDINAL_IDENTITY_CHANGED');}}
async function fileHash(file,{signal,check,remaining}){noLinks(file);const before=stamp(file),handle=await fs.promises.open(file,'r');try{const h=crypto.createHash('sha256'),buffer=Buffer.allocUnsafe(256*1024);let bytes=0;
 if((await handle.stat()).size>remaining.value)fail('CARDINAL_IDENTITY_LIMIT');
 for(;;){signal?.throwIfAborted();check();const n=await handle.read(buffer,0,buffer.length,null);if(!n.bytesRead)break;bytes+=n.bytesRead;remaining.value-=n.bytesRead;if(remaining.value<0)fail('CARDINAL_IDENTITY_LIMIT');h.update(buffer.subarray(0,n.bytesRead));}
 if(stamp(file)!==before)fail('CARDINAL_IDENTITY_CHANGED');return h.digest('hex');}finally{await handle.close();}}
async function prepare(captured,{data,game,signal}){const deadline=Date.now()+30000,check=()=>{if(Date.now()>deadline)fail('CARDINAL_IDENTITY_LIMIT');},remaining={value:SCRIPT_MAX};unchanged(captured,{data,game});
 const exeHash=await fileHash(game.exe,{signal,check,remaining});if(exeHash!==captured.key)fail('CARDINAL_IDENTITY_CHANGED');const scripts=[];
 for(const script of captured.scripts){const sha256=await fileHash(path.join(path.dirname(game.exe),script.path),{signal,check,remaining});if(script.expected&&script.expected!==sha256)fail('CARDINAL_IDENTITY_CHANGED');scripts.push({...script,sha256});}
 unchanged(captured,{data,game});const {digest:previousDigest,...bound}=captured;return {...bound,scripts,digest:hashObject({...bound,scripts})};
}
async function verify(proof,options){const fresh=await prepare(proof,options);if(fresh.digest!==proof.digest)fail('CARDINAL_IDENTITY_CHANGED');return fresh;}
async function copyData(proof,{data,destination,game,signal,afterFile}){await verify(proof,{data,game,signal});
 for(const entry of proof.config.entries){signal?.throwIfAborted();const {bytes}=checkedRead(path.join(data,entry.path),FILE_MAX);if(bytes.length!==entry.bytes||digest(bytes)!==entry.sha256)fail('CARDINAL_IDENTITY_CHANGED');const target=path.join(destination,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});await afterFile?.(entry);}
 await verify(proof,{data,game,signal});if(configManifest(destination,proof.key).digest!==proof.config.digest)fail('CARDINAL_IDENTITY_COPY');return proof.digest;
}
const reasonCode=error=>/^CARDINAL_IDENTITY_[A-Z_]+$/.test(error?.code||'')?error.code:'CARDINAL_IDENTITY_UNAVAILABLE';
const profileMatches=(proof,profile)=>!!profile&&hashObject(profile)===proof.candidate.profileHash;
module.exports={capture,prepare,verify,unchanged,copyData,configManifest,hashObject,profileMatches,reasonCode,FILE_MAX,CONFIG_MAX,SCRIPT_MAX};
