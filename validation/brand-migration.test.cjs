const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{DatabaseSync}=require('node:sqlite');
const brand=require('../services/brand-migration.cjs');
test('database rebranding includes WAL records and leaves the old database intact',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-brand-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'data'));
 const old=path.join(root,'data/tome.sqlite'),db=new DatabaseSync(old);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE words(word TEXT);INSERT INTO words VALUES('fixture')");
 try{const target=brand.databasePath(root),migrated=new DatabaseSync(target);assert.equal(migrated.prepare('SELECT word FROM words').get().word,'fixture');migrated.close();assert(fs.existsSync(old));assert.equal(brand.databasePath(root),target);}finally{db.close();}
});
test('relocation changes only the moved installation paths, including JSON-encoded path values',()=>{
 const root='E:\\Apps\\MeguLit',input={file:'E:\\Apps\\ToMe_Final\\data\\assets\\one.png',serialized:JSON.stringify({file:'E:\\Apps\\ToMe_Final\\models\\one.gguf'}),external:'E:\\Apps\\ToMe\\games\\ISLAND.exe',other:'E:\\Apps\\ToMe_Final_backup\\one'};
 const next=brand.relocated(input,root);assert.equal(next.file,root+'\\data\\assets\\one.png');assert.equal(JSON.parse(next.serialized).file,root+'\\models\\one.gguf');assert.equal(next.external,input.external);assert.equal(next.other,input.other);
});
