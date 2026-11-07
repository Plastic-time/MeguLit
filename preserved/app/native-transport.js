(function installNativeTransport(){
 'use strict';
 if(window.__tomoyoTransport)return;
 const originalFetch=window.fetch.bind(window);let bypass=0;
 const reading=new Set(['tokenize_text','lookup_at_position','lookup_exact','scan_sentence']);
 const persistNative=settings=>{try{window.__tomoyoTranslateRequest(JSON.stringify({type:'nativeSettings',settings}));}catch{}};
 const state=window.__tomoyoTransport={installed:false,fallbackHook:false,requests:0,commands:new Set(),error:''};
 window.__tomoyoNativeInvoke=(...args)=>{bypass++;try{return window.__TAURI_INTERNALS__.invoke(...args);}finally{bypass--;}};
 function command(input){try{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.hostname!=='ipc.localhost'&&u.protocol!=='ipc:')return '';return decodeURIComponent(u.pathname.replace(/^\//,''));}catch{return '';}}
 function payload(body){if(typeof body!=='string')body=new TextDecoder().decode(body);return JSON.parse(body||'{}');}
 function reply(value,ok){return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json','Tauri-Response':ok?'ok':'error'}});}
 async function full(cmd,args){
  const until=Date.now()+15000;
  while(!window.__tomoyoChinese?.learningInstalled||typeof window.__tomoyoInvoke!=='function'){
   if(Date.now()>until)throw Error('Full 接口未准备好，已停止旧辞书代替运行');await new Promise(resolve=>setTimeout(resolve,20));
  }
  return window.__tomoyoInvoke(cmd,args);
 }
 window.fetch=async(input,init={})=>{
  if(bypass)return originalFetch(input,init);
  const cmd=command(input);if(!cmd)return originalFetch(input,init);
  state.requests++;state.commands.add(cmd);
  if(cmd==='plugin:clipboard-manager|read_text'&&window.__tomoyoChinese?.hookActive===true)return reply(window.__tomoyoChinese.hookSourceText||'',true);
  if(reading.has(cmd)){
   try{return reply(await full(cmd,payload(init.body)),true);}catch(error){return reply(error.message||'Full 本地查词失败',false);}
  }
  if(cmd==='save_settings')try{
   const args=payload(init.body);if(args.settings)persistNative(args.settings);if(args.settings&&window.__tomoyoMode?.restoreNativeSettings)args.settings=window.__tomoyoMode.restoreNativeSettings(args.settings);
   init={...init,body:JSON.stringify(args)};
  }catch{}
  const response=await originalFetch(input,init);
  if(cmd==='get_settings'&&response.headers.get('Tauri-Response')==='ok')return new Proxy(response,{get(target,key){
   if(key==='json')return async()=>{const settings=await target.json();return window.__tomoyoMode?.prepareNativeSettings?.(settings)||settings;};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  return response;
 };
 state.installed=window.fetch!==originalFetch;
 // Some Tauri installations switch to WebView postMessage after a native
 // protocol error. Intercept only dictionary messages if that method is writable.
 function fallback(){
  const host=window.chrome?.webview;if(!host?.postMessage)return;
  const original=host.postMessage.bind(host),handler=data=>{
   let m;try{m=typeof data==='string'?JSON.parse(data):data;}catch{return original(data);}
   if(!bypass&&m?.cmd==='plugin:clipboard-manager|read_text'&&window.__tomoyoChinese?.hookActive===true){window.__TAURI_INTERNALS__.runCallback(m.callback,window.__tomoyoChinese.hookSourceText||'');return;}
   if(!bypass&&reading.has(m?.cmd)){
    full(m.cmd,m.payload).then(value=>window.__TAURI_INTERNALS__.runCallback(m.callback,value),error=>window.__TAURI_INTERNALS__.runCallback(m.error,error.message));return;
   }
   if(!bypass&&m?.cmd==='get_settings'&&window.__TAURI_INTERNALS__?.transformCallback){
    const internal=window.__TAURI_INTERNALS__,success=m.callback,failure=m.error;let ok,bad;
    ok=internal.transformCallback(value=>{internal.unregisterCallback(bad);internal.runCallback(success,window.__tomoyoMode?.prepareNativeSettings?.(value)||value);},true);
    bad=internal.transformCallback(error=>{internal.unregisterCallback(ok);internal.runCallback(failure,error);},true);
    m={...m,callback:ok,error:bad};return original(typeof data==='string'?JSON.stringify(m):m);
   }
   if(!bypass&&m?.cmd==='save_settings'&&m.payload?.settings&&window.__tomoyoMode?.restoreNativeSettings){persistNative(m.payload.settings);m={...m,payload:{...m.payload,settings:window.__tomoyoMode.restoreNativeSettings(m.payload.settings)}};return original(typeof data==='string'?JSON.stringify(m):m);}
   return original(data);
  };
  try{host.postMessage=handler;state.fallbackHook=host.postMessage===handler;}catch{}
 }
 fallback();document.addEventListener('DOMContentLoaded',fallback,{once:true});
})();
