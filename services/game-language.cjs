'use strict';
const fs=require('node:fs'),path=require('node:path');
const {languageHint,isLauncher,family}=require('../core/launcher-language.cjs');
const key=file=>path.normalize(file).toLowerCase();
const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
function get(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');return {row,original:JSON.parse(row.original||'{}')};}
function inspect(db,id,root){
 const {row,original}=get(db,id),lib=original.library||{},patch=require('./patch-swap.cjs');
 const dir=root?patch.gameDirectory(root,String(id),row.executable,lib.dir):path.dirname(row.executable);
 const configured=lib.languageExecutables||{},versions={},scripts=[],backups=[],local=[];
 const actual=key(row.executable);
 try{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(!entry.isFile())continue;
   if(isLauncher(entry.name))local.push(path.join(dir,entry.name));
   if(/\.(?:bat|cmd)$/i.test(entry.name)&&languageHint(entry.name))scripts.push(entry.name);
   if(/(?:beifen|backup|\.bak$|原版备份)/i.test(entry.name))backups.push(entry.name);
  }
 }catch{}
 // A suffix identifies the executable itself. Match siblings by stem, never by directory order.
 const siblings=local.filter(file=>family(file)===family(row.executable));
 const chinese=siblings.filter(file=>languageHint(file)==='zh');
 const originals=siblings.filter(file=>languageHint(file)!=='zh');
 const originalLauncher=originals.find(file=>key(file)===actual)||
   originals.find(file=>configured.ja&&key(file)===key(configured.ja))|| (originals.length===1?originals[0]:null);
 const chineseLauncher=chinese.find(file=>key(file)===actual)||
   chinese.find(file=>configured.zh&&key(file)===key(configured.zh))||(chinese.length===1?chinese[0]:null);
 const paired=!!(originalLauncher&&chinese.length);
 const swap=root?patch.status(root,String(id),dir,row.executable,lib.engine,{activeOnly:paired}):{available:false};
 const translated=require('../core/locale-policy.cjs').chineseSystem4Patch(row.executable);
 const filename=languageHint(row.executable);
 let current=filename||(paired&&key(originalLauncher)===actual?'ja':translated?'zh':lib.contentLanguage||'');
 for(const language of ['ja','zh']){
  const file=configured[language],hint=typeof file==='string'&&languageHint(file);
  if(typeof file==='string'&&isLauncher(file)&&isFile(file)&&(!hint||hint===language)&&
    !(paired&&language==='zh'&&key(file)===key(originalLauncher)))versions[language]=file;
 }
 if(paired){
  versions.ja=originalLauncher;
  if(chineseLauncher)versions.zh=chineseLauncher;
  else delete versions.zh;
 }
 for(const file of siblings){
  const hint=languageHint(file);
  if(hint&&!versions[hint]&&!(paired&&hint==='zh'))versions[hint]=file;
 }
 for(const item of lib.variants||[]){
  const hint=languageHint(item.exe)||languageHint(item.label);
  if(hint&&!versions[hint]&&!(paired&&hint==='zh')&&isLauncher(item.exe)&&isFile(item.exe))versions[hint]=item.exe;
 }
 if(current&&!versions[current]&&isLauncher(row.executable)&&isFile(row.executable))versions[current]=row.executable;
 if(versions.ja&&versions.zh&&key(versions.ja)===key(versions.zh)&&!swap.patchedExe)delete versions[current==='zh'?'ja':'zh'];
 if(swap.patchedExe)versions.zh=swap.patchedExe;
 const swapCurrent=swap.active==='ja'?'ja':swap.available&&swap.active==='zh'&&!current?'zh':null;
 return {current:swapCurrent||current,swap:swap.available?{available:true,active:swap.active,backup:path.basename(swap.backup),exe:swap.exe,kind:swap.kind}:null,issue:swap.issue||'',windowsLaunch:require('./locale-launch.cjs').requiresAdministrator(row.executable),executable:row.executable,versions,scripts,backups,defaultOriginal:!current&&!translated&&!swap.available&&!swap.issue,requiresRestoration:(current==='zh'||translated||!!swap.issue)&&!versions.ja&&!swap.available};
}
function select(db,id,language,executable,root){if(!['ja','zh'].includes(language))throw Error('INVALID_GAME_LANGUAGE');const {row,original}=get(db,id),status=inspect(db,id,root);let file=executable||status.versions[language];
 if(executable&&(typeof executable!=='string'||!path.isAbsolute(executable)||path.extname(executable).toLowerCase()!=='.exe'||!fs.statSync(executable,{throwIfNoEntry:false})?.isFile()))throw Error('INVALID_EXECUTABLE');
 if(executable&&(!isLauncher(executable)||languageHint(executable)&&languageHint(executable)!==language))throw Error('INVALID_EXECUTABLE');
 if(!executable&&language==='ja'&&status.issue&&status.swap?.active!=='zh')throw Error(status.issue);
 const swap=require('./patch-swap.cjs'),lib=original.library||{},dir=root?swap.gameDirectory(root,String(id),row.executable,lib.dir):path.dirname(row.executable);
 if(!executable&&language==='ja'&&status.current==='ja'&&!status.issue&&(!file||key(file)===key(row.executable)))return {...status,unchanged:true,notice:'ALREADY_JAPANESE'};
 if(root&&status.swap&&(!executable||status.swap.active!=='zh')){
  try{
   if(language==='ja'&&!file){
    const result=swap.toJapanese(root,String(id),dir,row.executable,lib.engine);
    file=result.japaneseExecutable;status.versions.zh=row.executable;
   }else if(status.swap.active!=='zh'&&(language==='zh'||executable&&path.normalize(executable).toLowerCase()!==path.normalize(row.executable).toLowerCase())){
    const state=swap.status(root,String(id),dir,row.executable,lib.engine);
    swap.toTranslated(root,String(id),dir);file=executable||state.patchedExe||file;
   }
  }catch(error){swap.diagnostic(root,id,'patch-switch-failed',error.message);throw error;}
 }
 if(!file&&status.issue){if(root)swap.diagnostic(root,id,'patch-preflight',status.issue);throw Error(status.issue);}
 if(!file){if(language==='ja'&&status.defaultOriginal)return {...status,unchanged:true,notice:'DEFAULT_ORIGINAL'};throw Error('GAME_LANGUAGE_NOT_AVAILABLE');}
 if(typeof file!=='string'||!path.isAbsolute(file)||path.extname(file).toLowerCase()!=='.exe'||!fs.statSync(file,{throwIfNoEntry:false})?.isFile())throw Error('INVALID_EXECUTABLE');
 const versions={...status.versions};
 if(status.defaultOriginal&&language==='zh'&&!versions.ja)versions.ja=row.executable;
 const launch=lib.languageLaunch||{exe:row.executable,source:lib.source,localeMode:lib.localeMode};
 const sameOriginal=path.normalize(file).toLowerCase()===path.normalize(launch.exe).toLowerCase();
 original.library={...lib,exe:file,patchIssue:'',source:sameOriginal?launch.source:'folder',languageLaunch:launch,languageExecutables:{...versions,[language]:file},contentLanguage:language,localeMode:sameOriginal&&launch.source==='steam'?launch.localeMode||'off':language==='ja'&&require('../core/locale-emulator.cjs').x86(file)?'japanese':'off'};
 db.prepare('UPDATE games SET executable=?,original=? WHERE id=?').run(file,JSON.stringify(original),id);return {...inspect(db,id,root),changed:file!==row.executable||status.current!==language};
}
function originalExecutable(db,id,root,mode,executable){
 const {row,original}=get(db,id),lib=original.library||{};
 const patch=require('./patch-swap.cjs');
 const dir=patch.gameDirectory(root,id,row.executable,lib.dir);
 const valid=file=>typeof file==='string'&&path.isAbsolute(file)&&isFile(file)&&isLauncher(file)&&languageHint(file)!=='zh';
 const candidates=[];
 function scan(folder,depth){
  let entries;try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   const file=path.join(folder,entry.name);
   if(entry.isFile()&&valid(file))candidates.push(file);
   else if(depth&&entry.isDirectory()&&!entry.isSymbolicLink()&&!/(?:patch|backup|bak|beifen|补丁|補丁|备份|備份)/i.test(entry.name))scan(file,depth-1);
  }
 }
 const localTranslated=require('../core/locale-policy.cjs').chineseSystem4Patch(row.executable);
 const savedSwap=patch.status(root,id,dir,row.executable,lib.engine,{activeOnly:true});
 const sameOriginal=savedSwap.japaneseExecutable&&key(savedSwap.japaneseExecutable)===key(row.executable);
 const legacyBlocked=savedSwap.active?.startsWith('switching-')||sameOriginal&&savedSwap.issue;
 const blocked=!valid(row.executable)||legacyBlocked||(!lib.originalExecutableVerified&&(localTranslated||lib.contentLanguage==='zh'));
 const result={directory:dir,executable:blocked?'':row.executable,blocked};
 if(!mode)return result;
 let selected=executable;
 if(mode==='find'){
  scan(dir,2);
  const siblings=candidates.filter(file=>family(file)===family(row.executable));
  const explicit=siblings.filter(file=>languageHint(file)==='ja');
  const configured=lib.languageExecutables?.ja;
  selected=explicit.length===1?explicit[0]:explicit.length>1?'':
   valid(configured)&&family(configured)===family(row.executable)&&!localTranslated&&siblings.length<=1?configured:
   !localTranslated&&siblings.length===1&&(languageHint(row.executable)==='zh'||!blocked)?siblings[0]:!blocked?row.executable:'';
 }else if(mode!=='select')throw Error('INVALID_EXECUTABLE');
 if(!valid(selected)||legacyBlocked&&key(selected)===key(row.executable))throw Error('JAPANESE_EXECUTABLE_REQUIRED');
 const steamProgram=lib.source==='steam'&&key(row.executable)===key(selected);
 const source=steamProgram?'steam':'folder';
 original.library={...lib,dir:key(selected).startsWith(key(dir)+path.sep)?dir:path.dirname(selected),exe:selected,source,executableSignature:require('./library.cjs').signature(selected),patchIssue:'',contentLanguage:'ja',originalExecutableVerified:true};
 db.prepare('UPDATE games SET executable=?,original=? WHERE id=?').run(selected,JSON.stringify(original),id);
 return {directory:original.library.dir,executable:selected,blocked:false};
}
module.exports={inspect,select,languageHint,originalExecutable};
