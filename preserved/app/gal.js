(function installGal() {
  'use strict';
  if (!document.documentElement) { document.addEventListener('DOMContentLoaded', installGal, { once: true }); return; }
  const bridge = window.__tomoyoChinese;
  if (!bridge || bridge.galInstalled) return;
  bridge.galInstalled = true;
  const appearance = window.TomoyoGameStyle;
  const defaults = appearance.defaults;
  let preferences = { ...defaults }, dialogFields, commitSynchronizedStyle=null, refreshTimer, renderSerial = 0, lastText = '', lastTokens = [], bound = false;
  bridge.isGalBound = () => bound;
  const tokenCache = new Map();
  const readingRequests = new Map(); let readingSerial=0;
  bridge.deliverReadings=(id,tokens)=>{const entry=readingRequests.get(id);if(entry){clearTimeout(entry.timer);readingRequests.delete(id);entry.resolve(tokens);}};
  function spellingReadings(tokens){return new Promise(resolve=>{const id=++readingSerial;const timer=setTimeout(()=>{readingRequests.delete(id);resolve(tokens.map(t=>({...t,reading:String(t.reading||'').includes('ー')?'':t.reading})));},6000);readingRequests.set(id,{resolve,timer});send({type:'galReadings',id,tokens});});}
  try { preferences = appearance.clean(JSON.parse(localStorage.getItem('tomoyo-gal-settings') || '{}')); } catch {}
  preferences = appearance.clean(preferences);
  let gameScale = 1;
  let layoutInfo, maskImage, maskGeometry, maskFrameId = 0;
  const send = message => { if(['galConfigure','galPreview'].includes(message.type)&&bridge.gameProfileKey?.())message={...message,gameStyleKey:bridge.gameProfileKey()};try { window.__tomoyoTranslateRequest(JSON.stringify(message)); } catch {} };
  bridge.onSourceText = text => {if(text!==lastText&&!bridge.pageTranslationActive?.()){renderSerial++;clearRuby();}alignText();send({ type:'galSource',text });};
  if (bridge.sourceText) bridge.onSourceText(bridge.sourceText);
  function placeLayers() {
    const dpr = Math.max(.5, Number(window.devicePixelRatio) || 1);
    if (layoutInfo) for (const [name,key] of Object.entries({x:'readerX',y:'readerY',width:'readerWidth'})) document.documentElement.style.setProperty('--tomoyo-reader-'+name, (layoutInfo[key]/dpr)+'px');
    if (maskImage && maskGeometry) {
      maskImage.style.left = (maskGeometry.x/dpr)+'px'; maskImage.style.top = (maskGeometry.y/dpr)+'px';
      maskImage.style.width = (maskGeometry.width/dpr)+'px'; maskImage.style.height = (maskGeometry.height/dpr)+'px';
    }
  }
  bridge.galMaskFrame = frame => {
    if (!Number.isSafeInteger(frame?.id) || frame.id < maskFrameId) return;
    maskFrameId = frame.id;
    if (frame.clear) { maskImage?.remove(); maskImage = null; maskGeometry = null; return; }
    if (!bound || typeof frame.png !== 'string' || frame.png.length > 2500000 || !/^[A-Za-z0-9+/]+=*$/.test(frame.png)) return;
    if (![frame.x,frame.y,frame.width,frame.height].every(Number.isFinite) || frame.width <= 0 || frame.height <= 0 || frame.width > 7680 || frame.height > 4320) return;
    const image = document.createElement('img');
    image.className = 'tomoyo-native-mask'; image.alt = ''; image.setAttribute('aria-hidden','true');
    image.onload = () => {
      if (frame.id !== maskFrameId || !bound) return;
      maskImage?.remove(); maskImage = image; maskGeometry = frame;
      placeLayers(); document.body.appendChild(image);
      bridge.maskMessage = (frame.provisional?'极速预遮已加载：':'遮罩图像已加载：')+frame.count+' 个原文小区域';
      if (dialogFields) dialogFields.maskState.textContent = bridge.maskMessage;
      send({type:'galMaskLoaded',id:frame.id,count:frame.count,x:frame.x,y:frame.y,width:frame.width,height:frame.height,provisional:frame.provisional===true});
    };
    image.onerror = () => { if (frame.id !== maskFrameId) return; bridge.maskMessage = '阅读层无法加载遮罩图像，请把此状态发给助手'; if(dialogFields)dialogFields.maskState.textContent=bridge.maskMessage; send({type:'galMaskError',id:frame.id}); };
    image.src = 'data:image/png;base64,'+frame.png;
  };
  bridge.galLayout = layout => {
    if (![layout?.readerX,layout?.readerY,layout?.readerWidth,layout?.readerHeight].every(Number.isFinite)) return;
    if(maskGeometry&&[layout.maskX,layout.maskY].every(Number.isFinite))maskGeometry={...maskGeometry,x:layout.maskX,y:layout.maskY};
    layoutInfo = layout;
    // The window resize and these coordinates arrive separately when Alt+T or the LOG grows/shrinks the overlay. Until
    // both match, the text would be drawn at the old place inside the new window for a frame (the flash): keep the
    // reading layer hidden until the viewport has the size these coordinates were computed for (600 ms at most).
    if (surfaceMismatch(layout)) { holdSurface(); return; }
    releaseSurface(); placeLayers(); apply();bridge.islandPage?.refresh();
  };
  let surfaceTimer = 0;
  const surfaceMismatch = layout => { const dpr = Math.max(.5, Number(window.devicePixelRatio)||1); return Number.isFinite(layout?.surfaceWidth) && Number.isFinite(layout?.surfaceHeight) && (Math.abs(window.innerWidth*dpr - layout.surfaceWidth) > 80 || Math.abs(window.innerHeight*dpr - layout.surfaceHeight) > 80); };
  const holdSurface = () => { document.body?.classList.add('tome-surface-pending'); clearTimeout(surfaceTimer); surfaceTimer = setTimeout(() => { releaseSurface(); placeLayers(); apply(); }, 600); };
  const releaseSurface = () => { clearTimeout(surfaceTimer); surfaceTimer = 0; document.body?.classList.remove('tome-surface-pending'); };
  addEventListener('resize', () => { if (!layoutInfo) return; if (surfaceMismatch(layoutInfo)) holdSurface(); else if (document.body?.classList.contains('tome-surface-pending')) { releaseSurface(); placeLayers(); apply(); } });
  const style = document.createElement('style');
  style.textContent = `
    .tome-island-layout-hint { display:none; }
    body.tome-island-active .tome-island-layout-hint { display:block; }
    body.tome-island-active label:has(>input[name=galX]),body.tome-island-active label:has(>input[name=galY]),body.tome-island-active label:has(>input[name=galWidth]),body.tome-island-active label:has(>select[name=galPreset]),body.tome-island-active [data-gal-drag],body.tome-island-active [data-gal-position-sync],body.tome-island-active .tome-live-position,body.tome-island-active .tome-manual-region-hint { display:none!important; }
    .sentence-text.tomoyo-furigana { line-height:var(--tomoyo-gal-ruby-line-height,2.55)!important; padding-top:.55em; } /* furigana needs room between wrapped rows even with a tight line height */
    .sentence-text .char-token[data-tomoyo-reading] { position:relative; }
    body.tome-line-read .sentence-window:not(.tome-island-page) { --tomoyo-gal-color:var(--tomoyo-gal-read-color); --tomoyo-gal-gradient:var(--tomoyo-gal-read-gradient); --tomoyo-gal-fill:var(--tomoyo-gal-read-fill); --tomoyo-gal-jp-stroke:var(--tomoyo-gal-read-jp-stroke); --tomoyo-gal-cn-stroke:var(--tomoyo-gal-read-cn-stroke); --tomoyo-gal-jp-filter:var(--tomoyo-gal-read-jp-filter); --tomoyo-gal-cn-filter:var(--tomoyo-gal-read-cn-filter); }
    body.tome-surface-pending .sentence-window, body.tome-surface-pending .tomoyo-native-mask, body.tome-surface-pending .tome-inline-wait { visibility:hidden!important; }
    body.tome-box-dragging .sentence-window { outline:2px dashed var(--theme-primary,#e0495a)!important; outline-offset:2px; cursor:move!important; }
    body.tome-box-dragging .sentence-window * { cursor:move!important; pointer-events:none!important; }
    [data-gal-drag].tome-dragging { background:var(--theme-primary,#e0495a)!important; color:#fff!important; border-color:transparent!important; }
    .sentence-text .char-token[data-tomoyo-reading]::before { content:attr(data-tomoyo-reading); position:absolute; left:calc(var(--tomoyo-ruby-width,1em)/2 + var(--tomoyo-ruby-offset-x,0px) + var(--tomoyo-ruby-shift,0px)); bottom:calc(100% + .13em - var(--tomoyo-ruby-offset-y,0px)); transform:translateX(-50%); font-size:var(--tomoyo-ruby-actual-size,max(6px,var(--tomoyo-ruby-scale,.52em))); line-height:1; font-weight:var(--tomoyo-jp-weight,400); white-space:nowrap; pointer-events:none; letter-spacing:0; text-shadow:var(--tomoyo-gal-shadow,0 1px 2px #000e); }
    body.tomoyo-gal-bound [data-gal-reader-container] > :not([data-gal-reader-container]):not(.sentence-window):not(.tomoyo-cn-dialog):not(.word-image-preview-portal):not(.tomoyo-native-mask):not(.tome-backlog):not(.tome-box-deco):not(.tome-mode-veil):not(.mg-bubble) { display:none!important; }
    body.tomoyo-gal-bound [data-gal-reader-container] { transform:none!important; perspective:none!important; filter:none!important; opacity:1!important; isolation:auto!important; contain:none!important; will-change:auto!important; mix-blend-mode:normal!important; z-index:auto!important; }
    .tomoyo-native-mask { position:fixed!important; z-index:10!important; pointer-events:none!important; user-select:none!important; max-width:none!important; margin:0!important; padding:0!important; border:0!important; opacity:1!important; filter:none!important; }
    body:not(.tomoyo-gal-bound) .tomoyo-native-mask { display:none!important; }
    body.tomoyo-gal-bound .sentence-window { position:fixed!important; z-index:20!important; inset:auto!important; left:var(--tomoyo-reader-x,0px)!important; top:var(--tomoyo-reader-y,0px)!important; margin:var(--tomoyo-gal-out-y,0px) var(--tomoyo-gal-out-x,0px)!important; width:calc(var(--tomoyo-reader-width,100vw) - var(--tomoyo-gal-out-x,0px) * 2)!important; height:auto!important; max-height:none!important; flex-direction:column!important; justify-content:flex-start!important; max-width:none!important; min-height:0!important; padding:var(--tomoyo-gal-pad-y,10px) var(--tomoyo-gal-pad-x,20px)!important; box-sizing:border-box!important; border:0!important; border-radius:0!important; align-items:stretch!important; overflow:visible!important; scrollbar-width:none; -webkit-app-region:no-drag; }
    body.tomoyo-gal-bound .sentence-window::-webkit-scrollbar { display:none; }
    html:has(body.tomoyo-gal-bound), body.tomoyo-gal-bound, body.tomoyo-gal-bound [data-gal-reader-container], body.tomoyo-gal-bound .sentence-window { background-color:transparent!important; background-image:none!important; box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
    body.tomoyo-gal-bound .lookup-limit-badge { display:none!important; }
    body.tomoyo-ui-translation.tomoyo-cover-hidden .sentence-window, body.tomoyo-ui-translation.tomoyo-cover-hidden .tomoyo-native-mask { visibility:hidden!important; pointer-events:none!important; }
    body.tomoyo-gal-bound, body.tomoyo-gal-bound [data-gal-reader-container] { overflow:hidden!important; }
    body.tomoyo-game-style .sentence-text, body.tomoyo-gal-bound .sentence-text { letter-spacing:var(--tomoyo-gal-jp-spacing,.035em)!important; line-height:var(--tomoyo-gal-line-height,1.95)!important; }
    body.tomoyo-gal-bound .sentence-text { flex:none!important; max-height:none!important; overflow:visible!important; font-size:var(--tomoyo-gal-jp-size,26px)!important; }
    body.tomoyo-game-style .sentence-text { font-family:var(--tomoyo-gal-jp-font)!important; font-size:var(--tomoyo-gal-jp-size,26px)!important; font-weight:400!important; color:var(--tomoyo-gal-color,#fffaf2)!important; text-align:left!important; line-height:var(--tomoyo-gal-line-height,1.95)!important; letter-spacing:var(--tomoyo-gal-jp-spacing,.035em)!important; text-shadow:var(--tomoyo-gal-shadow)!important; margin:0!important; width:100%!important; white-space:pre-wrap; overflow-wrap:anywhere; line-break:strict; }
    body.tomoyo-game-style .sentence-text .char-token { color:inherit!important; border-bottom:0!important; padding-bottom:0!important; }
    body.tomoyo-game-style .sentence-text .char-token:not(.hovered) { background-color:transparent!important; }
    body.tomoyo-game-style .sentence-text .char-token.hovered { background-color:#fff2!important; box-shadow:0 0 0 2px #fff2; border-radius:2px; }
    body.tomoyo-game-style .tomoyo-cn-row { margin:var(--tomoyo-gal-gap,6px) 0 0!important; padding:0!important; line-height:1.65!important; }
    body.tomoyo-game-style .tomoyo-cn-output { font-family:var(--tomoyo-gal-cn-font)!important; font-size:var(--tomoyo-gal-cn-size,24px)!important; font-weight:400!important; color:var(--tomoyo-gal-color,#fffaf2)!important; letter-spacing:var(--tomoyo-gal-cn-spacing,0px)!important; line-height:1.65!important; text-shadow:var(--tomoyo-gal-shadow)!important; }
    body.tomoyo-game-style .tomoyo-cn-output[data-state=error] { color:#e3bdb3!important; font:14px/1.5 'Microsoft YaHei',sans-serif!important; }
    body.tomoyo-game-style .tomoyo-cn-row:has(.tomoyo-cn-output:empty) { visibility:hidden; }
    body.tomoyo-gal-ja-only .tomoyo-cn-row { display:none!important; }
    body.tomoyo-gal-zh-only .sentence-text { display:none!important; }
    body.tomoyo-gal-zh-only .tomoyo-cn-row { margin-top:0!important; }
    body.tomoyo-gal-mask .sentence-window { background:var(--tomoyo-gal-mask,#171923)!important; }
    body.tomoyo-game-style .sentence-text .char-token,body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .sentence-text .char-token,body.tomoyo-gal-bound .tomoyo-cn-output {
      background-image:var(--tomoyo-gal-gradient,none)!important;background-clip:text!important;-webkit-background-clip:text!important;
      -webkit-text-fill-color:var(--tomoyo-gal-fill,currentColor)!important;
    }
    body.tomoyo-game-style .sentence-text,body.tomoyo-gal-bound .sentence-text { filter:var(--tomoyo-gal-jp-filter,none)!important; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { filter:var(--tomoyo-gal-cn-filter,none)!important;background-size:100% 1.65em!important;background-repeat:repeat-y!important; }
    .sentence-text .char-token[data-tomoyo-reading]::before { -webkit-text-fill-color:var(--tomoyo-gal-color,#fffaf2)!important;background-image:none!important; }
    .tomoyo-gal-fields { border:1px solid #505465; border-radius:8px; padding:10px 12px; margin:14px 0; }
    .tomoyo-gal-fields legend { padding:0 5px; }
    .tomoyo-gal-fields button { background:#343847; color:#eef1fa; border:1px solid #505465; border-radius:5px; padding:5px 8px; margin:6px 6px 0 0; cursor:pointer; }
    .tomoyo-gal-state { margin-top:6px; color:#b5d8fc; }
    body.tomoyo-gal-bound .sentence-text, body.tomoyo-game-style .sentence-text { font-weight:var(--tomoyo-jp-weight,400)!important; }
    body.tomoyo-ui-translation .tomoyo-cn-output,body.tomoyo-ui-translation .tomoyo-cn-output *,body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-game-style .tomoyo-cn-output * { font-weight:var(--tomoyo-cn-weight,400)!important; font-synthesis:weight!important; font-synthesis-weight:auto!important; }
    .sentence-window.tomoyo-cn-active .sentence-text, .sentence-window.tomoyo-cn-active .tomoyo-cn-row { box-sizing:border-box!important; align-self:stretch!important; min-width:0!important; width:100%!important; margin-left:0!important; margin-right:0!important; padding-left:0!important; padding-right:0!important; border-left:0!important; border-right:0!important; text-indent:0!important; text-align:left!important; }
    .tomoyo-cn-output { margin:0!important; padding:0!important; text-indent:0!important; text-align:left!important; white-space:pre-line!important; }
    .sentence-text .char-token[data-tomoyo-leading-space] { display:none!important; }
    .sentence-window.tomoyo-cn-active .sentence-text { text-indent:var(--tomoyo-jp-indent,0px)!important; }
    .tomoyo-cn-output { text-indent:var(--tomoyo-cn-indent,0px)!important; }
    body.tomoyo-gal-bound .tomoyo-cn-dialog { top:12px; right:12px; left:auto; bottom:auto; margin:0; width:390px; max-height:calc(100vh - 24px); }
    body.tomoyo-gal-bound .tomoyo-cn-dialog::backdrop { background:transparent; }
    .tomoyo-cn-dialog input[type=range] { padding:0; accent-color:#b6c8e8; cursor:ew-resize; }
    body.tomoyo-game-style .sentence-text,body.tomoyo-gal-bound .sentence-text,body.tomoyo-game-style .sentence-text .char-token,body.tomoyo-gal-bound .sentence-text .char-token { -webkit-text-stroke:var(--tomoyo-gal-jp-stroke,var(--tomoyo-jp-stroke,0px)) var(--tomoyo-jp-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { -webkit-text-stroke:var(--tomoyo-gal-cn-stroke,var(--tomoyo-cn-stroke,0px)) var(--tomoyo-cn-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; -webkit-font-smoothing:antialiased; text-rendering:geometricPrecision; }
    .sentence-text .char-token[data-tomoyo-reading]::before { -webkit-text-stroke:var(--tomoyo-ruby-stroke,0px) var(--tomoyo-ruby-stroke-color,#fff)!important; paint-order:stroke fill!important; text-shadow:none!important; }
    .tomoyo-slider-value { color:#dfc9a7; font-variant-numeric:tabular-nums; float:right; }
    body.tomoyo-game-style .sentence-text,body.tomoyo-gal-bound .sentence-text { font-family:var(--tomoyo-gal-jp-font)!important; }
    body.tomoyo-game-style .tomoyo-cn-output,body.tomoyo-gal-bound .tomoyo-cn-output { font-family:var(--tomoyo-gal-cn-font)!important; }
    .sentence-text .char-token[data-tomoyo-reading]::before { font-family:var(--tomoyo-ruby-font,"Meiryo",sans-serif)!important; font-synthesis:none; text-rendering:optimizeLegibility; -webkit-font-smoothing:antialiased; font-weight:400!important; }
  `;
  (document.head || document.documentElement).appendChild(style);
  function sourceText(sentence) { return Array.from(sentence?.querySelectorAll('.char-token') || [], node => node.textContent).join(''); }
  function clearRuby(scope=document) { for (const span of scope.querySelectorAll('[data-tomoyo-reading]')) { span.removeAttribute('data-tomoyo-reading'); span.style.removeProperty('--tomoyo-ruby-width');span.style.removeProperty('--tomoyo-ruby-actual-size');span.style.removeProperty('--tomoyo-ruby-shift'); } }
  // ISLAND pages hold several sentences at once: each keeps its own furigana while later sentences arrive.
  function rubyTargets() { const page = [...document.querySelectorAll('.tome-island-page .sentence-text')]; if (page.length) return page; const one = document.querySelector('.sentence-text'); return one ? [one] : []; }
  function paint(tokens, sentence = document.querySelector('.sentence-text'), all = true) {
    clearRuby(all ? document : sentence || document);
    if (!sentence) return;
    sentence.classList.toggle('tomoyo-furigana', !!preferences.furigana);
    sentence.style.setProperty('--tomoyo-ruby-scale', preferences.rubyScale + 'em');
    if (!preferences.furigana) return;
    const chars = [...sentence.querySelectorAll('.char-token')];
    const text = sourceText(sentence);
    const items=[],canvas=document.createElement('canvas').getContext('2d'),sentenceRect=sentence.getBoundingClientRect();
    for (const annotation of window.TomoyoFurigana.withGameRuby(text, window.TomoyoFurigana.annotations(text, tokens), bridge.gameRuby)) {
      const start = chars[annotation.start], end = chars[annotation.end - 1];
      if (!start || !end) continue;
      const first = start.getBoundingClientRect(), last = end.getBoundingClientRect();
      if (Math.abs(first.top - last.top) > 3 || last.right <= first.left) continue;
      const style=getComputedStyle(start),em=parseFloat(style.fontSize)||16,font=Math.max(6,em*preferences.rubyScale);
      // A reading may reach half a character over a neighbouring kana or punctuation and a quarter over a kanji (a
      // neighbour's own reading is kept apart by the layout).
      const over=c=>c&&!/[\p{Script=Han}々〆]/u.test(c.textContent||'')&&(c.textContent||'').trim()?em*.5:c?em*.25:0,prev=chars[annotation.start-1],next=chars[annotation.end];
      const allowLeft=first.left-(prev&&Math.abs(prev.getBoundingClientRect().top-first.top)<=3?over(prev):0)+preferences.rubyOffsetX,allowRight=last.right+(next&&Math.abs(next.getBoundingClientRect().top-last.top)<=3?over(next):0)+preferences.rubyOffsetX;canvas.font=font+'px '+getComputedStyle(document.documentElement).getPropertyValue('--tomoyo-ruby-font');items.push({...annotation,node:start,left:first.left+preferences.rubyOffsetX,right:last.right+preferences.rubyOffsetX,top:first.top,font,width:canvas.measureText(annotation.reading).width,allowLeft,allowRight,limitLeft:sentenceRect.left,limitRight:sentenceRect.right,priority:annotation.end-annotation.start});
    }
    for(const item of window.TomoyoRubyLayout.layout(items)){if(!item.visible)continue;item.node.setAttribute('data-tomoyo-reading',item.reading);item.node.style.setProperty('--tomoyo-ruby-width',(item.right-item.left)+'px');item.node.style.setProperty('--tomoyo-ruby-actual-size',item.font+'px');item.node.style.setProperty('--tomoyo-ruby-shift',(item.shift||0)+'px');
    }
  }
  async function updateRuby() {
    const targets = rubyTargets(), page = !!targets[0]?.closest('.tome-island-page');
    if (!page) return updateLineRuby();
    const id = ++renderSerial;
    for (const sentence of targets) {
      const text = sourceText(sentence);
      if (!preferences.furigana || !text) { paint([], sentence, false); continue; }
      const cacheKey = (bridge.options?.().readingEngine || 'sudachi') + '\0' + text;
      if (sentence.__tomeRubyText === text && sentence.__tomeRubyKey === cacheKey && tokenCache.has(cacheKey)) { paint(tokenCache.get(cacheKey), sentence, false); continue; }
      try {
        const tokens = await rubyTokens(text);
        if (id !== renderSerial) return;
        if (!sentence.isConnected || sourceText(sentence) !== text) continue;
        sentence.__tomeRubyText = text; sentence.__tomeRubyKey = cacheKey; paint(tokens, sentence, false);
      } catch(error) { clearRuby(sentence); bridge.learningStatus?.({learningMessage:error.message||'Full 注音尚未就绪'}); if (dialogFields) dialogFields.state.textContent = error.message||'本地注音暂未就绪'; return; }
    }
    bridge.islandPage?.refresh?.(); // furigana changes each pair's height and reserved band
  }
  // Furigana must appear with its characters as the typewriter reveals them, not after the whole line (user,
  // 2026-11-02). Tokenizing starts when the line's text arrives (prefetch); the island page awaits prepareRuby before
  // its reveal, so the readings are already attached to the still-hidden characters. One request per text.
  const rubyInflight = new Map();
  const rubyKey = text => (bridge.options?.().readingEngine || 'sudachi') + '\0' + text;
  function rubyTokens(text) {
    const key = rubyKey(text);if (tokenCache.has(key)) return Promise.resolve(tokenCache.get(key));
    if (!rubyInflight.has(key)) rubyInflight.set(key, tokenize(text, key).finally(() => rubyInflight.delete(key)));
    return rubyInflight.get(key);
  }
  bridge.prefetchRuby = text => { if (preferences.furigana && typeof text === 'string' && text.trim()) rubyTokens(text).catch(() => {}); };
  bridge.prepareRuby = async sentence => {
    const text = sourceText(sentence);if (!preferences.furigana || !text) return false;
    const key = rubyKey(text), tokens = await rubyTokens(text);
    if (!sentence.isConnected || sourceText(sentence) !== text) return false;
    sentence.__tomeRubyText = text; sentence.__tomeRubyKey = key; paint(tokens, sentence, false); bridge.islandPage?.refresh?.(); return true;
  };
  // The backlog annotates past lines with the same readings as the current one: the game's own ruby first, then the
  // tokenizer with its whole-word dictionary readings (E138). null while furigana is off.
  bridge.rubyAnnotations = async text => {
    if (!preferences.furigana || typeof text !== 'string' || !text.trim()) return null;
    const tokens = await rubyTokens(text);
    return window.TomoyoFurigana.withGameRuby(text, window.TomoyoFurigana.annotations(text, tokens), bridge.gameRuby);
  };
  async function tokenize(text, cacheKey) {
    const full=(bridge.options?.().readingEngine||'sudachi')==='sudachi';
    const raw = full?await bridge.localTokenize(text):await window.__TAURI_INTERNALS__.invoke('tokenize_text', { text });
    if(full&&(!Array.isArray(raw)||raw.some(t=>t.source!=='SudachiDict Full')))throw Error('注音未取得 Full 原生分词结果');
    const tokens = window.TomoyoFurigana.contextual(text, full?raw:await spellingReadings(Array.isArray(raw)?raw:[]));
    const result = Array.isArray(tokens) ? tokens : [];
    tokenCache.set(cacheKey, result);
    if (tokenCache.size > 400) tokenCache.delete(tokenCache.keys().next().value);
    return result;
  }
  async function updateLineRuby() {
    const sentence = document.querySelector('.sentence-text');
    const text = sourceText(sentence);
    if (!preferences.furigana || !text) { paint([]); return; }
    const id = ++renderSerial;
    const cacheKey=(bridge.options?.().readingEngine||'sudachi')+'\0'+text;
    if(text!==lastText)clearRuby();
    if (tokenCache.has(cacheKey)) { lastText = text; lastTokens = tokenCache.get(cacheKey); paint(lastTokens); return; }
    try {
      const full=(bridge.options?.().readingEngine||'sudachi')==='sudachi';
      const raw = full?await bridge.localTokenize(text):await window.__TAURI_INTERNALS__.invoke('tokenize_text', { text });
      if(full&&(!Array.isArray(raw)||raw.some(t=>t.source!=='SudachiDict Full')))throw Error('注音未取得 Full 原生分词结果');
      const tokens = window.TomoyoFurigana.contextual(text, full?raw:await spellingReadings(Array.isArray(raw)?raw:[]));
      if (id !== renderSerial || sourceText(document.querySelector('.sentence-text')) !== text) return;
      lastText = text; lastTokens = Array.isArray(tokens) ? tokens : [];
      tokenCache.set(cacheKey, lastTokens);
      if (tokenCache.size > 400) tokenCache.delete(tokenCache.keys().next().value);
      paint(lastTokens);
    } catch(error) {clearRuby();bridge.learningStatus?.({learningMessage:error.message||'Full 注音尚未就绪'});if (dialogFields) dialogFields.state.textContent = error.message||'本地注音暂未就绪'; }
  }
  function markReader() {
    for (const node of document.querySelectorAll('[data-gal-reader-container]')) node.removeAttribute('data-gal-reader-container');
    if (!bound) return;
    let node = document.querySelector('.sentence-window')?.parentElement;
    while (node) { node.setAttribute('data-gal-reader-container', ''); node = node.parentElement; }
  }
  function alignText() {
    let leading=true;
    const spans=[...document.querySelectorAll('.sentence-text .char-token')];
    for(const span of spans){
      const text=span.textContent||'';
      const hide=leading&&/^[ \t\u00a0\u3000]+$/.test(text);
      if(hide)span.setAttribute('data-tomoyo-leading-space','');else span.removeAttribute('data-tomoyo-leading-space');
      if(text.includes('\n'))leading=true;else if(!hide&&text)leading=false;
    }
    const context=document.createElement('canvas').getContext?.('2d');
    if(context){
      const japanese=spans.find(span=>!span.hasAttribute('data-tomoyo-leading-space')&&span.textContent.trim());
      for(const [name,node,text] of [['jp',document.querySelector('.sentence-text'),japanese?.textContent],['cn',document.querySelector('.tomoyo-cn-output'),document.querySelector('.tomoyo-cn-output')?.textContent?.trimStart()]]){
        if(!node||!text)continue;const s=getComputedStyle(node);context.font=s.fontWeight+' '+s.fontSize+' '+s.fontFamily;
        const left=context.measureText(Array.from(text)[0]).actualBoundingBoxLeft;
        if(Number.isFinite(left))document.documentElement.style.setProperty('--tomoyo-'+name+'-indent',Math.max(-60,Math.min(5,left))+'px');
      }
    }
  }
  bridge.alignText=alignText;
  // Transparent text fill exposes a centred WebKit stroke underneath thin glyphs. Dilate the final painted alpha
  // instead and merge the coloured glyph ON TOP, keeping the gradient visible even with a light outline.
  function gradientOutline(name,on,width,color) {
    const ns='http://www.w3.org/2000/svg',id='tome-gradient-'+name+'-outline';let svg=document.getElementById('tome-gradient-filters');
    if(!svg){svg=document.createElementNS(ns,'svg');svg.id='tome-gradient-filters';svg.setAttribute('width','0');svg.setAttribute('height','0');svg.style.cssText='position:absolute;pointer-events:none;';document.body.append(svg);}
    let filter=document.getElementById(id);if(!filter){filter=document.createElementNS(ns,'filter');filter.id=id;filter.setAttribute('x','-100%');filter.setAttribute('y','-100%');filter.setAttribute('width','300%');filter.setAttribute('height','300%');filter.setAttribute('color-interpolation-filters','sRGB');
      for(const [tag,attrs]of [['feMorphology',{in:'SourceAlpha',operator:'dilate',radius:'0',result:'expanded'}],['feFlood',{'flood-color':'#ffffff',result:'ink'}],['feComposite',{in:'ink',in2:'expanded',operator:'in',result:'outline'}]]){const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);filter.append(n);}
      const merge=document.createElementNS(ns,'feMerge');for(const input of ['outline','SourceGraphic']){const n=document.createElementNS(ns,'feMergeNode');n.setAttribute('in',input);merge.append(n);}filter.append(merge);svg.append(filter);}
    const radius=on?Math.max(0,width):0,m=filter.querySelector('feMorphology'),f=filter.querySelector('feFlood');if(m.getAttribute('radius')!==String(radius))m.setAttribute('radius',String(radius));if(f.getAttribute('flood-color')!==color)f.setAttribute('flood-color',color);
    document.documentElement.style.setProperty('--tomoyo-gradient-'+name+'-outline',radius>0?'url(#'+id+')':'none');
  }
  function apply() {
    preferences = appearance.clean(preferences);
    if (!document.querySelector('.tomoyo-cn-dialog[open]')) gameScale = appearance.scaleForViewport(layoutInfo ? layoutInfo.readerWidth/(Number(window.devicePixelRatio)||1) : window.innerWidth, preferences, bound);
    placeLayers();
    const root = document.documentElement.style;
    const scaled = value => (value * gameScale).toFixed(2) + 'px';
    root.setProperty('--tomoyo-gal-jp-size', scaled(preferences.japaneseSize));
    root.setProperty('--tomoyo-gal-cn-size', scaled(preferences.translationSize));
    const insets=appearance.insets(preferences);
    root.setProperty('--tomoyo-gal-pad-x', scaled(insets.padX));
    root.setProperty('--tomoyo-gal-pad-y', scaled(insets.padY));
    root.setProperty('--tomoyo-gal-out-x', scaled(insets.outX));
    root.setProperty('--tomoyo-gal-out-y', scaled(insets.outY));
    window.TomeTypewriter?.configure({enabled:preferences.typewriter,speed:preferences.typewriterSpeed});
    root.setProperty('--tomoyo-gal-gap', scaled(preferences.gap));
    root.setProperty('--tomoyo-gal-line-height', appearance.lineHeightFor(preferences));root.setProperty('--tomoyo-gal-ruby-line-height',appearance.lineHeightFor(preferences,true));root.setProperty('--tomoyo-ruby-offset-x',scaled(preferences.rubyOffsetX));root.setProperty('--tomoyo-ruby-offset-y',scaled(preferences.rubyOffsetY));
    root.setProperty('--tomoyo-gal-jp-spacing',scaled(Math.max(-preferences.japaneseSize*.45,preferences.japaneseSpacingPx)));
    root.setProperty('--tomoyo-gal-cn-spacing',scaled(Math.max(-preferences.translationSize*.45,preferences.chineseSpacingPx)));
    root.setProperty('--tomoyo-jp-outline',appearance.outlineFor(preferences.japaneseOutline,preferences.japaneseOutlineColor,preferences.japaneseOutlineWidth*gameScale,window.devicePixelRatio));
    root.setProperty('--tomoyo-cn-outline',appearance.outlineFor(preferences.chineseOutline,preferences.chineseOutlineColor,preferences.chineseOutlineWidth*gameScale,window.devicePixelRatio));
    root.setProperty('--tomoyo-ruby-outline',appearance.outlineFor(preferences.rubyOutline,preferences.rubyOutlineColor,preferences.rubyOutlineWidth*gameScale,window.devicePixelRatio));root.setProperty('--tomoyo-ruby-stroke-color',preferences.rubyOutlineColor);
    // The stroke is centred on the glyph edge and drawn under the fill, so half of it shows. An outline thinner than
    // one screen pixel covers each edge pixel by a different fraction and looks ragged; draw an even one-pixel ring
    // instead and make it as much fainter as it is thinner.
    const stroke=(name,on,width,color)=>{const dpr=Math.max(.5,Number(window.devicePixelRatio)||1),visible=on?width*gameScale:0,pixel=1/dpr;
     const safe=/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff',thin=visible>0&&visible<pixel;
     root.setProperty('--tomoyo-'+name+'-stroke',(thin?pixel*2:visible*2)+'px');
     root.setProperty('--tomoyo-'+name+'-stroke-color',thin?safe+Math.round(Math.max(.2,visible/pixel)*255).toString(16).padStart(2,'0'):safe);};
    stroke('jp',preferences.japaneseOutline,preferences.japaneseOutlineWidth,preferences.japaneseOutlineColor);
    stroke('cn',preferences.chineseOutline,preferences.chineseOutlineWidth,preferences.chineseOutlineColor);
    stroke('ruby',preferences.rubyOutline,preferences.rubyOutlineWidth,preferences.rubyOutlineColor);
    root.setProperty('--tomoyo-jp-weight', preferences.japaneseBold?'700':'400');
    root.setProperty('--tomoyo-cn-weight', preferences.chineseBold?'700':'400');
    const translated=document.querySelector('.tomoyo-cn-output');if(translated){translated.style.setProperty('font-weight',preferences.chineseBold?'700':'400','important');translated.style.setProperty('font-synthesis','weight','important');}
    root.setProperty('--tomoyo-gal-color', preferences.textColor);root.setProperty('--tomoyo-gal-read-color', preferences.readTextColor||preferences.textColor);
    gradientOutline('jp',preferences.japaneseOutline,preferences.japaneseOutlineWidth*gameScale,preferences.japaneseOutlineColor);
    gradientOutline('cn',preferences.chineseOutline,preferences.chineseOutlineWidth*gameScale,preferences.chineseOutlineColor);
    const unreadPaint=appearance.paintFor(preferences),readPaint=appearance.paintFor(preferences,true);
    for(const [key,value]of Object.entries(appearance.paintVariables(unreadPaint)))root.setProperty(key,value);
    for(const [key,value]of Object.entries(appearance.paintVariables(readPaint)))root.setProperty(key.replace('--tomoyo-gal-','--tomoyo-gal-read-'),value);
    root.setProperty('--tomoyo-gal-gradient',unreadPaint.gradient);root.setProperty('--tomoyo-gal-fill',unreadPaint.fill);
    root.setProperty('--tomoyo-gal-read-gradient',readPaint.gradient);root.setProperty('--tomoyo-gal-read-fill',readPaint.fill);
    root.setProperty('--tomoyo-gal-shadow', appearance.shadowFor(preferences.textColor, preferences.shadow));
    root.setProperty('--tomoyo-gal-mask', preferences.maskColor);
    if (preferences.style !== 'custom') {
      root.setProperty('--tomoyo-gal-jp-font', appearance.fonts[preferences.style].ja);
      root.setProperty('--tomoyo-gal-cn-font', appearance.fonts[preferences.style].zh);
    }
    root.setProperty('--tomoyo-gal-jp-font',appearance.japaneseFonts[preferences.japaneseFont]);
    root.setProperty('--tomoyo-gal-cn-font',appearance.chineseFonts[preferences.chineseFont]);
    root.setProperty('--tomoyo-ruby-font',appearance.japaneseFonts[preferences.rubyFont]|| (preferences.rubyFont==='round'?'Meiryo,\"Yu Gothic UI\",sans-serif':preferences.rubyFont==='inherit'?appearance.japaneseFonts[preferences.japaneseFont]:appearance.japaneseFonts[preferences.rubyFont==='mincho'?'originalMincho':'originalGothic']));
    document.body.classList.toggle('tomoyo-game-style', preferences.interfaceMode==='translation' && preferences.style !== 'custom');
    document.body.classList.toggle('tomoyo-gal-ja-only', preferences.interfaceMode==='translation' && preferences.display === 'japanese');
    document.body.classList.toggle('tomoyo-gal-zh-only', preferences.interfaceMode==='translation' && preferences.display === 'chinese');
    bridge.quietTranslation = preferences.style !== 'custom';
    bridge.setTranslationVisible(preferences.display !== 'japanese');
    document.body.classList.toggle('tomoyo-gal-bound', bound);
    document.body.classList.toggle('tomoyo-gal-mask', bound && preferences.maskMode === 'full');bridge.islandPage?.refresh();
    markReader();
    alignText();
    bridge.applyTransparency?.();
    updateRuby();bridge.islandPage?.refresh();
  }
  // Interface for automatic/manual game-style measurement. The sampler reports supported measured values and
  // calls this to apply them. Every field is optional; units follow game-style.js: x / y in percent of the game
  // client, japaneseSize and japaneseSpacingPx in px of a 1280-wide game, lineHeight as a signed adjustment from the 1.95 em baseline,
  // colours as #rrggbb. The text colour in use becomes the "restore previous colour" entry, and the result is saved
  // like the menu's save button. Returns the settings that changed.
  bridge.applyGameStyle = (style = {}) => {
    const map = { textColor:'textColor',textGradient:'textGradient',textGradientTop:'textGradientTop',textGradientBottom:'textGradientBottom',readTextColor:'readTextColor',readTextGradient:'readTextGradient',readTextGradientTop:'readTextGradientTop',readTextGradientBottom:'readTextGradientBottom', outlineColor:'japaneseOutlineColor', x:'x', y:'y', japaneseSize:'japaneseSize', japaneseSpacingPx:'japaneseSpacingPx', lineHeight:'lineHeight', width:'width', height:'height', paddingX:'paddingX', paddingY:'paddingY', autoScale:'autoScale', japaneseFont:'japaneseFont', japaneseBold:'japaneseBold', japaneseOutline:'japaneseOutline', japaneseOutlineWidth:'japaneseOutlineWidth', translationSize:'translationSize', chineseSpacingPx:'chineseSpacingPx' };
    const next = { ...preferences };
    for (const [from,to] of Object.entries(map)) if (style[from] !== undefined && style[from] !== null) next[to] = style[from];
    if (style.outlineColor) next.japaneseOutline = true;
    if(Number.isFinite(style.lineHeight))next.lineHeight=style.lineHeight-1.95;
    const cleaned = appearance.clean(next), changed = {};
    for (const key of Object.values(map).concat('japaneseOutline')) if (cleaned[key] !== preferences[key]) changed[key] = cleaned[key];
    if (changed.textColor) try { localStorage.setItem('tome-previous-text-color', preferences.textColor); } catch {}
    if(commitSynchronizedStyle)commitSynchronizedStyle(changed);syncOpenForm(changed);
    preferences = cleaned; localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences)); send({ type:'galConfigure', settings:preferences }); apply();
    return changed;
  };
  // Settings saved for one game (style sync profile) applied as they are, then saved like the menu's save button.
  // Values applied from outside the menu (style sync, saved game style) also go into an open menu's fields and its
  // saved snapshot; otherwise the next preview would rebuild settings from the stale fields (the synced colour turned
  // back to black as soon as the outline was touched) and Cancel would undo the sync.
  let syncingForm=false;
  const syncOpenForm = values => { const dialog = document.querySelector('.tomoyo-cn-dialog[open]'); if (!dialog) return;
    syncingForm=true;try{for (const [key, value] of Object.entries(values)) { const name = key === 'translationSize' ? 'ChineseSize' : key[0].toUpperCase()+key.slice(1), field = dialog.querySelector('[name="gal'+name+'"]'); if (!field) continue; if (field.type === 'checkbox') field.checked = !!value; else field.value = key==='readTextColor'&&!value?preferences.textColor:value; field.dispatchEvent(new Event('input', { bubbles:true })); }}finally{syncingForm=false;} };
  // Interface mode and window binding are runtime state owned by the launcher: a saved profile, import or form snapshot
  // carrying stale values (interfaceMode normal, bindEnabled false) dropped game style, so colours and embedding stopped.
  const styleOnly = values => { const { interfaceMode, bindEnabled, gameProcess, ...rest } = values || {}; return rest; };
  bridge.applyGalPreferences = (values = {}, options = {}) => { values = styleOnly(values); preferences = appearance.clean({ ...preferences, ...values }); const applied = {}; for (const key of Object.keys(values)) if (preferences[key] !== undefined) applied[key] = preferences[key]; if (!options.preview&&commitSynchronizedStyle) commitSynchronizedStyle(applied); syncOpenForm(applied); if(!options.preview)localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences)); if(options.preview)send({type:'galPreview',settings:preferences});else if(options.persist!==false)send({ type:'galConfigure', settings:preferences }); apply(); return { ...preferences }; };
  bridge.galPreferences = () => ({ ...preferences });
  // Live position tracking (text-position.js): moves the text box for the current line without saving each move.
  bridge.galLayoutInfo = () => layoutInfo ? { ...layoutInfo } : null;
  bridge.previewGalPosition = values => { preferences = appearance.clean({ ...preferences, ...styleOnly(values) }); send({ type:'galPreview', settings:preferences }); apply(); };
  bridge.restoreGalSettings = saved => { for (const key of Object.keys(defaults)) if (saved?.[key] !== undefined) preferences[key] = saved[key]; localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences)); apply(); };
  bridge.galStatus = message => {
    if(message?.type==='modeRequest'){if(window.__tomoyoMode?.requestToggle)window.__tomoyoMode.requestToggle();else send({type:'galToggleMode'});return;}
    if(message?.type==='regionApplied'){window.dispatchEvent(new CustomEvent('tome-region-applied',{detail:message}));return;}
    if(typeof message.hookActive==='boolean'){bridge.hookActive=message.hookActive;if(!message.hookActive)bridge.hookSourceText='';}
    if(typeof message.hookSource==='string')bridge.hookSourceText=message.hookSource;
    if(message.hookRubyDict&&typeof message.hookRubyDict==='object')bridge.gameRuby=message.hookRubyDict;
    if(message.hookMessage)bridge.hookMessage=message.hookMessage;if(message.waitMarkerMessage){bridge.waitMarkerMessage=message.waitMarkerMessage;if(dialogFields?.waitMarkerState)dialogFields.waitMarkerState.textContent=message.waitMarkerMessage;}
    if(message.hookThreads)bridge.hookThreads=message.hookThreads;
    if(dialogFields?.hookState&&message.hookMessage)dialogFields.hookState.textContent=message.hookMessage;
    if(dialogFields?.hookThreads&&message.hookThreads){const select=dialogFields.hookThreads,previous=select.value;select.replaceChildren(new Option('选择对话文本流',''));for(const item of message.hookThreads)select.add(new Option(item.name+(item.embeddable?' [可清空]':' [仅读取]')+' · '+(item.sample||'推进一句以查看内容'),item.id));select.value=message.hookThreads.find(t=>t.selected)?.id||previous;}
    if(['normal','translation'].includes(message.interfaceMode)){
      preferences.interfaceMode=message.interfaceMode;
      localStorage.setItem('tomoyo-gal-settings',JSON.stringify(preferences));
      window.__tomoyoMode?.set(message.interfaceMode,message.type==='interfaceMode');
    }
    if(message.type==='gameClosed')window.__tomoyoMode?.gameClosed?.();
    if (typeof message.coverEnabled === 'boolean') document.body.classList.toggle('tomoyo-cover-hidden',!message.coverEnabled);
    if (typeof message.bound === 'boolean') { bound = message.bound; if(!bound){maskImage?.remove();maskImage=null;maskGeometry=null;} apply(); }
    // Binding keeps the menu open; the window was just resized to the game, so report the click regions again.
    if(message.activateGame===true&&message.bound===true)window.__tomoyoHitRegionsRefresh?.(true);
    if (message.layout) bridge.galLayout(message.layout);
    if (dialogFields && message.message) dialogFields.state.textContent = message.message;
    if (message.maskMessage) { bridge.maskMessage = message.maskMessage; if (dialogFields) dialogFields.maskState.textContent = message.maskMessage; }
    if (dialogFields && message.windows) {
      const select = dialogFields.game;
      select.replaceChildren(new Option('选择正在运行的游戏窗口', ''));
      for (const item of message.windows) select.add(new Option(item.title + ' [' + item.processName + ']', item.hwnd));
    }
  };
  const open = bridge.openSettings;
  bridge.openSettings = () => {
    open();
    send({type:'galMenu',open:true});
    const dialog = document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');
    if (!dialog || dialog.querySelector('.tomoyo-gal-fields')) return;
    const group = document.createElement('fieldset');
    group.className = 'tomoyo-gal-fields';
    group.innerHTML = `<legend>Gal 通用阅读</legend>
      <label><input type="checkbox" name="galFurigana">汉字上方自动注音（本地）</label>
      <label>日文字号<input type="number" name="galJapaneseSize" min="14" max="60"></label>
      <label>版式预设<select name="galPreset"><option value="custom">自定义位置</option><option value="bottom">底部对话框（ADV）</option><option value="full">全屏文本（NVL）</option><option value="top">画面上方字幕</option></select></label>
      <label>游戏窗口<select name="galGame"><option value="">点击刷新选择窗口</option></select></label>
      <button type="button" data-gal-refresh>刷新窗口</button><button type="button" data-gal-bind>绑定此窗口</button><button type="button" data-gal-unbind>解除绑定</button>
      <div class="tomoyo-cn-grid"><label>文本框左边距<input type="number" name="galX" min="0" max="95" step="0.1"></label><label>文本框上边距<input type="number" name="galY" min="0" max="95" step="0.1"></label><label>文字换行宽度<input type="number" name="galWidth" min="20" max="100" step="0.1"></label><input type="hidden" name="galHeight"><small class="tome-manual-region-hint">显示区域随实际文字增长，高度自动调整</small><small class="tome-island-layout-hint">ISLAND 按每句原文位置排列日中组，密集页自动腾出译文空间，无需设置文本框宽高</small></div>
      <button type="button" data-gal-drag>拖动文本框</button>
      <div class="tome-position-sync"><button type="button" data-gal-position-sync>同步位置</button><label class="tome-live-position"><input type="checkbox" name="galLivePosition">实时同步原文坐标</label><small data-position-state></small></div>
      <div class="tome-game-style-sync"><label class="tome-auto-style-switch"><input type="checkbox" name="galAutoGameStyle">自动同步游戏原文样式</label><button type="button" data-game-style-sync>从游戏同步</button><small data-game-style-state></small></div>
      <label>原文替换方式<select name="galMaskMode"><option value="hook">Hook 引擎与原文替换内嵌（优先）</option><option value="local">OCR 覆盖原文（最后兜底）</option></select></label>
      <div data-gal-hook-options><label>对话文本流<select name="galHookThread"><option value="">先绑定游戏并推进一句</option></select></label><button type="button" data-gal-hook-select>使用这条对话流</button><div class="tomoyo-hook-state" role="status"></div><small>选择前请核对内容是完整对话。仅读取的流可以显示台词，不能清空游戏原文；可清空的流仅在覆盖模式启用替换。Alt+H 隐藏覆盖或 Alt+M 返回普通界面会关闭替换，台词读取继续。</small></div>
      <label data-gal-full-color>整块底板颜色<input type="color" name="galMaskColor"></label>
      <label><input name="galRelocateWaitMarker" type="checkbox">将原等待符移到 ToMe 句末</label>
      <label><input name="galHideWaitMarker" type="checkbox">隐藏点击等待图标</label>
      <details><summary>局部模糊与原文字扫描范围</summary>
        <label><input type="checkbox" name="galFastMask">极速预遮（先沿用原文位置，随后识别校正）</label>
        <label>遮字外观<select name="galMaskStyle"><option value="blend">融合对话框背景（推荐）</option><option value="blur">模糊遮字</option></select></label>
        <small>扫描的是游戏原文字位置，与上方新文字位置分开；百分比相对游戏画面<br>只遮挡 OCR 匹配到的原文词块；未识别的字可能漏遮，不会自动铺整块底板</small>
        <div class="tomoyo-cn-grid"><label>扫描左边距<input name="galScanX" type="number" min="0" max="95"></label><label>扫描上边距<input name="galScanY" type="number" min="0" max="95"></label><label>扫描宽度<input name="galScanWidth" type="number" min="5" max="100"></label><label>扫描高度<input name="galScanHeight" type="number" min="5" max="100"></label><label>模糊强度<input name="galBlurRadius" type="number" min="5" max="30"></label><label>遮字扩边 px<input name="galMaskPadding" type="number" min="0" max="10"></label></div>
      </details>
      <small>局部模糊只在本机处理游戏画面，不额外调用翻译 API；部分游戏可能无法读取<br>遮罩随游戏移动，不接收点击；这不会关闭游戏内部的文字绘制</small>
      <div class="tomoyo-mask-state" role="status"></div>
      <div class="tomoyo-gal-state" role="status"></div>`;
    const form = dialog.querySelector('form');
    group.querySelector('legend').textContent = '画面与排版';
    group.querySelector('legend').insertAdjacentHTML('afterend', `
      <label>字体搭配<select name="galStyle"><option value="classic">MS Mincho（日文明朝）／素晴汉化字体</option><option value="clean">MS Gothic（日文黑体）／素晴汉化字体</option><option value="custom">自定义 · 沿用下方译文设置</option></select></label>
      <div class="tomoyo-cn-grid"><label><input name="galJapaneseBold" type="checkbox">日文加粗</label><label><input name="galChineseBold" type="checkbox">中文加粗</label></div>
      <label><input name="galTypewriter" type="checkbox">文字逐字显示</label>
      <label>显示速度（字/秒）<input name="galTypewriterSpeed" type="number" min="5" max="120" step="1"></label>
      <small>点击游戏或按空格可补全当前文字；按住 Ctrl 快速显示，不拦截游戏操作</small>
      <label>显示内容<select name="galDisplay"><option value="bilingual">日文＋假名／中文</option><option value="japanese">仅日文＋假名</option><option value="chinese">仅中文 · 接近汉化版</option></select></label>
      <div class="tomoyo-cn-grid tomoyo-type-sizes"><label>中文字号<input name="galChineseSize" type="number" min="12" max="60"></label></div>
      <div class="tomoyo-cn-grid"><label>未读渐变<input name="galTextGradient" type="checkbox"></label><label>已读渐变<input name="galReadTextGradient" type="checkbox"></label><label>未读渐变上色<input name="galTextGradientTop" type="color"></label><label>未读渐变下色<input name="galTextGradientBottom" type="color"></label><label>已读渐变上色<input name="galReadTextGradientTop" type="color"></label><label>已读渐变下色<input name="galReadTextGradientBottom" type="color"></label><label>未读渐变起点（%）<input name="galTextGradientStart" type="number" min="0" max="95" step="1"></label><label>已读渐变起点（%）<input name="galReadTextGradientStart" type="number" min="0" max="95" step="1"></label></div>
      <div class="tomoyo-cn-grid"><label>文字颜色<input name="galTextColor" type="color"></label><label>已读文字颜色<input name="galReadTextColor" type="color"></label><label>文字阴影<select name="galShadow"><option value="outline">细描边 · 适合复杂背景</option><option value="soft">柔和阴影</option><option value="none">无阴影</option></select></label></div>
      <label><input name="galAutoScale" type="checkbox">字号跟随游戏窗口缩放</label>
      <details class="tomoyo-gal-spacing"><summary>行距与留白</summary><div class="tomoyo-cn-grid">
        <label>日文行距调整<input name="galLineHeight" type="number" min="-1.9" max="1.9" step="0.05"></label>
        <label>译文间距<input name="galGap" type="number" min="-28" max="40"></label><label>译文换行宽度（0 = 跟随日文）<input name="galTranslationWidth" type="number" min="0" max="100"></label><label>左右留白<input name="galPaddingX" type="number" min="-40" max="80"></label><label>上下留白<input name="galPaddingY" type="number" min="-40" max="60"></label>
      </div></details>
      <small>绑定游戏后，ToMe 会自动到游戏根目录查找原版日文字体和汉化中文字体并导入；导入的字体会以「字体名（游戏名原版／汉化）」出现在下面的日文、中文字体选项里，上方的指示灯变绿表示已经在用游戏原版字体。找不到时可点「重新查找游戏字体」<br>仅中文模式仍需在翻译页开启中文翻译</small>`);
    group.querySelector('.tomoyo-type-sizes').prepend(group.querySelector('[name=galJapaneseSize]').closest('label'));
    // Furigana position sliders sit directly under the furigana switch instead of inside a collapsed section.
    const rubyBlock=document.createElement('div');rubyBlock.className='tomoyo-ruby-position';
    rubyBlock.innerHTML='<div class="tomoyo-ruby-size"><label>假名大小（相对正文）<input name="galRubyScale" type="number" min="0.2" max="0.85" step="0.01"></label></div><div class="tomoyo-cn-grid"><label>假名水平位置 X（右＋，px）<input name="galRubyOffsetX" type="number" min="-40" max="40" step="0.5"></label><label>假名垂直位置 Y（下＋，px）<input name="galRubyOffsetY" type="number" min="-40" max="40" step="0.5"></label></div><label><input name="galRubyOutline" type="checkbox">假名描边</label><div class="tomoyo-cn-grid"><label>假名描边颜色<input name="galRubyOutlineColor" type="color"></label><label>假名描边粗细<input name="galRubyOutlineWidth" type="number" min="0" max="2" step="0.05"></label></div>';
    const rubyMenu=document.createElement('details');rubyMenu.className='tomoyo-ruby-menu';rubyMenu.innerHTML='<summary>注音字体与描边</summary>';
    const furiganaLabel=group.querySelector('[name=galFurigana]').closest('label');furiganaLabel.before(rubyMenu);rubyMenu.append(furiganaLabel,rubyBlock);
    const layout = document.createElement('details');
    layout.className = 'tomoyo-gal-layout';
    layout.innerHTML = '<summary>游戏窗口与对话框位置</summary>';
    let layoutNode = group.querySelector('[name=galPreset]').closest('label');
    while (layoutNode && !layoutNode.classList?.contains('tomoyo-gal-state')) {
      const next = layoutNode.nextSibling; layout.appendChild(layoutNode); layoutNode = next;
    }
    if (!bound) layout.open = true;
    group.insertBefore(layout, group.querySelector('.tomoyo-gal-state'));
    form.insertBefore(group, form.querySelector('[name=enabled]').closest('label'));
    group.insertAdjacentHTML('beforeend', `
      <details><summary>日文字体与描边</summary>
      <label>日文字体<select name="galJapaneseFont"><option value="originalGothic">MS Gothic（原版字体·黑体）</option><option value="originalMincho">MS Mincho（原版字体·明朝）</option><option value="yuMincho">游明朝</option><option value="yuGothic">游黑体</option><option value="meiryo">Meiryo</option></select></label><label>日文字距（px）<input name="galJapaneseSpacingPx" type="number" min="-15" max="25" step="0.25"></label>
      <label>注音字体<select name="galRubyFont"><option value="round">Meiryo（圆滑清晰假名）</option><option value="gothic">MS Gothic（原版字体·清晰假名）</option><option value="mincho">MS Mincho（原版字体·明朝）</option><option value="inherit">跟随日文字体</option></select></label>
      <label><input name="galJapaneseOutline" type="checkbox">开启日文描边</label>
      <div class="tomoyo-cn-grid"><label>日文描边颜色<input name="galJapaneseOutlineColor" type="color"></label><label>日文描边粗细<input name="galJapaneseOutlineWidth" type="number" min="0" max="4" step="0.1"></label></div>
      <small>带「原版」字样的是当前游戏自带或引擎默认的字体；MS Gothic / MS Mincho 是 BGI、YU-RIS 等引擎的默认字体，游戏里用哪套以游戏设置为准</small></details>
      <details><summary>中文字体与描边</summary>
      <label>中文字体<select name="galChineseFont"><option value="patch">素晴日汉化 font.ttf（原版字体·汉化）</option><option value="simhei">系统黑体</option><option value="yahei">微软雅黑</option><option value="simsun">宋体</option><option value="kaiti">楷体</option></select></label><label>中文字距（px）<input name="galChineseSpacingPx" type="number" min="-15" max="25" step="0.25"></label>
      <label><input name="galChineseOutline" type="checkbox">开启中文描边</label>
      <div class="tomoyo-cn-grid"><label>中文描边颜色<input name="galChineseOutlineColor" type="color"></label><label>中文描边粗细<input name="galChineseOutlineWidth" type="number" min="0" max="4" step="0.1"></label></div>
      <small>汉化字体按本机原始字形校正 Unicode 映射，缺字使用黑体补齐</small></details>`);
    // Same shape as the Japanese and translation sections: font first, then size, X | Y, colour | width; no hint line.
    rubyMenu.querySelector('summary').after(group.querySelector('[name=galRubyFont]').closest('label'));
    const f = name => form.elements.namedItem(name);
    f('galStyle').closest('label').hidden=true;
    f('galShadow').closest('label').hidden=true;
    const additional = { textGradient:'galTextGradient',readTextGradient:'galReadTextGradient',textGradientTop:'galTextGradientTop',textGradientBottom:'galTextGradientBottom',readTextGradientTop:'galReadTextGradientTop',readTextGradientBottom:'galReadTextGradientBottom',textGradientStart:'galTextGradientStart',readTextGradientStart:'galReadTextGradientStart',typewriter:'galTypewriter',typewriterSpeed:'galTypewriterSpeed', japaneseFont:'galJapaneseFont', chineseFont:'galChineseFont', rubyFont:'galRubyFont', japaneseOutline:'galJapaneseOutline', chineseOutline:'galChineseOutline', japaneseOutlineColor:'galJapaneseOutlineColor', chineseOutlineColor:'galChineseOutlineColor', japaneseOutlineWidth:'galJapaneseOutlineWidth', rubyOutline:'galRubyOutline', rubyOutlineColor:'galRubyOutlineColor', rubyOutlineWidth:'galRubyOutlineWidth', chineseOutlineWidth:'galChineseOutlineWidth', style:'galStyle', display:'galDisplay', translationSize:'galChineseSize', textColor:'galTextColor', shadow:'galShadow', autoScale:'galAutoScale', lineHeight:'galLineHeight', japaneseSpacingPx:'galJapaneseSpacingPx', chineseSpacingPx:'galChineseSpacingPx', rubyScale:'galRubyScale',rubyOffsetX:'galRubyOffsetX',rubyOffsetY:'galRubyOffsetY', gap:'galGap', translationWidth:'galTranslationWidth', paddingX:'galPaddingX', paddingY:'galPaddingY', autoGameStyle:'galAutoGameStyle', maskColor:'galMaskColor', maskMode:'galMaskMode', scanX:'galScanX', scanY:'galScanY', scanWidth:'galScanWidth', scanHeight:'galScanHeight', blurRadius:'galBlurRadius', maskPadding:'galMaskPadding', fastMask:'galFastMask', maskStyle:'galMaskStyle', japaneseBold:'galJapaneseBold', chineseBold:'galChineseBold' };
    additional.livePosition='galLivePosition';additional.relocateWaitMarker='galRelocateWaitMarker';additional.hideWaitMarker='galHideWaitMarker';const waitState=document.createElement('div');waitState.className='tomoyo-mask-state';waitState.setAttribute('data-gal-wait-state','');waitState.textContent='两个开关互不影响：迁移＝在 ToMe 日文句末显示原等待符；隐藏＝遮住游戏里的原等待符。固定在角落的等待符可以只隐藏，或都关掉';f('galHideWaitMarker').closest('label').after(waitState);
    for (const [key,name] of Object.entries(additional)) {
      if (typeof defaults[key] === 'boolean') f(name).checked = preferences[key];
      else f(name).value = preferences[key];
    }
    f('galReadTextColor').value = preferences.readTextColor || preferences.textColor;
    let committed = { ...preferences };
    commitSynchronizedStyle=changed=>Object.assign(committed,changed);
    const colorHistoryKey='tome-previous-text-color';
    let previousColor=localStorage.getItem(colorHistoryKey)||'';
    if(!/^#[0-9a-f]{6}$/i.test(previousColor))previousColor='';
    const colorUndo=document.createElement('button');colorUndo.type='button';colorUndo.setAttribute('data-gal-color-undo','');colorUndo.textContent='恢复上一个颜色';colorUndo.disabled=!previousColor;
    f('galTextColor').closest('label').append(colorUndo);
    colorUndo.onclick=()=>{if(!previousColor)return;f('galTextColor').value=previousColor;f('galTextColor').dispatchEvent(new Event('input',{bubbles:true}));};
    f('galFurigana').checked = preferences.furigana; f('galJapaneseSize').value = preferences.japaneseSize;
    for (const [key, name] of Object.entries({ x: 'galX', y: 'galY', width: 'galWidth', height: 'galHeight' })) f(name).value = preferences[key];
    const sliderOutputs = [];
    for(const input of group.querySelectorAll('input[type=number]')){
      const output=document.createElement('output');output.className='tomoyo-slider-value';output.htmlFor=input.name;
      input.type='range';
      if(/gal(X|Y|Width|Height|ScanX|ScanY|ScanWidth|ScanHeight)$/.test(input.name))input.step='0.1';
      else if(!input.hasAttribute('step'))input.step='1';
      input.insertAdjacentElement('beforebegin',output);
      const update=()=>{output.value=input.value;output.textContent=input.value;};
      input.addEventListener('input',update);sliderOutputs.push(update);update();
    }
    f('galPreset').onchange = () => {
      const presets = { bottom:{galX:4,galY:70,galWidth:92,galHeight:27}, full:{galX:5,galY:5,galWidth:90,galHeight:90}, top:{galX:4,galY:3,galWidth:92,galHeight:27} };
      const preset = presets[f('galPreset').value];
      if(preset)for(const [name,value] of Object.entries(preset))f(name).value=value;
      for(const update of sliderOutputs)update();
    };
    dialogFields = { game: f('galGame'), state: group.querySelector('.tomoyo-gal-state'), maskState: group.querySelector('.tomoyo-mask-state:not([data-gal-wait-state])'),hookState:group.querySelector('.tomoyo-hook-state'),waitMarkerState:group.querySelector('[data-gal-wait-state]'),hookThreads:f('galHookThread') };
    bridge.galStatus({hookMessage:bridge.hookMessage||'选择 Hook 后会检查本地组件；尚未选择对话流时不会清空文字',hookThreads:bridge.hookThreads||[]});
    group.querySelector('[data-gal-hook-select]').onclick=()=>send({type:'hookSelect',id:f('galHookThread').value});
    dialogFields.maskState.textContent = bridge.maskMessage || '局部遮字会在绑定游戏并收到原文后启动';
    const current = () => appearance.clean({ ...preferences, readTextColor: f('galReadTextColor').value.toLowerCase() === f('galTextColor').value.toLowerCase() ? '' : f('galReadTextColor').value, furigana: f('galFurigana').checked, japaneseSize: Number(f('galJapaneseSize').value),
      x: Number(f('galX').value), y: Number(f('galY').value), width: Number(f('galWidth').value), height: Number(f('galHeight').value),
      ...Object.fromEntries(Object.entries(additional).map(([key,name]) => [key, typeof defaults[key] === 'boolean' ? f(name).checked : f(name).value])) });
    const save = event => { if(bridge.gameStyleCommitReady?.()===false){event?.preventDefault();event?.stopImmediatePropagation();return;}preferences = current();if(event?.type==='submit'&&dialog.dataset.menuTab==='calibrate'&&bridge.saveGameProfileFromMenu){event.preventDefault();event.stopImmediatePropagation();bridge.saveGameProfileFromMenu(preferences);return;} if(preferences.textColor.toLowerCase()!==committed.textColor.toLowerCase()){previousColor=committed.textColor;localStorage.setItem(colorHistoryKey,previousColor);colorUndo.disabled=false;} committed = { ...preferences }; localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences)); send({ type: 'galConfigure', settings: preferences }); bridge.saveGameProfileFromMenu?.(preferences); apply(); };
    const updateMaskForm = () => { group.querySelector('[data-gal-full-color]').hidden = f('galMaskMode').value !== 'full';group.querySelector('[data-gal-hook-options]').hidden=f('galMaskMode').value!=='hook'; };
    updateMaskForm();
    let previewFrame=0;
    const preview = () => { if(syncingForm)return;preferences = current(); updateMaskForm(); apply(); if(bound&&!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;send({type:'galPreview',settings:preferences});}); };
    group.addEventListener('input', preview);
    group.addEventListener('change', preview);
    group.querySelector('[data-gal-refresh]').onclick = () => send({ type: 'galWindows' });
    group.querySelector('[data-gal-bind]').onclick = () => {
      if (!f('galGame').value) { dialogFields.state.textContent = '先刷新并选择游戏窗口'; return; }
      preferences = current(); preferences.bindEnabled = true;
      committed = { ...preferences };
      localStorage.setItem('tomoyo-gal-settings', JSON.stringify(preferences));
      send({ type: 'galBind', hwnd: f('galGame').value, settings: preferences });
    };
    group.querySelector('[data-gal-unbind]').onclick = () => { preferences.bindEnabled = false; send({ type: 'galUnbind' }); save(); };
    // Drag the text box with the mouse: first click starts, dragging moves it live, second click keeps the position.
    const dragButton = group.querySelector('[data-gal-drag]'), dragWords = {zh:['拖动文本框','确定位置'],en:['Drag text box','Confirm position'],ja:['テキスト枠をドラッグ','位置を確定']};
    const dragLabel = on => { const w = dragWords[(window.__tomeI18n?.get?.()||'zh').slice(0,2)] || dragWords.zh; dragButton.dataset.noI18n = ''; dragButton.textContent = w[on?1:0]; dragButton.classList.toggle('tome-dragging', on); };
    let dragStart = null, dragFrame = 0;
    const dragDown = e => { if (e.button !== 0 || e.target.closest('.tomoyo-cn-dialog')) return; e.preventDefault(); e.stopPropagation(); dragStart = { x:e.clientX, y:e.clientY, gx:Number(f('galX').value), gy:Number(f('galY').value) }; try { e.target.setPointerCapture(e.pointerId); } catch {} };
    const dragMove = e => { if (!dragStart) return; e.preventDefault(); e.stopPropagation(); const dpr = Math.max(.5, Number(window.devicePixelRatio)||1), cw = layoutInfo?.clientWidth||window.innerWidth*dpr, ch = layoutInfo?.clientHeight||window.innerHeight*dpr;
      f('galX').value = Math.round(Math.max(0, Math.min(95, dragStart.gx + (e.clientX-dragStart.x)*dpr*100/cw))*10)/10; f('galY').value = Math.round(Math.max(0, Math.min(95, dragStart.gy + (e.clientY-dragStart.y)*dpr*100/ch))*10)/10; if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; preview(); }); };
    const dragUp = e => { if (!dragStart) return; e.stopPropagation(); dragStart = null; };
    const dragMode = on => { document.body.classList.toggle('tome-box-dragging', on); dragLabel(on); for (const [type, fn] of [['pointerdown',dragDown],['pointermove',dragMove],['pointerup',dragUp]]) { if (on) window.addEventListener(type, fn, true); else window.removeEventListener(type, fn, true); } if (!on) dragStart = null; };
    dragButton.onclick = () => { const on = !document.body.classList.contains('tome-box-dragging'); dragMode(on); if (!on) save(); };
    dragLabel(false); dialog.addEventListener('close', () => dragMode(false), { once:true });
    form.addEventListener('submit', save, true);
    dialog.addEventListener('close', () => { if(previewFrame){cancelAnimationFrame(previewFrame);previewFrame=0;}preferences = {...committed,interfaceMode:preferences.interfaceMode};dialogFields = null;commitSynchronizedStyle=null;if(bound)send({type:'galPreview',settings:preferences});setTimeout(()=>send({ type: 'galMenu', open: !!document.querySelector('.tomoyo-cn-dialog[open],.tome-backlog[data-open],.tomoyo-cn-dialog[data-leaving],.tome-backlog[data-leaving]') }),340);apply(); }, { once: true });
    send({ type: 'galWindows' }); send({ type: 'galMenu', open: true });
  };
  let lastMenuToggle = 0;
  bridge.toggleGalMenu = () => {
    if(Date.now()-lastMenuToggle<180)return;
    lastMenuToggle=Date.now();
    const dialog = document.querySelector('.tomoyo-cn-dialog:not([data-leaving])');
    if (dialog?.open) dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    else bridge.openSettings();
  };
  new MutationObserver(records => {
    if (records.every(record => (record.target.nodeType === 3 ? record.target.parentElement : record.target)?.closest?.('.tomoyo-cn-dialog,.tomoyo-cn-row'))) return;
    clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { markReader(); alignText(); updateRuby(); }, 100);
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.addEventListener('resize', apply);document.fonts?.ready.then(()=>updateRuby());document.fonts?.addEventListener('loadingdone',()=>updateRuby());
  send({ type: 'loadGalPreferences' });
  apply();
})();
