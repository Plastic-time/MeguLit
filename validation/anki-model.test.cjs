const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Anki,fields,BACK}=require('../core/anki.cjs'),{removeManagedReading}=require('../services/anki-model.cjs');
function fake(){const anki=new Anki(),calls=[],state={fields:[...fields,'Reading'],note:null};anki.call=async(c,action,params={})=>{calls.push({action,params});switch(action){case'modelNames':return ['ToMe'];case'modelFieldNames':return [...state.fields];case'modelTemplates':return {JP:{Front:'{{Word}}',Back:'{{Reading}}'}};case'modelStyling':return {css:'old'};case'modelFieldAdd':state.fields.push(params.fieldName);return null;case'modelFieldRemove':state.fields=state.fields.filter(f=>f!==params.fieldName);return null;case'findNotes':return params.query.startsWith('note:')?[123]:[];case'notesInfo':return [{noteId:123,fields:{Reading:{value:'オビエル'}}}];case'addNote':state.note=params.note;return 123;case'updateModelTemplates':case'updateModelStyling':case'createDeck':case'storeMediaFile':return null;default:throw Error('Unexpected '+action);}};return {anki,calls,state};}
test('legacy ToMe mining gets a screenshot field and a card without standalone reading',async()=>{
 const {anki,calls,state}=fake();const result=await anki.sync({surface:'怯える',reading:'オビエル',sentence:'例文',meaning:'be afraid',pitch:[3]},{ankiModel:'ToMe',ankiDeck:'ToMe'},null,{screenshot:'jpeg-fixture'});
 assert(calls.some(c=>c.action==='modelFieldAdd'&&c.params.fieldName==='Screenshot'));assert(calls.some(c=>c.action==='storeMediaFile'&&c.params.data==='jpeg-fixture'));assert.match(state.note.fields.Screenshot,/<img src=/);assert(!Object.hasOwn(state.note.fields,'Reading'));assert.equal(result.screenshotAttached,true);assert.doesNotMatch(BACK,/\{\{Reading\}\}/);assert.match(BACK,/\{\{Screenshot\}\}/);
});
test('removing the obsolete managed reading field first backs up its values and leaves note identities intact',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-model-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const {anki,calls}=fake();const result=await removeManagedReading(root,{ankiModel:'ToMe'},anki),backup=JSON.parse(fs.readFileSync(result.backup,'utf8'));assert.equal(backup.readings[0].Reading,'オビエル');assert.equal(result.notesPreserved,1);assert.equal(result.readingRemoved,true);assert.equal(result.screenshotsEnabled,true);assert(!calls.some(c=>/guiAnswer|deleteNotes|deleteDeck/.test(c.action)));
 await assert.rejects(removeManagedReading(root,{ankiModel:'Imported deck'},anki),/ANKI_MODEL_NOT_MANAGED/);
});
test('managed mined notes attach manual audio, with original game voice identified separately',async()=>{
 const {anki,state}=fake();
 await anki.sync({surface:'word',reading:'reading',sentence:'sentence'},{ankiModel:'ToMe'},{data:'word-wave'},{sentenceAudio:{data:'game-wave'},gameAudio:true});
 assert.match(state.note.fields.Audio,/^<audio controls preload="none" src="tomoyo_/);
 assert.match(state.note.fields.SentenceAudio,/^<audio controls preload="none" src="tomoyo_g_/);
 assert.doesNotMatch(state.note.fields.Audio+state.note.fields.SentenceAudio,/autoplay|\[sound:/);
});
