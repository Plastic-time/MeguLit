// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 Chinese-build guide (user: many players only own a 汉化 / 中文 build and do not know what to do; the small
   hint on the game page went unnoticed). When a library game is a Chinese-localized build, the game page shows one big
   card that runs three checks by itself and names the matching fix:
     a) can the game switch to Japanese itself: language keys in config / ini / save files, language folders and archives
        (ja / jp / japanese), a settings program, Steam's language option, an official multi-language release on VNDB;
     b) Japanese restore resources: a mirrored backup the patch switch can swap back, Japanese data the restore tool can
        bring back, a Japanese program next to the Chinese one (and whether the Chinese patch must go first), backup
        folders and files, the Chinese patch's uninstaller, a Japanese copy in a nearby folder, Japanese archives next to
        the game; online (cached, in the background) whether a Japanese-language patch for this work circulates;
     c) nothing found: where to look for the Japanese original, from a plain-text file the user writes (sites()).
   Everything here is generic: names, folders and file contents, never a per-game rule. Nothing is changed on disk except
   the cache and the user's copy of the sites file. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {languageHint,isLauncher,family}=require('../core/launcher-language.cjs');

const ZH_TAG=/汉化|漢化|中文|简体|簡體|繁体|繁體|简中|繁中|(?:^|[^a-z])(?:chs|cht|cn|sc|tc|zh|zh[-_]?(?:cn|tw|hans|hant)|chinese|schinese|tchinese)(?:[^a-z]|$)/i;
const JA_TOKEN=/日文|日语|日語|日本語|原版|生肉|(?:^|[^a-z])(?:ja|jp|jpn|japanese|ja[-_]jp)(?:[^a-z]|$)/i;
const JA_VALUE=/^(?:ja|jp|jpn|ja[-_]jp|japanese|日本語|日文|日语|nihongo)$/i;
const LANG_DIR=/^(?:ja|jp|jpn|ja[-_]jp|japanese|日本語|日文|日语)$/i, OTHER_LANG_DIR=/^(?:zh|cn|chs|cht|sc|tc|zh[-_]?(?:cn|tw|hans|hant)|chinese|schinese|tchinese|en|eng|english|中文|简体中文|繁體中文)$/i;
const ENGINE_ARCHIVE=/\.(?:xp3|pck|arc|pak|dat|npa|ypf|bin|pac|int|cpk|rpa|mpk|pfs|bmp\.arc|dbs|ain|snr|cab)$/i;
const PACKAGE=/\.(?:zip|7z|rar|iso|mdf|cue|lzh)$/i;
const CONFIG=/\.(?:ini|cfg|conf|config|json|xml|txt|sav|dat|setting|settings|properties|ya?ml|toml|tjs)$/i;
const SKIP_DIR=/^(?:\.megulit.*|megulit-original-backup|\$recycle\.bin|system volume information|node_modules|movie|movies|bgm|voice|sound|se|cg|image|images|video)$/i;
const BACKUP_DIR=/bak|backup|orig|原版|备份|備份|beifen|日文|日本語|japanese|^jp$|^ja$/i;
const BACKUP_FILE=/^(.+)\.(?:bak|orig|original|old|jp|ja|jpn|backup)$/i;
const MAX_CONFIG=128*1024, MAX_ENTRIES=400;

const isFile=f=>{try{return fs.statSync(f).isFile();}catch{return false;}};
const isDir=f=>{try{return fs.statSync(f).isDirectory();}catch{return false;}};
const list=dir=>{try{return fs.readdirSync(dir,{withFileTypes:true}).slice(0,MAX_ENTRIES);}catch{return [];}};
const key=f=>path.resolve(String(f||'')).toLowerCase();
const rel=(dir,f)=>path.relative(dir,f)||path.basename(f);
const kana=s=>/[぀-ヿ]/.test(s);

/* Walk a folder breadth-first to a small depth; skips media and MeguLit's own folders. */
function walk(dir,depth,visit){
 const queue=[[dir,0]];let seen=0;
 while(queue.length&&seen<3000){const [cur,d]=queue.shift();
  for(const e of list(cur)){seen++;const file=path.join(cur,e.name);
   if(e.isDirectory()){if(SKIP_DIR.test(e.name)||e.isSymbolicLink?.())continue;visit(file,e,d);if(d<depth)queue.push([file,d+1]);}
   else if(e.isFile())visit(file,e,d);}}
}

/* Name used to compare folders: release tags, versions and Chinese tags removed. */
function workName(name){
 return String(name||'').normalize('NFKC').toLowerCase()
  .replace(/[\[［【(（][^\]］】)）]{0,40}[\]］】)）]/g,' ')
  .replace(/(?:汉化|漢化|中文|简体|簡體|繁体|繁體|硬盘版|硬碟版|完全|版|补丁|補丁|日文|日语|日本語|原版|生肉)/g,' ')
  .replace(/(?:^|[^a-z])(?:chs|cht|cn|sc|tc|zh|chinese|ja|jp|jpn|japanese|v?\d+(?:\.\d+)+[a-z]?)(?=[^a-z]|$)/g,' ')
  .replace(/[^\p{L}\p{N}]+/gu,'');
}
function similar(a,b){
 const x=workName(a),y=workName(b);if(!x||!y)return false;
 if(x===y)return true;const [s,l]=x.length<=y.length?[x,y]:[y,x];
 if(s.length>=3&&l.includes(s))return true;
 let p=0;while(p<s.length&&s[p]===l[p])p++;return p>=Math.max(4,Math.ceil(s.length*.6));
}

/* ---- a) can the game switch to Japanese itself ------------------------------------------------- */
const KEY_RE=/(?:^|[\s{,;"'<])((?:[A-Za-z_][\w.\-]*?)?(?:lang(?:uage)?|locale|textlang)[\w.\-]*)["']?\s*(?:[:=]|\s*>)\s*["']?([\w\-一-鿿぀-ヿ]{1,24})/gim;
function configKeys(file){
 let size=0;try{size=fs.statSync(file).size;}catch{return [];}
 if(!size||size>MAX_CONFIG)return [];
 const buf=fs.readFileSync(file),binary=/\.(?:sav|dat)$/i.test(file)||buf.includes(0);
 let text=binary?buf.toString('latin1').replace(/[^\x20-\x7e\r\n]+/g,'\n'):buf.toString('utf8');
 if(!binary&&text.includes('�')){try{text=new TextDecoder('shift_jis').decode(buf);}catch{}}
 const out=[];KEY_RE.lastIndex=0;let m;
 while((m=KEY_RE.exec(text))&&out.length<4){const k=m[1],v=m[2];if(/hint|hook|font|path|file|dir|url|lcid|localeid|codepage/i.test(k))continue;out.push({key:k,value:v,japanese:JA_VALUE.test(v)});}
 return out;
}
function scanSwitch(dir,{exe='',appid=''}={}){
 const found=[],langDirs=[],otherDirs=[];
 walk(dir,2,(file,e,d)=>{
  const name=e.name;
  if(e.isDirectory()){if(LANG_DIR.test(name))langDirs.push(file);else if(OTHER_LANG_DIR.test(name))otherDirs.push(file);return;}
  if(ENGINE_ARCHIVE.test(name)&&JA_TOKEN.test(name.replace(ENGINE_ARCHIVE,''))&&!ZH_TAG.test(name)){found.push({kind:'lang-archive',path:file,rel:rel(dir,file)});return;}
  if(d===0&&/\.exe$/i.test(name)&&/^(?:config|setting|settings|launcher|gameconfig|syscfg|setup_?config|環境設定|設定|コンフィグ)/i.test(name)){found.push({kind:'config-tool',path:file,rel:rel(dir,file)});return;}
  if(CONFIG.test(name)&&(!/\.txt$/i.test(name)||/config|setting|option|lang|system|locale/i.test(name)))
   for(const k of configKeys(file))found.push({kind:'config-key',path:file,rel:rel(dir,file),key:k.key,value:k.value,japanese:k.japanese});
 });
 for(const d of langDirs)found.push({kind:'lang-folder',path:d,rel:rel(dir,d),multi:otherDirs.length>0});
 /* Steam: the language is chosen in the Steam client (Properties → Language); the manifest says the current one. */
 const m=/^(.*[\\/]steamapps)[\\/]common[\\/]/i.exec(String(exe||dir+path.sep));
 if(appid||m){let current='';const acf=m&&appid?path.join(m[1],'appmanifest_'+appid+'.acf'):'';
  try{if(acf)current=/"UserConfig"\s*\{[^}]*"language"\s+"([^"]*)"/i.exec(fs.readFileSync(acf,'utf8'))?.[1]||'';}catch{}
  found.push({kind:'steam',appid:String(appid||''),current});}
 return found.slice(0,12);
}

/* ---- b) Japanese restore resources on this PC ----------------------------------------------------- */
function launchers(dir,depth){
 const out=[];walk(dir,depth,(file,e)=>{if(e.isFile()&&isLauncher(e.name)&&!/^unins/i.test(e.name))out.push(file);});
 return out.filter(f=>!path.relative(dir,f).split(path.sep).slice(0,-1).some(p=>BACKUP_DIR.test(p)));
}
const japaneseProgram=f=>{const n=path.basename(f);return languageHint(n)==='ja'||kana(n)&&!ZH_TAG.test(n)&&languageHint(n)!=='zh';};
function scanRestore(dir,exe,{swap=null,restore=null,languages=null}={}){
 const found=[],own=key(exe);
 if(swap?.available&&swap.active!=='ja')found.push({kind:'swap',fix:'swap',rel:swap.backup||'',exe:swap.exe||''});
 if(restore?.state==='restorable')found.push({kind:'restore',fix:'restore',files:restore.files||0});
 /* Inno Setup numbers uninstallers in install order: unins000 is the game, a later one is usually the patch. */
 const top=list(dir).filter(e=>e.isFile()).map(e=>e.name);
 const unins=top.filter(n=>/^unins\d{3}\.exe$/i.test(n)).sort();
 const named=top.filter(n=>/\.exe$/i.test(n)&&/卸载|卸載|uninst|uninstall|アンインストール/i.test(n)&&(ZH_TAG.test(n)||/补丁|補丁|patch/i.test(n)));
 const uninstaller=named[0]||(unins.length>1?unins[unins.length-1]:'');
 const backups=top.filter(n=>{const m=BACKUP_FILE.exec(n);return m&&top.some(o=>o.toLowerCase()===m[1].toLowerCase());});
 const patchActive=languages?.issue==='CHINESE_PATCH_ACTIVE'||!!uninstaller||backups.length>0;
 /* A Japanese program beside the Chinese one */
 const jp=[...new Set([...(languages?.versions?.ja?[languages.versions.ja]:[]),...launchers(dir,1).filter(f=>key(f)!==own&&japaneseProgram(f)&&(!exe||family(f)===family(exe)||kana(path.basename(f))))])].filter(f=>key(f)!==own&&isFile(f));
 /* with a swap or restore offered, that one-click fix already brings the Japanese program back */
 if(!found.some(x=>x.fix==='swap'||x.fix==='restore'))for(const f of jp.slice(0,2))found.push(patchActive?{kind:'japanese-exe-blocked',path:f,rel:rel(dir,f),fix:uninstaller?'reveal':'',reveal:uninstaller?path.join(dir,uninstaller):''}:{kind:'japanese-exe',path:f,rel:rel(dir,f),fix:'exe'});
 if(uninstaller)found.push({kind:'uninstaller',path:path.join(dir,uninstaller),rel:uninstaller,fix:'reveal'});
 if(backups.length)found.push({kind:'backup-files',count:backups.length,sample:backups.slice(0,3),path:path.join(dir,backups[0]),fix:'reveal'});
 /* Backup folders the patch (or the user) left inside the game folder */
 const swapDir=swap?.backup?key(path.isAbsolute(swap.backup)?swap.backup:path.join(dir,swap.backup)):'';
 for(const e of list(dir))if(e.isDirectory()&&BACKUP_DIR.test(e.name)&&!SKIP_DIR.test(e.name)&&key(path.join(dir,e.name))!==swapDir){
  const sub=path.join(dir,e.name),files=list(sub).filter(x=>x.isFile()&&(ENGINE_ARCHIVE.test(x.name)||/\.exe$/i.test(x.name)));
  if(files.length)found.push({kind:'backup-folder',path:sub,rel:e.name,count:files.length,fix:'reveal'});}
 /* Packages next to the game or one folder up: 日文原版.zip, xxx_jp.7z */
 const parent=path.dirname(dir),title=path.basename(dir);
 for(const [where,entries] of [[dir,list(dir)],[parent,parent!==dir?list(parent):[]]])
  for(const e of entries)if(e.isFile()&&PACKAGE.test(e.name)&&!ZH_TAG.test(e.name)&&(where===dir?JA_TOKEN.test(e.name):similar(e.name.replace(PACKAGE,''),title)))
   found.push({kind:'package',path:path.join(where,e.name),rel:where===dir?e.name:path.join('..',e.name),fix:'reveal'});
 found.push(...nearby(dir,exe));
 return {found,patchActive};
}
/* A Japanese copy of the same work in a sibling folder: 千恋万花 [汉化] next to 千恋＊万花 */
function nearby(dir,exe){
 const parent=path.dirname(dir);if(parent===dir)return [];
 const out=[],title=path.basename(dir);
 for(const e of list(parent)){
  if(!e.isDirectory()||key(path.join(parent,e.name))===key(dir)||SKIP_DIR.test(e.name)||ZH_TAG.test(e.name)||!similar(e.name,title))continue;
  const sub=path.join(parent,e.name),progs=launchers(sub,1).filter(f=>languageHint(f)!=='zh'&&!ZH_TAG.test(path.basename(f)));
  if(!progs.length)continue;
  const pick=progs.find(f=>exe&&family(f)===family(exe))||progs.find(japaneseProgram)||progs[0];
  out.push({kind:'nearby',path:pick,dir:sub,rel:path.join('..',e.name,path.relative(sub,pick)),fix:'exe'});
  if(out.length>=2)break;
 }
 return out;
}

/* ---- is this a Chinese build ------------------------------------------------------------------------- */
function chineseSignals({exe,title,lib={},brief='',blocked=false,translatedOnly=false,swap=null}){
 const s=[];
 if(brief==='needs-japanese')s.push('script-chinese');
 if(translatedOnly)s.push('chinese-only-package');
 if(swap?.available&&swap.active!=='ja')s.push('patch-backup');
 if(lib.contentLanguage==='zh')s.push('content-zh');
 if(languageHint(exe)==='zh')s.push('exe-name');
 if(ZH_TAG.test(path.basename(path.dirname(String(exe||''))))||ZH_TAG.test(String(title||'')))s.push('folder-name');
 if(blocked&&s.length)s.push('launch-blocked');
 return s;
}
/* The script says Japanese, or a Japanese original was already applied: no guide. */
function handled(dir,brief){
 return brief==='patch'||brief==='machine'||['.megulit-japanese','.megulit-japanese-import'].some(n=>fs.existsSync(path.join(dir,n)));
}

/* ---- online: a Japanese-language patch / official multi-language release / Steam language ------------ */
const ONLINE_TTL=7*864e5, FAILED_TTL=864e5, running=new Map();
const cacheFile=root=>path.join(root,'data','config','cn-version-guide.json');
function readCache(root){try{return JSON.parse(fs.readFileSync(cacheFile(root),'utf8'))||{};}catch{return {};}}
function writeCache(root,k,value){const all=readCache(root);all[k]=value;const keys=Object.keys(all);if(keys.length>400)for(const old of keys.sort((a,b)=>(all[a].at||0)-(all[b].at||0)).slice(0,keys.length-400))delete all[old];
 fs.mkdirSync(path.dirname(cacheFile(root)),{recursive:true});fs.writeFileSync(cacheFile(root)+'.tmp',JSON.stringify(all));fs.renameSync(cacheFile(root)+'.tmp',cacheFile(root));}
const onlineOff=()=>process.env.MEGULIT_RELAY_BASE==='off'||process.env.MEGULIT_OFFLINE==='1';
function parseReleases(results){
 const langs=r=>(r.languages||[]).map(l=>String(l.lang||l));
 const jaPatches=results.filter(r=>r.patch&&langs(r).includes('ja')&&/japanese|日本語|日文|日语|日本语|language|語/i.test(String(r.title||'')+' '+String(r.alttitle||''))).map(r=>({title:String(r.title||''),fromEnglish:langs(r).includes('en')||results.some(o=>!o.patch&&o.official!==false&&langs(o).includes('en')&&!langs(o).includes('ja'))}));
 const multi=results.filter(r=>!r.patch&&r.official!==false&&langs(r).includes('ja')&&langs(r).some(l=>/^zh/.test(l))).map(r=>String(r.title||''));
 const japaneseOriginal=results.some(r=>!r.patch&&langs(r).includes('ja'));
 return {jaPatches:jaPatches.slice(0,3),multi:[...new Set(multi.filter(t=>!/trial|体験版|demo/i.test(t)))].slice(0,3),japaneseOriginal};
}
async function lookup({vndbId,appid},{fetch:fetcher=fetch,getText}={}){
 const out={at:Date.now(),ok:false,jaPatches:[],multi:[],japaneseOriginal:false,steamJapanese:null};let any=false;
 if(/^v?\d+$/.test(String(vndbId||'')))try{
  const r=await fetcher('https://api.vndb.org/kana/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['vn','=',['id','=',String(vndbId).startsWith('v')?vndbId:'v'+vndbId]],fields:'title,alttitle,patch,official,languages.lang',results:100}),signal:AbortSignal.timeout(12000)});
  if(r.ok){Object.assign(out,parseReleases((await r.json()).results||[]));any=true;}}catch{}
 if(/^\d+$/.test(String(appid||'')))try{
  const page=await (getText||require('./fast-fetch.cjs').getText)('https://store.steampowered.com/api/appdetails?appids='+appid+'&l=english&filters=basic',{fetch:fetcher,timeout:12000});
  if(page.ok){const d=JSON.parse(page.text)?.[appid]?.data;if(d){out.steamJapanese=/japanese/i.test(String(d.supported_languages||''));any=true;}}}catch{}
 out.ok=any;return out;
}
/* Cached result now; a missing or stale one is fetched in the background and the page asks again. */
function online(root,ident,options={}){
 const k=[ident.vndbId||'',ident.appid||''].join('|');
 if(k==='|')return {state:'none'};
 if(options.online===false||onlineOff())return {state:'off'};
 const hit=readCache(root)[k],now=options.now||Date.now();
 if(hit&&now-hit.at<(hit.ok?ONLINE_TTL:FAILED_TTL))return {state:'done',...hit};
 if(!running.has(k)){const job=lookup(ident,options).then(r=>{try{writeCache(root,k,r);}catch{}return r;}).finally(()=>running.delete(k));running.set(k,job);}
 return {state:'pending',...(hit||{}),job:running.get(k)};
}

/* ---- c) where to look: a plain-text file the user writes ------------------------------------------------
   Shipped as services/jp-original-sites.txt; the app reads the user's copy data/config/jp-original-sites.txt. The copy is
   made on first use and refreshed with a newer shipped text only while the user has not edited it. */
const SHIPPED=path.join(__dirname,'jp-original-sites.txt');
const sitesFile=root=>path.join(root,'data','config','jp-original-sites.txt');
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
function sites(root,{shipped=SHIPPED}={}){
 const file=sitesFile(root),mark=file+'.shipped';let text='';
 try{
  const base=isFile(shipped)?fs.readFileSync(shipped,'utf8'):'';
  const mine=isFile(file)?fs.readFileSync(file,'utf8'):null,copied=isFile(mark)?fs.readFileSync(mark,'utf8').trim():'';
  if(base&&(mine===null||mine!==base&&copied&&sha(mine)===copied)){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,base);fs.writeFileSync(mark,sha(base));text=base;}
  else text=mine??base;
 }catch{try{text=fs.readFileSync(shipped,'utf8');}catch{}}
 const lines=String(text).replace(/^﻿/,'').split(/\r?\n/).map(l=>l.trimEnd()).filter(l=>l.trim()&&!/^\s*#/.test(l));
 return {file,lines:lines.slice(0,30)};
}

/* ---- the whole guide for one library game ------------------------------------------------------------- */
function guide(db,root,id,options={}){
 const row=db.prepare('SELECT * FROM games WHERE id=? AND removed_at IS NULL').get(String(id));if(!row)throw Error('GAME_NOT_FOUND');
 let original={};try{original=JSON.parse(row.original||'{}');}catch{}
 const lib=original.library||{},exe=String(row.executable||'');
 if(!exe||!isFile(exe))return {chinese:false,reason:'GAME_MISSING'};
 const swapMod=require('./patch-swap.cjs'),dir=swapMod.gameDirectory(root,String(id),exe,lib.dir);
 const safe=(f,d=null)=>{try{return f();}catch{return d;}};
 const brief=options.brief??safe(()=>require('./original-text.cjs').brief(root,String(id)),'unknown');
 if(handled(dir,brief))return {chinese:false,reason:'HANDLED'};
 const blocked=options.blocked??safe(()=>require('./game-language.cjs').originalExecutable(db,String(id),root).blocked,false);
 const languages=options.languages??safe(()=>require('./game-language.cjs').inspect(db,String(id),root));
 const swap=languages?.swap||safe(()=>swapMod.status(root,String(id),dir,exe,lib.engine));
 const translatedOnly=safe(()=>require('../core/japanese-import.cjs').translatedOnly(dir,exe),false);
 const signals=chineseSignals({exe,title:row.title,lib,brief,blocked,translatedOnly,swap});
 /* a name alone is weak: a Japanese script read from the game wins */
 const chinese=signals.length>0&&!(signals.length===1&&signals[0]==='folder-name'&&brief!=='needs-japanese');
 if(!chinese)return {chinese:false,signals};
 const appid=String(lib.appid||'')||safe(()=>require('../core/library.cjs').steamAppidFor(exe),'');
 const vndbId=String(original.vndbManual||lib.vndbId||'');
 const restoreState=options.restore??safe(()=>require('../core/japanese-restore.cjs').detect(dir));
 const restore=scanRestore(dir,exe,{swap,restore:restoreState,languages});
 /* a nearby copy that is itself a Chinese build in the library is no Japanese original */
 const libraryChinese=file=>{const other=db.prepare('SELECT id,original FROM games WHERE removed_at IS NULL AND lower(executable)=lower(?)').get(file);if(!other)return false;let o={};try{o=JSON.parse(other.original||'{}');}catch{}
  return o.library?.contentLanguage==='zh'||safe(()=>require('./original-text.cjs').brief(root,String(other.id)))==='needs-japanese';};
 restore.found=restore.found.filter(x=>x.kind!=='nearby'||!libraryChinese(x.path));
 const net=online(root,{vndbId,appid},options);
 const {job,...netPublic}=net;
 const result={chinese:true,signals,gameDir:dir,executable:exe,appid,vndbId,
  switch:scanSwitch(dir,{exe,appid}),restore:restore.found,patchActive:restore.patchActive,online:netPublic,sites:sites(root,options)};
 result.nothing=!result.switch.some(x=>x.kind!=='steam'||net.steamJapanese)&&!result.restore.length&&!(net.jaPatches||[]).length&&!(net.multi||[]).length;
 if(options.wait)return job?job.then(()=>guide(db,root,id,{...options,wait:false})):result;
 return result;
}

/* Paths the page may show in Explorer: the game folder, its parent's direct children, and nothing else. */
function revealable(dir,file){const f=key(file),d=key(dir),p=key(path.dirname(dir));return !!file&&fs.existsSync(file)&&(f===d||f.startsWith(d+path.sep)||key(path.dirname(file))===p||f.startsWith(p+path.sep)&&f.split(path.sep).length<=p.split(path.sep).length+3);}

module.exports={guide,scanSwitch,scanRestore,chineseSignals,parseReleases,lookup,online,sites,sitesFile,similar,workName,revealable,SHIPPED};
