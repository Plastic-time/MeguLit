// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {decode,CLASSES,LIMITS}=require('../services/original-engines/renpy-pickle-bounded.cjs');
const fixture=require('./fixtures/renpy-revertable-dict-cpython.json');
const b=(...xs)=>Buffer.from(xs),cat=(...xs)=>Buffer.concat(xs),options={allowRevertableDict:true};
const global=(module='renpy.revertable',name='RevertableDict')=>Buffer.from('c'+module+'\n'+name+'\n');
const string=s=>{const v=Buffer.from(s),h=Buffer.alloc(5);h[0]=0x58;h.writeUInt32LE(v.length,1);return cat(h,v);};
const tuple=(...xs)=>cat(b(0x28),...xs,b(0x74));
const stream=(...xs)=>cat(b(0x80,2),...xs,b(0x2e));
const instance=()=>cat(global(),b(0x29,0x81));
const dict=(...pairs)=>cat(b(0x7d,0x28),...pairs,b(0x75));
function reject(input,code,opts=options){assert.throws(()=>decode(input,opts),e=>e.code==='RENPY_PICKLE_'+code&&Number.isSafeInteger(e.offset));}

test('neutral CPython dict-subclass controls prove only the explicit NEWOBJ and dict attributes subset',()=>{
 assert.equal(fixture.fixtures.length,12);
 for(const input of fixture.fixtures){
  const bytes=Buffer.from(input.base64,'base64'),out=decode(bytes,options),value=out.value;
  assert.equal(bytes.length,input.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),input.sha256);
  assert.equal(out.protocol,input.protocol);assert.equal(out.bytesRead,input.bytes);
  assert.equal(input.opcodes.includes('NEWOBJ'),true);assert.equal(input.opcodes.includes('REDUCE'),false);
  assert.equal(value.kind,'revertable-dict');assert.equal(value.className,'renpy.revertable.RevertableDict');
  assert.ok(value.entries instanceof Map);assert.equal(Object.getPrototypeOf(value),Object.prototype);
  if(input.shape==='empty'){assert.equal(value.entries.size,0);assert.equal(value.state,null);assert.equal(value.stateShape,undefined);}
  if(input.shape==='items'){
   assert.deepEqual(value.entries.get('alpha'),{kind:'list',items:[1,2]});assert.equal(value.entries.get(7),null);
   assert.deepEqual(value.entries.get('empty'),{kind:'list',items:[]});assert.equal(value.state,null);assert.ok(input.opcodes.includes('SETITEMS'));
  }
  if(input.shape==='attributes'){
   assert.ok(input.opcodes.includes('BUILD'));assert.equal(value.entries.get('kind'),'entry_only');
   assert.ok(value.state instanceof Map);assert.equal(value.state.size,7);assert.equal(value.stateShape,'dict');
   for(const key of ['kind','className','entries','state','stateShape','_clean','__proto__'])assert.equal(value.state.get(key),'attribute_only');
   assert.equal(value._clean,undefined);assert.equal(Object.getPrototypeOf(value),Object.prototype);
  }
  if(input.shape==='cycle'){
   assert.equal(value.entries.get('self'),value);assert.equal(value.entries.get('first'),value.entries.get('second'));
   assert.equal(value.state.get('link'),value);assert.equal(value.stateShape,'dict');
  }
  reject(bytes,'GLOBAL',{});reject(bytes,'GLOBAL',{allowRevertableDict:false});
 }
});

test('RevertableDict requires an independent strict boolean and leaves default AST identities unchanged',()=>{
 for(const value of [null,0,1,'true',{},[],new Boolean(true)])reject(stream(b(0x4e)),'REVERTABLE_DICT_OPTION',{allowRevertableDict:value});
 const input=stream(instance());
 reject(input,'GLOBAL',{});reject(input,'GLOBAL',{allowDefaultDict:true,allowPyExpr:true,allowPyCodeState:true,classes:['renpy.ast.RevertableDict']});
 assert.equal(CLASSES.includes('renpy.revertable.RevertableDict'),false);
 reject(input,'CLASSES',{...options,classes:['renpy.revertable.RevertableDict']});
 const metadata=decode(stream(global()),options).value;assert.ok(Object.isFrozen(metadata));assert.equal(metadata.name,'renpy.revertable.RevertableDict');
 assert.equal(decode(input,{...options,classes:[]}).value.kind,'revertable-dict');
});

test('both GLOBAL forms reject aliases, List/Set, qualified parent spelling and case variants',()=>{
 const stack=(module,name)=>cat(b(0x80,4),string(module),string(name),b(0x93,0x29,0x81,0x2e));
 assert.equal(decode(stack('renpy.revertable','RevertableDict'),options).value.kind,'revertable-dict');
 for(const [module,name]of [['renpy.ast','RevertableDict'],['renpy.python','RevertableDict'],['renpy','revertable.RevertableDict'],['renpy.revertable','RevertableList'],['renpy.revertable','RevertableSet'],['renpy.revertable','RevertableDefaultDict'],['renpy.revertable','revertabledict'],['renpy.revertable.extra','RevertableDict'],['\ufeffrenpy.revertable','RevertableDict'],['renpy.revertable','RevertableDict\0']]){
  reject(stream(global(module,name)),'GLOBAL');reject(stack(module,name),'GLOBAL');
 }
});

test('only empty tuple NEWOBJ creates this wrapper and no reducer or reconstructor is enabled',()=>{
 for(const args of [b(0x4e),b(0x5d),b(0x7d),tuple(b(0x4e)),tuple(string('x'))])reject(stream(global(),args,b(0x81)),'NEWOBJ');
 reject(stream(global(),b(0x29,0x52)),'UNSUPPORTED_OPCODE');
 reject(stream(global(),b(0x29,0x52)),'REDUCE',{...options,allowDefaultDict:true,allowPyExpr:true});
 for(const [module,name]of [['copyreg','_reconstructor'],['copy_reg','_reconstructor'],['copyreg','__newobj__'],['builtins','dict'],['renpy.revertable','_reconstructor']])reject(stream(global(module,name),b(0x29,0x52)),'GLOBAL');
 reject(stream(global(),b(0x29,0x7d,0x92)),'UNSUPPORTED_OPCODE');
});

test('SETITEM and SETITEMS retain dictionary key and duplicate rules without metadata writes',()=>{
 const one=decode(stream(instance(),string('__proto__'),string('entry'),b(0x73)),options).value;
 assert.equal(one.entries.get('__proto__'),'entry');assert.equal(Object.getPrototypeOf(one),Object.prototype);
 const many=decode(stream(instance(),b(0x28),string('kind'),string('entry'),b(0x4b,7,0x4e,0x75)),options).value;
 assert.equal(many.kind,'revertable-dict');assert.equal(many.entries.get('kind'),'entry');assert.equal(many.entries.get(7),null);
 for(const key of [b(0x4e),b(0x88),b(0x5d),b(0x7d),tuple()])reject(stream(instance(),key,b(0x4e,0x73)),'DICT');
 reject(stream(instance(),string('x'),b(0x4e,0x73),string('x'),b(0x4e,0x73)),'DUPLICATE_KEY');
 reject(stream(instance(),b(0x28),string('x'),b(0x4e),string('x'),b(0x4e,0x75)),'DUPLICATE_KEY');
 reject(stream(instance(),b(0x28),string('x'),b(0x75)),'DICT');reject(stream(instance(),b(0x4e,0x61)),'LIST');
});

test('BUILD attributes stay in a separate string-key Map with unchanged stateShape provenance',()=>{
 const attributes=dict(string('kind'),string('forged'),string('className'),string('renpy.ast.PyCode'),string('stateShape'),string('forged'));
 const value=decode(stream(instance(),attributes,b(0x62)),options).value;
 assert.equal(value.kind,'revertable-dict');assert.equal(value.className,'renpy.revertable.RevertableDict');assert.equal(value.entries.size,0);
 assert.equal(value.state.get('kind'),'forged');assert.equal(value.state.get('className'),'renpy.ast.PyCode');assert.equal(value.state.get('stateShape'),'forged');assert.equal(value.stateShape,'dict');
 for(const state of [b(0x4e),b(0x5d),tuple(b(0x4e),b(0x7d)),tuple(b(0x7d),b(0x7d)),instance()])reject(stream(instance(),state,b(0x62)),'STATE');
 reject(stream(instance(),dict(b(0x4b,1),string('x')),b(0x62)),'STATE_KEY');
 reject(stream(instance(),b(0x7d,0x62,0x7d,0x62)),'STATE');
 reject(stream(global(),b(0x7d,0x62)),'STATE');
});

test('forged AST state cannot gain dictionary mutation or become an opaque PyCode source',()=>{
 const fake=cat(global('renpy.ast','Say'),b(0x29,0x81),dict(string('kind'),string('revertable-dict'),string('className'),string('renpy.revertable.RevertableDict')),b(0x62));
 reject(stream(fake,string('x'),b(0x4e,0x73)),'DICT');
 const py=cat(global('renpy.ast','PyCode'),b(0x29,0x81));
 const state=tuple(b(0x4b,1),instance(),tuple(string('f'),b(0x4b,0)),string('exec'));
 reject(stream(py,state,b(0x62)),'PYCODE_SOURCE',{...options,allowPyCodeState:true,classes:['renpy.ast.PyCode']});
 for(const flags of [{allowDefaultDict:true},{allowPyExpr:true},{allowDefaultDict:true,allowPyExpr:true}]){
  const value=decode(stream(instance()),{...options,...flags}).value;assert.equal(value.kind,'revertable-dict');assert.equal(value.state,null);
 }
});

test('entries and attribute Map allocations and stored edges have explicit exact budgets',()=>{
 const empty=stream(instance()),out=decode(empty,options);
 assert.equal(out.counts.nodes,4);assert.equal(out.counts.edges,2);assert.equal(out.counts.operations,4);
 const exact={nodes:4,edges:2,operations:4,inputBytes:empty.length,stringBytes:30,itemBytes:16,stack:2};
 assert.equal(decode(empty,{...options,limits:exact}).value.kind,'revertable-dict');
 for(const [key,value,code]of [['nodes',3,'BUDGET_NODES'],['edges',1,'BUDGET_EDGES'],['operations',3,'BUDGET_OPERATIONS'],['stringBytes',29,'BUDGET_STRINGBYTES'],['itemBytes',15,'LINE'],['stack',1,'BUDGET_STACK'],['inputBytes',empty.length-1,'INPUT']])reject(empty,code,{...options,limits:{[key]:value}});
 const input=stream(instance(),string('a'),b(0x4e,0x73),dict(string('b'),b(0x4e)),b(0x62)),built=decode(input,options);
 // Wrapper + entries Map plus the BUILD attributes Map are distinct allocated nodes.
 assert.equal(built.counts.nodes,11);assert.equal(built.counts.edges,8);
 reject(input,'BUDGET_NODES',{...options,limits:{nodes:10}});reject(input,'BUDGET_EDGES',{...options,limits:{edges:7}});
 assert.equal(decode(input,{...options,limits:{nodes:11,edges:8}}).value.stateShape,'dict');
 const aliased=stream(instance(),b(0x71,0,0x68,0,0x86));assert.equal(decode(aliased,{...options,limits:{memo:1}}).value.items.length,2);
 reject(stream(instance(),b(0x71,1)),'BUDGET_MEMO',{...options,limits:{memo:1}});
 assert.equal(LIMITS.inputBytes,4<<20);
});

test('all neutral fixture prefixes and operand-split frames reject without partial success',()=>{
 for(const input of fixture.fixtures){const bytes=Buffer.from(input.base64,'base64');for(let end=0;end<bytes.length;end++)assert.throws(()=>decode(bytes.subarray(0,end),options),e=>typeof e.code==='string'&&e.code.startsWith('RENPY_PICKLE_')&&Number.isSafeInteger(e.offset));}
 const bytes=Buffer.from(fixture.fixtures.find(x=>x.protocol===4&&x.shape==='attributes').base64,'base64');
 const split=Buffer.from(bytes);split.writeBigUInt64LE(2n,3);reject(split,'TRUNCATED');
 reject(cat(bytes,b(0)),'TRAILING');
});
