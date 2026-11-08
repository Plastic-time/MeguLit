// SPDX-License-Identifier: GPL-3.0-or-later
/* Update notice (v1.1.0). On start MeguLit asks GitHub for the latest release; a newer one is downloaded right away
   with a real progress bar, and the card shows the version, what changed and how the package size moves. Restart now
   or later: a verified package waits in cache/update and is reused at the next start. */
const M={
 zh:{title:v=>`MeguLit v${v} 来了`,current:v=>`当前 v${v}`,size:mb=>`安装包 ${mb}`,bigger:mb=>`比当前版本大 ${mb}`,smaller:mb=>`比当前版本小 ${mb}`,same:'和当前版本差不多大',notes:'更新内容',downloading:'正在下载',verifying:'正在校验…',ready:'下载完成，已校验',restart:'重启并更新',later:'稍后',retry:'重试',failed:'下载失败',keep:'只替换程序文件，游戏库、学习记录和设置都会保留',closing:'MeguLit 即将关闭，更新完会自动重新打开',latest:'已经是最新版',checking:'正在检查…',page:'在 GitHub 查看'},
 ja:{title:v=>`MeguLit v${v} が出ました`,current:v=>`現在 v${v}`,size:mb=>`パッケージ ${mb}`,bigger:mb=>`今より ${mb} 大きい`,smaller:mb=>`今より ${mb} 小さい`,same:'今とほぼ同じサイズ',notes:'更新内容',downloading:'ダウンロード中',verifying:'検証中…',ready:'ダウンロード完了・検証済み',restart:'再起動して更新',later:'あとで',retry:'再試行',failed:'ダウンロードに失敗しました',keep:'プログラムだけを置き換えます。ライブラリ・学習記録・設定はそのままです',closing:'MeguLit を閉じて更新し、自動で開き直します',latest:'最新版です',checking:'確認中…',page:'GitHub で見る'},
 en:{title:v=>`MeguLit v${v} is here`,current:v=>`Current v${v}`,size:mb=>`Package ${mb}`,bigger:mb=>`${mb} larger than now`,smaller:mb=>`${mb} smaller than now`,same:'About the same size as now',notes:'What’s new',downloading:'Downloading',verifying:'Verifying…',ready:'Downloaded and verified',restart:'Restart and update',later:'Later',retry:'Retry',failed:'Download failed',keep:'Only program files are replaced. Your library, study records and settings stay',closing:'MeguLit will close, update and reopen',latest:'You are up to date',checking:'Checking…',page:'View on GitHub'}};
const mb=n=>(n/1048576).toFixed(n>=10485760?1:2)+' MB';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

/* Release notes are written zh first, then '---' and English. Keep the reader's half and drop markdown noise. */
function notesFor(body,locale){
 const halves=String(body||'').split(/\r?\n-{3,}\r?\n/),text=locale==='zh'||halves.length<2?halves[0]:halves[1];
 return text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^\[.*\]\(.*\)$|^>|^!\[/.test(l)&&!/MeguLit-v[\d.]+-win-x64\.zip/.test(l))
  .map(l=>({head:/^#{1,6}\s/.test(l),text:l.replace(/^#{1,6}\s*|^[-*]\s+/g,'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/`([^`]*)`/g,'$1').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')})).slice(0,40);
}

let card=null,poll=0;
export function updateLocale(){const l=document.documentElement.lang||'';return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';}

function render(info,{api,invoke,locale}){
 const t=M[locale]||M.zh;card?.remove();clearInterval(poll);
 card=document.createElement('aside');card.className='upd-card';card.setAttribute('role','dialog');card.setAttribute('aria-label',t.title(info.latest));
 const delta=info.delta==null?'':Math.abs(info.delta)<51200?t.same:info.delta>0?t.bigger(mb(info.delta)):t.smaller(mb(-info.delta));
 const notes=notesFor(info.notes,locale);
 card.innerHTML=`<button type="button" class="upd-x" data-upd-close aria-label="${esc(t.later)}">×</button>
  <div class="upd-eyebrow">${esc(t.current(info.current))} → v${esc(info.latest)}</div>
  <h3>${esc(t.title(info.latest))}</h3>
  <p class="upd-size">${esc(t.size(mb(info.size||0)))}${delta?` · <b class="${info.delta>0?'up':'down'}">${esc(delta)}</b>`:''}</p>
  ${notes.length?`<div class="upd-notes" tabindex="0"><span>${esc(t.notes)}</span>${notes.map(n=>n.head?`<h4>${esc(n.text)}</h4>`:`<p>${esc(n.text)}</p>`).join('')}</div>`:''}
  <div class="upd-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
  <div class="upd-state" data-upd-state>${esc(t.downloading)}</div>
  <p class="upd-keep">${esc(t.keep)}</p>
  <div class="upd-acts"><button type="button" class="upd-go" data-upd-go disabled>${esc(t.restart)}</button><button type="button" class="upd-later" data-upd-close>${esc(t.later)}</button></div>`;
 document.body.append(card);requestAnimationFrame(()=>card?.classList.add('in'));
 const bar=card.querySelector('.upd-bar'),fill=bar.querySelector('i'),state=card.querySelector('[data-upd-state]'),go=card.querySelector('[data-upd-go]');
 const close=()=>{clearInterval(poll);const c=card;card=null;c?.classList.remove('in');setTimeout(()=>c?.remove(),260);};
 card.querySelectorAll('[data-upd-close]').forEach(b=>b.addEventListener('click',close));
 const show=s=>{
  const total=s.total||info.size||0,got=Math.min(s.received||0,total||Infinity),pct=total?Math.floor(got/total*100):0;
  fill.style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));
  if(s.phase==='downloading'){state.textContent=total&&got>=total?t.verifying:`${t.downloading} ${mb(got)} / ${mb(total)} · ${pct}%`;}
  else if(s.phase==='ready'){clearInterval(poll);fill.style.width='100%';bar.classList.add('done');state.textContent=t.ready;go.disabled=false;go.textContent=t.restart;go.dataset.mode='install';}
  else if(s.phase==='error'){clearInterval(poll);bar.classList.add('fail');state.textContent=t.failed+(s.error?' · '+s.error:'');go.disabled=false;go.textContent=t.retry;go.dataset.mode='retry';}
 };
 const begin=async()=>{bar.classList.remove('fail','done');go.disabled=true;try{show(await api('update_start',{current:info.current}));}catch(e){show({phase:'error',error:String(e?.message||e)});return;}
  clearInterval(poll);poll=setInterval(async()=>{if(!card){clearInterval(poll);return;}try{show(await api('update_status'));}catch{}},250);};
 go.addEventListener('click',async()=>{
  if(go.dataset.mode==='retry'){begin();return;}
  go.disabled=true;state.textContent=t.closing;
  try{await api('update_install');setTimeout(()=>invoke('app_exit_for_update').catch(()=>{}),1200);}catch(e){state.textContent=t.failed+' · '+String(e?.message||e);go.disabled=false;}
 });
 begin();
}

/* Called once at start (silent unless there is something new) and by About → Check for updates (reports either way). */
export async function checkForUpdates({api,invoke,version,toast,manual=false}){
 const locale=updateLocale(),t=M[locale]||M.zh;
 try{const info=await api('update_check',{current:version});
  if(!info.newer){if(manual)toast?.(t.latest);return info;}
  render(info,{api,invoke,locale});return info;
 }catch(error){if(manual)toast?.(t.failed+' · '+String(error?.message||error));return null;}
}
export {notesFor};
