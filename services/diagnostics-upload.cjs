// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E362 pluggable upload of a diagnostic package: upload(zipPath, meta) → {state,...}.

   Endpoint (never hard-coded): data/config/diagnostics-upload.json
     {"endpoint":"https://<domain>/api/diagnostics","token":"<optional shared key>"}
   or the MEGULIT_DIAGNOSTICS_ENDPOINT / MEGULIT_DIAGNOSTICS_TOKEN environment variables. With neither, upload() returns
   {state:'not-configured'} and the UI tells the user the zip is ready to send by hand (QQ群 / 邮件 / GitHub Issue).

   Request to the future Cloudflare Worker relay (reachable from China, unlike GitHub):
     POST https://<domain>/api/diagnostics
     Content-Type: multipart/form-data
     Authorization: Bearer <token>          (only when a token is configured)
     X-MeguLit-Version: <version>
     parts:
       meta  application/json  {"schema":1,"app":"MeguLit","version":"1.2.8d","game":{"id","title","engine"},
                                "os":"10.0.26100","size":12345,"sha256":"<hex of the zip>","createdAt":"<ISO>","note":"<user text>"}
       file  application/zip   MeguLit-diag-<game>-<stamp>.zip   (≤ 10 MB)
   Response 200/201 JSON: {"ok":true,"issueUrl":"https://github.com/<owner>/<repo>/issues/<n>","id":"<relay id>"}
   Errors: any non-2xx, or {"ok":false,"error":"<CODE>"}; 413 means too large, 429 rate limited.
   The Worker verifies sha256 and size, stores the zip (R2), and opens the GitHub issue with the meta and a download link. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_BYTES=10*1024*1024,TIMEOUT_MS=60000;
function config(root){
 let saved={};try{saved=JSON.parse(fs.readFileSync(path.join(root,'data','config','diagnostics-upload.json'),'utf8'))||{};}catch{}
 /* E394 with nothing configured, MeguLit's own relay (api.megulit.com): the upload used to stop at "not configured" and
    point people to GitHub, which many cannot open */
 let relay='';try{relay=require('./relay-config.cjs').endpoint(root,'/api/diagnostics');}catch{}
 const endpoint=String(process.env.MEGULIT_DIAGNOSTICS_ENDPOINT||saved.endpoint||relay||'').trim(),token=String(process.env.MEGULIT_DIAGNOSTICS_TOKEN||saved.token||'').trim();
 return {endpoint:/^https:\/\/[^\s/]+\/\S*$/i.test(endpoint)&&!endpoint.includes('<')?endpoint:'',token};
}
function requestMeta(buffer,meta={}){
 return {schema:1,app:'MeguLit',version:String(meta.version||''),game:{id:String(meta.game?.id||''),title:String(meta.game?.title||'').slice(0,200),engine:String(meta.game?.engine||'')},os:String(meta.os||require('node:os').release()),size:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),createdAt:new Date().toISOString(),note:String(meta.note||'').slice(0,2000)};
}
async function upload(zipPath,meta={},{root=meta.root,fetcher=globalThis.fetch}={}){
 const {endpoint,token}=config(root||path.resolve(__dirname,'..'));
 if(!endpoint)return {state:'not-configured'};
 let buffer;try{buffer=fs.readFileSync(zipPath);}catch{return {state:'failed',error:'DIAGNOSTICS_NOT_FOUND'};}
 if(buffer.length>MAX_BYTES)return {state:'failed',error:'TOO_LARGE'};
 const body=new FormData(),info=requestMeta(buffer,meta);
 body.append('meta',new Blob([JSON.stringify(info)],{type:'application/json'}),'meta.json');
 body.append('file',new Blob([buffer],{type:'application/zip'}),path.basename(zipPath));
 const headers={'X-MeguLit-Version':info.version};if(token)headers.Authorization='Bearer '+token;
 try{
  const response=await fetcher(endpoint,{method:'POST',body,headers,signal:AbortSignal.timeout(TIMEOUT_MS)});let data={};try{data=await response.json();}catch{}
  if(!response.ok||data.ok===false)return {state:'failed',error:String(data.error||('HTTP_'+response.status)).slice(0,80)};
  const issue=/^https:\/\//.test(String(data.issueUrl||''))?String(data.issueUrl):'';
  return {state:'uploaded',issueUrl:issue,id:String(data.id||'')};
 }catch(error){return {state:'failed',error:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
module.exports={upload,config,requestMeta,MAX_BYTES};
