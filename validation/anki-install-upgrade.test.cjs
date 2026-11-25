// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');

function write(file,content){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,content);
}
function fileHashes(folder){
 const hashes={};
 for(const name of fs.readdirSync(folder,{recursive:true}).sort()){
  const file=path.join(folder,name);
  if(fs.statSync(file).isFile())hashes[name]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 }
 return hashes;
}
function ankiTables(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const schema=db.prepare("SELECT name,type,sql FROM sqlite_master WHERE tbl_name GLOB 'anki_*' ORDER BY name").all();
  const rows={};
  for(const {name,type} of schema)if(type==='table')rows[name]=db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all();
  return {schema,rows};
 }finally{db.close();}
}

test('upgrading MeguLit keeps legacy Anki paths, collection files and review data',async t=>{
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-upgrade-')),root=path.join(work,'MeguLit');
 const personal={MEGULIT_ROOT:root,APPDATA:path.join(work,'Roaming'),LOCALAPPDATA:path.join(work,'Local'),
  ProgramData:path.join(work,'ProgramData'),ProgramFiles:path.join(work,'ProgramFiles'),
  'ProgramFiles(x86)':path.join(work,'ProgramFiles86'),ProgramW6432:path.join(work,'ProgramFiles64'),USERPROFILE:work};
 const previous=Object.fromEntries(Object.keys(personal).map(key=>[key,process.env[key]]));
 Object.assign(process.env,personal);
 t.after(()=>{
  for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  fs.rmSync(work,{recursive:true,force:true});
 });
 const oldMsi=path.join(personal.LOCALAPPDATA,'Programs','Anki','anki.exe');
 const oldLauncher=path.join(personal.LOCALAPPDATA,'AnkiProgramFiles','.venv','Scripts','ankiw.exe');
 for(const file of [oldMsi,oldLauncher,path.join(root,'Anki','anki.exe')])write(file,'MZ fixture');
 const config=path.join(root,'data','config','v4-preferences.json');
 write(config,JSON.stringify({ankiPath:oldLauncher},null,2));
 const profile=path.join(personal.APPDATA,'Anki2');
 write(path.join(profile,'addons21','2055492159','__init__.py'),'# existing AnkiConnect');
 write(path.join(profile,'addons21','2055492159','config.json'),'{"apiKey":null}');
 write(path.join(profile,'User 1','collection.media','audio.wav'),'existing audio');
 const collection=new DatabaseSync(path.join(profile,'User 1','collection.anki2'));
 try{collection.exec("CREATE TABLE cards(id INTEGER PRIMARY KEY,note TEXT); INSERT INTO cards VALUES (42,'existing card');");}
 finally{collection.close();}
 const child=require('node:child_process');
 t.mock.method(child,'execFileSync',()=>'');
 const spawn=t.mock.method(child,'spawn',()=>assert.fail('upgrade tried to start an installer or a new Anki process'));
 const requests=t.mock.method(globalThis,'fetch',async()=>assert.fail('upgrade tried to download'));
 const download=t.mock.method(require('../core/fast-download.cjs'),'download',async()=>assert.fail('upgrade tried to fetch the MSI'));

 const db=require('../services/store.cjs').openStore(root);
 try{
  require('../services/anki-sync.cjs').schema(db);
  const {AnkiReviewer}=require('../services/anki-review.cjs');
  new AnkiReviewer({db});
  db.exec("INSERT INTO anki_links VALUES(1,42); INSERT INTO anki_synced_reviews VALUES(999,1);"+
   "INSERT INTO anki_actions VALUES('old-op',42,3,'done',NULL,1); INSERT INTO anki_review_events VALUES('old-op',42,3,1);");
 }finally{db.close();}
 const dbFile=path.join(root,'data','megulit.sqlite');
 const originalTables=ankiTables(dbFile),originalFiles=fileHashes(profile),originalConfig=fs.readFileSync(config);
 assert.deepEqual(Object.keys(originalTables.rows),['anki_actions','anki_links','anki_review_events','anki_synced_reviews']);
 assert.equal(Object.keys(originalFiles).length,4);

 const {Runtime}=require('../services/runtime.cjs'),{dispatch}=require('../services/bridge.cjs');
 const anki=require('../core/anki-process.cjs'),runtime=new Runtime(root);
 const runner=runtime.ankiProcess();
 assert.equal(anki.find('',process.env,undefined,root),oldMsi);
 fs.renameSync(oldMsi,oldMsi+'.fixture');
 assert.equal(anki.find('',process.env,undefined,root),oldLauncher);
 fs.renameSync(oldMsi+'.fixture',oldMsi);
 assert.equal(runtime.config().ankiPath,oldLauncher);
 assert.deepEqual(await dispatch({action:'anki_find'},runtime),{path:oldLauncher});
 t.mock.method(runner.anki,'call',async(_options,action)=>{assert.equal(action,'version');return 6;});
 assert.equal((await dispatch({action:'anki_install_connect'},runtime)).already,true);
 await dispatch({action:'anki_install'},runtime);
 const installer=require('../core/anki-installer.cjs');
 for(let i=0;i<50&&!['done','error'].includes(installer.status().phase);i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(installer.status().phase,'done',installer.status().error);
 assert.equal(spawn.mock.callCount(),0);
 assert.equal(download.mock.callCount(),0);
 assert.equal(requests.mock.callCount(),0);
 assert.deepEqual(fileHashes(profile),originalFiles);
 assert.deepEqual(fs.readFileSync(config),originalConfig);
 assert.deepEqual(ankiTables(dbFile),originalTables);
});
