// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Actual reader page in headless Edge; provider replies are explicit test substitutes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {startEdge}=require('../../validation/library-views-perf.cjs');
const ROOT=path.resolve(__dirname,'../..'),WEB=path.join(ROOT,'web'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const STUB=`<script>(()=>{const callbacks=new Map();let id=0;window.__drpcRequests=[];window.__TAURI_INTERNALS__={transformCallback:f=>{callbacks.set(++id,f);return id;},invoke:async(command,args)=>{
 if(command==='plugin:event|listen'){if(args.event==='reader-event')window.__drpcEvent=callbacks.get(args.handler);return 1;}
 if(command!=='service')return null;const r=args?.request||{};
 if(r.action==='home')return {preferences:{language:'zh',themeMode:'dark'},games:[]};if(r.action==='ui_state')return {};if(r.action==='reader_bootstrap')return {engines:[],native:{}};
 if(r.action==='reader_message'){const m=r.message||{};window.__drpcRequests.push(m);if(!m.type&&m.id&&m.text)return {replies:[{method:'deliver',args:[m.id,'回放译文',false,'',{target:'zh'}]}]};
  if(m.type==='learningRequest')return {replies:[{method:'learningDeliver',args:[m.id,m.command==='tokenize_text'?[]:{},'']}]};return {replies:[]};}return {};}};})();</script>`;
async function run(out,webRoot=WEB){
 webRoot=path.resolve(webRoot);out=path.resolve(out);const input=JSON.parse(fs.readFileSync(path.join(out,'root-owner-replay.json'),'utf8')),rows=input.readerLines,errors=[];let browser;
 const server=http.createServer((req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://local').pathname),file=path.resolve(webRoot,'.'+relative);if(!file.startsWith(webRoot+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  let data=fs.readFileSync(file);if(relative==='/reader/index.html')data=Buffer.from(data.toString().replace('<head>','<head>'+STUB));const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  globalThis.__cdpEvent=m=>{if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
  browser=await startEdge(path.join(out,'reader-web-'+Date.now()));await browser.send('Runtime.enable');await browser.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/reader/index.html`});
  let ready=false;for(let i=0;i<80;i++){ready=await browser.evaluate('window.__TOME_READER_READY__===true').catch(()=>false);if(ready)break;await sleep(100);}if(!ready)console.error(JSON.stringify({errors,state:await browser.evaluate('({status:document.querySelector("#reader-status")?.textContent,scripts:[...document.scripts].map(s=>s.src)})')}));assert.equal(ready,true,'actual reader bootstrap completed');
  await browser.evaluate(`(()=>{window.__tomoyoMode.set('translation');document.body.classList.add('tomoyo-gal-bound');const b=window.__tomoyoChinese;b.setEnabled(true);b.setTranslationVisible(true);return true;})()`);
  const received=[];
  for(const row of rows){await browser.evaluate(`window.__drpcEvent({payload:${JSON.stringify(row)}})`);await sleep(750);const state=await browser.evaluate(`(()=>{const el=document.querySelector('.tomoyo-hook-reader .sentence-text');return {text:[...(el?.querySelectorAll('.char-token')||[])].map(x=>x.textContent).join(''),translation:document.querySelector('.tomoyo-hook-reader .tomoyo-cn-output')?.textContent||'',status:window.__tomoyoChinese.hookReaderStatus()};})()`);assert.equal(state.text,row.hookSource);assert.equal(state.status.rendered,true);received.push(state);}
  const screenshot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'reader-real-source.png'),Buffer.from(screenshot.data,'base64'));
  const requests=await browser.evaluate('window.__drpcRequests');assert.ok(requests.some(m=>!m.type&&m.text===rows.at(-1).hookSource),'standard frontend translation request');assert.ok(received.every(s=>s.translation==='回放译文'),'explicit substitute translation reached actual DOM');
  await browser.evaluate(`window.__drpcEvent({payload:{type:'hook',hookSource:'',hookActive:false,hookSequence:99,hookSourceOrigin:'danganronpa-revoked'}})`);await sleep(150);const cleared=await browser.evaluate('!document.querySelector(".tomoyo-hook-reader")');assert.equal(cleared,true);
  const receipt={webRoot,readerPage:'web/reader/index.html',sourceCount:received.length,received,translationProvider:'test-substitute',requests,cleared,errors,actualGameStarted:false,gameplayAccepted:false};fs.writeFileSync(path.join(out,'reader-web-replay.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
 }finally{await browser?.stop();await new Promise(r=>server.close(r));delete globalThis.__cdpEvent;}
}
module.exports={run};
if(require.main===module)run(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify({sourceCount:r.sourceCount,cleared:r.cleared,errors:r.errors,translationProvider:r.translationProvider}))).catch(e=>{console.error(e);process.exitCode=1;});
