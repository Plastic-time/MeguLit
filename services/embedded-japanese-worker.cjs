// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* One bounded job per child. Cancellation terminates this process; completion is
   published by the parent only after close, so no scan continues behind the UI. */
process.once('message',message=>{
 let result,error;
 const progress=value=>process.send?.({type:'progress',value});
 try{
  if(message.operation==='scan')result=require('./embedded-japanese.cjs').scan(message.dir,{progress});
  else if(message.operation==='restore')result=require('../core/japanese-restore.cjs').apply(message.dir,{embeddedScanToken:message.scanToken,embeddedProgress:progress});
  else if(message.operation==='undo')result=require('../core/japanese-restore.cjs').restore(message.dir);
  else throw Error('EMBEDDED_JOB_OPERATION');
 }catch(e){error=String(e.message||e);}
 process.send?.({type:'result',result,error},()=>process.disconnect());
});
process.on('disconnect',()=>process.exit(0));
