/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Only this workflow is serialized; other resource downloads are independent */
export const discImagePaths=values=>Array.isArray(values)?values.filter(p=>typeof p==='string'&&/\.(mds|mdf|cue|bin|ccd|img|nrg|iso)$/i.test(p)&&!/[\0\r\n]/.test(p)):[];
const waiting=new Set(['need_install_roots','ready_to_mount','ready_to_install','installing','choose_game','awaiting_unmount','awaiting_driver','done','cancelled','error']);
export function createDiscInstallFlow({api,onChange=()=>{},onLibraryChanged=async()=>{},schedule=setTimeout,unschedule=clearTimeout}){
 let session=null,paths=[],installRoots=[],pending=false,notice='',confirmed=false,disposed=false,epoch=0,timer=0;
 let driverRequested=false,mountAfterDriver=false,installerRequested=false,finishChoice=null,refreshFailed=false;
 const notified=new Set();
 const state=()=>({session,paths:[...paths],installRoots:[...installRoots],pending,notice,confirmed,driverRequested,finishChoice,refreshFailed});
 const emit=()=>{if(!disposed)onChange(state());};
 const clear=()=>{if(timer){unschedule(timer);timer=0;}};
 const code=e=>typeof e==='string'?e:typeof e?.code==='string'?e.code:typeof e?.message==='string'?e.message:'DISC_UI_FAILED';
 function accept(dto){
  if(!dto||typeof dto.id!=='string'||!dto.id||typeof dto.state!=='string')throw Error('DISC_UI_PROTOCOL');
  if(session&&dto.id!==session.id)throw Error('DISC_UI_PROTOCOL');
  if(dto.state==='done'&&dto.mounted&&dto.keepMounted!==true)throw Error('DISC_UI_PROTOCOL');
  if(dto.state==='cancelled'&&dto.mounted)throw Error('DISC_UI_PROTOCOL');
  session=dto;
 }
 async function libraryChanged(){
  const fresh=(session?.imported||[]).filter(g=>typeof g?.id==='string'&&!notified.has(g.id));
  if(!fresh.length)return;
  try{await onLibraryChanged();for(const g of fresh)notified.add(g.id);refreshFailed=false;}
  catch{refreshFailed=true;}
 }
 function plan(){
  clear();if(disposed||pending||notice||session?.error||!session)return;
  if(!session.busy&&confirmed&&session.state==='ready_to_mount'&&driverRequested&&!mountAfterDriver){
   mountAfterDriver=true;void perform('disc_mount',{id:session.id,consent:true});return;
  }
  if(!session.busy&&confirmed&&session.state==='ready_to_install'&&!installerRequested&&session.installers?.length===1){
   installerRequested=true;void perform('disc_install',{id:session.id,installer:session.installers[0].path});return;
  }
  if(session.busy||!waiting.has(session.state))timer=schedule(()=>{timer=0;void perform('disc_status',{id:session.id});},900);
 }
 async function perform(action,args){
  if(disposed||pending)return false;
  pending=true;notice='';clear();const ticket=epoch;emit();
  try{
   const dto=await api(action,args);
   if(disposed||ticket!==epoch)return false;
   accept(dto);await libraryChanged();return true;
  }catch(e){if(!disposed&&ticket===epoch)notice=code(e);return false;}
  finally{if(!disposed&&ticket===epoch){pending=false;emit();queueMicrotask(plan);}}
 }
 async function prepare(nextPaths,nextRoots){
  if(disposed||pending||confirmed||session?.mounted)return false;
  const selected=discImagePaths(nextPaths),roots=Array.isArray(nextRoots)?nextRoots.filter(v=>typeof v==='string'&&v):[];
  if(!selected.length){notice='DISC_IMAGE_TYPE';emit();return false;}
  paths=selected;installRoots=roots;
  if(!roots.length){notice='DISC_NEED_INSTALL_ROOTS';emit();return false;}
  if(session){if(!await perform('disc_cancel',{id:session.id}))return false;if(session.mounted)return false;session=null;}
  return perform('disc_prepare',{paths:[...paths],installRoots:[...roots]});
 }
 async function confirm(){
  if(disposed||pending||confirmed||!session||session.busy||session.state!=='ready_to_mount')return false;
  confirmed=true;return perform('disc_mount',{id:session.id,consent:true});
 }
 async function install(path){
  if(disposed||pending||!confirmed||session?.busy||session?.state!=='ready_to_install'||!session.installers?.some(i=>i.path===path))return false;
  installerRequested=true;return perform('disc_install',{id:session.id,installer:path});
 }
 async function scan(folder){
  if(disposed||pending||!confirmed||session?.busy||!['installing','choose_game'].includes(session?.state))return false;
  const args={id:session.id,installed:true};if(typeof folder==='string'&&folder)args.folder=folder;
  return perform('disc_scan',args);
 }
 async function importGame(executable){
  if(disposed||pending||!confirmed||session?.busy||session?.state!=='choose_game'||!session.candidates?.some(g=>g.executable===executable))return false;
  return perform('disc_import',{id:session.id,executable});
 }
 async function finish(keepMounted){
  if(disposed||pending||session?.busy||!session?.mounted||!['awaiting_unmount','error'].includes(session.state)||typeof keepMounted!=='boolean')return false;
  finishChoice=keepMounted;return perform('disc_finish',{id:session.id,keepMounted});
 }
 async function cancel(){
  if(disposed||pending)return false;
  clear();if(!session)return true;
  if(session.state==='done'||session.state==='cancelled')return true;
  return perform('disc_cancel',{id:session.id});
 }
 async function retryDriver(){
  if(disposed||pending||!confirmed||session?.busy||session?.state!=='awaiting_driver')return false;
  driverRequested=true;return perform('disc_driver',{id:session.id,confirmed:true,mode:'standard'});
 }
 return {state,prepare,confirm,install,scan,importGame,finish,cancel,retryDriver,
  refresh:()=>session?perform('disc_status',{id:session.id}):Promise.resolve(false),
  report(error){notice=code(error);emit();},
  dispose(){disposed=true;epoch++;clear();},publish:emit};
}
