// Keep detailed status in settings, but never leave a successful install over game text.
export function installLearningNotice(bridge,{doc=document,timeout=setTimeout,cancel=clearTimeout,hold=2800,fade=350}={}){
 if(!bridge?.learningStatus||bridge.hostTransientNotice)return;
 bridge.hostTransientNotice=true;
 const original=bridge.learningStatus;let timer,removeTimer,last='',expired=false;
 bridge.learningStatus=message=>{
  original(message);
  if(!message.learningMessage)return;
  const text=message.learningMessage,node=doc.querySelector('.tomoyo-learning-notice');
  if(!node)return;
  if(!/已安装|安装完成|安装成功|已就绪|\binstalled\b|\bready\b|インストール済/i.test(text))return;
  if(text===last){if(expired)node.remove();return;}
  cancel(timer);cancel(removeTimer);last=text;expired=false;
  node.style.transition='opacity '+fade+'ms ease';
  timer=timeout(()=>{if(!node.isConnected||node.textContent!==text)return;expired=true;node.style.opacity='0';removeTimer=timeout(()=>{if(node.isConnected&&node.textContent===text)node.remove();},fade);},hold);
 };
}
