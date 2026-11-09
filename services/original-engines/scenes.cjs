// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E280 script engines read as a set of scene files (user, 2026-11-10: zero-latency bilingual for more engines).
// Each engine lists the running game's scene files and turns one file into text lines plus anchors (the parts a
// translation keeps unchanged: commands, file names, labels). A patch file with the same name lines up with the running
// one when it has as many lines and the same anchors.
//   kirikiri  plain XP3 archives and loose .ks files (encrypted archives are skipped: their filters are per game)
//   artemis   PFS archives (pf6 plain, pf8 XOR with the SHA-1 of the index) and loose .ast files
//   renpy     game/*.rpy; a patch is a tl/<language> folder of old/new pairs, matched by the original text
//   siglus    Steam dat/*.dbs language tables (Summer Pockets): Japanese column + the Chinese column
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const xp3=require('./xp3.cjs');
const KANA=/[ぁ-ゖァ-ヺ]/g;
function decode(buf){
 if(buf[0]===0xff&&buf[1]===0xfe)return buf.toString('utf16le',2);
 if(buf[0]===0xfe&&buf[1]===0xff){const b=Buffer.from(buf.subarray(2));b.swap16();return b.toString('utf16le');}
 if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.toString('utf8',3);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{}
 const score=enc=>{const t=new TextDecoder(enc).decode(buf);return {t,bad:(t.match(/�/g)||[]).length,kana:(t.match(KANA)||[]).length};};
 const sj=score('shift_jis'),gbk=score('gbk');return sj.bad<gbk.bad||sj.bad===gbk.bad&&sj.kana>=gbk.kana?sj.t:gbk.t;
}
const ascii=t=>/^[\x20-\x7e]*$/.test(t);
const stat=file=>{try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}};
function walk(dir,depth,test,out=[]){let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of entries){const full=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(save|savedata|\.megulit)/i.test(e.name))walk(full,depth-1,test,out);}else if(e.isFile()&&test(e.name,full))out.push(full);}return out;}

// ---- KiriKiri -------------------------------------------------------------------------------------------------
// Text lines are what is left of a line after its tags; command lines (@...), labels (*...) and tag-only lines are
// anchors when they hold no text a translation would change.
function parseKs(buf){
 const lines=[],anchors=[];
 for(const raw of decode(buf).split(/\r?\n/)){const t=raw.trim();if(!t||t[0]===';')continue;
  if(t[0]==='@'||t[0]==='*'){if(ascii(t))anchors.push(t);continue;}
  const text=t.replace(/\[[^\]]*\]/g,'').trim();
  if(!text){if(ascii(t))anchors.push(t);continue;}
  lines.push(text);}
 return {lines,anchors};
}
function xp3Scenes(file,test){let t;try{t=xp3.list(file);}catch{return [];}if(!t)return [];
 return t.files.filter(e=>!e.encrypted&&test(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>xp3.read(file,e)}));}
const KS=n=>/\.ks$/i.test(n);
const kirikiri={
 id:'kirikiri',hint:'*.ks（或 patch.xp3）',
 // Later archives override earlier ones, as the engine loads them (data < patch < patch2 ...).
 scenes(dir){const out=new Map();
  const archives=fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)).sort((a,b)=>rank(a)-rank(b)||a.localeCompare(b));
  for(const a of archives)for(const s of xp3Scenes(path.join(dir,a),KS))out.set(s.name.toLowerCase(),s);
  for(const file of walk(dir,2,KS))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)).flatMap(a=>xp3Scenes(path.join(dir,a),KS)),
 sources:dir=>[...fs.readdirSync(dir).filter(f=>/\.xp3$/i.test(f)).map(f=>path.join(dir,f)),...walk(dir,2,KS)],
 parse:parseKs,test:KS,
};
function rank(name){const m=name.toLowerCase().match(/^patch(\d*)\.xp3$/);return m?1+(+m[1]||0):0;}

// ---- Artemis --------------------------------------------------------------------------------------------------
function pfsList(file){
 const fd=fs.openSync(file,'r');
 try{const head=Buffer.alloc(7);fs.readSync(fd,head,0,7,0);if(head.toString('latin1',0,2)!=='pf'||!'68'.includes(String.fromCharCode(head[2])))return null;
  const size=head.readUInt32LE(3),index=Buffer.alloc(size);fs.readSync(fd,index,0,size,7);
  const pf8=head[2]===0x38,key=pf8?crypto.createHash('sha1').update(index).digest():null,count=index.readUInt32LE(0),files=[];let p=4;
  for(let i=0;i<count&&p+4<=index.length;i++){const len=index.readUInt32LE(p);p+=4;const name=new TextDecoder('utf-8').decode(index.subarray(p,p+len));p+=len;p+=4;const offset=index.readUInt32LE(p),length=index.readUInt32LE(p+4);p+=8;files.push({name,offset,size:length});}
  return {files,key};
 }finally{fs.closeSync(fd);}
}
function pfsRead(file,entry,key){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(entry.size);fs.readSync(fd,b,0,entry.size,entry.offset);if(key)for(let i=0;i<b.length;i++)b[i]^=key[i%20];return b;}finally{fs.closeSync(fd);}}
const AST=n=>/\.ast$/i.test(n);
function pfsScenes(file){let t;try{t=pfsList(file);}catch{return [];}if(!t)return [];return t.files.filter(e=>AST(e.name)).map(e=>({name:path.basename(e.name.replace(/\\/g,'/')),read:()=>pfsRead(file,e,t.key)}));}
// Quoted strings in file order: the ones with any non-ASCII character are text, the rest are anchors.
function parseAst(buf){const lines=[],anchors=[],text=decode(buf),re=/"((?:[^"\\]|\\.)*)"/g;let m;
 while((m=re.exec(text))){const s=m[1].replace(/\\(.)/g,'$1');if(ascii(s))anchors.push(s);else lines.push(s);}
 return {lines,anchors};}
const isPfs=f=>/\.pfs(?:\.\d+)?$/i.test(f);
const artemis={
 id:'artemis',hint:'*.ast（或 .pfs）',
 scenes(dir){const out=new Map();for(const a of fs.readdirSync(dir).filter(isPfs).sort())for(const s of pfsScenes(path.join(dir,a)))out.set(s.name.toLowerCase(),s);
  for(const file of walk(dir,3,AST))out.set(path.basename(file).toLowerCase(),{name:path.basename(file),read:()=>fs.readFileSync(file)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>fs.readdirSync(dir).filter(isPfs).flatMap(a=>pfsScenes(path.join(dir,a))),
 sources:dir=>[...fs.readdirSync(dir).filter(isPfs).map(f=>path.join(dir,f)),...walk(dir,3,AST)],
 parse:parseAst,test:AST,
};

// ---- Ren'Py ---------------------------------------------------------------------------------------------------
const RPY=n=>/\.rpy$/i.test(n);
const SAY=/^\s*(?:[A-Za-z_][\w.]*\s+)?(?:[A-Za-z_][\w.]*\s+)*"((?:[^"\\]|\\.)*)"\s*(?:with\s+\w+)?\s*$/;
const unq=s=>s.replace(/\\n/g,'\n').replace(/\\(.)/g,'$1');
function parseRpy(buf){const lines=[],anchors=[];let skip=false;
 for(const raw of decode(buf).split(/\r?\n/)){
  if(/^translate\s/.test(raw)){skip=true;continue;}if(skip&&/^\S/.test(raw))skip=false;if(skip)continue;
  const t=raw.trim();if(!t||t[0]==='#')continue;
  const m=raw.match(SAY);if(m&&!/^\s*(?:old|new|define|default|\$|image|play|show|scene|jump|call)\b/.test(raw)){lines.push(unq(m[1]));continue;}
  if(ascii(t))anchors.push(t);}
 return {lines,anchors};}
const gameDir=dir=>fs.existsSync(path.join(dir,'game'))?path.join(dir,'game'):dir;
const outsideTl=file=>!/[\\/]tl[\\/]/i.test(file);
// Old/new pairs of every language folder under tl/: dialogue blocks (# who "old" then who "new") and string blocks.
function tlPairs(files){const langs=new Map();
 for(const file of files){const m=file.match(/[\\/]tl[\\/]([^\\/]+)[\\/]/i);if(!m||/^none$/i.test(m[1]))continue;const pairs=langs.get(m[1])||new Map();langs.set(m[1],pairs);
  let text;try{text=decode(fs.readFileSync(file));}catch{continue;}let old=null;
  for(const raw of text.split(/\r?\n/)){const t=raw.trim();
   let m2=t.match(/^#\s*(?:[A-Za-z_][\w.]*\s+)*"((?:[^"\\]|\\.)*)"/);if(m2){old=unq(m2[1]);continue;}
   m2=t.match(/^old\s+"((?:[^"\\]|\\.)*)"/);if(m2){old=unq(m2[1]);continue;}
   m2=t.match(/^(?:new\s+|(?:[A-Za-z_][\w.]*\s+)*)"((?:[^"\\]|\\.)*)"/);if(m2&&old!==null){pairs.set(old,unq(m2[1]));old=null;}}}
 return langs;}
const renpy={
 id:'renpy',hint:'game\\tl\\<语言> 文件夹',
 scenes(dir){const g=gameDir(dir);return walk(g,4,RPY).filter(outsideTl).sort().map(file=>({name:path.relative(g,file).toLowerCase(),read:()=>fs.readFileSync(file)}));},
 archives:()=>[],sources:dir=>walk(gameDir(dir),4,RPY).filter(outsideTl),
 parse:parseRpy,test:RPY,
 // The patch: the tl language whose translations are most Chinese; every running line is looked up by its text.
 patchLines(base,found){
  const files=found.dirs.flatMap(d=>fs.readdirSync(d).filter(RPY).map(f=>path.join(d,f)));
  let best=null,bestScore=0;
  for(const [,pairs] of tlPairs(files)){let score=0;for(const v of pairs.values())if(/[一-鿿]/.test(v)&&!(v.match(KANA)||[]).length)score++;if(score>bestScore){best=pairs;bestScore=score;}}
  if(!best)return null;
  return base.map(scene=>({...scene,patched:scene.lines.some(t=>best.has(t)),lines:scene.lines.map(t=>best.has(t)?best.get(t):t)}));
 },
};

// ---- Siglus (Steam multi-language) ---------------------------------------------------------------------------
// Steam releases keep every line in dat/*.dbs tables with one column per language. The running table's Japanese column
// gives the lines; the Chinese column comes from the same table before MeguLit's Japanese restore (its backup in
// .megulit-japanese), from the table itself when it was never restored, or from a <name>_zh.dbs twin.
const siglusTables=()=>require('../../core/japanese-restore.cjs')._internal;
const DBS=n=>/\.dbs$/i.test(n)&&!/_(?:en|zh|cn|tw|ko|ru)\.dbs$/i.test(n);
const HAN=/[\u4e00-\u9fff]/,KANA1=/[\u3040-\u30ff]/;
function dbsTable(buf){const t=siglusTables(),d=t.decrypt(buf);return t.parse(d.raw,d.marker);}
function columnShares(table){return table.columns.map((c,i)=>{if(c.type!==0x53)return null;let filled=0,kana=0,han=0;for(const r of table.cells){const v=r[i];if(!v)continue;filled++;if(KANA1.test(v))kana++;else if(HAN.test(v))han++;}return {index:i,filled,kana:filled?kana/filled:0,han:filled?han/filled:0};}).filter(Boolean);}
function parseDbs(buf){const table=dbsTable(buf),cols=columnShares(table).filter(c=>c.filled);const jp=cols.sort((a,b)=>b.kana-a.kana)[0];
 if(!jp||jp.kana<.3)return {lines:[],anchors:[],rows:table.rows};return {lines:table.cells.map(r=>String(r[jp.index]||'')),anchors:[],rows:table.rows};}
function chineseColumn(table,rows){if(table.rows!==rows)return null;const c=columnShares(table).filter(c=>c.filled>=table.rows*.3&&c.kana<.1&&c.han>.5).sort((a,b)=>b.han-a.han)[0];return c?table.cells.map(r=>String(r[c.index]||'')):null;}
const siglusDat=dir=>{const d=path.join(dir,'dat');try{return fs.readdirSync(d).some(DBS)?d:'';}catch{return '';}};
const siglus={
 id:'siglus',hint:'dat\*.dbs',
 scenes(dir){const d=siglusDat(dir);if(!d)return [];return fs.readdirSync(d).filter(DBS).sort().map(f=>({name:f,read:()=>fs.readFileSync(path.join(d,f))}));},
 archives:()=>[],sources:dir=>{const d=siglusDat(dir);return d?fs.readdirSync(d).filter(DBS).map(f=>path.join(d,f)):[];},
 parse:parseDbs,test:DBS,
 patchLines(base,found){
  const dirs=[...new Set(found.dirs.flatMap(d=>[d,path.join(d,'.megulit-japanese','dat'),path.join(d,'dat')]))];let any=false;
  const list=base.map(scene=>{const stem=scene.name.replace(/\.dbs$/i,'');
   for(const d of dirs)for(const name of [scene.name,stem+'_zh.dbs',stem+'_cn.dbs',stem+'_tw.dbs']){const file=path.join(d,name);let buf;try{buf=fs.readFileSync(file);}catch{continue;}
    let lines;try{lines=chineseColumn(dbsTable(buf),scene.lines.length);}catch{continue;}if(!lines)continue;any=true;
    return {...scene,patched:true,lines:lines.map((t,k)=>t||scene.lines[k])};}
   return scene;});
  return any?list:null;
 },
};

const ENGINES={kirikiri,artemis,renpy,siglus};
// The engine whose running scripts this folder holds, if any can be read.
function readable(id,dir){let scenes;try{scenes=ENGINES[id].scenes(dir);}catch{return false;}
 for(const s of scenes.slice(0,8)){try{if(ENGINES[id].parse(s.read()).lines.length)return true;}catch{}}return false;}
function detect(dir){for(const id of Object.keys(ENGINES))if(readable(id,dir))return id;return null;}
function read(id,dir,overlay){const engine=ENGINES[id];
 return engine.scenes(dir).map(s=>{const replaced=overlay?.get(s.name.toLowerCase());let parsed={lines:[],anchors:[]};try{parsed=engine.parse(replaced||s.read());}catch{}return {name:s.name,...parsed,patched:!!replaced};});}
function fingerprint(id,dir){return crypto.createHash('sha256').update(id+'\n'+ENGINES[id].sources(dir).sort().map(f=>path.basename(f)+'|'+stat(f)).join('\n')).digest('hex');}
module.exports={ENGINES,detect,readable,read,fingerprint,parseKs,parseAst,parseRpy,pfsList,pfsRead,tlPairs,decode};
