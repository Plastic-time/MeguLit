'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createTranslationService, resolveOptions } = require('./providers.cjs');
const { saveTranslationSettings } = require('./translation-settings.cjs');
const { findRunningController, readPreferences, writePreferences, acquireProfile, cleanStaleProfiles, removeProfile } = require('./startup.cjs');
const { GalNative, cleanGal } = require('./gal-native.cjs');
const { localFontScript } = require('./local-font.cjs');
const { GameFonts, exePath } = require('./game-fonts.cjs');
const { Library, Synopses } = require('./library.cjs');
// A game whose hook delivered real text gets its home-page lamp confirmed (one program lookup per game process).
const hookCheckedPids = new Set();
function confirmHook(){const pid=Number(galNative?.state?.gameProcessId);if(!pid||hookCheckedPids.has(pid))return;hookCheckedPids.add(pid);exePath(pid).then(exe=>{if(exe&&library.verify(exe))broadcast('window.__tomeLibraryChanged?.()');}).catch(()=>{});}
const { createReadingResolver } = require('./reading.cjs');
const { LocalLearning } = require('./learning-native.cjs');
const {cleanLookup,lookupOptions,presets:lookupPresets}=require('./lookup-models.cjs');
const readings = createReadingResolver();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const L = require('./layout.cjs'), folder = L.config; // settings and keys live in config/
const library = new Library(L), synopses = new Synopses(L);
const { UnityFont } = require('./unity-font.cjs'), unityFont = new UnityFont(L.root);
const { ModelStore } = require('./model-store.cjs'), models = new ModelStore(L.root);
// Runs the downloaded offline models with a pinned llama.cpp runtime (Sakura / llama.cpp engines).
const { LocalLlm } = require('./local-llm.cjs'), localLlm = new LocalLlm({ root:L.root, models, logs:L.logs });
process.on('exit',()=>{try{localLlm.server?.child.kill();}catch{}});
const LOCAL_ERRORS={LOCAL_RUNTIME_MISSING:['本地模型还缺少运行库：在翻译设置的「离线模型下载」里先下载「llama.cpp 本地运行库」','The local model needs its runtime: download "llama.cpp local runtime" under Offline model downloads in the translation settings','ローカルモデルの実行環境がありません：翻訳設定の「オフラインモデル」で「llama.cpp ローカル実行環境」をダウンロードしてください'],LOCAL_MODEL_MISSING:['还没有下载离线翻译模型：在翻译设置的「离线模型下载」里下载一个模型','No offline translation model yet: download one under Offline model downloads in the translation settings','オフライン翻訳モデルがまだありません：翻訳設定の「オフラインモデル」でダウンロードしてください'],LOCAL_SERVER_FAILED:['本地模型启动失败（可能显存不足），详情见 logs\\local-llm.log','The local model failed to start (perhaps too little video memory); see logs\\local-llm.log','ローカルモデルの起動に失敗しました（VRAM 不足の可能性）。logs\\local-llm.log を確認してください']};
const localError=(problem,options)=>{const m=LOCAL_ERRORS[problem?.code];if(!m)return problem?.message||String(problem);const lang=String(options?.uiLanguage||options?.learnerLanguage||'');return m[lang==='en'?1:lang==='ja'?2:0];};
const version = '3.0.0';
const {engine:appPath,hiddenStartup} = require('./paths.cjs');
const logPath = path.join(L.logs, 'startup.log');
const statePath = path.join(L.cache, 'running.json');
const injectScripts = ['ui-state.js','native-transport.js','taskbar-sync.js','interface-mode.js','game-style.js','game-profile.js','typewriter.js','ruby-layout.js','furigana.js','inject.js','settings.js','learning.js','learning-layout.js','gal.js','game-fonts-ui.js','menu-layout.js','lookup-layout.js','selection.js','island-source.js','island-page.js','hook-reader.js','wait-marker.js','hook-panel.js','v4.js','voice-layout.js','interaction.js','backlog.js','box-preview.js','polish.js','i18n.js','about.js','nav-shell.js','library.js','background.js','settings-tabs.js','anki-sync.js','stats-layout.js','difficulty.js','color-picker.js','ui-behavior.js','game-style-sync-ui.js','text-position.js'].map(name => 'try{\n'+fs.readFileSync(path.join(__dirname,name),'utf8')+'\n}catch(e){console.error('+JSON.stringify('[ToMe] '+name)+',e);try{window.__tomeScriptErrors=(window.__tomeScriptErrors||[]).concat('+JSON.stringify(name)+'+": "+e.message);}catch{}}').join('\n')+'\n'+localFontScript();
let nativeSnapshot={};try{nativeSnapshot=JSON.parse(fs.readFileSync(path.join(folder,'native-preferences.json'),'utf8'));}catch{}
const uiStatePath=path.join(folder,'ui-state.json');
function cleanUiState(values){const out={};let total=0;if(values&&typeof values==='object'&&!Array.isArray(values))for(const [key,value]of Object.entries(values)){if(!/^tomoyo-[\w.-]{1,80}$/.test(key)||/key|token|secret|password/i.test(key)||typeof value!=='string'||value.length>50000)continue;total+=value.length;if(total>500000)break;out[key]=value;}return out;}
let uiState={};try{uiState=cleanUiState(JSON.parse(fs.readFileSync(uiStatePath,'utf8')));}catch{}
const engineMeta=Object.fromEntries(Object.entries(require('./engines.cjs').ENGINES).map(([k,e])=>[k,{label:e.label,group:e.group,kind:e.kind,keyless:!!e.keyless,editable:!!e.editable,pair:!!e.pair,baseUrl:e.baseUrl,model:e.model||'',hint:e.hint||''}]));
const injectSource=()=>'(()=>{window.__tomoyoEngines='+JSON.stringify(engineMeta)+';window.__tomoyoNativePreferences='+JSON.stringify(nativeSnapshot)+';window.__tomoyoUiState='+JSON.stringify(uiState)+';if(location.hostname!==\"tauri.localhost\")return;\n'+injectScripts+'\n})();';
const localLearning = new LocalLearning(L.root,message=>galEvent({type:'learning',...message}));
const service = createTranslationService(fetch, process.env.OPENAI_API_KEY || '');
const {translationCurrent}=require('./translation-scope.cjs');
const {SecretStore}=require('./secrets.cjs'),{Speech}=require('./speech.cjs'),{Anki}=require('./anki.cjs'),{cleanV4}=require('./v4-config.cjs'),{Immersion}=require('./immersion.cjs'),{ReadingStats}=require('./reading-stats.cjs');
const services=new (require('./services.cjs').Services)(L.root);
const voicePack=new (require('./voice-pack.cjs').VoicePack)({log:m=>log(m)});
let secrets;try{secrets=new SecretStore(folder,undefined,L.launcher);}catch(error){
  // The vault program could not run: the key file is fine, so it stays where it is; keys just cannot be read now.
  if(error.code==='VAULT_UNAVAILABLE'){fs.appendFileSync(logPath,`${new Date().toISOString()} Key vault unavailable, saved keys left in place: ${error.message}\n`);secrets=new SecretStore(folder,undefined,L.launcher,{load:false});}else{
  // A key file that this Windows account cannot decrypt must not stop the whole app.
  const broken=path.join(folder,'secrets.dpapi.unreadable-'+Date.now());
  try{fs.renameSync(path.join(folder,'secrets.dpapi'),broken);}catch{}
  fs.appendFileSync(logPath,`${new Date().toISOString()} Saved API keys could not be decrypted and were moved to ${path.basename(broken)}: ${error.message}\n`);
  secrets=new SecretStore(folder,undefined,L.launcher);
}}
const speech=new Speech(L.cache),anki=new Anki();for(const [base,key]of secrets.entries())service.setKey(base,key);
// Sentence for the Anki card: furigana over kanji, the selected word wrapped in .tm-hl.
function furiganaHtml(text,tokens,start,end){
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hira=v=>String(v||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));const chars=[...text];let out='',pos=0;
  const sorted=[...(tokens||[])].filter(t=>Number.isInteger(t.start)&&Number.isInteger(t.end)).sort((x,y)=>x.start-y.start);
  for(const t of sorted){if(t.start<pos)continue;if(t.start>pos){out+=wrap(chars.slice(pos,t.start).join(''),pos,t.start);}const surface=chars.slice(t.start,t.end).join('');
    let piece=esc(surface);if(/[一-龯々〆ヶ]/.test(surface)&&t.reading){const r=hira(t.reading);if(r&&r!==surface){const head=surface.match(/^[ぁ-ゖ]*/)[0],tail=surface.match(/[ぁ-ゖ]*$/)[0];const core=surface.slice(head.length,surface.length-tail.length);
      if(core&&r.startsWith(head)&&r.endsWith(tail)&&r.length>head.length+tail.length)piece=esc(head)+'<ruby>'+esc(core)+'<rt>'+esc(r.slice(head.length,r.length-tail.length))+'</rt></ruby>'+esc(tail);else piece='<ruby>'+esc(surface)+'<rt>'+esc(r)+'</rt></ruby>';}}
    out+=t.start<end&&t.end>start?'<b class="tm-hl">'+piece+'</b>':piece;pos=t.end;}
  if(pos<chars.length)out+=wrap(chars.slice(pos).join(''),pos,chars.length);return out;
  function wrap(str,a0,a1){if(!(a0<end&&a1>start))return esc(str);const s=Math.max(start,a0)-a0,e=Math.min(end,a1)-a0,c=[...str];return esc(c.slice(0,s).join(''))+'<b class="tm-hl">'+esc(c.slice(s,e).join(''))+'</b>'+esc(c.slice(e).join(''));}
}
function findAnki(){const env=process.env,list=[v4.ankiPath,env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','Anki','anki.exe'),env.ProgramFiles&&path.join(env.ProgramFiles,'Anki','anki.exe'),env['ProgramFiles(x86)']&&path.join(env['ProgramFiles(x86)'],'Anki','anki.exe')];for(const p of list)if(p&&/(^|[\\/])anki\.exe$/i.test(p))try{if(fs.statSync(p).isFile())return p;}catch{}return '';}
let v4=cleanV4();try{v4=cleanV4(JSON.parse(fs.readFileSync(path.join(folder,'v4-preferences.json'),'utf8')));}catch{}
// Voice warmup follows a confirmed game process; the home page does not allocate a GPU model.
let immersionHide=null;const immersion=new Immersion(m=>{clearTimeout(immersionHide);if(m.dialogVisible===false){immersionHide=setTimeout(()=>galNative?.send({type:'dialogVisibility',visible:false}),140);}else galNative?.send({type:'dialogVisibility',visible:m.dialogVisible});galEvent(m);});immersion.configure(v4);const immersionTick=setInterval(()=>immersion.tick(),100);immersionTick.unref();
// Home-page reading stats from hook lines (the upstream play-button session never runs under ToMe).
const readingStats=new ReadingStats({file:path.join(process.env.APPDATA||'','com.daishi.tomoyo','immersion.db'),games:()=>library.load().games,log});
let child, ownsState = false;
let galNative,dictChecking=false;
const activeClients = new Set();
let lastMaskLog = '', lastMaskGeometry = '', lastMarkerLog = '', lastWaitLog = '';
// Game fonts: detect when a game window is bound, push to every UI, auto-apply once per game.
let lastFontPid=0;
function broadcast(expression){for(const client of activeClients)if(!client.closed)client.call('Runtime.evaluate',{expression,returnByValue:true}).catch(()=>{});}
function fontExpression(){return `window.__tomoyoChinese?.gameFonts?.(${JSON.stringify(gameFonts.payload(true))})`;}
function applyGameFonts(){const info=gameFonts.current;if(!galNative||info?.status!=='ready')return false;const zh=info.fonts.find(f=>f.lang==='zh'),ja=info.fonts.find(f=>f.lang==='ja');if(!zh&&!ja)return false;
  const next={...galNative.preferences};if(zh)next.chineseFont='game:'+zh.id;if(ja)next.japaneseFont='game:'+ja.id;else if(!['originalGothic','originalMincho'].includes(next.japaneseFont))next.japaneseFont='originalGothic';
  galNative.save(next);gameFonts.markApplied();broadcast(`window.__tomoyoChinese?.restoreGalSettings?.(${JSON.stringify(galNative.preferences)});window.__tomoyoChinese?.gameFontsRefresh?.()`);log('Game fonts applied: zh='+(zh?.family||'-')+' ja='+(ja?.family||'default'));return true;}
const gameFonts=new GameFonts(L,info=>{log('Game fonts: '+(info.status==='ready'?`${info.label} engine=${info.engine||'?'} fonts=${info.fonts.map(f=>f.lang+':'+f.family+(f.legacy?'(repaired)':'')).join(', ')||'none'}`:info.message));broadcast(fontExpression());if(info.status==='ready'&&!info.autoApplied&&info.fonts.length)applyGameFonts();});
// Window binding is runtime state owned by the launcher (library launch, galBind, galUnbind). Page settings pushed by the
// menu, profile restore or a calibration preview carry the page's stale copy: keep the launcher's, or every game was
// unbound on entry (floating text box, embedding off, Alt+T confined to the box).
function boundFields(settings){return {gameProcess:galNative?.preferences?.gameProcess||settings?.gameProcess,bindEnabled:galNative?.preferences?galNative.preferences.bindEnabled===true:settings?.bindEnabled===true};}
function galEvent(message) {
  // Frosted glass: the small live picture behind the glass panels; the page scales and blurs it (E148).
  if(message.type==='glassFrame'){broadcast(`window.__tomoyoChinese?.glassFrame?.(${JSON.stringify(message)})`);return;}
  services.gameEvent(message,v4).catch(e=>log('Game speech lifecycle: '+e.message));
  if(message.type==='gameStyleStatus'){log('Game style: '+message.gameStyleState+' '+(message.gameStyleElapsedMs||0)+'ms '+(message.gameStyleReason||''));broadcast(`window.__tomoyoChinese?.gameStyleStatus?.(${JSON.stringify(message)})`);return;}
  // Where the game draws the current line (engine draw hooks): followed by text-position.js when enabled.
  if(message.type==='hookTextPos'){broadcast(`window.__tomoyoChinese?.textPosition?.(${JSON.stringify(message)})`);return;}
  // Several lines on one game page (ISLAND and similar): hook-reader.js keeps the page's earlier lines above the current one.
  if(message.type==='hookPage'){broadcast(`window.__tomoyoChinese?.hookPage?.(${JSON.stringify(message)})`);return;}
  if(message.type==='gameCleanup')log('Game cleanup pid='+message.pid+' success='+message.success+' '+message.message);
  if(message.gameProcessId&&Number(message.gameProcessId)!==lastFontPid){lastFontPid=Number(message.gameProcessId);gameFonts.detect(lastFontPid).catch(e=>log('Game fonts failed: '+e.message));}
  if(message.type==='dialogEvidence'&&v4.dialogDetection==='visual')immersion.evidence(message.visible,'visual');
  if(message.type==='ready')galNative?.send({type:'dialogConfig',active:v4.immersion&&v4.dialogDetection==='visual',marker:v4.immersion&&v4.dialogDetection==='marker'});
  if(message.type==='hookDialog'){immersion.engine(message.visible,message.engine);return;}
  if(message.type==='markerPresence')immersion.marker(message.present===true);
  if(message.type==='waitMarkerDrawn'){immersion.markerDrawn();galNative?.send({type:'markerHookDrawn'});return;}
  if(message.type==='gameClosed'||message.bound===false)immersion?.bind('');
  else if(message.gameHwnd)immersion?.bind(String(message.gameHwnd)+'|'+String(message.gameProcessId||'')+'|'+String(message.gameStarted||''));
  if(typeof message.hookSource==='string'){galNative?.send({type:'markerSource',text:message.hookSource});immersion?.source(message.hookSource,message.hookSourceEngine);if(message.hookActive!==false&&message.hookSource.trim())confirmHook();readingStats.line({text:message.hookSource,origin:message.hookSourceOrigin,sequence:message.hookSequence,active:message.hookActive,recovering:message.hookRecovering,process:galNative?.state?.processName||galNative?.preferences?.gameProcess});log('Hook dispatch chars='+message.hookSource.length+' sequence='+message.hookSequence+' clients='+activeClients.size);}
  if(message.type==='coverDebug'){log('Visibility: '+message.text);return;}
  if (message.maskMessage && message.maskMessage !== lastMaskLog) { lastMaskLog = message.maskMessage; log('Mask: '+message.maskMessage); }
  // Wait-marker (▼) diagnostics go to startup.log so a failed hide can be traced without screenshots.
  if (message.type==='markerDebug') { if (message.markerDebug!==lastMarkerLog) { lastMarkerLog=message.markerDebug; log('Wait marker detection: '+message.markerDebug); } return; }
  if (typeof message.waitMarkerMessage==='string' && message.waitMarkerMessage!==lastWaitLog) { lastWaitLog=message.waitMarkerMessage; log('Wait marker hook: '+message.waitMarkerMessage); }
  const expression = message.type === 'waitMarkerFrame' ? `window.__tomoyoChinese?.waitMarkerFrame?.(${JSON.stringify(message)})` : message.type === 'hotkey' ? 'window.__tomoyoChinese?.toggleGalMenu?.()' : message.type === 'maskFrame' ? `window.__tomoyoChinese?.galMaskFrame?.(${JSON.stringify(message)})` :`window.__tomoyoChinese?.galStatus?.(${JSON.stringify(message)})`;
  const learning=Object.fromEntries(['learningMessage','learningProgress','learningInstalled'].filter(k=>message[k]!==undefined).map(k=>[k,message[k]]));
  for (const client of activeClients) if (!client.closed) client.call('Runtime.evaluate', { expression:expression+`;window.__tomoyoChinese?.learningStatus?.(${JSON.stringify(learning)});window.__tomoyoChinese?.hookReaderStatus?.()` ,returnByValue:true}).then(result=>{if(typeof message.hookSource==='string')log('Hook UI '+JSON.stringify(result.exceptionDetails?{error:result.exceptionDetails.text}:result.result?.value||{ready:false}));}).catch(error=>{if(typeof message.hookSource==='string')log('Hook UI error: '+error.message);});
}

function log(message) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
}

async function evaluate(client,params){
  try{return await client.call('Runtime.evaluate',params);}catch(error){
    if(/Cannot find context|Execution context was destroyed|Inspected target navigated|Cannot find.*context/.test(error.message))return {};
    throw error;
  }
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let next = 0;
    const pending = new Map();
    const events = new Map();
    const timer = setTimeout(() => { socket.close(); reject(new Error('连接 ToMe 超时')); }, 8000);
    const client = {
      closed: false,
      call(method, params = {}) {
        return new Promise((done, fail) => {
          const id = ++next;
          const timeout = setTimeout(() => { pending.delete(id); fail(new Error(`Timeout: ${method}`)); }, 10000);
          pending.set(id, { done, fail, timeout });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      on(event, callback) { events.set(event, callback); },
      close() { socket.close(); },
    };
    socket.onopen = () => { clearTimeout(timer); resolve(client); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('无法连接 ToMe 翻译组件')); };
    socket.onclose = () => {
      client.closed = true;
      for (const { fail, timeout } of pending.values()) { clearTimeout(timeout); fail(new Error('ToMe 已关闭连接')); }
      pending.clear();
    };
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        clearTimeout(waiter.timeout);
        message.error ? waiter.fail(new Error(message.error.message)) : waiter.done(message.result);
      } else if (events.has(message.method)) {
        Promise.resolve(events.get(message.method)(message.params)).catch(error => log(`Bridge: ${error.message}`));
      }
    };
  });
}

async function injectPage(target) {
  startupProgress(45);
  const client = await connect(target.webSocketDebuggerUrl);
  startupProgress(55);
  activeClients.add(client);
  try {
  const latest = new Map();
  const latestLookup=new Map();
  client.on('Runtime.bindingCalled', async event => {
    if (event.name !== '__tomoyoTranslateRequest') return;
    let request;
    try { request = JSON.parse(event.payload); } catch { return; }
    if(request.type==='uiState'){const next=cleanUiState(request.values);uiState=next;fs.writeFileSync(uiStatePath+'.tmp',JSON.stringify(next,null,1));fs.renameSync(uiStatePath+'.tmp',uiStatePath);return;}
    if(request.type==='keyStatus'){
      // Only booleans leave the launcher; key values are never sent back to the page.
      const status={};for(const [name,options]of Object.entries(request.targets||{}).slice(0,20)){try{const o=resolveOptions(options);status[name]=service.hasKey(o.baseUrl,o.provider);}catch{status[name]=false;}}
      await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.keyStatus?.(${JSON.stringify(status)})`});return;
    }
    if(request.type==='nativeSettings'){const s=request.settings;if(s&&typeof s==='object'&&JSON.stringify(s).length<100000){const safe={};for(const [key,value]of Object.entries(s))if(!/key|token|secret|password/i.test(key))safe[key]=value;const target=path.join(folder,'native-preferences.json');fs.writeFileSync(target+'.tmp',JSON.stringify(safe,null,2));fs.renameSync(target+'.tmp',target);}return;}
    if(request.type==='hookReplacementConfirm'){galNative?.hooks.confirmReplacement();return;}
    if(request.type==='hookStart'){galNative?.userStart(request.profile,request.force===true,request.id);return;}
    if(request.type==='hookPrefs'){galNative?.setHookPrefs(request.settings);return;}
    if(request.type==='gameFontsLoad'){if(gameFonts.current)await evaluate(client,{contextId:event.executionContextId,expression:fontExpression()});return;}
    if(request.type==='gameFontsRescan'){const pid=Number(galNative?.state.gameProcessId);if(pid>0){lastFontPid=pid;gameFonts.detect(pid,true).catch(e=>log('Game fonts failed: '+e.message));}else{await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.gameFonts?.(${JSON.stringify({status:'error',message:'还没有绑定游戏窗口：先打开游戏并按 Alt+T 绑定'})})`});}return;}
    if(request.type==='gameFontsApply'){applyGameFonts();return;}
    if(request.type==='gameStyleCaptureReady'){galNative?.styleSync.captureReady(request.id);return;}
    if(request.type==='gameStyleCancel'){if(request.key&&request.key!==galNative?.styleSync.profileKey)return;galNative?.controller.finishStyleSync(false,true);return;}
    if(request.type==='gameStyleSync'){if(request.key&&request.key!==galNative?.styleSync.profileKey)return;galNative?.controller.beginStyleSync(true,request.part,request.owner);return;}
    // The user accepted the synced style: remember it for this game. Menu saves later keep that copy current.
    if(request.type==='gameStyleConfirm'){if(!request.key||request.key!==galNative?.styleSync.profileKey)return;galNative?.styleSync.saveProfile(request.prefs,['text','position'].includes(request.part)?request.part:'all',request.key,request.map,request.saveId);return;}
    if(request.type==='gameStyleUpdate'){galNative?.styleSync.updateProfile(request.prefs||{});return;}
    if(request.type==='gameStyleProfileRequest'){galNative?.styleSync.replay();return;}
    if(request.type==='gameStyleImportList'){const sync=galNative?.styleSync;if(sync)sync.status('importList',{gameStyleImportList:sync.savedWorks()});return;}
    if(request.type==='gameStyleImportPreview'){const sync=galNative?.styleSync;if(!sync||!request.key||request.key!==sync.profileKey)return;const part=request.part==='position'?'position':'text',found=sync.importFrom(String(request.source||''),part);sync.status('importPreview',{gameStyleImportPart:part,gameStyleImportSource:String(request.source||''),gameStyleImportPrefs:found?.prefs||null,gameStyleImportMap:found?found.map??null:null});return;}
    if(request.type==='textPosMapSave'){if(request.key)galNative?.styleSync.savePositionMap(request.map,request.key);return;}
    if(request.type==='hookCheck'){galNative?.controller.check();return;}
    if(request.type==='hookRescan'){galNative?.hooks.rescan();return;}
    if(request.type==='v4'){
      if(!Number.isSafeInteger(request.id))return;let result=null,error='';
      try{const a=request.args||{};switch(request.action){
        case 'load':result=v4;break;
        case 'libraryLoad':result=library.load();break;
        case 'librarySteam':result=await library.findSteam();break;
        case 'libraryCheck':result=library.check(a.kind,a.value);break;
        case 'librarySettings':result=library.settings(a);break;
        case 'libraryScan':result=await library.scan(p=>broadcast('window.__tomeLibraryProgress?.('+JSON.stringify(p)+')'));break;
        case 'libraryManualAdd':result=library.manualAdd(a);break;case 'libraryRestore':result=await library.restore(a);break;
        case 'libraryLink':result=library.link(a.links);break;
        case 'librarySynopsis':result=await synopses.get(a);break;
        // Start a game and bind to it as soon as its window appears (a different bound game is released first).
        // Home background picture: copied into config\ so it survives restarts; read back as a data URL.
        case 'backgroundSet':{const stem=a.slot==='game'?'background-game':'background';const src=String(a.path||'');const ext=(path.extname(src).toLowerCase().match(/^\.(png|jpe?g|webp|gif|bmp)$/)||[])[0];if(!ext||!fs.existsSync(src))throw Error('请选择 PNG / JPG / WEBP / GIF / BMP 图片');if(fs.statSync(src).size>40*1048576)throw Error('图片超过 40 MB');for(const f of fs.readdirSync(folder))if(new RegExp('^'+stem+'\\.').test(f))fs.rmSync(path.join(folder,f),{force:true});fs.copyFileSync(src,path.join(folder,stem+ext));result={ok:true};break;}
        case 'backgroundGet':{const stem=a.slot==='game'?'background-game':'background';const f=fs.readdirSync(folder).find(n=>new RegExp('^'+stem+'\\.(png|jpe?g|webp|gif|bmp)$').test(n));if(!f){result={image:''};break;}const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp'}[path.extname(f)];result={image:'data:'+mime+';base64,'+fs.readFileSync(path.join(folder,f)).toString('base64')};break;}
        case 'gameFrame':{const jpeg=galNative?.gameFrame?await galNative.gameFrame().catch(()=>''):'';result={image:jpeg?'data:image/jpeg;base64,'+jpeg:''};break;}
        // Read-only preview of a picked picture for the crop window: nothing is copied until backgroundSet (confirm).
        case 'backgroundPeek':{const src=String(a.path||'');const ext=(path.extname(src).toLowerCase().match(/^\.(png|jpe?g|webp|gif|bmp)$/)||[])[0];if(!ext||!fs.existsSync(src))throw Error('请选择 PNG / JPG / WEBP / GIF / BMP 图片');if(fs.statSync(src).size>40*1048576)throw Error('图片超过 40 MB');const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp'}[ext];result={image:'data:'+mime+';base64,'+fs.readFileSync(src).toString('base64')};break;}
        case 'backgroundClear':{const stem=a.slot==='game'?'background-game':'background';for(const f of fs.readdirSync(folder))if(new RegExp('^'+stem+'\\.').test(f))fs.rmSync(path.join(folder,f),{force:true});result={ok:true};break;}
        case 'modelStatus':result={...models.status(),runtime:localLlm.status()};break;
        case 'runtimeDownload':result=localLlm.download();break;
        case 'runtimeCancel':result=localLlm.cancel();break;
        case 'runtimeDelete':result=await localLlm.remove();break;
        case 'modelDownload':result=models.download(String(a.id),String(a.source||'hf'));break;
        case 'modelCancel':result=models.cancel(String(a.id));break;
        case 'modelDelete':result=models.remove(String(a.id));break;
        case 'unityFontStatus':result=unityFont.status();break;
        case 'unityFontDownload':result=unityFont.download();break;
        case 'localeStatus':result=await library.locale.status(true);break;
        case 'localeInstall':result=await library.locale.install();break;
        case 'libraryLaunch':{
          // First Unity game: its Chinese font bundle is offered before the game starts (skipUnityFont starts it anyway).
          const variant=Number.isInteger(a.variant)?a.variant:undefined;if(!a.skipUnityFont&&UnityFont.isUnity(library.exeOf(a.key,variant))&&!unityFont.installed()){result={needUnityFont:true,...unityFont.status()};break;}
          const r=await library.launch(a.key,variant,{localeJapanese:a.localeJapanese});if(r.needLocaleEmulator){result=r;break;}if(galNative){if(galNative.state?.processName&&String(galNative.state.processName).toLowerCase()!==r.name.toLowerCase())galNative.send({type:'unbind'});galNative.save({...galNative.preferences,gameProcess:r.name,bindEnabled:true});}result=r;break;}
        case 'calibrate':galNative?.send({type:'dialogCalibrate',x:a.x,y:a.y,width:a.width,height:a.height});result={pending:true};break;
        case 'configure':{v4=cleanV4(a);galNative?.setGameAudio(v4.ankiGameMedia!==false);const target=path.join(folder,'v4-preferences.json');fs.writeFileSync(target+'.tmp',JSON.stringify(v4,null,2));fs.renameSync(target+'.tmp',target);immersion.configure(v4);galNative?.send({type:"dialogConfig",active:v4.immersion&&v4.dialogDetection==="visual",marker:v4.immersion&&v4.dialogDetection==="marker"});result=v4;break;}
        case 'speakers':await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);result=await speech.speakers(v4);services.rememberSpeakers(result);break;
        // The last speaker list read from AivisSpeech, so Settings shows voice names without starting the GPU engine.
        case 'speakersCached':result=services.cachedSpeakers();break;
        // Recommended voices (4 male, 4 female) are downloaded in the background; the menu polls the status.
        // When new models arrived, the owned engine restarts so it loads them and the speaker list is refreshed.
        case 'voicePackStatus':result=voicePack.status();break;
        case 'voicePackInstall':{const refresh=async()=>{await services.stopSpeech();try{await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);services.rememberSpeakers(await speech.speakers(v4));}catch(e){log('Voice pack: speaker refresh failed: '+e.message);}};result=a.uuid?voicePack.startOne(String(a.uuid),refresh):voicePack.start(refresh);break;}
        case 'voicePackCancel':result=voicePack.cancel(String(a.uuid||''));break;
        // The engine holds loaded model files open: stop it, delete only that voice's model, then restart and refresh.
        case 'voicePackRemove':{await services.stopSpeech();try{result=voicePack.remove(String(a.uuid||''));}finally{try{await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);services.rememberSpeakers(await speech.speakers(v4));}catch(e){log('Voice pack: speaker refresh failed: '+e.message);}}break;}
        case 'ankiStatus':result=await anki.status(v4);break;
        case 'ankiFind':result={path:findAnki()};break;
        case 'preview':{const speaker=Number(a.speaker),text=typeof a.text==='string'?a.text.trim().slice(0,200):'';if(!Number.isSafeInteger(speaker)||speaker<0||!text)throw Error('无效的试听参数');await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);result=await speech.synthesize({surface:text,reading:'',pitch:[]},{...v4,aivisSpeaker:speaker,aivisSpeed:Number.isFinite(Number(a.speed))?Number(a.speed):v4.aivisSpeed});break;}
        case 'ankiStats':{
          const linked=new Set((Array.isArray(a.linked)?a.linked:[]).map(Number));const notes=await anki.stats(v4);let resolved=0;
          for(const n of notes){if(linked.has(n.noteId)||!n.word||resolved>=300)continue;resolved++;
            try{const text=n.word,len=[...text].length,r=await localLearning.request('lookup_exact',{text,start:0,end:len},'zh');const e=(r.entries||[]).find(x=>(x.spellings||[]).includes(text)||(x.readings||[]).includes(text))||(r.entries||[])[0];
              if(e)n.entry={id:e.id,spellings:e.spellings||[],readings:e.readings||[],definitions:e.definitions||(e.definition_groups||[]).map(g=>g.text),pos:e.pos||[]};}catch{}}
          result=notes;break;}
        case 'ankiLaunch':{
          try{const info=await anki.status(v4);result={running:true,version:info.version};break;}catch{}
          const exe=findAnki();if(!exe)throw Error('没找到 anki.exe：请在上面填写 Anki 程序路径并保存，或先手动打开 Anki');
          spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false}).on('error',()=>{}).unref();
          let info=null;for(let i=0;i<40&&!info;i++){await sleep(750);try{info=await anki.status(v4);}catch{}}
          if(!info)throw Error('Anki 已启动，但 AnkiConnect 没有响应：确认已安装 AnkiConnect 插件（代码 2055492159）并重启 Anki');
          result={launched:true,path:exe,version:info.version};break;}
        case 'word':case 'speak':case 'anki':case 'prefetch':{
          if(typeof a.text!=='string'||a.text.length>4000||!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.end<=a.start||a.end>[...a.text].length)throw Error('无效词条范围');
          const word=await localLearning.word(a,a.entryId);{/* The game's own ruby for this word (per work) beats the dictionary guess. */const dict=galNative?.gameRuby?.dict(galNative?.styleSync?.profileKey)||{},game=dict[word.surface];if(typeof game==='string'&&game){word.reading=game;word.ambiguous=false;word.pitch=[];word.pitchSource='游戏原文注音';}}if(a.pitchChoice!==undefined){if(!word.pitch.includes(a.pitchChoice))throw Error('所选音调不在 UniDic 候选中');word.pitch=[a.pitchChoice];}
          if(request.action==='word')result=word;else if(request.action==='prefetch'){await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);await speech.synthesize(word,v4,{prefetch:true});result={ready:true};}else if(request.action==='speak'){await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);result=await speech.synthesize(word,v4);}else{let audio,extra={translation:typeof a.translation==='string'?a.translation.slice(0,1000).trim():''};try{extra.sentenceHtml=furiganaHtml(a.text,await localLearning.tokenize(a.text),a.start,a.end);}catch{}if(v4.ankiGameMedia!==false&&galNative){const media=await galNative.gameMedia(a.text).catch(()=>null);if(media?.screenshot)extra.screenshot=media.screenshot;if(media?.audio){extra.sentenceAudio=media.audio;extra.gameAudio=true;}log('Anki game media: line '+(media?.matched?'found':'not found')+', voice '+(media?.audio?'yes':'no')+', picture '+(media?.screenshot?'yes':'no')+(media?.error?', '+media.error:''));}if(v4.ankiAudio){await services.ensureSpeech(v4.aivisUrl,v4.aivisGpu);audio=await speech.synthesize(word,v4);if(!extra.sentenceAudio)try{extra.sentenceAudio=await speech.synthesize({surface:a.text,reading:'',pitch:[]},v4);}catch{}}result=await anki.sync(word,v4,audio,extra);}break;
        }
        default:throw Error('未知学习操作');
      }}catch(e){error=e.message;}
      await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.v4Deliver?.(${request.id},${JSON.stringify(result)},${JSON.stringify(error)})`});return;
    }
    if(request.type==='learningSettings'){writePreferences(folder,request.settings);return;}
    if(request.type==='lookupConfigure'){
      let error='';try{const lookup=cleanLookup(request.settings);for(const name of Object.keys(lookupPresets)){const key=request.keys?.[name];if(key){secrets.set(lookup.lookupProfiles[name].baseUrl,key);service.setKey(lookup.lookupProfiles[name].baseUrl,key);}}writePreferences(folder,{...readPreferences(folder),...lookup});}catch(e){error=e.message;}
      await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.lookupConfigured?.(${JSON.stringify(error)})`});return;
    }
    if(request.type==='lookupCancel'){latestLookup.delete(event.executionContextId);return;}
    if(request.type==='lookupExplain'){
      const args=request.args;if(!Number.isSafeInteger(request.id)||typeof args?.text!=='string'||args.text.length>4000||!Number.isSafeInteger(args.start)||!Number.isSafeInteger(args.end)||args.start<0||args.end<=args.start||args.end>[...args.text].length)return;
      latestLookup.set(event.executionContextId,request.id);let result=null,error='';try{const main=request.options||readPreferences(folder),options=lookupOptions(main,main);if(!options)throw Error('本地查词不需要 API；要使用 AI 解释或归纳，请先在「学习与辞书」选择模型');const local=await localLearning.request('lookup_exact',args,main.learnerLanguage||'zh');result=await service.lookup({selection:[...args.text].slice(args.start,args.end).join(''),sentence:args.text,entries:local.entries,morphology:local.morphology,mode:request.mode},options,()=>latestLookup.get(event.executionContextId)===request.id);}catch(e){error=e.message;}
      if(latestLookup.get(event.executionContextId)===request.id)await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.lookupDeliver?.(${request.id},${JSON.stringify(result)},${JSON.stringify(error)})`});return;
    }
    if(request.type==='learningInstall'){localLearning.install(true).catch(()=>{});return;}
    if(request.type==='dictStatus'||request.type==='dictCheck'||request.type==='dictRepair'){
      const dict=require('./dict-check.cjs'),ctx=event.executionContextId,send=expr=>evaluate(client,{contextId:ctx,expression:expr}).catch(()=>{});
      const status=()=>send(`window.__tomoyoChinese?.dictStatus?.(${JSON.stringify({databases:dict.quickStatus(L.reading),installing:!!localLearning.installing})})`);
      if(request.type==='dictStatus'){await status();return;}
      if(request.type==='dictCheck'){if(dictChecking)return;dictChecking=true;try{const results=await dict.fullCheck(L.reading,p=>send(`window.__tomoyoChinese?.dictCheckProgress?.(${JSON.stringify(p)})`));log('Dictionary check: '+results.map(r=>`${r.name} ok=${r.ok} missing=${r.missing.length} bad=${r.bad.length}`).join('; '));await send(`window.__tomoyoChinese?.dictCheckResult?.(${JSON.stringify(results.map(r=>({...r,missing:r.missing.slice(0,20),bad:r.bad.slice(0,20),missingCount:r.missing.length,badCount:r.bad.length})))})`);}finally{dictChecking=false;}return;}
      localLearning.install(true,true,Array.isArray(request.only)?request.only.filter(x=>['sudachi','unidic'].includes(x)):null).then(()=>status(),()=>status());return;
    }
    if(request.type==='hookSelect'){log('Hook select request id='+String(request.id));galNative?.hooks.select(request.id);return;}
    if(request.type==='learningRequest'){
      if(!Number.isSafeInteger(request.id)||!['tokenize_text','lookup_at_position','lookup_exact','scan_sentence'].includes(request.command)||typeof request.args?.text!=='string'||request.args.text.length>4000)return;
      let result=null,error='';
      try{result=request.engine==='unidic'?(request.command==='tokenize_text'?readings.resolve(request.result):localLearning.adaptResult(request.result,request.language)):await localLearning.request(request.command,request.args,request.language);}
      catch(e){error=e.message;galEvent({type:'learning',learningMessage:error});}
      await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.learningDeliver?.(${request.id},${JSON.stringify(result)},${JSON.stringify(error)})`});return;
    }
    if (request.type === 'loadGalPreferences') {
      await evaluate(client, { contextId:event.executionContextId, expression:`window.__tomoyoChinese?.restoreGalSettings?.(${JSON.stringify(galNative?.preferences || cleanGal())});window.__tomoyoChinese?.galStatus?.(${JSON.stringify({...galNative?.state,type:"restore"})})` });
      return;
    }
    // Which game to bind follows the game actually bound (or started from a work's page), never the page's own copy
    // of the settings: saving the menu used to put an old game back and the new one was not bound any more.
    if (request.type === 'galConfigure') { if(request.gameStyleKey&&request.gameStyleKey!==galNative?.styleSync.profileKey)return;if(galNative)galNative.save({...request.settings,...boundFields(request.settings)}); return; }
    if (request.type === 'galPreview') { if(request.gameStyleKey&&request.gameStyleKey!==galNative?.styleSync.profileKey)return;if(galNative)galNative.preview({...request.settings,...boundFields(request.settings)}); return; }
    if (request.type === 'galReadings') {
      if(!Number.isSafeInteger(request.id)||!Array.isArray(request.tokens)||request.tokens.length>2000)return;
      const tokens=readings.resolve(request.tokens.filter(t=>typeof t?.surface==='string'&&t.surface.length<=4000));
      await evaluate(client,{contextId:event.executionContextId,expression:`window.__tomoyoChinese?.deliverReadings?.(${request.id},${JSON.stringify(tokens)})`});return;
    }
    if (request.type === 'galSource') {
      if (typeof request.text === 'string' && request.text.length <= 4000) { service.observeSource(request.text); galNative?.send({ type:'source',text:request.text }); }
      return;
    }
    if (request.type === 'galMaskLoaded' || request.type === 'galMaskError') {
      if (!Number.isSafeInteger(request.id) || request.id !== galNative?.lastFrameId) return;
      const loaded = request.type === 'galMaskLoaded';
      const count = Number.isSafeInteger(request.count) && request.count >= 0 && request.count <= 4000 ? request.count : 0;
      const message = loaded ? `${request.provisional===true?'极速预遮已加载：':'遮罩图像已加载：'}${count} 个原文小区域` : '阅读层无法加载遮罩图像，请把此状态发给助手';
      galNative.notify({ maskMessage:message });
      const geometry = JSON.stringify([request.x,request.y,request.width,request.height].map(v => Number.isFinite(v) ? Math.round(v) : null));
      if(loaded && geometry !== lastMaskGeometry){lastMaskGeometry=geometry;log('Mask image loaded at '+geometry);}
      return;
    }
    if (request.type === 'galWindows') { galNative?.send({ type:'windows' }); return; }
    if (request.type === 'galBind') {
      if (!/^\d{1,19}$/.test(request.hwnd || '')) return;
      service.clearContext(); galNative?.bind(request.hwnd, request.settings); return;
    }
    if (request.type === 'galUnbind') { service.clearContext(); if(galNative)galNative.save({ ...galNative.preferences,bindEnabled:false }); return; }
    if (request.type === 'galMenu') { galNative?.send({ type:'menu',open:request.open===true }); return; }
    if (request.type === 'galFloatDrag') { galNative?.send({ type:'floatDrag',x:request.x,y:request.y }); return; }
    // Live frosted glass (user, 2026-11-03): the bridge places a DWM-blurred window under each glass-mode panel.
    if(request.type==='galGlass'){if(Array.isArray(request.rects)&&request.rects.length<=16&&request.rects.every(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0)&&Number.isFinite(request.radius))galNative?.send({type:'glass',rects:request.rects.map(r=>({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),radius:Math.round(Number.isFinite(r.radius)?r.radius:request.radius),blur:Number.isFinite(r.blur)?Math.round(r.blur):18,dim:Number.isFinite(r.dim)?Math.round(r.dim):0,saturate:Number.isFinite(r.saturate)?Math.round(r.saturate):100,alpha:Number.isFinite(r.alpha)?Math.max(0,Math.min(100,Math.round(r.alpha))):100,...(Number.isFinite(r.fw)&&Number.isFinite(r.fh)&&r.fw>0&&r.fh>0&&Number.isFinite(r.fx)&&Number.isFinite(r.fy)?{fx:Math.round(r.fx),fy:Math.round(r.fy),fw:Math.round(r.fw),fh:Math.round(r.fh)}:{})})),radius:Math.round(request.radius)});return;}
    if(request.type==='galHitRegions'){if(Array.isArray(request.regions)&&request.regions.length<=256&&request.regions.every(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0))galNative?.send({type:'hitRegions',regions:request.regions,menuOpen:request.menuOpen===true});return;}
    if (request.type === 'galLookup') { galNative?.send({type:'lookup',open:request.open===true});return; }
    if (request.type === 'galToggleCover') { galNative?.send({type:'toggleCover'}); return; }
    if (request.type === 'galToggleMode') { galNative?.send({type:'toggleMode'}); return; }
    if (request.type === 'galShutdown') { galNative?.stop(); return; }
    if (request.type === 'loadPreferences') {
      await evaluate(client, {
        contextId: event.executionContextId,
        expression: `window.__tomoyoChinese?.restoreSettings(${JSON.stringify(readPreferences(folder))});window.__tomoyoChinese?.learningStatus?.(${JSON.stringify({learningInstalled:localLearning.installed(),learningProgress:localLearning.progress,learningMessage:localLearning.installed()?'SudachiDict Full 本地组件已安装':'首次使用 Full 会自动安装本地组件；安装完成后全流程离线'})})`,
      });
      return;
    }
    if (request.type === 'configure') {
      let message = '', success = true;
      try {
        saveTranslationSettings(request, { resolveOptions, service, secrets, persist:settings=>writePreferences(folder,settings) });
      } catch (problem) { success = false; message = problem.message; }
      await evaluate(client, {
        contextId: event.executionContextId,
        expression: `window.__tomoyoChinese?.configured(${success},${JSON.stringify(message)},${Number.isSafeInteger(request.configureId)?request.configureId:'null'})`,
      });
      return;
    }
    if(request.type==='pageTranslationScope'){if(typeof request.key==='string'&&request.key.length<100)latest.set('page:'+event.executionContextId,request.key);return;}
    if (!Number.isSafeInteger(request.id)) return;
    latest.set(event.executionContextId, request.id);
    if (request.disabled !== undefined) return;
    if (typeof request.text !== 'string' || request.text.length > 4000) return;
    let result = '', error = false;
    let errorMessage = '';
    try { await localLlm.ensure(request.options); result = await service.translate(request.text, request.options, () => translationCurrent(latest,event.executionContextId,request)); }
    catch (problem) { error = true; errorMessage = localError(problem, request.options); log('Translation request failed'); }
    if (client.closed) return;
    await evaluate(client, {
      contextId: event.executionContextId,
      expression: `window.__tomoyoChinese?.deliver(${JSON.stringify(request.id)},${JSON.stringify(result)},${error},${JSON.stringify(errorMessage)})`,
    });
  });
  client.on('Runtime.exceptionThrown',event=>{const detail=String(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text||'Page error').replace(/\bsk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,1000);log('Page error: '+detail);});
  await client.call('Runtime.enable');
  await client.call('Page.enable');
  try { await client.call('Emulation.setDefaultBackgroundColorOverride', { color:{r:0,g:0,b:0,a:0} }); } catch {}
  await client.call('Runtime.addBinding', { name: '__tomoyoTranslateRequest' });
  // The launch-time UI snapshot only fills keys missing from localStorage, so it never overrides live values later in the session.
  await client.call('Page.addScriptToEvaluateOnNewDocument', { source: injectSource() });
  startupProgress(75);
  const entry=new URL(target.url);
  if(entry.hostname!=='tauri.localhost')throw Error('拒绝加载非 ToMe 页面');
  await client.call('Page.navigate',{url:entry.href});
  let visible=false;
  for(let attempt=0;attempt<60&&!client.closed;attempt++){
    const checked=await evaluate(client,{expression:'({url:location.href,visible:!!document.querySelector("main,.page")&&document.body.innerText.trim().length>10,bridge:!!window.__tomoyoChinese?.learningInstalled,transport:!!window.__tomoyoTransport?.installed})',returnByValue:true});
    if(checked.result?.value?.visible&&checked.result.value.bridge&&checked.result.value.transport){visible=true;break;}
    await sleep(250);
  }
  if(!visible)throw Error('ToMe 主界面没有正常显示；请运行 engine/tomoyo.exe 暂时恢复原版，并把 startup.log 发给助手');
  // A new page has empty JS state even when the native stream has not changed.
  // Replay the latest sentence and binding after the reader has installed its handlers.
  if(galNative)galEvent({...galNative.state,...galNative.hooks.state,type:'snapshot'});
  startupProgress(95);
  log('Chinese sentence row connected');
  return client;
  } catch(error) {activeClients.delete(client);client.close();throw error;}
}

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Native antialiased startup island while Tomoyo loads; the Tomoyo window stays hidden until ToMe is ready.
let splash=null;
function startSplash(env){
  try{const island=path.join(L.native,'StartupIsland.exe');if(!fs.existsSync(island))return null;const lang=['zh','en','ja'].includes(uiState['tomoyo-ui-language'])?uiState['tomoyo-ui-language']:'zh';
    const flag=path.join(L.cache,'splash-'+process.pid+'.flag');for(const f of [flag,flag+'.pid',flag+'.shown',flag+'.progress',flag+'.engine-error',flag+'.failed'])try{fs.unlinkSync(f);}catch{}
    let err='ignore';try{err=fs.openSync(path.join(L.logs,'splash.log'),'a');}catch{}
    const proc=spawn(island,[flag,lang,readPreferences(folder).themeColor||'#e0495a','--engine',appPath],{env,windowsHide:true,stdio:['ignore','ignore',err]});if(typeof err==='number')try{fs.closeSync(err);}catch{}
    const s={flag,proc,done:false,exited:false,pid:0};proc.on('error',()=>{s.exited=true;});proc.on('exit',code=>{s.exited=true;let failed=!!code;try{const extra=fs.existsSync(flag+'.log')?fs.readFileSync(flag+'.log','utf8'):'';if(extra)failed=true;if(code||extra)fs.appendFileSync(path.join(L.logs,'splash.log'),new Date().toISOString()+' exit '+code+' '+extra+'\n');}catch{}if(s.pid&&(!s.done||failed))showWindowsOf(s.pid);for(const f of [flag,flag+'.pid',flag+'.shown',flag+'.log',flag+'.progress',flag+'.engine-error',flag+'.failed'])try{fs.unlinkSync(f);}catch{}});log('Splash started');return s;}catch(e){log('Splash failed: '+e.message);return null;}
}
function startupProgress(value){const s=splash;if(!s||s.done)return;try{fs.writeFileSync(s.flag+'.progress',String(value));log('Startup milestone '+value);}catch{}}
async function startedByIsland(s){
 if(!s)return null;const until=Date.now()+8000;
 while(!s.exited&&Date.now()<until){
  if(fs.existsSync(s.flag+'.engine-error'))throw Error(fs.readFileSync(s.flag+'.engine-error','utf8'));
  try{const pid=Number(fs.readFileSync(s.flag+'.pid','utf8'));if(Number.isSafeInteger(pid)&&pid>0){const child=new(require('node:events').EventEmitter)();child.pid=pid;const poll=setInterval(()=>{try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){clearInterval(poll);child.emit('exit');}}},250);poll.unref();return child;}}catch{}
  await sleep(30);
 }return null;
}
async function splashShown(s,ms){const until=Date.now()+ms;while(s&&!s.exited&&Date.now()<until){if(fs.existsSync(s.flag+'.shown'))return true;await sleep(50);}return false;}
function splashTarget(s,pid){if(!s)return;s.pid=pid;try{fs.writeFileSync(s.flag+'.pid',String(pid));}catch{}}
function finishSplash(delay=450){const s=splash;if(!s||s.exited){if(hiddenStartup)broadcast('window.__TAURI_INTERNALS__.invoke("tome_startup_reveal")');return;}if(s.done)return;s.done=true;setTimeout(()=>{try{fs.writeFileSync(s.flag,'1');}catch{}},delay);}
// Fallback if the splash process died while the Tomoyo window was hidden.
function showWindowsOf(pid){try{spawn(path.join(L.native,'StartupIsland.exe'),['--restore',String(Number(pid))],{windowsHide:true,stdio:'ignore'});}catch{}}
async function main() {
  if (!fs.existsSync(appPath)) throw new Error(`找不到 ToMe 引擎：${appPath}`);
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
    if (state.version === version && await findRunningController(state, alive, fetch)) {
      log('Chinese launcher is already connected');
      return;
    }
  } catch {}
  fs.writeFileSync(logPath, 'ToMe.V3 3.0.0\n');
  log('Engine '+path.basename(appPath)+'; source-level hidden startup='+hiddenStartup);
  const port = await unusedPort();
  const acquired = acquireProfile(L.cache), profile = acquired.path;
  try { const removed = cleanStaleProfiles(L.cache, profile); if (removed) log(`Removed ${removed} leftover temporary browser profile(s)`); } catch {}
  log(acquired.temporary ? 'Saved browser profile is still locked by an earlier ToMe window; using a temporary profile, UI state restored from ui-state.json' : 'Using saved browser profile (theme and interface state persist)');
  log('Opening a separate translation window; existing ToMe processes are left running');
  const env = { ...process.env,
    WEBVIEW2_DEFAULT_BACKGROUND_COLOR: '00000000',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: profile,
  };
  fs.writeFileSync(statePath, JSON.stringify({ pid: process.pid, port, version }));
  ownsState = true;
  const fullDiagnostic=process.argv.includes('--input-diagnostic-full'),inputDiagnostic=fullDiagnostic||process.argv.includes('--input-diagnostic')||process.argv.includes('--input-diagnostic-with-helper');
  if(!inputDiagnostic||fullDiagnostic)splash=startSplash(env);if(splash)log(await splashShown(splash,3500)?'Splash visible':'Splash not confirmed visible; continuing');
  child = await startedByIsland(splash);
  if(!child)child=spawn(appPath, [], {cwd:path.dirname(appPath),env,stdio:'ignore',windowsHide:true});
  startupProgress(20);
  if(child.pid)splashTarget(splash,child.pid);
  let exited = false;
  let launchError;
  child.once('error', error => { exited = true; launchError = error; });
  child.once('exit', () => { exited = true; });
  if(child.pid&&(!inputDiagnostic||fullDiagnostic||process.argv.includes('--input-diagnostic-with-helper'))){galNative = new GalNative(L,child.pid,galEvent);galNative.setGameAudio(v4.ankiGameMedia!==false);}
  if(inputDiagnostic){log('Input diagnostic: isolated startup variant; closes in 120 seconds');const diagnosticChild=child;const diagnosticTimer=setTimeout(()=>{try{process.kill(diagnosticChild.pid);}catch{}},120000);diagnosticChild.once('exit',()=>clearTimeout(diagnosticTimer));}
  const connections = new Map();
  const deadline = Date.now() + 45000;
  let attached = false;
  while (!exited) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) });
      const targets = await response.json();
      for (const target of targets) {
        if (target.type !== 'page' || !/^https?:\/\/tauri\.localhost\//.test(target.url) || !target.webSocketDebuggerUrl) continue;
        const existing = connections.get(target.id);
        if (!existing || existing.closed) {
          connections.set(target.id, await injectPage(target));
          attached = true;finishSplash();
        }
      }
    } catch (error) {
      log(`Bridge connect attempt failed: ${error.message}`);
    }
    if (!attached && Date.now() > deadline) throw new Error('ToMe 未开放翻译连接，请关闭程序后重试；详情见 startup.log');
    await sleep(attached ? 2000 : 400);
  }
  if(attached)finishSplash(0);else if(splash&&!splash.done){splash.done=true;try{fs.writeFileSync(splash.flag+'.failed','1');}catch{}}
  for (const client of connections.values()) client.close();
  galNative?.stop();
  localLearning.stop();await localLlm.stop();await services.stop();
  if (acquired.temporary) try { removeProfile(L.cache, profile); } catch { log('Temporary browser cache will be retained until files are released'); }
  if (launchError) throw launchError;
  if (!attached) throw new Error('ToMe 在加载翻译组件前退出，请查看 startup.log');
  log('ToMe closed; launcher stopped');
}

main().catch(async error => {
  if(splash&&!splash.done){splash.done=true;try{fs.writeFileSync(splash.flag+'.failed','1');}catch{}}
  localLearning.stop();galNative?.stop();try{await localLlm.stop();}catch{}
  // Release the speech engine this ToMe started before the launcher exits, also on the error path.
  try{await services.stop();}catch{}
  log(`ERROR: ${error.message}`);
  fs.writeFileSync(path.join(L.logs, 'error.txt'), `中文翻译启动失败\r\n${error.message}\r\n\r\n请将 startup.log 发给助手检查\r\n`, 'utf8');
  try { spawn('notepad.exe', [path.join(L.logs, 'error.txt')], { detached: true, stdio: 'ignore' }).unref(); } catch {}
  process.exitCode = 1;
}).finally(() => {
  if (ownsState) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state.pid === process.pid) fs.unlinkSync(statePath);
    } catch {}
  }
});
