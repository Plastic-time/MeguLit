// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* diff-maker: read one probe (a folder, or a .mlfp the app uploaded: services/probe-full.cjs unpack) and tell which game, which
   exe and which engine it is. Nothing here runs or opens the game.
     version (exe) identity  the SHA-256 of the whole exe file: manifest.exe.sha256, or the manifest's files[] entry of the exe
                             (probe-full hashes every exe whole; its bin/ copy is a slimmed PE and is never hashed here)
     game identity           what every version of one work shares: the main script archive's hash, the script fingerprint,
                             the Steam app id, the VNDB id, the title (the game layer of the diff is keyed by these)
   Runtime samples: runtime/ (folder probes), other/runtime/ (a .mlfp unpacked before kind 'runtime' had its own folder), and a
   relay runtime bundle ({schema:'megulit.runtime-bundle',files:[{name,data base64}]}, gzip or not) passed as runtime=. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const Profiles=require('../../core/profiles/index.cjs'),GamePrint=require('../../core/game-print.cjs');
const ENGINE_OF_RECORD={krkr:'kirikiri',rpgm:'rpgmaker',renpy:'renpy',unity:'unity',web:'web'};
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));}catch{return null;}};
const readText=f=>{try{return fs.readFileSync(f,'utf8');}catch{return '';}};
const HEX64=/^[0-9a-f]{64}$/;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
/* the archive that holds the script: named like one, else the biggest archive (KiriKiri data.xp3, RPG Maker data/System.json) */
const SCRIPT_ARCHIVE=/(^|\/)[^/]*(script|scenario|scene|scn|story|text|msg|nss|mes|sdat)[^/]*\.(xp3|arc|pac|npa|dat|pfs|int|ypf|bin)$/i,ARCHIVE=/\.(xp3|arc|pac|npa|dat|pfs|int|ypf|cpz|bin|rpa|rgss3a|rgss2a|rgssad)$/i;

/* engine from what the probe saw, strongest first: the manifest's detected engine, the runtime samples, the file list */
function detectEngine(manifest,runtime,files){const why=[];
 const det=Profiles.engineId(manifest.engine||manifest.detected||'');if(det){why.push('manifest '+(manifest.engine||manifest.detected));return {engine:det,why};}
 const rec=/ToMe_CHARS engine=([a-z]+)/.exec(runtime.hookEvents+'\n'+(runtime.extra||''));if(rec&&ENGINE_OF_RECORD[rec[1]]){why.push('engine-draw records engine='+rec[1]);return {engine:ENGINE_OF_RECORD[rec[1]],why};}
 if(/\bkrkr page\b|choice aux (?:KiriKiri|TextRender|Krkr2wcs|tTVPNativeBaseBitmap)/.test(runtime.hookEvents)){why.push('runtime hooks are KiriKiri hooks');return {engine:'kirikiri',why};}
 const names=files.map(f=>String(f.path||f).toLowerCase().replace(/\\/g,'/'));
 if(names.some(n=>/(^|\/)(js\/rmmz_core\.js|www\/js\/rpg_core\.js|js\/rpg_core\.js)$/.test(n))){why.push('rpg_core.js / rmmz_core.js');return {engine:'rpgmaker',why};}
 if(names.some(n=>/\.xp3$/.test(n))){why.push('.xp3 archives');return {engine:'kirikiri',why};}
 return {engine:'',why:['no engine sign']};}

function listFiles(dir,base=dir,out=[]){let ents=[];try{ents=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of ents){const f=path.join(dir,e.name);if(e.isDirectory())listFiles(f,base,out);else out.push(path.relative(base,f).replace(/\\/g,'/'));}return out;}

/* a .mlfp -> its unpacked folder (once; the folder is reused) */
function unpackMlfp(file,work){const out=path.join(work,path.basename(file).replace(/\.mlfp$/i,''));if(!fs.existsSync(path.join(out,'manifest.json')))require('../../services/probe-full.cjs').unpack(file,out);return out;}
/* the relay's runtime bundle -> files under <dir>/runtime/ */
function applyBundle(file,dir){let buf=fs.readFileSync(file);if(buf[0]===0x1f&&buf[1]===0x8b)buf=zlib.gunzipSync(buf);const b=JSON.parse(buf.toString('utf8'));
 if(b.schema!=='megulit.runtime-bundle')throw new Error('not a megulit.runtime-bundle: '+file);const rt=path.join(dir,'runtime');fs.mkdirSync(rt,{recursive:true});
 for(const f of b.files||[]){const name=path.basename(String(f.name||''));if(!name)continue;const data=Buffer.from(String(f.data||''),'base64');if(f.sha256&&sha(data)!==f.sha256)throw new Error('runtime bundle item hash: '+name);fs.writeFileSync(path.join(rt,name),data);}
 return b;}

/* game identity of a probe: what the game layer of a diff is keyed by */
function gameIdentity(manifest,files,scriptsDir){const rel=f=>String(f.path||f).replace(/\\/g,'/');const withSha=files.filter(f=>HEX64.test(String(f.sha256||'')));
 const named=withSha.filter(f=>SCRIPT_ARCHIVE.test(rel(f))),archives=withSha.filter(f=>ARCHIVE.test(rel(f))).sort((a,b)=>(b.size||0)-(a.size||0));
 const rpgm=withSha.find(f=>/(^|\/)data\/system\.json$/i.test(rel(f)));
 const main=named[0]||rpgm||archives[0]||null;
 const lines=readJson(path.join(scriptsDir,'lines.json'));
 /* the script print: the original-text provider's source hash (what the app reports), else our fingerprint of the lines */
 const script=HEX64.test(String(lines?.source?.sha256||''))?lines.source.sha256:HEX64.test(String(lines?.fingerprint||''))?lines.fingerprint:Array.isArray(lines?.lines)||Array.isArray(lines)?fingerprint(Array.isArray(lines)?lines:lines.lines):'';
 return {title:String(manifest.title||''),archive:main?{path:rel(main),sha256:main.sha256}:null,script,steamAppId:manifest.steamAppId?String(manifest.steamAppId):'',vndb:/^v[1-9]\d{0,7}$/.test(String(manifest.vndb||''))?manifest.vndb:''};}
/* the script fingerprint: SHA-256 over the script's lines without white space (the same work in every exe version and patch) */
const fingerprint=lines=>sha('megulit.script/1|'+lines.map(s=>String(s||'').replace(/\s+/g,'')).join('\n'));

/* -> {dir, manifest, title, exe:{name,sha256}, game, versions, engine, engineWhy, runtime, scriptFiles, input} */
function load(src,{runtime:bundle='',work=process.env.MEGULIT_DIFF_WORK||'H:\\MeguLit-Work\\diff-maker\\unpacked'}={}){
 if(!fs.existsSync(src))throw new Error('probe not found: '+src);
 const dir=/\.mlfp$/i.test(src)&&fs.statSync(src).isFile()?unpackMlfp(src,work):src;
 if(bundle)applyBundle(bundle,dir);
 const manifest=readJson(path.join(dir,'manifest.json'))||{};
 const rt=[path.join(dir,'runtime'),path.join(dir,'other','runtime')].find(d=>fs.existsSync(d))||path.join(dir,'runtime');
 let extra='';try{for(const f of fs.readdirSync(rt).filter(f=>/\.log$/i.test(f)&&!/^(hook-events|reader-host)\.log$/i.test(f)).sort())extra+=readText(path.join(rt,f))+'\n';}catch{}
 const runtime={hookEvents:readText(path.join(rt,'hook-events.log')),readerHost:readText(path.join(rt,'reader-host.log')),extra,sample:readJson(path.join(rt,'sample.json')),
  shots:(()=>{try{return fs.readdirSync(rt).filter(f=>/^shot-\d+\.jpe?g$/i.test(f)).length;}catch{return 0;}})()};
 const files=Array.isArray(manifest.files)?manifest.files:[];
 const exePath=String(manifest.exe?.path||manifest.exe?.name||(typeof manifest.exe==='string'?manifest.exe:'')).replace(/\\/g,'/');
 const exeName=path.posix.basename(exePath).trim();
 let sha256=String(manifest.exe?.sha256||manifest.exeSha256||'').toLowerCase();
 if(!HEX64.test(sha256)){const f=files.find(f=>String(f.path||'').replace(/\\/g,'/').toLowerCase()===exePath.toLowerCase());if(HEX64.test(String(f?.sha256||'')))sha256=f.sha256;}
 if(!HEX64.test(sha256))throw new Error('probe has no full exe SHA-256 (manifest.exe.sha256 or the exe\'s files[] entry)');
 /* every exe the folder ships (language builds, a Chinese patch exe): versions the game layer covers */
 const versions=[{exe:exeName,sha256,probed:true},...files.filter(f=>/\.exe$/i.test(String(f.path||''))&&HEX64.test(String(f.sha256||''))&&f.sha256!==sha256).map(f=>({exe:path.posix.basename(String(f.path).replace(/\\/g,'/')),sha256:f.sha256,probed:false}))];
 const det=detectEngine(manifest,runtime,files);
 const title=String(manifest.title||'');
 const input={exe:exeName,title,engine:det.engine,steamAppId:manifest.steamAppId||'',files:files.map(f=>f.path||f)};
 const game=gameIdentity(manifest,files,path.join(dir,'scripts'));
 return {dir,manifest,title,exe:{name:exeName,sha256},game,versions,engine:det.engine,engineWhy:det.why,runtime,
  prints:printsOf({...(runtime.sample?.prints||{}),...(manifest.prints||{})},{exe:sha256,title,steam:game.steamAppId,vndb:game.vndb,script:game.script,engine:det.engine}),
  scriptFiles:listFiles(path.join(dir,'scripts')),window:manifest.runtime&&typeof manifest.runtime==='object'?manifest.runtime:{},input};}
/* the core/game-print.cjs prints of a probe: what the app measured (manifest.prints / runtime sample prints: head, pe, pack)
   plus what the probe itself says (exe, Steam, VNDB, script, title hash, engine); the probe's own exe hash always wins */
function printsOf(measured,{exe,title,steam,vndb,script,engine}){const own=GamePrint.check({exe,steam,vndb,script,title:GamePrint.titleHash(title),engine});
 return GamePrint.check({...GamePrint.check(measured),...Object.fromEntries(Object.entries(own).filter(([k])=>k!=='title'||!measured.title)),exe});}
/* the game identity the relay gives a new set of prints (relay/src/auto-profile.js gidFor): the strongest game print */
function gameId(prints){const k=GamePrint.GAME_KINDS.find(x=>prints[x]);return k?require('node:crypto').createHash('sha256').update('game|'+k+':'+prints[k]).digest('hex'):'';}
module.exports={load,detectEngine,gameIdentity,fingerprint,applyBundle,printsOf,gameId,readJson,readText};
