// Serialize writes, retain the latest edit, and flush before a settings page is left.
export function createAutosave({save,onState=()=>{},delay=450}){
 let timer=null,pending=null,latest=null,last='',running=false,closed=false;
 async function drain(){
  if(pending)return pending;
  if(!latest)return;
  const run=(async()=>{running=true;while(latest){const item=latest;latest=null;if(item.key===last)continue;onState('saving');try{await save(item.value);last=item.key;onState(latest?'saving':'saved');}catch(error){if(!latest)latest=item;onState('error',error);throw error;}}})();
  pending=run;try{await run;}finally{pending=null;running=false;}
 }
 return {
  update(value,{immediate=false}={}){if(closed)return;const key=JSON.stringify(value);if(!running&&key===last)return;latest={key,value};clearTimeout(timer);if(immediate)return drain();timer=setTimeout(()=>{timer=null;drain().catch(()=>{});},delay);},
  flush(){clearTimeout(timer);timer=null;return drain();},
  stop(){closed=true;clearTimeout(timer);},
 };
}
let active=null;
export async function flushSettings(){if(active)await active.flush();}
export async function leaveSettings(){const current=active;if(current){await current.flush();if(active===current){current.stop();active=null;}}}
export function mountSettingsAutosave({form,save,locale='zh',status,valid=()=>form.checkValidity()}){
 let fade;
 const words={zh:{saving:'正在保存…',saved:'已自动保存',error:'保存失败，修改仍保留'},en:{saving:'Saving…',saved:'Saved automatically',error:'Could not save; edits retained'},ja:{saving:'保存中…',saved:'自動保存しました',error:'保存できませんでした（編集は保持）'}}[locale];
 const autosave=createAutosave({save,onState:(state)=>{clearTimeout(fade);status.dataset.state=state;status.textContent=words[state];status.hidden=false;status.classList.remove('faded');if(state==='saved')fade=setTimeout(()=>status.classList.add('faded'),2200);}});
 const collect=()=>Object.fromEntries([...form.elements].filter(f=>f.name&&!f.disabled&&f.type!=='submit').map(f=>[f.name,f.type==='checkbox'?f.checked:f.type==='number'||f.type==='range'?Number(f.value):f.type==='color'&&f.dataset.empty==='true'?'':f.value]));
 const input=()=>{if(valid())autosave.update(collect());};
 const change=()=>{if(valid())autosave.update(collect(),{immediate:true})?.catch(()=>{});};
 form.addEventListener('input',input);form.addEventListener('change',change);form.addEventListener('submit',e=>{e.preventDefault();change();});
 active={flush:()=>autosave.flush(),stop:()=>{autosave.stop();clearTimeout(fade);form.removeEventListener('input',input);form.removeEventListener('change',change);}};
 return autosave;
}
