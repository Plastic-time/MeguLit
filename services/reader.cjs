// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readJSON,openStore}=require('./store.cjs');
const {cleanPreferences}=require('../core/preferences.cjs');
const {Settings}=require('./settings.cjs');
const {normalizeTranslation}=require('../core/translation-format.cjs');
const atomic=(file,value)=>{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);};
class Reader{
 constructor(runtime){this.runtime=runtime;this.root=runtime.root;this.folder=runtime.folder;this.latest=0;this.pageScope='';this.lookup=0;this.gameId=null;this.stats=new(require('./reading-statistics.cjs').ReadingStatistics)(this.root);}
 prefs(){return cleanPreferences(readJSON(path.join(this.folder,'preferences.json')));}
 event(message){
  if(message.type==='homeHotkey'){this.runtime.emit('home-toggle',null);return;}
  if(message.type==='readerPointer'){this.runtime.emit('reader-pointer-input',message);return;}
  if(message.type==='hostFrame'){
   try{fs.appendFileSync(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),...message})+'\n');}catch{}
   return;
  }
  const config=this.runtime.config();
  if(message.gameProcessId&&message.gameProcessId!==this.gamePid){this.gamePid=message.gameProcessId;this.gameId=null;this.pendingLines=[];this.translation?.clearContext();this.setWorkPrompt('');this.stats.reset();const pid=this.gamePid;
   require('../core/game-fonts.cjs').exePath(pid).then(exe=>{exe=require('./launch-path.cjs').canonical(exe);if(this.gamePid!==pid)return;this.gameExe=exe;this.translation?.clearContext();const db=openStore(this.root);try{const game=require('./library.cjs').activeGameForProgram(db,exe);this.gameId=game?.id||null;this.setWorkPrompt(game?.id|| (exe?'exe-'+require('node:crypto').createHash('sha256').update(exe.toLowerCase()).digest('hex'):''));for(const line of this.pendingLines||[])this.stats.line({...line,gameId:this.gameId});this.pendingLines=null;this.runtime.emit('reader-event',{type:'activeGame',legacyId:game?.legacy_id??null});}finally{db.close();}}).catch(()=>{});this.fonts.detect(pid).catch(()=>{});
  }
  if(message.bound===false&&this.gal?.process&&this.gal.process.exitCode!==null&&!this.gal.stopped){this.runtime.readerReady=false;this.runtime.readerError='READER_NATIVE_EXITED';this.runtime.emit('reader-health',{ready:false,error:'READER_NATIVE_EXITED'});}
  if(message.type==='gameClosed'){this.gameId=null;this.gamePid=null;this.pendingLines=null;this.setWorkPrompt('');this.stats.reset();}
  this.runtime.services().gameEvent(message,config).catch(()=>{});
  if(message.type==='dialogEvidence'&&config.dialogDetection==='visual')this.immersion.evidence(message.visible,'visual');
  // The embedded replacement was seen working in this game: remember it as verified (shown as "embedding verified").
  if(message.type==='hookCheck'&&message.hookCheckState==='verified'&&this.gameExe&&this.verifiedExe!==this.gameExe){this.verifiedExe=this.gameExe;try{this.runtime.library().verify(this.gameExe);const db=openStore(this.root);try{const game=require('./library.cjs').activeGameForProgram(db,this.gameExe);if(game){const original=JSON.parse(game.original||'{}');if(original.library?.hook!=='verified'){original.library={...original.library,hook:'verified',hookVerifiedAt:Date.now(),hookVerifiedStream:String(this.gal?.hooks?.state?.hookThreads?.find?.(t=>t.selected)?.name||'')};db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify(original),game.id);this.runtime.emit('library-updated',{id:game.id});}}}finally{db.close();}}catch{}}
  if(message.type==='hookGameUi'){
   const kind=message.kind;
   if(['choice','settings'].includes(kind)){
    this.immersion.scene(false);
    this.gal?.send({type:'gameUi',items:require('../core/game-ui.cjs').uiItems(message.items,kind,this.gal?.preferences)});
   }else if(['dialogue','transition','clear'].includes(kind)){
    this.gal?.send({type:'gameUi',items:[]});this.immersion.scene(kind==='dialogue');
   }
  }
  if(message.type==='dialogScene')this.immersion.scene(message.visible);
  if(message.type==='dialogAuto')this.immersion.autoBox(message.visible);
  if(message.type==='readerInput')this.immersion.skip(message.skipHeld);
  if(message.type==='hookDialog')this.immersion.engine(message.visible,message.engine);
  if(message.type==='markerPresence')this.immersion.marker(message.present===true);
  if(message.type==='waitMarkerDrawn'){this.immersion.markerDrawn();this.gal?.send({type:'markerHookDrawn'});}
  if(message.type==='ready'){this.gal?.send({type:'dialogConfig',scene:config.immersion===true,auto:config.immersion===true,active:config.immersion&&config.dialogDetection==='visual',marker:config.immersion&&config.dialogDetection==='marker'});this.gal?.setGameAudio(config.ankiGameMedia!==false);}
  if(message.type==='gameClosed'||message.bound===false)this.immersion.bind('');else if(message.gameHwnd)this.immersion.bind(message.gameHwnd+'|'+message.gameProcessId+'|'+message.gameStarted);
  if(typeof message.hookSource==='string'){this.gal?.send({type:'markerSource',text:message.hookSource});if(!message.hookRecovering&&message.hookSourceOrigin!=='history'){
   if(message.hookSource&&message.hookSource!==this.immersion.currentText)this.gal?.send({type:'dialogSceneLine'});
   this.immersion.source(message.hookSource,message.hookSourceEngine);
  }const line={gameId:this.gameId,text:message.hookSource,sequence:message.hookSequence,active:message.hookActive,recovering:message.hookRecovering,origin:message.hookSourceOrigin};if(this.pendingLines){if(this.pendingLines.length<40)this.pendingLines.push(line);}else this.stats.line(line);}
  this.runtime.emit('reader-event',message);if(typeof message.hotkey==='boolean')this.runtime.emit('reader-health',this.runtime.readerStatus?.()||{});
 }
 selectGame(processName,enter=true,executable=''){
  if(!this.gal)return;
  if(this.gal.preferences.gameProcess!==processName||this.expectedExecutable&&this.expectedExecutable!==executable)this.gal.send({type:'unbind'});
  this.expectedExecutable=executable;
  this.gal.send({type:'expectExecutable',path:executable});
  this.gal.save({...this.gal.preferences,gameProcess:processName,bindEnabled:true});
  if(enter)this.gal.send({type:'enterGame'});
 }
 attach({pid,hwnd}){
  if(!Number.isSafeInteger(pid)||pid<1||!/^\d{1,19}$/.test(String(hwnd)))throw Error('INVALID_READER_WINDOW');
  if(this.gal)return {attached:true};
  this.overlayPid=pid;
  const layout={...require('../core/layout.cjs'),overlayHwnd:String(hwnd)};
  this.immersion=new(require('../core/immersion.cjs').Immersion)(message=>{this.runtime.emit('reader-event',{type:'dialogVisibility',visible:message.dialogVisible});clearTimeout(this.hideTimer);if(message.dialogVisible===false)this.hideTimer=setTimeout(()=>this.gal?.send({type:'dialogVisibility',visible:false}),140);else this.gal?.send({type:'dialogVisibility',visible:message.dialogVisible});this.runtime.emit('reader-event',message);});this.immersion.configure(this.runtime.config());this.tick=setInterval(()=>this.immersion.tick(),100);this.tick.unref();
  this.fonts=new(require('../core/game-fonts.cjs').GameFonts)(layout,()=>{this.runtime.emit('reader-event',{type:'fonts',fonts:this.fonts.payload(true)});});
  this.gal=new(require('../core/gal-native.cjs').GalNative)(layout,pid,message=>this.event(message),this.runtime.spawnReaderNative);
  if(!this.gal.process){this.stop();throw Error('READER_NATIVE_MISSING');}
  this.gal.process.once('error',()=>{this.runtime.call({action:'reader_health',phase:'native-launch',error:'READER_NATIVE_START_FAILED'}).catch(()=>{});});
  if(this.runtime.pendingGame)this.selectGame(this.runtime.pendingGame,this.runtime.pendingGameEnter,this.runtime.pendingExecutable);
  return {attached:true};
 }
 setWorkPrompt(key){
  this.workKey=key;
  this.workPrompt=key?readJSON(path.join(this.folder,'game-translation-prompts.json'))[key]||'':'';
  this.runtime.emit('reader-event',{type:'workTranslationPrompt',key,prompt:this.workPrompt});
 }
 saveWorkPrompt(key,prompt){
  if(!key||key!==this.workKey||typeof prompt!=='string')return;
  const file=path.join(this.folder,'game-translation-prompts.json'),values=readJSON(file),clean=prompt.trim().slice(0,2000);
  if(clean)values[key]=clean;else delete values[key];
  atomic(file,values);this.setWorkPrompt(key);this.translation?.clearContext();
 }
 translator(){if(!this.translation){this.translation=require('../core/providers.cjs').createTranslationService();}return this.translation;}
 loadKeys(){const {SecretStore}=require('../core/secrets.cjs');if(fs.existsSync(path.join(this.folder,'secrets.dpapi')))for(const[base,key]of new SecretStore(this.folder,undefined,path.join(this.root,'native','KeyVault.exe')).entries())this.translator().setKey(base,key);}
 async translate(request){const text=String(request.text||'');if(!text.trim()||text.length>4000)throw Error('INVALID_READER_TEXT');const pageKey=request.pageKey;if(!pageKey)this.latest=request.id;const current=()=>pageKey?this.pageScope===pageKey:this.latest===request.id;const options=require('../core/providers.cjs').resolveOptions({...this.prefs(),...(request.options&&typeof request.options==='object'?request.options:{}),translationPrompt:this.workPrompt||''});if(options.provider!=='google'&&!require('../core/engines.cjs').ENGINES[options.provider]?.keyless)this.loadKeys();const gameId=this.gameId;await this.runtime.local().ensure(options);const translated=normalizeTranslation(await this.translator().translate(text,options,current));if(gameId)this.stats.translation(gameId,text,translated);return translated;}
 async invoke(command,args={}){
  if(command.startsWith('plugin:sql|'))return require('./legacy-reader-sql.cjs').request(this.root,command,args);
  if(command==='word_states'){const forms=Array.isArray(args.forms)?[...new Set(args.forms.filter(v=>typeof v==='string'&&v.length<=100))].slice(0,200):[];if(!forms.length)return [];const db=openStore(this.root);try{return db.prepare('SELECT id,spelling,reading,status FROM vocabulary WHERE spelling IN ('+forms.map(()=>'?').join(',')+')').all(...forms);}finally{db.close();}}
  if(['tokenize_text','lookup_exact','lookup_at_position','scan_sentence'].includes(command)){if(typeof args.text!=='string'||args.text.length>4000)throw Error('INVALID_READER_TEXT');const result=await this.runtime.learning().request(command,args,this.prefs().learnerLanguage||'zh');return result;}
  if(command==='get_settings')return {...require('./settings.cjs').nativeDefaults,...readJSON(path.join(this.folder,'native-preferences.json'))};
  if(command==='save_settings'){const safe={};for(const[k,v]of Object.entries(args.settings||{}))if(!/key|password|secret|token/i.test(k))safe[k]=v;atomic(path.join(this.folder,'native-preferences.json'),{...readJSON(path.join(this.folder,'native-preferences.json')),...safe});return safe;}
  throw Error('UNKNOWN_READER_COMMAND');
 }
 async message(r){
  const replies=[],reply=(method,...args)=>replies.push({method,args}),g=this.gal;
  if(!r||typeof r!=='object')throw Error('INVALID_REQUEST');
  switch(r.type){
   case 'lookupViewed':{const surface=typeof r.surface==='string'?r.surface.trim():'';if(!surface||surface.length>100||typeof r.operationId!=='string'||!/^[a-z0-9-]{8,100}$/i.test(r.operationId))throw Error('INVALID_LOOKUP');const now=Date.now();if(this.lastLookup?.surface!==surface||now-this.lastLookup.time>2000){this.lastLookup={surface,time:now};require('./unknown-words.cjs').recordLookup(this.root,{surface,gameId:this.gameId,operationId:r.operationId});}break;}
   case 'loadPreferences':reply('restoreSettings',this.prefs());reply('learningStatus',{learningInstalled:this.runtime.learning().installed()});break;
   case 'loadGalPreferences':reply('restoreGalSettings',{...(g?.preferences||require('../core/game-style.js').clean()),translationPrompt:this.workPrompt||''});reply('workTranslationPrompt',this.workKey||'',this.workPrompt||'');reply('galStatus',{...g?.state,type:'restore'});break;
   case 'learningRequest':try{const result=r.engine==='unidic'&&r.result?(r.command==='tokenize_text'?this.runtime.learning().readings.resolve(r.result):this.runtime.learning().adaptResult(r.result,r.language)):await this.runtime.learning().request(r.command,r.args,r.language||this.prefs().learnerLanguage||'zh');reply('learningDeliver',r.id,result,'');}catch(e){reply('learningDeliver',r.id,null,e.message);}break;
   case 'galReadings':reply('deliverReadings',r.id,this.runtime.learning().readings.resolve(r.tokens||[]));break;
   case 'pageTranslationScope':this.pageScope=String(r.key||'').slice(0,100);break;
   case 'galSource':if(typeof r.text==='string'&&r.text.length<=4000){this.translator().observeSource(r.text);g?.send({type:'source',text:r.text});}break;
   case 'perfDiagnostic':try{const file=path.join(this.root,'logs','reader-perf.log');if(fs.existsSync(file)&&fs.statSync(file).size>1<<20)fs.renameSync(file,file+'.1');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...r})+'\n');}catch{}break;
   case 'pointerDiagnostic':try{const file=path.join(this.root,'logs','reader-pointer.log');if(fs.existsSync(file)&&fs.statSync(file).size>1<<20)fs.renameSync(file,file+'.1');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),...r})+'\n');}catch{}break;
   case 'galConfigure':case 'galPreview':if(!g||r.gameStyleKey&&r.gameStyleKey!==g.styleSync.profileKey)break;{const settings={...r.settings,gameProcess:g.preferences.gameProcess,bindEnabled:g.preferences.bindEnabled};settings.maskModeSource=settings.maskMode==='local'?(g.preferences.maskMode==='local'?g.preferences.maskModeSource:'user'):'';r.type==='galConfigure'?g.save(settings):g.preview(settings);}break;
   case 'galWindows':g?.send({type:'windows'});break;
   case 'galBind':if(!/^\d{1,19}$/.test(r.hwnd||''))throw Error('INVALID_GAME_WINDOW');this.translator().clearContext();g?.bind(r.hwnd,r.settings);break;
   case 'galUnbind':this.translator().clearContext();g?.save({...g.preferences,bindEnabled:false});this.stats.reset();break;
   case 'galMenu':g?.send({type:'menu',open:r.open===true});break;
   case 'galLookup':g?.send({type:'lookup',open:r.open===true});break;
   case 'galFloatDrag':if([r.x,r.y].every(Number.isFinite))g?.send({type:'floatDrag',x:r.x,y:r.y});break;
   case 'galHitRegions':if(Array.isArray(r.regions)&&r.regions.length<=256&&r.regions.every(x=>[x.x,x.y,x.width,x.height].every(Number.isFinite)))g?.send({type:'hitRegions',regions:r.regions,menuOpen:r.menuOpen===true});break;
   case 'galGlass':if(Array.isArray(r.rects)&&r.rects.length<=16&&r.rects.every(x=>[x.x,x.y,x.width,x.height].every(Number.isFinite)))g?.send({type:'glass',rects:r.rects,radius:Number(r.radius)||18});break;
   case 'galToggleCover':g?.send({type:'toggleCover'});break;
   case 'galToggleMode':g?.send({type:'toggleMode'});break;
   case 'galShutdown':this.stop();break;
   case 'hookPrefs':g?.setHookPrefs(r.settings);break;
   case 'hookStart':g?.userStart(r.profile,r.force===true,r.id);break;
   case 'hookSelect':g?.hooks.select(r.id);break;
   case 'hookCheck':g?.controller.check();break;
   case 'hookRescan':g?.hooks.rescan();break;
   case 'hookReplacementConfirm':g?.hooks.confirmReplacement();break;
   case 'gameStyleProfileRequest':g?.styleSync.replay();break;
   case 'gameStyleCaptureReady':g?.styleSync.captureReady(r.id);break;
   case 'gameStyleSync':if(!r.key||r.key===g?.styleSync.profileKey)g?.controller.beginStyleSync(true,r.part,r.owner);break;
   case 'gameStyleCancel':if(!r.key||r.key===g?.styleSync.profileKey)g?.controller.finishStyleSync(false,true);break;
   case 'gameStyleConfirm':
    if(r.key===g?.styleSync.profileKey&&g?.styleSync.saveProfile(r.prefs,['text','position'].includes(r.part)?r.part:'all',r.key,r.map,r.saveId)){
     try{this.saveWorkPrompt(r.workKey,r.translationPrompt);}catch{reply('workPromptSaveFailed');}
    }break;
   case 'gameStyleUpdate':g?.styleSync.updateProfile(r.prefs||{});break;
   case 'textPosMapSave':if(r.key)g?.styleSync.savePositionMap(r.map,r.key);break;
   case 'gameStyleImportList':g?.styleSync.status('importList',{gameStyleImportList:g.styleSync.savedWorks()});break;
   case 'gameStyleImportPreview':if(r.key===g?.styleSync.profileKey){const part=r.part==='position'?'position':'text',found=g.styleSync.importFrom(String(r.source||''),part);g.styleSync.status('importPreview',{gameStyleImportPart:part,gameStyleImportSource:String(r.source||''),gameStyleImportPrefs:found?.prefs||null,gameStyleImportMap:found?.map||null});}break;
   case 'gameUiScan':{
    if(this.gameUiScan){reply('gameUiScanResult',null,'GAME_UI_SCAN_BUSY');break;}
    const pid=g?.state.gameProcessId,hwnd=g?.state.gameHwnd;
    this.gameUiScan=true;
    try{
     const items=await require('../core/game-ui.cjs').scanGameUi(g?.layout||{},g?.state,this.overlayPid);
     if(pid!==g?.state.gameProcessId||hwnd!==g?.state.gameHwnd)throw Error('GAME_UI_TARGET_CHANGED');
     this.gameUiPreview={pid,hwnd,items};reply('gameUiScanResult',items,'');
    }catch(error){reply('gameUiScanResult',null,error.message);}finally{this.gameUiScan=false;}
    break;
   }
   case 'gameUiPreview':{
    const current=this.gameUiPreview;if(current&&current.pid===g?.state.gameProcessId&&current.hwnd===g?.state.gameHwnd)g.send({type:'gameUi',items:current.items,preview:true});
    break;
   }
   case 'gameFontsLoad':reply('gameFonts',this.fonts?.payload(true));break;
   case 'gameFontsRescan':if(this.gamePid)await this.fonts.detect(this.gamePid,true);break;
   case 'gameFontsApply':if(this.fonts?.current?.status==='ready'){const fonts=this.fonts.current.fonts,prefs={...g.preferences};for(const[lang,key]of [['ja','japaneseFont'],['zh','chineseFont']]){const f=fonts.find(f=>f.lang===lang);if(f)prefs[key]='game:'+f.id;}g.save(prefs);this.fonts.markApplied();reply('restoreGalSettings',prefs);}break;
   case 'configure':{let success=true,error='';try{const {resolveOptions}=require('../core/providers.cjs'),options=resolveOptions(r);if(options.provider!=='google'&&!require('../core/engines.cjs').ENGINES[options.provider]?.keyless)this.loadKeys();require('../core/translation-settings.cjs').saveTranslationSettings(r,{resolveOptions,service:this.translator(),secrets:{set:(baseUrl,apiKey)=>new Settings(this.root).saveKey({provider:options.provider,baseUrl,apiKey})},persist:settings=>atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...cleanPreferences(settings)})});}catch(e){success=false;error=e.message;}reply('configured',success,error,r.configureId??null);break;}
   case 'learningSettings':atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...cleanPreferences(r.settings)});break;
   case 'nativeSettings':await this.invoke('save_settings',{settings:r.settings});break;
   case 'v4':try{reply('v4Deliver',r.id,await this.v4(r.action,r.args||{}),'');}catch(e){reply('v4Deliver',r.id,null,e.message);}break;
   case 'revealProgress':this.immersion?.reveal(r.text,r.typing);break;
   case 'lookupCancel':this.lookup++;break;
   case 'lookupExplain':{const serial=++this.lookup;try{const main=this.prefs(),options=require('../core/lookup-models.cjs').lookupOptions(main,main);if(!options)throw Error('LOOKUP_MODEL_REQUIRED');this.loadKeys();const local=await this.invoke('lookup_exact',r.args);const result=await this.translator().lookup({selection:[...r.args.text].slice(r.args.start,r.args.end).join(''),sentence:r.args.text,entries:local.entries,morphology:local.morphology,mode:r.mode},options,()=>this.lookup===serial);if(this.lookup===serial)reply('lookupDeliver',r.id,result,'');}catch(e){reply('lookupDeliver',r.id,null,e.message);}break;}
   case 'lookupConfigure':try{const clean=require('../core/lookup-models.cjs').cleanLookup(r.settings);for(const[name,key]of Object.entries(r.keys||{}))if(key)new Settings(this.root).saveKey({provider:name==='deepseek'?'deepseek':'gpt',baseUrl:clean.lookupProfiles[name]?.baseUrl,apiKey:key});atomic(path.join(this.folder,'preferences.json'),{...readJSON(path.join(this.folder,'preferences.json')),...clean});reply('lookupConfigured','');}catch(e){reply('lookupConfigured',e.message);}break;
   case 'keyStatus':{const result={};for(const[name,options]of Object.entries(r.targets||{}).slice(0,20)){try{this.loadKeys();const resolved=require('../core/providers.cjs').resolveOptions(options);result[name]=resolved.provider==='google'||this.translator().hasKey(resolved.baseUrl,resolved.provider);}catch{result[name]=false;}}reply('keyStatus',result);break;}
   case 'dictStatus':reply('dictStatus',{databases:require('../core/dict-check.cjs').quickStatus(require('../core/layout.cjs').reading),installing:!!this.runtime.learning().installing});break;
   case 'dictCheck':{const check=require('../core/dict-check.cjs');const results=await check.fullCheck(require('../core/layout.cjs').reading,data=>this.runtime.emit('reader-event',{type:'call',method:'dictCheckProgress',args:[data]}));reply('dictCheckResult',results.map(r=>({...r,missingCount:r.missing.length,badCount:r.bad.length,missing:r.missing.slice(0,20),bad:r.bad.slice(0,20)})));break;}
   case 'dictRepair':this.runtime.learning().install(true,true,Array.isArray(r.only)?r.only.filter(x=>['sudachi','unidic'].includes(x)):null).catch(()=>{});break;
   case 'learningInstall':this.runtime.learning().install(true).catch(()=>{});break;
   case 'galMaskLoaded':case 'galMaskError':if(Number.isSafeInteger(r.id)&&r.id===g?.lastFrameId){const count=Number.isSafeInteger(r.count)&&r.count>=0&&r.count<=4000?r.count:0;g.notify({maskMessage:r.type==='galMaskLoaded'?(r.provisional?'遮罩预览已加载：':'遮罩图片已加载：')+count+' 块原文小区域':'阅读层无法解码遮罩图片，请查看状态诊断'});}break;
   default:if(Number.isSafeInteger(r.id)){this.latest=r.id;if(r.disabled!==undefined)break;try{reply('deliver',r.id,await this.translate(r),false,'');}catch(e){reply('deliver',r.id,'',true,e.message);}}else throw Error('UNKNOWN_READER_ACTION');
  }
  return {replies};
 }
 async v4(action,args){
  const config=this.runtime.config();
  if(action==='load')return config;
  if(action==='configure'){atomic(path.join(this.folder,'v4-preferences.json'),{...readJSON(path.join(this.folder,'v4-preferences.json')),...require('../core/v4-config.cjs').cleanV4(args)});this.immersion?.configure(this.runtime.config());const current=this.runtime.config();this.gal?.send({type:'dialogConfig',scene:current.immersion===true,auto:current.immersion===true,active:current.immersion&&current.dialogDetection==='visual',marker:current.immersion&&current.dialogDetection==='marker'});this.gal?.setGameAudio(this.runtime.config().ankiGameMedia!==false);return this.runtime.config();}
  const mapped={modelStatus:'model_status',modelDownload:'model_download',modelCancel:'model_cancel',runtimeDownload:'runtime_download',runtimeCancel:'runtime_cancel',speakers:'speakers',speakersCached:'speakers_cached',preview:'speech_preview'};
  if(mapped[action])return this.runtime.call({action:mapped[action],...args});
  if(action==='backgroundGet')return {image:require('./assets.cjs').get(this.root,args.slot==='game'?'panels':'home')};
  if(action==='backgroundSet')return require('./assets.cjs').set(this.root,args.slot==='game'?'panels':'home',args.path);
  if(action==='backgroundPeek')return {image:require('./assets.cjs').preview(args.path)};
  if(action==='backgroundClear')return require('./assets.cjs').clear(this.root,args.slot==='game'?'panels':'home');
  if(action==='gameFrame'){const image=await this.gal?.gameFrame();return {image:image?'data:image/jpeg;base64,'+image:''};}
  if(action==='ankiScreenshot'){
   if(config.ankiGameMedia===false)return {};
   const bounds={};for(const key of ['readerX','readerY','readerWidth','readerHeight'])if(Number.isInteger(args[key])&&args[key]>=0&&args[key]<=16384)bounds[key]=args[key];
   const image=await this.gal?.gameFrame(bounds);
   if(!image)return {};
   const id=require('node:crypto').randomUUID();
   this.cardScreenshot={id,image,expires:Date.now()+15000};
   return {id};
  }
  if(action==='modelDelete')return this.runtime.models().remove(String(args.id));
  if(action==='runtimeDelete')return this.runtime.local().remove();
  if(action.startsWith('voicePack')){
   const pack=this.voicePack??=new(require('../core/voice-pack.cjs').VoicePack)();
   const refresh=async()=>{await this.runtime.services().stopSpeech();try{await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu);this.runtime.services().rememberSpeakers(await this.runtime.speech().speakers(config));}catch{}};
   if(action==='voicePackStatus')return pack.status();if(action==='voicePackInstall')return args.uuid?pack.startOne(String(args.uuid),refresh):pack.start(refresh);if(action==='voicePackCancel')return pack.cancel(String(args.uuid||''));if(action==='voicePackRemove'){await this.runtime.services().stopSpeech();try{return pack.remove(String(args.uuid||''));}finally{await refresh();}}
  }
  if(action==='calibrate'){this.gal?.send({type:'dialogCalibrate',...args});return {pending:true};}
  if(action==='ankiStats'){
   const linked=new Set((Array.isArray(args.linked)?args.linked:[]).map(Number)),notes=await new(require('../core/anki.cjs').Anki)().stats(config);let resolved=0;
   for(const note of notes){if(linked.has(note.noteId)||!note.word||resolved>=300)continue;resolved++;try{const text=note.word,result=await this.runtime.learning().request('lookup_exact',{text,start:0,end:[...text].length},'zh'),entry=result.entries?.find(e=>e.spellings?.includes(text)||e.readings?.includes(text))||result.entries?.[0];if(entry)note.entry={id:entry.id,spellings:entry.spellings||[],readings:entry.readings||[],definitions:entry.definitions||(entry.definition_groups||[]).map(g=>g.text),pos:entry.pos||[]};}catch{}}
   return notes;
  }
  if(action==='unityFontStatus')return (this.unityFont??=new(require('../core/unity-font.cjs').UnityFont)(this.root)).status();
  if(action==='unityFontDownload')return (this.unityFont??=new(require('../core/unity-font.cjs').UnityFont)(this.root)).download();
  if(action==='localeStatus')return this.runtime.library().locale.status(true);
  if(action==='localeInstall')return this.runtime.library().locale.install();
  if(action==='ankiStatus')return new(require('../core/anki.cjs').Anki)().status(config);
  if(action==='ankiFind')return {path:this.findAnki()};
  if(action==='ankiLaunch'){
   const anki=new(require('../core/anki.cjs').Anki)();try{const status=await anki.status(config);await this.runtime.ankiProcess().show();return {running:true,...status};}catch{}
   const exe=this.findAnki();if(!exe)throw Error('ANKI_EXECUTABLE_MISSING');const child=require('node:child_process').spawn(exe,[],{cwd:path.dirname(exe),detached:true,stdio:'ignore',windowsHide:false});child.on('error',()=>{});child.unref();
   for(let i=0;i<40;i++){await new Promise(resolve=>setTimeout(resolve,750));try{return {launched:true,...await anki.status(config)};}catch{}}throw Error('ANKI_OFFLINE');
  }
  if(['word','speak','prefetch','anki'].includes(action)){
   const captured=action==='anki'&&this.cardScreenshot;
   const screenshot=captured&&captured.id===args.screenshotId&&captured.expires>Date.now()?captured.image:'';
   if(screenshot)this.cardScreenshot=null;
   const word=await this.runtime.learning().word(args,args.entryId),reading=this.gal?.gameRuby?.dict(this.gal?.styleSync?.profileKey)?.[word.surface];if(reading){word.reading=reading;word.ambiguous=false;word.pitch=[];}
   if(args.pitchChoice!==undefined){if(!word.pitch.includes(args.pitchChoice))throw Error('INVALID_PITCH');word.pitch=[args.pitchChoice];}
   if(action==='word')return word;let audio;
   if(['speak','prefetch'].includes(action)){await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu);const audio=await this.runtime.speech().synthesize(word,config,{prefetch:action==='prefetch'});return action==='prefetch'?{ready:true}:audio;}
   const extra={translation:String(args.translation||'').slice(0,1000)};try{extra.sentenceHtml=require('../core/sentence-html.cjs').furiganaHtml(args.text,await this.runtime.learning().tokenize(args.text),args.start,args.end);}catch{}
   if(config.ankiGameMedia!==false){
    const media=await this.gal?.gameMedia(args.text,Date.now(),false).catch(()=>null);
    extra.screenshot=screenshot;
    if(media?.audio){extra.sentenceAudio=media.audio;extra.gameAudio=true;}
    try{fs.appendFileSync(path.join(this.root,'logs','reader-host.log'),JSON.stringify({at:new Date().toISOString(),type:'ankiGameAudio',matched:!!media?.matched,recording:!!media?.recording,voiced:!!media?.audio,error:media?.error||''})+'\n');}catch{}
   }
   if(config.ankiAudio){
    const speechReady=await this.runtime.services().ensureSpeech(config.aivisUrl,config.aivisGpu).then(()=>true,()=>false);
    if(speechReady){
     try{audio=await this.runtime.speech().synthesize(word,config);}catch{}
     if(!extra.sentenceAudio)try{extra.sentenceAudio=await this.runtime.speech().synthesize({surface:args.text,reading:'',pitch:[]},config);}catch{}
    }
   }
   await this.prepareMiningModel(config);const result=await new(require('../core/anki.cjs').Anki)().sync(word,config,audio,extra);const entries=(await this.invoke('lookup_exact',args)).entries||[];await this.mine({entry:entries.find(e=>e.id===args.entryId)||entries[0],args,noteId:result.id});
   if(config.ankiGameMedia!==false&&!result.screenshotAttached)result.mediaWarning='SCREENSHOT_UNAVAILABLE';
   result.sentenceAudioSource=extra.gameAudio?'game':extra.sentenceAudio?'synthesized':'';
   return result;
  }
  throw Error('UNKNOWN_LEARNING_ACTION');
 }
 async prepareMiningModel(config){
  if(!['MeguLit','ToMe','tomoyo_megumin'].includes(config.ankiModel))return;
  const key=JSON.stringify([config.ankiUrl,config.ankiModel]);if(this.miningModelReady===key)return;
  const anki=new(require('../core/anki.cjs').Anki)();const models=await anki.call(config,'modelNames');
  if(models.includes(config.ankiModel))await require('./anki-model.cjs').removeManagedReading(this.root,config,anki);else await anki.prepareModel(config);
  this.miningModelReady=key;
 }
 findAnki(){return this.runtime.ankiProcess().find();}
 findAnkiLegacy(){const env=process.env;for(const file of [this.runtime.config().ankiPath,...[env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs'),env.ProgramFiles,env['ProgramFiles(x86)']].filter(Boolean).map(folder=>path.join(folder,'Anki','anki.exe'))])if(file&&fs.existsSync(file)&&fs.statSync(file).isFile())return file;return '';}
 async mine({entry,args,noteId}){if(!entry?.id)return;const db=openStore(this.root);try{db.exec('BEGIN IMMEDIATE');db.prepare('INSERT OR IGNORE INTO vocabulary(id,spelling,reading,definitions,status,created_at,original) VALUES(?,?,?,?,0,?,?)').run(entry.id,entry.spellings?.[0]||'',entry.readings?.[0]||'',JSON.stringify(entry.definitions||[]),Math.floor(Date.now()/1000),JSON.stringify({entry,noteId}));if(args?.text&&!db.prepare('SELECT 1 FROM examples WHERE word_id=? AND text=?').get(entry.id,args.text))db.prepare('INSERT INTO examples(word_id,game_id,text,translation,highlight_start,highlight_end,created_at,original) VALUES(?,?,?,?,?,?,?,?)').run(entry.id,this.gameId,args.text,args.translation||'',args.start||0,args.end||0,Math.floor(Date.now()/1000),'{}');require('./anki-sync.cjs').link(db,Number(entry.id),Number(noteId));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}}
 stop(){if(this.stopping)return this.stopping;clearInterval(this.tick);clearTimeout(this.hideTimer);const gal=this.gal,child=gal?.process;gal?.stop();this.gal=null;this.stats.reset();this.stopping=(!child||child.exitCode!==null)?Promise.resolve():new Promise(resolve=>{let timer;const finish=()=>{clearTimeout(timer);resolve();};child.once('exit',finish);timer=setTimeout(()=>{try{child.kill();}catch{}finish();},2000);});return this.stopping.finally(()=>{this.stopping=null;});}
}
module.exports={Reader};
