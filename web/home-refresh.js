// Refresh data without remounting an unchanged home or its activity chart.
const overviewMarkup=new WeakMap();
export function updateHomeOverview(main,html){
 const overview=main.querySelector('.home-overview');
 if(overview&&overviewMarkup.get(overview)===html)return false;
 const template=main.ownerDocument.createElement('template');template.innerHTML=html;
 const next=template.content.querySelector('.home-overview');
 if(overview&&main.querySelector('#home-activity'))overview.replaceWith(next);
 else main.replaceChildren(template.content);
 overviewMarkup.set(next,html);
 return true;
}
export function createHomeRefresh({load,apply,view}){
 let pending=null;
 return ()=>{
  const token=view();if(token===null)return Promise.resolve();
  if(pending?.token===token)return pending.job;
  const job=Promise.resolve().then(load).then(data=>{if(view()===token)return apply(data);});
  const request={token,job};pending=request;
  job.finally(()=>{if(pending===request)pending=null;}).catch(()=>{});
  return job;
 };
}
