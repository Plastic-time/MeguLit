// Presentation-only adornment; text stays in the original button for accessible names.
const selector='button.primary,.g-btn.primary,.hero-play';
export function decoratePrimaryButtons(root=document){
 const buttons=[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
 for(const button of buttons){if(button.classList.contains('icon-button'))continue;
  for(const node of [...button.childNodes]){
   if(node.nodeType===3&&node.textContent.trim()){const label=document.createElement('span');label.className='primary-label';node.replaceWith(label);label.append(node);}
   else if(node.nodeType===1&&node.tagName==='SPAN'&&node.textContent.trim()&&!node.classList.contains('icon')&&node.getAttribute('aria-hidden')!=='true')node.classList.add('primary-label');
  }
 }
}
decoratePrimaryButtons();
const observer=new MutationObserver(records=>{const roots=new Set();for(const record of records){const button=record.target.nodeType===1?record.target.closest(selector):record.target.parentElement?.closest(selector);if(button)roots.add(button);for(const node of record.addedNodes)if(node.nodeType===1)roots.add(node);}for(const root of roots)if(root.isConnected)decoratePrimaryButtons(root);});
observer.observe(document.body,{childList:true,subtree:true});
