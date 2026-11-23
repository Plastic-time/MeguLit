// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 (owner: 传火不能只靠 exe 哈希) multi-level recognition and the version / game layers on the client (docs/diff-layers.md):
// prints (core/game-print.cjs) exe/head/pe -> pack/script/steam/vndb/title -> engine; the relay answers both layers with the print
// that matched; version keys only on an exe-level match; a non-exact diff is a candidate the self-check gate may refuse.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Domains=require('../core/profiles/domains.cjs'),GameDiff=require('../core/game-diff.cjs');
const Profiles=require('../core/profiles/index.cjs'),feed=require('../services/auto-profile-feed.cjs');
const EXE='ab'.repeat(32),OTHER='cd'.repeat(32),GAME='ef'.repeat(32);
const {publicKey,privateKey}=crypto.generateKeyPairSync('ed25519');
const signed=d=>({...d,signature:{alg:'ed25519',keyId:'t',value:crypto.sign(null,Buffer.from(GameDiff.canonical(GameDiff.unsigned(d))),privateKey).toString('base64')}});
const doc=o=>signed(GameDiff.build({source:'official',mode:'hide',issuedAt:'2026-11-21T00:00:00Z',rev:1,...o}));
const feedOf=(versionLayer,gameLayer)=>({schema:'megulit.game-diff-feed',version:2,key:EXE,match:(versionLayer||gameLayer).match,versionLayer,gameLayer,diff:(versionLayer||gameLayer).diff});
test.before(()=>feed._trust([{id:'t',alg:'ed25519',publicKey:publicKey.export({format:'der',type:'spki'}).toString('base64')}]));
test.after(()=>feed._trust(null));

test('every key is labelled with its layer; version keys are the exe-only ones; split keeps the shape',()=>{
 for(const [k,d] of Object.entries(Domains.DOMAINS))assert.ok(['version','game'].includes(d.layer),k);
 assert.equal(Domains.layerOf('draw.embed'),'version');assert.equal(Domains.layerOf('hide.engineTrial.clickMs'),'version');assert.equal(Domains.layerOf('calibrate.textBox'),'game');
 assert.deepEqual(Domains.split({page:{holdMs:9},hide:{engineTrial:{enabled:false},preflight:true}}),{version:{hide:{engineTrial:{enabled:false}}},game:{page:{holdMs:9},hide:{preflight:true}}});
});

test('a game-layer document holds only game keys; a version document may leave the mode to the game layer',()=>{
 const g=GameDiff.build({key:GAME,layer:'game',source:'official',mode:'hide',settings:{page:{holdMs:1},draw:{embed:true}}});
 assert.deepEqual(g.settings,{page:{holdMs:1}});assert.equal(GameDiff.validate(g).ok,true);assert.equal(GameDiff.validate({...g,settings:{draw:{embed:true}}}).error,'LAYER_KEYS');
 const v=GameDiff.build({key:EXE,source:'official',settings:{draw:{embed:true}}});assert.equal(v.mode,undefined);assert.equal(GameDiff.validate(v).ok,true);
 assert.equal(GameDiff.validate({...g,mode:undefined}).error,'MODE');
});

test('the query carries every print and the revisions held, never a path',()=>{
 const q=feed.query(EXE,{head:OTHER,pe:'1.0.0.0@5f3a1b2c',steam:'1144400',title:GAME,engine:'kirikiri',bogus:'C:/Users/x'},null);
 assert.equal(q,'?exe='+EXE+'&head='+OTHER+'&pe=1.0.0.0%405f3a1b2c&steam=1144400&title='+GAME+'&engine=kirikiri');
 const old=feedOf({match:'exe',key:EXE,diff:doc({key:EXE,rev:4,settings:{draw:{embed:true}}})},{match:'steam',key:GAME,diff:doc({key:GAME,layer:'game',rev:7,settings:{page:{holdMs:7}}})});
 assert.match(feed.query(EXE,{},old),/&have=4&haveGame=7$/);
});

test('relay answer: exe-level matches use both layers, a game match only the game layer; v1 is an exact exe answer',()=>{
 const ver=doc({key:OTHER,settings:{draw:{embed:true}}}),gam=doc({key:GAME,layer:'game',settings:{page:{holdMs:7}}});
 const head=feed.layer(feedOf({match:'head',key:OTHER,diff:ver},{match:'pack',key:GAME,diff:gam}),EXE);
 assert.deepEqual([head.match,head.exact,head.version.settings,head.game.settings,head.settings],['head',false,{draw:{embed:true}},{page:{holdMs:7}},{page:{holdMs:7},draw:{embed:true}}]);
 const game=feed.layer(feedOf(null,{match:'steam',key:GAME,diff:gam}),EXE);assert.deepEqual([game.match,game.exact,game.version],['game:steam',false,null]);
 assert.equal(feed.layer(feedOf({match:'steam',key:OTHER,diff:ver},null),EXE),null,'a version document never comes by a game print');
 assert.equal(feed.layer(feedOf({match:'exe',key:OTHER,diff:ver},null),EXE),null,'matched by exe it must be this exe');
 assert.equal(feed.layer(feedOf(null,{match:'pack',key:GAME,diff:{...gam,settings:{page:{holdMs:8}}}}),EXE),null,'a changed byte breaks the signature');
 const own=feed.layer(feedOf(null,{match:'exe',key:GAME,diff:gam}),EXE);assert.deepEqual([own.match,own.exact],['exe',true],'a game layer found by this exe itself is exact');
 const v1=feed.layer({schema:'megulit.game-diff-feed',version:1,key:EXE,diff:doc({key:EXE,settings:{page:{holdMs:5}}})},EXE);assert.deepEqual([v1.match,v1.exact],['exe',true]);
});

test('layers: shared-game <- shared <- auto <- official-game <- official <- stepdown; the trace names the match',()=>{
 const {inputOf}=require('../services/self-check-live.cjs');
 const sh=feed.layer(feedOf({match:'head',key:OTHER,diff:doc({key:OTHER,source:'auto',settings:{draw:{embed:true},page:{holdMs:4}}})},{match:'pack',key:GAME,diff:doc({key:GAME,layer:'game',settings:{page:{holdMs:7}}})}),EXE);
 const input=inputOf({key:EXE,input:{exe:'D:/g/a.exe'},stored:{source:'calibration',settings:{page:{holdMs:2}}},shared:sh});
 const p=Profiles.profileFor(input);assert.equal(p.layers,'core+shared+auto+official-game');assert.equal(p.page.holdMs,7);assert.equal(p.draw.embed,true);
 assert.match(Profiles.traceLine(p),/^profile auto-[0-9a-f]{10} match=head exe=abababab /);
 assert.match(Profiles.traceLine(Profiles.profileFor({engine:'kirikiri'})),/ match=engine /);
 assert.match(Profiles.traceLine(Profiles.profileFor({exe:'D:/g/SenrenBanka.exe'})),/^profile senren-banka match=game:name /);
});

test('a refused candidate stays refused until the relay hands out another; an exact diff is never a candidate; The Seed folder',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit cand '));
 const l=feed.layer(feedOf(null,{match:'title',key:GAME,diff:doc({key:GAME,layer:'game',settings:{page:{holdMs:7}}})}),EXE);
 assert.equal(feed.rejected(root,EXE,l),false);feed.reject(root,EXE,l,'over dropRate');assert.equal(feed.rejected(root,EXE,l),true);
 assert.ok(fs.existsSync(path.join(root,'data','The Seed',EXE+'.rejected.json')),'kept in data/The Seed/ (a folder name with a space)');
 const newer=feed.layer(feedOf(null,{match:'title',key:GAME,diff:doc({key:GAME,layer:'game',rev:2,settings:{page:{holdMs:8}}})}),EXE);assert.equal(feed.rejected(root,EXE,newer),false);
 const exact=feed.layer(feedOf({match:'exe',key:EXE,diff:doc({key:EXE,settings:{page:{holdMs:1}}})},null),EXE);feed.reject(root,EXE,exact);assert.equal(feed.rejected(root,EXE,exact),false);
 const src=fs.readFileSync(path.join(__dirname,'..','services','self-check-live.cjs'),'utf8');
 assert.match(src,/r\.window===1&&s\.shared&&s\.shared\.exact===false&&!r\.pass/);assert.match(src,/feed\.reject\(reader\.root,s\.key,l,why\)/);assert.match(src,/game-print\.cjs'\)\.prints\(s\.exe/);
});
