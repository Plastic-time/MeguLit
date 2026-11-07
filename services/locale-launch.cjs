'use strict';
const fs=require('node:fs');
const {x86}=require('../core/locale-emulator.cjs');
function useJapanese(profile,library,exe){
 if(profile.localeMode==='off')return false;
 if(profile.localeMode==='japanese'||profile.localeJapanese===true)return true;
 if(require('../core/locale-policy.cjs').chineseSystem4Patch(exe))return false;
 return library.localeAutoJapanese!==false&&x86(exe);
}
function requiresAdministrator(exe){
 const requested=/<requestedExecutionLevel\b[^>]*\blevel\s*=\s*['"]requireAdministrator['"]/i;
 try{
  const file=exe+'.manifest',stat=fs.statSync(file);
  if(stat.isFile()&&stat.size<=65536){
   const bytes=fs.readFileSync(file);
   if(['utf8','utf16le'].some(encoding=>requested.test(bytes.toString(encoding).replace(/<!--[\s\S]*?-->/g,''))))return true;
  }
 }catch{}
 return false;
}
module.exports={useJapanese,requiresAdministrator};
