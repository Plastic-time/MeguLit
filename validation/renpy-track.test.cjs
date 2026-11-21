// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseLoose,pairTrack,LIMITS}=require('../services/original-engines/renpy-track.cjs');
const source=(text,name='part.rpy')=>({name,buffer:Buffer.from(text)});
const input='translate Japanese intro_a:\n    a "最初の例"\n    "次の例"\n';
const parse=(text=input,extra={})=>parseLoose({language:'Japanese',sources:[source(text)],...extra});
const says=(...items)=>items.map(([who,text])=>({who,text}));
const group=(id,s)=>({id,says:s});
const canonical=()=>[{name:'intro.rpy',groups:[group('intro_a',says(['a','Example one'],[null,'Example two']))]}];
const paired=(track=parse(),extra={})=>pairTrack({language:'Japanese',canonical:canonical(),track,...extra});
const rejects=(fn,code)=>assert.throws(fn,e=>e.code==='RENPY_TRACK_'+code&&!e.message.includes('最初'));

test('explicit loose track keeps identifiers, source locations and literal Say order',()=>{
 const t=parse('\ufefftranslate Japanese intro_a:\r\n    a "引用\\\"と改行\\n次" # comment\r\n    "次の例"\r\n');
 assert.equal(t.language,'Japanese');assert.equal(t.blocks[0].id,'intro_a');assert.equal(t.blocks[0].source,'part.rpy');assert.equal(t.blocks[0].line,1);
 assert.deepEqual(t.blocks[0].says,says(['a','引用"と改行\n次'],[null,'次の例']));assert.deepEqual(t.excluded,[]);
});
test('strings, style and Python are isolated and never promoted to narrative',()=>{
 const t=parse(input+'translate Japanese strings:\n    old "UI"\n    new "画面"\ntranslate Japanese style button_text:\n    font "not-a-say"\ntranslate Japanese python:\n    raise Exception("must not execute")\n');
 assert.equal(t.blocks.length,1);assert.deepEqual(t.excluded.map(x=>x.kind),['strings','style','python']);assert.equal(t.blocks[0].says.length,2);
 const ui=parse('translate Japanese strings:\n    old "A"\n    new "画面"\n');assert.equal(ui.blocks.length,0);rejects(()=>paired(ui),'EMPTY_TRACK');
});
test('ordered canonical IDs, not file order or repeated English text, determine output',()=>{
 const t=parse('translate Japanese second:\n    a "後の文"\ntranslate Japanese first:\n    a "先の文"\n');
 const c=[{name:'scene.rpy',groups:[group('first',says(['a','Same text'])),group('second',says(['a','Same text']))]}];
 const r=pairTrack({language:'Japanese',canonical:c,track:t});assert.deepEqual(r.scenes[0].groups.map(g=>[g.id,g.says[0].text]),[['first','先の文'],['second','後の文']]);
 assert.deepEqual(r.coverage,{groups:2,says:2,matchedGroups:2,matchedSays:2,rate:1});
});
test('pairing preserves Say positions and returns copies',()=>{
 const t=parse(),r=paired(t);assert.deepEqual(r.scenes[0].groups[0].says,t.blocks[0].says);r.scenes[0].groups[0].says[0].text='changed';assert.equal(t.blocks[0].says[0].text,'最初の例');
});
test('language is explicit, exact and not inferred from file names or text',()=>{
 rejects(()=>parseLoose({sources:[source(input)]}),'LANGUAGE');rejects(()=>parseLoose({language:'None',sources:[source(input)]}),'LANGUAGE');
 rejects(()=>parse(input.replace('Japanese','English')),'LANGUAGE_MISMATCH');rejects(()=>paired(parse(),{language:'English'}),'LANGUAGE_MISMATCH');
 const t=parseLoose({language:'English',sources:[source('translate English example:\n    "Not Japanese"\n','tl/Japanese/looks-japanese.rpy')]});assert.equal(t.language,'English');
 rejects(()=>parse('define config.default_language = "Japanese"\n'+input),'UNSUPPORTED_TOP_LEVEL');
});
for(const [name,text,code]of [
 ['duplicate identifier',input+input,'DUPLICATE_ID'],
 ['missing body','translate Japanese empty:\n# no Say\n','EMPTY_BLOCK'],
 ['nested conditional','translate Japanese a:\n    if condition:\n        "例"\n','UNSUPPORTED_SAY'],
 ['unknown top level','label start:\n    "例"\n','UNSUPPORTED_TOP_LEVEL'],
 ['orphan body','    "例"\n','ORPHAN_BODY'],
 ['unknown block','translate Japanese style:\n    "例"\n','UNSUPPORTED_BLOCK'],
 ['expression instead of literal','translate Japanese a:\n    a variable_name\n','UNSUPPORTED_SAY'],
 ['statement keyword posing as speaker','translate Japanese a:\n    call "not-a-say"\n','UNSUPPORTED_SAY'],
 ['Say attributes outside supported subset','translate Japanese a:\n    a happy "例"\n','UNSUPPORTED_SAY'],
 ['unsupported escape','translate Japanese a:\n    "\\x41"\n','UNSUPPORTED_ESCAPE'],
 ['nested indentation','translate Japanese a:\n        "例"\n','UNSUPPORTED_INDENT'],
 ['tab indentation','translate Japanese a:\n\t"例"\n','UNSUPPORTED_INDENT'],
 ['NUL byte',input+'\0','CONTROL_CHARACTER']
])test('loose parser rejects '+name,()=>rejects(()=>parse(text),code));
test('duplicate identifiers across files and duplicate provenance are rejected',()=>{
 rejects(()=>parseLoose({language:'Japanese',sources:[source(input,'a'),source(input,'b')]}),'DUPLICATE_ID');
 rejects(()=>parseLoose({language:'Japanese',sources:[source(input),source(input)]}),'DUPLICATE_SOURCE');
});
test('buffers are strict UTF8, never Python pickle, implicit file paths or object coercions',()=>{
 rejects(()=>parseLoose({language:'Japanese',sources:[{name:'a',buffer:'C:/game.rpy'}]}),'BUFFER_REQUIRED');
 rejects(()=>parseLoose({language:'Japanese',sources:[{name:'a',buffer:Buffer.from([255,255])}]}),'UTF8');
 rejects(()=>parseLoose({language:'Japanese',sources:[source('RENPY RPC2')]}),'UNSUPPORTED_TOP_LEVEL');
});
test('missing, extra, duplicate and unequal occurrence groups fail closed',()=>{
 const missing=structuredClone(parse());missing.blocks[0].id='other';rejects(()=>paired(missing),'MISSING_ID');
 const extra=parse(input+'translate Japanese extra:\n    "余分な例"\n');rejects(()=>paired(extra),'EXTRA_ID');
 const duplicate=structuredClone(parse());duplicate.blocks.push(duplicate.blocks[0]);rejects(()=>paired(duplicate),'DUPLICATE_ID');
 const c=canonical();c[0].groups.push(c[0].groups[0]);rejects(()=>paired(parse(),{canonical:c}),'DUPLICATE_ID');
 const short=structuredClone(parse());short.blocks[0].says.pop();rejects(()=>paired(short),'GROUP_SIZE');
 const reversed=structuredClone(parse());reversed.blocks[0].says.reverse();rejects(()=>paired(reversed),'SPEAKER_ORDER');
 const unnamed=canonical();delete unnamed[0].groups[0].says[0].who;rejects(()=>paired(parse(),{canonical:unnamed}),'SPEAKER');
 const sameScene=canonical();sameScene.push(sameScene[0]);rejects(()=>paired(parse(),{canonical:sameScene}),'DUPLICATE_SCENE');
});
test('every parser budget is enforced, and caller limits cannot raise hard caps',()=>{
 for(const [key,value]of Object.entries(LIMITS))rejects(()=>parse(input,{limits:{[key]:value+1}}),'LIMITS');
 rejects(()=>parse(input,{limits:{unknown:1}}),'LIMITS');rejects(()=>parse(input,{limits:{fileBytes:1.5}}),'LIMITS');
 rejects(()=>parse(input,{limits:{fileBytes:1}}),'BUDGET_FILEBYTES');rejects(()=>parse(input,{limits:{totalBytes:1}}),'BUDGET_TOTALBYTES');
 rejects(()=>parse(input,{limits:{fileLines:1}}),'BUDGET_FILELINES');rejects(()=>parse(input,{limits:{totalLines:1}}),'BUDGET_TOTALLINES');
 rejects(()=>parse(input,{limits:{lineBytes:1}}),'BUDGET_LINEBYTES');rejects(()=>parse(input,{limits:{says:1}}),'BUDGET_SAYS');
 rejects(()=>parse(input,{limits:{groupSays:1}}),'BUDGET_GROUPSAYS');rejects(()=>parse(input,{limits:{textBytes:1}}),'BUDGET_TEXTBYTES');
 rejects(()=>parse(input+'translate Japanese second:\n    "例"\n',{limits:{blocks:1}}),'BUDGET_BLOCKS');
 rejects(()=>parseLoose({language:'Japanese',sources:[source(input,'a'),source(input,'b')],limits:{sources:1}}),'BUDGET_SOURCES');
});
test('pairing revalidates the supplied data and aggregate budgets',()=>{
 rejects(()=>paired(parse(),{limits:{says:1}}),'BUDGET_SAYS');rejects(()=>paired(parse(),{limits:{textBytes:1}}),'BUDGET_TEXTBYTES');
 rejects(()=>paired(parse(),{limits:{blocks:1}}),'BUDGET_BLOCKS');const malformed=structuredClone(parse());malformed.blocks[0].says[0].text='';rejects(()=>paired(malformed),'SAY_TEXT');
 const long=structuredClone(parse());long.blocks[0].says[0].text='a'.repeat(LIMITS.lineBytes+1);rejects(()=>paired(long),'BUDGET_LINEBYTES');
});
test('aggregate limits stop the second individually valid source, including excluded blocks',()=>{
 const second=input.replace('intro_a','intro_b'),sources=[source(input,'one'),source(second,'two')];
 const run=limits=>parseLoose({language:'Japanese',sources,limits});
 rejects(()=>run({totalBytes:Buffer.byteLength(input)+Buffer.byteLength(second)-1}),'BUDGET_TOTALBYTES');
 rejects(()=>run({totalLines:input.split('\n').length*2-1}),'BUDGET_TOTALLINES');
 rejects(()=>run({says:3}),'BUDGET_SAYS');rejects(()=>run({blocks:1}),'BUDGET_BLOCKS');
 const bytes=Buffer.byteLength('最初の例次の例');rejects(()=>run({textBytes:bytes*2-1}),'BUDGET_TEXTBYTES');
 rejects(()=>parse(input+'translate Japanese python:\n    arbitrary_stuff()\n',{limits:{blocks:1}}),'BUDGET_BLOCKS');
});
test('direct pairing and loose parsing bound speaker metadata and count it in aggregate text',()=>{
 const track=who=>({language:'Japanese',blocks:[group('speaker',says([who,'x']))]}),c=who=>[{name:'scene',groups:[group('speaker',says([who,'x']))]}];
 const run=(who,limits)=>pairTrack({language:'Japanese',track:track(who),canonical:c(who),limits});
 rejects(()=>run('a'.repeat(32768)),'BUDGET_SPEAKERBYTES');rejects(()=>run('a'.repeat(257)),'BUDGET_SPEAKERBYTES');
 assert.equal(run('a'.repeat(256)).coverage.says,1);rejects(()=>run('aa',{speakerBytes:1}),'BUDGET_SPEAKERBYTES');
 rejects(()=>parse('translate Japanese speaker:\n    '+ 'a'.repeat(257)+' "例"\n'),'BUDGET_SPEAKERBYTES');
 const token='speaker';rejects(()=>run(token,{textBytes:token.length*2+1}),'BUDGET_TEXTBYTES');assert.equal(run(token,{textBytes:(token.length+1)*2}).coverage.rate,1);
});
test('sparse Say arrays reject on either side with the fixed error contract',()=>{
 const normal=says(['a','x'],[null,'y']),hole=new Array(2);hole[1]=normal[1];
 const run=(base,translation)=>pairTrack({language:'Japanese',canonical:[{name:'scene',groups:[group('id',base)]}],track:{language:'Japanese',blocks:[group('id',translation)]}});
 rejects(()=>run(hole,normal),'SPARSE_SAYS');rejects(()=>run(normal,hole),'SPARSE_SAYS');rejects(()=>run(new Array(1),new Array(1)),'SPARSE_SAYS');
 const trailing=[normal[0]];trailing.length=2;rejects(()=>run(trailing,normal),'SPARSE_SAYS');
 const inherited=new Array(2),proto=Object.create(Array.prototype);proto[0]=normal[0];Object.setPrototypeOf(inherited,proto);inherited[1]=normal[1];
 rejects(()=>run(normal,inherited),'SPARSE_SAYS');assert.equal(run(normal,normal).coverage.says,2);
});
