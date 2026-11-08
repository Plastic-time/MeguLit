// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
const snapshot=path.join(root,'migration/original-overlay-20261104/app'),target=path.join(root,'web/reader/modules');
const originals=['ui-state','native-transport','taskbar-sync','game-style','game-profile','typewriter','ruby-layout','furigana','inject','settings','learning','learning-layout','gal','game-fonts-ui','menu-layout','lookup-layout','selection','island-source','island-page','hook-reader','wait-marker','hook-panel','v4','voice-layout','interaction','backlog','box-preview','polish','i18n','about','background','settings-tabs','anki-sync','difficulty','color-picker','ui-behavior','game-style-sync-ui','text-position'];
const legacyStorageKeys=new Set();for(const name of [...originals,'interface-mode']){const text=fs.readFileSync(path.join(snapshot,name+'.js'),'utf8');for(const match of text.matchAll(/['"](tomoyo-[\w.-]+)['"]/g))legacyStorageKeys.add(match[1]);}
const manifest=[];for(const name of originals){const source=fs.readFileSync(path.join(snapshot,name+'.js'));let text=source.toString('utf8').replace(/\bToMe\b/g,'MeguLit');
 if(['gal','game-style','game-profile','game-style-sync-ui','menu-layout','backlog','interaction','i18n','island-page','text-position'].includes(name))text=require('./adapt-reader-ui.cjs').adapt(name,text,root);
 if(name==='gal')text=require('./adapt-reader-ruby.cjs').gal(text);
 if(name==='ruby-layout')text=require('./adapt-reader-ruby.cjs').layout(text);
 if(name==='furigana')text=require('./adapt-reader-ruby.cjs').furigana(text);
 if(name==='island-page')text=require('./adapt-reader-ruby.cjs').islandPage(text);
 const adaptedFonts=['gal','game-fonts-ui','menu-layout','polish','hook-reader','island-page','typewriter','inject'].includes(name);
 if(adaptedFonts)text=require('./adapt-reader-fonts.cjs').adapt(name,text);
 // E213.5: characters still being typed count toward the hit region, so the region is set once per line instead of
 // changing (and re-applying SetWindowRgn on the desktop-sized reader window) for every revealed character.
 // E213.12: ruby is measured with getBoundingClientRect, but the text box can move or resize (style sync, width,
 // window placement) without a DOM mutation, leaving readings off their words. Re-place on size change and line end.
 if(name==='gal'){const hook="window.addEventListener('resize', apply);document.fonts?.ready.then(()=>updateRuby());";if(!text.includes(hook))throw Error('RUBY_RELAYOUT_ANCHOR');text=text.replace(hook,hook+"{let rubyFrame=0;const again=()=>{cancelAnimationFrame(rubyFrame);rubyFrame=requestAnimationFrame(()=>updateRuby());};const seen=new WeakSet(),boxes=new ResizeObserver(again);const watch=()=>{for(const n of document.querySelectorAll('.sentence-text,.sentence-window'))if(!seen.has(n)){seen.add(n);boxes.observe(n);}};new MutationObserver(watch).observe(document.documentElement,{childList:true,subtree:true});watch();addEventListener('megulit-reveal-progress',e=>{if(!e.detail?.typing)again();});}");}
 if(name==='interaction'){const hit="(!isMenu&&Number(style.opacity)===0)";if(!text.includes(hit))throw Error('HIT_OPACITY_ANCHOR');text=text.replace(hit,"(!isMenu&&Number(style.opacity)===0&&!node.classList.contains('tome-typewriter-pending'))");}
 if(name==='color-picker')text=require('./adapt-color-picker.cjs').adaptColorPicker(text);
 if(name==='selection')text=require('./adapt-reader-lookups.cjs').selection(require('./adapt-lookup-panel.cjs').adaptLookup(text));
 if(name==='typewriter'){const anchor='painted=count;element.dataset.tomeTyping=String(count<total);';if(!text.includes(anchor))throw Error('REVEAL_PROGRESS_ANCHOR');text=text.replace(anchor,anchor+"if(count===0||count===total)root.dispatchEvent?.(new root.CustomEvent('megulit-reveal-progress',{detail:{typing:count<total}}));");
  // E213.4: reveal on display frames, not setTimeout (Windows timer granularity ~15.6 ms made characters arrive 1-2 frames
  // apart and sometimes in pairs), and fade each character in briefly instead of popping it. Ruby lives in the same node.
  const readerPress="  doc.addEventListener('pointerdown',event=>{if(event.button===0&&event.target?.closest?.('.sentence-window')&&!event.target.closest(controls))finishAll();},true);";
  if(!text.includes(readerPress))throw Error('REVEAL_READER_PRESS_ANCHOR');
  text=text.replace(readerPress,'');
  const frames='state.controller=createReveal({';if(!text.includes(frames))throw Error('REVEAL_FRAME_ANCHOR');
  text=text.replace(frames,"state.controller=createReveal({schedule:root.requestAnimationFrame?fn=>root.requestAnimationFrame(()=>fn()):undefined,cancel:root.cancelAnimationFrame?id=>root.cancelAnimationFrame(id):undefined,");
  const pending='.tome-typewriter-pending{visibility:hidden!important;pointer-events:none!important}';if(!text.includes(pending))throw Error('REVEAL_STYLE_ANCHOR');
  text=text.replace(pending,'.tome-typewriter-pending{opacity:0!important;pointer-events:none!important;transition:none!important}[data-tome-typing=true] .char-token,[data-tome-typing=true]>*{transition:opacity 70ms linear}@media (prefers-reduced-motion:reduce){[data-tome-typing=true] .char-token,[data-tome-typing=true]>*{transition:none}}');}
 if(name==='settings'){
  text=text.replace(/defaults\.lookupProfiles=\{[^\n]+;/,'defaults.lookupProfiles='+JSON.stringify(require('../core/lookup-models.cjs').presets)+';');
  text=text.replace('Alt+M 切换普通界面／透明文本框','Alt+M 显示／隐藏 MeguLit 主页');
  const shortcut=/^    if \(event\.altKey && event\.code === 'KeyM' && !event\.repeat\) \{[\s\S]*?^    \}\r?\n/m;
  if(!shortcut.test(text))throw Error('LEGACY_MODE_SHORTCUT_ANCHOR');
  text=text.replace(shortcut,'');
 }
 if(name==='menu-layout')text=text.replace('Alt+M 切换界面','Alt+M 开关主页');
 if(name==='polish')text=text.replace('<kbd>Alt+M</kbd>切换界面','<kbd>Alt+M</kbd>开关主页');
 if(name==='background'){
  text=require('./adapt-reader-lookups.cjs').background(text);
  const hook=`\n b.hostRefreshAppearance=async()=>{\n  cfg={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};gcfg={...gameDefaults,...JSON.parse(localStorage.getItem(GAME_KEY)||'{}')};\n  const old=gcfg.panels||{},next={};for(const p of PANELS){next[p]={};for(const k of PANEL_KEYS){const v=Number(old[p]?.[k]??gcfg[k]??gameDefaults[k]);next[p][k]=Number.isFinite(v)?v:gameDefaults[k];}}gcfg.panels=next;await load();glassReport();\n };\n`;
  const end=text.lastIndexOf('})();');if(end<0)throw Error('BACKGROUND_HOST_HOOK_MISSING');text=text.slice(0,end)+hook+text.slice(end);
 }
 if(name==='v4'){
  text=require('./adapt-reader-screenshot.cjs')(text);
  const rowAnchor='fields[key]=input;row.append(input);';
  if(!text.includes(rowAnchor))throw Error('ANKI_PATH_PICKER_ANCHOR_MISSING');
  text=text.replace(rowAnchor,rowAnchor+"if(key==='ankiPath')row.append(button('浏览…',async()=>{try{const value=await window.__megulitPickExecutable();if(value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}catch(e){status.textContent=e.message||String(e);}}));if(key==='ankiDeck')row.append(el('small','新加入的单词会保存到这个牌组，可与当前复习牌组不同'));if(key==='ankiModel')row.append(el('small','决定卡片字段和正反面排版；MeguLit / 旧 ToMe 类型包含释义、例句、语音和游戏截图'));");
  const anchor="status.textContent=value.updated?'已更新 Anki 词条':'已加入 Anki';";
  if(!text.includes(anchor))throw Error('ANKI_MEDIA_STATUS_ANCHOR_MISSING');
  text=text.replace(anchor,anchor+"if(value.sentenceAudioSource){const labels={game:['例句：游戏原声','Example: game voice','例文：ゲーム音声'],synthesized:['例句：合成语音','Example: synthesized voice','例文：合成音声']};const lang=document.documentElement.lang;status.textContent+=' · '+labels[value.sentenceAudioSource][lang.startsWith('ja')?2:lang.startsWith('en')?1:0];}");
  text=text.replace(anchor,anchor+"if(value.mediaWarning==='SCREENSHOT_UNAVAILABLE')status.textContent+=' · '+(document.documentElement.lang.startsWith('ja')?'ゲーム画像を取得できませんでした':document.documentElement.lang.startsWith('en')?'Game screenshot unavailable':'未获取到游戏截图');");
 }
 text=require('./adapt-reader-sliders.cjs').adapt(name,text);
 const adapted=adaptedFonts||['ruby-layout','background','v4','settings','selection','typewriter','gal','game-style','game-profile','game-style-sync-ui','menu-layout','backlog','interaction','i18n','island-page'].includes(name);const bytes=Buffer.from(text);fs.writeFileSync(path.join(target,name+'.js'),bytes);manifest.push({name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),byteIdentical:source.equals(bytes),brandingOnly:!adapted,hostAdapter:adapted?({'ruby-layout':'centre readings over base glyphs',background:'refresh persisted appearance without reloading the reader',v4:'report missing game screenshot',settings:'shared lookup provider defaults',selection:'shared provider catalog, selection cleanup and stable glass entrance',typewriter:'reveal progress and Latin glyph styling','game-fonts-ui':'font catalog and source notes',polish:'separate font labels from source notes','hook-reader':'Latin glyph styling',inject:'Latin styling for static translations',gal:'per-game prompt and choice controls','game-style':'shared style settings validation','game-profile':'shared work settings schema','game-style-sync-ui':'generic header and profile status','menu-layout':'separate dialogue and choice style controls',backlog:'bounded initial log render',interaction:'bounded surface readiness',i18n:'generic layout hint and line spacing', 'island-page':'translation line spacing'})[name]:undefined});}
// The original mode controller only needs a host routing adapter: the new home and overlay have separate windows.
let mode=fs.readFileSync(path.join(snapshot,'interface-mode.js'),'utf8');
mode=mode.replace(/^ function go\(path\)\{[^\n]*\}/m," function go(path){window.__tomeOverlayRoute?.(path);}");
const nav=mode.indexOf(' async function navigate(){'),next=mode.indexOf(' // Serialise and coalesce',nav);if(nav<0||next<0)throw Error('ORIGINAL_MODE_ROUTER_MISSING');
mode=mode.slice(0,nav)+" async function navigate(){window.__tomeOverlayRoute?.(mode==='translation'?'@reader':'@home');}\n"+mode.slice(next);
// The dedicated reader never visits /media/:id. Disable the old single-window watchdog.
mode=mode.replace("if(navigation||mode==='translation'&&!isReader(location.pathname))navigate();","if(changed||navigation)navigate();");
const watchdog=mode.indexOf(" setInterval(()=>{if(mode==='translation'&&isReader(readerPath)");
if(watchdog<0)throw Error('ORIGINAL_MODE_WATCHDOG_MISSING');
mode=mode.slice(0,watchdog)+mode.slice(mode.indexOf('\n',watchdog)+1);
mode=mode.replace('(!isReader(readerPath)||isReader(path))','true');
fs.writeFileSync(path.join(target,'interface-mode-host.js'),mode.replace(/\bToMe\b/g,'MeguLit'));
const localFont=require('../core/local-font.cjs').localFontScript();fs.writeFileSync(path.join(target,'local-font.js'),localFont||'// No optional local font asset was found\n');
const modules=[...originals];modules.splice(modules.indexOf('taskbar-sync')+1,0,'interface-mode-host');modules.push('local-font');
fs.writeFileSync(path.join(root,'web/reader/module-list.js'),'// Generated from the original ToMe overlay snapshot\nexport const modules='+JSON.stringify(modules)+';\nexport const legacyStorageKeys='+JSON.stringify([...legacyStorageKeys].sort())+';\n');
fs.writeFileSync(path.join(root,'web/reader/modules.json'),JSON.stringify(modules));
fs.writeFileSync(path.join(root,'migration/overlay-module-manifest.json'),JSON.stringify({source:'E:/Apps/ToMe/app',snapshot:'migration/original-overlay-20261104/app',modules:manifest,hostAdaptations:['interface-mode-host.js routing only','bootstrap.js transport and data mapping']},null,2));
console.log(JSON.stringify({originalModules:originals.length,hostModules:modules.length}));
