/* The hidden, prewarmed reader has no interval wakeups until a game is bound. */
(()=>{
 const create=({set=globalThis.setInterval,clear=globalThis.clearInterval}={})=>{
  let bound=false,serial=0;const jobs=new Map();
  const start=job=>{if(bound&&!job.native)job.native=set(job.fn,job.ms,...job.args);};
  return {set(fn,ms,...args){const id=++serial,job={fn,ms,args,native:0};jobs.set(id,job);start(job);return id;},clear(id){const job=jobs.get(id);if(job?.native)clear(job.native);jobs.delete(id);},setBound(value){bound=value===true;for(const job of jobs.values()){if(bound)start(job);else if(job.native){clear(job.native);job.native=0;}}},get active(){return bound;},get count(){return jobs.size;},get running(){return [...jobs.values()].filter(job=>job.native).length;}};
 };
 window.__megulitCreateReaderIntervals=create;
 window.__megulitReaderIntervals=create();
})();
