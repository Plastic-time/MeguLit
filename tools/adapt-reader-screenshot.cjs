// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

module.exports=function adaptReaderScreenshot(text){
 const action='  async function act(action){';
 const payload='{translation:currentTranslation(scope.text)}';
 if(!text.includes(action)||!text.includes(payload))throw Error('READER_SCREENSHOT_ANCHOR');
 return text.replace(payload,'{translation:currentTranslation(scope.text),screenshotId:await captureReader(card)}')
  .replace('const request=(action,args={})=>','const request=(action,args={},timeout=240000)=>')
  .replace('},240000);pending.set','},timeout);pending.set')
  .replace(action,String.raw`  async function captureReader(card){
   if(config.ankiGameMedia===false)return;
   const scale=devicePixelRatio||1,boxes=[];
   for(const node of document.querySelectorAll('.sentence-text,.tomoyo-cn-output')){
    if(!node.textContent.trim()||node.checkVisibility?.({opacityProperty:true,visibilityProperty:true})===false)continue;
    const range=document.createRange();range.selectNodeContents(node);
    const margin=4;for(const rect of range.getClientRects())if(rect.width&&rect.height)boxes.push([rect.left-margin,rect.top-margin,rect.right+margin,rect.bottom+margin]);
    for(const base of node.querySelectorAll('.megulit-ruby-base[data-tomoyo-reading]')){
     if(base.firstElementChild?.classList.contains('tome-typewriter-pending'))continue;
     const rect=base.getBoundingClientRect(),ruby=getComputedStyle(base,'::before');
     const w=parseFloat(ruby.width)||0,h=parseFloat(ruby.height)||0;
     const x=rect.left+(parseFloat(ruby.left)||0),y=rect.top+(parseFloat(ruby.top)||0);
     if(w&&h)boxes.push([x-w/2-margin,y-h-margin,x+w/2+margin,y+margin]);
    }
   }
   let bounds={};
   if(boxes.length){
    const x=Math.floor(Math.max(0,Math.min(...boxes.map(b=>b[0])))*scale);
    const y=Math.floor(Math.max(0,Math.min(...boxes.map(b=>b[1])))*scale);
    const right=Math.ceil(Math.min(innerWidth,Math.max(...boxes.map(b=>b[2])))*scale);
    const bottom=Math.ceil(Math.min(innerHeight,Math.max(...boxes.map(b=>b[3])))*scale);
    if(right>x&&bottom>y)bounds={readerX:x,readerY:y,readerWidth:right-x,readerHeight:bottom-y};
   }
   // E215.6 (user): the picture holds only the game and MeguLit's text box: menus, Alt+T and other panels hide too.
   card.classList.add('megulit-mining-capture');document.body.classList.add('megulit-capturing');
   try{
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return (await request('ankiScreenshot',bounds,5000)).id;
   }catch{}finally{card.classList.remove('megulit-mining-capture');document.body.classList.remove('megulit-capturing');}
  }
`+action);
};
