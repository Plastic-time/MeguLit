const test=require('node:test'),assert=require('node:assert/strict');
test('autosave coalesces typing, flushes before leaving, and retains the latest edit during a write',async()=>{
 const {createAutosave}=await import('../web/settings-autosave.js'),writes=[],states=[];let release;
 const a=createAutosave({delay:10000,onState:s=>states.push(s),save:async value=>{writes.push(value);if(writes.length===1)await new Promise(r=>release=r);}});
 a.update({path:'E:'});a.update({path:'E:\\GAL'});const pending=a.flush();await Promise.resolve();a.update({path:'D:\\New Games'});release();await pending;assert.deepEqual(writes,[{path:'E:\\GAL'},{path:'D:\\New Games'}]);assert.equal(states.at(-1),'saved');a.update({path:'D:\\New Games'});await a.flush();assert.equal(writes.length,2);a.stop();
});
test('a failed auto save keeps its values and can be retried without retyping',async()=>{
 const {createAutosave}=await import('../web/settings-autosave.js');let attempts=0,stored;const a=createAutosave({delay:10000,save:async v=>{if(++attempts===1)throw Error('disk full');stored=v;}});a.update({locale:false});await assert.rejects(a.flush(),/disk full/);await a.flush();assert.deepEqual(stored,{locale:false});a.stop();
});
