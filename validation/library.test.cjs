// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore,games}=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs');
const {Library}=require('../core/library.cjs');
test('a saved Steam common path reaches manifest AppIDs and invalidates old negative scan entries',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-steam-common-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config=path.join(root,'config'),apps=path.join(root,'Steam','steamapps');
 const common=path.join(apps,'common'),game=path.join(common,'Fixture');
 fs.mkdirSync(game,{recursive:true});
 fs.mkdirSync(config);
 fs.writeFileSync(path.join(game,'Fixture.exe'),Buffer.alloc(22000));
 fs.writeFileSync(path.join(game,'UnityPlayer.dll'),'');
 fs.writeFileSync(path.join(apps,'appmanifest_123456.acf'),'"AppState" { "appid" "123456" "name" "Fixture" "installdir" "Fixture" }');
 fs.writeFileSync(path.join(config,'library.json'),JSON.stringify({steamPath:common,scanVersion:3,notGal:{[game.toLowerCase()]:Math.round(fs.statSync(game).mtimeMs)}}));
 const fetch=t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({results:[{vns:[{id:'v123',title:'Fixture'}]}]})}));
 const library=new Library({root,config});
 assert.equal(library.check('steam',common).ok,true);
 const [found]=await library.scan();
 assert.equal(found.appid,'123456');
 assert.equal(found.vndbId,'v123');
 assert.equal(found.engine,'Unity');
 assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body).filters,['extlink','=',['steam',123456]]);
 fetch.mock.mockImplementation(async()=>{throw Error('offline');});
 const [offline]=await library.scan();
 assert.equal(offline.vndbId,'v123');
 assert.notEqual(offline.missing,true);
});
test('scanning updates canonical works, preserves manual settings, and never resurrects removed works',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tome-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let db=openStore(root);db.prepare("INSERT INTO games(id,legacy_id,title,executable,removed_at) VALUES('deleted',6,'CLANNAD','C:\\Games\\clannad.exe',123)").run();db.prepare("INSERT INTO games(id,title,executable,original) VALUES('manual','Manual','C:\\Games\\manual.exe','{\"custom\":true}')").run();db.close();
 assert.deepEqual(reconcile(root,[{mediaId:6,title:'CLANNAD',exe:'C:\\Games\\clannad.exe'},{title:'Manual renamed',exe:'C:\\Games\\manual.exe',cover:'cover.png'},{title:'New game',exe:'C:\\Games\\new.exe'}]),{added:1,updated:1});db=openStore(root);try{assert.equal(games(db,root).length,2);assert(!games(db,root).some(g=>g.title==='CLANNAD'));assert.equal(JSON.parse(db.prepare("SELECT original FROM games WHERE id='manual'").get().original).custom,true);}finally{db.close();}
});
test('refresh preserves a user-edited game name, cover and Japanese locale override',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-scan-preserve-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let db=openStore(root);db.prepare('INSERT INTO games(id,title,executable,cover,original) VALUES(?,?,?,?,?)').run('custom','My title','E:\\Games\\game.exe','custom-cover.png',JSON.stringify({library:{localeMode:'off'},hook:{saved:true}}));db.close();
 reconcile(root,[{title:'Catalog title',exe:'E:\\Games\\game.exe',cover:'catalog-cover.jpg',localeMode:'auto'}]);db=openStore(root);try{const row=db.prepare('SELECT * FROM games WHERE id=?').get('custom');assert.equal(row.title,'My title');assert.equal(row.cover,'custom-cover.png');assert.equal(JSON.parse(row.original).library.localeMode,'off');assert.equal(JSON.parse(row.original).hook.saved,true);}finally{db.close();}
});
