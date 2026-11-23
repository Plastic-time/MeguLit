/* Decorative work sleeps without changing the active scene or its visual settings. */
export function createUiGate({document:doc,window:win}={}){
 let state='active';const listeners=new Set(),events=[];
 const emit=()=>{const next=doc.hidden?'hidden':doc.hasFocus?.()===false?'idle':'active';if(next===state)return;state=next;if(doc.documentElement)doc.documentElement.dataset.ui=next;for(const fn of listeners)fn(next);};
 const listen=(target,name)=>{target?.addEventListener(name,emit);events.push(()=>target?.removeEventListener(name,emit));};
 listen(win,'focus');listen(win,'blur');listen(doc,'visibilitychange');
 if(doc.documentElement)doc.documentElement.dataset.ui=state;emit();
 return {get state(){return state;},subscribe(fn){listeners.add(fn);fn(state);return()=>listeners.delete(fn);},stop(){for(const off of events)off();listeners.clear();}};
}
export function createUiFrames(gate,{request=globalThis.requestAnimationFrame?.bind(globalThis),cancel=globalThis.cancelAnimationFrame?.bind(globalThis)}={}){
 let serial=0;const waiting=new Map();const active=()=>!gate||gate.state==='active';
 const queue=(id,job)=>{if(active()&&request)job.native=request(time=>{waiting.delete(id);job.fn(time);});};
 const off=gate?.subscribe(state=>{for(const [id,job] of waiting){if(state==='active'){if(!job.native)queue(id,job);}else{if(job.native)cancel?.(job.native);job.native=0;}}});
 return {request(fn){const id=++serial,job={fn,native:0};waiting.set(id,job);queue(id,job);return id;},cancel(id){const job=waiting.get(id);if(job?.native)cancel?.(job.native);waiting.delete(id);},stop(){off?.();for(const id of waiting.keys())this.cancel(id);},get pending(){return waiting.size;}};
}
const gate=typeof document!=='undefined'&&typeof window!=='undefined'?createUiGate({document,window}):null;
const frames=createUiFrames(gate);
export const requestUiFrame=fn=>frames.request(fn);
export const cancelUiFrame=id=>frames.cancel(id);
export const onUiState=fn=>gate?gate.subscribe(fn):(fn('active'),()=>{});
export const uiActive=()=>!gate||gate.state==='active';
