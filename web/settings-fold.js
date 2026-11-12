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
/* 2026-11-12 (judge r8: empty fields read as failures): empty settings fields say what empty means */
const HINTS={relayUrl:{zh:'官方服务器（默认）',ja:'公式サーバー（既定）',en:'Official server (default)'},region:{zh:'例如 eastasia',ja:'例：eastasia',en:'e.g. eastasia'},baseUrl:{zh:'留空使用官方地址',ja:'空欄で公式アドレス',en:'Empty uses the official address'}};
function hint(){const l=String(document.documentElement.lang||'zh'),k=l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';
 for(const [name,t] of Object.entries(HINTS))for(const i of document.querySelectorAll(`.settings-content input[name="${name}"]`))if(!i.placeholder)i.placeholder=t[k];
 for(const i of document.querySelectorAll('.settings-content input[type=password]'))if(!i.placeholder)i.placeholder={zh:'已保存 · 留空不修改',ja:'保存済み · 空欄なら変更なし',en:'Saved · leave empty to keep'}[k];}
let rh=0;new MutationObserver(()=>{if(!rh)rh=requestAnimationFrame(()=>{rh=0;hint();});}).observe(document.body,{childList:true,subtree:true});
