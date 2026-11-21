// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

// Inert data only. This explicit primitive is not used by game discovery.
const LIMITS=Object.freeze({inputBytes:4<<20,operations:200000,stack:10000,memo:50000,nodes:100000,edges:200000,stringBytes:4<<20,itemBytes:1<<20});
const CLASSES=Object.freeze(['renpy.ast.Say','renpy.ast.Translate','renpy.ast.TranslateSay']);
const MARK=Symbol('pickle mark');
function fail(code,offset){const error=Error('RENPY_PICKLE_'+code);error.code=error.message;error.offset=offset;throw error;}
function decode(buffer,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))fail('OPTIONS',0);
 const {limits:overrides={},classes=CLASSES,allowDefaultDict=false,allowPyCodeState=false,allowPyExpr=false}=options;
 if(typeof allowDefaultDict!=='boolean')fail('DEFAULTDICT_OPTION',0);
 if(typeof allowPyCodeState!=='boolean')fail('PYCODE_OPTION',0);
 if(typeof allowPyExpr!=='boolean')fail('PYEXPR_OPTION',0);
 const limits={...LIMITS};
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))fail('LIMITS',0);
 for(const [key,value]of Object.entries(overrides)){
  if(!Object.hasOwn(limits,key)||!Number.isSafeInteger(value)||value<1||value>limits[key])fail('LIMITS',0);
  limits[key]=value;
 }
 if(!Buffer.isBuffer(buffer)||buffer.length>limits.inputBytes)fail('INPUT',0);
 if(!Array.isArray(classes)||classes.length>64||classes.some(name=>typeof name!=='string'||!/^renpy\.ast\.[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(name))||new Set(classes).size!==classes.length)fail('CLASSES',0);
 const allowed=new Set(classes),stack=[],memo=new Map(),counts={operations:0,nodes:0,edges:0,stringBytes:0};
 let at=0,frameEnd=null;
 const spend=(key,n)=>{counts[key]+=n;if(counts[key]>limits[key])fail('BUDGET_'+key.toUpperCase(),at);};
 const need=n=>{if(!Number.isSafeInteger(n)||n<0||n>buffer.length-at||(frameEnd!==null&&n>frameEnd-at))fail('TRUNCATED',at);};
 const byte=()=>{need(1);return buffer[at++];};
 const uint=()=>{need(4);const n=buffer.readUInt32LE(at);at+=4;return n;};
 const large=()=>{need(8);const n=buffer.readBigUInt64LE(at);at+=8;if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('LENGTH',at);return Number(n);};
 const raw=n=>{if(n>limits.itemBytes)fail('BUDGET_ITEMBYTES',at);need(n);spend('stringBytes',n);const value=buffer.subarray(at,at+n);at+=n;return value;};
 const utf8=n=>{const value=raw(n);try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value);}catch{fail('UTF8',at);}};
 const line=()=>{const end=buffer.indexOf(10,at);if(end<at||end-at>limits.itemBytes||(frameEnd!==null&&end>=frameEnd))fail('LINE',at);const value=raw(end-at);at++;if(!value.every(n=>n>=0x21&&n<=0x7e))fail('GLOBAL',at);return value.toString('ascii');};
 const push=value=>{spend('nodes',1);if(stack.length>=limits.stack)fail('BUDGET_STACK',at);stack.push(value);};
 const pop=()=>{if(!stack.length||stack.at(-1)===MARK)fail('STACK',at);return stack.pop();};
 const peek=()=>{if(!stack.length||stack.at(-1)===MARK)fail('STACK',at);return stack.at(-1);};
 const marked=()=>{let index=stack.lastIndexOf(MARK);if(index<0)fail('MARK',at);const values=stack.splice(index+1);stack.pop();return values;};
 const tuple=items=>{spend('edges',items.length);return {kind:'tuple',items};};
 const list=items=>{spend('edges',items.length);return {kind:'list',items};};
 const mapping=()=>({kind:'dict',entries:new Map()});
 const put=(target,key,value)=>{
  if(!['dict','defaultdict'].includes(target?.kind)||!(typeof key==='string'||typeof key==='number'&&Number.isSafeInteger(key)))fail('DICT',at);
  if(target.entries.has(key))fail('DUPLICATE_KEY',at);spend('edges',2);target.entries.set(key,value);
 };
 const pairs=(target,items)=>{if(items.length%2)fail('DICT',at);for(let index=0;index<items.length;index+=2)put(target,items[index],items[index+1]);};
 const remember=index=>{if(index>=limits.memo||memo.size>=limits.memo)fail('BUDGET_MEMO',at);if(memo.has(index))fail('DUPLICATE_MEMO',at);memo.set(index,peek());};
 const recall=index=>{if(!memo.has(index))fail('MEMO',at);push(memo.get(index));};
 const global=(module,name)=>{
  if(allowPyExpr&&module==='renpy.astsupport'&&name==='PyExpr')return Object.freeze({kind:'global',name:'renpy.astsupport.PyExpr'});
  if(allowDefaultDict&&(module==='collections'&&name==='defaultdict'||(module==='builtins'||module==='__builtin__')&&name==='list'))return Object.freeze({kind:'global',name:module+'.'+name});
  if(module!=='renpy.ast'||typeof name!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(name))fail('GLOBAL',at);
  const identity=module+'.'+name;if(!allowed.has(identity))fail('GLOBAL',at);return Object.freeze({kind:'global',name:identity});
 };
 const pyExpr=args=>{
  if(args?.kind!=='tuple'||args.items.length<3||args.items.length>6)fail('PYEXPR_ARGS',at);
  const [text,filename,linenumber,py=2,hashcode=null,column=0]=args.items;
  if(typeof text!=='string')fail('PYEXPR_TEXT',at);
  if(typeof filename!=='string')fail('PYEXPR_FILENAME',at);
  if(!Number.isSafeInteger(linenumber)||linenumber<0||linenumber>0xffffffff)fail('PYEXPR_LINE',at);
  if(py!==2&&py!==3)fail('PYEXPR_PY',at);
  if(hashcode!==null&&(!Number.isSafeInteger(hashcode)||hashcode<0||hashcode>0xffffffff))fail('PYEXPR_HASH',at);
  if(!Number.isSafeInteger(column)||column<0||column>0xffff)fail('PYEXPR_COLUMN',at);
  spend('edges',12);
  return {kind:'pyexpr',className:'renpy.astsupport.PyExpr',text,filename,linenumber,py,hashcode,column};
 };
 const pyCodeState=state=>{
  if(!allowPyCodeState)fail('PYCODE_STATE_DISABLED',at);
  if(state?.kind!=='tuple'||state.items.length<4||state.items.length>7)fail('PYCODE_STATE',at);
  const [tag,source,location,mode,py=2,hashcode=null,colOffset=0]=state.items;
  if(tag!==1)fail('PYCODE_TAG',at);
  if(typeof source!=='string'&&!(allowPyExpr&&source?.kind==='pyexpr'&&source.className==='renpy.astsupport.PyExpr'))fail('PYCODE_SOURCE',at);
  if(location?.kind!=='tuple'||location.items.length!==2||typeof location.items[0]!=='string'||!Number.isSafeInteger(location.items[1])||location.items[1]<0)fail('PYCODE_LOCATION',at);
  if(!['exec','eval','single','hide'].includes(mode))fail('PYCODE_MODE',at);
  if(py!==2&&py!==3)fail('PYCODE_PY',at);
  if(hashcode!==null&&(!Number.isSafeInteger(hashcode)||hashcode<0||hashcode>0xffffffff))fail('PYCODE_HASH',at);
  if(!Number.isSafeInteger(colOffset)||colOffset<0)fail('PYCODE_OFFSET',at);
  spend('nodes',1);spend('edges',16);
  return new Map([['writerTag',tag],['source',source],['filename',location.items[0]],['linenumber',location.items[1]],['mode',mode],['py',py],['hashcode',hashcode],['col_offset',colOffset]]);
 };
 if(byte()!==0x80)fail('PROTOCOL',0);const protocol=byte();if(protocol<2||protocol>5)fail('PROTOCOL',1);
 while(at<buffer.length){
  if(frameEnd===at)frameEnd=null;
  spend('operations',1);const op=byte();
  if([0x95,0x93,0x94,0x8c,0x8d,0x8e].includes(op)&&protocol<4)fail('PROTOCOL_OPCODE',at-1);
  if(op===0x43&&protocol<3||op===0x42&&protocol<3)fail('PROTOCOL_OPCODE',at-1);
  switch(op){
   case 0x95:{if(frameEnd!==null)fail('FRAME',at-1);const size=large();need(size);frameEnd=at+size;break;}
   case 0x2e:{const value=pop();if(stack.length||at!==buffer.length||frameEnd!==null&&at!==frameEnd)fail('TRAILING',at);return {value,protocol,counts:{...counts},bytesRead:at};}
   case 0x28:push(MARK);break;
   case 0x4e:push(null);break;case 0x88:push(true);break;case 0x89:push(false);break;
   case 0x4b:push(byte());break;
   case 0x4d:{need(2);push(buffer.readUInt16LE(at));at+=2;break;}
   case 0x4a:{need(4);push(buffer.readInt32LE(at));at+=4;break;}
   case 0x47:{need(8);const n=buffer.readDoubleBE(at);at+=8;if(!Number.isFinite(n))fail('NUMBER',at);push(n);break;}
   case 0x8a:{const size=byte();if(size>8)fail('NUMBER',at);const bytes=raw(size);let n=0n;for(let i=size-1;i>=0;i--)n=(n<<8n)|BigInt(bytes[i]);if(size&&bytes[size-1]&128)n-=1n<<BigInt(size*8);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))fail('NUMBER',at);push(Number(n));break;}
   case 0x58:push(utf8(uint()));break;
   case 0x8c:push(utf8(byte()));break;
   case 0x8d:push(utf8(large()));break;
   case 0x54:case 0x42:push(Buffer.from(raw(uint())));break;
   case 0x55:case 0x43:push(Buffer.from(raw(byte())));break;
   case 0x8e:push(Buffer.from(raw(large())));break;
   case 0x29:push(tuple([]));break;
   case 0x85:push(tuple([pop()]));break;
   case 0x86:{const second=pop(),first=pop();push(tuple([first,second]));break;}
   case 0x87:{const third=pop(),second=pop(),first=pop();push(tuple([first,second,third]));break;}
   case 0x74:push(tuple(marked()));break;
   case 0x5d:push(list([]));break;case 0x6c:push(list(marked()));break;
   case 0x7d:push(mapping());break;
   case 0x64:{const items=marked(),target=mapping();pairs(target,items);push(target);break;}
   case 0x61:{const value=pop(),target=peek();if(target?.kind!=='list')fail('LIST',at);spend('edges',1);target.items.push(value);break;}
   case 0x65:{const items=marked(),target=peek();if(target?.kind!=='list')fail('LIST',at);spend('edges',items.length);for(const item of items)target.items.push(item);break;}
   case 0x73:{const value=pop(),key=pop();put(peek(),key,value);break;}
   case 0x75:{const items=marked();pairs(peek(),items);break;}
   case 0x63:{const module=line(),name=line();push(global(module,name));break;}
   case 0x93:{const name=pop(),module=pop();push(global(module,name));break;}
   case 0x52:{
    if(!allowDefaultDict&&!allowPyExpr)fail('UNSUPPORTED_OPCODE',at-1);
    const args=pop(),cls=pop();
    if(allowPyExpr&&cls?.kind==='global'&&cls.name==='renpy.astsupport.PyExpr'){push(pyExpr(args));break;}
    if(!allowDefaultDict||cls?.kind!=='global'||cls.name!=='collections.defaultdict'||args?.kind!=='tuple')fail('REDUCE',at);
    if(args.items.length>1)fail('REDUCE_ARGS',at);
    let factory=null;
    if(args.items.length&&args.items[0]!==null){
     const value=args.items[0];if(value?.kind!=='global'||!['builtins.list','__builtin__.list'].includes(value.name))fail('REDUCE_FACTORY',at);
     factory='list';
    }
    push({kind:'defaultdict',factory,entries:new Map()});break;
   }
   case 0x81:{const args=pop(),cls=pop();if(cls?.kind!=='global'||!allowed.has(cls.name)||args?.kind!=='tuple'||args.items.length)fail('NEWOBJ',at);push({kind:'instance',className:cls.name,state:null});break;}
   case 0x62:{
    const state=pop(),target=peek();if(target?.kind!=='instance'||target.state!==null)fail('STATE',at);
    if(target.className==='renpy.ast.PyCode'){target.state=pyCodeState(state);target.stateKind='pycode-opaque';target.stateShape='pycode:tuple'+state.items.length;break;}
    let dict=state,slots=null;if(state?.kind==='tuple'){if(state.items.length!==2)fail('STATE',at);[dict,slots]=state.items;}
    if(![dict,slots].every(item=>item===null||item?.kind==='dict'))fail('STATE',at);
    const merged=new Map();for(const item of [dict,slots])if(item)for(const [key,value]of item.entries){if(typeof key!=='string'||merged.has(key))fail('STATE_KEY',at);spend('edges',2);merged.set(key,value);}
    target.state=merged;target.stateShape=state?.kind==='tuple'?'tuple:'+(dict===null?'none':'dict')+','+(slots===null?'none':'dict'):state===null?'none':'dict';break;
   }
   case 0x71:remember(byte());break;case 0x72:remember(uint());break;case 0x94:remember(memo.size);break;
   case 0x68:recall(byte());break;case 0x6a:recall(uint());break;
   case 0x30:pop();break;case 0x32:push(peek());break;
   case 0x31:marked();break;
   default:fail('UNSUPPORTED_OPCODE',at-1);
  }
 }
 fail('NO_STOP',at);
}
module.exports={LIMITS,CLASSES,decode};
