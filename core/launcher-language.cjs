// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),nativePath=require('node:path'),path=nativePath.win32;
const chineseSuffix=/(?:[_. -]+(?:chs|cht|cn|sc|tc|zh(?:[-_](?:cn|tw|hans|hant))?|chinese|简体中文|繁體中文|中文|汉化|漢化)|简体中文|繁體中文|汉化|漢化)$/i;
const japaneseSuffix=/[_. -]+(?:jp|ja|japanese|original|原版|日本語|日文)$/i;
const englishSuffix=/[_. -]+(?:en|eng|english)$/i;
function languageHint(name){
 const stem=path.basename(String(name||'')).replace(/\.(?:exe|bat|cmd)$/i,'');
 if(chineseSuffix.test(stem)||/汉化|漢化|中文|(?:^|[_. -])(?:chs|cht|cn|sc|tc|zh|chinese)(?=$|[_. -])/i.test(stem))return 'zh';
 if(/日文|日语|日本語|原版|(?:^|[_. -])(?:japanese|original|jp|ja)(?=$|[_. -])/i.test(stem))return 'ja';
 return '';
}
// Some vendor updaters append Update or Updata and a version directly to the game's name.
function versionedUpdaterStem(name){
 const base=path.basename(String(name||'')),suffix=/(?:update|updata)[_. -]*\d+(?:\.\d+)+\.exe$/i.exec(base);
 return suffix?base.slice(0,suffix.index).replace(/[_. -]+$/,''):null;
}
const isVersionedUpdater=name=>versionedUpdaterStem(name)!==null;
function isLauncher(name){
 const stem=path.basename(String(name||'')).replace(/\.exe$/i,'');
 return /\.exe$/i.test(name)&&!isVersionedUpdater(name)&&!/^(?:unins|uninstall|setup|install|config|settings?|patch|update|vcredist|dxsetup|crashpad|unitycrashhandler)|(?:^|[_. -])(?:uninstall|installer|install|setup|config|settings?|patch|updater|update)(?=$|[_. -]|\d)|补丁|補丁|卸载|卸載|パッチ/i.test(stem)&&!/(?:chs|cht|cn|sc|tc|zh)patch(?=$|[_. -]|\d)/i.test(stem);
}
const executableStem=file=>path.basename(String(file||'')).replace(/\.exe$/i,'');
const directory=file=>path.dirname(path.normalize(file)).toLowerCase();
const untaggedFamily=stem=>stem.replace(chineseSuffix,'').replace(japaneseSuffix,'').replace(/[_. -]+$/,'').toLowerCase();
function localLaunchers(dir){
 try{return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&isLauncher(e.name)).map(e=>nativePath.join(dir,e.name));}
 catch{return [];}
}
function englishFamily(file,launchers){
 const stem=executableStem(file),suffix=englishSuffix.exec(stem);
 if(!suffix?.index||!isLauncher(file)||languageHint(file))return '';
 const base=stem.slice(0,suffix.index).toLowerCase(),dir=directory(file);
 // Only a Japanese-tagged sibling or the exact unmarked base confirms an English variant.
 const siblings=launchers??localLaunchers(nativePath.dirname(file));
 return siblings.some(other=>{
  if(directory(other)!==dir||!isLauncher(other))return false;
  const hint=languageHint(other),name=executableStem(other);
  return hint==='ja'&&untaggedFamily(name)===base||!hint&&name.toLowerCase()===base&&!englishSuffix.test(name);
 })?base:'';
}
function family(file,launchers){return englishFamily(file,launchers)||untaggedFamily(executableStem(file));}
function launcherLanguage(file,launchers){return languageHint(file)||(englishFamily(file,launchers)?'en':'');}
function preferJapaneseLauncher(launchers,programs=launchers){
 const first=launchers.find(file=>languageHint(file)!=='zh');
 if(!first)return '';
 const stem=family(first,programs),dir=directory(first);
 const siblings=programs.filter(file=>directory(file)===dir&&family(file,programs)===stem);
 if(!siblings.some(file=>launcherLanguage(file,programs)==='en'))return first;
 return siblings.find(file=>languageHint(file)==='ja')||siblings.find(file=>!languageHint(file)&&executableStem(file).toLowerCase()===stem)||first;
}
module.exports={languageHint,isLauncher,isVersionedUpdater,versionedUpdaterStem,family,launcherLanguage,localLaunchers,preferJapaneseLauncher};
