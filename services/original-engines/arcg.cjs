// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');

const SCB=/\.scb$/i;
const HEADER_SIZE=32, MAX_SIZE=64<<20;
const decoder=new TextDecoder('shift_jis',{fatal:true});

function header(bytes,size){
 if(bytes.length<HEADER_SIZE||size>MAX_SIZE||bytes.toString('ascii',0,4)!=='ARCG'||
    bytes.readUInt32LE(4)!==0x10000||bytes.readUInt16LE(16)!==1)return null;
 const index=bytes.readUInt32LE(8), length=bytes.readUInt32LE(12), count=bytes.readUInt32LE(18);
 if(index<HEADER_SIZE||length<10||index+length>size||!count)return null;
 return {index,end:index+length,count};
}

function nameField(bytes,at,end,allowEmpty=false){
 const width=bytes[at];
 if(width<2||at+width+8>end)return null;
 const name=bytes.subarray(at+1,at+width);
 const terminator=name.indexOf(0);
 if(terminator<0||(!allowEmpty&&!terminator))return null;
 return {text:kit.cname(name),next:at+width};
}

/* Flat ARCG v1 script archives. Directory and entry offsets are absolute. */
function entries(bytes){
 const archive=header(bytes,bytes.length);
 if(!archive)return [];
 const {index,end,count}=archive;
 const directory=nameField(bytes,index,end,true);
 if(!directory||bytes.readUInt32LE(directory.next+4)!==count)return [];
 let at=bytes.readUInt32LE(directory.next);
 if(at<directory.next+8||count>Math.floor((end-at)/11))return [];

 const files=[];
 for(let i=0;i<count;i++){
  const name=nameField(bytes,at,end);
  if(!name)return [];
  const offset=bytes.readUInt32LE(name.next),size=bytes.readUInt32LE(name.next+4);
  if(offset<HEADER_SIZE||offset+size>index)return [];
  files.push({name:name.text,offset,size});
  at=name.next+8;
 }
 return files;
}

function pageText(parts){
 if(!parts?.length)return '';
 try{return decoder.decode(Buffer.concat(parts)).trim();}catch{return '';}
}

/* A displayed page starts with command 07 and ends with 0A. Command 09 adds
   one wrapped text fragment. The 40 terminator separates scripts from tables. */
function parse(bytes){
 const lines=[];
 let page=null;
 for(let at=0;at+2<=bytes.length;){
  const width=bytes[at], opcode=bytes[at+1];
  const next=at+width;
  if(width<2||next>bytes.length)break;
  if(opcode===0x40){
   if(width===3&&bytes[at+2]===0&&bytes.subarray(next).every(value=>value===0xff))return {lines,anchors:[]};
   break;
  }
  if(opcode===0x07)page=width===6?[]:null;
  if(opcode===0x09&&page){
   const text=bytes.subarray(at+2,next-1);
   if(width<3||bytes[next-1]!==0||text.some(value=>value<0x20))page=null;
   else page.push(text);
  }
  if(opcode===0x0a){
   const line=width===2?pageText(page):'';
   if(line)lines.push(line);
   page=null;
  }
  at=next;
 }
 return {lines:[],anchors:[]};
}

const probe=file=>!!header(kit.head(file,HEADER_SIZE),kit.size(file));
const sources=dir=>kit.files(dir,{name:SCB}).filter(probe);

const engine={
 id:'arcg',
 hint:'*.scb (ARCG)',
 archives:()=>[],
 sources,
 scenes(dir,{deadline=Infinity}={}){
  const scenes=[];
  for(const file of sources(dir)){
   if(Date.now()>=deadline)break;
   const size=kit.size(file);
   if(size<HEADER_SIZE||size>MAX_SIZE)continue;
   let bytes;
   try{bytes=kit.readAt(file,0,size);}catch{continue;}
   for(const {name,offset,size:entrySize} of entries(bytes)){
    if(Date.now()>=deadline)return scenes;
    const result=parse(bytes.subarray(offset,offset+entrySize));
    if(result.lines.length)scenes.push({name,parse:()=>result});
   }
  }
  return scenes;
 },
 parse,
};
module.exports={engine,probe};
