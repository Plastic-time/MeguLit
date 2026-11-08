// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');

function adapt(name,text,root){if(name==='text-position'||name==='island-page'){/* E277 (user: after calibration the 左边距/上边距/换行宽度 sliders did nothing in page mode): page mode places lines at the game's own coordinates and ignored x/y/width. The calibration now records the slider values it was taken with, and page mode applies later slider changes as offsets from them (old maps: from the values seen when page mode first placed text). */
 /* E278 (user: a page line that wrapped ran into the next line): page lines keep the game's own line breaks and only wrap when the wrap-width slider is narrowed */const edits=name==='text-position'?[["const next={engine:c.engine,s,","const next={px:Number(prefs.x),py:Number(prefs.y),pw:Number(prefs.width),engine:c.engine,s,"]]:[["x+=(Number(p.paddingX)||0)*k;","x+=(Number(p.paddingX)||0)*k;{const m0=w.__tomeTextPosition?.getMap?.(),base=Number.isFinite(m0?.px)?{x:m0.px,y:m0.py,w:m0.pw}:(w.__megulitPageBase||(w.__megulitPageBase={x:Number(p.x)||0,y:Number(p.y)||0,w:Number(p.width)||100}));x+=((Number(p.x)||0)-base.x)*cw/100;y+=((Number(p.y)||0)-base.y)*ch/100;if(base.w>0&&Number(p.width)>0)width*=Number(p.width)/base.w;node.classList.toggle('tome-island-wrap',base.w>0&&Number(p.width)<base.w-.05);}"],[".tome-island-pair .tomoyo-cn-output{",".tome-island-pair .sentence-text{white-space:pre!important}.tome-island-pair.tome-island-wrap .sentence-text{white-space:pre-wrap!important}\n.tome-island-pair .tomoyo-cn-output{"]];
 for(const [f,t] of edits){if(!text.includes(f))throw Error('Reader UI adapter anchor missing: '+f);text=text.replace(f,t);}}
if(name==='menu-layout'){/* E265 (user: the text page opened scrolled into an expanded 中文设置): every open starts at the top with sections folded */for(const [f,t] of [["if(openSections[name]!==undefined)d.open=!!openSections[name];",""],["try{const top=Number(localStorage.getItem('tomoyo-menu-scroll-'+saved));if(top>0)requestAnimationFrame(()=>{content.scrollTop=top;});}catch{}","content.scrollTop=0;"],["content.scrollTop=Number(localStorage.getItem('tomoyo-menu-scroll-'+key))||0;","content.scrollTop=0;"]]){if(!text.includes(f))throw Error('Reader UI adapter anchor missing: '+f);text=text.replace(f,t);}}
 // E254 (user): reading Y offset reaches ±100 px (was ±40).
 if(name==='game-style'){for(const [f,t] of [['rubyOffsetY:[-40,40]','rubyOffsetY:[-100,100]'],['lineHeight:[-1.9,1.9]','lineHeight:[-1.9,4]'],['translationLineHeight:[-.8,1.5]','translationLineHeight:[-.8,3]']]){if(text.includes(t))continue;if(!text.includes(f)){if(f.startsWith('translation'))continue;throw Error('Reader UI adapter anchor missing: '+f);}text=text.replace(f,t);}}
 const replace=(from,to)=>{if(!text.includes(from))throw Error('Reader UI adapter anchor missing: '+name+' '+from.slice(0,70));text=text.replace(from,()=>to);};
 if(['game-style','game-profile'].includes(name))return fs.readFileSync(path.join(root,'core',name+'.js'),'utf8');
 if(name==='game-style-sync-ui'){
  replace("function save(prefs=b.galPreferences()){","function save(prefs=b.galPreferences(),savePrompt=false){");
  replace("prefs:snapshot,map,saveId:id});paint();","prefs:snapshot,map,saveId:id,...(savePrompt?{workKey:b.workPromptKey,translationPrompt:prefs.translationPrompt}:{})});paint();");
  replace("b.saveGameProfileFromMenu=save;","b.saveGameProfileFromMenu=prefs=>save(prefs,true);");
  // E215 new-game tip: each of a work's first five launches, with an off switch in the home settings.
  // The window region clips a soft shadow into a hard dark band around the tip (user, E215.2): border only.
  replace("border:1px solid color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent);box-shadow:0 14px 36px rgba(0,0,0,.45);","border:1px solid color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent);box-shadow:none;");
  {const start=text.indexOf("function firstRunTip(m){"),end=text.indexOf("document.body.append(box);window.__tomoyoHitRegionsRefresh?.(true);}",start);if(start<0||end<0)throw Error("Reader UI adapter anchor missing: firstRunTip");
   text=text.slice(0,start)+"function firstRunTip(m){const key=m.gameStyleKey||'';if(!key||window.__tomoyoNativePreferences?.new_game_tip===false)return;\n  // Shown at each of a work's first five launches, so it is not missed after one glance (user, 2026-11-06); it can be\n  // turned off in the home settings. A launch counts once, however many status updates it sends.\n  let seen={};try{seen=JSON.parse(localStorage.getItem('megulit-new-game-tip')||'{}')||{};}catch{}if(!seen||typeof seen!=='object'||Array.isArray(seen))seen={};\n  const launch=String(m.gameStyleIdentity||'')||'page:'+firstRunPage,entry=seen[key]&&typeof seen[key]==='object'?seen[key]:{count:0,last:''};\n  if(entry.last===launch||entry.count>=5||document.querySelector('.tome-first-run'))return;\n  seen[key]={count:(Number(entry.count)||0)+1,last:launch};const keys=Object.keys(seen);if(keys.length>300)delete seen[keys[0]];\n  try{localStorage.setItem('megulit-new-game-tip',JSON.stringify(seen));}catch{}\n  const box=document.createElement('div');box.className='tome-first-run';box.dataset.noI18n='';box.setAttribute('role','status');box.innerHTML='<b></b><p></p><small></small><button type=\"button\"></button>';\n  const game=m.gameStyleGameName||t('unknown');box.querySelector('b').textContent=t('firstRunTitle').replace('{game}',game);box.querySelector('p').textContent=t('firstRun');\n  box.querySelector('small').textContent=t('firstRunCount').replace('{n}',String(seen[key].count));const ok=box.querySelector('button');ok.textContent=t('gotIt');\n  const close=()=>{box.remove();window.__tomoyoHitRegionsRefresh?.(true);};ok.onclick=close;setTimeout(close,30000);document.body.append(box);window.__tomoyoHitRegionsRefresh?.(true);}\n const firstRunPage=Date.now().toString(36);"+text.slice(end+"document.body.append(box);window.__tomoyoHitRegionsRefresh?.(true);}".length);}
  for(const [from,to] of [["firstRunTitle:'第一次启动「{game}」'","firstRunTitle:'「{game}」新游戏提示',firstRunCount:'本作第 {n}/5 次启动时显示 · 可在设置「阅读记录」里关闭'"],["firstRunTitle:'First launch of {game}'","firstRunTitle:'New-game tip for {game}',firstRunCount:'Shown at launch {n} of 5 for this game · turn it off under Settings › Reading records'"],["firstRunTitle:'「{game}」の初回起動'","firstRunTitle:'「{game}」ニューゲームの案内',firstRunCount:'この作品の起動 {n}/5 回目に表示 · 設定の「読書記録」でオフにできます'"]])replace(from,to);
  for(const [from,to] of [
   ['当前正在使用「{game}」保存的设置 · {time}','使用已保存设置 · {time}'],
   ['目前正在预览「{game}」的新设置，尚未保存','正在预览设置 · 尚未保存'],
   ['「{game}」尚未保存设置','尚未保存作品设置'],
   ['Using settings saved for {game} · {time}','Saved settings · {time}'],
   ['Previewing new settings for {game}; not saved','Previewing unsaved settings'],
   ['No settings saved for {game}','No saved settings for this game'],
   ['「{game}」に保存した設定を使用中 · {time}','保存済みの設定を使用中 · {time}'],
   ['「{game}」の新しい設定をプレビュー中・未保存','設定をプレビュー中・未保存'],
   ['「{game}」の設定は未保存です','作品設定は未保存です']
  ])replace(from,to);
  // E246 (user): the translation follows the synced Japanese size.
  replace("if(Number.isFinite(size)&&size>4)out.japaneseSize=Math.round(size*10)/10;","if(Number.isFinite(size)&&size>4){out.japaneseSize=Math.round(size*10)/10;out.translationSize=Math.round(Math.max(12,Math.min(60,out.japaneseSize))*10)/10;}");
  // E246.1 (user: the status showed the raw key \"advance\"): calibrating from embed waits for the next original line.
  replace("waitingOriginal:'本次未匹配，正在重试当前句'","advance:'请在游戏里推进一句：内嵌时当前这句原文已被清空，会用下一句原文来测量',waitingOriginal:'本次未匹配，正在重试当前句'");
  replace("waitingOriginal:'まだ一致しません。同じ文を再試行中'","advance:'ゲームを 1 文進めてください。埋め込み中は今の文の原文が消えているため、次の文で測定します',waitingOriginal:'まだ一致しません。同じ文を再試行中'");
  {const i=text.indexOf("waitingOriginal:'No match yet");if(i<0)throw Error("Reader UI adapter anchor missing: en waitingOriginal");text=text.slice(0,i)+"advance:'Advance one line in the game: embedding has cleared the current line, so the next original line is measured',"+text.slice(i);}
 }
 const layoutHint='ISLAND 按每句原文位置排列日中组，密集页自动腾出译文空间，无需设置文本框宽高';
 if(name==='gal'||name==='i18n')replace(layoutHint,'按原文位置排布，文字可自然延伸到游戏窗口外');
 if(name==='gal'){
  // Wider left/right margin range (E215.1, user hit the -40 end): -200 to 200 px.
  replace('galPaddingX" type="number" min="-40" max="80"','galPaddingX" type="number" min="-200" max="200"');
  replace('<label>译文间距<input name="galGap"','<label>译文行距<input name="galTranslationLineHeight" type="number" min="-0.8" max="1.5" step="0.05"></label><label>原文与译文间距<input name="galGap"');
  replace("lineHeight:'galLineHeight'","lineHeight:'galLineHeight',translationLineHeight:'galTranslationLineHeight'");
  replace("root.setProperty('--tomoyo-gal-line-height'","root.setProperty('--megulit-translation-line-offset',preferences.translationLineHeight);root.setProperty('--tomoyo-gal-line-height'");
  text=text.replaceAll('line-height:1.65!important','line-height:calc(1.65 + var(--megulit-translation-line-offset,0))!important').replaceAll('100% 1.65em!important','100% calc((1.65 + var(--megulit-translation-line-offset,0)) * 1em)!important');
  const fields=[
   "    const uiCopy={zh:['自定义翻译提示词','追加到默认提示词，当前作品独立保存，仅用于大模型。可填写术语、人名译法和语气','选项字体','跟随原版','已选颜色','未选颜色','恢复原版配色'],en:['Custom translation instructions','Appended to the default prompt for this game and used by language models. Add terms, names, or tone preferences.','Choice font','Follow game','Selected colour','Unselected colour','Restore game colours'],ja:['翻訳用の追加指示','既定の指示に追加され、作品ごとに保存されます。言語モデル用の用語や文体を指定できます','選択肢のフォント','原版に合わせる','選択済みの色','未選択の色','原版の配色に戻す']}[document.documentElement.lang.slice(0,2)]||[];",
   "    const prompt=document.createElement('label');prompt.dataset.noI18n='';prompt.textContent=uiCopy[0]||'Custom translation instructions';",
   "    const extra=document.createElement('textarea');extra.name='galTranslationPrompt';extra.maxLength=2000;extra.rows=4;prompt.append(extra);",
   "    const hint=document.createElement('small');hint.textContent=uiCopy[1]||'';prompt.append(hint);form.querySelector('[name=contextLines]').closest('label').after(prompt);",
   "    const choice=document.createElement('div');choice.dataset.megulitChoiceFields='';choice.dataset.noI18n='';",
   "    const fontLabel=document.createElement('label'),font=document.createElement('select');font.name='galChoiceFont';fontLabel.textContent=uiCopy[2]||'Choice font';",
   "    for(const [value,label] of [['game',uiCopy[3]||'Follow game'],['originalGothic','MS Gothic'],['originalMincho','MS Mincho'],['yuGothic','Yu Gothic'],['yuMincho','Yu Mincho'],['meiryo','Meiryo']])font.add(new Option(label,value));fontLabel.append(font);choice.append(fontLabel);",
   "    for(const [i,state] of ['Selected','Unselected'].entries()){",
   "      const row=document.createElement('label'),value=document.createElement('input'),picker=document.createElement('input');",
   "      row.textContent=uiCopy[i+4]||state;value.type='hidden';value.name='galChoice'+state+'Color';picker.type='color';picker.setAttribute('aria-label',row.textContent);",
   "      picker.value=preferences['choice'+state+'Color']||'#f0f0f0';picker.addEventListener('input',()=>{value.value=picker.value;});",
   "      value.addEventListener('input',()=>{picker.value=value.value||'#f0f0f0';});row.append(value,picker);choice.append(row);",
   "    }",
   "    const resetChoice=document.createElement('button');resetChoice.type='button';resetChoice.textContent=uiCopy[6]||'Restore game colours';",
   "    resetChoice.onclick=()=>{for(const input of choice.querySelectorAll('input[type=hidden]')){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}};choice.append(resetChoice);group.append(choice);"
  ].join('\n');
  replace("    const additional = {",fields+"\n    const additional = { translationPrompt:'galTranslationPrompt',choiceFont:'galChoiceFont',choiceSelectedColor:'galChoiceSelectedColor',choiceUnselectedColor:'galChoiceUnselectedColor',");
  replace("  bridge.galPreferences = () => ({ ...preferences });","  bridge.galPreferences = () => ({ ...preferences });\n  bridge.workTranslationPrompt=(key,prompt)=>{bridge.workPromptKey=key;bridge.applyGalPreferences({translationPrompt:prompt},{persist:false});};\n  bridge.workPromptSaveFailed=()=>{const hint=document.querySelector('[name=galTranslationPrompt]')?.parentElement.querySelector('small');if(hint)hint.textContent=({zh:'提示词保存失败，请重试',ja:'追加指示を保存できませんでした',en:'Could not save the prompt. Try again'})[document.documentElement.lang.slice(0,2)];};");
  replace("    group.addEventListener('input', preview);","    extra.addEventListener('input',preview);\n    group.addEventListener('input', preview);");
  replace("localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences));","localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined}));");
  text=text.replaceAll("localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences));","localStorage.setItem('tomoyo-gal-settings', JSON.stringify({...preferences,translationPrompt:undefined}));");
 }
 if(name==='island-page')replace('line-height:1.3!important;background-size:100% 1.3em!important','line-height:calc(1.3 + var(--megulit-translation-line-offset,0))!important;background-size:100% calc((1.3 + var(--megulit-translation-line-offset,0)) * 1em)!important');
 if(name==='i18n')replace("'译文间距':","'译文行距':['Translation line spacing','訳文の行間'],'原文与译文间距':['Gap between original and translation','原文と訳文の間隔'],'译文间距':");
 if(name==='menu-layout'){
  replace("colours=section(text,'颜色设置','textColours')","palette=section(text,'颜色设置','textColours'),colours=section(palette,'已读 / 未读设置','textDialogueColours'),choiceColours=section(palette,'已选 / 未选设置','textChoiceColours')");
  replace("   if(names.some(x=>/^gal(TextColor", "   if(n.hasAttribute('data-megulit-choice-fields')){choiceColours.append(n);continue;}\n   if(names.some(x=>/^gal(TextColor");
  replace("  // Each size goes into",[
   "  const uiLang=document.documentElement.lang.slice(0,2),colourTitles={en:['Read / unread','Selected / unselected'],ja:['既読・未読','選択済み・未選択']}[uiLang];",
   "  if(colourTitles)for(const [i,section] of [colours,choiceColours].entries()){const summary=section.querySelector('summary');summary.dataset.noI18n='';summary.textContent=colourTitles[i];}",
   "  // Each size goes into"
  ].join('\n'));
 }
 if(name==='backlog'){
  const normalize=require('../core/translation-format.cjs').normalizeTranslation.toString();
  replace(" let entries=[];",` ${normalize}\n let entries=[];`);
  replace("saved.filter(e=>e&&typeof e.src==='string').slice(-cfg.max)","saved.filter(e=>e&&typeof e.src==='string').slice(-cfg.max).map(e=>({...e,tr:normalizeTranslation(e.tr)}))");
  replace('if(win.scrollTop>0&&win.scrollHeight>win.clientHeight+2)return;','');
  replace(" let panel=null,query='';"," let panel=null,query='',pageSize=20,refresh=0;\n const earlier=()=>({zh:'加载更早的记录',ja:'以前のログを表示',en:'Load older lines'})[window.__tomeI18n?.get?.()||'zh']||'Load older lines';\n function refreshLog(){if(!panel||refresh)return;refresh=requestAnimationFrame(()=>{refresh=0;if(panel)render();});}");
  text=text.replaceAll('persist();if(panel)render();','persist();refreshLog();');
  replace("  list.replaceChildren();const q=query.toLowerCase(),shown=entries.map((e,i)=>[e,i]).filter(([e])=>!q||e.src.toLowerCase().includes(q)||String(e.tr).toLowerCase().includes(q));","  list.replaceChildren();const q=query.toLowerCase(),matched=entries.map((e,i)=>[e,i]).filter(([e])=>!q||e.src.toLowerCase().includes(q)||String(e.tr).toLowerCase().includes(q)),shown=matched.slice(-pageSize);\n  if(matched.length>shown.length){const more=document.createElement('button');more.type='button';more.textContent=earlier();more.onclick=()=>{const previous=list.scrollHeight;pageSize+=40;render();list.scrollTop=Math.max(0,list.scrollHeight-previous);};list.append(more);}");
  replace("ghost.remove();query='';","ghost.remove();query='';pageSize=20;");
  replace("query=search.value.trim();render();","query=search.value.trim();pageSize=20;render();");
  replace("render();window.__tomeWaitForSurface(opening,()=>","send({type:'galMenu',open:true});render();window.__tomeWaitForSurface(opening,()=>");
  replace("opening.focus({preventScroll:true});});send({type:'galMenu',open:true});","opening.focus({preventScroll:true});},220);");
 }
 if(name==='interaction'){
  replace("window.__tomeWaitForSurface=(node,ready)=>","window.__tomeWaitForSurface=(node,ready,maxWait=700)=>");
  replace("Date.now()-started>700","Date.now()-started>=maxWait");
  replace("},150);\n  window.__tomoyoHitRegionsRefresh", "},Math.min(150,Math.max(30,Math.floor(maxWait/2))));\n  window.__tomoyoHitRegionsRefresh");
  replace("if(!ack)return;const scale=", "if(!ack||frame)return;const scale=");
  replace("frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{if(!finished", "frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=0;if(!finished");
 }
 return text;
}
module.exports={adapt};
