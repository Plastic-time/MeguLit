// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* YarnSpinner for Unity: Localization MonoBehaviours (_LocaleCode + _stringTable { keys, values }).
   Works both with TypeTree (AssetBundles) and stripped TypeTree (player sharedassets*.assets / resources.assets),
   pairing Japanese lines with Simplified (else Traditional) Chinese by Yarn line key ("line:..."). */
const fs=require('node:fs'),path=require('node:path');
const ufs=require('./unityfs.cjs'),ser=require('./unity-serialized.cjs');
const {stat}=require('./file-key.cjs');

const KANA=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/;
const LOCALE=/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i;
const ZH_ORDER=['zh-hans','zh-cn','zh_cn','zh','zh-sg','chs','sc','zh-hant','zh-tw','zh_tw','zh-hk','cht','tc'];
const MAX_PLAYER=256*1024*1024,MAX_NODE=96*1024*1024;
const RICH_TAG=/<\/?(?:color|size|b|i|u|s|sprite|ruby|rt|mark|alpha|cspace|indent|line-height|margin|mspace|noparse|pos|space|style|voffset|width)(?:=[^>]*)?>/gi;

function dataDirs(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name));}

function hasYarnHint(dataDir){
 const managed=path.join(dataDir,'Managed');
 if(fs.existsSync(managed)){try{return fs.readdirSync(managed).some(n=>/^YarnSpinner/i.test(n));}catch{return false;}}
 return true;/* IL2CPP has no Managed/ */
}

function parseLocTree(buf,obj){
 if(!obj.tree.some(n=>n.name==='_LocaleCode')||!obj.tree.some(n=>n.name==='_stringTable'))return null;
 let v;try{v=ser.readValue(buf,obj);}catch{return null;}
 if(!v||!v._stringTable||!Array.isArray(v._stringTable.keys)||!Array.isArray(v._stringTable.values))return null;
 const locale=String(v._LocaleCode||v.m_Name||'').trim();
 if(!LOCALE.test(locale)||v._stringTable.keys.length!==v._stringTable.values.length)return null;
 return {locale,keys:v._stringTable.keys.map(String),values:v._stringTable.values.map(x=>String(x??''))};
}

function parseLocRaw(buf,obj,version){
 const hdr=version>=14?28:20;
 if(obj.size<hdr+16)return null;
 let p=obj.offset+hdr;const end=obj.offset+obj.size;
 const str=()=>{
  if(p+4>end)return null;
  const n=buf.readUInt32LE(p);p+=4;
  if(n>500000||p+n>end)return null;
  const raw=buf.subarray(p,p+n);
  for(const c of raw)if(c<9||(c>13&&c<32))return null;
  const s=raw.toString('utf8');if(s.includes('\ufffd'))return null;
  p=(p+n+3)&~3;return s;
 };
 const mName=str();if(mName===null)return null;
 const locale=str();if(!locale||locale.length>16||!LOCALE.test(locale))return null;
 if(p+4>end)return null;
 const nk=buf.readUInt32LE(p);p+=4;
 if(nk<1||nk>500000||p+nk*4>end)return null;
 const keys=[];
 for(let i=0;i<nk;i++){const k=str();if(k===null||!k||k.length>256)return null;keys.push(k);}
 if(p+4>end)return null;
 const nv=buf.readUInt32LE(p);p+=4;
 if(nv!==nk||p+nv*4>end)return null;
 const values=[];
 for(let i=0;i<nv;i++){const v=str();if(v===null)return null;values.push(v);}
 if(!keys.some(k=>k.startsWith('line:')||k.startsWith('shadow:')))return null;
 return {locale,keys,values};
}

function collectFromBuf(buf,out){
 const r=ser.parse(buf);if(!r)return;
 for(const o of r.objects){
  if(o.type!==114||o.size<44)continue;
  const loc=o.tree?parseLocTree(buf,o):parseLocRaw(buf,o,r.version);
  if(loc&&loc.keys.length)out.push(loc);
 }
}

function wantLocNode(head){
 const r=ser.parse(head);if(!r)return false;
 if(r.typeTree)return r.objects.some(o=>o.type===114&&o.size>=44&&o.tree&&o.tree.some(n=>n.name==='_LocaleCode')&&o.tree.some(n=>n.name==='_stringTable'));
 let maxEnd=0;
 for(const o of r.objects)if(o.type===114&&o.size>=256){const e=o.offset+o.size;if(e>maxEnd)maxEnd=e;}
 return maxEnd||false;
}

function splitSpeaker(raw){
 const s=String(raw||'');
 const m=/^([^:\n]{1,24}):([\s\S]*)$/.exec(s);
 if(m&&!/[<{\[\d。！？!?]/.test(m[1])&&!/^(?:https?|ftp)$/i.test(m[1]))return {speaker:m[1].trim(),body:m[2]};
 return {speaker:'',body:s};
}

function cleanText(raw){
 return String(raw||'')
  .replace(/\r\n/g,'\n')
  .replace(/<br\s*\/?>|｜/gi,'\n')
  .replace(RICH_TAG,'')
  .trim();
}

function cleanEntry(raw){
 const {speaker,body}=splitSpeaker(raw);
 return {speaker,text:cleanText(body)};
}

function pickLocales(byLocale){
 const stats=[...byLocale.entries()].map(([loc,map])=>{
  let kana=0,han=0,nonEmpty=0;
  for(const v of map.values()){const t=cleanText(v);if(!t)continue;nonEmpty++;if(KANA.test(t))kana++;else if(HAN.test(t))han++;}
  return {loc,map,kana,han,nonEmpty};
 }).filter(x=>x.nonEmpty>0);
 if(!stats.length)return null;
 const jaExplicit=stats.find(x=>/^ja\b/i.test(x.loc)&&x.kana>0);
 const byKana=stats.slice().sort((a,b)=>b.kana-a.kana||b.nonEmpty-a.nonEmpty)[0];
 const src=jaExplicit||(byKana.kana>=10?byKana:stats.slice().sort((a,b)=>b.nonEmpty-a.nonEmpty)[0]);
 const zhRank=l=>{const i=ZH_ORDER.indexOf(l.toLowerCase());return i<0?99:i;};
 const zh=stats.filter(x=>x.loc!==src.loc&&zhRank(x.loc)<99&&x.han>0).sort((a,b)=>zhRank(a.loc)-zhRank(b.loc))[0]||null;
 return {src,zh,others:stats.filter(x=>x.loc!==src.loc)};
}

function walkBundles(d,depth,out){let es;try{es=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
 for(const e of es){const f=path.join(d,e.name);if(e.isDirectory()){if(depth>0&&!/^(Managed|Mono|il2cpp_data|Plugins|MonoBleedingEdge|Resources)$/i.test(e.name))walkBundles(f,depth-1,out);}else if(/\.(bundle|ab|unity3d)$/i.test(e.name))out.push(f);}}

const memo=new Map();
function loadDir(dir,opts={}){
 const dirs=dataDirs(dir).filter(hasYarnHint);
 if(!dirs.length)return {scenes:[],sources:[],foreignRows:[]};
 const players=[];
 for(const d of dirs){
  let names;try{names=fs.readdirSync(d);}catch{names=[];}
  for(const n of names)if(/^(?:resources\.assets|sharedassets\d+\.assets|level\d+)$/i.test(n))players.push(path.join(d,n));
 }
 players.sort();
 const pSig=players.map(f=>f+'|'+stat(f)).join('\n');
 const hit=memo.get(dir);
 if(hit&&hit.pSig===pSig&&(hit.bSig===null||hit.bSig===hit.bundles.map(f=>f+'|'+stat(f)).join('\n')))return hit.data;

 const deadline=opts?.deadline||Infinity;let timedOut=false;
 const locs=[],used=[];
 for(const f of players){
  if(Date.now()>deadline){timedOut=true;break;}
  let sz=0;try{sz=fs.statSync(f).size;}catch{}if(!sz||sz>MAX_PLAYER)continue;
  let buf;try{buf=fs.readFileSync(f);}catch{continue;}
  const before=locs.length;
  try{collectFromBuf(buf,locs);}catch{}
  if(locs.length>before)used.push(f);
 }
 /* If player assets have no YarnSpinner tables yet, search Addressables/bundles (object-table pre-check skips media bundles). */
 let bundles=[],bSig=null;
 if(!locs.length&&!timedOut){
  for(const d of dirs)walkBundles(d,5,bundles);
  bundles.sort();bSig=bundles.map(f=>f+'|'+stat(f)).join('\n');
  for(const f of bundles){
   if(Date.now()>deadline){timedOut=true;break;}
   let sz=0;try{sz=fs.statSync(f).size;}catch{}if(sz<64||sz>8*256*1024*1024)continue;
   let nodes;try{nodes=ufs.readMatchingNodes(f,wantLocNode,MAX_NODE);}catch{nodes=null;}
   if(!nodes||!nodes.length)continue;
   const before=locs.length;
   for(const n of nodes)try{collectFromBuf(n.data,locs);}catch{}
   if(locs.length>before)used.push(f);
  }
 }

 const byLocale=new Map();
 for(const loc of locs){
  const k=loc.locale.toLowerCase();
  let m=byLocale.get(k);if(!m){m=new Map();byLocale.set(k,m);}
  for(let i=0;i<loc.keys.length;i++)if(!m.has(loc.keys[i]))m.set(loc.keys[i],loc.values[i]);
 }
 const picked=pickLocales(byLocale);
 const scenes=[],foreignRows=[];
 if(picked){
  const lines=[],zh=[],speakers=[];
  for(const [key,raw] of picked.src.map){
   const e=cleanEntry(raw);if(!e.text)continue;
   const z=picked.zh?cleanEntry(picked.zh.map.get(key)||'').text:'';
   lines.push(e.text);zh.push(z);speakers.push(e.speaker);
   for(const o of picked.others){
    const ov=cleanEntry(o.map.get(key)||'').text;
    if(ov)foreignRows.push([ov,e.text]);
   }
  }
  if(lines.length){
   const payload=Buffer.from(JSON.stringify({lines,zh:picked.zh?zh:[],speakers}),'utf8');
   scenes.push({name:'yarn',read:()=>payload});
  }
 }
 const data={scenes,sources:used,foreignRows};
 if(!timedOut){memo.set(dir,{pSig,bSig,bundles,data});if(memo.size>6)memo.delete(memo.keys().next().value);}
 return data;
}

function parse(buf){
 const doc=JSON.parse(Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf));
 const out={lines:doc.lines||[],anchors:[]};
 if(Array.isArray(doc.zh)&&doc.zh.length)out.zh=doc.zh;
 if(Array.isArray(doc.speakers)&&doc.speakers.some(Boolean))out.speakers=doc.speakers;
 return out;
}

function patchLines(base){
 let any=false;
 const list=base.map(scene=>{
  const zh=scene.zh||[];if(!zh.some(Boolean))return scene;
  any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};
 });
 return any?list:null;
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
 id:'yarnspinner',
 hint:'<游戏>_Data（YarnSpinner Localization）',
 scenes:(dir,opts)=>loadDir(dir,opts).scenes,
 archives:()=>[],
 sources:dir=>loadDir(dir).sources,
 parse,
 test:()=>false,
 patchLines,
 foreign,
 _internal:{parseLocTree,parseLocRaw,cleanEntry,splitSpeaker,pickLocales,wantLocNode},
};
