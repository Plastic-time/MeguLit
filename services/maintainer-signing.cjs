// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const D=require('../core/game-diff.cjs'),P=require('../core/torch-release.cjs');
const ROLES=Object.freeze(['publisher','reviewer']);
const BINDINGS=Object.freeze({publisher:Object.freeze(['PROFILE_PUBLIC_KEYS','TORCH_RELEASE_PUBLIC_KEYS']),reviewer:Object.freeze(['CARDINAL_REVIEW_PUBLIC_KEYS'])});
const MAX_FILE=16384,MAX_INPUT=P.MAX_BYTES;
const fail=code=>{throw Object.assign(Error(code),{code});};
const exact=(v,names)=>v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const fold=p=>process.platform==='win32'?p.toLowerCase():p;
function name(id){if(typeof id!=='string'||!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(id)||/[. ]$/.test(id)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id))fail('SIGNING_KEY_ID');return id;}
function roleName(role){if(!ROLES.includes(role))fail('SIGNING_ROLE');return role;}
function safePath(value,{store=false,exists=true}={}){
 if(typeof value!=='string'||!path.isAbsolute(value)||/^[/\\]{2}/.test(value)||value.includes('\0')||value.slice(path.parse(value).root.length).includes(':')||value.split(/[\\/]/).some(p=>p&&p!==path.parse(value).root&&/[. ]$/.test(p)))fail('SIGNING_PATH');
 const full=path.resolve(value);let here=full;
 for(;;){if(fs.existsSync(here)){const s=fs.lstatSync(here);if(s.isSymbolicLink())fail('SIGNING_REPARSE');if(store&&fs.existsSync(path.join(here,'.git')))fail('SIGNING_STORE_IN_REPOSITORY');}else if(here===full&&exists)fail('SIGNING_NOT_FOUND');const parent=path.dirname(here);if(parent===here)break;here=parent;}
 if(fs.existsSync(full)&&fold(fs.realpathSync.native(full))!==fold(full))fail('SIGNING_REPARSE');return full;
}
function keyFile(store,id,{create=false}={}){name(id);const dir=safePath(store,{store:true,exists:!create});if(create){fs.mkdirSync(dir,{recursive:true});safePath(dir,{store:true});}if(!fs.statSync(dir).isDirectory())fail('SIGNING_PATH');return path.join(dir,id+'.dpapi.json');}
function base64(s,max=8192){if(typeof s!=='string'||!s||s.length>max||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)||Buffer.from(s,'base64').toString('base64')!==s)fail('SIGNING_KEY_FORMAT');return s;}
function publicEntry(record){return {id:record.keyId,alg:'ed25519',publicKey:record.publicKey};}
function outerShape(record){
 if(!exact(record,['schema','version','keyId','roles','alg','publicKey','createdAt','ciphertext'])||record.schema!=='megulit.maintainer-key'||record.version!==1||record.alg!=='ed25519'||!Array.isArray(record.roles)||record.roles.length!==1||!P.iso(record.createdAt))fail('SIGNING_KEY_FORMAT');
 name(record.keyId);roleName(record.roles[0]);base64(record.ciphertext);base64(record.publicKey,128);
 try{const pub=crypto.createPublicKey({key:Buffer.from(record.publicKey,'base64'),format:'der',type:'spki'});if(pub.asymmetricKeyType!=='ed25519'||pub.export({format:'der',type:'spki'}).toString('base64')!==record.publicKey)fail('SIGNING_KEY_FORMAT');}catch{fail('SIGNING_KEY_FORMAT');}return record;
}
function readRecord(store,id){
 const file=keyFile(store,id);safePath(file);let fd;
 try{fd=fs.openSync(file,'r');const s=fs.fstatSync(fd,{bigint:true});if(!s.isFile()||s.nlink!==1n||s.size<1||s.size>BigInt(MAX_FILE))fail('SIGNING_KEY_FILE');const stamp=v=>[v.dev,v.ino,v.size,v.mtimeNs,v.ctimeNs].join(':');const b=Buffer.alloc(Number(s.size)+1),n=fs.readSync(fd,b,0,b.length,0);if(n!==Number(s.size)||stamp(s)!==stamp(fs.fstatSync(fd,{bigint:true})))fail('SIGNING_KEY_CHANGED');const r=outerShape(JSON.parse(b.subarray(0,n).toString('utf8')));if(r.keyId!==id)fail('SIGNING_KEY_ID');return r;}catch(e){if(/^SIGNING_/.test(e?.code||''))throw e;fail('SIGNING_KEY_FILE');}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function createVault(helper){
 if(process.platform!=='win32')fail('SIGNING_WINDOWS_REQUIRED');
 const exe=safePath(helper);if(!fs.statSync(exe).isFile()||path.extname(exe).toLowerCase()!=='.exe')fail('SIGNING_VAULT_UNAVAILABLE');
 return (action,value)=>{
  if(!['seal','open'].includes(action)||typeof value!=='string'||Buffer.byteLength(value)>MAX_FILE)fail('SIGNING_VAULT_INPUT');
  // Same native CurrentUser DPAPI protocol as core/secrets.cjs; key material is never an argument or env value.
  const p=spawnSync(exe,['--vault',action],{input:value,encoding:'utf8',windowsHide:true,shell:false,timeout:10000,maxBuffer:MAX_FILE});
  if(p.error||p.status!==0||typeof p.stdout!=='string')fail('SIGNING_VAULT_FAILED');
  const out=p.stdout.trim();if(!out||Buffer.byteLength(out)>MAX_FILE)fail('SIGNING_VAULT_FAILED');return out;
 };
}
function privateOperation(record,vault,operation){
 let der;
 try{
  const secret=JSON.parse(vault('open',record.ciphertext));
  if(!exact(secret,['schema','version','keyId','role','publicKey','createdAt','privateKey'])||secret.schema!=='megulit.maintainer-key-secret'||secret.version!==1||secret.keyId!==record.keyId||secret.role!==record.roles[0]||secret.publicKey!==record.publicKey||secret.createdAt!==record.createdAt)fail('SIGNING_KEY_BINDING');
  der=Buffer.from(base64(secret.privateKey,256),'base64');const key=crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'});
  if(key.asymmetricKeyType!=='ed25519'||crypto.createPublicKey(key).export({format:'der',type:'spki'}).toString('base64')!==record.publicKey)fail('SIGNING_KEY_BINDING');return operation(key);
 }catch(e){if(/^SIGNING_/.test(e?.code||''))throw e;fail('SIGNING_KEY_UNAVAILABLE');}finally{der?.fill(0);}
}
function bundle(record){const entry=publicEntry(record),fingerprint=crypto.createHash('sha256').update(Buffer.from(record.publicKey,'base64')).digest('hex');return {schema:'megulit.maintainer-public-key',version:1,keyId:record.keyId,roles:[...record.roles],fingerprint:'sha256:'+fingerprint,key:entry,bindings:Object.fromEntries(BINDINGS[record.roles[0]].map(binding=>[binding,[entry]])),trustApplied:false,backup:'Back up this encrypted .dpapi.json with your Windows DPAPI profile/recovery material; ciphertext alone is not a portable key backup'};}
function plan({store,id,role}={}){if(id!==undefined)name(id);if(role!==undefined)roleName(role);if(store!==undefined)safePath(store,{store:true,exists:false});return {mode:'dry-run',writes:false,generatesKey:false,requires:'Explicit init with an absolute dedicated store, key ID, one role, and a trusted KeyVault.exe',roles:[...ROLES],bindings:{...BINDINGS},store:store||null,keyId:id||null,role:role||null,trustApplied:false};}
function initialize({store,id,role,vault}){
 name(id);roleName(role);if(typeof vault!=='function')fail('SIGNING_VAULT_REQUIRED');
 const file=keyFile(store,id,{create:true});if(fs.existsSync(file)){const record=readRecord(store,id);if(record.roles[0]!==role)fail('SIGNING_ROLE_CONFLICT');privateOperation(record,vault,()=>true);return {created:false,...bundle(record)};}
 const pair=crypto.generateKeyPairSync('ed25519'),der=pair.privateKey.export({format:'der',type:'pkcs8'});let record;
 try{
  const publicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),createdAt=new Date().toISOString();
  const ciphertext=vault('seal',JSON.stringify({schema:'megulit.maintainer-key-secret',version:1,keyId:id,role,publicKey,createdAt,privateKey:der.toString('base64')}));
  record=outerShape({schema:'megulit.maintainer-key',version:1,keyId:id,roles:[role],alg:'ed25519',publicKey,createdAt,ciphertext});
  // Check the exact encrypted pair before committing any file; no plaintext recovery fallback.
  privateOperation(record,vault,()=>true);
 }finally{der.fill(0);}
 let fd;try{fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(record,null,2));fs.fsyncSync(fd);}catch(e){if(e.code==='EEXIST'){const old=readRecord(store,id);if(old.roles[0]!==role)fail('SIGNING_ROLE_CONFLICT');privateOperation(old,vault,()=>true);return {created:false,...bundle(old)};}fail('SIGNING_KEY_WRITE_FAILED');}finally{if(fd!==undefined)fs.closeSync(fd);}
 return {created:true,...bundle(record)};
}
function exportPublic({store,id,vault}){const record=readRecord(store,id);if(typeof vault!=='function')fail('SIGNING_VAULT_REQUIRED');privateOperation(record,vault,()=>true);return bundle(record);}
async function signDocument(document,{store,id,role,scope,vault,trust}={}){
 name(id);roleName(role);const scopes={profile:'megulit.game-diff',review:'megulit.torch-review',release:'megulit.torch-release',revocation:'megulit.torch-revocation'};if(!Object.hasOwn(scopes,scope)||role==='reviewer'&&scope!=='review'||role==='publisher'&&scope==='review'||document?.schema!==scopes[scope])fail('SIGNING_ROLE_DOCUMENT');const unsigned=D.unsigned(document);await P.hash(unsigned);const text=D.canonical(unsigned),signature={alg:'ed25519',keyId:id,value:Buffer.alloc(64).toString('base64')},proposed={...unsigned,signature};
 if(scope==='profile'){if(!D.validate(unsigned).ok)fail('SIGNING_PROFILE_SHAPE');}
 else if(role==='reviewer'){if(unsigned.schema!=='megulit.torch-review')fail('SIGNING_ROLE_DOCUMENT');P.reviewShape(proposed);}
 else if(unsigned.schema==='megulit.torch-release'){
  P.releaseShape(proposed);if(!trust||!await P.verify(unsigned.profile,trust.profileKeys)||!await P.verify(unsigned.review,trust.reviewKeys)||await P.hash(unsigned.profile)!==unsigned.review.candidateHash)fail('SIGNING_NESTED_TRUST');
 }else if(unsigned.schema==='megulit.torch-revocation'){require('../tools/torch-release.cjs').revocationTemplate(unsigned);}else fail('SIGNING_ROLE_DOCUMENT');
 const record=readRecord(store,id);if(record.roles[0]!==role)fail('SIGNING_ROLE_CONFLICT');if(typeof vault!=='function')fail('SIGNING_VAULT_REQUIRED');
 const signed=privateOperation(record,vault,key=>({...unsigned,signature:{alg:'ed25519',keyId:id,value:crypto.sign(null,Buffer.from(text),key).toString('base64')}}));
 if(!await P.verify(signed,[publicEntry(record)]))fail('SIGNING_SELF_VERIFY');
 if(role==='publisher'&&unsigned.schema==='megulit.torch-release'){await P.checked(signed,trust);}
 return signed;
}
function createSigner(options){return document=>signDocument(document,options);}
module.exports={ROLES,BINDINGS,MAX_INPUT,createVault,plan,initialize,exportPublic,signDocument,createSigner};
