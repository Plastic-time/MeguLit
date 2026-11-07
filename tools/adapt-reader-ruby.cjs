// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

function replace(text, from, to) {
 if(!text.includes(from))throw Error('Missing reader ruby anchor: '+from.slice(0,80));
 return text.replace(from,to);
}

function layout(text) {
 // Preserve the centre of the base glyphs. Crowding may shrink the ruby, but
 // cannot move it over a different word, even at the start or end of a line.
 const start=text.indexOf('    // At the start or end of a line');
 const end=text.indexOf('    const bad=',start);
 if(start<0||end<0)throw Error('Missing ruby line layout');
 return text.slice(0,start)+'    const x=live.map((it,i)=>(it.left+it.right-w[i])/2);\n'+text.slice(end);
}

function gal(text) {
 text=replace(text,'name="galRubyOffsetY" type="number" min="-40" max="40"','name="galRubyOffsetY" type="number" min="-100" max="100"'); /* E254 */
 text=replace(text,'name="galLineHeight" type="number" min="-1.9" max="1.9"','name="galLineHeight" type="number" min="-1.9" max="4"');
 text=replace(text,'name="galTranslationLineHeight" type="number" min="-0.8" max="1.5"','name="galTranslationLineHeight" type="number" min="-0.8" max="3"');
 // E253 (user: kanji and kana crowd each other, 7-8 reports): an outline grows every glyph by its width on both sides,
 // eating 2x the outline from each gap. Give that space back so heavy fonts with outlines never touch.
 text=replace(text,"root.setProperty('--tomoyo-gal-jp-spacing',scaled(Math.max(-preferences.japaneseSize*.45,preferences.japaneseSpacingPx)));",
  "root.setProperty('--tomoyo-gal-jp-spacing',scaled(Math.max(-preferences.japaneseSize*.45,preferences.japaneseSpacingPx)+(preferences.japaneseOutline?2*(Number(preferences.japaneseOutlineWidth)||0):0)));");
 // An outline in the text's own colour cannot be seen; it only thickens the glyphs. Skip it.
 text=replace(text,"root.setProperty('--tomoyo-jp-outline',appearance.outlineFor(preferences.japaneseOutline,",
  "root.setProperty('--tomoyo-jp-outline',appearance.outlineFor(preferences.japaneseOutline&&String(preferences.japaneseOutlineColor||'').toLowerCase()!==String(preferences.textColor||'').toLowerCase(),");
 text=replace(text,"root.setProperty('--tomoyo-gal-cn-spacing',scaled(Math.max(-preferences.translationSize*.45,preferences.chineseSpacingPx)));",
  "root.setProperty('--tomoyo-gal-cn-spacing',scaled(Math.max(-preferences.translationSize*.45,preferences.chineseSpacingPx)+(preferences.chineseOutline?2*(Number(preferences.chineseOutlineWidth)||0):0)));");
 text=replace(text,
  '.sentence-text.tomoyo-furigana { line-height:var(--tomoyo-gal-ruby-line-height,2.55)!important; padding-top:.55em; }',
  `.sentence-window .sentence-text.tomoyo-furigana {
      --megulit-ruby-line:var(--tomoyo-gal-ruby-line-height,2.55);
      line-height:calc(var(--megulit-ruby-line) * 1em)!important;
      padding-top:.55em;
    }
    body.tomoyo-game-style .sentence-window .sentence-text.tomoyo-furigana { margin-bottom:calc((2.55 - var(--megulit-ruby-line)) * .5em)!important; }
    body .sentence-window.tomoyo-cn-active .sentence-text,body.tomoyo-gal-bound .sentence-window .sentence-text { padding-left:max(0px,calc(var(--tomoyo-jp-indent,0px) + var(--megulit-jp-hang,0px)))!important; text-indent:calc(var(--tomoyo-jp-indent,0px) - max(0px,calc(var(--tomoyo-jp-indent,0px) + var(--megulit-jp-hang,0px))))!important; }
    .megulit-ruby-rows { grid-column:1/-1; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:6px 10px; margin-top:2px; }
    .megulit-ruby-rows-title { font-size:12px; opacity:.8; }
    .megulit-ruby-rows-chips { display:flex; flex-wrap:wrap; gap:4px; }
    .megulit-ruby-rows .megulit-ruby-row-chip, .megulit-ruby-rows .megulit-ruby-row-chip::before, .megulit-ruby-rows .megulit-ruby-row-chip::after { all:unset; box-sizing:border-box; } /* E269 global button styles (icon cell, padding) shifted the label off its highlight */
    .megulit-ruby-rows .megulit-ruby-row-chip { display:inline-flex!important; align-items:center; justify-content:center; text-align:center; min-width:24px; height:22px; padding:0 6px; border-radius:6px; border:1px solid #ffffff26; background:transparent; color:inherit; font:600 11px/1 ui-monospace,monospace; cursor:pointer; transition:background-color .15s,border-color .15s,transform .1s; }
    .megulit-ruby-rows .megulit-ruby-row-chip:active { transform:scale(.96); }
    .megulit-ruby-rows .megulit-ruby-row-chip.is-set { border-color:#c8303c99; }
    .megulit-ruby-rows .megulit-ruby-row-chip.is-on { background:#c8303c; border-color:#c8303c; color:#fff; }
    .megulit-ruby-rows .megulit-ruby-row-chip:focus-visible { outline:2px solid #c8303c; outline-offset:2px; }
    .megulit-ruby-rows-value { font:11px ui-monospace,monospace; color:#c8303c; min-width:3ch; text-align:right; }
    .megulit-ruby-rows-slider { grid-column:1/-1; width:100%; }
    body.tomoyo-game-style .sentence-window .sentence-text:not(.tomoyo-furigana) { margin-top:calc((1.95 - var(--tomoyo-gal-line-height,1.95)) * .5em)!important; margin-bottom:calc((1.95 - var(--tomoyo-gal-line-height,1.95)) * .5em)!important; }`);
 /* E260 (user: rows after the first start left of the text): a line opening with 「 hangs the bracket; later rows align with the first character after it */
 text=replace(text,`        if(Number.isFinite(left))document.documentElement.style.setProperty('--tomoyo-'+name+'-indent',Math.max(-60,Math.min(5,left))+'px');`,`        if(Number.isFinite(left))document.documentElement.style.setProperty('--tomoyo-'+name+'-indent',Math.max(-60,Math.min(5,left))+'px');
        if(name==='jp'){const open=japanese&&/^[「『（“‘〈《【(]$/.test(japanese.textContent.trim());document.documentElement.style.setProperty('--megulit-jp-hang',open?japanese.getBoundingClientRect().width+'px':'0px');}`);

 /* E264 (user: one Y offset moves every row; give each row its own, without a wall of sliders): a row picker sized to the rows this game has shown, and one slider for the picked row. */
 text=replace(text,"root.setProperty('--tomoyo-ruby-offset-y',scaled(preferences.rubyOffsetY));","root.setProperty('--tomoyo-ruby-offset-y',scaled(preferences.rubyOffsetY));root.setProperty('--megulit-ruby-unit',scaled(1));");
 text=replace(text,"rubyOffsetY:'galRubyOffsetY',","rubyOffsetY:'galRubyOffsetY',rubyRowOffsets:'galRubyRowOffsets',");
 text=replace(text,'<label>假名垂直位置 Y（下＋，px）<input name="galRubyOffsetY" type="number" min="-100" max="100" step="0.5"></label>','<label>假名垂直位置 Y（下＋，px）<input name="galRubyOffsetY" type="number" min="-100" max="100" step="0.5"></label><div class="megulit-ruby-rows" data-ruby-rows><span class="megulit-ruby-rows-title">按行微调 Y</span><div class="megulit-ruby-rows-chips" role="tablist"></div><output class="megulit-ruby-rows-value">0</output><input type="range" class="megulit-ruby-rows-slider" min="-60" max="60" step="0.5" value="0" aria-label="所选行的假名垂直位置"><input type="hidden" name="galRubyRowOffsets"></div>');
 text=replace(text,"    let committed = { ...preferences };","    {const box=group.querySelector('[data-ruby-rows]');if(box){const chips=box.querySelector('.megulit-ruby-rows-chips'),slider=box.querySelector('.megulit-ruby-rows-slider'),out=box.querySelector('.megulit-ruby-rows-value'),hidden=f('galRubyRowOffsets');let pick=0;\n      const values=()=>String(hidden.value||'').split(',').map(n=>Number(n)||0);\n      const draw=()=>{const v=values(),n=Math.max(2,Math.min(16,window.__megulitRubyRows||2,16),v.length);chips.textContent='';for(let i=0;i<n;i++){const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.className='megulit-ruby-row-chip'+(i===pick?' is-on':'')+(v[i]?' is-set':'');b.textContent=String(i+1);b.title='第 '+(i+1)+' 行'+(v[i]?'：'+v[i]+'px':'');b.onclick=()=>{pick=i;draw();};chips.append(b);}slider.value=String(v[pick]||0);out.textContent=String(v[pick]||0);};\n      slider.addEventListener('input',e=>{e.stopPropagation();const v=values();while(v.length<=pick)v.push(0);v[pick]=Number(slider.value);while(v.length&&!v[v.length-1])v.pop();hidden.value=v.join(',');out.textContent=slider.value;hidden.dispatchEvent(new Event('input',{bubbles:true}));draw();});\n      slider.addEventListener('dblclick',()=>{slider.value='0';slider.dispatchEvent(new Event('input'));});\n      addEventListener('megulit-ruby-rows',draw);draw();}}\n    let committed = { ...preferences };");
 text=text.replaceAll('.char-token[data-tomoyo-reading]','.megulit-ruby-base[data-tomoyo-reading]');
 text=replace(text,'.sentence-text .megulit-ruby-base[data-tomoyo-reading] { position:relative; }',
  `.sentence-text .megulit-ruby-base { position:relative;display:inline-block;white-space:nowrap;vertical-align:baseline;padding-right:var(--megulit-ruby-trailing-space,0px);text-indent:0!important; } /* E259: the sentence's hanging indent (text-indent:-17px for 「) was inherited by every inline-block base and shifted its kanji left over the previous glyph: the real cause of kana/kanji overlap */ /* E257: an inline-block drops the letter-spacing after its last glyph, so the next glyph overlapped; give it back */
    .sentence-text .megulit-ruby-base::before { transition:opacity 70ms linear; }
    .sentence-text .megulit-ruby-base:has(> .tome-typewriter-pending:first-child)::before { opacity:0;transition:none; }
    @media (prefers-reduced-motion:reduce) { .sentence-text .megulit-ruby-base::before { transition:none; } }`);
 text=replace(text,'var(--tomoyo-ruby-width,1em)/2 + var(--tomoyo-ruby-offset-x,0px) + var(--tomoyo-ruby-shift,0px)',
  '50% - var(--megulit-ruby-trailing-space,0px)/2 + var(--tomoyo-ruby-offset-x,0px)');
 text=replace(text,'pointer-events:none; letter-spacing:0; text-shadow:var(--tomoyo-gal-shadow,0 1px 2px #000e);',
  'pointer-events:none; letter-spacing:var(--megulit-ruby-letter-spacing,0em); margin-left:calc(var(--megulit-ruby-letter-spacing,0em)/2); text-shadow:var(--tomoyo-gal-shadow,0 1px 2px #000e);');
 text=replace(text,'bottom:calc(100% + .13em - var(--tomoyo-ruby-offset-y,0px)); transform:translateX(-50%);',
  'top:calc(var(--megulit-ruby-top,0px) - var(--megulit-ruby-lift,calc(.22em - var(--tomoyo-ruby-offset-y,0px)))); transform:translate(-50%,-100%);');
 text=replace(text,'    .sentence-text .char-token[data-tomoyo-leading-space]',
  `    body.tomoyo-gal-bound .sentence-window .sentence-text[data-megulit-native-breaks] { white-space:pre!important; }
    .sentence-text .char-token[data-tomoyo-leading-space]`);
 text=replace(text,"lastText = '', lastTokens = [], bound = false","lastText = '', bound = false");
 const lineStart=text.indexOf('  async function updateLineRuby()'),lineEnd=text.indexOf('  function markReader()',lineStart);
 if(lineStart<0||lineEnd<0)throw Error('Missing line ruby update');
 text=text.slice(0,lineStart)+`  async function updateLineRuby() {
    const sentence=document.querySelector('.sentence-text'),text=sourceText(sentence),id=++renderSerial;
    if(!preferences.furigana||!text){paint([],sentence);return;}
    preserveNativeBreaks(sentence,text);
    if(text!==lastText)clearRuby(sentence);
    const current=()=>id===renderSerial&&preferences.furigana&&document.querySelector('.sentence-text')===sentence&&sourceText(sentence)===text;
    try {
      const tokens=await rubyTokens(text);
      if(current()){lastText=text;paint(tokens,sentence);}
    } catch(error) {
      if(!current())return;
      clearRuby(sentence);bridge.learningStatus?.({learningMessage:error.message||'Furigana unavailable'});
      if(dialogFields)dialogFields.state.textContent=error.message||'Furigana unavailable';
    }
  }
`+text.slice(lineEnd);
 const start=text.indexOf('  function clearRuby('),end=text.indexOf('  async function updateRuby()',start);
 if(start<0||end<0)throw Error('Missing ruby paint functions');
 return text.slice(0,start)+`  function clearRuby(scope=document) {
    for(const base of scope.querySelectorAll('.megulit-ruby-base'))base.replaceWith(...base.childNodes);
  }
  function rubyTargets() {
    const page=[...document.querySelectorAll('.tome-island-page .sentence-text')];
    if(page.length)return page;
    const one=document.querySelector('.sentence-text');return one?[one]:[];
  }
  function paint(tokens,sentence=document.querySelector('.sentence-text'),all=true) {
    if(!sentence){if(all)clearRuby();return;}
    sentence.classList.toggle('tomoyo-furigana',!!preferences.furigana);
    sentence.style.setProperty('--tomoyo-ruby-scale',preferences.rubyScale+'em');
    const chars=[...sentence.querySelectorAll('.char-token')],text=sourceText(sentence);
    preserveNativeBreaks(sentence,text);
    if(!preferences.furigana){clearRuby(all?document:sentence);return;}
    const annotations=window.TomoyoFurigana.withGameRuby(text,window.TomoyoFurigana.annotations(text,tokens),bridge.gameRuby)
      .filter(({start,end})=>chars[start]&&chars[end-1]&&!chars.slice(start,end).some(n=>n.textContent.includes('\\n')));
    const key=JSON.stringify(annotations),bases=()=>[...sentence.querySelectorAll('.megulit-ruby-base')];
    if(sentence.__megulitRubyBases!==key||bases().length!==annotations.length){
      clearRuby(sentence);sentence.__megulitRubyBases=key;
      for(const annotation of annotations){
        const nodes=chars.slice(annotation.start,annotation.end),first=nodes[0];
        if(nodes.some((n,i)=>i>0&&nodes[i-1].nextSibling!==n))continue;
        const base=document.createElement('span');
        base.className='megulit-ruby-base';base.__megulitReading=annotation.reading;
        first.before(base);base.append(...nodes);
      }
    }
    const canvas=document.createElement('canvas').getContext('2d');
    const root=getComputedStyle(document.documentElement),family=root.getPropertyValue('--tomoyo-ruby-font').trim()||'Meiryo';
    const offset=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-x'))||0,items=[];
    const yOffset=parseFloat(root.getPropertyValue('--tomoyo-ruby-offset-y'))||0;
    const sentenceStyle=getComputedStyle(sentence);
    const stroke=name=>parseFloat(sentenceStyle.getPropertyValue(name))||0;
    const baseStroke=Math.max(stroke('--tomoyo-jp-stroke'),stroke('--tomoyo-gal-jp-stroke'));
    const rubyStroke=stroke('--tomoyo-ruby-stroke'),strokeGap=(baseStroke+rubyStroke)/2;
    const minGap=3+strokeGap+Math.max(0,Math.min(2,stroke('--tomoyo-gal-jp-spacing')/4));
    const travel=5;
    // Every row keeps its readings (E215.1, user: wrapped rows lost all furigana at a tight line spacing). Tighter
    // Japanese line spacing still tightens, down to the room one readable reading needs between rows.
    {const em=parseFloat(sentenceStyle.fontSize)||16,minRuby=Math.max(8,em*preferences.rubyScale*.5);
     sentence.style.setProperty('--megulit-ruby-floor',Math.ceil(em*1.08+minRuby+2*minGap+travel)+'px');}
    // The glyph's em box excludes the leading in its line box.
    const rows=[];
    for(const char of chars){
      if(!char.textContent.trim())continue;
      const r=char.getBoundingClientRect();if(!r.width||!r.height)continue;
      const size=parseFloat(getComputedStyle(char).fontSize)||16;
      const em=size*(r.height/(char.offsetHeight||r.height)),bottom=(r.top+r.bottom+em)/2;
      const row=rows.find(r0=>Math.abs(r0.top-r.top)<2);
      if(row)row.bottom=Math.max(row.bottom,bottom);else rows.push({top:r.top,bottom});
    }
    rows.sort((a,b)=>a.top-b.top);
    for(const node of bases()){
      const first=node.firstElementChild,style=getComputedStyle(first),rect=node.getBoundingClientRect(),glyph=first.getBoundingClientRect();
      const baseFont=parseFloat(style.fontSize)||16;
      const trailing=parseFloat(style.letterSpacing)||0,scale=rect.width/(node.offsetWidth||1)||1;
      const spacing=Math.max(-.08,trailing/baseFont),reading=node.__megulitReading;
      node.style.setProperty('--megulit-ruby-trailing-space',trailing+'px');
      node.style.setProperty('--megulit-ruby-letter-spacing',spacing+'em');
      const scaleY=rect.height/(node.offsetHeight||1)||1,boxTop=(glyph.top+glyph.bottom)/2-baseFont*scaleY*.58;
      // The reading sits above the kanji's full em box: Japanese kanji ink nearly fills it, so anchoring on the estimated
      // ink top left readings touching their kanji (user, E215.3).
      node.style.setProperty('--megulit-ruby-top',(boxTop-rect.top)/scaleY+'px');
      const previous=rows.findLast(row=>row.top<glyph.top-2);
      // Keep the Y offset independent of line height and constrain it to the space between the outlined glyphs.
      const space=previous?(boxTop-previous.bottom)/scaleY:Infinity;
      const font=Math.max(6,baseFont*preferences.rubyScale); /* E256: the user sets the size; no auto shrink */
      const maxLift=Math.max(minGap,space-minGap-font);
      const rest=Math.min(Math.max(minGap+travel,baseFont*.22),maxLift);
      const rowIndex=Math.max(0,rows.findIndex(r0=>Math.abs(r0.top-glyph.top)<2)),rowOffset=(Number(String(preferences.rubyRowOffsets||'').split(',')[rowIndex])||0)*(parseFloat(root.getPropertyValue('--megulit-ruby-unit'))||1);
      const lift=rest-yOffset-rowOffset; /* E255 free ±100; E264 plus this row's own offset */
      node.style.setProperty('--megulit-ruby-lift',lift+'px');
      canvas.font=font+'px '+family;
      items.push({node,reading,left:rect.left+offset*scale,right:rect.right+(offset-trailing)*scale,
        top:glyph.top,font,width:(canvas.measureText(reading).width+([...reading].length-1)*spacing*font)*scale,
        limitLeft:0,limitRight:window.innerWidth,priority:node.childElementCount});
    }
    // One reading size for the whole sentence (user: 一样大最好): the smallest that fits any of its rows.
    const common=Math.min(...items.map(i=>i.font));for(const i of items){i.width*=common/i.font;i.font=common;}
    {const n=Math.min(16,rows.length);if(n>(window.__megulitRubyRows||0)){window.__megulitRubyRows=n;dispatchEvent(new Event('megulit-ruby-rows'));}}
    for(const item of window.TomoyoRubyLayout.layout(items,{minFont:1e9})){
      if(!item.visible){item.node.removeAttribute('data-tomoyo-reading');continue;}
      item.node.setAttribute('data-tomoyo-reading',item.reading);
      item.node.style.setProperty('--tomoyo-ruby-actual-size',item.font+'px');
    }
  }
  // Preserve the authored rows even when their rendered extent crosses the game client.
  function preserveNativeBreaks(sentence,text){
    sentence.toggleAttribute('data-megulit-native-breaks',text.includes('\\n'));
  }
`+text.slice(end);
}

function islandPage(text) {
 text=replace(text,'.char-token[data-tomoyo-reading]','.megulit-ruby-base[data-tomoyo-reading]');
 const layout=text.indexOf(' // Keep original blank space where possible'),install=text.indexOf(' // Injected at document start',layout);
 if(layout<0||install<0)throw Error('Missing ISLAND page fit');
 text=text.slice(0,layout)+text.slice(install);
 text=replace(text,'return {Page,arrange,token,install}','return {Page,token,install}');
 text=replace(text,'const readOnly=p.hookHide===false,items=[];','const readOnly=p.hookHide===false;');
 text=replace(text,'Math.max(size*2,Math.min(cw,width+size*.6))','Math.max(size*2,width+size*.6)');
 text=replace(text,'if(centered){width=Math.min(cw-24,Math.max(width,cw*.7));x=ox+(cw-width)/2;}','');
 text=replace(text,'text-align:var(--tome-island-align,left)!important}\nbody.tomoyo-gal-bound .tome-island-pair .tomoyo-cn-output',
  'text-align:left!important}\nbody.tomoyo-gal-bound .tome-island-pair .tomoyo-cn-output');
 text=replace(text,'Math.max(width,Math.min(cw*share/100,ox+cw-x-16))','Math.max(width,cw*share/100)');
 text=replace(text,"never past the game's right edge and never narrower than the Japanese.","never narrower than the Japanese.");
 const stack=text.indexOf('// Furigana needs its own band above'),regions=text.indexOf('   w.__tomoyoHitRegionsRefresh?.();}',stack);
 if(stack<0||regions<0)throw Error('Missing ISLAND page stacking');
 text=text.slice(0,stack)+'}\n'+text.slice(regions);
 // Ruby may wrap the tokens while preparation is pending. Reveal the original
 // character nodes so the pending class is cleared on every glyph.
 text=replace(text,'function revealWithRuby(jp){const chars=[...jp.children];',
  "function revealWithRuby(jp){const chars=[...jp.querySelectorAll('.char-token')];");
 text=replace(text,'w.TomeTypewriter?.reveal(jp,[...jp.children],{instant:false})',
  'w.TomeTypewriter?.reveal(jp,chars,{instant:false})');
 return replace(text,'line-height:var(--tomoyo-gal-ruby-line-height,2.55)!important;margin-top:-.3em!important',
  'line-height:max(calc(var(--megulit-ruby-line) * 1em),var(--megulit-ruby-floor,0px))!important;margin-top:-.3em!important');
}


// The game's own ruby keeps its script (E215.4, user: 運命石の扉 is glossed シュタインズ・ゲート in katakana by the game).
// A katakana reading is shown as written, once over the whole word; hiragana readings split by okurigana as before.
function furigana(text) {
 text=replace(text,"const word = [...base], reading = kana(dict[base]);if (!word.length || !reading) continue;",
  "const word = [...base], raw = String(dict[base] || ''), reading = kana(raw);if (!word.length || !reading) continue;");
 return replace(text,"for (const part of splitReading(base, reading)) extra.push({ start: i + part.start, end: i + part.end, reading: part.reading, game: true });",
  "if (/[\\u30a1-\\u30fa]/.test(raw)) extra.push({ start: i, end: i + word.length, reading: raw, game: true });\n        else for (const part of splitReading(base, reading)) extra.push({ start: i + part.start, end: i + part.end, reading: part.reading, game: true });");
}
module.exports={gal,layout,islandPage,furigana};
