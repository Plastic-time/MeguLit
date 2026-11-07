// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'..'),target=path.join(root,'validation','retained');fs.mkdirSync(target,{recursive:true});
const names=['island-page','furigana-context','game-readings','ruby-layout','translation-scope','translation-settings','local-llm','speech-lifecycle','secrets-vault','game-profile-storage','spacing-gradient','typewriter','suru-noun','game-fonts','read-colour','translation-width','voice-pack','hook-source-events','hook-page','game-style-sync','calibration-history','calibration-import'];
for(const name of names){let source=fs.readFileSync(path.join(root,'preserved','validation',name+'.test.cjs'),'utf8');source=source.replace(/\.\.\/app\//g,'../../core/').replace(/path\.join\(__dirname,\s*['"]\.\.['"],\s*['"]app['"]/g,'path.join(__dirname,"..","..","core"').replace(/(['"])\.\.\/native\1/g,'"../../native"');
 if(name==='translation-settings')source=source.replace('../../core/settings.js','../../web/reader/modules/settings.js');// the generated reader keeps the original __tomoyo* names and tomoyo-* classes (E215)
 if(name==='secrets-vault')source=source.replace("fs.existsSync(path.join(L.root,'ToMe.exe'))?'ToMe.exe':'ToMe.V3.exe'","'KeyVault.exe'");
 // E215: a work without saved settings starts from the user's global text preset (white text by default), not the
 // built-in cream colour; the test still checks that another work's colour never becomes that default.
 if(name==='game-profile-storage')source=source.replace('assert.equal(restored.gameStyleEffectivePrefs.textColor,style.defaults.textColor);',"assert.equal(restored.gameStyleEffectivePrefs.textColor,require('../../core/text-defaults.cjs').BUILTIN.textColor);");
 fs.writeFileSync(path.join(target,name+'.test.cjs'),source);}
console.log(JSON.stringify({testsPrepared:names.length}));
