// SPDX-License-Identifier: GPL-3.0-or-later
import {VERSION} from './about.js';
import {cropAvatarFile,pickImageFile} from './avatar-crop.js';
/* E379 Settings › 联网服务: leaderboard avatar. E388: the picture first goes through the crop window (avatar-crop.js), then is encoded as a still
   WebP of at most 256 px / 64 KB; the relay then checks it with an AI model and shows it only when approved. */
const T={
 zh:{title:'排行榜头像',hint:'上传后会先自动审核，通过后才会在排行榜显示；不能使用成人或暴力内容。不上传就显示名字首字',choose:'选择图片',remove:'移除头像',
  none:'还没有头像',approved:'已通过审核，正在显示',rejected:'没有通过审核，换一张吧',pending:'审核中',hidden:'被多人举报，已隐藏，等待人工复核',
  notJoined:'先在“排行榜”页参加排行榜，才能设置头像',notReady:'联网服务还在准备中，暂时不能上传头像',offline:'暂时连不上联网服务',
  tooBig:'图片压缩后仍然太大，换一张试试',tooSmall:'图片太小了，至少要 32×32',unreadable:'读不出这张图片',uploading:'上传并审核中…',removed:'已移除头像',
  appeal:'判断错了？提交人工复核',appealHint:'会把这张图和审核结果私下发给开发者，人工确认后自动显示',appealing:'提交中…',appealed:'已提交人工复核，处理后会自动更新',openIssue:'查看复核进度',expired:'没有通过审核（图片已过期删除）',
  reasons:{NSFW:'检测到不适合公开的内容',MODERATION_UNCLEAR:'审核结果不明确，按规定不予通过',MODERATION_ERROR:'审核服务出错，按规定不予通过，请稍后再试',MODERATION_UNAVAILABLE:'审核服务暂不可用，请稍后再试',REPORTED:'被举报'}},
 ja:{title:'ランキングのアイコン',hint:'アップロード後に自動審査があり、通過したものだけがランキングに表示されます。成人向け・暴力的な画像は使えません。未設定のときは名前の頭文字を表示します',choose:'画像を選ぶ',remove:'アイコンを削除',
  none:'アイコン未設定',approved:'審査を通過し、表示中です',rejected:'審査を通過しませんでした。別の画像をお試しください',pending:'審査中',hidden:'複数の通報により非表示中（人による確認待ち）',
  notJoined:'先に「ランキング」ページで参加してください',notReady:'オンラインサービスは準備中のため、まだアップロードできません',offline:'オンラインサービスに接続できません',
  tooBig:'圧縮しても大きすぎます。別の画像をお試しください',tooSmall:'画像が小さすぎます（32×32 以上）',unreadable:'この画像を読み込めません',uploading:'アップロードして審査中…',removed:'アイコンを削除しました',
  appeal:'判定が間違い？ 人による確認を依頼',appealHint:'この画像と判定結果を開発者に非公開で送ります。確認後、自動で表示されます',appealing:'送信中…',appealed:'確認を依頼しました。結果は自動で反映されます',openIssue:'確認の進み具合を見る',expired:'審査を通過しませんでした（画像は期限切れで削除）',
  reasons:{NSFW:'公開に適さない内容が検出されました',MODERATION_UNCLEAR:'判定があいまいなため通過できません',MODERATION_ERROR:'審査でエラーが起きたため通過できません。しばらくしてからお試しください',MODERATION_UNAVAILABLE:'審査サービスが利用できません',REPORTED:'通報されました'}},
 en:{title:'Leaderboard picture',hint:'Pictures are checked automatically and appear on the leaderboard only once approved. No adult or violent content. Without one, your initial is shown',choose:'Choose picture',remove:'Remove picture',
  none:'No picture yet',approved:'Approved and shown',rejected:'Not approved; please try another picture',pending:'Being checked',hidden:'Hidden after several reports, waiting for a human review',
  notJoined:'Join on the Leaderboard page first',notReady:'Online services are still being set up',offline:'Cannot reach the online service right now',
  tooBig:'Still too large after compression; try another picture',tooSmall:'The picture is too small (at least 32×32)',unreadable:'Could not read this picture',uploading:'Uploading and checking…',removed:'Picture removed',
  appeal:'Wrong call? Ask for a human review',appealHint:'Sends this picture and the verdict privately to the developer; once approved it shows automatically',appealing:'Sending…',appealed:'Review requested; it updates by itself once handled',openIssue:'See the review',expired:'Not approved (the picture has expired)',
  reasons:{NSFW:'Content not suitable for a public profile',MODERATION_UNCLEAR:'The check was not clear, so it is not approved',MODERATION_ERROR:'The check failed, so it is not approved; try again later',MODERATION_UNAVAILABLE:'The check is unavailable right now',REPORTED:'Reported'}}
};
export async function mountAvatarSettings({content,api,locale,esc,toast}){
 const w=T[locale]||T.zh,panel=document.createElement('section');panel.className='panel leaderboard-avatar-settings';content.append(panel);
 let appeal={appealed:false,issueUrl:''};
 const paint=(status,image='',reason='')=>{
  const ready=!['not-configured','disabled','error'].includes(status);
  const label=status==='expired'?w.expired:status==='not-configured'?w.notReady:status==='disabled'?w.notJoined:status==='error'?w.offline:w[status]||w.none;
  panel.innerHTML=`<h2 class="panel-title">${w.title}</h2><p class="leaderboard-note">${w.hint}</p><div class="leaderboard-avatar-row">${image?`<img class="leaderboard-avatar is-large" src="${esc(image)}" alt="" width="72" height="72">`:'<span class="leaderboard-avatar is-large is-default" aria-hidden="true">?</span>'}<div><p class="leaderboard-avatar-status" data-status="${esc(status)}">${esc(label)}${reason&&w.reasons[reason]?` · ${esc(w.reasons[reason])}`:''}</p>${ready?`<div class="leaderboard-avatar-actions"><button type="button" class="primary" data-avatar-choose>${w.choose}</button>${status!=='none'&&status!=='expired'?`<button type="button" class="leaderboard-leave" data-avatar-remove>${w.remove}</button>`:''}</div>`:''}${status==='rejected'?(appeal.appealed?`<p class="leaderboard-appeal is-sent">${w.appealed}${appeal.issueUrl?` · <button type="button" class="leaderboard-leave" data-avatar-issue>${w.openIssue}</button>`:''}</p>`:`<div class="leaderboard-appeal"><button type="button" class="leaderboard-appeal-button" data-avatar-appeal>${w.appeal}</button><small>${w.appealHint}</small></div>`):''}</div></div>`;
  panel.querySelector('[data-avatar-choose]')?.addEventListener('click',async()=>{const file=await pickImageFile();if(!file)return;let data;try{data=await cropAvatarFile(file,locale);}catch(error){toast(w[error.message]||w.unreadable);return;}if(!data||!panel.isConnected)return;
   const status=panel.querySelector('.leaderboard-avatar-status');status.textContent=w.uploading;panel.querySelectorAll('button').forEach(b=>b.disabled=true);
   try{const r=await api('leaderboard_avatar_set',{data});if(r.state&&r.state!=='ok'){paint(r.state==='error'?'error':r.state);return;}paint(r.status,r.status==='approved'?data:'',r.reason);}catch{toast(w.offline);await load();}});
  panel.querySelector('[data-avatar-appeal]')?.addEventListener('click',async event=>{const b=event.currentTarget;b.disabled=true;b.textContent=w.appealing;
   try{const r=await api('leaderboard_avatar_appeal',{version:VERSION});if(r.state!=='ok'){toast(w.offline);b.disabled=false;b.textContent=w.appeal;return;}appeal={appealed:true,issueUrl:r.issueUrl||''};paint(status,image,reason);}catch{toast(w.offline);b.disabled=false;b.textContent=w.appeal;}});
  panel.querySelector('[data-avatar-issue]')?.addEventListener('click',()=>api('open_source',{url:appeal.issueUrl}).catch(()=>toast(w.offline)));
  panel.querySelector('[data-avatar-remove]')?.addEventListener('click',async()=>{try{await api('leaderboard_avatar_remove');toast(w.removed);}catch{toast(w.offline);}await load();});
 };
 const load=async()=>{try{const r=await api('leaderboard_avatar_status');appeal={appealed:r.appealed===true,issueUrl:r.issueUrl||''};paint(r.state==='ok'?r.status:r.state==='error'?'error':r.state,r.image||'',r.reason||'');}catch{paint('error');}};
 paint('pending');await load();
}
