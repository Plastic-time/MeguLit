'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs'),I=jr._internal;
const table=require('./helpers/siglus-dbs-table.cjs');
function plan(rows,options,run,ids){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-jr-speaker-'));try{fs.mkdirSync(path.join(root,'dat'));fs.writeFileSync(path.join(root,'dat','story.dbs'),table(rows,ids));return run(I.siglusPlan(root,options),root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
const dialogue=i=>'「きょうの台詞を話します」'+i,cap={siglusDbsNameColumn:50};
test('exact version name column is excluded by call ID, preserving names, empty narration and scene headers',()=>{
 const rows=Array.from({length:20},(_,i)=>[i%5===0?'scene_'+i:i%5===1?'':'【＄名前＿人物'+i%6+'】',dialogue(i),dialogue(i)]);
 plan(rows,cap,p=>{assert.deepEqual(p.targetColumns,[]);assert.deepEqual(p.changes,[]);},[50,0,2]);
});
test('default, null and unrelated call IDs retain the previous behavior',()=>{
 const rows=Array.from({length:20},(_,i)=>['【人物'+i%6+'】',dialogue(i)]);
 for(const options of [{},{siglusDbsNameColumn:null},{siglusDbsNameColumn:50}])plan(rows,options,p=>assert.deepEqual(p.targetColumns,[0]));
});
test('call ID zero is valid and is not treated as disabled',()=>{
 const rows=Array.from({length:20},(_,i)=>['【人物'+i%6+'】',dialogue(i)]);
 plan(rows,{siglusDbsNameColumn:0},p=>assert.deepEqual(p.targetColumns,[]));
 for(const id of [-1,1.5,2147483648,'50'])assert.throws(()=>I.nameColumn({siglusDbsNameColumn:id}),/SIGLUS_DBS_COLUMN_INVALID/);
});
test('other real translation columns still restore while the opted-in field is preserved',()=>{
 const rows=Array.from({length:20},(_,i)=>[i%5===0?'':'【人物'+i%6+'】',dialogue(i),'The line today '+i,'今天的台词'+i]);
 plan(rows,cap,p=>{assert.deepEqual(p.targetColumns,[2,3]);const c=p.changes[0];assert.deepEqual(c.next.map(r=>r[0]),rows.map(r=>r[0]));for(let i=0;i<rows.length;i++)assert.deepEqual(c.next[i].slice(1),[dialogue(i),dialogue(i),dialogue(i)]);},[50,0,2,3]);
});
test('genuine name translations and bracketed translated sentences remain eligible without that exact call ID',()=>{
 const names=['しろは','あお','かもめ','つむぎ','うみ','しずく'],en=['Shiroha','Ao','Kamome','Tsumugi','Umi','Shizuku'],zh=['【白羽】','【苍】','【鸥】','【紬】','【羽未】','【静久】'];
 plan(names.map((n,i)=>[n,en[i],zh[i]]),cap,p=>{assert.deepEqual(p.targetColumns,[1,2]);assert.deepEqual(p.changes[0].next,names.map(n=>[n,n,n]));});
 const rows=Array.from({length:6},(_,i)=>['《ほしのほん》を読みます。'+i,'【今天是晴天'+i+'】']);
 plan(rows,cap,p=>assert.deepEqual(p.targetColumns,[1]));
});
test('small tables and repeated genuine translations retain their previous eligibility',()=>{
 plan([['こんにちは','你好','Hello'],['さようなら','再见','Goodbye']],cap,p=>assert.deepEqual(p.targetColumns,[1,2]));
 const repeated=['Yes','No','Maybe','Wait','Thanks'];plan(Array.from({length:20},(_,i)=>[dialogue(i),repeated[i%5]]),cap,p=>assert.deepEqual(p.targetColumns,[1]));
});
test('built-in version capability is exact and has a nullable signed integer domain',()=>{
 const P=require('../core/profiles/index.cjs'),D=require('../core/profiles/domains.cjs'),key='116a1b6ab5902bb6dc49e25086b1ef6f07d941dbb090b497fb7a158e997dea2d';
 assert.equal(P.profileFor({exeSha256:key}).source.siglusDbsNameColumn,50);assert.equal(P.profileFor({exe:'SiglusEngine_Steam.exe',title:'CLANNAD'}).source.siglusDbsNameColumn,null);assert.equal(P.profileFor({exeSha256:'f'.repeat(64)}).source.siglusDbsNameColumn,null);
 assert.equal(D.layerOf('source.siglusDbsNameColumn'),'version');assert.equal(D.clean({source:{siglusDbsNameColumn:0}}).value.source.siglusDbsNameColumn,0);assert(D.clean({source:{siglusDbsNameColumn:1.5}}).rejected.length);
});
