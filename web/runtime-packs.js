// SPDX-License-Identifier: GPL-3.0-or-later
// "Runtime components" panel: lets slim-install users fetch the remaining packs (full version) later.
const ui={
 zh:{title:'运行组件',help:'精简版只装了基础组件。下载完整版会补齐注音分词词典和语音引擎',full:'下载完整版组件',cancel:'取消',installed:'已安装',missing:'未安装',downloading:'下载中',unpack:'解压中',queued:'等待中',error:'失败',done:'已完成',need:'需要下载约 {d}，预留磁盘约 {u}',all:'所有组件都已安装',failed:'操作失败',base:'基础组件',reading:'注音分词词典',voice:'语音引擎 AivisSpeech',archives:'通用封包解包（GARbro）',onDemand:'按需下载：遇到自家读取器打不开的加密封包时自动下载',remove:'卸载'},
 en:{title:'Runtime components',help:'The slim install only has the base components. The full version adds the furigana dictionaries and the voice engine',full:'Download full components',cancel:'Cancel',installed:'Installed',missing:'Not installed',downloading:'Downloading',unpack:'Unpacking',queued:'Queued',error:'Failed',done:'Done',need:'About {d} to download, {u} of disk space',all:'All components are installed',failed:'Something went wrong',base:'Base components',reading:'Furigana dictionaries',voice:'Voice engine (AivisSpeech)',archives:'Archive unpacker (GARbro)',onDemand:'On demand: fetched by itself when a game\'s encrypted archive needs it',remove:'Remove'},
 ja:{title:'実行コンポーネント',help:'軽量版は基本コンポーネントのみです。完全版ではふりがな辞書と音声エンジンを追加します',full:'完全版コンポーネントをダウンロード',cancel:'キャンセル',installed:'インストール済み',missing:'未インストール',downloading:'ダウンロード中',unpack:'展開中',queued:'待機中',error:'失敗',done:'完了',need:'ダウンロード約 {d}、空き容量約 {u} が必要です',all:'すべてのコンポーネントがインストール済みです',failed:'操作に失敗しました',base:'基本コンポーネント',reading:'ふりがな辞書',voice:'音声エンジン（AivisSpeech）',archives:'汎用アーカイブ展開（GARbro）',onDemand:'必要時のみ：独自の読み取りで開けない暗号化アーカイブがあると自動でダウンロード',remove:'削除'}
};
const mb=n=>n>=1073741824?(n/1073741824).toFixed(1)+' GB':Math.round(n/1048576)+' MB';
export function mountRuntimePacks({content,api,locale,esc,toast}){
 const w=ui[locale]||ui.zh,panel=document.createElement('section');panel.className='panel runtime-packs';
 const anchor=content.querySelector('.settings-page')||content.firstElementChild;if(!anchor)return()=>{};anchor.before(panel);
 let timer=0,status=null;
 function draw(){
  if(!status)return;const missing=status.packs.filter(p=>!p.installed&&!p.onDemand),busy=status.packs.some(p=>['queued','downloading'].includes(p.job?.state));
  const d=missing.reduce((n,p)=>n+p.size,0),u=missing.reduce((n,p)=>n+p.unpacked,0);
  const rows=status.packs.map(p=>{const j=p.job,state=p.installed?w.installed:j?.state==='downloading'?(j.stage==='unpack'?w.unpack:w.downloading):j?.state==='queued'?w.queued:j?.state==='error'?w.error+(j.error?'：'+j.error:''):w.missing;
   const pct=j?.state==='downloading'&&j.total?Math.min(99,j.received/j.total*100):null;
   return `<div class="model-download"><div class="model-info"><strong>${esc(w[p.id]||p.id)}</strong><span class="settings-help">${mb(p.size)}</span>${p.onDemand?`<span class="settings-help">${esc(w.onDemand)}${p.license?' · '+esc(p.license):''}</span>`:''}<span class="model-state">${esc(state)}</span>${p.onDemand&&p.installed?`<button type="button" class="secondary" data-remove="${esc(p.id)}">${w.remove}</button>`:''}${pct!==null?`<progress max="100" value="${pct.toFixed(1)}"></progress>`:''}</div></div>`;}).join('');
  panel.innerHTML=`<h2 class="panel-title">${w.title}</h2><p class="settings-help">${missing.length?esc(w.help)+'<br>'+esc(w.need.replace('{d}',mb(d)).replace('{u}',mb(u))):esc(w.all)}</p>${rows}${missing.length?`<div class="local-run-controls"><button type="button" class="${busy?'secondary':'primary'}" data-act="${busy?'cancel':'full'}">${busy?w.cancel:w.full}</button></div>`:''}`;
  panel.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{status=await api('pack_uninstall',{id:b.dataset.remove});draw();}catch{toast(w.failed);}}));
  panel.querySelector('[data-act]')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;try{status=await api(b.dataset.act==='cancel'?'pack_cancel':'pack_download',{ids:[]});draw();}catch{toast(w.failed);}});
 }
 async function refresh(){if(!panel.isConnected)return;try{status=await api('pack_status');draw();}catch{}clearTimeout(timer);if(panel.isConnected)timer=setTimeout(refresh,status?.packs.some(p=>['queued','downloading'].includes(p.job?.state))?800:4000);}
 refresh();return()=>clearTimeout(timer);
}
