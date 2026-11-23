// SPDX-License-Identifier: GPL-3.0-or-later
/* E542 (user, CLANNAD HD prologue, embed mode): a narration page of eight sentences (the game queues them all before one
   click wait, so they arrive as one line) was drawn at the game's own size from the message box down: four lines, the
   last on the window border, and the translation under it on the desktop above the taskbar. Every engine: the dialogue
   that MeguLit draws over a bound game stays inside the game's client area. When it would cross the bottom edge, the
   text (Japanese and translation together, so they keep the game's proportions) is made smaller, down to 60 %; if that
   is not enough the block moves up, never above the client top; what still does not fit is the translation, which then
   scrolls inside the room that is left. A new line starts again at full size, so a page turn clears the shrink with the
   text. Coordinates: layout clientX/Y/Width/Height are physical pixels of the overlay surface (GalWindowBridge). */
(function(root){
 'use strict';
 const MIN=.6,MARGIN=4;
 /* win: {top,bottom} of the drawn block (CSS px); client: {top,bottom}; fit: current scale.
    Returns {fit, shift, room}: the next scale, how far to move the block up (<= 0) and, when the block still does not
    fit at the smallest scale and moved up to the client top, the height left for the translation (else 0). */
 /* 2026-11-19 (千恋＊万花, box at y 82 %: two- and three-row sentences moved their first row up 45-65 px and short ones dropped
    back, user: 「位置不要到处跑」「只有在显示不下中文的时候才小」). jp: {top,bottom} of the Japanese alone. The Japanese stands in for
    the game's own rows: its size and first row never change, long sentences wrap downwards. Only the translation gives way:
    when this sentence's translation does not fit above the client bottom it is made smaller once (down to 60 %, sized from
    the translation's own height); if it still does not fit, only the translation scrolls where at least one row fits. Both are
    for this sentence only. Without jp (older callers) the block is scaled and moved as before. */
 function plan(win,client,fit,jp){
  const limit=client.bottom-MARGIN,over=win.bottom-limit;
  if(!(over>0))return {fit,shift:0,room:0};
  if(jp&&Number.isFinite(jp.bottom)){const cn=Math.max(0,win.bottom-Math.max(win.top,jp.bottom));
   if(fit>MIN+.005&&cn>0){const next=Math.max(MIN,Math.floor(fit*Math.max(0,cn-over)/cn*100)/100);if(next<fit-.005)return {fit:next,shift:0,room:0};}
   return {fit,shift:0,room:over};}
  const height=win.bottom-win.top,avail=limit-win.top;
  if(fit>MIN+.005&&height>0&&avail>0){const next=Math.max(MIN,Math.floor(fit*avail/height*100)/100);if(next<fit-.005)return {fit:next,shift:0,room:0};}
  const up=Math.min(over,Math.max(0,win.top-(client.top+MARGIN)));
  return {fit,shift:-up,room:over>up?over-up:0};
 }
 function install(w){
  const d=w.document,b=w.__tomoyoChinese;
  if(!b){d.addEventListener('DOMContentLoaded',()=>install(w),{once:true});return;}
  if(b.gameFit)return;
  const css=d.createElement('style');css.id='megulit-game-fit-style';
  /* 2026-11-16 (user: 不要自动调日文字体大小): the Japanese keeps its size; only the translation is made smaller */
  /* 2026-11-21 (owner's recording 08:28, 千恋＊万花 incr11: 「ずっと座っていたせいか…」 had its translation cut to a 3 px strip for the whole line, and
     one line's translation was 25 px while its neighbours were 22 px): a fit decided in the gap between two lines, while text-place.js had
     released the anchor and the reader stood on its own place, stayed on the next lines, which text-place.js places itself. The rules never
     apply to a line text-place.js places or anchors (it fits those against the work area itself) */
  const own=':not(.megulit-anchored):not(.megulit-placed)';
  css.textContent=
   'html body.tomoyo-gal-bound'+own+' .tomoyo-hook-reader:not(.tome-island-page):not(.megulit-ocr-notice) .tomoyo-cn-output[data-state=ready]{min-height:0!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-on'+own+' .sentence-window:not(.tome-island-page) .tomoyo-cn-output{font-size:calc(var(--tomoyo-gal-cn-size,24px) * var(--megulit-fit,1))!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-up'+own+' .sentence-window:not(.tome-island-page){top:calc(var(--tomoyo-reader-y,0px) + var(--megulit-fit-shift,0px))!important}'+
   'html body.tomoyo-gal-bound.megulit-fit-room'+own+' .sentence-window:not(.tome-island-page) .tomoyo-cn-output{min-height:0!important;max-height:var(--megulit-fit-room,4em)!important;overflow-y:auto!important;overscroll-behavior:contain}'+
   'html body.tomoyo-gal-bound'+own+' .sentence-window.megulit-ocr-notice{translate:0 var(--notice-shift,0px)!important;box-sizing:border-box!important;max-height:var(--notice-height)!important;overflow-y:auto!important;overscroll-behavior:contain}';
  (d.head||d.documentElement).append(css);
  let fit=1,shift=0,room=0,line='',frame=0,clientGeometry='';
  let notice=false,noticeWindow=null,noticeShift=0;
  const main=()=>[...d.querySelectorAll('.sentence-window')].find(n=>!n.classList.contains('tome-island-page'));
  function set(){const r=d.documentElement.style,c=d.body.classList;
   r.setProperty('--megulit-fit',String(fit));r.setProperty('--megulit-fit-shift',shift+'px');r.setProperty('--megulit-fit-room',Math.max(0,room)+'px');
   c.toggle('megulit-fit-on',fit<1);c.toggle('megulit-fit-up',shift<0);c.toggle('megulit-fit-room',room>0);w.__tomoyoHitRegionsRefresh?.();}
  function clearNotice(){
   if(!noticeWindow)return;
   noticeWindow.classList.remove('megulit-ocr-notice');
   noticeWindow.style.removeProperty('--notice-height');noticeWindow.style.removeProperty('--notice-shift');
   noticeWindow.scrollTop=0;noticeWindow=null;noticeShift=0;
   w.__tomoyoHitRegionsRefresh?.();
  }
  function reset(){clearNotice();if(fit===1&&shift===0&&room===0)return;fit=1;shift=0;room=0;set();}
  // OCR joins the paragraphs of an opening notice into one screen. Place the whole clickable block inside the client.
  function fitNotice(win,client){
   if(noticeWindow!==win){clearNotice();noticeWindow=win;}
   const height=Math.max(1,client.bottom-client.top-2*MARGIN);
   win.style.setProperty('--notice-height',height+'px');win.classList.add('megulit-ocr-notice');
   const box=win.getBoundingClientRect(),naturalTop=box.top-noticeShift;
   const top=Math.max(client.top+MARGIN,Math.min(naturalTop,client.bottom-MARGIN-box.height));
   if(Math.abs(top-box.top)>.1){
    noticeShift=top-naturalTop;win.style.setProperty('--notice-shift',noticeShift+'px');w.__tomoyoHitRegionsRefresh?.();
   }
  }
  function measure(win){let top=Infinity,bottom=-Infinity;
   for(const n of [win,...win.querySelectorAll('.sentence-text,.tomoyo-cn-output')]){if(n.hidden)continue;const r=n.getBoundingClientRect();if(!(r.height>0))continue;top=Math.min(top,r.top);bottom=Math.max(bottom,r.bottom);}
   let jt=Infinity,jb=-Infinity;for(const n of win.querySelectorAll('.sentence-text')){if(n.hidden)continue;const r=n.getBoundingClientRect();if(!(r.height>0))continue;jt=Math.min(jt,r.top);jb=Math.max(jb,r.bottom);}
   return Number.isFinite(top)?{top,bottom,jp:Number.isFinite(jt)?{top:jt,bottom:jb}:null}:null;}
  // The pending translation reserves space using earlier lines. It is not the height of this translation.
  // Measure the actual output at its live width, with the Japanese already pinned in normal flow.
  function fitTranslation(cn,limit){
   let next=1,cap=0;
   if(cn?.dataset.state==='ready'&&!cn.hidden&&cn.textContent.trim()&&cn.getClientRects().length){
    if(fit===1&&shift===0&&room===0&&cn.getBoundingClientRect().bottom<=limit)return;
    const base=parseFloat(w.getComputedStyle(cn).getPropertyValue('--tomoyo-gal-cn-size'));
    if(!(base>0))return;
    const inline=cn.style;
    const saved=['font-size','min-height','max-height'].map(k=>[k,inline.getPropertyValue(k),inline.getPropertyPriority(k)]);
    try{
     inline.setProperty('min-height','0','important');inline.setProperty('max-height','none','important');
     const measureAt=scale=>{
      inline.setProperty('font-size',base*scale+'px','important');
      return cn.getBoundingClientRect();
     };
     if(measureAt(1).bottom>limit){
      const smallest=measureAt(MIN);
      if(smallest.bottom>limit){
       next=MIN;
       const available=Math.floor(limit-smallest.top);
       if(available>=(parseFloat(w.getComputedStyle(cn).lineHeight)||base*MIN))cap=available;
      }else{
       // Line breaks are discrete. A ratio of box heights can skip a larger size that still fits.
       let low=Math.round(MIN*1000),high=1000;
       while(high-low>1){
        const mid=Math.floor((low+high)/2);
        if(measureAt(mid/1000).bottom<=limit)low=mid;else high=mid;
       }
       next=low/1000;
      }
     }
    }finally{for(const [k,v,p] of saved){if(v)inline.setProperty(k,v,p);else inline.removeProperty(k);}}
   }
   if(next!==fit||shift!==0||cap!==room){fit=next;shift=0;room=cap;set();}
  }
  function check(){frame=0;
   if(!d.body?.classList.contains('tomoyo-gal-bound')){reset();return;}
   if(d.body.classList.contains('tome-surface-pending'))return;
   /* 2026-11-15 in-place drawing (text-place.js): every character sits on the game's own place and the window fills the client, so there is nothing to fit; measuring it shrank the text and switched the translation's height limit on and off every frame (the translation's second line flashed) */
   if(d.body.classList.contains('megulit-placed')||d.body.classList.contains('megulit-anchored')||b.textPlaceOwns?.()===true){reset();return;}/* 2026-11-20 (user, CHAOS;CHILD: 「译文为啥都这么小」): a line anchored on the game's own place is fitted by text-place.js against the monitor's work area (translation at most 15 % smaller); fitting it again to the game client shrank two-row sentences' translation to 60 % */
   const info=b.galLayoutInfo?.(),win=main();if(!win||!info||!(info.clientHeight>0))return;
   const dpr=Math.max(.5,Number(w.devicePixelRatio)||1),client={top:info.clientY/dpr,bottom:(info.clientY+info.clientHeight)/dpr};
   const geometry=[info.clientX,info.clientY,info.clientWidth,info.clientHeight,dpr].join(':');
   if(geometry!==clientGeometry){clientGeometry=geometry;reset();}
   if(notice){fitNotice(win,client);return;}
   if(win.classList.contains('tomoyo-hook-reader')&&win.querySelector('.sentence-text')){
    fitTranslation(win.querySelector('.tomoyo-cn-output'),Math.min(client.bottom,w.innerHeight)-MARGIN);return;
   }
   /* measured with the current shift taken out, so moving up is decided again from the real place */
   const m=measure(win);if(!m)return;const box={top:m.top-shift,bottom:m.bottom-shift};
   const roomNow=room;if(roomNow>0){/* the translation was cut to roomNow: its full height decides */const cn=win.querySelector('.tomoyo-cn-output');if(cn&&cn.scrollHeight>cn.clientHeight)box.bottom+=cn.scrollHeight-cn.clientHeight;}
   const p=plan(box,client,fit,m.jp?{top:m.jp.top-shift,bottom:m.jp.bottom-shift}:null);
   let nextRoom=0;if(p.room>0){const cn=win.querySelector('.tomoyo-cn-output');if(cn){const full=cn.scrollHeight||cn.getBoundingClientRect().height;nextRoom=Math.max(0,Math.floor(full-p.room));/* less than one row of the translation left: cutting it shows a strip nobody can read, it stays whole */const cnStyle=w.getComputedStyle(cn),rowH=parseFloat(cnStyle.lineHeight)||parseFloat(cnStyle.fontSize)*1.4||0;if(nextRoom<rowH)nextRoom=0;}}
   /* within one sentence the result only tightens (a translation arriving in parts, a resize pass): it never flips back and forth */
   const nf=Math.min(fit,p.fit),ns=Math.min(shift,p.shift),nr=Math.max(room,nextRoom);
   if(nf!==fit||ns!==shift||nr!==room){fit=nf;shift=ns;room=nr;set();schedule();}
  }
  function schedule(){if(!frame)frame=(w.requestAnimationFrame||(f=>setTimeout(f,16)))(check);}
  const ro=w.ResizeObserver?new w.ResizeObserver(schedule):null;let watched=null;
  const content=w.MutationObserver?new w.MutationObserver(schedule):null;
  const watch=()=>{const win=main();if(win!==watched){
   ro?.disconnect();content?.disconnect();watched=win;
   if(win){ro?.observe(win);for(const n of win.querySelectorAll('.sentence-text,.tomoyo-cn-output'))ro?.observe(n);
    content?.observe(win,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-state']});}
  }};
  const before=b.galStatus;
  b.galStatus=m=>{before?.(m);if(!m||typeof m!=='object')return;
   if(m.type==='gameClosed'||m.hookSource===null){notice=false;line='';reset();}
   if(typeof m.hookSource==='string'&&m.hookSource!==line){line=m.hookSource;reset();notice=false;}
   if(typeof m.hookSource==='string'&&typeof m.hookSourceOrigin==='string'){
    const next=m.hookSourceOrigin==='ocr'&&line.includes('\n');
    if(next!==notice){notice=next;reset();}
   }
   watch();schedule();};
  const layoutBefore=b.galLayout;
  if(typeof layoutBefore==='function')b.galLayout=layout=>{const r=layoutBefore(layout);watch();schedule();return r;};
  w.addEventListener('resize',schedule);
  if(w.MutationObserver)new w.MutationObserver(()=>{watch();schedule();}).observe(d.body||d.documentElement,{childList:true});
  b.gameFit={check,schedule,state:()=>({fit,shift,room})};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={plan,MIN,MARGIN,install};
 if(root&&root.document)install(root);
})(typeof window!=='undefined'?window:null);
