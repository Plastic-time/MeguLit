/* This view receives UI state from its owner; it does not scan files or restore a game by itself */
const WORDS={
 zh:{scan:'扫描游戏文件夹',lead:'Steam 版没有日文选项，或暂时找不到日文原版资源时，可以先扫描游戏文件夹，看看是否还保留日文剧本\n任何游戏都可以先试一次扫描，工具会说明找到什么、能否恢复\n扫描不会修改游戏文件',pick:'请先选择游戏',idle:'扫描当前选中的游戏目录，不会启动游戏',scanning:'正在扫描游戏文件夹…',wait:'扫描和建立索引需要时间，大型游戏可能更久',cancelling:'已请求停止，正在等待后台扫描结束…',cancelled:'后台已确认扫描停止',preview:'扫描结果',confirm:'确认恢复日文',confirmNote:'确认后才会恢复日文，并沿用现有备份和还原流程。请先关闭游戏',applying:'正在恢复，请等待完成后再关闭',applied:'已恢复日文，可使用原有「还原」按钮撤销',cancel:'停止扫描',cancelConfirm:'返回结果',restore:'恢复日文',retry:'重新扫描',jp:'日文条数',local:'可用本地译文',missing:'缺失译文',localNote:'已有本地配对的译文可直接读取；扫描和建立索引仍需要时间',missingNote:'缺失的译文仍需其它翻译方式，不保证无需在线等待',noLocal:'没有可用的本地译文，不能确认双语恢复',notReady:'尚未确认可安全恢复，游戏文件没有改动',unknown:'扫描未完成，请重新扫描或查看诊断日志',errors:{GAME_RUNNING:'游戏正在运行，请先关闭再扫描或恢复',JP_SCAN_UNSUPPORTED:'暂不支持扫描这种游戏文件，游戏文件没有改动',JP_SCAN_SOURCE_CHANGED:'游戏文件已变化，请重新扫描后再确认',JP_SCAN_EMPTY_TRANSLATION:'没有可用的本地译文，游戏文件没有改动',JP_SCAN_CANCELLED:'后台已确认扫描停止'}},
 en:{scan:'Scan game folder',lead:'If the Steam release has no Japanese option, or you cannot find the Japanese release yet, scan its folder to check for remaining Japanese scripts\nYou can try a scan for any game; the tool explains what it finds and whether restoration is possible\nScanning does not change game files',pick:'Select a game first',idle:'Scan the selected game folder without starting the game',scanning:'Scanning game folder…',wait:'Scanning and indexing take time; large games may take longer',cancelling:'Stop requested; waiting for the background scan to finish…',cancelled:'The background scan confirmed it has stopped',preview:'Scan result',confirm:'Confirm Japanese restore',confirmNote:'Japanese is restored only after confirmation, using the existing backup and undo process. Close the game first',applying:'Restoring; wait for completion before closing',applied:'Japanese restored; use the existing Undo button to revert',cancel:'Stop scan',cancelConfirm:'Back to result',restore:'Restore Japanese',retry:'Scan again',jp:'Japanese lines',local:'Available local translations',missing:'Missing translations',localNote:'Matched local translations can be read directly; scanning and indexing still take time',missingNote:'Missing translations need another translation source; an online wait may still be needed',noLocal:'No local translation is available, so bilingual restoration is unconfirmed',notReady:'Safe restoration is unconfirmed; game files are unchanged',unknown:'The scan did not finish; scan again or check the diagnostic log',errors:{GAME_RUNNING:'The game is running; close it before scanning or restoring',JP_SCAN_UNSUPPORTED:'This game format is not supported by the scan yet; game files are unchanged',JP_SCAN_SOURCE_CHANGED:'Game files changed; scan again before confirming',JP_SCAN_EMPTY_TRANSLATION:'No local translation is available; game files are unchanged',JP_SCAN_CANCELLED:'The background scan confirmed it has stopped'}},
 ja:{scan:'ゲームフォルダーをスキャン',lead:'Steam 版に日本語の選択肢がない場合や、日本語版の素材がまだ見つからない場合は、フォルダーに日本語シナリオが残っているか確認できます\nどのゲームでもまずスキャンを試せます。見つかった内容と復元できるかを表示します\nスキャンではゲームファイルを変更しません',pick:'先にゲームを選んでください',idle:'選択中のゲームフォルダーを調べます。ゲームは起動しません',scanning:'ゲームフォルダーをスキャン中…',wait:'スキャンと索引作成には時間がかかります。大きなゲームでは長くなる場合があります',cancelling:'停止を要求しました。バックグラウンドの処理終了を待っています…',cancelled:'バックグラウンドのスキャン停止を確認しました',preview:'スキャン結果',confirm:'日本語に戻すことを確認',confirmNote:'確認後に日本語へ戻し、既存のバックアップ・元に戻す手順を使います。先にゲームを終了してください',applying:'復元中です。完了するまで閉じないでください',applied:'日本語に戻しました。既存の「元に戻す」ボタンで取り消せます',cancel:'スキャンを停止',cancelConfirm:'結果に戻る',restore:'日本語に戻す',retry:'再スキャン',jp:'日本語の行数',local:'利用できるローカル訳',missing:'不足している訳',localNote:'一致したローカル訳は直接読めますが、スキャンと索引作成には時間がかかります',missingNote:'不足分には別の翻訳手段が必要です。オンラインの待ち時間がなくなるとは限りません',noLocal:'利用できるローカル訳がなく、二言語の復元は確認できません',notReady:'安全に復元できることは未確認です。ゲームファイルは変更していません',unknown:'スキャンが完了しませんでした。再スキャンするか診断ログを確認してください',errors:{GAME_RUNNING:'ゲームが起動中です。終了してからスキャンまたは復元してください',JP_SCAN_UNSUPPORTED:'この形式のスキャンにはまだ対応していません。ゲームファイルは変更していません',JP_SCAN_SOURCE_CHANGED:'ゲームファイルが変わりました。確認前に再スキャンしてください',JP_SCAN_EMPTY_TRANSLATION:'利用できるローカル訳がありません。ゲームファイルは変更していません',JP_SCAN_CANCELLED:'バックグラウンドのスキャン停止を確認しました'}}
};
const PHASES=new Set(['idle','scanning','cancelling','cancelled','preview','confirm','applying','applied','error']);
const ERROR_ALIASES={SCAN_STALE:'JP_SCAN_SOURCE_CHANGED',EMBEDDED_UNSUPPORTED:'JP_SCAN_UNSUPPORTED',EMBEDDED_CONFLICT:'JP_SCAN_SOURCE_CHANGED'};
export const originalScanWords=locale=>WORDS[locale]||WORDS.zh;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;

/* Counts arrive through a backend adapter; malformed totals never become an actionable preview */
export function originalScanPresentation(state={},locale='zh'){
 const t=originalScanWords(locale),phase=PHASES.has(state.phase)?state.phase:'error';
 const p=state.preview,valid=!!p&&count(p.japanese)&&count(p.local)&&count(p.missing)&&p.local+p.missing===p.japanese;
 const hasGame=typeof state.gameId==='string'&&state.gameId.length>0;
 const ready=valid&&p.japanese>0&&p.local>0&&p.canRestore===true;
 const progress=state.progress;
 const knownProgress=!!progress&&count(progress.done)&&count(progress.total)&&progress.total>0&&progress.done<=progress.total;
 return {phase,lead:t.lead,status:phase==='error'?(t.errors[ERROR_ALIASES[state.error]||state.error]||t.unknown):t[phase]||t.unknown,
  showCounts:valid&&['preview','confirm','applying','applied'].includes(phase),counts:valid?[p.japanese,p.local,p.missing]:[],
  localNote:valid&&p.local>0?t.localNote:valid?t.noLocal:'',missingNote:valid&&p.missing>0?t.missingNote:'',
  canScan:hasGame&&!['scanning','cancelling','applying'].includes(phase),canCancel:['scanning','cancelling'].includes(phase),
  cancelPending:phase==='cancelling',showRestore:phase==='preview',canRestore:hasGame&&ready&&phase==='preview',
  showConfirm:phase==='confirm',canConfirm:hasGame&&ready&&phase==='confirm',
  blockedNote:phase==='preview'&&!ready?(valid&&p.local===0?t.noLocal:t.notReady):'',
  progressVisible:['scanning','cancelling'].includes(phase),progressValue:knownProgress?Math.floor(progress.done*100/progress.total):null,
  progressText:knownProgress?progress.done.toLocaleString(locale)+' / '+progress.total.toLocaleString(locale):t.wait,
  closeAllowed:phase!=='applying'};
}

export function mountOriginalScanView(container,{locale='zh',actions={}}={}){
 const doc=container.ownerDocument,t=originalScanWords(locale),section=doc.createElement('section');
 section.className='jr-folder-scan';
 section.innerHTML='<p class="jr-folder-scan-lead"></p><p class="settings-help" role="status" aria-live="polite" data-os-status></p><div data-os-progress><progress max="100"></progress><p class="settings-help" data-os-progress-text></p></div><dl class="jr-folder-scan-counts" data-os-counts></dl><p class="settings-help" data-os-local></p><p class="settings-help" data-os-missing></p><p class="settings-help" data-os-blocked></p><p class="settings-help" data-os-confirm-note></p><div class="jr-folder-scan-actions"><button type="button" class="secondary" data-os-scan></button><button type="button" class="secondary" data-os-cancel></button><button type="button" class="primary" data-os-restore></button><button type="button" class="secondary" data-os-back></button><button type="button" class="primary" data-os-confirm></button></div>';
 const node=selector=>section.querySelector(selector),buttons={scan:node('[data-os-scan]'),cancel:node('[data-os-cancel]'),restore:node('[data-os-restore]'),back:node('[data-os-back]'),confirm:node('[data-os-confirm]')};
 node('.jr-folder-scan-lead').textContent=t.lead;
 for(const [name,button] of Object.entries(buttons)){button.textContent=t[{scan:'scan',cancel:'cancel',restore:'restore',back:'cancelConfirm',confirm:'confirm'}[name]];button.addEventListener('click',()=>{if(!button.disabled&&!button.hidden)actions[name]?.();});}
 for(const label of [t.jp,t.local,t.missing]){const row=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;row.append(dt,dd);node('[data-os-counts]').append(row);}
 container.append(section);let disposed=false;
 function render(state){if(disposed)return;const v=originalScanPresentation(state,locale);section.dataset.phase=v.phase;section.setAttribute('aria-busy',String(['scanning','cancelling','applying'].includes(v.phase)));node('[data-os-status]').textContent=v.status;
  const progress=node('progress');if(v.progressValue===null)progress.removeAttribute('value');else progress.value=v.progressValue;
  node('[data-os-progress]').hidden=!v.progressVisible;node('[data-os-progress-text]').textContent=v.progressText;
  const counts=node('[data-os-counts]');counts.hidden=!v.showCounts;counts.querySelectorAll('dd').forEach((dd,i)=>{dd.textContent=v.counts[i]===undefined?'':v.counts[i].toLocaleString(locale);});
  for(const [selector,value] of [['[data-os-local]',v.localNote],['[data-os-missing]',v.missingNote],['[data-os-blocked]',v.blockedNote]]){node(selector).textContent=value;node(selector).hidden=!value;}
  node('[data-os-confirm-note]').textContent=t.confirmNote;node('[data-os-confirm-note]').hidden=!v.showConfirm;
  buttons.scan.disabled=!v.canScan;buttons.scan.textContent=v.phase==='idle'?t.scan:t.retry;
  buttons.cancel.hidden=!v.canCancel;buttons.cancel.disabled=v.cancelPending;
  buttons.restore.hidden=!v.showRestore;buttons.restore.disabled=!v.canRestore;
  buttons.confirm.hidden=!v.showConfirm;buttons.confirm.disabled=!v.canConfirm;buttons.back.hidden=!v.showConfirm;
 }
 render({phase:'idle'});
 return {render,dispose(){disposed=true;section.remove();}};
}
