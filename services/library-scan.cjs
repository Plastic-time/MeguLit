'use strict';
// One startup scan per service process; manual refresh remains repeatable.
class LibraryScans{
 constructor(scan){this.scan=scan;this.pending=null;this.startup=null;}
 run({startup=false}={}){
  if(startup&&this.startup)return this.startup;
  if(!this.pending){const job=Promise.resolve().then(()=>this.scan({incremental:startup}));this.pending=job;job.finally(()=>{if(this.pending===job)this.pending=null;}).catch(()=>{});}
  if(startup){this.startup=this.pending.catch(error=>{this.startup=null;throw error;});return this.startup;}
  return this.pending;
 }
}
module.exports={LibraryScans};
