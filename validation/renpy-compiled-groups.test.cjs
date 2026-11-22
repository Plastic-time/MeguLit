// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractCanonical,PROFILE,LIMITS}=require('../services/original-engines/renpy-compiled-groups.cjs');
const {pairTrack}=require('../services/original-engines/renpy-track.cjs');
const list=items=>({kind:'list',items});
const node=(name,fields={})=>({kind:'instance',className:'renpy.ast.'+name,stateShape:'tuple:none,dict',
 state:new Map([['filename','fixture.rpy'],['linenumber',1],['col_offset',0],...Object.entries(fields)])});
const say=(what='Neutral line',who=null)=>node('Say',{what,who,who_fast:who!==null});
const ts=(id='intro',what='Neutral line')=>node('TranslateSay',{identifier:id,what,who_fast:false});
const end=()=>node('EndTranslate');
const tr=(id='intro',says=[say()])=>node('Translate',{identifier:id,block:list(says)});
const label=items=>node('Label',{block:list(items)});
const root=(items,key='unlocked')=>({kind:'tuple',items:[{kind:'dict',entries:new Map([
 ['version',5003000],['key',key],['deferred_parse_errors',{kind:'defaultdict',factory:'list',entries:new Map()}]
])},list(items)]});
const doc=(items=[ts()],sourceId='neutral',key='unlocked')=>({sourceId,root:root(items,key)});
const run=(documents=[doc()],limits)=>extractCanonical({profile:PROFILE,documents,...(limits===undefined?{}:{limits})});
function rejects(fn,code) {
 assert.throws(fn,e=>typeof e.code==='string'&&e.code.startsWith('RENPY_')&&(!code||e.code==='RENPY_COMPILED_GROUPS_'+code)&&!e.message.includes('PRIVATE_MARKER'));
}
test('canonical ordering, local marker and actual node-default provenance',()=>{
 const a=ts('first','  Exact {b}text{/b}\nnext  '),b=tr('second',[say('One','e'),say('Two')]),m=end();
 const nested=label([b,m]);
 a.state.set('next',nested); nested.state.set('next',b); b.state.set('next',b.state.get('block').items[0]);
 b.state.set('after',m); b.state.get('block').items[0].state.set('next',b.state.get('block').items[1]);
 b.state.get('block').items[1].state.set('next',m);
 const result=run([doc([a,nested])]);
 assert.deepEqual(result.scenes[0].groups.map(g=>g.id),['first','second']);
 assert.equal(result.scenes[0].groups[0].says[0].text,'  Exact {b}text{/b}\nnext  ');
 assert.deepEqual(result.scenes[0].groups[1].says.map(s=>[s.who,s.text]),[['e','One'],[null,'Two']]);
 assert.deepEqual(result.scenes[0].groups[1].source.path,['stmts',1,'block',0]);
 assert.deepEqual(result.scenes[0].groups[1].terminal.path,['stmts',1,'block',1]);
 assert.equal(result.scenes[0].groups[0].source.fields.get('language').origin,'slot-default');
 assert.equal(result.scenes[0].groups[0].source.fields.get('language').present,false);
 assert.equal(a.state.has('language'),false);
 assert.equal(result.counts.groups,2);assert.equal(result.counts.says,3);
 assert.equal(result.counts.groupSays,2);
 assert.equal(result.provenance.canonicalLanguage,null);
 for(const key of ['compilerIdentityVerified','languageVerified','gameFullTextVerified','pointReadVerified','ackVerified'])assert.equal(result.provenance[key],false);
});
test('multiple documents retain caller order; exact IDs are compatible with actual pairTrack',()=>{
 const r=run([doc([ts('__proto__','A')],'second'),doc([ts('z_2','B')],'first')]);
 assert.deepEqual(r.scenes.map(s=>s.name),['second','first']);
 const p=pairTrack({language:'Target',canonical:r.scenes,track:{language:'Target',blocks:[
  {id:'z_2',says:[{who:null,text:'B target'}]},{id:'__proto__',says:[{who:null,text:'A target'}]}
 ]}});
 assert.deepEqual(p.scenes.map(s=>s.groups[0].says[0].text),['A target','B target']);
});
test('all entry points require the real metadata helper and exact explicit profile',()=>{
 rejects(()=>extractCanonical());rejects(()=>extractCanonical({profile:true,documents:[doc()]}),'PROFILE');
 rejects(()=>extractCanonical({profile:PROFILE,documents:[doc()],path:'not-used'}),'OPTIONS');
 const d=doc();d.root.items[0].entries.delete('version');rejects(()=>run([d]));
 const bad=doc();bad.root.items[0].entries.set('version','5003000');rejects(()=>run([bad]));
 const errors=doc();errors.root.items[0].entries.get('deferred_parse_errors').entries.set('PRIVATE_MARKER',[]);rejects(()=>run([errors]));
 rejects(()=>run([doc([ts()],'a',Buffer.from([1])),doc([ts('other')],'b',Buffer.from([2]))]),'KEY_MISMATCH');
 assert.equal(run([doc([ts()],'a',Buffer.from([1])),doc([ts('other')],'b',Buffer.from([1]))]).scenes.length,2);
});
test('every unsupported top-level or group child rejects the entire result',()=>{
 for(const bad of [say(),node('Node'),node('Python'),node('Unknown'),end()])rejects(()=>run([doc([ts('good'),bad])]));
 for(const bad of [ts('nested'),end(),label([]),node('Python'),null,17])rejects(()=>run([doc([tr('g',[say(),bad]),end()])]));
 const d=doc([ts('good')]);d.root.items[1].items.push(null);rejects(()=>run([d]));
});
test('markers must be the unique immediate sibling, never inferred across parents',()=>{
 rejects(()=>run([doc([tr()])]),'MARKER_REQUIRED');
 rejects(()=>run([doc([tr(),ts('other'),end()])]),'MARKER_REQUIRED');
 rejects(()=>run([doc([tr(),end(),end()])]),'TOP_NODE_UNSUPPORTED');
 rejects(()=>run([doc([ts(),end()])]),'TOP_NODE_UNSUPPORTED');
 rejects(()=>run([doc([label([tr()]),end()])]),'MARKER_REQUIRED');
 rejects(()=>run([doc([tr('g',[]) ,end()])]),'GROUP_SIZE');
});
test('language and alternate are explicit unsupported semantics, missing None is not Japanese',()=>{
 for(const make of [()=>ts(),()=>tr()])for(const [key,value] of [['language','Japanese'],['language','English'],['alternate','fallback']]){
  const n=make();n.state.set(key,value);
  const call=()=>run([doc(n.className.endsWith('Translate')?[n,end()]:[n])]);
  if(key==='alternate')assert.throws(call,e=>e.code==='RENPY_NODE_STATE_COMPLEX_VALUE_UNSUPPORTED'&&e.field==='alternate');
  else rejects(call,'LANGUAGE_OR_ALTERNATE_UNSUPPORTED');
 }
 const n=ts();n.state.set('language',null);n.state.set('alternate',null);const r=run([doc([n])]);
 assert.equal(r.provenance.languageVerified,false);assert.equal(r.scenes[0].groups[0].source.fields.get('language').origin,'wire');
});
test('duplicate exact group IDs reject before any map overwrite, within and across documents',()=>{
 rejects(()=>run([doc([ts(),ts()])]),'DUPLICATE_ID');
 rejects(()=>run([doc([ts()],'a'),doc([tr(),end()],'b')]),'DUPLICATE_ID');
 for(const id of ['', 'a.b','1id','a\n','a\u2028','A'.repeat(161),'PRIVATE_MARKER!'])rejects(()=>run([doc([ts(id)])]),'GROUP_ID');
 assert.equal(run([doc([ts('A'.repeat(160))])]).scenes[0].groups[0].id.length,160);
});
test('Say effects, expression speakers and identifier variations are never silently dropped',()=>{
 for(const [k,v]of [['with_','dissolve'],['attributes',{kind:'tuple',items:['happy']}],['arguments',node('Node')],
 ['temporary_attributes',{kind:'tuple',items:['x']}],['interact',false],['explicit_identifier',true],['rollback','never']]){
  const s=say();s.state.set(k,v);rejects(()=>run([doc([tr('g',[s]),end()])]));
 }
 for(const [who,fast]of [['e + 1',true],['python',true],['e',false],['e',null],[null,true],[null,null],['e\n',true]]){
  const s=say();s.state.set('who',who);s.state.set('who_fast',fast);rejects(()=>run([doc([tr('g',[s]),end()])]));
 }
 const s=say();s.state.set('identifier','explicit');rejects(()=>run([doc([tr('g',[s]),end()])]),'SAY_IDENTIFIER_UNSUPPORTED');
 const s2=say();s2.state.delete('who_fast');rejects(()=>run([doc([tr('g',[s2]),end()])]),'SPEAKER_UNSUPPORTED');
});
test('text remains literal and must be nonempty well-formed without coercion',()=>{
 for(const what of ['', ' \t\n','bad\0text','\ud800',17,{toString(){throw Error('PRIVATE_MARKER');}}])rejects(()=>run([doc([ts('g',what)])]));
 assert.equal(run([doc([ts('g','[name] {i}quoted{/i} \\n')])]).scenes[0].groups[0].says[0].text,'[name] {i}quoted{/i} \\n');
});
test('Label semantics, missing fields and forged computed fields reject rather than disappear',()=>{
 for(const [k,v]of [['hide',true],['parameters',node('Node')]]){const l=label([ts()]);l.state.set(k,v);rejects(()=>run([doc([l])]));}
 for(const name of ['Label','Translate']) {const n=node(name,{identifier:'g'});rejects(()=>run([doc([n,end()])]));}
 for(const k of ['block','after','name','statement_start','translatable','__version__']){const n=ts();n.state.set(k,null);rejects(()=>run([doc([n])]));}
 for(const k of ['linenumber','col_offset']){const n=ts();n.state.delete(k);rejects(()=>run([doc([n])]));}
 const n=ts();n.stateShape='dict';rejects(()=>run([doc([n])]));
});
test('structural nodes, state maps and all list containers cannot alias or cycle',()=>{
 const a=ts();rejects(()=>run([doc([a,a])]),'STRUCTURAL_ALIAS');
 const l=label([]);l.state.set('block',list([l]));rejects(()=>run([doc([l])]),'STRUCTURAL_ALIAS');
 const s=say(),a1=tr('a',[s]),a2=tr('b',[s]);rejects(()=>run([doc([a1,end(),a2,end()])]),'STRUCTURAL_ALIAS');
 const shared=list([say()]),b1=tr('a'),b2=tr('b');b1.state.set('block',shared);b2.state.set('block',shared);rejects(()=>run([doc([b1,end(),b2,end()])]),'STRUCTURAL_ALIAS');
 const sharedItems=[say()],c1=tr('c'),c2=tr('d');c1.state.set('block',list(sharedItems));c2.state.set('block',list(sharedItems));rejects(()=>run([doc([c1,end(),c2,end()])]),'STRUCTURAL_ALIAS');
 const m=new Map(ts().state),x=ts('x'),y=ts('y');x.state=m;y.state=m;rejects(()=>run([doc([x,y])]),'STRUCTURAL_ALIAS');
 const q=ts();rejects(()=>run([doc([q],'a'),doc([q],'b')]),'STRUCTURAL_ALIAS');
 const d=doc();rejects(()=>run([d,{sourceId:'b',root:d.root}]),'STRUCTURAL_ALIAS');
});
test('next/after only target structurally declared same-document nodes and cannot create a cycle',()=>{
 const a=ts('a'),b=ts('b');a.state.set('next',b);
 assert.equal(run([doc([a,b])]).counts.groups,2);
 const dangling=ts();dangling.state.set('next',ts('absent'));rejects(()=>run([doc([dangling])]),'DANGLING_REFERENCE');
 const c=ts('c'),d=ts('d');c.state.set('next',d);rejects(()=>run([doc([c],'c'),doc([d],'d')]),'CROSS_DOCUMENT_REFERENCE');
 const self=ts();self.state.set('next',self);rejects(()=>run([doc([self])]),'REFERENCE_CYCLE');
 const x=ts('x'),y=ts('y');x.state.set('next',y);y.state.set('next',x);rejects(()=>run([doc([x,y])]),'REFERENCE_CYCLE');
 const l=label([ts()]);l.state.get('block').items[0].state.set('next',l);rejects(()=>run([doc([l])]),'REFERENCE_CYCLE');
 const long=Array.from({length:128},(_,i)=>ts('g_'+i));for(let i=0;i<long.length-1;i++)long[i].state.set('next',long[i+1]);
 assert.equal(run([doc(long)],{depth:1}).counts.groups,128);
});
test('top-level and block lists must be dense plain data arrays with no accessor reads',()=>{
 const sparse=doc();sparse.root.items[1].items.length=2;rejects(()=>run([sparse]));
 const accessor=doc();let reads=0;Object.defineProperty(accessor.root.items[1].items,0,{get(){reads++;return ts();},configurable:true});
 rejects(()=>run([accessor]));assert.equal(reads,0);
 const blockAccessor=tr();Object.defineProperty(blockAccessor.state.get('block').items,0,{get(){reads++;return say();},configurable:true});
 rejects(()=>run([doc([blockAccessor,end()])]));assert.equal(reads,0);
 const block=tr();block.state.get('block').items.extra='x';rejects(()=>run([doc([block,end()])]));
 const bad=doc();bad.root.items[1].items=Object.assign(Object.create(Array.prototype),{length:0});rejects(()=>run([bad]));
});
test('documents and closed lower-only limits cannot be coerced or widened',()=>{
 rejects(()=>run([]),'DOCUMENTS');rejects(()=>run([doc(),'bad']),'DOCUMENT');
 rejects(()=>run([doc([ts()],'a'),doc([ts('b')],'a')]),'DUPLICATE_SOURCE_ID');
 for(const id of ['', 'a\n','a\u2028','\ud800'])rejects(()=>run([doc([ts()],id)]));
 for(const limits of [null,[],{unknown:1},{groups:0},{groups:1.2},{groups:true},{groups:LIMITS.groups+1}])rejects(()=>run([doc()],limits));
});
test('global cardinality, string, text, structural-depth and output-copy budgets are enforced',()=>{
 rejects(()=>run([doc([ts('a'),ts('b')])],{groups:1}),'BUDGET_GROUPS');
 rejects(()=>run([doc([tr('g',[say('a'),say('b')]),end()])],{says:1}),'BUDGET_SAYS');
 rejects(()=>run([doc([tr('g',[say('a'),say('b')]),end()])],{groupSays:1}),'GROUP_SIZE');
 rejects(()=>run([doc([ts('g','abcd')])],{lineBytes:3}),'BUDGET_LINEBYTES');
 rejects(()=>run([doc([ts('g','ab')])],{textBytes:1}),'BUDGET_TEXTBYTES');
 let n=ts();for(let i=0;i<4;i++)n=label([n]);rejects(()=>run([doc([n])],{depth:4}),'BUDGET_DEPTH');
 const baseline=run(),usage=baseline.counts;
 for(const key of ['objects','edges','stringBytes','outputObjects','outputEdges','outputBytes']){
  assert.ok(usage[key]>1,key);assert.equal(run([doc()],{[key]:usage[key]}).counts[key],usage[key]);
  rejects(()=>run([doc()],{[key]:usage[key]-1}));
 }
});
test('no partial output, source mutation, key leak, source-path inference or output alias to raw state',()=>{
 const d=doc([ts('g','PRIVATE_MARKER neutral')],'source-order-only'),n=d.root.items[1].items[0];
 n.state.set('filename','PRIVATE_FILENAME');n.state.set('_name','NOT_GROUP_ID');
 const before=[...n.state],r=run([d]);assert.deepEqual([...n.state],before);
 assert.equal(r.scenes[0].groups[0].id,'g');assert.equal(r.scenes[0].name,'source-order-only');
 const p=r.scenes[0].groups[0].source.fields;p.get('language').origin='changed';assert.equal(n.state.has('language'),false);
 r.scenes[0].groups[0].says[0].text='changed';assert.equal(n.state.get('what'),'PRIVATE_MARKER neutral');
 const serialized=JSON.stringify(r);assert.equal(serialized.includes('PRIVATE_FILENAME'),false);assert.equal(serialized.includes('NOT_GROUP_ID'),false);assert.equal(serialized.includes('deferred_parse_errors'),false);
 const bad=doc([ts('ok'),say('PRIVATE_MARKER fail')]);let value;rejects(()=>{value=run([bad]);});assert.equal(value,undefined);
});
