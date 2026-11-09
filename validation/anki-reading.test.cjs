'use strict';
// Answer side (user, 2026-11-09): a kanji word shows its hiragana reading on its own line, above part of speech and
// meaning; kana-only words show none. The review page must not hide that line.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Anki,answerReading,BACK}=require('../core/anki.cjs');

test('kanji words get a hiragana reading, kana-only words none',()=>{
 assert.equal(answerReading('誰','ダレ'),'だれ');
 assert.equal(answerReading('顔を覆う','カオヲオオウ'),'かおをおおう');
 assert.equal(answerReading('押し切る','おしきる'),'おしきる');
 assert.equal(answerReading('しかし','シカシ'),'');
 assert.equal(answerReading('コーヒー','コーヒー'),'');
});

test('the reading sits on its own line before part of speech and meaning, and the review page shows it',()=>{
 assert.ok(BACK.indexOf('tm-reading')<BACK.indexOf('tm-mean'));
 assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','web','anki-card.css'),'utf8'),/\.tm-reading\{display:none/);
});

test('existing notes are brought in line once: katakana becomes hiragana, kana-only readings are cleared',async()=>{
 const updates=[],anki=new Anki();
 anki.call=async(c,action,p)=>{
  if(action==='findNotes')return [1,2,3];
  if(action==='notesInfo')return [{noteId:1,fields:{Word:{value:'誰'},WordReading:{value:'ダレ'}}},{noteId:2,fields:{Word:{value:'しかし'},WordReading:{value:'しかし'}}},{noteId:3,fields:{Word:{value:'押し切る'},WordReading:{value:'おしきる'}}}];
  if(action==='updateNoteFields'){updates.push([p.note.id,p.note.fields.WordReading]);return null;}
 };
 assert.equal(await anki.fixReadings({ankiModel:'MeguLit'}),2);
 assert.deepEqual(updates,[[1,'だれ'],[2,'']]);
});
