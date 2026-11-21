// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E700 generic Unity script reader (user 2026-11-16: 把 unity-text 扩成通用方案). It walks every serialized asset of a
   Unity game — <name>_Data/{resources,sharedassets*}.assets, level*, and every AssetBundle (UnityFS, LZ4 / LZMA /
   uncompressed, also with a padding prefix) under the folder, e.g. StreamingAssets/aa (Addressables) — and turns what
   it finds into scenes:
     TextAsset      JSON / CSV / TSV / plain scripts (Fungus exports {Command:"Say",arg0:speaker,arg1:text}, Utage CSV,
                    Naninovel-less custom scripts), one scene per asset
     MonoBehaviour  the CJK strings of the object, read through its type tree when the file keeps one, else by a
                    length-prefixed string scan; one scene per serialized file ("<file>#mono")
   Formats: AssetRipper / AssetStudio / UnityPy (serialized file, UnityFS). The text is read, never written back. */
const fs=require('node:fs'),path=require('node:path');
const ufs=require('./unityfs.cjs'),ser=require('./unity-serialized.cjs');
const unityScript=require('./unity-i2.cjs'),kit=require('./kit.cjs');
const {stat}=require('./file-key.cjs');
const CJK=/[぀-ヿ㐀-鿿]/,KANA=/[ぁ-ゖァ-ヺ]/;
const BUNDLE_SKIP=/(video|movie|voice|vo_|music|bgm|sound|audio|shader|texture|sprite|image|font|bg_|bgs_|cg|portrait|anim|effect)/i;
const LOOSE=/\.(json|csv|tsv|txt|bytes|xml|lua|yaml|yml|asset)$/i,NOT_BUNDLE=/\.(dll|resS|resource|assets|png|jpe?g|bmp|tga|gif|webp|psd|mp4|webm|ogg|wav|mp3|flac|m4a|ttf|otf|mdb|pdb|exe|so|dylib|meta|manifest|info|config|ini|log|bat|html?|pdf|ico|cfg|vdf|json|csv|txt|xml)$/i;
const MAX_BUNDLE=256*1024*1024,MAX_NODE=96*1024*1024;

function dataDirs(dir){let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}return names.filter(e=>e.isDirectory()&&/_Data$/i.test(e.name)).map(e=>path.join(dir,e.name));}
function walk(d,depth,out){let es;try{es=fs.readdirSync(d,{withFileTypes:true});}catch{return;}
 for(const e of es){const f=path.join(d,e.name);if(e.isDirectory()){if(depth>0&&!/^(Managed|Mono|il2cpp_data|Plugins|MonoBleedingEdge|Resources)$/i.test(e.name))walk(f,depth-1,out);}else out.push(f);}}
/* serialized files of the player and bundle files, in a fixed order */
const BUNDLE_EXT=/\.(bundle|ab|unity3d)$/i;
const uiClasses=new Map([['Text','UnityEngine.UI'],['TextMeshProUGUI','TMPro'],['TMP_FontAsset','TMPro']]);
function catArchives(dir){
 const folder=path.join(dir,'CatSystem');
 try{return fs.readdirSync(folder,{withFileTypes:true}).filter(e=>e.isFile()&&/^data_\d+\.dat$/i.test(e.name)).map(e=>path.join(folder,e.name)).sort();}catch{return [];}
}
function protectedScenes(files){
 let found=false;
 for(const file of files){
  let entries;try{entries=kit.zipList(file,8<<20);}catch{return false;}
  if(!entries)return false;
  for(const entry of entries){
   if(!/^scene\/.+\.cstx$/i.test(entry.name))continue;
   if(!entry.encrypted)return false;
   found=true;
  }
 }
 return found;
}
function sources(dir){const players=[],bundles=[],loose=[],dirs=dataDirs(dir);
 for(const d of dirs){let names;try{names=fs.readdirSync(d);}catch{continue;}
  for(const n of names)if(/^(?:resources\.assets|sharedassets\d+\.assets|globalgamemanagers\.assets|level\d+)$/i.test(n))players.push(d+path.sep+n);
  const all=[];walk(d,5,all);for(const f of all){const b=path.basename(f);if(LOOSE.test(b)&&/StreamingAssets|Resources|[\/]data[\/]/i.test(f))loose.push(f);else if(!NOT_BUNDLE.test(b)&&!BUNDLE_SKIP.test(b))bundles.push(f);}}
 for(const f of bundles.slice()){let sz;try{sz=fs.statSync(f).size;}catch{sz=0;}if(sz<64||sz>MAX_BUNDLE*8||(!BUNDLE_EXT.test(f)&&ufs.start(require('./kit.cjs').head(f,65536))<0))bundles.splice(bundles.indexOf(f),1);}
 return {players:players.sort(),bundles:bundles.sort(),loose:loose.sort(),cat:dirs.length?catArchives(dir):[]};}

function noise(s){return !CJK.test(s)||/^(Assets|Packages)\/|^[\w.\-/\\ ]+\.\w{2,5}$/.test(s)||/^\d+_[A-Za-z]/.test(s);}
// Unity also stores PNGs, WebP images and PSB models as TextAssets or loose .bytes files.
const binaryAsset=/^(?:\x89PNG\r\n\x1a\n|RIFF[\s\S]{4}WEBP|PSB\0)/;
function hasScriptText(buf,limit){
 return !binaryAsset.test(buf.toString('latin1',0,12))&&CJK.test(buf.toString('utf8',0,Math.min(buf.length,limit)));
}
/* one serialized buffer → entries { name, kind, bytes } */
function entriesOf(buf,label,ids,uiIds,protectedCat=false){const r=ser.parse(buf);if(!r)return [];const out=[];const mono=[];
 let linked=null,removedUi=false;
 if((ids?.size||uiIds?.size)&&r.little&&r.version>=17){try{linked=ser.parse(buf,{externals:true});}catch{}}
 for(const o of r.objects){
  if(o.type===49){const t=ser.textAsset(buf,o);
   if(protectedCat&&/^LineBreaking (Following|Leading) Characters$/.test(t?.name)&&t.text.length<=4096){
    const table=t.text.toString('utf8').trim();
    if(!/[\r\n]/.test(table)&&/[〔〕〈〉《》「」『』【】]{2}/.test(table))continue;
   }
   if(t&&t.text.length>=8&&hasScriptText(t.text,200000))out.push({name:t.name||label,bytes:Buffer.from(t.text)});}
  else if(o.type===114&&o.size>=12){
   if(linked){
    if(unityScript.references(buf,o,linked,uiIds)){removedUi=true;continue;}
    const table=unityScript.entry(buf,o,linked,ids);if(table){out.push(table);continue;}
   }
   let s;try{s=ser.strings(buf,o);}catch{continue;}for(const x of s)if(!noise(x))mono.push(x);}}
 if(mono.length>=2||(mono.length===1&&(removedUi||out.some(e=>e.kind==='i2'))))out.push({name:label+'#mono',kind:'mono',bytes:Buffer.from('\u0001MONO\n'+mono.join('\n'),'utf8')});
 return out;}

function wantNode(head){
 const r=ser.parse(head);if(!r)return false;
 let maxEnd=0;
 for(const o of r.objects)if(o.type===49||(o.type===114&&o.size>=12)){const e=o.offset+o.size;if(e>maxEnd)maxEnd=e;}
 return maxEnd||false;
}

const memo=new Map();
function index(dir,opts={}){const key=dir;const src=sources(dir);
 const sig=[...src.players,...src.bundles,...src.loose,...src.cat].map(f=>f+'|'+stat(f)).join('\n');
 const hit=memo.get(key);if(hit&&hit.sig===sig)return hit.scenes;
 const deadline=opts?.deadline||Infinity;let timedOut=false;
 const scenes=new Map();const add=(e,from)=>{let k=e.name.toLowerCase(),n=1,base=k;while(scenes.has(k))k=base+'~'+(++n);scenes.set(k,{name:e.name,read:()=>e.bytes,from,kind:e.kind});};
 const metadata=new Map(src.players.filter(f=>path.basename(f).toLowerCase()==='globalgamemanagers.assets').map(f=>[path.dirname(f),f]));
 const scripts=new Map(),protectedCat=protectedScenes(src.cat);
 for(const f of src.players){if(Date.now()>deadline){timedOut=true;break;}let sz=0;try{sz=fs.statSync(f).size;}catch{}if(sz>MAX_NODE*4||!sz)continue;let buf;try{buf=fs.readFileSync(f);}catch{continue;}
  const folder=path.dirname(f),meta=metadata.get(folder);
  if(meta&&!scripts.has(folder)){
   scripts.set(folder,null);
   try{if(meta===f||fs.statSync(meta).size<=MAX_NODE*4){const data=meta===f?buf:fs.readFileSync(meta);
    scripts.set(folder,{i2:unityScript.scriptIds(data),ui:protectedCat?unityScript.scriptIds(data,uiClasses):null});}}catch{}
  }
  const ids=scripts.get(folder);
  try{for(const e of entriesOf(buf,path.basename(f),ids?.i2,ids?.ui,protectedCat))add(e,f);}catch{}}
 if(!timedOut)for(const f of src.bundles){if(Date.now()>deadline){timedOut=true;break;}
  let nodes;try{nodes=ufs.readMatchingNodes(f,wantNode,MAX_NODE);}catch{nodes=null;}if(!nodes)continue;
  for(const node of nodes){try{for(const e of entriesOf(node.data,path.basename(f).replace(/_[0-9a-f]{32}\.bundle$/i,''),null,null,protectedCat))add(e,f);}catch{}}}
 if(!timedOut)for(const f of src.loose){if(Date.now()>deadline){timedOut=true;break;}let sz=0;try{sz=fs.statSync(f).size;}catch{}if(sz<8||sz>16<<20)continue;let buf;try{buf=fs.readFileSync(f);}catch{continue;}if(hasScriptText(buf,400000))add({name:path.basename(f).replace(/\.[^.]+$/,''),bytes:buf},f);}
 const list=[...scenes.values()].sort((a,b)=>a.name.localeCompare(b.name));if(!timedOut){memo.set(key,{sig,scenes:list});if(memo.size>6)memo.delete(memo.keys().next().value);}return list;}

/* ---- text → lines ------------------------------------------------------------------------------------------------ */
const speakerLike=s=>s.length<=24&&!/[。！？!?…「」『』]/.test(s);
function jsonLines(v,out){
 if(Array.isArray(v)){if(v.length&&v.every(x=>x&&typeof x==='object'&&!Array.isArray(x))&&v.some(x=>'Command' in x)){/* Fungus-style command list */
   for(const x of v){const c=String(x.Command||'');if(/^(Say|Text|Dialogue|Narrate|Print)$/i.test(c)){const t=[x.arg1,x.arg0,x.Text,x.text].find(y=>typeof y==='string'&&y&&CJK.test(y));
     const sp=typeof x.arg0==='string'&&x.arg0&&x.arg0!==t&&speakerLike(x.arg0)?x.arg0:'';if(t)out.push({text:t,speaker:sp});}
    else if(/^Menu$/i.test(c)){const t=x.arg1||x.arg0;if(typeof t==='string'&&CJK.test(t))out.push({text:t,speaker:'',choice:true});}}return;}
  for(const x of v)jsonLines(x,out);return;}
 if(v&&typeof v==='object'){const keys=Object.keys(v);
  /* a record with a text-like key reads as one line, its speaker-like key as the name */
  const tk=keys.find(k=>/^(text|message|msg|content|dialog(ue)?|line|sentence|words?|jp|ja|japanese|台词|文本|内容)$/i.test(k)&&typeof v[k]==='string'&&CJK.test(v[k]));
  if(tk){const sk=keys.find(k=>/^(name|speaker|actor|chara(cter)?|who|角色|人物)$/i.test(k)&&typeof v[k]==='string');out.push({text:v[tk],speaker:sk&&speakerLike(v[sk])?v[sk]:''});return;}
  for(const k of keys)jsonLines(v[k],out);return;}
 if(typeof v==='string'&&CJK.test(v)&&!noise(v)&&v.length>=2)out.push({text:v,speaker:''});}
function csvLines(text){const rows=text.split(/\r?\n/).filter(Boolean);if(rows.length<2)return null;const sep=rows[0].includes('\t')?'\t':rows[0].includes(',')?',':'';if(!sep)return null;
 const cells=rows.map(r=>{const out=[];let cur='',q=false;for(let i=0;i<r.length;i++){const c=r[i];if(q){if(c==='"'){if(r[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else if(c==='"')q=true;else if(c===sep){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;});
 const width=Math.max(...cells.map(r=>r.length));if(width<2)return null;
 /* the column with the most CJK-bearing long cells is the text, a short one before it the speaker */
 let best=-1,bestN=0;for(let c=0;c<width;c++){let n=0;for(const r of cells.slice(1))if(r[c]&&CJK.test(r[c])&&r[c].length>=3)n++;if(n>bestN){bestN=n;best=c;}}
 if(best<0||bestN<Math.max(2,(rows.length-1)*.15))return null;
 let sc=-1;for(let c=0;c<best;c++){let n=0,m=0;for(const r of cells.slice(1)){if(r[c]&&CJK.test(r[c])&&r[c].length<=12)n++;if(r[c])m++;}if(m&&n>=m*.5&&n>=3)sc=c;}
 return cells.slice(1).filter(r=>r[best]&&CJK.test(r[best])).map(r=>({text:r[best],speaker:sc>=0&&r[sc]&&speakerLike(r[sc])?r[sc]:''}));}
function textLines(text){return text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>=2&&CJK.test(l)&&!/^(\/\/|#|;)/.test(l)&&!noise(l)).map(l=>({text:l,speaker:''}));}
const clean=t=>t.replace(/<br\s*\/?>|\\n|\[n\]/gi,'\n').replace(/<\/?(?:color|size|b|i|ruby|rt|sprite)[^>]*>/gi,'').replace(/\[rb,([^,\]]*),[^\]]*\]/g,'$1').trim();
// These TextAssets store one displayed message between MesSta and MesEnd, sometimes across several lines.
function messageText(text, readings){
 return clean(text.replace(/%rbs([^%{}\n]+?)\{([^%{}\n]+)\}%rbe|%rbs([^%()\n]+?)\(([^%()\n]+)\)%rbe/g,
  (_,base,reading,altBase,altReading)=>{
   if(readings)readings.push([base||altBase,reading||altReading]);
   return base||altBase;
  }).replace(/%dot\(([^()]*)\)/g,'$1').replace(/%co\d+|%coe|%hos|%hoe/g,''));
}
function messageBlocks(text){
 const messages=[];
 let speaker='',parts=null,complete=false,cjk=0,letters=0;
 function flush(){
  if(parts&&parts.length){
   const readings=[],line=messageText(parts.join('\n'),readings);
   if(CJK.test(line))cjk++;
   if(/\p{L}/u.test(line))letters++;
   messages.push({line,speaker,readings});
   parts.length=0;
  }
 }
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();
  const name=/^#MesName\((.*)\)$/.exec(line);
  if(name){flush();speaker=messageText(name[1]).replace(/@s/g,' ');}
  else if(/^#MesSta\(.*\)$/.test(line)){flush();parts=[];}
  else if(line==='#MesEnd()'&&parts){flush();complete=true;}
  else if(parts&&line&&!/^(#|\/\/|;)/.test(line))parts.push(line);
 }
 flush();
 if(!complete||!messages.length)return null;
 const lines=[],speakers=[],ruby=[];
 for(const msg of messages){
  // Keep pauses such as 「……」 in CJK scripts. The same player can carry a separate English copy.
  if(!CJK.test(msg.line)&&!(cjk>0&&cjk*2>=letters&&/^[\p{P}\p{S}\s]+$/u.test(msg.line)))continue;
  lines.push(msg.line);speakers.push(msg.speaker);ruby.push(msg.readings.length?msg.readings:null);
 }
 const result={lines,anchors:[],speakers};
 if(ruby.some(Boolean))result.ruby=ruby;
 return result;
}
function parse(buf){
 let text=buf.toString('utf8');if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
 if(text.startsWith('\u0001I2\n')){
  try{
   const doc=JSON.parse(text.slice(4));
   if([doc.lines,doc.zh,doc.anchors].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string')))return doc;
  }catch{}
 }
 let rows=null;
 if(text.startsWith('\u0001MONO\n'))rows=text.slice(6).split('\n').map(t=>({text:t,speaker:''}));
 else{const t=text.trimStart();if(t[0]==='['||t[0]==='{'){try{rows=[];jsonLines(JSON.parse(t),rows);}catch{rows=null;}}
  if(!rows&&text.includes('#MesSta(')){const messages=messageBlocks(text);if(messages)return messages;}
  if(!rows||!rows.length)rows=csvLines(text);if(!rows||!rows.length)rows=textLines(text);}
 const lines=[],speakers=[];const seen=new Set();
 for(const r of rows||[]){const t=clean(r.text);if(!t||!CJK.test(t))continue;const sp=(r.speaker||'').replace(/^\d+_(?:[A-Za-z ]+_)?/,'');lines.push(sp?sp+'：'+t:t);speakers.push(sp);}
 return {lines,anchors:[],speakers};}
function originalLines(dir){
 const list=index(dir);
 if(!list.some(s=>s.kind==='i2'))return null;
 const result=[],known=new Set(),localized=new Map(),japanese=new Set(),unknown=new Set();
 for(const scene of list.filter(s=>s.kind==='i2')){
  const doc=parse(scene.read());localized.set(scene,doc.lines);
  for(const t of doc.lines){known.add(t);if(KANA.test(t))japanese.add(t);}
  for(const t of doc.zh)if(t)known.add(t);
 }
 for(const scene of list){
  if(localized.has(scene)){for(const line of localized.get(scene))result.push(line);continue;}
  for(const line of parse(scene.read()).lines){
   if(!known.has(line)&&!KANA.test(line)){
    // A loose script or TextAsset carries authored text. An untyped MonoBehaviour may also carry resource labels.
    if(scene.kind!=='mono')return null;
    unknown.add(line);
   }
   result.push(KANA.test(line)?line:'');
  }
 }
 // A small translated menu cannot establish the original for a larger, independent story.
 // Serialized objects can repeat the same resource label in hundreds of places.
 return japanese.size>unknown.size?result:null;
}
module.exports={id:'unity-assets',hint:'<游戏>_Data（TextAsset / MonoBehaviour / AssetBundle）',
 unsupported:dir=>fs.existsSync(path.join(dir,'CatSystem'))&&dataDirs(dir).length&&protectedScenes(catArchives(dir))?'CATSYSTEM_CSTX_ENCRYPTED':'',
 scenes:(dir,opts)=>index(dir,opts),archives:()=>[],sources:dir=>{const s=sources(dir);return [...s.players,...s.bundles,...s.loose,...s.cat];},
 parse,originalLines,patchLines:require('./fill.cjs').patchLines,test:()=>false,_internal:{entriesOf,jsonLines,csvLines,sources,wantNode,KANA}};
