// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E355 Naninovel (Unity) games with official localization (Steam 魔法少女ノ魔女裁判 / manosaba). The localization
   bundles (StreamingAssets/aa/StandaloneWindows64/*-localization-<lang>-scripts-*.bundle, UnityFS + LZ4) hold one
   "localization document" per scenario script:
     # 0101Adv29_Narrative001
     ; 見張りのためか、看守はよく玄関ホールに立っている。<br>いつのっそりと…
     看守经常会来玄关大厅这边巡逻站岗。<br>
     它什么时候悄悄出现在这里都不出奇。
   The "; " line is the source (a "; > Name: |#id|" line is the speaker command and is skipped), the plain lines after it
   are the translation. Simplified Chinese is preferred, then Traditional, then any other localization.
   E449 The first line names both languages: "; Chinese (T) <zh-TW> to Japanese (Japan) <ja-JP> localization document
   for `01_Main` naninovel script" (夏色四葉草: written in Chinese, documents kept as TextAssets in resources.assets,
   Resources/Naninovel/Localization/<lang>/Scripts). When the source is not Japanese, the Japanese text is the
   translation side of the document into Japanese, and the Chinese is the translation into Simplified (else
   Traditional) Chinese, or the source itself when that is Chinese; blocks are matched by their "# id". */
const fs=require('node:fs'),path=require('node:path'),unityfs=require('./unityfs.cjs');
const memo=new Map();
const stat=f=>{try{const s=fs.statSync(f);return s.size+'|'+s.mtimeMs;}catch{return '';}};
function dataDirs(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name));}
function bundleDir(dir){for(const d of dataDirs(dir)){const b=path.join(d,'StreamingAssets','aa','StandaloneWindows64');if(fs.existsSync(b))return b;}return '';}
function localizationBundles(dir){const d=bundleDir(dir);if(!d)return [];let files;try{files=fs.readdirSync(d);}catch{return [];}
 const loc=files.filter(f=>/-localization-[a-z-]+-scripts-.*\.bundle$/i.test(f)&&!/-scripts-debug/i.test(f));if(!loc.length)return [];
 const lang=f=>(/-localization-([a-z-]+?)-scripts-/i.exec(f)||[])[1]||'';
 const order=['zhhans','zh-hans','zhcn','zhhant','zh-hant','zhtw'];const langs=[...new Set(loc.map(lang))].sort((a,b)=>((order.indexOf(a)+1)||99)-((order.indexOf(b)+1)||99));
 return loc.filter(f=>lang(f)===langs[0]).sort().map(f=>path.join(d,f));}
const DOC=Buffer.from('localization document for');
// Serialized files of the player that hold localization documents as TextAssets (resources.assets, sharedassets*).
function assetFiles(dir){const out=[];for(const d of dataDirs(dir)){let names;try{names=fs.readdirSync(d);}catch{continue;}
 for(const n of names)if(/^(?:resources|sharedassets\d+)\.assets$/i.test(n)){const f=path.join(d,n);if(docsIn(f).length)out.push(f);}}
 return out;}
const HEAD=/^(?:; )?(?:.*?<([A-Za-z-]+)>\s+to\s+.*?<([A-Za-z-]+)>\s+)?.*?localization document for [`']([^`']+)[`']\s*([^\r\n]*)/;
// The documents in one buffer: { name, src, dst, script, text }. A document is a length-prefixed UTF-8 string starting
// with its "; ... localization document for" line.
// Newer Naninovel keeps a document as a parsed script asset: the header is a string of its own, the lines follow as
// managed references (LabelScriptLine, CommentScriptLine, GenericTextScriptLine ...) and the printed text sits in the
// PrintText commands after them: type name, namespace, assembly, script name, then the text. Their texts, in order.
const U8=new TextDecoder('utf-8',{fatal:true});
function printed(b,from,to){const out=[];let p=from&~3;const str=q=>{if(q+4>to)return null;const n=b.readUInt32LE(q);if(n<1||n>20000||q+4+n>to)return null;const raw=b.subarray(q+4,q+4+n);for(const c of raw)if(c<9||(c>13&&c<32))return null;try{return {s:U8.decode(raw),next:(q+4+n+3)&~3};}catch{return null;}};
 const toks=[];while(p<to){const r=str(p);if(r){toks.push(r.s);p=r.next;}else p+=4;}
 for(let i=0;i+4<toks.length;i++)if(toks[i]==='PrintText'&&toks[i+1]==='Naninovel.Commands')out.push(toks[i+4]);
 return out;}
function scan(b,out){let at=0;
 while((at=b.indexOf(DOC,at))>=0){let start=at;while(start>0&&b[start-1]>=0x20)start--;at+=DOC.length;
  if(start<4)continue;const n=b.readUInt32LE(start-4);if(n<DOC.length||start+n>b.length)continue;
  const text=b.toString('utf8',start,start+n),m=HEAD.exec(text);if(!m)continue;
  const doc={name:path.basename(m[3])+'.nani',src:(m[1]||'ja').toLowerCase(),dst:(m[2]||'').toLowerCase(),script:!/managed text/i.test(m[4]),text};
  if(doc.script&&!/\n# /.test(text)){const next=b.indexOf(DOC,at);doc.prints=printed(b,start+n,next<0?Math.min(b.length,start+n+4e6):next);}
  out.push(doc);}
 return out;}
function docsIn(file){const key=file+'|'+stat(file);if(memo.has(key))return memo.get(key);const out=[];
 try{if(/\.bundle$/i.test(file))for(const node of unityfs.read(file))scan(node.data,out);else scan(fs.readFileSync(file),out);}catch{}
 memo.set(key,out);return out;}
const tidy=t=>t.replace(/<br>\s*/gi,'\n').replace(/<\/?[a-z][^>]*>/gi,'').replace(/\r/g,'').trim();
// Blocks of a document: Map id -> {src:[...], dst:[...]}.
function blocks(text){const out=new Map();
 for(const block of text.replace(/\r/g,'').split(/\n(?=# )/)){const m=/^# (\S+)/.exec(block);if(!m)continue;const src=[],dst=[];
  for(const l of block.split('\n').slice(1)){if(!l.trim()||l.startsWith('; >'))continue;if(l.startsWith('; '))src.push(l.slice(2));else if(!l.startsWith(';'))dst.push(l);}
  out.set(m[1],{src,dst});}
 return out;}
const isJa=l=>/^ja/.test(l),isZh=l=>/^zh/.test(l);
const ZH=['zh-cn','zh-hans','zh','zh-sg','zh-tw','zh-hant','zh-hk'];
const zhRank=l=>{const i=ZH.indexOf(l);return i<0?(isZh(l)?50:99):i;};
// One document per script, written the classic way ("; " Japanese, then the Chinese) so parse() reads every release alike.
function combine(docs){const byName=new Map();for(const d of docs){if(!d.script)continue;const k=d.name.toLowerCase();if(!byName.has(k))byName.set(k,[]);byName.get(k).push(d);}
 const out=[];
 for(const list of byName.values()){
  const jaSrc=list.filter(d=>isJa(d.src)).sort((a,b)=>zhRank(a.dst)-zhRank(b.dst))[0];
  if(jaSrc){out.push({name:jaSrc.name,text:jaSrc.text});continue;}
  const ja=list.find(d=>isJa(d.dst));if(!ja)continue;
  const zhDoc=list.filter(d=>isZh(d.dst)).sort((a,b)=>zhRank(a.dst)-zhRank(b.dst))[0];
  // Parsed-asset documents: the printed texts, paired with the Chinese document's when both have as many.
  if(ja.prints){const zp=zhDoc&&zhDoc.prints&&zhDoc.prints.length===ja.prints.length?zhDoc.prints:null;
   const parts=ja.prints.map((t,i)=>'# p'+i+'\n'+t.split('\n').map(l=>'; '+l).join('\n')+(zp&&zp[i]?'\n'+zp[i]:''));
   if(parts.length)out.push({name:ja.name,text:parts.join('\n\n')});continue;}
  const jb=blocks(ja.text),zb=zhDoc?blocks(zhDoc.text):null,useSrc=!zhDoc&&isZh(ja.src);const parts=[];
  for(const [id,b] of jb){if(!b.dst.length)continue;const z=zb?zb.get(id):null;const zh=z?z.dst:useSrc?b.src:[];
   parts.push('# '+id+'\n'+b.dst.map(l=>'; '+l).join('\n')+(zh.length?'\n'+zh.join('\n'):''));}
  if(parts.length)out.push({name:ja.name,text:parts.join('\n\n')});}
 return out;}
function parse(buf){const text=Buffer.isBuffer(buf)?buf.toString('utf8'):String(buf),lines=[],zh=[],anchors=[];
 for(const [id,b] of blocks(text)){anchors.push(id);if(!b.src.length)continue;lines.push(tidy(b.src.join('\n')));zh.push(tidy(b.dst.join('\n')));}
 return {lines,anchors,zh};}
function documents(file){return docsIn(file).filter(d=>d.script);}
const sourcesOf=dir=>{const b=localizationBundles(dir);return b.length?b:assetFiles(dir);};
const naninovel={
 id:'naninovel',hint:'<游戏>_Data\\StreamingAssets\\aa 或 resources.assets（本地化剧本）',
 scenes(dir){const out=new Map();for(const d of combine(sourcesOf(dir).flatMap(docsIn)))if(!out.has(d.name.toLowerCase()))out.set(d.name.toLowerCase(),{name:d.name,read:()=>Buffer.from(d.text,'utf8')});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:sourcesOf,
 parse,test:()=>false,
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
 _internal:{documents,localizationBundles,tidy,combine,scan},
};
module.exports=naninovel;
