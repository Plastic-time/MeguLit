export function createLibraryRefresh({api,onUpdated,onBusy=()=>{}}){
 let pending=null;
 return options=>{
  if(pending)return pending;
  onBusy(true);
  const job=(async()=>{const result=await api('library_scan',{startup:options?.startup===true});const home=await api('home');await onUpdated(home,result);return result;})();
  pending=job;job.finally(()=>{if(pending===job){pending=null;onBusy(false);}}).catch(()=>{});return job;
 };
}
