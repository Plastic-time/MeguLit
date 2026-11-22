// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeNode,PROFILE,LIMITS}=require('../services/original-engines/renpy-node-state.cjs');
const {decode}=require('../services/original-engines/renpy-pickle-bounded.cjs');
const block=items=>({kind:'list',items});
function node(name='Node',entries=[]){return {kind:'instance',className:'renpy.ast.'+name,state:new Map([['linenumber',0],['col_offset',0],...entries]),stateShape:'tuple:none,dict'};}
const normalize=(value=node(),extra={})=>normalizeNode(value,{profile:PROFILE,...extra});
const rejects=(fn,code)=>assert.throws(fn,error=>error.code==='RENPY_NODE_STATE_'+code&&error.message===error.code);
const b=(...v)=>Buffer.from(v),join=(...v)=>Buffer.concat(v);
const s=value=>{const text=Buffer.from(value),length=Buffer.alloc(4);length.writeUInt32LE(text.length);return join(b(0x58),length,text);};
function translatedSayPickle(){
 const entries=[['linenumber',b(0x4b,7)],['col_offset',b(0x4b,2)],['what',s('')],['who',s('speaker')],['who_fast',b(0x89)],['interact',b(0x89)],['identifier',s('neutral_group')]];
 return join(b(0x80,2),Buffer.from('crenpy.ast\nTranslateSay\n'),b(0x29,0x81,0x4e,0x7d),...entries.flatMap(([key,value])=>[s(key),value,b(0x73)]),b(0x86,0x62,0x2e));
}

test('neutral bounded-decoder TranslateSay keeps false and empty data while restoring only proven defaults',()=>{
 const input=decode(translatedSayPickle()).value,out=normalize(input);
 assert.equal(out.node,input);assert.equal(out.state,input.state);assert.notEqual(out.fields,input.state);
 assert.equal(out.fields.get('what'),'');assert.equal(out.fields.get('interact'),false);assert.equal(out.fields.get('who_fast'),false);
 assert.equal(out.fields.get('identifier'),'neutral_group');assert.equal(out.fields.get('explicit_identifier'),false);
 assert.equal(out.fields.get('language'),null);assert.equal(input.state.has('language'),false);
 assert.deepEqual(out.provenance.get('language'),{present:false,origin:'slot-default',declaredBy:'TranslateSay',sourceFile:'renpy/ast.py',sourceLine:2847,descriptor:'Slot'});
 assert.equal(out.provenance.get('who_fast').present,true);assert.equal(out.provenance.get('who_fast').origin,'wire');
 assert.equal(out.fields.has('block'),false);assert.equal(out.fields.has('after'),false);
 for(const name of ['compilerIdentityVerified','graphVerified','childSemanticsVerified','sameDocumentVerified','cyclesVerified','languageVerified','bodyCoverageVerified'])assert.equal(out.metadata[name],false);
});
test('all six exact classes have their own derived fields and no invented properties',()=>{
 for(const [name,count,extra]of [['Node',7,[]],['Say',18,[]],['Label',10,[['block',block([])]]],['Translate',12,[['block',block([])]]],['TranslateSay',20,[]],['EndTranslate',7,[]]]){
  const out=normalize(node(name,extra));assert.equal(out.fields.size,count);assert.equal(out.provenance.size,count);assert.equal(out.metadata.counts.fields,count);
  assert.equal(out.fields.get('name_version'),0);assert.equal(out.fields.get('name_serial'),0);assert.equal(out.fields.get('filename'),null);assert.equal(out.fields.get('_name'),null);assert.equal(out.fields.get('next'),null);
  assert.equal(out.fields.has('name'),false);assert.equal(out.fields.has('statement_start'),false);
  if(['Say','TranslateSay'].includes(name)){assert.equal(out.fields.get('who_fast'),null);assert.equal(out.fields.get('what'),null);assert.equal(out.fields.get('rollback'),'normal');assert.equal(out.fields.get('interact'),true);}
  else assert.equal(out.fields.has('rollback'),false);
 }
});
test('missing and explicitly present null retain different provenance',()=>{
 const missing=normalize(node('TranslateSay')),explicit=normalize(node('TranslateSay',[['language',null],['who_fast',null]]));
 assert.equal(missing.fields.get('language'),explicit.fields.get('language'));assert.equal(missing.provenance.get('language').present,false);assert.equal(explicit.provenance.get('language').present,true);
 assert.equal(explicit.fields.get('who_fast'),null);assert.equal(explicit.provenance.get('who_fast').origin,'wire');
 const label=normalize(node('Label',[['block',block([])],['hide',false]]));assert.equal(label.fields.get('hide'),false);assert.equal(label.provenance.get('hide').present,true);
 const hidden=normalize(node('Label',[['block',block([])],['hide',true]]));assert.equal(hidden.fields.get('hide'),true);
});
test('special line fields must be present and preserve exact unsigned boundaries',()=>{
 const out=normalize(node('Node',[['linenumber',0xffffffff],['col_offset',0xffff],['name_version',0xffffffff],['name_serial',0xffffffff]]));
 assert.equal(out.fields.get('linenumber'),0xffffffff);assert.equal(out.fields.get('col_offset'),0xffff);
 assert.deepEqual(out.provenance.get('col_offset'),{present:true,origin:'wire',declaredBy:'CObject',sourceFile:'renpy/cslots.pyx',sourceLine:83,descriptor:'uint16'});
 for(const field of ['linenumber','col_offset']){const input=node();input.state.delete(field);rejects(()=>normalize(input),'MISSING_LINE_FIELD');assert.equal(input.state.has(field),false);}
 for(const field of ['linenumber','col_offset','name_version','name_serial'])for(const value of [-1,1.5,false,true,'1',null,NaN,Infinity,-0,1n])rejects(()=>normalize(node('Node',[[field,value]])),'VALUE_UNSUPPORTED');
 rejects(()=>normalize(node('Node',[['linenumber',0x100000000]])),'VALUE_UNSUPPORTED');rejects(()=>normalize(node('Node',[['col_offset',0x10000]])),'VALUE_UNSUPPORTED');
});
test('only the exact writer state shape and real state Map can acquire defaults',()=>{
 for(const stateShape of ['dict','none','tuple:none,none','tuple:dict,none','tuple:dict,dict',undefined,'tuple:none,dict\n'])rejects(()=>normalize({...node(),stateShape}),'STATE_SHAPE_UNSUPPORTED');
 for(const state of [null,{},Object.create(Map.prototype)])rejects(()=>normalize({...node(),state}),'STATE_UNSUPPORTED');
 rejects(()=>normalize({kind:'instance',className:'renpy.ast.Node',state:null}),'NODE_UNSUPPORTED');
 const spoofed=node('Node',[['stateShape','tuple:none,dict']]);rejects(()=>normalize(spoofed),'UNKNOWN_FIELD');
});
test('unknown and class-variable or property state keys reject instead of disappearing',()=>{
 const classes=['Node','Say','Label','Translate','TranslateSay','EndTranslate'];
 for(const name of classes)for(const field of ['unknown','name','statement_start','translatable','translation_relevant','warp','__version__','__dict__']){
  const entries=['Label','Translate'].includes(name)?[['block',block([])]]:[];rejects(()=>normalize(node(name,[...entries,[field,null]])),'UNKNOWN_FIELD');
 }
 for(const name of ['Node','Label','Translate','EndTranslate'])rejects(()=>normalize(node(name,[['rollback','never']])),'UNKNOWN_FIELD');
 for(const field of ['block','after'])rejects(()=>normalize(node('TranslateSay',[[field,field==='block'?block([]):null]])),'UNKNOWN_FIELD');
 const nonString=node();nonString.state.set(1,null);rejects(()=>normalize(nonString),'UNKNOWN_FIELD');
 for(const name of ['FutureNode','Python','PyCode','__proto__'])rejects(()=>normalize(node(name)),'CLASS_UNSUPPORTED');
});
test('Say-family rollback literals are preserved without changing other classes',()=>{
 for(const name of ['Say','TranslateSay'])for(const value of ['normal','never','force'])assert.equal(normalize(node(name,[['rollback',value]])).fields.get('rollback'),value);
 for(const value of ['other',null,false])rejects(()=>normalize(node('Say',[['rollback',value]])),'VALUE_UNSUPPORTED');
});
test('non-null unsupported complex fields and expressions are never erased or executed',()=>{
 let calls=0;const callable=()=>{calls++;throw Error('not executable');};
 for(const [name,field]of [['Say','with_'],['Say','attributes'],['Say','arguments'],['Say','temporary_attributes'],['Label','parameters'],['Translate','alternate'],['TranslateSay','alternate']]){
  const input=node(name,[[field,callable],...(['Label','Translate'].includes(name)?[['block',block([])]]:[])]);rejects(()=>normalize(input),'COMPLEX_VALUE_UNSUPPORTED');assert.equal(input.state.get(field),callable);
 }
 rejects(()=>normalize(node('Say',[['who','speaker("expression")']])),'EXPRESSION_UNSUPPORTED');
 rejects(()=>normalize(node('Say',[['what',{toString:callable}]])),'VALUE_UNSUPPORTED');assert.equal(calls,0);
 const raw=normalize(node('Say',[['who','store.speaker'],['who_fast',false]]));assert.equal(raw.fields.get('who'),'store.speaker');assert.equal(raw.fields.get('who_fast'),false);
});
test('bounded names preserve raw backing fields without applying the name setter or getter',()=>{
 const tuple={kind:'tuple',items:['neutral.rpy',3,4]},input=node('Node',[['_name',tuple],['name_version',8],['name_serial',9]]),out=normalize(input);
 assert.equal(out.fields.get('_name'),tuple);assert.equal(out.fields.get('name_version'),8);assert.equal(out.fields.get('name_serial'),9);assert.equal(out.fields.has('name'),false);
 assert.equal(normalize(node('Node',[['_name','']])).fields.get('_name'),'');
 for(const value of [{kind:'tuple',items:[]},{kind:'tuple',items:['a',1,2,3]},{kind:'list',items:['a',1,2]},{}])rejects(()=>normalize(node('Node',[['_name',value]])),'NAME_UNSUPPORTED');
 rejects(()=>normalize(node('Node',[['_name',{kind:'tuple',items:['a',false,2]}]])),'VALUE_UNSUPPORTED');
});
test('blocks retain dense bounded containers but do not inspect child values or semantics',()=>{
 let reads=0;const opaqueChild=Object.defineProperty({},'kind',{get(){reads++;throw Error('do not visit child');}}),children=block([opaqueChild,null]),input=node('Translate',[['block',children]]);
 const out=normalize(input);assert.equal(out.fields.get('block'),children);assert.equal(out.metadata.counts.blockItems,2);assert.equal(out.metadata.childSemanticsVerified,false);assert.equal(reads,0);
 for(const value of [null,{kind:'tuple',items:[]},block(Array(1))])rejects(()=>normalize(node('Label',[['block',value]])),'BLOCK_UNSUPPORTED');
 rejects(()=>normalize(node('Translate')),'BLOCK_UNSUPPORTED');
 const accessors=block([null]);Object.defineProperty(accessors.items,'0',{get(){reads++;throw Error('do not get array item');}});rejects(()=>normalize(node('Label',[['block',accessors]])),'BLOCK_UNSUPPORTED');assert.equal(reads,0);
});
test('reference fields remain references without following cycles or claiming membership',()=>{
 const input=node('Translate',[['block',block([])]]),foreign=node('FutureNode');input.state.set('next',input);input.state.set('after',foreign);foreign.state.set('next',foreign);
 const out=normalize(input);assert.equal(out.fields.get('next'),input);assert.equal(out.fields.get('after'),foreign);assert.equal(out.metadata.sameDocumentVerified,false);assert.equal(out.metadata.cyclesVerified,false);
 for(const value of [1,{},block([]),{...node(),state:null}])rejects(()=>normalize(node('Node',[['next',value]])),'REFERENCE_UNSUPPORTED');
});
test('no getter or overridden Map lookup is needed for normalization',()=>{
 let reads=0;const input=node();Object.defineProperty(input,'className',{get(){reads++;return 'renpy.ast.Node';}});rejects(()=>normalize(input),'NODE_UNSUPPORTED');assert.equal(reads,0);
 const ordinary=node('Say',[['who_fast',false]]);ordinary.state.get=()=>{reads++;return true;};ordinary.state.has=()=>{reads++;return false;};ordinary.state.entries=()=>{reads++;throw Error('not used');};
 assert.equal(normalize(ordinary).fields.get('who_fast'),false);assert.equal(reads,0);
});
test('normalization returns independent derived Maps and provenance without mutating source',()=>{
 const input=node('Say',[['what','neutral'],['interact',false]]),before=[...input.state],keys=Reflect.ownKeys(input);Object.freeze(input);
 const out=normalize(input);out.fields.set('what','changed derived only');out.provenance.get('what').sourceLine=0;
 assert.deepEqual([...input.state],before);assert.deepEqual(Reflect.ownKeys(input),keys);assert.equal(input.state.has('who_fast'),false);
 const again=normalize(input);assert.equal(again.fields.get('what'),'neutral');assert.equal(again.provenance.get('what').sourceLine,856);assert.equal(again.provenance.get('interact').origin,'wire');
});
test('string budgets count UTF-8 occurrences and restored string defaults',()=>{
 const out=normalize(node('Node',[['filename','あ']]),{limits:{stringBytes:3,totalStringBytes:3}});assert.equal(out.metadata.counts.stringBytes,3);
 rejects(()=>normalize(node('Node',[['filename','あ']]),{limits:{stringBytes:2}}),'BUDGET_STRING_BYTES');
 const pair=node('Node',[['filename','ab'],['_name','cd']]);assert.equal(normalize(pair,{limits:{totalStringBytes:4}}).metadata.counts.stringBytes,4);
 rejects(()=>normalize(pair,{limits:{totalStringBytes:3}}),'BUDGET_TOTAL_STRING_BYTES');
 assert.equal(normalize(node('Say')).metadata.counts.stringBytes,6);rejects(()=>normalize(node('Say'),{limits:{totalStringBytes:5}}),'BUDGET_TOTAL_STRING_BYTES');
 rejects(()=>normalize(node('Say',[['what','x'.repeat(LIMITS.stringBytes+1)]])),'BUDGET_STRING_BYTES');
});
test('field and block budgets are finite, exact boundaries pass, overrides only lower',()=>{
 assert.equal(normalize(node(),{limits:{fields:7}}).fields.size,7);rejects(()=>normalize(node(),{limits:{fields:6}}),'BUDGET_FIELDS');
 const children=block(Array(LIMITS.blockItems).fill(null));assert.equal(normalize(node('Label',[['block',children]])).metadata.counts.blockItems,50000);
 rejects(()=>normalize(node('Label',[['block',block(Array(50001).fill(null))]])),'BUDGET_BLOCK_ITEMS');
 assert.equal(normalize(node('Label',[['block',block([null])]]),{limits:{blockItems:1}}).metadata.counts.blockItems,1);
 rejects(()=>normalize(node('Label',[['block',block([null,null])]]),{limits:{blockItems:1}}),'BUDGET_BLOCK_ITEMS');
 for(const limits of [null,[],{unknown:1},{fields:21},{stringBytes:16385},{totalStringBytes:65537},{blockItems:50001},{fields:0},{fields:1.5}])rejects(()=>normalize(node(),{limits}),'LIMITS');
});
test('profile declaration is mandatory before any defaults or source property access',()=>{
 let reads=0;const input=Object.defineProperty({},'className',{get(){reads++;throw Error('no access');}});
 for(const profile of [undefined,null,'8.4','renpy-8.5.3.26051504',{},'__proto__'])rejects(()=>normalizeNode(input,{profile}),'PROFILE');assert.equal(reads,0);
 for(const options of [null,[],1])rejects(()=>normalizeNode(node(),options),'OPTIONS');
});
test('unsupported errors reveal fixed fields and codes without raw strings',()=>{
 const marker='private expression must not be copied',input=node('Say',[['with_',marker]]);
 assert.throws(()=>normalize(input),error=>error.code==='RENPY_NODE_STATE_COMPLEX_VALUE_UNSUPPORTED'&&error.field==='with_'&&!error.message.includes(marker)&&!error.stack.includes(marker));
});
