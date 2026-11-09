// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E329 YU-RIS scenes for zero-latency translation (女装山脈, YU-RIS 0x1C2/0x1C3).
   The scripts are ysbin\yst?????.ybn (YSTB) inside YPF archives: pac/ysbin.ypf, overlaid by update*.ypf next to the
   program in load order. A YSTB has four segments (instructions, arguments, resource strings, line numbers), each XOR
   encrypted with the same 4-byte key; the key is read back from the argument segment, whose bytes are mostly zero.
   The text command (WORD) is the instruction that takes one raw text argument; its argument is the line as drawn.
   Chinese patches made with the rioLoader (萌空 / 罗莊: 女装山脉cn1.1.exe) keep Shift-JIS-looking codes in the script.
   The loader carries a 65536-entry table (code -> code point of its own font) and that font, XOR encrypted with the
   readme next to it; the font's glyphs are SimHei's, so font-unmap gives the real character for each code point. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const fontUnmap=require('./font-unmap.cjs');
const stat=file=>{try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}};
const memo=(map,key,make)=>{if(map.has(key))return map.get(key);const v=make();map.set(key,v);if(map.size>64)map.delete(map.keys().next().value);return v;};

// ---- YPF --------------------------------------------------------------------------------------------------------
// Index names are stored bitwise-NOT; their length byte is NOT-ed and then swapped through this table.
const SWAP=[0x03,0x48,0x06,0x35,0x0C,0x10,0x11,0x19,0x1C,0x1E,0x09,0x0B,0x0D,0x13,0x15,0x1B,0x20,0x23,0x26,0x29,0x2C,0x2F,0x2E,0x32];
const swapLen=new Map();for(let i=0;i<SWAP.length;i+=2){swapLen.set(SWAP[i],SWAP[i+1]);swapLen.set(SWAP[i+1],SWAP[i]);}
const sjis=new TextDecoder('shift_jis');
function ypfIndex(buf,size,wide,swap){const count=buf.readUInt32LE(8),files=[];let p=32;
 for(let i=0;i<count;i++){if(p+5>buf.length)return null;let len=buf[p+4]^0xff;if(swap)len=swapLen.get(len)??len;p+=5;
  if(p+len+(wide?22:18)>buf.length)return null;const raw=Buffer.from(buf.subarray(p,p+len));for(let k=0;k<raw.length;k++)raw[k]^=0xff;p+=len;
  const compressed=buf[p+1],unpacked=buf.readUInt32LE(p+2),packed=buf.readUInt32LE(p+6),offset=wide?Number(buf.readBigUInt64LE(p+10)):buf.readUInt32LE(p+10);p+=wide?22:18;
  // Names are Shift-JIS and may hold codes it does not define (patch file names); only control bytes mean a bad parse.
  if(!len||raw.some(c=>c<0x20)||offset+packed>size)return null;const name=sjis.decode(raw);
  files.push({name,compressed,unpacked,packed,offset});}
 return files;}
const ypfMemo=new Map();
function ypfList(file){return memo(ypfMemo,file+'|'+stat(file),()=>{let fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,head=Buffer.alloc(32);fs.readSync(fd,head,0,32,0);if(head.toString('latin1',0,4)!=='YPF\0')return null;
  const indexSize=head.readUInt32LE(12),buf=Buffer.alloc(Math.min(size,32+indexSize));fs.readSync(fd,buf,0,buf.length,0);
  for(const wide of [false,true])for(const swap of [true,false]){const files=ypfIndex(buf,size,wide,swap);if(files)return files;}
  return null;
 }catch{return null;}finally{if(fd!==undefined)fs.closeSync(fd);}});}
function ypfRead(file,e){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(e.packed);fs.readSync(fd,b,0,e.packed,e.offset);return e.compressed?zlib.inflateSync(b):b;}finally{fs.closeSync(fd);}}
const YST=n=>/^yst\d+\.ybn$/i.test(n);
// Scene files of one archive, first copy of each name (a patch archive can hold a name twice; the engine takes the first).
function ypfScenes(file){const files=ypfList(file);if(!files)return [];const seen=new Set(),out=[];
 for(const e of files){const name=e.name.replace(/^.*\\/,'');if(!YST(name)||seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());out.push({name,read:()=>ypfRead(file,e)});}
 return out;}

// ---- YSTB -------------------------------------------------------------------------------------------------------
// The key: per byte position, the most common byte of the argument segment (argument records are mostly zero bytes).
function ystbKey(seg){const key=[0,0,0,0];for(let j=0;j<4;j++){const c=new Uint32Array(256);for(let i=j;i<seg.length;i+=4)c[seg[i]]++;let best=0;for(let v=1;v<256;v++)if(c[v]>c[best])best=v;key[j]=best;}return key;}
function ystb(buf){
 if(buf.length<32||buf.toString('latin1',0,4)!=='YSTB')return null;const sizes=[12,16,20,24].map(k=>buf.readUInt32LE(k));
 if(32+sizes.reduce((a,b)=>a+b,0)>buf.length||sizes[0]%4||sizes[1]%12)return null;
 const key=ystbKey(buf.subarray(32+sizes[0],32+sizes[0]+sizes[1]));let p=32;
 const [code,args,res]=sizes.slice(0,3).map(n=>{const s=Buffer.from(buf.subarray(p,p+n));for(let i=0;i<s.length;i++)s[i]^=key[i&3];p+=n;return s;});
 const insts=[];let a=0;
 for(let i=0;i<code.length;i+=4){const op=code[i],argc=code[i+1],list=[];
  for(let k=0;k<argc;k++,a++){const q=a*12;if(q+12>args.length)return null;const type=args.readUInt16LE(q+2),size=args.readUInt32LE(q+4),off=args.readUInt32LE(q+8);
   list.push({id:args.readUInt16LE(q),type,data:off+size<=res.length?res.subarray(off,off+size):Buffer.alloc(0)});}
  insts.push({op,args:list});}
 return insts;}
// The text command: one argument of type 0 holding raw text (its first byte a double-byte lead), the most frequent such op.
function textOp(insts){const count=new Map();
 for(const x of insts)if(x.args.length===1&&x.args[0].type===0&&x.args[0].data.length&&x.args[0].data[0]>=0x81)count.set(x.op,(count.get(x.op)||0)+1);
 let best=-1,n=0;for(const [op,c] of count)if(c>n){best=op;n=c;}return best;}
// Raw text lines in order, plus the anchors a translation keeps: ASCII string literals of the other commands.
function words(buf){const insts=ystb(buf);if(!insts)return {raw:[],anchors:[]};const op=textOp(insts),raw=[],anchors=[];
 for(const x of insts){if(x.op===op&&x.args.length===1){raw.push(x.args[0].data);continue;}
  for(const arg of x.args){const s=arg.data.toString('latin1'),re=/"([\x20-\x21\x23-\x7e]*)"/g;let m;while((m=re.exec(s)))if(m[1])anchors.push(m[1]);}}
 return {raw,anchors};}
const parse=buf=>{const w=words(buf);return {lines:w.raw.map(b=>sjis.decode(b)),anchors:w.anchors};};

// ---- rioLoader code table + font --------------------------------------------------------------------------------
// UPX (NRV2E, the method rioLoader builds use) unpacking of the program image.
function nrv2e(src,ip,outLen){const dst=Buffer.alloc(outLen+8);let op=0,bb=0,bc=0,last=1;
 const bit=()=>{if(bc>0)return (bb>>>--bc)&1;if(ip+4>src.length)throw Error('UPX_TRUNCATED');bc=31;bb=src.readUInt32LE(ip);ip+=4;return (bb>>>31)&1;};
 for(;;){while(bit()){if(op>=outLen)throw Error('UPX_OVERRUN');dst[op++]=src[ip++];}
  let off=1,len;for(;;){off=off*2+bit();if(bit())break;off=(off-1)*2+bit();}
  if(off===2){off=last;len=bit();}else{off=((off-3)*256+src[ip++])>>>0;if(off===0xffffffff)break;len=(off^0xffffffff)&1;off>>>=1;last=++off;}
  if(len)len=1+bit();else if(bit())len=3+bit();else{len++;do{len=len*2+bit();}while(!bit());len+=3;}
  len+=off>0x500?1:0;if(off>op||op+len+1>outLen+8)throw Error('UPX_BAD');let mp=op-off;dst[op++]=dst[mp++];do{dst[op++]=dst[mp++];}while(--len>0);}
 return dst.subarray(0,op);}
function unpackUpx(exe){const at=exe.indexOf('UPX!',0,'latin1');if(at<0||at>0x1000||exe[at+6]!==8)return null;
 try{const pe=exe.readUInt32LE(0x3c),opt=exe.readUInt16LE(pe+20),sec=pe+24+opt+40;return nrv2e(exe,exe.readUInt32LE(sec+20),exe.readUInt32LE(at+16));}catch{return null;}}
const TABLE_MARK=Buffer.concat([Buffer.alloc(64),Buffer.from(' !"#$%&\'()*+,-./0123456789','utf16le')]);
const ttfHead=b=>b.length>=12&&b.readUInt32BE(0)===0x00010000&&b.readUInt16BE(4)>=8&&b.readUInt16BE(4)<=40;
function fontAt(image,at,keys){const plain=image.subarray(at,at+4096);
 for(const key of [null,...keys]){const h=Buffer.from(plain);if(key)for(let i=0;i<key.length&&i<h.length;i++)h[i]^=key[i];if(!ttfHead(h))continue;
  let end=0;const n=h.readUInt16BE(4);for(let i=0;i<n;i++){const r=12+i*16;end=Math.max(end,h.readUInt32BE(r+8)+h.readUInt32BE(r+12));}
  if(at+end>image.length)continue;const font=Buffer.from(image.subarray(at,at+end));if(key)for(let i=0;i<key.length&&i<font.length;i++)font[i]^=key[i];return font;}
 return null;}
const codecMemo=new Map();
// The loader program in a folder (a smallish exe with the table), as a decoder for the patch's bytes, or null.
function loaderCodec(exeFile){return memo(codecMemo,exeFile+'|'+stat(exeFile),()=>{
 let exe;try{if(fs.statSync(exeFile).size>8<<20)return null;exe=fs.readFileSync(exeFile);}catch{return null;}
 for(const image of [exe,unpackUpx(exe)].filter(Boolean)){const t=image.indexOf(TABLE_MARK);if(t<0||t+64+0x20000>image.length)continue;
  const table=image.subarray(t,t+0x20000),dir=path.dirname(exeFile);let keys=[];
  try{keys=fs.readdirSync(dir).filter(f=>/\.(?:ini|txt)$/i.test(f)).map(f=>path.join(dir,f)).filter(f=>fs.statSync(f).size<1<<20).map(f=>fs.readFileSync(f));}catch{}
  const font=fontAt(image,t+0x20000,keys),map=font&&fontUnmap.unmapping([font],{anyCode:true});if(!map)continue;
  // A code point whose glyph draws nothing is the patch's full-width space.
  let inked=new Set();try{inked=new Set(fontUnmap.glyphHashes(font,0)?.keys()||[]);}catch{}
  const glyph=code=>{const cp=table.readUInt16LE(code*2);if(!cp)return null;const ch=String.fromCharCode(cp);return map.get(ch)??(cp>=0x80&&!inked.has(cp)?'　':ch);};
  return {file:exeFile,decode(b){let out='';
   for(let i=0;i<b.length;i++){const c=b[i];
    if((c>=0x81&&c<=0x9f||c>=0xe0&&c<=0xfc)&&i+1<b.length){out+=glyph(c<<8|b[i+1])??sjis.decode(b.subarray(i,i+2));i++;}
    else out+=glyph(c)??String.fromCharCode(c);}
   return out;}};}
 return null;});}
const exesIn=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.exe$/i.test(f)).map(f=>path.join(dir,f));}catch{return [];}};
// The game folder a MeguLit backup folder belongs to (<game>\.megulit-japanese\yuris).
const ownerOf=dir=>/[\\/]\.megulit-japanese[^\\/]*[\\/]/i.test(dir+path.sep)?path.resolve(dir.replace(/[\\/]\.megulit-japanese[^\\/]*(?:[\\/].*)?$/i,'')):null;
function codecFor(dirs){for(const d of [...new Set(dirs.flatMap(d=>[d,ownerOf(d)]).filter(Boolean))])for(const exe of exesIn(d)){const c=loaderCodec(exe);if(c)return c;}return null;}
// Without a loader: Shift-JIS, else GBK, whichever reads with fewer broken characters.
const gbk=new TextDecoder('gbk'),KANA=/[ぁ-ゖァ-ヺ]/g;
function plainCodec(raws){const sample=raws.slice(0,3000),score=dec=>{let bad=0,kana=0;for(const b of sample){const t=dec.decode(b);bad+=(t.match(/�/g)||[]).length;kana+=(t.match(KANA)||[]).length;}return {bad,kana};};
 const s=score(sjis),g=score(gbk);return {decode:b=>(s.bad<g.bad||s.bad===g.bad&&s.kana>=g.kana?sjis:gbk).decode(b)};}

// ---- Engine -----------------------------------------------------------------------------------------------------
const UPDATE=n=>/^update\d*\.ypf$/i.test(n);
const updateRank=n=>+(n.match(/(\d+)\.ypf$/i)?.[1]||0);
const updates=dir=>{try{return fs.readdirSync(dir).filter(UPDATE).sort((a,b)=>updateRank(a)-updateRank(b)).map(f=>path.join(dir,f));}catch{return [];}};
const ysbinOf=dir=>[path.join(dir,'pac','ysbin.ypf'),path.join(dir,'ysbin.ypf')].find(f=>fs.existsSync(f))||null;
// Scenes with text only (the system scripts have none), so the first ones read already show the game is readable.
const textMemo=new Map();
function hasText(file,s){return memo(textMemo,file+'|'+stat(file)+'|'+s.name,()=>{try{return words(s.read()).raw.length>0;}catch{return false;}});}
const yuris={
 id:'yuris',hint:'update1.ypf（或 pac\\ysbin.ypf）',
 scenes(dir){const base=ysbinOf(dir);if(!base)return [];const out=new Map();
  for(const file of [base,...updates(dir)])for(const s of ypfScenes(file))if(hasText(file,s))out.set(s.name.toLowerCase(),s);
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 archives:dir=>updates(dir).reverse().flatMap(ypfScenes),
 sources:dir=>{const base=ysbinOf(dir);return base?[base,...updates(dir)]:[];},
 parse,test:()=>false,
 // The patch: update*.ypf in the patch folders (the latest update first), decoded with the loader's table when there is one.
 // A patched scene counts when it has as many text lines and the same anchors as the running one.
 patchLines(base,found){
  const byName=new Map();
  for(const d of found.dirs)for(const file of updates(d).reverse())for(const s of ypfScenes(file))if(!byName.has(s.name.toLowerCase()))byName.set(s.name.toLowerCase(),s);
  if(!byName.size)return null;
  const parsed=new Map();for(const scene of base){const s=byName.get(scene.name.toLowerCase());if(!s)continue;try{parsed.set(scene.name.toLowerCase(),words(s.read()));}catch{}}
  if(!parsed.size)return null;
  const codec=codecFor(found.dirs)||plainCodec([...parsed.values()].flatMap(w=>w.raw));let any=false;
  const list=base.map(scene=>{const w=parsed.get(scene.name.toLowerCase());if(!w)return scene;
   if(w.raw.length!==scene.lines.length)return {...scene,skipped:'count'};
   const n=Math.min(w.anchors.length,scene.anchors.length);let same=0;for(let k=0;k<n;k++)if(w.anchors[k]===scene.anchors[k])same++;
   if(scene.anchors.length>=5&&(Math.abs(w.anchors.length-scene.anchors.length)>scene.anchors.length*.1||same<scene.anchors.length*.9))return {...scene,skipped:'anchors'};
   any=true;return {...scene,patched:true,lines:w.raw.map(b=>codec.decode(b))};});
  return any?list:null;
 },
 _internal:{ypfList,ypfScenes,ystb,words,loaderCodec,codecFor,unpackUpx},
};
module.exports=yuris;
