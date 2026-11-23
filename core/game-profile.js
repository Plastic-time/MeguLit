// SPDX-License-Identifier: GPL-3.0-or-later
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TomeGameProfile=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const textKeys=['choiceFont','choiceSelectedColor','choiceUnselectedColor','autoGameStyle','typewriter','typewriterSpeed','style','display','japaneseSize','translationSize','japaneseSpacingPx','chineseSpacingPx','lineHeight','lineHeightMode','translationLineHeight','gap','translationWidth','textColor','readTextColor','speechTextColor','narrationTextColor','textGradient','textGradientTop','textGradientBottom','textGradientStart','readTextGradientStart','readTextGradient','readTextGradientTop','readTextGradientBottom','shadow','japaneseFont','japaneseFontSource','chineseFont','rubyFont','englishFont','englishEnabled','englishSize','englishSpacingPx','englishBold','englishOutline','englishOutlineColor','englishOutlineWidth','japaneseBold','chineseBold','japaneseOutline','chineseOutline','japaneseOutlineColor','chineseOutlineColor','japaneseOutlineWidth','chineseOutlineWidth','rubyOutline','rubyOutlineColor','rubyOutlineWidth','rubyScale','rubyOffsetX','rubyOffsetY','rubyRowOffsets','rubyRowOffsetsX','furigana','autoScale','sizeSource'];
 const positionKeys=['x','y','width','height','paddingX','paddingY','livePosition','anchorDX','anchorDY'];
 // 内嵌 panel: original-text hiding, mask/scan, Hook switches and the wait marker are per work too (user, 2026-11-02).
 const embedKeys=['maskMode','embedTranslation','maskModeSource','maskStyle','maskColor','maskPadding','blurRadius','fastMask','scanAuto','scanX','scanY','scanWidth','scanHeight','hideWaitMarker','relocateWaitMarker','waitCoverStyle','hookProfile','hookHide','hookAutoStart','hookFast'];
 // 'base' = text+position (they have defaults); 'all' adds embed, which falls back to the current value, not a default.
 const keysOf=kind=>kind==='text'?textKeys:kind==='position'?positionKeys:kind==='embed'?embedKeys:kind==='base'?[...textKeys,...positionKeys]:[...textKeys,...positionKeys,...embedKeys];
 function pick(p,kind='all'){const out={};for(const k of keysOf(kind))if(p&&p[k]!==undefined&&['number','boolean','string'].includes(typeof p[k]))out[k]=p[k];return out;}
 /* E550 (user, ファタモルガーナの館: calibration drew MS Gothic although the game font ＭＳ Ｐ明朝 was detected). Saved or default
    profile values that follow the game font (japaneseFontSource is not 'user') carry the font of the time they were saved, or the
    built-in default; applying them replaced the font the engine reports now. Only a font the user picked travels with a profile. */
 function followFont(p){if(!p||typeof p!=='object'||p.japaneseFontSource==='user')return p;const out={...p};delete out.japaneseFont;delete out.japaneseFontSource;return out;}
 /* Issue 800 (设置里改了字号存不住): a work's saved settings carried the text sizes of the moment it was saved although nobody set
    them for that work, so a size changed in Settings while the game was closed came back at its next start. A work holds a size only
    when it was chosen for it (Alt+T, a calibration, its own page in Settings): a size equal to the global one that the work did not
    already hold is left out, and the work follows Settings. sizes:1 marks entries written under this rule. */
 const sizeKeys=['japaneseSize','translationSize','englishSize'];
 function ownSizes(prefs,base,owned){const out={...prefs},has=k=>!!owned&&Object.hasOwn(owned,k);let kept=false;
  for(const k of sizeKeys){if(!(k in out))continue;if(!has(k)&&Number(out[k])===Number(base?.[k]))delete out[k];else kept=true;}
  if(!kept&&'sizeSource' in out&&!has('sizeSource'))delete out.sizeSource;return out;}
 /* Entries from before sizes:1 copied the built-in sizes of that time (34 / 30 / 34) into every saved work: those follow Settings now.
    Only when every size the entry holds is that copy and none is marked sizeSource 'user' (Alt+T and the per-work page marked a size
    changed there). An old save also copied the global sizes of its time, with the global mark: given the global sizes an old entry
    was saved under (base), sizes equal to them are inherited and follow Settings too. A size picked equal to the global one cannot be
    told apart from a copy and follows Settings. */
 const legacySizes={japaneseSize:34,translationSize:30,englishSize:34};
 function map(value){if(value===null)return null;if(!value||typeof value!=='object'||![value.s,value.bx,value.by,value.dx,value.dy,value.cw,value.ch].every(Number.isFinite)||value.s<=.1||value.s>=10||value.cw<=0||value.ch<=0||['bx','by','dx','dy'].some(k=>Math.abs(value[k])>20000))return undefined;const out={};for(const key of ['engine','s','bx','by','dx','dy','cw','ch'])if(key==='engine'?typeof value[key]==='string'&&value[key].length<40:Number.isFinite(value[key]))out[key]=value[key];return out;}
 function version(value){if(!value||!Number.isFinite(value.savedAt)||value.savedAt<=0)return null;const m=map(value.positionMap);return {id:String(value.id||value.savedAt).slice(0,80),savedAt:value.savedAt,prefs:pick(value.prefs),positionMap:m===undefined?null:m};}
 function normalize(entry,base,presetModifiedAt=0){if(!entry||!entry.prefs)return null;const prefs=pick(entry.prefs);if('lineHeight' in prefs&&prefs.lineHeightMode!=='offset'){prefs.lineHeight=Number(prefs.lineHeight)-(Number(prefs.lineHeight)>=0?1.95:0);prefs.lineHeightMode='offset';}const textSavedAt=entry.textSavedAt??(textKeys.some(k=>k in prefs)?entry.savedAt:0),positionSavedAt=entry.positionSavedAt??(positionKeys.some(k=>k in prefs)?entry.savedAt:0);const history=Array.isArray(entry.history)?entry.history.map(version).filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt).slice(0,7):[];
  if(entry.sizes!==1){const held=sizeKeys.filter(k=>k in prefs);
   // Old Alt+T saves copied the global 'user' mark too. If the preset is newer, the old global sizes cannot be recovered.
   if(held.length&&prefs.sizeSource==='user'&&presetModifiedAt>(Number(textSavedAt)||0)){
    const previous=version({...entry,savedAt:Number(entry.savedAt)||Number(textSavedAt)||0,prefs});
    if(previous&&!history.some(item=>item.savedAt===previous.savedAt)){history.unshift(previous);if(history.length>7)history.pop();}
    for(const k of held)delete prefs[k];
   }else if(prefs.sizeSource!=='user'&&held.every(k=>Number(prefs[k])===legacySizes[k]))for(const k of held)delete prefs[k];
   else if(base)for(const k of held)if(Number(prefs[k])===Number(base[k]))delete prefs[k];
   if(!sizeKeys.some(k=>k in prefs))delete prefs.sizeSource;}
  return {...entry,prefs,textSavedAt,positionSavedAt,history,sizes:1};}
 const copy=v=>v==null?null:JSON.parse(JSON.stringify(v));
 const canonical=v=>JSON.stringify(Object.fromEntries(Object.entries(v||{}).sort(([a],[b])=>a.localeCompare(b))));
 class Session{
  constructor(){this.key='';this.name='';this.savedAt=0;this.history=[];this.base={prefs:{},map:null};}
  load(key,name,prefs,positionMap,savedAt=0,history=[]){this.key=key||'';this.name=name||'';this.savedAt=savedAt||0;this.history=history.slice(0,7).map(version).filter(Boolean);this.base={prefs:copy(pick(prefs)),map:map(positionMap)||null};}
  dirty(prefs,positionMap){return canonical(pick(prefs))!==canonical(this.base.prefs)||canonical(map(positionMap)||{})!==canonical(this.base.map||{});}
  cancel(){return copy(this.base);}
  select(id){const h=this.history.find(v=>v.id===id);return h?{prefs:copy(h.prefs),map:copy(h.positionMap)}:null;}
  saved(key,prefs,positionMap,at,history){if(key!==this.key)return false;this.load(key,this.name,prefs,positionMap,at,history);return true;}
 }
 return {textKeys,positionKeys,embedKeys,sizeKeys,pick,ownSizes,followFont,normalize,map,version,Session};
});
