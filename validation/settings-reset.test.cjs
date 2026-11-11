'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const reset=require('../services/settings-reset.cjs'),wait=require('../services/wait-marker-migration.cjs');
const tmp=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-reset-'));fs.mkdirSync(path.join(root,'data','config'),{recursive:true});return root;};
const cfg=(root,name)=>path.join(root,'data','config',name);
const put=(file,value)=>fs.writeFileSync(file,JSON.stringify(value));
const get=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const key='a'.repeat(64);

test('reset backs up, restores defaults, keeps non-setting data, and undo restores exact files',()=>{
 const root=tmp();
 put(cfg(root,'gal-preferences.json'),{japaneseFont:'mincho',japaneseSize:50,gameProcess:'BGI',bindEnabled:true});
 put(cfg(root,'text-defaults.json'),{textColor:'#ff0000'});
 put(cfg(root,'native-preferences.json'),{history_span:3});
 put(cfg(root,'preferences.json'),{provider:'deepl',lookupProfiles:{gpt:{model:'x'}}});
 put(cfg(root,'game-style-profiles.json'),{version:3,entries:{[key]:{name:'Work',prefs:{japaneseFont:'mincho'},positionMap:{a:1}}}});
 for(const keep of ['library.json','online.json','translation-profiles.json','game-translation-prompts.json'])put(cfg(root,keep),{keep});
 fs.writeFileSync(cfg(root,'secrets.dpapi'),'secret');
 put(path.join(root,'data','ui-state.json'),{'tome-background':'{"blur":9}','tome-menu-background':'{}',other:'1'});
 const before=Object.fromEntries(['gal-preferences.json','text-defaults.json','preferences.json','game-style-profiles.json'].map(n=>[n,fs.readFileSync(cfg(root,n),'utf8')]));
 const {id,backup}=reset.reset(root,1700000000000);
 assert.ok(fs.existsSync(path.join(backup,'manifest.json')));
 const {Settings}=require('../services/settings.cjs'),gameStyle=require('../core/game-style.js');
 const text=new Settings(root).read('text');
 assert.equal(text.japaneseFont,gameStyle.defaults.japaneseFont);assert.equal(text.japaneseSize,gameStyle.defaults.japaneseSize);
 assert.deepEqual(get(cfg(root,'gal-preferences.json')),{gameProcess:'BGI',bindEnabled:true});
 assert.equal(fs.existsSync(cfg(root,'text-defaults.json')),false);
 assert.deepEqual(get(cfg(root,'preferences.json')),{lookupProfiles:{gpt:{model:'x'}}});
 const entry=get(cfg(root,'game-style-profiles.json')).entries[key];assert.deepEqual(entry.prefs,{});assert.equal(entry.name,'Work');
 for(const keep of ['library.json','online.json','translation-profiles.json','game-translation-prompts.json'])assert.deepEqual(get(cfg(root,keep)),{keep});
 assert.equal(fs.readFileSync(cfg(root,'secrets.dpapi'),'utf8'),'secret');
 assert.deepEqual(get(path.join(root,'data','ui-state.json')),{other:'1'});
 reset.undo(root,id);
 for(const[n,t]of Object.entries(before))assert.equal(fs.readFileSync(cfg(root,n),'utf8'),t);
 assert.equal(get(path.join(root,'data','ui-state.json'))['tome-background'],'{"blur":9}');
 assert.throws(()=>reset.undo(root,'../x'));
});

test('reset keeps only the latest five backups',()=>{
 const root=tmp();put(cfg(root,'gal-preferences.json'),{});
 for(let i=0;i<7;i++)reset.reset(root,1700000000000+i);
 assert.equal(fs.readdirSync(path.join(root,'data','config','settings-reset-backups')).length,5);
});

test('wait marker switches default off on every engine path',()=>{
 for(const file of ['../core/game-style.js','../web/reader/modules/game-style.js']){const s=require(file);
  assert.equal(s.defaults.hideWaitMarker,false);assert.equal(s.defaults.relocateWaitMarker,false);
  assert.equal(s.clean({}).hideWaitMarker,false);assert.equal(s.clean({hideWaitMarker:true}).hideWaitMarker,true);}
});

test('wait marker migration turns both off once, globally and per work',()=>{
 const root=tmp();
 put(cfg(root,'gal-preferences.json'),{hideWaitMarker:true,relocateWaitMarker:true,japaneseSize:40});
 put(cfg(root,'game-style-profiles.json'),{entries:{[key]:{prefs:{hideWaitMarker:true},history:[{prefs:{relocateWaitMarker:true}}]},['b'.repeat(64)]:{name:'no prefs'}}});
 const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(':memory:');db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');
 const first=wait.migrateWaitMarker(db,root);
 assert.equal(first.global,true);assert.equal(first.profiles,2);
 assert.deepEqual(get(cfg(root,'gal-preferences.json')),{hideWaitMarker:false,relocateWaitMarker:false,japaneseSize:40});
 const doc=get(cfg(root,'game-style-profiles.json'));
 assert.equal(doc.entries[key].prefs.hideWaitMarker,false);assert.equal(doc.entries[key].prefs.relocateWaitMarker,false);
 assert.equal(doc.entries[key].history[0].prefs.relocateWaitMarker,false);
 assert.equal(doc.entries['b'.repeat(64)].prefs.hideWaitMarker,false);
 put(cfg(root,'gal-preferences.json'),{hideWaitMarker:true});
 assert.equal(wait.migrateWaitMarker(db,root),null);
 assert.equal(get(cfg(root,'gal-preferences.json')).hideWaitMarker,true);
});

test('reset UI and wait hint are wired in three languages',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','web','settings-reset.js'),'utf8');
 for(const word of ['确认重置','Reset now','リセットする','撤销','Undo','元に戻す','autofocus'])assert.ok(ui.includes(word),word);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','settings.js'),'utf8'),/mountSettingsReset\(/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/case 'settings_reset':case 'settings_reset_undo':/);
 const hint='这两个开关一般不用开';
 assert.ok(fs.readFileSync(path.join(__dirname,'..','web','reader','modules','gal.js'),'utf8').includes(hint));
 const i18n=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','i18n.js'),'utf8');
 assert.ok(i18n.includes(hint)&&i18n.includes('Subahibi')&&i18n.includes('素晴らしき日々'));
});

test('Alt+T menu has the same reset entry, wording and safeguards as the settings page',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',...p.split('/')),'utf8');
 const page=read('web/settings-reset.js'),menu=read('web/reader/modules/settings-reset.js');
 const block=s=>s.match(/zh:\{zone:[\s\S]*?failed:'[^']*'\}\}/)[0];
 assert.equal(block(menu).replace(/\s+/g,''),block(page).replace(/\s+/g,''));
 for(const need of ['autofocus','cancel.focus()','data-reset-confirm','#c43c3c','settingsReset','settingsResetUndo','let left=10','[data-menu-category=misc]'])assert.ok(menu.includes(need),need);
 assert.ok(JSON.parse(read('web/reader/modules.json')).includes('settings-reset'));
 assert.match(read('web/reader/module-list.js'),/"settings-reset"/);
 assert.match(read('services/reader.cjs'),/case 'settingsReset':case 'settingsResetUndo':\{try\{const lib=require\('\.\/settings-reset\.cjs'\)/);
});
