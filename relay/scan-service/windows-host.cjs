'use strict';
const fs=require('node:fs');
const WebSocket=require('ws');
const {server}=require('./server.cjs');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const port=Number(config.PORT||8093);
const endpoint=new URL(config.CONNECTOR_URL);
if(endpoint.protocol!=='wss:'||endpoint.pathname!=='/connect'||endpoint.search||endpoint.hash||endpoint.username||endpoint.password)throw Error('Invalid connector endpoint');
let delay=1000;
function connect(){
 const ws=new WebSocket(endpoint,{headers:{authorization:'Bearer '+config.CONNECTOR_TOKEN},followRedirects:false,handshakeTimeout:12000,maxPayload:512*1024,perMessageDeflate:false});
 let pong=true;
 const heartbeat=setInterval(()=>{
  if(ws.readyState!==WebSocket.OPEN)return;
  if(!pong){ws.terminate();return;}
  pong=false;ws.ping();
 },60000);
 ws.on('open',()=>{delay=1000;});
 ws.on('pong',()=>{pong=true;});
 ws.on('error',()=>{});
 ws.on('close',()=>{clearInterval(heartbeat);setTimeout(connect,delay);delay=Math.min(delay*2,60000);});
 ws.on('message',async raw=>{
  let job;try{job=JSON.parse(raw.toString());}catch{return;}
  if(!/^[a-f0-9-]{36}$/.test(job?.id)||job.health!==true&&(typeof job.doc!=='string'||Buffer.byteLength(job.doc)>(job.enhanced?128*1024:4096)))return;
  let status=503,body='';
  try{
   const response=await fetch('http://127.0.0.1:'+port+(job.health===true?'/health':job.enhanced?'/scan-enhanced':'/scan'),{method:job.health===true?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(18000),
    headers:{'content-type':'application/json',authorization:'Bearer '+config.ORDINARY_SCAN_TOKEN},body:job.health===true?undefined:job.doc});
   status=response.status;body=await response.text();
  }catch{}
  if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id:job.id,status,body}));
 });
}
server(config).listen(port,'127.0.0.1',connect);
