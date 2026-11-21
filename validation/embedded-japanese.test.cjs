// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const embedded=require('../services/embedded-japanese.cjs'),engine=require('../services/original-engines/utage-embedded.cjs');
const {install}=require('./helpers/utage-embedded-fixture.cjs');
const ser=require('../services/original-engines/unity-serialized.cjs'),ufs=require('../services/original-engines/unityfs.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function fixture(t,options){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'embedded-jp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return install(dir,options);}
const quiet={running:()=>false,atomic:embedded._internal.atomic};

test('embedded scan is read-only, covers the compiled patch, and preserves row slots and identities',t=>{
 const f=fixture(t),before=[hash(f.baseFile),hash(f.patchFile)],result=embedded.scan(f.dir);
 assert.equal(result.state,'restorable');assert.equal(result.adapter,'utage-embedded');assert.equal(result.coverage.rows,36);
 assert.equal(result.coverage.localTranslations,35);assert.equal(result.coverage.missingTranslations,1);assert.equal(result.coverage.voicedLines,4);
 assert.equal(result.coverage.ambiguousJapaneseKeys,1);assert.equal(result.sources.length,3);
 assert.deepEqual([hash(f.baseFile),hash(f.patchFile)],before);assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
 assert.equal(embedded.scan(f.dir).scanToken,result.scanToken);
 const plan=engine.plan(f.dir);assert.equal(plan.pairs[0].chinese,'从这里出发踏上旅程。');
 assert.equal(plan.pairs[1].speaker,'役者一');assert.equal(plan.pairs[3].speaker,'役者二');assert.equal(plan.pairs[4].chinese,'');
});

test('source/role/Voice/header mismatch and duplicate source row IDs are refused before any write',t=>{
 const edits=[rows=>rows[1][2]='これは違う物語の文章です。',rows=>rows[1][1]='別の役者',rows=>rows[1][4]='wrong.ogg',rows=>rows[0][3]='English'];
 for(const mutatePatch of edits){const f=fixture(t,{mutatePatch}),before=hash(f.baseFile);assert.equal(embedded.scan(f.dir).state,'unsupported');assert.equal(hash(f.baseFile),before);}
 const duplicate=fixture(t,{patch:false,duplicateId:true});assert.deepEqual(embedded.scan(duplicate.dir).warnings,['EMBEDDED_DUPLICATE_ROW_ID']);
 const shifted=fixture(t,{patchRowOffset:100});assert.deepEqual(embedded.scan(shifted.dir).warnings,['EMBEDDED_CONFLICT']);
 const multiple=fixture(t);fs.mkdirSync(path.join(multiple.dir,'Other_Data'));assert.deepEqual(embedded.scan(multiple.dir).warnings,['EMBEDDED_UNSUPPORTED_DATA_LAYOUT']);
 const ordinary=fs.mkdtempSync(path.join(os.tmpdir(),'embedded-other-'));t.after(()=>fs.rmSync(ordinary,{recursive:true,force:true}));fs.writeFileSync(path.join(ordinary,'story.txt'),'声のラベルだけです。');
 assert.equal(embedded.scan(ordinary).canRestore,false);assert.equal(embedded.scan(ordinary).coverage.rows,0);
});

test('restore rebuilds SerializedFile offsets and UnityFS, is idempotent, and undo is byte-identical',t=>{
 for(const version of [17,22]){
  const f=fixture(t,{version}),before=[hash(f.baseFile),hash(f.patchFile)],scan=embedded.scan(f.dir);
  const result=embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet});assert.equal(result.applied,2);assert.equal(result.coverage.missingTranslations,1);
  assert.equal(embedded.scan(f.dir).state,'applied');assert.equal(embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet}).already,true);
  const bytes=fs.readFileSync(f.baseFile),parsed=ser.parse(bytes),text=ser.textAsset(bytes,parsed.objects.find(o=>o.type===49));assert.equal(text.name,'Unrelated');
  assert.ok(bytes.subarray(parsed.objects.at(-1).offset).equals(f.tail));
  const node=ufs.read(f.patchFile)[0];assert.equal(node.name,'CAB-fixture');assert.ok(ser.parse(node.data));
  const state=embedded.manifest(f.dir);assert.equal(state.files.length,2);assert.equal(state.phase,'applied');
  const restored=embedded.undo(f.dir,{_io:quiet});assert.equal(restored.restored,2);assert.deepEqual(restored.skipped,[]);
  assert.deepEqual([hash(f.baseFile),hash(f.patchFile)],before);assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
 }
});

test('stale scan and a running game cannot apply; update invalidates the active provider and undo preserves it',t=>{
 const f=fixture(t),scan=embedded.scan(f.dir),old=hash(f.baseFile);
 assert.throws(()=>embedded.apply(f.dir,{scanToken:scan.scanToken,_io:{...quiet,running:()=>true}}),/GAME_RUNNING/);assert.equal(hash(f.baseFile),old);
 fs.appendFileSync(f.baseFile,Buffer.alloc(4));assert.throws(()=>embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet}),/SCAN_STALE/);assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
 const fresh=embedded.scan(f.dir);embedded.apply(f.dir,{scanToken:fresh.scanToken,_io:quiet});
 const provider=embedded.provider(f.dir);assert.ok(provider);fs.appendFileSync(f.baseFile,Buffer.from('other update'));
 assert.equal(provider.resolve('これから最初の旅に出ます。').method,'source-changed');assert.equal(embedded.provider(f.dir),null);
 const changed=hash(f.baseFile),undo=embedded.undo(f.dir,{_io:quiet});assert.ok(undo.skipped.length);assert.equal(hash(f.baseFile),changed);
});

test('a failed second target rolls the first back and leaves no active local index',t=>{
 const f=fixture(t),scan=embedded.scan(f.dir),before=[hash(f.baseFile),hash(f.patchFile)];let writes=0;
 const atomic=(file,bytes)=>{if([f.baseFile,f.patchFile].includes(file)&&++writes===2)throw Error('synthetic write failure');embedded._internal.atomic(file,bytes);};
 assert.throws(()=>embedded.apply(f.dir,{scanToken:scan.scanToken,_io:{...quiet,atomic}}),/synthetic write failure/);
 assert.deepEqual([hash(f.baseFile),hash(f.patchFile)],before);assert.equal(embedded.provider(f.dir),null);assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
});

test('the restored index reaches original-text, HookNative and Reader.translate without an online call',async t=>{
 const f=fixture(t),scan=embedded.scan(f.dir);embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet});
 const original=require('../services/original-text.cjs'),{HookNative}=require('../core/hook-native.cjs'),{Reader}=require('../services/reader.cjs');
 const provider=original.provider(f.dir,f.exe);assert.equal(provider.embedded,true);assert.match(original.providerKey(f.dir,f.exe),/^embedded\|/);
 const hooks=Object.create(HookNative.prototype);Object.assign(hooks,{originalText:provider,scriptAllowed:()=>true,trace:()=>{},emit:event=>events.push(event)});const events=[];
 assert.equal(hooks.scriptTranslation('そうですね。'),'');
 const reader=Object.create(Reader.prototype);let online=0;
 Object.assign(reader,{gal:{hooks},requestOptions:()=>({provider:'google'}),targetLanguage:()=>'zh',embedNote:()=>{},chainTranslate:async()=>{online++;return {text:'fallback'};},translationRetries:()=>({add(){}})});
 assert.equal(await reader.translate({id:1,text:'これから最初の旅に出ます。'}),'从这里出发踏上旅程。');
 assert.equal(await reader.translate({id:2,text:'そうですね。'}),'是的。');
 assert.equal(await reader.translate({id:3,text:'今から次の場所へ行きます。'}),'现在去下一个地方。');
 assert.equal(await reader.translate({id:4,text:'そうですね。'}),'确实如此。');assert.equal(online,0);
 hooks.originalTextFor('これは物語の文章その0です。');assert.ok(events.some(e=>e.type==='hookPatchTranslation'&&e.chinese==='这是一段故事中的第0句。'));
 assert.equal(provider.resolve('ここは未翻訳の文章です。').method,'untranslated');
 await reader.translate({id:5,text:'ここは未翻訳の文章です。'});assert.equal(online,1);
 embedded.undo(f.dir,{_io:quiet});assert.equal(embedded.provider(f.dir),null);
});

test('Japanese voice labels cannot substitute for Japanese body, and oversized bundle metadata is rejected',t=>{
 const chinese=fixture(t,{patch:false,mutateBase:rows=>{for(const row of rows.slice(1))if(!row[0]){row[1]='日本語の役者';row[2]='这是一段中文故事，正文完全没有日语内容。';row[4]='これは日本語の音声ラベル.ogg';}}});
 assert.deepEqual(embedded.scan(chinese.dir).warnings,['EMBEDDED_NO_JAPANESE_BODY']);
 const names=fixture(t,{patch:false,mutateBase:rows=>{for(const row of rows.slice(1))if(!row[0])row[2]='ノワール与カルハ正在讨论这段中文剧情。';}});
 assert.deepEqual(embedded.scan(names.dir).warnings,['EMBEDDED_NO_JAPANESE_BODY']);
 const f=fixture(t),bytes=fs.readFileSync(f.patchFile);let pos=12;for(let i=0;i<2;i++)pos=bytes.indexOf(0,pos)+1;bytes.writeUInt32BE(0x7fffffff,pos+12);fs.writeFileSync(f.patchFile,bytes);
 assert.deepEqual(embedded.scan(f.dir).warnings,['EMBEDDED_BUNDLE_BUDGET']);
});

test('provider attach and repeated lookups never reread the verified source packages',t=>{
 const f=fixture(t),scan=embedded.scan(f.dir);embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet});
 const original=fs.readFileSync,packages=new Set(scan.sources.map(s=>path.resolve(s.path).toLowerCase()));let reads=0;
 fs.readFileSync=function(file,...args){if(packages.has(path.resolve(String(file)).toLowerCase())){reads++;throw Error('source package read');}return original.call(fs,file,...args);};
 try{const provider=embedded.provider(f.dir);assert.ok(provider);for(let i=0;i<100;i++)assert.equal(provider.resolve('これから最初の旅に出ます。').translation,'从这里出发踏上旅程。');}finally{fs.readFileSync=original;}
 assert.equal(reads,0);
});

test('adding a new scenario source invalidates an attached index before any text can be returned',t=>{
 const f=fixture(t),scan=embedded.scan(f.dir);embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet});
 const provider=embedded.provider(f.dir);assert.ok(provider);
 fs.copyFileSync(f.patchFile,path.join(path.dirname(f.patchFile),'new.scenarios.asset'));
 assert.equal(provider.resolve('これから最初の旅に出ます。').method,'source-changed');assert.equal(embedded.provider(f.dir),null);
});

test('an incomplete rollback keeps its verified journal and blocks launch/import until undo completes',t=>{
 const f=fixture(t),scan=embedded.scan(f.dir),before=[hash(f.baseFile),hash(f.patchFile)];let writes=0,caught;
 const atomic=(file,bytes)=>{if([f.baseFile,f.patchFile].includes(file)&&++writes>=2)throw Error('synthetic transaction failure');embedded._internal.atomic(file,bytes);};
 try{embedded.apply(f.dir,{scanToken:scan.scanToken,_io:{...quiet,atomic}});}catch(error){caught=error;}
 assert.equal(caught.rollbackIncomplete,true);assert.equal(embedded.manifest(f.dir).phase,'prepared');assert.equal(embedded.provider(f.dir),null);
 const jobs=require('../services/embedded-japanese-jobs.cjs');assert.throws(()=>jobs.assertLaunchSafe(f.dir),/EMBEDDED_RECOVERY_REQUIRED/);assert.throws(()=>jobs.reserveLegacyWrite(f.dir),/EMBEDDED_RECOVERY_REQUIRED/);
 const undo=embedded.undo(f.dir,{_io:quiet});assert.deepEqual(undo.skipped,[]);assert.deepEqual([hash(f.baseFile),hash(f.patchFile)],before);jobs.assertLaunchSafe(f.dir);
});

test('the public running-game guard canonicalizes a junction alias before comparing process paths',t=>{
 const f=fixture(t),alias=path.join(f.dir,'Alias');fs.symlinkSync(f.dir,alias,'junction');
 const cp=require('node:child_process'),old=cp.execFileSync;cp.execFileSync=(exe,args,options)=>{if(/powershell/i.test(String(exe)))return f.exe+'\r\n';throw Error('native query unavailable in fixture');};
 try{assert.throws(()=>require('../core/japanese-restore.cjs').apply(alias),/GAME_RUNNING/);assert.throws(()=>require('../core/japanese-restore.cjs').restore(alias),/GAME_RUNNING/);}finally{cp.execFileSync=old;}
});

test('a dead transaction owner cannot start writing, and its journal lock can be recovered by undo',async t=>{
 const f=fixture(t),scan=embedded.scan(f.dir),before=[hash(f.baseFile),hash(f.patchFile)];embedded.apply(f.dir,{scanToken:scan.scanToken,_io:quiet});
 const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 const lock=path.join(f.dir,'.megulit-embedded-lock');fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:child.pid,token:'fixture-owner'}));
 try{assert.equal(embedded.lockState(f.dir),'live');}finally{child.kill();await new Promise(resolve=>child.once('close',resolve));}
 assert.equal(embedded.lockState(f.dir),'stale');
 const jobs=require('../services/embedded-japanese-jobs.cjs'),started=jobs.start('stale-owner',f.dir,{operation:'undo',requestId:'stale-owner-recovery'});await jobs._internal.jobs.get(started.jobId).closed;
 const done=jobs.status('stale-owner',started.jobId);assert.equal(done.state,'done',done.error);assert.deepEqual(done.result.skipped,[]);assert.deepEqual([hash(f.baseFile),hash(f.patchFile)],before);assert.equal(fs.existsSync(lock),false);
 const previous=process.env.MEGULIT_EMBEDDED_OWNER_PID;process.env.MEGULIT_EMBEDDED_OWNER_PID=String(child.pid);
 try{assert.throws(()=>embedded.apply(f.dir,{scanToken:embedded.scan(f.dir).scanToken}),/EMBEDDED_OWNER_GONE/);assert.equal(embedded.manifest(f.dir),null);}finally{if(previous===undefined)delete process.env.MEGULIT_EMBEDDED_OWNER_PID;else process.env.MEGULIT_EMBEDDED_OWNER_PID=previous;}
});

test('retirement is bounded without forgetting sealed nonces or allowing a late start',t=>{
 const f=fixture(t),jobs=require('../services/embedded-japanese-jobs.cjs'),{requests,MAX_REQUESTS}=jobs._internal;
 const sealed=jobs.status('capacity',{requestId:'first-sealed-request',operation:'restore',retireIfMissing:true});
 for(let i=0;requests.size<MAX_REQUESTS;i++)jobs.status('capacity',{requestId:'sealed-request-'+i,operation:'restore',retireIfMissing:true});
 const size=requests.size;assert.throws(()=>jobs.status('capacity',{requestId:'one-more-retirement',operation:'restore',retireIfMissing:true}),/EMBEDDED_REQUEST_LIMIT/);assert.equal(requests.size,size);
 assert.throws(()=>jobs.start('capacity',f.dir,{requestId:'new-late-write-request',operation:'restore',scanToken:'0'.repeat(64)}),/EMBEDDED_REQUEST_LIMIT/);
 const late=jobs.start('capacity',f.dir,{requestId:'first-sealed-request',operation:'restore',scanToken:'0'.repeat(64)});assert.equal(late.state,'cancelled');assert.equal(late.jobId,sealed.jobId);assert.equal(embedded.manifest(f.dir),null);
});
