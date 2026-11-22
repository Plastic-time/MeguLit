// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const O=require('../core/owner-tests.cjs'),D=require('../core/text-paths-rgss.cjs'),L=require('../core/text-paths-launch.cjs'),C=require('../core/rgss-scripts.cjs'),R=require('../services/original-engines/rgss.cjs'),P=require('../core/profiles/index.cjs'),LP=require('../services/launch-path.cjs'),TP=require('../core/text-paths.cjs');
const receipts=process.env.MEGULIT_RGSS_PRIVATE_RECEIPTS,hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,key){
 const receipt=JSON.parse(fs.readFileSync(path.join(receipts,key+'-jp-20261122-receipt.json'),'utf8')),exe=fs.realpathSync(receipt.ownerExecutable),dir=path.dirname(exe),root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rgss-private-')),saved={};
 for(const name of ['data/config','cache','logs'])fs.mkdirSync(path.join(root,name),{recursive:true});fs.writeFileSync(path.join(root,'data/config/library.json'),JSON.stringify({runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false}));fs.writeFileSync(path.join(root,'data/config/online.json'),'{"relayUrl":""}');
 for(const [name,value]of Object.entries({MEGULIT_ROOT:root,MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_OWNER_TESTS:'1',MEGULIT_RELAY_BASE:'off'})){saved[name]=process.env[name];process.env[name]=value;}
 const library=receipt.engineProof.gameINIValues.Library.replace(/\\/g,'/'),data=key.includes('-xp-')?'Game.rgssad':fs.existsSync(path.join(dir,'Game.rgss3a'))?'Game.rgss3a':'Data/Scripts.rvdata2',names=['Game.ini',library,data],entry={id:key,engine:'rgss',exe,sha256:hash(fs.readFileSync(exe)),files:names.map(name=>({path:name,bytes:fs.statSync(path.join(dir,name)).size,sha256:hash(fs.readFileSync(path.join(dir,name)))})),draw:{roles:true,embed:false},capabilities:['roles']};
 fs.writeFileSync(path.join(root,'data/config/owner-tests.json'),JSON.stringify({schema:'megulit.owner-tests',version:1,root,entries:[entry]}));let token,prepared;
 t.after(()=>{prepared?.session.stop();O.revoke(token);for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});});
 return {root,exe,dir,entry,data,receipt,setToken:x=>token=x,setPrepared:x=>prepared=x};
}
test('nonstandard Main requires its exact source hash and never broadens the default Main matcher',()=>{
 const z=require('node:zlib'),str=b=>Buffer.concat([Buffer.from([34]),C.marshalInteger(b.length),b]),source=Buffer.from('original_nonstandard_main'),bytes=Buffer.concat([Buffer.from([4,8,91,6,91,8,105,6]),str(Buffer.from('Main-Extend')),str(z.deflateSync(source))]);
 assert.throws(()=>C.patchMain(bytes,'observer'),/MAIN_NOT_FINAL/);assert.throws(()=>C.patchMain(bytes,'observer',{name:'Main-Extend'}),/EXACT_HASH/);assert.throws(()=>C.patchMain(bytes,'observer',{name:'Main-Extend',sourceSha256:'0'.repeat(64)}),/SOURCE_CHANGED/);assert.equal(C.scriptTable(C.patchMain(bytes,'observer',{name:'Main-Extend',sourceSha256:hash(source)})).rows[0].source.toString(),'observer\noriginal_nonstandard_main');
});

for(const [key,generation]of [['rgss-xp-egomaniacs',1],['rgss-ace-soprano',3]])test(key+' complete private source prepares a normal copy with exact scripts and opaque identity',{skip:!receipts&&'MEGULIT_RGSS_PRIVATE_RECEIPTS not set; complete source unavailable'},async t=>{
 const f=fixture(t,key);assert.throws(()=>D.plan(f.exe),/PRIVATE_GRANT_REQUIRED/);assert.equal(await L.prepare({root:f.root,exe:f.exe,profile:{engine:'rgss'},enabled:false}),null);assert.equal(P.profileFor({engine:'rgss'}).draw.roles,false);
 const token=await O.resolve(f.root,{exe:f.exe,engine:'rgss'});f.setToken(token);assert.ok(token);const source=D.plan(f.exe,{ownerTestGrant:token});assert.equal(source.generation,generation);const before=C.scriptTable(source.original),prepared=await require('./helpers/rgss-launch-replay.cjs').launchReplay({root:f.root,exe:f.exe,L});f.setPrepared(prepared);assert.equal(prepared?.path,'rgss');assert.equal(prepared.ownerTestGrant,token);assert.equal(O.identity(token,prepared.exe),f.exe);
 const copyData=path.join(prepared.cwd,f.data),originalData=fs.readFileSync(source.archive),afterData=fs.readFileSync(copyData),next=generation===1?C.scriptTable(R.read(copyData,R.list(copyData).find(e=>e.name==='Data/Scripts.rxdata'))):C.scriptTable(afterData);
 assert.equal(next.rows.length,before.rows.length);let modified=0;for(let i=0;i<before.rows.length;i++){assert.equal(next.rows[i].name,before.rows[i].name);if(next.rows[i].source.equals(before.rows[i].source))continue;modified++;assert.ok(next.rows[i].source.subarray(-before.rows[i].source.length).equals(before.rows[i].source));assert.match(next.rows[i].source.toString(),new RegExp('@variant='+generation+';'));}assert.equal(modified,1);
 if(generation===1){const a=R.list(source.archive),b=R.list(copyData);assert.deepEqual(b.map(e=>e.name),a.map(e=>e.name));for(let i=0;i<a.length;i++)if(a[i].name!=='Data/Scripts.rxdata')assert.deepEqual(afterData.subarray(b[i].offset,b[i].offset+b[i].size),originalData.subarray(a[i].offset,a[i].offset+a[i].size),a[i].name);}
 const files=f.receipt.deployedFiles.filter(item=>path.resolve(item.path).startsWith(path.resolve(f.dir)+path.sep));for(const item of files){const relative=path.relative(f.dir,item.path),copied=path.join(prepared.cwd,relative),st=fs.lstatSync(copied);assert.equal(st.isSymbolicLink(),false);assert.equal(st.nlink,1);assert.equal(hash(fs.readFileSync(item.path)),item.sha256,'original '+relative);if(relative.replace(/\\/g,'/')!==f.data)assert.equal(hash(fs.readFileSync(copied)),item.sha256,'copy '+relative);}
 const save=path.join(prepared.cwd,'megulit-test-progress.dat');fs.writeFileSync(save,'private progress');assert.equal(fs.existsSync(path.join(f.dir,'megulit-test-progress.dat')),false);
 const reused=D.makeShadow({source,shadowRoot:path.join(f.root,'data/rgss-shadow'),port:prepared.session.port,token:prepared.session.token});assert.equal(reused.reused,true);assert.equal(fs.readFileSync(save,'utf8'),'private progress');
 // Rewriting the already registered copy invalidates its stamp, even if the same script bytes result
 assert.equal(O.identity(token,prepared.exe),null);assert.equal(prepared.session.stopped,true);
});

test('private source and page clearing use the bound grant, then preserve a later external source',{skip:!receipts&&'MEGULIT_RGSS_PRIVATE_RECEIPTS not set; complete source unavailable'},async t=>{
 const f=fixture(t,'rgss-ace-soprano'),token=await O.resolve(f.root,{exe:f.exe,engine:'rgss'});f.setToken(token);const prepared=await L.prepare({root:f.root,exe:f.exe,profile:{engine:'rgss'},enabled:false,ownerTestGrant:token});f.setPrepared(prepared);assert.ok(prepared);
 const birth='639309000000000001',pid=process.pid;assert.equal(prepared.observeProcess({pid,started:birth}),true);assert.equal(LP.canonical(prepared.exe,{root:f.root,pid,birth}),f.exe);
 const events=[],{HookNative}=require('../core/hook-native.cjs'),hook=new HookNative({native:f.root,hook:f.root,logs:path.join(f.root,'logs')},m=>events.push(m),()=>{throw Error('native spawn forbidden in replay');});hook.trace=()=>{};hook.ensureEngineDraw=()=>({setProfile(){},stop(){}});t.after(()=>hook.stop());hook.target={pid,started:birth};hook.wanted=true;hook.profile=P.profileFor({engine:'rgss'});hook.profileInput={exe:f.exe};L.attach(prepared,hook);const s=prepared.session;s.pid=pid;s.birth=birth;s.generation=1;
 const body=(line,text)=>TP.formatChars({engine:'rgss',line,hidden:false,sw:544,sh:416,rects:[...text].map((_,i)=>[12+i*24,280,24,24]),text});
 s.report('G 1 '+body(1,'正文'),pid);s.report('S 1 1 '+Buffer.from('正文').toString('base64'),pid);assert.equal(hook.state.hookSource,undefined,'Reader has not adopted this grant yet');hook.setOwnerTestGrant(token);s.report('G 1 '+body(1,'正文'),pid);s.report('S 1 1 '+Buffer.from('正文').toString('base64'),pid);assert.equal(hook.state.hookSource,'正文');s.report('G 1 '+body(1,''),pid);assert.equal(hook.state.hookSource,'');assert.equal(hook.state.hookSourceOrigin,'leave');
 s.report('G 1 '+body(1,'正文'),pid);s.report('S 1 1 '+Buffer.from('正文').toString('base64'),pid);assert.equal(hook.state.hookSource,'正文','a page returning from history can be sourced again');s.report('G 1 '+body(1,''),pid);
 s.report('G 1 '+body(2,'次頁'),pid);s.report('S 1 2 '+Buffer.from('次頁').toString('base64'),pid);assert.equal(hook.state.hookSource,'次頁');hook.emitSource('外部来源','other','luna',8);const external=hook.state.hookSource;s.report('G 1 '+body(2,''),pid);assert.equal(hook.state.hookSource,external);assert.ok(events.some(e=>e.hookMessage==='RGSS 原文已清空'));
 O.revoke(token);assert.equal(s.stopped,true);assert.throws(()=>D.makeShadow({source:D.plan(f.exe,{ownerTestGrant:token}),shadowRoot:path.join(f.root,'data/rgss-shadow'),port:1234,token:'a'.repeat(32)}),/PRIVATE_GRANT_REQUIRED/);
});

test('Lumina dynamic loader and modified startup files stay closed despite a real private grant',{skip:!receipts&&'MEGULIT_RGSS_PRIVATE_RECEIPTS not set; complete source unavailable'},async t=>{
 const f=fixture(t,'rgss-ace-lumina'); // This receipt has an archive, not the Soprano loose-script layout
 const token=await O.resolve(f.root,{exe:f.exe,engine:'rgss'});f.setToken(token);assert.ok(token);assert.throws(()=>D.plan(f.exe,{ownerTestGrant:token}),/PRIVATE_EXE_NOT_VERIFIED/);assert.equal(await L.prepare({root:f.root,exe:f.exe,profile:{engine:'rgss'},enabled:false,ownerTestGrant:token}),null);
});

test('Egomaniacs message-state API replay excludes ruby, waits for text_end and retires history',{skip:!process.env.MEGULIT_RUBY&&'MEGULIT_RUBY not set; no modern Ruby API replay'},()=>{
 const stand=fs.readFileSync(path.join(__dirname,'helpers/rgss-standin.rb'),'utf8'),boot=require('../core/rgss-page.cjs').candidatePageScript({generation:1,messageMode:'egomaniacs',port:1234,token:'a'.repeat(32)}),setup=String.raw`
class Window_Message
 def text_end;@text='';@contents_showed=true;:ended;end
 def rubi_draw;contents.draw_text(0,-12,96,20,'ほんぶん');:ruby_return;end
end
$game_temp=Struct.new(:choice_start,:choice_max).new(99,0)
`,checks=String.raw`
raise 'wrong Ruby installed' if MeguLitRGSS.instance_variable_get(:@installed)
raise 'wrong Ruby called native' unless $api_calls.empty?
MeguLitRGSS.install;MeguLitRGSS.instance_variable_set(:@ready,true);MeguLitRGSS.instance_variable_set(:@generation,1)
m=Window_Message.new(0,260,544,160);m.instance_variable_set(:@text,'unfinished');m.instance_variable_set(:@contents_showed,false)
history=Window.new(0,0,544,160);history.visible=false;m.instance_variable_set(:@h_window,history)
m.contents.draw_text(0,0,48,32,'本文');raise 'ruby return lost' unless m.rubi_draw==:ruby_return
c=MeguLitRGSS.instance_variable_get(:@windows)[m.object_id];MeguLitRGSS.publish(c)
raise 'premature source' if MeguLitRGSS.instance_variable_get(:@out).include?("\nS ")
raise 'text_end return changed' unless m.text_end==:ended;MeguLitRGSS.publish(c)
raise 'source absent' unless MeguLitRGSS.instance_variable_get(:@out).scan(/^S /).size==1
history.visible=true;MeguLitRGSS.publish(c)
puts JSON.generate({:wire=>MeguLitRGSS.instance_variable_get(:@out),:draws=>$draws.size})
`;
 const result=require('node:child_process').spawnSync(process.env.MEGULIT_RUBY,['--disable-gems'],{input:stand+'\n'+setup+'\n'+boot+'\n'+checks,encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout),rows=out.wire.split('\n').filter(s=>s.startsWith('G ')).map(s=>TP.parseChars(s.replace(/^G \d+ /,'')));assert.equal(out.draws,2);assert.ok(rows.some(r=>r.text==='本文'));assert.ok(rows.some(r=>r.text===''));assert.ok(!rows.some(r=>r.text.includes('ほんぶん')));
});
