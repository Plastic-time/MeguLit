// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Explicit decoded-root validation only. This module is not a reader or AST extractor.
const {types:{isMap}}=require('node:util');
const PROFILE='renpy-8.4.0.25071206',SCRIPT_VERSION=5003000;
const LIMITS=Object.freeze({statements:50000,keyBytes:4096});
const SHAPES=Object.freeze(['none','dict','tuple:none,none','tuple:none,dict','tuple:dict,none','tuple:dict,dict']);
const PYCODE_SHAPES=Object.freeze(['pycode:tuple4','pycode:tuple5','pycode:tuple6','pycode:tuple7']);
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size').get;
const mapHas=Map.prototype.has,mapGet=Map.prototype.get;
function fail(code){const error=Error('RENPY_COMPILED_ROOT_'+code);error.code=error.message;throw error;}
function record(value,required,optional,code){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype)fail(code);
 const keys=Reflect.ownKeys(value);
 if(required.some(key=>!Object.hasOwn(value,key))||keys.some(key=>!required.includes(key)&&!optional.includes(key)))fail(code);
 for(const key of keys)if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))fail(code);
}
function array(value,code){if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)fail(code);}
function mapping(value,code){if(!isMap(value)||Object.getPrototypeOf(value)!==Map.prototype)fail(code);}
function tagged(value,kind,fields,code){record(value,['kind',...fields],[],code);if(value.kind!==kind)fail(code);}
function validateRoot(value,options={}){
 record(options,[],['profile','limits'],'OPTIONS');
 if(options.profile!==PROFILE)fail('PROFILE');
 const limits={...LIMITS};
 if(Object.hasOwn(options,'limits')){
  record(options.limits,[],Object.keys(LIMITS),'LIMITS');
  for(const [key,limit]of Object.entries(options.limits)){
   if(!Number.isSafeInteger(limit)||limit<1||limit>LIMITS[key])fail('LIMITS');
   limits[key]=limit;
  }
 }
 tagged(value,'tuple',['items'],'ROOT_UNSUPPORTED');array(value.items,'ROOT_UNSUPPORTED');
 if(value.items.length!==2||!Object.hasOwn(value.items,0)||!Object.hasOwn(value.items,1))fail('ROOT_UNSUPPORTED');
 const data=value.items[0],stmts=value.items[1];
 tagged(data,'dict',['entries'],'METADATA_UNSUPPORTED');mapping(data.entries,'METADATA_UNSUPPORTED');
 if(mapSize.call(data.entries)!==3||!['version','key','deferred_parse_errors'].every(key=>mapHas.call(data.entries,key)))fail('METADATA_KEYS_UNSUPPORTED');
 if(mapGet.call(data.entries,'version')!==SCRIPT_VERSION)fail('VERSION_UNSUPPORTED');
 const key=mapGet.call(data.entries,'key');let keyKind,keyBytes;
 if(key==='unlocked'){keyKind='unlocked';keyBytes=8;}
 else if(Buffer.isBuffer(key)&&key.length){keyKind='bytes';keyBytes=key.length;}
 else fail('KEY_UNSUPPORTED');
 if(keyBytes>limits.keyBytes)fail('BUDGET_KEY_BYTES');
 const errors=mapGet.call(data.entries,'deferred_parse_errors');
 tagged(errors,'defaultdict',['factory','entries'],'DEFERRED_ERRORS_UNSUPPORTED');mapping(errors.entries,'DEFERRED_ERRORS_UNSUPPORTED');
 if(errors.factory!=='list'||mapSize.call(errors.entries)!==0)fail('DEFERRED_ERRORS_UNSUPPORTED');
 tagged(stmts,'list',['items'],'STATEMENTS_UNSUPPORTED');array(stmts.items,'STATEMENTS_UNSUPPORTED');
 if(stmts.items.length>limits.statements)fail('BUDGET_STATEMENTS');
 for(let index=0;index<stmts.items.length;index++){
  if(!Object.hasOwn(stmts.items,index))fail('STATEMENT_UNSUPPORTED');
  const stmt=stmts.items[index];record(stmt,['kind','className','state','stateShape'],['stateKind'],'STATEMENT_UNSUPPORTED');
  if(stmt.kind!=='instance'||typeof stmt.className!=='string'||!/^renpy\.ast\.[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(stmt.className)||/[\r\n]/.test(stmt.className))fail('STATEMENT_UNSUPPORTED');
  mapping(stmt.state,'STATEMENT_UNSUPPORTED');
  if(stmt.className==='renpy.ast.PyCode'){
   if(stmt.stateKind!=='pycode-opaque'||!PYCODE_SHAPES.includes(stmt.stateShape))fail('STATEMENT_UNSUPPORTED');
  }else if(!SHAPES.includes(stmt.stateShape)||Object.hasOwn(stmt,'stateKind'))fail('STATEMENT_UNSUPPORTED');
 }
 return {root:value,data,stmts,metadata:{profile:PROFILE,scriptVersion:SCRIPT_VERSION,keyKind,keyBytes,statementCount:stmts.items.length,
  statementValidation:'top-level-shape-only',compilerIdentityVerified:false,astSemanticsVerified:false,bodyCoverageVerified:false}};
}
module.exports={PROFILE,SCRIPT_VERSION,LIMITS,validateRoot};
