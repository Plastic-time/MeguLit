// SPDX-License-Identifier: GPL-3.0-or-later
// First launch with an empty shelf: ask once for the folders games live in, save them as library folders,
// look for Steam, then scan. Shown at most once per install (localStorage flag); "Later" also counts.
const KEY='megulit-first-run-folders';
const w={
 zh:{title:'把游戏放上书架',sub:'选一下你放 Galgame 的文件夹，MeguLit 会自己把里面的游戏找出来。Steam 上的游戏也会一起找',pick:'选择游戏文件夹',picked:'已选择',more:'再加一个',scan:'开始扫描',scanning:'正在翻找游戏…',later:'以后再说',hint:'以后可以在「设置 → 游戏库」里随时修改',done:n=>`找到了 ${n} 个游戏`,none:'没有找到游戏，可以换个文件夹，或者用「添加游戏」手动添加',failed:'扫描失败了，稍后在设置里再试一次'},
 en:{title:'Fill your shelf',sub:'Pick the folders where your visual novels live and MeguLit will find the games inside. Steam games are picked up too.',pick:'Choose game folders',picked:'Selected',more:'Add another',scan:'Scan now',scanning:'Looking for games…',later:'Later',hint:'You can change this any time in Settings → Library',done:n=>`Found ${n} games`,none:'No games found. Try another folder, or add one by hand.',failed:'Scan failed. Try again later from Settings.'},
 ja:{title:'本棚にゲームを並べる',sub:'ギャルゲーを置いているフォルダを選ぶと、中のゲームを MeguLit が探します。Steam のゲームも一緒に探します',pick:'ゲームフォルダを選択',picked:'選択済み',more:'もう一つ追加',scan:'スキャン開始',scanning:'ゲームを探しています…',later:'あとで',hint:'あとから「設定 → ライブラリ」で変更できます',done:n=>`${n} 本のゲームが見つかりました`,none:'ゲームが見つかりませんでした。別のフォルダを選ぶか、手動で追加してください',failed:'スキャンに失敗しました。あとで設定から再試行してください'}
};
const seen=()=>{try{return localStorage.getItem(KEY)==='1';}catch{return false;}};
const mark=()=>{try{localStorage.setItem(KEY,'1');}catch{}};
export function maybeFirstRun({gamesCount,api,invoke,locale,esc,toast,onDone}){
 if(gamesCount>0||seen()||document.querySelector('.first-run'))return;
 mark();
 const t=w[locale]||w.zh,folders=[];
 const dialog=document.createElement('dialog');dialog.className='first-run';
 dialog.innerHTML=`<form method="dialog" class="first-run-card">
  <h2>${esc(t.title)}</h2><p class="first-run-sub">${esc(t.sub)}</p>
  <ul class="first-run-list" hidden></ul>
  <button type="button" class="g-btn first-run-pick" data-pick>${esc(t.pick)}</button>
  <p class="first-run-status" role="status"></p>
  <div class="first-run-actions"><button type="button" class="secondary" data-later>${esc(t.later)}</button><button type="button" class="g-btn primary" data-scan disabled>${esc(t.scan)}</button></div>
  <p class="first-run-hint">${esc(t.hint)}</p></form>`;
 document.body.append(dialog);
 const list=dialog.querySelector('.first-run-list'),pick=dialog.querySelector('[data-pick]'),scan=dialog.querySelector('[data-scan]'),status=dialog.querySelector('.first-run-status');
 const draw=()=>{list.hidden=!folders.length;list.innerHTML=folders.map(f=>`<li title="${esc(f)}">${esc(f)}</li>`).join('');pick.textContent=folders.length?t.more:t.pick;scan.disabled=!folders.length;};
 const close=()=>{dialog.close();dialog.remove();};
 pick.onclick=async()=>{try{const paths=await invoke('pick_directories',{multiple:true});for(const p of paths||[])if(p&&!folders.includes(p))folders.push(p);draw();}catch{}};
 dialog.querySelector('[data-later]').onclick=close;
 dialog.addEventListener('cancel',close);
 scan.onclick=async()=>{
  scan.disabled=pick.disabled=true;status.textContent=t.scanning;
  try{
   const data=await api('settings_get').catch(()=>null);const old=String(data?.values?.library?.folders||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const merged=[...new Set([...old,...folders])].join('\n');const values={folders:merged};
   try{const steam=await api('library_find_steam');if(steam?.path)values.steamPath=steam.path;}catch{}
   await api('settings_save',{scope:'library',values});await api('library_scan');
   const home=await api('home').catch(()=>null);const n=home?.games?.length??0;
   toast(n?t.done(n):t.none);close();onDone?.();
  }catch{status.textContent=t.failed;scan.disabled=pick.disabled=false;}
 };
 dialog.showModal();
}
