'use strict';
const fs=require('node:fs'),path=require('node:path');
const i32=value=>{const b=Buffer.alloc(4);b.writeInt32LE(value);return b;};
const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
const string=value=>{const b=Buffer.from(value);return Buffer.concat([i32(b.length),align(b)]);};
function script(){return Buffer.concat([string('AdvImportBook'),Buffer.alloc(20),string('AdvImportBook'),string('Utage'),string('Assembly-CSharp.dll'),Buffer.alloc(4)]);}
function book(rows,{name='base.book',sheet='Assets/base_03.xlsx:Start',internal=false,duplicateId=false,rowOffset=0}={}){
 const header=Buffer.alloc(28);header[12]=1;header.writeInt32LE(internal?0:1,16);header.writeBigInt64LE(1n,20);
 const table=rows.flatMap((cells,i)=>[i32(duplicateId&&i===2?1:i+rowOffset),i32(cells.length),...cells.map(string),i32(0),i32(0)]);
 return Buffer.concat([header,string(name),i32(0),i32(1),i32(rows.length),...table,string(sheet),i32(1),i32(0),i32(0),i32(0),i32(0)]);
}
function serialized(objects,{version=22,external=false}={}){
 const classes=[...new Set(objects.map(o=>o.type))],head=Buffer.alloc(version>=22?48:20);
 const parts=[Buffer.from('2020.3.12f1\0'),i32(19),Buffer.from([0]),i32(classes.length)];
 for(const type of classes)parts.push(i32(type),Buffer.from([0,255,255]),Buffer.alloc(type===114?32:16));
 parts.push(i32(objects.length));let length=head.length+Buffer.concat(parts).length,dataLength=0;
 for(let i=0;i<objects.length;i++){
  const o=objects[i],pad=Buffer.alloc((4-length%4)%4),entry=Buffer.alloc(version>=22?24:20);length+=pad.length;
  entry.writeBigInt64LE(BigInt(i+1));
  if(version>=22){entry.writeBigInt64LE(BigInt(dataLength),8);entry.writeUInt32LE(o.bytes.length,16);entry.writeInt32LE(classes.indexOf(o.type),20);}
  else{entry.writeUInt32LE(dataLength,8);entry.writeUInt32LE(o.bytes.length,12);entry.writeInt32LE(classes.indexOf(o.type),16);}
  parts.push(pad,entry);length+=entry.length;dataLength+=o.bytes.length;
 }
 const refs=external?Buffer.concat([i32(0),i32(1),Buffer.alloc(21),Buffer.from('globalgamemanagers.assets\0')]):Buffer.alloc(8);
 parts.push(refs);length+=refs.length;const at=(length+15)&~15,total=at+dataLength;
 head.writeUInt32BE(version,8);
 if(version>=22){head.writeUInt32BE(at-head.length,20);head.writeBigUInt64BE(BigInt(total),24);head.writeBigUInt64BE(BigInt(at),32);}
 else{head.writeUInt32BE(at-head.length);head.writeUInt32BE(total,4);head.writeUInt32BE(at,12);}
 return Buffer.concat([head,...parts,Buffer.alloc(at-length),...objects.map(o=>o.bytes)]);
}
function rows(){
 const out=[['Command','Arg1','Text','Chinese','Voice'],
  ['','役者一','これから最初の旅に出ます。','从这里开始旅程。','voice/a.ogg'],
  ['','役者一','そうですね。','是的。','voice/b.ogg'],
  ['','役者二','今から次の場所へ行きます。','现在去下一个地方。','voice/c.ogg'],
  ['','役者二','そうですね。','确实如此。','voice/d.ogg'],
  ['','','ここは未翻訳の文章です。','',''],
  ['Selection','*go','一緒に行きましょう','一起走吧',''],
  ['Jump','*go','// 移動先のメモ','','']];
 for(let i=0;i<30;i++)out.push(['','','これは物語の文章その'+i+'です。','这是一段故事中的第'+i+'句。','']);
 return out;
}
function install(dir,{patch=true,mutatePatch,mutateBase,duplicateId=false,patchRowOffset=0,version=22}={}){
 const data=path.join(dir,'Game_Data');fs.mkdirSync(data,{recursive:true});
 fs.writeFileSync(path.join(dir,'Game.exe'),'fixture, never execute');
 fs.writeFileSync(path.join(data,'globalgamemanagers.assets'),serialized([{type:115,bytes:script()}],{version}));
 const base=rows();mutateBase?.(base);
 const tail=Buffer.concat([string('Unrelated'),string('保持原样のアセットです。')]);
 fs.writeFileSync(path.join(data,'sharedassets0.assets'),serialized([{type:114,bytes:book(base,{duplicateId})},{type:49,bytes:tail}],{version,external:true}));
 let patchFile;
 if(patch){
  const newer=rows();newer[1][3]='从这里出发踏上旅程。';mutatePatch?.(newer);
  const bytes=serialized([{type:115,bytes:script()},{type:114,bytes:book(newer,{name:'new.book',sheet:'Assets/other_01.xlsx:Start',internal:true,rowOffset:patchRowOffset})}],{version:17});
  const bundle=require('../../services/original-engines/utage-embedded.cjs')._internal.packBundle('CAB-fixture',bytes,'2020.3.7f1');
  patchFile=path.join(data,'StreamingAssets/story/Windows-patch/story.scenarios.asset');fs.mkdirSync(path.dirname(patchFile),{recursive:true});fs.writeFileSync(patchFile,bundle);
 }
 return {dir,data,exe:path.join(dir,'Game.exe'),baseFile:path.join(data,'sharedassets0.assets'),patchFile,tail};
}
module.exports={install,rows,serialized,book,script,string};
