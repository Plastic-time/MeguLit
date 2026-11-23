// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Mining a word that already has a card: the sentence's voice, screenshot, translation and game go with the sentence.
const test=require('node:test'),assert=require('node:assert/strict');
const {Anki}=require('../core/anki.cjs');
const FIELDS=['Word','Sentence','SentenceTranslation','SentenceAudio','Screenshot','Game','TranslationSource','SentenceFurigana','Audio'];
function fake(){const notes=new Map();let next=100;const anki=new Anki();anki.prepareModel=async()=>({available:FIELDS,owned:true});
 anki.call=async(c,action,p)=>{
  if(action==='createDeck'||action==='storeMediaFile')return null;
  if(action==='findNotes'){const tag=/tag:(\S+)/.exec(p.query)[1];return [...notes].filter(([,n])=>n.tags.includes(tag)).map(([id])=>id);}
  if(action==='addNote'){const id=next++;notes.set(id,{fields:{...p.note.fields},tags:p.note.tags});return id;}
  if(action==='notesInfo')return p.notes.map(id=>({noteId:id,fields:Object.fromEntries(Object.entries(notes.get(id).fields).map(([k,v])=>[k,{value:v}]))}));
  if(action==='updateNoteFields'){Object.assign(notes.get(p.note.id).fields,p.note.fields);return null;}
  throw Error('unexpected '+action);};
 return {anki,fields:()=>[...notes.values()][0].fields,count:()=>notes.size};}
const c={ankiDeck:'MeguLit',ankiModel:'MeguLit'};
const word=s=>({surface:'約束',base:'約束',reading:'やくそく',pos:'名詞',meaning:'promise',sentence:s});
const media={translation:'我们约好了吧。',screenshot:Buffer.from('shot').toString('base64'),sentenceAudio:{data:Buffer.from('voice').toString('base64'),ext:'.ogg'},gameAudio:true,gameTitle:'Game A'};

test('the same word from another line does not keep the first line\'s voice, screenshot, translation or game',async()=>{
 const f=fake();await f.anki.save(word('約束したよね。'),c,null,'w1',media);
 assert.match(f.fields().Screenshot,/<img/);assert.match(f.fields().SentenceAudio,/<audio/);
 await f.anki.save(word('約束を守れ。'),c,null,'w1',{});
 const v=f.fields();assert.equal(f.count(),1);assert.equal(v.Sentence,'約束を守れ。');
 for(const k of ['SentenceTranslation','SentenceAudio','Screenshot','Game'])assert.equal(v[k],'',k);
});

test('saving the same line again without media keeps what the card already has',async()=>{
 const f=fake();await f.anki.save(word('約束したよね。'),c,null,'w1',media);const before=f.fields();
 await f.anki.save(word('約束したよね。'),c,null,'w1',{});
 const v=f.fields();for(const k of ['SentenceTranslation','SentenceAudio','Screenshot','Game'])assert.equal(v[k],before[k],k);
});
