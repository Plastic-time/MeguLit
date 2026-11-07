// SPDX-License-Identifier: GPL-3.0-or-later
(function(root,factory){const create=factory();if(typeof module==='object'&&module.exports)module.exports={createTaskbarSync:create};else root.__tomeCreateTaskbarSync=create;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 return function createTaskbarSync({invoke,hidden,notify,initial,schedule=setTimeout}){
  let busy=false,applied=initial,retry=null;
  function sync(){
   const wanted=hidden();if(busy||applied===wanted)return;
   const call=invoke();if(typeof call!=='function'){if(retry===null)retry=schedule(()=>{retry=null;sync();},250);return;}
   busy=true;
   Promise.resolve().then(()=>call(wanted)).then(()=>{applied=wanted;notify({hidden:wanted,applied:true});},error=>notify({hidden:wanted,applied:false,error:String(error)})).finally(()=>{
    busy=false;
    // Only a real mode change needs a follow-up. Old acknowledgements must never start competing retries.
    if(hidden()!==wanted)sync();
   });
  }
  return sync;
 };
});
