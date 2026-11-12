// SPDX-License-Identifier: GPL-3.0-or-later
export const translationKind=provider=>['google','microsoft'].includes(provider)?'free':['sakura','llamacpp','ollama','lmstudio'].includes(provider)?'local':'api';
export const managedLocal=provider=>['sakura','llamacpp'].includes(provider);
export function downloadProgress(job){return job?.total>0?Math.min(job.state==='done'?100:99,Math.max(0,job.received/job.total*100)):null;}
const ui={zh:{free:'免费在线机翻',api:'API 翻译',local:'本地模型',kind:'翻译方式',models:'本地翻译模型',runtime:'本地服务程序',hint:'先安装服务程序，再下载并使用模型，翻译时自动启动；也可以在下面手动启动',external:'此引擎使用你已部署的 Ollama / LM Studio 服务，请填写它的地址与模型名',
 download:'下载',install:'下载并安装',cancel:'取消下载',use:'使用此模型',installed:'已安装',idle:'未安装',downloading:'下载中',cancelled:'已取消',error:'下载失败，可重试',start:'启动本地服务',starting:'正在加载模型',
 running:'服务运行中',stop:'停止服务',source:'下载来源',approx:'约',vram:'参考显存',saved:'已选择模型',failed:'操作失败，请重试',retry:'重试',load:'正在读取本地模型状态'},en:{free:'Free online',api:'Translation API',
 local:'Local models',kind:'Translation type',models:'Local translation models',runtime:'Local server',hint:'Install the server, then download and select a model. It starts when translating, or you can start it below',
 external:'This engine uses your Ollama / LM Studio server. Enter its URL and model name',download:'Download',install:'Download and install',cancel:'Cancel download',
 use:'Use this model',installed:'Installed',idle:'Not installed',downloading:'Downloading',cancelled:'Cancelled',error:'Download failed; retry available',start:'Start local server',
 starting:'Loading model',running:'Server running',stop:'Stop server',source:'Download source',approx:'Approx.',vram:'VRAM guide',saved:'Model selected',failed:'Operation failed; try again',
 retry:'Retry',load:'Loading local model status'},ja:{free:'無料オンライン翻訳',api:'翻訳 API',local:'ローカルモデル',kind:'翻訳方式',models:'ローカル翻訳モデル',runtime:'ローカルサーバー',hint:'サーバーを導入し、モデルを取得・選択してください。翻訳時に自動起動し、ここからも起動できます',
 external:'Ollama / LM Studio のサーバーを使用します。URL とモデル名を指定してください',download:'ダウンロード',install:'取得・インストール',cancel:'取得を中止',use:'このモデルを使う',installed:'導入済み',idle:'未導入',downloading:'ダウンロード中',
 cancelled:'中止済み',error:'取得失敗・再試行できます',start:'ローカルサーバーを起動',starting:'モデルを読み込み中',running:'サーバー稼働中',stop:'サーバーを停止',source:'ダウンロード元',approx:'約',vram:'VRAM の目安',saved:'モデルを選択しました',
 failed:'操作を再試行してください',retry:'再試行',load:'モデルの状態を確認中'}};
export function configureTranslation({content,form,data,locale,api,esc,toast}){
 const w=ui[locale],provider=form.elements.namedItem('provider'),base=form.elements.namedItem('baseUrl'),model=form.elements.namedItem('model'),original=[...provider.options].map(option=>option.cloneNode(true)),
  drafts=new Map();let kind=translationKind(provider.value);
 const types=document.createElement('div');types.className='translation-types';types.setAttribute('aria-label',w.kind);types.innerHTML=['free','api','local'].map(type=>`<button type="button" data-kind="${type}">${w[type]}</button>`).join('');
  form.querySelector('.settings-page').before(types);
 const panel=document.createElement('section');panel.className='panel local-models';panel.innerHTML=`<h2 class="panel-title">${w.models}</h2><p class="settings-help local-hint"></p><label class="download-source">${w.source}<span><label><input type="radio" name="download-source" value="hf" checked> Hugging Face</label> <label><input type="radio" name="download-source" value="mirror"> hf-mirror.com</label></span></label><div class="local-model-status">${w.load}</div>`;
  content.append(panel);let status=null,busy=false,timer;
 const row=name=>form.elements.namedItem(name)?.closest('.settings-row');const addressNote=document.createElement('small');addressNote.className='settings-help';
  row('baseUrl').querySelector('.setting-description').append(addressNote);
 function apply(reset){const meta=data.providers?.[provider.value]||{};if(reset){const draft=drafts.get(provider.value);base.value=draft?.baseUrl??meta.baseUrl??'';
  model.value=draft?.model??meta.model??'';}
  base.readOnly=!meta.editable;const isDefault=base.value===(meta.defaultBaseUrl||meta.baseUrl);addressNote.textContent=isDefault?({zh:'默认地址，已自动填写，通常无需修改',en:'Default URL, filled automatically; usually no changes needed',
   ja:'既定の URL を自動入力しています。通常は変更不要です'})[locale]:({zh:'当前使用自定义地址',en:'Using a custom URL',ja:'カスタム URL を使用中'})[locale];const mt=['google','microsoft','bing','deepl',
   'baiduapi','youdaoapi','tencentapi','aliyunapi','caiyunapi','xiaoniu','googleapi','yandexapi'].includes(provider.value);
  row('baseUrl').dataset.unavailable=String(kind==='free');row('model').dataset.unavailable=String(mt);row('region').dataset.unavailable=String(provider.value!=='bing');
   row('deeplTier').dataset.unavailable=String(provider.value!=='deepl');
  for(const name of ['baseUrl','model','region','deeplTier'])row(name).hidden=row(name).dataset.unavailable==='true';
  content.querySelector('.key-panel').hidden=meta.keyless===true;
  { const any=['baseUrl','model','region','deeplTier'].some(n=>!row(n).hidden)||meta.keyless!==true;conn.dataset.empty=String(!any);conn.querySelector('.tr-conn-empty').hidden=any;
   }panel.hidden=kind!=='local';panel.querySelector('.local-hint').textContent=managedLocal(provider.value)?w.hint:w.external;draw();
 }
 /* v1.1.6 (user: the three tabs repeated the same rows): engine-specific rows live in one connection card under the engine
    picker and only show what the chosen engine needs; the remaining rows are the shared options below it. */
 const conn=document.createElement('section');conn.className='tr-conn';
 conn.innerHTML=`<div class="tr-conn-head">${({zh:'连接设置',en:'Connection',ja:'接続設定'})[locale]}</div><p class="tr-conn-empty settings-help">${({zh:'这个引擎不需要额外设置，直接可用',en:'This engine needs no setup',ja:'このエンジンは追加設定なしで使えます'})[locale]}</p>`;
 row('provider').after(conn);for(const name of ['baseUrl','model','region','deeplTier'])conn.append(row(name));const keyPanel=content.querySelector('.key-panel');
  if(keyPanel){conn.append(keyPanel);keyPanel.querySelectorAll('button:not([type])').forEach(b=>b.type='button');}
 const shared=document.createElement('div');shared.className='tr-shared-head';shared.textContent=({zh:'通用翻译选项',en:'Shared options',ja:'共通オプション'})[locale];conn.after(shared);
 function filter(){provider.replaceChildren(...original.filter(option=>translationKind(option.value)===kind).map(option=>option.cloneNode(true)));}
 function updateTypes(){types.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.kind===kind)));}
 types.querySelectorAll('button').forEach(button=>button.onclick=()=>{drafts.set(provider.value,{baseUrl:base.value,model:model.value});const selected=provider.value;
  kind=button.dataset.kind;filter();if([...provider.options].some(option=>option.value===selected))provider.value=selected;provider.dispatchEvent(new Event('change',
  {bubbles:true}));updateTypes();});
 provider.addEventListener('change',()=>{kind=translationKind(provider.value);apply(true);updateTypes();});base.addEventListener('input',()=>drafts.set(provider.value,
  {baseUrl:base.value,model:model.value}));model.addEventListener('input',()=>drafts.set(provider.value,{baseUrl:base.value,model:model.value}));const selected=provider.value;
  filter();provider.value=selected;apply(false);updateTypes();
 const bytes=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GiB':(n/1048576).toFixed(1)+' MiB';
 function card(item,runtime=false){const job=item.job,downloading=job?.state==='downloading',progress=downloadProgress(job),label=runtime?w.runtime:item.label.split('（')[0].split(' (')[0];
  return `<div class="model-download"><div class="model-info"><strong>${esc(label)}</strong><span class="settings-help">${runtime?esc(item.version):`${w.approx} ${item.size} GB · ${w.vram} ${item.vram} GB`}</span><span class="model-state">${esc(downloading?w.downloading:job?.state==='error'?w.error:item.installed?w.installed:job?.state==='cancelled'?w.cancelled:w.idle)}</span>${downloading?`<progress ${progress===null?'':`value="${progress}" max="100"`}></progress><small>${bytes(job.received)} / ${job.total?bytes(job.total):'…'}</small>`:''}${job?.state==='error'?`<small class="model-error">${esc(job.error)}</small>`:''}</div><div class="model-actions">${downloading?`<button type="button" class="secondary" data-job="${runtime?'runtime_cancel':'model_cancel'}" data-id="${item.id||''}">${w.cancel}</button>`:!item.installed?`<button type="button" class="secondary" data-job="${runtime?'runtime_download':'model_download'}" data-id="${item.id||''}">${job?.state==='error'?w.retry:runtime?w.install:w.download}</button>`:runtime?'':`<button type="button" class="secondary" data-use="${item.id}">${w.use}</button>`}</div></div>`;
 }
 function draw(){if(!status)return;const target=panel.querySelector('.local-model-status'),managed=managedLocal(provider.value);target.hidden=!managed;panel.querySelector('.download-source').hidden=!managed;
  target.innerHTML=managed?card(status.runtime,true)+`<div class="local-run-controls"><button type="button" class="secondary" data-job="local_start" ${!status.runtime.installed||!status.models.some(m=>m.installed)||busy?'disabled':''}>${status.runtime.starting?w.starting:status.runtime.running?w.running:w.start}</button>${status.runtime.running?`<button type="button" class="secondary" data-job="local_stop">${w.stop}</button>`:''}</div>`+status.models.map(item=>card(item)).join(''):'';
  for(const button of target.querySelectorAll('[data-job]'))button.onclick=async()=>{button.disabled=true;const action=button.dataset.job;try{if(action==='local_start'){
   busy=true;await saveCurrent();}await api(action,{id:button.dataset.id,source:panel.querySelector('[name=download-source]:checked')?.value||'hf'});await refresh();
   }catch(error){toast(w.failed);await refresh();}finally{busy=false;draw();}};
  for(const button of target.querySelectorAll('[data-use]'))button.onclick=async()=>{const id=button.dataset.use,next=id==='qwen3_8b'?'llamacpp':'sakura';provider.value=next;
   provider.dispatchEvent(new Event('change',{bubbles:true}));model.value=id;model.dispatchEvent(new Event('change',{bubbles:true}));try{await saveCurrent();toast(w.saved);
   }catch{toast(w.failed);}draw();};
 }
 async function saveCurrent(){const values={};for(const field of data.fields.filter(f=>f.scope==='translation')){const input=form.elements.namedItem(field.key);
  values[field.key]=field.type==='boolean'?input.checked:field.type==='number'?Number(input.value):input.value;}return api('settings_save',{scope:'translation',
  values});}
 async function refresh(){if(!panel.isConnected)return;try{status=await api('model_status');if(panel.isConnected)draw();}catch{if(panel.isConnected)panel.querySelector('.local-model-status').textContent=w.failed;
  }clearTimeout(timer);if(panel.isConnected)timer=setTimeout(refresh,1500);}
 refresh();return()=>{clearTimeout(timer);};
}
