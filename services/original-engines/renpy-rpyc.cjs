// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* E566 Ren'Py games that ship no .rpy sources: compiled .rpyc scripts, loose or inside .rpa archives (most commercial
   and Steam Ren'Py releases). Formats as Ren'Py itself writes them (renpy/loader.py, renpy/script.py, MIT):
     RPA-3.0 <offset hex16> <key hex8>\n   index at offset: zlib(pickle({name: [(offset^key, length^key, prefix)]}))
     RPA-3.2 <offset> <key> ...            same, the key is the last hex field
     RPA-2.0 <offset hex16>\n              no key
     .rpyc  "RENPY RPC2" then {u32 slot, u32 start, u32 length} until slot 0; slot 1 = zlib(pickle((data, stmts)))
            (very old games: the whole file is zlib(pickle))
   The pickle (protocol 2 for Ren'Py 6/7, up to 5 for Ren'Py 8) is decoded by the small VM below into plain objects
   {__class:'renpy.ast.Say', ...state}; nothing is ever executed. Lines are the Say / TranslateSay `what` strings and
   the menu choices, in statement order; each keeps the translate identifier the compiler gave it, which is how a
   tl/<language> translation (also compiled) pairs with it when its .rpy sources are absent. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');

/* ---- pickle VM ------------------------------------------------------------------------------------------------- */
class PyObj{constructor(cls){this.__class=cls;}}
const MARK=Symbol('mark');
function unpickle(b){const st=[],memo=new Map();let p=0;
 const pop=()=>st.pop(),popMark=()=>{let i=st.length-1;while(i>=0&&st[i]!==MARK)i--;const items=st.splice(i+1);st.pop();return items;};
 const u32=()=>{const v=b.readUInt32LE(p);p+=4;return v;},bytes=n=>{const v=b.subarray(p,p+n);p+=n;return v;};
 const line=()=>{const e=b.indexOf(10,p);const s=b.toString('latin1',p,e);p=e+1;return s;};
 const setState=(o,state)=>{if(!o||typeof o!=='object')return;let dict=state,slots=null;if(Array.isArray(state)&&state.length===2&&state.tuple){dict=state[0];slots=state[1];}
  for(const d of [dict,slots])if(d instanceof Map)for(const [k,v] of d)o[String(k)]=v;};
 const tuple=a=>Object.assign(a,{tuple:true});
 while(p<b.length){const op=b[p++];switch(op){
  case 0x80:p++;break;/* PROTO */case 0x95:p+=8;break;/* FRAME */case 0x2e:return st.pop();/* STOP */
  case 0x28:st.push(MARK);break;
  case 0x29:st.push(tuple([]));break;case 0x5d:st.push([]);break;case 0x7d:st.push(new Map());break;case 0x8f:st.push(new Set());break;
  case 0x4e:st.push(null);break;case 0x88:st.push(true);break;case 0x89:st.push(false);break;
  case 0x4a:st.push(b.readInt32LE(p));p+=4;break;case 0x4b:st.push(b[p++]);break;case 0x4d:st.push(b.readUInt16LE(p));p+=2;break;
  case 0x8a:{const n=b[p++];let v=0n;for(let i=n-1;i>=0;i--)v=(v<<8n)|BigInt(b[p+i]);if(n&&b[p+n-1]&0x80)v-=1n<<BigInt(8*n);st.push(v>=-9007199254740991n&&v<=9007199254740991n?Number(v):v);/* #247 big XOR keys stay exact */p+=n;break;}
  case 0x8b:{const n=u32();p+=n;st.push(0);break;}/* LONG4: never a text field */
  case 0x47:st.push(b.readDoubleBE(p));p+=8;break;
  case 0x49:{const s=line();st.push(s==='01'?true:s==='00'?false:Number(s));break;}case 0x4c:st.push(Number(line().replace(/L$/,'')));break;
  case 0x46:st.push(Number(line()));break;
  case 0x53:{const s=line();st.push(s.replace(/^['"]|['"]$/g,''));break;}case 0x56:st.push(line());break;
  case 0x58:{const n=u32();st.push(b.toString('utf8',p,p+n));p+=n;break;}
  case 0x8c:{const n=b[p++];st.push(b.toString('utf8',p,p+n));p+=n;break;}
  case 0x8d:{const n=Number(b.readBigUInt64LE(p));p+=8;st.push(b.toString('utf8',p,p+n));p+=n;break;}
  case 0x54:case 0x42:{const n=u32();st.push(Buffer.from(bytes(n)));break;}
  case 0x55:case 0x43:{const n=b[p++];st.push(Buffer.from(bytes(n)));break;}
  case 0x8e:{const n=Number(b.readBigUInt64LE(p));p+=8;st.push(Buffer.from(bytes(n)));break;}
  case 0x96:{const n=Number(b.readBigUInt64LE(p));p+=8;st.push(Buffer.from(bytes(n)));break;}
  case 0x85:st.push(tuple([pop()]));break;case 0x86:{const y=pop(),x=pop();st.push(tuple([x,y]));break;}case 0x87:{const z=pop(),y=pop(),x=pop();st.push(tuple([x,y,z]));break;}
  case 0x74:st.push(tuple(popMark()));break;case 0x6c:st.push(popMark());break;case 0x64:{const it=popMark(),m=new Map();for(let i=0;i+1<it.length;i+=2)m.set(it[i],it[i+1]);st.push(m);break;}
  case 0x61:{const v=pop();st[st.length-1].push?.(v);break;}
  case 0x65:{const it=popMark();const l=st[st.length-1];if(Array.isArray(l))l.push(...it);break;}
  case 0x73:{const v=pop(),k=pop(),m=st[st.length-1];if(m instanceof Map)m.set(k,v);break;}
  case 0x75:{const it=popMark(),m=st[st.length-1];if(m instanceof Map)for(let i=0;i+1<it.length;i+=2)m.set(it[i],it[i+1]);break;}
  case 0x90:{const it=popMark(),s=st[st.length-1];if(s instanceof Set)for(const x of it)s.add(x);break;}
  case 0x91:st.push(new Set(popMark()));break;
  case 0x63:{const mod=line(),name=line();st.push({__global:mod+'.'+name});break;}
  case 0x93:{const name=pop(),mod=pop();st.push({__global:mod+'.'+name});break;}
  case 0x81:{const args=pop(),cls=pop();const o=new PyObj(cls?.__global||'?');o.__args=args;st.push(o);break;}
  case 0x92:{pop();const args=pop(),cls=pop();const o=new PyObj(cls?.__global||'?');o.__args=args;st.push(o);break;}
  case 0x52:{const args=pop(),fn=pop();const o=new PyObj(fn?.__global||'?');o.__args=args;st.push(o);break;}
  case 0x6f:{const it=popMark();const o=new PyObj(it[0]?.__global||'?');o.__args=it.slice(1);st.push(o);break;}
  case 0x69:{const mod=line(),name=line(),it=popMark();const o=new PyObj(mod+'.'+name);o.__args=it;st.push(o);break;}
  case 0x62:{const state=pop();setState(st[st.length-1],state);break;}
  case 0x71:memo.set(b[p++],st[st.length-1]);break;case 0x72:memo.set(u32(),st[st.length-1]);break;case 0x94:memo.set(memo.size,st[st.length-1]);break;
  case 0x70:memo.set(Number(line()),st[st.length-1]);break;
  case 0x68:st.push(memo.get(b[p++]));break;case 0x6a:st.push(memo.get(u32()));break;case 0x67:st.push(memo.get(Number(line())));break;
  case 0x30:pop();break;case 0x32:st.push(st[st.length-1]);break;case 0x31:popMark();break;
  case 0x51:pop();st.push(null);break;case 0x50:line();st.push(null);break;/* persistent ids: never text */
  case 0x82:case 0x83:case 0x84:p+=op===0x82?1:op===0x83?2:4;st.push(null);break;/* EXT */
  case 0x97:break;case 0x98:break;/* READONLY_BUFFER, NEXT_BUFFER */
  default:throw Error('PICKLE_OPCODE_'+op.toString(16));}}
 throw Error('PICKLE_NO_STOP');}

/* ---- rpa ------------------------------------------------------------------------------------------------------- */
/* #247 variant headers, as unrpa (GPL, Lattyware/unrpa versions/*.py) knows them, and a generic fallback for any
   other "<TAG> <hex> <hex>" first line:
     RPA-3.x / RPA-4.0         offset = 1st hex field, key = last hex field
     ALT-1.0 <key> <offset>    key ^ 0xDABE8DF0
     ZiX-12A / ZiX-12B <obf>   offset hex digits reordered; the key is derived from the verificationcode string of the
       game's renpy/loader (every printable run of loader.py/.pyo is tried, the one the index validates with is kept);
       12B also XORs the first N bytes of every file with magic words ^ key (N from the loader, checked on an .rpyc)
   Unknown tags: every hex field as the index offset (else the zlib stream found from the end), every field / 0 as key,
   and as a last resort the key recovered from the data start (some file starts right after the header). A key is kept
   only when every entry of the index lands inside the data. */
const ZIX_MAGIC=[3621826839565189698n,8167163782024462963n,5643161164948769306n,4940859562182903807n,2672489546482320731n,8917212212349173728n,7093854916990953299n];
const zixOffset=v=>{const s=String(v);return s.length>=8?parseInt(s[7]+s[6]+s.slice(0,3)+s[5]+s[4]+s[3],16):NaN;};
/* python: int(round((int(digits)+102464652121606009) ** (1/3)) / 23 * 109) */
const zixKey=code=>{const d=String(code).replace(/\D/g,'');if(!d||d.length>40)return null;const a=Number(BigInt(d)+102464652121606009n);const r=Math.round(Math.pow(a,1/3));return BigInt(Math.trunc(r/23*109));};
const big=v=>typeof v==='bigint'?v:BigInt(Math.trunc(Number(v)||0));
function rpaHeader(file){const fd=fs.openSync(file,'r');try{const h=Buffer.alloc(128);const n=fs.readSync(fd,h,0,128,0);const nl=h.indexOf(10);const first=h.toString('latin1',0,nl<0?n:nl).trim();
 const parts=first.split(/\s+/),tag=parts[0]||'',hex=parts.slice(1).filter(x=>/^[0-9a-f]+$/i.test(x));const end=nl<0?0:nl+1;
 if(/^RPA-[34]\.\d$/i.test(tag)&&hex.length>=2)return {tag,offset:parseInt(hex[0],16),key:BigInt('0x'+hex[hex.length-1]),end};
 if(/^RPA-2\.0$/i.test(tag)&&hex.length)return {tag,offset:parseInt(hex[0],16),key:0n,end};
 if(/^ALT-1\.0$/i.test(tag)&&hex.length>=2)return {tag,offset:parseInt(hex[1],16),key:BigInt('0x'+hex[0])^0xDABE8DF0n,end};
 if(/^ZiX-12[AB]$/.test(tag)&&parts.length>=2)return {tag,offset:zixOffset(parts[parts.length-1]),key:null,end,zix:tag.slice(-1)};
 /* unknown variant: printable tag then hex fields */
 if(nl>0&&/^[\x21-\x7e]{3,16}$/.test(tag)&&hex.length)return {tag,offset:null,key:null,end,fields:hex};
 return null;}finally{fs.closeSync(fd);}}
const loaderFiles=file=>{const out=[];for(const d of [path.dirname(file),path.dirname(path.dirname(file))])for(const sub of ['renpy','.'])for(const n of ['loader.py','loader.pyo','loader.pyc']){try{out.push(fs.readFileSync(path.join(d,sub,n)));}catch{}}return out;};
/* the strings a ZiX game's loader carries: the verificationcode literal of loader.py, else every printable run with digits */
function zixCodes(file){const out=new Set();
 for(const b of loaderFiles(file)){const t=b.toString('latin1');const m=/verificationcode\s*=\s*_string\.sha1\(\s*['"](.*?)['"]\s*\)/.exec(t);if(m)out.add(m[1]);
  for(const r of t.matchAll(/[\x20-\x7e]{3,120}/g))if(/\d{3}/.test(r[0]))out.add(r[0]);}
 return [...out];}
function zixAmounts(file){const out=new Set();
 for(const b of loaderFiles(file)){const t=b.toString('latin1');for(const m of t.matchAll(/rv\.read\((\d+)\)/g))out.add(+m[1]);
  for(let i=0;i+5<=b.length;i++)if(b[i]===0x69){const v=b.readInt32LE(i+1);if(v>=8&&v<=1<<20)out.add(v);}}
 return [...out].sort((x,y)=>x-y);}
function inflateIndex(fd,size,offset){if(!(offset>0&&offset<size))return null;const raw=Buffer.alloc(size-offset);fs.readSync(fd,raw,0,raw.length,offset);
 try{const idx=unpickle(zlib.inflateSync(raw));return idx instanceof Map&&idx.size?idx:null;}catch{return null;}}
/* the index from the end of the file when no header field points at it: the last zlib stream that holds a pickle */
function findIndex(fd,size){const n=Math.min(size,8<<20),b=Buffer.alloc(n);fs.readSync(fd,b,0,n,size-n);
 for(let i=n-2;i>=0;i--)if(b[i]===0x78&&(b[i+1]===0x9c||b[i+1]===0xda||b[i+1]===0x01||b[i+1]===0x5e)){const idx=inflateIndex(fd,size,size-n+i);if(idx)return {idx,offset:size-n+i};}
 return null;}
const firstPart=parts=>Array.isArray(parts)?parts[0]:null;
function decodeIndex(idx,key,limit){const out=new Map();
 for(const [name,parts] of idx){const t=firstPart(parts);if(!t)continue;const off=Number(big(t[0])^key),len=Number(big(t[1])^key);
  if(!(off>=0&&len>=0&&off+len<=limit))return null;const prefix=t[2];
  out.set(String(name).replace(/\\/g,'/'),{offset:off,length:len,prefix:Buffer.isBuffer(prefix)?prefix:Buffer.from(String(prefix||''),'latin1')});}
 return out.size?out:null;}
function zixRun(s,key){const d=Buffer.from(s),k=BigInt.asUintN(64,key);for(let i=0,w=0;i+8<=d.length;i+=8,w++)d.writeBigUInt64LE(d.readBigUInt64LE(i)^ZIX_MAGIC[w%7]^k,i);return d;}
function rpaIndex(file){const h=rpaHeader(file);if(!h)return null;const fd=fs.openSync(file,'r');
 try{const size=fs.fstatSync(fd).size;let offset=h.offset,idx=null;
  if(h.fields){for(const f of h.fields){const o=parseInt(f,16);idx=inflateIndex(fd,size,o);if(idx){offset=o;break;}}}
  else idx=inflateIndex(fd,size,offset);
  if(!idx){const f=findIndex(fd,size);if(!f)return null;idx=f.idx;offset=f.offset;}
  const keys=[];if(h.key!=null)keys.push(h.key);
  if(h.zix)for(const c of zixCodes(file)){const k=zixKey(c);if(k!=null)keys.push(k);}
  for(const f of h.fields||[])keys.push(BigInt('0x'+f),BigInt('0x'+f)^0xDABE8DF0n);keys.push(0n);
  for(const start of new Set([34,51,64,h.end].filter(x=>x>0)))for(const [,parts] of idx){const t=firstPart(parts);if(t)keys.push(big(t[0])^BigInt(start));}
  let out=null,key=0n;for(const k of keys){out=decodeIndex(idx,k,offset);if(out){key=k;break;}}
  if(!out)return null;
  if(h.zix==='B'){const one=[...out.entries()].find(([n,e])=>/\.rpyc$/i.test(n)&&e.length>64)?.[1];let amount=0;
   if(one){const sample=Buffer.concat([one.prefix,kit.readAt(file,one.offset,Math.min(one.length,1<<20))]);
    for(const a of zixAmounts(file)){const n=Math.min(a,sample.length);if(zixRun(sample.subarray(0,n),key).toString('latin1',0,10)==='RENPY RPC2'){amount=a;break;}}}
   for(const e of out.values())e.zix={key,amount};}
  return out;}finally{fs.closeSync(fd);}}
const rpaRead=(file,e)=>{const raw=Buffer.concat([e.prefix,kit.readAt(file,e.offset,Math.max(0,e.length-e.prefix.length))]);
 if(!e.zix||!e.zix.amount)return raw;const n=Math.min(e.zix.amount,raw.length);return Buffer.concat([zixRun(raw.subarray(0,n),e.zix.key),raw.subarray(n)]);};

/* ---- rpyc ------------------------------------------------------------------------------------------------------ */
const isRpyc=buf=>buf.length>10&&(buf.toString('latin1',0,10)==='RENPY RPC2'||buf[0]===0x78);
/* the pickled bytes of a .rpyc: slot 1 (or, with all, every slot joined: the font scan reads them all) */
function data(buf,{all=false}={}){
 if(buf.toString('latin1',0,10)!=='RENPY RPC2')return zlib.inflateSync(buf);
 const parts=[];let p=10;while(p+12<=buf.length){const slot=buf.readUInt32LE(p),start=buf.readUInt32LE(p+4),len=buf.readUInt32LE(p+8);p+=12;if(!slot)break;
  if(all){try{parts.push(zlib.inflateSync(buf.subarray(start,start+len)));}catch{}}else if(slot===1)return zlib.inflateSync(buf.subarray(start,start+len));}
 return parts.length?Buffer.concat(parts):null;}
function statements(buf){return statementsOf(data(buf));}
function statementsOf(data){
 if(!data)return [];const v=unpickle(data);const stmts=Array.isArray(v)&&v.tuple?v[1]:v;return Array.isArray(stmts)?stmts:[];}
const short=c=>String(c||'').replace(/^renpy\.(?:ast|sl2\.slast|atl)\./,'');
const str=v=>typeof v==='string'?v:Buffer.isBuffer(v)?v.toString('utf8'):null;
/* Every Say in statement order (DFS through blocks, if/while branches, menus), with the identifier of the Translate
   that wraps it; menu choices and TranslateString entries too. */
function walk(stmts,visit){const seen=new Set();
 const go=(v,id,lang)=>{if(v===null||typeof v!=='object'||seen.has(v))return;seen.add(v);
  if(Array.isArray(v)){for(const x of v)go(x,id,lang);return;}
  if(v instanceof Map){for(const x of v.values())go(x,id,lang);return;}
  if(!(v instanceof PyObj))return;const c=short(v.__class);
  if(c==='Translate'){const l=v.language===undefined?null:str(v.language);go(v.block,str(v.identifier),l);return;}
  if(c==='TranslateSay'){visit({kind:'say',text:str(v.what),who:str(v.who),id:str(v.identifier),lang:str(v.language)});return;}
  if(c==='Say'){visit({kind:'say',text:str(v.what),who:str(v.who),id,lang});return;}
  if(c==='TranslateString'){visit({kind:'string',old:str(v.old),text:str(v.new),lang:str(v.language)});return;}
  if(c==='Menu'){for(const it of v.items||[]){const label=Array.isArray(it)?str(it[0]):null;if(label)visit({kind:'choice',text:label,id:null,lang});if(Array.isArray(it))go(it[2],id,lang);}return;}
  /* screen language, ATL and python blocks hold no dialogue */
  if(/^(?:Python|EarlyPython|Define|Default|Screen|Transform|Image|Style|Testcase|SLScreen|RawBlock)$/.test(c))return;
  for(const k of Object.keys(v))if(k!=='__class'&&k!=='__args')go(v[k],id,lang);};
 go(stmts,null,null);}
/* the running script: lines (Say text and menu choices), their translate ids, the speaker variable as an anchor */
function parse(buf){const lines=[],ids=[],anchors=[],roles=[];let stmts;try{stmts=statements(buf);}catch{return {lines,anchors};}
 walk(stmts,x=>{if(x.lang)return;if(x.kind==='say'&&x.text){lines.push(x.text);roles.push('b');ids.push(x.id||null);if(x.who)anchors.push(x.who);}else if(x.kind==='choice'){lines.push(x.text);roles.push('c');ids.push(null);}});
 return {lines,anchors,roles:roles.join(''),...(ids.some(Boolean)?{ids}:{})};}
/* a compiled tl/<language> file: identifier -> translated Say text, old -> new strings */
function translations(buf){const out={ids:new Map(),strings:new Map(),lang:null};let stmts;try{stmts=statements(buf);}catch{return out;}
 walk(stmts,x=>{if(!x.lang)return;out.lang=out.lang||x.lang;if(x.kind==='say'&&x.id&&x.text!=null&&!out.ids.has(x.id))out.ids.set(x.id,x.text);else if(x.kind==='string'&&x.old!=null&&x.text)out.strings.set(x.old,x.text);});
 return out;}

/* ---- game folder ----------------------------------------------------------------------------------------------- */
/* E577 kit.walk; Ren'Py's cache folder is skipped too */
const walkFiles=(dir,depth,test)=>kit.walk(dir,depth,n=>test(n),[],/^(saves?|cache|\.megulit)/i);
/* Every script of a game folder ("game" or the folder itself): {rel, read, source}, keyed by the path without its
   extension so script.rpy and script.rpyc are one script; loose files override archives, as Ren'Py loads them. */
function scripts(gameDir,{tl=false}={}){const out=new Map();const inTl=rel=>/(^|\/)tl\//i.test(rel);
 for(const a of walkFiles(gameDir,3,n=>/\.rpa$/i.test(n)).sort()){let idx;try{idx=rpaIndex(a);}catch{continue;}if(!idx)continue;
  for(const [name,e] of idx){if(!/\.rpyc$/i.test(name)||inTl(name)!==tl)continue;out.set(name.replace(/c$/i,'').toLowerCase(),{rel:name,read:()=>rpaRead(a,e),source:a});}}
 for(const f of walkFiles(gameDir,4,n=>/\.rpyc$/i.test(n))){const rel=path.relative(gameDir,f).replace(/\\/g,'/');if(inTl(rel)!==tl)continue;out.set(rel.replace(/c$/i,'').toLowerCase(),{rel,read:()=>fs.readFileSync(f),source:f});}
 return out;}
module.exports={data,unpickle,rpaHeader,rpaIndex,rpaRead,zixKey,zixOffset,zixRun,isRpyc,statements,walk,parse,translations,scripts,PyObj};
