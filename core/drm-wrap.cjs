// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E-DRM (user 2026-11-15, 死に逝く君、館に芽吹く憎悪「死馆启动不了」): a game folder can hold a DRM-wrapped program next to the
   crack or translation launcher that really starts it. Started directly, the wrapped program asks for its licence runtime
   (SoftDenchi's SdWrap: 「ソフト電池ランタイムプログラムがインストールされている必要があります」) and quits. Live test: the
   launcher (打开游戏.exe) shows its own banner, then starts the protected engine program (bug02_yakata.exe), whose window
   is the game. So the record keeps the engine program (process, hook, profile) and starts it through the launcher.
   Any engine, any folder: evidence is read from the files only.
   Not evidence: KiriKiri Z's "-- SIGNATURE - SHA256/PSS/RSA --" .sig files (every file of a signed release has one). */
const fs=require('node:fs'),path=require('node:path');

const RULES=[
 {kind:'softdenchi',name:{zh:'软电池（SoftDenchi）正版验证',en:'SoftDenchi licence check',ja:'ソフト電池の認証'},needles:['soft-denchi','SoftDenchi','softdenchi','SdWrap']},
 {kind:'dmm',name:{zh:'DMM GAMES 正版验证',en:'DMM GAMES licence check',ja:'DMM GAMES の認証'},needles:['DMMGamePlayer','dmmgameplayer','DMM Game Player','dmmgame://']},
 {kind:'dlsite',name:{zh:'DLsite 正版验证',en:'DLsite licence check',ja:'DLsite の認証'},needles:['DLsiteDRM','DLsite DRM','dlsite-drm','DLsitePlay']},
 {kind:'steam',name:{zh:'Steam DRM',en:'Steam DRM',ja:'Steam の DRM'},needles:[]}
];
const RULE=Object.fromEntries(RULES.map(r=>[r.kind,r]));
const SCAN_MAX=48*1024*1024;
// Never launchers: installers, uninstallers, settings tools, runtimes.
const NOT_LAUNCHER=/^(unins|uninstall|setup|install|config|settings?|crash|unitycrashhandler|dxsetup|vc_?redist|dotnet|redist|notification_helper|steamerrorreporter|update|register|7z|python|pythonw)|(卸载|卸載|アンインストール|設定|设置|设定|installer|fontinst)/i;
const VERSIONED_UPDATER=/updat(?:e(?:r)?|a)[-_. ]?v?\d+(?:[._-]\d+)*\.exe$/i;
// Crack / translation launcher names (打开游戏.exe, 启动游戏.exe, Loader.exe, *_crack.exe, 2DJGAME.exe).
/* The player-facing starter (打开游戏.exe) ranks above a crack group's helper (2DJGAME.exe): live test, the helper alone shows 起動エラー(SRP). */
const LAUNCHER_FIRST=/(打开游戏|打開遊戲|開啟遊戲|开始游戏|開始遊戲|启动游戏|啟動遊戲|游戏启动|ゲーム起動|ゲーム開始|^启动|^起動|^start(game)?$|^play$)/i;
const LAUNCHER_NAME=/(启动|啟動|起動|loader|launch|crack|破解|nodvd|免dvd|2dj|start)/i;
const TRANSLATED_NAME=/(汉化|漢化|中文|简体|簡體|繁体|繁體|(?:^|[-_ .])(chs|cht|cn|sc|tc|zh|chinese)(?=$|[-_ .]))/i;

const cache=new Map();
function stat(file){try{const s=fs.statSync(file);return s.isFile()?s:null;}catch{return null;}}
function readHead(file,size){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(Math.min(size,SCAN_MAX));fs.readSync(fd,b,0,b.length,0);return b;}finally{fs.closeSync(fd);}}
function sections(b){try{if(b.readUInt16LE(0)!==0x5a4d)return null;const pe=b.readUInt32LE(0x3c);if(b.readUInt32LE(pe)!==0x4550)return null;const n=b.readUInt16LE(pe+6),opt=b.readUInt16LE(pe+20),out=[];for(let i=0,o=pe+24+opt;i<n;i++,o+=40)out.push(b.slice(o,o+8).toString('latin1').replace(/\0+$/,''));return out;}catch{return null;}}
/* What the program's own bytes say: the DRM it carries (as ASCII or UTF-16 text), the programs it names, its PE sections. */
function contents(file){
 const s=stat(file);if(!s)return null;const id=file.toLowerCase(),stamp=s.size+':'+s.mtimeMs,hit=cache.get(id);if(hit&&hit.stamp===stamp)return hit.value;
 let value=null;try{const b=readHead(file,s.size),secs=sections(b);if(secs){
  let kind='';for(const r of RULES){if(r.needles.some(n=>b.includes(Buffer.from(n,'latin1'))||b.includes(Buffer.from(n,'utf16le')))){kind=r.kind;break;}}
  if(!kind&&secs.includes('.bind'))kind='steam';
  const text=b.toString('latin1')+'\n'+b.toString('utf16le')+'\n'+b.subarray(1).toString('utf16le'),names=new Set();
  for(const m of text.matchAll(/([A-Za-z0-9_\-. ぀-ヿ一-鿿]{1,80}\.exe)/gi))names.add(path.basename(m[1].trim()).toLowerCase());
  value={size:s.size,kind,names:[...names],sections:secs};}}catch{value=null;}
 cache.set(id,{stamp,value});return value;
}
/* Every program in the folder, classified:
   stub      the DRM wrapper itself (SdWrap *_srp.exe, or a small starter that names one)
   protected the engine program that needs the wrapper (<exe>.emb or <base>_srp.exe beside it, or DRM text inside)
   clean     anything else */
function classify(dir){
 let names=[];try{names=fs.readdirSync(dir);}catch{return [];}
 const lower=new Set(names.map(n=>n.toLowerCase()));
 const exes=names.filter(n=>/\.exe$/i.test(n)).map(n=>{const file=path.join(dir,n),c=contents(file);return c?{name:n,file,size:c.size,c}:null;}).filter(Boolean);
 // SdWrap is always the wrapper, never the game; DMM / DLsite text sits in the protected game program itself.
 const stubs=new Set(exes.filter(e=>e.c.kind==='softdenchi'&&(e.size<4*1024*1024||/_srp\.exe$/i.test(e.name))).map(e=>e.name.toLowerCase()));
 return exes.map(e=>{const base=e.name.replace(/\.exe$/i,'').toLowerCase();let role='clean',kind='',reason='';
  if(stubs.has(e.name.toLowerCase())){role='stub';kind=e.c.kind;reason='text';}
  else if(e.c.names.some(x=>x!==e.name.toLowerCase()&&stubs.has(x))&&e.size<4*1024*1024){role='stub';kind=exes.find(o=>stubs.has(o.name.toLowerCase())&&e.c.names.includes(o.name.toLowerCase()))?.c.kind||'softdenchi';reason='starts '+e.c.names.find(x=>stubs.has(x));}
  else if(lower.has(e.name.toLowerCase()+'.emb')){role='protected';kind='softdenchi';reason=e.name+'.emb';}
  else if(lower.has(base+'_srp.exe')){role='protected';kind='softdenchi';reason=base+'_srp.exe';}
  else if(e.c.kind){role='protected';kind=e.c.kind;reason='text';}
  return {name:e.name,file:e.file,size:e.size,role,kind,reason};});
}
const usable=(e,allowTranslated)=>e.role==='clean'&&!NOT_LAUNCHER.test(e.name)&&!VERSIONED_UPDATER.test(e.name)&&(allowTranslated||!TRANSLATED_NAME.test(e.name.replace(/\.exe$/i,'')))&&e.size>=20000;
/* A small clean program beside a protected one starts it (crack / translation launcher); a clean one of about the same
   size is the engine program itself with the protection removed. Named launchers first, then the larger file. */
function launchersFor(list,target,allowTranslated){
 return list.filter(e=>usable(e,allowTranslated)&&e.size<target.size*.5).map(e=>({e,score:(LAUNCHER_FIRST.test(e.name.replace(/\.exe$/i,''))?8:LAUNCHER_NAME.test(e.name)?4:0)+(TRANSLATED_NAME.test(e.name)?1:0)}))
  .sort((a,b)=>b.score-a.score||b.e.size-a.e.size).map(x=>x.e);
}
function replacementFor(list,target,allowTranslated){return list.filter(e=>usable(e,allowTranslated)&&e.size>=target.size*.5).sort((a,b)=>b.size-a.size)[0]||null;}
/* The program to record and the one to start for `exe`. Returns null when nothing about it is wrapped.
   {kind, name:{zh,en,ja}, executable, launchVia, original, wrapped, changed, launcherNames, alternatives} */
function plan(exe,{allowTranslated=true,source='',savedDrm}={}){
 exe=String(exe||'');if(!/\.exe$/i.test(exe)||!stat(exe))return null;
 const dir=path.dirname(exe),selected=path.basename(exe);
 // Repair an old automatic correction only while its original launcher and wrapper still match.
 if(VERSIONED_UPDATER.test(selected)&&typeof savedDrm?.from==='string'&&typeof savedDrm?.wrapped==='string'&&
    path.isAbsolute(savedDrm.from)&&path.resolve(path.dirname(savedDrm.from)).toLowerCase()===path.resolve(dir).toLowerCase()){
  const restored=plan(savedDrm.from,{allowTranslated,source});
  if(restored&&restored.kind===savedDrm.kind&&path.resolve(restored.wrapped).toLowerCase()===path.resolve(savedDrm.wrapped).toLowerCase()&&
     restored.ignoredUpdaters?.some(name=>name.toLowerCase()===selected.toLowerCase())){
   return {...restored,original:exe,changed:true,restoredFromUpdater:true};
  }
 }
 const list=classify(dir),self=list.find(e=>e.name.toLowerCase()===selected.toLowerCase());if(!self)return null;
 const ignoredUpdaters=list.filter(e=>e.role==='clean'&&VERSIONED_UPDATER.test(e.name)).map(e=>e.name);
 const engines=list.filter(e=>e.role==='protected').sort((a,b)=>b.size-a.size);
 let target=null;
 if(self.role==='protected')target=self;
 else if(self.role==='stub'){const named=engines.find(e=>contents(self.file)?.names.some(n=>n.replace(/_srp\.exe$/,'.exe')===e.name.toLowerCase()));target=named||engines[0]||null;
  if(!target){const clean=list.filter(e=>usable(e,allowTranslated)).sort((a,b)=>b.size-a.size)[0];const kind=self.kind;return {kind,name:RULE[kind]?.name||RULE.softdenchi.name,original:exe,wrapped:exe,executable:clean?clean.file:exe,launchVia:'',changed:!!clean,launcherNames:[],alternatives:clean?[clean.name]:[],ignoredUpdaters};}}
 else if(engines.length&&self.size<engines[0].size*.5&&usable(self,true)){target=engines[0];
  return {kind:target.kind,name:RULE[target.kind]?.name,original:exe,wrapped:target.file,executable:target.file,launchVia:exe,changed:true,launcherNames:[self.name],alternatives:[]};}
 if(!target)return null;
 // A Steam game is started through Steam, which handles its own DRM.
 if(target.kind==='steam'&&source==='steam')return null;
 const replacement=replacementFor(list,target,allowTranslated),launchers=launchersFor(list,target,allowTranslated);
 const base={kind:target.kind,name:RULE[target.kind]?.name,original:exe,wrapped:target.file,launcherNames:launchers.map(e=>e.name),alternatives:[replacement,...launchers].filter(Boolean).map(e=>e.name),ignoredUpdaters};
 if(replacement)return {...base,executable:replacement.file,launchVia:'',changed:true};
 if(launchers.length)return {...base,executable:target.file,launchVia:launchers[0].file,changed:true};
 return {...base,executable:exe,launchVia:'',changed:false};
}
/* Is this program DRM-wrapped (stub or protected)? Used by the library scan to rank candidates. */
function roleOf(exe){const list=classify(path.dirname(exe));const e=list.find(x=>x.name.toLowerCase()===path.basename(exe).toLowerCase());return e?{role:e.role,kind:e.kind}:{role:'clean',kind:''};}
/* Words for a launch that failed: why, and what to choose instead. */
function hint(p,locale='zh'){
 if(!p)return '';const L=locale==='zh'?0:locale==='ja'?2:1;
 /* E-SteamOwned: Steam's own wrapper (SteamStub) is no crack problem: the game needs Steam running and the account that owns it */
 if(p.kind==='steam'){const w=path.basename(p.wrapped||p.original||'');return [`${w} 是 Steam 版，需要 Steam 在运行并登录购买它的账号才能启动（这是 Steam 自带的正版保护，不用找破解）。请先打开 Steam，确认在 Steam 库里能正常启动；也可以直接从 Steam 启动游戏，再在 MeguLit 按 Alt+M 绑定窗口`,`${w} is a Steam build: Steam must be running and signed in to the account that owns it (this is Steam's own licence check, no crack needed). Open Steam and check the game starts from the Steam library, or start it from Steam and press Alt+M in MeguLit to bind its window`,`${w} は Steam 版で、購入したアカウントで Steam を起動・ログインしている必要があります（Steam 標準の認証です）。Steam を開いてライブラリから起動できるか確認するか、Steam から起動して MeguLit で Alt+M を押してウィンドウを紐付けてください`][L];}
 const name=(p.name||RULE.softdenchi.name)[['zh','en','ja'][L]],wrapped=path.basename(p.wrapped||p.original||'');
 const via=p.launchVia?path.basename(p.launchVia):'',alt=p.alternatives?.[0]||'';
 if(via)return [`${wrapped} 需要${name}，已改用同目录的 ${via} 启动。如果它也弹窗报错，请在「编辑作品」里换成其他能直接双击打开的程序`,`${wrapped} needs the ${name}, so MeguLit started it through ${via} in the same folder. If that also fails, choose another program that opens by double-click under Edit game`,`${wrapped} は${name}が必要なため、同じフォルダーの ${via} から起動しました。それも失敗する場合は「作品を編集」でダブルクリックで起動できる実行ファイルを選んでください`][L];
 if(alt)return [`${wrapped} 需要${name}，没装就会退出。请在「编辑作品」里换成 ${alt}`,`${wrapped} needs the ${name} and quits without it. Choose ${alt} under Edit game`,`${wrapped} は${name}が必要で、ないと終了します。「作品を編集」で ${alt} を選んでください`][L];
 return [`${wrapped} 需要${name}，没装就会退出，同目录也没找到破解或汉化启动器。请安装对应的正版运行库，或在「编辑作品」里换成能直接双击打开的程序`,`${wrapped} needs the ${name} and quits without it; no crack or translation launcher was found beside it. Install the licence runtime, or choose a program that opens by double-click under Edit game`,`${wrapped} は${name}が必要で、ないと終了します。同じフォルダーに代わりの起動ファイルもありません。認証ランタイムを入れるか、「作品を編集」で起動できるファイルを選んでください`][L];
}
module.exports={plan,classify,roleOf,hint,RULES,_internal:{contents,cache}};
