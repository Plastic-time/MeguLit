// SPDX-License-Identifier: GPL-3.0-or-later
// 2026-11-21 The Seed (tools/diff-maker/seed-all.cjs): a made-up MeguLit install (library, original-text index, launch log, the
// trimmed 千恋＊万花 runtime sample) gives one complete seed (game.json + versions/<exe>.json, no path or name inside) and one
// skeleton for a game without a sample; the summary counts them.
'use strict';
process.env.MEGULIT_RELAY_BASE??='off';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const Seed=require('../tools/diff-maker/seed-all.cjs'),SeedFormat=require('../core/profiles/seed.cjs');
const PROBE=path.join(__dirname,'helpers','diff-maker','probes','senren-banka');

test('seed-all: every game a seed with status and the pinned values of today, readable slugs, nothing local in the repo files',{skip:!(()=>{try{require('node:sqlite');return true;}catch{return false;}})()},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'seed-'));const root=path.join(tmp,'install'),games=path.join(tmp,'games'),out=path.join(tmp,'out'),seed=path.join(tmp,'The Seed');
 try{
  for(const d of ['data/config','logs'])fs.mkdirSync(path.join(root,d),{recursive:true});
  const exeA=path.join(games,'Senren','SenrenBanka.exe'),exeB=path.join(games,'Other','Other.exe');
  for(const [f,body] of [[exeA,'MZ fake senren'],[exeB,'MZ fake other']]){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,body);}
  fs.writeFileSync(path.join(games,'Senren','scn.xp3'),Buffer.alloc(2<<20,7));
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(root,'data','megulit.sqlite'));
  db.exec('CREATE TABLE games(id TEXT,legacy_id TEXT,title TEXT,executable TEXT,cover TEXT,source TEXT,status TEXT,last_launched_at TEXT,original TEXT,removed_at TEXT,hidden_at TEXT)');
  const ins=db.prepare('INSERT INTO games(id,title,executable,source,status,original) VALUES(?,?,?,?,?,?)');
  ins.run('game-a','千恋＊万花',exeA,'steam','active',JSON.stringify({library:{appid:'1144400',names:['千恋＊万花','千恋万花'],engine:'KiriKiri',vndbId:'v19073',contentLanguage:'ja'}}));
  ins.run('game-b','Other',exeB,'local','active',JSON.stringify({library:{engine:'BGI'}}));db.close();
  const lines=JSON.parse(fs.readFileSync(path.join(PROBE,'scripts','lines.json'),'utf8'));const idx=path.join(root,'data','idx.json');fs.writeFileSync(idx,JSON.stringify({lines:lines.lines,ruby:lines.ruby}));
  fs.writeFileSync(path.join(root,'data','config','original-text.json'),JSON.stringify({'game-a':{status:'native-japanese',engine:'kirikiri-cx',runtime:{index:idx,sha256:'3'.repeat(64),lines:lines.lines.length}}}));
  const hook=fs.readFileSync(path.join(PROBE,'runtime','hook-events.log'),'utf8');const first=hook.match(/^\S+/)[0];
  fs.writeFileSync(path.join(root,'logs','hook-events.log'),hook);fs.copyFileSync(path.join(PROBE,'runtime','reader-host.log'),path.join(root,'logs','reader-host.log'));
  fs.writeFileSync(path.join(root,'logs','game-launch.log'),[JSON.stringify({at:'2026-11-20T10:00:00.000Z',gameId:'game-b',stage:'launch-request'}),JSON.stringify({at:new Date(Date.parse(first)-1000).toISOString(),gameId:'game-a',stage:'launch-request'})].join('\n')+'\n');
  const sha=crypto.createHash('sha256').update('MZ fake senren').digest('hex');
  const log=console.log,fetcher=globalThis.fetch,token=process.env.ADAPTER_ADMIN_TOKEN,receipts=[];
  console.log=()=>{};process.env.ADAPTER_ADMIN_TOKEN='fixture-admin';
  globalThis.fetch=async(url,options)=>{
   assert.equal(url.href,'http://localhost:9182/api/seed-admin/game-request-evidence');
   assert.equal(options.headers.authorization,'Bearer fixture-admin');
   const receipt=JSON.parse(options.body);
   assert.equal(fs.existsSync(path.join(seed,'kirikiri','senren-banka','game.json')),receipt.ended);
   receipts.push(receipt);return Response.json({ok:true},{status:201});
  };
  try{
   await Seed.main(['node','seed-all','--root',root,'--out',out,'--seed',seed,
    '--request-selector','v19073|kirikiri|ja|'+sha+'|'+'3'.repeat(64),'--request-relay','http://localhost:9182']);
  }finally{
   console.log=log;globalThis.fetch=fetcher;
   if(token===undefined)delete process.env.ADAPTER_ADMIN_TOKEN;else process.env.ADAPTER_ADMIN_TOKEN=token;
  }
  assert.deepEqual(receipts.map(r=>[r.kind,r.ended]),[['generating',false],['generating',true]]);
  assert.equal(receipts[0].ref,receipts[1].ref);
  const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else files.push(path.relative(seed,p).replace(/\\/g,'/'));}};walk(seed);
  assert.deepEqual(files.sort(),['bgi/other/game.json','bgi/other/versions/'+crypto.createHash('sha256').update('MZ fake other').digest('hex')+'.json','kirikiri/senren-banka/game.json','kirikiri/senren-banka/versions/'+sha+'.json'].sort());
  for(const f of files){const text=fs.readFileSync(path.join(seed,f),'utf8');const d=JSON.parse(text);const m=/^([^/]+)\/([^/]+)\/(game\.json|versions\/(.+))$/.exec(f);assert.deepEqual(SeedFormat.check(d,m[3]==='game.json'?{engine:m[1],slug:m[2]}:{engine:m[1],file:m[4]}).errors,[],f);
   assert.ok(!text.includes(tmp)&&!text.includes(tmp.replace(/\\/g,'/'))&&!/[A-Za-z]:[\\/]/.test(text),f+': no path');}
  const game=JSON.parse(fs.readFileSync(path.join(seed,'kirikiri','senren-banka','game.json'),'utf8'));assert.equal(game.layer,'game');assert.equal(game.slug,'senren-banka');assert.equal(game.status,'verified');assert.deepEqual(game.builds,[sha]);assert.equal(game.prints.steam,'1144400');assert.ok(game.prints.pack,'main archive print');
  assert.equal(game.key,require('../tools/diff-maker/probe.cjs').gameId(game.prints),'game key = relay gidFor of its prints');assert.equal(game.settings.placement.drawWhileBlanking,true,'the game diff value is pinned');
  assert.equal(game.settings.placement.lineOffsetY,0,'non-null kernel defaults are pinned too');assert.ok(!game.settings.selfCheck&&!game.settings.calibrate,'gate thresholds and calibration stay with their layers');assert.ok(!('effectFrames' in (game.settings.page||{})),'null (the kernel decides) is not pinned');
  assert.ok(game.match.titles.includes('千恋＊万花'),'the library title is in match.titles');assert.ok(game.match.exe.includes('SenrenBanka.exe'));
  const other=JSON.parse(fs.readFileSync(path.join(seed,'bgi','other','game.json'),'utf8'));assert.equal(other.status,'skeleton');assert.equal(other.mode,'hide');assert.equal(other.settings.hide.textEffectsRead,false);
  const rpt=fs.readFileSync(path.join(out,'report.md'),'utf8');assert.match(rpt,/verified：有样本且自检全过线，直接用：1 部/);assert.match(rpt,/skeleton：.*：1 部/);assert.match(rpt,/千恋＊万花（千恋万花）/);
  assert.ok(rpt.indexOf('## verified')<rpt.indexOf('## skeleton'),'grouped by status');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
