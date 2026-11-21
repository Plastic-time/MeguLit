// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const TP=require('../core/text-paths.cjs'),ED=require('../core/engine-draw.cjs'),{HookNative}=require('../core/hook-native.cjs');
/* Run the actual producer functions using the existing explicit TJS syntax adapter, not a replacement producer. */
const file=path.join(__dirname,'engine-draw-krkr.test.cjs'),source=fs.readFileSync(file,'utf8'),rig=new Module(file,module);
rig.filename=file;rig.paths=Module._nodeModulePaths(path.dirname(file));rig._compile(source.slice(0,source.indexOf("test('"))+'\nmodule.exports={harness,toJs,script};',file);
const {harness,toJs,script}=rig.exports;
const record=(text='日 日\n本',ruby=[[0,1,'ひ'],[2,1,'にち'],[3,1,'ほん']],extra={})=>({engine:'krkr',line:4,hidden:false,sw:1280,sh:720,rects:[...text.replace(/\n/g,'')].map((_,i)=>[i*28,500,28,28]),text,ruby,...extra});
const J=x=>JSON.parse(JSON.stringify(x));

test('ruby-v1: old bytes, explicit occurrences, codepoints and row boundaries round trip',()=>{
 const old=TP.formatChars({...record('日',[]),ruby:undefined});assert.equal(old,'ToMe_CHARS engine=krkr line=4 hidden=0 sw=1280 sh=720 vx=0 vy=0 vw=0 vh=0 n=1 rects=0,500,28,28 text=日');
 assert.equal(TP.formatChars(record('日',[])),old);assert.equal(Object.hasOwn(TP.parseChars(old),'ruby'),false);
 const r=TP.parseChars(TP.formatChars(record()));assert.deepEqual(r.ruby,record().ruby);
 assert.deepEqual(TP.rubyPairs(r),[['日','ひ',0],['日','にち',1],['本','ほん',2]]);
 const astral=record('𠮷日',[[0,1,'𠮷よし'],[1,1,'ひ']]);assert.deepEqual(TP.parseChars(TP.formatChars(astral)).ruby,astral.ruby);
 assert.throws(()=>TP.formatChars(record('日\n本',[[0,2,'にほん']])) ,/INVALID_CHAR_RUBY/);
});

test('ruby-v1 rejects malformed, overlapping, surrogate, controls and budget overflow as a whole record',()=>{
 const base=TP.formatChars(record('日日',[])),wire=x=>base.replace(' text=',' ruby='+x+' text=');
 for(const bad of ['0:1:304','0:1:ZZZZ','0:1:d800','0:1:dc00','0:1:000a','0:1:007f','0:1:0085','0:0:3042','0:81:3042','2:1:3042','0:2:3042|1:1:3044','0:1:3042|0:1:3044','01:1:3042','0:1:'+('3042'.repeat(161)),'0:1:3042|','0:1:3042 '.repeat(1000)])assert.equal(TP.parseChars(wire(bad)),null,bad.slice(0,40));
 assert.equal(TP.parseChars(wire(Array.from({length:65},(_,i)=>i+':1:3042').join('|'))),null);
 assert.throws(()=>TP.formatChars(record('日',[[0,1,'\ud800']])),/INVALID_CHAR_RUBY/);
 const many=record('日'.repeat(64),Array.from({length:64},(_,i)=>[i,1,'あ'.repeat(40)]));assert.throws(()=>TP.formatChars(many),/INVALID_CHAR_RUBY/);
});

test('HookNative caches native ruby before embed asks, only for body and current owned episode',()=>{
 const h=Object.create(HookNative.prototype),events=[],seen=[];Object.assign(h,{state:{},target:{pid:71,started:'100'},now:()=>1,drawLog:()=>{},emit:x=>events.push(x),engineDrawLine:r=>seen.push(h.sourceRuby?.get(r.text.replace(/\s+/g,'')))});
 h.charRects(TP.formatChars(record()));assert.deepEqual(seen[0],[['日','ひ',0],['日','にち',1],['本','ほん',2]]);assert.equal(h.sourceRuby.get('日 日\n本'),h.sourceRuby.get('日日本'));
 h.charRects(TP.formatChars(record('別',[[0,1,'べつ']],{line:5})));assert.equal(h.sourceRuby.has('日日本'),false);
 h.charRects(TP.formatChars(record('別',[],{line:5})));assert.equal(h.sourceRuby.has('別'),false);
 h.charRects(TP.formatChars(record('日',[[0,1,'ひ']],{role:'name'})));assert.equal(h.sourceRuby.has('日'),false);assert.equal(events.at(-1).type,'hookDrawUi');
 h.charRects(TP.formatChars(record('日',[[0,1,'ひ']],{engine:'unity'})));assert.equal(h.sourceRuby.has('日'),false);
 h.charRects(TP.formatChars(record('日',[[0,1,'ひ']],{engine:'renpy'})));assert.equal(h.sourceRuby.get('日')[0][1],'ひ');
 const provider=[['日','にち',0]];h.sourceRuby.set('日',provider);h.clearNativeRuby();assert.equal(h.sourceRuby.get('日'),provider,'only delete values still owned by this cache');
});

test('native ruby ownership ends on configure identity changes, explicit clear and stop',()=>{
 const h=Object.create(HookNative.prototype);Object.assign(h,{target:{pid:71,started:'100'},state:{},capGiveWay:()=>{},stop:()=>{}});
 h.nativeLineRuby(record('日',[[0,1,'ひ']]));h.configure({bindEnabled:false},{gameProcessId:72,gameHwnd:'2',gameStarted:'100'});assert.equal(h.sourceRuby.has('日'),false);
 h.target={pid:72,started:'100'};h.nativeLineRuby(record('日',[[0,1,'ひ']]));h.configure({bindEnabled:false},{gameProcessId:72,gameHwnd:'2',gameStarted:'101'});assert.equal(h.sourceRuby.has('日'),false,'same PID with a new birth is another owner');
 h.nativeLineRuby(record('日',[[0,1,'ひ']]));h.nativeLineRuby(record('',[],{line:4}));assert.equal(h.sourceRuby.has('日'),false);
 h.nativeLineRuby(record('日',[[0,1,'ひ']]));Object.assign(h,{pageReset:()=>{},islandSources:new Map(),notify:()=>{}});HookNative.prototype.stop.call(h);assert.equal(h.sourceRuby.has('日'),false);
});

test('KAG actual ruby serializer retains UTF16 exactly and refuses ambiguous/bounded inputs',()=>{
 const h=harness();const pairs=[[0,1,'ひ'],[1,1,'𠮷よし']];assert.equal(h.st.rubyWire(pairs),TP.formatRuby(pairs,'日𠮷',2));
 for(const bad of [[[0,1,'\ud800']],[[0,1,'\udc00']],[[0,1,'x\n']],[[0,1,'あ'.repeat(161)]],[[0,1,'あ'],[0,1,'い']],[[0,81,'あ']],[[0.5,1,'あ']]])assert.equal(h.st.rubyWire(bad),'');
 assert.equal(h.st.rubyWire([]),'');
});

function trackRig(){const h=harness({ctl:'#cfg roles=1\n'});h.st.ctl();Object.assign(h.st,{send:()=>{},line:0,charsSent:0,paintOf:()=>'',fontReport:()=>{},hideMsg:()=>true});
 const cp=script.indexOf('st.choicePage=function'),ce=script.indexOf('} incontextof st;',cp)+18;vm.runInContext(toJs(script.slice(cp,ce)),h.sandbox);
 const a=script.indexOf('st.track=function'),b=script.indexOf('/* 2026-11-21',script.indexOf('st.chars=function',a));vm.runInContext(toJs(script.slice(a,b)),h.sandbox);return h;}

test('KAG actual track routes a small link before name geometry and never claims a kept name hidden',()=>{
 for(const link of [-1,0]){const h=trackRig();h.L.height=60;h.L.inLink=link;h.L.x=28;h.L.y=0;const rec={target:h.L,n:0,cleared:true};h.st.track(rec,'日',false,0,0,'ひ');
  if(link===0){assert.equal(rec.n,0);h.st.sendLinks(rec);assert.deepEqual(h.reports.map(TP.parseChars).map(r=>[r.role,r.hidden,r.text]),[['choice',false,'日']]);}
  else {h.st.chars(rec);assert.deepEqual(h.reports.map(TP.parseChars).map(r=>[r.role,r.hidden,r.text]),[['name',false,'日']]);}}
 const h=trackRig();h.L.x=28;h.L.y=0;const rec={target:h.L,n:0,cleared:true};h.st.track(rec,'日',false,0,0,'ひ');h.st.chars(rec);assert.deepEqual(TP.parseChars(h.reports.at(-1)).ruby,[[0,1,'ひ']]);
 const before=rec.cn;h.st.track(rec,'本',false,28,0,'ほん');assert.equal(rec.cn,before,'no cursor advance produces no speculative ruby');
});

test('KAG wrapper snapshots one-shot currentRuby before original processCh consumes it',()=>{
 const h=harness(),rec={target:h.L,st:{track:(...args)=>{rec.observed=args.at(-1);}},oldCh(){h.L.currentRuby='';return 42;}};h.L.currentRuby='ひ';h.sandbox.rec=rec;
 const a=script.indexOf('rec.ch=function(ch){'),b=script.indexOf('    rec.clr=function',a);vm.runInContext(toJs(script.slice(a,b)).replace(/\(\.\.\.\)/g,'(ch)'),h.sandbox);
 assert.equal(rec.ch('日'),42);assert.equal(h.L.currentRuby,'');assert.equal(rec.observed,'ひ');
});

test('KAG strict actual control reader accepts real writer and fails closed on nonexact/late/duplicate headers',()=>{
 const valid=ED.krkrControlText({roles:true,embed:true,zh:false,advhdInput:true},new Map());let h=harness({ctl:valid});h.st.ctl();assert.deepEqual(J(h.st.cfg),{roles:1,embed:1,zh:0});
 for(const ctl of ['#cfgx roles=1','#cfg roles=11','x\n#cfg roles=1','#cfg roles=0 roles=1','#cfg embed=1 embed=1','#cfg roles=true','#cfg roles=1 extra=1','#cfg roles=1\n#cfg roles=0','#cfg roles=1\n#cfgx embed=1','#cfg roles=1 ']){h=harness({ctl:ctl+'\n'});h.st.ctl();assert.deepEqual(J(h.st.cfg),{roles:0,embed:0,zh:1},ctl);}
 h=harness({ctl:'#cfg embed=1\n'});h.st.ctl();h.st.embPend={old:true};fs.writeFileSync(h.ctlFile,'#cfg embed=0\n');h.st.ctl();assert.equal(h.st.embPend,undefined);fs.writeFileSync(h.ctlFile,'#cfg embed=1\n');h.st.ctl();assert.equal(h.st.embPend,undefined,'off-on cannot revive an old pending replacement');
 h.st.embPend={old:true};fs.unlinkSync(h.ctlFile);h.st.ctl();assert.equal(h.st.cfg.embed,0);assert.equal(h.st.embPend,undefined);
});

test('KAG embed keeps original native reading once while adding other dictionary readings',()=>{
 const h=harness({ctl:'#cfg embed=1\n日日\t0:1:ひ|1:1:にち\t\n'});h.st.ctl();const r=record('日日',[[0,1,'ひ']]);const rec={target:h.L,role:'line',cn:2,ra:r.rects,rb:r.ruby,ct:r.text,size:28,nvl:0,head:TP.formatChars({...r,ruby:[]}).split(' text=')[0],tt:r.text,y1:500,cleared:false,n:0};
 h.st.embPend=h.st.embQueue(rec);h.st.embTry();assert.deepEqual(h.draws.map(d=>d.text),['にち']);assert.deepEqual(TP.parseChars(h.reports.at(-1)).ruby,[[0,1,'ひ']]);
});
