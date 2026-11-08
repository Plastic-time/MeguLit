// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Extra translation engines (list follows LunaTranslator's online / API / LLM engines).
// kind: llm = OpenAI-compatible chat API, mt = machine translation API, free = no key needed.
const {createHash,createHmac,randomUUID}=require('node:crypto');

const ENGINES={
 // free
 microsoft:{label:'微软 Edge 翻译（免费）',group:'free',kind:'mt',keyless:true,baseUrl:'https://edge.microsoft.com'},
 // machine translation APIs
 baiduapi:{label:'百度翻译 API',group:'api',kind:'mt',baseUrl:'https://fanyi-api.baidu.com',pair:true,hint:'填「APP ID:密钥」，在百度翻译开放平台申请，标准版免费额度'},
 youdaoapi:{label:'有道智云 API',group:'api',kind:'mt',baseUrl:'https://openapi.youdao.com',pair:true,hint:'填「应用ID:应用密钥」，在有道智云控制台创建应用'},
 tencentapi:{label:'腾讯云机器翻译 API',group:'api',kind:'mt',baseUrl:'https://tmt.tencentcloudapi.com',pair:true,hint:'填「SecretId:SecretKey」，腾讯云每月有免费字符额度'},
 aliyunapi:{label:'阿里云机器翻译 API',group:'api',kind:'mt',baseUrl:'https://mt.cn-hangzhou.aliyuncs.com',pair:true,hint:'填「AccessKey ID:AccessKey Secret」，需开通机器翻译服务'},
 caiyunapi:{label:'彩云小译 API',group:'api',kind:'mt',baseUrl:'https://api.interpreter.caiyunai.com',hint:'填彩云小译开放平台的 Token'},
 xiaoniu:{label:'小牛翻译 API',group:'api',kind:'mt',baseUrl:'https://api.niutrans.com',hint:'填小牛翻译开放平台的 API-KEY'},
 googleapi:{label:'Google Cloud 翻译 API',group:'api',kind:'mt',baseUrl:'https://translation.googleapis.com',hint:'填 Google Cloud 控制台里启用了 Cloud Translation 的 API Key'},
 yandexapi:{label:'Yandex 翻译 API',group:'api',kind:'mt',baseUrl:'https://translate.api.cloud.yandex.net',hint:'填 Yandex Cloud 服务账号的 API Key'},
 // LLMs (OpenAI-compatible)
 gemini:{label:'Google Gemini',group:'llm',kind:'llm',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-2.5-flash',hint:'填 Google AI Studio 的 API Key'},
 claude:{label:'Anthropic Claude',group:'llm',kind:'llm',baseUrl:'https://api.anthropic.com/v1',model:'claude-haiku-4-5',hint:'填 Anthropic Console 的 API Key（使用官方 OpenAI 兼容接口）'},
 qwen:{label:'通义千问（阿里云百炼）',group:'llm',kind:'llm',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus',hint:'填阿里云百炼的 API Key'},
 kimi:{label:'Kimi（月之暗面）',group:'llm',kind:'llm',baseUrl:'https://api.moonshot.cn/v1',model:'kimi-latest',hint:'填 Moonshot 开放平台的 API Key'},
 glm:{label:'智谱 GLM',group:'llm',kind:'llm',baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4-flash',hint:'填智谱开放平台的 API Key；glm-4-flash 免费'},
 siliconflow:{label:'硅基流动 SiliconFlow',group:'llm',kind:'llm',baseUrl:'https://api.siliconflow.cn/v1',model:'Qwen/Qwen2.5-7B-Instruct',hint:'填硅基流动的 API Key，可用多种开源模型'},
 doubao:{label:'豆包（火山方舟）',group:'llm',kind:'llm',baseUrl:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-1-5-lite-32k-250115',hint:'填火山方舟控制台的 API Key；模型名可换成你开通的豆包模型或接入点 ID'},
 grok:{label:'xAI Grok',group:'llm',kind:'llm',baseUrl:'https://api.x.ai/v1',model:'grok-3-mini',hint:'填 xAI Console 的 API Key'},
 mistral:{label:'Mistral AI',group:'llm',kind:'llm',baseUrl:'https://api.mistral.ai/v1',model:'mistral-small-latest',hint:'填 Mistral La Plateforme 的 API Key'},
 openrouter:{label:'OpenRouter',group:'llm',kind:'llm',baseUrl:'https://openrouter.ai/api/v1',model:'google/gemini-2.5-flash',hint:'填 OpenRouter 的 API Key，模型名写 厂商/模型'},
 // local
 sakura:{label:'Sakura 本地翻译模型',group:'local',kind:'llm',baseUrl:'http://127.0.0.1:8080/v1',model:'sakura',keyless:true,editable:true,hint:'在下方「离线模型下载」下载运行库和一个模型后，MeguLit 会自动在 127.0.0.1:8080 启动本地服务；专为日文轻小说、Galgame 翻译成中文训练'},
 llamacpp:{hidden:true,label:'llama.cpp 本地服务（通用模型）',group:'local',kind:'llm',baseUrl:'http://127.0.0.1:8080/v1',model:'local',keyless:true,editable:true,hint:'下载运行库后，MeguLit 会用已下载的模型自动启动 llama-server；也可以填你自己启动的服务地址。日译中专用模型请选上面的 Sakura'},
 ollama:{label:'Ollama 本地模型',group:'local',kind:'llm',baseUrl:'http://127.0.0.1:11434/v1',model:'qwen2.5:7b',keyless:true,editable:true,hint:'先运行 Ollama 并拉取模型，模型名与 ollama list 一致'},
 lmstudio:{label:'LM Studio 本地模型',group:'local',kind:'llm',baseUrl:'http://127.0.0.1:1234/v1',model:'',keyless:true,editable:true,hint:'在 LM Studio 里加载模型并开启本地服务，模型名填加载的模型'},
};
const GROUPS={free:'免费',api:'翻译 API',llm:'大模型',local:'本地 / 离线'};
const SAKURA_SYSTEM='你是一个轻小说翻译模型，可以流畅通顺地以日本轻小说的风格将日文翻译成简体中文，并联系上下文正确使用人称代词，不擅自添加原文中没有的代词。';

function splitPair(key){const m=/^\s*([^:：|\s]+)\s*[:：|]\s*(\S+)\s*$/.exec(key||'');if(!m)throw Error('密钥格式应为「ID:密钥」（中间用英文冒号）');return [m[1],m[2]];}
const md5=v=>createHash('md5').update(v,'utf8').digest('hex'),sha256=v=>createHash('sha256').update(v,'utf8').digest('hex');
const hmac=(key,v,enc)=>createHmac('sha256',key).update(v,'utf8').digest(enc);
async function json(response,name){if(!response.ok){if([401,403].includes(response.status))throw Error(name+' 密钥无效或没有权限');if([402,429].includes(response.status))throw Error(name+' 额度不足或请求过快');throw Error(name+' 请求失败：HTTP '+response.status);}return response.json();}
const form=o=>new URLSearchParams(o).toString();

// lang: the learner language ('zh' or 'en'); every engine names the same two targets differently.
async function machineTranslate(id,text,apiKey,fetcher,signal,lang='zh'){
 const opt={redirect:'error',signal},en=lang==='en';
 switch(id){
  case 'microsoft':return require('./translate.cjs').translateFree(text,{fetcher,signal,source:'ja',target:lang,preferred:'microsoft'});
  case 'baiduapi':{
   const [appid,key]=splitPair(apiKey),salt=String(Date.now());
   const b=await json(await fetcher('https://fanyi-api.baidu.com/api/trans/vip/translate',{...opt,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({q:text,from:'jp',to:en?'en':'zh',appid,salt,sign:md5(appid+text+salt+key)})}),'百度翻译');
   if(b.error_code&&b.error_code!=='52000')throw Error('百度翻译错误 '+b.error_code+'：'+(b.error_msg||''));return (b.trans_result||[]).map(x=>x.dst).join('\n');}
  case 'youdaoapi':{
   const [appKey,secret]=splitPair(apiKey),salt=randomUUID(),curtime=String(Math.floor(Date.now()/1000)),chars=[...text],input=chars.length<=20?text:chars.slice(0,10).join('')+chars.length+chars.slice(-10).join('');
   const b=await json(await fetcher('https://openapi.youdao.com/api',{...opt,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({q:text,from:'ja',to:en?'en':'zh-CHS',appKey,salt,curtime,signType:'v3',sign:sha256(appKey+input+salt+curtime+secret)})}),'有道智云');
   if(b.errorCode&&b.errorCode!=='0')throw Error('有道智云错误码 '+b.errorCode);return (b.translation||[]).join('\n');}
  case 'tencentapi':{
   const [sid,skey]=splitPair(apiKey),host='tmt.tencentcloudapi.com',service='tmt',ts=Math.floor(Date.now()/1000),date=new Date(ts*1000).toISOString().slice(0,10);
   const payload=JSON.stringify({SourceText:text,Source:'ja',Target:en?'en':'zh',ProjectId:0});
   const canonical=['POST','/','','content-type:application/json; charset=utf-8\nhost:'+host+'\n','content-type;host',sha256(payload)].join('\n');
   const scope=date+'/'+service+'/tc3_request',toSign=['TC3-HMAC-SHA256',ts,scope,sha256(canonical)].join('\n');
   const kDate=hmac('TC3'+skey,date),kService=hmac(kDate,service),kSign=hmac(kService,'tc3_request'),signature=hmac(kSign,toSign,'hex');
   const b=await json(await fetcher('https://'+host,{...opt,method:'POST',headers:{'Content-Type':'application/json; charset=utf-8',Host:host,'X-TC-Action':'TextTranslate','X-TC-Version':'2018-03-21','X-TC-Region':'ap-guangzhou','X-TC-Timestamp':String(ts),Authorization:`TC3-HMAC-SHA256 Credential=${sid}/${scope}, SignedHeaders=content-type;host, Signature=${signature}`},body:payload}),'腾讯翻译');
   if(b?.Response?.Error)throw Error('腾讯翻译：'+b.Response.Error.Message);return b?.Response?.TargetText;}
  case 'aliyunapi':{
   const [akid,secret]=splitPair(apiKey),enc=v=>encodeURIComponent(v).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   const p={AccessKeyId:akid,Action:'TranslateGeneral',Format:'JSON',FormatType:'text',Scene:'general',SignatureMethod:'HMAC-SHA1',SignatureNonce:randomUUID(),SignatureVersion:'1.0',SourceLanguage:'ja',SourceText:text,TargetLanguage:en?'en':'zh',Timestamp:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),Version:'2018-10-12'};
   const query=Object.keys(p).sort().map(k=>enc(k)+'='+enc(p[k])).join('&'),sig=createHmac('sha1',secret+'&').update('POST&%2F&'+enc(query)).digest('base64');
   const b=await json(await fetcher('https://mt.cn-hangzhou.aliyuncs.com/',{...opt,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:query+'&Signature='+enc(sig)}),'阿里云翻译');
   if(b.Code&&String(b.Code)!=='200')throw Error('阿里云翻译：'+(b.Message||b.Code));return b?.Data?.Translated;}
  case 'caiyunapi':{
   const b=await json(await fetcher('https://api.interpreter.caiyunai.com/v1/translator',{...opt,method:'POST',headers:{'Content-Type':'application/json','x-authorization':'token '+apiKey},body:JSON.stringify({source:[text],trans_type:en?'ja2en':'ja2zh',request_id:'tome',detect:true})}),'彩云小译');
   return b?.target?.[0];}
  case 'xiaoniu':{
   const b=await json(await fetcher('https://api.niutrans.com/NiuTransServer/translation',{...opt,method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({from:'ja',to:en?'en':'zh',apikey:apiKey,src_text:text})}),'小牛翻译');
   if(b.error_code)throw Error('小牛翻译：'+(b.error_msg||b.error_code));return b.tgt_text;}
  case 'googleapi':{
   const b=await json(await fetcher('https://translation.googleapis.com/language/translate/v2?key='+encodeURIComponent(apiKey),{...opt,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:text,source:'ja',target:en?'en':'zh-CN',format:'text'})}),'Google Cloud 翻译');
   return b?.data?.translations?.[0]?.translatedText;}
  case 'yandexapi':{
   const b=await json(await fetcher('https://translate.api.cloud.yandex.net/translate/v2/translate',{...opt,method:'POST',headers:{'Content-Type':'application/json',Authorization:'Api-Key '+apiKey},body:JSON.stringify({sourceLanguageCode:'ja',targetLanguageCode:en?'en':'zh',texts:[text]})}),'Yandex 翻译');
   return b?.translations?.[0]?.text;}
 }
 throw Error('未知翻译引擎');
}
module.exports={ENGINES,GROUPS,SAKURA_SYSTEM,machineTranslate,splitPair};
