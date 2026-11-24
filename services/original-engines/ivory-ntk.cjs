// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const {SJIS}=require('./kit.cjs');
const MAX_SCENE_BYTES=1<<20;
const MAX_TEXT_UNITS=2048;
const HEADERS=new Map([['cTEX',16],['cFNM',16],['cCOD',28]]);

// Independently implemented from static analysis of the AGS 1.6.2 NTK loader.
// Archive extraction uses MeguLit's existing GARbro runtime (morkt, MIT).
// The loader conditionally swaps each bit pair, then XORs the rotating seed.
function decipher(data,seed){
 const result=Buffer.allocUnsafe(data.length);
 for(let at=0;at<data.length;at+=4){
  const word=data.readUInt32LE(at);
  const swap=(word^(word>>>1))&(seed^(seed>>>1))&0x55555555;
  result.writeUInt32LE((word^swap^(swap<<1)^seed)>>>0,at);
  seed=((seed<<1)|(seed>>>31))>>>0;
 }
 return result;
}

function sections(data){
 if(data.length<8||data.length>MAX_SCENE_BYTES||data.toString('latin1',0,4)!=='fAGS'||data.readUInt32LE(4)!==data.length)return null;
 const result=new Map();
 for(let at=8;at<data.length;){
  if(data.length-at<16)return null;
  const tag=data.toString('latin1',at,at+4),header=HEADERS.get(tag);
  const size=data.readUInt32LE(at+4),start=data.readUInt32LE(at+8);
  if(!header||result.has(tag)||start!==header||size<header||size%4||size>data.length-at)return null;
  let stop=size,seed=data.readUInt32LE(at+12);
  if(tag==='cCOD'){
   // cCOD ends with an unencrypted offset table.
   stop=seed;
   if(stop<start||stop>size||stop%4||size-stop!==4*data.readUInt32LE(at+24))return null;
   seed=data.readUInt32LE(at+16);
  }
  result.set(tag,{start:at+start,stop:at+stop,seed});
  at+=size;
 }
 return result.size===HEADERS.size?result:null;
}

function lineEnds(text){
 const ends=new Uint32Array(text.length/2);
 let end=text.length;
 for(let at=text.length-2;at>=0;at-=2){
  if(text.readUInt16LE(at)===0)end=at;
  ends[at/2]=end;
 }
 return ends;
}

function lineAt(text,ends,offset){
 if(offset%2||offset>=text.length)return '';
 const end=ends[offset/2];
 if(end===text.length||end-offset>MAX_TEXT_UNITS*2)return '';
 const bytes=Buffer.allocUnsafe(end-offset);
 let length=0;
 for(let at=offset;at<end;at+=2){
  const low=text[at],high=text[at+1];
  if(low===0)bytes[length++]=high;
  else if(low!==0xff){bytes[length++]=low;bytes[length++]=high;}
 }
 const line=SJIS.decode(bytes.subarray(0,length)).trim();
 return line.includes('\ufffd')?'':line;
}

function parse(data){
 const lines=[],anchors=[],chunks=sections(data);
 if(!chunks)return {lines,anchors};
 const read=tag=>{const {start,stop,seed}=chunks.get(tag);return decipher(data.subarray(start,stop),seed);};
 const text=read('cTEX'),code=read('cCOD'),ends=lineEnds(text);
 const add=offset=>{const line=lineAt(text,ends,offset);if(line)lines.push(line);};
 for(let at=0;at<code.length;){
  const op=code.readUInt16LE(at),size=code.readUInt16LE(at+2);
  if(size<4||size%4||size>code.length-at)return {lines:[],anchors};
  // Dialogue commands reference the body separately from names, flags and voice files.
  if(op===1&&size===12)add(code.readUInt32LE(at+8));
  if(op===2&&size===20)add(code.readUInt32LE(at+12));
  if(op===9&&size===28&&code.readUInt32LE(at+8)===2){
   add(code.readUInt32LE(at+12));
   add(code.readUInt32LE(at+20));
  }
  at+=size;
 }
 return {lines,anchors};
}

module.exports={parse,MAX_SCENE_BYTES};
