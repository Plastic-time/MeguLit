(function installLearningLayout(){
 'use strict';
 if(!document.documentElement||!window.__tomoyoChinese?.learningInstalled){document.addEventListener('DOMContentLoaded',installLearningLayout,{once:true});return;}
 const bridge=window.__tomoyoChinese;if(bridge.learningLayoutInstalled&&bridge.learningLayoutVersion===3)return;bridge.learningLayoutInstalled=true;bridge.learningLayoutVersion=3;
 const busy=new Set(['resolve','download','cached','install','verify']),labels={idle:'尚未安装',resolve:'准备下载',download:'正在下载',cached:'使用已下载文件',install:'正在安装',verify:'检查词典',ready:'本地词典已就绪',error:'安装未完成'};
 const locale={zh:{idle:'尚未安装',resolve:'准备下载',download:'正在下载',cached:'使用已下载文件',install:'正在安装',verify:'检查词典',ready:'本地词典已就绪',error:'安装未完成',file:'当前文件',preparing:'正在准备本地词典…',retry:'重试安装',repair:'检查 / 修复词典',add:'安装 SudachiDict Full',progress:'当前文件下载进度',attention:'本地词典需要检查',running:'实际运行：',zh:'中文释义、词性与动词类别',en:'英文释义与语法'},en:{idle:'Not installed',resolve:'Preparing download',download:'Downloading',cached:'Using downloaded files',install:'Installing',verify:'Checking dictionaries',ready:'Local dictionaries ready',error:'Setup incomplete',file:'Current file',preparing:'Preparing local dictionaries…',retry:'Retry setup',repair:'Check / repair dictionaries',add:'Install SudachiDict Full',progress:'Current file download progress',attention:'Local dictionaries need attention',running:'Running: ',zh:'Chinese definitions, parts of speech and verb types',en:'English definitions and grammar'},ja:{idle:'未インストール',resolve:'ダウンロード準備中',download:'ダウンロード中',cached:'取得済みファイルを使用',install:'インストール中',verify:'辞書を確認中',ready:'ローカル辞書の準備完了',error:'セットアップ未完了',file:'現在のファイル',preparing:'ローカル辞書を準備中…',retry:'再インストール',repair:'辞書を確認・修復',add:'SudachiDict Full をインストール',progress:'現在のファイルの取得状況',attention:'ローカル辞書を確認してください',running:'実行中：',zh:'中国語の語義・品詞・動詞分類',en:'英語の語義と文法'}};
 const lang=()=>window.__tomeI18n?.get?.()||'zh',words=()=>locale[lang()]||locale.zh;
 function localizedStatus(panel){const w=words(),node=panel.querySelector('[data-learning-status]');if(!node)return;node.dataset.noI18n='';const raw=bridge.localLearningMessage||'',ready=raw.startsWith('实际运行：');const value=lang()==='zh'?raw:ready?w.running+raw.slice(5).replace('本机',lang()==='ja'?'ローカル':'local'):w.attention;if(node.textContent!==value)node.textContent=value;node.title=raw;for(const option of panel.querySelectorAll('[data-learner-language] option')){option.dataset.noI18n='';const text=w[option.value];if(text&&option.textContent!==text)option.textContent=text;}}
 const bytes=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(0,n/1024).toFixed(0)+' KB';
 function update(panel){
  localizedStatus(panel);const labels=words();
  const p=bridge.localLearningProgress||{stage:bridge.localLearningReady?'ready':'idle'},stage=p.stage||'idle',track=panel.querySelector('[data-learning-progress]');if(!track)return;
  const percent=Number.isFinite(p.percent)?Math.max(0,Math.min(100,p.percent)):null;
  track.dataset.stage=stage;track.classList.toggle('indeterminate',busy.has(stage)&&percent===null);track.firstElementChild.style.width=percent===null?'36%':percent+'%';
  if(percent===null)track.removeAttribute('aria-valuenow');else track.setAttribute('aria-valuenow',String(Math.round(percent)));
  track.setAttribute('aria-valuetext',labels[stage]||stage);track.setAttribute('aria-label',labels.progress);
  const caption=(labels[stage]||stage)+(stage==='download'&&percent!==null?' · '+labels.file+' '+percent.toFixed(0)+'%':'');const title=panel.querySelector('[data-learning-stage]');title.dataset.noI18n='';if(title.textContent!==caption)title.textContent=caption;
  const detail=[p.file||'',stage==='download'?bytes(Number(p.current)||0)+(p.total?' / '+bytes(p.total):'')+(p.speed>0?' · '+bytes(p.speed)+'/s':''):''].filter(Boolean).join(' · '),node=panel.querySelector('[data-learning-detail]');if(node.textContent!==detail)node.textContent=detail;
  const button=panel.querySelector('[data-install-reading]');button.disabled=busy.has(stage);button.dataset.noI18n='';const text=busy.has(stage)?labels.preparing:stage==='error'?labels.retry:stage==='ready'?labels.repair:labels.add;if(button.textContent!==text)button.textContent=text;
 }
 const previousStatus=bridge.learningStatus;bridge.learningStatus=m=>{if(m.learningProgress)bridge.localLearningProgress=m.learningProgress;if(typeof m.learningInstalled==='boolean')bridge.localLearningReady=m.learningInstalled;previousStatus?.(m);for(const panel of document.querySelectorAll('.tomoyo-learning-panel'))update(panel);};
 function decorate(panel){
  if(panel.dataset.progressReady)return;panel.dataset.progressReady='true';
  const card=document.createElement('div');card.className='tomoyo-dictionary-card';card.innerHTML='<div class="tomoyo-dictionary-title"><strong>SudachiDict Full</strong><span data-learning-stage></span></div><div class="tomoyo-download-track" data-learning-progress role="progressbar" aria-label="当前文件下载进度" aria-valuemin="0" aria-valuemax="100"><div></div></div><div data-learning-detail></div>';
  const status=panel.querySelector('[data-learning-status]'),button=panel.querySelector('[data-install-reading]');status.before(card);card.append(status,button);
  const handler=button.onclick;button.onclick=event=>{bridge.learningStatus({learningProgress:{stage:'resolve',percent:null}});handler?.(event);};update(panel);
 }
 function mount(){
  for(const panel of document.querySelectorAll('.tomoyo-learning-panel')){decorate(panel);localizedStatus(panel);}
  const layout=document.querySelector('.settings-page .settings-layout'),nav=layout?.querySelector('.settings-tabs'),content=layout?.querySelector('.settings-content'),page=layout?.closest('.settings-page');if(!nav||!content)return;
  let panel=content.querySelector('.tomoyo-native-learning');
  const old=panel?.querySelector('.tomoyo-learning-panel')||content.querySelector('.tomoyo-learning-panel')||[...page.querySelectorAll('.tomoyo-learning-panel')].find(n=>!n.closest('.tomoyo-cn-dialog')),sample=nav.querySelector('button');if(!old||!sample)return;
  if(!panel){panel=document.createElement('section');panel.className='tomoyo-native-learning';content.appendChild(panel);}if(old.parentElement!==panel)panel.appendChild(old);
  // Always reconcile, even if the sidebar button already exists: an early
  // provisional panel from 3.0 may still be sitting above the native header.
  for(const duplicate of page.querySelectorAll('.tomoyo-learning-panel'))if(duplicate!==old&&!duplicate.closest('.tomoyo-cn-dialog'))duplicate.remove();
  if(nav.querySelector('[data-tomoyo-learning-tab]'))return;
  const button=document.createElement('button');button.type='button';button.className=sample.className;button.classList.remove('active');button.setAttribute('data-tomoyo-learning-tab','');button.textContent='学习与辞书';button.setAttribute('aria-pressed','false');nav.appendChild(button);
  const select=active=>{content.classList.toggle('tomoyo-learning-selected',active);nav.classList.toggle('tomoyo-learning-selected',active);button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));};
  button.onclick=()=>select(true);nav.addEventListener('click',event=>{const target=event.target.closest('button');if(target&&target!==button)select(false);},true);
 }
 addEventListener('tome-language-change',()=>{for(const panel of document.querySelectorAll('.tomoyo-learning-panel'))update(panel);});
 const style=document.createElement('style');style.textContent=`
 .tomoyo-learning-panel.tomoyo-learning-panel{border:0;border-radius:0;padding:0;margin:0;color:var(--theme-text,inherit);font:inherit;line-height:1.6;letter-spacing:normal;text-shadow:none;-webkit-text-stroke:0;min-width:0}
 .tomoyo-learning-panel legend{font-size:18px;font-weight:600;margin-bottom:14px}.tomoyo-learning-panel label{font-size:14px;margin:16px 0!important}.tomoyo-learning-panel small{font-size:12px;color:var(--theme-textSecondary,#999)}
 .tomoyo-learning-panel.tomoyo-learning-panel select{box-sizing:border-box;width:100%;padding:10px 12px;margin-top:8px;background:var(--theme-background,#18181b);color:var(--theme-text,#eee);border:1px solid var(--theme-border,#444);border-radius:8px;font:inherit}
 .tomoyo-dictionary-card{border:1px solid var(--theme-border,#444);border-radius:12px;padding:18px;margin-top:20px;background:var(--theme-surface,#202024)}.tomoyo-dictionary-title{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px}.tomoyo-dictionary-title span{font-size:12px;color:var(--theme-primary,#d66)}
 .tomoyo-download-track{height:6px;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--theme-primary,#d66) 16%,transparent);margin:14px 0 9px}.tomoyo-download-track>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--theme-primary,#d66),var(--theme-accent,var(--theme-primary,#d66)));transition:width .2s ease}.tomoyo-download-track.indeterminate>div{animation:tomoyo-download 1.4s ease-in-out infinite}.tomoyo-download-track[data-stage=idle]{opacity:.35}.tomoyo-download-track[data-stage=error]>div{width:100%!important;opacity:.4}
 .tomoyo-learning-panel [data-learning-detail],.tomoyo-learning-panel.tomoyo-learning-panel [data-learning-status]{font-size:12px;color:var(--theme-textSecondary,#999);overflow-wrap:anywhere;line-height:1.7}.tomoyo-learning-panel button{border:1px solid var(--theme-border,#444);border-radius:8px;padding:8px 12px;margin-top:14px;color:var(--theme-text,#eee);background:var(--theme-background,#18181b);font:inherit;font-size:13px;cursor:pointer}.tomoyo-learning-panel button:disabled{opacity:.6;cursor:progress}
 .settings-page .tomoyo-learning-panel{display:none!important}.settings-page .tomoyo-native-learning>.tomoyo-learning-panel{display:block!important}
 .settings-content>.tomoyo-native-learning{display:none}.settings-content.tomoyo-learning-selected>:not(.tomoyo-native-learning){display:none!important}.settings-content.tomoyo-learning-selected>.tomoyo-native-learning{display:block}
 .settings-tabs.tomoyo-learning-selected>button:not([data-tomoyo-learning-tab]){background:transparent!important;color:var(--theme-textSecondary,#999)!important;border-color:transparent!important}
 .tomoyo-cn-dialog .tomoyo-learning-panel legend{display:none}
 @keyframes tomoyo-download{0%{transform:translateX(-105%)}100%{transform:translateX(300%)}}@media(prefers-reduced-motion:reduce){.tomoyo-download-track.indeterminate>div{animation:none;width:100%!important;opacity:.45}}
 `;(document.head||document.documentElement).appendChild(style);new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();
