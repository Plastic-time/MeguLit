// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dbs=require('./helpers/siglus-dbs-table.cjs'),original=require('../services/original-text.cjs');
const src=require('../services/original-engines/siglus-source.cjs');
const {Reader}=require('../services/reader.cjs');
const ids=[50,0,2,500];
const options=['上書きで何か吹き込む','やめておく'];
const body='この町は嫌いだ。';
const labels=['测试选项甲','测试选项乙'];
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'siglus-slots-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dat=path.join(root,'game','dat'),patch=path.join(root,'patch'),exe=path.join(dat,'..','SiglusEngine_Steam.exe');
 fs.mkdirSync(dat,{recursive:true});fs.mkdirSync(patch);
 fs.writeFileSync(exe,'fixture');
 fs.writeFileSync(path.join(dat,'..','SceneZH.pck'),'fixture');
 const files=[{name:'_system_language.inc',raw:Buffer.from('#define $lang_jp 0\n#define $lang_ch 2')},
  {name:'seen0414.ss',raw:Buffer.from('@mes(20, ,'+body+')\n@mes_sel(2410, ,'+options[0]+'), @mes_sel(2420, ,'+options[1]+')\n@mes(2430, ,何もしない。)\n; @mes_sel(2430, ,何もしない。)')}];
 t.mock.method(src,'sources',()=>files);
 const rows=[[20,body],[2410,options[0]],[2420,options[1]],[2430,'何もしない。']];
 fs.writeFileSync(path.join(dat,'text00.dbs'),dbs(rows.map(([id,text])=>['【名前】',text,text,id]),ids));
 const db={prepare:()=>({get:()=>({executable:exe})})};
 const set=rows=>fs.writeFileSync(path.join(patch,'text00.dbs'),dbs(rows.map(([id,ja,zh])=>['【名前】',ja,zh,id]),ids));
 return {root,exe,db,set,patch};
}
test('hooked native choices open before coordinates, survive a missed locate and close on the next line',t=>{
 const {root,exe,db,set,patch}=fixture(t);
 set([[20,body,'测试正文']]);
 original.importPatch(root,db,'game',patch);
 const {HookNative}=require('../core/hook-native.cjs');
 const events=[],locates=[];
 const hook=new HookNative({native:root,hook:root,logs:root},m=>events.push(m));
 t.after(()=>hook.stop());
 hook.originalText=original.provider(root,exe);
 hook.locateChoices=texts=>locates.push(texts);
 hook.emitSource(body,'live');
 for(const text of [options[1],options[0]+'／',options.join('')])hook.auxText({type:'hookAuxText',sourceName:'SiglusEngine4',role:0,text});
 hook.requestChoices(0);
 const pending=hook.state.hookChoices;
 assert.deepEqual(pending.items,options.map(text=>({text})));
 assert.equal(pending.geometryPending,true);
 assert.deepEqual(locates,[options]);
 hook.choiceBoxes({status:'miss',items:[],missed:options});
 assert.equal(hook.state.hookChoices,pending);
 const frames=fs.readFileSync(path.join(__dirname,'helpers/choice-replay/clannad.jsonl'),'utf8').trim().split(/\r?\n/).map(line=>JSON.parse(line).m);
 const measured=frames.find(m=>m.type==='hookChoiceBoxes'&&options.every(text=>m.items.some(i=>i.text===text)));
 hook.choiceBoxes({...measured,items:measured.items.slice().reverse()});
 assert.deepEqual(hook.state.hookChoices.items.map(i=>i.text),options);
 assert.ok(hook.state.hookChoices.items.every(i=>i.y1>i.y0));
 hook.emitSource('何もしない。','live');
 assert.equal(hook.state.hookChoices,null);
 hook.choiceBoxes(measured);
 assert.equal(hook.state.hookChoices,null);
 assert.equal(events.filter(m=>m.hookChoices?.geometryPending).length,1);
});
test('a partial installed table can use verified missing choices from its pre-restore backup',t=>{
 const {root,db,set,patch,exe}=fixture(t);
 set([[20,body,'测试正文'],[2410,options[0],labels[0]]]);
 const backup=path.join(patch,'.megulit-japanese','dat');
 fs.mkdirSync(backup,{recursive:true});
 fs.writeFileSync(path.join(backup,'text00.dbs'),dbs([
  ['',body,'旧版本正文',20],['',options[1],labels[1],2420],['','別の文章です。','错误场景',2430],
 ],ids));
 const state=original.importPatch(root,db,'game',patch);
 const quality=state.patch.coverage.translationQuality,provider=original.provider(root,exe);
 assert.deepEqual(state.patch.sources,[path.join(patch,'text00.dbs'),path.join(backup,'text00.dbs')]);
 assert.equal(quality.body.localPaired,1);assert.equal(quality.choice.localPaired,2);
 assert.equal(provider.resolve(body).translation,'测试正文');
 assert.deepEqual(options.map(text=>provider.resolveChoice(text).translation),labels);
});
test('serial and Japanese cell bind sparse, reordered translations to the actual choices and dialogue',async t=>{
 const {root,exe,db,set,patch}=fixture(t);
 // Explicitly synthetic Chinese labels. A different Japanese row with a recycled serial is not a match.
 set([[2420,options[1],labels[1]],[2430,'別の場面です。','错误场景'],[20,body,'测试正文'],[2410,options[0],labels[0]]]);
 const state=original.importPatch(root,db,'game',patch);
 assert.equal(state.patchStatus,'ready');
 const counts=state.patch.coverage.translationQuality;
 assert.deepEqual(counts.body,{extracted:2,localPaired:1,workTotal:null});
 assert.deepEqual(counts.choice,{extracted:2,localPaired:2,workTotal:null});
 const provider=original.provider(root,exe);
 assert.deepEqual(provider.choiceGroupAfter(body,options.slice().reverse()),options);
 assert.equal(provider.choiceGroupAfter(body,[options[0],options[0]]),null);
 assert.equal(provider.choiceGroupAfter('何もしない。',options),null);
 assert.equal(provider.resolve(body).translation,'测试正文');
 const pos=provider.position();
 assert.deepEqual(options.map(s=>provider.resolveChoice(s).translation),labels);
 assert.equal(provider.resolveChoice(body).status,'none');
 assert.equal(provider.resolveChoice(options[0].slice(0,-1)).status,'none');
 assert.equal(provider.position(),pos);
 assert.equal(provider.resolve('何もしない。').translation,undefined);
 const reader=new Reader({root,folder:root,emit(){}});
 reader.gal={hooks:{originalText:provider}};
 reader.chainTranslate=()=>assert.fail('all offered options have a local translation');
 const request={type:'choiceTranslations',request:1,items:options};
 const [reply]=(await reader.message(request)).replies;
 assert.equal(reply.method,'deliverChoiceTranslations');
 assert.deepEqual(reply.args[1].rows,labels.map(text=>({text,source:'patch'})));
 const seed=require('../tools/diff-maker/seed-all.cjs');
 const out=path.join(root,'output');
 const g={root,id:'game',title:'CLANNAD',exe,engine:'siglus',names:[],ot:state};
 const result=await seed.seedOne(g,new Map(),[],{out,ownerOk:new Set(),versionsWritten:new Map()});
 const emitted=JSON.parse(fs.readFileSync(path.join(out,'siglus',result.slug,'game.json')));
 const proof=Object.values(emitted.ext.translationQuality)[0];
 assert.deepEqual(proof.choice,counts.choice);assert.deepEqual(proof.body,counts.body);
 assert.match(proof.patchIndexHash,/^[a-f0-9]{64}$/);
 // The new patch contains duplicate serials for the second choice. Only that slot falls back.
 set([[2410,options[0],labels[0]],[2420,options[1],labels[1]],[2420,options[1],'冲突']]);
 const next=original.importPatch(root,db,'game',patch);
 assert.equal(next.patch.coverage.translationQuality.choice.localPaired,1);
 reader.gal.hooks.originalText=original.provider(root,exe);
 const called=[];reader.chainTranslate=async text=>{called.push(text);return {text:'测试机翻',source:'mt',provider:'fixture'};};
 const mixed=(await reader.message(request)).replies[0].args[1];
 assert.deepEqual(called,[options[1]]);
 assert.deepEqual(mixed.rows,[{text:labels[0],source:'patch'},{text:'测试机翻',source:'mt',provider:'fixture'}]);
 // Reuse the reader's real receipt and Seed export paths with a known fallback provider.
 reader.gameId='game';reader.gal.hooks.resolveSource=text=>reader.gal.hooks.originalText.resolve(text);
 reader.gal.hooks.scriptTranslation=require('../core/hook-native.cjs').HookNative.prototype.scriptTranslation;
 reader.chainTranslate=async()=>({text:'测试机翻',source:'mt',provider:'google'});
 const receipts=[];
 reader.logVisibility=entry=>receipts.push(entry);
 await reader.message(request);
 reader.stats.translation=()=>{};
 const bodyReply=(await reader.message({id:2,text:body})).replies[0];
 assert.equal(bodyReply.args[4].source,'mt');
 const readerLog=receipts.map(entry=>JSON.stringify(entry)).join('\n');
 const logs=new Map([[root,{reader:readerLog}]]);
 await seed.seedOne({...g,ot:next},logs,[],{out,ownerOk:new Set(),versionsWritten:new Map()});
 const updated=JSON.parse(fs.readFileSync(path.join(out,'siglus',result.slug,'game.json')));
 const updatedProof=Object.values(updated.ext.translationQuality)[0];
 assert.deepEqual(updatedProof.returned,{basis:'reader-replies',body:{'mt/google':1},choice:{patch:1,'mt/google':1}});
 assert.equal(updatedProof.choice.localPaired,1);
 assert.doesNotMatch(JSON.stringify(updatedProof),/测试|上書き|google.+[\\/].*dat/);
});

test('RenPy source menu labels are classified individually across nested and conditional branches',()=>{
 const {parseRpy}=require('../services/original-engines/scenes.cjs');
 const scene=parseRpy(Buffer.from('label start:\n    menu:\n        "初めの選択":\n            menu:\n                "次の選択":\n                    "これは本文です。"\n        "戻る" if ready: # comment\n            return'));
 assert.deepEqual(scene.lines,['初めの選択','次の選択','これは本文です。','戻る']);
 assert.equal(scene.roles,'ccbc');
});

test('one option error preserves the other answer, superseded screens cannot deliver into a new screen',async()=>{
 const reader=new Reader({root:os.tmpdir(),folder:os.tmpdir(),emit(){}});
 let finish;reader.chainTranslate=async text=>{
  if(text==='古い')return new Promise(resolve=>{finish=resolve;});
  if(text==='失敗')throw Error('offline');
  return {text:'测试',source:'api',provider:'fixture'};
 };
 const stale=reader.choiceTranslations({items:['古い']});
 const fresh=await reader.choiceTranslations({items:['成功','失敗']});
 finish({text:'旧',source:'mt',provider:'fixture'});
 assert.deepEqual((await stale).rows,[]);
 assert.deepEqual(fresh.rows,[{text:'测试',source:'api',provider:'fixture'},{text:'',source:'unavailable'}]);
});
