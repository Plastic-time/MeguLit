// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 one diff system (docs/diff-layers.md): one value-domain table (core/profiles/domains.cjs), one exe key (the full
// SHA-256), one layer order core <- engine <- game <- shared <- auto <- official <- stepdown, and the engineTrial keys HookBridge
// reads. The signed documents and the relay are covered by auto-profile-relay.test.cjs and self-check-gate.test.cjs.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Profiles=require('../core/profiles/index.cjs'),Domains=require('../core/profiles/domains.cjs');
const root=path.join(__dirname,'..'),HASH='ab'.repeat(32);

test('every kernel key has a value domain, at any depth; a bad key or value is listed',()=>{
 const D=require('../core/profiles/defaults.cjs');assert.deepEqual(Domains.leaves(D).filter(k=>!Domains.DOMAINS[k]),[]);assert.deepEqual(Object.keys(Domains.DOMAINS).filter(k=>!Domains.leaves(D).includes(k)),[]);
 assert.deepEqual(Domains.clean({hide:{engineTrial:{enabled:false,unconfirmedLines:3}}}),{value:{hide:{engineTrial:{enabled:false,unconfirmedLines:3}}},rejected:[]});
 for(const [bad,key] of [[{hide:{engineTrial:{clickMs:1.5}}},'hide.engineTrial.clickMs'],[{hide:{engineTrial:{nope:1}}},'hide.engineTrial.nope'],[{page:{holdMs:-1}},'page.holdMs'],[{choice:{filters:['(a+)+$']}},'choice.filters'],[{nope:{a:1}},'nope.a']])
  assert.deepEqual(Domains.clean(bad).rejected,[key]);
});

test('layers stack in one order, the local step-down last; a layer with a bad key is left out whole',()=>{
 const input={exe:'D:/g/SenrenBanka.exe',exeSha256:HASH,shared:{page:{holdMs:1,flowPage:true}},auto:{page:{holdMs:2}},official:{page:{holdMs:3}},stepDown:{hide:{textEffectsRead:true}}};
 const p=Profiles.profileFor(input);
 assert.equal(p.layers,'core+engine+game+shared+auto+official+stepdown');assert.equal(p.page.holdMs,3);assert.equal(p.page.flowPage,true);assert.equal(p.hide.textEffectsRead,true);
 assert.match(Profiles.traceLine(p),/^profile senren-banka match=game:name exe=abababab layers=core\+engine\+game\+shared\+auto\+official\+stepdown engine=kirikiri/);
 const q=Profiles.profileFor({...input,official:{page:{holdMs:3,bogus:1}}});assert.equal(q.layers,'core+engine+game+shared+auto+stepdown');assert.equal(q.page.holdMs,2);assert.match(q.rejected,/official: page\.bogus/);
 assert.equal(Profiles.profileFor({}).exeSha256,'');assert.match(Profiles.traceLine(Profiles.profileFor({exe:'D:/x/a.exe'})),/ exe=- /);
 assert.ok(Profiles.matchScore({match:{exeSha256:[HASH]}},{exe:'D:/x/renamed.exe',exeSha256:HASH}).score>=10,'a repo game file may name its versions by hash');
});

test('self-check-live hands the four outside layers to profileFor from the stored record and the relay answer',()=>{
 const {inputOf}=require('../services/self-check-live.cjs');const K=HASH;
 const a=inputOf({key:K,input:{exe:'a.exe'},stored:{source:'calibration',settings:{page:{holdMs:2}}},shared:{source:'official',settings:{page:{holdMs:3}}}});
 assert.deepEqual([a.exeSha256,a.auto,a.official,a.shared,a.stepDown],[HASH,{page:{holdMs:2}},{page:{holdMs:3}},undefined,undefined]);
 const b=inputOf({key:K,input:{exe:'a.exe',official:{x:1}},stored:{source:'gate',settings:{hide:{textEffectsRead:true}}},shared:{source:'auto',settings:{page:{holdMs:1}}}});
 assert.deepEqual([b.stepDown,b.shared,b.official,b.auto],[{hide:{textEffectsRead:true}},{page:{holdMs:1}},undefined,undefined]);
 assert.equal(Profiles.profileFor(b).layers,'core+shared+stepdown');
});

test('one exe key: the full SHA-256, remembered by path, size and mtime',async()=>{
 const ap=require('../core/auto-profile.cjs'),gd=require('../core/game-diff.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-key-')),exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,'MZ-1');
 const k=await ap.exeKey(dir,exe);assert.equal(k,crypto.createHash('sha256').update('MZ-1').digest('hex'));assert.ok(ap.KEY.test(k)&&gd.KEY.test(k));assert.equal(ap.exeKeySync(dir,exe),k);
 assert.equal(require('../services/auto-profile-feed.cjs').dir(dir),path.join(dir,'data','profiles','remote'));
 assert.ok(fs.readFileSync(path.join(root,'relay/src/auto-profile.js'),'utf8').includes(String.raw`game-profile\/([0-9a-f]{64})`),'the relay route takes the full SHA-256');
});

test('HookBridge gets hide.engineTrial: env at spawn, a message when it changes, the kernel rule when unset',()=>{
 const {HookNative}=require('../core/hook-native.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-bridge-'));const h=new HookNative({native:dir,hook:dir,logs:dir},()=>{});h.trace=()=>{};
 assert.deepEqual(h.bridgeProfile(),{engineTrial:{}});
 const sent=[];h.process={stdin:{writable:true,write:l=>sent.push(JSON.parse(l))}};
 h.setProfile(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',official:{hide:{engineTrial:{enabled:false}}}}));
 assert.deepEqual(sent.at(-1),{type:'profile',engineTrial:{enabled:false}});const n=sent.length;
 h.setProfile(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe',official:{hide:{engineTrial:{enabled:false}}}}));assert.equal(sent.length,n,'unchanged: not sent again');
 assert.match(fs.readFileSync(path.join(root,'core/hook-native.cjs'),'utf8'),/MEGULIT_PROFILE:JSON\.stringify\(this\.bridgeProfile\(\)\)/);
 const cs=fs.readFileSync(path.join(root,'native/HookBridge.cs'),'utf8');
 for(const re of [/type=="profile"\)\{ApplyProfile\(d\);\}/,/ProfileFromEnv\(\);IntPtr module/,/\+\+EngineUnconfirmed>=ProfileUnconfirmed/,/TotalMilliseconds<ProfileClickMs/,/if\(ProfileTrial==0\)return false;/,/if\(!ProfileSelfTest\(\)\)/])assert.match(cs,re);
});
