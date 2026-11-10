// SPDX-License-Identifier: GPL-3.0-or-later
/* E362 one-click diagnostic package: build the zip locally, show exactly what is inside, then reveal or upload it */
import {VERSION} from './about.js';
const ISSUES='https://github.com/ilynthn/MeguLit/issues/new';
const T={
 zh:{button:'生成诊断包',kicker:'诊断包',building:'正在整理这个游戏的日志…',title:'诊断包已生成',hint:'只在本机生成，还没有发送给任何人。下面就是压缩包里的全部内容',privacy:'Windows 用户名和用户目录已换成占位符，邮箱已删除',reveal:'打开所在文件夹',upload:'上传',uploading:'上传中…',close:'关闭',info:'查看 info.json',manual:'上传通道还没开通：压缩包已经准备好，可以直接发到 QQ 群、邮件，或附在 GitHub Issue 里',issue:'打开 GitHub Issue',uploaded:'已上传',openIssue:'打开反馈页',failed:'上传失败，可以改为手动发送',buildFailed:'诊断包生成失败',kinds:{info:'游戏、引擎、版本、系统、零延迟与内嵌记录',log:'这个游戏运行期间的日志',screenshot:'磁盘上已有的截图',readme:'说明'}},
 ja:{button:'診断パッケージを作成',kicker:'診断パッケージ',building:'このゲームのログをまとめています…',title:'診断パッケージを作成しました',hint:'このPCに作っただけで、まだ誰にも送っていません。中身は以下ですべてです',privacy:'Windows のユーザー名とユーザーフォルダーは置き換え、メールアドレスは削除しました',reveal:'フォルダーを開く',upload:'アップロード',uploading:'アップロード中…',close:'閉じる',info:'info.json を見る',manual:'アップロード先はまだ準備中です。zip はできているので、QQ グループやメール、GitHub Issue に添付して送ってください',issue:'GitHub Issue を開く',uploaded:'アップロードしました',openIssue:'報告ページを開く',failed:'アップロードに失敗しました。手動で送ってください',buildFailed:'診断パッケージを作成できませんでした',kinds:{info:'ゲーム・エンジン・バージョン・OS・ゼロ遅延と埋め込みの記録',log:'このゲームの実行中のログ',screenshot:'ディスクにあるスクリーンショット',readme:'説明'}},
 en:{button:'Diagnostic package',kicker:'Diagnostics',building:'Collecting this game\'s logs…',title:'Diagnostic package ready',hint:'Created on this PC only and not sent anywhere yet. This is everything inside the zip',privacy:'The Windows user name and profile folder are replaced with placeholders; e-mail addresses are removed',reveal:'Show in folder',upload:'Upload',uploading:'Uploading…',close:'Close',info:'View info.json',manual:'Uploading is not set up yet: the zip is ready to send by hand in the QQ group, by e-mail, or attached to a GitHub issue',issue:'Open a GitHub issue',uploaded:'Uploaded',openIssue:'Open the report',failed:'Upload failed; send the zip by hand instead',buildFailed:'Could not create the diagnostic package',kinds:{info:'Game, engine, version, OS, zero-latency and embed records',log:'Logs from this game\'s runs',screenshot:'A screenshot already on disk',readme:'Readme'}}};
export const diagnosticsLabel=locale=>(T[locale]||T.en).button;
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
export async function openDiagnostics({api,id,locale,esc,toast}){
 const t=T[locale]||T.en,dialog=document.createElement('dialog');dialog.className='game-dialog diag-dialog';
 dialog.innerHTML=`<div class="game-dialog-head"><span class="game-dialog-kicker">${t.kicker}</span><h2>${t.building}</h2></div><div class="diag-body" aria-busy="true"><div class="diag-progress" aria-hidden="true"></div></div>`;
 document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 let pack;try{pack=await api('diagnostics_build',{id,version:VERSION});}catch{dialog.close();toast(t.buildFailed);return;}
 if(!dialog.isConnected)return;
 const info=pack.entries.find(e=>e.kind==='info');
 dialog.innerHTML=`<div class="game-dialog-head"><span class="game-dialog-kicker">${t.kicker} · ${esc(pack.game.title)}</span><h2>${t.title}</h2><p>${t.hint}</p></div>
<div class="diag-body"><p class="diag-file" title="${esc(pack.path)}">${esc(pack.name)} <span>${size(pack.bytes)}</span></p>
<ul class="diag-entries">${pack.entries.map(e=>`<li><code>${esc(e.name)}</code><span>${esc(t.kinds[e.kind]||'')}</span><em>${size(e.bytes)}</em></li>`).join('')}</ul>
<p class="diag-privacy">${t.privacy}</p>${info?.preview?`<details class="diag-preview"><summary>${t.info}</summary><pre>${esc(info.preview)}</pre></details>`:''}
<p class="diag-status" role="status" aria-live="polite"></p></div>
<div class="dialog-actions"><button class="text-button" data-close>${t.close}</button><button class="secondary" data-reveal>${t.reveal}</button><button class="primary" data-upload>${t.upload}</button></div>`;
 const status=dialog.querySelector('.diag-status'),uploadButton=dialog.querySelector('[data-upload]');
 const link=(label,url)=>{const b=document.createElement('button');b.type='button';b.className='text-button diag-link';b.textContent=label;b.onclick=()=>api('open_source',{url}).catch(()=>{});return b;};
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.querySelector('[data-reveal]').onclick=()=>api('diagnostics_reveal',{path:pack.path}).catch(()=>toast(t.buildFailed));
 uploadButton.onclick=async()=>{
  uploadButton.disabled=true;uploadButton.textContent=t.uploading;status.textContent='';let result;
  try{result=await api('diagnostics_upload',{path:pack.path,meta:{version:pack.version,game:pack.game}});}catch{result={state:'failed'};}
  if(!dialog.isConnected)return;uploadButton.textContent=t.upload;
  if(result.state==='uploaded'){status.textContent=t.uploaded;status.dataset.state='ok';if(result.issueUrl)status.append(' ',link(t.openIssue,result.issueUrl));return;}
  uploadButton.disabled=false;status.dataset.state=result.state==='not-configured'?'manual':'bad';status.textContent=result.state==='not-configured'?t.manual:t.failed;status.append(' ',link(t.issue,ISSUES));
 };
}
