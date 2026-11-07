// Adapt legacy overlay commands at the IPC transport boundary. Tauri's public internals stay immutable.
const commands=new Set(['get_settings','save_settings','word_states','tokenize_text','lookup_at_position','lookup_exact','scan_sentence','plugin:dialog|open','plugin:clipboard-manager|read_text','plugin:clipboard-manager|write_text']);
function handles(command,args){return commands.has(command)||command.startsWith('plugin:sql|')||command.startsWith('plugin:window|')&&(!args.label||args.label==='main'||command==='plugin:window|set_skip_taskbar'&&args.label==='reader'&&args.value!==true);}
function ipcCommand(input){try{const url=new URL(typeof input==='string'?input:input.url);if(url.hostname!=='ipc.localhost'&&url.protocol!=='ipc:')return '';return decodeURIComponent(url.pathname.replace(/^\//,''));}catch{return '';}}
export function installHostTransport(invoke,env=window){
 const original=env.fetch.bind(env),internal=env.__TAURI_INTERNALS__;
 const respond=(value,ok)=>new Response(JSON.stringify(value??null),{headers:{'Content-Type':'application/json','Tauri-Response':ok?'ok':'error'}});
 env.fetch=async(input,init={})=>{
  const command=ipcCommand(input);if(!command)return original(input,init);
  let args;try{const body=init.body;args=JSON.parse(typeof body==='string'?body:new TextDecoder().decode(body));}catch{return original(input,init);}
  if(!handles(command,args))return original(input,init);
  try{return respond(await invoke(command,args),true);}catch(error){return respond(error?.message||String(error),false);}
 };
 // Tauri 2 uses window.ipc.postMessage if its custom protocol is unavailable.
 // This optional wrapper preserves the native callback lifecycle and never changes internal.invoke/ipc.
 const ipc=env.ipc;if(ipc?.postMessage){const post=ipc.postMessage.bind(ipc),wrapped=data=>{
  let message;try{message=typeof data==='string'?JSON.parse(data):data;}catch{return post(data);}
  if(!message||typeof message.cmd!=='string'||!handles(message.cmd,message.payload||{}))return post(data);
  Promise.resolve().then(()=>invoke(message.cmd,message.payload||{})).then(value=>internal.runCallback(message.callback,value),error=>internal.runCallback(message.error,error?.message||String(error)));
 };
 try{ipc.postMessage=wrapped;}catch{}
 }
}
