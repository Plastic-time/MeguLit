// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),vm=require('node:vm');
const {HookNative}=require('../core/hook-native.cjs'),P=require('../core/profiles/index.cjs');
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
 h.st.ctl();return h.st;
}
test('real configure/drawSync control bytes survive dictionary constructor shadowing; old bare constructor loses the choice guard',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fata-control-dictionary-')),prior={TEMP:process.env.TEMP,TMP:process.env.TMP};
 const base=P.profileFor({exe:'E:/GAL/海市蜃楼之馆/fata_jp.exe',engine:'KiriKiri'}),pid=900000+process.pid;
 try{process.env.TEMP=process.env.TMP=temp;
  for(const profile of [base,P.apply(base,{draw:{roles:true,embed:true}},'owner-settings-fixture'),P.apply(base,{hide:{textEffectsRead:true},calibrate:{hideMethod:'read'}},'stepdown')]){
   const h=new HookNative({native:temp,hook:temp,logs:temp},()=>{},()=>{throw Error('UNEXPECTED_HELPER');});clearInterval(h.timer);h.trace=()=>{};h.send=()=>{};
   try{h.setProfile(profile);h.configure({hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook'},{bound:true,gameProcessId:pid,gameStarted:'638678123456789000',gameHwnd:'456',coverEnabled:true});
    await new Promise(r=>setTimeout(r,100));const file=h.engineDraw.transport.file;assert(file.startsWith(temp+path.sep));const bytes=fs.readFileSync(file);assert.deepEqual([...bytes.subarray(0,2)],[255,254]);assert.match(bytes.subarray(2).toString('utf16le'),/#choiceframe \^選択肢\$/);
    const before=context(file,{old:true}),after=context(file);assert.equal(before.cfg.clear,1);assert.equal(before.cfg.choiceFrames.length,0,'old constructor fails silently after the clear directive');assert.equal(before.uiDraw({parent:{frameGraphic:'選択肢',inLink:-1,height:600}}),'');
    assert.equal(after.cfg.clear,1);assert.equal(after.cfg.choiceFrames.length,1);
    const layer={frameGraphic:'meserei0',inLink:-1,height:600};assert.equal(after.uiDraw({parent:layer}),'');layer.frameGraphic='選択肢';assert.equal(after.uiDraw({parent:layer}),'choice','the draw wrapper must keep these glyphs native');layer.frameGraphic='meserei0';assert.equal(after.uiDraw({parent:layer}),'');
   }finally{h.engineDraw?.stop();clearInterval(h.timer);}
  }
 }finally{for(const key of ['TEMP','TMP'])if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}
});
