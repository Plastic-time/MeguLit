// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs'),dbs=require('./helpers/siglus-dbs-table.cjs');
const body='この町は嫌いだ。',choice='話しかける',bodyZh='我讨厌这座小镇。',choiceZh='上前搭话';
function fixture(t,translated){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'siglus-protect-')),dat=path.join(dir,'dat'),backup=path.join(dir,'.megulit-japanese','dat');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(dat);fs.writeFileSync(path.join(dir,'SceneZH.pck'),'fixture');
 t.mock.method(require('../services/original-engines/siglus-source.cjs'),'sources',()=>[
  {name:'_system_language.inc',raw:Buffer.from('#define $lang_jp 0\n#define $lang_ch 2')},
  {name:'seen0414.ss',raw:Buffer.from('@mes(20, ,'+body+')\n@mes_sel(24, ,'+choice+')')}]);
 const file=path.join(dat,'text00.dbs');
 const bytes=dbs([[body,translated?bodyZh:body,'I hate this town.',20],[choice,translated?choiceZh:choice,'Talk to her.',24]],[0,2,1,500]);
 fs.writeFileSync(file,bytes);
 fs.writeFileSync(path.join(dat,'config.dbs'),dbs([['好きです','简体中文'],['嫌いだ','繁體中文']]));
 return {dir,dat,file,bytes,backup,keep:path.join(backup,'text00.dbs')};
}
test('Japanese text in the Chinese story column and genuine interface Chinese cannot authorize a write',t=>{
 const f=fixture(t,false),d=jr.detect(f.dir);
 assert.equal(d.chinese.bodyTotal,1);assert.equal(d.chinese.choiceTotal,1);
 assert.equal(d.chinese.body,0);assert.equal(d.chinese.choice,0);
 assert.notEqual(d.state,'restorable');assert.throws(()=>jr.apply(f.dir),/SIGLUS_CHINESE_STORY_MISSING/);
 assert.deepEqual(fs.readFileSync(f.file),f.bytes);
 assert.equal(fs.existsSync(path.dirname(f.backup)),false);
});
test('both verified translations survive apply, the installed provider reads the retained source, and undo preserves unrelated files',t=>{
 const f=fixture(t,true),done=jr.apply(f.dir);
 assert.deepEqual([done.chinese.body,done.chinese.choice],[1,1]);
 assert.deepEqual(fs.readFileSync(f.keep),f.bytes);
 const s=require('../services/original-engines/scenes.cjs').ENGINES.siglus;
 const scene=s.annotate(f.dir,[{name:'text00.dbs',...s.readDbs(fs.readFileSync(f.file),'text00.dbs')}]);
 assert.deepEqual(s.patchLines(scene,{dirs:[f.dir]})[0].lines,[bodyZh,choiceZh]);
 const mine=path.join(f.backup,'my-file.txt');fs.writeFileSync(mine,'keep');
 assert.deepEqual(jr.restore(f.dir).skipped,[]);
 assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.equal(fs.readFileSync(mine,'utf8'),'keep');
});
test('conflicting or damaged backups cannot replace game data',t=>{
 const f=fixture(t,true);fs.mkdirSync(f.backup,{recursive:true});fs.writeFileSync(f.keep,'user backup');
 assert.throws(()=>jr.apply(f.dir),/SIGLUS_BACKUP_CONFLICT/);
 assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.equal(fs.readFileSync(f.keep,'utf8'),'user backup');
 fs.unlinkSync(f.keep);jr.apply(f.dir);const patched=fs.readFileSync(f.file);
 fs.writeFileSync(f.keep,'damaged');assert.deepEqual(jr.restore(f.dir).skipped,['text00.dbs']);
 assert.deepEqual(fs.readFileSync(f.file),patched);assert.equal(fs.readFileSync(f.keep,'utf8'),'damaged');
});
test('a partially Chinese table which the writer does not change is also backed up',t=>{
 const f=fixture(t,false);
 const rows=[[body,bodyZh,20],[choice,choice,24],['そうです。','そうです。',31],['知りません。','知りません。',32]];
 const original=dbs(rows,[0,2,500]);fs.writeFileSync(f.file,original);
 const result=jr.apply(f.dir);
 assert.equal(result.chinese.body,1);assert.equal(result.chinese.choice,0);
 assert.deepEqual(fs.readFileSync(f.file),original);assert.deepEqual(fs.readFileSync(f.keep),original);
 assert.equal(jr._internal.readManifest(f.dir).files.find(e=>e.file==='text00.dbs').kind,'chinese-source');
 assert.deepEqual(jr.restore(f.dir).skipped,[]);assert.deepEqual(fs.readFileSync(f.file),original);
});
