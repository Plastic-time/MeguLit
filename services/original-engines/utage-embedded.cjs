// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Only compiled Utage books with named language columns are writable here. Media and
   arbitrary MonoBehaviour strings cannot establish a Japanese original. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ser=require('./unity-serialized.cjs'),ufs=require('./unityfs.cjs'),utage=require('./utage.cjs'),scripts=require('./unity-i2.cjs');
const MAX_FILE=128<<20,MAX_TOTAL=256<<20,MAX_NODE=16<<20,MAX_ENTRIES=4096,MAX_SOURCES=128;
const classes=new Map([['AdvImportBook','Utage']]);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const aligned=n=>(n+3)&~3;
function encodeString(value){const bytes=Buffer.from(value),out=Buffer.alloc(4+aligned(bytes.length));out.writeUInt32LE(bytes.length);bytes.copy(out,4);return out;}
function parseBook(raw,version){
 if(version<17||version>22||raw.length<36)throw Error('EMBEDDED_UNSUPPORTED_LAYOUT');
 for(const tail of [5,3,4]){
  try{
   let pos=28;
   const int=()=>{if(pos+4>raw.length)throw Error('UTAGE_EOF');const n=raw.readInt32LE(pos);pos+=4;return n;};
   const string=()=>{const start=pos,n=int();if(n<0||n>1<<20||pos+n>raw.length)throw Error('UTAGE_STRING');const value=raw.toString('utf8',pos,pos+n);if(value.includes('\uFFFD'))throw Error('UTAGE_UTF8');pos=aligned(pos+n);if(pos>raw.length)throw Error('UTAGE_EOF');return {value,start,end:pos};};
   const name=string().value;if(!/\.book$/i.test(name))throw Error('UTAGE_NOT_BOOK');
   int();const count=int();if(count<1||count>256)throw Error('UTAGE_SHEETS');const sheets=[];
   for(let s=0;s<count;s++){
    const size=int();if(size<1||size>100000)throw Error('UTAGE_ROWS');const rows=[];
    for(let i=0;i<size;i++){
     const rowIndex=int(),width=int();if(width<0||width>64)throw Error('UTAGE_COLUMNS');const strings=[],spans=[];
     for(let j=0;j<width;j++){const field=string();strings.push(field.value);spans.push({start:field.start,end:field.end});}
     const empty=int(),comment=int();if(![0,1].includes(empty)||![0,1].includes(comment))throw Error('UTAGE_FLAGS');
     rows.push({rowIndex,strings,spans,empty,comment});
    }
    const sheetName=string().value,values=Array.from({length:tail},int);
    if(tail===5&&(values[3]!==0||values[4]!==0))throw Error('UTAGE_ENTITY_OVERRIDES');
    sheets.push({name:sheetName,rows});
   }
   if(pos!==raw.length)throw Error('UTAGE_TRAILING_DATA');return {name,sheets};
  }catch{}
 }
 throw Error('EMBEDDED_UNSUPPORTED_LAYOUT');
}
function sourceFiles(dir,check,directories){
 const files=[],dataDirs=[];let visited=0;
 function entries(folder){directories.push(folder);const out=[],handle=fs.opendirSync(folder);try{let e;while((e=handle.readSync())){if(++visited>MAX_ENTRIES)throw Error('EMBEDDED_ENTRY_BUDGET');check();if(e.isSymbolicLink())continue;out.push(e);}}finally{handle.closeSync();}return out;}
 for(const e of entries(dir))if(e.isDirectory()&&/_Data$/i.test(e.name))dataDirs.push(path.join(dir,e.name));
 if(dataDirs.length!==1)throw Error('EMBEDDED_UNSUPPORTED_DATA_LAYOUT');
 for(const data of dataDirs){
  const children=entries(data);
  for(const e of children)if(e.isFile()&&/^(?:resources|sharedassets\d+|globalgamemanagers)\.assets$|^level\d+$/i.test(e.name))files.push(path.join(data,e.name));
  const streaming=children.find(e=>e.isDirectory()&&/^StreamingAssets$/i.test(e.name));
  if(!streaming)continue;
  const walk=(folder,depth)=>{for(const e of entries(folder)){const file=path.join(folder,e.name);if(e.isDirectory()&&depth<4)walk(file,depth+1);else if(e.isFile()&&/\.scenarios\.asset$/i.test(e.name))files.push(file);}};
  walk(path.join(data,streaming.name),0);
 }
 return [...new Set(files)].sort();
}
function guardBundle(bytes){
 if(ufs.start(bytes.subarray(0,65536))!==0)throw Error('EMBEDDED_UNSUPPORTED_BUNDLE');
 let p=8;const version=bytes.readUInt32BE(p);p+=4;
 if(version<6||version>8)throw Error('EMBEDDED_UNSUPPORTED_BUNDLE');
 for(let i=0;i<2;i++){const end=bytes.indexOf(0,p);if(end<0||end-p>128)throw Error('EMBEDDED_BUNDLE_HEADER');p=end+1;}
 if(p+20>bytes.length||Number(bytes.readBigUInt64BE(p))!==bytes.length)throw Error('EMBEDDED_BUNDLE_HEADER');p+=8;
 const packed=bytes.readUInt32BE(p),unpacked=bytes.readUInt32BE(p+4),flags=bytes.readUInt32BE(p+8);p+=12;
 if(version>=7)p=(p+15)&~15;
 if(packed<24||packed>1<<20||unpacked<24||unpacked>1<<20)throw Error('EMBEDDED_BUNDLE_BUDGET');
 const at=flags&0x80?bytes.length-packed:p;
 if(at<0||at+packed>bytes.length)throw Error('EMBEDDED_BUNDLE_HEADER');
 const block=bytes.subarray(at,at+packed),compression=flags&63;
 const info=compression===0?block:compression===2||compression===3?ufs.lz4(block,unpacked):compression===1?require('./lzma.cjs').decode(block,unpacked):null;
 if(!info||info.length!==unpacked)throw Error('EMBEDDED_BUNDLE_HEADER');
 let q=16;const count=info.readUInt32BE(q);q+=4;if(count<1||count>1024||q+count*10+4>info.length)throw Error('EMBEDDED_BUNDLE_BUDGET');
 let total=0,compressed=0;
 for(let i=0;i<count;i++){
  const size=info.readUInt32BE(q),sizePacked=info.readUInt32BE(q+4),kind=info.readUInt16BE(q+8)&63;q+=10;
  if(size>MAX_NODE||sizePacked>MAX_FILE||![0,1,2,3].includes(kind))throw Error('EMBEDDED_BUNDLE_BUDGET');total+=size;compressed+=sizePacked;
 }
 if(total>MAX_NODE||compressed>bytes.length||info.readUInt32BE(q)!==1||q+24>info.length)throw Error('EMBEDDED_BUNDLE_BUDGET');q+=4;
 if(info.readBigUInt64BE(q)!==0n||Number(info.readBigUInt64BE(q+8))!==total)throw Error('EMBEDDED_UNSUPPORTED_BUNDLE');
 let dataAt=flags&0x80?p:p+packed;if(flags&0x200)dataAt=(dataAt+15)&~15;
 if(dataAt+compressed>(flags&0x80?at:bytes.length))throw Error('EMBEDDED_TRUNCATED_BUNDLE');
}
function readSource(file,context){
 context.check();const stat=fs.statSync(file);
 if(stat.size>MAX_FILE||context.bytes+stat.size>MAX_TOTAL)throw Error('EMBEDDED_BYTE_BUDGET');
 context.bytes+=stat.size;const bytes=fs.readFileSync(file);context.progress({phase:'reading',file,bytes:context.bytes});
 if(/\.scenarios\.asset$/i.test(file)){
  guardBundle(bytes);const nodes=ufs.read(bytes);if(nodes.length!==1||nodes[0].data.length>MAX_NODE)throw Error('EMBEDDED_UNSUPPORTED_BUNDLE');const node=nodes[0];
  return {file,bytes,serialized:node.data,nodeName:node.name,sha256:sha(bytes)};
 }
 return {file,bytes,serialized:bytes,sha256:sha(bytes)};
}
function objectsOf(source,metadata){
 const parsed=ser.parse(source.serialized,{layout:true});if(!parsed?.little||parsed.version<17||parsed.version>22)return [];
 const ownIds=scripts.scriptIds(source.serialized,classes),out=[];
 for(const object of parsed.objects){
  if(object.offset<parsed.dataOffset||object.offset+object.size>source.serialized.length)throw Error('EMBEDDED_OBJECT_BOUNDARY');
  if(object.type!==114||object.size<36)continue;
  const raw=source.serialized.subarray(object.offset,object.offset+object.size),n=raw.readUInt32LE(28);
  if(n>512||32+n>raw.length||!/\.book$/i.test(raw.toString('utf8',32,32+n)))continue;
  const fileId=raw.readInt32LE(16),scriptId=Number(raw.readBigInt64LE(20));
  const typed=object.tree?.some(node=>node.name==='importGridList'&&node.type==='AdvImportScenarioSheet');
  let linked=fileId===0&&ownIds.has(scriptId);
  if(fileId>0&&metadata){const refs=ser.parse(source.serialized,{externals:true})?.externals;linked=refs?.[fileId-1]?.toLowerCase()==='globalgamemanagers.assets'&&metadata.has(scriptId);}
  if(!linked&&!typed)throw Error('EMBEDDED_UNVERIFIED_UTAGE_CLASS');
  out.push({...parseBook(raw,parsed.version),object,source,parsed});
 }
 return out;
}
function rowsOf(book){
 const result=[],ids=new Set();
 for(const sheet of book.sheets){
  const header=sheet.rows[0]?.strings.map(value=>value.trim().toLowerCase())||[];
  const column=name=>header.indexOf(name),jp=column('text'),zh=column('chinese'),command=column('command'),speaker=column('arg1'),voice=column('voice');
  if(jp<0||zh<0||command<0||speaker<0||new Set(header.filter(Boolean)).size!==header.filter(Boolean).length)throw Error('EMBEDDED_UNSUPPORTED_COLUMNS');
  for(const row of sheet.rows.slice(1)){
   const id=sheet.name.split(':').pop()+':'+row.rowIndex;
   if(ids.has(id))throw Error('EMBEDDED_DUPLICATE_ROW_ID');ids.add(id);
   if(row.empty||row.comment)continue;
   const cells=row.strings,cmd=cells[command]||'',rawJapanese=cells[jp]||'';
   if(!rawJapanese.trim()||cmd.startsWith('//')||(cmd&&rawJapanese.trim().startsWith('//')))continue;
   if(cmd!==''&&cmd!=='Selection')throw Error('EMBEDDED_UNSUPPORTED_COMMAND');
   if(cells.length<=Math.max(jp,zh,command,speaker,voice))throw Error('EMBEDDED_ROW_WIDTH');
   const japanese=utage._internal.clean(rawJapanese).text,chinese=utage._internal.clean(cells[zh]).text;
   if(!japanese)continue;
   result.push({id,sheet:sheet.name.split(':').pop(),rowIndex:row.rowIndex,speaker:cells[speaker]||'',voice:voice<0?'':cells[voice]||'',japanese,chinese,rawJapanese,rawChinese:cells[zh],span:row.spans[zh],choice:cmd==='Selection'});
  }
 }
 const text=result.map(row=>row.japanese).join(''),kana=(text.match(/[ぁ-ゖァ-ヺ]/g)||[]).length,hiragana=(text.match(/[ぁ-ゖ]/g)||[]).length,han=(text.match(/[一-鿿]/g)||[]).length;
 if(hiragana<16||hiragana/Math.max(1,kana+han)<.3)throw Error('EMBEDDED_NO_JAPANESE_BODY');
 return result;
}
function rebuildSerialized(source,replacements){
 const parsed=ser.parse(source.serialized,{layout:true}),sorted=[...parsed.objects].sort((a,b)=>a.offset-b.offset),parts=[];let pos=0,delta=0;const positions=[];
 for(const object of sorted){
  if(object.offset<pos)throw Error('EMBEDDED_OVERLAPPING_OBJECTS');
  parts.push(source.serialized.subarray(pos,object.offset));
  const bytes=replacements.get(object.offset)||source.serialized.subarray(object.offset,object.offset+object.size);
  positions.push({object,offset:object.offset+delta,size:bytes.length});parts.push(bytes);delta+=bytes.length-object.size;pos=object.offset+object.size;
 }
 parts.push(source.serialized.subarray(pos));const bytes=Buffer.concat(parts);if(bytes.length>MAX_FILE)throw Error('EMBEDDED_OUTPUT_BUDGET');
 for(const {object,offset,size} of positions){if(parsed.version>=22)bytes.writeBigInt64LE(BigInt(offset-parsed.dataOffset),object.offsetAt);else bytes.writeUInt32LE(offset-parsed.dataOffset,object.offsetAt);bytes.writeUInt32LE(size,object.sizeAt);}
 if(parsed.version>=22)bytes.writeBigUInt64BE(BigInt(bytes.length),24);else bytes.writeUInt32BE(bytes.length,4);
 return bytes;
}
function packBundle(name,bytes,unity){
 const be=n=>{const out=Buffer.alloc(4);out.writeUInt32BE(n);return out;},block=Buffer.alloc(10),entry=Buffer.alloc(20);
 block.writeUInt32BE(bytes.length);block.writeUInt32BE(bytes.length,4);entry.writeBigUInt64BE(BigInt(bytes.length),8);entry.writeUInt32BE(4,16);
 const info=Buffer.concat([Buffer.alloc(16),be(1),block,be(1),entry,Buffer.from(name+'\0')]);
 const head=Buffer.concat([Buffer.from('UnityFS\0'),be(6),Buffer.from('5.x.x\0'),Buffer.from(unity+'\0'),Buffer.alloc(20)]);
 head.writeBigUInt64BE(BigInt(head.length+info.length+bytes.length),head.length-20);head.writeUInt32BE(info.length,head.length-12);head.writeUInt32BE(info.length,head.length-8);
 return Buffer.concat([head,info,bytes]);
}
function rewriteBook(book,rows){
 const raw=book.source.serialized.subarray(book.object.offset,book.object.offset+book.object.size),parts=[];let pos=0;
 for(const row of [...rows].sort((a,b)=>a.span.start-b.span.start)){parts.push(raw.subarray(pos,row.span.start),encodeString(row.rawJapanese));pos=row.span.end;}
 parts.push(raw.subarray(pos));const bytes=Buffer.concat(parts),check=rowsOf({...parseBook(bytes,book.parsed.version),source:book.source});
 if(check.length!==rows.length||check.some((row,i)=>row.id!==rows[i].id||row.rawJapanese!==rows[i].rawJapanese||row.rawChinese!==rows[i].rawJapanese||row.speaker!==rows[i].speaker||row.voice!==rows[i].voice))throw Error('EMBEDDED_ROUNDTRIP_FAILED');
 return bytes;
}
function plan(dir,{progress=()=>{},budgetMs=45000}={}){
 const start=Date.now(),context={bytes:0,directories:[],progress,check(){if(Date.now()-start>budgetMs)throw Error('EMBEDDED_TIME_BUDGET');if(process.memoryUsage().rss>900*1024*1024)throw Error('EMBEDDED_MEMORY_BUDGET');}};
 const files=sourceFiles(dir,context.check,context.directories),sources=[],books=[],metadata=new Map();
 if(files.length>MAX_SOURCES)throw Error('EMBEDDED_SOURCE_BUDGET');
 for(const file of files.filter(file=>/globalgamemanagers\.assets$/i.test(file))){const source=readSource(file,context);sources.push(source);metadata.set(path.dirname(file),scripts.scriptIds(source.serialized,classes));}
 for(const file of files.filter(file=>!/globalgamemanagers\.assets$/i.test(file))){const source=readSource(file,context);sources.push(source);let parent=path.dirname(file);while(parent!==path.dirname(parent)&&!/_Data$/i.test(parent))parent=path.dirname(parent);books.push(...objectsOf(source,metadata.get(parent)));}
 if(!books.length)throw Error('EMBEDDED_UNSUPPORTED');
 const shapes=books.map(book=>({name:book.name,source:book.source.file,sheets:book.sheets.map(sheet=>({name:sheet.name,rows:sheet.rows.map(row=>row.strings)})),book}));
 const active=utage._internal.selectBooks(shapes);if(!active.length)throw Error('EMBEDDED_CONFLICT');
 for(const candidate of shapes.filter(shape=>/\.scenarios\.asset$/i.test(shape.source))){
  const others=shapes.filter(shape=>shape!==candidate&&JSON.stringify(shape.sheets.map(sheet=>sheet.name.split(':').pop()))===JSON.stringify(candidate.sheets.map(sheet=>sheet.name.split(':').pop())));
  if(others.length&&!others.some(other=>utage._internal.sameSourceRows(other,candidate)&&other.book.sheets.every((sheet,i)=>sheet.rows.every((row,j)=>row.rowIndex===candidate.book.sheets[i].rows[j].rowIndex&&row.empty===candidate.book.sheets[i].rows[j].empty&&row.comment===candidate.book.sheets[i].rows[j].comment))))throw Error('EMBEDDED_CONFLICT');
  if(!active.includes(candidate)&&others.length)throw Error('EMBEDDED_AMBIGUOUS_PATCH');
 }
 const pairs=active.flatMap(shape=>rowsOf(shape.book).map(row=>({...row,book:shape.book.name}))),updates=new Map();
 for(const book of books){context.check();const rows=rowsOf(book);if(!updates.has(book.source))updates.set(book.source,new Map());updates.get(book.source).set(book.object.offset,rewriteBook(book,rows));}
 const writes=[];
 for(const [source,replacements] of updates){context.check();const serialized=rebuildSerialized(source,replacements),next=source.nodeName?packBundle(source.nodeName,serialized,ser.parse(serialized).unity):serialized;
  const verified=ser.parse(serialized);if(!verified||verified.objects.length!==ser.parse(source.serialized).objects.length||verified.objects.some(o=>o.offset+o.size>serialized.length))throw Error('EMBEDDED_ROUNDTRIP_FAILED');
  if(source.nodeName){const nodes=ufs.read(next);if(nodes.length!==1||nodes[0].name!==source.nodeName||!nodes[0].data.equals(serialized))throw Error('EMBEDDED_ROUNDTRIP_FAILED');}
  if(!next.equals(source.bytes))writes.push({file:source.file,original:source.bytes,next,originalSha256:source.sha256,patchedSha256:sha(next)});
 }
 const publicSources=sources.map(source=>({path:source.file,bytes:source.bytes.length,sha256:source.sha256}));
 return {pairs,writes,sources:publicSources,directories:context.directories,token:sha(Buffer.from(JSON.stringify(publicSources))),tables:active.reduce((n,shape)=>n+shape.sheets.length,0),readBytes:context.bytes};
}
module.exports={plan,_internal:{parseBook,rowsOf,rebuildSerialized,packBundle,encodeString,guardBundle},LIMITS:{MAX_FILE,MAX_TOTAL,MAX_NODE,MAX_ENTRIES,MAX_SOURCES}};
