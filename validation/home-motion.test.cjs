const test=require('node:test'),assert=require('node:assert/strict');
test('an occluded WebView with a never-finished animation does not block the native hide workflow',async()=>{
 const {createHomeMotion}=await import('../web/home-motion.js'),motions=[],frame={animate:(keys,options)=>{const motion={keys,options,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};motions.push(motion);return motion;}};
 const play=createHomeMotion({frame:()=>frame});assert.equal(play('enter'),undefined);assert.equal(motions[0].options.fill,'forwards');play('hidden');assert.equal(motions[0].cancelled,true);play('return');assert.equal(motions[1].keys.at(-1).opacity,1);
});
