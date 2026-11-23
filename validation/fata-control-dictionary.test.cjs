// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const {HookNative}=require('../core/hook-native.cjs'),P=require('../core/profiles/index.cjs');
const {parseChars}=require('../core/text-paths.cjs'),{UiTracker,krkrControlText,settings}=require('../core/engine-draw.cjs');
const {Reader}=require('../services/reader.cjs');
const helper=path.join(__dirname,'engine-draw-krkr.test.cjs'),source=fs.readFileSync(helper,'utf8'),loaded=new Module(helper,module);
loaded.filename=helper;loaded.paths=Module._nodeModulePaths(path.dirname(helper));loaded._compile(source.slice(0,source.indexOf("test('"))+'\nmodule.exports={harness,toJs,script};',helper);
const {harness,toJs,script}=loaded.exports;
function method(name){const at=script.indexOf('st.'+name+'=function');assert(at>=0,name);return script.slice(at,script.indexOf('} incontextof st;',at)+'} incontextof st;'.length);}
function context(file,{old=false}={}){
 const h=harness();h.sandbox.__megulitKrkrCtlPath=file;
 let ctl=method('ctl');assert.equal((ctl.match(/new global\.RegExp\(/g)||[]).length,1);
 if(old)ctl=ctl.replace('new global.RegExp(','new RegExp(');
 // TJS's this/global proxy falls back only on MEMBERNOTFOUND. A Dictionary missing a member
 // returns S_OK+void, so a bare constructor is shadowed, unlike normal JS lexical lookup.
 vm.runInContext('(function(){const RegExp=undefined;'+toJs(ctl)+'})();'+toJs(method('choicePage')+method('uiDraw')),h.sandbox);
 h.st.ctl();return h;
}
test('real configure/drawSync control bytes survive dictionary constructor shadowing; old bare constructor loses the choice guard',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fata-control-dictionary-')),prior={TEMP:process.env.TEMP,TMP:process.env.TMP};
 const base=P.profileFor({exe:'E:/GAL/海市蜃楼之馆/fata_jp.exe',engine:'KiriKiri'}),pid=900000+process.pid;
 try{process.env.TEMP=process.env.TMP=temp;
  for(const profile of [base,P.apply(base,{draw:{roles:true,embed:true}},'owner-settings-fixture'),P.apply(base,{hide:{textEffectsRead:true},calibrate:{hideMethod:'read'}},'stepdown')]){
   const h=new HookNative({native:temp,hook:temp,logs:temp},()=>{},()=>{throw Error('UNEXPECTED_HELPER');});clearInterval(h.timer);h.trace=()=>{};h.send=()=>{};
   try{h.setProfile(profile);h.configure({hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook'},{bound:true,gameProcessId:pid,gameStarted:'638678123456789000',gameHwnd:'456',coverEnabled:true});
    await new Promise(r=>setTimeout(r,100));const file=h.engineDraw.transport.file;assert(file.startsWith(temp+path.sep));const bytes=fs.readFileSync(file);assert.deepEqual([...bytes.subarray(0,2)],[255,254]);assert.match(bytes.subarray(2).toString('utf16le'),/#choiceframe \^選択肢\$/);
    const before=context(file,{old:true}).st,after=context(file).st;assert.equal(before.cfg.clear,1);assert.equal(before.cfg.choiceFrames.length,0,'old constructor fails silently after the clear directive');assert.equal(before.uiDraw({parent:{frameGraphic:'選択肢',inLink:-1,height:600}}),'');
    assert.equal(after.cfg.clear,1);assert.equal(after.cfg.choiceFrames.length,1);
    const layer={frameGraphic:'meserei0',inLink:-1,height:600};assert.equal(after.uiDraw({parent:layer}),'');layer.frameGraphic='選択肢';assert.equal(after.uiDraw({parent:layer}),'choice','the draw wrapper must keep these glyphs native');layer.frameGraphic='meserei0';assert.equal(after.uiDraw({parent:layer}),'');
   }finally{h.engineDraw?.stop();clearInterval(h.timer);}
  }
 }finally{for(const key of ['TEMP','TMP'])if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
});

test('exact Seed reports the original KAG choice separately and keeps original dialogue visible when hide is off',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fata-choice-roles-'));
 const file=path.join(dir,'control.txt');
 t.after(()=>{fs.unlinkSync(file);fs.rmdirSync(dir);});
 const key='17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42';
 const exe='D:/Games/Fata/fata_jp.exe';
 for(const exeSha256 of [key,'a'.repeat(64)]){
  const profile=P.profileFor({exe,engine:'kirikiri',exeSha256});
  fs.writeFileSync(file,krkrControlText(settings(profile),new Map()),'utf8');
  const {st,L,reports,sandbox}=context(file);
  Object.assign(st,{send(){},fontReport(){},paintOf:()=>'',line:0,charsSent:0});
  vm.runInContext(toJs(method('hideMsg')+method('track')+method('chars')),sandbox);
  let hide=true;
  st.hideOn=()=>hide;
  const newLine=()=>({target:L,n:0,cleared:true});
  const track=(rec,text)=>[...text].forEach((ch,i)=>{
   L.x=(i+1)*22;L.y=0;st.track(rec,ch,false,i*22,0,ch==='館'?'やかた':'');
  });

  L.frameGraphic='選択肢';L.inLink=-1;
  const choice='……おはよう………………',rec=newLine();st.recs.push(rec);
  assert.equal(st.uiDraw({parent:L}),'choice','KAG keeps drawing the option itself');
  track(rec,choice);st.sendLinks(rec);
  assert.equal(rec.n,0,'the option is never a dialogue line');
  const roles=reports.map(parseChars).filter(x=>x?.role==='choice');
  assert.deepEqual(roles.map(r=>[r.text,r.hidden]),exeSha256===key?[[choice,false]]:[]);
  if(roles.length){
   const [item]=new UiTracker().feed(roles[0]),events=[];
   const reader={targetLanguage:()=> 'zh',localTranslation:text=>text===choice?'……早上好………………':'',emit:(_,msg)=>events.push(msg)};
   await Reader.prototype.artText.call(reader,item);
   assert.deepEqual(events.map(msg=>[msg.source,msg.role,msg.text,msg.translation]),[['engine','choice',choice,'……早上好………………']]);
  }

  L.frameGraphic='meserei0';
  for(const hideOriginal of [true,false]){
   hide=hideOriginal;
   const body=newLine();track(body,'館へ');st.chars(body);
   const placed=parseChars(reports.at(-1));
   assert.equal(placed.text,'館へ');
   assert.equal(placed.hidden,hideOriginal);
   assert.deepEqual(placed.ruby,[[0,1,'やかた']]);
  }
 }
});
