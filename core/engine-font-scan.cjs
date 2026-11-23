// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E503 engine font readers for engines that never draw text through Windows (the E498 GDI/DirectWrite probe sees nothing
   there): Unity (Mono and IL2CPP; UGUI Font and TextMeshPro source fonts), MAGES (STEINS;GATE: a glyph atlas only) and
   Ren'Py (gui.text_font). Everything is read from the game's files, read-only, nothing is injected.
   Unity: a Font object keeps the whole TTF/OTF in m_FontData (a length-prefixed byte array), and a TMP_FontAsset keeps its
   source font the same way when the developer left "include font data" on; both are found by the sfnt header inside the
   serialized files (.assets, level*, AssetBundles through services/original-engines/unityfs.cjs). The dialogue font is the
   Japanese one (kana + kanji coverage) that is not a localisation font for another language (KR / SC / TC names) and not a
   decorative face (pixel, pop, hand-written); TMP assets with only an SDF atlas give their "<Name> SDF" names, looked up
   among the game's and Windows' fonts. MAGES: FONT.PNG in system.mpk is a pre-rendered atlas, no outline font ships; its
   stroke contrast (horizontal stroke thickness / vertical stroke thickness) tells mincho from gothic. Ren'Py: gui.rpy /
   options.rpy (loose, compiled .rpyc, or inside .rpa archives) name the font file. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {tables,cmap}=require('./font-map.cjs');
const {allNames,familyName}=require('./game-fonts.cjs');

/* --- sfnt inside a buffer --- */
function sfntEnd(b,o){
 if(o+12>b.length)return 0;const tag=b.readUInt32BE(o);if(tag!==0x00010000&&tag!==0x4f54544f)return 0;
 const n=b.readUInt16BE(o+4);if(n<4||n>48||b.readUInt16BE(o+6)!==16*(1<<Math.floor(Math.log2(n))))return 0;
 let end=0;const tags=[];for(let i=0;i<n;i++){const r=o+12+i*16;if(r+16>b.length)return 0;const t=b.toString('latin1',r,r+4);if(!/^[A-Za-z0-9 \/]{4}$/.test(t))return 0;tags.push(t);end=Math.max(end,b.readUInt32BE(r+8)+b.readUInt32BE(r+12));}
 return tags.includes('cmap')&&tags.includes('name')&&end>=1024?end:0;}
const SIGS=[Buffer.from([0,1,0,0]),Buffer.from('OTTO')];
/* every embedded font of a buffer: Unity writes the array length just before the data, which is the exact size */
function fontsIn(b){const out=[];for(const sig of SIGS){let p=0;while((p=b.indexOf(sig,p))>=0){const end=sfntEnd(b,p);if(end){const pre=p>=4?b.readUInt32LE(p-4):0;const len=pre>=end&&pre<end+8&&p+pre<=b.length?pre:end;if(p+len<=b.length){out.push(b.subarray(p,p+len));p+=len;continue;}}p++;}}return out;}
/* the same over a large file, chunk by chunk */
function fontsInFile(file,limit=2**31){const out=[];let fd;try{fd=fs.openSync(file,'r');const size=Math.min(fs.fstatSync(fd).size,limit),CH=64<<20,OV=1024;
 for(let at=0;at<size;at+=CH){const n=Math.min(CH+OV,size-at),b=Buffer.alloc(n);fs.readSync(fd,b,0,n,at);
  for(const sig of SIGS){let p=0;while((p=b.indexOf(sig,p))>=0&&p<CH){const end=p+800<=n?sfntEnd(b,p):0;if(end){const pre=p>=4?b.readUInt32LE(p-4):0;const len=pre>=end&&pre<end+8?pre:end;if(len<=80<<20&&at+p+len<=size){const f=Buffer.alloc(len);fs.readSync(fd,f,0,len,at+p);out.push(f);}}p++;}}}
 }catch{}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}}return out;}

function coverage(buf){let kana=0,kanji=0,hangul=0;try{const m=cmap(tables(buf));for(let c=0x3041;c<0x30fb;c++)if(m.has(c))kana++;for(let c=0x4e00;c<0x9fa0;c+=1)if(m.has(c))kanji++;for(let c=0xac00;c<0xac00+400;c++)if(m.has(c))hangul++;}catch{}return {kana,kanji,hangul};}
const OTHER_LANG=/(^|[^a-z])(kr|korean|sc|tc|hk|cn|chs|cht|gb|big5|hans|hant)([^a-z]|$)|简|繁|體|韓|한|仿宋|黑体|宋体|楷体|Source Han (Sans|Serif) (K|SC|TC|HC)\b/i;
const JP_NAME=/(^|[^a-z])(jp|ja|jpn|japanese)([^a-z]|$)|日本|ゴシック|明朝|mincho|gothic|ming|go$/i;
const DECOR=/pixel|pop|tegaki|手書|hand|dos|vga|cute|comic|brush|毛筆|ポップ|雑|marker|pen|kids|chalk|grunge|ドット|dot|8x|12x|mplus10|10$/i;
/* score of one font as the dialogue font; null when it cannot draw Japanese text */
function score(names,cov,hint=''){
 if(cov.kana<80||cov.kanji<1500)return null;const all=names.join(' ')+' '+hint;
 if(OTHER_LANG.test(all)&&!JP_NAME.test(all))return null;
 return (JP_NAME.test(all)?20:0)-(DECOR.test(all)?30:0)+Math.min(cov.kanji,21000)/1000;}
function candidate(buf,source,hint=''){const names=allNames(buf),cov=coverage(buf),s=score(names,cov,hint);return {family:familyName(buf)||names[0]||'',names,source,score:s,...cov,data:buf};}

/* --- Unity --- */
function unityData(root){try{for(const n of fs.readdirSync(root))if(/_Data$/i.test(n)&&fs.existsSync(path.join(root,n,'globalgamemanagers')))return path.join(root,n);}catch{}return '';}
function walk(dir,test,max=4000,out=[]){let list;try{list=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}for(const e of list){if(out.length>=max)break;const f=path.join(dir,e.name);if(e.isDirectory())walk(f,test,max,out);else if(test(e.name,f))out.push(f);}return out;}
/* "<Name> SDF" TMP font asset names (length-prefixed strings) */
function sdfNames(buf){const out=new Set();const re=/([A-Za-z0-9][A-Za-z0-9 _\-+.]{2,60}?)[ _-]SDF/g;const s=buf.toString('latin1');let m;while((m=re.exec(s))&&out.size<64)out.add(m[1].trim());return [...out];}
function unity(root,data){
 const ufs=require('../services/original-engines/unityfs.cjs');const found=[],sdf=new Set();
 const serialized=fs.readdirSync(data).filter(n=>/^(resources\.assets|sharedassets\d+\.assets|level\d+|globalgamemanagers\.assets)$/i.test(n)).map(n=>path.join(data,n));
 for(const f of serialized){for(const b of fontsInFile(f))found.push(candidate(b,path.basename(f)));}
 const stream=path.join(data,'StreamingAssets');let bundles=walk(stream,(n,f)=>/\.bundle$|\.unity3d$|\.ab$/i.test(n)&&/font|tmp/i.test(path.relative(stream,f)),200);
 if(!bundles.length&&!found.some(c=>c.score!==null))bundles=walk(stream,n=>/\.bundle$|\.unity3d$/i.test(n),400).filter(f=>{try{return fs.statSync(f).size<40<<20;}catch{return false;}});
 let budget=1.5*(1<<30);
 for(const f of bundles){let size=0;try{size=fs.statSync(f).size;}catch{continue;}if(size>200<<20||(budget-=size)<0)continue;let nodes;try{nodes=ufs.read(f);}catch{continue;}
  for(const nd of nodes){const fonts=fontsIn(nd.data);for(const b of fonts)found.push(candidate(Buffer.from(b),path.basename(f),path.basename(f)));if(!/\.res/i.test(nd.name))for(const n of sdfNames(nd.data))sdf.add(n);}}
 if(!found.some(c=>c.score!==null))for(const f of serialized){try{if(fs.statSync(f).size<300<<20)for(const n of sdfNames(fs.readFileSync(f)))sdf.add(n);}catch{}}
 return {found,sdf:[...sdf]};}

/* --- MAGES --- */
function png(buf){if(buf.readUInt32BE(0)!==0x89504e47)throw Error('NOT_PNG');let p=8,w=0,h=0,depth=0,type=0;const idat=[];
 while(p<buf.length){const n=buf.readUInt32BE(p),t=buf.toString('latin1',p+4,p+8),d=buf.subarray(p+8,p+8+n);if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);depth=d[8];type=d[9];}else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;p+=12+n;}
 if(depth!==8||![0,2,4,6].includes(type))throw Error('PNG_FORMAT');const bpp={0:1,2:3,4:2,6:4}[type],raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*bpp,out=Buffer.alloc(w*h),row=Buffer.alloc(stride),prev=Buffer.alloc(stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],src=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
  for(let x=0;x<stride;x++){const a=x>=bpp?row[x-bpp]:0,b=prev[x],c=x>=bpp?prev[x-bpp]:0;let v=src[x];
   if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}row[x]=v&255;}
  for(let x=0;x<w;x++){const o=x*bpp;out[y*w+x]=type===6?row[o+3]:type===4?row[o+1]:type===2?(row[o]+row[o+1]+row[o+2])/3|0:row[o];}row.copy(prev);}
 /* atlases are white glyphs on transparency (alpha) or black on white (grey): ink = the minority side */
 let dark=0;for(let i=0;i<out.length;i+=97)if(out[i]<128)dark++;if(dark<out.length/97/2)for(let i=0;i<out.length;i++)out[i]=255-out[i];
 return {w,h,ink:out};}
/* stroke contrast of a glyph atlas, from anti-aliased ink sums along every other row and column: the median ink of a
   vertical crossing (through horizontal strokes, plus the long runs of mincho's thick ends) over that of a horizontal one.
   Calibrated on GDI renders (2026-11-13): Mincho (MS / Yu / BIZ UD) 1.15-1.84, Gothic (MS / Yu / Meiryo / BIZ UD) 0.58-0.77. */
function strokeStats(img){const {w,h,ink}=img,v=i=>(255-ink[i])/255,hr=[],vr=[];
 const run=(get,len,lines,out)=>{for(let a=0;a<lines;a+=2){let sum=0,n=0;for(let b=0;b<len;b++){const x=get(a,b);if(x>0.08){sum+=x;n++;}else{if(n>0)out.push(sum);sum=0;n=0;}}}};
 run((y,x)=>v(y*w+x),w,h,hr);run((x,y)=>v(y*w+x),h,w,vr);
 const median=a=>{a=a.filter(x=>x>=0.8).sort((x,y)=>x-y);return a[a.length>>1]||0;};const vt=median(vr),ht=median(hr);
 return {horizontalStroke:+vt.toFixed(2),verticalStroke:+ht.toFixed(2),ratio:ht?+(vt/ht).toFixed(3):0};}
function atlasFamily(stats){return stats.ratio>=0.95?'mincho':'gothic';}
function mages(root){const ma=require('../services/original-engines/mages.cjs');const dirs=[root,path.join(root,'USRDIR')];
 for(const d of dirs){const sys=path.join(d,'system.mpk');if(!fs.existsSync(sys))continue;const list=ma._internal.mpkList(sys)||[];
  const e=list.find(x=>/^font\.png$/i.test(x.name))||list.find(x=>/^font.*\.png$/i.test(x.name));if(!e)continue;
  const img=png(ma._internal.mpkRead(sys,e)),stats=strokeStats(img);return {atlas:e.name,size:[img.w,img.h],...stats,family:atlasFamily(stats)};}
 return null;}

/* --- Ren'Py --- */
/* E580 the RPA index, pickle decoder and .rpyc slots come from the Ren'Py script reader (renpy-rpyc.cjs) */
const rpyc=require('../services/original-engines/renpy-rpyc.cjs'),{unpickle,rpaIndex,rpaRead}=rpyc;
/* the font a Ren'Py script assigns to dialogue text: gui.text_font, else style.default.font / gui.default_font */
const FONT_KEYS=['text_font','default_font','interface_text_font','name_text_font'];
function fontsInScript(text){const out=[];for(const key of FONT_KEYS){const re=new RegExp('(?:gui\\.|define\\s+gui\\.|style\\.default\\.)?'+key+'\\s*=\\s*[\'"]([^\'"]+\\.(?:ttf|otf|ttc))[\'"]','gi');let m;while((m=re.exec(text)))out.push({key,file:m[1]});}
 const st=/style\.default\.font\s*=\s*['"]([^'"]+\.(?:ttf|otf|ttc))['"]/i.exec(text);if(st)out.push({key:'default_font',file:st[1]});return out;}
/* compiled .rpyc (RENPY RPC2 slots of zlib pickles): the variable name and its expression string sit next to each other */
function fontsInRpyc(buf){let data=buf;try{data=rpyc.data(buf,{all:true})||buf;}catch{}
 const s=data.toString('latin1'),out=[];for(const key of FONT_KEYS){let i=-1;while((i=s.indexOf(key,i+1))>=0){const m=/['"]([^'"\x00]{1,120}\.(?:ttf|otf|ttc))['"]/i.exec(s.slice(i,i+600));if(m){out.push({key,file:m[1]});break;}}}return out;}
function renpy(root){const game=path.join(root,'game');if(!fs.existsSync(game))return null;const scripts=[],files=new Map(),archives=[];
 for(const f of walk(game,n=>/\.(rpy|rpyc|rpa|ttf|otf|ttc)$/i.test(n),3000)){const rel=path.relative(game,f).replace(/\\/g,'/');if(/\.rpa$/i.test(f))archives.push(f);else if(/\.rpyc?$/i.test(f)){if(/(^|\/)(gui|options|screens|styles?|font[^/]*)\.rpyc?$/i.test(rel))scripts.push({rel,read:()=>fs.readFileSync(f)});}else files.set(rel.toLowerCase(),{rel,read:()=>fs.readFileSync(f)});}
 for(const a of archives){let idx;try{idx=rpaIndex(a);}catch{continue;}if(!idx)continue;for(const [name,e] of idx){const rel=name.replace(/\\/g,'/');if(/(^|\/)(gui|options|screens|styles?|font[^/]*)\.rpyc?$/i.test(rel)&&!scripts.some(s=>s.rel===rel))scripts.push({rel,read:()=>rpaRead(a,e)});else if(/\.(ttf|otf|ttc)$/i.test(rel)&&!files.has(rel.toLowerCase()))files.set(rel.toLowerCase(),{rel,read:()=>rpaRead(a,e)});}}
 /* source .rpy first (what the developer wrote), then compiled */
 scripts.sort((a,b)=>(/\.rpy$/i.test(a.rel)?0:1)-(/\.rpy$/i.test(b.rel)?0:1)||(/gui/i.test(a.rel)?0:1)-(/gui/i.test(b.rel)?0:1));
 const named=[];for(const s of scripts){try{const buf=s.read();named.push(...(/\.rpy$/i.test(s.rel)?fontsInScript(buf.toString('utf8')):fontsInRpyc(buf)));}catch{}}
 named.sort((a,b)=>FONT_KEYS.indexOf(a.key)-FONT_KEYS.indexOf(b.key));
 const resolve=name=>{const n=name.replace(/\\/g,'/').toLowerCase();return files.get(n)||[...files.values()].find(f=>f.rel.toLowerCase().endsWith('/'+n)||path.posix.basename(f.rel).toLowerCase()===path.posix.basename(n));};
 return {named,files:[...files.values()],resolve};}

/* --- KiriKiri --- */
/* 2026-11-19 (千恋＊万花: "未发现可导入的游戏字体文件" and MeguLit drew a default face): KiriKiri keeps its fonts inside the
   xp3 archives, encrypted by the title's cx filter, and KAG games draw dialogue with pre-rendered glyph files
   (mapPrerenderedFont, <name>_<size>.tft) as often as with outline fonts. Font entries are read with the game's filter
   (cx-filter.cjs); outline fonts are imported as they are; the pre-rendered family with the most sizes (the dialogue
   font: 千恋＊万花 font1_10..56 "スキップ", against headfont_20..36) is turned into an outline font from its largest size
   (core/prerendered-font.cjs). Only this PC's cache is written; nothing is shared. */
function krkrArchives(root){let list=[];try{list=fs.readdirSync(root).filter(n=>/\.xp3$/i.test(n));}catch{}
 /* KiriKiri mounts patch*.xp3 over data.xp3: a later patch wins for the same name */
 return list.sort((a,b)=>(/^patch/i.test(a)?1:0)-(/^patch/i.test(b)?1:0)||a.localeCompare(b)).map(n=>path.join(root,n));}
function krkrText(buf){if(buf.length>5&&buf[0]===0xfe&&buf[1]===0xfe&&buf[3]===0xff&&buf[4]===0xfe){const mode=buf[2],d=buf.subarray(5);
  if(mode===2){try{return zlib.inflateSync(d.subarray(16)).toString('utf16le');}catch{return '';}}let out='';for(let i=0;i+1<d.length;i+=2){let c=d.readUInt16LE(i);if(mode===1)c=((c&0xaaaa)>>1)|((c&0x5555)<<1);else if(c>=0x20)c^=((c&0xfe)<<8)^1;out+=String.fromCharCode(c);}return out;}
 if(buf[0]===0xff&&buf[1]===0xfe)return buf.toString('utf16le',2);if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return buf.toString('utf8',3);return '';}
function kirikiri(root,{match=true}={}){
 const xp3=require('../services/original-engines/xp3.cjs'),entries=new Map(),notes=[];let filters=0;
 for(const file of krkrArchives(root)){let l;try{l=xp3.list(file);}catch{continue;}if(!l)continue;
  const wanted=l.files.filter(e=>/\.(ttf|otf|ttc|otc|tft|tjs)$/i.test(e.name)&&(/\.(tft|ttf|otf|ttc|otc)$/i.test(e.name)||/font/i.test(e.name))&&e.size>0&&e.size<=80<<20);if(!wanted.length)continue;
  let decrypt;if(wanted.some(e=>e.encrypted)){decrypt=require('../services/original-engines/cx-filter.cjs').forArchive(file);if(decrypt)filters++;else notes.push(path.basename(file)+' encrypted, no known filter');}
  for(const e of wanted)if(!e.encrypted||decrypt)entries.set(e.name.toLowerCase(),{archive:file,entry:e,decrypt});}
 const read=v=>{try{return xp3.read(v.archive,v.entry,v.decrypt);}catch{return null;}};const label=v=>path.basename(v.archive)+' › '+v.entry.name;
 /* outline fonts as they are */
 const outline=[];for(const v of entries.values()){if(!/\.(ttf|otf|ttc|otc)$/i.test(v.entry.name))continue;const b=read(v);if(!b)continue;
  const faces=b.toString('latin1',0,4)==='ttcf'?require('./game-fonts.cjs').collectionFaces(b):[b];for(const f of faces)if(sfntEnd(f,0))outline.push(candidate(f,label(v),v.entry.name));}
 /* pre-rendered families: <base>_<size>.tft */
 const families=new Map();for(const v of entries.values()){const m=/^(.*?)_?(\d+)\.tft$/i.exec(v.entry.name);if(!m)continue;const base=m[1].toLowerCase();const f=families.get(base)||{base:m[1],sizes:[]};f.sizes.push({size:Number(m[2]),v});families.set(base,f);}
 /* the dialogue family: not a UI one (system / header / ruby / name / number), most sizes, largest size, most bytes */
 const ui=f=>/(^|[\/_])(sys|system|head|header|ruby|name|num|number|small|mini)/i.test(f.base)?1:0,top=f=>Math.max(...f.sizes.map(s=>s.size)),bytes=f=>Math.max(...f.sizes.map(s=>s.v.entry.size));
 const ranked=[...families.values()].sort((a,b)=>ui(a)-ui(b)||b.sizes.length-a.sizes.length||top(b)-top(a)||bytes(b)-bytes(a));
 let prerendered=null;
 if(ranked.length){const fam=ranked[0],big=fam.sizes.sort((a,b)=>b.size-a.size)[0];
  /* the name the game's own font list gives the family ("name"=>"スキップ", "file"=>"font1_${size}.tft"), else the file base */
  let name='';const stem=path.posix.basename(fam.base.split(String.fromCharCode(92)).join('/'));
  for(const v of entries.values()){if(!/\.tjs$/i.test(v.entry.name))continue;const b=read(v);if(!b)continue;const text=krkrText(b);
   for(const line of text.split(/\r?\n/)){if(line.toLowerCase().indexOf('"'+stem.toLowerCase()+'_')<0&&line.toLowerCase().indexOf("'"+stem.toLowerCase()+'_')<0)continue;const m=/["']name["']\s*=>\s*["']([^"']{1,40})["']/.exec(line);if(m&&!/^\*/.test(m[1])){name=m[1];break;}}if(name)break;}
  prerendered={family:name||stem,source:label(big.v),sizes:fam.sizes.map(s=>s.size).sort((a,b)=>a-b),others:ranked.slice(1).map(f=>f.base)};
  if(match){const b=read(big.v),sm=b&&require('./prerendered-font.cjs').sample(b);if(sm){prerendered.sample=sm;prerendered.glyphs=sm.total;prerendered.cell=sm.cell;}else notes.push(label(big.v)+' gave no glyph sample');}}
 return {outline,prerendered,notes,filters,archives:krkrArchives(root).length};}

/* --- any other engine's archives (GARbro) --- */
/* 2026-11-19 fonts packed by engines MeguLit has no own reader for: GARbro (the on-demand "archives" pack, used here only
   when already installed) extracts the font entries of up to 8 archives into this PC's cache. */
function garbroArchives(root){try{const g=require('../services/original-engines/garbro.cjs');return g.installed()?g.archives(root).filter(f=>!/\.xp3$/i.test(f)).slice(0,8):[];}catch{return [];}}
function garbroFonts(root,dir){const g=require('../services/original-engines/garbro.cjs'),found=[];
 for(const a of garbroArchives(root)){const out=path.join(dir,'archive-'+crypto.createHash('sha256').update(a.toLowerCase()).digest('hex').slice(0,10));
  for(const f of g.extractMatchSync(a,out,'\\.(ttf|otf|ttc|otc)$')){let b;try{b=fs.readFileSync(f);}catch{continue;}const faces=b.toString('latin1',0,4)==='ttcf'?require('./game-fonts.cjs').collectionFaces(b):[b];
   for(const face of faces)if(sfntEnd(face,0))found.push(candidate(face,path.basename(a)+' › '+path.relative(out,f).split(path.sep).join('/'),path.basename(f)));}}
 return found;}
/* a pre-rendered sample this close to a real font is that font (MAGES: the right face 0.90 against 0.855 for the next) */
const RECOGNISED=0.9;
/* --- entry --- */
function engineOf(root){if(unityData(root))return 'unity';if(krkrArchives(root).length)return 'kirikiri';if(garbroArchives(root).length)return 'archive';if(['','USRDIR'].some(d=>fs.existsSync(path.join(root,d,'system.mpk'))))return 'mages';if(fs.existsSync(path.join(root,'game'))&&(fs.existsSync(path.join(root,'renpy'))||walk(path.join(root,'game'),n=>/\.(rpa|rpyc)$/i.test(n),1).length))return 'renpy';return '';}
const safe=s=>String(s||'font').replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,40)||'font';
function save(dir,c,tag){fs.mkdirSync(dir,{recursive:true});const id=crypto.createHash('sha256').update(c.data).digest('hex').slice(0,10);const file=path.join(dir,tag+'-'+safe(c.family)+'-'+id+(c.score===null?'.zh':'.jp')+(c.data.readUInt32BE(0)===0x4f54544f?'.otf':'.ttf'));if(!fs.existsSync(file))fs.writeFileSync(file,c.data);return file;}
/* Scan one game folder. Returns {engine, face, family?, files:[font files to import], reason, candidates} or null. */
function scan(root,cacheDir,{matcher}={}){const engine=engineOf(root);if(!engine)return null;const dir=path.join(cacheDir,crypto.createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0,12));
 if(engine==='unity'){const {found,sdf}=unity(root,unityData(root));const seen=new Set(),list=found.filter(c=>{const k=c.data.length+':'+c.family;if(seen.has(k))return false;seen.add(k);return true;});
  const ranked=list.filter(c=>c.score!==null).sort((a,b)=>b.score-a.score);const candidates=list.map(c=>({family:c.family,source:c.source,kana:c.kana,kanji:c.kanji,score:c.score}));
  if(ranked.length){const best=ranked[0];return {engine,face:best.family,files:[save(dir,best,'unity')],reason:'embedded '+best.source,candidates};}
  const tmp=sdf.filter(n=>!/^(liberation ?sans|arial|tinos)$/i.test(n));const jp=tmp.find(n=>JP_NAME.test(n)&&!OTHER_LANG.test(n))||tmp.find(n=>!OTHER_LANG.test(n)&&!DECOR.test(n));
  return jp?{engine,face:jp.replace(/[-_ ](regular|medium|bold|r|m|b)$/i,'').replace(/([a-z])([A-Z])/g,'$1 $2'),files:[],reason:'tmp sdf name',candidates,sdf:tmp}:{engine,face:'',files:[],reason:'no japanese font',candidates,sdf:tmp};}
 if(engine==='mages'){const m=mages(root);if(!m)return {engine,face:'',files:[],reason:'no atlas'};/* E532: the closest installed face, drawn glyph by glyph against the atlas (core/mages-font.cjs + services/font-match.ps1);
   the stroke-ratio family stays the fallback when nothing installed scores >= 0.8. */
  let near={face:''};try{const mf=require('./mages-font.cjs'),job=mf.sample(root);if(job)near={...mf.closest(mf.matchSync(job,dir)),size:job.cell};}catch{}
  return {engine,face:near.face||'',family:m.family,bold:near.face?near.bold:undefined,size:near.size,files:[],reason:'atlas '+m.atlas+' stroke ratio '+m.ratio.toFixed(2)+(near.face?' ~ '+near.face+' '+near.score:''),atlas:m,candidates:near.candidates};}
 if(engine==='kirikiri'){const k=kirikiri(root);const files=[],seen=new Set();
  /* every Japanese outline font becomes a choice and one Chinese font (a Chinese edition's own) serves the translation.
     Every imported font is sent to the reader as font data (千恋＊万花 offered 42 MB): faces up to 8 MB, two Japanese
     ones (one beside a pre-rendered dialogue font), one Chinese. */
  const small=c=>c.data.length<=8<<20,ja=k.outline.filter(c=>c.score!==null&&small(c)).sort((a,b)=>b.score-a.score).slice(0,k.prerendered?1:2),zh=k.outline.filter(c=>c.score===null&&small(c)&&c.kanji>=1500&&OTHER_LANG.test(c.names.join(' ')+' '+c.source)).slice(0,1);
  const labels={};for(const c of [...ja,...zh]){const key=c.data.length+':'+c.family;if(seen.has(key))continue;seen.add(key);const f=save(dir,c,'krkr');files.push(f);labels[f]=c.source;}
  const candidates=k.outline.map(c=>({family:c.family,source:c.source,kana:c.kana,kanji:c.kanji,score:c.score}));
  /* 2026-11-19 (user: 别描边): a pre-rendered dialogue font is recognised, not copied. Its glyphs are drawn against every
     installed family and the game's own outline fonts (services/font-match.ps1); the closest real font is used. At
     RECOGNISED or above it is taken as the game's face, below it is the closest one and the panel says so. */
  if(k.prerendered){const p=k.prerendered;let match=null;
   if(p.sample){/* every Japanese face of the game is a candidate; the one that matches is imported whatever its size */const pool=k.outline.filter(c=>c.score!==null&&c.data.length<=40<<20).map(c=>({c,file:save(dir,c,'krkr')}));
    try{const list=(matcher||require('./mages-font.cjs').matchSync)({chars:p.sample.chars,glyphs:p.sample.glyphs,files:pool.map(x=>x.file)},dir),best=list[0];
     if(best){const from=pool.find(x=>x.file&&best.file&&x.file.toLowerCase()===String(best.file).toLowerCase());
      match={family:best.family,style:best.style||'',score:best.score,recognized:best.score>=RECOGNISED,source:from?from.c.source:'',candidates:list.slice(0,5).map(x=>({family:x.family,style:x.style,score:x.score,game:!!x.file}))};
      if(from&&!files.includes(from.file)){files.unshift(from.file);labels[from.file]=from.c.source;}}}catch{}}
   const why='pre-rendered '+p.source+' ('+(p.glyphs||0)+' glyphs, sizes '+p.sizes.join('/')+')'+(match?(match.recognized?' recognised as ':' closest ')+match.family+' '+match.score.toFixed(3):' no match');
   return {engine,face:match?match.family:'',bold:match?match.style==='Bold':undefined,files,labels,reason:why,prerendered:{family:p.family,source:p.source,sizes:p.sizes,glyphs:p.glyphs,cell:p.cell,others:p.others},match,candidates,notes:k.notes,archives:k.archives};}
  if(ja.length)return {engine,face:ja[0].family,files,labels,reason:'bundled '+ja[0].source,candidates,notes:k.notes,archives:k.archives};
  return {engine,face:'',files,labels,reason:k.archives?'no font in '+k.archives+' archives':'no archives',candidates,notes:k.notes,archives:k.archives};}
 if(engine==='archive'){const found=garbroFonts(root,dir),labels={},files=[];const ja=found.filter(c=>c.score!==null).sort((a,b)=>b.score-a.score).slice(0,2);
  for(const c of ja){const f=save(dir,c,'archive');files.push(f);labels[f]=c.source;}
  const candidates=found.map(c=>({family:c.family,source:c.source,kana:c.kana,kanji:c.kanji,score:c.score}));
  return ja.length?{engine,face:ja[0].family,files,labels,reason:'bundled '+ja[0].source,candidates}:{engine,face:'',files,labels,reason:found.length?'no japanese font in the archives':'no font in the archives',candidates};}
 if(engine==='renpy'){const r=renpy(root);if(!r)return null;for(const n of r.named){const f=r.resolve(n.file);if(!f)continue;let buf;try{buf=f.read();}catch{continue;}const c=candidate(buf,f.rel);if(c.kana<80)continue;return {engine,face:c.family,files:[save(dir,c,'renpy')],reason:'gui.'+n.key+' = '+n.file,named:r.named};}
  /* no script names a Japanese font: the Japanese font file the game ships (game-fonts' own scan imports loose ones) */
  for(const f of r.files){let buf;try{buf=f.read();}catch{continue;}const c=candidate(buf,f.rel);if(c.score===null)continue;return {engine,face:c.family,files:[save(dir,c,'renpy')],reason:'bundled '+f.rel,named:r.named};}
  return {engine,face:'',files:[],reason:'no japanese font',named:r.named};}
 return null;}
/* cached per game folder (a Unity scan reads hundreds of MB once) */
function cached(root,cacheDir,force=false){const file=path.join(cacheDir,'engine-font-scan.json');let all={};try{all=JSON.parse(fs.readFileSync(file,'utf8'))||{};}catch{}const key=root.toLowerCase();const hit=all[key];
 if(!force&&hit&&hit.version===3&&(hit.files||[]).every(f=>fs.existsSync(f)))return hit;const result=scan(root,cacheDir);if(!result)return null;const keep={version:3,...result};
 try{fs.mkdirSync(cacheDir,{recursive:true});all[key]=keep;fs.writeFileSync(file,JSON.stringify(all,null,1));}catch{}return keep;}
/* run in a worker thread so the reader service keeps answering while hundreds of MB are read */
function inWorker(root,cacheDir,force=false){return new Promise(resolve=>{try{const {Worker}=require('node:worker_threads');const w=new Worker(__filename,{workerData:{engineFontScan:{root,cacheDir,force}}});let done=false;const end=v=>{if(!done){done=true;resolve(v);}};w.once('message',end);w.once('error',()=>end(null));w.once('exit',()=>end(null));}catch{resolve(null);}});}
{const wt=require('node:worker_threads');if(!wt.isMainThread&&wt.workerData&&wt.workerData.engineFontScan){const {root,cacheDir,force}=wt.workerData.engineFontScan;let r=null;try{r=cached(root,cacheDir,force);}catch{}wt.parentPort.postMessage(r);}}
module.exports={inWorker,scan,cached,engineOf,kirikiri,krkrText,RECOGNISED,sfntEnd,fontsIn,score,strokeStats,atlasFamily,png,unpickle,fontsInScript,fontsInRpyc,sdfNames};
