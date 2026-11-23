'use strict';
/* E592 one answer to "is this program a Chinese translation of the game next to it" for every tool (日文原版恢复, 语言 dialog,
   汉化脚本 row, automatic Japanese). User report 2026-11-15, Nitro+ みにくいモジカの子: the library holds 丑小鸭与文字祸.exe,
   a translation launcher that loads mojika_cn.dll / mojika_cn.mys beside the untouched Japanese mojika.exe and *.npk.
   The script reader saw Japanese .npk text and said "already Japanese", the patch search found no readable patch, and the
   restore check found nothing: three different answers. Signs used (files only, nothing is opened or changed):
   - the program name says Chinese (_chs, 汉化 ...), or
   - the folder carries a translation's own files (*_cn.dll/.mys/.pak, readme_cn, 汉化补丁备份, 原版备份, <exe>.org backups)
     and the program name is Chinese only (no kana, no Latin word), which a Japanese release never ships. */
const fs=require('node:fs'),path=require('node:path');
const {languageHint,launcherLanguage,isLauncher}=require('./launcher-language.cjs');
const ZH_TAG=/(?:^|[_. -])(?:cn|chs|cht|zh|sc|tc|chinese)(?=$|[_. -])/i;
const ZH_WORD=/汉化|漢化|中文|简体|繁體|簡體/;
const KANA=/[ぁ-ゟ゠-ヿ]/,HAN=/[一-鿿]/;
function marker(name,isDir){
 if(isDir)return ZH_WORD.test(name)||/^原版备份$|^原版備份$/.test(name);
 const stem=name.replace(/\.[^.]+$/,''),ext=path.extname(name).toLowerCase();
 if(/\.(?:exe)\.(?:org|orig|bak)$/i.test(name))return true;
 if(ZH_WORD.test(stem)&&!/\.exe$/i.test(name))return true;
 return ZH_TAG.test(stem)&&/^\.(?:dll|mys|pak|xp3|arc|dat|txt|npk|pck|bin|ini)$/.test(ext);
}
/* {translated, original?, evidence[]} for a library executable */
function inspect(executable){
 const exe=String(executable||''),dir=path.dirname(exe),name=path.basename(exe),out={translated:false,original:'',evidence:[]};
 if(!/\.exe$/i.test(name))return out;
 let list=[];try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 const hint=languageHint(name);
 if(hint==='ja')return out;
 const markers=list.filter(e=>marker(e.name,e.isDirectory())).map(e=>e.name);
 const chineseOnly=n=>{const st=n.replace(/\.exe$/i,'');return HAN.test(st)&&!KANA.test(st)&&!/[A-Za-z]{3}/.test(st);};
 const programs=list.filter(e=>e.isFile()&&isLauncher(e.name)&&e.name.toLowerCase()!==name.toLowerCase()).map(e=>e.name);
 const launchers=programs.filter(n=>!['zh','en'].includes(launcherLanguage(n,programs))&&!chineseOnly(n));
 const chineseName=chineseOnly(name);
 if(hint==='zh')out.evidence.push('name');
 else if(markers.length&&chineseName)out.evidence.push('chinese-name');
 if(!out.evidence.length)return out;
 out.translated=true;out.evidence.push(...markers.slice(0,6).map(m=>'file:'+m));
 /* the original: a launcher whose backup (.exe.org) the patch left, else the one other launcher */
 const backed=launchers.find(l=>list.some(e=>e.name.toLowerCase()===l.toLowerCase()+'.org'||e.name.toLowerCase()===l.toLowerCase()+'.orig'));
 const pick=backed||(launchers.length===1?launchers[0]:'');
 out.original=pick?path.join(dir,pick):'';
 return out;
}
module.exports={inspect,_internal:{marker}};
