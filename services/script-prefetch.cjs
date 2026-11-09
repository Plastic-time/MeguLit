// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E287 (user, 2026-11-10: "complete an incomplete patch and make every line zero-latency"). When the running script can
// be read (services/original-text.cjs provider), the lines just ahead of the reading position that have no translation
// yet (not in the patch, or no patch at all) are translated in the background and stored per game, so the line is
// translated before it is shown. A separate translator keeps the reader's own sentence context untouched; the script's
// preceding lines are the context instead. Called once per captured line: ahead(reader).
const fs=require('node:fs'),path=require('node:path');
const AHEAD=6,KEY_REFRESH=10*60*1000;
function translator(reader){
 let t=reader.scriptPrefetch;
 if(!t){t=reader.scriptPrefetch={service:require('../core/providers.cjs').createTranslationService(),keysAt:0,running:false};}
 if(Date.now()-t.keysAt>KEY_REFRESH){t.keysAt=Date.now();
  try{if(fs.existsSync(path.join(reader.folder,'secrets.dpapi'))){const {SecretStore}=require('../core/secrets.cjs');
   for(const [base,key] of new SecretStore(reader.folder,undefined,path.join(reader.root,'native','KeyVault.exe')).entries())t.service.setKey(base,key);}}catch{}}
 return t;
}
async function ahead(reader,{count=AHEAD}={}){
 const provider=reader?.gal?.hooks?.originalText;if(!provider?.upcoming||!provider.fill)return 0;
 // One language per store (Chinese); an English display keeps translating line by line as before.
 if(reader.displayLanguage?.()==='en')return 0;
 const prefs=reader.prefs?.()||{};if(prefs.scriptPrefetch===false)return 0;
 const t=translator(reader);if(t.running)return 0;t.running=true;let done=0;
 try{
  const options=require('../core/providers.cjs').resolveOptions({...prefs,translationPrompt:reader.workPrompt||''});
  // A local model is used only when it is already running; prefetch never starts a download.
  try{await reader.localReady?.(options,null,()=>false);}catch{return 0;}
  const {normalizeTranslation}=require('../core/translation-format.cjs');
  for(const item of provider.upcoming(count)){
   if(provider.fill.has(item.text))continue;
   t.service.clearContext?.();for(const line of item.context)t.service.observeSource?.(line);
   let text='';try{text=normalizeTranslation(await t.service.translate(item.text,options,()=>true));}catch{break;}
   if(!text)continue;provider.fill.set(item.text,text);reader.embedCached?.(item.text,text);done++;
  }
 }finally{t.running=false;}
 return done;
}
module.exports={ahead};
