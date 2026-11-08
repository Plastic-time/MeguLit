const test=require('node:test'),assert=require('node:assert/strict');
test('installed notice fades after a few seconds, disappears, and repeated status cannot keep it alive',async()=>{
 const {installLearningNotice}=await import('../web/reader/learning-notice.js');let node,id=0;const timers=new Map();const bridge={learningStatus:message=>{node??={isConnected:true,style:{},remove(){this.isConnected=false;node=null;}};node.textContent=message.learningMessage;}};
 installLearningNotice(bridge,{doc:{querySelector:()=>node},timeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:key=>timers.delete(key)});
 const value={learningMessage:'SudachiDict Full 已安装，离线词典可用'};bridge.learningStatus(value);bridge.learningStatus(value);assert.equal(timers.size,1);const hold=timers.get(1);assert.equal(hold.ms,2800);timers.delete(1);hold.fn();assert.equal(node.style.opacity,'0');const fade=timers.get(2);assert.equal(fade.ms,350);fade.fn();assert.equal(node,null);bridge.learningStatus(value);assert.equal(node,null);
});
