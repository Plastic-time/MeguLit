// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const jr=require('../core/japanese-restore.cjs'),dbs=require('./helpers/siglus-dbs-table.cjs');
const body='この町は嫌いだ。',choice='話しかける',bodyZh='我讨厌这座小镇。',choiceZh='上前搭话';
function fixture(t,translated,extra=[]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'siglus-protect-')),dat=path.join(dir,'dat'),backup=path.join(dir,'.megulit-japanese','dat');
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.mkdirSync(dat);fs.writeFileSync(path.join(dir,'SceneZH.pck'),'fixture');
 t.mock.method(require('../services/original-engines/siglus-source.cjs'),'sources',()=>[
  {name:'_system_language.inc',raw:Buffer.from('#define $lang_jp 0\n#define $lang_ch 2')},
  {name:'seen0414.ss',raw:Buffer.from(['@mes(20, ,'+body+')','@mes_sel(24, ,'+choice+')',...extra].join('\n'))}]);
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
function readCells(file){
 const {raw,marker}=jr._internal.decrypt(fs.readFileSync(file));
 return jr._internal.parse(raw,marker).cells;
}

test('a mixed story column is backed up and its unambiguous script rows are restored',t=>{
 const f=fixture(t,false,['@mes(31, ,そうです。)']);
 const rows=[[body,bodyZh,20],[choice,choice,24],['そうです。','确实是的。',31],['そうです。','重复的一行。',31],['知りません。','知りません。',32]];
 const original=dbs(rows,[0,2,500]);fs.writeFileSync(f.file,original);
 const result=jr.apply(f.dir);
 assert.equal(result.chinese.body,1);assert.equal(result.chinese.choice,0);
 assert.deepEqual(readCells(f.file),[[body,body,20],...rows.slice(1)]);
 assert.deepEqual(fs.readFileSync(f.keep),original);
 assert.deepEqual(jr.restore(f.dir).skipped,[]);assert.deepEqual(fs.readFileSync(f.file),original);
});

test('a sparse speaker column cannot leave verified dialogue and choices in Chinese',t=>{
 // Serial 43 must stay unchanged even though its Japanese text occurs at serial 44.
 const f=fixture(t,true,['@mes(41, ,まだ明るい。)','@mes_sel(42, ,帰ろう)','@mes(43, ,場面にある台詞。)','@mes(44, ,別の台詞だ。)']);
 const file=path.join(f.dat,'text01.dbs');
 const rows=[['','まだ明るい。',41,'天还亮着。'],['','帰ろう',42,'回家吧'],
  ['','別の台詞だ。',43,'其他台词。'],['ナレーター','',0,'']];
 const original=dbs(rows,[50,0,500,2]);fs.writeFileSync(file,original);
 const options={siglusDbsNameColumn:50};
 const detected=jr.detect(f.dir,options);
 assert.equal(detected.state,'restorable');
 assert.equal(detected.japaneseColumn,0);
 assert.ok(detected.targetColumns.includes(3));
 jr.apply(f.dir,options);
 assert.deepEqual(readCells(file),[['','まだ明るい。',41,'まだ明るい。'],['','帰ろう',42,'帰ろう'],...rows.slice(2)]);
 assert.deepEqual(jr.restore(f.dir,options).skipped,[]);
 assert.deepEqual(fs.readFileSync(file),original);
});

test('a verified dialogue row keeps its full-width slash and the following text',t=>{
 const line='言った／言い直した。';
 const f=fixture(t,true,['@mes(81, ,'+line+')']);
 const file=path.join(f.dat,'text19.dbs');
 fs.writeFileSync(file,dbs([[line,'又说了一遍。',81]],[0,2,500]));
 jr.apply(f.dir);
 assert.deepEqual(readCells(file),[[line,line,81]]);
});

test('a Shift-JIS story table is backed up without blocking the Unicode tables',t=>{
 const f=fixture(t,true,['@mes(41, ,もう帰ろう。)','@mes(42, ,知りません。)']);
 const file=path.join(f.dat,'text01.dbs');
 const rows=[['もう帰ろう。','回家。',41],['知りません。','知りません。',42]];
 const sjis=new Map([
  ['もう帰ろう。','82e082a48b4182eb82a48142'],['回家。','89f189c68142'],['知りません。','926d82e882dc82b982f18142'],
 ]);
 const original=dbs(rows,[0,2,500],{marker:0,encode:v=>Buffer.from(sjis.get(v)+'00','hex')});
 fs.writeFileSync(file,original);
 assert.deepEqual(readCells(file),rows);
 jr.apply(f.dir);
 assert.deepEqual(readCells(f.file)[0],[body,body,body,20]);
 assert.deepEqual(fs.readFileSync(file),original);
 assert.deepEqual(fs.readFileSync(path.join(f.backup,'text01.dbs')),original);
});

test('other language targets still restore when a mirrored Japanese column wins the heuristic',t=>{
 const f=fixture(t,true);
 fs.writeFileSync(f.file,dbs([
  [body,body,bodyZh,'I dislike this place.',20],
  [choice,choice,choiceZh,'Talk to her.',24],
 ],[3,0,2,1,500]));
 jr.apply(f.dir);
 assert.deepEqual(readCells(f.file),[[body,body,body,body,20],[choice,choice,choice,choice,24]]);
});

test('a quoted script example is not evidence that its serial is displayed',t=>{
 const line='これはサンプルです。';
 const f=fixture(t,true,['@mes(81, ,"用例は @mes(71, ,'+line+') と書きます。")','@mes(72, ,知りません。)']);
 const file=path.join(f.dat,'text07.dbs');
 const original=dbs([[line,'这是样例。',71],['知りません。','知りません。',72]],[0,2,500]);
 fs.writeFileSync(file,original);
 jr.apply(f.dir);
 assert.deepEqual(fs.readFileSync(file),original);
});

test('ambiguous language column IDs cannot authorize copying a story cell',t=>{
 const f=fixture(t,true,['@mes(41, ,もう帰ろう。)','@mes(42, ,知りません。)']);
 const file=path.join(f.dat,'text01.dbs');
 const original=dbs([['もう帰ろう。','回家吧。','走吧。',41],['知りません。','知りません。','知りません。',42]],[0,2,2,500]);
 fs.writeFileSync(file,original);
 jr.apply(f.dir);
 assert.deepEqual(fs.readFileSync(file),original);
});

test('only numbered story tables can use a declared story slot',t=>{
 const f=fixture(t,true,['@mes(41, ,もう帰ろう。)','@mes(42, ,知りません。)','@mes(43, ,また来ます。)']);
 const tables=[
  ['other.dbs',dbs([['もう帰ろう。','回家吧。',41],['知りません。','知りません。',42]],[0,2,500])],
  ['text01.dbs',dbs([['もう帰ろう。','回家吧。',41,'カナ語(JP)'],
   ['知りません。','知りません。',42,'English(EN)'],['また来ます。','また来ます。',43,'简体中文(CN)']],[0,2,500,55])],
  ['numbers.dbs',dbs([[41]], [500])],
 ];
 for(const [name,bytes] of tables)fs.writeFileSync(path.join(f.dat,name),bytes);
 jr.apply(f.dir);
 for(const [name,bytes] of tables)assert.deepEqual(fs.readFileSync(path.join(f.dat,name)),bytes,name);
});

test('the declared story path requires the active Chinese pack and valid language IDs',t=>{
 const f=fixture(t,true,['@mes(41, ,もう帰ろう。)','@mes(42, ,知りません。)']);
 const file=path.join(f.dat,'text01.dbs'),ini=path.join(f.dir,'ds.ini');
 const original=dbs([['もう帰ろう。','回家吧。',41],['知りません。','知りません。',42]],[0,2,500]);
 fs.writeFileSync(file,original);
 fs.writeFileSync(path.join(f.dir,'SceneEN.pck'),'other language');
 fs.writeFileSync(ini,'Language=english');
 const plan=options=>jr._internal.siglusPlan(f.dir,options).changes.some(c=>c.name==='text01.dbs');
 assert.equal(plan(),false);
 fs.writeFileSync(ini,'Language=schinese');
 assert.equal(plan({siglusDbsNameColumn:2}),false);
 assert.equal(plan(),true);
});
