(function installLearning(){
 'use strict';
 if(!document.documentElement||!window.__tomoyoChinese){document.addEventListener('DOMContentLoaded',installLearning,{once:true});return;}
 const bridge=window.__tomoyoChinese;if(!bridge||bridge.learningInstalled)return;bridge.learningInstalled=true;
 const requests=new Map();let serial=0;
 const send=m=>window.__tomoyoTranslateRequest(JSON.stringify(m));
 const request=m=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{requests.delete(id);reject(Error('本地辞书尚未就绪，请在设置中查看组件安装状态'));},600000);requests.set(id,{resolve,reject,timer});try{send({...m,type:'learningRequest',id});}catch(e){clearTimeout(timer);requests.delete(id);reject(e);}});
 bridge.learningDeliver=(id,result,error)=>{const p=requests.get(id);if(!p)return;clearTimeout(p.timer);requests.delete(id);error?p.reject(Error(error)):p.resolve(result);};
 bridge.learningStatus=message=>{if(message.learningMessage){
  bridge.localLearningMessage=message.learningMessage;for(const n of document.querySelectorAll('[data-learning-status]'))n.textContent=message.learningMessage;
  const ready=message.learningMessage.startsWith('实际运行：'),parent=document.querySelector('.sentence-window');let notice=document.querySelector('.tomoyo-learning-notice');
  if(ready){notice?.remove();return;}
  if(parent&&!notice){notice=document.createElement('div');notice.className='tomoyo-learning-notice';notice.setAttribute('role','status');notice.style.cssText='font:12px/1.6 Meiryo,"Microsoft YaHei",sans-serif;color:var(--theme-textSecondary,#aaa);margin-top:8px;pointer-events:none;text-shadow:none;-webkit-text-stroke:0;';parent.appendChild(notice);}
  if(notice&&notice.textContent!==message.learningMessage)notice.textContent=message.learningMessage;
 }};
 const commands=new Set(['tokenize_text','lookup_at_position','lookup_exact','scan_sentence']);
 bridge.localTokenize=text=>request({command:'tokenize_text',args:{text},language:bridge.options?.().learnerLanguage||'zh',engine:'sudachi'});
 bridge.localLookup=(command,args)=>request({command,args,language:bridge.options?.().learnerLanguage||'zh',engine:'sudachi'});
 function hook(){
  const internal=window.__TAURI_INTERNALS__;if(!internal?.invoke){setTimeout(hook,30);return;}
  const original=window.__tomoyoInvoke||internal.invoke.bind(internal);
  window.__tomoyoInvoke=async(command,args={},...rest)=>{
   if(!commands.has(command))return original(command,args,...rest);
   const options=bridge.options?.()||{},engine=options.readingEngine||'sudachi',language=options.learnerLanguage||'zh';
   if(engine==='sudachi'){const result=await request({command,args,language,engine});if(['lookup_at_position','lookup_exact'].includes(command)){bridge.lastLookupDetail=result;if(typeof CustomEvent==='function')document.dispatchEvent?.(new CustomEvent('tomoyo-local-lookup',{detail:result}));}return result;}
   const result=await original(command,args,...rest);
   return request({command,args,language,engine,result});
  };
 }
 hook();
 const html=`<fieldset class="tomoyo-learning-panel"><legend>学习者与本地辞书 / Learner &amp; dictionaries</legend>
 <label>学习者语言 / Learner language<select data-learner-language><option value="zh">中文学习者：中文释义、词性和动词类别</option><option value="en">English learner: English definitions and grammar</option></select></label>
 <label>本地分词 · 注音 · 点读<select data-reading-engine><option value="sudachi">SudachiDict Full ＋ JMdict（全流程）</option><option value="unidic">UniDic（ToMe 内置分词）＋ JMdict 读音校正</option></select></label>
 <small>Sudachi 模式下分词、书写读音、词形还原和点读均经同一条本地流程；首次安装需要下载词典，日常使用不调用注音或查词 API</small>
 <div data-learning-status role="status"></div><button type="button" data-install-reading>安装 / 修复 Full 本地组件</button></fieldset>`;
 function attach(container){
  if(!container||container.querySelector('.tomoyo-learning-panel'))return;
  const host=document.createElement('div');host.innerHTML=html;const panel=host.firstElementChild;container.prepend(panel);
  const options=bridge.options?.()||{};panel.querySelector('[data-learner-language]').value=options.learnerLanguage||'zh';panel.querySelector('[data-reading-engine]').value=options.readingEngine||'sudachi';
  panel.querySelector('[data-learning-status]').textContent=bridge.localLearningMessage||'选择 Full 后不会静默切回旧分词器；缺少组件时会显示安装状态';
  panel.onchange=()=>bridge.updateLearningSettings?.({learnerLanguage:panel.querySelector('[data-learner-language]').value,readingEngine:panel.querySelector('[data-reading-engine]').value});
  panel.querySelector('[data-install-reading]').onclick=()=>{try{send({type:'learningInstall'});}catch{}};
 }
 function mount(){
  const own=document.querySelector('.tomoyo-cn-dialog form');if(own)attach(own);
  // Settings loads asynchronously. Wait for its real content region instead of
  // mounting a provisional copy above the native page header while it loads.
  const native=document.querySelector('.settings-page .settings-content');if(native&&!native.closest('.tomoyo-cn-dialog'))attach(native);
 }
 const style=document.createElement('style');style.textContent='.tomoyo-learning-panel{border:1px solid #697181;border-radius:8px;padding:12px;margin:10px 0;color:inherit;font:14px/1.6 "Microsoft YaHei",sans-serif}.tomoyo-learning-panel label,.tomoyo-learning-panel small{display:block;margin:8px 0}.tomoyo-learning-panel select{display:block;max-width:100%;width:100%;padding:7px;background:#2c2f3b;color:#fff;border:1px solid #697181;border-radius:5px}.tomoyo-learning-panel button{padding:6px 10px;margin-top:6px;cursor:pointer}.tomoyo-learning-panel [data-learning-status]{font-size:12px;color:#b8cce7}';(document.head||document.documentElement).appendChild(style);
 new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();
