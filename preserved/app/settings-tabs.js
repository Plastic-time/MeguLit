// SPDX-License-Identifier: GPL-3.0-or-later
// Settings page: hide the Sentence window / Review / Mini mode tabs, and add the two local dictionary
// databases (SudachiDict Full, UniDic) to the Dictionary tab with download progress, file check and repair.
(function installSettingsTabs(){
 'use strict';
 if(window.__tomeSettingsTabs)return;
 if(!document.documentElement||!document.body||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installSettingsTabs,{once:true});return;}
 window.__tomeSettingsTabs=true;
 const b=window.__tomoyoChinese,HIDE=new Set(['Sentence window','Review','Mini mode']);
 const send=m=>{try{window.__tomoyoTranslateRequest(JSON.stringify(m));}catch{}};
 const src=el=>window.__tomeI18n?.src?.(el)??el.textContent.trim();
 const L={
  zh:{title:'本地词典数据库',sub:'查词、点读、注音和朗读都离线使用这两个数据库',installed:'已安装',missing:'未安装',broken:n=>n+' 个文件缺失或损坏',version:'版本',files:'个文件',check:'检查文件',checking:'正在检查文件…',repair:'修复 / 重新下载',install:'下载安装',ok:'文件检查通过，两个数据库完整',bad:'发现问题，点「修复 / 重新下载」即可',idle:'',stage:{idle:'尚未安装',resolve:'准备下载',download:'正在下载',cached:'使用已下载文件',install:'正在安装',verify:'检查词典',ready:'已就绪',error:'安装未完成'},current:'当前文件',lastCheck:'上次检查'},
  en:{title:'Local dictionary databases',sub:'Lookups, tap-to-read, furigana and speech all run offline on these two databases',installed:'Installed',missing:'Not installed',broken:n=>n+' file(s) missing or damaged',version:'Version',files:'files',check:'Check files',checking:'Checking files…',repair:'Repair / re-download',install:'Download & install',ok:'All files verified — both databases are intact',bad:'Problems found — click "Repair / re-download"',idle:'',stage:{idle:'Not installed',resolve:'Preparing download',download:'Downloading',cached:'Using downloaded files',install:'Installing',verify:'Checking',ready:'Ready',error:'Install failed'},current:'Current file',lastCheck:'Last check'},
  ja:{title:'ローカル辞書データベース',sub:'辞書引き・タップ読み・ふりがな・読み上げはこの2つでオフライン動作します',installed:'インストール済み',missing:'未インストール',broken:n=>n+' 個のファイルが欠落・破損',version:'バージョン',files:'ファイル',check:'ファイルを確認',checking:'ファイルを確認中…',repair:'修復 / 再ダウンロード',install:'ダウンロードしてインストール',ok:'すべてのファイルを確認しました（2つとも正常）',bad:'問題があります。「修復 / 再ダウンロード」を押してください',idle:'',stage:{idle:'未インストール',resolve:'ダウンロード準備中',download:'ダウンロード中',cached:'ダウンロード済みファイルを使用',install:'インストール中',verify:'確認中',ready:'準備完了',error:'インストール失敗'},current:'現在のファイル',lastCheck:'前回の確認'}
 };
 const t=()=>L[window.__tomeI18n?.get?.()]||L.zh;
 let dbs=null,check=null,checking=false,checkProgress=null;
 const BUSY=new Set(['resolve','download','cached','install','verify']);
 const size=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(0,n/1024).toFixed(0)+' KB';
 b.dictStatus=v=>{dbs=v?.databases||null;paint();};
 b.dictCheckProgress=p=>{checkProgress=p;paint();};
 b.dictCheckResult=r=>{checking=false;checkProgress=null;check={at:Date.now(),results:r};paint();send({type:'dictStatus'});};
 let lastMessage='';const prev=b.learningStatus;b.learningStatus=m=>{prev?.(m);if(typeof m?.learningMessage==='string')lastMessage=m.learningMessage;if(m?.learningProgress){paint();if(m.learningProgress.stage==='ready'||m.learningProgress.stage==='error')send({type:'dictStatus'});}};
 const style=document.createElement('style');style.textContent=`
 .settings-tabs>button.tome-hidden-tab{display:none!important}
 /* Selected settings tab: red text only, no filled red rectangle (user, 2026-11-02). Hover stays readable; no outline or
    focus box either (user, same day). */
 .settings-page .settings-tabs>button{background:transparent!important;box-shadow:none!important;border-color:transparent!important;outline:none!important}
 .settings-page .settings-tabs>button.active,.settings-page .settings-tabs>button[aria-selected=true]{color:var(--theme-primary,#e0495a)!important;font-weight:700}
 .settings-page .settings-tabs>button:not(.active):not([aria-selected=true]):hover{color:var(--theme-text,#eee)!important;background:color-mix(in srgb,var(--theme-text,#eee) 6%,transparent)!important}
 /* ToMe's own tabs (学习与辞书, 游戏库, 主页背景, 关于) leave the host app's last tab marked active: only one is red. */
 .settings-page .settings-tabs:has(>button.active:is([data-tomoyo-learning-tab],[data-library-tab],[data-tome-bg-tab],[data-tome-about-tab]))>button.active:not([data-tomoyo-learning-tab],[data-library-tab],[data-tome-bg-tab],[data-tome-about-tab]){color:var(--theme-textSecondary,#7a7c82)!important;font-weight:inherit}
 .settings-page .tomoyo-native-learning .tomoyo-dictionary-card{display:none!important}
 .settings-page .tomoyo-v4-immersion,.settings-page .tomoyo-v4-hook{display:none!important}
 /* Leave room under the last buttons so nothing sits cut off at the bottom edge of the window. */
 .settings-page .settings-content{padding-bottom:72px!important;box-sizing:border-box}
 .settings-page .tomoyo-native-learning{padding-bottom:72px}
 /* Checkboxes on the settings page look like Tomoyo's own toggle switches. */
 .settings-page .tomoyo-learning-panel input[type=checkbox]{-webkit-appearance:none;appearance:none;position:relative;display:inline-block;flex:none;width:42px;height:24px;margin:0 0 0 12px;padding:0;vertical-align:middle;border:0;border-radius:999px;background:color-mix(in srgb,var(--theme-text,#eee) 18%,transparent);cursor:pointer;transition:background .18s ease}
 .settings-page .tomoyo-learning-panel input[type=checkbox]::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35);transition:transform .18s ease}
 .settings-page .tomoyo-learning-panel input[type=checkbox]:checked{background:var(--theme-primary,#e0495a)}
 .settings-page .tomoyo-learning-panel input[type=checkbox]:checked::after{transform:translateX(18px)}
 .settings-page .tomoyo-learning-panel input[type=checkbox]:focus-visible{outline:2px solid var(--theme-primary,#e0495a);outline-offset:2px}
 .settings-page .tomoyo-learning-panel label:has(>input[type=checkbox]){display:flex!important;align-items:center;justify-content:space-between;gap:12px}
 .settings-page .tomoyo-learning-panel input[type=range]{accent-color:var(--theme-primary,#e0495a)}
 .tome-dictdb{margin-bottom:48px;margin-top:26px;padding:18px 20px;border:1px solid var(--theme-border,#333);border-radius:14px;background:var(--theme-surface,#18181c)}
 .tome-dictdb h3{margin:0;font-size:15px;font-weight:700;color:var(--theme-text,#eee)}
 .tome-dictdb>small{display:block;margin:4px 0 14px;font-size:12px;color:var(--theme-textSecondary,#999)}
 .tome-db{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid var(--theme-border,#2b2b30)}
 .tome-db b{font-size:14px;color:var(--theme-text,#eee)}.tome-db span.role{display:block;font-size:12px;color:var(--theme-textSecondary,#999);margin-top:2px}
 .tome-db .meta{font-size:11.5px;color:var(--theme-textSecondary,#888);margin-top:3px}
 .tome-badge{flex:none;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--theme-text,#eee) 7%,transparent);color:var(--theme-textSecondary,#aaa)}
 .tome-badge i{width:8px;height:8px;border-radius:50%;background:currentColor}
 .tome-badge[data-s=ok]{color:#45c47f;background:color-mix(in srgb,#45c47f 14%,transparent)}
 .tome-badge[data-s=bad]{color:#e3804f;background:color-mix(in srgb,#e3804f 14%,transparent)}
 .tome-dict-track{height:6px;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--theme-primary,#e0495a) 16%,transparent);margin:14px 0 8px}
 .tome-dict-track>div{height:100%;width:0;border-radius:inherit;background:var(--theme-primary,#e0495a);transition:width .2s ease}
 .tome-dict-track.indeterminate>div{width:36%!important;animation:tome-dict-move 1.4s ease-in-out infinite}
 @keyframes tome-dict-move{0%{transform:translateX(-105%)}100%{transform:translateX(300%)}}
 .tome-dict-status{font-size:12px;color:var(--theme-textSecondary,#999);min-height:18px;overflow-wrap:anywhere}
 .tome-dict-status[data-s=ok]{color:#45c47f}
 .tome-dict-track[data-s=ok]>div{background:#45c47f}
 .tome-dict-track[data-s=ok]{background:color-mix(in srgb,#45c47f 16%,transparent)}
 .settings-content>.tome-about-panel{display:none}
 .settings-content.tome-about-selected>:not(.tome-about-panel){display:none!important}
 .settings-content.tome-about-selected>.tome-about-panel{display:block!important}
 .settings-tabs.tome-about-selected>button:not([data-tome-about-tab]){background:transparent!important;color:var(--theme-textSecondary,#999)!important;border-color:transparent!important}.tome-dict-status[data-s=bad]{color:#e3804f}
 .tome-dict-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
 .tome-dict-actions button{padding:8px 14px;border-radius:9px;border:1px solid var(--theme-border,#3a3a40);background:var(--theme-background,#111);color:var(--theme-text,#eee);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
 .tome-dict-actions button.primary{background:var(--theme-primary,#e0495a);border-color:var(--theme-primary,#e0495a);color:#fff}
 .tome-dict-actions button:disabled{opacity:.55;cursor:progress}
 /* Theme swatches: two half spans clipped by a 6px radius with a 1px border looked jagged at fractional scaling. The
    button paints both halves itself (one gradient, one rounded shape) and the ring is an outline that follows the radius. */
 .settings-page button.swatch[data-tome-swatch]{border:0!important;border-radius:9px!important;overflow:visible!important;background:linear-gradient(90deg,var(--tome-sw-a) 0 50%,var(--tome-sw-b) 50% 100%)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--theme-text,#eee) 16%,transparent)!important;outline:2px solid transparent;outline-offset:2px;transition:outline-color .15s,transform .15s}
 .settings-page button.swatch[data-tome-swatch]>.half{visibility:hidden}
 .settings-page button.swatch[data-tome-swatch]:hover{transform:translateY(-1px)}
 .settings-page button.swatch[data-tome-swatch][aria-pressed=true]{outline-color:var(--theme-primary,#e0495a)}`;
 document.head.append(style);
 // "关于" tab at the end of the settings sidebar.
 const ABOUT={zh:'关于',en:'About',ja:'情報'};
 function aboutTab(nav,content){
  let btn=nav.querySelector('[data-tome-about-tab]');const sample=nav.querySelector(':scope>button:not([data-tome-about-tab])');if(!sample)return;
  if(!btn){btn=document.createElement('button');btn.type='button';btn.className=sample.className;btn.classList.remove('active');btn.dataset.tomeAboutTab='';btn.dataset.noI18n='';nav.appendChild(btn);
   btn.onclick=()=>select(true);nav.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&b!==btn)select(false);},true);}
  else if(btn!==nav.lastElementChild)nav.appendChild(btn);
  const label=ABOUT[window.__tomeI18n?.get?.()]||ABOUT.zh;if(btn.textContent!==label)btn.textContent=label;
  function select(on){const c=document.querySelector('.settings-page .settings-content');c?.classList.toggle('tome-about-selected',on);nav.classList.toggle('tome-about-selected',on);btn.classList.toggle('active',on);
   let panel=c?.querySelector(':scope>.tome-about-panel');if(on&&c){if(!panel){panel=document.createElement('section');panel.className='tome-about-panel';c.append(panel);}panel.replaceChildren(window.__tomeAboutPanel?.()||document.createTextNode(''));}}
  if(content.classList.contains('tome-about-selected')&&!content.querySelector(':scope>.tome-about-panel'))select(true);
 }
 function activeTab(nav){return [...nav.querySelectorAll(':scope>button')].find(x=>x.classList.contains('active')&&!x.hasAttribute('data-tomoyo-learning-tab'));}
 function swatches(){for(const sw of document.querySelectorAll('.settings-page button.swatch')){const [x,y]=sw.querySelectorAll(':scope>.half');if(!x||!y)continue;const a=x.style.background,b=y.style.background;if(sw.style.getPropertyValue('--tome-sw-a')!==a)sw.style.setProperty('--tome-sw-a',a);if(sw.style.getPropertyValue('--tome-sw-b')!==b)sw.style.setProperty('--tome-sw-b',b);sw.dataset.tomeSwatch='';}}
 function mount(){
  swatches();
  const nav=document.querySelector('.settings-page .settings-tabs'),content=document.querySelector('.settings-page .settings-content');
  if(!nav||!content){document.querySelector('.tome-dictdb')?.remove();return;}
  for(const btn of nav.querySelectorAll(':scope>button'))if(!btn.hasAttribute('data-tomoyo-learning-tab'))btn.classList.toggle('tome-hidden-tab',HIDE.has(src(btn)));
  // If a hidden tab is the current one (e.g. remembered), move to General.
  const act=activeTab(nav);if(act&&HIDE.has(src(act))){const g=[...nav.querySelectorAll(':scope>button')].find(x=>src(x)==='General');g?.click();}
  aboutTab(nav,content);
  const show=act&&src(act)==='Dictionary'&&!content.classList.contains('tomoyo-learning-selected')&&!content.classList.contains('tome-about-selected');let box=content.querySelector(':scope>.tome-dictdb');
  if(!show){box?.remove();return;}
  if(!box){box=document.createElement('section');box.className='tome-dictdb';box.dataset.noI18n='';content.append(box);build(box);send({type:'dictStatus'});}
  else if(box!==content.lastElementChild)content.append(box);
 }
 function build(box){
  box.innerHTML='<h3 data-k="title"></h3><small data-k="sub"></small><div data-rows></div><div class="tome-dict-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><div></div></div><div class="tome-dict-status" role="status"></div><div class="tome-dict-actions"><button type="button" data-act="check"></button><button type="button" data-act="repair"></button></div>';
  box.querySelector('[data-act=check]').onclick=()=>{checking=true;check=null;checkProgress={percent:0,file:''};paint();send({type:'dictCheck'});};
  box.querySelector('[data-act=repair]').onclick=()=>{const only=check?.results?.length?check.results.filter(r=>!r.ok).map(r=>r.id):(dbs||[]).filter(d=>!d.version||d.missing).map(d=>d.id);check=null;b.learningStatus?.({learningProgress:{stage:'resolve',percent:null}});send({type:'dictRepair',only:only.length?only:null});};
  paint();
 }
 function paint(){
  const box=document.querySelector('.tome-dictdb');if(!box)return;const s=t();
  box.querySelector('[data-k=title]').textContent=s.title;box.querySelector('[data-k=sub]').textContent=s.sub;
  const rows=box.querySelector('[data-rows]');rows.replaceChildren();
  const res=id=>check?.results?.find(r=>r.id===id);
  for(const d of dbs||[]){const r=res(d.id),row=document.createElement('div');row.className='tome-db';const left=document.createElement('div');
   const name=document.createElement('b');name.textContent=d.name;const role=document.createElement('span');role.className='role';role.textContent=d.role?.[window.__tomeI18n?.get?.()]||d.role?.zh||'';
   const meta=document.createElement('div');meta.className='meta';meta.textContent=d.version?`${s.version} ${d.version} · ${d.files} ${s.files} · ${size(d.size)}`:'';left.append(name,role,meta);
   const badge=document.createElement('span');badge.className='tome-badge';const problems=r?(r.missingCount+r.badCount):d.missing;
   if(!d.version){badge.dataset.s='bad';badge.innerHTML='<i></i>';badge.append(s.missing);}
   else if(problems){badge.dataset.s='bad';badge.innerHTML='<i></i>';badge.append(s.broken(problems));}
   else{badge.dataset.s='ok';badge.innerHTML='<i></i>';badge.append(s.installed+(r?.ok?' ✓':''));}
   row.append(left,badge);rows.append(row);}
  const p=b.localLearningProgress||{},stage=p.stage||'idle',installing=BUSY.has(stage),track=box.querySelector('.tome-dict-track'),bar=track.firstElementChild,status=box.querySelector('.tome-dict-status');
  let percent=null,text='',tone='';
  if(installing){percent=Number.isFinite(p.percent)?p.percent:null;text=s.stage[stage]+(percent!==null?' · '+percent.toFixed(0)+'%':'')+(p.file?' · '+p.file:'')+(stage==='download'&&p.total?' · '+size(Number(p.current)||0)+' / '+size(p.total)+(p.speed>0?' · '+size(p.speed)+'/s':''):'');}
  else if(checking){percent=checkProgress?.percent??0;text=s.checking+' '+percent.toFixed(0)+'%'+(checkProgress?.file?' · '+checkProgress.file:'');}
  else if(check){const ok=check.results.every(r=>r.ok);percent=100;tone=ok?'ok':'bad';text=(ok?s.ok:s.bad)+' · '+s.lastCheck+' '+new Date(check.at).toLocaleTimeString();}
  else if(stage==='error'){tone='bad';text=lastMessage&&/失败|无法|error/i.test(lastMessage)?lastMessage:s.stage.error;}
  track.dataset.s=tone;track.classList.toggle('indeterminate',(installing||checking)&&percent===null);bar.style.width=(percent??0)+'%';track.style.opacity=installing||checking||check?'1':'.35';status.textContent=text;status.dataset.s=tone;
  const anyMissing=(dbs||[]).some(d=>!d.version);
  const cb=box.querySelector('[data-act=check]'),rb=box.querySelector('[data-act=repair]');cb.textContent=s.check;rb.textContent=anyMissing?s.install:s.repair;
  rb.classList.toggle('primary',anyMissing||!!check&&!check.results.every(r=>r.ok));cb.disabled=installing||checking||anyMissing;rb.disabled=installing||checking;
 }
 let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;mount();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 const prevSet=window.__tomeI18n?.set;if(prevSet)window.__tomeI18n.set=v=>{prevSet(v);paint();};
 mount();
})();
