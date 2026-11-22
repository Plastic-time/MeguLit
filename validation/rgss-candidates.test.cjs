// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),zlib=require('node:zlib'),{spawnSync}=require('node:child_process');
const C=require('../core/rgss-scripts.cjs'),R=require('../services/original-engines/rgss.cjs'),F=require('./helpers/engine-fixtures-rgss.cjs'),{declaredVariant}=require('../core/rgss-variants.cjs'),{candidatePageScript,pageScript}=require('../core/rgss-page.cjs'),TP=require('../core/text-paths.cjs');
const ruby=process.env.MEGULIT_RUBY;
const session={port:1234,token:'a'.repeat(32)};
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rgss-candidate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}

test('generation declarations separate XP/VX/Ace Ruby and archive formats without conferring verification',()=>{
 for(const [generation,library,scripts,rubyFamily,archiveVersion]of [[1,'RGSS104E.dll','Data\\Scripts.rxdata','1.8',1],[2,'RGSS202J.dll','Data/Scripts.rvdata','1.8',1],[3,'RGSS301.dll','Data/Scripts.rvdata2','1.9.2',3]]){
  const declared=declaredVariant({library,scripts});assert.equal(declared.generation,generation);assert.equal(declared.ruby,rubyFamily);assert.equal(declared.archiveVersion,archiveVersion);assert.equal(declared.verified,false);assert.ok(Object.isFrozen(declared));
 }
 for(const declaration of [{library:'RGSS301.dll',scripts:'Data/Scripts.rxdata'},{library:'System/RGSS104E.dll',scripts:'Data/Scripts.rxdata'},{library:'RGSS404.dll',scripts:'Data/Scripts.rvdata2'},{library:'RGSS104E.dll',scripts:'../Data/Scripts.rxdata'}])assert.throws(()=>declaredVariant(declaration),/RGSS_VARIANT/);
 for(const generation of [0,2,4,'1'])assert.throws(()=>candidatePageScript({...session,generation}),/CANDIDATE_GENERATION/);
 assert.ok(!pageScript(session).includes('__VARIANT__'));assert.ok(candidatePageScript({...session,generation:3}).startsWith('# encoding: UTF-8\n'));
});

test('candidate RGSSAD v3 splice preserves every unrelated encrypted payload and index name for growth and shrinkage',t=>{
 const dir=temp(t),names=['Data\\Before.rvdata2','Data\\Scripts.rvdata2','Data\\After.rvdata2'];
 for(const position of [0,1,2])for(const replacement of [Buffer.from('x'),Buffer.from('odd replacement payload with more bytes')]){
  const files=Object.fromEntries(names.map((name,i)=>[name,Buffer.from('payload-'+i)])),before=F.rgssadV3(files),source=Buffer.from(before),file=path.join(dir,'source.rgss3a'),copy=path.join(dir,'patched.rgss3a');fs.writeFileSync(file,before);
  const entries=R.list(file),target=entries[position],patched=C.patchArchiveV3(before,target,replacement);fs.writeFileSync(copy,patched);const next=R.list(copy);
  assert.deepEqual(before,source,'input buffer is unchanged');assert.deepEqual(next.map(e=>[e.name,e.key]),entries.map(e=>[e.name,e.key]));
  for(let i=0;i<entries.length;i++){
   assert.deepEqual(R.read(copy,next[i]),i===position?replacement:files[names[i]]);
   if(i!==position)assert.deepEqual(patched.subarray(next[i].offset,next[i].offset+next[i].size),before.subarray(entries[i].offset,entries[i].offset+entries[i].size));
  }
  const fields=new Set();let at=12;for(const name of names){for(let i=0;i<4;i++)fields.add(at+i);if(at===12+names.slice(0,position).reduce((n,s)=>n+16+Buffer.byteLength(s),0))for(let i=4;i<8;i++)fields.add(at+i);at+=16+Buffer.byteLength(name);}
  for(let i=0;i<entries[0].offset;i++)if(!fields.has(i))assert.equal(patched[i],before[i],'untouched index byte '+i);
  assert.throws(()=>C.patchArchiveV3(before,{...target,key:target.key+1},replacement),/PATCH_ENTRY/);
 }
});

test('candidate RGSSAD v3 rejects truncation, index intrusion, overlap, missing terminator and excessive payload',t=>{
 const dir=temp(t),file=path.join(dir,'source.rgss3a'),before=F.rgssadV3({'Data\\Scripts.rvdata2':Buffer.from('script'),'Data\\Other.rvdata2':Buffer.from('other')});fs.writeFileSync(file,before);const entries=R.list(file),key=(Math.imul(before.readUInt32LE(8),9)+3)>>>0;
 const overlap=Buffer.from(before);overlap.writeUInt32LE((entries[0].offset^key)>>>0,12+16+Buffer.byteLength('Data\\Scripts.rvdata2'));
 const intrusion=Buffer.from(before);intrusion.writeUInt32LE((12^key)>>>0,12);
 const missing=Buffer.from(before);const end=12+32+Buffer.byteLength('Data\\Scripts.rvdata2')+Buffer.byteLength('Data\\Other.rvdata2');missing.writeUInt32LE((before.length^key)>>>0,end);missing.writeUInt32LE((9999^key)>>>0,end+12);
 for(const bad of [Buffer.from('bad'),before.subarray(0,25),before.subarray(0,before.length-1),overlap,intrusion,missing])assert.throws(()=>C.patchArchiveV3(bad,entries[0],Buffer.from('x')),/RGSS_ARCHIVE/);
 assert.throws(()=>C.patchArchiveV3(before,entries[0],Buffer.alloc((8<<20)+1)),/PATCH_SCOPE/);
});

function encodedScripts(main='original_main'){
 let symbolSeen=false;const string=(bytes,utf8)=>{bytes=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);const symbol=symbolSeen?Buffer.from([59,0]):Buffer.from([58,6,69]);symbolSeen=true;return Buffer.concat([Buffer.from([73,34]),C.marshalInteger(bytes.length),bytes,Buffer.from([6]),symbol,Buffer.from([utf8?84:70])]);};
 const rows=[[1,'Before','before_source'],[2,'Main',main]].map(([id,name,source])=>Buffer.concat([Buffer.from([91,8,105]),C.marshalInteger(id),string(name,true),string(zlib.deflateSync(Buffer.from(source)),false)]));
 return Buffer.concat([Buffer.from([4,8,91,7]),...rows]);
}
test('Ace script candidate retains encoding ivars and symbol links around the replaced compressed token',()=>{
 const before=encodedScripts(),original=C.scriptTable(before),patched=C.patchMain(before,'# encoding: UTF-8\n# MEGULIT_RGSS_BOOTSTRAP'),next=C.scriptTable(patched),a=original.rows[1].packed,b=next.rows[1].packed;
 assert.deepEqual(patched.subarray(0,b.start),before.subarray(0,a.start));assert.deepEqual(patched.subarray(b.end),before.subarray(a.end));assert.deepEqual(next.rows[0].packed.value,original.rows[0].packed.value);assert.equal(next.rows[1].source.toString(),'# encoding: UTF-8\n# MEGULIT_RGSS_BOOTSTRAP\noriginal_main');
});

function runRuby(input){const result=spawnSync(ruby,['--disable-gems'],{input,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);}
function candidateReplay(generation,setup,checks){
 const stand=fs.readFileSync(path.join(__dirname,'helpers/rgss-standin.rb'),'utf8');
 const producer=candidatePageScript({...session,generation});
 return runRuby(stand+'\n'+setup+'\n'+producer+'\n'+String.raw`
raise 'wrong Ruby installed candidate' if MeguLitRGSS.instance_variable_get(:@installed)
raise 'wrong Ruby reached Win32API' unless $api_calls.empty?
# Function-only synthetic API replay on Ruby 4; this deliberately does not test original VM installation
MeguLitRGSS.install
MeguLitRGSS.instance_variable_set(:@ready,true)
MeguLitRGSS.instance_variable_set(:@generation,1)
def publish(w);MeguLitRGSS.publish(MeguLitRGSS.instance_variable_get(:@windows)[w.object_id]);end
`+checks+String.raw`
puts JSON.generate({:wire=>MeguLitRGSS.instance_variable_get(:@out)})
`);
}
function records(wire){return wire.split('\n').filter(s=>s.startsWith('G ')).map(s=>TP.parseChars(s.replace(/^G \d+ /,'')));}

test('XP candidate function replay excludes inline choices and operates without clear_rect, openness or Graphics dimensions',{skip:!ruby&&'MEGULIT_RUBY missing; original Ruby 1.8 remains unvalidated'},()=>{
 const setup=String.raw`
class Bitmap;undef_method :clear_rect;end
class << Graphics;undef_method :width;undef_method :height;end
class Window;attr_accessor :active;undef_method :openness;undef_method :openness=;end
$game_temp=Struct.new(:choice_start,:choice_max).new(2,2)
`,checks=String.raw`
m=Window_Message.new(10,20,640,160);m.contents.draw_text(0,0,48,32,'本文');m.contents.draw_text(0,32,48,32,'次行')
m.contents.draw_text(8,64,48,32,'東へ');m.contents.draw_text(8,96,48,32,'西へ');publish(m)
raise 'unready source' if MeguLitRGSS.instance_variable_get(:@out).include?("\nS ")
m.active=true;publish(m);publish(m)
raise 'source duplicate or absent' unless MeguLitRGSS.instance_variable_get(:@out).scan(/^S /).size==1
m.contents.clear;$game_temp.choice_max=0;$game_temp.choice_start=99;m.active=false;m.pause=true;m.contents.draw_text(0,0,48,32,'次頁');publish(m)
$game_temp.choice_max=1;$game_temp.choice_start=3;m.contents.draw_text(8,96,48,32,'混入');publish(m)
raise 'changed choice state promoted stale body' unless MeguLitRGSS.instance_variable_get(:@out).scan(/^S /).size==2
$game_temp.choice_max=2;$game_temp.choice_start=4;m.contents.clear;m.contents.draw_text(0,0,48,32,'拒否');publish(m)
`;
 const rows=records(candidateReplay(1,setup,checks).wire);assert.ok(rows.every(Boolean));const body=rows.find(r=>r.text==='本文\n次行');assert.ok(body);assert.equal(body.sw,640);assert.equal(body.sh,480);assert.deepEqual(body.rects[0],[26,40,24,24]);assert.ok(rows.some(r=>r.text==='次頁'));assert.ok(!rows.some(r=>/東|西|拒否|混入/.test(r.text)));
});

test('Ace candidate function replay uses live padding and only its owned active choice list completes a body',{skip:!ruby&&'MEGULIT_RUBY missing; original Ruby 1.9.2 remains unvalidated'},()=>{
 const setup=String.raw`
class Window;attr_accessor :active,:padding;end
Object.send(:remove_const,:Window_Message)
class Window_Message < Window_Base;end
class Window_ChoiceList < Window_Command;end
`,checks=String.raw`
m=Window_Message.new(10,20,544,160);m.padding=12;m.contents.draw_text(0,0,48,32,'本文');publish(m)
choice=Window_ChoiceList.new(['はい','いいえ']);choice.padding=12;choice.active=true
m.instance_variable_set(:@choice_window,choice);choice.instance_variable_set(:@message_window,Object.new);publish(m)
raise 'foreign choice source' if MeguLitRGSS.instance_variable_get(:@out).include?("\nS ")
choice.instance_variable_set(:@message_window,m);publish(m);publish(m)
raise 'owned choice source missing' unless MeguLitRGSS.instance_variable_get(:@out).scan(/^S /).size==1
choice.active=false;m.contents.clear;m.padding=20;m.contents.draw_text(0,0,48,32,'次頁');m.pause=true;publish(m)
m.contents.clear;m.padding=nil;m.contents.draw_text(0,0,48,32,'拒否');publish(m)
`;
 const rows=records(candidateReplay(3,setup,checks).wire);assert.ok(rows.every(Boolean));assert.deepEqual(rows.find(r=>r.text==='本文').rects[0],[22,36,24,24]);assert.deepEqual(rows.find(r=>r.text==='次頁').rects[0],[30,44,24,24]);assert.ok(rows.every(r=>!r.role));assert.ok(!rows.some(r=>/はい|いいえ|拒否/.test(r.text)));
});

test('Ruby Marshal consumer reads patched Ace candidate without losing packed string encoding or non-Main bytes',{skip:!ruby&&'MEGULIT_RUBY missing; no modern Ruby data replay'},()=>{
 const before=encodedScripts(),after=C.patchMain(before,'# encoding: UTF-8\n# MEGULIT_RGSS_BOOTSTRAP');
 const result=runRuby(`require 'json'\nrequire 'zlib'\na=Marshal.load('${before.toString('base64')}'.unpack('m')[0])\nb=Marshal.load('${after.toString('base64')}'.unpack('m')[0])\nraise 'other source changed' unless a[0]==b[0]\nputs JSON.generate({:encoding=>b[1][2].encoding.name,:name_encoding=>b[1][1].encoding.name,:source=>Zlib::Inflate.inflate(b[1][2])})\n`);
 assert.equal(result.encoding,'US-ASCII');assert.equal(result.name_encoding,'UTF-8');assert.ok(result.source.endsWith('\noriginal_main'));
});

test('XP/Ace candidate transcripts reach the production source consumer for two pages without launching a game or native helper',{skip:!ruby&&'MEGULIT_RUBY missing; no function-only transcript'},t=>{
 const {HookNative}=require('../core/hook-native.cjs'),D=require('../core/text-paths-rgss.cjs'),P=require('../core/profiles/index.cjs'),L=require('../core/text-paths-launch.cjs'),dir=temp(t);
 for(const generation of [1,3]){
  const setup=generation===1?String.raw`
class Bitmap;undef_method :clear_rect;end
class << Graphics;undef_method :width;undef_method :height;end
class Window;attr_accessor :active;undef_method :openness;undef_method :openness=;end
$game_temp=Struct.new(:choice_start,:choice_max).new(99,0)
`:String.raw`
class Window;attr_accessor :active,:padding;end
Object.send(:remove_const,:Window_Message)
class Window_Message < Window_Base;end
`;
  const transcript=candidateReplay(generation,setup,String.raw`
m=Window_Message.new(0,260,544,156);m.padding=12 if m.respond_to?(:padding=);m.pause=true
m.contents.draw_text(0,0,48,32,'本文');publish(m)
m.contents.clear;m.contents.draw_text(0,0,48,32,'次頁');publish(m)
`).wire;
  const events=[],hook=new HookNative({native:dir,hook:dir,logs:dir},m=>events.push(m),()=>{throw Error('native launch forbidden in candidate replay');}),session=new D.RgssTextPath();hook.trace=()=>{};t.after(()=>{session.stop();hook.stop();});
  assert.equal(P.profileFor({engine:'rgss'}).draw.roles,false);hook.profile=P.profileFor({engine:'rgss',official:{draw:{roles:true}}});hook.target={pid:42,started:'1234567890123'};L.attach({path:'rgss',session},hook);session.pid=42;session.birth='1234567890123';session.generation=1;
  for(const line of transcript.split('\n').filter(Boolean))session.report(line,42);
  assert.equal(hook.state.hookSource,'次頁');assert.equal(hook.state.hookSourceOrigin,'rgss');assert.equal(hook.state.hookSequence,2);assert.ok(events.some(e=>e.type==='hookCharRects'&&e.engine==='rgss'));assert.equal(P.profileFor({engine:'rgss'}).draw.roles,false);
 }
});

test('candidate archive-to-Main data chain preserves original Main execution when modern Ruby refuses candidate installation',{skip:!ruby&&'MEGULIT_RUBY missing; no synthetic archive/Main replay'},t=>{
 const dir=temp(t),stand=fs.readFileSync(path.join(__dirname,'helpers/rgss-standin.rb'),'utf8'),main='$original_main_ran=true',packed=zlib.deflateSync(Buffer.from(main));
 const bare=bytes=>Buffer.concat([Buffer.from([34]),C.marshalInteger(bytes.length),bytes]);
 const xp=Buffer.concat([Buffer.from([4,8,91,6,91,8,105,6]),bare(Buffer.from('Main')),bare(packed)]);
 for(const generation of [1,3]){
  const scripts=generation===1?xp:encodedScripts(main),name=generation===1?'Data\\Scripts.rxdata':'Data\\Scripts.rvdata2',file=path.join(dir,'source-'+generation),copy=path.join(dir,'copy-'+generation),archive=(generation===1?F.rgssadV1:F.rgssadV3)({[name]:scripts,'Graphics\\untouched.png':Buffer.from('untouched')});fs.writeFileSync(file,archive);
  const entry=R.list(file)[0],boot=candidatePageScript({...session,generation}),next=C.patchMain(scripts,boot),result=(generation===1?C.patchArchiveV1:C.patchArchiveV3)(archive,entry,next);fs.writeFileSync(copy,result);const rows=R.list(copy),restored=C.scriptTable(R.read(copy,rows[0]));assert.equal(R.read(copy,rows[1]).toString(),'untouched');
  const source=restored.rows.find(row=>row.name==='Main').source;assert.ok(source.subarray(-Buffer.byteLength(main)).equals(Buffer.from(main)));
  const execution=runRuby(stand+`\neval('${source.toString('base64')}'.unpack('m')[0])\nputs JSON.generate({:main=>$original_main_ran,:installed=>!!MeguLitRGSS.instance_variable_get(:@installed),:calls=>$api_calls.size})\n`);assert.deepEqual(execution,{main:true,installed:false,calls:0});
 }
});
