// Full status stays in settings; repeated component failures must not cover the game indefinitely.
export function installLearningNotice(bridge,{doc=document,timeout=setTimeout,cancel=clearTimeout,hold=2800,fade=350}={}){
 if(!bridge?.learningStatus||bridge.hostTransientNotice)return;
 bridge.hostTransientNotice=true;
 const original=bridge.learningStatus;let timer,removeTimer,last='',lastOperation='',expired=false;
 bridge.learningStatus=message=>{
  if(message.learningRecovered&&message.learningRecovered===lastOperation){cancel(timer);cancel(removeTimer);last='';lastOperation='';expired=false;}
  /* Suppress creation, not just removal: adding a notice would wake the reader's MutationObserver and retry the failed request again. */
  original(message.learningMessage===last&&(message.learningOperation||'')===lastOperation&&expired?{...message,learningNotice:false}:message);
  if(!message.learningMessage)return;
  const text=message.learningMessage,node=doc.querySelector('.tomoyo-learning-notice');
  if(!node)return;
  if(!message.learningOperation&&!/失败|超时|未就绪|无法|不可用|\bfailed\b|\berror\b|已安装|安装完成|安装成功|已就绪|\binstalled\b|\bready\b|インストール済/i.test(text))return;
  if(text===last&&(message.learningOperation||'')===lastOperation){if(expired)node.remove();return;}
  cancel(timer);cancel(removeTimer);last=text;lastOperation=message.learningOperation||'';expired=false;
  node.style.opacity='1';
  node.style.transition='opacity '+fade+'ms ease';
  timer=timeout(()=>{if(!node.isConnected||node.textContent!==text)return;expired=true;node.style.opacity='0';removeTimer=timeout(()=>{if(node.isConnected&&node.textContent===text)node.remove();},fade);},hold);
 };
}
