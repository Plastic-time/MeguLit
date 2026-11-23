// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),Module=require('node:module'),{spawnSync}=require('node:child_process');
const TP=require('../core/text-paths.cjs'),ED=require('../core/engine-draw.cjs'),Profiles=require('../core/profiles/index.cjs'),{HookNative}=require('../core/hook-native.cjs'),{Reader}=require('../services/reader.cjs'),{exampleRuby}=require('../services/example-ruby.cjs');
const root=path.join(__dirname,'..');
function consumer(){
 const hook=Object.create(HookNative.prototype),reader=Object.create(Reader.prototype),tasks=[],writes=[];
 const p=Profiles.profileFor({}),profile={...p,draw:{...p.draw,embed:true}};
 Object.assign(hook,{target:{pid:171,started:'100'},state:{},profile,now:()=>1,drawLog:()=>{},emit(m){if(m.type==='hookDrawEmbed')tasks.push(reader.drawEmbed(m));}});
 hook.engineDraw=new ED.EngineDraw({profile,transport:{write:(cfg,entries)=>writes.push([...entries]),stop:()=>{}},onAsk:a=>hook.emit({type:'hookDrawEmbed',...a})});hook.engineDraw.pid=171;
 Object.assign(reader,{gal:{hooks:hook},targetLanguage:()=> 'zh',embedCached:()=> '译文',runtime:{learning:()=>({installed:()=>true,tokenize:async text=>[...text].map((surface,start)=>({surface,start,reading:'じつ',readingSource:'dictionary'})),readings:{resolve:x=>x}})}});
 return {hook,reader,writes,async feed(wire){hook.charRects(wire);await Promise.all(tasks.splice(0));}};
}

test('actual KAG track/serializer through parser, HookNative, EngineDraw and Reader keeps native occurrences ahead of dictionary',async()=>{
 const file=path.join(__dirname,'krkr-ruby-wire.test.cjs'),rig=new Module(file,module);rig.filename=file;rig.paths=Module._nodeModulePaths(path.dirname(file));
 const realRequire=rig.require.bind(rig);rig.require=id=>id==='node:test'?(()=>{}):realRequire(id);
 rig._compile(fs.readFileSync(file,'utf8')+'\nmodule.exports={trackRig};',file);
 const h=rig.exports.trackRig(),rec={target:h.L,n:0,cleared:true};h.L.x=0;h.L.y=0;
 for(const [ch,reading]of [['日','ひ'],[' ',''],['日','にち'],['本','ほん']]){if(ch==='本'){h.L.y=28;h.L.x=0;}const before=h.L.x;h.L.x+=28;h.st.track(rec,ch,false,before,ch==='本'?28:0,reading);}
 h.st.chars(rec);
 /* ReportFunction's newline encoding is represented here; the native DLL is not executed by this test. */
 const wire=h.reports.at(-1).replace(/\n/g,'\x1f').replace(/\r/g,' '),parsed=TP.parseChars(wire);assert.ok(parsed);assert.equal(parsed.text.replace(/\s/g,''),'日日本');
 const c=consumer();await c.feed(wire);const result=c.hook.engineDraw.entries.get('日日本');
 assert.deepEqual(result.ruby,[[0,1,'ひ'],[1,2,'にち'],[2,3,'ほん']]);assert.equal(result.zh,'译文');assert.ok(c.writes.length>=2);
 assert.equal(c.hook.sourceRuby.get(parsed.text),c.hook.sourceRuby.get('日日本'),'exact and compact keys retain the same occurrence positions');
});

test('actual RenPy glyph producer records all parse and feed native ruby to actual Reader',async()=>{
 const produced=spawnSync('python',['-I',path.join(root,'native/renpytext/selftest/producer.py'),path.join(root,'native/MeguLitRenpy.py')],{windowsHide:true,encoding:'utf8',timeout:5000,maxBuffer:256*1024});
 assert.equal(produced.status,0,produced.stderr);const out=JSON.parse(produced.stdout);
 for(const item of out.cases)assert.ok(TP.parseChars(item.wire),item.name);
 const repeated=out.cases.find(x=>x.name==='repeated base'),c=consumer();await c.feed(repeated.wire);
 const result=c.hook.engineDraw.entries.get('漢字漢字');assert.deepEqual(result.ruby.filter(r=>r[2]==='べつ'),[[2,4,'べつ']]);
 assert.ok(result.ruby.filter(r=>r[0]>=2).every(r=>r[2]!=='じつ'),'dictionary cannot replace the explicit second occurrence');
 assert.ok(TP.parseChars(out.embed.wire),'embedded native spans retain the shared grammar');
});

test('given ruby limits copy whole codepoints at base80/read160 without changing ordinary readings',async()=>{
 const base='漢'.repeat(79)+'𠮷',reading='あ'.repeat(159)+'𠮷';
 const shown=async item=>(await exampleRuby(null,null,[item])).items[0];
 const limited=await shown({text:base+'。',ruby:[[base+'余',reading+'余',0]]});
 assert.deepEqual(limited.spans,[{start:0,end:80,reading,source:'game'}]);assert.equal([...limited.spans[0].reading].length,160);assert.equal(/[\ud800-\udfff]/u.test(limited.spans[0].reading),false);
 const oldBoundary='あ'.repeat(79)+'𠮷',at80=await shown({text:'日',ruby:[['日',oldBoundary,0]]});assert.equal(at80.spans[0].reading,oldBoundary);
 const ordinary=await shown({text:'今日も今日も。',ruby:[['今日','きょう']]});assert.deepEqual(ordinary.spans.map(s=>[s.start,s.end,s.reading]),[[0,2,'きょう'],[3,5,'きょう']]);
});

test('actual Reader drawEmbed retains a supplementary native reading through EngineDraw reply',async()=>{
 const reading='あ'.repeat(79)+'𠮷',c=consumer(),wire=TP.formatChars({engine:'krkr',line:99,hidden:false,sw:1280,sh:720,rects:[[0,0,28,28]],text:'日',ruby:[[0,1,reading]]});
 await c.feed(wire);assert.deepEqual(c.hook.engineDraw.entries.get('日').ruby,[[0,1,reading]]);
});
