// SPDX-License-Identifier: GPL-3.0-or-later
/* E388 leaderboard avatar: pick a picture, choose the square to keep in a crop window that works like the background
   crop (drag the frame, wheel or slider to zoom, click to centre, drag the title bar), see it as a circle, then encode
   a still WebP of at most 256 px / 64 KB and upload it. Used from Settings › 联网服务 and from the 排行榜 page. */
import {zoomProgress,zoomFromProgress} from './background-crop.js';
export const AVATAR_LIMIT=64*1024;
const T={
 zh:{title:'调整头像范围',hint:'拖动选框选择区域，滚轮或滑条缩放；右边是排行榜上显示的样子',zoom:'放大程度',preview:'预览',cancel:'取消',ok:'确认上传',
  unreadable:'读不出这张图片',tooSmall:'图片太小了，至少要 32×32',tooBig:'图片压缩后仍然太大，换一张试试',offline:'暂时连不上联网服务',
  approved:'头像已通过审核',rejected:'头像没有通过审核',appealWhere:'觉得判断错了，可以在 设置 › 联网服务 里申诉',pending:'头像审核中'},
 ja:{title:'アイコンの範囲を調整',hint:'枠をドラッグして範囲を選び、ホイールかスライダーで拡大。右側がランキングでの見え方です',zoom:'拡大度',preview:'プレビュー',cancel:'キャンセル',ok:'アップロード',
  unreadable:'この画像を読み込めません',tooSmall:'画像が小さすぎます（32×32 以上）',tooBig:'圧縮しても大きすぎます。別の画像をお試しください',offline:'オンラインサービスに接続できません',
  approved:'アイコンが審査を通過しました',rejected:'アイコンは審査を通過しませんでした',appealWhere:'判定が間違いだと思ったら、設定 › オンライン から確認を依頼できます',pending:'アイコンを審査中'},
 en:{title:'Adjust your picture',hint:'Drag the frame to choose the area; zoom with the wheel or slider. On the right is how it looks on the leaderboard',zoom:'Enlargement',preview:'Preview',cancel:'Cancel',ok:'Upload',
  unreadable:'Could not read this picture',tooSmall:'The picture is too small (at least 32×32)',tooBig:'Still too large after compression; try another picture',offline:'Cannot reach the online service right now',
  approved:'Picture approved',rejected:'Picture not approved',appealWhere:'If the check got it wrong, ask for a review in Settings › Online',pending:'Picture being checked'}
};
export const avatarCropWords=locale=>T[locale]||T.zh;
/* Largest zoom: the kept square never gets smaller than 64 px of the source (or 5×). */
export const maxAvatarZoom=(width,height)=>Math.max(1,Math.min(5,Math.min(width,height)/64));
/* Crop {x,y,zoom} (x/y 0–100 = where the square sits in the free space) to a source rectangle {sx,sy,side}. */
export function cropRect(width,height,crop={}){
 const zoom=Math.max(1,Math.min(maxAvatarZoom(width,height),Number(crop.zoom)||1)),side=Math.min(width,height)/zoom,clamp=v=>Math.max(0,Math.min(100,Number.isFinite(Number(v))?Number(v):50));
 return {sx:(width-side)*clamp(crop.x)/100,sy:(height-side)*clamp(crop.y)/100,side};
}
/* Inverse of cropRect for the frame's left/top (fractions of the picture): the x/y that put the square there. */
export function cropFromFrame(width,height,zoom,left,top){
 const side=Math.min(width,height)/zoom,fx=width-side,fy=height-side,clamp=v=>Math.max(0,Math.min(100,v));
 return {x:fx>0.5?clamp(left*width/fx*100):50,y:fy>0.5?clamp(top*height/fy*100):50,zoom};
}
let active=null;
/* Opens the crop window; resolves to {sx,sy,side} or null when cancelled. */
export function openAvatarCrop({src,width,height,locale='zh'}){
 active?.();
 const w=avatarCropWords(locale);
 return new Promise(resolve=>{
  const box=document.createElement('div');box.className='tome-crop avatar-crop';box.dataset.noI18n='';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');
  box.innerHTML='<header><span></span><button type="button" data-x>×</button></header><div class="avatar-crop-body"><div class="tome-crop-stage"><img alt=""><i></i></div><figure class="avatar-crop-preview"><span><img alt=""></span><figcaption></figcaption></figure></div><label class="tome-crop-zoom"><span></span><input type="range" min="0" max="100" step="any"><output></output></label><small></small><footer><button type="button" data-cancel></button><button type="button" data-ok></button></footer>';
  const $=q=>box.querySelector(q),stage=$('.tome-crop-stage'),img=$('.tome-crop-stage img'),frame=$('.tome-crop-stage i'),zoom=$('input'),out=$('output'),ring=$('.avatar-crop-preview span'),thumb=$('.avatar-crop-preview img');
  $('header span').textContent=w.title;$('.tome-crop-zoom span').textContent=w.zoom;$('small').textContent=w.hint;$('figcaption').textContent=w.preview;$('[data-cancel]').textContent=w.cancel;$('[data-ok]').textContent=w.ok;$('[data-x]').setAttribute('aria-label',w.cancel);
  const top=maxAvatarZoom(width,height),toProgress=z=>zoomProgress(1+(z-1)*4/Math.max(1e-9,top-1||1)),fromProgress=p=>top<=1?1:1+(zoomFromProgress(p)-1)*(top-1)/4;
  let c={x:50,y:50,zoom:1};
  const draw=()=>{const r=cropRect(width,height,c),p=toProgress(c.zoom);
   frame.style.left=r.sx/width*100+'%';frame.style.top=r.sy/height*100+'%';frame.style.width=r.side/width*100+'%';frame.style.height=r.side/height*100+'%';
   zoom.value=String(p);zoom.style.setProperty('--range-fill',p+'%');out.textContent=Math.round(p)+'%';zoom.disabled=top<=1;
   const k=ring.clientWidth/r.side||0;thumb.style.width=width*k+'px';thumb.style.height=height*k+'px';thumb.style.left=-r.sx*k+'px';thumb.style.top=-r.sy*k+'px';};
  const frameNow=()=>{const r=cropRect(width,height,c);return {left:r.sx/width,top:r.sy/height,width:r.side/width,height:r.side/height};};
  const moveTo=(left,topFrac)=>{c=cropFromFrame(width,height,c.zoom,left,topFrac);draw();};
  const setZoom=z=>{const g=frameNow();c.zoom=Math.max(1,Math.min(top,z));const n=frameNow();moveTo(g.left+(g.width-n.width)/2,g.top+(g.height-n.height)/2);};
  const finish=ok=>{if(active!==cancel)return;active=null;box.remove();removeEventListener('keydown',key,true);resolve(ok?cropRect(width,height,c):null);};
  const cancel=()=>finish(false),key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}else if(e.key==='Enter'&&!e.target.closest?.('button')){e.preventDefault();finish(true);}};
  active=cancel;addEventListener('keydown',key,true);
  $('[data-x]').onclick=$('[data-cancel]').onclick=cancel;$('[data-ok]').onclick=()=>finish(true);
  zoom.oninput=()=>setZoom(fromProgress(zoom.value));
  stage.addEventListener('wheel',e=>{e.preventDefault();setZoom(c.zoom*(e.deltaY<0?1.08:1/1.08));},{passive:false});
  /* Clicking the picture centres the frame there and keeps dragging from that point. */
  stage.addEventListener('pointerdown',e=>{if(e.target===frame)return;const r=stage.getBoundingClientRect(),g=frameNow();moveTo((e.clientX-r.left)/r.width-g.width/2,(e.clientY-r.top)/r.height-g.height/2);frame.dispatchEvent(new PointerEvent('pointerdown',{clientX:e.clientX,clientY:e.clientY,pointerId:e.pointerId,bubbles:true}));});
  frame.addEventListener('pointerdown',e=>{e.preventDefault();try{frame.setPointerCapture(e.pointerId);}catch{}const r=stage.getBoundingClientRect(),g=frameNow(),sx=e.clientX,sy=e.clientY;frame.classList.add('tome-dragging');
   const move=ev=>moveTo(g.left+(ev.clientX-sx)/r.width,g.top+(ev.clientY-sy)/r.height),up=()=>{frame.classList.remove('tome-dragging');frame.removeEventListener('pointermove',move);frame.removeEventListener('pointerup',up);};frame.addEventListener('pointermove',move);frame.addEventListener('pointerup',up);});
  const head=$('header');head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();try{head.setPointerCapture(e.pointerId);}catch{}const r=box.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
   const move=ev=>{box.style.left=Math.max(8,Math.min(ev.clientX-dx,innerWidth-r.width-8))+'px';box.style.top=Math.max(8,Math.min(ev.clientY-dy,innerHeight-r.height-8))+'px';},up=()=>{head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',up);};head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);});
  const maxW=Math.min(420,innerWidth-200),maxH=Math.min(340,innerHeight-260),k=Math.min(maxW/width,maxH/height);
  stage.style.width=Math.max(120,Math.round(width*k))+'px';stage.style.height=Math.max(120,Math.round(height*k))+'px';
  img.src=thumb.src=src;document.body.append(box);
  box.style.left=Math.max(8,(innerWidth-box.offsetWidth)/2)+'px';box.style.top=Math.max(8,(innerHeight-box.offsetHeight)/2)+'px';draw();$('[data-ok]').focus();
 });
}
/* Encodes the chosen square as a still WebP: always 256 px (a small crop is scaled up so every avatar looks the same),
   then 192 / 128 px and lower quality only if it does not fit 64 KB. */
export function encodeAvatar(image,{sx,sy,side}){
 for(const size of [256,192,128])for(const quality of [.86,.76,.64,.5]){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,sx,sy,side,side,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL('image/webp',quality);if(!data.startsWith('data:image/webp;base64,'))return '';
  if(Math.floor((data.length-23)*3/4)<=AVATAR_LIMIT)return data;
 }
 return 'TOO_BIG';
}
/* File → crop window → encode. Resolves to a data URL, '' (cancelled) or throws Error(unreadable|tooSmall|tooBig). */
export async function cropAvatarFile(file,locale){
 const url=URL.createObjectURL(file);
 try{
  let image;try{image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}catch{throw new Error('unreadable');}
  if(Math.min(image.naturalWidth,image.naturalHeight)<32)throw new Error('tooSmall');
  const rect=await openAvatarCrop({src:url,width:image.naturalWidth,height:image.naturalHeight,locale});if(!rect)return '';
  const data=encodeAvatar(image,rect);if(!data)throw new Error('unreadable');if(data==='TOO_BIG')throw new Error('tooBig');return data;
 }finally{URL.revokeObjectURL(url);}
}
/* Opens the system file picker; resolves to the chosen File or null. */
export function pickImageFile(){
 return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp,image/gif';input.hidden=true;
  let done=false;const end=file=>{if(done)return;done=true;input.remove();resolve(file||null);};
  input.onchange=()=>end(input.files?.[0]);input.addEventListener('cancel',()=>end(null));document.body.append(input);input.click();});
}
/* The whole flow for the 排行榜 page: pick, crop, upload, tell the result. Resolves to the bridge reply or null. */
export async function changeAvatar({api,locale,toast,onBusy=()=>{}}){
 const w=avatarCropWords(locale),file=await pickImageFile();if(!file)return null;
 let data;try{data=await cropAvatarFile(file,locale);}catch(error){toast(w[error.message]||w.unreadable);return null;}if(!data)return null;
 onBusy(true);
 try{const r=await api('leaderboard_avatar_set',{data});if(r?.state&&r.state!=='ok'){toast(w.offline);return r;}
  toast(r.status==='approved'?w.approved:r.status==='rejected'?w.rejected+' · '+w.appealWhere:w.pending);return r;}
 catch{toast(w.offline);return null;}finally{onBusy(false);}
}
