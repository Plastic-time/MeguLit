// SPDX-License-Identifier: GPL-3.0-or-later
// Game library: the first-run window that asks where the games are (Steam and other folders), adds the visual
// novels it finds to the home page with their covers, and a hook lamp under every home-page entry
// (lit: LunaHook can read and replace the game text; dark: only OCR and the text panel cover).
(function installLibrary(){
 'use strict';
 if(!document.documentElement||!document.body||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installLibrary,{once:true});return;}
 const b=window.__tomoyoChinese;if(b.libraryInstalled)return;b.libraryInstalled=true;
 const T={
  zh:{title:'设置游戏路径',sub:'告诉 ToMe 你的游戏放在哪里：找到的 gal 会自动加入主页（能找到封面的一起加上），并检查每部作品能不能用 Hook。',
   steam:'Steam 路径',steamHint:'例如 C:\\Program Files (x86)\\Steam',auto:'自动查找',browse:'浏览…',other:'第三方游戏文件夹',otherHint:'放 gal 的文件夹，如 E:\\GAL（多个用 ; 分隔）',
   skip:'以后再说',scan:'扫描并加入主页',done:'完成',scanning:'正在扫描',found:'找到 {n} 部 gal',skippedHead:'有 {n} 部作品是中文汉化版，已跳过（ToMe 需要日文原版来翻译和内嵌）',askHead:'还有 {n} 部是汉化版或英文版：ToMe 需要日文原版才能翻译和内嵌。要还原成日文原版后加入主页吗？',editionZh:'汉化版',editionEn:'英文版',restoreAsk:'可以用作品自带的还原程序（{tool}）恢复日文原版。注意：部分老游戏的日文原版启动时会检查原版光盘',restoreNone:'没有找到还原程序，需要自行安装日文原版后重新扫描；不会加入主页',restoreYes:'还原并加入',restoreConfirm:'将运行 {tool} 删除汉化文件，再点一次确认',restoreNo:'不加入',restoring:'正在还原…',restored:'已还原成日文原版并加入主页',restoreSkipped:'未加入主页',skippedTag:'汉化版·已跳过',skippedWhy:'这个文件夹里只有汉化版的程序。恢复日文原版（比如运行汉化补丁自带的卸载脚本）后重新扫描即可',added:'新加入主页 {n} 部',none:'没有找到 gal。可以检查路径，或稍后在主页设置「游戏库」里重新扫描。',
   onTip:'可以使用 Hook：直接抓取游戏原文，并支持 Hook 的原文隐藏与替换字功能',verified:'已在游戏中确认 Hook 可用',byEngine:'按引擎（{e}）判断支持，首次游玩时自动确认',
   offTip:'没能获取 Hook：只能使用 OCR 和文字板覆盖',unity:'Unity 引擎：Hook 不一定可用，进入游戏后会自动检测',noGame:'没有关联到游戏文件（可在主页设置「游戏库」里扫描游戏路径）',unknown:'未识别出支持 Hook 的引擎',
   notFound:'没找到 Steam，请手动填写或浏览',newFound:'发现 {n} 部新 gal，已加入主页',menu:'游戏库',menuText:'设置 Steam / 第三方游戏路径，重新扫描并加入主页',menuBtn:'设置游戏路径并扫描',isNew:'新加入',inHome:'已在主页',missing:'文件已不在'},
  en:{title:'Set up your game folders',sub:'Tell ToMe where your games are: visual novels it finds are added to the home page (with covers when available), and each one is checked for hook support.',
   steam:'Steam folder',steamHint:'e.g. C:\\Program Files (x86)\\Steam',auto:'Find',browse:'Browse…',other:'Other game folder',otherHint:'A folder with your VNs, e.g. E:\\GAL (separate several with ;)',
   skip:'Later',scan:'Scan and add',done:'Done',scanning:'Scanning',found:'Found {n} visual novels',skippedHead:'{n} Chinese edition(s) skipped (ToMe needs the Japanese original to translate and embed)',askHead:'{n} more are Chinese or English editions. ToMe needs the Japanese original to translate and embed: restore it and add to home?',editionZh:'Chinese edition',editionEn:'English edition',restoreAsk:'The game\u2019s own restore tool ({tool}) can bring back the Japanese original. Note: some older Japanese originals check for the original disc at start',restoreNone:'No restore tool found: install the Japanese original yourself and scan again. Not added to home',restoreYes:'Restore and add',restoreConfirm:'Runs {tool} to remove the patch; click again to confirm',restoreNo:'Don\u2019t add',restoring:'Restoring…',restored:'Restored to the Japanese original and added to home',restoreSkipped:'Not added to home',skippedTag:'Chinese edition · skipped',skippedWhy:'This folder only has a Chinese-patched program. Restore the Japanese original (for example with the patch\u2019s own uninstall script) and scan again',added:'{n} added to home',none:'No visual novels found. Check the folders, or scan again later from Game library in the home settings.',
   onTip:'Hook available: reads the game text directly, and supports hiding and replacing the original text',verified:'Hook confirmed in game',byEngine:'Supported by engine ({e}); confirmed automatically on first play',
   offTip:'No hook: only OCR and the text panel cover',unity:'Unity engine: the hook may not work; checked automatically once you play',noGame:'No game files linked (scan your game folders from Game library in the home settings)',unknown:'No hook-capable engine recognised',
   notFound:'Steam not found; type or browse to it',newFound:'{n} new visual novels added to home',menu:'Game library',menuText:'Steam / other game folders; scan again and add to home',menuBtn:'Set folders and scan',isNew:'New',inHome:'On home',missing:'Files gone'},
  ja:{title:'ゲームの場所を設定',sub:'ゲームの場所を教えてください。見つかったノベルゲームはホームに追加され（カバーも取得）、Hook が使えるかを確認します。',
   steam:'Steam フォルダ',steamHint:'例：C:\\Program Files (x86)\\Steam',auto:'自動検出',browse:'参照…',other:'その他のゲームフォルダ',otherHint:'ゲームを置いたフォルダ（例 E:\\GAL、複数は ; 区切り）',
   skip:'あとで',scan:'スキャンして追加',done:'完了',scanning:'スキャン中',found:'{n} 本見つかりました',skippedHead:'中国語版の作品 {n} 本をスキップしました（ToMe の翻訳と埋め込みには日本語の原版が必要です）',askHead:'ほかに中国語版・英語版が {n} 本あります。ToMe の翻訳と埋め込みには日本語の原版が必要です。原版に戻してホームに追加しますか？',editionZh:'中国語版',editionEn:'英語版',restoreAsk:'作品付属の復元ツール（{tool}）で日本語の原版に戻せます。古い作品の原版は起動時に正規ディスクを確認することがあります',restoreNone:'復元ツールが見つかりません。日本語の原版を自分でインストールしてから再スキャンしてください。ホームには追加しません',restoreYes:'原版に戻して追加',restoreConfirm:'{tool} を実行してパッチを削除します。もう一度押して確定',restoreNo:'追加しない',restoring:'復元中…',restored:'日本語の原版に戻してホームに追加しました',restoreSkipped:'ホームには追加しません',skippedTag:'中国語版・スキップ',skippedWhy:'このフォルダには中国語パッチ版のプログラムしかありません。日本語の原版に戻して（パッチ付属のアンインストールスクリプトなど）から再スキャンしてください',added:'{n} 本をホームに追加',none:'見つかりませんでした。パスを確認するか、ホーム設定の「ゲームライブラリ」から再スキャンできます。',
   onTip:'Hook 使用可：ゲームの原文を直接取得し、原文の非表示・置き換えにも対応',verified:'ゲーム内で Hook を確認済み',byEngine:'エンジン（{e}）から対応と判断。初回プレイ時に自動で確認します',
   offTip:'Hook なし：OCR とテキストパネルのみ使用できます',unity:'Unity エンジン：Hook が使えない場合があります。プレイ時に自動で確認します',noGame:'ゲームファイル未登録（ホーム設定の「ゲームライブラリ」からスキャンできます）',unknown:'Hook 対応エンジンを検出できません',
   notFound:'Steam が見つかりません。入力するか参照してください',newFound:'新しいノベルゲーム {n} 本をホームに追加しました',menu:'ゲームライブラリ',menuText:'Steam／その他のフォルダを設定し、再スキャンしてホームに追加',menuBtn:'フォルダ設定とスキャン',isNew:'新規',inHome:'登録済み',missing:'ファイルなし'}};
 const t=(k,v={})=>{const lang=window.__tomeI18n?.get?.()||'zh';let s=(T[lang]||T.zh)[k]||T.zh[k]||k;for(const [a,x] of Object.entries(v))s=s.replace('{'+a+'}',x);return s;};
 const request=(action,args)=>b.v4Request?b.v4Request(action,args):Promise.reject(Error('ToMe 服务尚未就绪'));
 const invoke=(cmd,args)=>window.__TAURI_INTERNALS__.invoke(cmd,args);
 const norm=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[\s\-_:：・~～!！?？'"「」『』【】()（）\[\]［］、。,.…♪☆★]/g,'');
 let db=null;const sql=async()=>db||(db=await invoke('plugin:sql|load',{db:'sqlite:immersion.db'}));
 const select=async(query,values=[])=>invoke('plugin:sql|select',{db:await sql(),query,values});
 const execute=async(query,values=[])=>invoke('plugin:sql|execute',{db:await sql(),query,values});

 const style=document.createElement('style');style.textContent=String.raw`
 .tome-lib-back{position:fixed;inset:0;z-index:2147482800;display:grid;place-items:center;background:rgba(0,0,0,.42);animation:tome-lib-fade .18s ease both}
 @keyframes tome-lib-fade{from{opacity:0}}
 .tome-lib{box-sizing:border-box;width:min(560px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:22px 24px 18px;border-radius:16px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);background:color-mix(in srgb,var(--theme-surface,#18181b) 96%,#000 4%);color:var(--theme-text,#e8e9ec);font:13.5px/1.6 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;box-shadow:0 24px 70px rgba(0,0,0,.45);transform-origin:50% 50%;animation:tome-lib-in .28s cubic-bezier(.16,1,.3,1) both}
 @keyframes tome-lib-in{from{opacity:0;scale:.96}}
 .tome-lib h2{margin:0 0 4px;font-size:18px;font-weight:700;display:flex;align-items:center;gap:9px}
 .tome-lib h2::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--theme-primary,#e0495a);box-shadow:0 0 8px var(--theme-primary,#e0495a)}
 .tome-lib .sub{margin:0 0 18px;color:var(--theme-textSecondary,#9aa3b2);font-size:12.5px}
 .tome-lib label.row{display:block;margin:0 0 14px}
 .tome-lib .row>span{display:block;margin:0 0 6px;font-weight:650;font-size:13px}
 .tome-lib .line{display:flex;gap:8px}
 .tome-lib input{flex:1;min-width:0;height:36px;box-sizing:border-box;padding:0 12px;border-radius:9px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 14%,transparent);background:color-mix(in srgb,var(--theme-background,#111) 70%,transparent);color:inherit;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
 .tome-lib input:focus{border-color:var(--theme-primary,#e0495a);box-shadow:0 0 0 3px color-mix(in srgb,var(--theme-primary,#e0495a) 16%,transparent)}
 .tome-lib button{height:36px;padding:0 14px;border-radius:9px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 14%,transparent);background:color-mix(in srgb,var(--theme-text,#eee) 6%,transparent);color:inherit;font:inherit;font-weight:650;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
 .tome-lib button:hover{background:color-mix(in srgb,var(--theme-text,#eee) 11%,transparent)}
 .tome-lib button.primary{border-color:transparent;background:var(--theme-primary,#e0495a);color:#fff}
 .tome-lib button.primary:hover{filter:brightness(1.08)}
 .tome-lib button:disabled{opacity:.5;cursor:default}
 .tome-lib .check{min-height:18px;margin-top:5px;font-size:12px;color:var(--theme-textSecondary,#9aa3b2)}
 .tome-lib .check[data-ok=true]{color:#4fc27a}.tome-lib .check[data-ok=true]::before{content:"✓ "}
 .tome-lib .check[data-ok=false]{color:#e0606e}.tome-lib .check[data-ok=false]::before{content:"✕ "}
 .tome-lib .foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
 .tome-lib .bar{height:4px;border-radius:2px;background:color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);overflow:hidden;margin:14px 0 6px}
 .tome-lib .bar i{display:block;height:100%;width:0;background:var(--theme-primary,#e0495a);transition:width .2s}
 .tome-lib .progress{font-size:12px;color:var(--theme-textSecondary,#9aa3b2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .tome-lib .list{margin:12px 0 0;max-height:280px;overflow:auto;border-radius:10px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 8%,transparent)}
 .tome-lib .game{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 6%,transparent)}
 .tome-lib .game:first-child{border-top:0}
 .tome-lib .game b{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .tome-lib .game small{color:var(--theme-textSecondary,#9aa3b2);font-size:11.5px;white-space:nowrap}
 .tome-lib .game em{font-style:normal;font-size:11px;padding:1px 7px;border-radius:4px;background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent)}
 .tome-lib .game em[data-new]{background:color-mix(in srgb,var(--theme-primary,#e0495a) 18%,transparent);color:var(--theme-primary,#e0495a)}
 .tome-hook-lamp{position:relative;display:inline-block;flex:none;width:8px;height:8px;margin-left:8px;border-radius:50%;vertical-align:middle;background:color-mix(in srgb,var(--theme-text,#eee) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,#000 30%,transparent);cursor:help}
 .tome-hook-lamp[data-on]{background:#3ddc7a;box-shadow:0 0 0 2px color-mix(in srgb,#3ddc7a 22%,transparent),0 0 8px #3ddc7a}
 .tome-lib-status{display:flex;align-items:center}
 .tome-hook-chip{display:inline-flex;align-items:center;gap:5px;margin-left:10px;padding:1px 7px 1px 6px;border-radius:5px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent);color:color-mix(in srgb,var(--theme-text,#eee) 45%,transparent);font:600 10.5px/1.5 Consolas,"Cascadia Mono",monospace;letter-spacing:.04em;cursor:help;transition:border-color .15s}
 .tome-hook-chip[data-on]{color:var(--theme-text,#e8e9ec);border-color:color-mix(in srgb,#3ddc7a 40%,transparent)}
 .tome-hook-chip .tome-hook-lamp{margin-left:0;width:6px;height:6px}
 .tome-hook-chip:hover{border-color:color-mix(in srgb,var(--theme-text,#eee) 30%,transparent)}
 .tome-hook-tip{position:fixed;z-index:2147483000;max-width:260px;padding:7px 10px;border-radius:8px;background:color-mix(in srgb,var(--theme-surface,#18181b) 96%,#000 4%);border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent);color:var(--theme-text,#e8e9ec);font:12px/1.55 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;box-shadow:0 8px 22px rgba(0,0,0,.35);pointer-events:none;animation:tome-lib-fade .12s ease both}
 .tome-hook-tip b{display:flex;align-items:center;gap:6px;margin-bottom:2px}
 .tome-hook-tip small{display:block;color:var(--theme-textSecondary,#9aa3b2);font-size:11.5px}
 .tome-lib-menu{margin-top:4px}
 .tome-lib-toast{position:fixed;right:20px;bottom:20px;z-index:2147482900;display:flex;align-items:center;gap:9px;padding:10px 16px 10px 13px;border-radius:11px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);background:color-mix(in srgb,var(--theme-surface,#18181b) 96%,#000 4%);color:var(--theme-text,#e8e9ec);font:600 13px/1.5 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4);animation:tome-lib-toast 4.6s ease both;pointer-events:none}
 .tome-lib-toast::before{content:"";width:8px;height:8px;border-radius:50%;background:#3ddc7a;box-shadow:0 0 8px #3ddc7a}
 @keyframes tome-lib-toast{0%{opacity:0;translate:0 8px}7%,85%{opacity:1;translate:0 0}100%{opacity:0;translate:0 4px}}
 .page.home .category-row{display:none!important}`;
 document.head.append(style);
 // ToMe only reads galgames (embedded translation) and looks words up, so the home page's media categories
 // (visual novel / game / light novel / book / other) are hidden. Keep "all" selected first, so no work stays filtered out.
 new MutationObserver(()=>{const pills=document.querySelectorAll('.page.home .category-pill');if(pills.length&&!pills[0].classList.contains('active'))pills[0].click();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});

 // ── Setup window ─────────────────────────────────────────────────────────────────────────────────────────────────
 let open=false;
 async function setup(){
  if(open)return;open=true;let state={steamPath:'',folders:[]};try{state=await request('libraryLoad');}catch{}
  const back=document.createElement('div');back.className='tome-lib-back';const box=document.createElement('div');box.className='tome-lib';box.setAttribute('role','dialog');back.append(box);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const field=(label,hint,value)=>{const row=el('label','row');const line=el('div','line');const input=el('input');input.placeholder=hint;input.value=value||'';input.spellcheck=false;const check=el('div','check');row.append(el('span',null,label),line,check);line.append(input);return {row,line,input,check};};
  const steam=field(t('steam'),t('steamHint'),state.steamPath),other=field(t('other'),t('otherHint'),(state.folders||[]).join('; '));
  const browse=f=>{const btn=el('button',null,t('browse'));btn.type='button';btn.onclick=async()=>{try{const p=await invoke('plugin:dialog|open',{options:{directory:true,multiple:false}});if(typeof p==='string'&&p){f.input.value=f===other&&f.input.value.trim()?f.input.value.trim().replace(/;?\s*$/,'; ')+p:p;f.input.dispatchEvent(new Event('input'));}}catch{}};return btn;};
  const auto=el('button',null,t('auto'));auto.type='button';steam.line.append(auto,browse(steam));other.line.append(browse(other));
  const head=el('h2',null,t('title')),sub=el('p','sub',t('sub'));const body=el('div');body.append(steam.row,other.row);
  const foot=el('div','foot'),skip=el('button',null,t('skip')),go=el('button','primary',t('scan'));skip.type=go.type='button';foot.append(skip,go);
  box.append(head,sub,body,foot);document.body.append(back);
  const close=()=>{back.remove();open=false;removeEventListener('keydown',esc,true);};const esc=e=>{if(e.key==='Escape'&&!go.disabled){e.preventDefault();e.stopImmediatePropagation();skip.click();}};addEventListener('keydown',esc,true);
  const verify=(f,kind)=>{let timer=0;const run=async()=>{const v=f.input.value.trim();if(!v){f.check.removeAttribute('data-ok');f.check.textContent='';return;}
    if(kind==='folder'){const parts=v.split(';').map(s=>s.trim()).filter(Boolean),res=await Promise.all(parts.map(p=>request('libraryCheck',{kind,value:p}).catch(e=>({ok:false,message:e.message}))));const bad=res.findIndex(r=>!r.ok);f.check.dataset.ok=String(bad<0);f.check.textContent=bad<0?res.map(r=>r.message).join('；'):parts[bad]+'：'+res[bad].message;return;}
    try{const r=await request('libraryCheck',{kind,value:v});f.check.dataset.ok=String(!!r.ok);f.check.textContent=r.message;}catch(e){f.check.dataset.ok='false';f.check.textContent=e.message;}};
   f.input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(run,300);});run();};
  verify(steam,'steam');verify(other,'folder');
  auto.onclick=async()=>{auto.disabled=true;try{const r=await request('librarySteam');if(r.path){steam.input.value=r.path;steam.input.dispatchEvent(new Event('input'));}else{steam.check.dataset.ok='false';steam.check.textContent=t('notFound');}}catch{}auto.disabled=false;};
  if(!state.steamPath&&!state.setupDone)auto.click();
  skip.onclick=async()=>{try{await request('librarySettings',{steamPath:steam.input.value,folders:other.input.value,setupDone:true});}catch{}close();};
  go.onclick=async()=>{
   go.disabled=skip.disabled=auto.disabled=true;
   try{await request('librarySettings',{steamPath:steam.input.value,folders:other.input.value,setupDone:true});}catch{}
   const bar=el('div','bar'),fill=el('i'),progress=el('div','progress',t('scanning')+'…');bar.append(fill);body.replaceChildren(bar,progress);
   window.__tomeLibraryProgress=p=>{fill.style.width=(p.total?Math.round(p.done/p.total*100):0)+'%';progress.textContent=t('scanning')+' '+p.done+'/'+p.total+(p.title?' · '+p.title:'');};
   let games=[],added=0;try{games=await request('libraryScan');added=await addToHome(games);}catch(e){progress.textContent=e.message;}
   window.__tomeLibraryProgress=null;const skipped=games.filter(g=>g.skipped==='translated');games=games.filter(g=>!g.missing);
   fill.style.width='100%';progress.textContent=games.length?t('found',{n:games.length})+(added?' · '+t('added',{n:added}):''):t('none');
   if(games.length){const list=el('div','list');for(const g of games){const row=el('div','game'),lamp=el('span','tome-hook-lamp');if(lampOn(g))lamp.dataset.on='';lamp.dataset.tip=JSON.stringify(tip(g));row.append(lamp,el('b',null,g.title),el('small',null,g.engine||'—'));const tag=el('em',null,g.isNew?t('isNew'):t('inHome'));if(g.isNew)tag.dataset.new='';row.append(tag);list.append(row);}body.append(list);}
   if(skipped.length){const list=el('div','list tome-lib-skipped');
    for(const g of skipped){const row=el('div','game tome-lib-ask'),lamp=el('span','tome-hook-lamp'),edition=g.lang==='en'?t('editionEn'):t('editionZh');row.append(lamp,el('b',null,g.title),el('small',null,edition+' · '+(g.engine||'—')));
     const note=el('small','tome-lib-note',g.restore?t('restoreAsk',{tool:g.restore}):t('restoreNone'));const actions=el('span','tome-lib-choices');
     const no=el('button','tome-lib-no',t('restoreNo'));no.type='button';no.onclick=()=>{row.dataset.done='no';note.textContent=t('restoreSkipped');actions.remove();};actions.append(no);
     if(g.restore){const yes=el('button','tome-lib-yes',t('restoreYes'));yes.type='button';let armed=0;
      yes.onclick=async()=>{if(Date.now()-armed>6000){armed=Date.now();yes.textContent=t('restoreConfirm',{tool:g.restore});return;}yes.disabled=no.disabled=true;yes.textContent=t('restoring');
       try{await request('libraryRestore',{dir:g.dir});const again=await request('libraryScan');const n=await addToHome(again);row.dataset.done='yes';note.textContent=t('restored');actions.remove();if(n)added+=n;}catch(e){note.textContent=(e?.message||'')+'';yes.disabled=no.disabled=false;yes.textContent=t('restoreYes');armed=0;}};actions.prepend(yes);}
     row.append(actions,note);list.append(row);}
    body.append(el('div','progress tome-lib-askhead',t('askHead',{n:skipped.length})),list);}
   skip.remove();go.textContent=t('done');go.disabled=false;go.onclick=()=>{close();if(added&&/^\/?$/.test(location.pathname))location.reload();};
  };
 }
 // Links every found game to an existing home entry of the same title, or adds a new one with its cover.
 async function addToHome(games){
  let added=0;const rows=await select('SELECT id,title,cover_path FROM media');const byTitle=new Map(rows.map(r=>[norm(r.title),r]));const ids=new Set(rows.map(r=>r.id));const links=[];
  for(const g of games){if(g.missing)continue;
   if(g.mediaId&&ids.has(g.mediaId)){g.isNew=false;const row=rows.find(r=>r.id===g.mediaId);if(!row.cover_path&&g.cover)await execute('UPDATE media SET cover_path=$1,updated_at=unixepoch() WHERE id=$2',[g.cover,g.mediaId]);continue;}
   const same=[g.title,...(g.names||[])].map(n=>byTitle.get(norm(n))).find(Boolean);
   if(same){links.push({key:g.key,mediaId:same.id});g.mediaId=same.id;g.isNew=false;if(!same.cover_path&&g.cover)await execute('UPDATE media SET cover_path=$1,updated_at=unixepoch() WHERE id=$2',[g.cover,same.id]);continue;}
   const r=await execute('INSERT INTO media (title, cover_path, status, color, media_type, vndb_id) VALUES ($1,$2,$3,$4,$5,$6)',[g.title,g.cover||null,'active','#89b4fa','visual_novel',g.vndbId||null]);
   let id=Array.isArray(r)?r[1]:r?.lastInsertId;if(!Number.isSafeInteger(id)){const last=await select('SELECT id FROM media WHERE title=$1 ORDER BY id DESC LIMIT 1',[g.title]);id=last[0]?.id;}
   if(Number.isSafeInteger(id)){links.push({key:g.key,mediaId:id});g.mediaId=id;g.isNew=true;added++;}}
  if(links.length)library=await request('libraryLink',{links});else library=null;mediaTitles=null;schedule();
  return added;
 }

 // ── Hook lamps on the home page ─────────────────────────────────────────────────────────────────────────────────
 let library=null,mediaTitles=null,queued=false,tipNode=null;
 const lampOn=g=>!!g&&(g.hook==='verified'||g.hook==='supported');
 function tip(g){
  if(!g)return {on:false,head:t('offTip'),note:t('noGame')};
  if(g.hook==='verified')return {on:true,head:t('onTip'),note:t('verified')+(g.engine?' · '+g.engine:'')};
  if(g.hook==='supported')return {on:true,head:t('onTip'),note:t('byEngine',{e:g.engine})};
  return {on:false,head:t('offTip'),note:g.hook==='unverified'?t('unity'):t('unknown')};
 }
 async function lamps(){
  queued=false;const cards=document.querySelectorAll('main.page.home .card');if(!cards.length)return;
  try{if(!library)library=(await request('libraryLoad')).games||[];if(!mediaTitles)mediaTitles=new Map((await select('SELECT id,title FROM media')).map(r=>[r.title,r.id]));}catch{return;}
  const byMedia=new Map(library.filter(g=>g.mediaId&&!g.missing).map(g=>[g.mediaId,g]));
  for(const card of document.querySelectorAll('main.page.home .card')){
   const title=card.querySelector(':scope > .title')?.textContent?.trim(),status=card.querySelector(':scope > .status');if(!title||!status)continue;
   const g=byMedia.get(mediaTitles.get(title));const info=tip(g),key=JSON.stringify(info);
   let chip=status.querySelector('.tome-hook-chip');if(chip&&chip.dataset.tip===key)continue;
   if(!chip){chip=document.createElement('span');chip.className='tome-hook-chip';chip.setAttribute('role','img');const dot=document.createElement('span');dot.className='tome-hook-lamp';chip.append(dot,'Hook');status.classList.add('tome-lib-status');status.append(chip);}
   chip.toggleAttribute('data-on',info.on);chip.firstChild.toggleAttribute('data-on',info.on);chip.dataset.tip=key;chip.setAttribute('aria-label',info.head);}
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>lamps());}}
 window.__tomeLibraryChanged=()=>{library=null;schedule();};
 document.addEventListener('pointerover',e=>{const lamp=e.target?.closest?.('.tome-hook-chip,.tome-hook-lamp[data-tip]');if(!lamp){tipNode?.remove();tipNode=null;return;}
  if(tipNode?.__lamp===lamp)return;tipNode?.remove();let info;try{info=JSON.parse(lamp.dataset.tip);}catch{return;}
  tipNode=document.createElement('div');tipNode.className='tome-hook-tip';tipNode.__lamp=lamp;const head=document.createElement('b');const dot=document.createElement('span');dot.className='tome-hook-lamp';dot.style.marginLeft='0';if(info.on)dot.dataset.on='';head.append(dot,info.head);const note=document.createElement('small');note.textContent=info.note;tipNode.append(head,note);document.body.append(tipNode);
  const r=lamp.getBoundingClientRect(),w=tipNode.offsetWidth,h=tipNode.offsetHeight;tipNode.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';tipNode.style.top=(r.top-h-8<8?r.bottom+8:r.top-h-8)+'px';},true);
 // Cards are re-rendered by the home page (filters, edits, deletes): titles may change, so the title map is refreshed too.
 new MutationObserver(records=>{if(records.every(r=>r.target?.closest?.('.tome-hook-tip,.tome-lib-back')))return;if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&n.matches?.('.card,.grid'))))mediaTitles=null;schedule();}).observe(document.documentElement,{childList:true,subtree:true});

 // Library management belongs to the home settings page, never to the in-game Alt+T panel.
 const settingsWords={
  zh:{title:'游戏库',scan:'扫描游戏文件夹',manual:'手动添加游戏',name:'作品名称',exe:'游戏程序（exe）',browse:'浏览…',add:'添加到主页',scanTitle:'自动扫描',scanDesc:'按设置的 Steam 和第三方游戏路径查找 gal，找到的会自动加入主页',manualDesc:'选择游戏原版的 exe（不要选汉化补丁或启动器）；名称留空时会用游戏文件夹名',namePh:'例如：CLANNAD',exePh:'选择或粘贴游戏 exe 的完整路径',adding:'正在添加…',added:'已添加到主页',hint:'扫描 Steam / 第三方游戏路径，或手动指定一个游戏程序',error:'添加失败，请检查名称和 exe 路径'},
  en:{title:'Game library',scan:'Scan game folders',manual:'Add a game manually',name:'Game title',exe:'Game executable (exe)',browse:'Browse…',add:'Add to home',scanTitle:'Automatic scan',scanDesc:'Looks for visual novels in your Steam and other game folders and adds them to the home page',manualDesc:'Pick the game\u2019s original exe (not a translation patch or launcher); an empty title uses the game folder\u2019s name',namePh:'e.g. CLANNAD',exePh:'Choose or paste the full path to the game exe',adding:'Adding…',added:'Added to home',hint:'Scan Steam / other game folders, or select a game executable manually',error:'Could not add game; check its title and executable path'},
  ja:{title:'ゲームライブラリ',scan:'ゲームフォルダをスキャン',manual:'ゲームを手動追加',name:'作品名',exe:'ゲーム実行ファイル（exe）',browse:'参照…',add:'ホームに追加',scanTitle:'自動スキャン',scanDesc:'設定した Steam とその他のゲームフォルダからノベルゲームを探し、見つけたものをホームに追加します',manualDesc:'ゲーム本来の exe を選んでください（翻訳パッチやランチャーは不可）。作品名が空ならフォルダ名を使います',namePh:'例：CLANNAD',exePh:'ゲームの exe を選ぶか、フルパスを貼り付け',adding:'追加中…',added:'ホームに追加しました',hint:'Steam・その他のフォルダをスキャンするか、ゲーム実行ファイルを手動指定します',error:'追加できませんでした。作品名と実行ファイルのパスを確認してください'}};
 const libraryText=()=>settingsWords[window.__tomeI18n?.get?.()]||settingsWords.zh;
 function homeLibrarySettings(){
  const nav=document.querySelector('.settings-page .settings-tabs'),content=document.querySelector('.settings-page .settings-content');if(!nav||!content||document.body.classList.contains('tomoyo-ui-translation'))return;
  let tab=nav.querySelector('[data-library-tab]');if(!tab){tab=document.createElement('button');tab.type='button';tab.className=nav.querySelector('button')?.className||'';tab.classList.remove('active');tab.dataset.libraryTab='';tab.dataset.noI18n='';nav.append(tab);
   nav.addEventListener('click',e=>{const own=e.target.closest('[data-library-tab]')===tab;content.classList.toggle('tome-library-selected',own);nav.classList.toggle('tome-library-selected',own);tab.classList.toggle('active',own);if(own)homeLibrarySettings();},true);}
  const w=libraryText();if(tab.textContent!==w.title)tab.textContent=w.title;
  if(!content.classList.contains('tome-library-selected'))return;
  let panel=content.querySelector(':scope>.tome-library-settings');if(!panel){panel=document.createElement('section');panel.className='tome-library-settings';panel.dataset.noI18n='';panel.innerHTML='<h3 data-lib-title></h3><small data-lib-hint></small><div class="tome-lib-card tome-lib-scanrow"><div><b data-lib-scan-title></b><small data-lib-scan-desc></small></div><button type="button" class="tome-lib-primary" data-lib-scan></button></div><div class="tome-lib-card"><h4 data-lib-manual></h4><small data-lib-manual-desc></small><label><span data-lib-name-label></span><input data-lib-name maxlength="180"></label><label><span data-lib-exe-label></span><span class="tome-lib-pick"><input data-lib-exe spellcheck="false"><button type="button" data-lib-browse></button></span></label><div class="tome-library-actions"><small data-lib-result role="status"></small><button type="button" class="tome-lib-primary" data-lib-add></button></div></div>';content.append(panel);
   panel.querySelector('[data-lib-scan]').onclick=()=>setup();
   panel.querySelector('[data-lib-browse]').onclick=async()=>{try{const file=await invoke('plugin:dialog|open',{options:{directory:false,multiple:false,filters:[{name:libraryText().exe,extensions:['exe']}]}});if(typeof file==='string'){panel.querySelector('[data-lib-exe]').value=file;const name=panel.querySelector('[data-lib-name]');if(!name.value.trim())name.value=file.split(/[\\/]/).slice(-2,-1)[0]||'';}}catch{panel.querySelector('[data-lib-result]').textContent=libraryText().error;}};
   panel.querySelector('[data-lib-add]').onclick=async()=>{const button=panel.querySelector('[data-lib-add]'),status=panel.querySelector('[data-lib-result]');button.disabled=true;status.textContent=libraryText().adding;delete status.dataset.state;try{const game=await request('libraryManualAdd',{title:panel.querySelector('[data-lib-name]').value,exe:panel.querySelector('[data-lib-exe]').value});await addToHome([game]);library=null;status.textContent=libraryText().added;status.dataset.state='ok';window.__tomeLibraryChanged?.();}catch(e){const zh=(window.__tomeI18n?.get?.()||'zh').startsWith('zh');status.textContent=zh&&e?.message?e.message:libraryText().error;status.dataset.state='error';}finally{button.disabled=false;}};
  }
  panel.querySelector('[data-lib-name]').placeholder=w.namePh;panel.querySelector('[data-lib-exe]').placeholder=w.exePh;
  for(const [key,word]of Object.entries({'title':'title','hint':'hint','scan':'scan','scan-title':'scanTitle','scan-desc':'scanDesc','manual':'manual','manual-desc':'manualDesc','name-label':'name','exe-label':'exe','browse':'browse','add':'add'})){const node=panel.querySelector('[data-lib-'+key+']');if(node.textContent!==w[word])node.textContent=w[word];}
 }
 const libraryStyle=document.createElement('style');
 const libraryCardStyle=`.tome-library-settings{padding:8px 0 18px!important;max-width:760px!important}.tome-library-settings>h3{margin:0 0 4px}.tome-library-settings>small{display:block;color:var(--theme-textSecondary,#999);margin-bottom:16px}
 .tome-lib-card{margin:0 0 14px;padding:16px 18px;border-radius:14px;border:1px solid var(--theme-border,#2a2a2e);background:color-mix(in srgb,var(--theme-surface,#18181b) 72%,transparent)}
 .tome-lib-card h4{margin:0 0 4px;font-size:14px}.tome-lib-card small{display:block;color:var(--theme-textSecondary,#999);font-size:12px;line-height:1.6}
 .tome-lib-scanrow{display:flex;align-items:center;justify-content:space-between;gap:16px}.tome-lib-scanrow b{display:block;font-size:14px;margin-bottom:2px}
 .tome-library-settings .tome-lib-card label{display:block;margin:14px 0 0}.tome-library-settings .tome-lib-card label>span:first-child{display:block;font-size:12.5px;color:var(--theme-textSecondary,#aaa);margin-bottom:6px}
 .tome-library-settings .tome-lib-card input{display:block;box-sizing:border-box;width:100%;margin:0!important;padding:10px 12px!important;border-radius:10px!important;border:1px solid var(--theme-border,#34343b)!important;background:var(--theme-background,#111114)!important;color:var(--theme-text,#eee)!important;font:inherit;outline:none!important;transition:border-color .15s}
 .tome-library-settings .tome-lib-card input:focus{border-color:var(--theme-primary,#e0495a)!important}.tome-library-settings .tome-lib-card input::placeholder{color:color-mix(in srgb,var(--theme-text,#eee) 35%,transparent)}
 .tome-lib-pick{display:flex;gap:8px}.tome-lib-pick input{flex:1;min-width:0;font-family:Consolas,'Cascadia Mono',monospace!important;font-size:12.5px!important}
 .tome-library-settings button{padding:9px 16px;border-radius:10px;border:1px solid var(--theme-border,#34343b);background:transparent;color:var(--theme-text,#eee);font:inherit;font-weight:600;cursor:pointer;white-space:nowrap;transition:border-color .15s,background .15s}.tome-library-settings button:hover{border-color:var(--theme-primary,#e0495a)}
 .tome-library-settings button.tome-lib-primary{background:var(--theme-primary,#e0495a);border-color:transparent;color:#fff}.tome-library-settings button.tome-lib-primary:hover{filter:brightness(1.08)}.tome-library-settings button:disabled{opacity:.55;cursor:progress}
 .tome-library-settings .tome-library-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:16px}.tome-library-actions [data-lib-result]{flex:1;margin:0!important}
 [data-lib-result][data-state=ok]{color:#45c47f!important}[data-lib-result][data-state=error]{color:#e6a56f!important}
 /* Compact controls (user, 2026-11-02): the host's global button style made them oversized. */
 .tome-library-settings .tome-lib-card button{height:32px!important;min-height:0!important;padding:0 14px!important;border-radius:8px!important;font-size:13px!important;line-height:1!important;font-weight:600!important;box-shadow:none!important}
 .tome-library-settings .tome-lib-scanrow button.tome-lib-primary{background:transparent!important;border:1px solid var(--theme-border,#34343b)!important;color:var(--theme-text,#eee)!important}.tome-library-settings .tome-lib-scanrow button.tome-lib-primary:hover{border-color:var(--theme-primary,#e0495a)!important;filter:none}
 .tome-library-settings .tome-lib-card input{height:36px!important;padding:0 12px!important;font-size:13px!important;line-height:36px!important}.tome-lib-pick{align-items:center}.tome-lib-pick button{flex:none}
 /* Lamp, title and edition line up like the rows above; the choices sit on the right across the first two lines. */
 .tome-lib-skipped .game.tome-lib-ask{display:grid!important;grid-template-columns:auto 1fr auto;align-items:center;gap:2px 10px}
 .tome-lib-ask>.tome-hook-lamp{grid-column:1;grid-row:1}.tome-lib-ask>b{grid-column:2;grid-row:1;min-width:0}.tome-lib-ask>small:not(.tome-lib-note){grid-column:2;grid-row:2;justify-self:start;margin:0!important}
 .tome-lib-ask>.tome-lib-note{grid-column:2/-1;grid-row:3;margin-top:4px;color:var(--theme-textSecondary,#999);font-size:11.5px;line-height:1.5}
 .tome-lib-askhead{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.6;margin-top:14px}.tome-lib-ask[data-done=no]{opacity:.55}.tome-lib-ask[data-done=yes] .tome-lib-note{color:#45c47f}
 .tome-lib-choices{display:flex;gap:6px;grid-column:3;grid-row:1/span 2;align-self:center}.tome-lib-choices button{padding:5px 12px;border-radius:8px;border:1px solid var(--theme-border,#34343b);background:transparent;color:var(--theme-text,#eee);font:inherit;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap}.tome-lib-choices button.tome-lib-yes{background:var(--theme-primary,#e0495a);border-color:transparent;color:#fff}.tome-lib-choices button:disabled{opacity:.55;cursor:progress}`;libraryStyle.textContent='.settings-content>.tome-library-settings{display:none}.settings-content.tome-library-selected>:not(.tome-library-settings){display:none!important}.settings-content.tome-library-selected>.tome-library-settings{display:block!important}.settings-tabs.tome-library-selected>button:not([data-library-tab]){background:transparent!important;color:var(--theme-textSecondary,#999)!important;border-color:transparent!important}.tome-library-settings{padding:18px;max-width:720px}.tome-library-settings label{display:block;margin:18px 0}.tome-library-settings input{display:block;box-sizing:border-box;width:100%;margin-top:7px;padding:9px 12px;border:1px solid var(--theme-border,#444);border-radius:8px;background:var(--theme-background,#111);color:var(--theme-text,#eee)}.tome-library-settings button{padding:9px 14px;margin:12px 8px 0 0;border:1px solid var(--theme-border,#444);border-radius:9px;background:var(--theme-surface,#222);color:var(--theme-text,#eee);cursor:pointer}.tome-library-actions{display:flex;flex-wrap:wrap}.tome-library-settings small{display:block;margin:8px 0;line-height:1.65;color:var(--theme-textSecondary,#aaa)}';document.head.append(libraryStyle);
 let librarySettingsQueued=false;new MutationObserver(()=>{if(librarySettingsQueued)return;librarySettingsQueued=true;requestAnimationFrame(()=>{librarySettingsQueued=false;homeLibrarySettings();});}).observe(document.documentElement,{childList:true,subtree:true});
 libraryStyle.textContent+=libraryCardStyle;addEventListener('tome-language-change',homeLibrarySettings);homeLibrarySettings();
 b.openLibrarySetup=setup;

 // ── First start: once the home page is up in normal mode ────────────────────────────────────────────────────────
 (async()=>{const until=Date.now()+60000;while(Date.now()<until){if(b.v4Request&&document.querySelector('main.page.home')&&!document.body.classList.contains('tomoyo-ui-translation')&&!document.documentElement.classList.contains('tome-mode-cover'))break;await new Promise(r=>setTimeout(r,400));}
  try{const s=await request('libraryLoad');if(!s.setupDone){await new Promise(r=>setTimeout(r,700));if(!document.body.classList.contains('tomoyo-ui-translation'))setup();return;}
   // Every later start: look for newly installed games in the same folders, quietly. New ones go to the home page;
   // the page reloads only when nothing is open on it, otherwise the new entries appear on the next visit.
   if(!s.steamPath&&!(s.folders||[]).length)return;const games=await request('libraryScan');const added=await addToHome(games);if(!added)return;
   sessionStorage.setItem('tome-lib-toast',String(added));const busy=()=>open||document.querySelector('.tomoyo-cn-dialog[open],.tome-backlog')||document.body.classList.contains('tomoyo-ui-translation');
   if(/^\/?$/.test(location.pathname)&&!busy())location.reload();else toast();}catch{}})();
 function toast(){const n=Number(sessionStorage.getItem('tome-lib-toast'));sessionStorage.removeItem('tome-lib-toast');if(!n)return;const el=document.createElement('div');el.className='tome-lib-toast';el.textContent=t('newFound',{n});document.body.append(el);setTimeout(()=>el.remove(),4800);}
 setTimeout(toast,1200);
 // ── Starting games: a start button under the cover on a work's page ──
 const L={
  zh:{chooseVersion:'选择游戏版本',cancelVersion:'取消',start:'启动',starting:'等待游戏窗口',running:'等待游戏窗口',launched:'等待游戏窗口',noGame:'未关联游戏文件',noGameTip:'在主页设置「游戏库」里扫描游戏路径后即可在这里启动'},
  en:{chooseVersion:'Choose a game version',cancelVersion:'Cancel',start:'Start',starting:'Waiting for game window',running:'Waiting for game window',launched:'Waiting for game window',noGame:'No game files linked',noGameTip:'Scan your game folders from Game library in the home settings to start it from here'},
  ja:{chooseVersion:'ゲームのバージョンを選択',cancelVersion:'キャンセル',start:'起動',starting:'ゲームウィンドウを待機中',running:'ゲームウィンドウを待機中',launched:'ゲームウィンドウを待機中',noGame:'ゲームファイル未登録',noGameTip:'ホーム設定の「ゲームライブラリ」からゲームフォルダをスキャンすると、ここから起動できます'}};
 const versionName=label=>({en:{'HD版':'HD','原版':'Original'},ja:{'HD版':'HD版','原版':'オリジナル版'}}[window.__tomeI18n?.get?.()]||{})[label]||label;
 const lt=(k,v={})=>{const lang=window.__tomeI18n?.get?.()||'zh';let s=(L[lang]||L.zh)[k]||L.zh[k];for(const [a,x] of Object.entries(v))s=s.replace('{'+a+'}',x);return s;};
 const launchStyle=document.createElement('style');launchStyle.textContent=String.raw`
 .tome-start{grid-column:1;grid-row:1;align-self:start;box-sizing:border-box;width:clamp(96px,20cqi,180px);margin-top:calc(clamp(96px,20cqi,180px) * 230 / 153 + 10px);height:34px;display:flex;align-items:center;justify-content:center;gap:7px;border-radius:9px;border:0;background:var(--theme-primary,#e0495a);color:#fff;font:700 13px/1 "Microsoft YaHei UI","Yu Gothic UI",sans-serif;cursor:pointer;box-shadow:0 6px 16px color-mix(in srgb,var(--theme-primary,#e0495a) 30%,transparent);transition:filter .15s,transform .15s}
 .tome-start:hover{filter:brightness(1.08);transform:translateY(-1px)}
 .tome-start:active{transform:none}
 .tome-start svg{width:14px;height:14px;fill:currentColor}
 .tome-start[data-off]{background:color-mix(in srgb,var(--theme-text,#eee) 7%,transparent);color:var(--theme-textSecondary,#9aa3b2);box-shadow:none;font-weight:600;font-size:12px}
 .tome-start[disabled]{opacity:.6;cursor:default}`;
 document.head.append(launchStyle);

 // After a start the game binds as soon as its window appears; then the work's page switches to translation mode.
 let pendingBind=null;
 const status=b.galStatus;if(typeof status==='function')b.galStatus=message=>{const r=status(message);
  if(pendingBind&&message?.gameHwnd&&String(message.processName||'').toLowerCase()===pendingBind.name&&Date.now()<pendingBind.until){pendingBind=null;if(window.__tomoyoMode?.get?.()!=='translation')setTimeout(()=>window.__tomoyoMode?.requestToggle?.(),400);}
  return r;};
 // First Unity game: Unity's own fonts have no Chinese, so embedded translation needs a font pack (about 140 MB,
 // downloaded once for every Unity game). Resolves 'go' after the download, 'skip' to start without it, null to stop.
 const UF={
  zh:{title:'下载 Unity 中文字体包',text:'这是 Unity 引擎游戏。内嵌翻译要显示中文，需要先下载一次字体包（约 140 MB，所有 Unity 游戏共用，之后不再下载）。',download:'下载并启动',skip:'不下载，直接启动',cancel:'取消',progress:'正在下载 {a} / {b}',extract:'正在解压…',fail:'下载失败：{e}'},
  en:{title:'Download the Unity Chinese font pack',text:'This is a Unity game. Embedded translation needs a one-time font pack to show Chinese (about 140 MB, shared by all Unity games).',download:'Download and start',skip:'Start without it',cancel:'Cancel',progress:'Downloading {a} / {b}',extract:'Extracting…',fail:'Download failed: {e}'},
  ja:{title:'Unity 中国語フォントパックのダウンロード',text:'Unity エンジンのゲームです。埋め込み翻訳で中国語を表示するには、フォントパックを一度ダウンロードする必要があります（約 140 MB、すべての Unity ゲームで共通）。',download:'ダウンロードして起動',skip:'ダウンロードせずに起動',cancel:'キャンセル',progress:'ダウンロード中 {a} / {b}',extract:'展開中…',fail:'ダウンロード失敗：{e}'}};
 const uf=(k,v={})=>{const lang=window.__tomeI18n?.get?.()||'zh';let s=(UF[lang]||UF.zh)[k];for(const [a,x] of Object.entries(v))s=s.replace('{'+a+'}',x);return s;};
 const mb=n=>(n/1048576).toFixed(1)+' MB';
 function unityFontDialog(){return new Promise(resolve=>{
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const back=el('div','tome-lib-back'),box=el('div','tome-lib');box.setAttribute('role','dialog');back.append(box);
  const bar=el('progress');bar.max=1;bar.value=0;bar.hidden=true;bar.style.cssText='width:100%;margin:6px 0';const state=el('p','sub');
  const foot=el('div','foot'),cancel=el('button',null,uf('cancel')),skip=el('button',null,uf('skip')),go=el('button','primary',uf('download'));cancel.type=skip.type=go.type='button';foot.append(cancel,skip,go);
  box.append(el('h2',null,uf('title')),el('p','sub',uf('text')),bar,state,foot);document.body.append(back);
  let timer=0;const done=v=>{clearInterval(timer);back.remove();resolve(v);};
  cancel.onclick=()=>done(null);skip.onclick=()=>done('skip');
  go.onclick=async()=>{go.disabled=skip.disabled=true;bar.hidden=false;state.textContent='';
   try{await request('unityFontDownload');}catch(e){state.textContent=uf('fail',{e:e.message});go.disabled=skip.disabled=false;return;}
   timer=setInterval(async()=>{let s;try{s=await request('unityFontStatus');}catch{return;}
    if(s.state==='downloading'){bar.max=s.total||1;bar.value=s.received;state.textContent=uf('progress',{a:mb(s.received),b:s.total?mb(s.total):'?'});}
    else if(s.state==='extracting'){bar.removeAttribute('value');state.textContent=uf('extract');}
    else if(s.state==='done'||s.installed)done('go');
    else if(s.state==='error'){clearInterval(timer);state.textContent=uf('fail',{e:s.error});go.disabled=skip.disabled=false;}},500);};
 });}
 const LE={
  zh:{title:'Locale Emulator',missing:'未自动识别到路径',incomplete:'检测到旧安装目录，但运行组件不完整',question:'是否自动下载并安装到 ToMe 目录？随后使用 Run in Japanese 启动游戏',download:'自动下载并安装',cancel:'取消启动',normal:'普通启动（可能乱码）',busy:'正在下载并安装…',failed:'安装失败：{e}',hint:'（Run in Japanese）'},
  en:{title:'Locale Emulator',missing:'Path not detected automatically',incomplete:'An existing folder was found, but runtime components are missing',question:'Download and install into the ToMe folder, then launch with Run in Japanese?',download:'Download and install',cancel:'Cancel launch',normal:'Start normally (text may be garbled)',busy:'Downloading and installing…',failed:'Installation failed: {e}',hint:' (Run in Japanese)'},
  ja:{title:'Locale Emulator',missing:'パスを自動検出できませんでした',incomplete:'既存のフォルダは見つかりましたが、実行用ファイルが不足しています',question:'ToMe フォルダに自動ダウンロード・展開して、Run in Japanese で起動しますか？',download:'ダウンロードして導入',cancel:'起動をキャンセル',normal:'通常起動（文字化けの可能性あり）',busy:'ダウンロード・展開中…',failed:'導入失敗：{e}',hint:'（Run in Japanese）'}};
 const le=(k,v={})=>{let text=(LE[window.__tomeI18n?.get?.()]||LE.zh)[k];for(const [a,b]of Object.entries(v))text=text.replace('{'+a+'}',b);return text;};
 const leError=value=>{const code=String(value||''),messages={zh:{LE_COMPONENTS_MISSING:'官方组件初始化失败，请重试',LE_PACKAGE_INVALID:'下载的文件不完整，请重试',LE_GAME_NOT_STARTED:'日语环境已启动，但未检测到游戏窗口，请查看日志',LE_X86_ONLY:'此游戏为 64 位，不能使用 Locale Emulator',LE_PROCESS_CHECK_FAILED:'无法确认游戏是否已启动',LE_INSTALL_FAILED:'安装未完成，详细原因已保存到 locale-emulator.log'},en:{LE_COMPONENTS_MISSING:'Could not initialize official components; please retry',LE_PACKAGE_INVALID:'The download is incomplete; please retry',LE_GAME_NOT_STARTED:'No game window appeared after Japanese launch; check the log',LE_X86_ONLY:'Locale Emulator cannot run 64-bit games',LE_PROCESS_CHECK_FAILED:'Could not verify the game process',LE_INSTALL_FAILED:'Installation failed; details are in locale-emulator.log'},ja:{LE_COMPONENTS_MISSING:'公式コンポーネントを初期化できませんでした。再試行してください',LE_PACKAGE_INVALID:'ダウンロードが不完全です。再試行してください',LE_GAME_NOT_STARTED:'日本語環境で起動後、ゲームウィンドウを確認できませんでした',LE_X86_ONLY:'Locale Emulator は 64 ビットゲームに対応していません',LE_PROCESS_CHECK_FAILED:'ゲームの起動を確認できませんでした',LE_INSTALL_FAILED:'導入に失敗しました。詳細は locale-emulator.log を確認してください'}};return (messages[window.__tomeI18n?.get?.()]||messages.zh)[code]||code;};
 function localeDialog(info){return new Promise(resolve=>{
  const previous=document.activeElement,back=document.createElement('div'),box=document.createElement('div');back.className='tome-lib-back';box.className='tome-lib';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',le('title'));back.append(box);
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};box.append(node('h2',le('title')),node('p',le('missing')));if(info.incompletePath)box.append(node('p',le('incomplete')));box.append(node('p',le('question')));const dest=node('p',info.installDir);dest.className='sub';box.append(dest);const state=node('p',''),foot=node('div','');foot.className='foot';const cancel=node('button',le('cancel')),normal=node('button',le('normal')),go=node('button',le('download'));for(const b of [cancel,normal,go])b.type='button';go.className='primary';foot.append(cancel,normal,go);box.append(state,foot);document.body.append(back);let timer=0,busy=false,closed=false;
  const done=v=>{if(closed)return;closed=true;clearTimeout(timer);document.removeEventListener('keydown',keys,true);back.remove();previous?.focus();resolve(v);};
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!busy)done(null);}else if(e.key==='Tab'){const buttons=[...box.querySelectorAll('button:not([disabled])')];if(!buttons.length){e.preventDefault();return;}const i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}};document.addEventListener('keydown',keys,true);cancel.onclick=()=>done(null);normal.onclick=()=>done('normal');go.focus();
  go.onclick=async()=>{busy=true;go.disabled=normal.disabled=cancel.disabled=true;state.textContent=le('busy');try{await request('localeInstall');}catch(e){fail(e.message);return;}await poll();};
  function fail(error){busy=false;state.textContent=le('failed',{e:leError(error)});go.disabled=normal.disabled=cancel.disabled=false;}
  async function poll(){try{const s=await request('localeStatus');if(closed)return;if(s.installed){done('installed');return;}if(s.job?.state==='error'){fail(s.job.error);return;}state.textContent=le('busy')+(s.job?.total?' '+Math.min(100,Math.round(s.job.received/s.job.total*100))+'%':'');timer=setTimeout(poll,800);}catch(e){fail(e.message);}}
 });}
 function versionDialog(game){return new Promise(resolve=>{
  const previous=document.activeElement,back=document.createElement('div'),box=document.createElement('div');back.className='tome-lib-back';box.className='tome-lib';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',lt('chooseVersion'));back.append(box);
  const title=document.createElement('h2');title.textContent=lt('chooseVersion');const subtitle=document.createElement('p');subtitle.className='sub';subtitle.textContent=game.title;box.append(title,subtitle);
  const done=v=>{document.removeEventListener('keydown',keys,true);back.remove();previous?.focus();resolve(v);};
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(null);}else if(e.key==='Tab'){const buttons=[...box.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}};
  (game.variants||[]).forEach((v,i)=>{const button=document.createElement('button');button.type='button';button.className='tome-version-choice';button.textContent=versionName(v.label);button.title=v.exe+(v.localeJapanese?le('hint'):'');button.style.cssText='display:block;width:100%;margin:8px 0;text-align:left';button.onclick=()=>done(i);box.append(button);});
  const foot=document.createElement('div');foot.className='foot';const cancel=document.createElement('button');cancel.type='button';cancel.textContent=lt('cancelVersion');cancel.onclick=()=>done(null);foot.append(cancel);box.append(foot);back.onclick=e=>{if(e.target===back)done(null);};document.addEventListener('keydown',keys,true);document.body.append(back);box.querySelector('button').focus();
 });}
 async function start(game,note,variant){
  note?.(lt('starting'));let r,localeJapanese,skipUnityFont=false;
  for(;;){r=await request('libraryLaunch',{key:game.key,variant,localeJapanese,skipUnityFont});
   if(r?.needLocaleEmulator){const choice=await localeDialog(r);if(!choice){note?.(lt('start'));return null;}if(choice==='normal')localeJapanese=false;continue;}
   if(r?.needUnityFont){const choice=await unityFontDialog();if(!choice){note?.(lt('start'));return null;}skipUnityFont=choice==='skip';continue;}break;}
  pendingBind={name:r.name.toLowerCase(),until:Date.now()+180000};
  if(Number.isSafeInteger(r.mediaId)&&location.pathname!=='/media/'+r.mediaId)window.__tomoyoMode?.go?.('/media/'+r.mediaId);
  note?.(lt('launched'));return r;
 }

 // Start button under the cover of a work's page.
 const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
 async function startButton(){
  const m=/^\/media\/(\d+)\/?$/.exec(location.pathname),header=document.querySelector('.media-header'),cover=header?.querySelector(':scope > .cover');
  if(!m||!cover){return;}const id=Number(m[1]);let btn=header.querySelector(':scope > .tome-start');if(btn&&Number(btn.dataset.media)===id)return;
  if(!library)try{library=(await request('libraryLoad')).games||[];}catch{return;}
  const game=library.find(g=>g.mediaId===id&&!g.missing&&g.exe);if(!btn){btn=document.createElement('button');btn.type='button';btn.className='tome-start';header.append(btn);}
  for(const extra of header.querySelectorAll(':scope > .tome-start[data-variant]'))extra.remove();
  btn.dataset.media=String(id);btn.toggleAttribute('data-off',!game);
  if(game){
   const startLabel=lt('start');btn.innerHTML=playIcon;btn.append(startLabel);btn.title=game.title+(game.localeJapanese?le('hint'):'');
   btn.onclick=async()=>{btn.disabled=true;const label=btn.lastChild;try{const variant=(game.variants||[]).length>1?await versionDialog(game):undefined;if(variant===null){btn.disabled=false;return;}await start(game,s=>{label.textContent=s;},variant);}catch(e){label.textContent=leError(e.message);}setTimeout(()=>{btn.disabled=false;label.textContent=startLabel;},4000);};}
  else{btn.textContent=lt('noGame');btn.title=lt('noGameTip');btn.onclick=()=>setup();}
 }
 let startQueued=false;new MutationObserver(()=>{if(startQueued)return;startQueued=true;requestAnimationFrame(()=>{startQueued=false;startButton();});}).observe(document.documentElement,{childList:true,subtree:true});
 // ── Synopsis in the interface language on a work's page (fetched online, cached by the launcher) ────────────────
 // Only the shown text changes; the stored synopsis stays as it is unless it is edited here. A synopsis edited by
 // hand on this page is left alone from then on.
 const SYN={zh:{src:'简介来源：{s}',mt:'机翻',more:'展开',less:'收起'},en:{src:'Synopsis: {s}',mt:'machine translation',more:'More',less:'Less'},ja:{src:'あらすじ：{s}',mt:'機械翻訳',more:'続きを読む',less:'閉じる'}};
 const synT=(k,v={})=>{const lang=window.__tomeI18n?.get?.()||'zh';let s=(SYN[lang]||SYN.zh)[k];for(const [a,x] of Object.entries(v))s=s.replace('{'+a+'}',x);return s;};
 const synStyle=document.createElement('style');synStyle.textContent=String.raw`
 /* Text shown here while the stored synopsis is empty: hide the page's "no synopsis yet" placeholder. */
 .synopsis-text[data-tome-syn-filled]::before{content:none!important;display:none!important}
 .tome-syn-foot{display:flex;align-items:center;gap:12px;margin-top:4px;min-height:20px;width:100%;align-self:stretch;box-sizing:border-box}
 .tome-syn-foot:empty,.tome-syn-foot:not(:has(.tome-syn-src:not(:empty),.tome-syn-more:not([hidden]))){display:none}
 .tome-syn-src{flex:1;min-width:0;font-size:11px;color:color-mix(in srgb,var(--theme-text,#eee) 38%,transparent);letter-spacing:.02em}
 .tome-syn-more{all:unset;flex:none;display:inline-flex;align-items:center;gap:4px;padding:2px 10px 2px 11px;border-radius:999px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent);font-size:11.5px;font-weight:650;color:color-mix(in srgb,var(--theme-text,#eee) 72%,transparent);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
 .tome-syn-more:hover{color:var(--theme-primary,#e0495a);border-color:color-mix(in srgb,var(--theme-primary,#e0495a) 55%,transparent);background:color-mix(in srgb,var(--theme-primary,#e0495a) 8%,transparent)}
 .tome-syn-more svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s}
 .tome-syn-more[aria-expanded=true] svg{transform:rotate(180deg)}
 .synopsis-text:not([data-tome-expanded]),.synopsis-text.editing:not([data-tome-expanded]),.synopsis-text:focus:not([data-tome-expanded]){-webkit-line-clamp:10!important;line-clamp:10!important;display:-webkit-box!important;-webkit-box-orient:vertical!important;overflow:hidden!important}
 .synopsis-text[data-tome-expanded]{-webkit-line-clamp:unset!important;line-clamp:unset!important;display:block!important;overflow:visible!important}`;document.head.append(synStyle);
 let synShown=null,synSerial=0;
 const ownKey=id=>'tome-syn-own-'+id;
 function putSynopsis(el,text){el.dataset.tomeSynFilled='';el.replaceChildren();const lines=text.split('\n');lines.forEach((line,i)=>{if(i)el.appendChild(document.createElement('br'));if(line)el.appendChild(document.createTextNode(line));});}
 async function synopsis(force){
  const m=/^\/media\/(\d+)\/?$/.exec(location.pathname),el=document.querySelector('.media-header .synopsis-text');if(!m||!el)return;
  const id=Number(m[1]),lang=window.__tomeI18n?.get?.()||'zh',key=id+':'+lang;let own=false;try{own=!!localStorage.getItem(ownKey(id));}catch{}if(own)return;
  // The page re-renders the stored synopsis (its own VNDB fill, a save): put this language's text back.
  if(!force&&synShown?.key===key&&synShown.el===el){if(synShown.res&&document.activeElement!==el&&el.innerText!==synShown.text){putSynopsis(el,synShown.res.text);synShown.text=el.innerText;}return;}
  const serial=++synSerial;synShown={key,el,text:null};
  let row=null;try{row=(await select('SELECT title,vndb_id FROM media WHERE id=$1',[id]))[0];}catch{}
  if(!library)try{library=(await request('libraryLoad')).games||[];}catch{library=[];}
  const game=library.find(g=>g.mediaId===id);
  let res;try{res=await request('librarySynopsis',{mediaId:id,lang,titles:[row?.title,game?.title,...(game?.names||[])],vndbId:row?.vndb_id||game?.vndbId||null,appid:game?.source==='steam'?game.appid:null});}catch{return;}
  if(serial!==synSerial||!res?.text||!el.isConnected||document.activeElement===el)return;
  putSynopsis(el,res.text);synShown.text=el.innerText;synShown.res=res;
  const src=synFoot(el).querySelector('.tome-syn-src');
  src.textContent=synT('src',{s:String(res.source||'').replace('机翻',synT('mt'))});
  if(!el.dataset.tomeSyn){el.dataset.tomeSyn='1';el.addEventListener('blur',()=>{const text=el.innerText.replace(/\n+$/,'');if(synShown?.el===el&&synShown.text!=null&&text.trim()!==synShown.text.replace(/\n+$/,'').trim()){try{localStorage.setItem(ownKey(id),'1');}catch{}delete el.dataset.tomeSynFilled;const s=el.parentElement.querySelector(':scope > .tome-syn-foot .tome-syn-src');if(s)s.textContent='';}});}
 }
 // Under the synopsis: its source on the left, a More / Less toggle on the right when the text is cut off.
 function synFoot(el){let foot=el.parentElement.querySelector(':scope > .tome-syn-foot');
  if(!foot){foot=document.createElement('div');foot.className='tome-syn-foot';const src=document.createElement('span');src.className='tome-syn-src';const more=document.createElement('button');more.type='button';more.className='tome-syn-more';more.hidden=true;
   more.onclick=e=>{e.stopPropagation();const open=!el.hasAttribute('data-tome-expanded');el.toggleAttribute('data-tome-expanded',open);synToggle(el);};foot.append(src,more);el.after(foot);}
  return foot;}
 function synToggle(el){if(!el?.isConnected)return;const foot=synFoot(el),more=foot.querySelector('.tome-syn-more'),open=el.hasAttribute('data-tome-expanded');
  const cut=!open&&el.scrollHeight>el.clientHeight+2;more.hidden=!(open||cut);more.setAttribute('aria-expanded',String(open));
  const label=synT(open?'less':'more');if(more.dataset.label!==label+open){more.dataset.label=label+open;more.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';more.prepend(label);}}
 // Every work opens collapsed (the page may reuse one element when going from one work to the next).
 let synEl=null,synPath='';
 function synWatch(){const el=document.querySelector('.media-header .synopsis-text');if(el!==synEl||location.pathname!==synPath){if(synEl)synEl.removeAttribute('data-tome-expanded');el?.removeAttribute('data-tome-expanded');synEl=el;synPath=location.pathname;}if(el)synToggle(el);}
 addEventListener('resize',synWatch);
 let synQueued=false;new MutationObserver(()=>{if(synQueued)return;synQueued=true;requestAnimationFrame(()=>{synQueued=false;synopsis(false);synWatch();});}).observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('tome-language-change',()=>{synopsis(true);synWatch();});
})();
