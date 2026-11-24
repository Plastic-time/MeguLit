// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Eushully ARCGameEngine ("AGE", SYS3/SYS4: 魔導巧殻, 天結いラビリンスマイスター, 神採りアルケミーマイスター ...).
   Format references (read, not copied): GARbro ArcFormats/Eushully/ArcALF.cs (morkt, MIT) for the archives,
   arcusmaximus VNTranslationTools VNTextPatch.Shared/Scripts/ArcGameEngine (MIT) for the scripts.
     sys4ini.bin / sys3ini.bin  "S4IC" / "S3IC" (u32 packed size at 0x134) or "S4AC" (append, at 0x114), then LZSS
                (4 KB window from 0xFEE, flags LSB first, 1 = literal); "S3IN" is plain from 0x12C. The index: u32 n,
                n × char[0x100] archive names, u32 m, m × {char[0x40] name, u32 archive, u32 number, u32 offset, u32 size}
     <name>.AAI the index of an append archive (APPEND01.ALF), same layout
     *.ALF      the data, entries stored plain at their offsets
     script     "SYS4" + version, six counts, u32 0x1C, three {count, address}; code from 0x3C as u32 opcode then per
                operand {u32 type, u32 value}; address a means offset 0x3C + 4a. Strings are NOT-ed Shift-JIS C strings
                (F040 → …, F041-F043 → ―). Message text: Print(0x6E) with operand 0 = int 0, PrintNewline (0x6F),
                PrintFurigana (0x196: text, ruby); a speaker printed directly is Print with operand 0 = int 2.
   An unknown opcode ends the walk (the lines up to it are kept). */
const fs=require('node:fs'),path=require('node:path');
const kit=require('./kit.cjs');

/* operand counts per opcode (VNTranslationTools AgeDisassembler.OperandCounts), packed as "opcode:count" runs */
const OPS=new Map();
const LOW='1:0,2:0,3:1,4:2,5:0,6:2,7:1,8:1,9:0,A:2,B:11,C:0,D:4,E:12,F:1,10:4,11:9,12:1,13:4,14:0,15:5,16:2,17:2,1E:8,1F:12,20:6,21:2,22:2,23:2,24:2,25:3,26:4,27:4,28:4,2A:4,2B:5,2C:5,2D:12,2E:5,2F:4,30:5,31:4,32:10,33:6,34:12,35:11,36:3,37:11,38:12,';
const TABLE=LOW+'50:3,51:3,52:3,53:3,54:3,55:2,56:3,57:3,58:3,59:3,5A:3,5B:3,5C:3,5D:3,5E:3,5F:3,60:2,61:3,62:3,63:2,64:2,65:2,66:3,67:3,68:3,69:3,6A:3,6B:3,6C:2,6D:0,6E:2,6F:1,70:5,71:1,72:1,73:10,74:1,75:1,76:1,77:1,78:1,79:3,7A:3,7B:2,7C:0,7D:2,7E:1,7F:1,'+
 '80:1,81:1,82:5,83:3,84:1,85:0,86:1,87:0,88:1,89:4,8A:6,8B:1,8C:1,8D:2,8E:1,8F:1,90:7,91:1,92:2,93:0,94:0,95:2,96:0,97:5,A0:3,A1:0,A2:2,A3:2,AA:2,AB:2,AC:9,AD:0,AE:0,AF:0,'+
 'B0:1,B1:1,B2:2,B3:0,B4:2,B5:1,B6:1,B7:1,B8:0,B9:1,BA:1,BB:1,BC:1,BD:1,BE:1,BF:1,C0:1,C1:0,C2:2,C3:1,C4:1,C5:2,C6:2,C7:2,C8:1,C9:0,CA:0,CB:1,CC:2,CD:0,CE:3,CF:0,'+
 'D0:1,D1:0,D2:1,D3:0,D4:4,D5:1,D6:6,D7:1,D8:2,D9:0,DA:6,FA:0,FB:2,FC:0,FD:2,FE:1,FF:0,100:0,101:0,102:3,103:1,104:0,105:1,106:1,107:2,108:1,109:2,10A:2,10B:2,10C:2,10D:1,10E:2,10F:1,'+
 '12C:5,12D:7,12E:8,12F:4,130:1,131:1,132:1,133:2,134:3,135:2,136:2,137:1,138:2,139:3,13A:6,13B:7,13C:1,13D:3,13E:2,13F:3,140:4,141:1,142:1,143:0,144:2,145:1,146:1,147:6,148:1,149:1,14A:7,14B:1,14C:2,14D:6,'+
 '190:2,191:2,192:2,193:3,194:3,195:3,196:3,197:1,198:3,199:0,19A:1,19B:0,19C:0,19D:2,19E:2,19F:2,1A0:9,1A1:2,1A2:1,1A3:1,1A4:2,1A5:1,1A6:2,1A7:1,1A8:0,1A9:1,1AA:1,1AB:2,1AC:3,1AD:0,1AE:3,1AF:3,'+
 '1B0:3,1B1:1,1B2:1,1B3:0,1B4:0,1B5:1,1B6:1,1B7:1,1B8:2,1B9:2,1BA:2,1BB:1,1BC:0,1BD:1,1BE:2,1BF:0,1C0:1,1C1:3,1C2:2,1C3:2,1C4:1,1C5:4,1C6:2,1C7:1,1C8:2,1C9:3,1CA:1,1CB:1,1CC:1,1CD:2,1CE:1,1CF:1,'+
 '1D0:3,1D1:5,1D2:2,1D3:5,1D4:4,1D5:0,1D6:2,1D7:2,1D8:3,1D9:2,1F4:0,1F5:0,1F6:0,1F7:2,1F8:4,1F9:3,1FA:1,1FB:8,1FC:1,1FD:4,1FE:5,1FF:4,200:1,201:1,202:5,203:4,204:4,205:6,206:7,207:8,208:3,209:5,20A:1,20B:7,20C:0,20D:1,20E:0,20F:3,'+
 '210:1,211:1,212:2,213:3,214:2,215:2,216:2,217:4,218:4,219:4,21A:4,21B:1,21C:0,21D:2,21E:6,21F:7,220:6,221:4,222:2,223:8,224:0,225:2,226:5,227:6,228:5,229:5,22A:3,22B:4,22C:3,22D:5,22E:6,22F:5,'+
 '230:1,231:4,232:4,233:5,234:5,235:5,236:4,237:2,238:1,239:6,23A:2,23B:7,23C:0,23D:0,23E:2,23F:2,240:4,241:5,242:2,243:0,244:0,245:2,246:2,247:1,248:1,249:3,24A:3,24D:12,24E:1,24F:10,'+
 '250:10,251:12,252:1,253:2,254:5,256:5,257:5,258:2,259:0,25A:1,25B:1,25C:8,25D:3,25E:5,25F:4,260:4,261:1,2BC:11,2BD:1,2BE:1,2BF:3,2C0:3,2C1:1,2C2:6,2C3:2,2C4:0,2C5:2,2C6:2,2C7:4,2C8:4,2C9:3,'+
 '2CC:1,2CD:1,2CE:1,2CF:1,2D0:3,2D1:3,2D2:3,2D3:3,2D5:2,2D7:2,2D8:3,2D9:2,2DA:8,2DB:1,2DC:1,2DD:2,2DE:2,2DF:3,2E0:3,2E1:3,2E2:3,2E3:3,2E4:3,2E5:1,2E6:2,2E7:2,2E8:1,2E9:1,2EA:1,2EB:1,2EC:2,2EE:1,2EF:11,'+
 '2F0:9,2F1:7,2F2:6,2F3:6,2F4:3,2F5:4,2F6:1,2F7:1,2F8:2,2F9:7,2FA:1,2FB:1,2FC:5,2FD:6,2FE:1,2FF:2,300:3,301:1,302:2,303:3,304:0,305:0,306:1,307:1,308:1,30A:2,'+
 '320:10,321:3,322:4,323:5,324:0,325:2,326:4,327:1,328:3,329:2,32A:1,32B:0,32C:6,32D:2,32E:11,32F:1,330:2,332:4,334:1,335:4,337:4,33B:4,33D:3,33E:5,33F:3,340:1,341:2,342:1,344:2,345:3,349:4,34D:6,34E:4,352:3';
for(const kv of TABLE.split(',')){const [k,v]=kv.split(':');OPS.set(parseInt(k,16),+v);}
const PRINT=0x6e,NEWLINE=0x6f,FURIGANA=0x196,LOAD_ARRAY=0x64,INT=0,STR=2;

/* ---- archives ---- */
function readIni(file){let b;try{b=fs.readFileSync(file);}catch{return null;}if(b.length<0x130)return null;const tag=b.toString('latin1',0,4);let idx;
 if(tag==='S4AC'||tag==='S4IC'||tag==='S3IC'){const at=tag==='S4AC'?0x114:0x134;if(at+4>b.length)return null;const packed=b.readUInt32LE(at);
  idx=kit.lzss(b.subarray(at+4,at+4+packed),null,{cap:64<<20});}
 else if(tag==='S3IN')idx=b.subarray(0x12c);else return null;
 if(idx.length<4)return null;const n=idx.readUInt32LE(0);if(!n||n>4096||4+n*0x100+4>idx.length)return null;
 const arcs=[];for(let i=0;i<n;i++)arcs.push(kit.cstr(idx,4+i*0x100,4+(i+1)*0x100).toString('latin1'));
 let p=4+n*0x100;const m=idx.readUInt32LE(p);p+=4;if(m>1000000||p+m*0x50>idx.length)return null;
 const out=new Map(arcs.map(a=>[a.toLowerCase(),[]]));
 for(let i=0;i<m;i++,p+=0x50){const name=kit.SJIS.decode(kit.cstr(idx,p,p+0x40)),arc=idx.readUInt32LE(p+0x40);if(arc>=n)return null;if(name==='@')continue;
  out.get(arcs[arc].toLowerCase()).push({name,offset:idx.readUInt32LE(p+0x48),size:idx.readUInt32LE(p+0x4c)});}
 return out;}
/* every ALF of the folder with its entries, base archives first, appends (their own .AAI) after so their scripts win */
function alfs(dir){let names;try{names=fs.readdirSync(dir);}catch{return [];}const has=n=>names.find(x=>x.toLowerCase()===n);
 const ini=has('sys4ini.bin')||has('sys3ini.bin');if(!ini)return [];const base=readIni(path.join(dir,ini));if(!base)return [];const out=[];
 for(const [arc,entries] of base){const real=has(arc);if(real&&entries.length)out.push({file:path.join(dir,real),entries});}
 for(const aai of names.filter(n=>/\.aai$/i.test(n)).sort()){const idx=readIni(path.join(dir,aai));if(!idx)continue;
  for(const [arc,entries] of idx){const real=has(arc);if(real&&entries.length&&!out.some(o=>o.file===path.join(dir,real)))out.push({file:path.join(dir,real),entries});}}
 return out;}

/* ---- scripts ---- */
const offsetOf=a=>a<0?-1:0x3c+4*a;
const REPL=[[0xf040,[0x81,0x63]],[0xf041,[0x81,0x5c]],[0xf042,[0x81,0x5c]],[0xf043,[0x81,0x5c]]];
function stringAt(b,addr){const o=offsetOf(addr);if(o<0||o>=b.length)return '';const s=[];
 for(let q=o;q<b.length&&s.length<0x2000;q++){const c=b[q]^0xff;if(!c)break;s.push(c);}
 const out=[];for(let i=0;i<s.length;i++){const w=(s[i]<<8)|(s[i+1]??0),r=REPL.find(([k])=>k===w);if(r){out.push(...r[1]);i++;continue;}out.push(s[i]);if((s[i]>=0x81&&s[i]<=0x9f||s[i]>=0xe0&&s[i]<=0xfc)&&i+1<s.length)out.push(s[++i]);}
 return kit.SJIS.decode(Buffer.from(out));}
function* instructions(b,state={}){if(b.length<0x3c||b.toString('latin1',0,4)!=='SYS4'||b.readUInt32LE(0x20)!==0x1c)return;
 let pool=offsetOf(b.readInt32LE(0x28));if(pool<0x3c||pool>b.length)pool=b.length;let p=0x3c;
 while(p+4<=pool){const op=b.readUInt32LE(p),n=OPS.get(op);if(n===undefined||p+4+n*8>b.length){state.aborted=true;return;}const args=[];
  for(let i=0;i<n;i++)args.push({type:b.readUInt32LE(p+4+i*8),value:b.readInt32LE(p+8+i*8)});p+=4+n*8;
  for(const [i,a] of args.entries()){const o=a.type===STR||op===LOAD_ARRAY&&i===1?offsetOf(a.value):-1;if(o>=p&&o<pool)pool=o;}
  state.pool=pool;
  yield {op,args};}}
const trim=t=>kit.trimBoth(t.replace(/\s*\r?\n\s*/g,''));
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),lines=[],anchors=[];let msg=null;
 const flush=()=>{if(msg!==null){const t=trim(msg);if(t)lines.push(t);}msg=null;};
 const state={aborted:false,pool:0};
 for(const {op,args} of instructions(b,state)){
  if(op===PRINT&&args[0]?.type===INT&&args[0].value===0&&args[1]?.type===STR){msg=(msg||'')+stringAt(b,args[1].value);continue;}
  if(op===NEWLINE){if(msg!==null)msg+='\n';continue;}
  if(op===FURIGANA&&args[1]?.type===STR){msg=(msg||'')+stringAt(b,args[1].value);continue;}
  flush();
  if(op===PRINT&&args[0]?.type===INT&&args[0].value===2&&args[1]?.type===STR){const n=trim(stringAt(b,args[1].value));if(n)lines.push(n);continue;}
  for(const a of args)if(a.type===STR){const s=stringAt(b,a.value);if(s&&kit.ascii(s))anchors.push(s);}}
 flush();
 /* a newer title's opcode the table does not know ends the walk: the string pool (NOT-ed C strings in use order, from the
    first string the code used up to the address tables) still holds the text, so its non-ASCII strings are the lines */
 if(state.aborted&&state.pool>0x3c){lines.length=0;const end=offsetOf(b.readInt32LE(0x28));const stop=end>state.pool&&end<=b.length?end:b.length;let p=state.pool;
  while(p<stop){let q=p;while(q<stop&&(b[q]^0xff)!==0)q++;const t=trim(stringAt(b,(p-0x3c)/4));if(t&&!kit.ascii(t)&&!/�/.test(t))lines.push(t);p=q+1;p+=(4-((p-0x3c)%4))%4;}}
 return {lines,anchors};}
const isScript=b=>b.length>=0x3c&&b.toString('latin1',0,4)==='SYS4';

const engine=kit.engine({id:'eushully',hint:'sys4ini.bin + *.ALF',
 archives:{find:dir=>alfs(dir).map(a=>a.file),list:file=>{const a=alfs(path.dirname(file)).find(x=>x.file===file);if(!a)return null;
  const scripts=a.entries.filter(e=>/\.bin$/i.test(e.name));if(!scripts.length)return null;
  return scripts.map(e=>({name:e.name,read:()=>kit.readAt(file,e.offset,e.size)}));},sort:false},
 loose:{name:/^(?!sys[34]ini)[^]*[.]bin$/i,subs:["","script","scr"]},parse,test:n=>/\.bin$/i.test(n)});
module.exports={engine,parse,readIni,alfs,instructions,stringAt,isScript,OPS};
