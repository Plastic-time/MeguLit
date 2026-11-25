'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const wait=async(m,phase)=>{for(let i=0;i<100;i++){if(m.status().phase===phase)return;await new Promise(r=>setTimeout(r,20));}};
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'anki 安装-'));
 const appdata=process.env.APPDATA;process.env.APPDATA=root;
 t.after(()=>{if(appdata===undefined)delete process.env.APPDATA;else process.env.APPDATA=appdata;fs.rmSync(root,{recursive:true,force:true});});
 fs.mkdirSync(path.join(root,'logs'));
 fs.mkdirSync(path.join(root,'Anki2','addons21','2055492159'),{recursive:true});
 delete require.cache[require.resolve('../core/anki-installer.cjs')];
 return {root,m:require('../core/anki-installer.cjs')};
}
test('one-click Anki: an existing Anki skips the download; a download that fails the checksum is never installed',async t=>{
 const {root,m}=fixture(t);
 assert.equal(m.PACKAGE.size,201621504);assert.match(m.SOURCES[0],/^https:\/\/dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[1],/^https:\/\/cn-dl\.megulit\.com\/files\/anki\//);assert.match(m.SOURCES[2],/^https:\/\/github\.com\/ankitects\/anki\/releases\/download\//);
 let fetched=0;m.start(root,{find:()=>'C:\Anki\anki.exe',fetcher:async()=>{fetched++;throw Error('no');}});await wait(m,'done');
 assert.equal(m.status().phase,'done');assert.equal(fetched,0,'installed already: nothing downloaded');
 const bad=()=>new Response(new Uint8Array(1024));m.start(root,{find:()=>'',fetcher:async()=>bad()});await wait(m,'error');
 assert.equal(m.status().phase,'error');assert.match(m.status().error,/ANKI_DOWNLOAD_FAILED/);
 assert.equal(fs.existsSync(path.join(root,'data','cache','anki-installer',m.PACKAGE.name)),false,'a wrong file is never kept');
});
test('one-click Anki reports a connection failure and lets the installed app connect on retry',async t=>{
 const {root,m}=fixture(t);
 const {Anki}=require('../core/anki.cjs');
 const actions=[];
 let ready=false,downloads=0;
 const anki=new Anki(async(_url,{body})=>{
  actions.push(JSON.parse(body).action);
  return ready?Response.json({result:6,error:null}):new Response(null,{status:503});
 });
 const runtime={ankiProcess:()=>({start:async()=>{
  await anki.call({},'version').catch(()=>{throw Error('ANKI_OFFLINE');});
 }})};
 const options={runtime,find:()=>'anki.exe',fetcher:async()=>{downloads++;throw Error('unexpected download');}};
 m.start(root,options);
 await wait(m,'error');
 assert.equal(m.status().phase,'error');
 assert.equal(m.status().error,'ANKI_OFFLINE');
 ready=true;
 m.start(root,options);
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(m.status().error,'');
 assert.deepEqual(actions,['version','version']);
 assert.equal(downloads,0);
});

for(const scenario of [
 {name:'installs under MeguLit on another drive'},
 {name:'installs under MeguLit on the system drive too',sameDrive:true},
 {name:'reports the chosen directory on an MSI write failure',code:1603,error:'ANKI_INSTALL_TARGET_FAILED {folder} (1603)'},
 {name:'does not retry a cancelled installation',code:1602,error:'ANKI_INSTALL_CANCELLED'},
 {name:'keeps the cancellation message when elevation is declined',code:1223,error:'ANKI_INSTALL_CANCELLED'},
 {name:'accepts a successful MSI installation that requests a reboot',code:3010},
 {name:'reports success without an executable as an error',noExecutable:true,error:'ANKI_EXECUTABLE_MISSING'},
 {name:'reports a failure to start Windows Installer',spawnError:true,error:'MSI launch failed'},
 {name:'accepts an existing empty folder',entry:'empty'},
 {name:'leaves a nonempty Anki folder alone',entry:'occupied',blocked:true},
 {name:'rejects a file in place of the Anki folder',entry:'file',blocked:true},
 {name:'rejects an Anki directory junction',entry:'junction',blocked:true},
 {name:'reports an unreadable folder without starting MSI',entry:'denied',blocked:true},
]){
 test('one-click Anki '+scenario.name,{skip:process.platform!=='win32'},async t=>{
  const {EventEmitter}=require('node:events'),calls=[];
  let installed=false;
  const childProcess=require('node:child_process');
  const probe=t.mock.method(childProcess,'execFile',(_exe,_args,_options,callback)=>{
   queueMicrotask(()=>callback(Error('unexpected disk probe')));
  });
  t.mock.method(childProcess,'spawn',(exe,args)=>{
   calls.push({exe,args});
   const child=new EventEmitter();
   queueMicrotask(()=>{
    if(scenario.spawnError){child.emit('error',Error('MSI launch failed'));return;}
    installed=(!scenario.code||scenario.code===3010)&&!scenario.noExecutable;
    child.emit('exit',scenario.code||0);
   });
   return child;
  });
  t.mock.method(require('../core/fast-download.cjs'),'download',async()=>{});
  const {root,m}=fixture(t),drive=path.parse(root).root;
  const folder=path.join(root,'Anki'),marker=path.join(folder,'keep.txt');
  const junctionTarget=path.join(root,'junction-target');
  if(scenario.entry==='empty')fs.mkdirSync(folder);
  if(scenario.entry==='occupied'){fs.mkdirSync(folder);fs.writeFileSync(marker,'existing files');}
  if(scenario.entry==='file')fs.writeFileSync(folder,'existing file');
  if(scenario.entry==='junction'){fs.mkdirSync(junctionTarget);fs.symlinkSync(junctionTarget,folder,'junction');}
  if(scenario.entry==='denied'){
   const lstat=fs.lstatSync;
   t.mock.method(fs,'lstatSync',(file,options)=>{
    if(file===folder)throw Object.assign(Error('access denied'),{code:'EACCES'});
    return lstat(file,options);
   });
  }
  const systemDrive=process.env.SystemDrive;
  t.after(()=>{if(systemDrive===undefined)delete process.env.SystemDrive;else process.env.SystemDrive=systemDrive;});
  process.env.SystemDrive=scenario.sameDrive?drive.slice(0,2):(drive[0].toUpperCase()==='C'?'D:':'C:');
  m.start(root,{find:()=>installed?path.join(folder,'anki.exe'):'',china:false});
  const error=(scenario.blocked?'ANKI_INSTALL_TARGET_FAILED {folder}':scenario.error||'').replace('{folder}',folder);
  const phase=error?'error':'done';
  await wait(m,phase);
  assert.equal(m.status().phase,phase);
  assert.equal(m.status().error,error);
  if(scenario.blocked)assert.equal(calls.length,0);
  else{
   assert.equal(calls.length,1);
   assert.equal(path.basename(calls[0].exe),'msiexec.exe');
   assert.deepEqual(calls[0].args,['/i',path.join(root,'data','cache','anki-installer',m.PACKAGE.name),'/passive','/norestart','INSTALLFOLDER='+folder]);
  }
  assert.equal(probe.mock.callCount(),0);
  if(scenario.entry==='occupied')assert.equal(fs.readFileSync(marker,'utf8'),'existing files');
  if(scenario.entry==='file')assert.equal(fs.readFileSync(folder,'utf8'),'existing file');
  if(scenario.entry==='junction')assert.deepEqual(fs.readdirSync(junctionTarget),[]);
 });
}

test('the install dialog shows the failed Anki directory and a way forward',async t=>{
 const messages={
  zh:/无法安装到 E:\\Anki \(1603\)。请确认目录为空且可写/,
  en:/Could not install to E:\\Anki \(1603\)\. Check that the folder is empty and writable/,
  ja:/E:\\Anki \(1603\) にインストールできませんでした。フォルダーが空で書き込み可能か確認/,
 };
 const generic={zh:/没有装成功/,en:/The installation did not complete/,ja:/インストールできませんでした/};
 const noop=()=>{};
 const document={documentElement:{lang:''},addEventListener:noop,removeEventListener:noop};
 const globals={document,window:{addEventListener:noop,removeEventListener:noop},addEventListener:noop,
  localStorage:{getItem:()=>null},MeguHud:require('../web/hud-drag.js'),MeguAnkiHud:require('../web/anki-hud-model.js')};
 for(const [name,value] of Object.entries(globals)){
  const previous=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value,configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else delete globalThis[name];});
 }
 const ticks=[];
 t.mock.method(globalThis,'setInterval',fn=>{ticks.push(fn);return ticks.length;});
 t.mock.method(globalThis,'clearInterval',noop);
 const {renderAnkiReview}=await import('../web/anki-review.js');
 for(const [language,message] of Object.entries(messages)){
  document.documentElement.lang=language;
  const ask={addEventListener(_event,handler){this.onclick=handler;}},go={},line={},bar={querySelector:()=>({style:{}})};
  const elements={'[data-install-ask]':ask,'[data-install-go]':go,'[data-install-state]':line,'.anki-install-bar':bar,'[data-connect]':{},'[data-launch]':{}};
  const querySelector=selector=>elements[selector]||null;
  const landing={matches:()=>true,classList:{add:noop,remove:noop},removeAttribute:noop,querySelector};
  const target={firstElementChild:landing,querySelector};
  landing.parentElement=target;
  let error;
  const api=async action=>{
   if(action==='anki_status')return {connected:false};
   if(action==='anki_install')return {phase:'installing'};
   assert.equal(action,'anki_install_status');
   return {phase:'error',error};
  };
  await renderAnkiReview({target,api,text:{},esc:String,isCurrent:()=>true,toast:assert.fail,quiet:true});
  for(const [value,expected] of [
   ['ANKI_INSTALL_TARGET_FAILED E:\\Anki (1603)',message],['ANKI_INSTALL_FAILED 1603',generic[language]],
   [1603,generic[language]],[undefined,generic[language]],
  ]){
   error=value;
   ask.onclick();
   await go.onclick();
   await ticks.at(-1)();
   assert.match(line.textContent,expected);
   assert.equal(go.disabled,false);
  }
 }
});

test('the bridge connects an existing Anki using the runtime path',async t=>{
 const {root,m}=fixture(t);
 const previousRoot=process.env.MEGULIT_ROOT;
 process.env.MEGULIT_ROOT=root;
 t.after(()=>{if(previousRoot===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=previousRoot;});
 const {dispatch}=require('../services/bridge.cjs');
 const anki=require('../core/anki-process.cjs');
 const exe='R:\\Existing Anki\\anki.exe';
 let connectPath='',launched=false;
 t.mock.method(anki,'installAnkiConnect',async (_env,{locate})=>{
  connectPath=locate();
  return {already:true};
 });
 const runner={find:()=>exe,start:async options=>{
  assert.equal(connectPath,exe);
  assert.deepEqual(options,{hide:false});
  launched=true;
 }};
 await dispatch({action:'anki_install'},{ankiProcess:()=>runner});
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.equal(launched,true);
 const cliFind=t.mock.method(anki,'find',(_configured,_env,_exists,appRoot)=>{
  assert.equal(appRoot,root);
  return exe;
 });
 await dispatch({action:'anki_install'});
 await wait(m,'done');
 assert.equal(m.status().phase,'done');
 assert.ok(cliFind.mock.callCount()>0);
 assert.deepEqual(await dispatch({action:'anki_find'}),{path:exe});
 assert.deepEqual(await dispatch({action:'anki_install_connect'}),{already:true});
 assert.equal(connectPath,exe);
});
