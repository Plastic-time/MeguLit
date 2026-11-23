// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const S=require('../services/maintainer-signing.cjs'),CLI=require('../tools/seed-key-bootstrap.cjs'),D=require('../core/game-diff.cjs'),P=require('../core/torch-release.cjs');
const windows={skip:process.platform!=='win32'};
function removeFixture(base){const root=path.resolve(os.tmpdir()),full=path.resolve(base);assert.equal(path.dirname(full),root);assert.match(path.basename(full),/^neutral-(?:maintainer|plan)-/);fs.rmSync(full,{recursive:true,force:true});}
function fixture(t){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'neutral-maintainer-')),store=path.join(base,'keys'),helper=path.join(base,'KeyVault.exe');
 t.after(()=>removeFixture(base));
 const compiler=path.join(process.env.SystemRoot||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 const compiled=spawnSync(compiler,['/nologo','/target:exe','/optimize+','/reference:System.Security.dll','/out:'+helper,path.join(__dirname,'../native/KeyVault.cs')],{windowsHide:true,encoding:'utf8',timeout:10000});assert.equal(compiled.status,0,compiled.stdout);
 return {base,store,helper,vault:S.createVault(helper)};
}
const initialize=(f,id,role)=>S.initialize({store:f.store,id,role,vault:f.vault});
const exported=(f,id)=>S.exportPublic({store:f.store,id,vault:f.vault});
const sign=(f,id,role,body,trust)=>S.signDocument(body,{store:f.store,id,role,scope:({'megulit.game-diff':'profile','megulit.torch-review':'review','megulit.torch-release':'release','megulit.torch-revocation':'revocation'})[body.schema],vault:f.vault,trust});
const sum=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('default CLI is a read-only plan and does not initialize keys or touch the requested store',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'neutral-plan-'));t.after(()=>removeFixture(base));const store=path.join(base,'absent');
 assert.deepEqual((await CLI.run([])).roles,['publisher','reviewer']);assert.equal((await CLI.run(['--store',store,'--key-id','neutral-reviewer','--role','reviewer'])).generatesKey,false);assert.equal(fs.existsSync(store),false);
 await assert.rejects(CLI.run(['init','--store',store,'--key-id','neutral-reviewer']),/SIGNING_USAGE/);assert.equal(fs.existsSync(store),false);
});
test('real CurrentUser DPAPI init, export and repeat init are idempotent, role-bound and ciphertext only',windows,t=>{
 const f=fixture(t),result=initialize(f,'neutral-reviewer','reviewer'),file=path.join(f.store,'neutral-reviewer.dpapi.json'),before=sum(file),record=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(result.created,true);assert.deepEqual(result.roles,['reviewer']);assert.deepEqual(Object.keys(result.bindings),['CARDINAL_REVIEW_PUBLIC_KEYS']);assert.equal(result.trustApplied,false);assert.match(result.backup,/DPAPI/);
 assert.equal(fs.readFileSync(file,'utf8').includes('privateKey'),false);assert.equal(fs.readFileSync(file,'utf8').includes('PRIVATE KEY'),false);
 const inner=JSON.parse(f.vault('open',record.ciphertext)),der=Buffer.from(inner.privateKey,'base64');assert.equal(crypto.createPrivateKey({key:der,format:'der',type:'pkcs8'}).asymmetricKeyType,'ed25519');assert.equal(fs.readFileSync(file,'utf8').includes(inner.privateKey),false);der.fill(0);
 const second=initialize(f,'neutral-reviewer','reviewer');assert.equal(second.created,false);assert.equal(sum(file),before);assert.deepEqual(exported(f,'neutral-reviewer').key,result.key);
 assert.throws(()=>initialize(f,'neutral-reviewer','publisher'),/SIGNING_ROLE_CONFLICT/);assert.equal(sum(file),before);assert.equal(fs.readdirSync(f.store).length,1);
});
test('real two-authority crypto signs existing profile/review/release protocol without a PEM path',windows,async t=>{
 const f=fixture(t);for(const r of S.ROLES)initialize(f,'neutral-'+r,r);
 const keys={profileKeys:[exported(f,'neutral-publisher').key],reviewKeys:[exported(f,'neutral-reviewer').key],releaseKeys:[exported(f,'neutral-publisher').key]},old=await require('./helpers/torch-release.cjs').fixture().release();
 assert.deepEqual(exported(f,'neutral-publisher').bindings,{PROFILE_PUBLIC_KEYS:keys.profileKeys,TORCH_RELEASE_PUBLIC_KEYS:keys.releaseKeys});assert.notEqual(keys.profileKeys[0].publicKey,keys.reviewKeys[0].publicKey);
 const profile=await sign(f,'neutral-publisher','publisher',old.profile),review=await sign(f,'neutral-reviewer','reviewer',{...D.unsigned(old.review),candidateHash:await P.hash(profile)}),proposal={...D.unsigned(old),profile,review};
 const release=await require('../tools/torch-release.cjs').signProposal(proposal,{keys,sign:S.createSigner({store:f.store,id:'neutral-publisher',role:'publisher',scope:'release',vault:f.vault,trust:keys})});
 assert.equal((await P.checked(release,keys)).profileHash,review.candidateHash);assert.equal(release.signature.keyId,'neutral-publisher');
 const bad=structuredClone(release);bad.review.mean=.99;await assert.rejects(sign(f,'neutral-publisher','publisher',bad,keys),/SIGNING_NESTED_TRUST/);
 await assert.rejects(sign(f,'neutral-reviewer','reviewer',proposal),/SIGNING_ROLE_DOCUMENT/);await assert.rejects(sign(f,'neutral-reviewer','publisher',proposal,keys),/SIGNING_ROLE_CONFLICT/);
 await assert.rejects(sign(f,'neutral-publisher','publisher',proposal),/SIGNING_NESTED_TRUST/);
 await assert.rejects(sign(f,'neutral-publisher','publisher',review),/SIGNING_ROLE_DOCUMENT/);await assert.rejects(S.signDocument(profile,{store:f.store,id:'neutral-publisher',role:'publisher',vault:f.vault}),/SIGNING_ROLE_DOCUMENT/);
 const revoke=await require('../tools/torch-release.cjs').signRevocation({schema:'megulit.torch-revocation',version:1,profileHash:review.candidateHash,reason:'signature-revoked'},{keys,sign:S.createSigner({store:f.store,id:'neutral-publisher',role:'publisher',scope:'revocation',vault:f.vault})});assert.equal(await P.verify(revoke,keys.releaseKeys),true);
 assert.equal(fs.readdirSync(f.store).some(n=>/\.pem$|\.tmp$/.test(n)),false);
});
test('ciphertext corruption, metadata substitution, missing native vault and existing garbage never regenerate or overwrite',windows,t=>{
 const f=fixture(t);initialize(f,'neutral-publisher','publisher');const file=path.join(f.store,'neutral-publisher.dpapi.json'),original=fs.readFileSync(file,'utf8'),r=JSON.parse(original);
 fs.writeFileSync(file,JSON.stringify({...r,roles:['reviewer']}));const changed=sum(file);assert.throws(()=>exported(f,'neutral-publisher'),/SIGNING_KEY_BINDING/);assert.throws(()=>initialize(f,'neutral-publisher','reviewer'),/SIGNING_KEY_BINDING/);assert.equal(sum(file),changed);
 fs.writeFileSync(file,JSON.stringify({...r,ciphertext:Buffer.alloc(200,1).toString('base64')}));assert.throws(()=>exported(f,'neutral-publisher'),/SIGNING_VAULT_FAILED/);
 fs.writeFileSync(file,'existing corrupt record');const garbage=sum(file);assert.throws(()=>initialize(f,'neutral-publisher','publisher'),/SIGNING_KEY_FILE/);assert.equal(sum(file),garbage);
 assert.throws(()=>S.createVault(path.join(f.base,'missing.exe')),/SIGNING_NOT_FOUND/);
 const unavailable=()=>{throw Error('neutral failure with secret-like diagnostic that must not persist');};assert.throws(()=>S.initialize({store:f.store,id:'neutral-failure',role:'publisher',vault:unavailable}));assert.equal(fs.existsSync(path.join(f.store,'neutral-failure.dpapi.json')),false);
});
test('store refuses repositories, traversal IDs, linked key files and reparse roots',windows,t=>{
 const f=fixture(t);assert.throws(()=>S.plan({store:path.join(__dirname,'../never-create-signing'),id:'neutral'}),/SIGNING_STORE_IN_REPOSITORY/);
 for(const id of ['../escape','..','CON','reviewer.','A','a/b'])assert.throws(()=>initialize(f,id,'reviewer'),/SIGNING_KEY_ID/);
 initialize(f,'neutral-publisher','publisher');const source=path.join(f.store,'neutral-publisher.dpapi.json'),alias=path.join(f.base,'linked.dpapi.json');fs.linkSync(source,alias);assert.throws(()=>exported(f,'neutral-publisher'),/SIGNING_KEY_FILE/);fs.unlinkSync(alias);
 const link=path.join(f.base,'junction');fs.symlinkSync(f.store,link,'junction');assert.throws(()=>S.plan({store:link}),/SIGNING_REPARSE/);fs.rmdirSync(link);
});
test('CLI never prints private material, native failures stay generic, signed output refuses overwrite',windows,async t=>{
 const f=fixture(t),options=['--store',f.store,'--key-id','neutral-publisher','--vault',f.helper],created=await CLI.run(['init',...options,'--role','publisher']);assert.equal(Object.hasOwn(created,'ciphertext'),false);assert.equal(Object.hasOwn(created,'privateKey'),false);
 const input=path.join(f.base,'document.json'),out=path.join(f.base,'signed.json');fs.writeFileSync(input,JSON.stringify(D.build({key:'a'.repeat(64),source:'official',mode:'hide',settings:{}})));
 const result=await CLI.run(['sign',...options,'--role','publisher','--scope','profile','--input',input,'--out',out]);assert.equal(result.signed,true);const before=sum(out);await assert.rejects(CLI.run(['sign',...options,'--role','publisher','--scope','profile','--input',input,'--out',out]),/EEXIST/);assert.equal(sum(out),before);
 const failed=spawnSync(process.execPath,[path.join(__dirname,'../tools/seed-key-bootstrap.cjs'),'public','--store',f.store,'--key-id','not-there','--vault',f.helper],{encoding:'utf8',windowsHide:true});assert.equal(failed.status,1);assert.equal(failed.stdout,'');assert.match(failed.stderr,/^SIGNING_NOT_FOUND\r?\n$/);
});
