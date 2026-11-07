// Keep the outside dismissal gesture in the reader HWND until its release.
export function installLookupDismiss({bridge,send},env=window){
 const doc=env.document;let dismissing=false,pointerId=null,shield=null,releaseTimer;
 const clearSelection=()=>{try{env.getSelection()?.removeAllRanges();}catch{}};
 const finish=()=>{clearTimeout(releaseTimer);dismissing=false;pointerId=null;env.__megulitLookupDismissing=false;shield?.remove();shield=null;send({type:'galLookup',open:false});env.__tomoyoHitRegionsRefresh?.(true);};
 const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const sync=()=>{if(dismissing)return;const card=doc.querySelector('.tomoyo-selection-card');if(card&&!shield){shield=doc.createElement('div');shield.className='megulit-lookup-dismiss-shield';shield.setAttribute('aria-hidden','true');shield.style.cssText='position:fixed;inset:0;z-index:25999;pointer-events:auto;background:transparent;touch-action:none';doc.body.append(shield);}else if(!card&&shield){shield.remove();shield=null;}};
 doc.addEventListener('pointerdown',event=>{if(dismissing){consume(event);return;}const card=doc.querySelector('.tomoyo-selection-card');if(!card||card.contains(event.target))return;consume(event);dismissing=true;pointerId=event.pointerId;env.__megulitLookupDismissing=true;clearSelection();bridge()?.closeLocalSelection?.(true);try{shield?.setPointerCapture(event.pointerId);}catch{}send({type:'galLookup',open:true});},true);
 for(const type of ['mousedown','mouseup','click','dblclick','contextmenu'])doc.addEventListener(type,event=>{if(dismissing)consume(event);},true);
 const release=event=>{if(!dismissing)return;consume(event);if(event.pointerId!==pointerId)return;clearSelection();clearTimeout(releaseTimer);releaseTimer=env.setTimeout(finish,0);};doc.addEventListener('pointerup',release,true);doc.addEventListener('pointercancel',release,true);
 doc.addEventListener('lostpointercapture',release,true);
 new env.MutationObserver(sync).observe(doc.body,{childList:true,subtree:true});sync();
 return {isDismissing:()=>dismissing};
}
