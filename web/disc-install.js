/* SPDX-License-Identifier: GPL-3.0-or-later */
import {createDiscInstallFlow,discImagePaths} from './disc-install-flow.js';
import {discWords,discError} from './disc-install-copy.js';
export {discImagePaths};
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=null;
export function discInstallHTML(view,{locale='zh',esc=escapeHTML,context='library'}={}){
 const w=discWords[locale]||discWords.zh,s=view.session,stage=s?.state||'choose',disabled=view.pending||s?.busy;
 const button=(action,label,{primary=false,value='',off=disabled}={})=>`<button type="button" class="${primary?'primary':'secondary'}" data-disc-action="${action}" data-value="${esc(value)}" ${off?'disabled':''}>${esc(label)}</button>`;
 const before=!view.confirmed&&!s?.mounted&&!['done','cancelled'].includes(stage);
 const problem=view.notice||s?.error;
 let body=`<p class="settings-help">${esc(w.formats)}</p>`;
 if(context==='japanese'||context==='jp-import')body+=`<p class="settings-help">${esc(w.jp)}</p>`;
 if(view.paths.length)body+=`<p class="disc-path"><strong>${esc(w.selected)}</strong><br>${view.paths.map(p=>esc(p)).join('<br>')}</p>`;
 if(before){body+=`<div class="disc-input-actions">${button('pick',w.pick)}${button('roots',w.chooseRoots)}</div><p class="settings-help">${esc(w.rootHint)}</p>`;}
 if(view.installRoots.length)body+=`<p class="disc-path"><strong>${esc(w.roots)}</strong><br>${view.installRoots.map(p=>esc(p)).join('<br>')}</p>`;
 if(before)body+=`<p class="disc-consent">${esc(w.consent)}</p>`;
 body+=`<p class="disc-status settings-help" role="status" aria-live="polite" aria-atomic="true">${esc(w.stages[stage]||(disabled?w.stages.preparing:w.formats))}</p>`;
 if(problem)body+=`<p class="disc-error" role="alert">${esc(discError(problem,locale))}</p>`;
 if(view.refreshFailed)body+=`<p class="disc-error" role="alert">${esc(w.refreshFailed)}</p>`;
 for(const warning of (s?.warnings||[]))body+=`<p class="settings-help">${esc(discError(warning,locale))}</p>`;
 if(stage==='ready_to_install'&&s.installers?.length>1){body+=`<h3>${esc(w.installers)}</h3><div class="disc-action-list">`+s.installers.map(i=>button('install',i.name,{value:i.path})).join('')+'</div>';}
 if(stage==='installing')body+=`<p class="settings-help">${esc(w.interactive)}</p><div class="disc-input-actions">${button('scan',w.installed,{primary:true})}</div>`;
 if(stage==='choose_game')body+=`<h3>${esc(w.candidates)}</h3>`+(s.candidates?.length?`<div class="disc-action-list">${s.candidates.map(g=>button('import',g.title,{value:g.executable})).join('')}</div>`:`<p class="settings-help">${esc(w.noCandidates)}</p>`)+`<div class="disc-input-actions">${button('manual',w.manual)}</div>`;
 if(s?.imported?.length)body+=`<p class="settings-help">${esc(w.added(s.imported.length))}</p>`;
 if(stage==='done')body+=`<p class="settings-help">${esc(s.mounted&&s.keepMounted===true?w.kept:w.unmounted)}</p>`;
 let actions='';
 if(stage==='ready_to_mount'&&!view.confirmed)actions+=button('confirm',w.confirm,{primary:true});
 if(stage==='awaiting_driver'&&view.confirmed&&!s?.busy){body+=`<p class="disc-consent">${esc(w.standardDriverInfo)}</p>`;actions+=button('driver',w.driver);}
 if(problem&&s?.id)actions+=button('retry',w.retry);
 if(s?.mounted&&['awaiting_unmount','error'].includes(stage)){
  body+=`<p class="disc-mount-choice">${esc(w.mountChoice)}</p>`;
  actions+=button('keep',w.keep)+button('unmount',w.unmount,{primary:true});
 }else actions+=button(['done','cancelled'].includes(stage)?'close':'cancel',['done','cancelled'].includes(stage)?w.close:w.cancel,{off:view.pending});
 return `<header class="game-dialog-head"><h2>${esc(w.title)}</h2></header><div class="disc-body" aria-busy="${disabled?'true':'false'}">${body}</div><div class="dialog-actions">${actions}</div>`;
}
export function openDiscInstall({paths=[],api,invoke,locale='zh',esc=escapeHTML,context='library',onLibraryChanged=async()=>{}}){
 if(active){active.dialog.focus();return active.result;}
 const w=discWords[locale]||discWords.zh,d=document.createElement('dialog');d.className='game-dialog disc-install';
 let pickedPaths=discImagePaths(paths),pickedRoots=[],lastPaint='',resolve,localBusy=false;
 const result=new Promise(r=>{resolve=r;});
 const repaint=()=>{
  const view={...flow.state(),paths:pickedPaths,installRoots:pickedRoots};view.pending||=localBusy;
  const signature=JSON.stringify(view);if(signature===lastPaint)return;lastPaint=signature;
  const focus=d.querySelector(':focus')?.dataset?.discAction;
  d.innerHTML=discInstallHTML(view,{locale,esc,context});
  if(focus)d.querySelector(`[data-disc-action="${focus}"]`)?.focus();
 };
 const flow=createDiscInstallFlow({api,onLibraryChanged,onChange:repaint});
 const close=()=>{const state=flow.state();flow.dispose();d.close();d.remove();active=null;resolve(state.session);};
 const prepare=()=>pickedPaths.length&&pickedRoots.length?flow.prepare(pickedPaths,pickedRoots):Promise.resolve(false);
 async function pickRoots(manual=false){
  localBusy=true;repaint();
  try{const selected=await invoke('pick_directories',{multiple:false});if(!selected?.[0])return;
   if(manual)await flow.scan(selected[0]);else{pickedRoots=[selected[0]];await prepare();}
  }catch{flow.report('DISC_UI_PICK_FAILED');}finally{localBusy=false;repaint();}
 }
 d.addEventListener('click',async event=>{
  const b=event.target.closest?.('[data-disc-action]');if(!b||b.disabled)return;
  const action=b.dataset.discAction;
  if(action==='close'){close();return;}
  if(action==='roots'||action==='manual'){await pickRoots(action==='manual');return;}
  if(action==='pick'){
   localBusy=true;repaint();try{const selected=await invoke('pick_patch_file',{title:w.pickTitle});if(selected){pickedPaths=discImagePaths([selected]);if(!pickedPaths.length)flow.report('DISC_IMAGE_TYPE');else await prepare();}}
   catch{flow.report('DISC_UI_PICK_FAILED');}finally{localBusy=false;repaint();}return;
  }
  if(action==='confirm')await flow.confirm();
  else if(action==='driver')await flow.retryDriver();
  else if(action==='install')await flow.install(b.dataset.value);
  else if(action==='scan')await flow.scan();
  else if(action==='import')await flow.importGame(b.dataset.value);
  else if(action==='retry')await flow.refresh();
  else if(action==='keep'||action==='unmount')await flow.finish(action==='keep');
  else if(action==='cancel'){if(await flow.cancel()){const state=flow.state();if(!state.session?.mounted&&!state.pending)close();}}
 });
 d.addEventListener('cancel',event=>{event.preventDefault();if(!localBusy&&!flow.state().pending)d.querySelector('[data-disc-action="cancel"],[data-disc-action="close"]')?.click();});
 document.body.append(d);active={dialog:d,result};repaint();d.showModal();d.querySelector('button')?.focus();return result;
}
export async function bindDiscDrop({invoke,internals,onImages,root=document,eventInternals=globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__}){
 let alive=true;
 const receive=paths=>{const images=discImagePaths(paths);if(alive&&images.length)onImages(images);};
 const callback=internals?.transformCallback?.(response=>receive(response.payload?.paths));
 let eventId=null;
 if(callback!==undefined)eventId=await invoke('plugin:event|listen',{event:'tauri://drag-drop',target:{kind:'WebviewWindow',label:'main'},handler:callback});
 const drop=event=>{const files=[...(event.dataTransfer?.files||[])],paths=files.map(f=>f.path).filter(Boolean);if(discImagePaths(paths).length){event.preventDefault();receive(paths);}};
 const over=event=>{if([...(event.dataTransfer?.files||[])].some(f=>discImagePaths([f.path]).length))event.preventDefault();};
 root.addEventListener('drop',drop);root.addEventListener('dragover',over);
 return async()=>{alive=false;root.removeEventListener('drop',drop);root.removeEventListener('dragover',over);if(eventId!==null){eventInternals?.unregisterListener?.('tauri://drag-drop',eventId);await invoke('plugin:event|unlisten',{event:'tauri://drag-drop',eventId});}};
}
