'use strict';
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const rp=require('../services/read-progress.cjs');

function setup(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rp-')),cfg=path.join(root,'data/config'),game=path.join(root,'game');fs.mkdirSync(cfg,{recursive:true});fs.mkdirSync(game);
 const exe=path.join(game,'game.exe');fs.writeFileSync(exe,'exe-bytes');
 const index=path.join(root,'index.json');fs.writeFileSync(index,JSON.stringify({schema:1,lines:['kaga_000026','「え？　あの……」','「はい」','','第二行です','「はい」']}));
 fs.writeFileSync(path.join(cfg,'original-text.json'),JSON.stringify({g1:{runtime:{engine:'bgi',file:game,sha256:'fp1',index}}}));
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE games(id TEXT,executable TEXT,removed_at INTEGER)');db.prepare('INSERT INTO games VALUES(?,?,NULL)').run('g1',exe);
 return {root,cfg,exe,index,db};
}
const seen=(cfg,exe,lines)=>{const key=crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');fs.writeFileSync(path.join(cfg,'game-read-lines.json'),JSON.stringify({version:1,entries:{[key]:lines.map(rp.lineHash)}}));};

test('total counts text lines; read counts script lines MeguLit has shown for this executable',()=>{
 const {root,cfg,exe,db}=setup();
 assert.deepStrictEqual(rp.progress(root,db,'g1'),{id:'g1',engine:'bgi',total:4,read:null,ratio:null,source:null});
 seen(cfg,exe,['「え？ あの……」','「はい」','not in script']);
 const p=rp.progress(root,db,'g1');assert.strictEqual(p.total,4);assert.strictEqual(p.read,3);assert.strictEqual(p.ratio,0.75);assert.strictEqual(p.source,'megulit-seen');
});

test('the count is cached by fingerprint and redone only when the script changes',()=>{
 const {root,index,db}=setup();rp.progress(root,db,'g1');
 fs.writeFileSync(index,JSON.stringify({schema:1,lines:['ひとつ']}));
 assert.strictEqual(rp.progress(root,db,'g1').total,4);
 const f=path.join(root,'data/config/original-text.json'),s=JSON.parse(fs.readFileSync(f,'utf8'));s.g1.runtime.sha256='fp2';fs.writeFileSync(f,JSON.stringify(s));
 assert.strictEqual(rp.progress(root,db,'g1').total,1);
});

test('a save reader for the engine wins over the seen lines; unknown games throw',()=>{
 const {root,cfg,exe,db}=setup();seen(cfg,exe,['「はい」']);
 rp.SAVE_READERS.bgi=(dir,hashes)=>({read:hashes.length-1});
 try{const p=rp.progress(root,db,'g1');assert.strictEqual(p.read,3);assert.strictEqual(p.source,'save');}finally{delete rp.SAVE_READERS.bgi;}
 assert.throws(()=>rp.progress(root,db,'nope'),/GAME_NOT_FOUND/);
});

test('hash packing round-trips',()=>{const a=[0,1,4294967295,123456789];assert.deepStrictEqual(rp._internal.unpackHashes(rp._internal.packHashes(a)),a);});
