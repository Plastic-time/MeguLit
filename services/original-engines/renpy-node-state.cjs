// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Single decoded node only. This module neither walks an AST nor executes Node properties.
const {types:{isMap}}=require('node:util');
const PROFILE='renpy-8.4.0.25071206';
const LIMITS=Object.freeze({fields:20,stringBytes:16384,totalStringBytes:65536,blockItems:50000});
const REQUIRED=Symbol('required writer field');
const slot=(name,type,defaultValue,declaredBy,sourceLine)=>({name,type,defaultValue,declaredBy,sourceLine,descriptor:type==='uint32'?'IntegerSlot':'Slot',sourceFile:'renpy/ast.py'});
const base=[slot('filename','string?',null,'Node',261),slot('_name','name',null,'Node',264),slot('name_version','uint32',0,'Node',272),slot('name_serial','uint32',0,'Node',277),slot('next','reference',null,'Node',282)];
const say=[slot('who','speaker?',null,'Say',854),slot('who_fast','bool?',null,'Say',855),slot('what','string?',null,'Say',856),slot('with_','null',null,'Say',857),slot('interact','bool',true,'Say',858),
 slot('attributes','null',null,'Say',859),slot('arguments','null',null,'Say',860),slot('temporary_attributes','null',null,'Say',861),slot('rollback','rollback','normal','Say',862),slot('identifier','string?',null,'Say',863),slot('explicit_identifier','bool',false,'Say',864)];
const special=[{name:'linenumber',type:'uint32',defaultValue:REQUIRED,declaredBy:'CObject',sourceFile:'renpy/cslots.pyx',sourceLine:86,descriptor:'uint32'},
 {name:'col_offset',type:'uint16',defaultValue:REQUIRED,declaredBy:'CObject',sourceFile:'renpy/cslots.pyx',sourceLine:83,descriptor:'uint16'}];
const schema={
 'renpy.ast.Node':[...base,...special],
 'renpy.ast.Say':[...base,...say,...special],
 'renpy.ast.Label':[...base,slot('block','block',null,'Label',1096),slot('parameters','null',null,'Label',1097),slot('hide','bool',false,'Label',1098),...special],
 'renpy.ast.Translate':[...base,slot('identifier','string?',null,'Translate',2751),slot('alternate','null',null,'Translate',2752),slot('language','string?',null,'Translate',2753),slot('block','block',null,'Translate',2754),slot('after','reference',null,'Translate',2755),...special],
 'renpy.ast.TranslateSay':[...base,...say,slot('alternate','null',null,'TranslateSay',2846),slot('language','string?',null,'TranslateSay',2847),...special],
 'renpy.ast.EndTranslate':[...base,...special],
};
const SHAPES=['none','dict','tuple:none,none','tuple:none,dict','tuple:dict,none','tuple:dict,dict'];
const PYCODE_SHAPES=['pycode:tuple4','pycode:tuple5','pycode:tuple6','pycode:tuple7'];
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size').get,mapHas=Map.prototype.has,mapGet=Map.prototype.get,mapEntries=Map.prototype.entries;
function fail(code,field){const error=Error('RENPY_NODE_STATE_'+code);error.code=error.message;if(field)error.field=field;throw error;}
function record(value,required,optional,code){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)fail(code);
 const keys=Reflect.ownKeys(value);
 if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))fail(code);
 for(const key of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))fail(code);
}
function mapping(value,code){if(!isMap(value)||Object.getPrototypeOf(value)!==Map.prototype)fail(code);}
function dense(items,code){
 if(!Array.isArray(items)||Object.getPrototypeOf(items)!==Array.prototype)fail(code);
 for(let i=0;i<items.length;i++){const desc=Object.getOwnPropertyDescriptor(items,String(i));if(!desc||!Object.hasOwn(desc,'value'))fail(code);}
}
function uint(value,max,field){if(!Number.isSafeInteger(value)||value<0||value>max||Object.is(value,-0))fail('VALUE_UNSUPPORTED',field);}
function reference(value,field){
 if(value===null)return;
 record(value,['kind','className','state','stateShape'],['stateKind'],'REFERENCE_UNSUPPORTED');
 if(value.kind!=='instance'||typeof value.className!=='string'||!/^renpy\.ast\.[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(value.className)||/[\r\n]/.test(value.className))fail('REFERENCE_UNSUPPORTED',field);
 mapping(value.state,'REFERENCE_UNSUPPORTED');
 if(value.className==='renpy.ast.PyCode'){
  if(value.stateKind!=='pycode-opaque'||!PYCODE_SHAPES.includes(value.stateShape))fail('REFERENCE_UNSUPPORTED',field);
 }else if(!SHAPES.includes(value.stateShape)||Object.hasOwn(value,'stateKind'))fail('REFERENCE_UNSUPPORTED',field);
}
function normalizeNode(node,options={}){
 record(options,[],['profile','limits'],'OPTIONS');if(options.profile!==PROFILE)fail('PROFILE');
 const limits={...LIMITS};
 if(Object.hasOwn(options,'limits')){
  record(options.limits,[],Object.keys(LIMITS),'LIMITS');
  for(const [key,value]of Object.entries(options.limits)){
   if(!Number.isSafeInteger(value)||value<1||value>LIMITS[key])fail('LIMITS');limits[key]=value;
  }
 }
 record(node,['kind','className','state','stateShape'],[],'NODE_UNSUPPORTED');
 if(node.kind!=='instance'||typeof node.className!=='string'||!Object.hasOwn(schema,node.className))fail('CLASS_UNSUPPORTED');
 if(node.stateShape!=='tuple:none,dict')fail('STATE_SHAPE_UNSUPPORTED');mapping(node.state,'STATE_UNSUPPORTED');
 const definitions=schema[node.className],allowed=new Set(definitions.map(f=>f.name));
 if(definitions.length>limits.fields)fail('BUDGET_FIELDS');
 if(mapSize.call(node.state)>definitions.length)fail('UNKNOWN_FIELD');
 for(const [key]of mapEntries.call(node.state))if(typeof key!=='string'||!allowed.has(key))fail('UNKNOWN_FIELD');
 const fields=new Map(),provenance=new Map(),counts={fields:definitions.length,stringBytes:0,blockItems:0};
 const string=(value,field)=>{
  if(typeof value!=='string')fail('VALUE_UNSUPPORTED',field);const size=Buffer.byteLength(value,'utf8');
  if(size>limits.stringBytes)fail('BUDGET_STRING_BYTES',field);counts.stringBytes+=size;
  if(counts.stringBytes>limits.totalStringBytes)fail('BUDGET_TOTAL_STRING_BYTES',field);
 };
 for(const def of definitions){
  const present=mapHas.call(node.state,def.name);
  if(!present&&def.defaultValue===REQUIRED)fail('MISSING_LINE_FIELD',def.name);
  const value=present?mapGet.call(node.state,def.name):def.defaultValue;
  switch(def.type){
   case 'uint32':uint(value,0xffffffff,def.name);break;
   case 'uint16':uint(value,0xffff,def.name);break;
   case 'string?':if(value!==null)string(value,def.name);break;
   case 'speaker?':
    if(value!==null){string(value,def.name);if(!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value)||/[\r\n]/.test(value))fail('EXPRESSION_UNSUPPORTED',def.name);}break;
   case 'bool?':if(value===null)break;
   case 'bool':if(typeof value!=='boolean')fail('VALUE_UNSUPPORTED',def.name);break;
   case 'rollback':string(value,def.name);if(!['normal','never','force'].includes(value))fail('VALUE_UNSUPPORTED',def.name);break;
   case 'null':if(value!==null)fail('COMPLEX_VALUE_UNSUPPORTED',def.name);break;
   case 'reference':reference(value,def.name);break;
   case 'name':
    if(value===null)break;if(typeof value==='string'){string(value,def.name);break;}
    record(value,['kind','items'],[],'NAME_UNSUPPORTED');if(value.kind!=='tuple')fail('NAME_UNSUPPORTED',def.name);
    if(!Array.isArray(value.items)||value.items.length!==3)fail('NAME_UNSUPPORTED',def.name);dense(value.items,'NAME_UNSUPPORTED');
    string(value.items[0],def.name);uint(value.items[1],0xffffffff,def.name);uint(value.items[2],0xffffffff,def.name);break;
   case 'block':
    record(value,['kind','items'],[],'BLOCK_UNSUPPORTED');if(value.kind!=='list'||!Array.isArray(value.items))fail('BLOCK_UNSUPPORTED',def.name);
    if(value.items.length>limits.blockItems)fail('BUDGET_BLOCK_ITEMS',def.name);dense(value.items,'BLOCK_UNSUPPORTED');counts.blockItems=value.items.length;break;
   default:fail('VALUE_UNSUPPORTED',def.name);
  }
  fields.set(def.name,value);provenance.set(def.name,{present,origin:present?'wire':'slot-default',declaredBy:def.declaredBy,sourceFile:def.sourceFile,sourceLine:def.sourceLine,descriptor:def.descriptor});
 }
 return {node,state:node.state,fields,provenance,metadata:{profile:PROFILE,className:node.className,stateShape:node.stateShape,counts,
  compilerIdentityVerified:false,graphVerified:false,childSemanticsVerified:false,sameDocumentVerified:false,cyclesVerified:false,languageVerified:false,bodyCoverageVerified:false}};
}
module.exports={PROFILE,LIMITS,normalizeNode};
