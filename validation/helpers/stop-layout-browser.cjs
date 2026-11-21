'use strict';
const fs=require('node:fs'),path=require('node:path');

function checkLayoutProfile(profile){
 if(fs.existsSync(path.join(profile,'DevToolsActivePort')))throw Error('EDGE_PROFILE_ALREADY_HAS_DEBUG_PORT');
}

// Edge can leave the process that spawn() returned and continue under its own browser PID.
function stopLayoutBrowser(socket,launcher){
 let stopping;
 return ()=>stopping??=new Promise(resolve=>{
  let disconnected=false;
  const exited=()=>launcher.exitCode!==null||launcher.signalCode!==null;
  const finish=()=>{clearTimeout(timer);socket.removeEventListener('close',onClose);launcher.removeListener('exit',onExit);resolve();};
  const onExit=()=>{if(disconnected)finish();};
  const onClose=()=>{disconnected=true;if(exited())finish();};
  const fallback=()=>{
   if(!exited())try{launcher.kill();}catch{}
   try{socket.close();}catch{}
   finish();
  };
  const timer=setTimeout(fallback,3000);
  launcher.once('exit',onExit);socket.addEventListener('close',onClose,{once:true});
  if(socket.readyState!==1){fallback();return;}
  try{socket.send(JSON.stringify({id:0,method:'Browser.close'}));}catch{fallback();}
 });
}
module.exports={stopLayoutBrowser,checkLayoutProfile};
