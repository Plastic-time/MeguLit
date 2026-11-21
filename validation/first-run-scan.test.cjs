'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Settings}=require('../services/settings.cjs');

async function openWizard(t,{steamPath='',failSettings=false,homeGames=[],locale='en',beforeSave}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-first-run-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const settings=new Settings(root);
 settings.save({scope:'library',values:{folders:'Offline\nExisting',steamPath}});
 const buttons=new Map(),calls=[],toasts=[];
 const dialog={showModal(){},addEventListener(){},close(){},remove(){this.removed=true;},querySelector(selector){
  if(!buttons.has(selector))buttons.set(selector,{});
  return buttons.get(selector);
 }};
 const previous=global.document,storage=Object.getOwnPropertyDescriptor(global,'localStorage');
 global.document={querySelector:()=>null,createElement:()=>dialog,body:{append(){}}};
 Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){}}});
 t.after(()=>{
  if(previous===undefined)delete global.document;else global.document=previous;
  if(storage)Object.defineProperty(global,'localStorage',storage);else delete global.localStorage;
 });
 const {maybeFirstRun}=await import('../web/first-run.js');
 async function api(action,args){
  calls.push(action);
  switch(action){
   case 'settings_get':if(failSettings){failSettings=false;throw Error('read failed');}return settings.get();
   case 'library_find_steam':return {path:'DetectedSteam'};
   case 'settings_save':beforeSave?.(settings);return settings.save(args);
   case 'library_scan':return {};
   case 'home':if(!homeGames)throw Error('home unavailable');return {games:homeGames};
  }
  throw Error(action);
 }
 maybeFirstRun({gamesCount:0,api,invoke:async()=>['Existing','Selected'],locale,esc:s=>s,toast:msg=>toasts.push(msg),onDone:()=>calls.push('done')});
 const pick=dialog.querySelector('[data-pick]'),scan=dialog.querySelector('[data-scan]');
 await pick.onclick();
 return {settings,dialog,pick,scan,calls,toasts};
}

test('first-run scan waits for the saved folders and retries without replacing them',async t=>{
 const {settings,dialog,pick,scan,calls,toasts}=await openWizard(t,{failSettings:true});
 await scan.onclick();
 assert.equal(settings.read('library').folders,'Offline\nExisting');
 assert.deepEqual(calls,['settings_get']);
 assert.equal(dialog.removed,undefined);
 assert.equal(scan.disabled,false);assert.equal(pick.disabled,false);
 await scan.onclick();
 assert.equal(settings.read('library').folders,'Offline\nExisting\nSelected');
 assert.equal(settings.read('library').steamPath,'DetectedSteam');
 assert.equal(dialog.removed,true);assert.match(toasts[0],/No games found/);
});

test('first-run scan keeps a previously chosen Steam path',async t=>{
 const {settings,scan,toasts}=await openWizard(t,{steamPath:'ChosenSteam',homeGames:[{},{}]});
 await scan.onclick();
 assert.equal(settings.read('library').steamPath,'ChosenSteam');
 assert.equal(settings.read('library').folders,'Offline\nExisting\nSelected');
 assert.deepEqual(toasts,['Found 2 games']);
});

for(const [locale,message] of [['en','Scan complete'],['zh','扫描完成'],['ja','スキャンが完了しました']]){
 test('a failed shelf refresh after scanning does not report an empty shelf in '+locale,async t=>{
  const {dialog,scan,toasts,calls}=await openWizard(t,{homeGames:null,locale});
  await scan.onclick();
  assert.equal(dialog.removed,true);assert.deepEqual(toasts,[message]);assert.equal(calls.at(-1),'done');
 });
}

test('a concurrent library edit survives the first-run save',async t=>{
 const {scan,settings}=await openWizard(t,{beforeSave:s=>s.save({scope:'library',values:{folders:'Latest',steamPath:'CustomSteam'}})});
 await scan.onclick();
 assert.equal(settings.read('library').folders,'Latest\nExisting\nSelected');
 assert.equal(settings.read('library').steamPath,'CustomSteam');
});

test('an unreadable or malformed library is never replaced by defaults',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-library-write-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const settings=new Settings(root),file=settings.file('library.json'),save=()=>settings.save({scope:'library',values:{folders:'New'}});
 for(const broken of ['{','null','[]']){
  fs.writeFileSync(file,broken);assert.throws(save);assert.equal(fs.readFileSync(file,'utf8'),broken);
 }
 const read=fs.readFileSync;
 fs.writeFileSync(file,'{"folders":["Offline"],"custom":true}');
 const lock=t.mock.method(fs,'readFileSync',function(name,...args){
  if(name===file)throw Object.assign(Error('busy'),{code:'EBUSY'});
  return read.call(this,name,...args);
 });
 assert.throws(save,{code:'EBUSY'});lock.mock.restore();
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),{folders:['Offline'],custom:true});
 fs.unlinkSync(file);save();assert.deepEqual(JSON.parse(fs.readFileSync(file)).folders,['New']);
});

test('the settings bridge forwards append mode and ordinary saves still replace folders',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-library-bridge-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const settings=new Settings(root);
 settings.save({scope:'library',values:{folders:'Original',steamPath:'ChosenSteam'}});
 const script=`const {dispatch}=require('./services/bridge.cjs');
 dispatch({action:'settings_save',scope:'library',appendFolders:true,values:{folders:'New',steamPath:'Detected'}})
 .catch(e=>{console.error(e);process.exitCode=1;});`;
 require('node:child_process').execFileSync(process.execPath,['-e',script],{cwd:path.join(__dirname,'..'),env:{...process.env,MEGULIT_ROOT:root}});
 assert.equal(settings.read('library').folders,'Original\nNew');assert.equal(settings.read('library').steamPath,'ChosenSteam');
 settings.save({scope:'library',values:{folders:'New',steamPath:'Replacement'}});
 assert.equal(settings.read('library').folders,'New');assert.equal(settings.read('library').steamPath,'Replacement');
});
