const words={zh:{expand:'展开',collapse:'收起'},ja:{expand:'続きを読む',collapse:'閉じる'},en:{expand:'Read more',collapse:'Collapse'}};
export function synopsisHTML(synopsis,{locale,esc,icon,title,refresh,placeholder,expanded=false}){const w=words[locale];return `<section class="panel synopsis-panel ${expanded?'is-expanded':'is-collapsed'}"><div class="section-header"><h2 class="panel-title">${title}</h2><button type="button" class="text-button" data-refresh>${icon('refresh')}${refresh}</button></div><p class="game-synopsis" id="game-synopsis-body">${esc(synopsis.text||placeholder)}</p><div class="synopsis-footer"><small class="settings-help synopsis-source">${esc(synopsis.source||'')}</small>${synopsis.text?`<button type="button" class="text-button" data-synopsis-toggle aria-expanded="${expanded}" aria-controls="game-synopsis-body">${expanded?w.collapse:w.expand}<span aria-hidden="true">⌄</span></button>`:''}</div></section>`;}
/* E266: the synopsis opens and folds with a height animation, and the toggle only appears when the text is actually
   cut off at the current width (short synopses and wide windows show no button; resizing re-checks). */
const clampLines=5;
export function bindSynopsis(root,locale,onChange=()=>{}){const button=root.querySelector('[data-synopsis-toggle]');if(!button)return;const panel=button.closest('.synopsis-panel'),body=panel.querySelector('.game-synopsis');const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const limit=()=>{const cs=getComputedStyle(body);const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.9;return Math.round(lh*clampLines);};
 const fits=()=>body.scrollHeight<=limit()+2;
 const sync=()=>{const short=fits();panel.classList.toggle('is-short',short);button.hidden=short;if(!panel.classList.contains('is-expanded'))body.style.maxHeight=short?'none':limit()+'px';};
 const label=expanded=>{button.innerHTML=(expanded?words[locale].collapse:words[locale].expand)+'<span aria-hidden="true">⌄</span>';};
 button.onclick=()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));label(expanded);
  const from=body.getBoundingClientRect().height,to=expanded?body.scrollHeight:limit();
  panel.classList.toggle('is-expanded',expanded);panel.classList.toggle('is-collapsed',!expanded);
  if(reduce){body.style.maxHeight=expanded?'none':to+'px';onChange(expanded);return;}
  body.style.maxHeight=from+'px';void body.offsetHeight;body.classList.add('is-animating');body.style.maxHeight=to+'px';
  const done=e=>{if(e&&e.propertyName!=='max-height')return;body.removeEventListener('transitionend',done);body.classList.remove('is-animating');if(panel.classList.contains('is-expanded'))body.style.maxHeight='none';};
  body.addEventListener('transitionend',done);setTimeout(()=>done(),600);onChange(expanded);};
 if(panel.classList.contains('is-expanded'))body.style.maxHeight='none';
 sync();const ro=new ResizeObserver(()=>sync());ro.observe(body);
 document.fonts?.ready?.then(sync);}
