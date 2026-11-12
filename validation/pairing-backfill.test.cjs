'use strict';
/* Live test 2026-11-13: Summer Pockets, 魔法少女ノ魔女裁判 and DDLC Plus had patches aligned before the pairing report existed;
   the status now samples the pairing once from the saved indexes and keeps it, without touching the patch state. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const ot=require('../services/original-text.cjs');
test('a ready patch without a pairing report gets one from its indexes',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pair-')),dir=path.join(root,'game');fs.mkdirSync(dir);fs.mkdirSync(path.join(root,'data','config'),{recursive:true});
 try{
  const exe=path.join(dir,'game.exe'),ain=path.join(dir,'game.ain');fs.writeFileSync(exe,'');fs.writeFileSync(ain,'ain');
  const sha=crypto.createHash('sha256').update(fs.readFileSync(ain)).digest('hex');
  const ja=[],zh=[];for(let i=0;i<60;i++){ja.push('「今日は'+i+'回目の朝だね」');zh.push('“今天是第'+i+'次的早晨呢”');}
  const ri=path.join(root,'rt.json'),pi=path.join(root,'pt.json');
  fs.writeFileSync(ri,JSON.stringify({schema:1,lines:ja}));fs.writeFileSync(pi,JSON.stringify({schema:1,lines:zh}));
  fs.writeFileSync(path.join(root,'data','config','original-text.json'),JSON.stringify({g1:{status:'native-japanese',engine:'system4',runtime:{engine:'system4',file:ain,sha256:sha,index:ri,lines:60},patch:{index:pi,lines:60},patchStatus:'ready',patchAlignment:{reliable:true,sameStructure:true}}}));
  const db={prepare:()=>({get:()=>({executable:exe,original:'{}'})})};
  const r=ot.status(root,db,'g1');
  assert.equal(r.patchStatus,'ready');assert.ok(r.patchAlignment.pairing,'pairing report added');
  assert.equal(r.patchAlignment.pairing.total,r.patchAlignment.pairing.paired+r.patchAlignment.pairing.unpaired);
  const saved=JSON.parse(fs.readFileSync(path.join(root,'data','config','original-text.json'),'utf8')).g1;
  assert.ok(saved.patchAlignment.pairing,'kept for the next status');assert.equal(saved.patchStatus,'ready');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
