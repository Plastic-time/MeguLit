// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateRoot,PROFILE,LIMITS}=require('../services/original-engines/renpy-compiled-root.cjs');
const {decode}=require('../services/original-engines/renpy-pickle-bounded.cjs');
const errors=()=>({kind:'defaultdict',factory:'list',entries:new Map()});
const instance=()=>({kind:'instance',className:'renpy.ast.FutureNode',state:new Map(),stateShape:'tuple:none,dict'});
function fixture(stmts=[]){return {kind:'tuple',items:[{kind:'dict',entries:new Map([['version',5003000],['key','unlocked'],['deferred_parse_errors',errors()]])},{kind:'list',items:stmts}]};}
const read=(root=fixture(),extra={})=>validateRoot(root,{profile:PROFILE,...extra});
const data=root=>root.items[0].entries;
const rejects=(fn,code)=>assert.throws(fn,error=>error.code==='RENPY_COMPILED_ROOT_'+code&&error.message===error.code);
const b=(...values)=>Buffer.from(values),join=(...values)=>Buffer.concat(values);
const string=value=>{const text=Buffer.from(value),size=Buffer.alloc(4);size.writeUInt32LE(text.length);return join(b(0x58),size,text);};
const tuple=items=>join(b(0x28),...items,b(0x74));
const list=items=>join(b(0x5d),...items.flatMap(item=>[item,b(0x61)]));
const dict=items=>join(b(0x7d),...items.flatMap(([key,value])=>[string(key),value,b(0x73)]));
function syntheticPickle(){
 const version=Buffer.alloc(5);version[0]=0x4a;version.writeInt32LE(5003000,1);
 const emptyErrors=join(Buffer.from('ccollections\ndefaultdict\n'),tuple([Buffer.from('c__builtin__\nlist\n')]),b(0x52));
 const node=join(Buffer.from('crenpy.ast\nFutureNode\n'),b(0x29,0x81,0x71,0),tuple([b(0x4e),dict([['next',b(0x68,0)]])]),b(0x62));
 return join(b(0x80,2),tuple([dict([['version',version],['key',string('unlocked')],['deferred_parse_errors',emptyErrors]]),list([node])]),b(0x2e));
}

test('neutral bounded-decoder roundtrip keeps cyclic unknown statements without claiming extraction',()=>{
 const decoded=decode(syntheticPickle(),{classes:['renpy.ast.FutureNode'],allowDefaultDict:true}).value;
 const out=read(decoded),node=decoded.items[1].items[0];
 assert.equal(out.root,decoded);assert.equal(out.data,decoded.items[0]);assert.equal(out.stmts,decoded.items[1]);
 assert.equal(out.stmts.items[0],node);assert.equal(node.state.get('next'),node);assert.equal(node.stateShape,'tuple:none,dict');
 assert.deepEqual(out.metadata,{profile:PROFILE,scriptVersion:5003000,keyKind:'unlocked',keyBytes:8,statementCount:1,statementValidation:'top-level-shape-only',compilerIdentityVerified:false,astSemanticsVerified:false,bodyCoverageVerified:false});
});
test('empty statement list is metadata-only and original key remains solely in returned data references',()=>{
 const root=fixture(),key=Buffer.from('neutral-lock-marker');data(root).set('key',key);
 const out=read(root);assert.equal(out.root,root);assert.equal(out.data.entries.get('key'),key);
 assert.equal(out.metadata.keyKind,'bytes');assert.equal(out.metadata.keyBytes,key.length);assert.equal(out.metadata.statementCount,0);
 assert.equal(out.metadata.bodyCoverageVerified,false);assert.equal(JSON.stringify(out.metadata).includes('neutral-lock-marker'),false);
});
test('only the explicit fixed writer profile is accepted',()=>{
 for(const profile of [undefined,null,'8.4','renpy-8.4','renpy-8.5.3.26051504','__proto__',{}])rejects(()=>validateRoot(fixture(),{profile}),'PROFILE');
 rejects(()=>validateRoot(fixture()),'PROFILE');
 for(const options of [null,[],1,'a path'])rejects(()=>validateRoot(fixture(),options),'OPTIONS');
 rejects(()=>validateRoot(fixture(),{profile:PROFILE,language:'Japanese'}),'OPTIONS');
});
test('root must be an exact decoded tuple with dictionary and ordered list',()=>{
 for(const root of [null,Buffer.from('not decoded'),[],{kind:'list',items:[]},{kind:'tuple',items:[]},{kind:'tuple',items:[null]},{kind:'tuple',items:[...fixture().items,null]}])rejects(()=>read(root),'ROOT_UNSUPPORTED');
 const hole=fixture();delete hole.items[0];rejects(()=>read(hole),'ROOT_UNSUPPORTED');
 const wrongData=fixture();wrongData.items[0]={kind:'defaultdict',factory:'list',entries:new Map()};rejects(()=>read(wrongData),'METADATA_UNSUPPORTED');
 const wrongStmts=fixture();wrongStmts.items[1]={kind:'tuple',items:[]};rejects(()=>read(wrongStmts),'STATEMENTS_UNSUPPORTED');
});
test('metadata requires all three exact keys and genuine Maps',()=>{
 for(const key of ['version','key','deferred_parse_errors']){const root=fixture();data(root).delete(key);rejects(()=>read(root),'METADATA_KEYS_UNSUPPORTED');}
 const extra=fixture();data(extra).set('unknown-root-metadata','neutral');rejects(()=>read(extra),'METADATA_KEYS_UNSUPPORTED');
 const lookalike=fixture();lookalike.items[0].entries={size:3,has:()=>true,get:()=>5003000};rejects(()=>read(lookalike),'METADATA_UNSUPPORTED');
 const prototypeOnly=fixture();prototypeOnly.items[0].entries=Object.create(Map.prototype);rejects(()=>read(prototypeOnly),'METADATA_UNSUPPORTED');
 const spoofed=fixture();data(spoofed).set('version',1);data(spoofed).get=()=>5003000;rejects(()=>read(spoofed),'VERSION_UNSUPPORTED');
});
test('script version is an exact integer value, never coerced or inferred',()=>{
 for(const version of [null,undefined,'5003000',5003001,5002999,true,NaN,Infinity,new Number(5003000)]){
  const root=fixture();data(root).set('version',version);rejects(()=>read(root),'VERSION_UNSUPPORTED');
 }
});
test('lock metadata is restricted to unlocked or bounded nonempty bytes',()=>{
 for(const key of [null,undefined,'','another-lock-name',Buffer.alloc(0),new Uint8Array([1]),1,{}]){const root=fixture();data(root).set('key',key);rejects(()=>read(root),'KEY_UNSUPPORTED');}
 const exact=fixture();data(exact).set('key',Buffer.alloc(4096,7));assert.equal(read(exact).metadata.keyBytes,4096);
 const oversized=fixture();data(oversized).set('key',Buffer.alloc(4097,7));rejects(()=>read(oversized),'BUDGET_KEY_BYTES');
 rejects(()=>read(exact,{limits:{keyBytes:4095}}),'BUDGET_KEY_BYTES');assert.equal(read(fixture(),{limits:{keyBytes:8}}).metadata.keyBytes,8);
 rejects(()=>read(fixture(),{limits:{keyBytes:7}}),'BUDGET_KEY_BYTES');
});
test('deferred errors must be empty inert defaultdict with normalized list factory',()=>{
 let calls=0;
 for(const value of [null,{kind:'dict',entries:new Map()},{kind:'defaultdict',factory:null,entries:new Map()},{kind:'defaultdict',factory:'builtins.list',entries:new Map()},
  {kind:'defaultdict',factory:()=>{calls++;return [];},entries:new Map()},
  {kind:'defaultdict',factory:'list',entries:new Map([['neutral',[]]])},{kind:'defaultdict',factory:'list',entries:Object.create(Map.prototype)}]){
  const root=fixture();data(root).set('deferred_parse_errors',value);rejects(()=>read(root),'DEFERRED_ERRORS_UNSUPPORTED');
 }
 assert.equal(calls,0);
});
test('every top-level occurrence is preserved, including duplicate unknown references',()=>{
 const stmt=instance(),root=fixture([stmt,stmt]);stmt.state.set('opaque',new Map([['unknown','neutral']]));
 const out=read(root);assert.equal(out.metadata.statementCount,2);assert.equal(out.stmts.items.length,2);
 assert.equal(out.stmts.items[0],stmt);assert.equal(out.stmts.items[1],stmt);assert.equal(out.metadata.astSemanticsVerified,false);
});
test('malformed and unbuilt statements reject instead of being skipped',()=>{
 for(const stmt of [null,'neutral',{kind:'global',name:'renpy.ast.Say'},{kind:'instance',className:'renpy.ast.Say',state:null},
  {...instance(),state:Object.create(Map.prototype)},{...instance(),className:'renpy.ast.FutureNode\n'},
  {...instance(),className:'another.FutureNode'},{...instance(),stateShape:'invented'},
  {...instance(),stateKind:'pycode-opaque'},{...instance(),className:'renpy.ast.PyCode',stateKind:'pycode-opaque',stateShape:'dict'}]){
  rejects(()=>read(fixture([stmt])),'STATEMENT_UNSUPPORTED');
 }
});
test('opaque PyCode top-level shape stays opaque rather than becoming Say',()=>{
 const stmt={kind:'instance',className:'renpy.ast.PyCode',state:new Map([['source','opaque neutral text']]),stateKind:'pycode-opaque',stateShape:'pycode:tuple7'};
 const out=read(fixture([stmt]));assert.equal(out.stmts.items[0],stmt);assert.equal(out.metadata.astSemanticsVerified,false);assert.equal(out.metadata.bodyCoverageVerified,false);
 rejects(()=>read(fixture([{...stmt,stateShape:'pycode:tuple7\n'}])),'STATEMENT_UNSUPPORTED');
});
test('statement limits are finite and sparse lists do not hide occurrences',()=>{
 const stmt=instance(),atLimit=fixture(Array(LIMITS.statements).fill(stmt));assert.equal(read(atLimit).metadata.statementCount,50000);
 rejects(()=>read(fixture(Array(50001).fill(stmt))),'BUDGET_STATEMENTS');
 assert.equal(read(fixture([stmt]),{limits:{statements:1}}).metadata.statementCount,1);
 rejects(()=>read(fixture([stmt,stmt]),{limits:{statements:1}}),'BUDGET_STATEMENTS');
 rejects(()=>read(fixture(Array(1))),'STATEMENT_UNSUPPORTED');
 for(const limits of [null,[],{statements:0},{statements:-1},{statements:50001},{statements:1.5},{keyBytes:4097},{unknown:1}])rejects(()=>read(fixture(),{limits}),'LIMITS');
});
test('validation does not modify input or visit the cyclic semantic graph',()=>{
 const stmt=instance(),root=fixture([stmt]);let visits=0;
 stmt.state.set('next',stmt);stmt.state.set('after',Object.defineProperty({},'next',{get(){visits++;throw Error('must not walk');}}));
 const before=[...data(root)],stateBefore=[...stmt.state];
 Object.freeze(root);Object.freeze(root.items);Object.freeze(root.items[0]);Object.freeze(root.items[1]);Object.freeze(root.items[1].items);Object.freeze(stmt);
 const out=read(root);assert.equal(visits,0);assert.equal(out.stmts.items[0],stmt);
 assert.deepEqual([...data(root)],before);assert.deepEqual([...stmt.state],stateBefore);assert.equal(stmt.state.has('language'),false);
 assert.deepEqual(Reflect.ownKeys(stmt),['kind','className','state','stateShape']);
});
test('fixed errors do not include unsupported metadata or key values',()=>{
 const marker='private-marker-not-a-key',root=fixture();data(root).set('key',marker);
 assert.throws(()=>read(root),error=>error.code==='RENPY_COMPILED_ROOT_KEY_UNSUPPORTED'&&error.message===error.code&&!error.stack.includes(marker));
});
