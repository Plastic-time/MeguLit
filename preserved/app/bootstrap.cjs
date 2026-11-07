'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const L=require('./layout.cjs');
const required=["hook-control.cjs","hook-panel.js",'layout.cjs','launch.cjs','ui-state.js','polish.js','inject.js','settings.js','furigana.js','game-style.js','game-profile.js','typewriter.js','gal.js','translate.cjs','providers.cjs','translation-settings.cjs','translation-scope.cjs','startup.cjs','gal-native.cjs','local-font.cjs','font-map.cjs','reading.cjs','learning-native.cjs','learning.js','learning-layout.js','lookup-layout.js','install-progress.cjs','hook-native.cjs','taskbar-sync.js','interface-mode.js','menu-layout.js','native-transport.js','selection.js','interaction.js','backlog.js','box-preview.js','library.cjs','library.js','morphology.cjs','definitions.cjs','lookup-models.cjs','services.cjs','speech-setup.cjs','v4.js','voice-layout.js','voice-pack.cjs','text-position.js','island-page.js','hook-reader.js','wait-marker.js','v4-config.cjs','speech.cjs','anki.cjs','secrets.cjs','paths.cjs','immersion.cjs','ruby-layout.js','game-fonts.cjs','game-fonts-ui.js','engines.cjs','i18n.js','about.js','nav-shell.js','settings-tabs.js','dict-check.cjs','anki-sync.js','stats-layout.js','reading-stats.cjs'];
let reported=false;
function report(error){
  if(reported)return;reported=true;
  const detail=String(error?.message||error).slice(0,1800).replace(/\bsk-[A-Za-z0-9_-]+/g,'[密钥已隐藏]');
  const message='ToMe 启动失败\r\n\r\n'+detail+'\r\n\r\n请将新版压缩包中的全部文件解压到同一个文件夹，再运行 ToMe.V3.exe\r\n';
  try{const target=path.join(L.logs,'error.txt');fs.writeFileSync(target,message,'utf8');spawn('notepad.exe',[target],{detached:true,stdio:'ignore'}).on('error',()=>{}).unref();}catch{}
  process.exitCode=1;
}
try{
  if(Number(process.versions.node.split('.')[0])<22)throw Error('需要 Node.js 22 或更新版本');
  const missing=required.filter(name=>!fs.existsSync(path.join(__dirname,name)));
  if(missing.length)throw Error('启动组件不完整，缺少：'+missing.join('、'));
  if(process.argv.includes('--check')){
    const vm=require('node:vm');for(const name of required)new vm.Script(fs.readFileSync(path.join(__dirname,name),'utf8'),{filename:name});
    const exe=path.join(L.native,'GalWindowBridge.exe');
    if(!fs.existsSync(exe)||fs.readFileSync(exe).toString('ascii',0,2)!=='MZ')throw Error('窗口绑定组件缺失或无效');
    for(const name of ['native/HookBridge.exe','native/HookInjector32.exe','native/HookInjector64.exe','runtime/hook/LunaHost64.dll','runtime/hook/LunaHook32.dll','runtime/hook/LunaHook64.dll'])if(!fs.existsSync(path.join(L.root,name)))throw Error('缺少原生组件：'+name);
    console.log(JSON.stringify({version:'3.0.0',files:required.length,nativeBridge:true,syntax:true,hookEngineBundled:true}));
  }else{
    process.on('uncaughtException',report);process.on('unhandledRejection',report);
    require('./launch.cjs');
  }
}catch(error){report(error);}
