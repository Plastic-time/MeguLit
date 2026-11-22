// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Run after compiling validation/native/UnityIl2CppWireReplay.cs with the production wire codec.
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawn}=require('node:child_process');
const {UnityTextPath}=require('../core/text-paths-unity.cjs');
async function main(){
 const [dll,receipt]=process.argv.slice(2);if(!dll||!receipt||fs.existsSync(receipt))throw Error('usage: wire-replay <compiled neutral harness DLL> <new receipt>');
 const sources=[],p=new UnityTextPath({sourceOnly:true,onSource:m=>{sources.push(m);return true;}});let child,identity,output='',error='';
 try{
  p.canSource=o=>!!identity&&o.pid===child.pid&&o.pid===identity.pid&&o.started===identity.started;
  const port=await p.listen();child=spawn('dotnet',[dll,String(port),p.il2cpp.scope],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.setEncoding('utf8');child.stdout.on('data',d=>{output+=d;const m=/IDENTITY\t(\d+)\t(\d+)/.exec(output);if(m)identity={pid:Number(m[1]),started:m[2]};});child.stderr.on('data',d=>error+=d);
  const finished=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('neutral harness exit '+code+' '+error)));});
  const until=Date.now()+6000;while(!sources.length&&Date.now()<until)await new Promise(r=>setTimeout(r,10));
  assert.equal(sources.length,1,output+' '+error);assert.equal(sources[0].text,'これは中性の試験です😀。');assert.equal(sources[0].unityOwner.pid,child.pid);
  await p.stop();await finished;assert.match(output,/STOPPED/);assert.equal(p.il2cpp.streams.size,0);
  const result={kind:'neutral compiled C# production-wire to actual UnityTextPath socket replay',actualGame:false,interopGenerated:false,pluginHookInstalled:false,sourceCount:sources.length,unicodeExact:true,stopAcknowledged:true,owner:identity,exit:0};fs.writeFileSync(receipt,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await p.stop().catch(()=>{});if(child&&child.exitCode===null)child.kill();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
