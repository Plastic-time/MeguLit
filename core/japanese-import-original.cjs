// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E327 Import from a Japanese original the user already has (user 2026-11-10): a folder, its game program, or a
// downloaded archive (zip / 7z / rar, unpacked with Windows' own tar). The folder inside the source that matches this
// game is found by shared file names; then every shared file whose content differs is swapped for the Japanese one,
// files the Japanese release lacks that are known Chinese overrides (patch*.xp3, update*.ypf, archives named cn/chs/
// 汉化) are moved aside, and files only the Japanese release has are added. preview() lists all of it before anything
// is written; apply() moves the replaced files into the backup folder; restore() puts every one back.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const {languageHint,isLauncher}=require('./launcher-language.cjs');

const BACKUP_DIR='.megulit-japanese-import',STAGING_DIR='.megulit-japanese-staging',ADAPTER='original-files';
const ARCHIVE=/\.(zip|7z|rar)$/i;
const SKIP_DIR=/^(save|savedata|saves|userdata|\.megulit.*)$/i;
const SKIP_FILE=/\.(sav|ini|cfg|log|txt|url|lnk|md|html?|pdf)$/i;
const DATA=/\.(xp3|ypf|pck|dat|npa|arc|pak|int|dbs|ybn|ks|rpa|rpyc|bin|pac|cpk|afs|lpk|mpk|med|gpk)$/i;
const OVERRIDE=n=>/^patch\d*\.xp3$/i.test(n)||/^update\d*\.ypf$/i.test(n)||(DATA.test(n)&&(languageHint(n.replace(/\.[^.]+$/,'.exe'))==='zh'||/汉化|漢化|中文|(?:^|[_. -])(?:chs|cht|cn|sc|zh)(?=$|[_. -]|\d)/i.test(n.replace(/\.[^.]+$/,''))));
const MAX_FILES=40000,MAX_ADDED=4*1024**3;

const manifestPath=dir=>path.join(dir,BACKUP_DIR,'manifest.json');
function readManifest(dir){try{return JSON.parse(fs.readFileSync(manifestPath(dir),'utf8'));}catch{return null;}}
const stat=f=>{try{return fs.statSync(f);}catch{return null;}};

// All files under root as relative paths (save folders and MeguLit's own folders skipped).
function walk(root,limit=MAX_FILES){const out=[],stack=[''];
 while(stack.length){const rel=stack.pop();let list;try{list=fs.readdirSync(path.join(root,rel),{withFileTypes:true});}catch{continue;}
  for(const e of list){const r=rel?path.join(rel,e.name):e.name;
   if(e.isDirectory()){if(!SKIP_DIR.test(e.name))stack.push(r);}
   else if(e.isFile()&&!SKIP_FILE.test(e.name)){out.push(r);if(out.length>limit)throw Error('IMPORT_TOO_MANY_FILES');}}}
 return out;}

// The folder inside the source that is this game: the one sharing the most top-level names with the game folder.
function matchRoot(source,gameDir){
 const own=new Set(fs.readdirSync(gameDir).map(n=>n.toLowerCase()).filter(n=>!n.startsWith('.megulit')));
 let best={dir:'',score:0};const stack=[{dir:source,depth:0}];
 while(stack.length){const {dir,depth}=stack.pop();let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
  const score=list.filter(e=>own.has(e.name.toLowerCase())&&(e.isDirectory()||DATA.test(e.name)||/\.exe$/i.test(e.name))).length;
  if(score>best.score)best={dir,score};
  if(depth<4)for(const e of list)if(e.isDirectory()&&!SKIP_DIR.test(e.name))stack.push({dir:path.join(dir,e.name),depth:depth+1});}
 return best.score>=2?best.dir:'';}

async function hashFile(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file,{highWaterMark:1<<20}))h.update(chunk);return h.digest('hex');}
async function same(a,b){const x=stat(a),y=stat(b);if(!x||!y||x.size!==y.size)return false;return (await hashFile(a))===(await hashFile(b));}

function run(cmd,args){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{windowsHide:true});let err='';p.stderr.on('data',d=>{err+=d;if(err.length>4000)err=err.slice(-4000);});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Object.assign(Error('IMPORT_EXTRACT_FAILED'),{detail:err.trim().slice(-300)})));});}

// Archives unpack into a staging folder next to the game (same drive, so apply only renames). A second preview or
// the apply that follows reuses it while the archive is unchanged.
async function unpack(gameDir,archive){
 const s=stat(archive);if(!s)throw Error('IMPORT_SOURCE_MISSING');
 const staging=path.join(gameDir,STAGING_DIR),stamp=path.join(staging,'.source.json'),key=JSON.stringify({archive:path.resolve(archive).toLowerCase(),size:s.size,mtime:s.mtimeMs});
 try{if(fs.readFileSync(stamp,'utf8')===key)return path.join(staging,'files');}catch{}
 await fsp.rm(staging,{recursive:true,force:true});await fsp.mkdir(path.join(staging,'files'),{recursive:true});
 const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
 try{if(/\.zip$/i.test(archive))await require('./zip-extract.cjs').extract(archive,path.join(staging,'files'));
  else await run(fs.existsSync(tar)?tar:'tar',['-xf',archive,'-C',path.join(staging,'files')]);}
 catch(error){await fsp.rm(staging,{recursive:true,force:true});throw /^IMPORT_/.test(error?.message)?error:Object.assign(Error('IMPORT_EXTRACT_FAILED'),{detail:String(error?.message||error).slice(0,300)});}
 await fsp.writeFile(stamp,key);return path.join(staging,'files');}

async function sourceRoot(gameDir,source){
 source=path.resolve(String(source||''));const s=stat(source);if(!s)throw Error('IMPORT_SOURCE_MISSING');
 const disc=require('./disc-image.cjs');
 let base=s.isDirectory()?source:ARCHIVE.test(source)?await unpack(gameDir,source):disc.IMAGE.test(source)?await discUnpack(gameDir,source):/\.exe$/i.test(source)?path.dirname(source):'';
 if(!base)throw Error('IMPORT_SOURCE_TYPE');
 if(path.resolve(base).toLowerCase()===path.resolve(gameDir).toLowerCase())throw Error('IMPORT_SOURCE_SAME_FOLDER');
 let root=matchRoot(base,gameDir),image='';
 /* E339: an archive holding a disc image (bin/cue, iso, img): read the disc and look again inside its files */
 if(!root&&!separateLauncher(base)){image=findImage(base);if(image){base=await discUnpack(gameDir,image);root=matchRoot(base,gameDir);}}
 return {root,base,image,staged:base.toLowerCase().startsWith(path.join(gameDir,STAGING_DIR).toLowerCase())};}

function findImage(dir){const stack=[[dir,2]];while(stack.length){const [d,depth]=stack.pop();let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}
  const cue=list.find(e=>e.isFile()&&/\.cue$/i.test(e.name));if(cue)return path.join(d,cue.name);
  const img=list.find(e=>e.isFile()&&/\.(iso|img|bin)$/i.test(e.name)&&(stat(path.join(d,e.name))?.size||0)>50e6);if(img)return path.join(d,img.name);
  for(const e of list)if(e.isDirectory()&&depth>0&&!e.name.startsWith('.'))stack.push([path.join(d,e.name),depth-1]);}
 return '';}
// The disc's files go to a staging folder next to the game; reused while the image is unchanged.
async function discUnpack(gameDir,image){
 const disc=require('./disc-image.cjs'),data=disc.imageOf(path.resolve(image)),s=stat(data);if(!s)throw Error('IMPORT_SOURCE_MISSING');
 const dir=path.join(gameDir,STAGING_DIR,'disc'),stamp=path.join(dir,'.source.json'),key=JSON.stringify({image:data.toLowerCase(),size:s.size,mtime:s.mtimeMs});
 try{if(fs.readFileSync(stamp,'utf8')===key)return path.join(dir,'files');}catch{}
 await fsp.rm(dir,{recursive:true,force:true});await fsp.mkdir(path.join(dir,'files'),{recursive:true});
 try{await disc.extract(data,path.join(dir,'files'));}catch(error){await fsp.rm(dir,{recursive:true,force:true});throw /^IMPORT_/.test(error?.message)?error:Object.assign(Error('IMPORT_DISC_UNREADABLE'),{detail:String(error?.message||error).slice(0,300)});}
 await fsp.writeFile(stamp,key);return path.join(dir,'files');}

/* E338 (user 2026-11-10, The Song of Saya: the Steam build is Saya_Steam.exe + *.npk, the 2003 Japanese release is saya.exe
   + *.pak): a Japanese release of another build shares no files with this one, so nothing can be swapped. It is set up
   as its own copy instead: an archive is unpacked next to itself (a folder or program is used where it is), and its
   game program becomes this game's Japanese program. */
function separateLauncher(base){
 const found=[];const scan=(dir,depth)=>{let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const e of list){const f=path.join(dir,e.name);if(e.isFile()&&/\.exe$/i.test(e.name)&&isLauncher(e.name)&&languageHint(e.name)!=='zh'&&(stat(f)?.size||0)>=20000)found.push(f);else if(e.isDirectory()&&depth>0&&!SKIP_DIR.test(e.name)&&!/(?:bak|backup|patch|补丁|備份|备份)/i.test(e.name))scan(f,depth-1);}};
 scan(base,3);found.sort((a,b)=>a.split(path.sep).length-b.split(path.sep).length||(stat(b)?.size||0)-(stat(a)?.size||0));return found[0]||'';}
function freeFolder(dir){let out=dir,n=2;while(fs.existsSync(out))out=dir+' ('+(n++)+')';return out;}
function separatePlan(gameDir,source,info){
 const exe=separateLauncher(info.base);
 /* A disc image (bin/cue, iso, mdf, ccd) holds the installer, not the game: it has to be mounted and installed first. */
 /* E348: an InstallShield setup (data1.hdr + dataN.cab) is unpacked directly into a folder next to the archive or image;
    the setup program never runs. Anything else that only installs (msi, other setups) still becomes a mountable .iso. */
 if(!exe){const hdr=require('./installshield.cjs').findHeader(info.base);if(hdr){let files=[];try{files=require('./installshield.cjs').gameFiles(hdr);}catch{}
  const launcher=files.filter(f=>/\.exe$/i.test(f.name)&&isLauncher(f.name)&&languageHint(f.name)!=='zh').sort((a,b)=>b.size-a.size)[0];
  if(launcher){const name=path.basename(source).replace(/\.(zip|7z|rar|iso|cue|bin|img)$/i,'').replace(/\s*\((?:bin|iso|img)[^)]*\)\s*$/i,'').replace(/[<>:"|?*]/g,'').trim()||'Japanese';
   return {root:path.dirname(hdr),cab:hdr,exe:path.join(launcher.dir.replace(/^[\\/]+/,''),launcher.name),target:freeFolder(path.join(path.dirname(path.resolve(source)),name)),move:true};}}}
 if(!exe&&info.image){const installer=fs.readdirSync(info.base).some(n=>/^(setup|install|autorun)\.(exe|inf)$/i.test(n))||walk(info.base,5000).some(r=>/\.(cab|msi)$/i.test(r));
  if(installer)return {installer:true,image:info.image,iso:/\.iso$/i.test(info.image)?info.image:path.join(path.dirname(path.resolve(source)),path.basename(info.image).replace(/\.(cue|bin|img)$/i,'')+'.iso'),from:require('./disc-image.cjs').imageOf(info.image)};}
 if(!exe){const disc=(()=>{const stack=[[info.base,2]];while(stack.length){const [d,depth]=stack.pop();let list;try{list=fs.readdirSync(d,{withFileTypes:true});}catch{continue;}for(const e of list){if(e.isFile()&&/\.(bin|cue|iso|mdf|mds|ccd|img|nrg)$/i.test(e.name)&&(e.name.match(/\.(cue|iso|mds|ccd|nrg)$/i)||(stat(path.join(d,e.name))?.size||0)>50e6))return true;if(e.isDirectory()&&depth>0)stack.push([path.join(d,e.name),depth-1]);}}return false;})();throw Error(disc?'IMPORT_DISC_IMAGE':'IMPORT_SOURCE_NO_MATCH');}
 const root=path.dirname(exe);
 const target=info.staged?freeFolder(path.join(path.dirname(path.resolve(source)),path.basename(source).replace(/\.(zip|7z|rar)$/i,'').replace(/[<>:"|?*]/g,'').trim()||'Japanese')):root;
 return {root,exe:path.relative(root,exe),target,move:info.staged};}

async function plan(gameDir,source){
 gameDir=path.resolve(String(gameDir||''));if(readManifest(gameDir))throw Error('ALREADY_IMPORTED');
 const info=await sourceRoot(gameDir,source),{root,staged}=info;if(!root)return {separate:separatePlan(gameDir,source,info)};const theirs=walk(root),ours=walk(gameDir);
 const mine=new Map(ours.map(r=>[r.toLowerCase(),r])),them=new Set(theirs.map(r=>r.toLowerCase()));
 const replace=[],add=[],remove=[];let addedBytes=0;
 for(const rel of theirs){const target=mine.get(rel.toLowerCase()),from=path.join(root,rel);
  if(target){if(!(await same(from,path.join(gameDir,target))))replace.push({file:target,from,size:stat(from).size});}
  else{const size=stat(from)?.size||0;addedBytes+=size;add.push({file:rel,from,size});}}
 for(const rel of ours)if(!them.has(rel.toLowerCase())&&OVERRIDE(path.basename(rel)))remove.push({file:rel,size:stat(path.join(gameDir,rel))?.size||0});
 if(addedBytes>MAX_ADDED)throw Error('IMPORT_TOO_LARGE');
 const launchers=theirs.filter(r=>!r.includes(path.sep)&&isLauncher(r)&&languageHint(r)!=='zh').sort((a,b)=>(stat(path.join(root,b))?.size||0)-(stat(path.join(root,a))?.size||0));
 return {gameDir,root,staged,replace,add,remove,exe:launchers[0]||''};}

async function preview(gameDir,source){
 const p=await plan(gameDir,source),list=a=>a.map(({file,size})=>({file,size}));
 if(p.separate?.installer){const s=p.separate;if(!fs.existsSync(s.iso))await require('./disc-image.cjs').toIso(s.from,s.iso);return {state:'installer',iso:s.iso};}
 if(p.separate)return {state:'separate',exe:p.separate.exe,target:p.separate.target,copy:p.separate.move};
 return {state:'preview',root:p.root,replace:list(p.replace),add:list(p.add),remove:list(p.remove),exe:p.exe,changes:p.replace.length+p.add.length+p.remove.length};}

async function place(from,to,staged){await fsp.mkdir(path.dirname(to),{recursive:true});if(staged){try{await fsp.rename(from,to);return;}catch{}}await fsp.copyFile(from,to);}

async function apply(gameDir,source,previousExe=''){
 const p=await plan(gameDir,source);
 if(p.separate?.installer)throw Error('IMPORT_DISC_INSTALLER');
 if(p.separate){const s=p.separate;
  if(s.cab){await fsp.mkdir(s.target,{recursive:true});try{await require('./installshield.cjs').extract(s.cab,s.target);}catch(error){await fsp.rm(s.target,{recursive:true,force:true});throw /^IMPORT_/.test(error?.message)?error:Object.assign(Error('IMPORT_INSTALLER_UNSUPPORTED'),{detail:String(error?.message||error).slice(0,300)});}await fsp.rm(path.join(path.resolve(gameDir),STAGING_DIR),{recursive:true,force:true});}
  else if(s.move){try{await fsp.rename(s.root,s.target);}catch{await fsp.cp(s.root,s.target,{recursive:true});}await fsp.rm(path.join(path.resolve(gameDir),STAGING_DIR),{recursive:true,force:true});}
  return {separate:true,installed:s.target,exe:path.join(s.target,s.exe),imported:0,replaced:0,added:0,removed:0};}
 if(!p.replace.length&&!p.add.length&&!p.remove.length)throw Error('NOTHING_TO_IMPORT');
 const backup=path.join(p.gameDir,BACKUP_DIR,'files'),done=[];
 const record=async(entry,file)=>{const s=stat(file);done.push({...entry,size:s?.size??0,mtime:s?.mtimeMs??0});};
 try{
  for(const r of p.replace){const target=path.join(p.gameDir,r.file),keep=path.join(backup,r.file);await fsp.mkdir(path.dirname(keep),{recursive:true});await fsp.rename(target,keep);done.push({file:r.file,kind:'replace',pending:true});await place(r.from,target,p.staged);done.pop();await record({file:r.file,kind:'replace'},target);}
  for(const r of p.remove){const target=path.join(p.gameDir,r.file),keep=path.join(backup,r.file);await fsp.mkdir(path.dirname(keep),{recursive:true});await fsp.rename(target,keep);done.push({file:r.file,kind:'remove'});}
  for(const r of p.add){const target=path.join(p.gameDir,r.file);await place(r.from,target,p.staged);await record({file:r.file,kind:'add'},target);}
 }catch(error){
  // Undo what was already done so a failed import never leaves the game half replaced.
  for(const e of done.reverse()){const target=path.join(p.gameDir,e.file),keep=path.join(backup,e.file);try{if(e.kind==='add')fs.rmSync(target,{force:true});else{if(e.kind==='replace'&&!e.pending)fs.rmSync(target,{force:true});fs.renameSync(keep,target);}}catch{}}
  fs.rmSync(path.join(p.gameDir,BACKUP_DIR),{recursive:true,force:true});throw error;}
 fs.writeFileSync(manifestPath(p.gameDir),JSON.stringify({version:1,adapter:ADAPTER,at:new Date().toISOString(),exe:p.exe,previousExe:path.basename(String(previousExe||'')),files:done},null,1));
 await fsp.rm(path.join(p.gameDir,STAGING_DIR),{recursive:true,force:true});
 return {imported:done.length,replaced:p.replace.length,added:p.add.length,removed:p.remove.length,exe:p.exe?path.join(p.gameDir,p.exe):''};}

// Files changed after the import (a game update, another tool) are left alone and reported.
function restore(gameDir){
 gameDir=path.resolve(String(gameDir||''));const m=readManifest(gameDir);if(!m||m.adapter!==ADAPTER)throw Error('NOT_APPLIED');
 const backup=path.join(gameDir,BACKUP_DIR,'files'),skipped=[];let restored=0;
 for(const e of [...m.files].reverse()){const target=path.join(gameDir,e.file),keep=path.join(backup,e.file),s=stat(target);
  const ours=e.kind==='remove'?!s:s&&s.size===e.size&&Math.abs(s.mtimeMs-e.mtime)<2;
  if(!ours||(e.kind!=='add'&&!stat(keep))){skipped.push(e.file);continue;}
  if(e.kind!=='remove')fs.rmSync(target,{force:true});
  if(e.kind!=='add')fs.renameSync(keep,target);
  restored++;}
 if(!skipped.length)fs.rmSync(path.join(gameDir,BACKUP_DIR),{recursive:true,force:true});
 return {restored,skipped,exe:m.previousExe?path.join(gameDir,m.previousExe):''};}

function cleanup(gameDir){fs.rmSync(path.join(path.resolve(String(gameDir||'')),STAGING_DIR),{recursive:true,force:true});}

module.exports={separateLauncher,preview,apply,restore,cleanup,readManifest,ADAPTER,_internal:{matchRoot,walk,OVERRIDE}};
