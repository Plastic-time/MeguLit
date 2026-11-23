// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Utage (Unity) scenario reader: parses compiled AdvImportScenarioBook (*.book) and AdvChapterData (*.chapter)
   MonoBehaviour objects inside <Name>_Data/*.assets and UnityFS AssetBundles. Supports both single-language Text
   sheets and localized books with Japanese / SC / TC / English / etc. columns, <ruby=reading>base</ruby> furigana,
   Character->NameText->Localize speaker resolution, built-in Chinese patchLines, and foreign() lookup. */
const fs=require('node:fs'),path=require('node:path');
const ufs=require('./unityfs.cjs'),ser=require('./unity-serialized.cjs'),ua=require('./unity-assets.cjs');
const {stat}=require('./file-key.cjs');

const KANA=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/,PROSE_PUNCT=/[。！？!?…「」『』.,\s]/;
const RUBY=/<ruby=([^>]*)>([\s\S]*?)<\/ruby>/gi;
const TAG=/<\/?[a-zA-Z][^>\n]{0,64}>/g;
const MAX_ASSET=512*1024*1024,MAX_NODE=96*1024*1024;
const SKIP_COL=new Set(['','command','waittype','pagectrl','voice','windowtype']);
const SCENARIO_PATCH=/[\\/]StreamingAssets[\\/].*[\\/][^\\/]+-patch[\\/][^\\/]+\.scenarios\.asset$/i;

function clean(s){
 const pairs=[];
 let t=String(s||'').replace(RUBY,(_,r,b)=>{if(b.trim()&&r.trim())pairs.push([b,r]);return b;});
 t=t.replace(/<br\s*\/?>|\\n/gi,'\n').replace(TAG,'').trim();
 return {text:t,ruby:pairs.length?pairs:null};
}

function monoHeader(raw,version){
 const pidBytes=version>=14?8:4,at=4+pidBytes+4+4+pidBytes;
 if(at+4>raw.length)return null;
 const nl=raw.readUInt32LE(at);
 if(nl>512||at+4+nl>raw.length)return null;
 const name=raw.toString('utf8',at+4,at+4+nl);
 return {name,next:(at+4+nl+3)&~3,pidBytes};
}

function readGrid(raw,p,tailInts){
 const i32=()=>{if(p+4>raw.length)throw Error('EOF');const v=raw.readInt32LE(p);p+=4;return v;};
 const u32=()=>{if(p+4>raw.length)throw Error('EOF');const v=raw.readUInt32LE(p);p+=4;return v;};
 const str=()=>{const n=u32();if(n>1000000||p+n>raw.length)throw Error('STR');const s=raw.toString('utf8',p,p+n);p=(p+n+3)&~3;return s;};
 const rowCount=i32();
 if(rowCount<0||rowCount>200000)throw Error('ROWS');
 const rows=[];
 for(let i=0;i<rowCount;i++){
  i32();
  const cellCount=u32();
  if(cellCount>512)throw Error('CELLS');
  const cells=[];
  for(let c=0;c<cellCount;c++)cells.push(str());
  p+=8;
  rows.push(cells);
 }
 const name=str();
 p+=tailInts*4;
 if(p>raw.length)throw Error('TAIL');
 return {name,rows,next:p};
}

function parseBook(raw,version=22){
 const h=monoHeader(raw,version);
 if(!h||!/\.book$/i.test(h.name)||h.next+8>raw.length)return null;
 const sheetCount=raw.readInt32LE(h.next+4);
 if(sheetCount<1||sheetCount>5000)return null;
 for(const tailInts of [5,3,4]){
  let p=h.next+8,ok=true;const sheets=[];
  for(let g=0;g<sheetCount;g++){
   try{const s=readGrid(raw,p,tailInts);sheets.push({name:s.name,rows:s.rows});p=s.next;}
   catch{ok=false;break;}
  }
  if(ok&&p===raw.length)return sheets;
 }
 return null;
}

function parseChapter(raw,version=22){
 const h=monoHeader(raw,version);
 if(!h||!/\.chapter$/i.test(h.name))return null;
 for(const listAt of [h.next+12+h.pidBytes,h.next+8+h.pidBytes]){
  if(listAt+4>raw.length)continue;
  const count=raw.readInt32LE(listAt);
  if(count<1||count>200)continue;
  for(const tailInts of [3,5,4]){
   let p=listAt+4,ok=true;const grids=[];
   for(let g=0;g<count;g++){
    try{const s=readGrid(raw,p,tailInts);grids.push({name:s.name,rows:s.rows});p=s.next;}
    catch{ok=false;break;}
   }
   if(ok&&p===raw.length)return grids;
  }
 }
 return null;
}

function gridsFromTree(v){
 if(!v||typeof v!=='object')return null;
 const list=v.importGridList||v.settingList;
 if(!Array.isArray(list))return null;
 return list.map(g=>({name:g?.name||'',rows:(g?.rows||[]).map(r=>r?.strings||[])})).filter(g=>g.rows.length);
}

function findCol(header,names){
 for(const n of names){const i=header.indexOf(n);if(i>=0)return i;}
 return -1;
}

function colStats(rows,col){
 let filled=0,kana=0,han=0,punct=0,len=0;
 for(const r of rows){
  const v=String(r[col]||'').trim();if(!v)continue;
  filled++;len+=v.length;
  if(KANA.test(v))kana++;else if(HAN.test(v))han++;
  if(PROSE_PUNCT.test(v))punct++;
 }
 return {filled,kana,han,punct,avg:filled?len/filled:0};
}

function pickColumns(rows){
 const hi=rows.findIndex((r,i)=>i<5&&r.some(c=>/^(?:command|text|japanese)$/i.test(String(c||'').trim())));
 if(hi<0)return null;
 const rawH=rows[hi].map(c=>String(c||'').trim()),h=rawH.map(c=>c.toLowerCase());
 const data=rows.slice(hi+1);
 const cCmd=findCol(h,['command']),cArg1=findCol(h,['arg1']),cText=findCol(h,['text']);
 const cJa=findCol(h,['japanese','jp','ja','日本語','日文']);
 const cSc=findCol(h,['sc','zh-cn','zh-hans','chs','cn','简体中文','简中','chinese','zh']);
 const cTc=findCol(h,['tc','zh-tw','zh-hant','cht','tw','繁体中文','繁中']);
 const cEn=findCol(h,['english','en','英文','英語']);
 const sJa=cJa>=0?colStats(data,cJa):null;
 const sSc=cSc>=0?colStats(data,cSc):null;
 const sTc=cTc>=0?colStats(data,cTc):null;
 const sEn=cEn>=0?colStats(data,cEn):null;
 const sText=cText>=0?colStats(data,cText):null;
 const hasExplicitLang=(sJa?.filled||0)+(sSc?.filled||0)+(sTc?.filled||0)+(sEn?.filled||0)>0;
 const textIsKey=sText&&hasExplicitLang&&sText.kana===0&&sText.punct<sText.filled*.1&&Math.max(sJa?.avg||0,sSc?.avg||0,sTc?.avg||0,sEn?.avg||0)>sText.avg*1.5;

 let srcCol=-1;
 if(sJa&&sJa.kana>0)srcCol=cJa;
 else if(sText&&sText.filled>0&&!textIsKey)srcCol=cText;
 else if(sSc&&sSc.filled>0)srcCol=cSc;
 else if(sTc&&sTc.filled>0)srcCol=cTc;
 else if(sEn&&sEn.filled>0)srcCol=cEn;
 else if(sJa&&sJa.filled>0)srcCol=cJa;
 else if(cText>=0)srcCol=cText;
 if(srcCol<0)return null;

 let zhCol=-1;
 if(srcCol!==cSc&&srcCol!==cTc){
  if(sSc&&sSc.han>0)zhCol=cSc;
  else if(sTc&&sTc.han>0)zhCol=cTc;
 }
 const otherCols=[];
 for(let i=0;i<h.length;i++){
  if(i===srcCol||SKIP_COL.has(h[i])||/^arg\d+$/i.test(h[i]))continue;
  if(h[i]==='text'&&textIsKey)continue;
  otherCols.push(i);
 }
 return {hi,cCmd,cArg1,srcCol,zhCol,otherCols};
}

function collectObjects(buf,books,chapters,source){
 const r=ser.parse(buf);if(!r)return;
 for(const o of r.objects){
  if(o.type!==114||o.size<64)continue;
  const h=monoHeader(buf.subarray(o.offset,Math.min(buf.length,o.offset+1024)),r.version);
  if(!h)continue;
  if(/\.book$/i.test(h.name)){
   const sheets=o.tree?gridsFromTree(ser.readValue(buf,o)):parseBook(buf.subarray(o.offset,o.offset+o.size),r.version);
   if(sheets?.length)books.push({name:h.name,sheets,source});
  }else if(/\.chapter$/i.test(h.name)){
   const grids=o.tree?gridsFromTree(ser.readValue(buf,o)):parseChapter(buf.subarray(o.offset,o.offset+o.size),r.version);
   if(grids?.length)chapters.push(grids);
  }
 }
}

/* A compiled patch replaces a book only when every source row still has the same identity.
   Matching a basename or a line count alone can pair a different route or translation column. */
const sheetIdentity=sheet=>String(sheet.name||'').split(':').pop();
function sameSourceRows(base,patch){
 if(base.sheets.length!==patch.sheets.length)return false;
 return base.sheets.every((sheet,i)=>{
  const other=patch.sheets[i],cols=pickColumns(sheet.rows),next=pickColumns(other.rows);
  if(sheetIdentity(sheet)!==sheetIdentity(other)||sheet.rows.length!==other.rows.length||!cols||!next)return false;
  if(cols.srcCol!==next.srcCol||cols.hi!==next.hi||JSON.stringify(sheet.rows[cols.hi])!==JSON.stringify(other.rows[next.hi]))return false;
  const voiceCol=sheet.rows[cols.hi].findIndex(cell=>String(cell).trim().toLowerCase()==='voice');
  return sheet.rows.slice(cols.hi+1).every((row,j)=>{
   const incoming=other.rows[next.hi+1+j];
   return row[cols.srcCol]===incoming[next.srcCol]&&
    (cols.cCmd<0||row[cols.cCmd]===incoming[next.cCmd])&&
    (cols.cArg1<0||row[cols.cArg1]===incoming[next.cArg1])&&
    (voiceCol<0||row[voiceCol]===incoming[voiceCol]);
  });
 });
}

function selectBooks(books){
 const base=books.filter(book=>!SCENARIO_PATCH.test(book.source)),patches=new Map();
 const identity=book=>JSON.stringify(book.sheets.map(sheetIdentity));
 for(const book of books.filter(book=>SCENARIO_PATCH.test(book.source))){
  const key=identity(book);
  if(!patches.has(key))patches.set(key,[]);
  patches.get(key).push(book);
 }
 for(const [key,candidates] of patches){
  if(candidates.length!==1)continue;
  const patch=candidates[0],matches=base.filter(book=>identity(book)===key);
  if(!matches.length){base.push(patch);continue;}
  if(matches.length===1&&sameSourceRows(matches[0],patch))base[base.indexOf(matches[0])]=patch;
 }
 return base;
}

function speakerResolver(chapters){
 const charToName=new Map(),locJa=new Map();
 for(const grids of chapters){
  for(const g of grids){
   const tag=String(g.name||'').split(':').pop().toLowerCase();
   const rows=g.rows||[];if(rows.length<2)continue;
   const h=rows[0].map(c=>String(c||'').trim().toLowerCase());
   if(tag==='character'){
    const ci=findCol(h,['charactername']),ni=findCol(h,['nametext']);
    if(ci>=0&&ni>=0)for(const r of rows.slice(1))if(r[ci]&&!charToName.has(r[ci]))charToName.set(r[ci],r[ni]||r[ci]);
   }else if(tag==='localize'){
    const ki=findCol(h,['key']),ji=findCol(h,['japanese','jp','ja','日本語','日文']);
    if(ki>=0&&ji>=0)for(const r of rows.slice(1))if(r[ki]&&r[ji]&&!locJa.has(r[ki]))locJa.set(r[ki],r[ji]);
   }
  }
 }
 return raw=>{
  const k=String(raw||'').trim();if(!k)return '';
  const nt=charToName.get(k)||k;
  return locJa.get(nt)||nt;
 };
}

const memo=new Map();
function loadDir(dir){
 const src=ua._internal.sources(dir);
 const patches=src.loose.filter(file=>{
  const size=Number(stat(file).split('|')[0]);
  return SCENARIO_PATCH.test(file)&&size>=64&&size<=MAX_NODE;
 });
 const bundles=[...src.bundles,...patches],files=[...src.players,...bundles];
 const sig=files.map(f=>f+'|'+stat(f)).join('\n');
 const hit=memo.get(dir);
 if(hit&&hit.sig===sig)return hit.data;

 const books=[],chapters=[],usedSources=[];
 for(const f of src.players){
  let sz=0;try{sz=fs.statSync(f).size;}catch{}
  if(!sz||sz>MAX_ASSET)continue;
  let buf;try{buf=fs.readFileSync(f);}catch{continue;}
  const before=books.length+chapters.length;
  try{collectObjects(buf,books,chapters,f);}catch{}
  if(books.length+chapters.length>before)usedSources.push(f);
 }
 for(const f of bundles){
  let nodes;try{nodes=ufs.list(f);}catch{nodes=null;}
  if(!nodes)continue;
  const before=books.length+chapters.length;
  for(const n of nodes){
   if(/\.(resS|resource|ress)$/i.test(n.name)||n.size>MAX_NODE||n.size<64)continue;
   let node;try{node=ufs.readNode(f,n.index,MAX_NODE);}catch{continue;}
   if(!node)continue;
   try{collectObjects(node.data,books,chapters,f);}catch{}
  }
  if(books.length+chapters.length>before)usedSources.push(f);
 }

 const resolveSpeaker=speakerResolver(chapters);
 const sceneMap=new Map(),foreignRows=[];
 for(const {sheets} of selectBooks(books)){
  for(const s of sheets){
   const cols=pickColumns(s.rows);if(!cols)continue;
   const lines=[],zh=[],ruby=[],speakers=[];
   for(const r of s.rows.slice(cols.hi+1)){
    const cmd=cols.cCmd>=0?String(r[cols.cCmd]||'').trim():'';
    if(cmd.startsWith('//'))continue;
    const src=clean(r[cols.srcCol]);
    if(!src.text||(cmd&&src.text.startsWith('//')))continue;
    const z=cols.zhCol>=0?clean(r[cols.zhCol]).text:'';
    const sp=!cmd&&cols.cArg1>=0?resolveSpeaker(r[cols.cArg1]):'';
    lines.push(src.text);zh.push(z);ruby.push(src.ruby);speakers.push(sp);
    for(const oc of cols.otherCols){
     const ov=clean(r[oc]).text;
     if(ov)foreignRows.push([ov,src.text]);
    }
   }
   if(!lines.length)continue;
   const rawName=String(s.name||'sheet').split(':').pop().trim()||'sheet';
   let key=rawName.toLowerCase(),n=1,base=key;
   while(sceneMap.has(key))key=base+'~'+(++n);
   const payload=Buffer.from(JSON.stringify({lines,zh:cols.zhCol>=0?zh:[],ruby,speakers}),'utf8');
   sceneMap.set(key,{name:rawName,read:()=>payload});
  }
 }
 const data={scenes:[...sceneMap.values()],sources:usedSources,foreignRows};
 memo.set(dir,{sig,data});
 if(memo.size>6)memo.delete(memo.keys().next().value);
 return data;
}

function parse(buf){
 const doc=JSON.parse(Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf));
 const out={lines:doc.lines||[],anchors:[]};
 if(Array.isArray(doc.zh)&&doc.zh.length)out.zh=doc.zh;
 if(Array.isArray(doc.ruby)&&doc.ruby.some(Boolean))out.ruby=doc.ruby;
 if(Array.isArray(doc.speakers)&&doc.speakers.some(Boolean))out.speakers=doc.speakers;
 return out;
}

function foreign(dir){
 const key=require('../original-text.cjs').foreignKey,out=new Map(),seq=[];out.seq=seq;
 for(const [other,ja] of loadDir(dir).foreignRows){
  if(!KANA.test(ja)&&!HAN.test(ja))continue;
  const k=key(other);if(k.length<2)continue;
  seq.push([k,ja,other]);
  const had=out.get(k);
  if(!had||/^[「『（(]/.test(had)&&!/^[「『（(]/.test(ja))out.set(k,ja);
 }
 return out;
}

module.exports={
 id:'utage',
 hint:'<游戏>_Data（*.book）',
 scenes:dir=>loadDir(dir).scenes,
 archives:()=>[],
 sources:dir=>loadDir(dir).sources,
 parse,
 test:()=>false,
 patchLines:require('./fill.cjs').patchLines,
 foreign,
 _internal:{parseBook,parseChapter,clean,pickColumns,speakerResolver,sameSourceRows,selectBooks},
};
