'use strict';
// One startup scan per service process; manual refresh remains repeatable.
class LibraryScans{
 constructor(scan){this.scan=scan;this.pending=null;this.startup=null;this.foldersChanged=false;}
 invalidateFolders(){this.startup=null;this.foldersChanged=!!this.pending;}
 run({startup=false}={}){
  if(this.pending&&this.foldersChanged){
   const refresh=()=>this.run({startup});
   return this.pending.then(refresh,refresh);
  }
  if(startup&&this.startup)return this.startup;
  if(!this.pending){this.foldersChanged=false;const job=Promise.resolve().then(()=>this.scan({incremental:startup}));this.pending=job;job.finally(()=>{if(this.pending===job)this.pending=null;}).catch(()=>{});}
  if(startup){this.startup=this.pending.catch(error=>{this.startup=null;throw error;});return this.startup;}
  return this.pending;
 }
}
module.exports={LibraryScans};
