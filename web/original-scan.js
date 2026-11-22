/* This view receives UI state from its owner; it does not scan files or restore a game by itself */
const WORDS={
 zh:{scan:'扫描游戏文件夹',lead:'Steam 版没有日文选项，或暂时找不到日文原版资源时，可以先扫描游戏文件夹，看看是否还保留日文剧本\n任何游戏都可以先试一次扫描，工具会说明找到什么、能否恢复\n扫描不会修改游戏文件',pick:'请先选择游戏',idle:'扫描当前选中的游戏目录，不会启动游戏',scanning:'正在扫描游戏文件夹…',wait:'扫描和建立索引需要时间，大型游戏可能更久',cancelling:'已请求停止，正在等待后台扫描结束…',cancelled:'后台已确认扫描停止',preview:'扫描结果',confirm:'确认恢复日文',confirmNote:'确认后才会恢复日文，并沿用现有备份和还原流程。请先关闭游戏',applying:'正在恢复，请等待完成后再关闭',applied:'已恢复日文，可使用原有「还原」按钮撤销',cancel:'停止扫描',cancelConfirm:'返回结果',restore:'恢复日文',retry:'重新扫描',jp:'日文条数',local:'可用本地译文',missing:'缺失译文',localNote:'已有本地配对的译文可直接读取；扫描和建立索引仍需要时间',missingNote:'缺失的译文仍需其它翻译方式，不保证无需在线等待',noLocal:'没有可用的本地译文，不能确认双语恢复',notReady:'尚未确认可安全恢复，游戏文件没有改动',unknown:'扫描未完成，请重新扫描或查看诊断日志',errors:{GAME_RUNNING:'游戏正在运行，请先关闭再扫描或恢复',JP_SCAN_UNSUPPORTED:'暂不支持扫描这种游戏文件，游戏文件没有改动',JP_SCAN_SOURCE_CHANGED:'游戏文件已变化，请重新扫描后再确认',JP_SCAN_EMPTY_TRANSLATION:'没有可用的本地译文，游戏文件没有改动',JP_SCAN_CANCELLED:'后台已确认扫描停止'}},
 en:{scan:'Scan game folder',lead:'If the Steam release has no Japanese option, or you cannot find the Japanese release yet, scan its folder to check for remaining Japanese scripts\nYou can try a scan for any game; the tool explains what it finds and whether restoration is possible\nScanning does not change game files',pick:'Select a game first',idle:'Scan the selected game folder without starting the game',scanning:'Scanning game folder…',wait:'Scanning and indexing take time; large games may take longer',cancelling:'Stop requested; waiting for the background scan to finish…',cancelled:'The background scan confirmed it has stopped',preview:'Scan result',confirm:'Confirm Japanese restore',confirmNote:'Japanese is restored only after confirmation, using the existing backup and undo process. Close the game first',applying:'Restoring; wait for completion before closing',applied:'Japanese restored; use the existing Undo button to revert',cancel:'Stop scan',cancelConfirm:'Back to result',restore:'Restore Japanese',retry:'Scan again',jp:'Japanese lines',local:'Available local translations',missing:'Missing translations',localNote:'Matched local translations can be read directly; scanning and indexing still take time',missingNote:'Missing translations need another translation source; an online wait may still be needed',noLocal:'No local translation is available, so bilingual restoration is unconfirmed',notReady:'Safe restoration is unconfirmed; game files are unchanged',unknown:'The scan did not finish; scan again or check the diagnostic log',errors:{GAME_RUNNING:'The game is running; close it before scanning or restoring',JP_SCAN_UNSUPPORTED:'This game format is not supported by the scan yet; game files are unchanged',JP_SCAN_SOURCE_CHANGED:'Game files changed; scan again before confirming',JP_SCAN_EMPTY_TRANSLATION:'No local translation is available; game files are unchanged',JP_SCAN_CANCELLED:'The background scan confirmed it has stopped'}},
 ja:{scan:'ゲームフォルダーをスキャン',lead:'Steam 版に日本語の選択肢がない場合や、日本語版の素材がまだ見つからない場合は、フォルダーに日本語シナリオが残っているか確認できます\nどのゲームでもまずスキャンを試せます。見つかった内容と復元できるかを表示します\nスキャンではゲームファイルを変更しません',pick:'先にゲームを選んでください',idle:'選択中のゲームフォルダーを調べます。ゲームは起動しません',scanning:'ゲームフォルダーをスキャン中…',wait:'スキャンと索引作成には時間がかかります。大きなゲームでは長くなる場合があります',cancelling:'停止を要求しました。バックグラウンドの処理終了を待っています…',cancelled:'バックグラウンドのスキャン停止を確認しました',preview:'スキャン結果',confirm:'日本語に戻すことを確認',confirmNote:'確認後に日本語へ戻し、既存のバックアップ・元に戻す手順を使います。先にゲームを終了してください',applying:'復元中です。完了するまで閉じないでください',applied:'日本語に戻しました。既存の「元に戻す」ボタンで取り消せます',cancel:'スキャンを停止',cancelConfirm:'結果に戻る',restore:'日本語に戻す',retry:'再スキャン',jp:'日本語の行数',local:'利用できるローカル訳',missing:'不足している訳',localNote:'一致したローカル訳は直接読めますが、スキャンと索引作成には時間がかかります',missingNote:'不足分には別の翻訳手段が必要です。オンラインの待ち時間がなくなるとは限りません',noLocal:'利用できるローカル訳がなく、二言語の復元は確認できません',notReady:'安全に復元できることは未確認です。ゲームファイルは変更していません',unknown:'スキャンが完了しませんでした。再スキャンするか診断ログを確認してください',errors:{GAME_RUNNING:'ゲームが起動中です。終了してからスキャンまたは復元してください',JP_SCAN_UNSUPPORTED:'この形式のスキャンにはまだ対応していません。ゲームファイルは変更していません',JP_SCAN_SOURCE_CHANGED:'ゲームファイルが変わりました。確認前に再スキャンしてください',JP_SCAN_EMPTY_TRANSLATION:'利用できるローカル訳がありません。ゲームファイルは変更していません',JP_SCAN_CANCELLED:'バックグラウンドのスキャン停止を確認しました'}}
};
const PHASES=new Set(['idle','scanning','cancelling','cancelled','preview','confirm','applying','applied','error']);
const ERROR_ALIASES={SCAN_STALE:'JP_SCAN_SOURCE_CHANGED',EMBEDDED_UNSUPPORTED:'JP_SCAN_UNSUPPORTED',EMBEDDED_CONFLICT:'JP_SCAN_SOURCE_CHANGED'};
Object.assign(WORDS.zh,{sources:'已检查的游戏文件'});Object.assign(WORDS.en,{sources:'Checked game files'});Object.assign(WORDS.ja,{sources:'確認したゲームファイル'});
Object.assign(WORDS.zh,{refresh:'重新查询进度',undoing:'正在还原，请等待完成后再关闭'});Object.assign(WORDS.en,{refresh:'Check progress again',undoing:'Undoing; wait for completion before closing'});Object.assign(WORDS.ja,{refresh:'進行状況を再確認',undoing:'元に戻しています。完了するまで閉じないでください'});
Object.assign(WORDS.zh,{unknown:'任务未完成，请重新查询进度或查看诊断日志'});Object.assign(WORDS.en,{unknown:'The task did not finish; check progress again or consult the diagnostic log'});Object.assign(WORDS.ja,{unknown:'処理が完了していません。進行状況または診断ログを確認してください'});
WORDS.zh.errors.ORIGINAL_SCAN_NOT_STARTED='后台已确认这次任务未启动，可以重试';WORDS.en.errors.ORIGINAL_SCAN_NOT_STARTED='The backend confirmed this request never started; you can retry';WORDS.ja.errors.ORIGINAL_SCAN_NOT_STARTED='今回の処理が開始されていないことを確認しました。再試行できます';
WORDS.zh.errors.EMBEDDED_REQUEST_LIMIT='这次扫描服务的任务数已满，本次任务未启动，请重启应用后重新扫描';WORDS.en.errors.EMBEDDED_REQUEST_LIMIT='This scanning session has reached its task limit. This request never started; restart the app before scanning again';WORDS.ja.errors.EMBEDDED_REQUEST_LIMIT='このスキャンサービスの処理数が上限に達しました。今回は開始されていません。アプリを再起動してからスキャンしてください';
WORDS.zh.capacityPending='扫描服务的任务数已满，请重新查询，确认这次任务是否启动';WORDS.en.capacityPending='The scanning service has reached its task limit. Check progress again to confirm whether this request started';WORDS.ja.capacityPending='スキャンサービスの処理数が上限に達しました。進行状況を再確認し、今回の処理が開始されたか確認してください';
export const originalScanWords=locale=>WORDS[locale]||WORDS.zh;
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000;
const byteCount=value=>Number.isSafeInteger(value)&&value>=0;

/* Only the documented embedded-scan result is accepted; a file path never becomes a client scan argument */
export function normalizeOriginalScanPreview(result){
 const fail=code=>{throw Error(code);};
 if(!result||typeof result!=='object')fail('ORIGINAL_SCAN_PROTOCOL');
 if(result.state==='unsupported')fail('EMBEDDED_UNSUPPORTED');
 if(result.state==='stale')fail('SCAN_STALE');
 if(!['restorable','applied'].includes(result.state)||result.adapter!=='utage-embedded')fail('ORIGINAL_SCAN_PROTOCOL');
 const c=result.coverage;
 if(!c||!['japaneseLines','localTranslations','missingTranslations'].every(k=>count(c[k]))||c.localTranslations+c.missingTranslations!==c.japaneseLines)fail('ORIGINAL_SCAN_PROTOCOL');
 if(typeof result.canRestore!=='boolean'||result.canRestore&&(typeof result.scanToken!=='string'||!result.scanToken||result.scanToken.length>512))fail('ORIGINAL_SCAN_PROTOCOL');
 if(!Array.isArray(result.sources)||result.sources.length>128||!result.sources.length)fail('ORIGINAL_SCAN_PROTOCOL');
 const sources=result.sources.map(s=>{if(!s||typeof s.path!=='string'||!s.path||s.path.length>4096||!Number.isSafeInteger(s.bytes)||s.bytes<0||typeof s.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(s.sha256))fail('ORIGINAL_SCAN_PROTOCOL');return Object.freeze({path:s.path,bytes:s.bytes,sha256:s.sha256});});
 return Object.freeze({state:result.state,japanese:c.japaneseLines,local:c.localTranslations,missing:c.missingTranslations,
  canRestore:result.state==='restorable'&&result.canRestore,scanToken:result.canRestore?result.scanToken:'',sources:Object.freeze(sources)});
}

/* Counts arrive through a backend adapter; malformed totals never become an actionable preview */
export function originalScanPresentation(state={},locale='zh'){
 const t=originalScanWords(locale),phase=PHASES.has(state.phase)?state.phase:'error';
 const p=state.preview,valid=!!p&&count(p.japanese)&&count(p.local)&&count(p.missing)&&p.local+p.missing===p.japanese;
 const hasGame=typeof state.gameId==='string'&&state.gameId.length>0;
 const ready=valid&&p.japanese>0&&p.local>0&&p.canRestore===true;
 const showResult=valid&&['preview','confirm','applying','applied'].includes(phase),writing=state.operation==='restore'||state.operation==='undo';
 const progress=state.progress;
 const knownProgress=!!progress&&count(progress.done)&&count(progress.total)&&progress.total>0&&progress.done<=progress.total;
 return {phase,lead:t.lead,status:phase==='error'?(state.pendingJob&&state.error==='EMBEDDED_REQUEST_LIMIT'?t.capacityPending:t.errors[ERROR_ALIASES[state.error]||state.error]||t.unknown):phase==='idle'&&!hasGame?t.pick:phase==='applying'&&state.operation==='undo'?t.undoing:t[phase]||t.unknown,
  showCounts:showResult,counts:valid?[p.japanese,p.local,p.missing]:[],
  localNote:showResult&&p.local>0?t.localNote:showResult?t.noLocal:'',missingNote:showResult&&p.missing>0?t.missingNote:'',
  canScan:hasGame&&(state.error!=='EMBEDDED_REQUEST_LIMIT'||state.pendingJob)&&(phase==='error'&&state.pendingJob?state.recoverable===true:!['scanning','cancelling','applying'].includes(phase)&&!(writing&&state.pendingJob)),canCancel:!writing&&(state.pendingJob||['scanning','cancelling'].includes(phase))&&state.cancellable!==false,
  cancelPending:phase==='cancelling',showRestore:phase==='preview',canRestore:hasGame&&ready&&phase==='preview',
  showConfirm:phase==='confirm',canConfirm:hasGame&&ready&&phase==='confirm',
  blockedNote:phase==='preview'&&!ready?(valid&&p.local===0?t.noLocal:t.notReady):'',
  progressVisible:['scanning','cancelling','applying'].includes(phase),progressValue:knownProgress?Math.floor(progress.done*100/progress.total):null,
  progressText:knownProgress?progress.done.toLocaleString(locale)+' / '+progress.total.toLocaleString(locale):progress&&(progress.file||byteCount(progress.bytes))?[progress.file?.split(/[/\\]/).pop(),byteCount(progress.bytes)?progress.bytes.toLocaleString(locale)+' B':''].filter(Boolean).join(' · '):t.wait,
  closeAllowed:phase!=='applying'&&!(writing&&state.pendingJob)};
}

export function createOriginalScanController({api,recoverJob,makeRequestId=()=>globalThis.crypto.randomUUID(),onChange=()=>{},onApplied=()=>{},onRefreshError=()=>{},schedule=setTimeout,unschedule=clearTimeout,pollMs=400}={}){
 if(typeof api!=='function'||recoverJob!==undefined&&typeof recoverJob!=='function'||!Number.isInteger(pollMs)||pollMs<300||pollMs>500)throw Error('ORIGINAL_SCAN_OPTIONS');
 let state=Object.freeze({phase:'idle',gameId:'',preview:null,progress:null,error:'',pendingJob:false,operation:'',cancellable:false});
 let current=null,serial=0,disposed=false,cleanupIncomplete=false;
 const publish=patch=>{state=Object.freeze({...state,...patch});if(!disposed)try{onChange(state);}catch{onRefreshError('ORIGINAL_SCAN_VIEW_FAILED');}};
 const active=c=>current===c&&c.serial===serial;
 const clear=c=>{if(c.timer!==null){unschedule(c.timer);c.timer=null;}};
 const errorCode=e=>typeof e==='string'?e:typeof e?.message==='string'?e.message:'ORIGINAL_SCAN_FAILED';
 const closeAllowed=()=>!current||current.operation==='scan';
 function finish(c,{phase,result,error,preview=null}){
  if(!active(c))return;clear(c);current=null;
  publish({phase,preview,progress:null,pendingJob:false,cancellable:false,recoverable:false,error:error||'',operation:''});
  c.resolveCleanup(c.terminal||!error||['GAME_RUNNING','SCAN_STALE','EMBEDDED_UNSUPPORTED','EMBEDDED_CONFLICT','NOT_APPLIED','NOTHING_TO_RESTORE'].includes(error));
  if(error)c.reject(Error(error));else c.resolve(result);
  if(!error&&c.notifyApplied&&!disposed)Promise.resolve().then(()=>onApplied(result)).catch(()=>onRefreshError('ORIGINAL_SCAN_REFRESH_FAILED'));
 }
 function queue(c){if(!active(c))return;clear(c);c.timer=schedule(()=>{c.timer=null;void query(c);},pollMs);}
 function failed(c,error){
  if(!active(c))return;clear(c);
  if(c.terminal||!c.jobId&&['GAME_RUNNING','SCAN_STALE','EMBEDDED_UNSUPPORTED','EMBEDDED_CONFLICT','NOT_APPLIED','NOTHING_TO_RESTORE'].includes(errorCode(error))){finish(c,{phase:'error',error:errorCode(error)});return;}
  publish({phase:'error',error:errorCode(error),pendingJob:true,cancellable:c.operation==='scan'&&!!c.jobId&&c.cancellable,recoverable:true,preview:null});
  if(!c.jobId&&!disposed)c.reject(Error(errorCode(error)));
  if(disposed){if(++c.cleanupFailures<3)queue(c);else{cleanupIncomplete=true;current=null;c.resolveCleanup(false);c.reject(Error('ORIGINAL_SCAN_CLEANUP_INCOMPLETE'));onRefreshError('ORIGINAL_SCAN_CLEANUP_INCOMPLETE');}}
 }
 function legacyResult(operation,result){
  return result&&typeof result==='object'&&!Array.isArray(result)&&(operation==='undo'?count(result.restored)&&Array.isArray(result.skipped):count(result.applied)&&count(result.cells));
 }
 function accept(c,dto){
  if(!active(c))return;
  if(dto?.retired===true&&dto?.notStarted===true&&dto.state==='cancelled'&&dto.requestId===c.requestId&&dto.operation===c.operation&&!c.jobId){c.terminal=true;c.notifyApplied=false;finish(c,{phase:'error',error:dto.retiredByCapacity===true?'EMBEDDED_REQUEST_LIMIT':'ORIGINAL_SCAN_NOT_STARTED'});return;}
  if(c.allowDirect&&dto&&typeof dto==='object'&&!Object.hasOwn(dto,'jobId')){
   if(Object.hasOwn(dto,'operation')||Object.hasOwn(dto,'legacy')||Object.hasOwn(dto,'requestId')||['queued','running','cancelling','cancelled','done','failed'].includes(dto.state))throw Error('ORIGINAL_SCAN_PROTOCOL');
   if(!legacyResult(c.operation,dto))throw Error('ORIGINAL_SCAN_PROTOCOL');
   finish(c,{phase:'idle',result:dto});return;
  }
  if(!dto||typeof dto.jobId!=='string'||!dto.jobId||dto.jobId.length>512||c.jobId&&c.jobId!==dto.jobId)throw Error('ORIGINAL_SCAN_PROTOCOL');
  if(dto.operation!==c.operation||dto.requestId!==c.requestId)throw Error('ORIGINAL_SCAN_PROTOCOL');
  c.jobId=dto.jobId;
  if(!['queued','running','cancelling','cancelled','done','failed'].includes(dto.state)||typeof dto.cancellable!=='boolean')throw Error('ORIGINAL_SCAN_PROTOCOL');
  if(Object.hasOwn(dto,'legacy')&&(dto.legacy!==true||!c.allowDirect||c.operation==='scan'))throw Error('ORIGINAL_SCAN_PROTOCOL');
  if(c.operation!=='scan'&&dto.cancellable)throw Error('ORIGINAL_SCAN_PROTOCOL');
  c.terminal=['done','failed','cancelled'].includes(dto.state);
  if(dto.state==='failed'){finish(c,{phase:'error',error:typeof dto.error==='string'?dto.error:'ORIGINAL_SCAN_FAILED'});return;}
  if(dto.state==='cancelled'){
   if(c.operation!=='scan')throw Error('ORIGINAL_SCAN_PROTOCOL');
   finish(c,{phase:'cancelled',result:false});return;
  }
  if(dto.state==='done'){
   if(c.operation==='scan'){
    if(c.cancelRequested){finish(c,{phase:'cancelled',result:false});return;}
    const preview=normalizeOriginalScanPreview(dto.result);
    finish(c,{phase:preview.state==='applied'?'applied':'preview',result:preview,preview});return;
   }
   const r=dto.result;
   if(c.allowDirect&&dto.legacy===true){
    if(!legacyResult(c.operation,r))throw Error('ORIGINAL_SCAN_PROTOCOL');
    finish(c,{phase:'idle',result:r});return;
   }
   if(!r||typeof r!=='object'||(c.operation==='restore'&&(!count(r.applied)||!count(r.cells)||r.patch!==true||r.localIndex!==true))||(c.operation==='undo'&&(!count(r.restored)||!Array.isArray(r.skipped))))throw Error('ORIGINAL_SCAN_PROTOCOL');
   finish(c,{phase:c.operation==='restore'?'applied':'idle',result:r,preview:c.operation==='restore'?state.preview:null});return;
  }
  const p=dto.progress,progress=p&&typeof p==='object'?Object.freeze({phase:typeof p.phase==='string'?p.phase.slice(0,80):'',file:typeof p.file==='string'?p.file.slice(0,4096):'',...(byteCount(p.bytes)?{bytes:p.bytes}:{})}):null;
  c.cancellable=dto.cancellable&&p?.cancellable!==false;
  publish({phase:c.operation==='scan'?(c.cancelRequested||dto.state==='cancelling'?'cancelling':'scanning'):'applying',progress,pendingJob:true,cancellable:c.cancellable,recoverable:true,error:''});
  if(c.cancelRequested&&c.cancellable&&!c.cancelSent){c.cancelSent=true;void call(c,'jp_restore_scan_cancel',{id:c.id,jobId:c.jobId});}else queue(c);
 }
 async function call(c,action,params){
  if(!active(c)||c.inFlight)return;clear(c);c.inFlight=true;
  try{const context=Object.freeze({id:c.id,operation:c.operation,requestId:c.requestId}),dto=await (action?api(action,params):typeof recoverJob==='function'?recoverJob(context):api('jp_restore_scan_status',{...context,retireIfMissing:true}));c.inFlight=false;accept(c,dto);}catch(error){c.inFlight=false;if(action==='jp_restore_scan_cancel')c.cancelSent=false;failed(c,error);}
 }
 function query(c){if(c.jobId)return call(c,'jp_restore_scan_status',{id:c.id,jobId:c.jobId});return call(c,null);}
 function begin(operation,action,params,{allowDirect=false,notifyApplied=false}={}){
  if(disposed||current||!state.gameId)return Promise.resolve(false);
  let requestId;try{requestId=makeRequestId();if(typeof requestId!=='string'||!/^[a-z0-9_-]{8,80}$/i.test(requestId))throw Error('ORIGINAL_SCAN_OPTIONS');}catch{return Promise.reject(Error('ORIGINAL_SCAN_OPTIONS'));}
  let resolve,reject,resolveCleanup;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;}),cleanupPromise=new Promise(yes=>{resolveCleanup=yes;});
  const c={serial:++serial,id:state.gameId,operation,requestId,jobId:'',timer:null,inFlight:false,cancelRequested:false,cancelSent:false,cancellable:true,terminal:false,cleanupFailures:0,allowDirect,notifyApplied,resolve,reject,promise,cleanupPromise,resolveCleanup};current=c;
  publish({phase:operation==='scan'?'scanning':'applying',operation,preview:operation==='scan'?null:state.preview,progress:null,error:'',pendingJob:true,cancellable:operation==='scan'});
  void call(c,action,{...params,requestId});return promise;
 }
 const controller={
  state:()=>state,busy:()=>!!current,canClose:closeAllowed,
  selectGame(id){if(disposed||current||typeof id!=='string'||!id||id.length>512)return false;++serial;publish({phase:'idle',gameId:id,preview:null,progress:null,error:'',pendingJob:false,operation:'',cancellable:false});return true;},
  scan(){if(current){if(state.phase==='error')return controller.refresh();return Promise.resolve(false);}return begin('scan','jp_restore_scan',{id:state.gameId});},
  refresh(){const c=current;if(!c||c.inFlight||disposed)return Promise.resolve(false);void query(c);return Promise.resolve(true);},
  cancel(){const c=current;if(disposed||!c||c.operation!=='scan'||!c.cancellable)return false;c.cancelRequested=true;publish({phase:'cancelling'});if(c.jobId&&!c.inFlight&&!c.cancelSent){c.cancelSent=true;void call(c,'jp_restore_scan_cancel',{id:c.id,jobId:c.jobId});}return true;},
  requestRestore(){if(disposed||current||!originalScanPresentation(state).canRestore)return false;publish({phase:'confirm'});return true;},
  back(){if(disposed||current||state.phase!=='confirm')return false;publish({phase:'preview'});return true;},
  confirm(){if(disposed||current||!originalScanPresentation(state).canConfirm||!state.preview?.scanToken)return Promise.resolve(false);return begin('restore','jp_restore_apply',{id:state.gameId,embedded:true,scanToken:state.preview.scanToken},{notifyApplied:true});},
  runExisting(action,params={}){if(disposed||current)return Promise.reject(Error('ORIGINAL_SCAN_BUSY'));if(!['jp_restore_apply','jp_restore_undo'].includes(action)||!state.gameId||params.id!==state.gameId)return Promise.reject(Error('ORIGINAL_SCAN_OPTIONS'));return begin(action==='jp_restore_undo'?'undo':'restore',action,{id:state.gameId},{allowDirect:true,notifyApplied:true});},
  dispose(){if(!closeAllowed()||cleanupIncomplete)return Promise.resolve(false);disposed=true;const c=current;if(!c){++serial;return Promise.resolve(true);}c.cancelRequested=true;if(!c.inFlight){if(c.jobId&&c.cancellable){c.cancelSent=true;void call(c,'jp_restore_scan_cancel',{id:c.id,jobId:c.jobId});}else queue(c);}return c.cleanupPromise;}
 };
 publish({});return controller;
}

export function mountOriginalScanView(container,{locale='zh',actions={}}={}){
 const doc=container.ownerDocument,t=originalScanWords(locale),section=doc.createElement('section');
 section.className='jr-folder-scan';
 section.innerHTML='<p class="jr-folder-scan-lead"></p><p class="settings-help" role="status" aria-live="polite" data-os-status></p><div data-os-progress><progress max="100"></progress><p class="settings-help" data-os-progress-text></p></div><dl class="jr-folder-scan-counts" data-os-counts></dl><details data-os-sources><summary></summary><ul class="jr-folder-scan-sources"></ul></details><p class="settings-help" data-os-local></p><p class="settings-help" data-os-missing></p><p class="settings-help" data-os-blocked></p><p class="settings-help" data-os-confirm-note></p><div class="jr-folder-scan-actions"><button type="button" class="secondary" data-os-scan></button><button type="button" class="secondary" data-os-cancel></button><button type="button" class="primary" data-os-restore></button><button type="button" class="secondary" data-os-back></button><button type="button" class="primary" data-os-confirm></button></div>';
 const node=selector=>section.querySelector(selector),buttons={scan:node('[data-os-scan]'),cancel:node('[data-os-cancel]'),restore:node('[data-os-restore]'),back:node('[data-os-back]'),confirm:node('[data-os-confirm]')};
 node('.jr-folder-scan-lead').textContent=t.lead;
 for(const [name,button] of Object.entries(buttons)){button.textContent=t[{scan:'scan',cancel:'cancel',restore:'restore',back:'cancelConfirm',confirm:'confirm'}[name]];button.addEventListener('click',()=>{if(!button.disabled&&!button.hidden)Promise.resolve(actions[name]?.()).catch(()=>{});});}
 node('progress').setAttribute('aria-label',t.scanning);
 for(const label of [t.jp,t.local,t.missing]){const row=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;row.append(dt,dd);node('[data-os-counts]').append(row);}
 container.append(section);let disposed=false;
 function render(state){if(disposed)return;const v=originalScanPresentation(state,locale);section.dataset.phase=v.phase;section.setAttribute('aria-busy',String(['scanning','cancelling','applying'].includes(v.phase)));node('[data-os-status]').textContent=v.status;
  const progress=node('progress');if(v.progressValue===null)progress.removeAttribute('value');else progress.value=v.progressValue;
  node('[data-os-progress]').hidden=!v.progressVisible;node('[data-os-progress-text]').textContent=v.progressText;
  const counts=node('[data-os-counts]');counts.hidden=!v.showCounts;counts.querySelectorAll('dd').forEach((dd,i)=>{dd.textContent=v.counts[i]===undefined?'':v.counts[i].toLocaleString(locale);});
  const sources=node('[data-os-sources]');sources.hidden=!v.showCounts;sources.querySelector('summary').textContent=t.sources;
  const list=sources.querySelector('ul');list.replaceChildren();for(const source of v.showCounts?(state.preview.sources||[]):[]){const item=doc.createElement('li');item.textContent=source.path+' · '+source.bytes.toLocaleString(locale)+' B';list.append(item);}
  for(const [selector,value] of [['[data-os-local]',v.localNote],['[data-os-missing]',v.missingNote],['[data-os-blocked]',v.blockedNote]]){node(selector).textContent=value;node(selector).hidden=!value;}
  node('[data-os-confirm-note]').textContent=t.confirmNote;node('[data-os-confirm-note]').hidden=!v.showConfirm;
  buttons.scan.disabled=!v.canScan;buttons.scan.textContent=state.pendingJob&&v.phase==='error'?t.refresh:v.phase==='idle'?t.scan:t.retry;
  buttons.cancel.hidden=!v.canCancel;buttons.cancel.disabled=v.cancelPending;
  buttons.restore.hidden=!v.showRestore;buttons.restore.disabled=!v.canRestore;
  buttons.confirm.hidden=!v.showConfirm;buttons.confirm.disabled=!v.canConfirm;buttons.back.hidden=!v.showConfirm;
 }
 render({phase:'idle'});
 return {render,dispose(){disposed=true;section.remove();}};
}

export function mountOriginalScan(container,{api,recoverJob,locale='zh',onApplied,onRefreshError,onState}={}){
 let controller;
 const view=mountOriginalScanView(container,{locale,actions:{scan:()=>controller.scan(),cancel:()=>controller.cancel(),restore:()=>controller.requestRestore(),back:()=>controller.back(),confirm:()=>controller.confirm()}});
 controller=createOriginalScanController({api,recoverJob,onApplied,onRefreshError,onChange:state=>{view.render(state);onState?.(state);}});
 return {...controller,async dispose(){const complete=await controller.dispose();if(complete)view.dispose();return complete;}};
}
