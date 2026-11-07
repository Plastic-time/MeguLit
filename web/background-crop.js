// SPDX-License-Identifier: GPL-3.0-or-later
let activeCrop=null;
export const zoomProgress=zoom=>Math.max(0,Math.min(100,(Number(zoom)-1)/4*100));
export const zoomFromProgress=progress=>1+Math.max(0,Math.min(100,Number(progress)))/25;
export function backgroundGeometry(size,crop,viewport,blur=0){const c={x:50,y:50,zoom:1,...crop},m=Math.min(40,Math.ceil((Number(blur)||0)*2)),vw=viewport.width,vh=viewport.height,s=Math.max((vw+2*m)/size[0],(vh+2*m)/size[1])*Math.max(1,c.zoom),dw=size[0]*s,dh=size[1]*s,ox=(40-m)-(dw-vw-2*m)*c.x/100,oy=(40-m)-(dh-vh-2*m)*c.y/100;return {dw,dh,ox,oy,frame:{left:(40-ox)/dw,top:(40-oy)/dh,width:vw/dw,height:vh/dh}};}
export function openBackgroundCrop({src,crop,blur=0,locale='zh',onPreview,onCommit}){
activeCrop?.();let cropBox=null,preview=null;const cfg={blur};
const labels={zh:{cropTitle:'调整显示区域',zoom:'缩放',cropHint:'拖动选框选择区域，滚轮或滑条缩放；主页实时预览',cancel:'取消',ok:'确认'},en:{cropTitle:'Adjust visible area',zoom:'Zoom',cropHint:'Drag the frame; zoom with the wheel or slider. The background previews live',cancel:'Cancel',ok:'Confirm'},ja:{cropTitle:'表示範囲を調整',zoom:'拡大',cropHint:'枠をドラッグし、ホイールかスライダーで拡大。背景をリアルタイムで確認できます',cancel:'キャンセル',ok:'確定'}}[locale];const t=key=>labels[key];
const paint=()=>onPreview?.(preview),geometry=(size,value)=>backgroundGeometry(size,value,{width:innerWidth,height:innerHeight},cfg.blur);
 function cropWindow(src,crop,onOk){
  cropBox?.__cancel?.();
  const box=document.createElement('div');box.className='tome-crop';box.dataset.noI18n='';box.setAttribute('role','dialog');cropBox=box;
  box.innerHTML='<header><span></span><button type="button" data-x>×</button></header><div class="tome-crop-stage"><img alt=""><i></i></div><label class="tome-crop-zoom"><span></span><input type="range" min="0" max="100" step="any"><output></output></label><small></small><footer><button type="button" data-cancel></button><button type="button" data-ok></button></footer>';
  const $=q=>box.querySelector(q),stage=$('.tome-crop-stage'),img=$('img'),frame=$('i'),zoom=$('input'),out=$('output');
  $('header span').textContent=t('cropTitle');$('.tome-crop-zoom span').textContent=({zh:'放大程度',en:'Enlargement',ja:'拡大度'})[locale];$('small').textContent=t('cropHint')+({zh:' · 0% 铺满，100% 最大放大',en:' · 0% fills the window; 100% is maximum enlargement',ja:' · 0% は画面に合わせる、100% は最大拡大'})[locale];$('[data-cancel]').textContent=t('cancel');$('[data-ok]').textContent=t('ok');$('[data-x]').setAttribute('aria-label',t('cancel'));
  let c={x:50,y:50,zoom:1,...crop},size=null;const clamp=v=>Math.max(0,Math.min(100,v));
  const draw=()=>{preview={src,crop:{...c}};paint();zoom.value=String(zoomProgress(c.zoom));zoom.style.setProperty('--range-fill',zoomProgress(c.zoom)+'%');out.textContent=Number(zoomProgress(c.zoom).toFixed(2))+'%';if(!size)return;const g=geometry(size,c).frame;
   frame.style.left=g.left*100+'%';frame.style.top=g.top*100+'%';frame.style.width=g.width*100+'%';frame.style.height=g.height*100+'%';};
  // Frame position (fraction of the picture) back to background-position percentages.
  const moveTo=(left,top)=>{const g=geometry(size,c),m=Math.min(40,Math.ceil((Number(cfg.blur)||0)*2)),fx=g.dw-innerWidth-2*m,fy=g.dh-innerHeight-2*m;const ox=40-left*g.dw,oy=40-top*g.dh;c.x=fx>0.5?clamp(((40-m)-ox)/fx*100):50;c.y=fy>0.5?clamp(((40-m)-oy)/fy*100):50;draw();};
  // Clicking anywhere on the picture centres the frame there and keeps dragging from that point.
  stage.addEventListener('pointerdown',e=>{if(!size||e.target===frame)return;const r=stage.getBoundingClientRect(),g=geometry(size,c).frame;moveTo((e.clientX-r.left)/r.width-g.width/2,(e.clientY-r.top)/r.height-g.height/2);frame.dispatchEvent(new PointerEvent('pointerdown',{clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,bubbles:true}));});
  let committing=false;
  const finish=async ok=>{if(cropBox!==box||committing)return;if(ok){if(!size)return;committing=true;$('[data-ok]').disabled=true;try{await onOk({x:Math.round(c.x*10)/10,y:Math.round(c.y*10)/10,zoom:Math.round(c.zoom*10000)/10000});}catch{committing=false;$('[data-ok]').disabled=false;return;}}cropBox=null;box.remove();removeEventListener('keydown',key,true);preview=null;if(!ok)paint();};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}};addEventListener('keydown',key,true);box.__cancel=()=>finish(false);
  $('[data-x]').onclick=$('[data-cancel]').onclick=()=>finish(false);$('[data-ok]').onclick=()=>finish(true);
  zoom.oninput=()=>{const g=size&&geometry(size,c).frame;c.zoom=zoomFromProgress(zoom.value);if(g){const n=geometry(size,c).frame;moveTo(g.left+(g.width-n.width)/2,g.top+(g.height-n.height)/2);}else draw();};
  stage.addEventListener('wheel',e=>{e.preventDefault();zoom.value=String(zoomProgress(Math.max(1,Math.min(5,c.zoom*(e.deltaY<0?1.08:1/1.08)))));zoom.oninput();},{passive:false});
  frame.addEventListener('pointerdown',e=>{if(!size)return;e.preventDefault();try{frame.setPointerCapture(e.pointerId);}catch{}const r=stage.getBoundingClientRect(),g=geometry(size,c).frame,sx=e.clientX,sy=e.clientY;frame.classList.add('tome-dragging');
   const move=ev=>moveTo(g.left+(ev.clientX-sx)/r.width,g.top+(ev.clientY-sy)/r.height),up=()=>{frame.classList.remove('tome-dragging');frame.removeEventListener('pointermove',move);frame.removeEventListener('pointerup',up);};frame.addEventListener('pointermove',move);frame.addEventListener('pointerup',up);});
  const head=$('header');head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();try{head.setPointerCapture(e.pointerId);}catch{}const r=box.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
   const move=ev=>{box.style.left=Math.max(8,Math.min(ev.clientX-dx,innerWidth-r.width-8))+'px';box.style.top=Math.max(8,Math.min(ev.clientY-dy,innerHeight-r.height-8))+'px';},up=()=>{head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',up);};head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);});
  img.onload=()=>{if(cropBox!==box||!box.isConnected)return;size=[img.naturalWidth,img.naturalHeight];const maxW=Math.min(520,innerWidth-80),maxH=Math.min(320,innerHeight-260),k=Math.min(maxW/size[0],maxH/size[1]);stage.style.width=Math.round(size[0]*k)+'px';stage.style.height=Math.round(size[1]*k)+'px';
   box.style.left=Math.max(8,(innerWidth-box.offsetWidth)/2)+'px';box.style.top=Math.max(8,(innerHeight-box.offsetHeight)/2)+'px';draw();};
  document.body.append(box);img.src=src;draw();
 }
cropWindow(src,crop,value=>onCommit(value));activeCrop=()=>cropBox?.__cancel?.();
}
