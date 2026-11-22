// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const npa=require('../core/nitroplus-npa.cjs'),jio=require('../core/japanese-import-original.cjs');

function archive(files,{encrypted=false}={}){
 const key=npa.archiveKey('',31,79),head=Buffer.alloc(41),index=[],bodies=[];let offset=0;
 head.write('NPA\x01');head.writeInt32LE(31,7);head.writeInt32LE(79,11);head[15]=1;head[16]=Number(encrypted);
 Object.entries(files).forEach(([name,value],i)=>{
  const raw=Buffer.from(name),bytes=Buffer.from(value),payload=zlib.deflateSync(bytes),row=Buffer.alloc(21+raw.length);
  row.writeUInt32LE(raw.length);for(let j=0;j<raw.length;j++)row[4+j]=(raw[j]-npa.nameByte(j,i,key))&255;
  row[4+raw.length]=2;row.writeUInt32LE(offset,9+raw.length);row.writeUInt32LE(payload.length,13+raw.length);row.writeUInt32LE(bytes.length,17+raw.length);
  index.push(row);bodies.push(payload);offset+=payload.length;
 });
 const table=Buffer.concat(index);head.writeUInt32LE(index.length,17);head.writeUInt32LE(index.length,25);head.writeUInt32LE(table.length,37);
 return Buffer.concat([head,table,...bodies]);
}
function zip(files,{encrypted=false,crcOffset=0}={}){
 let offset=0;const contents=[],directory=[];
 for(const [name,bytes] of Object.entries(files)){
  const named=Buffer.from(name),packed=zlib.deflateRawSync(bytes),crc=zlib.crc32(bytes)+crcOffset;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(Number(encrypted),6);local.writeUInt16LE(8,8);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(named.length,26);
  const item=Buffer.alloc(46);item.writeUInt32LE(0x02014b50);item.writeUInt16LE(Number(encrypted),8);item.writeUInt16LE(8,10);item.writeUInt32LE(crc,16);
  item.writeUInt32LE(packed.length,20);item.writeUInt32LE(bytes.length,24);item.writeUInt16LE(named.length,28);item.writeUInt32LE(offset,42);
  contents.push(local,named,packed);directory.push(item,named);offset+=local.length+named.length+packed.length;
 }
 const table=Buffer.concat(directory),end=Buffer.alloc(22),count=directory.length/2;
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(table.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...contents,table,end]);
}
const ja=['これから図書館の裏に向かいます。','昨日の約束を覚えていますか？','ここで少し休んでいきましょう。'];
const zh=['现在去图书馆的后面。','你还记得昨天的约定吗？',ja[2]];
const refs=['LoadImage("background/route42-library.png");','PlayBgm("bgm/late-night-library.ogg");'];
function scripts(lines,commands=refs){return { 'nss/route42.nss':['scene route42 {',...commands,...lines.map((line,i)=>'<PRE @box>\n[text000'+i+']\n'+line+'\n</PRE>'),'CloseScene();','}'].join('\n'),'nss/common.nss':'procedure Ready() { Poll(); }'};}
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-npa-import-')),game=path.join(root,'game'),from=path.join(root,'source');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(game);fs.mkdirSync(from);
 const exe=path.join(game,'work_chs.exe'),target=path.join(game,'nss.npa'),source=path.join(from,'nss.npa'),backup=path.join(game,'.megulit-japanese-import');
 const original=archive(scripts(zh)),jp=archive(scripts(ja));
 fs.writeFileSync(exe,'MZ fixture that references nss.npa but is never executed');fs.writeFileSync(target,original);fs.writeFileSync(source,jp);
 fs.writeFileSync(path.join(from,'system.npa'),'source sibling');fs.writeFileSync(path.join(game,'system.npa'),'game sibling');
 return {root,game,from,exe,target,source,original,jp,backup};
}

for(const wrapped of [false,true])test((wrapped?'single-file ZIP':'direct NPA')+' previews one file, installs the paired index, and rolls back byte for byte',async t=>{
 const f=setup(t),source=wrapped?path.join(f.from,'jp.zip'):f.source;
 if(wrapped)fs.writeFileSync(source,zip({'Japanese/nss.npa':f.jp}));
 const p=await jio.preview(f.game,source,f.exe);
 assert.deepEqual(p.replace,[{file:'nss.npa',size:f.jp.length}]);
 assert.deepEqual(p.coverage,{scripts:1,japaneseLines:3,paired:2,missing:1});
 assert.equal(fs.existsSync(f.backup),false);assert.ok(fs.readFileSync(f.target).equals(f.original));
 await assert.rejects(jio.apply(f.game,source,f.exe),/IMPORT_NPA_CONFIRM/);
 await assert.rejects(jio.apply(f.game,source,f.exe,{archiveToken:p.archiveToken,beforeWrite:()=>{throw Error('GAME_RUNNING');}}),/GAME_RUNNING/);
 assert.equal(fs.existsSync(f.backup),false);
 await jio.apply(f.game,source,f.exe,{archiveToken:p.archiveToken});
 assert.ok(fs.readFileSync(f.target).equals(f.jp));assert.ok(fs.readFileSync(path.join(f.backup,'files/nss.npa')).equals(f.original));
 assert.equal(fs.readFileSync(path.join(f.game,'system.npa'),'utf8'),'game sibling');
 assert.equal(fs.readFileSync(path.join(f.from,'system.npa'),'utf8'),'source sibling');
 assert.equal(fs.existsSync(path.join(f.game,'.megulit-japanese-staging')),false);
 const adapter=require('../services/original-engines/nitro-npa.cjs');
 const liveContent=adapter.list(f.target).find(entry=>entry.name==='nss/route42.nss').read();
 assert.deepEqual(adapter.parse(liveContent).lines,ja);
 const ot=require('../services/original-text.cjs'),provider=ot.provider(f.root,f.exe);
 assert.equal(provider.archiveImport,true);assert.equal(provider.hasLocalPairs(),true);
 assert.equal(provider.resolve(ja[0]).translation,zh[0]);
 assert.equal(provider.resolve(ja[2]).translation,undefined);
 assert.equal(ot.provider(f.root,path.join(f.game,'other.exe')),null);
 assert.deepEqual(jio.restore(f.game),{restored:1,skipped:[],exe:'',archive:true});
 assert.ok(fs.readFileSync(f.target).equals(f.original));assert.equal(provider.hasLocalPairs(),false);
 assert.equal(fs.existsSync(f.backup),false);
});

test('encrypted, unsupported, unrelated, and multi-file input fails read-only with specific reasons',async t=>{
 const f=setup(t),z=path.join(f.from,'wrapped.zip');
 for(const [bytes,error] of [
  [Buffer.from('other container'),/IMPORT_NPA_UNSUPPORTED/],
  [archive(scripts(ja),{encrypted:true}),/IMPORT_NPA_ENCRYPTED/],
  [archive(scripts(ja,['LoadImage("another/game-image.png");',refs[1]])),/IMPORT_NPA_MISMATCH/],
  [archive({ ...scripts(ja), 'nss/another.nss':'unrelated' }),/IMPORT_NPA_MISMATCH/],
  [archive(scripts(['这句话还是中文。','这里读到的也是中文。','这也是汉化内容。'])),/IMPORT_NPA_NO_JAPANESE/],
 ]){
  fs.writeFileSync(f.source,bytes);await assert.rejects(jio.preview(f.game,f.source,f.exe),error);
 }
 for(const [bytes,error] of [
  [zip({'nss.npa':f.jp,'system.npa':f.original}),/IMPORT_NPA_ZIP_CONTENTS/],
  [zip({'../nss.npa':f.jp}),/IMPORT_NPA_ZIP/],
  [zip({'nss.npa':f.jp},{encrypted:true}),/IMPORT_NPA_ENCRYPTED/],
  [zip({'nss.npa':f.jp},{crcOffset:1}),/IMPORT_NPA_ZIP/],
 ]){
  fs.writeFileSync(z,bytes);await assert.rejects(jio.preview(f.game,z,f.exe),error);
 }
 fs.writeFileSync(f.source,f.jp);
 fs.writeFileSync(f.exe,'MZ fixture with no archive reference');
 await assert.rejects(jio.preview(f.game,f.source,f.exe),/IMPORT_NPA_TARGET/);
 assert.deepEqual(fs.readdirSync(f.game).sort(),['nss.npa','system.npa','work_chs.exe']);
 assert.ok(fs.readFileSync(f.target).equals(f.original));
});

test('a changed archive makes a preview stale and invalidates a previously attached provider',async t=>{
 const f=setup(t),p=await jio.preview(f.game,f.source,f.exe);
 fs.writeFileSync(f.source,archive(scripts(ja.map(line=>'お知らせです。'+line))));
 await assert.rejects(jio.apply(f.game,f.source,f.exe,{archiveToken:p.archiveToken}),/IMPORT_NPA_CONFIRM/);
 assert.equal(fs.existsSync(f.backup),false);
 const next=await jio.preview(f.game,f.source,f.exe);
 await jio.apply(f.game,f.source,f.exe,{archiveToken:next.archiveToken});
 const ot=require('../services/original-text.cjs'),provider=ot.provider(f.root,f.exe);
 fs.writeFileSync(f.target,Buffer.from('user update'));
 assert.equal(provider.hasLocalPairs(),false);
 assert.equal(ot.provider(f.root,f.exe),null);
 const result=jio.restore(f.game);
 assert.deepEqual(result.skipped,['nss.npa']);assert.equal(fs.readFileSync(f.target,'utf8'),'user update');
 assert.ok(fs.readFileSync(path.join(f.backup,'files/nss.npa')).equals(f.original));
});

test('a readback failure rolls the installed archive and index back together',async t=>{
 const f=setup(t),p=await jio.preview(f.game,f.source,f.exe);
 const rename=fs.renameSync,read=fs.readSync;let failed=false,swapped=false;
 fs.renameSync=(from,to)=>{rename(from,to);if(path.basename(from)==='pending.npa'&&to===f.target)swapped=true;};
 fs.readSync=(...args)=>{if(swapped&&!failed){failed=true;throw Error('controlled readback failure');}return read(...args);};
 try{await assert.rejects(jio.apply(f.game,f.source,f.exe,{archiveToken:p.archiveToken}),/IMPORT_NPA_VERIFY/);}
 finally{fs.renameSync=rename;fs.readSync=read;}
 assert.equal(failed,true);assert.ok(fs.readFileSync(f.target).equals(f.original));assert.equal(fs.existsSync(f.backup),false);
});

test('bounded local discovery previews a uniquely verified candidate and leaves ambiguous choices to the user',async t=>{
 const f=setup(t),first=path.join(f.game,'original'),second=path.join(f.game,'another');
 fs.mkdirSync(first);fs.mkdirSync(second);
 const source=path.join(first,'jp.zip');fs.writeFileSync(source,zip({'nss.npa':f.jp}));
 fs.writeFileSync(path.join(second,'nss.npa'),archive(scripts(ja,['LoadImage("other/unrelated.png");',refs[1]])));
 const p=await jio.discoverArchive(f.game,f.exe);
 assert.equal(p.source,source);assert.equal(p.archiveToken,(await jio.preview(f.game,source,f.exe)).archiveToken);
 assert.ok(fs.readFileSync(f.target).equals(f.original));assert.equal(fs.existsSync(f.backup),false);
 fs.writeFileSync(path.join(second,'nss.npa'),archive(scripts(ja.map(line=>'それから、'+line))));
 await assert.rejects(jio.discoverArchive(f.game,f.exe),/IMPORT_NPA_MULTIPLE/);
 assert.ok(fs.readFileSync(f.target).equals(f.original));assert.equal(fs.existsSync(f.backup),false);
});

test('the Nitroplus library entry confirms a ZIP via the bridge and serves original Chinese with global local-pairs off',async t=>{
 const f=setup(t),source=path.join(f.from,'jp.zip');fs.writeFileSync(source,zip({'nss.npa':f.jp}));
 process.env.MEGULIT_ROOT=f.root;process.env.MEGULIT_NO_PREWARM='1';
 const restore=require('../core/japanese-restore.cjs')._internal,gameRunning=restore.gameRunning;
 restore.gameRunning=()=>false;t.after(()=>{restore.gameRunning=gameRunning;});
 const store=require('../services/store.cjs').openStore(f.root),id='nitro-fixture';
 try{store.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run(id,'Fixture',f.exe);}finally{store.close();}
 const settings=new(require('../services/settings.cjs').Settings)(f.root);settings.setScriptTranslation(false);
 const dispatch=require('../services/bridge.cjs').dispatch,call=(action,params={})=>dispatch({action,id,...params,requestId:'archive-fixture-'+action});
 assert.equal((await call('jp_restore_detect')).state,'importable');
 const p=await call('jp_import_preview',{source});
 assert.equal(p.archive,true);assert.equal(p.coverage.paired,2);
 const r=await call('jp_import_apply',{source,archiveToken:p.archiveToken});
 assert.equal(r.archive,true);assert.equal(r.patch,true);
 assert.equal(settings.read('translation').scriptTranslation,false);
 assert.equal((await call('jp_restore_detect')).verified,true);
 const activity=await call('text_source_activity');
 assert.equal(activity.active,true);assert.equal(activity.perGame,true);assert.equal(activity.enabled,false);
 const {Reader}=require('../services/reader.cjs'),{HookNative}=require('../core/hook-native.cjs');
 const reader=Object.create(Reader.prototype),hooks=Object.create(HookNative.prototype);
 Object.assign(reader,{root:f.root,gal:{hooks},prefs:()=>settings.read('translation')});
 reader.refreshTextSource({exe:f.exe});
 assert.equal(hooks.scriptAllowed(),true);assert.equal(hooks.scriptTranslation(ja[0]),zh[0]);
 assert.equal(hooks.scriptTranslation(ja[2]),'');
 assert.equal((await call('jp_restore_undo')).restored,1);
 assert.ok(fs.readFileSync(f.target).equals(f.original));
 assert.equal(hooks.scriptAllowed(),false);assert.equal(hooks.scriptTranslation(ja[0]),'');
});
