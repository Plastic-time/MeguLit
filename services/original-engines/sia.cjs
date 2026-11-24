// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const path=require('node:path'),kit=require('./kit.cjs');

// This SIA-Soft retail build stores the script key in its executable's .data section.
const BRAND=Buffer.from('SIA-Soft\0'),BRAND_OFFSET=0x58d20,KEY_OFFSET=0x59010,KEY_LENGTH=400;
const MAX_SCRIPT_BYTES=1<<20;
const TEXT_COMMANDS=new Set(['TEXT','TEXT_NO_INP','ADD_TEXT']);
const isGameExecutable=executable=>path.basename(String(executable||'')).toLowerCase()==='1055.exe';

function installation(dir){
 const executable=path.join(dir,'1055.exe');
 try{
  if(kit.head(executable,2).toString('ascii')!=='MZ'||!kit.readAt(executable,BRAND_OFFSET,BRAND.length).equals(BRAND))return null;
  const key=kit.readAt(executable,KEY_OFFSET,KEY_LENGTH+1);
  if(key.indexOf(0)!==KEY_LENGTH)return null;
  const files=kit.files(dir,{name:/\.pac$/i,subs:['data'],max:20000});
  return {executable,key:kit.not(key.subarray(0,KEY_LENGTH)),files};
 }catch{return null;}
}

function claimedInstallation(dir){
 const game=installation(dir);
 return game&&require('./registry.cjs').readersFor(dir).includes('sia')?game:null;
}

function read(file,key){
 const data=kit.readAt(file,0,MAX_SCRIPT_BYTES+1);
 if(data.length>MAX_SCRIPT_BYTES)return Buffer.alloc(0);
 // A zero prefix marks a repeating XOR stream. Other scripts pass through.
 return data[0]===0?kit.xor(data.subarray(1),key):data;
}

function parse(data){
 const text=kit.SJIS.decode(data),lines=[],anchors=[];
 if(/[\u0000\ufffd]/.test(text))return {lines,anchors};
 const rows=text.split(/\r?\n/);
 let comment=false;
 for(let i=0;i<rows.length;i++){
  const command=rows[i].trim();
  if(comment){if(command.endsWith('*/'))comment=false;continue;}
  if(command.startsWith('/*')){comment=!command.endsWith('*/');continue;}
  if(command.startsWith('#'))anchors.push(command);
  if(!TEXT_COMMANDS.has(command))continue;
  const payload=(rows[i+1]||'').trim();
  if(payload.startsWith('/*'))continue;
  i++;
  const line=payload.replace(/@[\w.-]+\.wav$/i,'').replace(/\\n/g,'\n').trim();
  if(line)lines.push(line);
 }
 return {lines,anchors};
}

const engine={id:'sia',hint:'data\\*.pac',
 sources(dir){const game=claimedInstallation(dir);return game?[game.executable,...game.files]:[];},
 scenes(dir){
  const game=claimedInstallation(dir);
  if(!game)return [];
  return game.files.map(file=>({name:path.basename(file),read:()=>read(file,game.key)}));
 },
 parse,
 // A replacement PAC cannot be read with the installed executable's key by assumption.
 test:()=>false,
 archives:()=>[],
};
module.exports={engine,isGameExecutable,probe:dir=>!!installation(dir)?.files.length};
