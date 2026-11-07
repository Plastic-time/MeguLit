// SPDX-License-Identifier: GPL-3.0-or-later
// Work difficulty (user, 2026-11-02). The host shows jiten.moe's raw score floored to a whole band, and most visual
// novels score 2.x: of the 2,765 VN decks on Jiten (2026-11-02) 51% were "Average" and 36% "Easy". Here the score is
// ranked against all VNs on Jiten instead (percentile), in six bands, with plain wording in zh/en/ja; the work's edit
// dialog adds a manual choice that overrides it. Every place that shows difficulty (cover card, work page, statistics)
// renders `.diff-band-N` with the raw score in its tooltip, so all are relabelled here; nothing in the host changes.
(function installDifficulty(){
 'use strict';
 if(!document.body){document.addEventListener('DOMContentLoaded',installDifficulty,{once:true});return;}
 if(window.__tomeDifficulty)return;
 // difficultyRaw at every 5th percentile of all VN decks on jiten.moe (mediaType 7, n=2765, fetched 2026-11-02).
 const PCT=[0,1.35,1.54,1.69,1.78,1.84,1.91,1.97,2.02,2.08,2.15,2.22,2.31,2.39,2.48,2.58,2.72,2.85,3.04,3.26,4.98];
 // Percentile cut-offs of the six bands: bottom 15%, 15-40, 40-65, 65-85, 85-95, top 5%.
 const CUTS=[15,40,65,85,95];
 const words={
  zh:{names:['入门友好','轻松','适中','有点难','很难','硬核'],auto:'自动（按 Jiten 评分）',field:'难度',tip:'Jiten 评分 {raw}/5，比 {pct}% 的视觉小说难',manual:'你设定的难度',manualRaw:'你设定的难度（Jiten 评分 {raw}/5）',hint:'自动难度按 Jiten 上全部视觉小说的评分排名换算；也可以按自己的感受指定'},
  en:{names:['Beginner-friendly','Easy read','Moderate','A bit tough','Tough','Hardcore'],auto:'Automatic (Jiten score)',field:'Difficulty',tip:'Jiten score {raw}/5 · harder than {pct}% of visual novels',manual:'Your own rating',manualRaw:'Your own rating (Jiten score {raw}/5)',hint:'Automatic difficulty ranks the Jiten score against every visual novel on Jiten; you can also set your own'},
  ja:{names:['初心者向け','読みやすい','ふつう','やや難しい','難しい','超上級'],auto:'自動（Jiten の評価）',field:'難易度',tip:'Jiten 評価 {raw}/5・ビジュアルノベルの {pct}% より難しい',manual:'自分で設定した難易度',manualRaw:'自分で設定した難易度（Jiten 評価 {raw}/5）',hint:'自動の難易度は Jiten 上の全ビジュアルノベルの評価順位から決めます。自分の感覚で指定することもできます'}};
 const w=()=>words[(window.__tomeI18n?.get?.()||'zh').slice(0,2)]||words.zh;
 const fill=(s,v)=>s.replace(/\{(\w+)\}/g,(_,k)=>v[k]);
 function percentile(raw){if(raw<=PCT[0])return 0;for(let i=1;i<PCT.length;i++)if(raw<=PCT[i])return Math.round((i-1+(raw-PCT[i-1])/((PCT[i]-PCT[i-1])||1))*5);return 100;}
 const bandOf=pct=>{let b=0;while(b<CUTS.length&&pct>=CUTS[b])b++;return b;};
 // Manual choices, keyed by work title (the one name every difficulty view and the edit dialog can see).
 const KEY='tome-difficulty-override',key=t=>String(t||'').trim();
 const load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}};
 const store=v=>{try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}};
 const titleFor=el=>key(el.closest('.card')?.querySelector('.title')?.textContent||document.querySelector('.media-title')?.textContent||document.querySelector('.cover-title')?.textContent);
 const RAW=/(\d+(?:\.\d+)?)\s*\/\s*5/;
 function paint(el){
  const own=el.dataset.tomeDiffTip;if(own!==undefined&&el.title!==own)delete el.dataset.tomeDiffRaw;
  if(el.dataset.tomeDiffRaw===undefined){const m=RAW.exec(el.title||'');el.dataset.tomeDiffRaw=m?m[1]:'';}
  const raw=el.dataset.tomeDiffRaw===''?null:Number(el.dataset.tomeDiffRaw),manual=load()[titleFor(el)],L=w();
  if(raw==null&&!Number.isInteger(manual))return;
  const band=Number.isInteger(manual)?manual:bandOf(percentile(raw));
  const tip=Number.isInteger(manual)?(raw==null?L.manual:fill(L.manualRaw,{raw:raw.toFixed(1)})):fill(L.tip,{raw:raw.toFixed(1),pct:percentile(raw)});
  el.dataset.noI18n='';if(el.textContent!==L.names[band])el.textContent=L.names[band];if(el.title!==tip)el.title=tip;el.dataset.tomeDiffTip=tip;
  for(const c of [...el.classList])if(/^diff-band-\d$/.test(c)&&c!=='diff-band-'+band)el.classList.remove(c);if(!el.classList.contains('diff-band-'+band))el.classList.add('diff-band-'+band);
  el.toggleAttribute('data-tome-diff-manual',Number.isInteger(manual));
 }
 // Work page and statistics show "—" with no band when Jiten has no score: a manual choice still shows there.
 const emptyFields=()=>[...document.querySelectorAll('.stat-field-value,.meta-value')].filter(n=>!/diff-band-/.test(n.className)&&n.dataset.tomeDiffRaw===undefined&&/difficulty|难度|難易度/i.test(n.parentElement?.querySelector('.stat-field-label,.meta-label')?.textContent||''));
 function scan(){for(const el of document.querySelectorAll('[class*="diff-band-"],[data-tome-diff-raw]'))paint(el);for(const el of emptyFields())if(Number.isInteger(load()[titleFor(el)])){el.dataset.tomeDiffRaw='';paint(el);}dialog();}
 // Manual choice in the work's edit dialog; kept only when the dialog is saved (Save/Add), moved along with a rename.
 let building=0;
 function dialog(){
  for(const r of document.querySelectorAll('dialog:not([open]) .tome-diff-row')){r.__off?.();r.remove();}
  const input=document.querySelector('dialog[open] #media-title');if(!input||building)return;const box=input.closest('dialog'),actions=box.querySelector('.modal-actions');if(!actions||box.querySelector('.tome-diff-row'))return;
  // The host fills the title just after opening: read it a moment later.
  building=setTimeout(()=>{building=0;if(!input.isConnected||!box.open||box.querySelector('.tome-diff-row'))return;
   const L=w(),start=key(input.value),row=document.createElement('label');row.className='exclude-row tome-diff-row';row.dataset.noI18n='';
   row.innerHTML='<span class="exclude-label"></span><select class="modal-input"></select>';row.title=L.hint;row.firstChild.textContent=L.field;const select=row.querySelector('select');
   select.add(new Option(L.auto,''));L.names.forEach((n,i)=>select.add(new Option(n,String(i))));const cur=load()[start];select.value=Number.isInteger(cur)?String(cur):'';
   actions.before(row);const save=actions.querySelector('.modal-btn.primary');
   const commit=()=>{const all=load(),now=key(input.value)||start;if(!now)return;if(start&&start!==now)delete all[start];if(select.value==='')delete all[now];else all[now]=Number(select.value);store(all);setTimeout(scan,300);};
   save?.addEventListener('click',commit,true);row.__off=()=>save?.removeEventListener('click',commit,true);},150);
 }
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;scan();},40);}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','class','open']});
 addEventListener('tome-language-change',scan);scan();
 window.__tomeDifficulty={percentile,bandOf,names:()=>w().names};
 const style=document.createElement('style');style.textContent=`
 .tome-diff-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
 .tome-diff-row select{width:auto!important;min-width:180px;max-width:60%}
 [data-tome-diff-manual]::after{content:" ✎";opacity:.7;font-size:.85em}`;
 document.head.append(style);
})();
