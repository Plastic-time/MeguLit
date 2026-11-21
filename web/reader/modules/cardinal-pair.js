// SPDX-License-Identifier: GPL-3.0-or-later
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.install(root);})(typeof window==='object'?window:this,function(){
 'use strict';
 const normal=value=>String(value??'').normalize('NFKC').replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g,'$1').replace(/《[^》]*》|\[[^\]]*\]|<[^>]*>/g,'').replace(/[\s\u3000\u200b\u001f]+/g,'').replace(/^[「『“"（(【]+|[」』”"）)】]+$/g,'');
 function install(w){const b=w.__tomoyoChinese,d=w.document;if(!b){d.addEventListener('DOMContentLoaded',()=>install(w),{once:true});return;}if(b.cardinalPair)return;const bindings=new Map(),client='dom-'+Math.random().toString(36).slice(2)+'-'+Date.now().toString(36);let current=null,policy='',revision=0,queued=false;
  const send=message=>{try{w.__tomoyoTranslateRequest(JSON.stringify(message));}catch{}};
  const flags=()=>({enabled:b.isEnabled?.()!==false,visible:b.isTranslationVisible?.()!==false});
  const target=()=>b.translationTarget?.()||'zh';
  function refresh(){if(!current)return;const f=flags(),next=target()+'|'+f.enabled+'|'+f.visible;if(next!==policy){policy=next;send({type:'cardinalPairPolicy',schema:1,client,revision:++revision,target:target(),...f});}schedule();}
  function visible(node){if(!node?.isConnected||d.visibilityState!=='visible'||node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})===false)return false;for(let el=node;el;el=el.parentElement){const css=w.getComputedStyle(el);if(el.hidden||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number(css.opacity)===0)return false;}const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<w.innerWidth&&r.top<w.innerHeight;}
  function text(node){if(!visible(node))return '';let value='';const css=w.getComputedStyle(node),transparent=color=>color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0*)?\s*\)$/.test(color||'');for(const child of node.childNodes||[]){if(child.nodeType===3){if(!transparent(css.color)&&!transparent(css.webkitTextFillColor))value+=child.textContent||'';}else if(child.nodeType===1&&child.tagName!=='RT'&&child.tagName!=='RP')value+=text(child);}return value;}
  function check(binding){const meta=binding.meta,f=flags();if(!meta||meta.target!==target())return;const observed=visible(binding.jp)&&normal(text(binding.jp))===normal(meta.body),translation=observed&&visible(binding.cn)&&binding.cn.dataset.state==='ready'?text(binding.cn).trim():'';
   const paired=!!translation&&translation.length<=4000&&!/^(?:翻译中…|等待翻译…)$/.test(translation),message={type:'cardinalPair',schema:1,episode:meta.episode,scope:meta.scope,target:meta.target,sourceKey:meta.sourceKey,observed,paired:paired&&f.enabled&&f.visible,translation:translation.slice(0,4000),...f};
   const stamp=JSON.stringify(message);if(stamp===binding.sent)return;binding.sent=stamp;send(message);}
  function flush(){queued=false;for(const [id,binding]of bindings){if(!binding.jp?.isConnected){binding.observer?.disconnect();bindings.delete(id);continue;}check(binding);}}
  function schedule(){if(queued||!bindings.size)return;queued=true;w.requestAnimationFrame(flush);}
  const exclude=()=>{const f=flags();if(current&&(!f.enabled||!f.visible))check({meta:current,jp:null,cn:null});};
  b.cardinalPairScope=result=>{if(result?.client!==client||result.revision!==revision||!result.descriptor||result.descriptor.episode!==current?.episode)return;current=result.descriptor;const binding=bindings.get(current.episode);if(binding){binding.meta=current;binding.sent='';}exclude();schedule();};
  b.cardinalPair={source(message){if(!message?.cardinalPair)return;const session=current?.episode?.split(':')[0];current=message.cardinalPair;if(current.episode?.split(':')[0]!==session)policy='';refresh();exclude();},refresh,
   bind(meta,jp,cn){meta=meta||current;if(!meta||!jp)return;if(meta.episode===current?.episode)meta=current;let binding=bindings.get(meta.episode);if(!binding||binding.jp!==jp||binding.cn!==cn){binding?.observer?.disconnect();binding={meta,jp,cn,sent:''};if(w.MutationObserver){binding.observer=new w.MutationObserver(schedule);for(const node of [jp,cn])if(node)binding.observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','data-state']});}bindings.set(meta.episode,binding);}else binding.meta=meta;
    if(bindings.size>420){const id=bindings.keys().next().value;bindings.get(id).observer?.disconnect();bindings.delete(id);}refresh();schedule();},
   notify:schedule};
  d.addEventListener('visibilitychange',schedule);w.addEventListener('megulit-reveal-progress',schedule);
 }
 return {install,normal};
});
