// SPDX-License-Identifier: GPL-3.0-or-later
(function installHookPanel(){
 'use strict';if(document.readyState==='loading'||!window.__tomoyoChinese?.galStatus){document.addEventListener('DOMContentLoaded',installHookPanel,{once:true});return;}const b=window.__tomoyoChinese;if(b.tomeHookPanel)return;b.tomeHookPanel=true;
 let state={},panels=new Set();
 const send=m=>window.__tomoyoTranslateRequest(JSON.stringify(m));
 const previous=b.galStatus;b.galStatus=m=>{previous(m);state={...state,...m};if(m.hookProfile)b.restoreGalSettings?.({hookProfile:m.hookProfile,maskMode:m.hookAutoOcr?'local':'hook',bindEnabled:true});for(const p of panels)if(p.isConnected)paint(p);else panels.delete(p);};
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
  text(p.querySelector('[data-hook-message]'),state.hookCheckMessage||'选择下方 Hook 启动方式，再在游戏里推进一句');
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
    <label class="tome-hook-switch"><input type="checkbox" data-hook-pref="hookAutoStart">全自动：读取台词、同步原文样式并内嵌</label>
    <small class="tome-hook-mode" data-hook-mode></small>
   </div>
   <div class="tome-hook-proof" data-hook-proof role="status" aria-live="polite"><div class="tome-hook-chips"><span data-hook-connection></span><span data-hook-capture></span><span data-hook-hide></span></div><strong data-hook-message></strong><small class="tome-hook-time" data-hook-time></small></div>
   <details class="tome-hook-advanced"><summary>高级：Hook 引擎与文本流</summary>
    <label class="tome-hook-switch"><input type="checkbox" data-hook-pref="hookFast">快速切换（跳过「先显示一句确认原文位置」，少等一句）</label>
    <div class="tome-hook-actions"><button type="button" data-hook-check>重新检查游戏画面</button><button type="button" data-hook-restart>重新启动 Hook</button><button type="button" data-hook-stop>停止 Hook</button><button type="button" data-hook-force hidden>跳过基线并启动（效果未确认）</button></div>
    <p>检查范围沿用下方「原文字扫描范围」；画面检查只在本机处理</p>
    <h5>已发现的文本流</h5><div data-hook-streams><small>还没有发现文本流，在游戏里推进一句</small></div>
   </details>`;
  p.querySelector('[data-hook-restart]').onclick=()=>send({type:'hookStart',profile:'auto'});
  for(const cb of p.querySelectorAll('[data-hook-pref]'))cb.onchange=()=>{state={...state,[cb.dataset.hookPref]:cb.checked};send({type:'hookPrefs',settings:{[cb.dataset.hookPref]:cb.checked}});paint(p)};
  p.querySelector('[data-hook-check]').onclick=()=>send({type:'hookCheck'});p.querySelector('[data-hook-stop]').onclick=()=>send({type:'hookStart',profile:'off'});p.querySelector('[data-hook-force]').onclick=()=>send({type:'hookStart',profile:state.hookProfile,force:true});
  container.prepend(p);panels.add(p);paint(p);
 }}
 new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
 b.tomeHookStatus=()=>({...state});
})();
