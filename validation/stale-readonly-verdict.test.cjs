// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user test copy: 千恋＊万花 kept 「实测只能读取」 after its hide was fixed the same day). A "readonly" verdict
   (original.library.hook, written by services/reader.cjs when a run could only read) never expired: reader.cjs did not
   write over it and only a startup scan of a catalog game reset it, so a game outside the scanned folders kept the old label
   after an update. The verdict now carries the build that saw it; a readonly verdict from another build shows as untested
   (内嵌待实测) and is redone by this build's next run. The bridge's learned "cannot hide" glyph records follow the same rule. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const verdict=require('../services/hook-verdict.cjs');
const tmp=p=>fs.mkdtempSync(path.join(os.tmpdir(),p));
const embedStatus=async()=> (await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../web/embed-status.js')).toString('base64'))).embedStatus;

test('a readonly verdict from another build (or without a stamp) is stale and shown as untested',async()=>{
 const old={hook:'readonly',hookReadonlyAt:1,hookReadonlyBuild:'1.4.16'},unstamped={hook:'readonly',hookReadonlyAt:1},mine={hook:'readonly',hookReadonlyBuild:'1.4.17'};
 assert.equal(verdict.stale(old,'1.4.17'),true);assert.equal(verdict.stale(unstamped,'1.4.17'),true);assert.equal(verdict.stale(mine,'1.4.17'),false);
 assert.equal(verdict.stale({hook:'verified'},'1.4.17'),false);assert.equal(verdict.stale({hook:'supported'},'1.4.17'),false);
 assert.equal(verdict.shown(old,'1.4.17'),'unverified');assert.equal(verdict.shown(mine,'1.4.17'),'readonly');assert.equal(verdict.shown({hook:'verified'},'1.4.17'),'verified');assert.equal(verdict.shown({},'1.4.17'),'unknown');
 const status=await embedStatus();
 assert.equal(status({hookSupport:verdict.shown(old,'1.4.17'),engine:'KiriKiri'},'zh').label,'内嵌待实测');
 assert.equal(status({hookSupport:verdict.shown(mine,'1.4.17'),engine:'KiriKiri'},'zh').label,'实测只能读取');
});

test('upgrade replay: the old verdict is redone by this build, a verified embed still wins',()=>{
 let library={hook:'readonly',hookReadonlyAt:1,hookReadonlyBuild:'1.4.16'};
 assert.equal(verdict.mayMarkReadonly(library,'1.4.17'),true,'a run of 1.4.17 that can only read stamps the verdict again');
 library={...library,hook:'readonly',hookReadonlyAt:2,hookReadonlyBuild:'1.4.17'};
 assert.equal(verdict.mayMarkReadonly(library,'1.4.17'),false,'written once per build');
 assert.equal(verdict.mayMarkReadonly({hook:'verified'},'1.4.17'),false);assert.equal(verdict.mayMarkReadonly({hook:'supported'},'1.4.17'),true);assert.equal(verdict.mayMarkReadonly(undefined,'1.4.17'),true);
 const reader=fs.readFileSync(path.join(__dirname,'../services/reader.cjs'),'utf8');
 assert.match(reader,/const verdict=require\('\.\/hook-verdict\.cjs'\),build=verdict\.appVersion\(this\.root\);if\(verdict\.mayMarkReadonly\(original\.library,build\)\)\{original\.library=\{\.\.\.original\.library,hook:'readonly',hookReadonlyAt:Date\.now\(\),hookReadonlyBuild:build\};/);
 assert.ok(!reader.includes("!['verified','readonly'].includes(original.library?.hook)"),'the old never-expiring guard is gone');
});

test('the library list, the adaptation overview and sharing use the build-aware verdict',()=>{
 const root=tmp('stale-verdict-');fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data','update-installed.json'),JSON.stringify({version:'1.4.17'}));
 const {openStore,games}=require('../services/store.cjs'),db=openStore(root);
 try{
  const ins=db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)');
  ins.run('old','千恋＊万花','',JSON.stringify({library:{engine:'KiriKiri',hook:'readonly',hookReadonlyAt:1}}));
  ins.run('new','Read only','',JSON.stringify({library:{engine:'YU-RIS',hook:'readonly',hookReadonlyAt:2,hookReadonlyBuild:'1.4.17'}}));
  ins.run('ok','Verified','',JSON.stringify({library:{engine:'BGI / Ethornell',hook:'verified'}}));
  const by=Object.fromEntries(games(db,root).map(g=>[g.id,g.hookSupport]));
  assert.deepEqual(by,{old:'unverified',new:'readonly',ok:'verified'});
  const o=Object.fromEntries(require('../services/adaptation-overview.cjs').overview(db,root).games.map(g=>[g.id,g]));
  assert.equal(o.old.hookSupport,'unverified');assert.equal(o.old.reading,'reads','it did read text; only the embed result is redone');assert.equal(o.new.hookSupport,'readonly');assert.equal(o.ok.hookSupport,'verified');
 }finally{db.close();}
 const shared=fs.readFileSync(path.join(__dirname,'../services/shared-adaptation.cjs'),'utf8');
 assert.match(shared,/embed:library\?require\('\.\/hook-verdict\.cjs'\)\.shown\(library,installedVersion\(root\),''\):undefined,/,'a stale readonly verdict is not shared with other PCs');
 assert.match(fs.readFileSync(path.join(__dirname,'../services/diagnostics.cjs'),'utf8'),/hookReadonlyBuild:library\.hookReadonlyBuild\|\|null,hookVerdictStale:/);
});

test('the bridge tries a learned cannot-hide glyph record from another build again',()=>{
 const cs=fs.readFileSync(path.join(__dirname,'../native/HookBridge.cs'),'utf8');
 assert.match(cs,/bool here=LearnedHere\(d,BridgeBuild\(\)\);/);
 assert.match(cs,/if\(here&&d\.TryGetValue\("cached",out v\)&&Convert\.ToBoolean\(v\)\)\{GlyphCached=true;/);
 assert.match(cs,/\}else if\(here&&d\.TryGetValue\("allFailed",out v\)\)\{GlyphAllFailedVersion=/);
 assert.match(cs,/GlyphSave\(new Dictionary<string,object>\{\{"allFailed",GlyphVersion\},\{"bridge",BridgeBuild\(\)\},/);
 assert.match(cs,/GlyphSave\(new Dictionary<string,object>\{\{"cached",true\},\{"bridge",BridgeBuild\(\)\},/);
 assert.match(cs,/if\(!LearnedSelfTest\(\)\)\{Console\.Error\.WriteLine/,'native self-test wired');
});
