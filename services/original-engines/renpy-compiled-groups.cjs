// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Explicit inert canonical subset only; intentionally unregistered with all readers
const {PROFILE, validateRoot} = require('./renpy-compiled-root.cjs');
const {normalizeNode, LIMITS: NODE_LIMITS} = require('./renpy-node-state.cjs');
const LIMITS = Object.freeze({
 documents:64, objects:100000, edges:400000, depth:64, groups:10000,
 says:40000, groupSays:64, lineBytes:16384, speakerBytes:256,
 textBytes:4*1024*1024, stringBytes:8*1024*1024, sourceBytes:512,
 outputObjects:250000, outputEdges:1000000, outputBytes:32*1024*1024
});
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,159}$/;
const WHO = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const RESERVED = new Set('old new define default python init style screen translate label if elif else while for return jump call show hide scene play queue stop voice pause with image pass'.split(' '));
const get = Map.prototype.get;
const size = Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
function fail(code) { const e = Error('RENPY_COMPILED_GROUPS_'+code); e.code=e.message; throw e; }
function record(v, required, optional, code) {
 if (!v || Object.getPrototypeOf(v)!==Object.prototype) fail(code);
 const keys=Reflect.ownKeys(v);
 if (required.some(k=>!Object.hasOwn(v,k)) || keys.some(k=>!required.includes(k)&&!optional.includes(k))) fail(code);
 for (const k of keys) if (!Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value')) fail(code);
}
function array(v, max, code) {
 if (!Array.isArray(v) || Object.getPrototypeOf(v)!==Array.prototype || v.length>max) fail(code);
 const keys=Reflect.ownKeys(v);
 if (keys.length!==v.length+1) fail(code);
 for(let i=0;i<v.length;i++) if (!Object.hasOwn(v,i) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v,i),'value')) fail(code);
}
function exact(re, value) { const m=re.exec(value); return m!==null && m[0]===value; }
function limitsOf(v) {
 if (v===undefined) return {...LIMITS};
 record(v,[],Object.keys(LIMITS),'LIMITS'); const out={...LIMITS};
 for(const [k,n] of Object.entries(v)) {
  if(!Number.isSafeInteger(n)||n<1||n>LIMITS[k]) fail('LIMITS'); out[k]=n;
 }
 return out;
}
function extractCanonical(options) {
 record(options,['profile','documents'],['limits'],'OPTIONS');
 if(options.profile!==PROFILE) fail('PROFILE');
 const limits=limitsOf(options.limits), counts=Object.fromEntries(Object.keys(LIMITS).map(k=>[k,0]));
 const owned=new Set(), infos=new Map(), ids=new Set(), sourceIds=new Set();
 const scenes=[], documents=[]; let firstKey, haveKey=false;
 function spend(key,n) {
  const next=counts[key]+n;
  if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(next)||next>limits[key]) fail('BUDGET_'+key.toUpperCase());
  counts[key]=next;
 }
 function allocate(objects,edges,bytes) { spend('outputObjects',objects); spend('outputEdges',edges); spend('outputBytes',bytes); }
 function own(v) {
  if(!v||typeof v!=='object') fail('CONTAINER');
  if(owned.has(v)) fail('STRUCTURAL_ALIAS');
  spend('objects',1); owned.add(v);
 }
 function textBytes(v) {
  if(typeof v!=='string'||!v.isWellFormed()||v.includes('\0')) fail('STRING');
  return Buffer.byteLength(v);
 }
 function copyPath(path) { allocate(1,path.length,32+path.length*24); return path.slice(); }
 function location(info,path) {
  allocate(1,4,128+Buffer.byteLength(info.doc.sourceId));
  return {sourceId:info.doc.sourceId,path:copyPath(path),className:info.raw.className,fields:info.normal.provenance};
 }
 function normalized(raw,doc,path,parent) {
  own(raw);
  const normal=normalizeNode(raw,{profile:PROFILE,limits:{
   fields:NODE_LIMITS.fields,stringBytes:NODE_LIMITS.stringBytes,
   totalStringBytes:Math.min(NODE_LIMITS.totalStringBytes,limits.stringBytes),
   blockItems:Math.min(NODE_LIMITS.blockItems,limits.objects)
  }});
  own(normal.state); spend('edges',4+size.call(normal.state)*2);
  const f=normal.fields, F=size.call(f);
  // Includes temporary derived Maps/records and graph-audit bookkeeping, not a JS RSS claim
  allocate(F+12,32*F+112,512*F+2048);
  spend('stringBytes',normal.metadata.counts.stringBytes);
  const name=get.call(f,'_name');
  if(name&&typeof name==='object') { array(name.items,3,'NAME_ARRAY'); own(name); own(name.items); spend('edges',2+name.items.length); }
  allocate(1,path.length,32+path.length*24);
  const info={raw,normal,doc,children:[],links:[]}; infos.set(raw,info);
  doc.nodes++;
  if(parent) { parent.children.push(raw); allocate(0,1,8); }
  for(const key of ['next','after']) if(f.has(key)) {
   const target=get.call(f,key);
   if(target!==null) { info.links.push(target); spend('edges',1); allocate(0,1,8); }
  }
  return info;
 }
 function field(info,k) { return get.call(info.normal.fields,k); }
 function simpleSay(info,path,plain) {
  const f=info.normal.fields;
  for(const k of ['with_','attributes','arguments','temporary_attributes']) if(get.call(f,k)!==null) fail('SAY_SEMANTICS_UNSUPPORTED');
  if(get.call(f,'interact')!==true||get.call(f,'explicit_identifier')!==false||get.call(f,'rollback')!=='normal') fail('SAY_SEMANTICS_UNSUPPORTED');
  if(plain&&get.call(f,'identifier')!==null) fail('SAY_IDENTIFIER_UNSUPPORTED');
  const who=get.call(f,'who'),fast=get.call(f,'who_fast'),what=get.call(f,'what');
  if(who===null) { if(fast!==false) fail('SPEAKER_UNSUPPORTED'); }
  else {
   if(typeof who!=='string'||!exact(WHO,who)||RESERVED.has(who)||fast!==true) fail('SPEAKER_UNSUPPORTED');
   if(Buffer.byteLength(who)>limits.speakerBytes) fail('BUDGET_SPEAKERBYTES');
  }
  const n=textBytes(what);
  if(!what.trim()) fail('EMPTY_SAY');
  if(n>limits.lineBytes) fail('BUDGET_LINEBYTES');
  counts.lineBytes=Math.max(counts.lineBytes,n);
  counts.speakerBytes=Math.max(counts.speakerBytes,who===null?0:Buffer.byteLength(who));
  const bytes=n+(who===null?0:Buffer.byteLength(who));
  spend('says',1); spend('textBytes',bytes);
  allocate(1,3,64+bytes);
  return {who,text:what,source:location(info,path)};
 }
 function groupIdentity(info) {
  if(field(info,'language')!==null||field(info,'alternate')!==null) fail('LANGUAGE_OR_ALTERNATE_UNSUPPORTED');
  const id=field(info,'identifier');
  if(typeof id!=='string'||!exact(IDENT,id)) fail('GROUP_ID');
  if(ids.has(id)) fail('DUPLICATE_ID'); ids.add(id);
  spend('groups',1); return id;
 }
 function listItems(list,doc) {
  record(list,['kind','items'],[],'LIST'); if(list.kind!=='list') fail('LIST');
  array(list.items,limits.objects,'LIST'); own(list); own(list.items);
  spend('edges',2+list.items.length); doc.lists++; return list.items;
 }
 function walk(list,doc,path,depth,parent,kind,group) {
  if(depth>limits.depth) fail('BUDGET_DEPTH'); counts.depth=Math.max(counts.depth,depth);
  const items=listItems(list,doc);
  allocate(1,path.length,64+path.length*24);
  if(kind==='says'&&(!items.length||items.length>limits.groupSays)) fail('GROUP_SIZE');
  if(kind==='says') counts.groupSays=Math.max(counts.groupSays,items.length);
  for(let i=0;i<items.length;i++) {
   const nodePath=path.concat(i),info=normalized(items[i],doc,nodePath,parent),name=info.raw.className;
   if(kind==='says') {
    if(name!=='renpy.ast.Say') fail('GROUP_CHILD_UNSUPPORTED');
    group.says.push(simpleSay(info,nodePath,true)); allocate(0,1,8); continue;
   }
   if(name==='renpy.ast.Label') {
    if(field(info,'hide')!==false||field(info,'parameters')!==null) fail('LABEL_SEMANTICS_UNSUPPORTED');
    walk(field(info,'block'),doc,nodePath.concat('block'),depth+1,info,'top',null);
   } else if(name==='renpy.ast.Translate') {
    const id=groupIdentity(info);
    if(i+1>=items.length) fail('MARKER_REQUIRED');
    const markerPath=path.concat(i+1),marker=normalized(items[i+1],doc,markerPath,parent);
    if(marker.raw.className!=='renpy.ast.EndTranslate') fail('MARKER_REQUIRED');
    allocate(2,7,128+Buffer.byteLength(id));
    const g={id,says:[],source:location(info,nodePath),terminal:location(marker,markerPath)};
    walk(field(info,'block'),doc,nodePath.concat('block'),depth+1,info,'says',g);
    doc.groups.push(g); allocate(0,1,8); i++;
   } else if(name==='renpy.ast.TranslateSay') {
    counts.groupSays=Math.max(counts.groupSays,1);
    const id=groupIdentity(info); allocate(2,5,128+Buffer.byteLength(id));
    doc.groups.push({id,says:[simpleSay(info,nodePath,false)],source:location(info,nodePath)}); allocate(0,2,16);
   } else fail('TOP_NODE_UNSUPPORTED');
  }
 }
 function checkLinks() {
  for(const info of infos.values()) for(const target of info.links) {
   const other=infos.get(target);
   if(!other) fail('DANGLING_REFERENCE');
   if(other.doc!==info.doc) fail('CROSS_DOCUMENT_REFERENCE');
  }
  // Iterative union-graph audit: control edges never emit text and cannot form cycles
  const colors=new Map();
  for(const start of infos.values()) {
   if(colors.has(start.raw)) continue;
   colors.set(start.raw,1); const stack=[{info:start,at:0}];
   while(stack.length) {
    const frame=stack[stack.length-1],v=frame.info;
    const total=v.children.length+v.links.length;
    if(frame.at===total) {colors.set(v.raw,2);stack.pop();continue;}
    const n=frame.at<v.children.length?v.children[frame.at]:v.links[frame.at-v.children.length]; frame.at++;
    if(colors.get(n)===1) fail('REFERENCE_CYCLE');
    if(!colors.has(n)) {colors.set(n,1);stack.push({info:infos.get(n),at:0});}
   }
  }
 }
 array(options.documents,limits.documents,'DOCUMENTS'); if(!options.documents.length) fail('DOCUMENTS');
 own(options); own(options.documents); spend('edges',2+options.documents.length);
 allocate(12,80,4096);
 for(const input of options.documents) {
  record(input,['sourceId','root'],[],'DOCUMENT');
  own(input); spend('edges',2);
  const sourceId=input.sourceId;
  if(typeof sourceId!=='string'||sourceId.length>limits.sourceBytes) fail('SOURCE_ID');
  const n=textBytes(sourceId);
  if(!n||n>limits.sourceBytes||/[\x00-\x1f\x7f\u2028\u2029]/.test(sourceId)) fail('SOURCE_ID');
  counts.sourceBytes=Math.max(counts.sourceBytes,n);
  if(sourceIds.has(sourceId)) fail('DUPLICATE_SOURCE_ID'); sourceIds.add(sourceId);
  spend('documents',1); spend('stringBytes',n);
  // Close array-accessor holes before handing these arrays to the actual metadata helper
  record(input.root,['kind','items'],[],'ROOT'); array(input.root.items,2,'ROOT');
  if(input.root.items.length!==2) fail('ROOT');
  record(input.root.items[1],['kind','items'],[],'ROOT_LIST');
  array(input.root.items[1].items,Math.min(50000,limits.objects),'ROOT_LIST');
  const checked=validateRoot(input.root,{profile:PROFILE,limits:{statements:Math.min(50000,limits.objects)}});
  const r=checked.root,data=checked.data,errors=get.call(data.entries,'deferred_parse_errors'),key=get.call(data.entries,'key');
  if(haveKey) {
   if(typeof firstKey!==typeof key||(typeof key==='string'?key!==firstKey:!Buffer.prototype.equals.call(key,firstKey))) fail('KEY_MISMATCH');
  } else {firstKey=key;haveKey=true;}
  for(const v of [r,r.items,data,data.entries,errors,errors.entries]) own(v);
  spend('edges',15); if(Buffer.isBuffer(key)) {own(key);spend('stringBytes',key.length);}
  const doc={sourceId,groups:[],nodes:0,lists:0};
  allocate(4,12,512+n);
  walk(checked.stmts,doc,['stmts'],1,null,'top',null);
  if(!doc.groups.length) fail('EMPTY_DOCUMENT');
  scenes.push({name:sourceId,groups:doc.groups});
  documents.push({sourceId,groups:doc.groups.length,nodes:doc.nodes,lists:doc.lists});
 }
 checkLinks();
 return {profile:PROFILE,scenes,provenance:{documents,
  order:'provided-documents-and-declared-list-order',coverage:'provided-document-structure-only',
  canonicalLanguage:null,compilerIdentityVerified:false,languageVerified:false,
  gameFullTextVerified:false,pointReadVerified:false,ackVerified:false},counts};
}
module.exports={PROFILE,LIMITS,extractCanonical};
