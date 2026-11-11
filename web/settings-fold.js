// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: the AI explanation providers should start folded; show the chosen one, and keep its address and
   model under an advanced switch — they rarely change). Presentation only: rows are moved into a <details>, values and
   names are untouched, so saving works as before. */
const WORDS={zh:'高级：服务地址与模型',ja:'詳細：サーバーアドレスとモデル',en:'Advanced: address and model'};
const lang=()=>{const l=String(document.documentElement.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
function fold(){
 const content=document.querySelector('.main .settings-content');if(!content)return;
 const rows=[...content.querySelectorAll('.settings-row')].filter(r=>r.querySelector('[name^="lookupProfiles."]'));if(!rows.length)return;
 let box=content.querySelector('details.u-advanced');
 if(!box){box=document.createElement('details');box.className='u-advanced';box.innerHTML=`<summary>${WORDS[lang()]}</summary>`;rows[0].before(box);}
 for(const r of rows)if(r.parentElement!==box)box.append(r);
 const pick=content.querySelector('select[name="contextProvider"]')?.value||content.querySelector('select[name="lookupProvider"]')?.value||'deepseek';
 for(const r of rows){const name=r.querySelector('[name^="lookupProfiles."]').name.split('.')[1];r.hidden=name!==pick;}
 if(!rows.some(r=>!r.hidden))rows.filter(r=>r.querySelector('[name^="lookupProfiles.deepseek."]')).forEach(r=>{r.hidden=false;});
}
let raf=0;new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;fold();});}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('change',e=>{if(e.target?.name==='contextProvider'||e.target?.name==='lookupProvider')fold();},true);
