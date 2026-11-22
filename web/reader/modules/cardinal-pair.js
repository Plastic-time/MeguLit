// SPDX-License-Identifier: GPL-3.0-or-later
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else api.install(root);})(typeof window==='object'?window:this,function(){
 'use strict';
 const normal=value=>String(value??'').normalize('NFKC').replace(/[｜|]([^《\[｜|]+)[《\[][^》\]]*[》\]]/g,'$1').replace(/《[^》]*》|\[[^\]]*\]|<[^>]*>/g,'').replace(/[\s\u3000\u200b\u001f]+/g,'').replace(/^[「『“"（(【]+|[」』”"）)】]+$/g,'');
 function install(w){const b=w.__tomoyoChinese,d=w.document;if(!b){d.addEventListener('DOMContentLoaded',()=>install(w),{once:true});return;}if(b.cardinalPair)return;const bindings=new Map(),client='dom-'+Math.random().toString(36).slice(2)+'-'+Date.now().toString(36);let current=null,policy='',revision=0,queued=false;
  const send=message=>{try{w.__tomoyoTranslateRequest(JSON.stringify(message));}catch{}};
  const flags=()=>{try{const enabled=b.isEnabled?.(),visible=b.isTranslationVisible?.();return typeof enabled==='boolean'&&typeof visible==='boolean'?{enabled,visible}:null;}catch{return null;}};
  const target=()=>b.translationTarget?.()||'zh';
  function refresh(){if(!current)return;const f=flags();if(!f){policy='';return;}const next=target()+'|'+f.enabled+'|'+f.visible;if(next!==policy){policy=next;send({type:'cardinalPairPolicy',schema:1,client,revision:++revision,target:target(),...f});}schedule();}
  function visible(node){if(!node?.isConnected||d.visibilityState!=='visible'||node.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})===false)return false;for(let el=node;el;el=el.parentElement){const css=w.getComputedStyle(el);if(el.hidden||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||Number(css.opacity)===0)return false;}const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<w.innerWidth&&r.top<w.innerHeight;}
  function inkVisible(child,node){let range;try{const content=child.textContent||'',start=content.search(/\S/u);if(start<0)return true;const end=content.length-(content.match(/\s*$/u)?.[0].length||0);range=d.createRange();range.setStart(child,start);range.setEnd(child,end);const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);if(!rects.length)return false;const clip={left:0,top:0,right:w.innerWidth,bottom:w.innerHeight};
   for(let el=node;el;el=el.parentElement){const css=w.getComputedStyle(el),x=/^(hidden|clip|scroll|auto|overlay)$/.test(css.overflowX||css.overflow||''),y=/^(hidden|clip|scroll|auto|overlay)$/.test(css.overflowY||css.overflow||'');if(!x&&!y)continue;const r=el.getBoundingClientRect(),sx=el.offsetWidth>0?r.width/el.offsetWidth:1,sy=el.offsetHeight>0?r.height/el.offsetHeight:1,left=r.left+(el.clientLeft||0)*sx,top=r.top+(el.clientTop||0)*sy,right=Number.isFinite(el.clientWidth)?left+el.clientWidth*sx:r.right,bottom=Number.isFinite(el.clientHeight)?top+el.clientHeight*sy:r.bottom;if(x){clip.left=Math.max(clip.left,left);clip.right=Math.min(clip.right,right);}if(y){clip.top=Math.max(clip.top,top);clip.bottom=Math.min(clip.bottom,bottom);}}
   return rects.every(r=>r.left>=clip.left-.01&&r.top>=clip.top-.01&&r.right<=clip.right+.01&&r.bottom<=clip.bottom+.01);
  }catch{return false;}finally{range?.detach?.();}}
  function text(node){if(!visible(node))return null;let value='';const css=w.getComputedStyle(node),transparent=color=>color==='transparent'||/^rgba\([^)]*,\s*0(?:\.0*)?\s*\)$/.test(color||'');for(const child of node.childNodes||[]){if(child.nodeType===3){const part=child.textContent||'';if(part.trim()&&(transparent(css.color)||transparent(css.webkitTextFillColor)||!inkVisible(child,node)))return null;value+=part;}else if(child.nodeType===1&&child.tagName!=='RT'&&child.tagName!=='RP'){const part=text(child);if(part===null)return null;value+=part;}}return value;}
  function check(binding){const meta=binding.meta,f=flags();if(!f){policy='';return;}if(!policy){refresh();return;}if(!meta||meta.target!==target())return;const japanese=text(binding.jp),observed=japanese!==null&&normal(japanese)===normal(meta.body),translation=(observed&&binding.cn?.dataset.state==='ready'?text(binding.cn)||'':'').trim();
   const paired=!!translation&&translation.length<=4000&&!/^(?:翻译中…|等待翻译…)$/.test(translation),message={type:'cardinalPair',schema:1,episode:meta.episode,scope:meta.scope,target:meta.target,sourceKey:meta.sourceKey,observed,paired:paired&&f.enabled&&f.visible,translation:translation.slice(0,4000),...f};
   if(meta.markEpisode&&observed){const r=binding.jp.getBoundingClientRect(),ready=!!translation&&f.enabled&&f.visible;
    const evidence={type:'sentenceDisplayObservation',episode:meta.markEpisode,rect:{x:Math.round(r.left),y:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)},
     translationSource:ready?binding.cn.dataset.translationSource:undefined,translationOrigin:ready?binding.cn.dataset.translationOrigin:undefined};
    const stamp=JSON.stringify(evidence);if(binding.displayStamp!==stamp){binding.displayStamp=stamp;send(evidence);}
   }
   const stamp=JSON.stringify(message);if(stamp===binding.sent)return;binding.sent=stamp;send(message);}
  function flush(){queued=false;for(const [id,binding]of bindings){if(!binding.jp?.isConnected){binding.observer?.disconnect();bindings.delete(id);continue;}check(binding);}}
  function schedule(){if(queued||!bindings.size)return;queued=true;w.requestAnimationFrame(flush);}
  const exclude=()=>{const f=flags();if(current&&f&&(!f.enabled||!f.visible))check({meta:current,jp:null,cn:null});};
  b.cardinalPairScope=result=>{if(!flags()){policy='';return;}if(result?.client!==client||result.revision!==revision||!result.descriptor||result.descriptor.episode!==current?.episode)return;current={...result.descriptor,markEpisode:current.markEpisode};const binding=bindings.get(current.episode);if(binding){binding.meta=current;binding.sent='';}exclude();schedule();};
  b.cardinalPair={source(message){if(!message?.cardinalPair)return;const session=current?.episode?.split(':')[0];current=message.cardinalPair;if(current.episode?.split(':')[0]!==session)policy='';refresh();exclude();},refresh,
   currentSelection(value){return current?.markEpisode&&normal(current.body)===normal(value)?{episode:current.markEpisode}:null;},
   selection(node,value){const jp=node?.closest?.('.sentence-text');for(const binding of bindings.values()){
    if(!binding.meta.markEpisode||binding.jp!==jp||normal(binding.meta.body)!==normal(value))continue;
    const out=binding.cn,ready=out?.dataset.state==='ready'&&visible(out)&&out.textContent?.trim();
    return {episode:binding.meta.markEpisode,translationSource:ready?out.dataset.translationSource:undefined,translationOrigin:ready?out.dataset.translationOrigin:undefined};
   }return null;},
   bind(meta,jp,cn){meta=meta||current;if(!meta||!jp)return;if(meta.episode===current?.episode)meta=current;for(const [id,old]of bindings)if(id!==meta.episode&&old.jp===jp){old.observer?.disconnect();bindings.delete(id);}let binding=bindings.get(meta.episode);if(!binding||binding.jp!==jp||binding.cn!==cn){binding?.observer?.disconnect();binding={meta,jp,cn,sent:''};if(w.MutationObserver){binding.observer=new w.MutationObserver(schedule);for(const node of [jp,cn])if(node)binding.observer.observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','data-state','data-translation-source','data-translation-origin']});}bindings.set(meta.episode,binding);}else binding.meta=meta;
    if(bindings.size>420){const id=bindings.keys().next().value;bindings.get(id).observer?.disconnect();bindings.delete(id);}refresh();schedule();},
   notify:schedule};
  d.addEventListener('visibilitychange',schedule);w.addEventListener('megulit-reveal-progress',schedule);
 }
 return {install,normal};
});
