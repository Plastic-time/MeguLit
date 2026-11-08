// SPDX-License-Identifier: GPL-3.0-or-later
// E203: statistics axes, review parsing/paging and the shared colour picker. Offline only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
test('statistics ticks are round numbers and the two charts share a gutter',async()=>{
 const {axisTicks,plotGutter,plotSVG}=await import('../web/statistics-view.js');
 assert.deepEqual(axisTicks(18142,'area'),[0,10000,20000]);assert.deepEqual(axisTicks(0,'area'),[0,1]);assert.deepEqual(axisTicks(1740,'rhythm'),[0,900,1800]);
 const rows=Array.from({length:12},(_,i)=>({day:'2026-'+String(i+1).padStart(2,'0'),characters:i*900,seconds:i*600}));
 assert.equal(plotGutter(rows,'zh'),plotGutter(rows,'zh'));
 const env={locale:'zh',esc:String,number:String,duration:s=>s+'s'};
 for(const kind of ['area','rhythm']){const svg=plotSVG(kind,rows,{range:'year'},env,900,200);assert.match(svg,/viewBox="0 0 900 200"/);assert(!svg.includes('NaN'));assert.equal((svg.match(/data-chart-index=/g)||[]).length,12);}
});
test('review helpers decode HTML, read EGS tables and only accept close title matches',()=>{
 const {htmlText,egsRows,bestMatch,sqlString}=require('../services/game-reviews.cjs');
 assert.equal(htmlText('<p>a &amp; b<br>c</p><p>d</p>'),'a & b\nc\n\nd');
 assert.deepEqual(egsRows('<div id="query_result_main"><table><tr><th>id</th><th>n</th></tr><tr><td>1</td><td>x&amp;y</td></tr></table></div>'),[{id:'1',n:'x&y'}]);
 assert.equal(bestMatch([{t:'STEINS;GATE 0'},{t:'STEINS；GATE'}],['STEINS;GATE'],c=>[c.t]).t,'STEINS；GATE');
 assert.equal(bestMatch([{t:'Totally different'}],['STEINS;GATE'],c=>[c.t]),null);
 assert.equal(sqlString("a'b"),"'a''b'");
});
test('review pages slice native source pages into any page size',async()=>{
 const {GameReviews}=require('../services/game-reviews.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rv-'));
 const r=new GameReviews(dir,async()=>{throw Error('offline');});r.game=id=>({id,titles:['X'],vndb:'v1',appid:''});r.file=path.join(dir,'sources.json');
 r.identity=async()=>({id:'v1'});r.score=async()=>({url:'https://vndb.org/v1'});
 const all=Array.from({length:45},(_,i)=>({id:'r'+i,text:'t'+i}));r.page_vndb=async(ident,n)=>({size:20,total:45,items:all.slice((n-1)*20,n*20)});
 const p=await r.page('g','vndb',3,10);assert.deepEqual(p.items.map(x=>x.id),['r20','r21','r22','r23','r24','r25','r26','r27','r28','r29']);assert.equal(p.pages,5);
 const last=await r.page('g','vndb',9,20);assert.equal(last.page,3);assert.deepEqual(last.items.map(x=>x.id),['r40','r41','r42','r43','r44']);
 await assert.rejects(r.page('g','nope',1,10),/INVALID_REVIEW_PLATFORM/);await assert.rejects(r.translate(['a'],'auto'),/INVALID_LANGUAGE/);
 fs.rmSync(dir,{recursive:true,force:true});
});
test('generated colour picker keeps history only and supports the accent save action',()=>{
 const text=fs.readFileSync(path.join(root,'web/reader/modules/color-picker.js'),'utf8');
 assert(text.includes('list.hidden=!chips.length;for(const value of chips)'));assert(text.includes("new CustomEvent('tome-color-action'"));assert(text.includes('.slice(0,8)'));
 assert(fs.readFileSync(path.join(root,'web/index.html'),'utf8').includes('reader/modules/color-picker.js'));
});
test('saved accent colours are hex, unique and capped at eight',()=>{
 const store=require('../services/store.cjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-pref-'));fs.mkdirSync(path.join(dir,'data'));
 fs.writeFileSync(path.join(dir,'data/preferences.json'),JSON.stringify({accentPresets:['#AA0000','#aa0000','bad',...Array.from({length:10},(_,i)=>'#0000'+String(i).padStart(2,'0'))]}));
 const list=store.publicPreferences(dir).accentPresets;assert.equal(list.length,8);assert.equal(list[0],'#aa0000');assert(list.every(v=>/^#[0-9a-f]{6}$/.test(v)));
 fs.rmSync(dir,{recursive:true,force:true});
});
test('review translation follows the chosen engine and falls back to machine for other targets',async()=>{
 const {GameReviews}=require('../services/game-reviews.cjs'),calls=[];
 const r=new GameReviews(os.tmpdir(),async()=>({ok:false,status:429,headers:new Headers()}),{engine:()=>'local',translate:async(text,lang,mode)=>{calls.push([text,lang,mode]);return '译:'+text;}});
 r.request=async()=>{throw Error('REVIEW_HTTP_429');};
 assert.deepEqual(await r.translate(['a','b'],'zh-CN'),{texts:['译:a','译:b'],engine:'local',requested:'local',error:''});
 assert.deepEqual(calls.map(c=>c[1]+c[2]),['zhlocal','zhlocal']);
 const ko=await r.translate(['x','y','z'],'ko');assert.equal(ko.engine,'machine');assert.equal(ko.error,'TRANSLATION_HTTP_429');assert.deepEqual(ko.texts,['','','']);
 const {cleanPreferences}=require('../core/preferences.cjs');assert.equal(cleanPreferences({reviewEngine:'follow'}).reviewEngine,'follow');assert.equal(cleanPreferences({reviewEngine:'nope'}).reviewEngine,undefined);
});
test('translated-only installs stay launchable and are recognised as Chinese editions',()=>{
 const {playableGame}=require('../core/library.cjs'),{languageHint}=require('../services/game-language.cjs');
 assert.equal(playableGame({dir:'X:/none',exe:'X:/none/clannadFV_sc.exe',variants:[]}).exe,'X:/none/clannadFV_sc.exe');
 assert.equal(languageHint('clannadFV_sc.exe'),'zh');assert.equal(languageHint('game.exe'),'');
});
test('a removed game returns only when it is reinstalled with a different program',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-revive-')),store=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs');
 const exe=path.join(dir,'game_sc.exe');fs.writeFileSync(exe,'x');const db=store.openStore(dir);
 db.prepare("INSERT INTO games(id,title,executable,cover,source,original,removed_at) VALUES('game-r','Old',?, '', 'scan', ?, 1)").run(path.join(dir,'REALLIVE.EXE'),JSON.stringify({library:{mediaId:7}}));db.prepare("UPDATE games SET legacy_id=7 WHERE id='game-r'").run();db.close();
 reconcile(dir,[{mediaId:7,title:'Old',exe:path.join(dir,'REALLIVE.EXE'),dir}]);
 let check=store.openStore(dir);assert.notEqual(check.prepare("SELECT removed_at FROM games WHERE id='game-r'").get().removed_at,null);check.close();
 reconcile(dir,[{mediaId:7,title:'Old',exe,dir}]);
 check=store.openStore(dir);const row=check.prepare("SELECT removed_at,executable FROM games WHERE id='game-r'").get();check.close();
 assert.equal(row.removed_at,null);assert.equal(row.executable,exe);fs.rmSync(dir,{recursive:true,force:true});
});
