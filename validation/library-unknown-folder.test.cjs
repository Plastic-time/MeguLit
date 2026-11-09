'use strict';
// User report (2026-11-09): 装甲悪鬼村正 never showed up in the library. Older Nitroplus games pack scripts as .npa
// (only .npk was known), and downloaded folder names like "[160825][Nitroplus] 装甲悪鬼村正 DL版" hid the title from
// VNDB. Folders that still cannot be confirmed are reported so the user can add them by hand.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {engineOf,findGame,searchNames}=require('../core/library.cjs');

test('an older Nitroplus folder (nss.npa) is recognised with its program',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'npa-'));
 try{
  for(const f of ['nss.npa','system.npa','cg.npa'])fs.writeFileSync(path.join(dir,f),'x');
  fs.writeFileSync(path.join(dir,'装甲悪鬼村正.exe'),Buffer.alloc(300000));
  assert.equal(engineOf(dir)?.name,'Nitroplus (NPA)');
  assert.equal(path.basename(findGame(dir).exe),'装甲悪鬼村正.exe');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('folder names are cleaned before the VNDB lookup',()=>{
 assert.ok(searchNames('[160825][Nitroplus] 装甲悪鬼村正 DL版 Ver1.02').includes('装甲悪鬼村正'));
 assert.ok(searchNames('【Nitroplus】装甲悪鬼村正').includes('装甲悪鬼村正'));
 assert.ok(searchNames('装甲恶鬼村正 汉化版').includes('装甲恶鬼村正'));
 assert.ok(searchNames('素晴らしき日々HD版').includes('素晴らしき日々'));
 assert.deepEqual(searchNames('WHITE ALBUM2'),['WHITE ALBUM2']);
});

test('the manual scan tells the user about folders it could not recognise',()=>{
 const lib=fs.readFileSync(path.join(__dirname,'..','core','library.cjs'),'utf8'),settings=fs.readFileSync(path.join(__dirname,'..','web','settings.js'),'utf8');
 assert.match(lib,/this\.unconfirmed\.push\(\{title:c\.title,dir:g\.dir,exe:g\.exe\}\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','runtime.cjs'),'utf8'),/unconfirmed:\(library\.unconfirmed\|\|\[\]\)/);
 assert.match(settings,/没认出是 galgame/);
});

// More engines (user, 2026-11-09): recognised by files only they ship; RPG engines still need a VNDB match.
test('more engines are recognised from their own files',()=>{
 const cases=[
  ['Escude',{'script.bin':'ESC-ARC2xxxx','gpr.bin':'x'}],
  ['PJADV',{'archive.dat':'GAMEDAT PAC2xx'}],
  ['Valkyria',{'data.odn':'x'}],
  ['Cyberworks (C,system)',{'Arc00.dat':'x','Arc01.dat':'x','Arc02.dat':'x'}],
  ['LC-ScriptEngine',{'lcsebody.exe':'x'}],
  ['Wolf RPG',{'Data.wolf':'x'}],
  ['RPG Maker VX/XP',{'Game.rgss3a':'x'}],
  ['Unity (Utage)',{'Game.exe':'x','Game_Data/Managed/Utage.dll':'x'}],
 ];
 for(const [name,files] of cases){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eng-'));
  try{for(const [f,body] of Object.entries(files)){const p=path.join(dir,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,body);}
   assert.equal(engineOf(dir)?.name,name,name);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 const plain=fs.mkdtempSync(path.join(os.tmpdir(),'eng-'));try{fs.writeFileSync(path.join(plain,'archive.dat'),'not a pac');assert.equal(engineOf(plain),null,'a common file name alone is not enough');}finally{fs.rmSync(plain,{recursive:true,force:true});}
 const lib=require('../core/library.cjs');assert.ok(lib);
});
