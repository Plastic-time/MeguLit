'use strict';

// Edge can leave the process that spawn() returned and continue under its own browser PID.
function stopLayoutBrowser(socket,launcher){
 let stopping;
 return ()=>stopping??=new Promise(resolve=>{
  const finish=()=>{clearTimeout(timer);socket.removeEventListener('close',finish);resolve();};
  const fallback=()=>{
   try{launcher.kill();}catch{}
   try{socket.close();}catch{}
   finish();
  };
  const timer=setTimeout(fallback,3000);
  socket.addEventListener('close',finish,{once:true});
  if(socket.readyState!==1){fallback();return;}
  try{socket.send(JSON.stringify({id:0,method:'Browser.close'}));}catch{fallback();}
 });
}
module.exports={stopLayoutBrowser};
