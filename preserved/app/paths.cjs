'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),L=require('./layout.cjs');
const appRoot=process.env.TOMOYO_APP_ROOT||L.engine;
// ToMe.exe = the engine (tomoyo.exe upstream) as ToMe: normally the hidden-startup build installed by
// source/hidden-startup/Deploy-HiddenEngine.ps1 (product name ToMe); otherwise built from tomoyo.exe + ToMe.patch:
// [new PE header 1024][32x32 RGBA window icon][appended icon section].
const original=path.join(appRoot,'tomoyo.exe'),renamed=path.join(appRoot,'ToMe.exe'),patchFile=path.join(appRoot,'ToMe.patch'),marker=renamed+'.ver',logFile=path.join(L.logs||path.join(appRoot,'..','..','logs'),'engine-build.log');
const SRC_SHA='6179f1c166e1dd5a619f3699a3ab5d3f7374e37a6de25af26ee8013cff9aa62f',OUT_SHA='62842693b4d6d997033f12353b63dab43379bff3bd381e4cb91180f5b1e3c4c5',HEADER=1024,ICON_AT=35980616,ICON_LEN=4096;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const note=m=>{try{fs.appendFileSync(logFile,new Date().toISOString()+' '+m+'\n');}catch{}};
require('./engine-update.cjs').installPendingEngine(appRoot,note);
let hiddenStartup=false;
function ensureRenamed(){
 try{
  const nativeManifest=renamed+'.native.json';
  if(fs.existsSync(nativeManifest)){
   const built=JSON.parse(fs.readFileSync(nativeManifest,'utf8'));
   if(built.schema===1&&built.hiddenStartup===true&&/^[a-f0-9]{64}$/.test(built.sha256)&&fs.existsSync(renamed)&&sha(fs.readFileSync(renamed))===built.sha256){hiddenStartup=true;return true;}
   note('Native engine verification failed; falling back to the original engine');
  }
  if(fs.existsSync(renamed)&&(()=>{try{return fs.readFileSync(marker,'utf8').trim()===OUT_SHA;}catch{return false;}})())return true;
  if(!fs.existsSync(patchFile)){note('patch file missing');return fs.existsSync(renamed);}
  if(!fs.existsSync(original)){note('tomoyo.exe missing');return fs.existsSync(renamed);}
  const src=fs.readFileSync(original),patch=fs.readFileSync(patchFile);if(sha(src)!==SRC_SHA){note('tomoyo.exe hash mismatch '+sha(src));return false;}
  const body=Buffer.from(src.subarray(HEADER));patch.copy(body,ICON_AT-HEADER,HEADER,HEADER+ICON_LEN);
  const out=Buffer.concat([patch.subarray(0,HEADER),body,patch.subarray(HEADER+ICON_LEN)]);if(sha(out)!==OUT_SHA){note('built exe hash mismatch '+sha(out));return false;}
  fs.writeFileSync(renamed+'.tmp',out);try{fs.rmSync(renamed,{force:true});}catch{}fs.renameSync(renamed+'.tmp',renamed);fs.writeFileSync(marker,OUT_SHA);note('built ToMe.exe');return true;
 }catch(e){note('build failed: '+e.message);return fs.existsSync(renamed);}
}
const engine=ensureRenamed()?renamed:original;
module.exports={resources:path.join(appRoot,'resources'),engine,hiddenStartup};
