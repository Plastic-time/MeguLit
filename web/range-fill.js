// E219: keep --v on every range input so the track shows the crimson filled part
const fill=el=>{const min=+el.min||0,max=+el.max||100;el.style.setProperty('--v',((+el.value-min)/(max-min||1)*100)+'%');};
const sweep=root=>root.querySelectorAll?.('input[type=range]').forEach(fill);
document.addEventListener('input',e=>{if(e.target.matches?.('input[type=range]'))fill(e.target);},true);
new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)if(n.nodeType===1){if(n.matches('input[type=range]'))fill(n);else sweep(n);}}).observe(document.documentElement,{subtree:true,childList:true});
sweep(document);
