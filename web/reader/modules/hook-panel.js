// SPDX-License-Identifier: GPL-3.0-or-later
(function installHookPanel(){
 'use strict';if(document.readyState==='loading'||!window.__tomoyoChinese?.galStatus){document.addEventListener('DOMContentLoaded',installHookPanel,{once:true});return;}const b=window.__tomoyoChinese;if(b.tomeHookPanel)return;b.tomeHookPanel=true;
 let state={},panels=new Set();
 const send=m=>window.__tomoyoTranslateRequest(JSON.stringify(m));
 /* E346 (user 2026-11-10): when no stream of any engine can be embedded, say once under the caption how to get the game adapted; the 内嵌 panel keeps the same line with a button. */
 const FEEDBACK_URL='https://github.com/ilynthn/MeguLit/issues',feedbackShown=new Set();
 const feedbackCopy=()=>({zh:['这个游戏暂时不能隐藏原文：请在「关于」里提交反馈，附上游戏名和截图，一般一天内就能适配','去反馈'],ja:['このゲームはまだ原文を隠せません：「について」からゲーム名とスクリーンショットを添えて報告してください。通常 1 日以内に対応します','報告する'],en:['This game cannot hide its original text yet. Send feedback from About with the game name and a screenshot; it is usually supported within a day','Send feedback']})[(document.documentElement.lang||'zh').slice(0,2)]||['这个游戏暂时不能隐藏原文：请在「关于」里提交反馈，附上游戏名和截图，一般一天内就能适配','去反馈'];
 const openFeedback=()=>{try{const inv=window.__TAURI_INTERNALS__?.invoke;if(inv){inv('plugin:opener|open_url',{url:FEEDBACK_URL}).catch(()=>navigator.clipboard?.writeText(FEEDBACK_URL));return;}}catch{}try{navigator.clipboard.writeText(FEEDBACK_URL);}catch{}};
 /* E347: a Chinese build (or Chinese text read as garbage) is said where the user is looking, once per game run */
 const chineseShown=new Set();
 function chineseNotice(){const id=String(state.gameProcessId||'')+'|'+String(state.gameStarted||'');if(chineseShown.has(id))return;chineseShown.add(id);document.querySelector('.megulit-chinese-notice')?.remove();
  const copy=({zh:'检测到游戏剧本目前是中文，MeguLit 需要日文原文。请先在游戏设置或 Steam（游戏属性 → 语言）里改成日文；游戏本身不支持日文的话，用「工具 → 日文原版恢复」；如果游戏目录里没有检测到日文剧本，需要先自行获取日文原版资源，再选「从日文原版导入」，支持直接导入生肉压缩包，自动恢复成日文',ja:'ゲームのシナリオが中国語になっています。MeguLit には日本語の原文が必要です。まずゲームの設定か Steam（プロパティ → 言語）で日本語に切り替えてください。ゲームが日本語に対応していなければ「ツール → 日本語原版に戻す」を使ってください。ゲームフォルダに日本語のシナリオが見つからない場合は、日本語版の素材を用意してから「日本語原版から取り込む」を選んでください（日本語版の圧縮ファイルをそのまま取り込めます）',en:'The game script is currently in Chinese, but MeguLit needs the Japanese original. First switch the game to Japanese in its own settings or in Steam (Properties → Language). If the game has no Japanese, use Tools → Restore Japanese original. If no Japanese script is found in the game folder, get the Japanese release yourself, then choose Import from the Japanese original; a Japanese release archive can be imported directly'})[(document.documentElement.lang||'zh').slice(0,2)]||'';
  const n=document.createElement('div');n.className='megulit-chinese-notice';n.setAttribute('role','alert');n.textContent=copy;
  n.style.cssText='font:13px/1.6 Meiryo,"Microsoft YaHei",sans-serif;color:#ffe2c2;background:rgba(70,16,16,.85);border:1px solid rgba(255,140,120,.45);border-radius:8px;padding:8px 12px;margin-top:8px;text-shadow:none;-webkit-text-stroke:0;cursor:pointer;transition:opacity .6s ease;';
  const host=document.querySelector('.sentence-window');if(host)host.appendChild(n);else{n.style.cssText+='position:fixed;z-index:2147481500;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(640px,calc(100vw - 32px));';document.body.appendChild(n);}
  const close=()=>{n.style.opacity='0';setTimeout(()=>n.remove(),650);};n.onclick=close;setTimeout(close,20000);}
 /* E370: a game started from another user's shared adaptation record says so once under the caption */
 let sharedShown=0;
 function sharedNotice(stamp){if(stamp===sharedShown)return;sharedShown=stamp;document.querySelector('.megulit-shared-notice')?.remove();
  const copy=({zh:'已套用共享适配设置',ja:'共有された適応設定を適用しました',en:'Applied shared adaptation settings'})[(document.documentElement.lang||'zh').slice(0,2)]||'已套用共享适配设置';
  const n=document.createElement('div');n.className='megulit-shared-notice';n.setAttribute('role','status');n.textContent=copy;
  n.style.cssText='font:13px/1.6 Meiryo,"Microsoft YaHei",sans-serif;color:#d4f3e2;background:rgba(12,40,28,.78);border:1px solid rgba(110,210,160,.35);border-radius:8px;padding:6px 10px;margin-top:8px;text-shadow:none;-webkit-text-stroke:0;cursor:pointer;transition:opacity .6s ease;';
  const host=document.querySelector('.sentence-window');if(host)host.appendChild(n);else{n.style.cssText+='position:fixed;z-index:2147481500;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(640px,calc(100vw - 32px));';document.body.appendChild(n);}
  const close=()=>{n.style.opacity='0';setTimeout(()=>n.remove(),650);};n.onclick=close;setTimeout(close,8000);}
 function captionFeedback(){const id=String(state.gameProcessId||'')+'|'+String(state.gameStarted||'');if(feedbackShown.has(id))return;feedbackShown.add(id);document.querySelector('.megulit-embed-feedback')?.remove();
  const n=document.createElement('div');n.className='megulit-embed-feedback';n.setAttribute('role','status');n.textContent=feedbackCopy()[0];
  n.style.cssText='font:13px/1.6 Meiryo,"Microsoft YaHei",sans-serif;color:#ffd9a8;background:rgba(40,20,10,.78);border:1px solid rgba(255,190,120,.35);border-radius:8px;padding:6px 10px;margin-top:8px;text-shadow:none;-webkit-text-stroke:0;cursor:pointer;transition:opacity .6s ease;';
  const host=document.querySelector('.sentence-window');if(host)host.appendChild(n);else{n.style.cssText+='position:fixed;z-index:2147481500;left:50%;bottom:24px;transform:translateX(-50%);max-width:min(620px,calc(100vw - 32px));';document.body.appendChild(n);}
  const close=()=>{n.style.opacity='0';setTimeout(()=>n.remove(),650);};n.addEventListener('click',e=>{e.stopPropagation();close();},{capture:true});setTimeout(close,8000);}
 const previous=b.galStatus;b.galStatus=m=>{previous(m);state={...state,...m};if(m.sourceChinese===true)chineseNotice();else if(m.sourceChinese===false)document.querySelector('.megulit-chinese-notice')?.remove();if(Number.isFinite(m.sharedAdaptation)&&m.sharedAdaptation>0)sharedNotice(m.sharedAdaptation);if(m.hookEmbedUnsupported===true)captionFeedback();else if(m.hookEmbedUnsupported===false)document.querySelector('.megulit-embed-feedback')?.remove();if(m.hookProfile)b.restoreGalSettings?.({hookProfile:m.hookProfile,maskMode:m.hookAutoOcr?'local':'hook',bindEnabled:true});for(const p of panels)if(p.isConnected)paint(p);else panels.delete(p);};
 const style=document.createElement('style');style.textContent=`
 .tome-hook-main{display:grid;gap:8px;margin-bottom:10px}.tome-hook-summary{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;padding:8px 10px;border-radius:9px;background:#7891ad16}.tome-hook-summary i{width:9px;height:9px;border-radius:50%;flex:none;background:#888}.tome-hook-summary[data-tone=ok] i{background:#4fc08a;box-shadow:0 0 6px #4fc08a99}.tome-hook-summary[data-tone=busy] i{background:#e0b04f}.tome-hook-summary[data-tone=warn] i{background:#e0794f}.tome-hooks .tome-hook-switch{display:flex!important;align-items:center;margin:0!important;font-size:13px;cursor:pointer}.tome-hook-hint{margin:-4px 0 0 41px}.tome-hook-advanced h5{margin:12px 0 0;font-size:12px}.tome-hook-advanced .tome-hook-switch{margin-top:12px!important}
 .tome-hooks{margin:15px 0;padding:14px;border:1px solid var(--theme-border,#45607e);border-radius:12px;background:color-mix(in srgb,var(--theme-background,#14263e) 45%,transparent)}
 .tome-hooks h4{margin:0 0 4px;font-size:15px}.tome-hooks p{margin:7px 0;font-size:12px;line-height:1.6}.tome-hook-engines{display:grid;gap:7px;margin:12px 0}.tome-hook-engines button{margin:0!important;padding:10px!important;text-align:left;border-radius:9px!important;width:100%}.tome-hook-engines button span{display:block;font-size:11px;opacity:.75;margin-top:3px}.tome-hook-engines button[aria-pressed=true]{border-color:var(--theme-primary,#82b6ff)!important;background:color-mix(in srgb,var(--theme-primary,#82b6ff) 15%,transparent)!important}.tome-hooks button:disabled{opacity:.45;cursor:not-allowed}.tome-hook-proof{padding:10px;border-radius:8px;background:#7891ad16}.tome-hook-proof[data-state=verified]{background:#3bbb771b;border:1px solid #59bd8a}.tome-hook-proof[data-state=visible],.tome-hook-proof[data-state=unsupported]{background:#e18b5b18;border:1px solid #d99b6b}.tome-hook-chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}.tome-hook-chips span{font-size:10px;padding:2px 5px;border-radius:4px;background:#88a8ce1c}.tome-hook-proof strong{font-size:12px;font-weight:500}.tome-hook-time{display:block;font-size:10px;opacity:.65;margin-top:5px}.tome-hook-row{padding:10px 0;border-bottom:1px solid var(--theme-border,#45607e)}.tome-hook-row>strong{font-size:12px;overflow-wrap:anywhere}.tome-hook-row>small{display:block;max-height:35px;overflow:hidden}.tome-hook-actions{display:flex;flex-wrap:wrap;gap:5px}.tome-hook-actions button{margin:6px 0 0!important;font-size:11px!important}
 `;document.head.append(style);
 function text(node,value){if(node.textContent!==value)node.textContent=value;}
 function paint(p){
for(const cb of p.querySelectorAll('[data-hook-pref]')){const v=cb.dataset.hookPref==='hookHide'?state.hookHide===true:state[cb.dataset.hookPref]!==false;if(cb.checked!==v&&document.activeElement!==cb)cb.checked=v;}
  {const hiding=['embed','euphoria474'].includes(state.hookProfile),threads=state.hookThreads||[],sel=threads.find(t=>t.selected);let tone='idle',parts=[];
   if(state.hookProfile==='off'){parts.push('Hook 已停止');}
   else{parts.push(state.processAttached?'游戏已连接':'等待游戏');if(sel)parts.push('文本流 '+sel.name.replace('EmbedEuphoria474_DrawHide_TEST2','YU-RIS 0.474'));
    if(hiding){if(state.hookCheckState==='visible'){parts.push('原文仍可见');tone='warn';}else if(['switching','baseline','checking'].includes(state.hookCheckState)||!state.processAttached){parts.push('隐藏切换中');tone='busy';}else{parts.push(state.hookVisualVerified?'原文已隐藏':'隐藏已开启');tone='ok';}}
    else if(state.hookHide&&state.hookAutoOcr){parts.push('OCR 遮盖原文');tone=state.processAttached?'ok':'idle';}
    else if(state.hookHide){parts.push('等待可隐藏的文本流');tone='busy';}else{parts.push('原文显示中（只读取）');tone=state.processAttached?'ok':'idle';}}
   const sum=p.querySelector('[data-hook-summary]');sum.dataset.tone=tone;text(p.querySelector('[data-hook-summary-text]'),parts.join(' · '));}
    // Chosen automatically: embed when the game's stream can be embedded, otherwise read + OCR cover.
    text(p.querySelector('[data-hook-mode]'),state.hookProfile==='off'?'Hook 已停止':state.hookProfile==='euphoria474'?'自动：YU-RIS 0.474 绘制隐藏原文':state.hookProfile==='embed'?'自动：LunaHook 内嵌，在引擎内隐藏原文':state.hookAutoOcr?'自动：只读取台词 + OCR 遮盖原文（当前已发现的文本流没有提供内嵌）':state.hookHide?'自动：只读取台词，等待可内嵌的文本流':'自动：只读取台词（未开启隐藏原文）');
  const proof=p.querySelector('[data-hook-proof]');proof.dataset.state=state.hookCheckState||'waiting';
  text(p.querySelector('[data-hook-message]'),state.hookEmbedUnsupported?feedbackCopy()[0]:state.hookCheckMessage||'选择下方 Hook 启动方式，再在游戏里推进一句');
  {const row=p.querySelector('[data-hook-feedback-row]'),show=state.hookEmbedUnsupported===true&&state.hookProfile!=='off';if(row.hidden===show)row.hidden=!show;text(row.querySelector('button'),feedbackCopy()[1]);}
  text(p.querySelector('[data-hook-connection]'),state.hookProfile==='off'?'已停止':state.processAttached?'游戏已连接':'等待游戏连接');
  text(p.querySelector('[data-hook-capture]'),state.receivedText&&state.hookCaptureCharacters?'已捕捉 '+state.hookCaptureCharacters+' 字':'等待新台词');
  text(p.querySelector('[data-hook-hide]'),state.hookVisualVerified?'隐藏检查通过':state.hookCheckState==='visible'?'原文仍可见':state.hookProfile==='read'?'仅读取':'画面待确认');
  text(p.querySelector('[data-hook-time]'),state.hookCheckedAt?'上次通过 '+new Date(state.hookCheckedAt).toLocaleTimeString()+' · 扫描区内未识别到日文':'检查游戏自身画面，翻译覆盖层不计入检查');
  p.querySelector('[data-hook-force]').hidden=!(state.hookCheckState==='unverified'&&!state.hookBaselineVerified&&['euphoria474','embed'].includes(state.hookProfile));
  const threads=state.hookThreads||[],key=JSON.stringify(threads);if(p.dataset.threadKey!==key){p.dataset.threadKey=key;const list=p.querySelector('[data-hook-streams]');list.replaceChildren();if(!threads.length){const e=document.createElement('small');e.textContent='还没有发现文本流，在游戏里推进一句';list.append(e)};for(const t of threads.slice(0,12)){
   const row=document.createElement('div');row.className='tome-hook-row';const title=document.createElement('strong');title.textContent=(t.selected?'● ':'')+t.name.replace('EmbedEuphoria474_DrawHide_TEST2','YU-RIS 0.474 · 绘制隐藏');const sample=document.createElement('small');sample.textContent=t.sample||'推进一句查看此流的内容';const actions=document.createElement('div');actions.className='tome-hook-actions';
   // The hiding method follows automatically from the stream (embed when it can be embedded, otherwise OCR cover).
   const use=document.createElement('button');use.type='button';use.textContent='使用这条文本流';use.onclick=()=>send({type:'hookStart',profile:'auto',id:t.id});actions.append(use);
   row.append(title,sample,actions);list.append(row);
  }}
 }
 function mount(){for(const container of document.querySelectorAll('[data-gal-hook-options]')){
  if(container.querySelector('.tome-hooks'))continue;
  const p=document.createElement('section');p.className='tome-hooks';p.setAttribute('aria-label','Hook 引擎启动与效果检查');
  p.innerHTML=`<div class="tome-hook-main">
    <div class="tome-hook-summary" data-hook-summary><i data-hook-dot></i><span data-hook-summary-text></span></div>
    <label class="tome-hook-switch"><input type="checkbox" data-hook-pref="hookHide"><span>隐藏游戏原文</span></label>
    <small class="tome-hook-hint">开或关之后约 3 秒，从下一句开始生效；当前已显示的那句不会立刻变</small>
    <div class="tome-hook-actions"><button type="button" data-hook-reselect title="当前文本流读到的是乱码或不是台词时，换一条文本流">文本不对？重新选取文本流</button></div>
    <label class="tome-hook-switch"><input type="checkbox" data-hook-pref="hookAutoStart">全自动：读取台词、同步原文样式并内嵌</label>
    <small class="tome-hook-mode" data-hook-mode></small>
   </div>
   <div class="tome-hook-proof" data-hook-proof role="status" aria-live="polite"><div class="tome-hook-chips"><span data-hook-connection></span><span data-hook-capture></span><span data-hook-hide></span></div><strong data-hook-message></strong><div class="tome-hook-actions" data-hook-feedback-row hidden><button type="button" data-hook-feedback></button></div><small class="tome-hook-time" data-hook-time></small></div>
   <details class="tome-hook-advanced"><summary>高级：Hook 引擎与文本流</summary>
    <label class="tome-hook-switch"><input type="checkbox" data-hook-pref="hookFast">快速切换（跳过「先显示一句确认原文位置」，少等一句）</label>
    <div class="tome-hook-actions"><button type="button" data-hook-check>重新检查游戏画面</button><button type="button" data-hook-restart>重新启动 Hook</button><button type="button" data-hook-stop>停止 Hook</button><button type="button" data-hook-force hidden>跳过基线并启动（效果未确认）</button></div>
    <p>检查范围沿用下方「原文字扫描范围」；画面检查只在本机处理</p>
    <h5>已发现的文本流</h5><div data-hook-streams><small>还没有发现文本流，在游戏里推进一句</small></div>
   </details>`;
  p.querySelector('[data-hook-restart]').onclick=()=>send({type:'hookStart',profile:'auto'});
  p.querySelector('[data-hook-reselect]').onclick=()=>send({type:'hookReselect'});
  p.querySelector('[data-hook-feedback]').onclick=openFeedback;
  for(const cb of p.querySelectorAll('[data-hook-pref]'))cb.onchange=()=>{state={...state,[cb.dataset.hookPref]:cb.checked};send({type:'hookPrefs',settings:{[cb.dataset.hookPref]:cb.checked}});paint(p)};
  p.querySelector('[data-hook-check]').onclick=()=>send({type:'hookCheck'});p.querySelector('[data-hook-stop]').onclick=()=>send({type:'hookStart',profile:'off'});p.querySelector('[data-hook-force]').onclick=()=>send({type:'hookStart',profile:state.hookProfile,force:true});
  container.prepend(p);panels.add(p);paint(p);
 }}
 new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
 b.tomeHookStatus=()=>({...state});
})();
