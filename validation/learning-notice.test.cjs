const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('installed notice fades after a few seconds, disappears, and repeated status cannot keep it alive',async()=>{
 const {installLearningNotice}=await import('../web/reader/learning-notice.js');let node,id=0;const timers=new Map();const bridge={learningStatus:message=>{if(message.learningNotice===false)return;node??={isConnected:true,style:{},remove(){this.isConnected=false;node=null;}};node.textContent=message.learningMessage;}};
 installLearningNotice(bridge,{doc:{querySelector:()=>node},timeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:key=>timers.delete(key)});
 const value={learningMessage:'SudachiDict Full 已安装，离线词典可用'};bridge.learningStatus(value);bridge.learningStatus(value);assert.equal(timers.size,1);const hold=timers.get(1);assert.equal(hold.ms,2800);timers.delete(1);hold.fn();assert.equal(node.style.opacity,'0');const fade=timers.get(2);assert.equal(fade.ms,350);fade.fn();assert.equal(node,null);bridge.learningStatus(value);assert.equal(node,null);
});
test('real learning module removes only the recovered operation notice and keeps errors in settings',async()=>{
 let notice=null;const setting={textContent:''},ruby={textContent:''},parent={appendChild:n=>{notice=n;}};
 const doc={documentElement:{},head:{appendChild(){}},addEventListener(){},querySelector:s=>s==='.sentence-window'?parent:s==='.tomoyo-learning-notice'?notice:null,querySelectorAll:s=>s==='[data-learning-status]'?[setting]:s==='[data-learning-ruby-status]'?[ruby]:[],createElement:()=>({dataset:{},style:{},setAttribute(){},remove(){notice=null;}})};
 const bridge={},context=vm.createContext({document:doc,window:{__tomoyoChinese:bridge},setTimeout:()=>0,clearTimeout(){},MutationObserver:class{observe(){}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/reader/modules/learning.js'),'utf8'),context);
 bridge.learningStatus({learningMessage:'current failure',learningOperation:'ruby'});assert.equal(notice.dataset.learningOperation,'ruby');
 bridge.learningStatus({learningRecovered:'lookup'});assert.ok(notice,'unrelated operation cannot erase this error');
 bridge.learningStatus({learningRecovered:'ruby'});assert.equal(notice,null);assert.equal(setting.textContent,'current failure');assert.equal(bridge.localLearningMessage,'current failure');
 bridge.learningStatus({learningMessage:'正在安装组件'});bridge.learningStatus({learningRecovered:'ruby'});assert.ok(notice,'ruby recovery cannot erase an installation status');
 const installNotice=notice;
 bridge.learningStatus({learningRubyError:'current line failed'});
 bridge.learningStatus({learningRubyError:'current line failed'});
 assert.equal(notice,installNotice);assert.equal(notice.textContent,'正在安装组件');
 assert.equal(setting.textContent,'正在安装组件');assert.match(ruby.textContent,/current line failed/);
 installNotice.remove();bridge.learningStatus({learningRubyError:'another line failed'});
 assert.equal(notice,null,'automatic ruby failures only update the diagnostic');assert.match(ruby.textContent,/another line failed/);
});
test('repeated tokenizer errors expire while settings keep their status; recovery allows a later distinct incident',async()=>{
 const {installLearningNotice}=await import('../web/reader/learning-notice.js');let node,id=0,setting='';const timers=new Map();
 const bridge={learningStatus:message=>{if(message.learningRecovered){node=null;return;}setting=message.learningMessage;if(message.learningNotice===false)return;node??={isConnected:true,style:{},remove(){this.isConnected=false;node=null;}};node.textContent=message.learningMessage;}};
 installLearningNotice(bridge,{doc:{querySelector:()=>node},timeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:key=>timers.delete(key)});
 const failure={learningMessage:'Sudachi 本地分词失败，请检查 Full 组件安装状态',learningOperation:'ruby'};
 bridge.learningStatus(failure);bridge.learningStatus(failure);assert.equal(timers.size,1);
 const hold=timers.get(1);timers.delete(1);hold.fn();const fade=timers.get(2);timers.delete(2);fade.fn();
 assert.equal(node,null);assert.equal(setting,failure.learningMessage);bridge.learningStatus(failure);assert.equal(node,null);
 bridge.learningStatus({learningRecovered:'ruby'});bridge.learningStatus(failure);assert.ok(node);assert.equal(node.style.opacity,'1');assert.equal(timers.size,1);
});
test('identical text from a different operation keeps its own expiry despite another operation recovering',async()=>{
 const {installLearningNotice}=await import('../web/reader/learning-notice.js');let node,id=0;const timers=new Map();
 const bridge={learningStatus:m=>{if(m.learningRecovered){if(node?.op===m.learningRecovered)node=null;return;}if(m.learningNotice===false)return;node??={isConnected:true,style:{},remove(){this.isConnected=false;node=null;}};node.op=m.learningOperation;node.textContent=m.learningMessage;}};
 installLearningNotice(bridge,{doc:{querySelector:()=>node},timeout:fn=>{const key=++id;timers.set(key,{fn});return key;},cancel:key=>timers.delete(key)});
 bridge.learningStatus({learningMessage:'same error',learningOperation:'ruby'});bridge.learningStatus({learningMessage:'same error',learningOperation:'lookup'});bridge.learningStatus({learningRecovered:'ruby'});
 assert.equal(node.op,'lookup');assert.equal(timers.size,1);const hold=[...timers.values()][0];timers.clear();hold.fn();const fade=[...timers.values()][0];fade.fn();assert.equal(node,null);
});
