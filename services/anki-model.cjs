'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Anki,fields}=require('../core/anki.cjs'),{cleanV4}=require('../core/v4-config.cjs');
async function removeManagedReading(root,config,anki=new Anki()){
 const c=cleanV4(config);if(!['MeguLit','ToMe','tomoyo_megumin'].includes(c.ankiModel))throw Error('ANKI_MODEL_NOT_MANAGED');
 const before=await anki.call(c,'modelFieldNames',{modelName:c.ankiModel});if(fields.some(f=>!before.includes(f)))throw Error('ANKI_MODEL_NOT_MANAGED');
 const templates=await anki.call(c,'modelTemplates',{modelName:c.ankiModel}),styling=await anki.call(c,'modelStyling',{modelName:c.ankiModel});
 const ids=await anki.call(c,'findNotes',{query:'note:"'+c.ankiModel.replace(/"/g,'\\"')+'"'}),readings=[];
 if(before.includes('Reading'))for(let i=0;i<ids.length;i+=500){const notes=await anki.call(c,'notesInfo',{notes:ids.slice(i,i+500)});for(const note of notes)readings.push({noteId:note.noteId,Reading:note.fields?.Reading?.value||''});}
 const folder=path.join(root,'migration','anki-model-backups');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,Date.now()+'-'+crypto.randomUUID()+'.json');
 fs.writeFileSync(file,JSON.stringify({schema:1,model:c.ankiModel,createdAt:new Date().toISOString(),fields:before,templates,styling,readings},null,2),{flag:'wx'});
 await anki.prepareModel(c);if(before.includes('Reading'))await anki.call(c,'modelFieldRemove',{modelName:c.ankiModel,fieldName:'Reading'});
 const after=await anki.call(c,'modelFieldNames',{modelName:c.ankiModel});if(after.includes('Reading')||!after.includes('Screenshot'))throw Error('ANKI_MODEL_UPGRADE_INCOMPLETE');
 return {model:c.ankiModel,readingRemoved:before.includes('Reading'),screenshotsEnabled:true,backup:file,notesPreserved:ids.length};
}
module.exports={removeManagedReading};
