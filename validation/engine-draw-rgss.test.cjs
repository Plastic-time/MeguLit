// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net'),{spawnSync}=require('node:child_process');
const C=require('../core/rgss-scripts.cjs'),F=require('./helpers/engine-fixtures-rgss.cjs'),R=require('../services/original-engines/rgss.cjs'),P=require('../core/profiles/index.cjs'),TP=require('../core/text-paths.cjs'),D=require('../core/text-paths-rgss.cjs'),{pageScript}=require('../core/rgss-page.cjs'),z=require('node:zlib');
const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-rgss-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function scriptsFixture(rows){
 const encode=v=>{
  if(Array.isArray(v))return Buffer.concat([Buffer.from('['),C.marshalInteger(v.length),...v.map(encode)]);
  if(typeof v==='number')return Buffer.concat([Buffer.from('i'),C.marshalInteger(v)]);
  const b=Buffer.isBuffer(v)?v:Buffer.from(v);return Buffer.concat([Buffer.from('"'),C.marshalInteger(b.length),b]);
 };
 return Buffer.concat([Buffer.from([4,8]),encode(rows)]);
}
const table=()=>scriptsFixture([[1,'Window_Message',z.deflateSync(Buffer.from('class Window_Message; end'))],[2,'Main',z.deflateSync(Buffer.from('original_main'))]]);

test('script codec keeps binary strings and patches only Main, retaining every other source and trailing Marshal metadata',()=>{
 const before=table(),original=C.scriptTable(before);assert.equal(original.rows.length,2);assert.equal(original.rows[1].source.toString(),'original_main');
 const patched=C.patchMain(before,'# MEGULIT_RGSS_BOOTSTRAP\nmodule Observer;end'),after=C.scriptTable(patched);
 assert.deepEqual(after.rows[0].packed.value,original.rows[0].packed.value);assert.equal(after.rows[1].source.toString(),'# MEGULIT_RGSS_BOOTSTRAP\nmodule Observer;end\noriginal_main');
 assert.throws(()=>C.patchMain(patched,'again'),/ALREADY_PATCHED/);
 const bad=scriptsFixture([[1,'Main',z.deflateSync(Buffer.from('main'))],[2,'After Main',z.deflateSync(Buffer.from('side_effect'))]]);assert.throws(()=>C.patchMain(bad,'observer'),/MAIN_NOT_FINAL/);
 const tail=scriptsFixture([[1,'Main',z.deflateSync(Buffer.from('main'))],[2,'End',z.deflateSync(Buffer.from('exit'))]]);assert.equal(C.scriptTable(C.patchMain(tail,'observer')).rows[1].source.toString(),'exit');
 for(const b of [before.subarray(0,before.length-1),Buffer.from([4,8,111]),Buffer.from([4,8,91,127]),Buffer.concat([before,Buffer.from([0])])])assert.throws(()=>C.scriptTable(b));
});

test('RGSSAD v1 script replacement preserves later payload keys, names and all non-script bytes after reindexing',t=>{
 const dir=tmp(t),file=path.join(dir,'Game.rgss2a'),data=table();fs.writeFileSync(file,F.rgssadV1({'Data\\Before.rvdata':Buffer.from('before'),'Data\\Scripts.rvdata':data,'Data\\After.rvdata':Buffer.from('after payload')}));
 const list=R.list(file),entry=list[1],patched=C.patchArchiveV1(fs.readFileSync(file),entry,C.patchMain(data,'observer'));const copy=path.join(dir,'copy.rgss2a');fs.writeFileSync(copy,patched);
 const next=R.list(copy);assert.deepEqual(next.map(e=>e.name),list.map(e=>e.name));assert.deepEqual(R.read(copy,next[0]),R.read(file,list[0]));assert.deepEqual(R.read(copy,next[2]),R.read(file,list[2]));
 assert.equal(C.scriptTable(R.read(copy,next[1])).rows[1].source.toString(),'observer\noriginal_main');assert.throws(()=>C.patchArchiveV1(Buffer.from('not archive'),entry,data),/PATCH_SCOPE/);
});

test('RGSS aliases and archive fingerprints stay separate from MV/MZ and consume the complete default-off contract',()=>{
 for(const name of ['RGSS','RGSS1','RGSS2','RGSS3','RGSS1-3','RPG Maker XP','RPG Maker VX','RPG Maker VX/XP','RPG Maker VX Ace / VX / XP']){
  const p=P.profileFor({engine:name});assert.equal(p.engine,'rgss',name);assert.equal(p.layers,'core+engine');assert.deepEqual(p.draw,P.profileFor({}).draw,name);}
 for(const name of ['RPG Maker MV/MZ','RPG Maker MV','RPG Maker MZ','rpgm'])assert.equal(P.engineId(name),'rpgmaker');
 const fp=require('../services/engine-fingerprint.cjs'),probe=require('../tools/diff-maker/probe.cjs');
 for(const name of ['Game.rgssad','Game.rgss2a','Game.rgss3a']){assert.equal(fp.archiveInfo(name,'5247535341440001').engine,'rgss');assert.equal(probe.detectEngine({}, {hookEvents:'',extra:''},[name]).engine,'rgss');}
});

test('launch path stays inert without explicit roles, rejects unverified DLLs, and guards traversal paths',async t=>{
 const dir=tmp(t),exe=path.join(dir,'Game.exe');fs.writeFileSync(exe,'MZ');fs.writeFileSync(path.join(dir,'Game.ini'),'[Game]\nLibrary=RGSS202J.dll\nScripts=Data\\Scripts.rvdata\n');fs.writeFileSync(path.join(dir,'RGSS202J.dll'),'unverified');
 const L=require('../core/text-paths-launch.cjs');for(const cfg of [{}, {roles:'true'}, {roles:false,embed:true}])assert.equal(await L.prepare({root:dir,exe,enabled:true,profile:P.profileFor({engine:'rgss',official:{draw:cfg}})}),null);
 assert.equal(fs.existsSync(path.join(dir,'data','rgss-shadow')),false);assert.throws(()=>D.plan(exe),/DLL_NOT_VERIFIED/);
 fs.writeFileSync(path.join(dir,'Game.ini'),'Library=../RGSS202J.dll\nScripts=Data\\Scripts.rvdata');assert.throws(()=>D.plan(exe),/UNSAFE_INI_PATH/);
});

test('live transport validates token, PID, generation and protocol; revocation clears the exact dialogue and UI groups',async t=>{
 const out=[],session=new D.RgssTextPath({owner:()=>42,onChars:x=>out.push(TP.parseChars(x))});t.after(()=>session.stop());session.drawConfig({roles:true});await session.listen();
 const client=net.connect(session.port,'127.0.0.1');t.after(()=>client.destroy());let pending='';const cfg=new Promise(resolve=>client.on('data',b=>{pending+=b.toString();if(pending.includes('\n'))resolve(pending);}));
 await new Promise(resolve=>client.once('connect',resolve));client.write('HELLO '+session.token+' 42\n');assert.match(await cfg,/^CFG 1 1/);
 const body=TP.formatChars({engine:'rgss',line:1,hidden:false,sw:544,sh:416,rects:[[16,20,24,24]],text:'字'}),ui=TP.formatChars({engine:'rgss',line:2,hidden:false,sw:544,sh:416,rects:[],text:'はい',role:'choice',id:'W7:0',box:[20,30,100,28],sel:true});
 client.write('G 99 '+body+'\nG 1 '+body+'\nG 1 '+ui+'\n');await new Promise(resolve=>setTimeout(resolve,30));assert.equal(out.length,2);
 session.drawConfig({roles:false});assert.equal(out.length,4);assert.deepEqual(out.slice(2).map(x=>[x.line,x.text,x.id]),[[1,'',undefined],[2,'','W7:']]);
 client.write('G 1 '+body+'\n');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(out.length,4);
 session.drawConfig({roles:true});client.write('G 1 '+body+'\nG '+session.generation+' '+body.replace('hidden=0','hidden=1')+'\n');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(out.length,4);
 session.owner=()=>43;client.write('G '+session.generation+' '+body+'\n');await new Promise(resolve=>setTimeout(resolve,20));assert.equal(out.length,4);
});

const ruby=process.env.MEGULIT_RUBY;
test('launch grant loads the same per-exe local layer as the reader and does not leak to another exe',t=>{
 const root=tmp(t),exe=path.join(root,'Game.exe'),other=path.join(root,'Other.exe');fs.writeFileSync(exe,'one game');fs.writeFileSync(other,'another game');
 const auto=require('../core/auto-profile.cjs'),input={root,exe,profile:{engine:'RPG Maker VX/XP'},title:'Synthetic VX'};
 assert.equal(D.launchProfile(input).draw.roles,false);auto.store(root,digest(fs.readFileSync(exe)),{schema:1,source:'calibration',settings:{draw:{roles:true}}});
 assert.equal(D.launchProfile(input).draw.roles,true);assert.equal(D.launchProfile({...input,exe:other}).draw.roles,false);
 auto.store(root,digest(fs.readFileSync(exe)),{schema:1,source:'gate',settings:{draw:{roles:false}}});assert.equal(D.launchProfile(input).draw.roles,false);
});

test('watching the actual game PID closes the listener when it exits, including locale retry ownership',async t=>{
 const s=new D.RgssTextPath();t.after(()=>s.stop());await s.listen();let live=true;s.watch(45,{alive:pid=>{assert.equal(pid,45);return live;},every:5});live=false;
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(s.stopped,true);assert.equal(s.server.listening,false);
});

test('paused message sources require a current body, bound owner and generation, and reach only the attached reader',async t=>{
 const s=new D.RgssTextPath(),calls=[],hook={state:{},gamePid:()=>42,charRects:()=>{},emitSource(...a){calls.push(a);this.state={hookSequence:(this.state.hookSequence||0)+1,hookSourceOrigin:'rgss',hookSourceLine:a[3]};},attachTextPath(p){this.textPath=p;p.drawConfig({roles:true});}};t.after(()=>s.stop());
 require('../core/text-paths-launch.cjs').attach({path:'rgss',session:s},hook);await s.listen();const client=net.connect(s.port,'127.0.0.1');t.after(()=>client.destroy());
 await new Promise(resolve=>client.once('connect',resolve));client.write('HELLO '+s.token+' 42\n');await new Promise(resolve=>setTimeout(resolve,20));
 const body=TP.formatChars({engine:'rgss',line:11,hidden:false,sw:544,sh:416,rects:[[16,20,24,24],[40,20,24,24]],text:'本文'}),send=line=>s.report(line,42);
 send('S '+s.generation+' 11');assert.equal(calls.length,0,'no source without rendered body');send('G '+s.generation+' '+body);send('S '+s.generation+' 11');send('S '+s.generation+' 11');assert.deepEqual(calls,[['本文','rgss','rgss',11]]);
 s.drawConfig({roles:false});send('S '+s.generation+' 11');assert.equal(calls.length,1);s.drawConfig({roles:true});send('G '+s.generation+' '+body);hook.textPath=null;send('S '+s.generation+' 11');assert.equal(calls.length,1,'replaced reader refuses stale callback');
});

test('Ruby pauses publish one source signal per visible message and never for selectable UI',{skip:!ruby&&'MEGULIT_RUBY not set; no Ruby replay'},()=>{
 const stand=fs.readFileSync(path.join(__dirname,'helpers','rgss-standin.rb'),'utf8'),script=pageScript({port:1234,token:'a'.repeat(32)}),checks=String.raw`
$control << "CFG 1 1\n";m=Window_Message.new(0,0,300,100);m.contents.draw_text(0,0,48,32,'本文');frames(4)
raise 'unpaused source' if $wire.join.include?("\nS ")
m.pause=true;menu=Window_Command.new(['菜单']);menu.pause=true;frames(6)
raise 'paused source missing or duplicate' unless $wire.join.scan(/^S /).size==1
m.contents.clear;m.contents.draw_text(0,0,48,32,'次頁');frames(4)
raise 'next page missing' unless $wire.join.scan(/^S /).size==2
puts JSON.generate({:wire=>$wire.join})
`;
 const r=spawnSync(ruby,['--disable-gems'],{input:stand+'\n'+script+'\n'+checks,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const lines=JSON.parse(r.stdout).wire.split('\n'),body=new Map(),sources=[];
 for(const line of lines){if(/^G /.test(line)){const rec=TP.parseChars(line.replace(/^G \d+ /,''));if(rec&&!rec.role)body.set(rec.line,rec.text);}else if(/^S /.test(line))sources.push(body.get(Number(line.split(' ')[2])));}
 assert.deepEqual(sources,['本文','次頁']);
});

test('production HookNative receives the paused RGSS source and its following page without starting a native helper',t=>{
 const dir=tmp(t),events=[],{HookNative}=require('../core/hook-native.cjs'),h=new HookNative({native:dir,hook:dir,logs:dir},m=>events.push(m),()=>{throw Error('native spawn forbidden in replay');}),s=new D.RgssTextPath();h.trace=()=>{};t.after(()=>{s.stop();h.stop();});
 h.profile=P.profileFor({engine:'rgss',official:{draw:{roles:true}}});require('../core/text-paths-launch.cjs').attach({path:'rgss',session:s},h);h.target={pid:42,started:'1234567890123'};s.pid=42;s.generation=1;
 for(const [line,text] of [[1,'本文です'],[2,'次の文章です']]){const body=TP.formatChars({engine:'rgss',line,hidden:false,sw:544,sh:416,rects:[...text].map((_,i)=>[16+i*24,280,24,24]),text});s.report('G 1 '+body,42);s.report('S 1 '+line,42);assert.equal(h.state.hookSource,text);assert.equal(h.state.hookSourceEngine,'rgss');assert.equal(h.state.hookSourceLine,line);}
 const count=h.state.hookSequence;h.wanted=false;s.report('S 1 2',42);assert.equal(h.state.hookSequence,count);assert.ok(events.some(e=>e.type==='hookCharRects'&&e.engine==='rgss'));
});

test('Ruby geometry replay keeps whitespace, prefix-based squeezing, viewport scroll, partial clears and new contents isolated',{skip:!ruby&&'MEGULIT_RUBY not set; no Ruby replay'},()=>{
 const stand=fs.readFileSync(path.join(__dirname,'helpers','rgss-standin.rb'),'utf8'),script=pageScript({port:1234,token:'a'.repeat(32)});
 const checks=String.raw`
$control << "CFG 1 1\n";m=Window_Message.new(10,20,300,160);m.ox=4;m.oy=8
v=Object.new;def v.rect;Rect.new(20,30,544,416);end;def v.ox;2;end;def v.oy;3;end;def v.visible;true;end;def v.disposed?;false;end;m.viewport=v
m.contents.draw_text(0,0,60,32,'AB CD');frames(3)
m.contents.clear_rect(Rect.new(36,0,12,32));frames(3)
m.contents=Bitmap.new(268,128);m.contents.draw_text(0,0,24,32,'新');frames(3)
$control << "CFG 2 0\n";frames(3);during=Window_Message.new(0,0,200,80);during.contents.draw_text(0,0,24,32,'禁')
$control << "CFG 3 1\n";frames(3);during.contents.clear;during.contents.draw_text(0,0,24,32,'復');frames(3)
12.times{|i|m.contents.clear;m.contents.draw_text(0,0,48,32,'頁'+i.to_s);frames(3)}
puts JSON.generate({:wire=>$wire.join})
`;
 const r=spawnSync(ruby,['--disable-gems'],{input:stand+'\n'+script+'\n'+checks,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);
 const rows=JSON.parse(r.stdout).wire.split('\n').filter(x=>/^G /.test(x)).map(x=>TP.parseChars(x.replace(/^G \d+ /,'')));assert.ok(rows.every(Boolean));
 const first=rows.find(x=>x.text==='AB CD');assert.ok(first);assert.deepEqual(first.rects[0],[40,59,12,24]);assert.equal(first.rects.length,5);assert.ok(rows.some(x=>x.text==='AB D'));assert.ok(rows.some(x=>x.text==='新'));assert.ok(rows.some(x=>x.text==='復'));assert.ok(!rows.some(x=>/禁|新.*AB|復.*禁/.test(x.text)));
 for(let i=0;i<12;i++)assert.ok(rows.some(x=>x.text==='頁'+i),'complete page '+i);
});

test('Ruby nonblocking transport reassembles partial sends and checks completion without waiting in Graphics.update',{skip:!ruby&&'MEGULIT_RUBY not set; no Ruby replay'},()=>{
 const stand=fs.readFileSync(path.join(__dirname,'helpers','rgss-standin.rb'),'utf8'),script=pageScript({port:1234,token:'a'.repeat(32)}),checks=String.raw`
$connecting=true;$send_limit=37;$control << "CFG 1 1\n";m=Window_Message.new(0,0,300,100);m.contents.draw_text(0,0,48,32,'通信');frames(120)
raise 'select not used' unless $api_calls.any?{|c|c[0]=='select'}
raise 'signed FIONBIO lost' unless $api_calls.any?{|c|c[0]=='ioctlsocket' && c[1][1]==-2147195266}
puts JSON.generate({:wire=>$wire.join})
`;
 const r=spawnSync(ruby,['--disable-gems'],{input:stand+'\n'+script+'\n'+checks,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);const wire=JSON.parse(r.stdout).wire;
 assert.match(wire,/^HELLO a{32} 42\n/);assert.ok(wire.split('\n').some(x=>x.startsWith('G ')&&TP.parseChars(x.replace(/^G \d+ /,''))?.text==='通信'));
});

const sample=process.env.MEGULIT_RGSS_SAMPLE;
test('full VX corpus: every archive member and all non-Main scripts survive the actual shadow path, source files remain identical',{skip:!sample&&'MEGULIT_RGSS_SAMPLE not set; full private corpus unavailable'},t=>{
 const dir=tmp(t),source=D.plan(path.join(sample,'Game.exe')),entries=R.list(source.archive),scripts=C.scriptTable(source.original);
 assert.equal(digest(fs.readFileSync(source.exe)),'771017ca0f9d18978a906d00cd4236c8e9f974f3c7388173492ed8f92901a7e8');assert.equal(digest(fs.readFileSync(source.archive)),'a316e9007e736ca8b1380c868248bbd6c83ea0c70c80a79a52d8e7ea4ac3c4aa');assert.equal(entries.length,446);assert.equal(scripts.rows.length,129);assert.equal(scripts.bytes,862327);
 const before=new Map();function inventory(base,rel=''){for(const e of fs.readdirSync(path.join(base,rel),{withFileTypes:true})){const p=path.join(rel,e.name);if(e.isDirectory())inventory(base,p);else before.set(p,digest(fs.readFileSync(path.join(base,p))));}}inventory(sample);
 const sh=D.makeShadow({source,shadowRoot:dir,port:1234,token:'a'.repeat(32)}),archive=path.join(sh.shadow,'Game.rgss2a'),after=R.list(archive);assert.equal(sh.files,441);assert.equal(after.length,entries.length);
 for(let i=0;i<entries.length;i++){assert.equal(after[i].name,entries[i].name);if(entries[i].name.toLowerCase()!=='data/scripts.rvdata')assert.deepEqual(R.read(archive,after[i]),R.read(source.archive,entries[i]),entries[i].name);}
 const patched=C.scriptTable(R.read(archive,after.find(x=>x.name.toLowerCase()==='data/scripts.rvdata')));for(let i=0;i<scripts.rows.length;i++){assert.equal(patched.rows[i].name,scripts.rows[i].name);if(scripts.rows[i].name==='Main')assert.ok(patched.rows[i].source.subarray(-scripts.rows[i].source.length).equals(scripts.rows[i].source));else assert.deepEqual(patched.rows[i].source,scripts.rows[i].source);}
 const scenes=R.engine.scenes(sample).map(s=>R.engine.parse(s.read()));assert.equal(scenes.length,118);assert.equal(scenes.reduce((n,s)=>n+s.lines.length,0),1324);
 for(const [f,h] of before)assert.equal(digest(fs.readFileSync(path.join(sample,f))),h,'source '+f);
 // The real sample is read-only above; loose-script refusal is exercised on its disposable shadow
 fs.mkdirSync(path.join(sh.shadow,'Data'),{recursive:true});fs.writeFileSync(path.join(sh.shadow,'Data','Scripts.rvdata'),'override');assert.throws(()=>D.plan(sh.exe),/LOOSE_SCRIPTS_OVERRIDE/);
});

test('Ruby producer replay: rectangles, roles, page clear, shrinking UI, off/on and original returns/exceptions',{skip:!ruby&&'MEGULIT_RUBY not set; Ruby replay is unavailable, not a game pass'},()=>{
 const stand=fs.readFileSync(path.join(__dirname,'helpers','rgss-standin.rb'),'utf8'),script=pageScript({port:1234,token:'a'.repeat(32)});
 const checks=String.raw`
$control << "CFG 1 1\n"
m=Window_Message.new(0,260,544,156)
raise 'return lost' unless m.contents.draw_text(0,0,48,32,'本文')==:draw_return
menu=Window_Command.new(['ニューゲーム','終了']);choice=Window_Choice.new(['はい','いいえ']);choice.index=1
frames(4)
m.contents.clear;m.contents.draw_text(0,0,24,32,'次');frames(3)
choice.commands=['はい'];choice.refresh;frames(3)
menu.visible=false;frames(3)
$control << "CFG 2 0\n";frames(3);before=$wire.join
m.contents.draw_text(0,0,24,32,'無');frames(3);raise 'off emitted body' unless $wire.join==before
$control << "CFG 3 1\n";frames(3);m.contents.clear;m.contents.draw_text(0,0,24,32,'再');frames(3)
raised=false;begin;m.contents.draw_text(0,0,24,32,'RAISE');rescue StandardError=>e;raised=e.message=='host draw failure';end
raise 'host exception swallowed' unless raised
raise 'update return lost' unless Graphics.update==:update_return
puts JSON.generate({:wire=>$wire.join,:draws=>$draws.size})
`;
 const r=spawnSync(ruby,['--disable-gems'],{input:stand+'\n'+script+'\n'+checks,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr||r.stdout);
 const result=JSON.parse(r.stdout),records=result.wire.split('\n').filter(x=>x.startsWith('G ')).map(x=>({generation:Number(x.split(' ')[1]),rec:TP.parseChars(x.replace(/^G \d+ /,''))}));assert.ok(records.every(x=>x.rec),'every producer record parses');
 const rows=records.map(x=>x.rec);assert.ok(rows.some(x=>x.text==='本文'&&x.rects[0][0]===16&&x.rects[0][1]===280));assert.ok(rows.some(x=>x.role==='choice'&&x.text==='いいえ'&&x.sel));assert.ok(rows.some(x=>x.role==='menu'&&x.text==='ニューゲーム'));assert.ok(rows.some(x=>x.text===''&&!x.role));assert.ok(rows.some(x=>x.role==='menu'&&x.text===''));assert.ok(rows.some(x=>x.text==='再'));assert.ok(!rows.some(x=>x.text.includes('無')));assert.ok(!records.some(x=>x.generation===2));
});
