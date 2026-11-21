// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const zlib=require('node:zlib');
const MAX=8<<20,TOTAL=32<<20;

/* Scripts is data: accept only its primitive Marshal shapes, never Ruby classes or executable object loaders. */
function scriptTable(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>MAX||buffer[0]!==4||buffer[1]!==8)throw Error('RGSS_SCRIPT_MARSHAL');
 let p=2,nodes=0;const objects=[],symbols=[];
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||p+n>buffer.length)throw Error('RGSS_SCRIPT_BOUNDS');const b=buffer.subarray(p,p+n);p+=n;return b;};
 const byte=()=>take(1)[0];
 function number(){const c=byte()<<24>>24;if(!c)return 0;if(c>=5)return c-5;if(c<=-5)return c+5;
  if(Math.abs(c)>4)throw Error('RGSS_SCRIPT_INTEGER');const b=take(Math.abs(c));let v=0;for(let i=0;i<b.length;i++)v+=b[i]*2**(8*i);return c<0?v-2**(8*-c):v;}
 const count=()=>{const n=number();if(n<0||n>20000)throw Error('RGSS_SCRIPT_COUNT');return n;};
 function value(depth=0){
  if(++nodes>40000||depth>64)throw Error('RGSS_SCRIPT_BUDGET');const start=p,t=byte();
  if(t===105)return {kind:'number',value:number()};
  if(t===48||t===84||t===70)return {kind:'scalar'};
  if(t===59){const n=number();if(n<0||n>=symbols.length)throw Error('RGSS_SCRIPT_SYMBOL');return symbols[n];}
  if(t===64){const n=number();if(n<0||n>=objects.length)throw Error('RGSS_SCRIPT_REFERENCE');return {kind:'reference',target:objects[n]};}
  if(t===34||t===58){const n=number();if(n<0||n>MAX)throw Error('RGSS_SCRIPT_STRING');const node={kind:t===34?'string':'symbol',value:take(n),start,end:p};(t===34?objects:symbols).push(node);return node;}
  if(t===91){const node={kind:'array',value:[]};objects.push(node);const n=count();for(let i=0;i<n;i++)node.value.push(value(depth+1));return node;}
  if(t===73){const node=value(depth+1),n=count();for(let i=0;i<n;i++){value(depth+1);value(depth+1);}return node;}
  throw Error('RGSS_SCRIPT_UNEXPECTED_TYPE');
 }
 const root=value();if(root.kind!=='array'||p!==buffer.length)throw Error('RGSS_SCRIPT_TABLE');
 let total=0;const rows=root.value.map(row=>{
  if(row.kind!=='array'||row.value.length!==3)throw Error('RGSS_SCRIPT_ROW');
  const [id,name,packed]=row.value;if(id.kind!=='number'||name.kind!=='string'||packed.kind!=='string')throw Error('RGSS_SCRIPT_ROW_TYPES');
  const source=zlib.inflateSync(packed.value,{maxOutputLength:MAX});total+=source.length;if(total>TOTAL)throw Error('RGSS_SCRIPT_INFLATE_BUDGET');
  return {id:id.value,name:name.value.toString('utf8'),source,packed};
 });
 return {rows,bytes:total};
}

function marshalInteger(n){
 if(!Number.isSafeInteger(n)||n<0||n>0x7fffffff)throw Error('RGSS_SCRIPT_LENGTH');if(!n)return Buffer.from([0]);if(n<123)return Buffer.from([n+5]);
 const out=[];while(n){out.push(n&255);n=Math.floor(n/256);}return Buffer.from([out.length,...out]);
}

/* Replace only the Main compressed-string token; other objects, links and encoding ivars keep their exact bytes. */
function patchMain(buffer,bootstrap){
 const table=scriptTable(buffer),main=table.rows.filter(row=>row.name==='Main');
 if(main.length!==1||table.rows.slice(table.rows.indexOf(main[0])+1).some(row=>!['','exit'].includes(row.source.toString('utf8').trim())))throw Error('RGSS_MAIN_NOT_FINAL');
 const row=main[0];if(row.source.includes(Buffer.from('MEGULIT_RGSS_BOOTSTRAP')))throw Error('RGSS_ALREADY_PATCHED');
 const prefix=Buffer.from(String(bootstrap),'utf8');if(prefix.length>1<<20)throw Error('RGSS_BOOTSTRAP_BUDGET');
 const source=Buffer.concat([prefix,Buffer.from('\n'),row.source]),packed=zlib.deflateSync(source);
 return Buffer.concat([buffer.subarray(0,row.packed.start),Buffer.from([34]),marshalInteger(packed.length),packed,buffer.subarray(row.packed.end)]);
}

/* RGSSAD v1's index key advances on names and sizes, not on file payloads, so later members need no key changes. */
function patchArchiveV1(buffer,entry,replacement){
 if(!Buffer.isBuffer(buffer)||!Buffer.isBuffer(replacement)||buffer.subarray(0,8).toString('hex')!=='5247535341440001'||!entry||![entry.offset,entry.size,entry.key].every(Number.isSafeInteger)||entry.offset<12||entry.size<0||entry.offset+entry.size>buffer.length||replacement.length>MAX)throw Error('RGSS_ARCHIVE_PATCH_SCOPE');
 const sizeKey=(buffer.readUInt32LE(entry.offset-4)^entry.size)>>>0,size=Buffer.alloc(4);size.writeUInt32LE((replacement.length^sizeKey)>>>0);
 const encrypted=Buffer.from(replacement);let k=entry.key>>>0;for(let i=0;i<encrypted.length;i++){if(i&&!(i&3))k=(Math.imul(k,7)+3)>>>0;encrypted[i]^=k>>>((i&3)*8)&255;}
 return Buffer.concat([buffer.subarray(0,entry.offset-4),size,encrypted,buffer.subarray(entry.offset+entry.size)]);
}

module.exports={scriptTable,patchMain,patchArchiveV1,marshalInteger};
