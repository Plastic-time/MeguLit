import {historyMessages} from './history-i18n.js';
export function mountHistoryTranslations({root,viewport,api,isCurrent,locale,Observer=globalThis.IntersectionObserver}){
 const w=historyMessages[locale],queue=[],queued=new Set();let stopped=false,working=false;
 const enqueue=node=>{if(stopped||queued.has(node))return;queued.add(node);queue.push(node);drain();};
 async function drain(){if(working||stopped)return;working=true;try{while(queue.length&&!stopped&&isCurrent()){const node=queue.shift(),status=node.querySelector('[data-history-status]'),retry=node.querySelector('[data-history-retry]');status.textContent=w.translating;retry.hidden=true;try{const result=await api('history_translate',{id:Number(node.dataset.historyId)});if(stopped||!isCurrent())break;status.textContent=result.text;node.querySelector('.dialogue-translation').classList.remove('is-missing');}catch{if(stopped||!isCurrent())break;status.textContent=w.failed;retry.hidden=false;queued.delete(node);}}}finally{working=false;}}
 const nodes=[...root.querySelectorAll('[data-history-id]')].filter(n=>n.querySelector('[data-history-status]'));
 const observer=Observer?new Observer(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);enqueue(e.target);}},{root:viewport,rootMargin:'40px'}):null;
 for(const node of nodes){node.querySelector('[data-history-retry]').onclick=()=>enqueue(node);observer?.observe(node);}if(!observer)nodes.slice(0,5).forEach(enqueue);
 return ()=>{stopped=true;observer?.disconnect();queue.length=0;};
}
