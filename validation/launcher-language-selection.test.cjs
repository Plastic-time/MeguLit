// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openStore}=require('../services/store.cjs');
const language=require('../services/game-language.cjs');
const {family,languageHint}=require('../core/launcher-language.cjs');

function install(t,files,settings={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-launcher-language-'));
 const dir=path.join(root,'game'),file=name=>path.join(dir,name);
 const executable=file(files[0]);
 for(const name of files){
  fs.mkdirSync(path.dirname(file(name)),{recursive:true});
  fs.writeFileSync(file(name),'fixture');
 }
 const db=openStore(root);
 t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});
 const library={dir,engine:'KiriKiri',...settings};
 db.prepare('INSERT INTO games(id,title,executable,original) VALUES(?,?,?,?)')
  .run('g','Fixture',executable,JSON.stringify({library}));
 return {root,file,db,executable,row:()=>db.prepare('SELECT executable,original FROM games WHERE id=?').get('g')};
}

test('an English suffix finds a same-directory Japanese sibling for another game',t=>{
 const {root,file,db,row}=install(t,['Edition/Story_Eng.EXE','Edition/story_JA.exe','Edition/story_ZH.exe',
  'Other/story_jp.exe','Other/story_ZH.exe','story_jp.exe','data.xp3']);
 const status=language.inspect(db,'g',root);
 assert.equal(status.current,'en');
 assert.deepEqual(status.versions,{ja:file('Edition/story_JA.exe'),zh:file('Edition/story_ZH.exe')});
 assert.equal(language.originalExecutable(db,'g',root,'find').executable,file('Edition/story_JA.exe'));
 assert.equal(row().executable,file('Edition/story_JA.exe'));
});

test('a Chinese sibling and an archive alone leave the English program in its own family',t=>{
 const {root,file,db,executable,row}=install(t,['fata_en.exe','fata_zh.exe','data.xp3','data_jp.xp3',
  'Other/fata_jp.exe','Unrelated_jp.exe']);
 assert.equal(family(executable,[file('fata_zh.exe'),file('Other/fata_jp.exe'),file('Unrelated_jp.exe')]),'fata_en');
 assert.deepEqual(language.inspect(db,'g',root).versions,{});
 assert.equal(language.select(db,'g','ja',null,root).notice,'DEFAULT_ORIGINAL');
 assert.equal(language.originalExecutable(db,'g',root,'find').executable,executable);
 assert.equal(row().executable,executable);
});

test('old saved slots cannot select English when a Japanese sibling is present',t=>{
 const {root,file,db,executable,row}=install(t,['Story_English.exe','Story_JP.exe','Story_ZH.exe'],
  {contentLanguage:'ja',originalExecutableVerified:true});
 const original=JSON.parse(row().original);
 original.library.languageExecutables={ja:executable,zh:executable};
 original.library.variants=[{exe:executable,label:'原版'}];
 db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),'g');
 const before=row();
 const status=language.inspect(db,'g',root);
 assert.equal(status.current,'en');
 assert.deepEqual(status.versions,{ja:file('Story_JP.exe'),zh:file('Story_ZH.exe')});
 assert.equal(language.originalExecutable(db,'g',root).executable,'');
 assert.equal(language.originalExecutable(db,'g',root).blocked,false);
 assert.throws(()=>language.select(db,'g','ja',executable,root),/INVALID_EXECUTABLE/);
 assert.throws(()=>language.originalExecutable(db,'g',root,'select',executable),/JAPANESE_EXECUTABLE_REQUIRED/);
 assert.deepEqual(row(),before);
 assert.equal(language.select(db,'g','ja',null,root).executable,file('Story_JP.exe'));
});

test('a verified standalone program keeps its saved original-language selection',t=>{
 const {root,db,executable,row}=install(t,['Game-en.exe'],{contentLanguage:'ja',originalExecutableVerified:true});
 const before=row();
 assert.equal(language.inspect(db,'g',root).current,'ja');
 assert.equal(language.inspect(db,'g',root).versions.ja,executable);
 assert.equal(language.originalExecutable(db,'g',root).executable,executable);
 assert.equal(language.select(db,'g','ja',null,root).notice,'ALREADY_JAPANESE');
 assert.deepEqual(row(),before);
 assert.equal(language.originalExecutable(db,'g',root,'select',executable).executable,executable);
});

test('an unmarked same-stem launcher is available when switching from the English sibling',t=>{
 const {root,file,db,executable}=install(t,['Game_en.exe','Game.exe']);
 const status=language.inspect(db,'g',root);
 assert.equal(status.current,'en');
 assert.deepEqual(status.versions,{ja:file('Game.exe')});
 assert.throws(()=>language.originalExecutable(db,'g',root,'select',executable),/JAPANESE_EXECUTABLE_REQUIRED/);
 assert.equal(language.select(db,'g','ja',null,root).executable,file('Game.exe'));
});

test('explicit Chinese and Japanese names keep their language hints before an English suffix',t=>{
 const guide=require('../services/cn-version-guide.cjs'),translated=require('../core/translated-launcher.cjs');
 for(const name of ['Game_chs_eng.exe','Game_cn_en.exe','汉化_en.exe']){
  const {root,db,executable}=install(t,[name]);
  assert.equal(languageHint(name),'zh');
  assert.equal(translated.inspect(executable).translated,true);
  assert.deepEqual(guide.chineseSignals({exe:executable}),['exe-name']);
  assert.equal(language.inspect(db,'g',root).current,'zh');
  assert.equal(language.originalExecutable(db,'g',root).blocked,true);
 }
 const {root,db}=install(t,['Game_jp_en.exe','Launch_jp.bat','Launch_en.bat']);
 assert.equal(languageHint('Game_jp_en.exe'),'ja');
 assert.equal(languageHint('Launch_en.bat'),'');
 assert.equal(language.inspect(db,'g',root).current,'ja');
 assert.deepEqual(language.inspect(db,'g',root).scripts,['Launch_jp.bat']);
});

test('a Japanese swap journal does not claim an active English sibling is already Japanese',t=>{
 const {root,file,db}=install(t,['Game_en.exe','Game_jp.exe','Game_zh.exe']);
 const dir=path.dirname(file('Game_en.exe')),journal=path.join(root,'data','config','patch-swap.json');
 fs.mkdirSync(path.dirname(journal),{recursive:true});
 fs.writeFileSync(journal,JSON.stringify({g:{active:'ja',gameDir:dir,backup:file('backup'),
  exe:'Game_jp.exe',patchedExe:file('Game_zh.exe')}}));
 const status=language.inspect(db,'g',root);
 assert.equal(status.swap?.active,'ja');
 assert.equal(status.current,'en');
 assert.equal(language.select(db,'g','ja',null,root).executable,file('Game_jp.exe'));
});

test('a Chinese-only named patch points to the Japanese sibling of the English launcher',t=>{
 const {root,file,db}=install(t,['翻译作品.exe','Story_en.exe','Story_jp.exe','readme_cn.txt']);
 const status=language.inspect(db,'g',root);
 assert.equal(status.current,'zh');
 assert.equal(status.versions.ja,file('Story_jp.exe'));
});

test('a swap cannot restore an English backup over a directory holding its Japanese sibling',t=>{
 const {root,db,row}=install(t,['Patch_zh.exe','Story_jp.exe','data.pak','backup/Story_en.exe','backup/data.pak']);
 const before=row();
 assert.equal(language.inspect(db,'g',root).swap?.exe,'Story_en.exe');
 const restore=t.mock.method(require('../services/patch-swap.cjs'),'toJapanese',()=>{throw Error('Unexpected swap');});
 assert.throws(()=>language.select(db,'g','ja',null,root),/JAPANESE_EXECUTABLE_REQUIRED/);
 assert.equal(restore.mock.callCount(),0);
 assert.deepEqual(row(),before);
});
