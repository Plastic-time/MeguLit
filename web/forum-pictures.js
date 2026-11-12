// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: posts can carry pictures: pick a file, paste a screenshot or a copied picture, or drop one in).
   Each picture is decoded here, scaled to at most 1920 px on its long side and encoded as WebP under 680 KB, then
   uploaded at once (bridge forum_image → relay, which checks it with the vision model and keeps it only when it passes),
   so a rejection shows on that picture before the post is sent. At most four per post or reply. Shown pictures open
   full size in a light box. */
const MAX=4,SIDE=1920,BYTES=680*1024;
const T={
 zh:{add:'添加图片',hint:'可以直接粘贴截图，或把图片拖进来，最多 4 张',uploading:'上传中…',checking:'审核中…',remove:'移除',busy:'图片还在上传，请稍等',full:'最多 4 张图片',notImage:'只能添加图片',
  IMAGE_ADULT:'未通过审核：疑似成人内容',IMAGE_SPAM:'未通过审核：疑似广告、二维码或联系方式',IMAGE_GORE:'未通过审核：疑似血腥暴力',IMAGE_UNCLEAR:'审核没有通过，换一张试试',IMAGE_UNAVAILABLE:'图片审核暂时不可用，稍后再试',IMAGE_TOO_LARGE:'图片太大了',IMAGE_INVALID:'无法读取这张图片',IMAGE_TYPE:'无法读取这张图片',INVALID_IMAGES:'图片已失效，请重新添加',close:'关闭'},
 ja:{add:'画像を追加',hint:'スクリーンショットの貼り付けやドラッグでも追加できます（4 枚まで）',uploading:'アップロード中…',checking:'審査中…',remove:'削除',busy:'画像をアップロード中です',full:'画像は 4 枚までです',notImage:'画像だけ追加できます',
  IMAGE_ADULT:'審査で不可：成人向けの内容の疑い',IMAGE_SPAM:'審査で不可：広告・QR コード・連絡先の疑い',IMAGE_GORE:'審査で不可：過激な暴力表現の疑い',IMAGE_UNCLEAR:'審査を通りませんでした。別の画像でお試しください',IMAGE_UNAVAILABLE:'画像の審査が一時的に使えません',IMAGE_TOO_LARGE:'画像が大きすぎます',IMAGE_INVALID:'画像を読み込めません',IMAGE_TYPE:'画像を読み込めません',INVALID_IMAGES:'画像が無効です。もう一度追加してください',close:'閉じる'},
 en:{add:'Add pictures',hint:'Paste a screenshot or drop pictures here, up to 4',uploading:'Uploading…',checking:'Checking…',remove:'Remove',busy:'Pictures are still uploading',full:'Up to 4 pictures',notImage:'Only pictures can be added',
  IMAGE_ADULT:'Rejected: looks like adult content',IMAGE_SPAM:'Rejected: looks like an ad, a QR code or contact details',IMAGE_GORE:'Rejected: looks like graphic violence',IMAGE_UNCLEAR:'Not approved; try another picture',IMAGE_UNAVAILABLE:'Picture checks are unavailable right now',IMAGE_TOO_LARGE:'That picture is too large',IMAGE_INVALID:'That picture cannot be read',IMAGE_TYPE:'That picture cannot be read',INVALID_IMAGES:'A picture expired; add it again',close:'Close'}
};
export const pictureWords=locale=>T[locale]||T.zh;
export function trayHTML(locale){const t=pictureWords(locale);
 return `<div class="forum-pics" data-forum-pics><ul class="forum-pic-list" data-pic-list></ul><div class="forum-pic-bar"><label class="forum-pic-add"><input type="file" accept="image/*" multiple data-pic-input hidden><span aria-hidden="true">＋</span> ${t.add}</label><small class="lb-note">${t.hint}</small></div></div>`;}

async function encode(file){
 const bitmap=await createImageBitmap(file);let scale=Math.min(1,SIDE/Math.max(bitmap.width,bitmap.height)),quality=.86,blob=null;
 for(let i=0;i<7;i++){const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),canvas=new OffscreenCanvas(w,h);canvas.getContext('2d').drawImage(bitmap,0,0,w,h);
  blob=await canvas.convertToBlob({type:'image/webp',quality});if(blob.size<=BYTES)break;if(quality>.62)quality-=.12;else scale*=.8;}
 bitmap.close?.();if(!blob||blob.size>BYTES||blob.type!=='image/webp')throw Error('IMAGE_TOO_LARGE');
 return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('IMAGE_INVALID'));r.readAsDataURL(blob);});
}
/* root: the compose box (paste and drop land anywhere in it). Returns {ids(), busy(), clear()}. */
export function mountTray(root,{api,locale,toast,esc}){
 const t=pictureWords(locale),tray=root.querySelector('[data-forum-pics]'),list=tray.querySelector('[data-pic-list]'),input=tray.querySelector('[data-pic-input]');
 let items=[];
 const paint=()=>{list.innerHTML=items.map((it,i)=>`<li class="forum-pic is-${it.state}"><img src="${it.preview}" alt=""><span class="forum-pic-state">${it.state==='uploading'?t.checking:it.state==='error'?esc(t[it.error]||t.IMAGE_INVALID):''}</span><button type="button" class="forum-pic-x" data-pic-remove="${i}" aria-label="${t.remove}">×</button></li>`).join('');
  list.hidden=!items.length;list.querySelectorAll('[data-pic-remove]').forEach(b=>b.onclick=()=>{const it=items[Number(b.dataset.picRemove)];items=items.filter(x=>x!==it);paint();});};
 async function add(files){
  const images=[...files].filter(f=>f&&/^image\//.test(f.type));if(!images.length){if(files.length)toast(t.notImage);return;}
  for(const file of images){if(items.length>=MAX){toast(t.full);break;}
   const it={state:'uploading',preview:'',id:'',error:''};items.push(it);
   try{it.preview=await encode(file);paint();const r=await api('forum_image',{data:it.preview});if(!r?.id)throw Error('IMAGE_INVALID');it.id=r.id;it.state='ok';}
   catch(error){it.state='error';it.error=String(error?.message||error||'').replace(/^FORUM_/,'');if(!it.preview)it.preview='data:image/gif;base64,R0lGODlhAQABAAAAACw=';}
   if(items.includes(it))paint();}
 }
 input.onchange=()=>{add(input.files);input.value='';};
 root.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])];if(files.some(f=>/^image\//.test(f.type))){e.preventDefault();add(files);}});
 root.addEventListener('dragover',e=>{if([...(e.dataTransfer?.items||[])].some(i=>i.kind==='file')){e.preventDefault();tray.classList.add('is-drop');}});
 root.addEventListener('dragleave',e=>{if(!root.contains(e.relatedTarget))tray.classList.remove('is-drop');});
 root.addEventListener('drop',e=>{tray.classList.remove('is-drop');const files=[...(e.dataTransfer?.files||[])];if(files.length){e.preventDefault();add(files);}});
 paint();
 return {ids:()=>items.filter(i=>i.state==='ok').map(i=>i.id),busy:()=>items.some(i=>i.state==='uploading'),failed:()=>items.some(i=>i.state==='error'),clear:()=>{items=[];paint();},busyText:t.busy};
}
/* pictures shown under a post or reply; data URLs from the bridge (forum_get pictures) */
export function galleryHTML(ids,pictures){const shown=(ids||[]).filter(id=>pictures?.[id]);if(!shown.length)return '';
 return `<div class="forum-gallery is-${Math.min(shown.length,4)}">${shown.map(id=>`<button type="button" class="forum-shot" data-pic-open="${id}"><img src="${pictures[id]}" alt="" loading="lazy"></button>`).join('')}</div>`;}
export function bindGallery(root,pictures,locale){const t=pictureWords(locale);
 root.querySelectorAll('[data-pic-open]').forEach(b=>b.onclick=()=>{const src=pictures?.[b.dataset.picOpen];if(!src)return;
  const box=document.createElement('dialog');box.className='forum-lightbox';box.innerHTML=`<img src="${src}" alt=""><button type="button" class="forum-lightbox-x" aria-label="${t.close}">×</button>`;
  document.body.append(box);box.showModal();const close=()=>{box.close();box.remove();};box.querySelector('button').onclick=close;box.addEventListener('click',e=>{if(e.target===box||e.target.tagName==='IMG')close();});box.addEventListener('cancel',()=>box.remove());});}
