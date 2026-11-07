// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path').win32;
const chineseSuffix=/(?:[_. -]+(?:chs|cht|cn|sc|tc|zh(?:[-_](?:cn|tw|hans|hant))?|chinese|简体中文|繁體中文|中文|汉化|漢化)|简体中文|繁體中文|汉化|漢化)$/i;
const japaneseSuffix=/[_. -]+(?:jp|ja|japanese|original|原版|日本語|日文)$/i;
function languageHint(name){
 const stem=path.basename(String(name||'')).replace(/\.(?:exe|bat|cmd)$/i,'');
 if(chineseSuffix.test(stem)||/汉化|漢化|中文|(?:^|[_. -])(?:chs|cht|cn|sc|tc|zh|chinese)(?=$|[_. -])/i.test(stem))return 'zh';
 if(/日文|日语|日本語|原版|(?:^|[_. -])(?:japanese|original|jp|ja)(?=$|[_. -])/i.test(stem))return 'ja';
 return '';
}
function isLauncher(name){
 const stem=path.basename(String(name||'')).replace(/\.exe$/i,'');
 return /\.exe$/i.test(name)&&!/^(?:unins|uninstall|setup|install|config|settings?|patch|update|vcredist|dxsetup|crashpad|unitycrashhandler)|(?:^|[_. -])(?:uninstall|installer|install|setup|config|settings?|patch|updater|update)(?=$|[_. -]|\d)|补丁|補丁|卸载|卸載|パッチ/i.test(stem)&&!/(?:chs|cht|cn|sc|tc|zh)patch(?=$|[_. -]|\d)/i.test(stem);
}
function family(file){
 const stem=path.basename(file).replace(/\.exe$/i,'');
 return stem.replace(chineseSuffix,'').replace(japaneseSuffix,'').replace(/[_. -]+$/,'').toLowerCase();
}
module.exports={languageHint,isLauncher,family};
