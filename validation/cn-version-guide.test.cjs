// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 Chinese-build guide on the game page: fake game folders for the three checks (language switch, Japanese
   restore resources, online), the sites file the user writes, and the card's wording. Never touches real games. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),cg=require('../services/cn-version-guide.cjs');
const tmp=name=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cng-'+name+'-'));
function put(root,files){for(const [f,t] of Object.entries(files)){const file=path.join(root,f);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,t);}}
const kinds=list=>list.map(x=>x.kind);

test('a) language keys, language folders and archives, a settings program are found',()=>{
 const g=tmp('switch');put(g,{'Game.exe':'x','Config.exe':'x','system/config.ini':'[Text]\r\nTextLanguage=chs\r\nFontPath=msgothic\r\n','data_jp.xp3':'x','data_chs.xp3':'x','lang/ja/script.txt':'x','lang/zh/script.txt':'x','savedata/system.sav':Buffer.concat([Buffer.from([0,1,2]),Buffer.from('language=ja'),Buffer.from([0])])});
 const found=cg.scanSwitch(g,{exe:path.join(g,'Game.exe')});
 const key=found.find(x=>x.kind==='config-key'&&x.key==='TextLanguage');assert.ok(key);assert.equal(key.value,'chs');assert.equal(key.japanese,false);
 assert.ok(!found.some(x=>x.key==='FontPath'),'font settings are not language settings');
 assert.ok(found.some(x=>x.kind==='config-key'&&x.value==='ja'&&x.japanese),'binary save keys are read too');
 assert.deepEqual(found.filter(x=>x.kind==='lang-archive').map(x=>x.rel),['data_jp.xp3']);
 const folder=found.find(x=>x.kind==='lang-folder');assert.equal(folder.rel,path.join('lang','ja'));assert.equal(folder.multi,true);
 assert.ok(found.some(x=>x.kind==='config-tool'&&x.rel==='Config.exe'));
 assert.ok(!found.some(x=>x.kind==='steam'));fs.rmSync(g,{recursive:true,force:true});
});
test('a) a Steam install reports Steam\'s language option and the current language',()=>{
 const lib=tmp('steam'),g=path.join(lib,'steamapps','common','Some VN');put(lib,{'steamapps/common/Some VN/vn.exe':'x','steamapps/appmanifest_123.acf':'"AppState"\n{\n "appid" "123"\n "installdir" "Some VN"\n "UserConfig"\n {\n  "language" "schinese"\n }\n}\n'});
 const s=cg.scanSwitch(g,{exe:path.join(g,'vn.exe'),appid:'123'}).find(x=>x.kind==='steam');assert.deepEqual(s,{kind:'steam',appid:'123',current:'schinese'});
 fs.rmSync(lib,{recursive:true,force:true});
});
test('b) a Japanese program beside the Chinese one: one click when the patch is gone, uninstall first when it is not',()=>{
 const g=tmp('exe');put(g,{'Senren_chs.exe':'x','Senren_jp.exe':'x'});
 let r=cg.scanRestore(g,path.join(g,'Senren_chs.exe'));assert.deepEqual(kinds(r.found),['japanese-exe']);assert.equal(r.found[0].fix,'exe');assert.equal(r.found[0].path,path.join(g,'Senren_jp.exe'));
 put(g,{'unins000.exe':'x','unins001.exe':'x','unins001.dat':'x'});
 r=cg.scanRestore(g,path.join(g,'Senren_chs.exe'));assert.equal(r.patchActive,true);
 assert.deepEqual(kinds(r.found),['japanese-exe-blocked','uninstaller']);assert.equal(r.found[0].reveal,path.join(g,'unins001.exe'));assert.equal(r.found[1].rel,'unins001.exe');
 fs.rmSync(g,{recursive:true,force:true});
});
test('b) the Chinese-patch blocking issue reported by the language check also blocks the one-click start',()=>{
 const g=tmp('issue');put(g,{'game_cn.exe':'x','game_ja.exe':'x'});
 const r=cg.scanRestore(g,path.join(g,'game_cn.exe'),{languages:{issue:'CHINESE_PATCH_ACTIVE',versions:{}}});
 assert.deepEqual(kinds(r.found),['japanese-exe-blocked']);assert.equal(r.found[0].fix,'');fs.rmSync(g,{recursive:true,force:true});
});
test('b) patch-switch and restore-tool results come first and carry their one-click fixes',()=>{
 const g=tmp('swap');put(g,{'game.exe':'x','japanese_bak/REALLIVE.EXE':'x','japanese_bak/seen.txt':'x'});
 const r=cg.scanRestore(g,path.join(g,'game.exe'),{swap:{available:true,active:'zh',backup:'japanese_bak',exe:'REALLIVE.EXE'},restore:{state:'restorable',files:12}});
 assert.deepEqual(r.found.slice(0,2).map(x=>[x.kind,x.fix]),[['swap','swap'],['restore','restore']]);
 assert.ok(!r.found.some(x=>x.kind==='backup-folder'),'the swap backup is not listed twice');fs.rmSync(g,{recursive:true,force:true});
});
test('b) backup files, backup folders and Japanese archives are listed with a reveal button',()=>{
 const base=tmp('backup'),g=path.join(base,'Amayui [汉化硬盘版]');
 put(base,{'Amayui [汉化硬盘版]/game.exe':'x','Amayui [汉化硬盘版]/data.xp3':'zh','Amayui [汉化硬盘版]/data.xp3.bak':'ja','Amayui [汉化硬盘版]/原版备份/scenario.xp3':'ja','Amayui [汉化硬盘版]/日文原版.zip':'x','Amayui.7z':'x','Other Game.7z':'x','Amayui 汉化补丁.zip':'x'});
 const r=cg.scanRestore(g,path.join(g,'game.exe'));
 const files=r.found.find(x=>x.kind==='backup-files');assert.equal(files.count,1);assert.deepEqual(files.sample,['data.xp3.bak']);assert.equal(r.patchActive,true);
 assert.equal(r.found.find(x=>x.kind==='backup-folder').rel,'原版备份');
 assert.deepEqual(r.found.filter(x=>x.kind==='package').map(x=>path.basename(x.path)).sort(),['Amayui.7z','日文原版.zip']);
 assert.ok(r.found.every(x=>x.kind==='japanese-exe'||x.fix==='reveal'));fs.rmSync(base,{recursive:true,force:true});
});
test('b) a Japanese copy of the same work in a sibling folder is offered as the program to start',()=>{
 const base=tmp('nearby'),g=path.join(base,'千恋万花 [汉化版]');
 put(base,{'千恋万花 [汉化版]/SenrenBanka.exe':'x','千恋＊万花/SenrenBanka.exe':'x','千恋＊万花/unins000.exe':'x','Riddle Joker/RiddleJoker.exe':'x','千恋万花 中文补丁/SenrenBanka_chs.exe':'x'});
 const r=cg.scanRestore(g,path.join(g,'SenrenBanka.exe')),near=r.found.filter(x=>x.kind==='nearby');
 assert.equal(near.length,1);assert.equal(near[0].path,path.join(base,'千恋＊万花','SenrenBanka.exe'));assert.equal(near[0].fix,'exe');
 assert.equal(cg.similar('Riddle Joker','千恋万花'),false);assert.equal(cg.similar('[ゆずソフト] 千恋＊万花 v1.2','千恋万花 [汉化版]'),true);
 fs.rmSync(base,{recursive:true,force:true});
});
test('online: VNDB releases name Japanese patches and official Japanese+Chinese releases',()=>{
 const r=cg.parseReleases([
  {title:'Some VN',patch:false,official:true,languages:[{lang:'ja'}]},
  {title:'Some VN English',patch:false,official:true,languages:[{lang:'en'}]},
  {title:'Some VN Japanese Language Patch',patch:true,official:false,languages:[{lang:'ja'}]},
  {title:'Some VN 18+ patch',patch:true,official:true,languages:[{lang:'ja'}]},
  {title:'Some VN Steam',patch:false,official:true,languages:[{lang:'ja'},{lang:'zh-Hans'},{lang:'en'}]}]);
 assert.deepEqual(r.jaPatches,[{title:'Some VN Japanese Language Patch',fromEnglish:true}]);assert.deepEqual(r.multi,['Some VN Steam']);assert.equal(r.japaneseOriginal,true);
});
test('online: lookup asks VNDB and the Steam store, cached and refreshed in the background',async()=>{
 const root=tmp('online'),calls=[];
 const fetcher=async(url,o)=>{calls.push(url);return {ok:true,json:async()=>({results:[{title:'X ja',patch:false,official:true,languages:[{lang:'ja'},{lang:'zh-Hant'}]}]})};};
 const getText=async url=>{calls.push(url);return {ok:true,text:JSON.stringify({55:{success:true,data:{supported_languages:'English, Japanese<strong>*</strong>'}}})};};
 const prev=process.env.MEGULIT_RELAY_BASE;delete process.env.MEGULIT_RELAY_BASE;
 try{
  const first=cg.online(root,{vndbId:'v9',appid:'55'},{fetch:fetcher,getText});assert.equal(first.state,'pending');await first.job;
  const second=cg.online(root,{vndbId:'v9',appid:'55'},{fetch:fetcher,getText});assert.equal(second.state,'done');assert.equal(second.steamJapanese,true);assert.deepEqual(second.multi,['X ja']);
  assert.equal(calls.length,2);assert.match(calls[0],/api\.vndb\.org/);assert.match(calls[1],/appdetails\?appids=55/);
  assert.equal(cg.online(root,{vndbId:'',appid:''}).state,'none');
  process.env.MEGULIT_RELAY_BASE='off';assert.equal(cg.online(root,{vndbId:'v1',appid:''}).state,'off');
 }finally{if(prev===undefined)delete process.env.MEGULIT_RELAY_BASE;else process.env.MEGULIT_RELAY_BASE=prev;fs.rmSync(root,{recursive:true,force:true});}
});
test('c) the sites file: copied on first use, the user\'s edits survive an update, an unedited copy follows the new text',()=>{
 const root=tmp('sites'),ship=path.join(root,'shipped.txt');
 fs.writeFileSync(ship,'# comment\r\nSite A\r\n\r\n');
 let s=cg.sites(root,{shipped:ship});assert.deepEqual(s.lines,['Site A']);assert.equal(s.file,cg.sitesFile(root));assert.ok(fs.existsSync(s.file));
 fs.writeFileSync(ship,'# comment\r\nSite B\r\n');assert.deepEqual(cg.sites(root,{shipped:ship}).lines,['Site B'],'an unedited copy follows the shipped text');
 fs.writeFileSync(cg.sitesFile(root),'# mine\r\nMy own site\r\n');fs.writeFileSync(ship,'Site C\r\n');
 assert.deepEqual(cg.sites(root,{shipped:ship}).lines,['My own site'],'what the user typed is kept');
 fs.rmSync(root,{recursive:true,force:true});
 const shipped=fs.readFileSync(cg.SHIPPED,'utf8');assert.ok(shipped.split(/\r?\n/).filter(l=>l.trim()).every(l=>l.startsWith('#')),'the shipped file is a commented placeholder');
 assert.doesNotMatch(shipped,/https?:\/\//);
});
function library(rows){
 const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE games(id TEXT PRIMARY KEY,title TEXT,executable TEXT,original TEXT NOT NULL DEFAULT '{}',removed_at INTEGER,hidden_at INTEGER,source TEXT,status TEXT)");
 for(const [id,exe,lib] of rows)db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)').run(id,id,exe,JSON.stringify({library:lib||{}}));return db;
}
test('guide: shows for a Chinese build, not for a Japanese one or one already restored; falls back to the sites file',()=>{
 const root=tmp('guide'),base=tmp('games'),cn=path.join(base,'Alpha 汉化版'),jp=path.join(base,'Beta'),done=path.join(base,'Gamma');
 put(base,{'Alpha 汉化版/alpha_chs.exe':'x','Beta/beta.exe':'x','Gamma/gamma_chs.exe':'x','Gamma/.megulit-japanese/manifest.json':'{}'});
 const db=library([['a',path.join(cn,'alpha_chs.exe')],['b',path.join(jp,'beta.exe')],['c',path.join(done,'gamma_chs.exe')]]);
 const opts={online:false,brief:'unknown',restore:{state:'none'},shipped:path.join(root,'none.txt')};
 const g=cg.guide(db,root,'a',opts);assert.equal(g.chinese,true);assert.ok(g.signals.includes('exe-name'));assert.equal(g.online.state,'none','no VNDB / Steam id: nothing to look up');
 assert.equal(g.nothing,true);assert.deepEqual(g.sites.lines,[]);
 assert.equal(cg.guide(db,root,'b',opts).chinese,false);
 assert.equal(cg.guide(db,root,'c',opts).reason,'HANDLED');
 assert.equal(cg.guide(db,root,'a',{...opts,brief:'machine'}).chinese,false,'a Japanese script read from the game wins over the name');
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(base,{recursive:true,force:true});
});
test('reveal is limited to the game folder and its neighbours',()=>{
 const base=tmp('reveal'),g=path.join(base,'Game');put(base,{'Game/unins001.exe':'x','Other/a.zip':'x'});
 assert.equal(cg.revealable(g,path.join(g,'unins001.exe')),true);assert.equal(cg.revealable(g,path.join(base,'Other','a.zip')),true);
 assert.equal(cg.revealable(g,os.homedir()),false);assert.equal(cg.revealable(g,path.join(g,'missing.exe')),false);
 fs.rmSync(base,{recursive:true,force:true});
});
test('the card: big, three steps, one-click fixes, the sites text only when nothing was found',async()=>{
 const {guideItems}=await import('../web/cn-version-guide.js');
 const g={chinese:true,switch:[{kind:'lang-archive',rel:'data_jp.xp3',path:'x'},{kind:'steam',appid:'1',current:''}],restore:[{kind:'swap',fix:'swap',rel:'bak'},{kind:'japanese-exe',rel:'a_jp.exe',path:'p',fix:'exe'}],online:{state:'done',ok:true,steamJapanese:true,multi:['Steam'],jaPatches:[]},nothing:false,sites:{lines:['Site A']}};
 const v=guideItems(g,'zh');
 assert.match(v.switchItems[0].text,/文本语言/);assert.match(v.switchItems.find(x=>/Steam 商店/.test(x.text)).text,/属性 → 语言/);
 assert.deepEqual(v.restoreItems.map(x=>x.fix),['swap','exe']);assert.equal(v.sites,null);
 const empty=guideItems({...g,switch:[],restore:[],online:{state:'done',ok:true,jaPatches:[],multi:[]},nothing:true},'zh');
 assert.deepEqual(empty.sites.lines,['Site A']);assert.match(empty.onlineItems[0].text,/没查到/);
 for(const locale of ['en','ja'])assert.ok(guideItems(g,locale).restoreItems.every(x=>x.text&&!/undefined/.test(x.text)));
 const src=fs.readFileSync(path.join(__dirname,'../web/game-detail.js'),'utf8');assert.match(src,/mountCnGuide\(\{host:main\.querySelector\('\.game-detail-hero'\)/);
 const bridge=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');assert.match(bridge,/case 'cn_version_guide'/);assert.match(bridge,/case 'cn_guide_fix'/);
});
