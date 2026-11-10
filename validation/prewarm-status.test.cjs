'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// E359/E360: readonly embed tag and the zero-latency brief state.
test('embed tag shows a run that could only read',async()=>{
 const {embedStatus}=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'../web/embed-status.js')).toString('base64'));
 assert.equal(embedStatus({hookSupport:'readonly',engine:'YU-RIS'},'zh').label,'实测只能读取');
 assert.equal(embedStatus({hookSupport:'verified'},'zh').kind,'verified');
});
test('zero-latency brief comes from the saved state only',()=>{
 const ot=require('../services/original-text.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'brief-'));fs.mkdirSync(path.join(root,'data/config'),{recursive:true});
 fs.writeFileSync(path.join(root,'data/config/original-text.json'),JSON.stringify({a:{status:'native-japanese',patchStatus:'ready'},b:{status:'native-japanese'},c:{status:'awaiting-original'},d:{status:'unsupported'}}));
 assert.deepEqual(['a','b','c','d','e'].map(id=>ot.brief(root,id)),['patch','machine','needs-japanese','none','unknown']);
 fs.rmSync(root,{recursive:true,force:true});
});
