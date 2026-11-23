// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const crypto=require('node:crypto'),path=require('node:path'),fs=require('node:fs'),zlib=require('node:zlib');
const MAX_ENTRY=8*1024*1024;
const decoder=new TextDecoder('shift_jis',{fatal:true});
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const line=s=>typeof s==='string'&&s.trim()&&s.length<=1000&&!/[\x00-\x08\x0b-\x1f\ufffd]/.test(s)?s.trim():'';
/* Read command names from the game's own YSCM table, rather than guessing a WORD opcode from repeated strings. */
function yurisCommands(b){
 if(!Buffer.isBuffer(b)||b.length<16||b.length>2*1024*1024||b.toString('latin1',0,4)!=='YSCM'||b.readUInt32LE(12)!==0)return [];
 const count=b.readUInt32LE(8);if(!count||count>256)return [];let at=16;
 const string=()=>{const end=b.indexOf(0,at);if(end<at||end-at>2048)throw Error('YSCM_STRING');const text=decoder.decode(b.subarray(at,end));at=end+1;return text;};
 try{const names=[];for(let i=0;i<count;i++){const name=string();if(!/^[\x21-\x7e]{1,80}$/.test(name)||names.includes(name)||at>=b.length)return [];names.push(name);const actions=b[at++];for(let j=0;j<actions;j++){string();if(at+2>b.length)return [];at+=2;}}return names;}catch{return [];}
}
function yurisFirstLine(instructions,commands,start=0,end=instructions.length){
 const word=commands.indexOf('WORD');if(word<0||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end>instructions.length||end<start)return null;
 for(let i=start;i<end;i++){const x=instructions[i];if(x.op!==word||x.args.length!==1||x.args[0].type!==0)continue;let text;try{text=line(decoder.decode(x.args[0].data));}catch{return null;}if(text)return {firstLine:{ja:text},firstLineAt:'instructions['+i+'].args[0]'};}
 return null;
}
function psbFirstLine(scene,sceneIndex){
 const reader=require('./original-engines/cx-worker.cjs');
 for(let i=0;i<(Array.isArray(scene.texts)?scene.texts.length:0);i++){const parsed=reader.textsOf({root:{scenes:[{texts:[scene.texts[i]]}]}}),slots=parsed[0]?.rows[0],ja=line(slots?.[0]);if(!ja)continue;const firstLine={ja};for(const [locale,index] of [['en',1],['zh',2]]){const text=line(slots[index]);if(text)firstLine[locale]=text;}return {firstLine,firstLineAt:'scenes['+sceneIndex+'].texts['+i+']'};}
 return null;
}
const variantName=s=>typeof s==='string'?path.posix.basename(s.replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase():'';
function psbImage(scene,sceneIndex,names){for(const [i,t] of (Array.isArray(scene.texts)?scene.texts:[]).entries())for(const [j,entry] of (Array.isArray(t?.[5]?.data)?t[5].data:[]).entries()){if(!Array.isArray(entry)||!['stage','event'].includes(entry[1])||entry[2]?.class!==entry[1])continue;const name=variantName(entry[2].redraw?.imageFile?.file);if(names.has(name))return {image:names.get(name),imageAt:'scenes['+sceneIndex+'].texts['+i+'][5].data['+j+'][2].redraw.imageFile.file'};}return null;}
function yurisImage(instructions,start,end,names,commands=[]){const literal=require('./story-discovery.cjs').literal;for(let i=start;i<end;i++){const x=instructions[i];if(commands[x.op]!=='GOSUB'||literal(x.args[0]).toUpperCase()!=='MAC.EV')continue;const name=variantName(literal(x.args[1]));if(names.has(name))return {image:names.get(name),imageAt:'instructions['+i+'].args[1]'};}return null;}
/* A completion marker bounds its ending. A later scene in the same file is not part of that ending. */
function yurisEnding(instructions,commands,marker,labels,names){
 const {literal,arrayWrite}=require('./story-discovery.cjs');if(!Number.isSafeInteger(marker)||marker<0||marker>=instructions.length||commands[instructions[marker].op]!=='LET'||!arrayWrite(instructions[marker]))return null;
 const local=labels.filter(l=>Number.isSafeInteger(l.index)).sort((a,b)=>a.index-b.index),begin=local.filter(l=>l.index<=marker).at(-1),end=local.find(l=>l.index>marker)?.index??instructions.length;if(!begin)return null;
 let depth=0,image=null,first=null,terminal=-1,jump=-1;for(let i=begin.index;i<end;i++){const x=instructions[i],command=commands[x.op],fn=command==='GOSUB'?literal(x.args[0]).toUpperCase():'';
  if(command==='IF'){depth++;continue;}if(command==='IFEND'){if(--depth<0)return null;continue;}
  if(i===marker&&depth!==0)return null;
  if(i<marker&&!depth&&!first&&command==='WORD')first=yurisFirstLine(instructions,commands,i,i+1);
  if(fn==='MAC.EV'){if(depth!==0||terminal>=0)return null;const name=variantName(literal(x.args[1]));image=names.has(name)?{image:names.get(name),imageAt:'instructions['+i+'].args[1]'}:null;}
  if(i>marker&&!depth&&fn==='ES.SCENARIO.END'){terminal=i;}
  if(command==='GO'&&!depth){if(i<=marker||terminal<0||literal(x.args[0]).toUpperCase()!=='SCENARIO_TITLE')return null;jump=i;break;}
 }
 if(depth||terminal<0||jump<0)return null;
 return {...(first||{}),...(image||{}),label:begin.label,startAt:'instructions['+begin.index+']',terminalAt:'instructions['+terminal+']',jumpAt:'instructions['+jump+']'};
}
function readYpf(file,e){
 if(!e||!['packed','unpacked','offset'].every(k=>Number.isSafeInteger(e[k])&&e[k]>=0)||e.packed>MAX_ENTRY||e.unpacked>MAX_ENTRY)throw Error('STORY_ENTRY_BUDGET');
 const fd=fs.openSync(file,'r');try{const before=fs.fstatSync(fd);if(e.offset+e.packed>before.size)throw Error('STORY_ENTRY_RANGE');const raw=Buffer.alloc(e.packed);if(fs.readSync(fd,raw,0,raw.length,e.offset)!==raw.length)throw Error('STORY_ENTRY_SHORT');const b=e.compressed?zlib.inflateSync(raw,{maxOutputLength:MAX_ENTRY}):raw;if(b.length!==e.unpacked)throw Error('STORY_ENTRY_SIZE');const after=fs.fstatSync(fd);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k]))throw Error('STORY_SOURCE_CHANGED');return b;}finally{fs.closeSync(fd);}
}
function psbDocument(raw){if(!Buffer.isBuffer(raw)||raw.length>MAX_ENTRY)throw Error('STORY_ENTRY_BUDGET');const psb=require('./original-engines/psb.cjs'),b=raw.toString('latin1',0,4)==='mdf\0'?zlib.inflateSync(raw.subarray(8),{maxOutputLength:MAX_ENTRY}):raw;try{return psb.parse(b);}catch{return psb.openCx(b);}}
module.exports={digest,line,yurisCommands,yurisFirstLine,psbFirstLine,psbImage,yurisImage,yurisEnding,variantName,readYpf,psbDocument};
