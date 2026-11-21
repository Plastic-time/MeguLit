// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decode,LIMITS}=require('../services/original-engines/renpy-pickle-bounded.cjs');
const b=(...values)=>Buffer.from(values),u32=n=>{const out=Buffer.alloc(4);out.writeUInt32LE(n);return out;};
const string=text=>{const bytes=Buffer.from(text);return Buffer.concat([b(0x58),u32(bytes.length),bytes]);};
const stream=(...parts)=>Buffer.concat([b(0x80,2),...parts,b(0x2e)]);
const read=(...parts)=>decode(stream(...parts));
const reject=(buf,code,options)=>assert.throws(()=>decode(buf,options),error=>error.code==='RENPY_PICKLE_'+code&&Number.isSafeInteger(error.offset));
const global=()=>Buffer.from('crenpy.ast\nSay\n','ascii');
const instance=()=>Buffer.concat([global(),b(0x29,0x81)]);
const namedGlobal=(module,name)=>Buffer.from('c'+module+'\n'+name+'\n','ascii');
const ddGlobal=()=>namedGlobal('collections','defaultdict');
const ddOptions={classes:[],allowDefaultDict:true};
const dd=(args=b(0x29))=>Buffer.concat([ddGlobal(),args,b(0x52)]);
const pyOptions={classes:['renpy.ast.PyCode'],allowPyCodeState:true};
const pyInstance=()=>Buffer.concat([namedGlobal('renpy.ast','PyCode'),b(0x29,0x81)]);
const tuple=(...parts)=>Buffer.concat([b(0x28),...parts,b(0x74)]);
const integer=n=>{if(n>=0&&n<=255)return b(0x4b,n);const out=Buffer.alloc(5);out[0]=0x4a;out.writeInt32LE(n,1);return out;};
const pyState=(fields={})=>{
 const {tag=integer(1),source=string('neutral_value = 1'),location=tuple(string('synthetic.rpy'),integer(12)),mode=string('exec'),tail=[]}=fields;
 return tuple(tag,source,location,mode,...tail);
};
test('ordinary CPython serializer fixtures retain slot-state graphs under protocols 2, 4 and 5',()=>{
 const fixture=require('./fixtures/renpy-bounded-cpython.json');
 for(const input of fixture.fixtures){
  const buffer=Buffer.from(input.base64,'base64'),parsed=decode(buffer);
  assert.equal(buffer.length,input.bytes);assert.equal(parsed.protocol,input.protocol);
  assert.equal(parsed.value.items[0].entries.get('version'),1);
  const translation=parsed.value.items[1].items[0],say=translation.state.get('block').items[0];
  assert.equal(translation.className,'renpy.ast.Translate');assert.equal(translation.state.get('identifier'),'intro_abcdef');assert.equal(translation.state.get('language'),null);
  assert.equal(say.className,'renpy.ast.Say');assert.equal(say.state.get('who'),null);assert.equal(say.state.get('what'),'Synthetic oracle text');
 }
});
test('bounded data subset preserves ordered tuples, lists, dictionaries and byte strings',()=>{
 const value=read(b(0x28,0x4e,0x88,0x89,0x4b,7,0x4d,0,1),string('試験'),b(0x55,2,0xff,0),b(0x74)).value;
 assert.equal(value.kind,'tuple');assert.deepEqual(value.items.slice(0,6),[null,true,false,7,256,'試験']);assert.deepEqual(value.items[6],b(0xff,0));
 const list=read(b(0x5d,0x28,0x4b,1,0x4b,2,0x65)).value;assert.deepEqual(list,{kind:'list',items:[1,2]});
 const dict=read(b(0x7d),string('key'),b(0x4b,3,0x73)).value;assert.equal(dict.entries.get('key'),3);
});
test('NEWOBJ and BUILD retain class identity apart from writable dictionary and slot state',()=>{
 const state=Buffer.concat([b(0x4e,0x7d),string('__class'),string('untrusted text'),b(0x73),string('what'),string('例'),b(0x73,0x86)]);
 const value=read(instance(),state,b(0x62)).value;
 assert.equal(value.className,'renpy.ast.Say');assert.equal(value.state.get('__class'),'untrusted text');assert.equal(value.state.get('what'),'例');
 assert.equal(Object.getPrototypeOf(value),Object.prototype);
 reject(stream(instance(),b(0x7d,0x62,0x7d,0x62)),'STATE');
});
test('global identities remain inert and only the explicit AST allowlist is accepted',()=>{
 assert.deepEqual(read(global()).value,{kind:'global',name:'renpy.ast.Say'});
 reject(stream(Buffer.from('cos\nsystem\n')),'GLOBAL');
 reject(stream(Buffer.from('crenpy\nast.Say\n')),'GLOBAL');
 const qualified=Buffer.concat([b(0x80,4),string('renpy'),string('ast.Say'),b(0x93,0x2e)]);reject(qualified,'GLOBAL');
 reject(stream(global(),b(0x29,0x52)),'UNSUPPORTED_OPCODE');
 reject(stream(global(),b(0x4e,0x81)),'NEWOBJ');
 reject(stream(Buffer.from('crenpy.ast\nLabel\n')),'GLOBAL');
 const value=decode(stream(Buffer.from('crenpy.ast\nLabel\n')),{classes:['renpy.ast.Label']}).value;assert.equal(value.name,'renpy.ast.Label');
});
test('protocol 4 frames and stack globals are parsed with exact boundaries',()=>{
 const payload=Buffer.concat([string('renpy.ast'),string('Say'),b(0x93,0x29,0x81,0x7d,0x62,0x2e)]),size=Buffer.alloc(8);size.writeBigUInt64LE(BigInt(payload.length));
 const framed=Buffer.concat([b(0x80,4,0x95),size,payload]);const result=decode(framed);assert.equal(result.protocol,4);assert.equal(result.value.className,'renpy.ast.Say');assert.equal(result.bytesRead,framed.length);
 const short=Buffer.from(framed);short.writeBigUInt64LE(4n,3);reject(short,'TRUNCATED');
 const long=Buffer.from(framed);long.writeBigUInt64LE(BigInt(payload.length+1),3);reject(long,'TRUNCATED');
 const wrong=Buffer.from(framed);wrong[1]=2;reject(wrong,'PROTOCOL_OPCODE');
});
test('memo aliases and cycles remain inert bounded graph data without recursive traversal',()=>{
 const result=read(b(0x5d,0x71,0,0x68,0,0x61));assert.equal(result.value.items[0],result.value);assert.equal(result.counts.edges,1);
 reject(stream(b(0x68,1)),'MEMO');reject(stream(b(0x4e,0x71,0,0x71,0)),'DUPLICATE_MEMO');
 reject(stream(b(0x4e,0x72),u32(50000)),'BUDGET_MEMO');
});
test('missing GLOBAL newline returns a fixed error synchronously',()=>{
 reject(b(0x80,2,0x63),'LINE');reject(b(0x80,2,0x63,0x61,10),'LINE');
 reject(stream(Buffer.from('crenpy.ast\nSay\x00\n')),'GLOBAL');
});
test('truncated operands, undefined stack and MARK operations reject before incidental JS errors',()=>{
 for(const code of [0x4b,0x4d,0x4a,0x47,0x58,0x8a,0x54,0x71,0x72,0x6a])reject(b(0x80,2,code),'TRUNCATED');
 for(const code of [0x30,0x32,0x85,0x61,0x81,0x62])reject(stream(b(code)),'STACK');
 reject(stream(b(0x74)),'MARK');reject(stream(b(0x28,0x32)),'STACK');reject(stream(b(0x28,0x4e)),'TRAILING');
 reject(b(0x80,2,0x4e),'NO_STOP');reject(b(0x80,2,0x4e,0x2e,0),'TRAILING');
});
test('dict and instance state never overwrite duplicate keys or writable class metadata',()=>{
 reject(stream(b(0x7d),string('a'),b(0x4e,0x73),string('a'),b(0x4e,0x73)),'DUPLICATE_KEY');
 reject(stream(b(0x7d,0x4e,0x4e,0x73)),'DICT');
 reject(stream(instance(),b(0x4b,3,0x62)),'STATE');
 reject(stream(instance(),b(0x7d,0x4b,1,0x4e,0x73,0x62)),'STATE_KEY');
});
test('string encodings and protocol-specific opcodes fail closed',()=>{
 assert.equal(read(string('\ufeffliteral')).value,'\ufeffliteral');
 reject(stream(b(0x58,1,0,0,0,0xff)),'UTF8');
 reject(stream(b(0x8c,0)),'PROTOCOL_OPCODE');reject(stream(b(0x43,0)),'PROTOCOL_OPCODE');
 reject(b(0x80,1,0x4e,0x2e),'PROTOCOL');reject(stream(b(0x82,1)),'UNSUPPORTED_OPCODE');
 const huge=Buffer.alloc(8,255);reject(Buffer.concat([b(0x80,4,0x8d),huge,b(0x2e)]),'LENGTH');
});
test('all work and allocation budgets can be lowered but never raised',()=>{
 for(const options of [null,3,'invalid',[]])reject(stream(b(0x4e)),'OPTIONS',options);
 reject(stream(b(0x4e,0x30,0x4e)),'BUDGET_OPERATIONS',{limits:{operations:2}});
 reject(stream(b(0x28,0x4e,0x4e,0x74)),'BUDGET_STACK',{limits:{stack:2}});
 reject(stream(b(0x4e,0x30,0x4e)),'BUDGET_NODES',{limits:{nodes:1}});
 reject(stream(b(0x28,0x4e,0x4e,0x74)),'BUDGET_EDGES',{limits:{edges:1}});
 reject(stream(string('abcd')),'BUDGET_ITEMBYTES',{limits:{itemBytes:3}});
 reject(stream(b(0x28),string('ab'),string('cd'),b(0x74)),'BUDGET_STRINGBYTES',{limits:{stringBytes:3}});
 reject(stream(b(0x4e,0x71,1)),'BUDGET_MEMO',{limits:{memo:1}});
 reject(stream(b(0x4e)),'INPUT',{limits:{inputBytes:3}});
 for(const limits of [{unknown:1},{operations:0},{stack:LIMITS.stack+1},{memo:1.5},null])reject(stream(b(0x4e)),'LIMITS',{limits});
});

test('explicit defaultdict mode reads ordinary CPython None/list controls under protocols 2, 4 and 5',()=>{
 const fixture=require('./fixtures/renpy-defaultdict-cpython.json');
 assert.equal(fixture.fixtures.length,6);
 for(const input of fixture.fixtures){
  const buffer=Buffer.from(input.base64,'base64'),out=decode(buffer,ddOptions),value=out.value;
  assert.equal(buffer.length,input.bytes);assert.equal(out.bytesRead,input.bytes);assert.equal(out.protocol,input.protocol);
  assert.equal(value.kind,'defaultdict');assert.equal(value.factory,input.factory);assert.ok(value.entries instanceof Map);
  assert.deepEqual(value.entries.get('alpha'),{kind:'list',items:[1,2]});assert.deepEqual(value.entries.get('empty'),{kind:'list',items:[]});
  assert.equal(value.entries.size,2);assert.equal(value.entries.get('absent'),undefined);assert.equal(value.entries.size,2);
  assert.equal(Object.getPrototypeOf(value),Object.prototype);
  reject(buffer,'GLOBAL');reject(buffer,'GLOBAL',{classes:[]});reject(buffer,'GLOBAL',{allowDefaultDict:false});
 }
});

test('defaultdict mode is boolean and off unless explicitly enabled',()=>{
 for(const allowDefaultDict of [null,0,1,'true','false',{},[]])reject(stream(b(0x4e)),'DEFAULTDICT_OPTION',{allowDefaultDict});
 reject(stream(dd()),'GLOBAL');reject(stream(dd()),'GLOBAL',{allowDefaultDict:false});
 reject(stream(namedGlobal('builtins','list')),'GLOBAL');reject(stream(namedGlobal('__builtin__','list')),'GLOBAL');
 for(const [module,name]of [['collections','defaultdict'],['builtins','list'],['__builtin__','list']]){
  const value=decode(stream(namedGlobal(module,name)),ddOptions).value;
  assert.deepEqual(value,{kind:'global',name:module+'.'+name});assert.equal(Object.isFrozen(value),true);
 }
});

test('defaultdict reduction accepts only empty, None or exact inert list-factory arguments',()=>{
 for(const args of [b(0x29),b(0x4e,0x85)])assert.deepEqual(decode(stream(dd(args)),ddOptions).value,{kind:'defaultdict',factory:null,entries:new Map()});
 for(const module of ['builtins','__builtin__']){
  const args=Buffer.concat([namedGlobal(module,'list'),b(0x85)]);
  assert.equal(decode(stream(dd(args)),ddOptions).value.factory,'list');
 }
 reject(stream(dd(b(0x4e))),'REDUCE',ddOptions);
 reject(stream(dd(b(0x4e,0x4e,0x86))),'REDUCE_ARGS',ddOptions);
 for(const args of [b(0x4b,1,0x85),b(0x89,0x85),b(0x5d,0x85),b(0x7d,0x85),Buffer.concat([ddGlobal(),b(0x85)])])reject(stream(dd(args)),'REDUCE_FACTORY',ddOptions);
 reject(stream(dd(Buffer.concat([namedGlobal('renpy.ast','Say'),b(0x85)]))),'REDUCE_FACTORY',{allowDefaultDict:true});
});

test('new globals never enable arbitrary reducer, constructor or state execution',()=>{
 for(const [module,name]of [['collections','OrderedDict'],['collections','defaultdict.extra'],['collections.defaultdict','list'],['builtins','dict'],['__builtin__','tuple'],['os','system']])reject(stream(namedGlobal(module,name)),'GLOBAL',ddOptions);
 for(const [module,name]of [['builtins','list'],['__builtin__','list'],['collections','defaultdict']]){
  reject(stream(namedGlobal(module,name),b(0x29,0x81)),'NEWOBJ',ddOptions);
 }
 reject(stream(global(),b(0x29,0x52)),'REDUCE',{allowDefaultDict:true});
 reject(stream(namedGlobal('builtins','list'),b(0x29,0x52)),'REDUCE',ddOptions);
 reject(stream(b(0x4e,0x29,0x52)),'REDUCE',ddOptions);
 reject(stream(dd(),b(0x7d,0x62)),'STATE',ddOptions);
 const ordinary=decode(stream(instance(),b(0x7d,0x62)),{allowDefaultDict:true}).value;
 assert.equal(ordinary.className,'renpy.ast.Say');reject(stream(instance()),'GLOBAL',ddOptions);
});

test('defaultdict SETITEM/SETITEMS preserve duplicates and edge budgets without default insertion',()=>{
 const single=stream(dd(),string('key'),b(0x4b,3,0x73)),many=stream(dd(),b(0x28),string('a'),b(0x4b,1),string('b'),b(0x4b,2,0x75));
 assert.equal(decode(single,ddOptions).value.entries.get('key'),3);
 assert.deepEqual([...decode(many,ddOptions).value.entries],[['a',1],['b',2]]);
 reject(stream(dd(),string('a'),b(0x4e,0x73),string('a'),b(0x4e,0x73)),'DUPLICATE_KEY',ddOptions);
 reject(stream(dd(),b(0x28),string('a'),b(0x4e),string('a'),b(0x4e,0x75)),'DUPLICATE_KEY',ddOptions);
 reject(stream(dd(),b(0x4e,0x4e,0x73)),'DICT',ddOptions);
 reject(single,'BUDGET_EDGES',{...ddOptions,limits:{edges:1}});
 const exact=decode(single,{...ddOptions,limits:{edges:2}});assert.equal(exact.counts.edges,2);
 reject(many,'BUDGET_EDGES',{...ddOptions,limits:{edges:3}});
 assert.equal(decode(many,{...ddOptions,limits:{edges:4}}).counts.edges,4);
 const cyclic=decode(stream(dd(),b(0x71,0),string('self'),b(0x68,0,0x73)),ddOptions).value;
 assert.equal(cyclic.entries.get('self'),cyclic);
});

test('explicit PyCode state reads ordinary CPython neutral tuple lengths 4 through 7',()=>{
 const fixture=require('./fixtures/renpy-pycode-cpython.json');assert.equal(fixture.fixtures.length,12);
 for(const input of fixture.fixtures){
  const buffer=Buffer.from(input.base64,'base64'),out=decode(buffer,pyOptions),value=out.value,state=value.state;
  assert.equal(out.protocol,input.protocol);assert.equal(out.bytesRead,input.bytes);assert.equal(buffer.length,input.bytes);
  assert.equal(value.kind,'instance');assert.equal(value.className,'renpy.ast.PyCode');assert.equal(value.stateKind,'pycode-opaque');assert.ok(state instanceof Map);assert.equal(state.size,8);
  assert.equal(state.get('writerTag'),1);assert.equal(state.get('source'),'neutral_value = 1');assert.equal(state.get('filename'),'synthetic.rpy');assert.equal(state.get('linenumber'),12);
  assert.equal(state.get('mode'),['exec','eval','single','exec'][input.stateLength-4]);assert.equal(state.get('py'),input.stateLength>=5?3:2);
  assert.equal(state.get('hashcode'),input.stateLength>=6?0xffffffff:null);assert.equal(state.get('col_offset'),input.stateLength>=7?17:0);
  assert.equal(state.has('bytecode'),false);assert.equal(Object.getPrototypeOf(value),Object.prototype);
 }
});

test('PyCode state requires boolean opt-in plus an independent explicit class identity',()=>{
 const buffer=stream(pyInstance(),pyState(),b(0x62));
 for(const allowPyCodeState of [null,0,1,'true','false',{},[]])reject(buffer,'PYCODE_OPTION',{...pyOptions,allowPyCodeState});
 reject(buffer,'GLOBAL');reject(buffer,'GLOBAL',{allowPyCodeState:true});reject(buffer,'GLOBAL',{classes:[],allowPyCodeState:true});
 reject(buffer,'PYCODE_STATE_DISABLED',{classes:['renpy.ast.PyCode']});reject(buffer,'PYCODE_STATE_DISABLED',{...pyOptions,allowPyCodeState:false});
 reject(stream(pyInstance(),b(0x7d,0x62)),'PYCODE_STATE_DISABLED',{classes:['renpy.ast.PyCode']});
 reject(stream(instance(),pyState(),b(0x62)),'STATE',{allowPyCodeState:true});
 const ordinary=decode(stream(instance(),b(0x7d,0x62)),{allowPyCodeState:true}).value;
 assert.equal(ordinary.stateKind,undefined);assert.equal(ordinary.className,'renpy.ast.Say');
});

test('PyCode BUILD rejects unproved tags, shapes, source types and repeat state',()=>{
 for(const state of [b(0x4e),b(0x7d),b(0x5d),tuple(integer(1),string('opaque'),tuple(string('f'),integer(0))),tuple(integer(1),string('opaque'),tuple(string('f'),integer(0)),string('exec'),integer(2),b(0x4e),integer(0),b(0x4e))])reject(stream(pyInstance(),state,b(0x62)),'PYCODE_STATE',pyOptions);
 for(const tag of [integer(0),integer(2),b(0x88),string('1')])reject(stream(pyInstance(),pyState({tag}),b(0x62)),'PYCODE_TAG',pyOptions);
 for(const source of [b(0x4e),b(0x55,1,0x61),b(0x5d),b(0x7d)])reject(stream(pyInstance(),pyState({source}),b(0x62)),'PYCODE_SOURCE',pyOptions);
 const pyExpr=Buffer.concat([namedGlobal('renpy.ast','PyExpr'),b(0x29,0x81)]);
 reject(stream(pyInstance(),pyState({source:pyExpr}),b(0x62)),'PYCODE_SOURCE',{classes:['renpy.ast.PyCode','renpy.ast.PyExpr'],allowPyCodeState:true});
 reject(stream(pyInstance(),pyState(),b(0x62),pyState(),b(0x62)),'STATE',pyOptions);
});

test('PyCode location, mode, py version, hash and offset use a conservative fixed subset',()=>{
 for(const location of [b(0x4e),b(0x5d),tuple(string('f')),tuple(string('f'),integer(0),integer(0)),tuple(b(0x4e),integer(0)),tuple(string('f'),integer(-1)),tuple(string('f'),b(0x88))])reject(stream(pyInstance(),pyState({location}),b(0x62)),'PYCODE_LOCATION',pyOptions);
 for(const mode of [string('unknown'),string('EXEC'),integer(0),b(0x4e)])reject(stream(pyInstance(),pyState({mode}),b(0x62)),'PYCODE_MODE',pyOptions);
 for(const py of [integer(0),integer(1),integer(4),string('3'),b(0x88),b(0x4e)])reject(stream(pyInstance(),pyState({tail:[py]}),b(0x62)),'PYCODE_PY',pyOptions);
 for(const hash of [integer(-1),string('hash'),b(0x88),b(0x5d)])reject(stream(pyInstance(),pyState({tail:[integer(3),hash]}),b(0x62)),'PYCODE_HASH',pyOptions);
 const large=Buffer.alloc(9);large[0]=0x47;large.writeDoubleBE(0x100000000,1);reject(stream(pyInstance(),pyState({tail:[integer(3),large]}),b(0x62)),'PYCODE_HASH',pyOptions);
 const fraction=Buffer.alloc(9);fraction[0]=0x47;fraction.writeDoubleBE(0.5,1);
 for(const offset of [integer(-1),string('0'),b(0x89),fraction])reject(stream(pyInstance(),pyState({tail:[integer(2),b(0x4e),offset]}),b(0x62)),'PYCODE_OFFSET',pyOptions);
 const value=decode(stream(pyInstance(),pyState({source:string(''),location:tuple(string(''),integer(0)),mode:string('single'),tail:[integer(2),integer(0),integer(0)]}),b(0x62)),pyOptions).value;
 assert.equal(value.state.get('hashcode'),0);assert.equal(value.state.get('linenumber'),0);assert.equal(value.state.get('source'),'');
});

test('PyCode opaque state accounts for its new Map node and all sixteen stored edges',()=>{
 const buffer=stream(pyInstance(),pyState(),b(0x62)),out=decode(buffer,pyOptions);
 // Input tuples contribute six edges; the eight-field stored Map adds sixteen.
 assert.equal(out.counts.edges,22);assert.equal(out.counts.nodes,13);
 assert.equal(out.counts.stringBytes,Buffer.byteLength('renpy.astPyCode'+'neutral_value = 1'+'synthetic.rpy'+'exec'));
 reject(buffer,'BUDGET_EDGES',{...pyOptions,limits:{edges:21}});assert.equal(decode(buffer,{...pyOptions,limits:{edges:22}}).counts.edges,22);
 reject(buffer,'BUDGET_NODES',{...pyOptions,limits:{nodes:12}});assert.equal(decode(buffer,{...pyOptions,limits:{nodes:13}}).counts.nodes,13);
 reject(buffer,'BUDGET_STRINGBYTES',{...pyOptions,limits:{stringBytes:out.counts.stringBytes-1}});
});
