// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E415 faster page loads from mainland China for the 日报 reader, the way Watt Toolkit's accelerator works, but inside
   MeguLit and without touching hosts or a system proxy:
     1. resolve the host over DNS-over-HTTPS served in China (AliDNS, DNSPod), which sidesteps poisoned answers;
     2. open a TCP connection to every returned IPv4 address at once and keep the one that answers first;
     3. make the HTTPS request to that address with the real host name as SNI / Host, so TLS still verifies the site.
   The winning address is remembered per host for 30 minutes. Any failure falls back to a plain request.
   Traffic goes straight from this PC to the source site; nothing passes through the MeguLit relay. */
const https=require('node:https'),net=require('node:net'),zlib=require('node:zlib');
const DOH=[
 host=>`https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=1`,
 host=>`https://doh.pub/dns-query?name=${encodeURIComponent(host)}&type=A`
];
const MEMO=30*60e3,best=new Map();
async function resolve(host,fetcher=fetch){
 const lists=await Promise.all(DOH.map(async make=>{try{const r=await fetcher(make(host),{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(4000)});if(!r.ok)return [];const d=await r.json();return (d?.Answer||[]).filter(a=>a?.type===1&&net.isIPv4(String(a.data))).map(a=>String(a.data));}catch{return [];}}));
 return [...new Set(lists.flat())].slice(0,8);
}
/* first address that accepts a TCP connection on 443 */
function fastest(ips,timeout=3000){
 return new Promise(done=>{if(!ips.length)return done('');let left=ips.length,won=false;const sockets=[];
  const finish=ip=>{if(won)return;won=true;for(const s of sockets)s.destroy();done(ip);};
  for(const ip of ips){const s=net.connect({host:ip,port:443});sockets.push(s);s.setTimeout(timeout);
   s.once('connect',()=>finish(ip));const lost=()=>{s.destroy();if(--left===0)finish('');};s.once('error',lost);s.once('timeout',lost);}
 });
}
async function pick(host,options={}){
 const memo=best.get(host);if(memo&&Date.now()-memo.at<MEMO)return memo.ip;
 const ip=await fastest(await resolve(host,options.doh||fetch));if(ip)best.set(host,{ip,at:Date.now()});return ip;
}
function viaIp(url,ip,{timeout=12000,max=3*1024*1024}={}){
 return new Promise((ok,fail)=>{
  const u=new URL(url);
  const req=https.request({host:u.hostname,servername:u.hostname,path:u.pathname+u.search,method:'GET',lookup:(h,o,cb)=>o&&o.all?cb(null,[{address:ip,family:4}]):cb(null,ip,4),
   headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MeguLit','accept':'text/html,application/xhtml+xml','accept-encoding':'gzip, deflate, br','accept-language':'ja,en;q=0.8'},timeout},res=>{
   if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return ok({redirect:new URL(res.headers.location,url).href});}
   const enc=String(res.headers['content-encoding']||''),stream=enc.includes('br')?res.pipe(zlib.createBrotliDecompress()):enc.includes('gzip')?res.pipe(zlib.createGunzip()):enc.includes('deflate')?res.pipe(zlib.createInflate()):res;
   const parts=[];let size=0;stream.on('data',c=>{size+=c.length;if(size>max){req.destroy();fail(Error('TOO_LARGE'));}else parts.push(c);});
   stream.on('end',()=>ok({status:res.statusCode,type:String(res.headers['content-type']||''),body:Buffer.concat(parts)}));stream.on('error',fail);});
  req.on('timeout',()=>req.destroy(Error('TIMEOUT')));req.on('error',fail);req.end();
 });
}
/* GET a page as text. options.fetch: plain fallback; options.doh: fetch used for DoH (tests). */
async function getText(url,options={}){
 let target=url;
 for(let hop=0;hop<4;hop++){
  const u=new URL(target);if(u.protocol!=='https:')break;
  const ip=await pick(u.hostname,options).catch(()=>'');if(!ip)break;
  try{const r=await viaIp(target,ip,options);if(r.redirect){target=r.redirect;continue;}if(r.status>=200&&r.status<300)return {ok:true,url:target,text:r.body.toString('utf8'),via:'fast'};break;}
  catch{best.delete(u.hostname);break;}
 }
 const fetcher=options.fetch||fetch;
 try{const r=await fetcher(url,{headers:{'user-agent':'Mozilla/5.0 MeguLit',accept:'text/html'},signal:AbortSignal.timeout(options.timeout||15000)});if(!r.ok)return {ok:false,error:'HTTP_'+r.status};return {ok:true,url:r.url||url,text:await r.text(),via:'direct'};}
 catch(e){return {ok:false,error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
module.exports={getText,resolve,fastest,pick,_best:best};
