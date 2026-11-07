(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TomoyoGameStyle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const defaults = Object.freeze({
    typewriter:true,typewriterSpeed:35, layoutVersion: 22, style: 'classic', display: 'bilingual', furigana: true, japaneseSize: 34,
    translationSize: 30, rubyScale: .55, rubyOffsetX:0, rubyOffsetY:0, lineHeight: 0, lineHeightMode:'offset', japaneseSpacing:0, japaneseSpacingPx:0,chineseSpacingPx:0, gap: 6, translationWidth: 75,
    paddingX: 20, paddingY: 10, textColor: '#fffaf2', readTextColor: '', textGradient:false, textGradientTop:'#fffaf2', textGradientBottom:'#a8c8ff', readTextGradient:false, readTextGradientTop:'#b0e2ff', readTextGradientBottom:'#639bd1', textGradientStart:0, readTextGradientStart:0, shadow: 'outline', autoScale: true,
    bindEnabled: false, interfaceMode:'normal', gameProcess: 'BGI', x: 4, y: 70, width: 92, height: 27,
    autoGameStyle:true, livePosition:false, hookProfile:'read', hookAutoStart:true, hookHide:true, hookFast:true, mask: false, maskMode: 'hook', maskColor: '#171923',
    scanX: 2, scanY: 60, scanWidth: 96, scanHeight: 38, blurRadius: 13, maskPadding: 6, fastMask:true,
    maskVersion:26, maskStyle:'blend', japaneseBold:false, chineseBold:false,
    hideWaitMarker:true,relocateWaitMarker:true,waitCoverStyle:'frame',
    japaneseFont:'originalGothic', chineseFont:'patch', rubyFont:'round',
    japaneseOutline:true, chineseOutline:true, japaneseOutlineColor:'#ffffff', chineseOutlineColor:'#ffffff', rubyOutline:true, rubyOutlineColor:'#ffffff', rubyOutlineWidth:.45,
    japaneseOutlineWidth:1, chineseOutlineWidth:1
  });
  const ranges = { typewriterSpeed:[5,120], japaneseSize:[14,60], translationSize:[12,60], rubyScale:[.2,.85], rubyOffsetX:[-40,40],rubyOffsetY:[-40,40],
    lineHeight:[-1.9,1.9], japaneseSpacing:[-.05,.5],japaneseSpacingPx:[-15,25],chineseSpacingPx:[-15,25], gap:[-28,40], translationWidth:[0,100], paddingX:[-40,80], paddingY:[-40,60],
    x:[0,95], y:[0,95], width:[20,100], height:[10,90],
    scanX:[0,95], scanY:[0,95], scanWidth:[5,100], scanHeight:[5,100], blurRadius:[5,30], maskPadding:[0,10],japaneseOutlineWidth:[0,4],chineseOutlineWidth:[0,4],rubyOutlineWidth:[0,2] };
  function clean(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    // Signed em adjustment from the old 1.95 baseline. Migrate old ratios exactly once.
    if(value.lineHeightMode!=='offset'&&Number(value.lineHeight)>=0&&Number.isFinite(Number(value.lineHeight))&&value.lineHeight!=null&&value.lineHeight!=='')value={...value,lineHeight:Number(value.lineHeight)-1.95};
    const result = { ...defaults };
    for (const [key, [min,max]] of Object.entries(ranges)) {
      const number = value[key] === '' || value[key] == null ? NaN : Number(value[key]);
      if (Number.isFinite(number)) result[key] = Math.max(min, Math.min(max, number));
    }
    for (const key of ['typewriter','furigana','autoScale','fastMask','hideWaitMarker','relocateWaitMarker']) result[key] = value[key] !== false;
    for(const key of ['textGradient','readTextGradient'])result[key]=value[key]===true;
    // Where the top colour starts turning into the bottom colour, as % of the line height (0 = from the top).
    for(const key of ['textGradientStart','readTextGradientStart'])if(Number.isFinite(Number(value[key])))result[key]=Math.max(0,Math.min(95,Math.round(Number(value[key]))));
    for(const key of ['textGradientTop','textGradientBottom','readTextGradientTop','readTextGradientBottom'])if(/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key];
    result.bindEnabled = value.bindEnabled === true;
    result.autoGameStyle=value.autoGameStyle!==false;result.livePosition=value.livePosition===true;
    if(['read','euphoria474','embed','off'].includes(value.hookProfile))result.hookProfile=value.hookProfile;
    result.hookAutoStart=value.hookAutoStart!==false;result.hookFast=value.hookFast!==false;
    result.hookHide=value.hookHide!==false;
    result.interfaceMode=value.interfaceMode==='translation'?'translation':'normal';
    result.japaneseBold = value.japaneseBold === true;
    result.chineseBold = value.chineseBold === true;
    for(const key of ['japaneseOutline','chineseOutline'])result[key]=value[key]!==false;
    if(['originalGothic','originalMincho','yuMincho','yuGothic','meiryo'].includes(value.japaneseFont)||/^game:[0-9a-f]{10}$/.test(value.japaneseFont))result.japaneseFont=value.japaneseFont;
    if(['patch','simhei','yahei','simsun','kaiti'].includes(value.chineseFont)||/^game:[0-9a-f]{10}$/.test(value.chineseFont))result.chineseFont=value.chineseFont;
    if(['round','gothic','mincho','inherit','yuGothic','yuMincho','meiryo'].includes(value.rubyFont)||/^game:[0-9a-f]{10}$/.test(value.rubyFont))result.rubyFont=value.rubyFont;
    if(value.maskVersion!==26&&value.rubyFont==='gothic')result.rubyFont='round';
    if(value.japaneseSpacingPx==null&&Number.isFinite(Number(value.japaneseSpacing)))result.japaneseSpacingPx=Math.max(-15,Math.min(25,Number(value.japaneseSpacing)*result.japaneseSize));
    result.rubyOutline=value.rubyOutline!==false;for(const key of ['japaneseOutlineColor','chineseOutlineColor','rubyOutlineColor'])if(/^#[0-9a-f]{6}$/i.test(value[key]))result[key]=value[key];
    if(['blend','blur'].includes(value.maskStyle))result.maskStyle=value.maskStyle;
    if(['frame','blend'].includes(value.waitCoverStyle))result.waitCoverStyle=value.waitCoverStyle;
    if(value.maskVersion!==26)result.maskPadding=Math.max(6,result.maskPadding);
    if (['local','hook'].includes(value.maskMode)) result.maskMode = value.maskMode;
    result.mask = false;
    if (value.layoutVersion !== 22) {
      result.japaneseSize = Math.max(34, result.japaneseSize);
      result.translationSize = Math.max(30, result.translationSize);
    }
    for (const key of ['textColor','maskColor']) if (/^#[0-9a-f]{6}$/i.test(value[key])) result[key] = value[key];
    // Colour of lines the game marks as already read; empty = same as textColor.
    if (value.readTextColor === '' || /^#[0-9a-f]{6}$/i.test(value.readTextColor)) result.readTextColor = value.readTextColor;
    if (['classic','clean','custom'].includes(value.style)) result.style = value.style;
    if (['bilingual','japanese','chinese'].includes(value.display)) result.display = value.display;
    if (['outline','soft','none'].includes(value.shadow)) result.shadow = value.shadow;
    if (typeof value.gameProcess === 'string') result.gameProcess = value.gameProcess.slice(0,100);
    return result;
  }
  function paintFor(settings, read=false, engineColor='') {
    // An actual engine colour takes priority over a learned/manual gradient for that sentence.
    // ...unless the user set read and unread apart (or a gradient): then their own colours win (user, 2026-11-02).
    const own=settings.textGradient||settings.readTextGradient||!!settings.readTextColor&&String(settings.readTextColor).toLowerCase()!==String(settings.textColor).toLowerCase();
    if(settings.autoGameStyle!==false&&!own&&/^#[0-9a-f]{6}$/i.test(engineColor))return {color:engineColor,gradient:'none',fill:'currentColor'};
    const prefix=read?'readText':'text',on=settings[prefix+'Gradient'];
    return {color:read?(settings.readTextColor||settings.textColor):settings.textColor,
      gradient:on?'linear-gradient(to bottom, '+settings[prefix+'GradientTop']+' '+(Number(settings[prefix+'GradientStart'])||0)+'%, '+settings[prefix+'GradientBottom']+' 100%)':'none',fill:on?'transparent':'currentColor'};
  }
  function paintVariables(paint) {
    const gradient=paint.gradient!=='none';
    return {'--tomoyo-gal-color':paint.color,'--tomoyo-gal-gradient':paint.gradient,'--tomoyo-gal-fill':paint.fill,
      '--tomoyo-gal-jp-stroke':gradient?'0px':'var(--tomoyo-jp-stroke)',
      '--tomoyo-gal-cn-stroke':gradient?'0px':'var(--tomoyo-cn-stroke)',
      '--tomoyo-gal-jp-filter':gradient?'var(--tomoyo-gradient-jp-outline)':'none',
      '--tomoyo-gal-cn-filter':gradient?'var(--tomoyo-gradient-cn-outline)':'none'};
  }
  function lineHeightFor(settings, ruby=false) {
    return Math.max(.05, 1.95 + settings.lineHeight + (ruby ? .6 : 0));
  }
  function insets(settings, scale=1) {
    const x=settings.paddingX*scale,y=settings.paddingY*scale;
    return {padX:Math.max(0,x),padY:Math.max(0,y),outX:Math.min(0,x),outY:Math.min(0,y)};
  }
  function scaleForViewport(viewportWidth, settings, bound) {
    if (!bound || !settings.autoScale) return 1;
    const width = Number(viewportWidth);
    if (!Number.isFinite(width) || width <= 0) return 1;
    const scale=width / (settings.width / 100) / 1280;
    return settings.autoGameStyle!==false?Math.max(.05,Math.min(16,scale)):Math.max(.6,Math.min(2,scale));
  }
  const fonts = {
    classic: { ja:'"MS Mincho","ＭＳ 明朝","Yu Mincho","Noto Serif JP",serif', zh:'"TomoyoSubahibiCN","SubahibiFont","素晴字体","SimHei","Microsoft YaHei",sans-serif' },
    clean: { ja:'"MS Gothic","ＭＳ ゴシック","Yu Gothic","Meiryo",sans-serif', zh:'"TomoyoSubahibiCN","SubahibiFont","素晴字体","SimHei","Microsoft YaHei",sans-serif' }
  };
  const shadows = {
    outline:'-1px 0 0 #171721b3,1px 0 0 #171721b3,0 -1px 0 #171721b3,0 1px 0 #171721b3,0 2px 3px #0009',
    soft:'0 1px 3px #000c', none:'none'
  };
  const japaneseFonts={originalGothic:'"MS Gothic","ＭＳ ゴシック",sans-serif',originalMincho:'"MS Mincho","ＭＳ 明朝",serif',yuMincho:'"Yu Mincho",serif',yuGothic:'"Yu Gothic",sans-serif',meiryo:'Meiryo,sans-serif'};
  const chineseFonts={patch:fonts.classic.zh,simhei:'SimHei,sans-serif',yahei:'"Microsoft YaHei",sans-serif',simsun:'SimSun,serif',kaiti:'KaiTi,serif'};
  function outlineFor(enabled,color,width,dpr){
    if(!enabled||!(width>0))return 'none';
    // Crisp outline snapped to whole device pixels. Sub-pixel offsets plus a blur layer were what produced the
    // fuzzy "hairy" edge at small widths. Widths under one device pixel keep a 1px ring and fade it instead.
    const scale=Math.max(.5,Number(dpr)||1),safe=/^#[0-9a-f]{6}$/i.test(color)?color:'#ffffff';
    const device=Math.min(8,width)*scale,radius=Math.max(1,Math.round(device));
    const alpha=device<1?Math.max(.25,device):1,paint=alpha<1?safe+Math.round(alpha*255).toString(16).padStart(2,'0'):safe;
    const parts=[],limit=(radius+.5)*(radius+.5);
    for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
      if((x===0&&y===0)||x*x+y*y>limit)continue;
      parts.push(+(x/scale).toFixed(3)+'px '+(+(y/scale).toFixed(3))+'px 0 '+paint);
    }
    return parts.join(',');
  }
  function shadowFor(color, kind) {
    if (kind === 'none') return 'none';
    const valid = /^#[0-9a-f]{6}$/i.test(color) ? color : defaults.textColor;
    const values = [1,3,5].map(i => parseInt(valid.slice(i,i+2),16));
    const dark = values[0]*.2126 + values[1]*.7152 + values[2]*.0722 < 120;
    if (!dark) return shadows[kind] || shadows.outline;
    return kind === 'soft' ? '0 1px 3px #fff9' : '-1px 0 0 #fff9,1px 0 0 #fff9,0 -1px 0 #fff9,0 1px 0 #fff9';
  }
  return { defaults, clean, paintFor, paintVariables, lineHeightFor, insets, scaleForViewport, fonts, shadows, shadowFor, japaneseFonts,chineseFonts,outlineFor };
});
