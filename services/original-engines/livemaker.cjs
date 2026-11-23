// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// VF/LSB layout derived from Peter Rowlands and tinfoil's pylivemaker, GPL-3.0-or-later,
// commit ceeb12911c571fe6da77107bb0eaf7eb29594612. See docs/re-livemaker-reader.md.
const fs=require('node:fs'),zlib=require('node:zlib');
const LIMITS=Object.freeze({file:2**31,index:1<<20,entries:4096,name:1024,packed:8<<20,expanded:16<<20,totalRead:64<<20,totalExpanded:64<<20,script:8<<20,commands:20000,glyphs:200000,items:4096,string:65536});
function fail(code,at){const e=new Error('LIVEMAKER_'+code);e.code=e.message;if(at!==undefined)e.at=at;throw e;}
function limits(opts={}){if(!opts||typeof opts!=='object'||Array.isArray(opts))fail('BAD_LIMIT');const out={...LIMITS};for(const [k,v] of Object.entries(opts)){if(!Object.hasOwn(out,k)||!Number.isSafeInteger(v)||v<1||v>out[k])fail('BAD_LIMIT');out[k]=v;}return out;}
const decoder=new TextDecoder('shift_jis',{fatal:true});
function text(b){try{return decoder.decode(b);}catch{fail('INVALID_CP932');}}
class Cursor{
 constructor(b,l,at=0){this.b=b;this.l=l;this.at=at;}
 take(n){if(!Number.isSafeInteger(n)||n<0||n>this.b.length-this.at)fail('TRUNCATED',this.at);const b=this.b.subarray(this.at,this.at+n);this.at+=n;return b;}
 u8(){return this.take(1)[0];}u32(){return this.take(4).readUInt32LE();}i32(){return this.take(4).readInt32LE();}
 count(max=this.l.items){const n=this.u32();if(n>max)fail('COUNT',this.at-4);return n;}
 string(){const n=this.count(this.l.string);return text(this.take(n));}
 end(){if(this.at!==this.b.length)fail('TRAILING_BYTES',this.at);}
}
function obfuscator(){let key=0;const next=()=>key=(Math.imul(key,5)+0x75d6ee39)>>>0;return {decodeBytes(b){const o=Buffer.alloc(b.length);for(let i=0;i<b.length;i++)o[i]=b[i]^(next()&255);return o;},integer(b){return (b.readUInt32LE()^next())>>>0;}};}
function entryPath(s){
 const name=s.replace(/\\/g,'/');if(!name||name.startsWith('/')||/[\x00-\x1f\x7f:<>"|?*]/.test(name))fail('ENTRY_PATH');
 const parts=name.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('ENTRY_PATH');return name;
}
const CRC=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
function checksum(b){let c=0xffffffff;for(const x of b)c=(c>>>8)^CRC[(c^x)&255];return (c^0xffffffff)>>>0;}
function archive(source,opts){
 const l=limits(opts);let fd=null,closed=false,readBytes=0,expanded=0;
 let size,stamp,buffer;
 const close=()=>{if(!closed){closed=true;if(fd!==null)fs.closeSync(fd);}};
 const read=(at,n)=>{
  if(closed)fail('CLOSED');if(!Number.isSafeInteger(at)||!Number.isSafeInteger(n)||at<0||n<0||at>size||n>size-at||n>l.totalRead-readBytes)fail('READ_BUDGET');readBytes+=n;
  if(buffer)return Buffer.from(buffer.subarray(at,at+n));
  const s=fs.fstatSync(fd);if([s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join('|')!==stamp)fail('SOURCE_CHANGED');
  const b=Buffer.alloc(n);let got=0;while(got<n){const k=fs.readSync(fd,b,got,n-got,at+got);if(!k)fail('TRUNCATED');got+=k;}return b;
 };
 try{
  if(Buffer.isBuffer(source)){buffer=source;size=source.length;}else{if(typeof source!=='string')fail('SOURCE');fd=fs.openSync(source,'r');const s=fs.fstatSync(fd);size=s.size;stamp=[s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join('|');}
  if(!Number.isSafeInteger(size)||size<10||size>l.file)fail('FILE_BUDGET');
  const head=read(0,2),embedded=head.equals(Buffer.from('MZ'));let offset=0,footer=0;
  if(embedded){const tail=read(size-6,6);if(tail.toString('ascii',4)!=='lv')fail('EXE_FOOTER');offset=tail.readUInt32LE();footer=6;if(offset<2||offset>size-footer-10)fail('EXE_OFFSET');}
  const c=new Cursor(read(offset,Math.min(l.index,size-offset-footer)),l);
  if(c.take(2).toString('ascii')!=='vf')fail('MAGIC');const version=c.u32();if(![100,101,102].includes(version))fail('UNSUPPORTED_ARCHIVE_VERSION');
  const count=c.count(l.entries),names=[],seen=new Set(),nameKeys=obfuscator();
  for(let i=0;i<count;i++){const n=c.count(l.name),name=entryPath(text(nameKeys.decodeBytes(c.take(n)))),key=name.normalize('NFC').toLowerCase();if(seen.has(key))fail('DUPLICATE_PATH');seen.add(key);names.push(name);}
  const lows=obfuscator(),highs=obfuscator(),offsets=[];
  for(let i=0;i<=count;i++){const low=lows.integer(c.take(4)),raw=c.take(4),high=version>=101?highs.integer(raw):raw.readUInt32LE();if(version===100&&high)fail('OFFSET_HIGH');if(high&0x80000000)fail('UNSUPPORTED_SPLIT_ARCHIVE');offsets.push(low);}
  const modes=Array.from(c.take(count)),unknown=Array.from({length:count},()=>c.u32()),sums=Array.from({length:count},()=>c.u32()),encrypt=Array.from(c.take(count));
  for(let i=0;i<offsets.length;i++)if(offsets[i]<c.at||offsets[i]>size-offset-footer||(i&&offsets[i]<offsets[i-1]))fail('ENTRY_OFFSET');
  const end=offset+(offsets.at(-1)??c.at),extra=size-end;
  if(embedded){if(extra!==6)fail('TRAILING_ARCHIVE_BYTES');}else if(extra!==0){if(extra!==6)fail('TRAILING_ARCHIVE_BYTES');const tail=read(end,6);if(tail.readUInt32LE()!==offset||tail.toString('ascii',4)!=='lv')fail('TRAILING_ARCHIVE_BYTES');}
  const entries=names.map((name,i)=>{
   const at=offset+offsets[i],packed=offsets[i+1]-offsets[i],mode=modes[i];if(mode>3||encrypt[i]>1)fail('UNSUPPORTED_COMPRESSION');
   return Object.freeze({name,offset:at,packed,mode,checksum:sums[i],encrypted:!!encrypt[i],unknown:unknown[i],read(){
    if(closed)fail('CLOSED');if(mode!==0&&mode!==1||encrypt[i])fail('UNSUPPORTED_ENCRYPTION');if(packed>l.packed)fail('PACKED_BUDGET');const cap=Math.min(l.expanded,l.totalExpanded-expanded);if(cap<1)fail('EXPANDED_BUDGET');
    const raw=read(at,packed);if(checksum(raw)!==sums[i])fail('CHECKSUM');let out;
    if(mode===1){if(raw.length>cap)fail('EXPANDED_BUDGET');out=raw;}else try{const inflated=zlib.inflateSync(raw,{maxOutputLength:cap,info:true});if(inflated.engine.bytesWritten!==raw.length)fail('DECOMPRESSION_TRAILING');out=inflated.buffer;}catch{expanded+=cap;fail('DECOMPRESSION');}
    expanded+=out.length;return out;
   }});
  });
  return Object.freeze({version,embedded,offset,entries:Object.freeze(entries),close});
 }catch(e){close();throw e;}
}

function expression(c){
 const count=c.count();for(let i=0;i<count;i++){const op=c.u8();if(op>20)fail('UNSUPPORTED_EXPRESSION',c.at-1);c.string();const n=c.count();if(op===11&&c.u8()>170)fail('UNSUPPORTED_FUNCTION');
  for(let j=0;j<n;j++){const type=c.u8();if(type===0||type===4)c.string();else if(type===1)c.take(4);else if(type===2)c.take(10);else if(type===3)c.u8();else fail('UNSUPPORTED_PARAMETER');}}
}
function tpword(buf,opts){
 const l=limits(opts);if(!Buffer.isBuffer(buf)||buf.length>l.script)fail('SCRIPT_BUDGET');const c=new Cursor(buf,l);
 if(c.take(6).toString('ascii')!=='TpWord'||c.take(3).toString('ascii')!=='105')fail('UNSUPPORTED_TPWORD');
 const decorators=[];for(let i=0,n=c.count();i<n;i++){const count=c.u32();c.take(18);const font=c.string(),ruby=c.string();c.take(8);decorators.push({count,font,ruby});}
 const conditions=[];for(let i=0,n=c.count();i<n;i++)conditions.push({count:c.u32(),target:c.string()});
 const links=[];for(let i=0,n=c.count();i<n;i++)links.push({count:c.u32(),event:c.string(),extra:c.string()});
 const blocks=[],events=[],glyphs=[],glyphCount=c.count(l.glyphs);let chars=[],start=0,nameLabel=null;
 const flush=()=>{const s=chars.join('').replace(/\n+$/,'');if(s)blocks.push({text:s,start,end:glyphs.length,nameLabel});chars=[];};
 for(let i=0;i<glyphCount;i++){
  const type=c.u8(),condition=c.i32();if(condition< -1||condition>=conditions.length)fail('CONDITION_INDEX');const g={type,condition};
  if(type===1){g.link=c.i32();g.speed=c.u32();const ch=c.take(2).readUInt16LE(),raw=Buffer.from([ch>>>8,ch&255]);g.ch=text(raw[0]?raw:raw.subarray(1));g.decorator=c.i32();if(!g.ch||g.ch.includes('\0')||g.decorator< -1||g.decorator>=decorators.length||g.link< -1||g.link>=links.length)fail('GLYPH_INDEX');if(!chars.length)start=i;chars.push(g.ch);}
  else if(type===2){flush();c.take(10);}
  else if(type===3){g.breakType=c.u8();if(g.breakType>3)fail('UNSUPPORTED_BREAK');if(g.breakType===0&&chars.length)chars.push('\n');else flush();}
  else if(type===4||type===5)flush();
  else if(type===6){flush();g.event=c.string();const [event,...args]=g.event.split('\r\n');if(event.replace(/^\x01/,'')==='NAMELABEL')nameLabel=event.startsWith('\x01')?null:args[0]??null;events.push({glyph:i,event:g.event});}
  else fail('UNSUPPORTED_GLYPH',c.at-5);
  glyphs.push(g);
 }
 flush();c.end();return {version:105,blocks,glyphs,decorators,conditions,links,events};
}
function parse(buf,opts){
 const l=limits(opts);if(!Buffer.isBuffer(buf)||buf.length>l.script)fail('SCRIPT_BUDGET');const c=new Cursor(buf,l);
 if(c.u32()!==117)fail('UNSUPPORTED_LSB_VERSION');const flags=c.u8();if(flags>1)fail('UNSUPPORTED_FLAGS');const types=c.count(64),stride=c.count(64);if(types!==64||stride!==22)fail('UNSUPPORTED_COMMAND_TABLE');c.take(types*stride);
 const commands=[],scenarios=[];for(let i=0,n=c.count(l.commands);i<n;i++){
  const at=c.at,type=c.u8(),indent=c.u32(),mute=c.u8(),notUpdate=c.u8(),line=c.u32();if(indent>l.commands||mute>1||notUpdate>1)fail('COMMAND_HEADER');const cmd={at,type,line,indent,mute:!!mute};
  if(type===3)cmd.name=c.string();
  else if(type===4||type===5){cmd.page=c.string();cmd.label=c.u32();if(type===5)c.string();expression(c);if(type===5)for(let j=0,k=c.count();j<k;j++)expression(c);}
  else if(type===0||type===1||type===6||type===14)expression(c);
  else if(type===2){}
  else if(type===7){expression(c);expression(c);expression(c);}
  else if(type===15){c.string();if(c.u8()>4)fail('UNSUPPORTED_PARAMETER');expression(c);c.u8();}
  else if(type===20){const size=c.count(l.script),scenario=tpword(c.take(size),opts);for(let j=0;j<4;j++)expression(c);if(!mute)scenarios.push({command:i,line,scenario});}
  else fail('UNSUPPORTED_COMMAND',at);
  commands.push(cmd);
 }
 c.end();const blocks=scenarios.flatMap(s=>s.scenario.blocks.map(b=>({...b,command:s.command,line:s.line})));return {lines:blocks.map(b=>b.text),anchors:[],blocks,commands,scenarios};
}
module.exports={archive,parse,tpword,checksum,LIMITS};
