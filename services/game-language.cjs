'use strict';
const fs=require('node:fs'),path=require('node:path');
const {languageHint,launcherLanguage,isLauncher,versionedUpdaterStem,family,localLaunchers}=require('../core/launcher-language.cjs');
const key=file=>path.normalize(file).toLowerCase();
const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
function localFiles(dir){try{return fs.readdirSync(dir,{withFileTypes:true}).filter(entry=>entry.isFile());}catch{return [];}}
function get(db,id){const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');return {row,original:JSON.parse(row.original||'{}')};}
function inspect(db,id,root){
 const {row,original}=get(db,id),lib=original.library||{},patch=require('./patch-swap.cjs');
 const dir=root?patch.gameDirectory(root,String(id),row.executable,lib.dir):path.dirname(row.executable);
 const configured=lib.languageExecutables||{},versions={},scripts=[],backups=[];
 const actual=key(row.executable);
 const entries=localFiles(dir);
 for(const entry of entries){
  if(/\.(?:bat|cmd)$/i.test(entry.name)&&languageHint(entry.name))scripts.push(entry.name);
  if(/(?:beifen|backup|\.bak$|原版备份)/i.test(entry.name))backups.push(entry.name);
 }
 const local=entries.filter(entry=>isLauncher(entry.name)).map(entry=>path.join(dir,entry.name));
 const ownDir=path.dirname(row.executable),nearby=key(ownDir)===key(dir)?local:localLaunchers(ownDir);
 const filename=launcherLanguage(row.executable,nearby),launchers=filename==='en'?nearby:local;
 // A suffix identifies the executable itself. Match siblings by stem, never by directory order.
 const stem=family(row.executable,launchers);
 const siblings=launchers.filter(file=>family(file,launchers)===stem);
 const chinese=siblings.filter(file=>languageHint(file)==='zh');
 const originals=siblings.filter(file=>!['zh','en'].includes(launcherLanguage(file,launchers)));
 const originalLauncher=originals.find(file=>key(file)===actual)||
   originals.find(file=>configured.ja&&key(file)===key(configured.ja))||
   (filename==='en'&&originals.find(file=>languageHint(file)==='ja'))||(originals.length===1?originals[0]:null);
 const chineseLauncher=chinese.find(file=>key(file)===actual)||
   chinese.find(file=>configured.zh&&key(file)===key(configured.zh))||(chinese.length===1?chinese[0]:null);
 const paired=!!(originalLauncher&&chinese.length);
 const swap=root?patch.status(root,String(id),dir,row.executable,lib.engine,{activeOnly:paired}):{available:false};
 const translated=require('../core/locale-policy.cjs').chineseSystem4Patch(row.executable);
 let current=filename||(paired&&key(originalLauncher)===actual?'ja':translated?'zh':lib.contentLanguage||'');
 for(const language of ['ja','zh']){
  const file=configured[language],hint=typeof file==='string'&&launcherLanguage(file);
  if(typeof file==='string'&&isLauncher(file)&&isFile(file)&&(!hint||hint===language)&&
    !(paired&&language==='zh'&&key(file)===key(originalLauncher)))versions[language]=file;
 }
 if(paired||filename==='en'&&originalLauncher)versions.ja=originalLauncher;
 if(paired){
  if(chineseLauncher)versions.zh=chineseLauncher;
  else delete versions.zh;
 }
 for(const file of siblings){
  const hint=languageHint(file);
  if(hint&&!versions[hint]&&!(paired&&hint==='zh'))versions[hint]=file;
 }
 for(const item of lib.variants||[]){
  const hint=launcherLanguage(item.exe)||languageHint(item.label);
  if(hint&&hint!=='en'&&!versions[hint]&&!(paired&&hint==='zh')&&isLauncher(item.exe)&&isFile(item.exe))versions[hint]=item.exe;
 }
 /* E592 a translation launcher with a Chinese-only name next to the Japanese launcher (core/translated-launcher.cjs) */
 {const tl=require('../core/translated-launcher.cjs').inspect(row.executable);if(tl.translated&&!filename&&!paired){current='zh';versions.zh=row.executable;if(tl.original&&!versions.ja)versions.ja=tl.original;}}
 if(current&&filename!=='en'&&!versions[current]&&isLauncher(row.executable)&&isFile(row.executable))versions[current]=row.executable;
 if(versions.ja&&versions.zh&&key(versions.ja)===key(versions.zh)&&!swap.patchedExe)delete versions[current==='zh'?'ja':'zh'];
 if(swap.patchedExe)versions.zh=swap.patchedExe;
 const swapCurrent=swap.active==='ja'&&filename!=='en'?'ja':swap.available&&swap.active==='zh'&&!current?'zh':null;
 return {current:swapCurrent||current,swap:swap.available?{available:true,active:swap.active,backup:path.basename(swap.backup),exe:swap.exe,kind:swap.kind}:null,issue:swap.issue||'',windowsLaunch:require('./locale-launch.cjs').requiresAdministrator(row.executable),executable:row.executable,versions,scripts,backups,defaultOriginal:!current&&!translated&&!swap.available&&!swap.issue,requiresRestoration:(current==='zh'||translated||!!swap.issue)&&!versions.ja&&!swap.available};
}
function select(db,id,language,executable,root){if(!['ja','zh'].includes(language))throw Error('INVALID_GAME_LANGUAGE');const {row,original}=get(db,id),status=inspect(db,id,root);let file=executable||status.versions[language];
 if(executable&&(typeof executable!=='string'||!path.isAbsolute(executable)||path.extname(executable).toLowerCase()!=='.exe'||!fs.statSync(executable,{throwIfNoEntry:false})?.isFile()))throw Error('INVALID_EXECUTABLE');
 const hint=launcherLanguage(executable);
 if(executable&&(!isLauncher(executable)||hint&&hint!==language))throw Error('INVALID_EXECUTABLE');
 if(!executable&&language==='ja'&&status.issue&&status.swap?.active!=='zh')throw Error(status.issue);
 const swap=require('./patch-swap.cjs'),lib=original.library||{},dir=root?swap.gameDirectory(root,String(id),row.executable,lib.dir):path.dirname(row.executable);
 if(!executable&&language==='ja'&&status.current==='ja'&&!status.issue&&(!file||key(file)===key(row.executable)))return {...status,unchanged:true,notice:'ALREADY_JAPANESE'};
 if(root&&status.swap&&(!executable||status.swap.active!=='zh')){
  try{
   if(language==='ja'&&!file){
    if(launcherLanguage(path.join(dir,status.swap.exe))==='en')throw Error('JAPANESE_EXECUTABLE_REQUIRED');
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
 const localeMode=lib.localeUserSet?lib.localeMode:sameOriginal&&launch.source==='steam'?launch.localeMode||'off':
   language==='ja'&&require('../core/locale-emulator.cjs').x86(file)&&!require('../core/locale-emulator.cjs').steamApi(file)?'japanese':'off';
 original.library={...lib,exe:file,patchIssue:'',source:sameOriginal?launch.source:'folder',languageLaunch:launch,languageExecutables:{...versions,[language]:file},contentLanguage:language,localeMode};
 db.prepare('UPDATE games SET executable=?,original=? WHERE id=?').run(file,JSON.stringify(original),id);return {...inspect(db,id,root),changed:file!==row.executable||status.current!==language};
}
function originalExecutable(db,id,root,mode,executable){
 const {row,original}=get(db,id),lib=original.library||{};
 const patch=require('./patch-swap.cjs');
 const dir=patch.gameDirectory(root,id,row.executable,lib.dir);
 let embeddedRestored=false;try{const e=require('./embedded-japanese.cjs'),ownDir=path.dirname(row.executable);embeddedRestored=e._internal.snapshotValid(ownDir,e.manifest(ownDir));}catch{}
 const valid=file=>typeof file==='string'&&path.isAbsolute(file)&&isFile(file)&&isLauncher(file)&&(languageHint(file)!=='zh'||embeddedRestored&&key(file)===key(row.executable));
 const validOriginal=file=>valid(file)&&launcherLanguage(file)!=='en';
 const candidates=[];
 function scan(folder,depth){
  let entries;try{entries=fs.readdirSync(folder,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   const file=path.join(folder,entry.name);
   if(entry.isFile()&&validOriginal(file))candidates.push(file);
   else if(depth&&entry.isDirectory()&&!entry.isSymbolicLink()&&!/(?:patch|backup|bak|beifen|补丁|補丁|备份|備份)/i.test(entry.name))scan(file,depth-1);
  }
 }
 const localTranslated=require('../core/locale-policy.cjs').chineseSystem4Patch(row.executable);
 const savedSwap=patch.status(root,id,dir,row.executable,lib.engine,{activeOnly:true});
 const sameOriginal=savedSwap.japaneseExecutable&&key(savedSwap.japaneseExecutable)===key(row.executable);
 const legacyBlocked=savedSwap.active?.startsWith('switching-')||sameOriginal&&savedSwap.issue;
 const blocked=!valid(row.executable)||legacyBlocked||(!embeddedRestored&&!lib.originalExecutableVerified&&(localTranslated||lib.contentLanguage==='zh'));
 const english=launcherLanguage(row.executable)==='en';
 const result={directory:dir,executable:blocked||english?'':row.executable,blocked};
 if(!mode)return result;
 let selected=executable;
 if(mode==='find'){
  if(english)scan(path.dirname(row.executable),0);
  else scan(dir,2);
  const stem=family(row.executable,candidates);
  const siblings=candidates.filter(file=>family(file,candidates)===stem);
  const explicit=siblings.filter(file=>languageHint(file)==='ja');
  const configured=lib.languageExecutables?.ja;
  selected=explicit.length===1?explicit[0]:explicit.length>1?'':
   english?(siblings.length===1?siblings[0]:''):
   validOriginal(configured)&&family(configured)===stem&&!localTranslated&&siblings.length<=1?configured:
   !localTranslated&&siblings.length===1&&(languageHint(row.executable)==='zh'||!blocked)?siblings[0]:result.executable;
  /* E292 (user, 2026-11-10: 魔法使之夜 picked the Chinese 魔法使之夜.exe next to the original 魔法使いの夜.exe): a translated
     launcher named in Chinese shares no stem with the original. When the pick has no kana and the folder holds one launcher
     whose name has kana and the engine's own companion files (.cf / .exe.sig / .exe.emb), that one is the original. */
  const kana=f=>/[぀-ヿ]/.test(path.parse(f).name);
  if(!selected||!english&&!kana(selected)){const own=candidates.filter(f=>path.dirname(f).toLowerCase()===dir.toLowerCase()&&kana(f)&&!/ツール|チェック|設定|アンインストール|インストール|ランチャー/.test(path.parse(f).name)&&['.cf','.exe.sig','.exe.emb'].some(x=>isFile(f.replace(/\.exe$/i,'')+x)||isFile(f+x.replace(/^\.exe/,''))));
   if(own.length===1)selected=own[0];}
  const updaterStem=versionedUpdaterStem(row.executable);
  if(updaterStem!==null){const target=key(path.join(path.dirname(row.executable),updaterStem+'.exe'));
   const canResolve=updaterStem&&!localTranslated&&!['zh','en'].includes(lib.contentLanguage);
   const matches=canResolve?candidates.filter(f=>key(f)===target
    &&!require('../core/library.cjs').isTranslated(f)&&!require('../core/translated-launcher.cjs').inspect(f).translated):[];
   selected=matches.length===1?matches[0]:'';}
 }else if(mode!=='select')throw Error('INVALID_EXECUTABLE');
 if(!validOriginal(selected)||legacyBlocked&&key(selected)===key(row.executable))throw Error('JAPANESE_EXECUTABLE_REQUIRED');
 const steamProgram=lib.source==='steam'&&key(row.executable)===key(selected);
 const source=steamProgram?'steam':'folder';
 original.library={...lib,dir:key(selected).startsWith(key(dir)+path.sep)?dir:path.dirname(selected),exe:selected,source,executableSignature:require('./library.cjs').signature(selected),patchIssue:'',contentLanguage:'ja',originalExecutableVerified:true};
 db.prepare('UPDATE games SET executable=?,original=? WHERE id=?').run(selected,JSON.stringify(original),id);
 return {directory:original.library.dir,executable:selected,blocked:false,changed:key(row.executable)!==key(selected)||blocked};
}
module.exports={inspect,select,languageHint,originalExecutable};
