// SPDX-License-Identifier: GPL-3.0-or-later
(function installVoiceLayout(){
 'use strict';
 if(!document.documentElement){document.addEventListener('DOMContentLoaded',installVoiceLayout,{once:true});return;}
 if(window.__tomeVoiceLayout)return;window.__tomeVoiceLayout=true;
 const copy={
  zh:{intro:'选择喜欢的声音，试听后调整音量与语速',advanced:'高级设置',address:'语音服务地址',gpu:'显卡加速',gpuTip:'更快的语音合成，修改后重启软件生效',hint:'选择声音和说话风格；列表为空时，点击「刷新声音列表」',speaker:'声音与风格',id:'话者样式 ID',volume:'音量',speed:'语速',firstTry:'每个声音和每种感情第一次试听时，需要在本机计算一会儿，之后就快了'},
  en:{intro:'Choose a voice, preview it, then adjust volume and speed',advanced:'Advanced settings',address:'Speech service URL',gpu:'GPU acceleration',gpuTip:'Faster speech synthesis; restart the app to apply changes',hint:'Choose a voice and style. Use “Refresh voice list” if the list is empty',speaker:'Voice and style',id:'Speaker style ID',volume:'Volume',speed:'Speed',firstTry:'The first preview of each voice and each style takes a moment to compute on this PC; after that it is quick'},
  ja:{intro:'声を選んで試聴し、音量と話速を調整します',advanced:'詳細設定',address:'音声サービスのアドレス',gpu:'GPU アクセラレーション',gpuTip:'音声合成を高速化します。変更はアプリの再起動後に反映されます',hint:'声と話し方を選択します。一覧が空の場合は「声の一覧を更新」を押してください',speaker:'声とスタイル',id:'話者スタイル ID',volume:'音量',speed:'話速',firstTry:'声と感情ごとに、最初の試聴はこの PC での計算に少し時間がかかります。2 回目からは速くなります'}
 };
 function decorate(voice){
  if(voice.dataset.voiceLayout)return;voice.dataset.voiceLayout='1';
  const node=(tag,cls)=>{const n=document.createElement(tag);n.className=cls;return n;};
  const localized=(n,key)=>{n.dataset.voiceCopy=key;n.dataset.noI18n='';return n;};
  const intro=localized(node('p','tome-voice-intro'),'intro');voice.querySelector('h4').after(intro);
  const advanced=node('details','tome-voice-advanced'),summary=localized(node('summary',''),'advanced');advanced.append(summary);
  const adjustments=node('div','tome-voice-adjustments'),actions=node('div','tome-voice-actions');
  for(const input of voice.querySelectorAll('input[data-v4-key]')){
   const row=input.closest('label'),key=input.dataset.v4Key;row.classList.add('tome-voice-field');
   const caption=localized(node('span','tome-voice-caption'),({aivisUrl:'address',aivisSpeaker:input.hidden?'speaker':'id',aivisVolume:'volume',aivisSpeed:'speed',aivisGpu:'gpu'})[key]);
   for(const text of [...row.childNodes])if(text.nodeType===3)text.remove();row.prepend(caption);
   input.setAttribute('aria-labelledby',caption.id='tome-voice-'+key+'-'+(++installVoiceLayout.serial));
   if(key==='aivisUrl'){input.spellcheck=false;input.autocomplete='off';advanced.append(row);}
   if(key==='aivisGpu'){row.classList.add('tome-voice-switch');caption.dataset.voiceTip='gpuTip';advanced.append(row);}
   if(key==='aivisVolume'){const show=()=>{row.querySelector('output').textContent=Math.round(Number(input.value)*100)+'%';};input.addEventListener('input',show);show();}
   if(key==='aivisVolume'||key==='aivisSpeed')adjustments.append(row);
  }
  const hint=voice.querySelector('.tome-speaker-hint');
  if(hint){hint.hidden=true;const caption=voice.querySelector('[data-voice-copy=speaker],[data-voice-copy=id]');if(caption){caption.dataset.voiceTip='hint';caption.tabIndex=0;}}
  const speaker=voice.querySelector('.tome-speaker-select');
  // First synthesis of a voice/style is computed locally and slow: say so under the voice picker (user, 2026-11-02).
  const firstTry=localized(node('small','tome-voice-first'),'firstTry');(voice.querySelector('.tome-speaker-pick')||speaker?.closest('label'))?.after(firstTry);
  if(speaker)new MutationObserver(()=>{const caption=speaker.closest('label').querySelector('.tome-voice-caption');caption.dataset.voiceCopy=speaker.hidden?'id':'speaker';render(voice);}).observe(speaker,{attributes:true,attributeFilter:['hidden']});
  for(const button of [...voice.children].filter(n=>n.tagName==='BUTTON'))actions.append(button);
  actions.firstElementChild?.classList.add('tome-voice-save');
  const status=[...voice.children].find(n=>n.tagName==='SMALL'&&n!==hint);if(status){status.classList.add('tome-voice-status');status.setAttribute('role','status');}
  voice.append(adjustments,advanced,actions);if(status)voice.append(status);
  // Volume and speed sit above the folded recommended-voice list, which goes last
  const pack=voice.querySelector('.tome-voice-pack');if(pack)voice.append(pack);
  render(voice);
 }
 installVoiceLayout.serial=0;
 function render(root){const w=copy[window.__tomeI18n?.get?.()]||copy.zh;for(const n of root.querySelectorAll('[data-voice-copy]')){const text=w[n.dataset.voiceCopy];if(n.textContent!==text)n.textContent=text;if(n.dataset.voiceTip)n.title=w[n.dataset.voiceTip];}}
 const style=document.createElement('style');style.textContent=`
 .tome-voice-first{display:block;margin:-12px 0 18px;font-size:11.5px;line-height:1.55;color:var(--theme-textSecondary,#999)}
 .tome-voice-pack{margin-top:12px;padding:12px;border-radius:12px;border:1px solid var(--menu-border,var(--theme-border,#444))}
 .tome-voice-pack-head{font-size:13px;font-weight:600;cursor:pointer}
 .tome-voice-pack[open]>.tome-voice-pack-head{margin-bottom:8px}
 .tome-voice-rec{margin-left:8px;padding:1px 7px;border-radius:999px;font-style:normal;font-size:10.5px;font-weight:700;color:var(--theme-primary,#e0495a);background:color-mix(in srgb,var(--theme-primary,#e0495a) 14%,transparent);vertical-align:1px}
 .tome-voice-pack-body{display:flex;flex-direction:column;gap:6px}
 .tome-voice-pack-body>small{opacity:.75;line-height:1.55}
 .tome-voice-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:4px 10px;padding:6px 0;border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 8%,transparent)}
 .tome-voice-row>span{font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .tome-voice-row>small{font-size:11.5px;opacity:.8;font-variant-numeric:tabular-nums}
 .tome-voice-row>button{margin:0!important;padding:4px 12px!important;font-size:12px!important}
 .tome-voice-row>progress{grid-column:1/-1;width:100%;height:6px;accent-color:var(--theme-primary,#e0495a)}
 .tome-voice-row>progress[hidden]{display:none}
 .tomoyo-v4-voice{box-sizing:border-box;min-width:0;padding:0;border:0;border-radius:0;background:none;margin:0 0 24px}
 .tomoyo-v4-voice>h4{margin:4px 0;font-size:11.5px;font-weight:700;color:var(--theme-textSecondary,#7a7c82)}.tome-voice-intro{margin:6px 0 22px;color:var(--theme-textSecondary,#999);font-size:12px;line-height:1.6}
 .tomoyo-v4-voice label.tome-voice-field{display:block;margin:0 0 20px!important;min-width:0;font-size:13px;font-weight:400}.tome-voice-caption{display:block;margin-bottom:8px;color:var(--theme-text,#eee)}
 .tomoyo-v4-voice input:not([type=checkbox]):not([type=range]){box-sizing:border-box;display:block;width:100%;min-width:0;padding:11px 12px;border:1px solid var(--theme-border,#37373e);border-radius:9px;background:var(--theme-background,#111114);color:var(--theme-text,#eee);font:inherit;outline:none;color-scheme:dark}
 .tomoyo-v4-voice input:focus-visible,.tomoyo-v4-voice button:focus-visible,.tomoyo-v4-voice summary:focus-visible{outline:2px solid var(--theme-primary,#e0495a);outline-offset:3px}
 .tomoyo-v4-voice [hidden]{display:none!important}.tomoyo-v4-voice .tome-speaker-pick{margin-top:0;align-items:stretch}.tomoyo-v4-voice .tome-speaker-pick>*:not(.tome-speaker-try){flex:1;min-width:0}.tomoyo-v4-voice .tome-speaker-try{font-weight:400}
 .tome-voice-adjustments{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.tome-voice-adjustments .tome-voice-caption{display:inline-block}.tome-voice-adjustments output{float:right;color:var(--theme-textSecondary,#aaa);font-size:12px;font-variant-numeric:tabular-nums}.tomoyo-v4-voice input[type=range]{display:block;width:100%;margin:7px 0;background-image:none!important}
 .tome-voice-advanced{border-top:1px solid var(--theme-border,#34343b);border-bottom:1px solid var(--theme-border,#34343b);padding:13px 0;margin:0 0 18px}.tome-voice-advanced>summary{cursor:pointer;color:var(--theme-textSecondary,#aaa);font-size:13px}.tome-voice-advanced[open]>summary{margin-bottom:18px}.tome-voice-advanced label:last-child{margin-bottom:0!important}.tomoyo-v4-voice label.tome-voice-switch{display:flex;align-items:center;justify-content:space-between;gap:16px}.tome-voice-switch .tome-voice-caption{margin:0}.tome-voice-switch input{margin:0;accent-color:var(--theme-primary,#e0495a);width:17px;height:17px}
 .tome-voice-actions{display:flex;flex-wrap:wrap;gap:10px}.tomoyo-v4-voice .tome-voice-actions>button{margin:0!important;border-radius:9px;padding:10px 16px;font-size:13px}.tomoyo-v4-voice button.tome-voice-save{background:var(--theme-primary,#e0495a);border-color:transparent;color:#fff}.tome-voice-status{display:block;margin-top:12px;overflow-wrap:anywhere}.tome-voice-status:empty{display:none}
 @media(max-width:540px){.tomoyo-v4-voice{padding:0}.tome-voice-adjustments{grid-template-columns:1fr;gap:0}}
 `;(document.head||document.documentElement).append(style);
 const scan=root=>{if(root.nodeType!==1)return;if(root.matches('.tomoyo-v4-voice'))decorate(root);for(const n of root.querySelectorAll('.tomoyo-v4-voice'))decorate(n);};
 scan(document.documentElement);new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)scan(n);}).observe(document.documentElement,{childList:true,subtree:true});
 addEventListener('tome-language-change',()=>{for(const voice of document.querySelectorAll('.tomoyo-v4-voice'))render(voice);});
})();
