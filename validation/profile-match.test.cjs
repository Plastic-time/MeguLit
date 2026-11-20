// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner: 传火不能只靠 exe 哈希) multi-level game recognition and the version / game layers (docs/diff-layers.md):
// exe hash -> binary (probe head/tail hash, PE time stamp) -> game identity (archives, Steam, VNDB, title) -> engine; version
// keys only on an exe-level match, game keys on any; a non-exact diff is a candidate the self-check gate may refuse.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Domains=require('../core/profiles/domains.cjs'),GameDiff=require('../core/game-diff.cjs'),Identity=require('../core/profiles/identity.cjs');
const Profiles=require('../core/profiles/index.cjs'),feed=require('../services/auto-profile-feed.cjs');
const EXE='ab'.repeat(32),OTHER='cd'.repeat(32),GAMEKEY='ef'.repeat(32);
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const signed=d=>({...d,signature:{alg:'ed25519',keyId:'t',value:crypto.sign(null,Buffer.from(GameDiff.canonical(GameDiff.unsigned(d))),privateKey).toString('base64')}});
const doc=(o)=>signed(GameDiff.build({source:'official',mode:'hide',issuedAt:'2026-11-21T00:00:00Z',...o}));
test.before(()=>feed._trust([{id:'t',alg:'ed25519',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}]));
test.after(()=>feed._trust(null));

test('every key has a tier; version keys are the exe-only ones; split keeps the shape',()=>{
 assert.equal(Domains.tierOf('draw.embed'),'version');assert.equal(Domains.tierOf('hide.engineTrial.clickMs'),'version');assert.equal(Domains.tierOf('calibrate.textBox'),'game');assert.equal(Domains.tierOf('choice.filters'),'game');
 assert.deepEqual(Domains.split({page:{holdMs:9},hide:{engineTrial:{enabled:false},preflight:true}}),{version:{hide:{engineTrial:{enabled:false}}},game:{page:{holdMs:9},hide:{preflight:true}}});
});

test('a scoped document carries only its tier; a game document names its game',()=>{
 const g=GameDiff.build({key:GAMEKEY,source:'official',mode:'hide',scope:'game',game:'senren-banka',settings:{page:{holdMs:1},draw:{embed:true}}});
 assert.deepEqual(g.settings,{page:{holdMs:1}});assert.equal(GameDiff.validate(g).ok,true);
 assert.equal(GameDiff.validate({...g,settings:{draw:{embed:true}}}).error,'TIER');assert.equal(GameDiff.validate({...g,game:undefined}).error,'GAME');
 assert.equal(GameDiff.validate({...g,scope:'world'}).error,'SCOPE');
 const v=GameDiff.build({key:EXE,source:'official',mode:'hide',scope:'version',settings:{page:{holdMs:1},draw:{embed:true}}});assert.deepEqual(v.settings,{draw:{embed:true}});
 assert.equal(GameDiff.validate(GameDiff.build({key:EXE,source:'official',mode:'hide',settings:{page:{holdMs:1},draw:{embed:true}}})).ok,true,'an unscoped (exe) document keeps both tiers');
});

test('fingerprints: PE time stamp, archive set, public ids; the query carries no path',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ident-')),exe=path.join(dir,'Game.exe');
 const pe=Buffer.alloc(512);pe.write('MZ',0,'latin1');pe.writeUInt32LE(128,60);pe.write('PE\0\0',128,'latin1');pe.writeUInt32LE(0x5f5e0ff,136);fs.writeFileSync(exe,pe);
 fs.writeFileSync(path.join(dir,'data.xp3'),Buffer.alloc(70000));fs.mkdirSync(path.join(dir,'savedata'));fs.writeFileSync(path.join(dir,'savedata','big.dat'),Buffer.alloc(70000));
 assert.equal(Identity.peStamp(exe),'05f5e0ff');
 const id=await Identity.identityOf({root:dir,exe,title:'千恋＊万花',steamAppId:'1144400',vndb:'v19073',engine:'KiriKiri'});
 assert.match(id.exe,/^[0-9a-f]{64}$/);assert.match(id.bin,/^[0-9a-f]{64}$/);assert.match(id.files,/^[0-9a-f]{32}$/);assert.equal(id.steam,'1144400');assert.equal(id.engine,'kirikiri');
 const copy=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-ident2-'));fs.writeFileSync(path.join(copy,'data.xp3'),Buffer.alloc(70000));
 assert.equal(Identity.filesPrint(copy),id.files,'the same archives in another folder (no saves) give the same print');
 const q=Identity.query(id);assert.ok(!q.includes(encodeURIComponent(dir))&&!/Users|Games/i.test(q));assert.match(q,/^\?bin=[0-9a-f]{64}&pe=05f5e0ff&files=/);
});

test('relay answer v2: exe/bin use version + game documents, a game match only the game one; v1 is an exact exe answer',()=>{
 const ver=doc({key:OTHER,scope:'version',settings:{draw:{embed:true}}}),gam=doc({key:GAMEKEY,scope:'game',game:'senren-banka',settings:{page:{holdMs:7}}});
 const bin=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'bin',diffs:[ver,gam]},EXE);
 assert.deepEqual([bin.match,bin.exact,bin.versionSettings,bin.gameSettings],['bin',false,{draw:{embed:true}},{page:{holdMs:7}}]);assert.deepEqual(bin.settings,{page:{holdMs:7},draw:{embed:true}});
 const game=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'game:steam',diffs:[ver,gam]},EXE);
 assert.deepEqual([game.match,game.versionSettings,game.gameSettings],['game:steam',null,{page:{holdMs:7}}]);
 assert.equal(feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'game:steam',diffs:[ver]},EXE),null,'a version document never applies to another version');
 const tampered={...gam,settings:{page:{holdMs:8}}};assert.equal(feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'exe',diffs:[tampered]},EXE),null);
 const v1=feed.layer({schema:'megulit.game-diff-feed',version:1,key:EXE,diff:doc({key:EXE,settings:{page:{holdMs:5},draw:{embed:true}}})},EXE);
 assert.deepEqual([v1.match,v1.exact,v1.gameSettings,v1.versionSettings],['exe',true,{page:{holdMs:5}},{draw:{embed:true}}]);
});

test('layers and trace: official-game under official (version); match names the level',()=>{
 const {inputOf}=require('../services/self-check-live.cjs');
 const sh=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'bin',diffs:[doc({key:OTHER,scope:'version',settings:{draw:{embed:true}}}),doc({key:GAMEKEY,scope:'game',game:'some-game',settings:{page:{holdMs:7}}})]},EXE);
 const input=inputOf({key:EXE,input:{exe:'D:/g/a.exe'},stored:{source:'calibration',settings:{page:{holdMs:2}}},shared:sh});
 const p=Profiles.profileFor(input);assert.equal(p.layers,'core+auto+official-game+official');assert.equal(p.page.holdMs,7);assert.equal(p.draw.embed,true);
 assert.match(Profiles.traceLine(p),/^profile auto-[0-9a-f]{10} match=bin exe=abababab /);
 assert.match(Profiles.traceLine(Profiles.profileFor({engine:'kirikiri'})),/ match=engine /);
 assert.match(Profiles.traceLine(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'})),/^profile senren-banka match=game:name /);
 assert.match(Profiles.traceLine(Profiles.profileFor({})),/ match=none /);
});

test('a refused candidate stays refused until the relay hands out another one; an exact diff is never a candidate',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cand-'));
 const l=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'game:files',diffs:[doc({key:GAMEKEY,scope:'game',game:'some-game',settings:{page:{holdMs:7}}})]},EXE);
 assert.equal(feed.rejected(root,EXE,l),false);feed.reject(root,EXE,l,'over dropRate');assert.equal(feed.rejected(root,EXE,l),true);
 const newer=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'game:files',diffs:[doc({key:GAMEKEY,scope:'game',game:'some-game',issuedAt:'2026-11-22T00:00:00Z',settings:{page:{holdMs:8}}})]},EXE);
 assert.equal(feed.rejected(root,EXE,newer),false);
 const exact=feed.layer({schema:'megulit.game-diff-feed',version:2,key:EXE,match:'exe',diffs:[doc({key:EXE,settings:{page:{holdMs:1}}})]},EXE);feed.reject(root,EXE,exact);assert.equal(feed.rejected(root,EXE,exact),false);
 const src=fs.readFileSync(path.join(__dirname,'..','services','self-check-live.cjs'),'utf8');
 assert.match(src,/r\.window===1&&s\.shared&&s\.shared\.exact===false&&!r\.pass/);assert.match(src,/feed\.reject\(reader\.root,s\.key,l,why\)/);assert.match(src,/identityOf\(\{root:reader\.root/);
});
