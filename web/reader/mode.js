// SPDX-License-Identifier: GPL-3.0-or-later
let mode='normal',pending=false;
const root=document.documentElement,reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const frames=n=>new Promise(resolve=>{const step=()=>n--<=0?resolve():requestAnimationFrame(step);requestAnimationFrame(step);});
async function play(name,ms){for(const c of ['in-normal','in-translation','out-normal','out-translation'])root.classList.remove('tome-mode-'+c);root.classList.add('tome-mode-'+name);await new Promise(resolve=>setTimeout(resolve,reduced()?0:ms));root.classList.remove('tome-mode-'+name);}
export const readerMode={isTranslation:()=>mode==='translation',get:()=>mode,
 async set(value){const next=value==='translation'?'translation':'normal',changed=next!==mode;mode=next;pending=false;for(const node of [root,document.body]){node.classList.toggle('tome-ui-translation',mode==='translation');node.classList.toggle('tome-ui-normal',mode==='normal');node.classList.toggle('mini-mode',mode==='translation');}window.__tomeChinese?.applyTransparency?.();if(changed){await frames(2);root.classList.remove('tome-mode-cover');await play(mode==='translation'?'in-translation':'in-normal',mode==='translation'?320:380);}},
 async requestToggle(){if(pending)return;pending=true;const from=mode;document.querySelector('.tome-cn-dialog[open]')?.dispatchEvent(new Event('cancel',{cancelable:true}));window.__tomeChinese?.closeBacklog?.();await play(from==='translation'?'out-translation':'out-normal',from==='translation'?200:260);root.classList.add('tome-mode-cover');await frames(1);window.__tomeTranslateRequest(JSON.stringify({type:'galToggleMode'}));setTimeout(()=>{root.classList.remove('tome-mode-cover');pending=false;},1400);},
 gameClosed(){this.set('normal');}
};
