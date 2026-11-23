'use strict';
// Issue 800: a text size changed in Settings was not kept. A work's saved settings held the sizes of the moment it was saved,
// usually the built-in 34 / 30, so the next start of that game put them back.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Settings}=require('../services/settings.cjs'),{GameStyleSync}=require('../core/game-style-sync.cjs'),profile=require('../core/game-profile.js');
const key='a'.repeat(64);

function fixture(t,entry){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-800-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const settings=new Settings(dir);
 if(entry)fs.writeFileSync(path.join(settings.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'SomeGame',savedAt:1,textSavedAt:1,positionSavedAt:1,history:[],...entry}}}));
 const launch=()=>{const sync=new GameStyleSync({config:settings.folder},()=>{});return sync.effective(sync.profiles[key]);};
 const stored=()=>JSON.parse(fs.readFileSync(path.join(settings.folder,'game-style-profiles.json'),'utf8')).entries[key];
 return {settings,launch,stored};
}

test('a size changed in Settings while the game is closed is the one the game starts with',t=>{
 const {settings,launch}=fixture(t,{prefs:{japaneseSize:34,translationSize:30,englishSize:34,sizeSource:'',x:10,y:70,width:80}});
 settings.save({scope:'text',values:{japaneseSize:24,translationSize:20}});
 assert.deepEqual([launch().japaneseSize,launch().translationSize],[24,20]);
 assert.equal(settings.read('text',key).japaneseSize,24,'the work\'s page in Settings shows the same size');
 assert.equal(launch().x,10,'the rest of the work\'s settings stays');
});

test('a size measured or chosen for one game stays that game\'s',t=>{
 const {settings,launch}=fixture(t,{prefs:{japaneseSize:28.5,translationSize:26}});
 settings.save({scope:'text',values:{japaneseSize:24,translationSize:20}});
 assert.deepEqual([launch().japaneseSize,launch().translationSize],[28.5,26]);
});

test('saving in the game stores a size only when it is not the global one',t=>{
 const {settings,launch,stored}=fixture(t);
 const sync=new GameStyleSync({config:settings.folder},()=>{});sync.profileKey=key;
 // Alt+T 保存 sends every value it shows; the sizes are the global ones
 assert.equal(sync.saveProfile({...sync.base(),textColor:'#ffeeaa',sizeSource:'user'},'all'),true);
 assert.equal('japaneseSize' in stored().prefs,false);assert.equal('sizeSource' in stored().prefs,false);
 assert.equal(stored().prefs.textColor,'#ffeeaa');
 settings.save({scope:'text',values:{japaneseSize:24}});
 assert.equal(launch().japaneseSize,24,'the game follows Settings');
 // a size set for this game
 const again=new GameStyleSync({config:settings.folder},()=>{});again.profileKey=key;
 assert.equal(again.saveProfile({...again.base(),japaneseSize:40,sizeSource:'user'},'text'),true);
 assert.equal(stored().prefs.japaneseSize,40);
 settings.save({scope:'text',values:{japaneseSize:22}});
 assert.equal(launch().japaneseSize,40);
 // once held, the work keeps its size even when it equals the global one
 const third=new GameStyleSync({config:settings.folder},()=>{});third.profileKey=key;
 assert.equal(third.saveProfile({...third.base(),japaneseSize:22},'text'),true);
 assert.equal(stored().prefs.japaneseSize,22);
});

test('the work\'s page in Settings writes a size only when it changes it',t=>{
 const {settings,launch,stored}=fixture(t,{prefs:{x:10}});
 const page=settings.get(key).values.text;
 settings.save({scope:'text',profile:key,values:{...page,textColor:'#ffeeaa'}});
 assert.equal('japaneseSize' in stored().prefs,false,'autosave sends every field; an untouched size is not the work\'s');
 assert.equal(stored().prefs.textColor,'#ffeeaa');
 settings.save({scope:'text',profile:key,values:{...page,japaneseSize:41}});
 assert.equal(stored().prefs.japaneseSize,41);assert.equal(stored().prefs.sizeSource,'user');
 settings.save({scope:'text',values:{japaneseSize:24}});
 assert.equal(launch().japaneseSize,41);
});

test('a size changed in Settings while the game runs releases that game\'s own sizes',t=>{
 const {settings,launch,stored}=fixture(t,{prefs:{japaneseSize:41,translationSize:33,sizeSource:'user',x:10}});
 settings.save({scope:'text',values:{japaneseSize:24}});
 assert.equal(settings.releaseSizes(key),true);
 assert.deepEqual(Object.keys(stored().prefs),['x']);assert.equal(stored().sizes,1);
 assert.equal(launch().japaneseSize,24);
 settings.save({scope:'text',values:{japaneseSize:26}});
 assert.equal(launch().japaneseSize,26,'and keeps following Settings afterwards');
});

test('while the game runs, only a changed global size takes over that game\'s own size',t=>{
 const {settings,stored}=fixture(t,{prefs:{japaneseSize:28.5,translationSize:26,x:10}});
 const {Runtime}=require('../services/runtime.cjs'),runtime=new Runtime(path.dirname(path.dirname(settings.folder))),shown=[];
 const g={styleSync:{profileKey:key,reloadProfiles(){}},preferences:{gameProcess:'game.exe'},preview(){},setGameAudio(){}};
 runtime.reader={gal:g,prefs:()=>({})};runtime.emit=(type,m)=>{if(m?.method==='restoreGalSettings')shown.push(m.args[0].japaneseSize);};
 // what services/bridge.cjs does for settings_save: the page autosaves every field
 const save=values=>{const sizesBefore=settings.read('text');settings.save({scope:'text',values});runtime.settingsSaved({scope:'text',values,sizesBefore});};
 save({...settings.get().values.text,textColor:'#ffeeaa'});
 assert.equal(stored().prefs.japaneseSize,28.5,'a colour change keeps the game\'s size');assert.equal(shown.at(-1),28.5);
 save({...settings.get().values.text,japaneseSize:22});
 assert.equal('japaneseSize' in stored().prefs,false);assert.equal(shown.at(-1),22,'the running game shows the new size at once');
 assert.match(fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8'),/sizesBefore=request\.scope==='text'&&!request\.profile\?settings\.read\('text'\):undefined;.*runtime\?\.settingsSaved\(\{\.\.\.request,sizesBefore\}\)/);
});

test('a running game with an old copied default size shows the Settings size',t=>{
 const {settings}=fixture(t,{prefs:{japaneseSize:34,translationSize:30,x:10}});
 settings.save({scope:'text',values:{japaneseSize:24}});
 const {Runtime}=require('../services/runtime.cjs'),runtime=new Runtime(path.dirname(path.dirname(settings.folder))),shown=[];
 runtime.reader={gal:{styleSync:{profileKey:key,reloadProfiles(){}},preferences:{},preview(){},setGameAudio(){}},prefs:()=>({})};
 runtime.emit=(type,m)=>{if(m?.method==='restoreGalSettings')shown.push(m.args[0].japaneseSize);};
 const values={...settings.get().values.text,textColor:'#ffeeaa'},sizesBefore=settings.read('text');settings.save({scope:'text',values});
 runtime.settingsSaved({scope:'text',values,sizesBefore});
 assert.equal(shown.at(-1),24);
});

test('a size set to the old built-in value for one game is kept, in the game and on its page',t=>{
 const {settings,launch,stored}=fixture(t);
 settings.save({scope:'text',values:{japaneseSize:24}});
 const sync=new GameStyleSync({config:settings.folder},()=>{});sync.profileKey=key;
 assert.equal(sync.saveProfile({...sync.base(),japaneseSize:34},'text'),true);
 assert.equal(launch().japaneseSize,34);assert.equal(settings.read('text',key).japaneseSize,34);
 const other=fixture(t,{prefs:{x:1}});other.settings.save({scope:'text',values:{japaneseSize:24}});
 other.settings.save({scope:'text',profile:key,values:{...other.settings.get(key).values.text,japaneseSize:34}});
 assert.equal(other.launch().japaneseSize,34);assert.equal(other.stored().sizes,1);
});

test('an old entry keeps the size changed by hand; the one equal to the global size of its time follows Settings',t=>{
 const {settings,launch}=fixture(t,{prefs:{japaneseSize:34,translationSize:26,sizeSource:'user'}});
 settings.save({scope:'text',values:{japaneseSize:24,translationSize:20}});
 assert.deepEqual([launch().japaneseSize,launch().translationSize],[24,26]);
 const english=fixture(t,{prefs:{japaneseSize:34,translationSize:30,englishSize:34}});
 english.settings.save({scope:'text',values:{japaneseSize:24,translationSize:20,englishSize:22}});
 assert.deepEqual([english.launch().japaneseSize,english.launch().translationSize,english.launch().englishSize],[24,20,22]);
});

test('saving an old entry from its page in Settings does not freeze the copied default',t=>{
 const {settings,launch,stored}=fixture(t,{prefs:{japaneseSize:34,translationSize:30,x:10}});
 settings.save({scope:'text',values:{japaneseSize:24,translationSize:20}});
 settings.save({scope:'text',profile:key,values:{textColor:'#ffeeaa'}});
 assert.equal('japaneseSize' in stored().prefs,false);
 settings.save({scope:'text',values:{japaneseSize:22}});
 assert.equal(launch().japaneseSize,22);
});

test('a work\'s page shows the size the game starts with, not the last session, and a colour change keeps following Settings',t=>{
 const {settings,launch,stored}=fixture(t,{prefs:{x:10},sizes:1});
 fs.writeFileSync(path.join(settings.folder,'gal-preferences.json'),JSON.stringify({japaneseSize:28.5,layoutVersion:22}));
 const page=settings.get(key).values.text;assert.equal(page.japaneseSize,launch().japaneseSize);assert.equal(page.japaneseSize,34);
 settings.save({scope:'text',profile:key,values:{...page,textColor:'#ffeeaa'}});
 assert.equal('japaneseSize' in stored().prefs,false,'the whole form was sent for a colour');assert.equal(stored().prefs.textColor,'#ffeeaa');
 settings.save({scope:'text',values:{japaneseSize:22}});
 assert.equal(launch().japaneseSize,22,'the next start follows Settings');assert.equal(settings.get(key).values.text.japaneseSize,22);
});

test('a game\'s own size reaches another PC with cloud sync',t=>{
 const a=fixture(t),b=fixture(t),account=require('../services/account.cjs');
 for(const s of [a.settings,b.settings])s.save({scope:'text',values:{japaneseSize:24}});
 const sync=new GameStyleSync({config:a.settings.folder},()=>{});sync.profileKey=key;sync.saveProfile({...sync.base(),japaneseSize:34},'text');
 const root=s=>path.dirname(path.dirname(s.folder)),record=account.kinds.settings.collect(null,root(a.settings)).get(key);
 account.kinds.settings.apply(null,key,{data:record,updated_at:5},root(b.settings));
 assert.equal(b.launch().japaneseSize,34);
 // a record from an older version has no mark: its copied default follows Settings
 account.kinds.settings.apply(null,key,{data:{name:'SomeGame',prefs:{japaneseSize:34,translationSize:30}},updated_at:6},root(b.settings));
 assert.equal(b.launch().japaneseSize,24);
});

test('importing another work\'s look brings the global size, not the built-in one',t=>{
 const {settings}=fixture(t);settings.save({scope:'text',values:{japaneseSize:24}});
 const source='b'.repeat(64);fs.writeFileSync(path.join(settings.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[source]:{name:'Other',prefs:{textColor:'#ffeeaa'},savedAt:1,textSavedAt:1,sizes:1}}}));
 const sync=new GameStyleSync({config:settings.folder},()=>{});sync.profileKey=key;
 assert.equal(sync.importFrom(source,'text').prefs.japaneseSize,24);
});

test('while the game runs, a changed global size releases only that size',t=>{
 const {settings,stored}=fixture(t,{prefs:{japaneseSize:41,translationSize:33,sizeSource:'user'}});
 assert.equal(settings.releaseSizes(key,['translationSize']),true);
 assert.deepEqual(stored().prefs,{japaneseSize:41,sizeSource:'user'});
 settings.releaseSizes(key,['japaneseSize']);assert.deepEqual(stored().prefs,{});
});

test('an old entry of copied defaults keeps following Settings when one global size changes while it runs',t=>{
 const {settings,launch,stored}=fixture(t,{prefs:{japaneseSize:34,translationSize:30,x:10}});
 settings.save({scope:'text',values:{japaneseSize:24,translationSize:20}});
 const {Runtime}=require('../services/runtime.cjs'),runtime=new Runtime(path.dirname(path.dirname(settings.folder))),shown=[];
 runtime.reader={gal:{styleSync:{profileKey:key,reloadProfiles(){}},preferences:{},preview(){},setGameAudio(){}},prefs:()=>({})};
 runtime.emit=(type,m)=>{if(m?.method==='restoreGalSettings')shown.push([m.args[0].japaneseSize,m.args[0].translationSize]);};
 const values={...settings.get().values.text,japaneseSize:22},sizesBefore=settings.read('text');settings.save({scope:'text',values});
 runtime.settingsSaved({scope:'text',values,sizesBefore});
 assert.deepEqual(shown.at(-1),[22,20],'the running game');
 assert.deepEqual([launch().japaneseSize,launch().translationSize],[22,20],'the next start');
 assert.equal('translationSize' in stored().prefs,false);assert.equal(stored().prefs.x,10);
});

test('a work saved under the rule keeps a size equal to the old built-in one',()=>{
 assert.equal(profile.normalize({prefs:{japaneseSize:34},sizes:1}).prefs.japaneseSize,34);
 assert.equal('japaneseSize' in profile.normalize({prefs:{japaneseSize:34,translationSize:30}}).prefs,false);
 assert.equal(profile.normalize({prefs:{japaneseSize:34,translationSize:30}}).sizes,1);
 assert.equal(fs.readFileSync(path.join(__dirname,'..','core','game-profile.js'),'utf8'),fs.readFileSync(path.join(__dirname,'..','web','reader','modules','game-profile.js'),'utf8'));
});

// The previous release's Alt+T save (GameStyleSync.saveProfile before sizes:1, given the reader's settings): the whole text set of
// the moment, built-in sizes under the global preset under the menu's changes, a size changed in the menu marked sizeSource 'user'
// and otherwise the preset's mark, which a size typed in Settings set to 'user' as well.
function oldAltT(settings,changes){
 const preset=JSON.parse(fs.readFileSync(path.join(settings.folder,'text-defaults.json'),'utf8')),shown={...profile.pick(require('../core/game-style.js').defaults,'base'),...preset};
 const sized=profile.sizeKeys.some(k=>k in changes&&Number(changes[k])!==Number(shown[k]));
 const prefs=profile.pick({...shown,...changes,sizeSource:sized?'user':shown.sizeSource},'text');
 fs.writeFileSync(path.join(settings.folder,'game-style-profiles.json'),JSON.stringify({version:3,entries:{[key]:{name:'SomeGame',savedAt:1,textSavedAt:1,positionSavedAt:0,prefs,history:[]}}}));
 return prefs;
}

test('sizes an old release saved with Alt+T: the inherited global size follows Settings, a size picked by hand stays',t=>{
 const cases=[
  ['colour only, the global 24 copied with its mark',{textColor:'#ffeeaa'},22],
  ['34 picked in the menu',{japaneseSize:34},34],
  // the menu left at the global 24 saves the same record as the colour change: it cannot be told apart and follows Settings
  ['24 left as the global one',{japaneseSize:24,textColor:'#ffeeaa'},22]];
 for(const [name,changes,expected] of cases)for(const resave of ['','Alt+T','page']){
  const {settings,launch,stored}=fixture(t);
  settings.save({scope:'text',values:{japaneseSize:24}});
  const old=oldAltT(settings,changes);assert.equal(old.sizeSource,'user',name);assert.equal(old.japaneseSize,changes.japaneseSize??24);
  assert.equal(launch().japaneseSize,changes.japaneseSize??24,name+': after the upgrade');
  if(resave==='Alt+T'){const sync=new GameStyleSync({config:settings.folder},()=>{});sync.profileKey=key;
   assert.equal(sync.saveProfile({...sync.effective(sync.profiles[key]),textColor:'#ffeeab'},'text'),true);}
  if(resave==='page')settings.save({scope:'text',profile:key,values:{...settings.get(key).values.text,textColor:'#eeeeee'}});
  if(resave)assert.equal(stored().sizes,1);
  settings.save({scope:'text',values:{japaneseSize:22}});
  assert.equal(launch().japaneseSize,expected,name+(resave?', saved again from '+resave:'')+': restart after Settings changed with the game closed');
  assert.equal(settings.get(key).values.text.japaneseSize,expected,name+': the work\'s page');
  settings.save({scope:'text',values:{translationSize:20}});
  assert.equal(launch().translationSize,20,name+': the copied 30 follows Settings too');
 }
});

test('a size saved under the rule stays when Settings moves to it and on',t=>{
 const {settings,launch}=fixture(t,{prefs:{japaneseSize:24,sizeSource:'user'},sizes:1});
 settings.save({scope:'text',values:{japaneseSize:24}});settings.save({scope:'text',values:{japaneseSize:22}});
 assert.equal(launch().japaneseSize,24);
});
