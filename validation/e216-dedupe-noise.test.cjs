// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs'),{reconcile}=require('../services/library.cjs'),{identifierNoise}=require('../core/text-noise.cjs');
test('a second program in the same scanned folder updates the existing work instead of adding a duplicate',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-dedupe-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dir=path.join(root,'game');fs.mkdirSync(dir);const a=path.join(dir,'Game_crack.exe'),b=path.join(dir,'Game.exe');fs.writeFileSync(a,'a');fs.writeFileSync(b,'b');
 const base={key:'k1',source:'folder',title:'作品',dir,engine:'KiriKiri',vndbId:'v1'};
 assert.deepEqual(reconcile(root,[{...base,exe:a}]),{added:1,updated:0});
 assert.deepEqual(reconcile(root,[{...base,exe:b}]),{added:0,updated:1});
 let db=openStore(root);try{assert.equal(db.prepare('SELECT count(*) n FROM games').get().n,1);}finally{db.close();}
 const c=path.join(dir,'Other.exe');fs.writeFileSync(c,'c');assert.equal(reconcile(root,[{...base,vndbId:'v2',title:'別作品',exe:c}]).added,1,'different VNDB id in same folder stays separate');
});
test('runaway repeated engine tokens are noise, dialogue is not',()=>{
 assert.ok(identifierNoise('_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_wipe_'));
 assert.ok(identifierNoise('pe_wipe_wipe_wipe_wipe_wi\nwipe_wipe_wipe_wipe_wipe'));
 assert.ok(identifierNoise('fadefadefadefadefade'));
 for(const line of ['「ねえ、羽依里くん」','wipe_wipe? そんなの知らない','Hello hello hello hello','I said no no no no!','ＢＧＭ'])assert.equal(identifierNoise(line),false,line);
});
test('the app icon keeps every Windows size and leads with the 256px frame Tauri uses for the taskbar',()=>{
 const b=fs.readFileSync(path.join(__dirname,'..','desktop','icons','icon.ico')),n=b.readUInt16LE(4),sizes=[...Array(n)].map((_,i)=>b[6+i*16]||256);
 assert.equal(sizes[0],256);for(const s of [16,24,32,48,64,256])assert.ok(sizes.includes(s),String(s));
});
