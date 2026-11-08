const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Settings}=require('../services/settings.cjs');
test('library settings no longer expose locale emulation',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-locale-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const settings=new Settings(root);assert.equal(settings.get().fields.some(field=>field.scope==='library'&&/locale/i.test(field.key)),false);
 assert.throws(()=>settings.save({scope:'library',values:{localeAutoJapanese:true}}),/SETTINGS_FIELD_INVALID/);
});
test('folder browsing appends multiple literal paths without adding duplicates',async()=>{
 const {appendFolders}=await import('../web/path-picker.js');assert.equal(appendFolders('E:\\GAL\nD:/Games',['e:/gal/','E:\\More Games']), 'E:\\GAL\nD:/Games\nE:\\More Games');
});
test('the reader permits its generated audio/image blobs without enabling inline scripts',()=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../desktop/tauri.conf.json'),'utf8')),csp=cfg.app.security.csp;assert.match(csp,/media-src[^;]*blob:/);assert.match(csp,/img-src[^;]*blob:/);assert.match(csp,/script-src 'self';/);assert.doesNotMatch(csp,/script-src[^;]*unsafe-inline/);
});
test('panel appearance saves send the new persisted values to the live reader',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-appearance-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {Runtime}=require('../services/runtime.cjs'),events=[],runtime=new Runtime(root,(event,data)=>events.push({event,data}));runtime.reader={gal:{setGameAudio(){}},prefs:()=>({})};const state={'tome-menu-background':JSON.stringify({surfaces:{card:'image',log:'glass'}})};fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.writeFileSync(path.join(root,'data/ui-state.json'),JSON.stringify(state));runtime.settingsSaved({scope:'panels'});const message=events.find(e=>e.data.type==='panelAppearance');assert.deepEqual(message.data.values,state);
});
