// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E280 Japanese import (user report 2026-11-10, 装甲悪鬼村正 Chinese repack): some packages are Chinese only. The only
// game program is a translated build (Muramasa_chs.exe) and the script archive holds the translation, so there is no
// Japanese text left to restore. detect() names such a package so the Tools page can say so plainly; when the engine
// keeps its script in separate archives (Nitroplus .npa), the user can point at a Japanese original's program and the
// script archives plus that program are copied in. Every replaced file is backed up first and undo puts it back.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {languageHint,isLauncher}=require('./launcher-language.cjs');

const BACKUP_DIR='.megulit-japanese-import';
const TRANSLATED=/(汉化|漢化|中文|简体|簡體|繁体|繁體|(?:^|[-_ .])(chs|cht|cn|sc|tc|zh|chinese)(?=$|[-_ .]))/i;
// Nitroplus keeps the scenario in nss.npa and the start-up settings in system.npa; the rest (cg, sound, voice) has no text.
const ADAPTERS=[{id:'nitroplus-npa',script:/^(?:nss\d*|system)\.npa$/i,needs:/^nss\.npa$/i}];
const MAX_FILE=512*1024*1024;

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const names=dir=>{try{return fs.readdirSync(dir);}catch{return [];}};
const isFile=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
const chinese=name=>languageHint(name)==='zh'||TRANSLATED.test(path.basename(name).replace(/\.exe$/i,''));
// Game programs worth counting: real launchers above 200 KB (guides, uninstallers and tiny helpers are not the game).
function programs(dir){return names(dir).filter(n=>/\.exe$/i.test(n)&&isLauncher(n)).filter(n=>{try{return fs.statSync(path.join(dir,n)).size>=200000;}catch{return false;}});}
function adapterOf(dir){const list=names(dir);return ADAPTERS.find(a=>list.some(n=>a.needs.test(n)))||null;}
function manifestPath(dir){return path.join(dir,BACKUP_DIR,'manifest.json');}
function readManifest(dir){try{return JSON.parse(fs.readFileSync(manifestPath(dir),'utf8'));}catch{return null;}}

// A package is Chinese only when the selected program is a translated build and no other game program in the folder is.
function translatedOnly(dir,exe){
 const own=path.basename(String(exe||''));
 if(!own||!chinese(own))return false;
 return !programs(dir).some(n=>!chinese(n));
}

function detect(dir,exe){
 dir=path.resolve(String(dir||''));
 const manifest=readManifest(dir);
 if(manifest)return {state:'imported',adapter:manifest.adapter,files:manifest.files.length,exe:manifest.exe};
 if(!translatedOnly(dir,exe))return null;
 const adapter=adapterOf(dir);
 if(!adapter)return {state:'translated-only'};
 return {state:'importable',adapter:adapter.id,scripts:names(dir).filter(n=>adapter.script.test(n))};
}

function writeAtomic(file,data){const tmp=file+'.megulit-tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}

// source: the Japanese original's game program, picked by the user (usually in another folder or on another drive).
function plan(dir,exe,source){
 dir=path.resolve(String(dir||''));
 if(readManifest(dir))throw Error('ALREADY_IMPORTED');
 if(!translatedOnly(dir,exe))throw Error('NOT_TRANSLATED_ONLY');
 const adapter=adapterOf(dir);if(!adapter)throw Error('IMPORT_UNSUPPORTED');
 if(typeof source!=='string'||!path.isAbsolute(source)||!isFile(source)||!/\.exe$/i.test(source)||!isLauncher(source)||chinese(source))throw Error('IMPORT_SOURCE_NOT_JAPANESE');
 const from=path.dirname(path.resolve(source));
 if(from.toLowerCase()===dir.toLowerCase())throw Error('IMPORT_SOURCE_SAME_FOLDER');
 const sourceNames=names(from),scripts=sourceNames.filter(n=>adapter.script.test(n));
 if(!scripts.some(n=>adapter.needs.test(n)))throw Error('IMPORT_SOURCE_NO_SCRIPT');
 const files=[];
 for(const name of scripts){
  const src=path.join(from,name),target=path.join(dir,name),size=fs.statSync(src).size;
  if(size>MAX_FILE)throw Error('IMPORT_FILE_TOO_LARGE');
  const data=fs.readFileSync(src),current=isFile(target)?fs.readFileSync(target):null;
  if(current&&current.equals(data))continue;
  files.push({name,data,current});
 }
 const exeName=path.basename(source),exeTarget=path.join(dir,exeName),exeData=fs.readFileSync(source);
 if(isFile(exeTarget)&&!fs.readFileSync(exeTarget).equals(exeData))throw Error('IMPORT_EXE_CONFLICT');
 return {dir,adapter,files,exeName,exeTarget,exeData,addExe:!isFile(exeTarget)};
}

function apply(dir,exe,source){
 const p=plan(dir,exe,source),backup=path.join(p.dir,BACKUP_DIR);
 fs.mkdirSync(backup,{recursive:true});
 const entries=[];
 try{
  for(const f of p.files){
   if(f.current)fs.writeFileSync(path.join(backup,f.name),f.current);
   writeAtomic(path.join(p.dir,f.name),f.data);
   entries.push({file:f.name,originalSha256:f.current?sha(f.current):'',importedSha256:sha(f.data)});
  }
  if(p.addExe)writeAtomic(p.exeTarget,p.exeData);
 }catch(error){
  // Put back what was already written so a half import never leaves the game unreadable.
  for(const e of entries){const keep=path.join(backup,e.file),target=path.join(p.dir,e.file);try{if(e.originalSha256)writeAtomic(target,fs.readFileSync(keep));else fs.rmSync(target,{force:true});}catch{}}
  fs.rmSync(backup,{recursive:true,force:true});throw error;
 }
 const manifest={version:1,adapter:p.adapter.id,at:new Date().toISOString(),exe:p.exeName,addedExe:p.addExe,exeSha256:sha(p.exeData),previousExe:path.basename(String(exe||'')),files:entries};
 writeAtomic(manifestPath(p.dir),Buffer.from(JSON.stringify(manifest,null,1)));
 return {imported:entries.length,exe:p.exeTarget,previousExe:path.join(p.dir,manifest.previousExe)};
}

function restore(dir){
 dir=path.resolve(String(dir||''));
 const manifest=readManifest(dir);if(!manifest)throw Error('NOT_APPLIED');
 const backup=path.join(dir,BACKUP_DIR),skipped=[];let restored=0;
 for(const e of manifest.files){
  const target=path.join(dir,e.file),keep=path.join(backup,e.file),now=isFile(target)?sha(fs.readFileSync(target)):'';
  if(now===e.originalSha256){restored++;continue;}
  if(now!==e.importedSha256){skipped.push(e.file);continue;}
  if(e.originalSha256){if(!isFile(keep)){skipped.push(e.file);continue;}writeAtomic(target,fs.readFileSync(keep));}
  else fs.rmSync(target,{force:true});
  restored++;
 }
 const exeFile=path.join(dir,manifest.exe);
 if(manifest.addedExe&&isFile(exeFile)&&sha(fs.readFileSync(exeFile))===manifest.exeSha256)fs.rmSync(exeFile,{force:true});
 if(!skipped.length)fs.rmSync(backup,{recursive:true,force:true});
 return {restored,skipped,exe:path.join(dir,manifest.previousExe||'')};
}

module.exports={detect,apply,restore,translatedOnly,BACKUP_DIR};
