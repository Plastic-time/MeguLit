import {receiptView} from './seed-receipt.js';
import {chineseProfileLayer,chineseProfileSetting} from './profile-summary.js';
// SPDX-License-Identifier: GPL-3.0-or-later
/* The game detail card polls the existing receiver and exposes sharing controls only in ordinary calibration states. */
const W={
 zh:{eyebrow:'传火计划',cr:{anon:n=>n?'当前显示为「'+n+'」':'当前是匿名',named:n=>'已署名：'+n,ph:'署名（最多 30 字，可不填）',sign:'署名',skip:'不署名',edit:'修改',undo:'撤回',privacy:'署名会公开给之后玩同一版本的玩家看；不填就是匿名',local:'已保存在这台电脑上，连上服务器后会同步',failed:'没保存成功，稍后再试',from:(who,at)=>'这个游戏的适配来自 '+who+(at?' · '+at:'')},tags:['游戏闪退（也算）','打不开','卡住','日文没出来或点不了','翻译不显示或错位','内嵌用不了','选项没翻译','文字闪烁或重叠','其他任何问题'],hint:['遇到这些或其他任何问题，直接点上方「','反馈','」简单说说并上传，我们会手动修复，通常 12 小时到 1 周'],
  first:{title:'可参与此版本的首个公开传火贡献',body:'此版本暂无已发布适配。启动游戏后可继续游玩约 3 至 8 分钟，让自动校准收集数据。普通校准通过病毒扫描后会自动签名发布',note:'约 3 至 8 分钟 · 自动校准'},
  off:{title:'打开共享适配，就能参与传火',body:'此版本暂无已发布适配。开启共享适配后，自动校准结果可以提交病毒扫描',button:'打开共享适配',busy:'正在打开…',failed:'没打开成功，稍后再试'},
  thanks:{title:'感谢你的分享',body:'你的校准结果已上传',note:'已上传'}},
 en:{eyebrow:'Pass the flame',cr:{anon:n=>n?'Shown as '+n:'Shown as anonymous',named:n=>'Credited as: '+n,ph:'Name (up to 30 characters, optional)',sign:'Add name',skip:'Stay anonymous',edit:'Edit',undo:'Withdraw',privacy:'Your name is shown to players of the same version; leave it empty to stay anonymous',local:'Saved on this PC, it syncs when the server is reachable',failed:'Could not save, try again later',from:(who,at)=>'The adaptation for this game comes from '+who+(at?' · '+at:'')},tags:['Game crashes (counts too)','Will not open','Freezes','Japanese missing or not clickable','Translation missing or misplaced','Embedding does not work','Choices not translated','Text flickers or overlaps','Anything else'],hint:['Any of these, or any other problem: just click ','Feedback',' at the top, describe it briefly and upload it; we fix it by hand, usually within 12 hours to a week'],
  first:{title:'Help make this version’s first public contribution',body:'No adaptation is published for this version yet. After launching the game, play for about 3 to 8 minutes to let automatic calibration collect data. Ordinary calibrations are signed and published automatically after a clean virus scan',note:'About 3 to 8 minutes · automatic calibration'},
  off:{title:'Turn on shared adaptation to take part',body:'No adaptation is published for this version yet. Enable shared adaptation to let automatic calibration submit its results for virus scanning',button:'Turn on shared adaptation',busy:'Turning on…',failed:'Could not turn it on, try again later'},
  thanks:{title:'Thank you for sharing',body:'Your calibration was uploaded',note:'Uploaded'}},
 ja:{eyebrow:'火を継ぐ計画',cr:{anon:n=>n?'「'+n+'」として表示されます':'匿名で表示されます',named:n=>'表示名：'+n,ph:'表示名（30 文字まで・任意）',sign:'名前を付ける',skip:'匿名のまま',edit:'変更',undo:'取り消す',privacy:'名前は同じバージョンを遊ぶプレイヤーに公開されます。空欄なら匿名です',local:'この PC に保存しました。サーバーに接続できたら同期します',failed:'保存できませんでした。あとでもう一度',from:(who,at)=>'このゲームの適応の提供元：'+who+(at?' · '+at:'')},tags:['ゲームが落ちる（これも対象）','起動しない','固まる','日本語が出ない・押せない','翻訳が出ない・ずれる','埋め込みが使えない','選択肢が未翻訳','文字がちらつく・重なる','その他なんでも'],hint:['これらやその他の問題があれば、上の「','フィードバック','」から状況を簡単に書いて送ってください。手動で修正します（通常 12 時間〜1 週間）'],
  first:{title:'このバージョンで最初の公開貢献に参加できます',body:'このバージョンの公開済み適応はありません。起動後に約 3〜8 分プレイすると、自動調整のデータを収集できます。通常の調整データはウイルス検査後、自動署名して公開されます',note:'約 3〜8 分 · 自動調整'},
  off:{title:'共有適応をオンにすると参加できます',body:'このバージョンの公開済み適応はありません。共有適応をオンにすると、自動調整の結果をウイルス検査に提出できます',button:'共有適応をオンにする',busy:'オンにしています…',failed:'オンにできませんでした。あとでもう一度'},
  thanks:{title:'共有ありがとうございます',body:'自動調整の結果を送信しました',note:'送信済み'}}};
const scanStatus={
 zh:{pending:'已排队，扫描服务暂不可用时会自动重试',published:'已通过病毒扫描，服务端已签名发布',quarantined:'扫描发现风险，此次提交已隔离',superseded:'已有更新版本',blocked:'此次提交已停止发布'},
 ja:{pending:'検査待ちです。サービス復旧後に自動で再試行します',published:'検査を通過し、署名して公開されました',quarantined:'検査で検出され、隔離されました',superseded:'新しい版があります',blocked:'このデータの公開は停止されました'},
 en:{pending:'Queued for scanning. The server retries automatically',published:'Scanned, signed and published',quarantined:'The scanner detected a threat. This submission is quarantined',superseded:'A newer revision is available',blocked:'Publication of this submission was blocked'}
};
export const feedbackIssueLabels=locale=>(W[locale]||W.zh).tags;
const POLL_MS=20000,RECEIPT_POLL_MS=60000;
export function mountFirstPlayer({host,id,api,locale,esc,isCurrent=()=>true,placement='main'}){
 if(!host)return;const w=W[locale]||W.zh;let timer=0,shown='',dead=false,epoch=0,inflight=false,failures=0,mutating=false,pendingRender=false;
 const box=document.createElement('section');box.className='first-player';box.hidden=true;box.setAttribute('aria-live','polite');host.after(box);
 const decidedKey='megulit-fp-anon:'+id;const decided=()=>{try{return localStorage.getItem(decidedKey)==='1';}catch{return false;}};const decide=v=>{try{v?localStorage.setItem(decidedKey,'1'):localStorage.removeItem(decidedKey);}catch{}};
 let last={state:'hidden'},mode='view',credErr='';
 /* the credit box of the thank-you: ask (input + sign / stay anonymous), or show the name / alias with the way back. Names are plain text (esc). */
 const creditHTML=cr=>{const c=cr||{torchNo:0,name:null},q=w.cr,named=!!c.name,ask=mode==='edit'||(!named&&!decided());
  if(ask)return `<div class="first-player-credit"><div class="first-player-credit-row"><input type="text" maxlength="30" data-fp-name value="${esc(c.name||'')}" placeholder="${esc(q.ph)}" aria-label="${esc(q.ph)}"><button type="button" class="primary" data-fp-sign>${esc(q.sign)}</button><button type="button" class="secondary" data-fp-skip>${esc(q.skip)}</button></div><span class="first-player-privacy">${esc(q.privacy)}</span>${c.alias&&!named?`<span class="first-player-who">${esc(q.anon(c.alias))}</span>`:''}${credErr?`<span class="first-player-fail">${esc(credErr)}</span>`:''}</div>`;
  return `<div class="first-player-credit"><div class="first-player-credit-row"><span class="first-player-who">${esc(named?q.named(c.name):q.anon(c.alias))}</span>${named?`<button type="button" class="secondary" data-fp-edit>${esc(q.edit)}</button><button type="button" class="secondary" data-fp-undo>${esc(q.undo)}</button>`:`<button type="button" class="secondary" data-fp-edit>${esc(q.sign)}</button>`}</div>${c.synced===false?`<span class="first-player-privacy">${esc(q.local)}</span>`:''}${credErr?`<span class="first-player-fail">${esc(credErr)}</span>`:''}</div>`;};
 const render=(r,{failed=false,busy=false}={})=>{if(dead)return;const state=r.state;const t=w[state]||{},cr=r.credit||null,received=['received','installing','install-failed','not-published','bundled'].includes(state),receipt=received?receiptView(r,{locale,esc}):null,sig=state+String(r.ordinary||'')+(failed?'!':'')+(busy?'…':'')+mode+credErr+String(r.key||'')+String(r.presentation||'')+JSON.stringify(r.application)+JSON.stringify(cr)+(receipt?.signature||'')+(decided()?'d':'');if(sig===shown)return;
  /* a poll never replaces a box the player is typing in */
  if(box.contains(document.activeElement)&&shown){pendingRender=true;return;}pendingRender=false;if(state==='hidden'){box.hidden=true;box.innerHTML='';shown='';return;}shown=sig;box.dataset.state=state;
  const application=r.application;
  const chinese=locale!=='en'&&locale!=='ja';
  const labels=({en:['Applied this session','Retained local settings','None'],ja:['今回適用','保持したローカル設定','なし']})[locale]||['本次应用','保留的本机设置','无'];
  const settings=keys=>keys.map(key=>{const value=application.values?.[key];
   if(chinese)return chineseProfileSetting(key,value);
   return typeof value==='boolean'||typeof value==='number'||typeof value==='string'?key+' = '+value:key;
  }).join(chinese?'；':', ')||labels[2];
  const applied=application?application.layers.map(x=>'<p>'+esc(labels[0])+' · '+
   (chinese?esc(chineseProfileLayer(x.layer,x.revision)):esc(x.layer)+' rev '+esc(String(x.revision??'？')))+
   ' · '+esc(settings(x.keys))+'</p>').join('')+'<p>'+esc(labels[1])+' · '+esc(settings(application.personal))+'</p>':'';
  if(state==='applied'){box.innerHTML=applied;box.hidden=false;return;}
  if(received){box.innerHTML=`<div class="first-player-copy">${receipt.html}${applied}</div>`;box.hidden=false;return;}
  const lower=state==='off'?`<div class="first-player-act"><button type="button" class="primary" data-fp-share ${busy?'disabled':''}>${esc(busy?t.busy:t.button)}</button>${failed?`<span class="first-player-fail">${esc(t.failed)}</span>`:''}</div>`:state==='thanks'?(r.isolated?'':creditHTML(cr)):`<span class="first-player-note">${esc(t.note)}</span>`;
  box.innerHTML=`<div class="first-player-copy"><div class="first-player-head"><span class="first-player-eyebrow">${esc(w.eyebrow)}</span><h2>${esc(t.title)}</h2></div><p>${esc(state==='thanks'&&(scanStatus[locale]||scanStatus.zh)[r.ordinary]||t.body)}</p>${lower}${applied}<ul class="first-player-tags" aria-hidden="true">${w.tags.map((x,i)=>`<li${i===0?' class="is-key"':''}>${esc(x)}</li>`).join('')}</ul><p class="first-player-hint">${esc(w.hint[0])}<button type="button" class="first-player-link" data-fp-feedback>${esc(w.hint[1])}</button>${esc(w.hint[2])}</p></div>`;box.hidden=false;
  /* the same entry as the top bar's feedback button (app.js openFeedback): click it instead of building a second one */
  box.querySelector('[data-fp-feedback]').onclick=()=>document.querySelector('[data-top-feedback]')?.click();
  if((state==='first'||state==='thanks')&&r.key){
   const label=document.createElement('label'),select=document.createElement('select');
   label.textContent=({ja:'確認した本文表示 ',en:'Confirm the game text layout '})[locale]||'确认游戏实际排版 ';
   const mixed=({ja:'混在',en:'Mixed'})[locale]||'混合';
   for(const [value,text] of [['','—'],['adv','ADV'],['nvl','NVL'],['mixed',mixed]])select.add(new Option(text,value));
   select.value=r.presentation||'';select.options[0].disabled=true;label.append(select);box.append(label);
   select.onchange=async()=>{select.disabled=true;try{await api('first_player_layout',{id,key:r.key,mode:select.value});}catch{select.value=r.presentation||'';label.append(w.off.failed);}finally{select.disabled=false;}};
  }
  const b=box.querySelector('[data-fp-share]');if(b)b.onclick=async()=>{if(dead||mutating)return;mutating=true;const token=epoch;b.disabled=true;b.textContent=t.busy;try{await api('first_player_share',{});if(dead||token!==epoch)return;mutating=false;await load(false);}catch{if(!dead&&token===epoch){shown='';render({state:'off'},{failed:true});}}finally{mutating=false;schedule();}};
  const save=async name=>{if(mutating||dead)return;mutating=true;const token=epoch,base=last;credErr='';try{const res=await api('first_player_credit',{id,name});if(dead||token!==epoch||!isCurrent())return;if(!res||res.state==='failed')credErr=w.cr.failed;else{if(last===base)last={...last,credit:res.credit};decide(!name);mode='view';}}catch{if(!dead&&token===epoch)credErr=w.cr.failed;}finally{mutating=false;}if(dead||token!==epoch)return;shown='';render(last);};
  const input=box.querySelector('[data-fp-name]');
  if(input){box.querySelector('[data-fp-sign]').onclick=()=>{const v=input.value.trim();if(v)save(v);else input.focus();};box.querySelector('[data-fp-skip]').onclick=()=>save(null);input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();box.querySelector('[data-fp-sign]').click();}};}
  const ed=box.querySelector('[data-fp-edit]');if(ed)ed.onclick=()=>{mode='edit';credErr='';shown='';render(last);box.querySelector('[data-fp-name]')?.focus();};
  const un=box.querySelector('[data-fp-undo]');if(un)un.onclick=()=>save(null);};
 const visible=()=>!dead&&isCurrent()&&box.isConnected&&!document.hidden&&document.hasFocus();
 function dispose(){if(dead)return;dead=true;epoch++;clearTimeout(timer);timer=0;document.removeEventListener('visibilitychange',visibility);removeEventListener('focus',visibility);removeEventListener('blur',visibility);box.removeEventListener('focusout',leaveInput);box.remove();}
 function schedule(){clearTimeout(timer);timer=0;if(dead)return;if(!isCurrent()||!box.isConnected){dispose();return;}if(!visible())return;
  const normal=['received','hidden','not-published','bundled'].includes(last.state)?RECEIPT_POLL_MS:POLL_MS,delay=Math.min(120000,normal*2**Math.min(failures,2));timer=setTimeout(()=>load(false),delay);}
 async function load(first=false){if(dead||inflight||mutating||!visible()){schedule();return;}inflight=true;const token=epoch;try{
  const r=await api('first_player',{id,poll:!first});if(dead||token!==epoch||!visible())return;failures=0;
  const state=r&&['first','off','thanks','received','installing','install-failed','not-published','bundled','applied'].includes(r.state)?r.state:'hidden';last=state==='hidden'?{state}:r;render(last);
 }catch{if(!dead&&token===epoch)failures++;}finally{inflight=false;schedule();}}
 function visibility(){epoch++;clearTimeout(timer);timer=0;if(!isCurrent()||!box.isConnected){dispose();return;}if(visible()){if(pendingRender&&!box.contains(document.activeElement))render(last);load(false);}}
 function leaveInput(){queueMicrotask(()=>{if(!dead&&pendingRender&&!box.contains(document.activeElement))render(last);});}
 document.addEventListener('visibilitychange',visibility);addEventListener('focus',visibility);addEventListener('blur',visibility);box.addEventListener('focusout',leaveInput);
 /* where the card sits (it survives tab swaps, so it is moved, not re-created): tabs = a slim strip under the tab bar (every tab),
    main = top of the overview's left column, aside = top of its right column; other tabs keep it under the tab bar */
 const place=(tab='overview')=>{const root=host.closest('.main')||document;const tabs=root.querySelector('.detail-tabs');let to=null;
  if(tab==='overview'&&placement==='main')to=root.querySelector('.detail-main');else if(tab==='overview'&&placement==='aside')to=root.querySelector('.detail-aside');
  if(to){if(box.parentNode!==to||to.firstChild!==box)to.prepend(box);}else if(tabs&&tabs.nextElementSibling!==box)tabs.after(box);box.dataset.place=to?placement:'tabs';};
 place('overview');load(true);return {place,dispose,refresh:()=>load(false)};
}
