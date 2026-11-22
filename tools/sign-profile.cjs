// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 签名用 Ed25519，私钥只在我们本机签发工具里，私钥路径走环境变量，绝不进仓库) our offline signing tool for game diffs
   (docs/auto-profile.md). The private key is a PEM file outside the repository, named by MEGULIT_PROFILE_KEY; its id is
   MEGULIT_PROFILE_KEY_ID (default 'p1'). The app trusts the public keys in services/profile-keys.json.

   node tools/sign-profile.cjs keygen <folder outside the repo>   a new key pair: <folder>/megulit-profile-<id>.pem (private) and the
                                                                   public key (SPKI DER, base64) to add to services/profile-keys.json
   node tools/sign-profile.cjs key <game.exe>                      the diff key of a program file (64 hex SHA-256)
   node tools/sign-profile.cjs make <key> <settings.json> [--layer version|game] [--prints prints.json] [--rev N] [--mode hide|read]
                                    [--exe name] [--engine id] > diff.json
                                                                   an official diff (only domain keys survive; dropped ones on stderr).
                                                                   version layer: key = the exe SHA-256, prints may add head / pe;
                                                                   game layer: key = the game identity (the relay's 'game' of a report,
                                                                   or any 64 hex), prints = pack / script / steam / vndb / title
                                                                   (core/game-print.cjs) - every build with one of them gets it
   node tools/sign-profile.cjs observe <profile.json> <observation.json> --original <exe> --script <relative script file>
                                    [--authorized-runtime <exe>] > updated.json
                                                                   observation: {results:{read:{passed:true,source:"operator"}}}
                                                                   optional textBox: {source,box:{x,y,width,height},client:{width,height}}
                                                                   file paths stay local; inspect and sign the updated profile separately
   node tools/sign-profile.cjs sign <diff.json> > signed.json      sign one document (official or auto)
   node tools/sign-profile.cjs picks <relay base> <out folder> [--upload]
                                                                   the relay's agreed picks waiting for a signature (MEGULIT_ADMIN_TOKEN):
                                                                   each is checked, signed and written to <out folder>; --upload posts them back
   node tools/sign-profile.cjs check <signed.json>                 shape, values and signature as the app checks them */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const gameDiff=require('../core/game-diff.cjs'),{clean}=require('../core/profiles/domains.cjs');
const REPO=path.resolve(__dirname,'..');
const inRepo=p=>{const r=path.relative(REPO,path.resolve(p));return !r.startsWith('..')&&!path.isAbsolute(r);};
function privateKey(env=process.env){const f=String(env.MEGULIT_PROFILE_KEY||'');if(!f)throw Error('MEGULIT_PROFILE_KEY (path of the private key PEM) is not set');if(inRepo(f))throw Error('the private key must not live inside the repository');return crypto.createPrivateKey(fs.readFileSync(f,'utf8'));}
const keyId=(env=process.env)=>String(env.MEGULIT_PROFILE_KEY_ID||'p1');
function signDoc(doc,key,id){const body=gameDiff.unsigned(doc);const v=gameDiff.validate(body);if(!v.ok)throw Error('invalid: '+v.error);
 return {...body,signature:{alg:'ed25519',keyId:id,value:crypto.sign(null,Buffer.from(gameDiff.canonical(body)),key).toString('base64')}};}
async function observe(profile, observation, original, scriptFile, authorizedRuntime) {
 const files=require('../services/torch-receive.cjs'), evidence=require('../core/seed-evidence.cjs');
 const originalExe=await files.fileHash(original), script=await files.fileHash(files.scriptPath(original,scriptFile));
 if(profile.layer!=='version'||profile.key!==originalExe||profile.prints?.script&&profile.prints.script!==script)throw Error('SEED_EVIDENCE_IDENTITY');
 const runtimeExe=authorizedRuntime?await files.fileHash(authorizedRuntime):originalExe;
 // A copy can have its own installation directory. Bind the container actually used there too.
 if(authorizedRuntime&&await files.fileHash(files.scriptPath(authorizedRuntime,scriptFile))!==script)throw Error('SEED_EVIDENCE_IDENTITY');
 const patch={originalExe,script,scriptFile,runtimeExe,results:observation.results??{}};
 if(observation.textBox){const {box,client,source}=observation.textBox;patch.textBox=evidence.normalizeBox(box,client,source);}
 const updated={...gameDiff.unsigned(profile),prints:{...profile.prints,exe:originalExe,script},evidence:evidence.merge(profile.evidence,patch)};
 if(!gameDiff.validate(updated).ok)throw Error('SEED_EVIDENCE_PROFILE');
 return updated;
}
/* the relay's picks, signed; written to out, posted back with upload */
async function signPicks(base,out,{upload=false,fetcher=globalThis.fetch,env=process.env}={}){const token=String(env.MEGULIT_ADMIN_TOKEN||'');if(!token)throw Error('MEGULIT_ADMIN_TOKEN is not set');
 const key=privateKey(env),id=keyId(env),auth={authorization:'Bearer '+token,'user-agent':'MeguLit-sign-profile'},root=String(base).replace(/\/$/,'');
 const r=await fetcher(root+'/api/game-profile/picks',{headers:auth});if(!r.ok)throw Error('picks HTTP '+r.status);const {picks=[]}=await r.json();
 fs.mkdirSync(out,{recursive:true});const done=[];
 for(const p of picks){if(p?.source!=='auto'||!gameDiff.validate(p).ok){done.push({key:p?.key,state:'refused'});continue;}const signed=signDoc(p,key,id);fs.writeFileSync(path.join(out,p.key+'.json'),JSON.stringify(signed,null,1));
  let state='signed';if(upload){const u=await fetcher(root+'/api/game-profile/signed',{method:'POST',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({diff:signed})});state=u.ok?'uploaded':'upload '+u.status;}
  done.push({key:p.key,mode:p.mode,state});}
 return done;}
if(require.main===module){const [cmd,a,b]=process.argv.slice(2);const arg=(n,f)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:f;};
 (async()=>{
  if(cmd==='keygen'){if(!a)throw Error('keygen <folder outside the repo>');if(inRepo(a))throw Error('the private key must not live inside the repository');const id=keyId();const {publicKey,privateKey:pk}=crypto.generateKeyPairSync('ed25519');
   fs.mkdirSync(a,{recursive:true});const f=path.join(a,'megulit-profile-'+id+'.pem');if(fs.existsSync(f))throw Error(f+' exists');fs.writeFileSync(f,pk.export({format:'pem',type:'pkcs8'}),{mode:0o600});
   console.log(JSON.stringify({privateKeyFile:f,set:'MEGULIT_PROFILE_KEY='+f,profileKeysEntry:{id,alg:'ed25519',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64'),added:new Date().toISOString().slice(0,10)}},null,1));}
  else if(cmd==='key')console.log(crypto.createHash('sha256').update(fs.readFileSync(a)).digest('hex'));
  else if(cmd==='make'){const r=clean(JSON.parse(fs.readFileSync(b,'utf8')));if(r.rejected.length)console.error('dropped: '+r.rejected.join(', '));
   const prints=arg('prints','')?JSON.parse(fs.readFileSync(arg('prints'),'utf8')):undefined;
   const d=gameDiff.build({key:a,layer:arg('layer','version'),prints,rev:Number(arg('rev','1'))||1,source:'official',mode:arg('mode','hide'),settings:r.value,exe:arg('exe',''),engine:arg('engine','')});const v=gameDiff.validate(d);if(!v.ok)throw Error('invalid: '+v.error);console.log(JSON.stringify(d,null,1));}
  else if(cmd==='observe')console.log(JSON.stringify(await observe(JSON.parse(fs.readFileSync(a,'utf8')),JSON.parse(fs.readFileSync(b,'utf8')),arg('original'),arg('script'),arg('authorized-runtime')),null,1));
  else if(cmd==='sign')console.log(JSON.stringify(signDoc(JSON.parse(fs.readFileSync(a,'utf8')),privateKey(),keyId()),null,1));
  else if(cmd==='picks')console.log(JSON.stringify(await signPicks(a,b,{upload:process.argv.includes('--upload')}),null,1));
  else if(cmd==='check'){const d=JSON.parse(fs.readFileSync(a,'utf8'));const v=gameDiff.validate(d);const feed=require('../services/auto-profile-feed.cjs');const ok=v.ok&&feed.verify(d,feed.keys());console.log(v.ok?(ok?'ok':'bad signature'):'invalid: '+v.error);process.exitCode=ok?0:1;}
  else{console.error('usage: keygen <dir> | key <exe> | make <exeHash> <settings.json> | sign <diff.json> | picks <relay> <out> [--upload] | check <signed.json>');process.exitCode=2;}
 })().catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={observe,signDoc,signPicks,privateKey,keyId,inRepo};
