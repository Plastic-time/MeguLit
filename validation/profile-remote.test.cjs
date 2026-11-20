// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 official per-game diffs (owner: 每部游戏按 exe 哈希有自己的差分，离线做好后热更新下发): typed keys, signed documents
// in data/profiles/remote/<exeSha256>.json, the exe hash cache, the layer order core <- engine <- game <- remote <- auto (auto
// only without remote), the hot pull from the relay and the engineTrial keys HookBridge reads.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Profiles=require('../core/profiles/index.cjs'),Schema=require('../core/profiles/schema.cjs'),Remote=require('../core/profiles/remote.cjs');
const Sync=require('../services/profile-sync.cjs');
const root=path.join(__dirname,'..');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-remote-'));
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const KEYS=[{id:'t1',alg:'ed25519',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}];
const HASH='ab'.repeat(32);
const doc=(over={})=>Remote.sign({schema:'megulit.profile',format:1,exeSha256:HASH,version:1,gameKey:'senren-banka',engine:'kirikiri',settings:{page:{holdMs:900},hide:{engineTrial:{enabled:false}}},...over},privateKey,'t1');

test('every kernel key has a type; bad values and unsafe regexes reject the whole diff',()=>{
 const D=require('../core/profiles/defaults.cjs');assert.deepEqual(Schema.leaves(D).filter(k=>!Schema.SPEC[k]),[]);assert.deepEqual(Object.keys(Schema.SPEC).filter(k=>!Schema.leaves(D).includes(k)),[]);
 assert.equal(Schema.validate({page:{holdMs:900}}).ok,true);
 for(const bad of [{page:{holdMs:-1}},{page:{holdMs:'9'}},{placement:{firstLineAnchor:'left'}},{nope:1},{page:{nope:1}},{choice:{filters:['(a+)+$']}},{calibrate:{textBox:{x:0,y:0,w:0,h:1}}},{hide:{engineTrial:{unconfirmedLines:0}}},{page:5}])
  assert.equal(Schema.validate(bad).ok,false,JSON.stringify(bad));
});

test('a signed document is admitted; a changed byte, another key, another exe or a bad key is not',()=>{
 assert.equal(Remote.check(doc(),HASH,KEYS).ok,true);
 const t=doc();t.settings.page.holdMs=901;assert.match(Remote.check(t,HASH,KEYS).reason,/signature BAD_SIGNATURE/);
 assert.match(Remote.check(doc(),HASH,[]).reason,/signature UNKNOWN_KEY/);
 assert.match(Remote.check(doc(),'cd'.repeat(32),KEYS).reason,/another program/);
 assert.match(Remote.check(doc({settings:{bogus:1}}),HASH,KEYS).reason,/settings bogus: unknown key/);
 assert.match(Remote.check(doc({extra:1}),HASH,KEYS).reason,/unknown field extra/);
 const {signature,...plain}=doc();assert.match(Remote.check(plain,HASH,KEYS).reason,/UNSIGNED/);
});

test('store keeps the newest version; load checks the file again',()=>{
 const dir=tmp();assert.equal(Remote.load(dir,HASH,KEYS).reason,'none');
 assert.equal(Remote.store(dir,doc({version:2}),KEYS).stored,true);assert.equal(Remote.store(dir,doc({version:1}),KEYS).stored,false);
 assert.equal(Remote.load(dir,HASH,KEYS).doc.version,2);
 const f=path.join(Remote.dir(dir),HASH+'.json'),j=JSON.parse(fs.readFileSync(f,'utf8'));j.settings.page.holdMs=1;fs.writeFileSync(f,JSON.stringify(j));
 assert.equal(Remote.load(dir,HASH,KEYS).ok,false);
});

test('exe hash: SHA-256 of the file, cached until its size or mtime changes',async()=>{
 const dir=tmp(),exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,'abc');
 assert.equal(await Remote.exeHash(exe,dir),crypto.createHash('sha256').update('abc').digest('hex'));
 assert.ok(JSON.parse(fs.readFileSync(path.join(dir,'cache','exe-sha256.json'),'utf8'))[exe.toLowerCase()]);
 fs.writeFileSync(exe,'abcd');const t=new Date(Date.now()+5000);fs.utimesSync(exe,t,t);
 assert.equal(await Remote.exeHash(exe,dir),crypto.createHash('sha256').update('abcd').digest('hex'));
 assert.equal(await Remote.exeHash(path.join(dir,'missing.exe'),dir),'');
});

test('layer order: core <- engine <- game <- remote <- auto, auto only without remote; trace names the exe',()=>{
 const input={exe:'D:/g/SenrenBanka.exe',exeSha256:HASH};
 const r=Profiles.profileFor({...input,remote:doc(),auto:{page:{holdMs:5}}});
 assert.equal(r.layers,'core+engine+game+remote');assert.equal(r.page.holdMs,900);assert.equal(r.hide.engineTrial.enabled,false);assert.equal(r.remoteVersion,1);
 assert.match(Profiles.traceLine(r),/^profile senren-banka exe=abababab layers=core\+engine\+game\+remote engine=kirikiri remote=v1/);
 const a=Profiles.profileFor({...input,auto:{page:{holdMs:5}}});assert.equal(a.layers,'core+engine+game+auto');assert.equal(a.page.holdMs,5);
 const u=Profiles.profileFor({exe:'D:/x/Unknown.exe',exeSha256:HASH,remote:doc({gameKey:'new-game'})});assert.equal(u.gameKey,'new-game');assert.equal(u.layers,'core+engine+remote');
 const bad=Profiles.profileFor({...input,remote:{version:1,settings:{page:{holdMs:-5}}}});assert.equal(bad.layers,'core+engine+game');assert.match(bad.rejected,/holdMs/);
 /* a game file may name its versions by hash */
 assert.ok(Profiles.matchScore({match:{exeSha256:[HASH]}},{exe:'D:/x/renamed.exe',exeSha256:HASH}).score>=10);
});

test('hot pull: a newer signed diff is stored; 304/404/offline/bad documents change nothing',async()=>{
 const dir=tmp(),env={MEGULIT_RELAY_BASE:'https://relay.test'},seen=[];
 const reply=(status,body)=>async url=>{seen.push(url);return {status,ok:status>=200&&status<300,text:async()=>typeof body==='string'?body:JSON.stringify(body)};};
 Sync._reset();assert.equal((await Sync.pull(dir,HASH,{fetcher:reply(404,''),keys:KEYS,env})).state,'none');assert.equal(seen[0],'https://relay.test/api/profile/'+HASH);
 Sync._reset();assert.equal((await Sync.pull(dir,HASH,{fetcher:reply(200,doc({version:3})),keys:KEYS,env})).state,'stored');assert.equal(Remote.load(dir,HASH,KEYS).doc.version,3);
 Sync._reset();await Sync.pull(dir,HASH,{fetcher:reply(304,''),keys:KEYS,env});assert.match(seen.at(-1),/\?have=3$/);
 const t=doc({version:4});t.version=5;Sync._reset();assert.equal((await Sync.pull(dir,HASH,{fetcher:reply(200,t),keys:KEYS,env})).state,'rejected');assert.equal(Remote.load(dir,HASH,KEYS).doc.version,3);
 Sync._reset();assert.equal((await Sync.pull(dir,HASH,{fetcher:async()=>{throw Error('down');},keys:KEYS,env})).state,'offline');
 assert.equal((await Sync.pull(dir,HASH,{fetcher:reply(200,doc({version:9})),keys:KEYS,env})).state,'recent','once per run');
 Sync._reset();assert.equal((await Sync.pull(dir,HASH,{fetcher:reply(200,doc()),keys:KEYS,env:{MEGULIT_RELAY_BASE:'off'}})).state,'not-configured');
});

test('HookBridge gets hide.engineTrial: env at spawn, a message when it changes, kernel rule when unset',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const dir=tmp();const h=new HookNative({native:dir,hook:dir,logs:dir},()=>{});h.trace=()=>{};
 assert.deepEqual(h.bridgeProfile(),{engineTrial:{}});
 const sent=[];h.process={stdin:{writable:true,write:l=>sent.push(JSON.parse(l))}};
 h.setProfile(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',exeSha256:HASH,remote:doc()}));
 assert.deepEqual(sent.at(-1),{type:'profile',engineTrial:{enabled:false}});const n=sent.length;
 h.setProfile(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',exeSha256:HASH,remote:doc()}));assert.equal(sent.length,n,'unchanged: not sent again');
 const src=fs.readFileSync(path.join(root,'core/hook-native.cjs'),'utf8');assert.match(src,/MEGULIT_PROFILE:JSON\.stringify\(this\.bridgeProfile\(\)\)/);
 const cs=fs.readFileSync(path.join(root,'native/HookBridge.cs'),'utf8');
 for(const re of [/type=="profile"\)\{ApplyProfile\(d\);\}/,/ProfileFromEnv\(\);IntPtr module/,/\+\+EngineUnconfirmed>=ProfileUnconfirmed/,/TotalMilliseconds<ProfileClickMs/,/if\(ProfileTrial==0\)return false;/,/if\(!ProfileSelfTest\(\)\)/])assert.match(cs,re);
});
