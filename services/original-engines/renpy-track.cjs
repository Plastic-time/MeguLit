// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Explicit offline translation tracks; no directory discovery or language inference.
const LIMITS=Object.freeze({sources:64,fileBytes:1024*1024,totalBytes:4*1024*1024,fileLines:40000,totalLines:100000,lineBytes:16384,speakerBytes:256,blocks:10000,says:40000,groupSays:64,textBytes:4*1024*1024});
const IDENT=/^[A-Za-z_][A-Za-z0-9_]{0,159}$/,LANG=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/,WHO=/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const STATEMENTS=new Set('old new define default python init style screen translate label if elif else while for return jump call show hide scene play queue stop voice pause with image pass'.split(' '));
function fail(code,source,line){const error=Error('RENPY_TRACK_'+code);error.code=error.message;if(source!==undefined)error.source=source;if(line!==undefined)error.line=line;throw error;}
function limitsOf(input={}){if(!input||typeof input!=='object'||Array.isArray(input))fail('LIMITS');const out={...LIMITS};for(const [key,value]of Object.entries(input)){if(!Object.hasOwn(LIMITS,key)||!Number.isSafeInteger(value)||value<1||value>LIMITS[key])fail('LIMITS');out[key]=value;}return out;}
function languageOf(value){if(typeof value!=='string'||!LANG.test(value)||/^none$/i.test(value))fail('LANGUAGE');return value;}
function nameOf(value){if(typeof value!=='string'||!value||value.length>512||/[\0\r\n]/.test(value))fail('SOURCE_NAME');return value;}
function spend(counts,limits,key,amount,source,line){counts[key]=(counts[key]||0)+amount;if(counts[key]>limits[key])fail('BUDGET_'+key.toUpperCase(),source,line);}
function textOf(value,limits,counts,source,line){if(typeof value!=='string'||!value.trim()||!value.isWellFormed()||value.includes('\0'))fail('SAY_TEXT',source,line);const bytes=Buffer.byteLength(value);if(bytes>limits.lineBytes)fail('BUDGET_LINEBYTES',source,line);spend(counts,limits,'textBytes',bytes,source,line);return value;}
function whoOf(value,limits,counts,source,line){
 if(value===null)return null;if(typeof value!=='string')fail('SPEAKER',source,line);
 if(value.length>limits.speakerBytes)fail('BUDGET_SPEAKERBYTES',source,line);
 if(!WHO.test(value)||STATEMENTS.has(value))fail('SPEAKER',source,line);
 spend(counts,limits,'textBytes',value.length,source,line);return value;
}
function unquote(body,source,line){let out='';for(let at=0;at<body.length;at++){
 const c=body[at];if(c!=='\\'){out+=c;continue;}const e=body[++at];
 if(e==='n')out+='\n';else if(e==='r')out+='\r';else if(e==='t')out+='\t';else if(e==='"'||e==="'"||e==='\\')out+=e;
 else fail('UNSUPPORTED_ESCAPE',source,line);
 }return out;}
function sayOf(raw,limits,counts,source,line){
 const m=raw.match(/^(?:([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+)?"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/);
 if(!m||STATEMENTS.has(m[1]))fail('UNSUPPORTED_SAY',source,line);spend(counts,limits,'says',1,source,line);
 return {who:whoOf(m[1]||null,limits,counts,source,line),text:textOf(unquote(m[2],source,line),limits,counts,source,line)};
}
function parseLoose({language,sources,limits:inputLimits}={}){
 language=languageOf(language);const limits=limitsOf(inputLimits),counts={},blocks=[],excluded=[],ids=new Set(),names=new Set();
 if(!Array.isArray(sources)||!sources.length||sources.length>limits.sources)fail('BUDGET_SOURCES');
 for(const source of sources){
  if(!source||typeof source!=='object')fail('SOURCE');const name=nameOf(source.name),buf=source.buffer;if(names.has(name))fail('DUPLICATE_SOURCE',name);names.add(name);
  if(!Buffer.isBuffer(buf))fail('BUFFER_REQUIRED',name);if(buf.length>limits.fileBytes)fail('BUDGET_FILEBYTES',name);spend(counts,limits,'totalBytes',buf.length,name);
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{fail('UTF8',name);}
  text=text.replace(/\r\n/g,'\n');if(/[\0\r\x01-\x08\x0b\x0c\x0e-\x1f]/.test(text))fail('CONTROL_CHARACTER',name);
  const lines=text.split('\n');if(lines.length>limits.fileLines)fail('BUDGET_FILELINES',name);spend(counts,limits,'totalLines',lines.length,name);
  let block=null;
  const finish=()=>{if(block?.id&&!block.says.length)fail('EMPTY_BLOCK',name,block.line);};
  for(let index=0;index<lines.length;index++){
   const raw=lines[index],line=index+1;if(Buffer.byteLength(raw)>limits.lineBytes)fail('BUDGET_LINEBYTES',name,line);
   if(!raw.trim()||raw.trimStart().startsWith('#'))continue;
   if(/^\s*\t/.test(raw)||/^ +\t/.test(raw))fail('UNSUPPORTED_INDENT',name,line);
   if(!/^\s/.test(raw)){
    finish();const m=raw.match(/^translate ([A-Za-z_][A-Za-z0-9_]{0,63}) (.+):\s*(?:#.*)?$/);if(!m)fail('UNSUPPORTED_TOP_LEVEL',name,line);
    if(m[1]!==language)fail('LANGUAGE_MISMATCH',name,line);spend(counts,limits,'blocks',1,name,line);
    const item=m[2];if(item==='strings'||item==='python'||/^style [A-Za-z_][A-Za-z0-9_]*$/.test(item)){
     block={kind:item.split(' ')[0],source:name,line};excluded.push(block);continue;
    }
    if(!IDENT.test(item)||/^(?:style|early|screen|init)$/.test(item))fail('UNSUPPORTED_BLOCK',name,line);
    if(ids.has(item))fail('DUPLICATE_ID',name,line);ids.add(item);block={id:item,says:[],source:name,line};blocks.push(block);continue;
   }
   if(!block)fail('ORPHAN_BODY',name,line);if(block.kind)continue;
   if(!raw.startsWith('    ')||raw[4]===' '||raw[4]==='\t')fail('UNSUPPORTED_INDENT',name,line);
   if(block.says.length>=limits.groupSays)fail('BUDGET_GROUPSAYS',name,line);
   block.says.push(sayOf(raw.slice(4),limits,counts,name,line));
  }
  finish();
 }
 return {language,blocks,excluded};
}
function validateGroup(group,limits,counts,ids,source){
 if(!group||typeof group!=='object'||typeof group.id!=='string'||!IDENT.test(group.id))fail('BLOCK_ID',source);
 if(ids.has(group.id))fail('DUPLICATE_ID',source);ids.add(group.id);spend(counts,limits,'blocks',1,source);
 if(!Array.isArray(group.says)||!group.says.length||group.says.length>limits.groupSays)fail('GROUP_SIZE',source);
 for(let at=0;at<group.says.length;at++)if(!Object.hasOwn(group.says,at))fail('SPARSE_SAYS',source);
 return {id:group.id,says:group.says.map(say=>{
  if(!say||typeof say!=='object')fail('SPEAKER',source);
  spend(counts,limits,'says',1,source);return {who:whoOf(say.who,limits,counts,source),text:textOf(say.text,limits,counts,source)};
 })};
}
function pairTrack({language,canonical,track,limits:inputLimits}={}){
 language=languageOf(language);const limits=limitsOf(inputLimits);
 if(!track||track.language!==language)fail('LANGUAGE_MISMATCH');if(!Array.isArray(track.blocks)||!track.blocks.length)fail('EMPTY_TRACK');
 if(!Array.isArray(canonical)||!canonical.length||canonical.length>limits.sources)fail('CANONICAL_SCENES');
 const counts={},translated=new Map(),ids=new Set();
 for(const block of track.blocks){const g=validateGroup(block,limits,counts,ids,block?.source);translated.set(g.id,g);}
 const canonicalIds=new Set(),names=new Set(),used=new Set(),scenes=[];let groups=0,says=0;
 for(const scene of canonical){
  if(!scene||typeof scene!=='object')fail('CANONICAL_SCENE');const name=nameOf(scene.name);if(names.has(name))fail('DUPLICATE_SCENE',name);names.add(name);
  if(!Array.isArray(scene.groups)||!scene.groups.length)fail('CANONICAL_GROUPS',name);const paired=[];
  for(const block of scene.groups){
   const base=validateGroup(block,limits,counts,canonicalIds,name),jp=translated.get(base.id);if(!jp)fail('MISSING_ID',name);
   if(jp.says.length!==base.says.length)fail('GROUP_SIZE',name);
   for(let at=0;at<base.says.length;at++)if(jp.says[at].who!==base.says[at].who)fail('SPEAKER_ORDER',name);
   used.add(base.id);groups++;says+=base.says.length;paired.push({id:base.id,says:jp.says.map(s=>({...s}))});
  }
  scenes.push({name,groups:paired});
 }
 if(used.size!==translated.size)fail('EXTRA_ID');
 return {language,scenes,coverage:{groups,says,matchedGroups:groups,matchedSays:says,rate:1}};
}
module.exports={LIMITS,parseLoose,pairTrack};
